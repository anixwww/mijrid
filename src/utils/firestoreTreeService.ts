/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  collection,
  deleteDoc,
  doc,
  DocumentReference,
  DocumentSnapshot,
  getDoc,
  getDocFromServer,
  getDocs,
  getDocsFromServer,
  onSnapshot,
  query,
  Query,
  QuerySnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { FamilyTreeData } from '../types/tree';
import { logDatabase, logError } from './logger';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export interface TreeMetaItem {
  id: string;
  ownerId: string;
  ownerName?: string;
  title: string;
  version?: string;
  description?: string;
  isPublic?: boolean;
  personCount?: number;
  createdAt: string;
  updatedAt: string;
  isMain?: boolean;
}

export interface TreeDocumentRecord extends TreeMetaItem {
  treeDataJson: string;
}

const VALID_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;
const MAX_TREE_JSON_BYTES = 950_000;

function sanitizeDocId(rawId: string): string {
  const clean = (rawId || 'my-family-tree').trim();
  if (clean === 'default-tree' || clean === 'main-tree') return 'my-family-tree';
  if (VALID_ID_RE.test(clean)) return clean;
  return clean.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128) || 'my-family-tree';
}

function timestampToIso(value: unknown, fallback?: string): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (value && typeof (value as { toDate?: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof value === 'string' && value.trim()) {
    return value;
  }
  return fallback || new Date().toISOString();
}

function isOfflineFirestoreError(err: unknown): boolean {
  const code = (err as { code?: string })?.code || '';
  const msg = err instanceof Error ? err.message : String(err);
  return (
    code === 'unavailable' ||
    msg.includes('client is offline') ||
    msg.includes('Failed to get document because the client is offline')
  );
}

async function getDocPreferServer<T>(ref: DocumentReference<T>): Promise<DocumentSnapshot<T>> {
  try {
    return await getDocFromServer(ref);
  } catch (err) {
    if (isOfflineFirestoreError(err)) {
      return await getDoc(ref);
    }
    throw err;
  }
}

async function getDocsPreferServer<T>(q: Query<T>): Promise<QuerySnapshot<T>> {
  try {
    return await getDocsFromServer(q);
  } catch (err) {
    if (isOfflineFirestoreError(err)) {
      return await getDocs(q);
    }
    throw err;
  }
}

function parseTreeDocData(docData: Record<string, unknown>, docId: string): FamilyTreeData | null {
  const rawJson = docData.treeDataJson;
  if (typeof rawJson !== 'string' || !rawJson.trim()) return null;
  try {
    const parsed = JSON.parse(rawJson) as FamilyTreeData;
    if (!parsed || typeof parsed !== 'object' || !parsed.persons || typeof parsed.persons !== 'object') {
      return null;
    }
    const docUpdatedIso = docData.updatedAt ? timestampToIso(docData.updatedAt, '') : '';
    const parsedUpdatedIso = typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '';
    const docTime = docUpdatedIso ? new Date(docUpdatedIso).getTime() : 0;
    const parsedTime = parsedUpdatedIso ? new Date(parsedUpdatedIso).getTime() : 0;
    const updatedIso =
      docTime > 0 && (isNaN(parsedTime) || docTime - parsedTime > 5000)
        ? docUpdatedIso
        : parsedUpdatedIso || docUpdatedIso || new Date().toISOString();
    const createdIso = parsed.createdAt || timestampToIso(docData.createdAt);
    return {
      ...parsed,
      id: sanitizeDocId(typeof docData.id === 'string' ? docData.id : docId),
      title: (typeof docData.title === 'string' && docData.title.trim()) || parsed.title || 'Родове дерево',
      version: (typeof docData.version === 'string' && docData.version.trim()) || parsed.version || 'v0.1',
      createdAt: createdIso,
      updatedAt: updatedIso,
    };
  } catch (err) {
    console.warn('Failed to parse Firestore treeDataJson for', docId, err);
    return null;
  }
}

export function isFirestoreActive(): boolean {
  return true;
}

export function isCloudWriteAuthenticated(): boolean {
  return Boolean(auth.currentUser && auth.currentUser.emailVerified);
}

export function disableFirestoreSync() {}

export async function getUserTrees(userId?: string): Promise<TreeMetaItem[]> {
  const resultMap = new Map<string, TreeMetaItem>();

  const collectSnapshot = (docs: Array<{ id: string; data: () => Record<string, unknown> }>) => {
    for (const d of docs) {
      const data = d.data();
      const id = sanitizeDocId(typeof data.id === 'string' ? data.id : d.id);
      const isMain = Boolean(data.isMain) || id === 'my-family-tree';
      resultMap.set(id, {
        id,
        ownerId: typeof data.ownerId === 'string' ? data.ownerId : 'cloud',
        ownerName: typeof data.ownerName === 'string' ? data.ownerName : undefined,
        title: typeof data.title === 'string' && data.title ? data.title : 'Родове полотно',
        version: typeof data.version === 'string' ? data.version : undefined,
        description: typeof data.description === 'string' ? data.description : undefined,
        isPublic: data.isPublic !== false,
        personCount: typeof data.personCount === 'number' ? data.personCount : 0,
        createdAt: timestampToIso(data.createdAt),
        updatedAt: timestampToIso(data.updatedAt),
        isMain,
      });
    }
  };

  try {
    const publicQuery = query(collection(db, 'trees'), where('isPublic', '==', true));
    const publicSnap = await getDocsPreferServer(publicQuery);
    collectSnapshot(publicSnap.docs as unknown as Array<{ id: string; data: () => Record<string, unknown> }>);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'trees');
  }

  const activeUid = userId || auth.currentUser?.uid;
  if (activeUid && VALID_ID_RE.test(activeUid)) {
    try {
      const ownQuery = query(collection(db, 'trees'), where('ownerId', '==', activeUid));
      const ownSnap = await getDocsPreferServer(ownQuery);
      collectSnapshot(ownSnap.docs as unknown as Array<{ id: string; data: () => Record<string, unknown> }>);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'trees');
    }
  }

  return Array.from(resultMap.values());
}

export async function fetchAllTreesFromFirestore(): Promise<FamilyTreeData[]> {
  const byId = new Map<string, FamilyTreeData>();

  const collect = (docs: Array<{ id: string; data: () => Record<string, unknown> }>) => {
    for (const d of docs) {
      const parsed = parseTreeDocData(d.data(), d.id);
      if (parsed) byId.set(parsed.id, parsed);
    }
  };

  try {
    const publicSnap = await getDocsPreferServer(query(collection(db, 'trees'), where('isPublic', '==', true)));
    collect(publicSnap.docs as unknown as Array<{ id: string; data: () => Record<string, unknown> }>);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'trees');
  }

  if (auth.currentUser?.uid && VALID_ID_RE.test(auth.currentUser.uid)) {
    try {
      const ownSnap = await getDocsPreferServer(query(collection(db, 'trees'), where('ownerId', '==', auth.currentUser.uid)));
      collect(ownSnap.docs as unknown as Array<{ id: string; data: () => Record<string, unknown> }>);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'trees');
    }
  }

  return Array.from(byId.values());
}

export async function getTreeById(treeId: string): Promise<FamilyTreeData | null> {
  const targetId = sanitizeDocId(treeId);
  const path = `trees/${targetId}`;
  try {
    const snap = await getDocPreferServer(doc(db, 'trees', targetId));
    if (!snap.exists()) return null;
    return parseTreeDocData(snap.data() as Record<string, unknown>, snap.id);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function saveTreeToFirestore(
  treeId: string,
  treeData: FamilyTreeData,
  _ownerId?: string,
  ownerName?: string,
  isPublic = true
): Promise<boolean> {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified) {
    return false;
  }

  const targetId = sanitizeDocId(treeId || treeData.id);
  const path = `trees/${targetId}`;
  const isMain = targetId === 'my-family-tree';
  const cleanTitle = (treeData.title || (isMain ? 'Головне родове дерево' : 'Родове полотно'))
    .trim()
    .slice(0, 150) || 'Родове дерево';
  const cleanDescription = (treeData.description || '').trim().slice(0, 2000);
  const cleanVersion = (treeData.version || 'v0.1').trim().slice(0, 40) || 'v0.1';
  const cleanOwnerName = (ownerName || currentUser.displayName || currentUser.email?.split('@')[0] || 'Адміністратор')
    .trim()
    .slice(0, 100);
  const personCount = Math.min(20000, Math.max(0, Object.keys(treeData.persons || {}).length));

  const payloadTree: FamilyTreeData = {
    ...treeData,
    id: targetId,
    title: cleanTitle,
    version: cleanVersion,
    updatedAt: treeData.updatedAt || new Date().toISOString(),
  };

  const serialized = JSON.stringify(payloadTree);
  const byteLength = new TextEncoder().encode(serialized).length;
  if (byteLength > MAX_TREE_JSON_BYTES) {
    logError(
      'database',
      `Полотно "${cleanTitle}" перевищує безпечний ліміт Firestore (${Math.round(byteLength / 1024)} KB > 950 KB). Переконайтеся, що фото завантажені як URL, а не base64.`,
      { treeId: targetId }
    );
    return false;
  }

  const docRef = doc(db, 'trees', targetId);

  try {
    const existingSnap = await getDoc(docRef);
    if (existingSnap.exists()) {
      await updateDoc(docRef, {
        ownerName: cleanOwnerName,
        title: cleanTitle,
        version: cleanVersion,
        description: cleanDescription,
        isPublic: Boolean(isPublic),
        isMain,
        personCount,
        treeDataJson: serialized,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(docRef, {
        id: targetId,
        ownerId: currentUser.uid,
        ownerName: cleanOwnerName,
        title: cleanTitle,
        version: cleanVersion,
        description: cleanDescription,
        isPublic: Boolean(isPublic),
        isMain,
        personCount,
        treeDataJson: serialized,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    let crossCanvasLinkCount = 0;
    Object.values(payloadTree.persons || {}).forEach((p) => {
      if (Array.isArray(p?.crossCanvasLinks)) crossCanvasLinkCount += p.crossCanvasLinks.length;
      if (p?.targetCanvasId) crossCanvasLinkCount += 1;
    });

    logDatabase(
      `Збережено в Firebase Firestore «${cleanTitle}» (${personCount} осіб, ${cleanVersion}${
        crossCanvasLinkCount > 0 ? `, міжгілкових посилань: ${crossCanvasLinkCount}` : ''
      })`,
      { treeId: targetId, personCount, crossCanvasLinkCount, version: cleanVersion },
      'success'
    );
    return true;
  } catch (error) {
    logError('database', `Помилка запису полотна «${cleanTitle}» у Firebase Firestore`, {
      treeId: targetId,
      error: String(error),
    });
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function renameTreeInFirestore(treeId: string, newTitle: string): Promise<boolean> {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified) return false;
  const targetId = sanitizeDocId(treeId);
  if (targetId === 'my-family-tree') return false;
  const cleanTitle = newTitle.trim().slice(0, 150);
  if (!cleanTitle) return false;

  const path = `trees/${targetId}`;
  try {
    const docRef = doc(db, 'trees', targetId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return false;
    const parsed = parseTreeDocData(snap.data() as Record<string, unknown>, targetId);
    const updatedJson = parsed
      ? JSON.stringify({ ...parsed, title: cleanTitle, updatedAt: new Date().toISOString() })
      : String((snap.data() as Record<string, unknown>).treeDataJson || '{}');

    await updateDoc(docRef, {
      title: cleanTitle,
      treeDataJson: updatedJson.slice(0, MAX_TREE_JSON_BYTES),
      updatedAt: serverTimestamp(),
    });
    logDatabase(`Перейменовано полотно ${targetId} у Firebase Firestore на «${cleanTitle}»`, {
      treeId: targetId,
      title: cleanTitle,
    });
    return true;
  } catch (error) {
    logError('database', `Помилка перейменування полотна ${targetId} у Firebase`, {
      treeId: targetId,
      error: String(error),
    });
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteTreeFromFirestore(treeId: string): Promise<void> {
  const targetId = sanitizeDocId(treeId);
  if (targetId === 'my-family-tree') return;
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified) return;

  const path = `trees/${targetId}`;
  try {
    await deleteDoc(doc(db, 'trees', targetId));
    logDatabase(`Видалено полотно ${targetId} у Firebase Firestore`, { treeId: targetId }, 'info');
  } catch (error) {
    logError('database', `Помилка видалення полотна ${targetId} у Firebase`, {
      treeId: targetId,
      error: String(error),
    });
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function fetchGlobalVersionFromFirestore(): Promise<string | null> {
  const path = 'settings/global';
  try {
    const snap = await getDocPreferServer(doc(db, 'settings', 'global'));
    if (!snap.exists()) return null;
    const data = snap.data() as Record<string, unknown>;
    return typeof data.version === 'string' && data.version.trim() ? data.version.trim() : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function saveGlobalVersionToFirestore(version: string): Promise<boolean> {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified) return false;
  const cleanVersion = (version || 'v0.1').trim().slice(0, 40) || 'v0.1';
  const path = 'settings/global';
  try {
    await setDoc(doc(db, 'settings', 'global'), {
      version: cleanVersion,
      updatedBy: currentUser.uid,
      updatedAt: serverTimestamp(),
    });
    logDatabase(`Оновлено глобальну версію у Firebase Firestore: ${cleanVersion}`, {
      version: cleanVersion,
    });
    return true;
  } catch (error) {
    logError('database', `Помилка збереження глобальної версії у Firebase`, {
      version: cleanVersion,
      error: String(error),
    });
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeToTreeInFirestore(
  treeId: string,
  onUpdate: (tree: FamilyTreeData) => void
): () => void {
  if (!auth.currentUser) {
    return () => {};
  }
  const targetId = sanitizeDocId(treeId);
  const path = `trees/${targetId}`;
  return onSnapshot(
    doc(db, 'trees', targetId),
    (snapshot) => {
      if (!snapshot.exists()) return;
      const parsed = parseTreeDocData(snapshot.data() as Record<string, unknown>, snapshot.id);
      if (parsed) {
        onUpdate(parsed);
      }
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

export async function toggleTreePublicAccess(treeId: string, isPublic: boolean): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified) return;
  const targetId = sanitizeDocId(treeId);
  const path = `trees/${targetId}`;
  try {
    await updateDoc(doc(db, 'trees', targetId), {
      isPublic: Boolean(isPublic),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}
