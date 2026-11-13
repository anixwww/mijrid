/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { FamilyTreeData, Person } from '../types/tree';
import { handleFirestoreError, OperationType } from './firestoreTreeService';
import { authHeaders, getAuthToken } from './auth';

const CHUNK_CHAR_SIZE = 480_000;
const MAX_CHUNKS = 60;
const MAX_MEDIA_BYTES = 24_500_000;
const UPLOAD_URL_RE = /^\/uploads\/([a-zA-Z0-9_.-]{3,160})$/;
const DATA_IMAGE_RE = /^data:(image\/[a-zA-Z0-9+.-]+)(?:;[^,]*)?;base64,(.+)$/i;

const resolvedBlobCache = new Map<string, string>();
const inflightDownloads = new Map<string, Promise<string | null>>();

const EXT_MIME_MAP: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  ico: 'image/x-icon',
  heic: 'image/heic',
  heif: 'image/heif',
};

function isAllowedRasterMime(mime: string): boolean {
  const clean = mime.toLowerCase().split(';')[0].trim();
  if (!clean.startsWith('image/') || clean.includes('svg')) return false;
  return clean === 'image/pjpeg' || Object.values(EXT_MIME_MAP).includes(clean);
}

function mimeToExt(mime: string): string {
  const clean = mime.toLowerCase().split(';')[0].trim();
  if (clean === 'image/jpeg' || clean === 'image/pjpeg') return 'jpg';
  const sub = clean.replace(/^image\//, '');
  return EXT_MIME_MAP[sub] ? sub : 'png';
}

function filenameToMime(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || 'png';
  return EXT_MIME_MAP[ext] || 'image/png';
}

export function uploadUrlToMediaId(urlOrFilename: string): { mediaId: string; filename: string } | null {
  const trimmed = (urlOrFilename || '').trim();
  const match = UPLOAD_URL_RE.exec(trimmed);
  const filename = match ? match[1] : /^[a-zA-Z0-9_.-]{3,160}$/.test(trimmed) ? trimmed : '';
  if (!filename) return null;
  const mediaId = filename.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  if (!mediaId) return null;
  return { mediaId, filename };
}

export function extractAllMediaUrlsFromTree(tree: FamilyTreeData | null | undefined): string[] {
  if (!tree) return [];
  const urls = new Set<string>();
  const addUrl = (val?: string | null) => {
    if (typeof val !== 'string') return;
    const trimmed = val.trim();
    if (!trimmed) return;
    if (UPLOAD_URL_RE.test(trimmed) || DATA_IMAGE_RE.test(trimmed)) {
      urls.add(trimmed);
    }
  };

  Object.values(tree.persons || {}).forEach((p) => {
    if (!p) return;
    addUrl(p.avatarUrl);
    addUrl(p.birthMetricUrl);
    addUrl(p.deathMetricUrl);
    addUrl(p.screenshotUrl);
    (p.metricDocuments || []).forEach((d) => addUrl(d?.url));
    (p.photoAlbum || []).forEach((ph) => addUrl(ph?.url));
    (p.pets || []).forEach((pet) => addUrl(pet?.avatarUrl));
  });

  if (tree.clanCoatOfArms && typeof tree.clanCoatOfArms === 'object') {
    Object.values(tree.clanCoatOfArms).forEach((item) => {
      if (typeof item === 'string') {
        addUrl(item);
      } else if (item && typeof item === 'object') {
        addUrl(item.url);
      }
    });
  }

  return Array.from(urls);
}

function replaceMediaUrlsInTree(tree: FamilyTreeData, replacements: Map<string, string>): FamilyTreeData {
  if (replacements.size === 0) return tree;
  const mapUrl = (val?: string): string | undefined => {
    if (typeof val !== 'string') return val;
    return replacements.get(val.trim()) || val;
  };

  let changed = false;
  const updatedPersons: Record<string, Person> = { ...tree.persons };

  for (const [id, p] of Object.entries(updatedPersons)) {
    if (!p) continue;
    let pChanged = false;
    const nextPerson: Person = { ...p };

    const checkField = (key: 'avatarUrl' | 'birthMetricUrl' | 'deathMetricUrl' | 'screenshotUrl') => {
      const orig = p[key];
      const next = mapUrl(orig);
      if (next !== orig) {
        nextPerson[key] = next;
        pChanged = true;
      }
    };
    checkField('avatarUrl');
    checkField('birthMetricUrl');
    checkField('deathMetricUrl');
    checkField('screenshotUrl');

    if (Array.isArray(p.metricDocuments)) {
      let arrChanged = false;
      const nextDocs = p.metricDocuments.map((d) => {
        const nextUrl = mapUrl(d.url);
        if (nextUrl && nextUrl !== d.url) {
          arrChanged = true;
          return { ...d, url: nextUrl };
        }
        return d;
      });
      if (arrChanged) {
        nextPerson.metricDocuments = nextDocs;
        pChanged = true;
      }
    }

    if (Array.isArray(p.photoAlbum)) {
      let arrChanged = false;
      const nextAlbum = p.photoAlbum.map((ph) => {
        const nextUrl = mapUrl(ph.url);
        if (nextUrl && nextUrl !== ph.url) {
          arrChanged = true;
          return { ...ph, url: nextUrl };
        }
        return ph;
      });
      if (arrChanged) {
        nextPerson.photoAlbum = nextAlbum;
        pChanged = true;
      }
    }

    if (Array.isArray(p.pets)) {
      let arrChanged = false;
      const nextPets = p.pets.map((pet) => {
        const nextUrl = mapUrl(pet.avatarUrl);
        if (nextUrl !== pet.avatarUrl) {
          arrChanged = true;
          return { ...pet, avatarUrl: nextUrl };
        }
        return pet;
      });
      if (arrChanged) {
        nextPerson.pets = nextPets;
        pChanged = true;
      }
    }

    if (pChanged) {
      updatedPersons[id] = nextPerson;
      changed = true;
    }
  }

  let nextCoats = tree.clanCoatOfArms;
  if (tree.clanCoatOfArms && typeof tree.clanCoatOfArms === 'object') {
    let coatsChanged = false;
    const copyCoats = { ...tree.clanCoatOfArms };
    for (const [k, item] of Object.entries(copyCoats)) {
      if (typeof item === 'string') {
        const next = mapUrl(item);
        if (next && next !== item) {
          copyCoats[k] = next;
          coatsChanged = true;
        }
      } else if (item && typeof item === 'object' && item.url) {
        const next = mapUrl(item.url);
        if (next && next !== item.url) {
          copyCoats[k] = { ...item, url: next };
          coatsChanged = true;
        }
      }
    }
    if (coatsChanged) {
      nextCoats = copyCoats;
      changed = true;
    }
  }

  if (!changed) return tree;
  return {
    ...tree,
    persons: updatedPersons,
    clanCoatOfArms: nextCoats,
  };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error('Помилка читання зображення'));
    reader.readAsDataURL(blob);
  });
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function computeSha256Prefix24(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const hashBuffer = await crypto.subtle.digest('SHA-256', copy.buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 24);
}

async function isMediaAlreadyInFirestore(mediaId: string): Promise<boolean> {
  const manifestPath = `media/${mediaId}`;
  try {
    const manifestSnap = await getDoc(doc(db, 'media', mediaId));
    if (!manifestSnap.exists()) return false;
    const data = manifestSnap.data() as { chunkCount?: unknown };
    const chunkCount = typeof data.chunkCount === 'number' ? data.chunkCount : 0;
    if (chunkCount > 0) {
      const lastChunkSnap = await getDoc(doc(db, 'media', mediaId, 'chunks', String(chunkCount - 1)));
      if (lastChunkSnap.exists()) return true;
    }
    if (auth.currentUser?.emailVerified) {
      try {
        await deleteDoc(doc(db, 'media', mediaId));
      } catch {
        /* ignore if not owner */
      }
    }
    return false;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('Missing or insufficient permissions') || msg.includes('permission-denied')) {
      handleFirestoreError(err, OperationType.GET, manifestPath);
    }
    return false;
  }
}

async function uploadMediaPayloadToFirestore(params: {
  mediaId: string;
  filename: string;
  mimeType: string;
  base64Data: string;
  totalBytes: number;
  ownerId: string;
  isPublic: boolean;
}): Promise<void> {
  const { mediaId, filename, mimeType, base64Data, totalBytes, ownerId, isPublic } = params;
  const totalChunks = Math.ceil(base64Data.length / CHUNK_CHAR_SIZE);
  if (totalChunks < 1 || totalChunks > MAX_CHUNKS || totalBytes <= 0 || totalBytes > MAX_MEDIA_BYTES) {
    throw new Error(`Файл "${filename}" перевищує безпечний ліміт синхронізації Firebase (${Math.round(totalBytes / (1024 * 1024))} МБ).`);
  }

  const manifestRef = doc(db, 'media', mediaId);
  const manifestPath = `media/${mediaId}`;

  try {
    await setDoc(manifestRef, {
      id: mediaId,
      filename: filename.slice(0, 160),
      mimeType: mimeType.slice(0, 80),
      ownerId,
      isPublic: Boolean(isPublic),
      chunkCount: totalChunks,
      totalBytes,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, manifestPath);
  }

  try {
    for (let i = 0; i < totalChunks; i++) {
      const chunkId = String(i);
      const slice = base64Data.slice(i * CHUNK_CHAR_SIZE, (i + 1) * CHUNK_CHAR_SIZE);
      await setDoc(doc(db, 'media', mediaId, 'chunks', chunkId), {
        id: chunkId,
        index: i,
        data: slice,
        createdAt: serverTimestamp(),
      });
    }
  } catch (err) {
    // Clean up incomplete manifest so next sync retries cleanly
    try {
      await deleteDoc(manifestRef);
    } catch {
      /* ignore cleanup error */
    }
    handleFirestoreError(err, OperationType.WRITE, `${manifestPath}/chunks`);
  }
}

export interface MediaSyncPushResult {
  updatedTrees: FamilyTreeData[];
  uploadedCount: number;
  alreadySyncedCount: number;
  failedFiles: string[];
}

/**
 * Ensures all photos referenced in the provided trees (photoAlbum, avatars, metricDocuments, screenshots, etc.)
 * are uploaded to Firestore /media/{mediaId} so they survive container restarts and sync across deployments.
 */
export async function syncTreesMediaToFirestore(
  trees: FamilyTreeData[],
  ownerId: string,
  isPublic = true
): Promise<MediaSyncPushResult> {
  const effectiveOwnerId = auth.currentUser?.uid || ownerId;
  const allUrls = new Set<string>();
  trees.forEach((t) => {
    extractAllMediaUrlsFromTree(t).forEach((u) => allUrls.add(u));
  });

  if (allUrls.size === 0) {
    return { updatedTrees: trees, uploadedCount: 0, alreadySyncedCount: 0, failedFiles: [] };
  }

  const replacements = new Map<string, string>();
  let uploadedCount = 0;
  let alreadySyncedCount = 0;
  const failedFiles: string[] = [];

  for (const rawUrl of allUrls) {
    try {
      const dataMatch = DATA_IMAGE_RE.exec(rawUrl);
      if (dataMatch) {
        const mimeType = dataMatch[1].toLowerCase();
        if (!isAllowedRasterMime(mimeType)) continue;
        const base64Data = dataMatch[2];
        const bytes = base64ToUint8Array(base64Data);
        const hash24 = await computeSha256Prefix24(bytes);
        const ext = mimeToExt(mimeType);
        const filename = `${hash24}.${ext}`;
        const uploadUrl = `/uploads/${filename}`;
        const parsed = uploadUrlToMediaId(filename);
        replacements.set(rawUrl, uploadUrl);

        // Best-effort save to Express disk too (admin session only)
        if (getAuthToken()) {
          void fetch('/api/uploads/restore', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ filename, dataBase64: base64Data }),
          }).catch(() => {});
        }

        if (!parsed) continue;
        const exists = await isMediaAlreadyInFirestore(parsed.mediaId);
        if (exists) {
          alreadySyncedCount += 1;
          continue;
        }

        await uploadMediaPayloadToFirestore({
          mediaId: parsed.mediaId,
          filename: parsed.filename,
          mimeType,
          base64Data,
          totalBytes: bytes.byteLength,
          ownerId: effectiveOwnerId,
          isPublic,
        });
        uploadedCount += 1;
        continue;
      }

      const parsed = uploadUrlToMediaId(rawUrl);
      if (!parsed) continue;

      const exists = await isMediaAlreadyInFirestore(parsed.mediaId);
      if (exists) {
        alreadySyncedCount += 1;
        continue;
      }

      const res = await fetch(rawUrl);
      if (!res.ok) {
        failedFiles.push(parsed.filename);
        continue;
      }
      const blob = await res.blob();
      if (blob.size <= 0) {
        failedFiles.push(parsed.filename);
        continue;
      }
      if (blob.size > MAX_MEDIA_BYTES) {
        failedFiles.push(parsed.filename);
        continue;
      }
      const base64Data = await blobToBase64(blob);
      const mimeType = (blob.type && blob.type.startsWith('image/')) ? blob.type : filenameToMime(parsed.filename);

      await uploadMediaPayloadToFirestore({
        mediaId: parsed.mediaId,
        filename: parsed.filename,
        mimeType,
        base64Data,
        totalBytes: blob.size,
        ownerId: effectiveOwnerId,
        isPublic,
      });
      uploadedCount += 1;
    } catch (err) {
      const label = uploadUrlToMediaId(rawUrl)?.filename || 'photo';
      console.warn(`Failed syncing media ${label} to Firestore:`, err);
      failedFiles.push(label);
    }
  }

  const updatedTrees =
    replacements.size > 0
      ? trees.map((t) => replaceMediaUrlsInTree(t, replacements))
      : trees;

  return {
    updatedTrees,
    uploadedCount,
    alreadySyncedCount,
    failedFiles,
  };
}

/**
 * Downloads a single missing /uploads/<filename> from Firestore /media/{mediaId},
 * creates an in-memory Blob URL for instant UI display, and restores it onto Express server disk.
 */
export async function resolveMediaFallbackFromFirestore(uploadUrl: string): Promise<string | null> {
  const trimmed = (uploadUrl || '').trim();
  if (!UPLOAD_URL_RE.test(trimmed)) return null;

  const cached = resolvedBlobCache.get(trimmed);
  if (cached) return cached;

  const inflight = inflightDownloads.get(trimmed);
  if (inflight) return inflight;

  const task = (async (): Promise<string | null> => {
    const parsed = uploadUrlToMediaId(trimmed);
    if (!parsed) return null;
    const manifestPath = `media/${parsed.mediaId}`;

    try {
      const manifestSnap = await getDoc(doc(db, 'media', parsed.mediaId));
      if (!manifestSnap.exists()) return null;
      const manifest = manifestSnap.data() as {
        chunkCount?: number;
        mimeType?: string;
        filename?: string;
      };
      const chunkCount = typeof manifest.chunkCount === 'number' ? manifest.chunkCount : 0;
      if (chunkCount <= 0 || chunkCount > MAX_CHUNKS) return null;

      const chunkSnaps = await Promise.all(
        Array.from({ length: chunkCount }, (_, i) =>
          getDoc(doc(db, 'media', parsed.mediaId, 'chunks', String(i)))
        )
      );

      const parts: string[] = [];
      for (const snap of chunkSnaps) {
        if (!snap.exists()) return null;
        const d = snap.data() as { data?: string };
        if (typeof d.data !== 'string' || !d.data) return null;
        parts.push(d.data);
      }

      const fullBase64 = parts.join('');
      const bytes = base64ToUint8Array(fullBase64);
      const mimeType = manifest.mimeType || filenameToMime(parsed.filename);
      const blobCopy = new Uint8Array(bytes.byteLength);
      blobCopy.set(bytes);
      const blob = new Blob([blobCopy.buffer], { type: mimeType });
      const blobUrl = URL.createObjectURL(blob);
      resolvedBlobCache.set(trimmed, blobUrl);

      // Restore to Express disk so subsequent requests serve directly from /uploads/
      if (getAuthToken()) {
        void fetch('/api/uploads/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({
            filename: parsed.filename,
            dataBase64: fullBase64,
          }),
        }).catch(() => {});
      }

      return blobUrl;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Missing or insufficient permissions') || msg.includes('permission-denied')) {
        handleFirestoreError(err, OperationType.GET, manifestPath);
      }
      return null;
    } finally {
      inflightDownloads.delete(trimmed);
    }
  })();

  inflightDownloads.set(trimmed, task);
  return task;
}

/**
 * Checks which /uploads/<filename> photos in the provided trees are missing on the Express server
 * and restores them in the background from Firebase Firestore.
 */
export async function restoreMissingMediaFromFirestore(trees: FamilyTreeData[]): Promise<number> {
  const filenames = new Set<string>();
  trees.forEach((t) => {
    extractAllMediaUrlsFromTree(t).forEach((u) => {
      const parsed = uploadUrlToMediaId(u);
      if (parsed) filenames.add(parsed.filename);
    });
  });

  if (filenames.size === 0) return 0;

  let toRestore: string[] = Array.from(filenames);
  try {
    const res = await fetch('/api/uploads/missing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filenames: toRestore }),
    });
    if (res.ok) {
      const json = await res.json();
      if (json?.success && Array.isArray(json.missing)) {
        toRestore = json.missing;
      }
    }
  } catch {
    /* Express offline: resolve into browser blob cache */
  }

  if (toRestore.length === 0) return 0;

  let restored = 0;
  // Concurrency 3 to keep network fast without flooding
  const queue = [...toRestore];
  const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
    while (queue.length > 0) {
      const fname = queue.shift();
      if (!fname) break;
      const blobUrl = await resolveMediaFallbackFromFirestore(`/uploads/${fname}`);
      if (blobUrl) restored += 1;
    }
  });
  await Promise.all(workers);

  return restored;
}

/**
 * Universal <img> onError handler: if /uploads/<file> is missing on the local Express container,
 * automatically fetches the photo from Firebase Firestore and replaces the broken image src.
 */
export function handleUploadImageError(
  event: React.SyntheticEvent<HTMLImageElement>,
  originalUrl?: string
): void {
  const img = event.currentTarget;
  const candidate = (originalUrl || img.getAttribute('src') || '').trim();
  if (!UPLOAD_URL_RE.test(candidate)) return;
  if (img.dataset.cloudFallbackAttempted === '1') return;
  img.dataset.cloudFallbackAttempted = '1';

  const cached = resolvedBlobCache.get(candidate);
  if (cached) {
    img.src = cached;
    return;
  }

  void resolveMediaFallbackFromFirestore(candidate).then((blobUrl) => {
    if (blobUrl && img.isConnected) {
      img.src = blobUrl;
    }
  });
}
