import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  ALLOWED_IMAGE_EXT,
  DATA_DIR,
  MIME_TO_EXT,
  TREE_FILE,
  TREES_DIR,
  UPLOADS_DIR,
  VERSION_FILE,
  getTreeFilePath,
} from './config.js';

const fsp = fs.promises;

// Per-key mutex queue to prevent concurrent read-modify-write races
const fileLocks = new Map<string, Promise<void>>();

export async function withFileLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = fileLocks.get(key) || Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  fileLocks.set(key, current);
  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (fileLocks.get(key) === current) {
      fileLocks.delete(key);
    }
  }
}

export async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await fsp.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function writeFileAtomically(filePath: string, content: string | Buffer): Promise<void> {
  const tempFile = `${filePath}.${crypto.randomUUID()}.tmp`;
  await fsp.writeFile(tempFile, content, typeof content === 'string' ? 'utf-8' : undefined);
  await fsp.rename(tempFile, filePath);
}

export async function writeJsonAtomically(filePath: string, data: unknown): Promise<void> {
  await writeFileAtomically(filePath, JSON.stringify(data, null, 2));
}

export function resolveImageExtension(mimeOrSubType?: string, filename?: string): string | null {
  if (mimeOrSubType) {
    const cleanMime = mimeOrSubType.split(';')[0].trim().toLowerCase();
    if (cleanMime.includes('svg')) return null;
    if (MIME_TO_EXT[cleanMime]) return MIME_TO_EXT[cleanMime];
    const sub = cleanMime.replace(/^image\//, '').replace('jpeg', 'jpg');
    if (ALLOWED_IMAGE_EXT.has(sub)) return sub;
  }
  if (filename) {
    const m = String(filename).toLowerCase().match(/\.([a-z0-9]+)$/);
    if (m) {
      const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
      if (ALLOWED_IMAGE_EXT.has(ext)) return ext;
    }
  }
  return null;
}

export function detectImageExtFromBuffer(buffer: Buffer): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpg';
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'png';
  }
  if (buffer.length >= 6) {
    const hdr6 = buffer.subarray(0, 6).toString('ascii');
    if (hdr6 === 'GIF87a' || hdr6 === 'GIF89a') return 'gif';
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp';
  }
  if (buffer.length >= 2 && buffer[0] === 0x42 && buffer[1] === 0x4d) {
    return 'bmp';
  }
  if (
    buffer.length >= 4 &&
    ((buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a && buffer[3] === 0x00) ||
      (buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[2] === 0x00 && buffer[3] === 0x2a))
  ) {
    return 'tiff';
  }
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x00 &&
    buffer[1] === 0x00 &&
    (buffer[2] === 0x01 || buffer[2] === 0x02) &&
    buffer[3] === 0x00
  ) {
    return 'ico';
  }
  if (buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = buffer.subarray(8, 12).toString('ascii').toLowerCase();
    if (brand === 'avif' || brand === 'avis') return 'avif';
    if (brand === 'heic' || brand === 'heix' || brand === 'hevc' || brand === 'hevx') return 'heic';
    if (brand === 'mif1' || brand === 'msf1' || brand === 'heif') return 'heif';
  }
  return null;
}

export async function saveUploadBufferAtomically(buffer: Buffer, ext: string): Promise<string> {
  const safeExt = ALLOWED_IMAGE_EXT.has(ext) ? (ext === 'jpeg' ? 'jpg' : ext) : 'jpg';
  const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 24);
  const name = `${hash}.${safeExt}`;
  const filePath = path.join(UPLOADS_DIR, name);
  if (!(await fileExists(filePath))) {
    await writeFileAtomically(filePath, buffer);
  }
  return `/uploads/${name}`;
}

const INLINE_IMAGE_RE = /^data:image\/([a-zA-Z0-9+.-]+);base64,/i;

export async function externalizeImages<T>(value: T): Promise<{ value: T; count: number }> {
  let count = 0;

  const walk = async (node: unknown): Promise<unknown> => {
    if (typeof node === 'string') {
      const m = node.length > 200 ? INLINE_IMAGE_RE.exec(node) : null;
      if (!m) return node;
      const mimeExt = resolveImageExtension(`image/${m[1]}`);
      if (!mimeExt) {
        // Reject SVG or unsupported inline image subtypes
        return node;
      }
      const buffer = Buffer.from(node.slice(m[0].length), 'base64');
      if (buffer.length === 0) return node;
      const detectedExt = detectImageExtFromBuffer(buffer);
      if (!detectedExt) return node;
      count += 1;
      return await saveUploadBufferAtomically(buffer, detectedExt);
    }
    if (Array.isArray(node)) {
      return Promise.all(node.map(walk));
    }
    if (node && typeof node === 'object') {
      const entries = await Promise.all(
        Object.entries(node as Record<string, unknown>).map(async ([k, v]) => [k, await walk(v)] as const)
      );
      return Object.fromEntries(entries);
    }
    return node;
  };

  return { value: (await walk(value)) as T, count };
}

export async function migrateInlineImages(): Promise<void> {
  const migrateFile = async (filePath: string, label: string, backupPath?: string) => {
    if (!(await fileExists(filePath))) return;
    try {
      const statBefore = await fsp.stat(filePath);
      const raw = await fsp.readFile(filePath, 'utf-8');
      const { value, count } = await externalizeImages(JSON.parse(raw));
      if (count === 0) return;
      if (backupPath && !(await fileExists(backupPath))) {
        await fsp.copyFile(filePath, backupPath);
      }
      await writeJsonAtomically(filePath, value);
      const statAfter = await fsp.stat(filePath);
      console.log(
        `[migrate] moved ${count} inline image(s) in ${label} to /uploads: ${(statBefore.size / 1048576).toFixed(1)} MB -> ${(statAfter.size / 1024).toFixed(0)} KB`
      );
    } catch (err) {
      console.error(`[migrate] failed for ${label}, file left untouched:`, err);
    }
  };

  await migrateFile(TREE_FILE, 'tree.json', path.join(DATA_DIR, 'tree.pre-externalize.json'));

  if (await fileExists(TREES_DIR)) {
    const files = (await fsp.readdir(TREES_DIR)).filter((f) => f.endsWith('.json'));
    for (const f of files) {
      await migrateFile(path.join(TREES_DIR, f), f);
    }
  }
}

// ---------------------------------------------------------------------------
// In-memory caches for global version, tree headers, and cross-canvas search index
// ---------------------------------------------------------------------------
export interface CachedTreeListItem {
  id: string;
  title: string;
  personCount: number;
  updatedAt: string;
  version: string;
  isMain: boolean;
}

export interface CachedSearchTree {
  treeId: string;
  treeTitle: string;
  isMain: boolean;
  updatedAt: string;
  persons: any[];
}

let cachedGlobalVersion: string | null = null;
let cachedTreesList: CachedTreeListItem[] | null = null;
let cachedSearchIndex: CachedSearchTree[] | null = null;

export function invalidateTreeCaches(options?: { version?: boolean }): void {
  cachedTreesList = null;
  cachedSearchIndex = null;
  if (options?.version) {
    cachedGlobalVersion = null;
  }
}

export async function readGlobalVersion(): Promise<string> {
  if (cachedGlobalVersion) return cachedGlobalVersion;

  try {
    if (await fileExists(VERSION_FILE)) {
      const raw = await fsp.readFile(VERSION_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.version === 'string' && parsed.version.trim()) {
        const version = parsed.version.trim();
        cachedGlobalVersion = version;
        return version;
      }
    }
  } catch (err) {
    console.warn('Error reading version.json:', err);
  }

  try {
    if (await fileExists(TREE_FILE)) {
      const raw = await fsp.readFile(TREE_FILE, 'utf-8');
      const data = JSON.parse(raw);
      if (data && typeof data.version === 'string' && data.version.trim()) {
        const version = data.version.trim();
        cachedGlobalVersion = version;
        return version;
      }
    }
  } catch (err) {
    console.warn('Error reading version from main tree:', err);
  }

  cachedGlobalVersion = 'v0.1';
  return cachedGlobalVersion;
}

export async function writeGlobalVersion(version: string): Promise<string> {
  const cleanVersion = String(version || '').trim() || 'v0.1';
  await withFileLock(VERSION_FILE, async () => {
    await writeJsonAtomically(VERSION_FILE, {
      version: cleanVersion,
      updatedAt: new Date().toISOString(),
    });
  });

  if (await fileExists(TREE_FILE)) {
    await withFileLock(TREE_FILE, async () => {
      try {
        const mainData = JSON.parse(await fsp.readFile(TREE_FILE, 'utf-8'));
        if (mainData && typeof mainData === 'object') {
          mainData.version = cleanVersion;
          await writeJsonAtomically(TREE_FILE, mainData);
        }
      } catch (err) {
        console.warn('Failed to update version in main tree.json:', err);
      }
    });
  }

  if (await fileExists(TREES_DIR)) {
    const files = (await fsp.readdir(TREES_DIR)).filter((f) => f.endsWith('.json'));
    await Promise.all(
      files.map(async (f) => {
        const filePath = path.join(TREES_DIR, f);
        await withFileLock(filePath, async () => {
          try {
            const data = JSON.parse(await fsp.readFile(filePath, 'utf-8'));
            if (data && typeof data === 'object') {
              data.version = cleanVersion;
              await writeJsonAtomically(filePath, data);
            }
          } catch (err) {
            console.warn(`Failed to update version in tree file ${f}:`, err);
          }
        });
      })
    );
  }

  cachedGlobalVersion = cleanVersion;
  invalidateTreeCaches();
  return cleanVersion;
}

export async function extractTreeMeta(data: any, fallbackId: string) {
  return {
    id: data?.id || fallbackId,
    title: data?.title || 'Головне родове дерево',
    version: (await readGlobalVersion()) || data?.version || 'v0.1',
    updatedAt: data?.updatedAt || '',
    personCount:
      data?.persons && typeof data.persons === 'object' ? Object.keys(data.persons).length : 0,
  };
}

export async function listTrees(): Promise<{ version: string; trees: CachedTreeListItem[] }> {
  const globalVersion = await readGlobalVersion();
  if (cachedTreesList) {
    return { version: globalVersion, trees: cachedTreesList };
  }

  const list: CachedTreeListItem[] = [];

  if (await fileExists(TREE_FILE)) {
    try {
      const data = JSON.parse(await fsp.readFile(TREE_FILE, 'utf-8'));
      list.push({
        id: 'my-family-tree',
        title: data.title || 'Головне родове дерево',
        personCount: Object.keys(data.persons || {}).length,
        updatedAt: data.updatedAt || new Date().toISOString(),
        version: globalVersion,
        isMain: true,
      });
    } catch (err) {
      console.warn('Error reading main tree header:', err);
    }
  }

  if (await fileExists(TREES_DIR)) {
    const files = (await fsp.readdir(TREES_DIR)).filter((f) => f.endsWith('.json'));
    const secondaryEntries = await Promise.all(
      files.map(async (f): Promise<CachedTreeListItem | null> => {
        try {
          const data = JSON.parse(await fsp.readFile(path.join(TREES_DIR, f), 'utf-8'));
          const id = data.id || f.replace(/\.json$/, '');
          return {
            id,
            title: data.title || 'Родове полотно',
            personCount: Object.keys(data.persons || {}).length,
            updatedAt: data.updatedAt || new Date().toISOString(),
            version: globalVersion,
            isMain: false,
          };
        } catch (err) {
          console.warn(`Error reading tree file ${f}:`, err);
          return null;
        }
      })
    );
    for (const entry of secondaryEntries) {
      if (entry) list.push(entry);
    }
  }

  cachedTreesList = list;
  return { version: globalVersion, trees: list };
}

function toSearchPersons(personsMap: Record<string, any> | undefined) {
  if (!personsMap || typeof personsMap !== 'object') return [];
  return Object.values(personsMap).map((p: any) => ({
    id: p.id,
    cardId: p.cardId,
    firstName: p.firstName || '',
    lastName: p.lastName || '',
    patronymic: p.patronymic,
    maidenName: p.maidenName,
    nickname: p.nickname,
    clanName: p.clanName,
    gender: p.gender || 'other',
    avatarUrl: p.avatarUrl,
    houseNumber: p.houseNumber,
    birthYear: p.birthYear,
    birthDate: p.birthDate,
    deathYear: p.deathYear,
    deathDate: p.deathDate,
    yearsDisplay: p.yearsDisplay,
    profession: p.profession,
    birthPlace: p.birthPlace,
    residencePlace: p.residencePlace,
    isDeceased: p.isDeceased,
    isGhost: p.isGhost,
    isBlankScreenshot: p.isBlankScreenshot,
    targetCanvasId: p.targetCanvasId,
    targetCanvasTitle: p.targetCanvasTitle,
    targetCanvasPersonId: p.targetCanvasPersonId,
    crossCanvasLinks: Array.isArray(p.crossCanvasLinks) ? p.crossCanvasLinks : undefined,
  }));
}

export async function buildSearchIndex(): Promise<CachedSearchTree[]> {
  if (cachedSearchIndex) return cachedSearchIndex;

  const trees: CachedSearchTree[] = [];

  if (await fileExists(TREE_FILE)) {
    try {
      const data = JSON.parse(await fsp.readFile(TREE_FILE, 'utf-8'));
      trees.push({
        treeId: 'my-family-tree',
        treeTitle: data.title || 'Головне родове дерево',
        isMain: true,
        updatedAt: data.updatedAt || '',
        persons: toSearchPersons(data.persons),
      });
    } catch (err) {
      console.warn('Error reading main tree for search index:', err);
    }
  }

  if (await fileExists(TREES_DIR)) {
    const files = (await fsp.readdir(TREES_DIR)).filter((f) => f.endsWith('.json'));
    const secondary = await Promise.all(
      files.map(async (f): Promise<CachedSearchTree | null> => {
        try {
          const data = JSON.parse(await fsp.readFile(path.join(TREES_DIR, f), 'utf-8'));
          const treeId = data.id || f.replace(/\.json$/, '');
          return {
            treeId,
            treeTitle: data.title || 'Родове полотно',
            isMain: false,
            updatedAt: data.updatedAt || '',
            persons: toSearchPersons(data.persons),
          };
        } catch (err) {
          console.warn(`Error reading tree file ${f} for search index:`, err);
          return null;
        }
      })
    );
    for (const item of secondary) {
      if (item) trees.push(item);
    }
  }

  cachedSearchIndex = trees;
  return trees;
}

export async function readTreeJson(treeId: string): Promise<any | null> {
  const filePath = getTreeFilePath(treeId);
  if (!(await fileExists(filePath))) return null;
  const raw = await fsp.readFile(filePath, 'utf-8');
  return JSON.parse(raw);
}
