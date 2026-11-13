import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(SERVER_DIR, '..');
export const DATA_DIR = path.resolve(ROOT_DIR, 'data');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
export const TREES_DIR = path.join(DATA_DIR, 'trees');
export const TREE_FILE = path.join(DATA_DIR, 'tree.json');
export const VERSION_FILE = path.join(DATA_DIR, 'version.json');

export function ensureDataDirs(): void {
  for (const dir of [DATA_DIR, UPLOADS_DIR, TREES_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

// No hardcoded fallback password: admin mode stays disabled until ADMIN_PASSWORD is configured.
export const ADMIN_PASSWORD = (process.env.ADMIN_PASSWORD || '').trim();
export const SESSION_SECRET =
  (process.env.SESSION_SECRET || '').trim() || crypto.randomBytes(32).toString('hex');
export const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Strictly raster image extensions & MIME types (SVG excluded to prevent stored XSS)
export const ALLOWED_IMAGE_EXT = new Set([
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'avif',
  'bmp',
  'tif',
  'tiff',
  'ico',
  'heic',
  'heif',
]);

export const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/pjpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
  'image/x-ms-bmp': 'bmp',
  'image/tiff': 'tiff',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

export const RASTER_EXT_RE = /\.(jpe?g|png|gif|webp|avif|bmp|tiff?|ico|heic|heif)$/i;

export const ALLOWED_CARD_FRAMES = new Set([
  'none',
  'gilded_corners',
  'archival_double',
  'vyshyvanka',
  'botanical_wreath',
  'cozy_stitch',
  'royal_seal',
]);

export function isMainTreeId(treeId?: string): boolean {
  return (
    !treeId ||
    treeId === 'my-family-tree' ||
    treeId === 'main-tree' ||
    treeId === 'default-tree'
  );
}

export function getTreeFilePath(treeId: string): string {
  if (isMainTreeId(treeId)) return TREE_FILE;
  const cleanId = String(treeId).replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(TREES_DIR, `${cleanId}.json`);
}
