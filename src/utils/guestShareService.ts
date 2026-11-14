/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getDocsFromServer,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import {
  handleFirestoreError,
  isCloudWriteAuthenticated,
  OperationType,
} from './firestoreTreeService';
import { normalizeTreeId } from './localTreeStorage';
import { logDatabase, logError } from './logger';

export interface GuestShareLink {
  id: string;
  ownerId: string;
  ownerName?: string;
  title: string;
  treeId: string;
  treeTitle?: string;
  focusPersonId?: string;
  allowAllCanvases: boolean;
  readOnly: boolean;
  isActive: boolean;
  expiresAtIso?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GuestShareCreateInput {
  title: string;
  treeId: string;
  treeTitle?: string;
  focusPersonId?: string;
  allowAllCanvases: boolean;
  readOnly: boolean;
  expiresInDays?: number | null;
}

export interface GuestShareResolveResult {
  status: 'active' | 'not_found' | 'disabled' | 'expired' | 'error';
  share?: GuestShareLink;
  errorMessage?: string;
}

const VALID_SHARE_ID_RE = /^[a-zA-Z0-9_-]{4,128}$/;

function isOfflineFirestoreError(err: unknown): boolean {
  const code = (err as { code?: string })?.code || '';
  const msg = err instanceof Error ? err.message : String(err);
  return (
    code === 'unavailable' ||
    msg.includes('client is offline') ||
    msg.includes('Failed to get document because the client is offline')
  );
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

export function generateGuestShareToken(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const length = 18;
  let token = 'sh_';
  try {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < length; i++) {
      token += alphabet[bytes[i] % alphabet.length];
    }
    return token;
  } catch {
    for (let i = 0; i < length; i++) {
      token += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return token;
  }
}

export function buildGuestShareUrl(
  shareId: string,
  options?: { origin?: string; personId?: string }
): string {
  const baseOrigin =
    options?.origin ||
    (typeof window !== 'undefined' ? window.location.origin : '');
  const params = new URLSearchParams();
  params.set('share', shareId);
  if (options?.personId && options.personId.trim()) {
    params.set('person', options.personId.trim());
  }
  return `${baseOrigin}/?${params.toString()}`;
}

export function buildDirectGuestUrl(
  treeId: string,
  options?: { origin?: string; personId?: string }
): string {
  const baseOrigin =
    options?.origin ||
    (typeof window !== 'undefined' ? window.location.origin : '');
  const { targetId } = normalizeTreeId(treeId);
  const params = new URLSearchParams();
  params.set('guest', '1');
  params.set('tree', targetId);
  if (options?.personId && options.personId.trim()) {
    params.set('person', options.personId.trim());
  }
  return `${baseOrigin}/?${params.toString()}`;
}

function parseGuestShareDoc(
  data: Record<string, unknown>,
  docId: string
): GuestShareLink | null {
  const id = typeof data.id === 'string' && data.id ? data.id : docId;
  const ownerId = typeof data.ownerId === 'string' ? data.ownerId : '';
  const treeId = typeof data.treeId === 'string' ? data.treeId : '';
  const title = typeof data.title === 'string' ? data.title : 'Гостьове посилання';
  if (!id || !ownerId || !treeId) return null;

  return {
    id,
    ownerId,
    ownerName: typeof data.ownerName === 'string' ? data.ownerName : undefined,
    title,
    treeId: normalizeTreeId(treeId).targetId,
    treeTitle: typeof data.treeTitle === 'string' ? data.treeTitle : undefined,
    focusPersonId:
      typeof data.focusPersonId === 'string' && data.focusPersonId.trim()
        ? data.focusPersonId.trim()
        : undefined,
    allowAllCanvases: Boolean(data.allowAllCanvases),
    readOnly: Boolean(data.readOnly),
    isActive: data.isActive !== false,
    expiresAtIso:
      typeof data.expiresAtIso === 'string' && data.expiresAtIso.trim()
        ? data.expiresAtIso.trim()
        : undefined,
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
  };
}

export function isShareExpired(share: Pick<GuestShareLink, 'expiresAtIso'>): boolean {
  if (!share.expiresAtIso) return false;
  const ts = new Date(share.expiresAtIso).getTime();
  return !isNaN(ts) && ts < Date.now();
}

export async function getGuestShareById(shareId: string): Promise<GuestShareResolveResult> {
  const cleanId = shareId.trim();
  if (!VALID_SHARE_ID_RE.test(cleanId)) {
    return {
      status: 'not_found',
      errorMessage: 'Некоректний формат гостьового посилання.',
    };
  }

  const path = `guestShares/${cleanId}`;
  const docRef = doc(db, 'guestShares', cleanId);

  try {
    let snap;
    try {
      snap = await getDocFromServer(docRef);
    } catch (err) {
      if (isOfflineFirestoreError(err)) {
        snap = await getDoc(docRef);
      } else {
        throw err;
      }
    }

    if (!snap.exists()) {
      return {
        status: 'not_found',
        errorMessage: 'Гостьове посилання не знайдено або було видалено адміністратором.',
      };
    }

    const parsed = parseGuestShareDoc(snap.data() as Record<string, unknown>, snap.id);
    if (!parsed) {
      return {
        status: 'not_found',
        errorMessage: 'Пошкоджені дані гостьового посилання.',
      };
    }

    if (!parsed.isActive) {
      return {
        status: 'disabled',
        share: parsed,
        errorMessage: 'Адміністратор тимчасово призупинив доступ за цим посиланням.',
      };
    }

    if (isShareExpired(parsed)) {
      return {
        status: 'expired',
        share: parsed,
        errorMessage: 'Термін дії цього гостьового посилання вичерпано.',
      };
    }

    return {
      status: 'active',
      share: parsed,
    };
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.GET, path);
    } catch (wrapped) {
      return {
        status: 'error',
        errorMessage:
          wrapped instanceof Error ? wrapped.message : 'Не вдалося перевірити гостьове посилання.',
      };
    }
  }
}

export async function listAdminGuestShareLinks(): Promise<GuestShareLink[]> {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified) {
    return [];
  }

  const q = query(collection(db, 'guestShares'), where('ownerId', '==', currentUser.uid));
  try {
    let snap;
    try {
      snap = await getDocsFromServer(q);
    } catch (err) {
      if (isOfflineFirestoreError(err)) {
        snap = await getDocs(q);
      } else {
        throw err;
      }
    }

    const items: GuestShareLink[] = [];
    snap.docs.forEach((d) => {
      const parsed = parseGuestShareDoc(d.data() as Record<string, unknown>, d.id);
      if (parsed) items.push(parsed);
    });

    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return items;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'guestShares');
  }
}

export async function createGuestShareLink(
  input: GuestShareCreateInput
): Promise<GuestShareLink> {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified || !isCloudWriteAuthenticated()) {
    throw new Error('Для створення керованого гостьового посилання увійдіть через Google.');
  }

  const shareId = generateGuestShareToken();
  const { targetId } = normalizeTreeId(input.treeId);
  const cleanTitle =
    (input.title || '').trim().slice(0, 150) ||
    `Гостьове посилання — ${(input.treeTitle || 'Родове дерево').slice(0, 100)}`;
  const cleanOwnerName = (
    currentUser.displayName ||
    currentUser.email?.split('@')[0] ||
    'Адміністратор'
  )
    .trim()
    .slice(0, 100);
  const cleanTreeTitle = (input.treeTitle || '').trim().slice(0, 150);
  const cleanFocusPersonId = (input.focusPersonId || '').trim().slice(0, 128);
  const expiresAtIso =
    typeof input.expiresInDays === 'number' && input.expiresInDays > 0
      ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
      : undefined;

  const docPayload: Record<string, unknown> = {
    id: shareId,
    ownerId: currentUser.uid,
    ownerName: cleanOwnerName,
    title: cleanTitle,
    treeId: targetId,
    allowAllCanvases: Boolean(input.allowAllCanvases),
    readOnly: Boolean(input.readOnly),
    isActive: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (cleanTreeTitle) {
    docPayload.treeTitle = cleanTreeTitle;
  }
  if (cleanFocusPersonId) {
    docPayload.focusPersonId = cleanFocusPersonId;
  }
  if (expiresAtIso) {
    docPayload.expiresAtIso = expiresAtIso;
  }

  const path = `guestShares/${shareId}`;
  try {
    await setDoc(doc(db, 'guestShares', shareId), docPayload);
    const nowIso = new Date().toISOString();
    const created: GuestShareLink = {
      id: shareId,
      ownerId: currentUser.uid,
      ownerName: cleanOwnerName,
      title: cleanTitle,
      treeId: targetId,
      treeTitle: cleanTreeTitle || undefined,
      focusPersonId: cleanFocusPersonId || undefined,
      allowAllCanvases: Boolean(input.allowAllCanvases),
      readOnly: Boolean(input.readOnly),
      isActive: true,
      expiresAtIso,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    logDatabase(`Створено гостьове посилання «${cleanTitle}» (${targetId})`, { shareId, treeId: targetId }, 'success');
    return created;
  } catch (error) {
    logError('database', 'Помилка створення гостьового посилання в Firebase', {
      shareId,
      error: String(error),
    });
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateGuestShareLink(
  shareId: string,
  patch: Partial<Pick<GuestShareLink, 'isActive' | 'readOnly' | 'allowAllCanvases' | 'title'>>
): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified) {
    throw new Error('Для оновлення гостьового посилання увійдіть через Google.');
  }

  const cleanId = shareId.trim();
  const path = `guestShares/${cleanId}`;
  const updatePayload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };

  if (typeof patch.isActive === 'boolean') {
    updatePayload.isActive = patch.isActive;
  }
  if (typeof patch.readOnly === 'boolean') {
    updatePayload.readOnly = patch.readOnly;
  }
  if (typeof patch.allowAllCanvases === 'boolean') {
    updatePayload.allowAllCanvases = patch.allowAllCanvases;
  }
  if (typeof patch.title === 'string' && patch.title.trim()) {
    updatePayload.title = patch.title.trim().slice(0, 150);
  }

  try {
    await updateDoc(doc(db, 'guestShares', cleanId), updatePayload);
    logDatabase(`Оновлено параметри гостьового посилання ${cleanId}`, { shareId: cleanId, patch }, 'info');
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteGuestShareLink(shareId: string): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified) {
    throw new Error('Для видалення гостьового посилання увійдіть через Google.');
  }

  const cleanId = shareId.trim();
  const path = `guestShares/${cleanId}`;
  try {
    await deleteDoc(doc(db, 'guestShares', cleanId));
    logDatabase(`Видалено гостьове посилання ${cleanId}`, { shareId: cleanId }, 'info');
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
