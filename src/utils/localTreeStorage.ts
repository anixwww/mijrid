import { FamilyTreeData } from '../types/tree';
import { parseGedcomText, parseCsvText } from './gedcomParser';
import { logTree } from './logger';

export const LEGACY_MAIN_STORAGE_KEY = 'rodovid_family_tree_v2';
export const MAIN_TREE_ID = 'my-family-tree';

const DIRTY_TREES_KEY = 'rodovid_dirty_trees';
const GLOBAL_VERSION_KEY = 'rodovid_global_version';
const GLOBAL_VERSION_DIRTY_KEY = 'rodovid_global_version_dirty';
const FIREBASE_UNSYNCED_KEY = 'rodovid_firebase_unsynced';
const LAST_FIREBASE_SYNC_KEY = 'rodovid_last_firebase_sync';
const DELETED_TREES_FOR_FIREBASE_KEY = 'rodovid_deleted_trees_for_firebase';

export const TREES_CHANGED_EVENT = 'rodovid:trees-changed';

export function notifyTreesChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(TREES_CHANGED_EVENT));
  }
}

export interface LocalTreeIndexItem {
  id: string;
  title: string;
  personCount: number;
  updatedAt: string;
  isMain?: boolean;
}

export interface ServerTreeMeta {
  id: string;
  title: string;
  version: string;
  updatedAt: string;
  personCount: number;
}

export function normalizeTreeId(treeId?: string): { targetId: string; isMainTree: boolean } {
  const raw = treeId || MAIN_TREE_ID;
  const isMainTree = raw === MAIN_TREE_ID || raw === 'default-tree' || raw === 'main-tree';
  return {
    targetId: isMainTree ? MAIN_TREE_ID : raw,
    isMainTree,
  };
}

export function hasUnsyncedFirebaseChangesStorage(): boolean {
  try {
    return localStorage.getItem(FIREBASE_UNSYNCED_KEY) === '1';
  } catch {
    return false;
  }
}

export function setUnsyncedFirebaseChangesStorage(unsynced: boolean): void {
  try {
    if (unsynced) {
      localStorage.setItem(FIREBASE_UNSYNCED_KEY, '1');
    } else {
      localStorage.removeItem(FIREBASE_UNSYNCED_KEY);
    }
  } catch {
    /* ignore storage errors */
  }
}

export function getLastFirebaseSyncTimeStorage(): Date | null {
  try {
    const raw = localStorage.getItem(LAST_FIREBASE_SYNC_KEY);
    if (!raw) return null;
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

export function setLastFirebaseSyncTimeStorage(date: Date | null): void {
  try {
    if (date) {
      localStorage.setItem(LAST_FIREBASE_SYNC_KEY, date.toISOString());
    } else {
      localStorage.removeItem(LAST_FIREBASE_SYNC_KEY);
    }
  } catch {
    /* ignore storage errors */
  }
}

export function getDeletedTreesForFirebase(): string[] {
  try {
    const raw = localStorage.getItem(DELETED_TREES_FOR_FIREBASE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function trackDeletedTreeForFirebase(treeId: string, deleted: boolean): void {
  try {
    const { targetId, isMainTree } = normalizeTreeId(treeId);
    if (isMainTree) return;
    const current = new Set(getDeletedTreesForFirebase());
    if (deleted) {
      current.add(targetId);
    } else {
      current.delete(targetId);
    }
    if (current.size === 0) {
      localStorage.removeItem(DELETED_TREES_FOR_FIREBASE_KEY);
    } else {
      localStorage.setItem(DELETED_TREES_FOR_FIREBASE_KEY, JSON.stringify(Array.from(current)));
    }
  } catch {
    /* ignore storage errors */
  }
}

export function getDirtyTreeIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DIRTY_TREES_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.filter((x) => typeof x === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

export function markTreeDirty(treeId: string, dirty: boolean): void {
  try {
    const { targetId } = normalizeTreeId(treeId);
    const set = getDirtyTreeIds();
    if (dirty) {
      set.add(targetId);
    } else {
      set.delete(targetId);
    }
    localStorage.setItem(DIRTY_TREES_KEY, JSON.stringify(Array.from(set)));
  } catch {
    /* ignore storage quota errors */
  }
}

export function getLocalGlobalVersion(): string | null {
  try {
    const val = localStorage.getItem(GLOBAL_VERSION_KEY);
    return val && val.trim() ? val.trim() : null;
  } catch {
    return null;
  }
}

export function hasDirtyGlobalVersion(): boolean {
  try {
    return localStorage.getItem(GLOBAL_VERSION_DIRTY_KEY) === '1';
  } catch {
    return false;
  }
}

function patchCachedTreeVersionInStorage(storageKey: string, cleanVersion: string): void {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      parsed.version = cleanVersion;
      localStorage.setItem(storageKey, JSON.stringify(parsed));
    }
  } catch {
    /* ignore storage errors */
  }
}

export function setLocalGlobalVersion(version: string, dirty = false): string {
  const cleanVersion = version.trim() || 'v0.1';
  try {
    localStorage.setItem(GLOBAL_VERSION_KEY, cleanVersion);
    if (dirty) {
      localStorage.setItem(GLOBAL_VERSION_DIRTY_KEY, '1');
    } else {
      localStorage.removeItem(GLOBAL_VERSION_DIRTY_KEY);
    }

    patchCachedTreeVersionInStorage(`rodovid_tree_${MAIN_TREE_ID}`, cleanVersion);

    const rawIndex = localStorage.getItem('rodovid_local_trees_index');
    if (rawIndex) {
      const list: LocalTreeIndexItem[] = JSON.parse(rawIndex);
      if (Array.isArray(list)) {
        list.forEach((item) => {
          if (item?.id) {
            patchCachedTreeVersionInStorage(`rodovid_tree_${item.id}`, cleanVersion);
          }
        });
      }
    }
  } catch {
    /* ignore storage quota errors */
  }
  return cleanVersion;
}

export function parseVersionFloat(v?: string | null): number {
  if (!v) return 0;
  const num = parseFloat(v.replace(/[^0-9.]/g, ''));
  return Number.isFinite(num) ? num : 0;
}

export function parseTimestamp(dateStr?: string): number {
  if (!dateStr) return 0;
  const t = new Date(dateStr).getTime();
  return isNaN(t) ? 0 : t;
}

export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(fallback);
      }
    }, ms);
    promise.then(
      (val) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(val);
        }
      },
      () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(fallback);
        }
      }
    );
  });
}

export function enrichTreeForSave(tree: FamilyTreeData): { enriched: FamilyTreeData; isMainTree: boolean } {
  const { targetId, isMainTree } = normalizeTreeId(tree.id);
  const enriched: FamilyTreeData = {
    ...tree,
    id: targetId,
    title: tree.title || (isMainTree ? 'Головне родове дерево' : 'Родове полотно'),
    version: getLocalGlobalVersion() || tree.version || 'v0.1',
    updatedAt: tree.updatedAt || new Date().toISOString(),
  };
  return { enriched, isMainTree };
}

export function readLocalTreeRaw(targetId: string, isMainTree: boolean): string | null {
  try {
    const primary = localStorage.getItem(`rodovid_tree_${targetId}`);
    if (primary) return primary;
    if (isMainTree) {
      return localStorage.getItem(LEGACY_MAIN_STORAGE_KEY);
    }
  } catch {
    /* ignore storage errors */
  }
  return null;
}

export function readLocalTreeCandidate(
  targetId: string,
  isMainTree: boolean,
  allowEmpty = false
): FamilyTreeData | null {
  try {
    const raw = readLocalTreeRaw(targetId, isMainTree);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.persons && typeof parsed.persons === 'object') {
      if (Object.keys(parsed.persons).length > 0 || allowEmpty) {
        return parsed as FamilyTreeData;
      }
    }
  } catch {
    /* ignore parse errors */
  }
  return null;
}

/**
 * Saves tree data strictly locally to browser's localStorage (single canonical key per treeId).
 */
export function saveTreeLocally(tree: FamilyTreeData, markDirty = false): FamilyTreeData | null {
  const { enriched, isMainTree } = enrichTreeForSave(tree);
  const serialized = JSON.stringify(enriched);

  try {
    localStorage.setItem(`rodovid_tree_${enriched.id}`, serialized);
    if (isMainTree) {
      localStorage.removeItem(LEGACY_MAIN_STORAGE_KEY);
    }
  } catch (err) {
    console.warn('LocalStorage save failed for tree ID:', enriched.id, err);
    return null;
  }

  try {
    const rawIndex = localStorage.getItem('rodovid_local_trees_index');
    const list: LocalTreeIndexItem[] = rawIndex ? JSON.parse(rawIndex) : [];

    const existingIndex = list.findIndex((item) => item.id === enriched.id);
    const itemMeta: LocalTreeIndexItem = {
      id: enriched.id,
      title: enriched.title,
      personCount: Object.keys(enriched.persons || {}).length,
      updatedAt: enriched.updatedAt,
      isMain: isMainTree,
    };

    if (existingIndex >= 0) {
      list[existingIndex] = itemMeta;
    } else {
      list.unshift(itemMeta);
    }
    localStorage.setItem('rodovid_local_trees_index', JSON.stringify(list));
  } catch (err) {
    console.warn('Failed to update rodovid_local_trees_index:', err);
  }

  if (markDirty) {
    markTreeDirty(enriched.id, true);
  }
  trackDeletedTreeForFirebase(enriched.id, false);

  return enriched;
}

export async function saveTreeToLocalStorage(tree: FamilyTreeData): Promise<boolean> {
  const saved = saveTreeLocally({
    ...tree,
    updatedAt: tree.updatedAt || new Date().toISOString(),
  });
  if (!saved) return false;
  logTree(
    `Збережено локально "${saved.title}" (${Object.keys(saved.persons || {}).length} осіб, версія: ${saved.version || 'v0.1'})`,
    { treeId: saved.id },
    'info'
  );
  return true;
}

export function countTreeCrossCanvasLinks(tree: FamilyTreeData | null | undefined): number {
  if (!tree?.persons) return 0;
  let count = 0;
  Object.values(tree.persons).forEach((p) => {
    if (!p) return;
    if (Array.isArray(p.crossCanvasLinks)) {
      count += p.crossCanvasLinks.filter((l) => Boolean(l && l.targetCanvasId)).length;
    }
    if (p.targetCanvasId) count += 1;
  });
  return count;
}

/**
 * Compares tree data candidates and returns the newest and most complete version.
 * Always prioritizes updatedAt timestamp before version string so a version bump
 * or server redeploy never overwrites more recent edits (including cross-canvas links).
 */
export function pickNewestTreeData(...candidates: (FamilyTreeData | null | undefined)[]): FamilyTreeData | null {
  const valid = candidates.filter(
    (c): c is FamilyTreeData => Boolean(c && c.persons && typeof c.persons === 'object' && Object.keys(c.persons).length > 0)
  );
  if (valid.length === 0) return null;

  valid.sort((a, b) => {
    const timeA = parseTimestamp(a.updatedAt || a.createdAt);
    const timeB = parseTimestamp(b.updatedAt || b.createdAt);

    if (Math.abs(timeA - timeB) > 2000) {
      return timeB - timeA;
    }

    const linksA = countTreeCrossCanvasLinks(a);
    const linksB = countTreeCrossCanvasLinks(b);
    if (linksA !== linksB) {
      return linksB - linksA;
    }

    const countA = Object.keys(a.persons || {}).length;
    const countB = Object.keys(b.persons || {}).length;
    if (countA !== countB) {
      return countB - countA;
    }

    const numA = parseVersionFloat(a.version) || 0.1;
    const numB = parseVersionFloat(b.version) || 0.1;
    if (Math.abs(numA - numB) >= 0.01) {
      return numB - numA;
    }

    return timeB - timeA;
  });

  return valid[0];
}

export function loadTreeFromLocalStorage(): FamilyTreeData | null {
  return readLocalTreeCandidate(MAIN_TREE_ID, true, true);
}

export function downloadTreeJson(tree: FamilyTreeData, filename?: string): void {
  const cleanTitle = (tree.title || 'родовід')
    .toLowerCase()
    .replace(/[^a-zа-яіїєґ0-9]/gi, '_')
    .replace(/_+/g, '_');
  const dateStr = new Date().toISOString().slice(0, 10);
  const finalFileName = filename || `${cleanTitle}_${dateStr}.json`;

  const blob = new Blob([JSON.stringify(tree, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = finalFileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function parseTreeJsonFile(file: File): Promise<FamilyTreeData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const rawText = (event.target?.result as string) || '';
        const cleanText = rawText.replace(/^\uFEFF/, '').trim();
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        if (ext === 'ged' || ext === 'gedcom' || cleanText.startsWith('0 HEAD') || cleanText.includes('0 @I')) {
          const data = parseGedcomText(cleanText, file.name);
          resolve(data);
          return;
        }
        if (ext === 'csv') {
          const data = parseCsvText(cleanText, file.name);
          resolve(data);
          return;
        }
        try {
          const data = JSON.parse(cleanText) as FamilyTreeData;
          if (data && typeof data === 'object' && data.persons) {
            Object.keys(data.persons).forEach((id) => {
              const p = data.persons[id];
              if (!p) return;
              if (typeof p.firstName === 'string') p.firstName = p.firstName.trim();
              if (typeof p.lastName === 'string') p.lastName = p.lastName.trim();
              if (typeof p.nickname === 'string') p.nickname = p.nickname.trim();
              if (typeof p.maidenName === 'string') p.maidenName = p.maidenName.trim();
              if (typeof p.patronymic === 'string') p.patronymic = p.patronymic.trim();
              if (typeof p.birthDate === 'string') p.birthDate = p.birthDate.trim();
              if (typeof p.birthYear === 'string') p.birthYear = p.birthYear.trim();
              if (typeof p.birthDay === 'string') p.birthDay = p.birthDay.trim();
              if (typeof p.birthMonth === 'string') p.birthMonth = p.birthMonth.trim();
              if (typeof p.deathDate === 'string') p.deathDate = p.deathDate.trim();
              if (typeof p.deathYear === 'string') p.deathYear = p.deathYear.trim();
              if (typeof p.deathDay === 'string') p.deathDay = p.deathDay.trim();
              if (typeof p.deathMonth === 'string') p.deathMonth = p.deathMonth.trim();
              if (typeof p.yearsDisplay === 'string') p.yearsDisplay = p.yearsDisplay.trim();
              if (typeof p.birthPlace === 'string') p.birthPlace = p.birthPlace.trim();
              if (typeof p.deathPlace === 'string') p.deathPlace = p.deathPlace.trim();
              if (typeof p.residencePlace === 'string') p.residencePlace = p.residencePlace.trim();
              if (typeof p.clanName === 'string') p.clanName = p.clanName.trim();
              if (typeof p.x !== 'number' || isNaN(p.x)) p.x = 0;
              if (typeof p.y !== 'number' || isNaN(p.y)) p.y = 0;
              if (!Array.isArray(p.parents)) p.parents = [];
              if (!Array.isArray(p.spouses)) p.spouses = [];
              if (!Array.isArray(p.children)) p.children = [];
            });
            resolve(data);
            return;
          }
        } catch {
          if (cleanText.includes('0 ') || cleanText.includes('INDI')) {
            const data = parseGedcomText(cleanText, file.name);
            resolve(data);
            return;
          }
        }
        throw new Error('Не вдалося розпізнати формат файлу.');
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Не вдалося прочитати файл з диска'));
    reader.readAsText(file);
  });
}
