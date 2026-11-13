import {
  CardFrameStyle,
  ConnectionMeta,
  FamilyTreeData,
  GuestSuggestion,
  Person,
} from '../types/tree';
import { authHeaders, getAuthToken, handleUnauthorized } from './auth';
import { logServer, logDatabase, logError } from './logger';
import {
  deleteTreeFromFirestore,
  fetchAllTreesFromFirestore,
  fetchGlobalVersionFromFirestore,
  getTreeById as getTreeByIdFromFirestore,
  getUserTrees as getUserTreesFromFirestore,
  isCloudWriteAuthenticated,
} from './firestoreTreeService';
import { restoreMissingMediaFromFirestore } from './mediaSync';
import { fetchWithTimeout } from './mediaUploadClient';
import {
  MAIN_TREE_ID,
  LocalTreeIndexItem,
  ServerTreeMeta,
  enrichTreeForSave,
  getDeletedTreesForFirebase,
  getDirtyTreeIds,
  getLocalGlobalVersion,
  hasDirtyGlobalVersion,
  markTreeDirty,
  normalizeTreeId,
  notifyTreesChanged,
  parseTimestamp,
  parseVersionFloat,
  pickNewestTreeData,
  readLocalTreeCandidate,
  readLocalTreeRaw,
  saveTreeLocally,
  setLocalGlobalVersion,
  trackDeletedTreeForFirebase,
  withTimeout,
} from './localTreeStorage';

const CACHE_TTL_MS = 2500;
const treesListCache = new Map<string, { ts: number; data: LocalTreeIndexItem[] }>();
const inflightTreesList = new Map<string, Promise<LocalTreeIndexItem[]>>();

export interface CrossCanvasSearchTree {
  treeId: string;
  treeTitle: string;
  isMain: boolean;
  updatedAt: string;
  persons: Person[];
}

const searchIndexCache = new Map<string, { ts: number; data: CrossCanvasSearchTree[] }>();
const inflightSearchIndex = new Map<string, Promise<CrossCanvasSearchTree[]>>();

export function invalidateTreeListCaches(): void {
  treesListCache.clear();
  searchIndexCache.clear();
}

export async function fetchGlobalVersionFromServer(options?: { includeCloud?: boolean }): Promise<string | null> {
  const [serverVer, cloudVer] = await Promise.all([
    (async () => {
      try {
        const res = await fetchWithTimeout('/api/version', {}, 3500);
        if (!res.ok) return null;
        const json = await res.json();
        if (json?.success && typeof json.version === 'string' && json.version.trim()) {
          return json.version.trim();
        }
      } catch {
        /* ignore transient network errors */
      }
      return null;
    })(),
    options?.includeCloud
      ? withTimeout(fetchGlobalVersionFromFirestore().catch(() => null), 3500, null)
      : Promise.resolve(null),
  ]);

  let winner = serverVer;
  if (cloudVer) {
    if (!winner || parseVersionFloat(cloudVer) >= parseVersionFloat(winner)) {
      winner = cloudVer;
    }
  }

  if (winner && !hasDirtyGlobalVersion()) {
    setLocalGlobalVersion(winner, false);
  }
  return winner;
}

export async function syncGlobalVersionToServer(version: string): Promise<boolean> {
  const cleanVersion = setLocalGlobalVersion(version, true);
  let expressOk = false;

  try {
    const res = await fetch('/api/version', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ version: cleanVersion }),
    });
    if (res.status === 401) {
      handleUnauthorized();
    } else if (res.ok) {
      expressOk = true;
    }
  } catch {
    /* ignore */
  }

  if (expressOk) {
    setLocalGlobalVersion(cleanVersion, false);
    logServer(`Синхронізовано глобальну версію ${cleanVersion} із сервером`, { version: cleanVersion }, 'success');
    return true;
  }
  logServer(`Не вдалося оновити версію ${cleanVersion} на сервері (збережено локально)`, { version: cleanVersion }, 'warn');
  return false;
}

const inFlightSaves = new Map<string, Promise<boolean>>();
const queuedLatestTrees = new Map<string, FamilyTreeData>();

export async function postTreeToServer(
  enriched: FamilyTreeData,
  isMainTree: boolean,
  keepalive = false
): Promise<boolean> {
  const endpoint = isMainTree ? '/api/tree' : `/api/tree/${encodeURIComponent(enriched.id)}`;
  const serialized = JSON.stringify(enriched);
  const canKeepalive = keepalive && serialized.length < 60 * 1024;

  let expressOk = false;
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: serialized,
      keepalive: canKeepalive,
    });

    if (res.status === 401) {
      handleUnauthorized();
    } else if (!res.ok) {
      logError('server', `Сервер повернув код ${res.status} при синхронізації полотна "${enriched.title}"`, {
        endpoint,
        status: res.status,
      });
    } else {
      expressOk = true;
      invalidateTreeListCaches();
      logServer(
        `Успішно синхронізовано полотно "${enriched.title}" із сервером (${Object.keys(enriched.persons || {}).length} осіб, версія: ${enriched.version || 'v0.1'})`,
        { endpoint, treeId: enriched.id },
        'success'
      );
    }
  } catch (err) {
    logError('server', `Мережева помилка при синхронізації з сервером API`, {
      error: String(err),
      treeId: enriched.id,
    });
  }

  markTreeDirty(enriched.id, !expressOk);
  return expressOk;
}

export async function syncTreeToServer(
  tree: FamilyTreeData,
  options?: { keepalive?: boolean }
): Promise<boolean> {
  const stamped: FamilyTreeData = {
    ...tree,
    updatedAt: tree.updatedAt || new Date().toISOString(),
  };

  const { enriched: fallbackEnriched } = enrichTreeForSave(stamped);
  const savedLocally = saveTreeLocally(stamped, true);
  const enriched = savedLocally || fallbackEnriched;

  const { isMainTree } = normalizeTreeId(enriched.id);

  if (options?.keepalive) {
    return postTreeToServer(enriched, isMainTree, true);
  }

  if (inFlightSaves.has(enriched.id)) {
    queuedLatestTrees.set(enriched.id, enriched);
    return inFlightSaves.get(enriched.id)!;
  }

  const runLoop = (async () => {
    let latestToSend: FamilyTreeData | undefined = enriched;
    let lastResult = false;

    while (latestToSend) {
      const current = latestToSend;
      queuedLatestTrees.delete(enriched.id);
      const { isMainTree: currentIsMain } = normalizeTreeId(current.id);
      lastResult = await postTreeToServer(current, currentIsMain, false);
      latestToSend = queuedLatestTrees.get(enriched.id);
    }

    return lastResult;
  })();

  inFlightSaves.set(enriched.id, runLoop);
  try {
    return await runLoop;
  } finally {
    inFlightSaves.delete(enriched.id);
  }
}

export async function syncTreeToCloudAndServer(tree: FamilyTreeData): Promise<boolean> {
  return syncTreeToServer(tree);
}

export async function syncPendingDirtyTrees(): Promise<number> {
  if (!getAuthToken()) return 0;

  if (hasDirtyGlobalVersion()) {
    const dirtyVer = getLocalGlobalVersion();
    if (dirtyVer) {
      await syncGlobalVersionToServer(dirtyVer);
    }
  }

  const dirtyIds = Array.from(getDirtyTreeIds());
  if (dirtyIds.length === 0) return 0;

  let syncedCount = 0;
  for (const id of dirtyIds) {
    try {
      const { targetId, isMainTree } = normalizeTreeId(id);
      const raw = readLocalTreeRaw(targetId, isMainTree);
      if (!raw) {
        markTreeDirty(targetId, false);
        continue;
      }
      const localTree = JSON.parse(raw) as FamilyTreeData;
      const ok = await syncTreeToServer(localTree);
      if (ok) syncedCount += 1;
    } catch {
      /* keep dirty for next retry */
    }
  }
  return syncedCount;
}

export async function checkServerHealth(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const res = await fetch('/api/health', { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return false;
    const json = await res.json();
    return Boolean(json && json.success);
  } catch {
    return false;
  }
}

export async function fetchServerTreeMeta(treeId: string): Promise<ServerTreeMeta | null> {
  try {
    const { targetId, isMainTree } = normalizeTreeId(treeId);
    const endpoint = isMainTree ? '/api/tree/meta' : `/api/tree/${encodeURIComponent(targetId)}/meta`;
    const res = await fetchWithTimeout(endpoint, {}, 4000);
    if (!res.ok) return null;
    const json = await res.json();
    if (json?.success && json?.meta) {
      return json.meta as ServerTreeMeta;
    }
  } catch {
    /* ignore transient polling errors */
  }
  return null;
}

export async function loadTreeById(
  treeId: string,
  options?: { allowEmpty?: boolean; pushLocalIfNewer?: boolean; preferServer?: boolean; includeCloud?: boolean }
): Promise<FamilyTreeData | null> {
  const { targetId, isMainTree } = normalizeTreeId(treeId);

  const localTree = readLocalTreeCandidate(targetId, isMainTree, Boolean(options?.allowEmpty));

  const [serverTree, firestoreTree] = await Promise.all([
    (async (): Promise<FamilyTreeData | null> => {
      try {
        const endpoint = isMainTree ? '/api/tree' : `/api/tree/${encodeURIComponent(targetId)}`;
        const res = await fetchWithTimeout(endpoint, {}, 4000);
        if (res.ok) {
          const json = await res.json();
          if (json?.success && json?.data?.persons && typeof json.data.persons === 'object') {
            if (Object.keys(json.data.persons).length > 0 || options?.allowEmpty) {
              return json.data as FamilyTreeData;
            }
          }
        }
      } catch (err) {
        console.warn(`Server fetch failed for ${targetId}:`, err);
      }
      return null;
    })(),
    options?.includeCloud
      ? withTimeout(
          (async (): Promise<FamilyTreeData | null> => {
            try {
              const cloud = await getTreeByIdFromFirestore(targetId);
              if (cloud && cloud.persons && typeof cloud.persons === 'object') {
                if (Object.keys(cloud.persons).length > 0 || options?.allowEmpty) {
                  return cloud;
                }
              }
            } catch (err) {
              console.warn(`Firestore fetch failed for ${targetId}:`, err);
            }
            return null;
          })(),
          4000,
          null
        )
      : Promise.resolve(null),
  ]);

  const isLocalDirty = getDirtyTreeIds().has(targetId);
  const remoteWinner = pickNewestTreeData(firestoreTree, serverTree) || firestoreTree || serverTree;

  let winner =
    options?.preferServer && !isLocalDirty && remoteWinner
      ? remoteWinner
      : pickNewestTreeData(firestoreTree, serverTree, localTree);

  if (!winner && options?.allowEmpty) {
    winner = firestoreTree || serverTree || localTree || null;
  }
  if (!winner) return null;

  const effectiveGlobalVersion = hasDirtyGlobalVersion()
    ? getLocalGlobalVersion()
    : firestoreTree?.version || serverTree?.version || getLocalGlobalVersion();
  if (effectiveGlobalVersion && winner.version !== effectiveGlobalVersion) {
    winner = { ...winner, version: effectiveGlobalVersion };
  }

  if (winner === firestoreTree || winner === serverTree || (remoteWinner && !isLocalDirty && options?.preferServer)) {
    saveTreeLocally(winner, false);
    if (isLocalDirty) {
      markTreeDirty(targetId, false);
    }
    if (winner === firestoreTree && getAuthToken()) {
      const fsTime = parseTimestamp(firestoreTree.updatedAt || firestoreTree.createdAt);
      const srvTime = parseTimestamp(serverTree?.updatedAt || serverTree?.createdAt);
      if (!serverTree || fsTime > srvTime + 1000) {
        void postTreeToServer(winner, isMainTree, false);
      }
    }
  } else if (winner === localTree && (options?.pushLocalIfNewer || isLocalDirty) && getAuthToken()) {
    const remoteTime = parseTimestamp(remoteWinner?.updatedAt || remoteWinner?.createdAt);
    const localTime = parseTimestamp(localTree?.updatedAt || localTree?.createdAt);
    if (!remoteWinner || localTime > remoteTime + 1000 || isLocalDirty) {
      void syncTreeToServer(localTree);
    }
  }

  if (winner) {
    void restoreMissingMediaFromFirestore([winner]);
  }

  return winner;
}

export async function loadTreeFromServerOrStorage(options?: {
  pushLocalIfNewer?: boolean;
  includeCloud?: boolean;
}): Promise<FamilyTreeData | null> {
  return loadTreeById(MAIN_TREE_ID, options);
}

export function syncCrossCanvasLinkTitles(
  treeData: FamilyTreeData,
  availableTrees: Array<{ id: string; title: string }>
): FamilyTreeData {
  if (!treeData || !treeData.persons || Object.keys(treeData.persons).length === 0) {
    return treeData;
  }

  const titleMap = new Map<string, string>();
  availableTrees.forEach((t) => {
    if (t.id && t.title) {
      titleMap.set(t.id, t.title);
      if (t.id === MAIN_TREE_ID || t.id === 'main-tree' || t.id === 'default-tree') {
        titleMap.set(MAIN_TREE_ID, t.title);
        titleMap.set('main-tree', t.title);
        titleMap.set('default-tree', t.title);
      }
    }
  });

  let changed = false;
  const updatedPersons: Record<string, Person> = { ...treeData.persons };

  Object.keys(updatedPersons).forEach((personId) => {
    const p = updatedPersons[personId];
    if (!p) return;
    let personChanged = false;
    let nextPerson = p;

    if (p.targetCanvasId) {
      const latestTitle = titleMap.get(p.targetCanvasId);
      if (latestTitle && p.targetCanvasTitle !== latestTitle) {
        nextPerson = {
          ...nextPerson,
          targetCanvasTitle: latestTitle,
        };
        personChanged = true;
      }
    }

    if (p.crossCanvasLinks && p.crossCanvasLinks.length > 0) {
      let linksChanged = false;
      const nextLinks = p.crossCanvasLinks.map((link) => {
        const latestTitle = titleMap.get(link.targetCanvasId);
        if (latestTitle && link.targetCanvasTitle !== latestTitle) {
          linksChanged = true;
          return { ...link, targetCanvasTitle: latestTitle };
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
      updatedPersons[personId] = nextPerson;
      changed = true;
    }
  });

  if (!changed) return treeData;
  return {
    ...treeData,
    persons: updatedPersons,
  };
}

export async function fetchServerTrees(options?: { includeCloud?: boolean }): Promise<LocalTreeIndexItem[]> {
  const cacheKey = options?.includeCloud ? 'cloud' : 'local';
  const cached = treesListCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.data;
  }

  const inflight = inflightTreesList.get(cacheKey);
  if (inflight) return inflight;

  const task = (async () => {
    const byId = new Map<string, LocalTreeIndexItem>();

    const [expressList, cloudList] = await Promise.all([
      (async (): Promise<LocalTreeIndexItem[]> => {
        try {
          const res = await fetchWithTimeout('/api/trees', {}, 4000);
          if (res.ok) {
            const json = await res.json();
            if (json && json.success && Array.isArray(json.trees)) {
              return json.trees as LocalTreeIndexItem[];
            }
          }
        } catch (err) {
          console.warn('Failed to fetch trees list from server:', err);
        }
        return [];
      })(),
      options?.includeCloud
        ? withTimeout(
            getUserTreesFromFirestore().catch(() => []),
            4000,
            [] as Awaited<ReturnType<typeof getUserTreesFromFirestore>>
          )
        : Promise.resolve([]),
    ]);

    const deletedSet = new Set(getDeletedTreesForFirebase());

    expressList.forEach((item) => {
      const { targetId, isMainTree } = normalizeTreeId(item.id);
      if (deletedSet.has(targetId)) return;
      byId.set(targetId, { ...item, id: targetId, isMain: isMainTree });
    });

    cloudList.forEach((item) => {
      const { targetId, isMainTree } = normalizeTreeId(item.id);
      if (deletedSet.has(targetId)) return;
      const existing = byId.get(targetId);
      const cloudTime = parseTimestamp(item.updatedAt);
      const existingTime = existing ? parseTimestamp(existing.updatedAt) : -1;
      if (!existing || cloudTime >= existingTime) {
        byId.set(targetId, {
          id: targetId,
          title: item.title,
          personCount: item.personCount || 0,
          updatedAt: item.updatedAt,
          isMain: isMainTree,
        });
      }
    });

    const list = Array.from(byId.values());
    treesListCache.set(cacheKey, { ts: Date.now(), data: list });
    return list;
  })();

  inflightTreesList.set(cacheKey, task);
  try {
    return await task;
  } finally {
    inflightTreesList.delete(cacheKey);
  }
}

export async function fetchAllTreesSearchIndex(options?: {
  includeCloud?: boolean;
}): Promise<CrossCanvasSearchTree[]> {
  const cacheKey = options?.includeCloud ? 'cloud' : 'local';
  const cached = searchIndexCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.data;
  }

  const inflight = inflightSearchIndex.get(cacheKey);
  if (inflight) return inflight;

  const task = (async () => {
    const byTreeId = new Map<string, CrossCanvasSearchTree>();

    try {
      const readLocalTree = (raw: string | null, fallbackId?: string) => {
        if (!raw) return;
        const parsed = JSON.parse(raw) as FamilyTreeData;
        if (!parsed || !parsed.persons || typeof parsed.persons !== 'object') return;
        const { targetId, isMainTree } = normalizeTreeId(parsed.id || fallbackId);
        const persons = Object.values(parsed.persons).filter(Boolean);
        const existing = byTreeId.get(targetId);
        const nextTime = parseTimestamp(parsed.updatedAt || parsed.createdAt);
        const existingTime = existing ? parseTimestamp(existing.updatedAt) : -1;
        if (!existing || nextTime >= existingTime) {
          byTreeId.set(targetId, {
            treeId: targetId,
            treeTitle: parsed.title || (isMainTree ? 'Головне родове дерево' : 'Родове полотно'),
            isMain: isMainTree,
            updatedAt: parsed.updatedAt || '',
            persons,
          });
        }
      };

      readLocalTree(readLocalTreeRaw(MAIN_TREE_ID, true), MAIN_TREE_ID);
      const rawIndex = localStorage.getItem('rodovid_local_trees_index');
      if (rawIndex) {
        const indexList: LocalTreeIndexItem[] = JSON.parse(rawIndex);
        if (Array.isArray(indexList)) {
          indexList.forEach((item) => {
            if (item?.id) {
              readLocalTree(localStorage.getItem(`rodovid_tree_${item.id}`), item.id);
            }
          });
        }
      }
    } catch {
      /* ignore localStorage parse errors */
    }

    try {
      const [expressJson, cloudTrees] = await Promise.all([
        (async () => {
          try {
            const res = await fetchWithTimeout('/api/trees/search-index', {}, 4500);
            if (res.ok) return await res.json();
          } catch (err) {
            console.warn('Failed to fetch cross-canvas search index:', err);
          }
          return null;
        })(),
        options?.includeCloud
          ? withTimeout(
              fetchAllTreesFromFirestore().catch(() => [] as FamilyTreeData[]),
              4500,
              [] as FamilyTreeData[]
            )
          : Promise.resolve([] as FamilyTreeData[]),
      ]);

      const dirtySet = getDirtyTreeIds();
      const deletedSet = new Set(getDeletedTreesForFirebase());
      const expressUpdatedMap = new Map<string, number>();

      if (expressJson?.success && Array.isArray(expressJson.trees)) {
        for (const item of expressJson.trees as CrossCanvasSearchTree[]) {
          const { targetId, isMainTree } = normalizeTreeId(item.treeId);
          if (deletedSet.has(targetId)) continue;
          const serverTime = parseTimestamp(item.updatedAt);
          expressUpdatedMap.set(targetId, serverTime);
          const existing = byTreeId.get(targetId);
          const existingTime = existing ? parseTimestamp(existing.updatedAt) : -1;
          const isDirty = dirtySet.has(targetId);
          if (!existing || (!isDirty && serverTime >= existingTime)) {
            byTreeId.set(targetId, {
              treeId: targetId,
              treeTitle: item.treeTitle || (isMainTree ? 'Головне родове дерево' : 'Родове полотно'),
              isMain: isMainTree,
              updatedAt: item.updatedAt || '',
              persons: Array.isArray(item.persons) ? item.persons : [],
            });
          }
        }
      }

      const hasAdminToken = Boolean(getAuthToken());
      for (const cloudTree of cloudTrees) {
        const { targetId, isMainTree } = normalizeTreeId(cloudTree.id);
        if (deletedSet.has(targetId)) continue;
        const existing = byTreeId.get(targetId);
        const cloudTime = parseTimestamp(cloudTree.updatedAt || cloudTree.createdAt);
        const existingTime = existing ? parseTimestamp(existing.updatedAt) : -1;
        const isDirty = dirtySet.has(targetId);
        if (!existing || (!isDirty && cloudTime > existingTime + 1000)) {
          const normalizedCloud: FamilyTreeData = { ...cloudTree, id: targetId };
          byTreeId.set(targetId, {
            treeId: targetId,
            treeTitle: normalizedCloud.title || (isMainTree ? 'Головне родове дерево' : 'Родове полотно'),
            isMain: isMainTree,
            updatedAt: normalizedCloud.updatedAt || '',
            persons: Object.values(normalizedCloud.persons || {}).filter(Boolean),
          });
          // Hydrate cloud canvas locally and onto Express after a site redeploy so cross-canvas links survive
          saveTreeLocally(normalizedCloud, false);
          if (hasAdminToken) {
            const expressTime = expressUpdatedMap.get(targetId) ?? -1;
            if (expressTime < 0 || cloudTime > expressTime + 1000) {
              void postTreeToServer(normalizedCloud, isMainTree, false);
            }
          }
        }
      }
    } catch (err) {
      console.warn('Failed to merge cross-canvas search index:', err);
    }

    const deletedSetFinal = new Set(getDeletedTreesForFirebase());
    const result = Array.from(byTreeId.values()).filter((t) => !deletedSetFinal.has(t.treeId));
    searchIndexCache.set(cacheKey, { ts: Date.now(), data: result });
    return result;
  })();

  inflightSearchIndex.set(cacheKey, task);
  try {
    return await task;
  } finally {
    inflightSearchIndex.delete(cacheKey);
  }
}

export async function deleteTreeFromServerOrStorage(treeId: string): Promise<boolean> {
  const { targetId, isMainTree } = normalizeTreeId(treeId);
  if (isMainTree) return false;

  try {
    localStorage.removeItem(`rodovid_tree_${targetId}`);
    markTreeDirty(targetId, false);
    trackDeletedTreeForFirebase(targetId, true);
    const rawIndex = localStorage.getItem('rodovid_local_trees_index');
    if (rawIndex) {
      const list: LocalTreeIndexItem[] = JSON.parse(rawIndex);
      if (Array.isArray(list)) {
        const filtered = list.filter((t) => normalizeTreeId(t.id).targetId !== targetId);
        localStorage.setItem('rodovid_local_trees_index', JSON.stringify(filtered));
      }
    }
    const rawOrder = localStorage.getItem('rodovid_canvas_tab_order');
    if (rawOrder) {
      const orderedIds: string[] = JSON.parse(rawOrder);
      if (Array.isArray(orderedIds)) {
        localStorage.setItem(
          'rodovid_canvas_tab_order',
          JSON.stringify(orderedIds.filter((id) => normalizeTreeId(id).targetId !== targetId))
        );
      }
    }
  } catch (err) {
    console.warn('Failed to remove tree from local storage:', err);
  }

  invalidateTreeListCaches();

  let serverOk = true;
  try {
    const res = await fetch(`/api/tree/${encodeURIComponent(targetId)}`, {
      method: 'DELETE',
      headers: { ...authHeaders() },
    });
    if (res.status === 401) {
      handleUnauthorized();
      logError('server', `Немає прав адміністратора для видалення полотна ${targetId}`, { treeId: targetId });
      return false;
    } else if (res.ok || res.status === 404) {
      serverOk = true;
      logServer(`Видалено полотно ${targetId} на сервері`, { treeId: targetId, status: res.status }, 'success');
    } else {
      serverOk = false;
      logError('server', `Сервер повернув код ${res.status} при видаленні полотна ${targetId}`, {
        treeId: targetId,
        status: res.status,
      });
    }
  } catch (err) {
    console.warn('Failed to delete tree from server:', err);
    logServer(`Сервер недоступний: полотно ${targetId} видалено локально`, {
      treeId: targetId,
      error: String(err),
    }, 'warn');
  }

  if (isCloudWriteAuthenticated()) {
    try {
      await deleteTreeFromFirestore(targetId);
      trackDeletedTreeForFirebase(targetId, false);
    } catch (err) {
      logError('database', `Помилка видалення полотна ${targetId} у Firebase`, {
        treeId: targetId,
        error: String(err),
      });
    }
  }

  invalidateTreeListCaches();
  notifyTreesChanged();
  return serverOk;
}

export async function renameTreeOnServerOrStorage(treeId: string, newTitle: string): Promise<boolean> {
  const { targetId, isMainTree } = normalizeTreeId(treeId);
  if (isMainTree || !newTitle.trim()) return false;
  const cleanTitle = newTitle.trim();

  try {
    const rawTree = localStorage.getItem(`rodovid_tree_${targetId}`);
    if (rawTree) {
      const parsed = JSON.parse(rawTree);
      parsed.title = cleanTitle;
      parsed.updatedAt = new Date().toISOString();
      localStorage.setItem(`rodovid_tree_${targetId}`, JSON.stringify(parsed));
    }

    const rawIndex = localStorage.getItem('rodovid_local_trees_index');
    if (rawIndex) {
      const list: LocalTreeIndexItem[] = JSON.parse(rawIndex);
      const updated = list.map((t) =>
        t.id === targetId ? { ...t, title: cleanTitle, updatedAt: new Date().toISOString() } : t
      );
      localStorage.setItem('rodovid_local_trees_index', JSON.stringify(updated));
    }
  } catch (err) {
    console.warn('Failed to update renamed tree in local storage:', err);
  }

  let serverOk = false;
  try {
    const res = await fetch(`/api/tree/${encodeURIComponent(targetId)}/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ title: cleanTitle }),
    });
    if (res.status === 401) {
      handleUnauthorized();
    } else {
      serverOk = res.ok;
      if (serverOk) {
        invalidateTreeListCaches();
        notifyTreesChanged();
        logServer(`Перейменовано полотно ${targetId} на «${cleanTitle}»`, {
          treeId: targetId,
          title: cleanTitle,
        }, 'success');
      }
    }
  } catch (err) {
    console.warn('Failed to rename tree on server:', err);
    logError('server', `Помилка перейменування полотна ${targetId} на сервері`, {
      treeId: targetId,
      error: String(err),
    });
  }

  return serverOk;
}

export async function submitGuestSuggestionToServer(
  treeId: string | undefined,
  payload:
    | {
        kind: 'note';
        personId: string;
        suggestion: GuestSuggestion;
      }
    | {
        kind: 'proposal-card';
        proposalPerson: Person;
        targetPersonId: string;
        linkedAsChildOf: string[];
        linkedAsParentOf: string[];
        linkedAsSpouseOf: string[];
        linkedAsSiblingOf: string[];
        connectionOverridesPatch?: Record<string, ConnectionMeta>;
      }
): Promise<{ ok: boolean; updatedAt?: string; error?: string }> {
  const { targetId } = normalizeTreeId(treeId);
  try {
    const res = await fetch(`/api/tree/${encodeURIComponent(targetId)}/guest-suggestion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) {
      return { ok: false, error: json?.error || `Помилка сервера (${res.status})` };
    }
    invalidateTreeListCaches();
    return { ok: true, updatedAt: json.updatedAt };
  } catch (err) {
    return { ok: false, error: (err as Error)?.message || 'Немає зв’язку із сервером' };
  }
}

export interface GuestCustomizePayload {
  personId: string;
  avatarUrl?: string | null;
  cardBgColor?: string | null;
  cardFrame?: CardFrameStyle | null;
}

export interface GuestCustomizeResponse {
  ok: boolean;
  updatedAt?: string;
  personPatch?: {
    avatarUrl?: string;
    cardBgColor?: string;
    cardFrame?: CardFrameStyle;
    selfCustomizedAt?: string;
  };
  error?: string;
}

export async function submitGuestCustomizeToServer(
  treeId: string | undefined,
  payload: GuestCustomizePayload
): Promise<GuestCustomizeResponse> {
  const { targetId } = normalizeTreeId(treeId);
  try {
    const res = await fetch(`/api/tree/${encodeURIComponent(targetId)}/guest-customize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) {
      return { ok: false, error: json?.error || `Помилка сервера (${res.status})` };
    }
    invalidateTreeListCaches();
    return {
      ok: true,
      updatedAt: json.updatedAt,
      personPatch: json.personPatch,
    };
  } catch (err) {
    return { ok: false, error: (err as Error)?.message || 'Немає зв’язку із сервером' };
  }
}
