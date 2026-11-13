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
  loadTreeFromLocalStorage,
  loadTreeFromServerOrStorage,
  loadTreeById,
  checkServerHealth,
  MAIN_TREE_ID,
  renameTreeOnServerOrStorage,
  deleteTreeFromServerOrStorage,
  fetchServerTrees,
  fetchAllTreesSearchIndex,
  fetchServerTreeMeta,
  syncCrossCanvasLinkTitles,
  syncTreeToServer,
  syncPendingDirtyTrees,
  getLocalGlobalVersion,
  hasDirtyGlobalVersion,
  setLocalGlobalVersion,
  fetchGlobalVersionFromServer,
  syncGlobalVersionToServer,
  pushAllTreesToFirestoreManual,
  pullAllTreesFromFirestoreManual,
  hasUnsyncedFirebaseChangesStorage,
  setUnsyncedFirebaseChangesStorage,
  getLastFirebaseSyncTimeStorage,
  setLastFirebaseSyncTimeStorage,
  notifyTreesChanged,
} from '../utils/fileStorage';
import {
  isCloudWriteAuthenticated,
  renameTreeInFirestore,
  saveGlobalVersionToFirestore,
  saveTreeToFirestore,
} from '../utils/firestoreTreeService';
import { useAuth } from '../context/AuthContext';
import { normalizeCoupleCoordinates } from '../utils/lineageUtils';
import { ensureTreeCardIds } from '../utils/cardIdUtils';
import { logDatabase, logServer, logTree, logUser } from '../utils/logger';
import { ToastMessage } from '../components/Toast';

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
  const hasCenteredTreeIdRef = useRef<string | null>(null);
  const pendingFocusPersonIdRef = useRef<string | null>(null);

  const hasCachedLocalTree = (() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const sharedTreeId = params.get('tree');
      if (sharedTreeId && sharedTreeId !== MAIN_TREE_ID && sharedTreeId !== 'main-tree' && sharedTreeId !== 'default-tree') {
        return false;
      }
      return Boolean(tree.persons && Object.keys(tree.persons).length > 0);
    } catch {
      return false;
    }
  })();

  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(!hasCachedLocalTree);
  const [lastSavedTime, setLastSavedTime] = useState<Date | null>(new Date());
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'error' | 'offline'>('synced');
  const [isServerConnected, setIsServerConnected] = useState<boolean>(true);
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

  // Initial persistent tree fetch (parallel Express + optional Firestore fallback; never blocks cached entry)
  useEffect(() => {
    let isCancelled = false;
    const params = new URLSearchParams(window.location.search);
    const sharedTreeId = params.get('tree');

    // Hard safety cap so slow networks can never trap the user on the splash screen
    const maxSplashTimer = window.setTimeout(() => {
      if (!isCancelled) {
        setIsInitialLoading(false);
      }
    }, 2200);

    const loadInitialTree = async () => {
      try {
        const targetPromise = sharedTreeId
          ? loadTreeById(sharedTreeId, {
              allowEmpty: true,
              pushLocalIfNewer: true,
              includeCloud: true,
            }).then(async (found) => {
              if (found) return found;
              return loadTreeFromServerOrStorage({
                pushLocalIfNewer: true,
                includeCloud: true,
              });
            })
          : loadTreeFromServerOrStorage({
              pushLocalIfNewer: true,
              includeCloud: true,
            });

        const [serverTrees, serverGlobalVersion, targetTree] = await Promise.all([
          fetchServerTrees({ includeCloud: true }),
          fetchGlobalVersionFromServer({ includeCloud: true }),
          targetPromise,
        ]);

        // Pre-warm & hydrate all cloud canvases (including cross-canvas links) in background
        void fetchAllTreesSearchIndex({ includeCloud: true }).then(() => {
          notifyTreesChanged();
        });

        if (isCancelled) return;
        hasLoadedFromServer.current = true;

        const effectiveVersion = hasDirtyGlobalVersion()
          ? getLocalGlobalVersion() || targetTree?.version || 'v0.1'
          : serverGlobalVersion || getLocalGlobalVersion() || targetTree?.version || 'v0.1';
        if (!hasDirtyGlobalVersion() && serverGlobalVersion) {
          setLocalGlobalVersion(serverGlobalVersion, false);
        }

        if (targetTree && targetTree.persons && Object.keys(targetTree.persons).length > 0) {
          const syncedTree = syncCrossCanvasLinkTitles(targetTree, serverTrees);
          setTree({
            ...syncedTree,
            version: effectiveVersion,
            persons: normalizeCoupleCoordinates(syncedTree.persons, syncedTree.connectionOverrides),
          });
          logTree(
            `Завантажено полотно «${syncedTree.title}» (${Object.keys(syncedTree.persons).length} осіб, ${effectiveVersion})`,
            { treeId: syncedTree.id, canvasCount: serverTrees.length },
            'info'
          );
        } else if (targetTree) {
          setTree({
            ...targetTree,
            version: effectiveVersion,
            persons: normalizeCoupleCoordinates(targetTree.persons || {}, targetTree.connectionOverrides),
          });
        } else if (effectiveVersion) {
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

  const { currentUser, isCloudAuthenticated, signInWithGoogle } = useAuth();

  // Periodic heartbeat & connectivity detection
  useEffect(() => {
    let isMounted = true;

    const probeServer = async () => {
      const ok = await checkServerHealth();
      if (!isMounted) return;
      const prevStatus = syncStatusRef.current;
      setIsServerConnected(ok);

      if (!ok) {
        if (prevStatus !== 'offline') {
          setSyncStatus('offline');
        }
      } else if (prevStatus === 'offline' || prevStatus === 'error') {
        setSyncStatus('synced');
        if (isAdminRef.current) {
          void syncPendingDirtyTrees();
        }
      }
    };

    void probeServer();
    const interval = setInterval(probeServer, 60000);
    const handleOnline = () => void probeServer();
    const handleOffline = () => {
      setIsServerConnected(false);
      setSyncStatus('offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      isMounted = false;
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
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
      treeRef.current = updatedTree;
      setTree(updatedTree);
      markFirebaseUnsynced(true);
      setSyncStatus('syncing');

      logTree(`Оновлено глобальну версію родоводу на ${cleanVersion}`, {
        version: cleanVersion,
        treeId: updatedTree.id,
      });

      const [versionSaved, treeSaved] = await Promise.all([
        syncGlobalVersionToServer(cleanVersion),
        syncTreeToServer(updatedTree),
      ]);

      if (isCloudWriteAuthenticated()) {
        try {
          await Promise.all([
            saveGlobalVersionToFirestore(cleanVersion),
            saveTreeToFirestore(updatedTree.id, updatedTree, undefined, undefined, true),
          ]);
        } catch {
          /* keep unsynced marker if cloud update failed */
        }
      }

      if (versionSaved && treeSaved) {
        setIsServerConnected(true);
        setSyncStatus('synced');
        setLastSavedTime(new Date());
        showToast({
          type: 'success',
          title: 'Версію оновлено для всіх полотен',
          message: `Версію родоводу змінено на ${cleanVersion} для кожного полотна та збережено на сервері.`,
        });
      } else {
        const serverAlive = await checkServerHealth();
        setIsServerConnected(serverAlive);
        setSyncStatus(serverAlive ? 'error' : 'offline');
        setLastSavedTime(new Date());
        showToast({
          type: 'info',
          title: 'Версію оновлено локально',
          message: `Версію родоводу змінено на ${cleanVersion} для всіх полотен. Буде синхронізовано з сервером при відновленні зв'язку.`,
        });
      }
    },
    [markFirebaseUnsynced, showToast]
  );

  const syncLatestTreeFromServer = useCallback(
    async (isGuestMode = false) => {
      if (isAdmin && !isGuestMode) return;
      if (isGuestMode && document.visibilityState === 'hidden') return;

      try {
        const currentId = treeRef.current.id || MAIN_TREE_ID;
        const currentVersion = treeRef.current.version || 'v0.1';
        const currentUpdated = treeRef.current.updatedAt || '';

        const meta = await fetchServerTreeMeta(currentId);
        if (meta) {
          const isMetaSame =
            meta.version === currentVersion &&
            meta.updatedAt === currentUpdated &&
            meta.personCount === Object.keys(treeRef.current.persons || {}).length;
          if (isMetaSame) return;
        }

        const serverTree = await loadTreeById(currentId, { preferServer: true });
        if (serverTree && serverTree.persons && Object.keys(serverTree.persons).length > 0) {
          const serverTreesList = await fetchServerTrees();
          const syncedTree = syncCrossCanvasLinkTitles(serverTree, serverTreesList);

          const serverVersion = meta?.version || syncedTree.version || 'v0.1';
          const serverUpdated = syncedTree.updatedAt || '';

          const isVersionChanged = serverVersion !== currentVersion;
          const isTimestampChanged = serverUpdated > currentUpdated;

          if (isVersionChanged || isTimestampChanged || (isGuestMode && meta !== null)) {
            setLocalGlobalVersion(serverVersion, false);
            const normalized = {
              ...syncedTree,
              version: serverVersion,
              persons: normalizeCoupleCoordinates(syncedTree.persons, syncedTree.connectionOverrides),
            };
            treeRef.current = normalized;
            setTree(normalized);
            setLastSavedTime(new Date(syncedTree.updatedAt || Date.now()));

            if (isGuestMode && (isVersionChanged || isTimestampChanged)) {
              showToast({
                type: 'info',
                title: `Синхронізовано (${serverVersion})`,
                message: `Завантажено актуальну версію родоводу від адміністратора.`,
              });
            }
          }
        }
      } catch (err) {
        console.warn('Sync tree check failed:', err);
      }
    },
    [isAdmin, showToast]
  );

  // Guest polling
  useEffect(() => {
    if (isAdmin) return;
    void syncLatestTreeFromServer(true);

    const intervalTimer = setInterval(() => {
      void syncLatestTreeFromServer(true);
    }, 6000);

    const handleWindowFocus = () => {
      if (document.visibilityState === 'visible') {
        void syncLatestTreeFromServer(true);
      }
    };

    window.addEventListener('visibilitychange', handleWindowFocus);
    window.addEventListener('focus', handleWindowFocus);
    return () => {
      clearInterval(intervalTimer);
      window.removeEventListener('visibilitychange', handleWindowFocus);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [isAdmin, syncLatestTreeFromServer]);

  // Lightweight Admin polling to pull new guest suggestions / proposal cards from server safely
  useEffect(() => {
    if (!isAdmin) return;

    const checkIncomingGuestFeedback = async () => {
      if (document.visibilityState === 'hidden') return;
      if (!hasLoadedFromServer.current || isDraggingCardRef.current || pendingDirtySnapshotRef.current) return;

      try {
        const currentId = treeRef.current.id || MAIN_TREE_ID;
        const meta = await fetchServerTreeMeta(currentId);
        if (!meta?.updatedAt || meta.updatedAt <= (treeRef.current.updatedAt || '')) return;

        const serverTree = await loadTreeById(currentId, { preferServer: true });
        if (!serverTree?.persons) return;

        let newSuggestionsCount = 0;
        let newProposalsCount = 0;
        let guestCustomizationsCount = 0;
        const current = treeRef.current;
        const mergedPersons = { ...current.persons };

        // 1. Merge unseen guestSuggestions & guest self-customizations onto existing cards
        Object.values(serverTree.persons).forEach((srvPerson) => {
          const localP = mergedPersons[srvPerson.id];
          if (localP) {
            let updatedLocal = localP;
            let localChanged = false;

            if (Array.isArray(srvPerson.guestSuggestions) && srvPerson.guestSuggestions.length > 0) {
              const existingSugs = localP.guestSuggestions || [];
              const unseen = srvPerson.guestSuggestions.filter(
                (s) => s.status === 'pending' && !existingSugs.some((ex) => ex.id === s.id)
              );
              if (unseen.length > 0) {
                newSuggestionsCount += unseen.length;
                updatedLocal = {
                  ...updatedLocal,
                  guestSuggestions: [...existingSugs, ...unseen],
                };
                localChanged = true;
              }
            }

            if (
              srvPerson.selfCustomizedAt &&
              srvPerson.selfCustomizedAt > (localP.selfCustomizedAt || '')
            ) {
              guestCustomizationsCount += 1;
              updatedLocal = {
                ...updatedLocal,
                avatarUrl: srvPerson.avatarUrl,
                cardBgColor: srvPerson.cardBgColor,
                cardFrame: srvPerson.cardFrame,
                selfCustomizedAt: srvPerson.selfCustomizedAt,
              };
              localChanged = true;
            }

            if (localChanged) {
              mergedPersons[srvPerson.id] = updatedLocal;
            }
          }

          // 2. Merge unseen proposal cards created by guests
          if (srvPerson.isProposal && !mergedPersons[srvPerson.id]) {
            newProposalsCount += 1;
            mergedPersons[srvPerson.id] = srvPerson;

            const appendId = (arr: string[] | undefined, id: string) =>
              Array.isArray(arr) ? (arr.includes(id) ? arr : [...arr, id]) : [id];

            // Ensure reciprocal arrays on existing cards include the new proposal ID
            (srvPerson.parents || []).forEach((pid) => {
              if (mergedPersons[pid]) {
                mergedPersons[pid] = {
                  ...mergedPersons[pid],
                  children: appendId(mergedPersons[pid].children, srvPerson.id),
                };
              }
            });
            (srvPerson.children || []).forEach((cid) => {
              if (mergedPersons[cid]) {
                mergedPersons[cid] = {
                  ...mergedPersons[cid],
                  parents: appendId(mergedPersons[cid].parents, srvPerson.id),
                };
              }
            });
            (srvPerson.spouses || []).forEach((sid) => {
              if (mergedPersons[sid]) {
                mergedPersons[sid] = {
                  ...mergedPersons[sid],
                  spouses: appendId(mergedPersons[sid].spouses, srvPerson.id),
                };
              }
            });
            (srvPerson.siblings || []).forEach((sibId) => {
              if (mergedPersons[sibId]) {
                mergedPersons[sibId] = {
                  ...mergedPersons[sibId],
                  siblings: appendId(mergedPersons[sibId].siblings, srvPerson.id),
                };
              }
            });
          }
        });

        if (newSuggestionsCount > 0 || newProposalsCount > 0 || guestCustomizationsCount > 0) {
          const mergedOverrides = { ...(current.connectionOverrides || {}) };
          if (serverTree.connectionOverrides) {
            Object.entries(serverTree.connectionOverrides).forEach(([k, v]) => {
              if (!mergedOverrides[k]) mergedOverrides[k] = v;
            });
          }
          const updatedTree: FamilyTreeData = {
            ...current,
            persons: normalizeCoupleCoordinates(mergedPersons, mergedOverrides),
            connectionOverrides: mergedOverrides,
            updatedAt: serverTree.updatedAt || new Date().toISOString(),
          };
          isUndoActionRef.current = true;
          treeRef.current = updatedTree;
          setTree(updatedTree);
          saveTreeLocally(updatedTree, false);

          if (newSuggestionsCount > 0 || newProposalsCount > 0) {
            const parts: string[] = [];
            if (newSuggestionsCount > 0) parts.push(`уточнень: ${newSuggestionsCount}`);
            if (newProposalsCount > 0) parts.push(`карток-пропозицій: ${newProposalsCount}`);
            showToast({
              type: 'info',
              title: 'Нові пропозиції від родичів',
              message: `Надійшли нові пропозиції від гостей (${parts.join(', ')}).`,
            });
          } else if (guestCustomizationsCount > 0) {
            showToast({
              type: 'info',
              title: 'Оновлено оформлення картки',
              message:
                guestCustomizationsCount === 1
                  ? 'Гість оновив оформлення своєї картки (аватар/колір/рамку).'
                  : `Гості оновили оформлення карток (${guestCustomizationsCount}).`,
            });
          }
        }
      } catch {
        /* ignore background polling errors */
      }
    };

    const timer = setInterval(() => void checkIncomingGuestFeedback(), 18000);
    const onFocus = () => void checkIncomingGuestFeedback();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [isAdmin, isDraggingCardRef, isUndoActionRef, showToast]);

  const executeForceRefreshFromCloud = useCallback(async () => {
    setSyncStatus('syncing');
    const startedAt = Date.now();
    try {
      const currentId = treeRef.current.id || MAIN_TREE_ID;
      const [serverTree, serverGlobalVersion] = await Promise.all([
        loadTreeById(currentId, { allowEmpty: true, preferServer: true }),
        fetchGlobalVersionFromServer(),
      ]);
      const elapsed = Date.now() - startedAt;
      if (elapsed < 300) {
        await new Promise((resolve) => setTimeout(resolve, 300 - elapsed));
      }
      if (serverTree && serverTree.persons && Object.keys(serverTree.persons).length > 0) {
        const serverTreesList = await fetchServerTrees();
        const syncedTree = syncCrossCanvasLinkTitles(serverTree, serverTreesList);
        const effectiveVersion = serverGlobalVersion || syncedTree.version || 'v0.1';
        setLocalGlobalVersion(effectiveVersion, false);
        const normalized: FamilyTreeData = {
          ...syncedTree,
          version: effectiveVersion,
          persons: normalizeCoupleCoordinates(syncedTree.persons, syncedTree.connectionOverrides),
        };
        treeRef.current = normalized;
        setTree(normalized);
        saveTreeLocally(normalized, false);
        setIsServerConnected(true);
        setSyncStatus('synced');
        setLastSavedTime(new Date(normalized.updatedAt || Date.now()));
        showToast({
          type: 'info',
          title: `Оновлено із сервера (${normalized.version || 'v0.1'})`,
          message: `Завантажено збережену копію родоводу з сервера (${Object.keys(normalized.persons || {}).length} осіб).`,
        });
      } else {
        const serverAlive = await checkServerHealth();
        setIsServerConnected(serverAlive);
        setSyncStatus(serverAlive ? 'error' : 'offline');
        showToast({
          type: 'warning',
          title: 'Дані відсутні',
          message: serverAlive
            ? 'На сервері немає збереженої копії цього полотна.'
            : 'Немає зв’язку із сервером — використовується локальна копія.',
        });
      }
    } catch (err) {
      console.error('Force refresh failed:', err);
      const serverAlive = await checkServerHealth();
      setIsServerConnected(serverAlive);
      setSyncStatus(serverAlive ? 'error' : 'offline');
      showToast({
        type: 'error',
        title: 'Помилка оновлення',
        message: 'Не вдалося завантажити родовід із сервера.',
      });
    }
  }, [showToast]);

  const executePullFromFirebase = useCallback(async () => {
    if (isFirebaseSyncing) return;
    setIsFirebaseSyncing(true);
    setFirebaseSyncMode('pull');
    const startedAt = Date.now();
    try {
      const currentId = treeRef.current.id || MAIN_TREE_ID;
      const result = await pullAllTreesFromFirestoreManual(currentId);

      const elapsed = Date.now() - startedAt;
      if (elapsed < 320) {
        await new Promise((resolve) => setTimeout(resolve, 320 - elapsed));
      }

      if (result.ok && result.activeTree) {
        const effectiveVersion = result.version || result.activeTree.version || 'v0.1';
        const normalized: FamilyTreeData = {
          ...result.activeTree,
          version: effectiveVersion,
          persons: normalizeCoupleCoordinates(
            result.activeTree.persons || {},
            result.activeTree.connectionOverrides
          ),
        };
        isUndoActionRef.current = true;
        treeRef.current = normalized;
        setTree(normalized);
        saveTreeLocally(normalized, false);

        const now = new Date();
        setLastFirebaseSyncTime(now);
        setLastFirebaseSyncTimeStorage(now);
        markFirebaseUnsynced(false);
        setLastSavedTime(new Date(normalized.updatedAt || Date.now()));

        const mediaRestoredNote =
          result.restoredMediaCount && result.restoredMediaCount > 0
            ? ` Відновлено фото: ${result.restoredMediaCount}.`
            : '';

        showToast({
          type: 'success',
          title: `Відновлено з хмари (${effectiveVersion})`,
          message: `Завантажено полотен: ${result.syncedCount}.${mediaRestoredNote} Поточне полотно оновлено.`,
        });
      } else {
        await executeForceRefreshFromCloud();
      }
    } catch (err: any) {
      const msg = err?.message || String(err);
      showToast({
        type: 'error',
        title: 'Помилка відновлення з хмари',
        message: msg.includes('Quota exceeded')
          ? 'Денну квоту Firebase вичерпано. Спробуйте завтра.'
          : 'Не вдалося завантажити полотна з Firebase Firestore.',
      });
    } finally {
      setIsFirebaseSyncing(false);
      setFirebaseSyncMode(null);
    }
  }, [executeForceRefreshFromCloud, isFirebaseSyncing, isUndoActionRef, markFirebaseUnsynced, showToast]);

  const handleUnifiedSync = useCallback(async () => {
    if (syncStatus === 'syncing' || isFirebaseSyncing) return;

    setSyncStatus('syncing');
    const startedAt = Date.now();
    let serverOk = false;
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
      treeRef.current = treeToSave;
      setTree(treeToSave);
      saveTreeLocally(treeToSave, false);

      serverOk = await syncTreeToServer(treeToSave);
      if (serverOk) {
        setIsServerConnected(true);
        setSyncStatus('synced');
        setLastSavedTime(new Date(nowIso));
        logServer(
          `Синхронізація полотна «${treeToSave.title}» на сервер успішна`,
          {
            treeId: treeToSave.id,
            personCount: Object.keys(treeToSave.persons || {}).length,
          },
          'success'
        );
      } else {
        const serverAlive = await checkServerHealth();
        setIsServerConnected(serverAlive);
        setSyncStatus(serverAlive ? 'error' : 'offline');
      }
    } catch (err) {
      console.error('handleUnifiedSync server phase error:', err);
      setIsServerConnected(false);
      setSyncStatus('offline');
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
          const mediaNote =
            result.uploadedMediaCount && result.uploadedMediaCount > 0
              ? ` Нових фото: ${result.uploadedMediaCount}.`
              : '';
          showToast({
            type: 'success',
            title: 'Синхронізовано',
            message: `${serverOk ? 'Сервер і хмара Firebase' : 'Хмара Firebase'} оновлені (${result.syncedCount} полотен, ${result.version}).${mediaNote}`,
          });
        } else if (result.syncedCount > 0 && result.failedCount > 0) {
          showToast({
            type: 'warning',
            title: 'Часткова синхронізація',
            message: `Збережено ${result.syncedCount} полотен у хмарі, не вдалося: ${result.failedCount} (${result.skippedTitles.join(', ')}).`,
          });
        } else {
          showToast({
            type: serverOk ? 'warning' : 'error',
            title: serverOk ? 'Збережено на сервері, помилка хмари' : 'Помилка синхронізації',
            message: result.error || 'Не вдалося записати дані у Firebase Firestore.',
          });
        }
      } catch (err: any) {
        const msg = err?.message || String(err);
        showToast({
          type: serverOk ? 'warning' : 'error',
          title: msg.includes('Quota exceeded') ? 'Перевищено квоту Firebase' : 'Помилка синхронізації хмари',
          message: serverOk
            ? 'Дані збережено локально та на сервері, але хмара тимчасово недоступна.'
            : 'Не вдалося синхронізувати дані з Firebase.',
        });
      } finally {
        setIsFirebaseSyncing(false);
        setFirebaseSyncMode(null);
      }
      return;
    }

    const elapsed = Date.now() - startedAt;
    if (elapsed < 300) {
      await new Promise((resolve) => setTimeout(resolve, 300 - elapsed));
    }

    if (serverOk) {
      showToast({
        type: 'success',
        title: 'Синхронізовано з сервером',
        message: `Полотно «${activeTreeSnapshot.title}» (${activeTreeSnapshot.version || 'v0.1'}) збережено локально та на сервері.`,
      });
    } else {
      showToast({
        type: 'warning',
        title: 'Збережено лише локально',
        message: 'Сервер недоступний — зміни збережено у браузері.',
      });
    }
  }, [
    currentUser,
    isCloudAuthenticated,
    isFirebaseSyncing,
    markFirebaseUnsynced,
    showToast,
    syncStatus,
  ]);

  const handleRestoreFromCloud = useCallback(() => {
    setConfirmDialog({
      title: 'Відновити дані з хмари / сервера?',
      description: isCloudAuthenticated
        ? 'Буде завантажено збережені полотна з Firebase Firestore (або із сервера). Несинхронізовані локальні зміни можуть бути замінені.'
        : 'Усі незбережені локальні зміни на цьому полотні буде замінено останньою збереженою версією із сервера.',
      confirmLabel: 'Відновити',
      variant: 'warning',
      onConfirm: () => {
        setConfirmDialog(null);
        if (isCloudAuthenticated) {
          void executePullFromFirebase();
        } else {
          void executeForceRefreshFromCloud();
        }
      },
    });
  }, [executeForceRefreshFromCloud, executePullFromFirebase, isCloudAuthenticated, setConfirmDialog]);

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
      void syncTreeToServer(snapshot, { keepalive: true });
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

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setIsServerConnected(false);
        setSyncStatus('offline');
        setLastSavedTime(new Date(target.updatedAt));
        return;
      }

      // Show server-syncing indicator only if the actual HTTP save takes >= 160ms
      // so fast local saves never cause icon flickering.
      let syncVisualStartedAt = 0;
      const syncVisualTimer = window.setTimeout(() => {
        syncVisualStartedAt = Date.now();
        setSyncStatus('syncing');
      }, 160);

      const ok = await syncTreeToServer(target);
      window.clearTimeout(syncVisualTimer);

      if (syncVisualStartedAt > 0) {
        const elapsed = Date.now() - syncVisualStartedAt;
        if (elapsed < 350) {
          await new Promise((resolve) => setTimeout(resolve, 350 - elapsed));
        }
      }

      if (ok) {
        setIsServerConnected(true);
        setSyncStatus('synced');
      } else {
        const serverAlive = await checkServerHealth();
        setIsServerConnected(serverAlive);
        setSyncStatus(serverAlive ? 'error' : 'offline');
      }
      setLastSavedTime(new Date(target.updatedAt));

      // Automatically sync settled edits (including cross-canvas links) to Firebase if signed in
      if (isCloudWriteAuthenticated()) {
        firebaseAutoSyncTimerRef.current = setTimeout(async () => {
          firebaseAutoSyncTimerRef.current = null;
          if (!isCloudWriteAuthenticated() || isDraggingCardRef.current) return;
          try {
            const saved = await saveTreeToFirestore(
              target.id || MAIN_TREE_ID,
              target,
              currentUser?.uid,
              currentUser?.displayName || undefined,
              true
            );
            if (saved) {
              const now = new Date();
              setLastFirebaseSyncTime(now);
              setLastFirebaseSyncTimeStorage(now);
              markFirebaseUnsynced(false);
            }
          } catch {
            /* keep unsynced badge true for manual retry */
          }
        }, 2800);
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
      setTree(newTreeData);
      setSelectedPersonId(null);
      setSelectedPersonIds(new Set());
      setUserPersonId(null);

      await syncTreeToServer(newTreeData);
      markFirebaseUnsynced(true);
      notifyTreesChanged();

      logTree(`Створено нове полотно «${newTreeData.title}»`, { treeId: newTreeData.id }, 'success');
      if (isCloudWriteAuthenticated()) {
        void saveTreeToFirestore(newTreeData.id, newTreeData, currentUser?.uid, currentUser?.displayName || undefined, true);
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

      const [serverTrees, serverGlobalVersion] = await Promise.all([
        fetchServerTrees({ includeCloud: true }),
        fetchGlobalVersionFromServer({ includeCloud: true }),
      ]);
      const targetTree = await loadTreeById(treeId, {
        allowEmpty: true,
        pushLocalIfNewer: isAdmin,
        preferServer: !isAdmin,
        includeCloud: true,
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
        markFirebaseUnsynced(true);
        notifyTreesChanged();
        if (isCloudWriteAuthenticated()) {
          void renameTreeInFirestore(treeId, cleanTitle).catch(() => {});
        }
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
        markFirebaseUnsynced(true);
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

        setSyncStatus('syncing');
        const saved = await syncTreeToServer(targetTree);
        markFirebaseUnsynced(true);
        notifyTreesChanged();

        logTree(
          `Імпортовано полотно «${targetTree.title}» (${mode === 'new-canvas' ? 'нове полотно' : 'заміна'}, ${Object.keys(targetTree.persons || {}).length} осіб)`,
          { treeId: targetTree.id, mode, personCount: Object.keys(targetTree.persons || {}).length },
          'success'
        );

        if (saved) {
          setIsServerConnected(true);
          setSyncStatus('synced');
          setLastSavedTime(new Date());
          showToast({
            type: 'success',
            title: 'Імпорт успішно завершено',
            message: `Родовід "${targetTree.title}" (${Object.keys(targetTree.persons || {}).length} осіб) збережено локально та на сервері.`,
          });
        } else {
          const serverAlive = await checkServerHealth();
          setIsServerConnected(serverAlive);
          setSyncStatus(serverAlive ? 'error' : 'offline');
          showToast({
            type: 'warning',
            title: 'Збережено локально',
            message: 'Дані збережено локально у браузері, але не вдалося синхронізувати з сервером.',
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
    handleUpdateVersion,
    handleUnifiedSync,
    handleRestoreFromCloud,
    handleCreateNewTree,
    handleSelectTree,
    handleCloneTree,
    handleRenameTree,
    handleDeleteTree,
    handleImportTreeFromJson,
  };
}
