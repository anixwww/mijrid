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
  updateDoc,
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { FamilyTreeData, Person } from '../types/tree';
import { handleFirestoreError, OperationType } from './firestoreTreeService';
import { authHeaders, getAuthToken } from './auth';

const CHUNK_CHAR_SIZE = 480_000;
const MAX_CHUNKS = 60;
const CHUNK_UPLOAD_CONCURRENCY = 4;
const MAX_SAFE_MEDIA_BYTES = 20_500_000; // <= 57 chunks in base64, safely within Firestore 60-chunk / 25MB rule
const MAX_RAW_INPUT_BYTES = 50 * 1024 * 1024;
const UPLOAD_URL_RE = /^\/uploads\/([a-zA-Z0-9_.-]{3,160})$/;
const DATA_IMAGE_RE = /^data:(image\/[a-zA-Z0-9+.-]+)(?:;[^,]*)?;base64,(.+)$/i;

export type MediaUploadKind =
  | 'avatar'
  | 'metric'
  | 'album'
  | 'screenshot'
  | 'pet'
  | 'crest'
  | 'general';

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

const MIME_ALIAS_MAP: Record<string, string> = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'image/x-png': 'image/png',
  'image/x-ms-bmp': 'image/bmp',
  'image/vnd.microsoft.icon': 'image/x-icon',
  'image/ico': 'image/x-icon',
  'image/tif': 'image/tiff',
};

const STRICT_FIRESTORE_MIME_RE =
  /^image\/(png|jpeg|pjpeg|webp|gif|bmp|avif|tiff|x-icon|heic|heif)$/;

function stripUrlQueryHash(url: string): string {
  const trimmed = (url || '').trim();
  const qIdx = trimmed.indexOf('?');
  const hIdx = trimmed.indexOf('#');
  let end = trimmed.length;
  if (qIdx >= 0 && qIdx < end) end = qIdx;
  if (hIdx >= 0 && hIdx < end) end = hIdx;
  return trimmed.slice(0, end);
}

function detectMimeFromMagicBytes(bytes: Uint8Array): string | null {
  if (!bytes || bytes.length < 4) return null;
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  // PNG: 89 50 4E 47
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png';
  }
  // GIF: 47 49 46 38
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return 'image/gif';
  }
  // WEBP: RIFF....WEBP
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  // BMP: 42 4D
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return 'image/bmp';
  }
  // ICO: 00 00 01 00
  if (bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x01 && bytes[3] === 0x00) {
    return 'image/x-icon';
  }
  // TIFF: II*\0 or MM\0*
  if (
    (bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0x00) ||
    (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2a)
  ) {
    return 'image/tiff';
  }
  return null;
}

export function normalizeRasterMime(
  rawMime?: string,
  filename?: string,
  bytes?: Uint8Array
): string {
  if (bytes) {
    const magic = detectMimeFromMagicBytes(bytes);
    if (magic && STRICT_FIRESTORE_MIME_RE.test(magic)) return magic;
  }
  const clean = (rawMime || '').toLowerCase().split(';')[0].trim();
  const mapped = MIME_ALIAS_MAP[clean] || clean;
  if (STRICT_FIRESTORE_MIME_RE.test(mapped)) {
    return mapped;
  }
  if (filename) {
    const byExt = filenameToMime(filename);
    if (STRICT_FIRESTORE_MIME_RE.test(byExt)) return byExt;
  }
  return 'image/png';
}

function isAllowedRasterMime(mime: string): boolean {
  const clean = mime.toLowerCase().split(';')[0].trim();
  if (!clean.startsWith('image/') || clean.includes('svg')) return false;
  const mapped = MIME_ALIAS_MAP[clean] || clean;
  return STRICT_FIRESTORE_MIME_RE.test(mapped);
}

function mimeToExt(mime: string): string {
  const clean = normalizeRasterMime(mime);
  if (clean === 'image/jpeg' || clean === 'image/pjpeg') return 'jpg';
  if (clean === 'image/x-icon') return 'ico';
  if (clean === 'image/tiff') return 'tif';
  const sub = clean.replace(/^image\//, '');
  return EXT_MIME_MAP[sub] ? sub : 'png';
}

function filenameToMime(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || 'png';
  return EXT_MIME_MAP[ext] || 'image/png';
}

export function uploadUrlToMediaId(urlOrFilename: string): { mediaId: string; filename: string } | null {
  const clean = stripUrlQueryHash(urlOrFilename);
  const match = UPLOAD_URL_RE.exec(clean);
  const filename = match ? match[1] : /^[a-zA-Z0-9_.-]{3,160}$/.test(clean) ? clean : '';
  if (!filename) return null;
  const mediaId = filename.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  if (!mediaId) return null;
  return { mediaId, filename };
}

/**
 * Returns an already-resolved in-memory Blob URL for /uploads/<file> if cached,
 * preventing unnecessary failed requests or flicker right after Firebase upload.
 */
export function getResolvedMediaSrc(url?: string | null): string | undefined {
  if (typeof url !== 'string') return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('blob:') || trimmed.startsWith('data:')) return trimmed;
  const normalized = stripUrlQueryHash(trimmed);
  const cached = resolvedBlobCache.get(normalized);
  if (cached) return cached;
  return trimmed;
}

export function primeResolvedMediaCache(
  uploadUrl: string,
  blobOrBytes: Blob | Uint8Array,
  mimeType?: string
): string {
  const normalized = stripUrlQueryHash(uploadUrl);
  const existing = resolvedBlobCache.get(normalized);
  if (existing) return existing;

  let blob: Blob;
  if (blobOrBytes instanceof Blob) {
    blob = blobOrBytes;
  } else {
    const copy = new Uint8Array(blobOrBytes.byteLength);
    copy.set(blobOrBytes);
    blob = new Blob([copy.buffer], { type: mimeType || 'image/png' });
  }
  const blobUrl = URL.createObjectURL(blob);
  resolvedBlobCache.set(normalized, blobUrl);
  return blobUrl;
}

export function extractAllMediaUrlsFromTree(tree: FamilyTreeData | null | undefined): string[] {
  if (!tree) return [];
  const urls = new Set<string>();
  const addUrl = (val?: string | null) => {
    if (typeof val !== 'string') return;
    const trimmed = val.trim();
    if (!trimmed) return;
    const stripped = stripUrlQueryHash(trimmed);
    if (UPLOAD_URL_RE.test(stripped) || DATA_IMAGE_RE.test(trimmed)) {
      urls.add(UPLOAD_URL_RE.test(stripped) ? stripped : trimmed);
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

async function resizeBlobViaCanvas(
  sourceBlob: Blob,
  maxDimension: number,
  quality: number,
  preferredMime: 'image/webp' | 'image/jpeg' = 'image/webp'
): Promise<Blob | null> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return null;
  const objectUrl = URL.createObjectURL(sourceBlob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Decode error'));
      el.src = objectUrl;
    });

    const natW = img.naturalWidth || img.width;
    const natH = img.naturalHeight || img.height;
    if (!natW || !natH) return null;

    const scale = Math.min(1, maxDimension / Math.max(natW, natH));
    const width = Math.max(1, Math.round(natW * scale));
    const height = Math.max(1, Math.round(natH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);

    const encode = (mime: string, q: number) =>
      new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), mime, q));

    let out = await encode(preferredMime, quality);
    if (!out || (preferredMime === 'image/webp' && out.type !== 'image/webp')) {
      out = await encode('image/jpeg', Math.min(0.92, quality + 0.04));
    }
    return out;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function prepareImageForFirebase(
  file: File,
  kind: MediaUploadKind
): Promise<{ blob: Blob; bytes: Uint8Array; mimeType: string; ext: string }> {
  const initialBuf = new Uint8Array(await file.arrayBuffer());
  const initialMime = normalizeRasterMime(file.type, file.name, initialBuf);

  let workingBlob: Blob = new Blob([initialBuf], { type: initialMime });
  let workingBytes = initialBuf;
  let workingMime = initialMime;

  const isCompactSlot = kind === 'avatar' || kind === 'pet' || kind === 'crest';

  // Compact slots (avatars, pet avatars, clan crests): optimize photos > 250 KB for fast load & single chunk
  if (isCompactSlot && initialMime !== 'image/gif' && initialBuf.byteLength > 250_000) {
    const resized = await resizeBlobViaCanvas(workingBlob, 1024, 0.88, 'image/webp');
    if (resized && resized.size > 0 && resized.size < workingBytes.byteLength) {
      workingBlob = resized;
      workingBytes = new Uint8Array(await resized.arrayBuffer());
      workingMime = normalizeRasterMime(resized.type, undefined, workingBytes);
    }
  }

  // Metrics & Album & Screenshots: keep full original quality up to 20.5 MB;
  // only downscale if larger so it stays within Firestore's 60-chunk / 25 MB rule.
  if (workingBytes.byteLength > MAX_SAFE_MEDIA_BYTES) {
    const attempts: Array<{ maxDim: number; quality: number; mime: 'image/webp' | 'image/jpeg' }> = [
      { maxDim: 3200, quality: 0.9, mime: 'image/jpeg' },
      { maxDim: 2400, quality: 0.86, mime: 'image/jpeg' },
      { maxDim: 1800, quality: 0.82, mime: 'image/webp' },
      { maxDim: 1280, quality: 0.78, mime: 'image/webp' },
    ];
    for (const step of attempts) {
      const candidate = await resizeBlobViaCanvas(workingBlob, step.maxDim, step.quality, step.mime);
      if (candidate && candidate.size > 0 && candidate.size <= MAX_SAFE_MEDIA_BYTES) {
        workingBlob = candidate;
        workingBytes = new Uint8Array(await candidate.arrayBuffer());
        workingMime = normalizeRasterMime(candidate.type, undefined, workingBytes);
        break;
      }
    }
  }

  if (workingBytes.byteLength <= 0 || workingBytes.byteLength > MAX_SAFE_MEDIA_BYTES) {
    throw new Error(
      `Файл «${file.name || 'фото'}» перевищує допустимий ліміт Firebase (~20 МБ після оптимізації).`
    );
  }

  return {
    blob: workingBlob,
    bytes: workingBytes,
    mimeType: workingMime,
    ext: mimeToExt(workingMime),
  };
}

async function isMediaAlreadyInFirestore(mediaId: string): Promise<boolean> {
  const manifestPath = `media/${mediaId}`;
  try {
    const manifestSnap = await getDoc(doc(db, 'media', mediaId));
    if (!manifestSnap.exists()) return false;
    const data = manifestSnap.data() as { chunkCount?: unknown };
    const chunkCount = typeof data.chunkCount === 'number' ? data.chunkCount : 0;
    if (chunkCount <= 0 || chunkCount > MAX_CHUNKS) return false;
    const chunkSnaps = await Promise.all(
      Array.from({ length: chunkCount }, (_, i) =>
        getDoc(doc(db, 'media', mediaId, 'chunks', String(i)))
      )
    );
    return chunkSnaps.every((snap) => snap.exists());
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
  onProgress?: (percent: number) => void;
}): Promise<void> {
  const { mediaId, filename, mimeType, base64Data, totalBytes, ownerId, isPublic, onProgress } =
    params;
  const safeMime = normalizeRasterMime(mimeType, filename);
  const totalChunks = Math.ceil(base64Data.length / CHUNK_CHAR_SIZE);
  if (
    totalChunks < 1 ||
    totalChunks > MAX_CHUNKS ||
    totalBytes <= 0 ||
    totalBytes > MAX_SAFE_MEDIA_BYTES + 1_000_000
  ) {
    throw new Error(
      `Файл "${filename}" перевищує безпечний ліміт синхронізації Firebase (${Math.round(totalBytes / (1024 * 1024))} МБ).`
    );
  }

  const manifestRef = doc(db, 'media', mediaId);
  const manifestPath = `media/${mediaId}`;

  onProgress?.(16);

  // Check if an incomplete manifest already exists to avoid permission-denied on createdAt mutation
  let manifestWasCreated = false;
  try {
    const existingSnap = await getDoc(manifestRef);
    if (existingSnap.exists()) {
      await updateDoc(manifestRef, {
        filename: filename.slice(0, 160),
        mimeType: safeMime.slice(0, 80),
        isPublic: Boolean(isPublic),
        chunkCount: totalChunks,
        totalBytes,
        updatedAt: serverTimestamp(),
      });
    } else {
      manifestWasCreated = true;
      await setDoc(manifestRef, {
        id: mediaId,
        filename: filename.slice(0, 160),
        mimeType: safeMime.slice(0, 80),
        ownerId,
        isPublic: Boolean(isPublic),
        chunkCount: totalChunks,
        totalBytes,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, manifestPath);
  }

  onProgress?.(25);

  try {
    let completed = 0;
    const queue = Array.from({ length: totalChunks }, (_, i) => i);
    const workerCount = Math.min(CHUNK_UPLOAD_CONCURRENCY, totalChunks);

    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (queue.length > 0) {
          const i = queue.shift();
          if (i === undefined) break;
          const chunkId = String(i);
          const slice = base64Data.slice(i * CHUNK_CHAR_SIZE, (i + 1) * CHUNK_CHAR_SIZE);
          const chunkRef = doc(db, 'media', mediaId, 'chunks', chunkId);

          if (!manifestWasCreated) {
            const existingChunk = await getDoc(chunkRef);
            if (existingChunk.exists()) {
              const existingData = existingChunk.data() as { data?: string; index?: number } | undefined;
              if (existingData?.data !== slice) {
                await updateDoc(chunkRef, { data: slice });
              }
            } else {
              await setDoc(chunkRef, {
                id: chunkId,
                index: i,
                data: slice,
                createdAt: serverTimestamp(),
              });
            }
          } else {
            await setDoc(chunkRef, {
              id: chunkId,
              index: i,
              data: slice,
              createdAt: serverTimestamp(),
            });
          }

          completed += 1;
          const pct = Math.min(96, 25 + Math.round((completed / totalChunks) * 71));
          onProgress?.(pct);
        }
      })
    );
  } catch (err) {
    if (manifestWasCreated) {
      try {
        await deleteDoc(manifestRef);
      } catch {
        /* ignore cleanup error */
      }
    }
    handleFirestoreError(err, OperationType.WRITE, `${manifestPath}/chunks`);
  }
}

export interface FirebaseUploadResult {
  url: string;
  size: number;
  mimeType: string;
  deduplicated: boolean;
}

/**
 * Directly uploads a single photo (avatar, metric scan, everyday album photo, screenshot, etc.)
 * into Firebase Firestore /media/{mediaId} + /chunks/{chunkId}, caching an instant Blob URL in memory.
 */
export async function uploadImageToFirebase(
  file: File,
  options?: {
    kind?: MediaUploadKind;
    isPublic?: boolean;
    onProgress?: (percent: number) => void;
  }
): Promise<FirebaseUploadResult> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) {
    throw new Error(
      'Для завантаження фотографій у Firebase увійдіть через Google (кнопка вище або у меню Firebase).'
    );
  }
  if (!file || file.size === 0) {
    throw new Error('Обраний файл порожній або пошкоджений.');
  }
  const safeName = file.name || 'photo.png';
  if (file.type.toLowerCase().includes('svg') || /\.svg$/i.test(safeName)) {
    throw new Error('Формат SVG заборонено з міркувань безпеки. Використовуйте PNG, JPG або WebP.');
  }
  if (file.size > MAX_RAW_INPUT_BYTES) {
    throw new Error(`Файл «${safeName}» перевищує максимальний розмір 50 МБ.`);
  }

  options?.onProgress?.(6);
  const kind = options?.kind || 'general';
  const prepared = await prepareImageForFirebase(file, kind);

  options?.onProgress?.(12);
  const hash24 = await computeSha256Prefix24(prepared.bytes);
  const filename = `${hash24}.${prepared.ext}`;
  const uploadUrl = `/uploads/${filename}`;
  const parsed = uploadUrlToMediaId(filename);
  if (!parsed) {
    throw new Error('Не вдалося сформувати ідентифікатор медіафайлу.');
  }

  // Prime in-memory Blob URL immediately so UI previews render synchronously without broken <img> flicker
  primeResolvedMediaCache(uploadUrl, prepared.blob, prepared.mimeType);

  const alreadyExists = await isMediaAlreadyInFirestore(parsed.mediaId);
  if (alreadyExists) {
    options?.onProgress?.(100);
    return {
      url: uploadUrl,
      size: prepared.bytes.byteLength,
      mimeType: prepared.mimeType,
      deduplicated: true,
    };
  }

  const base64Data = await blobToBase64(prepared.blob);
  await uploadMediaPayloadToFirestore({
    mediaId: parsed.mediaId,
    filename: parsed.filename,
    mimeType: prepared.mimeType,
    base64Data,
    totalBytes: prepared.bytes.byteLength,
    ownerId: user.uid,
    isPublic: options?.isPublic !== false,
    onProgress: options?.onProgress,
  });

  // Best-effort non-blocking warm-up to Express local disk when admin token exists
  if (getAuthToken()) {
    void fetch('/api/uploads/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ filename: parsed.filename, dataBase64: base64Data }),
    }).catch(() => {});
  }

  options?.onProgress?.(100);
  return {
    url: uploadUrl,
    size: prepared.bytes.byteLength,
    mimeType: prepared.mimeType,
    deduplicated: false,
  };
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
        const mimeType = normalizeRasterMime(dataMatch[1]);
        if (!isAllowedRasterMime(mimeType)) continue;
        const base64Data = dataMatch[2];
        const bytes = base64ToUint8Array(base64Data);
        const hash24 = await computeSha256Prefix24(bytes);
        const ext = mimeToExt(mimeType);
        const filename = `${hash24}.${ext}`;
        const uploadUrl = `/uploads/${filename}`;
        const parsed = uploadUrlToMediaId(filename);
        replacements.set(rawUrl, uploadUrl);
        primeResolvedMediaCache(uploadUrl, bytes, mimeType);

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

      const cachedBlobUrl = resolvedBlobCache.get(stripUrlQueryHash(rawUrl));
      const res = await fetch(cachedBlobUrl || rawUrl);
      if (!res.ok) {
        failedFiles.push(parsed.filename);
        continue;
      }
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('text/html')) {
        failedFiles.push(parsed.filename);
        continue;
      }
      const blob = await res.blob();
      if (blob.size <= 0 || blob.size > MAX_SAFE_MEDIA_BYTES) {
        failedFiles.push(parsed.filename);
        continue;
      }
      const base64Data = await blobToBase64(blob);
      const mimeType = normalizeRasterMime(blob.type, parsed.filename);

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
  const normalized = stripUrlQueryHash(uploadUrl);
  if (!UPLOAD_URL_RE.test(normalized)) return null;

  const cached = resolvedBlobCache.get(normalized);
  if (cached) return cached;

  const inflight = inflightDownloads.get(normalized);
  if (inflight) return inflight;

  const task = (async (): Promise<string | null> => {
    const parsed = uploadUrlToMediaId(normalized);
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
      const mimeType = normalizeRasterMime(manifest.mimeType, parsed.filename, bytes);
      const blobCopy = new Uint8Array(bytes.byteLength);
      blobCopy.set(bytes);
      const blob = new Blob([blobCopy.buffer], { type: mimeType });
      const blobUrl = URL.createObjectURL(blob);
      resolvedBlobCache.set(normalized, blobUrl);

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
      inflightDownloads.delete(normalized);
    }
  })();

  inflightDownloads.set(normalized, task);
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
  const candidate = stripUrlQueryHash(originalUrl || img.getAttribute('src') || '');
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
