import {
  useState,
  useEffect,
  useRef,
  useCallback,
  MutableRefObject,
  Dispatch,
  SetStateAction,
} from 'react';
import { FamilyTreeData } from '../types/tree';
import {
  saveTreeLocally,
  markTreeDirty,
  loadTreeFromLocalStorage,
  loadTreeFromServerOrStorage,
  loadTreeById,
  MAIN_TREE_ID,
  renameTreeOnServerOrStorage,
  deleteTreeFromServerOrStorage,
  fetchServerTrees,
  fetchAllTreesSearchIndex,
  syncCrossCanvasLinkTitles,
  syncTreeToServer,
  syncPendingDirtyTrees,
  getLocalGlobalVersion,
  hasDirtyGlobalVersion,
  setLocalGlobalVersion,
  fetchGlobalVersionFromServer,
  syncGlobalVersionToServer,
  pushAllTreesToFirestoreManual,
  hasUnsyncedFirebaseChangesStorage,
  setUnsyncedFirebaseChangesStorage,
  getLastFirebaseSyncTimeStorage,
  setLastFirebaseSyncTimeStorage,
  parseTimestamp,
  notifyTreesChanged,
} from '../utils/fileStorage';
import {
  fetchGlobalVersionFromFirestore,
  getTreeById as getTreeByIdFromFirestore,
  isCloudWriteAuthenticated,
  saveGlobalVersionToFirestore,
  saveTreeToFirestore,
} from '../utils/firestoreTreeService';
import { useAuth } from '../context/AuthContext';
import { normalizeCoupleCoordinates } from '../utils/lineageUtils';
import { ensureTreeCardIds } from '../utils/cardIdUtils';
import { logDatabase, logTree, logUser } from '../utils/logger';
import { ToastMessage } from '../components/Toast';
import {
  getGuestShareById,
  GuestShareLink,
  GuestShareResolveResult,
} from '../utils/guestShareService';

export interface GuestShareSessionState {
  status: 'none' | 'loading' | GuestShareResolveResult['status'];
  share: GuestShareLink | null;
  errorMessage?: string;
}

export interface ConfirmDialogRequest {
  title: string;
  description: string;
  confirmLabel: string;
  variant?: 'danger' | 'warning' | 'default';
  onConfirm: () => void;
}

interface UseTreeSyncOptions {
  isAdmin: boolean;
  isAdminRef: MutableRefObject<boolean>;
  isDraggingCardRef: MutableRefObject<boolean>;
  isUndoActionRef: MutableRefObject<boolean>;
  pushHistorySnapshot: (snapshot: FamilyTreeData) => void;
  showToast: (msg: Omit<ToastMessage, 'id'>) => void;
  setConfirmDialog: Dispatch<SetStateAction<ConfirmDialogRequest | null>>;
  setSelectedPersonId: Dispatch<SetStateAction<string | null>>;
  setSelectedPersonIds: Dispatch<SetStateAction<Set<string>>>;
  setUserPersonId: Dispatch<SetStateAction<string | null>>;
  onAfterImportFit?: () => void;
}

function createInitialTreeState(): FamilyTreeData {
  const saved = loadTreeFromLocalStorage();
  const globalVer = getLocalGlobalVersion();
  const target =
    saved && saved.persons && Object.keys(saved.persons).length > 0
      ? saved
      : {
          id: 'my-family-tree',
          title: 'Моє родове дерево',
          description: 'Хронологічне родове дерево',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          persons: {},
          clanCoatOfArms: {},
          connectionOverrides: {},
        };
  const initialWithNorm = {
    ...target,
    version: globalVer || target.version || 'v0.1',
    persons: normalizeCoupleCoordinates(target.persons || {}, target.connectionOverrides),
  };
  return ensureTreeCardIds(initialWithNorm).tree;
}

export function useTreeSync({
  isAdmin,
  isAdminRef,
  isDraggingCardRef,
  isUndoActionRef,
  pushHistorySnapshot,
  showToast,
  setConfirmDialog,
  setSelectedPersonId,
  setSelectedPersonIds,
  setUserPersonId,
  onAfterImportFit,
}: UseTreeSyncOptions) {
  const [tree, setRawTree] = useState<FamilyTreeData>(createInitialTreeState);
  const setTree: Dispatch<SetStateAction<FamilyTreeData>> = useCallback(
    (updater) => {
      setRawTree((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        if (isDraggingCardRef.current || next.persons === prev.persons) {
          return next;
        }
        return ensureTreeCardIds(next).tree;
      });
    },
    [isDraggingCardRef]
  );
  const treeRef = useRef<FamilyTreeData>(tree);
  useEffect(() => {
    treeRef.current = tree;
  }, [tree]);

  const isInitialMount = useRef(true);
  const hasLoadedFromServer = useRef(false);
  const skipNextAutoSaveRef = useRef(false);
  const hasCenteredTreeIdRef = useRef<string | null>(null);
  const pendingFocusPersonIdRef = useRef<string | null>(null);

  const hasCachedLocalTree = (() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const shareId = params.get('share')?.trim();
      const sharedTreeId = params.get('tree')?.trim();
      const guestFlag = params.get('guest') === '1';
      if (shareId || guestFlag) {
        return false;
      }
      if (sharedTreeId && sharedTreeId !== MAIN_TREE_ID && sharedTreeId !== 'main-tree' && sharedTreeId !== 'default-tree') {
        return false;
      }
      return Boolean(tree.persons && Object.keys(tree.persons).length > 0);
    } catch {
      return false;
    }
  })();

  const initialShareParam = (() => {
    try {
      return new URLSearchParams(window.location.search).get('share')?.trim() || null;
    } catch {
      return null;
    }
  })();

  const isGuestLinkRouteRef = useRef<boolean>((() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return Boolean(params.get('share')?.trim() || params.get('guest') === '1');
    } catch {
      return false;
    }
  })());

  const [guestShareState, setGuestShareState] = useState<GuestShareSessionState>(() =>
    initialShareParam
      ? { status: 'loading', share: null }
      : { status: 'none', share: null }
  );
  const guestShareStateRef = useRef<GuestShareSessionState>(guestShareState);
  guestShareStateRef.current = guestShareState;

  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(!hasCachedLocalTree);
  const [lastSavedTime, setLastSavedTime] = useState<Date | null>(new Date());
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'error' | 'offline'>(() =>
    typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'synced'
  );
  const [isServerConnected, setIsServerConnected] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [isFirebaseSyncing, setIsFirebaseSyncing] = useState<boolean>(false);
  const [firebaseSyncMode, setFirebaseSyncMode] = useState<'push' | 'pull' | null>(null);
  const [lastFirebaseSyncTime, setLastFirebaseSyncTime] = useState<Date | null>(() =>
    getLastFirebaseSyncTimeStorage()
  );
  const [hasUnsyncedFirebaseChanges, setHasUnsyncedFirebaseChanges] = useState<boolean>(() =>
    hasUnsyncedFirebaseChangesStorage()
  );
  const syncStatusRef = useRef(syncStatus);
  syncStatusRef.current = syncStatus;

  const markFirebaseUnsynced = useCallback((unsynced: boolean) => {
    setHasUnsyncedFirebaseChanges(unsynced);
    setUnsyncedFirebaseChangesStorage(unsynced);
  }, []);

  // Initial persistent tree fetch (resolves ?share= token first when present)
  useEffect(() => {
    let isCancelled = false;
    const params = new URLSearchParams(window.location.search);
    const shareParam = params.get('share')?.trim() || null;
    const sharedTreeIdParam = params.get('tree')?.trim() || null;
    const personParam = params.get('person')?.trim() || null;
    const isGuestParam = params.get('guest') === '1' || Boolean(shareParam);

    // Hard safety cap so slow networks can never trap the user on the splash screen
    const maxSplashTimer = window.setTimeout(() => {
      if (!isCancelled) {
        setIsInitialLoading(false);
      }
    }, shareParam ? 4500 : 2200);

    const loadInitialTree = async () => {
      try {
        let resolvedTreeId = sharedTreeIdParam;
        let resolvedFocusPersonId = personParam;

        if (shareParam) {
          const shareRes = await getGuestShareById(shareParam);
          if (isCancelled) return;
          if (shareRes.status !== 'active' || !shareRes.share) {
            setGuestShareState({
              status: shareRes.status,
              share: shareRes.share || null,
              errorMessage: shareRes.errorMessage,
            });
            return;
          }
          setGuestShareState({
            status: 'active',
            share: shareRes.share,
          });
          resolvedTreeId = shareRes.share.treeId;
          if (!resolvedFocusPersonId && shareRes.share.focusPersonId) {
            resolvedFocusPersonId = shareRes.share.focusPersonId;
          }
        }

        const skipLocalCache = isGuestParam;
        const targetPromise = resolvedTreeId
          ? loadTreeById(resolvedTreeId, {
              allowEmpty: true,
              pushLocalIfNewer: !isGuestParam,
              preferServer: isGuestParam,
              forceRemote: isGuestParam,
              includeCloud: true,
              skipLocalRead: skipLocalCache,
              skipLocalWrite: skipLocalCache,
            }).then(async (found) => {
              if (found || shareParam) return found;
              return loadTreeFromServerOrStorage({
                pushLocalIfNewer: !isGuestParam,
                includeCloud: true,
              });
            })
          : loadTreeFromServerOrStorage({
              pushLocalIfNewer: !isGuestParam,
              includeCloud: true,
            });

        const [serverTrees, serverGlobalVersion, targetTree] = await Promise.all([
          fetchServerTrees({ includeCloud: true }),
          fetchGlobalVersionFromServer({ includeCloud: true }),
          targetPromise,
        ]);

        // Pre-warm & hydrate all cloud canvases (including cross-canvas links) in background
        if (!isGuestParam) {
          void fetchAllTreesSearchIndex({ includeCloud: true }).then(() => {
            notifyTreesChanged();
          });
        }

        if (isCancelled) return;
        hasLoadedFromServer.current = true;

        const effectiveVersion =
          !isGuestParam && hasDirtyGlobalVersion()
            ? getLocalGlobalVersion() || targetTree?.version || 'v0.1'
            : serverGlobalVersion || (!isGuestParam ? getLocalGlobalVersion() : null) || targetTree?.version || 'v0.1';
        if (!isGuestParam && !hasDirtyGlobalVersion() && serverGlobalVersion) {
          setLocalGlobalVersion(serverGlobalVersion, false);
        }

        if (targetTree && targetTree.persons && Object.keys(targetTree.persons).length > 0) {
          const syncedTree = syncCrossCanvasLinkTitles(targetTree, serverTrees);
          if (resolvedFocusPersonId && syncedTree.persons[resolvedFocusPersonId]) {
            pendingFocusPersonIdRef.current = resolvedFocusPersonId;
            setSelectedPersonId(resolvedFocusPersonId);
          }
          skipNextAutoSaveRef.current = true;
          isUndoActionRef.current = true;
          setTree({
            ...syncedTree,
            version: effectiveVersion,
            persons: normalizeCoupleCoordinates(syncedTree.persons, syncedTree.connectionOverrides),
          });
          logTree(
            `Завантажено полотно «${syncedTree.title}» (${Object.keys(syncedTree.persons).length} осіб, ${effectiveVersion})`,
            { treeId: syncedTree.id, canvasCount: serverTrees.length, viaGuestShare: Boolean(shareParam) },
            'info'
          );
        } else if (targetTree) {
          skipNextAutoSaveRef.current = true;
          isUndoActionRef.current = true;
          setTree({
            ...targetTree,
            version: effectiveVersion,
            persons: normalizeCoupleCoordinates(targetTree.persons || {}, targetTree.connectionOverrides),
          });
        } else if (shareParam) {
          setGuestShareState({
            status: 'error',
            share: guestShareStateRef.current.share,
            errorMessage:
              'Обране дерево ще не опубліковане в хмару Firebase або було видалене. Попросіть адміністратора натиснути «Синхронізувати».',
          });
        } else if (effectiveVersion) {
          skipNextAutoSaveRef.current = true;
          isUndoActionRef.current = true;
          setTree((prev) => (prev.version === effectiveVersion ? prev : { ...prev, version: effectiveVersion }));
        }
      } catch (err) {
        console.warn('Initial tree load skipped/failed:', err);
      } finally {
        window.clearTimeout(maxSplashTimer);
        if (!isCancelled) {
          setIsInitialLoading(false);
        }
      }
    };

    void loadInitialTree();
    return () => {
      isCancelled = true;
      window.clearTimeout(maxSplashTimer);
    };
  }, []);

  const { currentUser, authReady, isCloudAuthenticated } = useAuth();

  // Reconcile with Firebase Firestore once Firebase Auth finishes initializing or user signs in
  const lastReconciledAuthKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!authReady) return;
    if (isGuestLinkRouteRef.current) return;
    const authKey = `${currentUser?.uid || 'anon'}:${isCloudAuthenticated ? '1' : '0'}:${isAdmin ? 'admin' : 'guest'}`;
    if (lastReconciledAuthKeyRef.current === authKey) return;
    lastReconciledAuthKeyRef.current = authKey;

    let cancelled = false;
    const reconcileWithFirestore = async () => {
      try {
        const currentId = treeRef.current.id || MAIN_TREE_ID;
        const [cloudTree, cloudVersion, serverTrees] = await Promise.all([
          getTreeByIdFromFirestore(currentId).catch(() => null),
          fetchGlobalVersionFromFirestore().catch(() => null),
          fetchServerTrees({ includeCloud: true }).catch(() => []),
        ]);

        if (cancelled) return;

        // Also refresh cross-canvas search index with authenticated Firestore user trees
        void fetchAllTreesSearchIndex({ includeCloud: true }).then(() => {
          notifyTreesChanged();
        });

        const currentLocal = treeRef.current;
        const localPersonsCount = Object.keys(currentLocal.persons || {}).length;
        const cloudPersonsCount = Object.keys(cloudTree?.persons || {}).length;
        const localTime = parseTimestamp(currentLocal.updatedAt || currentLocal.createdAt);
        const cloudTime = parseTimestamp(cloudTree?.updatedAt || cloudTree?.createdAt);
        const hasUnsyncedLocal = hasUnsyncedFirebaseChangesStorage();

        if (
          cloudTree &&
          cloudPersonsCount > 0 &&
          (localPersonsCount === 0 || cloudTime > localTime + 1000)
        ) {
          const syncedTree = syncCrossCanvasLinkTitles(cloudTree, serverTrees);
          const effectiveVersion =
            (!hasDirtyGlobalVersion() && cloudVersion) ||
            syncedTree.version ||
            getLocalGlobalVersion() ||
            'v0.1';
          if (!hasDirtyGlobalVersion()) {
            setLocalGlobalVersion(effectiveVersion, false);
          }
          const normalized: FamilyTreeData = {
            ...syncedTree,
            version: effectiveVersion,
            persons: normalizeCoupleCoordinates(syncedTree.persons, syncedTree.connectionOverrides),
          };
          skipNextAutoSaveRef.current = true;
          isUndoActionRef.current = true;
          treeRef.current = normalized;
          setTree(normalized);
          saveTreeLocally(normalized, false);
          markFirebaseUnsynced(false);
          const now = new Date();
          setLastFirebaseSyncTime(now);
          setLastFirebaseSyncTimeStorage(now);
          setLastSavedTime(new Date(normalized.updatedAt || Date.now()));
          if (isAdminRef.current) {
            void syncTreeToServer(normalized);
          }
          logDatabase(
            `Синхронізовано з Firebase Firestore (${effectiveVersion}, ${cloudPersonsCount} осіб)`,
            { treeId: normalized.id, version: effectiveVersion },
            'success'
          );
          return;
        }

        if (
          isAdmin &&
          isCloudAuthenticated &&
          isCloudWriteAuthenticated() &&
          localPersonsCount > 0 &&
          (!cloudTree || localTime > cloudTime + 1000 || (hasUnsyncedLocal && localTime >= cloudTime - 1000))
        ) {
          const activeVer = getLocalGlobalVersion() || currentLocal.version || 'v0.1';
          if (hasDirtyGlobalVersion() || !cloudVersion) {
            const verSaved = await saveGlobalVersionToFirestore(activeVer).catch(() => false);
            if (verSaved) {
              setLocalGlobalVersion(activeVer, false);
            }
          }
          const targetId = currentLocal.id || MAIN_TREE_ID;
          const pushed = await saveTreeToFirestore(
            targetId,
            { ...currentLocal, version: activeVer },
            currentUser?.uid,
            currentUser?.displayName || undefined,
            true
          ).catch(() => false);
          if (!cancelled && pushed) {
            markTreeDirty(targetId, false);
            markFirebaseUnsynced(false);
            const now = new Date();
            setLastFirebaseSyncTime(now);
            setLastFirebaseSyncTimeStorage(now);
          }
          return;
        }

        if (cloudTree && !hasUnsyncedLocal && Math.abs(cloudTime - localTime) <= 1000) {
          if (cloudVersion && !hasDirtyGlobalVersion() && cloudVersion !== currentLocal.version) {
            setLocalGlobalVersion(cloudVersion, false);
            skipNextAutoSaveRef.current = true;
            isUndoActionRef.current = true;
            setTree((prev) => ({ ...prev, version: cloudVersion }));
          }
          const now = new Date();
          setLastFirebaseSyncTime(now);
          setLastFirebaseSyncTimeStorage(now);
        }
      } catch (err) {
        console.warn('Firestore reconciliation skipped:', err);
      }
    };

    void reconcileWithFirestore();
    return () => {
      cancelled = true;
    };
  }, [authReady, isCloudAuthenticated, currentUser?.uid, currentUser?.displayName, isAdmin, isAdminRef, isUndoActionRef, markFirebaseUnsynced]);

  // Network online/offline connectivity detection (triggers pending Firestore sync when back online)
  useEffect(() => {
    const updateConnectivity = () => {
      const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
      setIsServerConnected(online);
      if (!online) {
        if (syncStatusRef.current !== 'offline') {
          setSyncStatus('offline');
        }
      } else if (syncStatusRef.current === 'offline' || syncStatusRef.current === 'error') {
        setSyncStatus('synced');
        if (isAdminRef.current && isCloudWriteAuthenticated()) {
          void syncPendingDirtyTrees();
        }
      }
    };

    updateConnectivity();
    window.addEventListener('online', updateConnectivity);
    window.addEventListener('offline', updateConnectivity);
    return () => {
      window.removeEventListener('online', updateConnectivity);
      window.removeEventListener('offline', updateConnectivity);
    };
  }, [isAdminRef]);

  const handleUpdateVersion = useCallback(
    async (newVersion: string) => {
      const cleanVersion = newVersion.trim() || 'v0.1';
      setLocalGlobalVersion(cleanVersion, true);
      const updatedTree: FamilyTreeData = {
        ...treeRef.current,
        version: cleanVersion,
        updatedAt: new Date().toISOString(),
      };
      skipNextAutoSaveRef.current = true;
      treeRef.current = updatedTree;
      setTree(updatedTree);
      saveTreeLocally(updatedTree, false);
      markFirebaseUnsynced(true);
      setLastSavedTime(new Date(updatedTree.updatedAt));

      logTree(`Оновлено глобальну версію родоводу на ${cleanVersion}`, {
        version: cleanVersion,
        treeId: updatedTree.id,
      });

      if (isCloudWriteAuthenticated()) {
        try {
          setIsFirebaseSyncing(true);
          setFirebaseSyncMode('push');
          const [verOk, treeOk] = await Promise.all([
            saveGlobalVersionToFirestore(cleanVersion),
            saveTreeToFirestore(updatedTree.id, updatedTree, currentUser?.uid, currentUser?.displayName || undefined, true),
          ]);
          if (verOk && treeOk) {
            setLocalGlobalVersion(cleanVersion, false);
            markFirebaseUnsynced(false);
            const now = new Date();
            setLastFirebaseSyncTime(now);
            setLastFirebaseSyncTimeStorage(now);
            setSyncStatus('synced');
            showToast({
              type: 'success',
              title: 'Версію оновлено у Firebase',
              message: `Версію родоводу змінено на ${cleanVersion} та синхронізовано з Firebase Firestore.`,
            });
            return;
          }
        } catch {
          /* keep unsynced marker for retry */
        } finally {
          setIsFirebaseSyncing(false);
          setFirebaseSyncMode(null);
        }
      }

      setSyncStatus(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'synced');
      showToast({
        type: 'info',
        title: 'Версію оновлено локально',
        message: isCloudWriteAuthenticated()
          ? `Версію родоводу змінено на ${cleanVersion}. Буде синхронізовано з Firebase при наступному збереженні.`
          : `Версію змінено на ${cleanVersion} локально. Підключіть Google, щоб зберегти у Firebase.`,
      });
    },
    [currentUser?.displayName, currentUser?.uid, markFirebaseUnsynced, showToast]
  );

  const syncLatestTreeFromCloud = useCallback(
    async (isGuestMode = false) => {
      if (isAdmin && !isGuestMode) return;
      if (isGuestMode && document.visibilityState === 'hidden') return;
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      const shareStatus = guestShareStateRef.current.status;
      if (shareStatus !== 'none' && shareStatus !== 'active') return;

      try {
        const currentId = treeRef.current.id || MAIN_TREE_ID;
        const currentVersion = treeRef.current.version || 'v0.1';
        const localTime = parseTimestamp(treeRef.current.updatedAt || treeRef.current.createdAt);
        const localCount = Object.keys(treeRef.current.persons || {}).length;
        const skipLocalCache = isGuestLinkRouteRef.current;

        const [remoteTree, cloudVersion] = await Promise.all([
          loadTreeById(currentId, {
            includeCloud: true,
            skipLocalRead: skipLocalCache,
            skipLocalWrite: skipLocalCache,
          }),
          fetchGlobalVersionFromServer({ includeCloud: true }),
        ]);

        if (remoteTree && remoteTree.persons && Object.keys(remoteTree.persons).length > 0) {
          const remoteTime = parseTimestamp(remoteTree.updatedAt || remoteTree.createdAt);
          const resolvedVersion = cloudVersion || remoteTree.version || currentVersion;
          const isRemoteNewer = remoteTime > localTime + 1000;
          const isVersionChanged = resolvedVersion !== currentVersion;
          const isRemoteSafeVersionBump = isVersionChanged && remoteTime >= localTime - 1000;

          if (localCount === 0 || isRemoteNewer || isRemoteSafeVersionBump) {
            const serverTreesList = await fetchServerTrees({ includeCloud: true });
            const syncedTree = syncCrossCanvasLinkTitles(remoteTree, serverTreesList);

            if (!skipLocalCache) {
              setLocalGlobalVersion(resolvedVersion, false);
            }
            const normalized = {
              ...syncedTree,
              version: resolvedVersion,
              persons: normalizeCoupleCoordinates(syncedTree.persons, syncedTree.connectionOverrides),
            };
            skipNextAutoSaveRef.current = true;
            isUndoActionRef.current = true;
            treeRef.current = normalized;
            setTree(normalized);
            setLastSavedTime(new Date(syncedTree.updatedAt || Date.now()));

            if (isGuestMode && (isRemoteNewer || isVersionChanged) && localCount > 0) {
              showToast({
                type: 'info',
                title: `Синхронізовано (${resolvedVersion})`,
                message: 'Завантажено актуальну версію родоводу з Firebase.',
              });
            }
          }
        }
      } catch (err) {
        console.warn('Cloud tree check failed:', err);
      }
    },
    [isAdmin, isUndoActionRef, showToast]
  );

  // Guest polling against Firebase Firestore (no Express tree API)
  useEffect(() => {
    if (isAdmin) return;
    if (guestShareState.status !== 'none' && guestShareState.status !== 'active') return;
    void syncLatestTreeFromCloud(true);

    const intervalTimer = setInterval(() => {
      void syncLatestTreeFromCloud(true);
    }, 35000);

    const handleWindowFocus = () => {
      if (document.visibilityState === 'visible') {
        void syncLatestTreeFromCloud(true);
      }
    };

    window.addEventListener('visibilitychange', handleWindowFocus);
    window.addEventListener('focus', handleWindowFocus);
    return () => {
      clearInterval(intervalTimer);
      window.removeEventListener('visibilitychange', handleWindowFocus);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [isAdmin, syncLatestTreeFromCloud]);

  const handleUnifiedSync = useCallback(async () => {
    if (syncStatus === 'syncing' || isFirebaseSyncing) return;

    const startedAt = Date.now();
    let activeTreeSnapshot = treeRef.current;

    try {
      pendingDirtySnapshotRef.current = null;
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }

      const nowIso = new Date().toISOString();
      const treeToSave: FamilyTreeData = {
        ...treeRef.current,
        updatedAt: nowIso,
      };
      activeTreeSnapshot = treeToSave;
      skipNextAutoSaveRef.current = true;
      treeRef.current = treeToSave;
      setTree(treeToSave);
      saveTreeLocally(treeToSave, false);
      setLastSavedTime(new Date(nowIso));
      setSyncStatus(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'synced');
    } catch (err) {
      console.error('handleUnifiedSync local save error:', err);
    }

    const hasCloudUser = Boolean(isCloudAuthenticated && currentUser && currentUser.emailVerified);
    if (hasCloudUser && currentUser) {
      setIsFirebaseSyncing(true);
      setFirebaseSyncMode('push');
      try {
        const activeVer = getLocalGlobalVersion() || activeTreeSnapshot.version || 'v0.1';
        const result = await pushAllTreesToFirestoreManual(
          activeTreeSnapshot,
          activeVer,
          currentUser.uid,
          currentUser.displayName || undefined
        );

        const elapsed = Date.now() - startedAt;
        if (elapsed < 320) {
          await new Promise((resolve) => setTimeout(resolve, 320 - elapsed));
        }

        if (result.ok) {
          const now = new Date();
          setLastFirebaseSyncTime(now);
          setLastFirebaseSyncTimeStorage(now);
          markFirebaseUnsynced(false);
          setIsServerConnected(true);
          setSyncStatus('synced');
          const mediaNote =
            result.uploadedMediaCount && result.uploadedMediaCount > 0
              ? ` Нових фото: ${result.uploadedMediaCount}.`
              : '';
          showToast({
            type: 'success',
            title: 'Синхронізовано з Firebase',
            message: `Локальне сховище та хмара Firebase оновлені (${result.syncedCount} полотен, ${result.version}).${mediaNote}`,
          });
        } else if (result.syncedCount > 0 && result.failedCount > 0) {
          showToast({
            type: 'warning',
            title: 'Часткова синхронізація',
            message: `Збережено ${result.syncedCount} полотен у хмарі, не вдалося: ${result.failedCount} (${result.skippedTitles.join(', ')}).`,
          });
        } else {
          setSyncStatus('error');
          showToast({
            type: 'error',
            title: 'Помилка синхронізації хмари',
            message: result.error || 'Не вдалося записати дані у Firebase Firestore.',
          });
        }
      } catch (err: any) {
        const msg = err?.message || String(err);
        setSyncStatus('error');
        showToast({
          type: 'error',
          title: msg.includes('Quota exceeded') ? 'Перевищено квоту Firebase' : 'Помилка синхронізації хмари',
          message: 'Зміни збережено локально у браузері, але Firebase тимчасово недоступний.',
        });
      } finally {
        setIsFirebaseSyncing(false);
        setFirebaseSyncMode(null);
      }
      return;
    }

    const elapsed = Date.now() - startedAt;
    if (elapsed < 220) {
      await new Promise((resolve) => setTimeout(resolve, 220 - elapsed));
    }

    showToast({
      type: 'info',
      title: 'Збережено локально',
      message: `Полотно «${activeTreeSnapshot.title}» збережено в браузері. Увійдіть через Google (іконка статусу → «Підключити Google»), щоб синхронізувати з Firebase.`,
    });
  }, [
    currentUser,
    isCloudAuthenticated,
    isFirebaseSyncing,
    markFirebaseUnsynced,
    showToast,
    syncStatus,
  ]);

  const pendingDirtySnapshotRef = useRef<FamilyTreeData | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firebaseAutoSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const flushPendingSave = () => {
      if (!isAdminRef.current || !pendingDirtySnapshotRef.current) return;
      const snapshot = pendingDirtySnapshotRef.current;
      pendingDirtySnapshotRef.current = null;
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      saveTreeLocally(snapshot, true);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushPendingSave();
      }
    };

    window.addEventListener('pagehide', flushPendingSave);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', flushPendingSave);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAdminRef]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (skipNextAutoSaveRef.current) {
      skipNextAutoSaveRef.current = false;
      return;
    }
    if (!isAdmin) return;
    if (!hasLoadedFromServer.current) return;
    if (isDraggingCardRef.current) return;

    if (isUndoActionRef.current) {
      isUndoActionRef.current = false;
    } else {
      pushHistorySnapshot(tree);
    }

    const stampedSnapshot: FamilyTreeData = {
      ...tree,
      updatedAt: new Date().toISOString(),
    };

    treeRef.current = stampedSnapshot;
    saveTreeLocally(stampedSnapshot, true);
    pendingDirtySnapshotRef.current = stampedSnapshot;
    markFirebaseUnsynced(true);

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    if (firebaseAutoSyncTimerRef.current) {
      clearTimeout(firebaseAutoSyncTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(async () => {
      autoSaveTimerRef.current = null;
      const target = pendingDirtySnapshotRef.current || stampedSnapshot;
      pendingDirtySnapshotRef.current = null;

      saveTreeLocally(target, false);
      const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
      setIsServerConnected(online);
      setSyncStatus(online ? 'synced' : 'offline');
      setLastSavedTime(new Date(target.updatedAt));

      if (!online) return;

      // Automatically sync settled edits (including cross-canvas links) to Firebase if signed in
      if (isCloudWriteAuthenticated()) {
        firebaseAutoSyncTimerRef.current = setTimeout(async () => {
          firebaseAutoSyncTimerRef.current = null;
          if (!isCloudWriteAuthenticated() || isDraggingCardRef.current) return;
          try {
            if (hasDirtyGlobalVersion()) {
              const ver = getLocalGlobalVersion() || target.version || 'v0.1';
              const verSaved = await saveGlobalVersionToFirestore(ver).catch(() => false);
              if (verSaved) {
                setLocalGlobalVersion(ver, false);
              }
            }
            const targetId = target.id || MAIN_TREE_ID;
            const saved = await saveTreeToFirestore(
              targetId,
              target,
              currentUser?.uid,
              currentUser?.displayName || undefined,
              true
            );
            if (saved) {
              markTreeDirty(targetId, false);
              const now = new Date();
              setLastFirebaseSyncTime(now);
              setLastFirebaseSyncTimeStorage(now);
              markFirebaseUnsynced(false);
            }
          } catch {
            /* keep unsynced badge true for manual retry */
          }
        }, 2200);
      }
    }, 600);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
      if (firebaseAutoSyncTimerRef.current) {
        clearTimeout(firebaseAutoSyncTimerRef.current);
      }
    };
  }, [tree, isAdmin, isDraggingCardRef, isUndoActionRef, pushHistorySnapshot, markFirebaseUnsynced, currentUser]);

  const handleCreateNewTree = useCallback(
    async (title: string) => {
      if (isAdmin) {
        await syncTreeToServer(treeRef.current);
      }

      const activeVersion = getLocalGlobalVersion() || treeRef.current.version || 'v0.1';
      const newId = `tree_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const newTreeData: FamilyTreeData = {
        id: newId,
        title: title.trim() || 'Нове родове полотно',
        version: activeVersion,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        persons: {},
        clanCoatOfArms: {},
        connectionOverrides: {},
      };

      hasCenteredTreeIdRef.current = null;
      skipNextAutoSaveRef.current = true;
      treeRef.current = newTreeData;
      setTree(newTreeData);
      setSelectedPersonId(null);
      setSelectedPersonIds(new Set());
      setUserPersonId(null);

      await syncTreeToServer(newTreeData);
      markFirebaseUnsynced(true);
      notifyTreesChanged();

      logTree(`Створено нове полотно «${newTreeData.title}»`, { treeId: newTreeData.id }, 'success');
      if (isCloudWriteAuthenticated()) {
        void saveTreeToFirestore(
          newTreeData.id,
          newTreeData,
          currentUser?.uid,
          currentUser?.displayName || undefined,
          true
        ).then((savedCloud) => {
          if (savedCloud) {
            markTreeDirty(newTreeData.id, false);
            markFirebaseUnsynced(false);
          }
        });
      }

      showToast({
        type: 'success',
        title: 'Створено нове полотно',
        message: `Полотно "${newTreeData.title}" створено! Натисніть "+ Додати особу" для заповнення.`,
      });
    },
    [isAdmin, markFirebaseUnsynced, setSelectedPersonId, setSelectedPersonIds, setUserPersonId, showToast, currentUser]
  );

  const handleSelectTree = useCallback(
    async (treeId: string, targetPersonId?: string, options?: { skipSaveCurrent?: boolean }) => {
      if (isAdmin && !options?.skipSaveCurrent) {
        await syncTreeToServer(treeRef.current);
      }

      const skipLocalCache = isGuestLinkRouteRef.current;
      const [serverTrees, serverGlobalVersion] = await Promise.all([
        fetchServerTrees({ includeCloud: true }),
        fetchGlobalVersionFromServer({ includeCloud: true }),
      ]);
      const targetTree = await loadTreeById(treeId, {
        allowEmpty: true,
        pushLocalIfNewer: isAdmin,
        preferServer: !isAdmin,
        forceRemote: skipLocalCache,
        includeCloud: true,
        skipLocalRead: skipLocalCache,
        skipLocalWrite: skipLocalCache,
      });

      if (targetTree) {
        hasCenteredTreeIdRef.current = null;
        pendingFocusPersonIdRef.current = targetPersonId || null;
        const syncedTree = syncCrossCanvasLinkTitles(targetTree, serverTrees);
        const effectiveVersion = hasDirtyGlobalVersion()
          ? getLocalGlobalVersion() || treeRef.current.version || syncedTree.version || 'v0.1'
          : serverGlobalVersion || getLocalGlobalVersion() || treeRef.current.version || syncedTree.version || 'v0.1';
        const normalized = {
          ...syncedTree,
          version: effectiveVersion,
          persons: normalizeCoupleCoordinates(syncedTree.persons || {}, syncedTree.connectionOverrides),
        };
        skipNextAutoSaveRef.current = true;
        treeRef.current = normalized;
        isUndoActionRef.current = true;
        setTree(normalized);
        const nextSelected =
          (targetPersonId && normalized.persons[targetPersonId] ? targetPersonId : null) ||
          syncedTree.selectedPersonId ||
          Object.keys(syncedTree.persons || {})[0] ||
          null;
        setSelectedPersonId(nextSelected);
        setSelectedPersonIds(new Set());
        logUser(`Відкрито полотно «${syncedTree.title || 'Родинне дерево'}»`, {
          treeId: normalized.id,
          personCount: Object.keys(syncedTree.persons || {}).length,
          targetPersonId,
        });
        showToast({
          type: 'info',
          title: 'Полотно відкрито',
          message: `Відкрито полотно "${syncedTree.title || 'Родинне дерево'}" (${Object.keys(syncedTree.persons || {}).length} осіб).`,
        });
        return;
      }

      showToast({
        type: 'warning',
        title: 'Не вдалося відкрити полотно',
        message: 'Запитане полотно не знайдено.',
      });
    },
    [isAdmin, isUndoActionRef, setSelectedPersonId, setSelectedPersonIds, showToast]
  );

  const handleCloneTree = useCallback(
    async (treeId: string) => {
      if (isAdmin) {
        await syncTreeToServer(treeRef.current);
      }

      const sourceTree = await loadTreeById(treeId, { allowEmpty: true, includeCloud: true });
      if (!sourceTree) return;

      const activeVersion = getLocalGlobalVersion() || treeRef.current.version || sourceTree.version || 'v0.1';
      const newId = `tree_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const clonedTreeData: FamilyTreeData = {
        ...sourceTree,
        id: newId,
        title: `${sourceTree.title || 'Родове полотно'} (копія)`,
        version: activeVersion,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await syncTreeToServer(clonedTreeData);
      markFirebaseUnsynced(true);
      notifyTreesChanged();
      treeRef.current = clonedTreeData;
      isUndoActionRef.current = true;
      setTree(clonedTreeData);
      setSelectedPersonId(null);
      setSelectedPersonIds(new Set());

      logTree(`Здубльовано полотно «${clonedTreeData.title}»`, {
        sourceTreeId: treeId,
        newTreeId: newId,
        personCount: Object.keys(clonedTreeData.persons || {}).length,
      }, 'success');

      showToast({
        type: 'success',
        title: 'Полотно здубльовано',
        message: `Створено копію "${clonedTreeData.title}" (${Object.keys(clonedTreeData.persons || {}).length} осіб).`,
      });
    },
    [isAdmin, isUndoActionRef, markFirebaseUnsynced, setSelectedPersonId, setSelectedPersonIds, showToast]
  );

  const handleRenameTree = useCallback(
    async (treeId: string, newTitle: string): Promise<boolean> => {
      const isMain =
        treeId === 'my-family-tree' ||
        treeId === 'main-tree' ||
        treeId === 'default-tree' ||
        treeId === MAIN_TREE_ID;
      if (isMain) {
        showToast({
          type: 'warning',
          title: 'Дія заблокована',
          message: 'Головна гілка ніколи не видаляється і не змінюється назва.',
        });
        return false;
      }

      const cleanTitle = newTitle.trim();
      if (!cleanTitle) return false;

      const ok = await renameTreeOnServerOrStorage(treeId, cleanTitle);
      if (ok) {
        markFirebaseUnsynced(!isCloudWriteAuthenticated());
        notifyTreesChanged();
        setTree((prev) => {
          const isCurrentTarget = prev.id === treeId;
          const updatedPersons = { ...prev.persons };
          let hasPersonTitleChanges = false;

          Object.keys(updatedPersons).forEach((pId) => {
            const p = updatedPersons[pId];
            if (!p) return;
            let personChanged = false;
            let nextPerson = p;

            if (p.targetCanvasId === treeId) {
              nextPerson = {
                ...nextPerson,
                targetCanvasTitle: cleanTitle,
              };
              personChanged = true;
            }

            if (p.crossCanvasLinks && p.crossCanvasLinks.length > 0) {
              let linksChanged = false;
              const nextLinks = p.crossCanvasLinks.map((link) => {
                if (link.targetCanvasId === treeId && link.targetCanvasTitle !== cleanTitle) {
                  linksChanged = true;
                  return { ...link, targetCanvasTitle: cleanTitle };
                }
                return link;
              });
              if (linksChanged) {
                nextPerson = {
                  ...nextPerson,
                  crossCanvasLinks: nextLinks,
                };
                personChanged = true;
              }
            }

            if (personChanged) {
              updatedPersons[pId] = nextPerson;
              hasPersonTitleChanges = true;
            }
          });

          if (!isCurrentTarget && !hasPersonTitleChanges) return prev;

          return {
            ...prev,
            title: isCurrentTarget ? cleanTitle : prev.title,
            updatedAt: new Date().toISOString(),
            persons: updatedPersons,
          };
        });

        logTree(`Перейменовано полотно ${treeId} на «${cleanTitle}»`, { treeId, title: cleanTitle }, 'success');
        showToast({
          type: 'success',
          title: 'Назву змінено',
          message: `Полотно перейменовано на «${cleanTitle}».`,
        });
        return true;
      }

      showToast({
        type: 'error',
        title: 'Помилка',
        message: 'Не вдалося перейменувати полотно.',
      });
      return false;
    },
    [markFirebaseUnsynced, showToast]
  );

  const handleDeleteTree = useCallback(
    async (treeId: string, title?: string): Promise<boolean> => {
      const isMain =
        treeId === 'my-family-tree' ||
        treeId === 'main-tree' ||
        treeId === 'default-tree' ||
        treeId === MAIN_TREE_ID;
      if (isMain) {
        showToast({
          type: 'warning',
          title: 'Дія заблокована',
          message: 'Головне дерево ніколи не видаляється.',
        });
        return false;
      }

      // Cancel any pending auto-save / cloud-sync for the deleted canvas so it never resurrects
      if (treeRef.current.id === treeId || pendingDirtySnapshotRef.current?.id === treeId) {
        pendingDirtySnapshotRef.current = null;
        if (autoSaveTimerRef.current) {
          clearTimeout(autoSaveTimerRef.current);
          autoSaveTimerRef.current = null;
        }
        if (firebaseAutoSyncTimerRef.current) {
          clearTimeout(firebaseAutoSyncTimerRef.current);
          firebaseAutoSyncTimerRef.current = null;
        }
      }

      const wasCurrentTree = treeRef.current.id === treeId;
      const ok = await deleteTreeFromServerOrStorage(treeId);
      if (ok) {
        markFirebaseUnsynced(!isCloudWriteAuthenticated());
        notifyTreesChanged();
        logTree(`Видалено полотно «${title || treeId}»`, { treeId, title }, 'info');
        showToast({
          type: 'info',
          title: 'Полотно видалено',
          message: `Полотно «${title || 'Родове полотно'}» успішно видалено.`,
        });
        if (wasCurrentTree) {
          await handleSelectTree(MAIN_TREE_ID, undefined, { skipSaveCurrent: true });
        }
        return true;
      }

      logTree(`Помилка видалення полотна «${title || treeId}»`, { treeId, title }, 'error');
      showToast({
        type: 'error',
        title: 'Помилка',
        message: 'Не вдалося видалити полотно.',
      });
      return false;
    },
    [handleSelectTree, markFirebaseUnsynced, showToast]
  );

  const handleImportTreeFromJson = useCallback(
    async (importedTree: FamilyTreeData, mode: 'replace' | 'new-canvas', canvasTitle?: string) => {
      try {
        hasCenteredTreeIdRef.current = null;
        const activeVersion = getLocalGlobalVersion() || treeRef.current.version || importedTree.version || 'v0.1';
        let targetTree: FamilyTreeData;

        if (mode === 'new-canvas') {
          const newId = `tree_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          targetTree = {
            ...importedTree,
            id: newId,
            title: canvasTitle || importedTree.title || 'Нове родове полотно',
            version: activeVersion,
            updatedAt: new Date().toISOString(),
          };
        } else {
          targetTree = {
            ...importedTree,
            id: treeRef.current.id || 'my-family-tree',
            title: canvasTitle || importedTree.title || treeRef.current.title || 'Головне дерево',
            version: activeVersion,
            updatedAt: new Date().toISOString(),
          };
        }

        treeRef.current = targetTree;
        isUndoActionRef.current = true;
        setTree(targetTree);
        setSelectedPersonId(
          targetTree.selectedPersonId || Object.keys(targetTree.persons)[0] || null
        );

        const saved = await syncTreeToServer(targetTree);
        markFirebaseUnsynced(true);
        notifyTreesChanged();

        logTree(
          `Імпортовано полотно «${targetTree.title}» (${mode === 'new-canvas' ? 'нове полотно' : 'заміна'}, ${Object.keys(targetTree.persons || {}).length} осіб)`,
          { treeId: targetTree.id, mode, personCount: Object.keys(targetTree.persons || {}).length },
          'success'
        );

        if (saved) {
          const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
          setIsServerConnected(online);
          setSyncStatus(online ? 'synced' : 'offline');
          setLastSavedTime(new Date());
          showToast({
            type: 'success',
            title: 'Імпорт успішно завершено',
            message: `Родовід "${targetTree.title}" (${Object.keys(targetTree.persons || {}).length} осіб) збережено локально${isCloudWriteAuthenticated() ? ' та буде синхронізовано з Firebase' : ''}.`,
          });
        } else {
          setSyncStatus('error');
          showToast({
            type: 'warning',
            title: 'Помилка локального збереження',
            message: 'Не вдалося зберегти імпортоване полотно в пам’яті браузера.',
          });
        }

        if (onAfterImportFit) {
          setTimeout(onAfterImportFit, 100);
        }
      } catch (err) {
        setSyncStatus('error');
        logDatabase(`Помилка імпорту полотна: ${(err as Error).message}`, { mode }, 'error');
        showToast({
          type: 'error',
          title: 'Помилка імпорту',
          message: (err as Error).message,
        });
        throw err;
      }
    },
    [isUndoActionRef, markFirebaseUnsynced, onAfterImportFit, setSelectedPersonId, showToast]
  );

  const ensureCloudPublishedForShare = useCallback(async (): Promise<{
    ok: boolean;
    error?: string;
  }> => {
    if (!isCloudWriteAuthenticated() || !currentUser) {
      return {
        ok: false,
        error: 'Увійдіть через Google, щоб опублікувати дерево у Firebase для гостей.',
      };
    }

    setIsFirebaseSyncing(true);
    setFirebaseSyncMode('push');
    try {
      const snapshot: FamilyTreeData = {
        ...treeRef.current,
        updatedAt: treeRef.current.updatedAt || new Date().toISOString(),
      };
      saveTreeLocally(snapshot, false);
      const activeVer = getLocalGlobalVersion() || snapshot.version || 'v0.1';
      const result = await pushAllTreesToFirestoreManual(
        snapshot,
        activeVer,
        currentUser.uid,
        currentUser.displayName || undefined
      );
      if (result.ok) {
        const now = new Date();
        setLastFirebaseSyncTime(now);
        setLastFirebaseSyncTimeStorage(now);
        markFirebaseUnsynced(false);
        setIsServerConnected(true);
        setSyncStatus('synced');
        return { ok: true };
      }
      return {
        ok: false,
        error: result.error || 'Не вдалося опублікувати полотна у Firebase Firestore.',
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      setIsFirebaseSyncing(false);
      setFirebaseSyncMode(null);
    }
  }, [currentUser, markFirebaseUnsynced]);

  return {
    tree,
    setTree,
    treeRef,
    isInitialLoading,
    lastSavedTime,
    setLastSavedTime,
    syncStatus,
    isServerConnected,
    isFirebaseSyncing,
    firebaseSyncMode,
    lastFirebaseSyncTime,
    hasUnsyncedFirebaseChanges,
    hasCenteredTreeIdRef,
    pendingFocusPersonIdRef,
    guestShareState,
    ensureCloudPublishedForShare,
    handleUpdateVersion,
    handleUnifiedSync,
    handleCreateNewTree,
    handleSelectTree,
    handleCloneTree,
    handleRenameTree,
    handleDeleteTree,
    handleImportTreeFromJson,
  };
}
