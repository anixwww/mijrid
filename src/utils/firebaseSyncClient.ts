import { FamilyTreeData } from '../types/tree';
import {
  deleteTreeFromFirestore,
  fetchAllTreesFromFirestore,
  fetchGlobalVersionFromFirestore,
  getTreeById as getTreeByIdFromFirestore,
  isCloudWriteAuthenticated,
  saveGlobalVersionToFirestore,
  saveTreeToFirestore,
} from './firestoreTreeService';
import {
  restoreMissingMediaFromFirestore,
  syncTreesMediaToFirestore,
} from './mediaSync';
import {
  MAIN_TREE_ID,
  LocalTreeIndexItem,
  countTreeCrossCanvasLinks,
  enrichTreeForSave,
  getDeletedTreesForFirebase,
  getLocalGlobalVersion,
  markTreeDirty,
  normalizeTreeId,
  notifyTreesChanged,
  pickNewestTreeData,
  readLocalTreeCandidate,
  saveTreeLocally,
  setLastFirebaseSyncTimeStorage,
  setLocalGlobalVersion,
  setUnsyncedFirebaseChangesStorage,
  trackDeletedTreeForFirebase,
} from './localTreeStorage';
import { logDatabase, logError } from './logger';
import { invalidateTreeListCaches } from './treeServerApi';

export interface ManualFirebasePushResult {
  ok: boolean;
  syncedCount: number;
  failedCount: number;
  skippedTitles: string[];
  version: string;
  uploadedMediaCount?: number;
  failedMediaCount?: number;
  error?: string;
}

export async function pushAllTreesToFirestoreManual(
  activeTree: FamilyTreeData,
  globalVersion?: string,
  userId?: string,
  userName?: string
): Promise<ManualFirebasePushResult> {
  const effectiveVersion = (
    globalVersion ||
    getLocalGlobalVersion() ||
    activeTree.version ||
    'v0.1'
  ).trim();

  if (!isCloudWriteAuthenticated()) {
    return {
      ok: false,
      syncedCount: 0,
      failedCount: 0,
      skippedTitles: [],
      version: effectiveVersion,
      error: 'Необхідно увійти через Google для запису в Firebase.',
    };
  }

  const candidateIds = new Set<string>([MAIN_TREE_ID]);
  const { targetId: activeId } = normalizeTreeId(activeTree.id);
  candidateIds.add(activeId);

  try {
    const rawIndex = localStorage.getItem('rodovid_local_trees_index');
    if (rawIndex) {
      const list: LocalTreeIndexItem[] = JSON.parse(rawIndex);
      if (Array.isArray(list)) {
        list.forEach((item) => {
          if (item?.id) {
            candidateIds.add(normalizeTreeId(item.id).targetId);
          }
        });
      }
    }
  } catch {
    /* ignore */
  }

  const pendingDeletedSet = new Set(getDeletedTreesForFirebase());
  const cloudMap = new Map<string, FamilyTreeData>();

  // Include existing Firestore tree IDs (not deleted) so secondary canvases remain tracked
  try {
    const cloudExisting = await fetchAllTreesFromFirestore().catch(() => [] as FamilyTreeData[]);
    cloudExisting.forEach((ct) => {
      if (ct?.id) {
        const { targetId } = normalizeTreeId(ct.id);
        if (!pendingDeletedSet.has(targetId)) {
          candidateIds.add(targetId);
          cloudMap.set(targetId, { ...ct, id: targetId });
        }
      }
    });
  } catch {
    /* ignore */
  }

  const treesToPush = new Map<string, FamilyTreeData>();

  for (const rawId of candidateIds) {
    const { targetId, isMainTree } = normalizeTreeId(rawId);
    if (targetId === activeId || pendingDeletedSet.has(targetId)) continue;

    const localCandidate = readLocalTreeCandidate(targetId, isMainTree, true);
    const cloudCandidate = cloudMap.get(targetId) || null;
    const winner =
      pickNewestTreeData(localCandidate, cloudCandidate) ||
      localCandidate ||
      cloudCandidate;

    if (winner) {
      const { enriched } = enrichTreeForSave({
        ...winner,
        id: targetId,
        version: effectiveVersion,
      });
      treesToPush.set(targetId, enriched);
      saveTreeLocally(enriched, false);
    }
  }

  const { enriched: enrichedActive } = enrichTreeForSave({
    ...activeTree,
    id: activeId,
    version: effectiveVersion,
    updatedAt: activeTree.updatedAt || new Date().toISOString(),
  });
  treesToPush.set(activeId, enrichedActive);
  saveTreeLocally(enrichedActive, false);

  let uploadedMediaCount = 0;
  let failedMediaCount = 0;
  try {
    const mediaRes = await syncTreesMediaToFirestore(
      Array.from(treesToPush.values()),
      userId || '',
      true
    );
    uploadedMediaCount = mediaRes.uploadedCount;
    failedMediaCount = mediaRes.failedFiles.length;
    mediaRes.updatedTrees.forEach((updatedCanvas) => {
      const normalizedId = normalizeTreeId(updatedCanvas.id).targetId;
      treesToPush.set(normalizedId, updatedCanvas);
      saveTreeLocally(updatedCanvas, false);
    });
  } catch (err) {
    return {
      ok: false,
      syncedCount: 0,
      failedCount: treesToPush.size,
      skippedTitles: [],
      version: effectiveVersion,
      uploadedMediaCount: 0,
      failedMediaCount: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  let syncedCount = 0;
  let failedCount = 0;
  const skippedTitles: string[] = [];
  let firstError: string | undefined;

  try {
    await saveGlobalVersionToFirestore(effectiveVersion);
    setLocalGlobalVersion(effectiveVersion, false);
  } catch (err) {
    return {
      ok: false,
      syncedCount: 0,
      failedCount: treesToPush.size,
      skippedTitles: [],
      version: effectiveVersion,
      uploadedMediaCount,
      failedMediaCount,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  for (const [id, canvas] of treesToPush.entries()) {
    try {
      const saved = await saveTreeToFirestore(id, canvas, userId, userName, true);
      if (saved) {
        markTreeDirty(id, false);
        syncedCount += 1;
      } else {
        failedCount += 1;
        skippedTitles.push(canvas.title || id);
        if (!firstError) {
          firstError = `Полотно «${canvas.title || id}» не вдалося записати в Firestore (перевірте розмір < 950 КБ та авторизацію).`;
        }
      }
    } catch (err) {
      failedCount += 1;
      skippedTitles.push(canvas.title || id);
      if (!firstError) {
        firstError = err instanceof Error ? err.message : String(err);
      }
    }
  }

  const pendingDeleted = getDeletedTreesForFirebase();
  for (const delId of pendingDeleted) {
    if (!treesToPush.has(delId)) {
      try {
        await deleteTreeFromFirestore(delId);
        trackDeletedTreeForFirebase(delId, false);
      } catch {
        /* ignore single delete failure */
      }
    } else {
      trackDeletedTreeForFirebase(delId, false);
    }
  }

  const ok = syncedCount > 0 && failedCount === 0;
  if (ok) {
    setUnsyncedFirebaseChangesStorage(false);
    setLastFirebaseSyncTimeStorage(new Date());
    invalidateTreeListCaches();
    notifyTreesChanged();
    const totalCrossLinks = Array.from(treesToPush.values()).reduce(
      (sum, t) => sum + countTreeCrossCanvasLinks(t),
      0
    );
    logDatabase(
      `Завершено синхронізацію з Firebase: ${syncedCount} полотен (${effectiveVersion}, міжгілкових посилань: ${totalCrossLinks})`,
      { syncedCount, failedCount, uploadedMediaCount, totalCrossLinks, version: effectiveVersion },
      'success'
    );
  } else {
    logError('database', `Синхронізація з Firebase часткова або з помилкою (${syncedCount} успішно, ${failedCount} з помилкою)`, {
      syncedCount,
      failedCount,
      skippedTitles,
      firstError,
    });
  }

  return {
    ok,
    syncedCount,
    failedCount,
    skippedTitles,
    version: effectiveVersion,
    uploadedMediaCount,
    failedMediaCount,
    error: firstError,
  };
}

export interface ManualFirebasePullResult {
  ok: boolean;
  activeTree: FamilyTreeData | null;
  syncedCount: number;
  restoredMediaCount?: number;
  version: string | null;
}

export async function pullAllTreesFromFirestoreManual(
  currentTreeId: string
): Promise<ManualFirebasePullResult> {
  const { targetId: activeId } = normalizeTreeId(currentTreeId);

  const [cloudVersion, allCloudTrees, activeCloudDirect] = await Promise.all([
    fetchGlobalVersionFromFirestore().catch(() => null),
    fetchAllTreesFromFirestore(),
    getTreeByIdFromFirestore(activeId).catch(() => null),
  ]);

  const byId = new Map<string, FamilyTreeData>();
  for (const t of allCloudTrees) {
    const { targetId } = normalizeTreeId(t.id);
    byId.set(targetId, { ...t, id: targetId });
  }
  if (activeCloudDirect) {
    const { targetId } = normalizeTreeId(activeCloudDirect.id || activeId);
    byId.set(targetId, { ...activeCloudDirect, id: targetId });
  }

  if (byId.size === 0) {
    return {
      ok: false,
      activeTree: null,
      syncedCount: 0,
      version: cloudVersion,
    };
  }

  const effectiveVersion =
    cloudVersion || Array.from(byId.values())[0]?.version || getLocalGlobalVersion() || 'v0.1';
  setLocalGlobalVersion(effectiveVersion, false);

  for (const [targetId, treeItem] of byId.entries()) {
    const stamped: FamilyTreeData = {
      ...treeItem,
      id: targetId,
      version: effectiveVersion,
    };
    saveTreeLocally(stamped, false);
    markTreeDirty(targetId, false);
  }

  invalidateTreeListCaches();
  notifyTreesChanged();
  const restoredMediaCount = await restoreMissingMediaFromFirestore(Array.from(byId.values())).catch(
    () => 0
  );

  setUnsyncedFirebaseChangesStorage(false);
  setLastFirebaseSyncTimeStorage(new Date());

  const totalCrossLinks = Array.from(byId.values()).reduce(
    (sum, t) => sum + countTreeCrossCanvasLinks(t),
    0
  );
  logDatabase(
    `Завантажено з Firebase Firestore ${byId.size} полотен (${effectiveVersion}, міжгілкових посилань: ${totalCrossLinks}, відновлено фото: ${restoredMediaCount})`,
    { syncedCount: byId.size, totalCrossLinks, restoredMediaCount, version: effectiveVersion },
    'success'
  );

  const resolvedActive =
    byId.get(activeId) ||
    byId.get(MAIN_TREE_ID) ||
    Array.from(byId.values())[0] ||
    null;

  return {
    ok: Boolean(resolvedActive),
    activeTree: resolvedActive,
    syncedCount: byId.size,
    restoredMediaCount,
    version: effectiveVersion,
  };
}
