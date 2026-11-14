import {
  CardFrameStyle,
  ConnectionMeta,
  FamilyTreeData,
  GuestSuggestion,
  Person,
} from '../types/tree';
import {
  deleteTreeFromFirestore,
  fetchAllTreesFromFirestore,
  fetchGlobalVersionFromFirestore,
  getTreeById as getTreeByIdFromFirestore,
  getUserTrees as getUserTreesFromFirestore,
  isCloudWriteAuthenticated,
  renameTreeInFirestore,
  saveGlobalVersionToFirestore,
  saveTreeToFirestore,
} from './firestoreTreeService';
import { restoreMissingMediaFromFirestore } from './mediaSync';
import {
  MAIN_TREE_ID,
  LocalTreeIndexItem,
  enrichTreeForSave,
  getDeletedTreesForFirebase,
  getDirtyTreeIds,
  getLocalGlobalVersion,
  hasDirtyGlobalVersion,
  markTreeDirty,
  normalizeTreeId,
  notifyTreesChanged,
  parseTimestamp,
  pickNewestTreeData,
  readLocalTreeCandidate,
  readLocalTreeRaw,
  saveTreeLocally,
  setLocalGlobalVersion,
  trackDeletedTreeForFirebase,
  withTimeout,
} from './localTreeStorage';
import { logDatabase, logError } from './logger';

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

function compareVersionStrings(a?: string | null, b?: string | null): number {
  const segs = (v?: string | null) =>
    (v || '')
      .replace(/^v/i, '')
      .split('.')
      .map((s) => {
        const n = parseInt(s.replace(/[^0-9]/g, ''), 10);
        return Number.isFinite(n) ? n : 0;
      });
  const sa = segs(a);
  const sb = segs(b);
  const len = Math.max(sa.length, sb.length);
  for (let i = 0; i < len; i++) {
    const da = sa[i] ?? 0;
    const db = sb[i] ?? 0;
    if (da !== db) return da - db;
  }
  return 0;
}

export async function fetchGlobalVersionFromServer(options?: { includeCloud?: boolean }): Promise<string | null> {
  const localVer = getLocalGlobalVersion();
  if (options?.includeCloud === false) {
    return localVer;
  }

  const cloudVer = await withTimeout(
    fetchGlobalVersionFromFirestore().catch(() => null),
    6000,
    null
  );

  let winner = localVer;
  if (cloudVer) {
    if (!winner || (!hasDirtyGlobalVersion() && compareVersionStrings(cloudVer, winner) >= 0)) {
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

  if (isCloudWriteAuthenticated()) {
    try {
      const ok = await saveGlobalVersionToFirestore(cleanVersion);
      if (ok) {
        setLocalGlobalVersion(cleanVersion, false);
        return true;
      }
    } catch {
      /* keep dirty flag for retry on next sync */
    }
  }

  return true;
}

export async function syncTreeToServer(
  tree: FamilyTreeData,
  _options?: { keepalive?: boolean }
): Promise<boolean> {
  const stamped: FamilyTreeData = {
    ...tree,
    updatedAt: tree.updatedAt || new Date().toISOString(),
  };

  const savedLocally = saveTreeLocally(stamped, false);
  invalidateTreeListCaches();
  return Boolean(savedLocally);
}

export async function syncTreeToCloudAndServer(tree: FamilyTreeData): Promise<boolean> {
  const localOk = await syncTreeToServer(tree);
  if (isCloudWriteAuthenticated()) {
    const { enriched } = enrichTreeForSave(tree);
    const cloudOk = await saveTreeToFirestore(enriched.id, enriched, undefined, undefined, true).catch(() => false);
    if (cloudOk) {
      markTreeDirty(enriched.id, false);
    }
  }
  return localOk;
}

export async function syncPendingDirtyTrees(): Promise<number> {
  if (!isCloudWriteAuthenticated()) return 0;

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
      const ok = await saveTreeToFirestore(targetId, localTree, undefined, undefined, true);
      if (ok) {
        markTreeDirty(targetId, false);
        syncedCount += 1;
      }
    } catch {
      /* keep dirty for next retry */
    }
  }
  return syncedCount;
}

export async function checkServerHealth(): Promise<boolean> {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

export async function loadTreeById(
  treeId: string,
  options?: {
    allowEmpty?: boolean;
    pushLocalIfNewer?: boolean;
    preferServer?: boolean;
    forceRemote?: boolean;
    includeCloud?: boolean;
  }
): Promise<FamilyTreeData | null> {
  const { targetId, isMainTree } = normalizeTreeId(treeId);

  const localTree = readLocalTreeCandidate(targetId, isMainTree, Boolean(options?.allowEmpty));

  const firestoreTree =
    options?.includeCloud !== false
      ? await withTimeout(
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
          8000,
          null
        )
      : null;

  const isLocalDirty = getDirtyTreeIds().has(targetId);

  let winner: FamilyTreeData | null = null;
  if (options?.forceRemote && firestoreTree) {
    winner = firestoreTree;
  } else {
    const newestOverall = pickNewestTreeData(firestoreTree, localTree);
    if (options?.preferServer && !isLocalDirty && firestoreTree) {
      const localTime = parseTimestamp(localTree?.updatedAt || localTree?.createdAt);
      const remoteTime = parseTimestamp(firestoreTree.updatedAt || firestoreTree.createdAt);
      // Only prefer cloud when local is NOT strictly newer (> 1s)
      winner = localTree && localTime > remoteTime + 1000 ? newestOverall : firestoreTree;
    } else {
      winner = newestOverall;
    }
  }

  if (!winner && options?.allowEmpty) {
    winner = firestoreTree || localTree || null;
  }
  if (!winner) return null;

  const effectiveGlobalVersion = hasDirtyGlobalVersion()
    ? getLocalGlobalVersion()
    : winner === localTree
    ? localTree?.version || getLocalGlobalVersion() || firestoreTree?.version
    : firestoreTree?.version || getLocalGlobalVersion();
  if (effectiveGlobalVersion && winner.version !== effectiveGlobalVersion) {
    winner = { ...winner, version: effectiveGlobalVersion };
  }

  if (winner === firestoreTree || (options?.forceRemote && firestoreTree)) {
    saveTreeLocally(winner, false);
    if (isLocalDirty) {
      markTreeDirty(targetId, false);
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
    const deletedSet = new Set(getDeletedTreesForFirebase());

    try {
      const mainRaw = readLocalTreeRaw(MAIN_TREE_ID, true);
      if (mainRaw) {
        const mainParsed = JSON.parse(mainRaw) as FamilyTreeData;
        if (mainParsed && mainParsed.persons) {
          byId.set(MAIN_TREE_ID, {
            id: MAIN_TREE_ID,
            title: mainParsed.title || 'Головне родове дерево',
            personCount: Object.keys(mainParsed.persons || {}).length,
            updatedAt: mainParsed.updatedAt || mainParsed.createdAt || new Date().toISOString(),
            isMain: true,
          });
        }
      }

      const rawIndex = localStorage.getItem('rodovid_local_trees_index');
      if (rawIndex) {
        const indexList: LocalTreeIndexItem[] = JSON.parse(rawIndex);
        if (Array.isArray(indexList)) {
          indexList.forEach((item) => {
            if (!item?.id) return;
            const { targetId, isMainTree } = normalizeTreeId(item.id);
            if (deletedSet.has(targetId)) return;
            const existing = byId.get(targetId);
            const itemTime = parseTimestamp(item.updatedAt);
            const existingTime = existing ? parseTimestamp(existing.updatedAt) : -1;
            if (!existing || itemTime >= existingTime) {
              byId.set(targetId, {
                id: targetId,
                title: item.title || (isMainTree ? 'Головне родове дерево' : 'Родове полотно'),
                personCount: item.personCount || 0,
                updatedAt: item.updatedAt,
                isMain: isMainTree,
              });
            }
          });
        }
      }
    } catch {
      /* ignore localStorage read errors */
    }

    if (options?.includeCloud) {
      const cloudList = await withTimeout(
        getUserTreesFromFirestore().catch(() => []),
        4500,
        [] as Awaited<ReturnType<typeof getUserTreesFromFirestore>>
      );

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
    }

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

    if (options?.includeCloud) {
      try {
        const cloudTrees = await withTimeout(
          fetchAllTreesFromFirestore().catch(() => [] as FamilyTreeData[]),
          5000,
          [] as FamilyTreeData[]
        );

        const dirtySet = getDirtyTreeIds();
        const deletedSet = new Set(getDeletedTreesForFirebase());

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
            saveTreeLocally(normalizedCloud, false);
          }
        }
      } catch (err) {
        console.warn('Failed to merge cross-canvas search index from Firestore:', err);
      }
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
  return true;
}

export async function renameTreeOnServerOrStorage(treeId: string, newTitle: string): Promise<boolean> {
  const { targetId, isMainTree } = normalizeTreeId(treeId);
  if (isMainTree || !newTitle.trim()) return false;
  const cleanTitle = newTitle.trim();
  const nowIso = new Date().toISOString();

  try {
    const rawTree = localStorage.getItem(`rodovid_tree_${targetId}`);
    if (rawTree) {
      const parsed = JSON.parse(rawTree);
      parsed.title = cleanTitle;
      parsed.updatedAt = nowIso;
      localStorage.setItem(`rodovid_tree_${targetId}`, JSON.stringify(parsed));
    }

    const rawIndex = localStorage.getItem('rodovid_local_trees_index');
    if (rawIndex) {
      const list: LocalTreeIndexItem[] = JSON.parse(rawIndex);
      const updated = list.map((t) =>
        t.id === targetId ? { ...t, title: cleanTitle, updatedAt: nowIso } : t
      );
      localStorage.setItem('rodovid_local_trees_index', JSON.stringify(updated));
    }
  } catch (err) {
    console.warn('Failed to update renamed tree in local storage:', err);
    return false;
  }

  if (isCloudWriteAuthenticated()) {
    try {
      await renameTreeInFirestore(targetId, cleanTitle);
      logDatabase(`Перейменовано полотно ${targetId} у Firebase на «${cleanTitle}»`, {
        treeId: targetId,
        title: cleanTitle,
      });
    } catch (err) {
      logError('database', `Помилка перейменування полотна ${targetId} у Firebase`, {
        treeId: targetId,
        error: String(err),
      });
    }
  }

  invalidateTreeListCaches();
  notifyTreesChanged();
  return true;
}

export async function submitGuestSuggestionToServer(
  _treeId: string | undefined,
  _payload:
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
): Promise<{ ok: boolean; localOnly?: boolean; updatedAt?: string; error?: string }> {
  return { ok: true, localOnly: true, updatedAt: new Date().toISOString() };
}

export interface GuestCustomizePayload {
  personId: string;
  avatarUrl?: string | null;
  cardBgColor?: string | null;
  cardFrame?: CardFrameStyle | null;
}

export interface GuestCustomizeResponse {
  ok: boolean;
  localOnly?: boolean;
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
  _treeId: string | undefined,
  payload: GuestCustomizePayload
): Promise<GuestCustomizeResponse> {
  const nowIso = new Date().toISOString();
  return {
    ok: true,
    localOnly: true,
    updatedAt: nowIso,
    personPatch: {
      avatarUrl: payload.avatarUrl || undefined,
      cardBgColor: payload.cardBgColor || undefined,
      cardFrame: payload.cardFrame && payload.cardFrame !== 'none' ? payload.cardFrame : undefined,
      selfCustomizedAt: nowIso,
    },
  };
}
