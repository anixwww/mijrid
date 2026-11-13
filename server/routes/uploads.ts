import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { requireAdmin } from '../auth.js';
import { RASTER_EXT_RE, UPLOADS_DIR } from '../config.js';
import {
  detectImageExtFromBuffer,
  fileExists,
  resolveImageExtension,
  saveUploadBufferAtomically,
  writeFileAtomically,
} from '../storage.js';

const fsp = fs.promises;

export function createUploadsRouter(): express.Router {
  const router = express.Router();

  // Raw binary image upload (Admin only, raster only). requireAdmin runs BEFORE buffering body.
  router.post(
    '/api/upload/raw',
    requireAdmin,
    express.raw({ type: () => true, limit: '50mb' }),
    async (req, res) => {
      try {
        const buffer = req.body;
        if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
          return res
            .status(400)
            .json({ success: false, error: 'Файл зображення порожній або не переданий' });
        }

        const rawFilenameHeader = req.headers['x-filename'];
        let filename = 'upload';
        if (typeof rawFilenameHeader === 'string' && rawFilenameHeader) {
          try {
            filename = decodeURIComponent(rawFilenameHeader);
          } catch {
            filename = rawFilenameHeader;
          }
        }

        const contentType =
          typeof req.headers['content-type'] === 'string' ? req.headers['content-type'] : '';

        if (/svg/i.test(contentType) || /\.svg$/i.test(filename)) {
          return res.status(400).json({
            success: false,
            error: 'Файли формату SVG заборонені з міркувань безпеки. Використовуйте PNG, JPG або WebP.',
          });
        }

        const magicExt = detectImageExtFromBuffer(buffer);
        const resolvedMimeExt = resolveImageExtension(contentType, filename);

        if (!magicExt && !resolvedMimeExt && !RASTER_EXT_RE.test(filename)) {
          return res
            .status(400)
            .json({ success: false, error: 'Файл не розпізнано як підтримуване зображення' });
        }

        const ext = magicExt || resolvedMimeExt;
        if (!ext) {
          return res
            .status(400)
            .json({ success: false, error: 'Непідтримуваний формат зображення' });
        }

        const url = await saveUploadBufferAtomically(buffer, ext);
        return res.json({ success: true, url, size: buffer.length, ext });
      } catch (err) {
        console.error('Error saving raw uploaded image:', err);
        return res
          .status(500)
          .json({ success: false, error: 'Не вдалося зберегти зображення на сервері' });
      }
    }
  );

  // Base64 image upload (Admin only, raster only)
  router.post('/api/upload', requireAdmin, async (req, res) => {
    try {
      const { image, filename } = req.body || {};
      if (!image || typeof image !== 'string') {
        return res.status(400).json({ success: false, error: 'No image provided' });
      }

      if (typeof filename === 'string' && /\.svg$/i.test(filename)) {
        return res.status(400).json({
          success: false,
          error: 'Файли формату SVG заборонені з міркувань безпеки.',
        });
      }

      let buffer: Buffer;
      let ext: string | null = null;

      if (image.startsWith('data:image/')) {
        const matches = image.match(/^data:(image\/[a-zA-Z0-9+.-]+)(?:;[^,]*)?;base64,(.+)$/);
        if (!matches || matches.length !== 3) {
          return res.status(400).json({ success: false, error: 'Invalid image data format' });
        }
        if (matches[1].toLowerCase().includes('svg')) {
          return res.status(400).json({
            success: false,
            error: 'Файли формату SVG заборонені з міркувань безпеки.',
          });
        }
        ext = resolveImageExtension(matches[1], filename);
        buffer = Buffer.from(matches[2], 'base64');
      } else {
        ext = resolveImageExtension(undefined, filename);
        buffer = Buffer.from(image, 'base64');
      }

      if (buffer.length === 0) {
        return res.status(400).json({ success: false, error: 'Empty image buffer' });
      }

      const magicExt = detectImageExtFromBuffer(buffer);
      const finalExt = magicExt || ext;
      if (!finalExt) {
        return res.status(400).json({
          success: false,
          error: 'Файл не розпізнано як підтримуване растрове зображення',
        });
      }

      const url = await saveUploadBufferAtomically(buffer, finalExt);
      return res.json({ success: true, url, size: buffer.length });
    } catch (err) {
      console.error('Error saving uploaded file:', err);
      return res.status(500).json({ success: false, error: 'Failed to upload image' });
    }
  });

  // Check which /uploads/<filename> files exist on Express disk (async)
  router.post('/api/uploads/missing', async (req, res) => {
    try {
      const filenames = Array.isArray(req.body?.filenames) ? req.body.filenames : [];
      const candidates: string[] = [];
      for (const rawName of filenames) {
        if (typeof rawName !== 'string') continue;
        const cleanName = path.basename(rawName.trim());
        if (/^[a-zA-Z0-9_.-]{3,160}$/.test(cleanName)) {
          candidates.push(cleanName);
        }
      }

      const checks = await Promise.all(
        candidates.map(async (cleanName) => ({
          cleanName,
          exists: await fileExists(path.join(UPLOADS_DIR, cleanName)),
        }))
      );
      const missing = checks.filter((c) => !c.exists).map((c) => c.cleanName);
      return res.json({ success: true, missing });
    } catch (err) {
      console.error('Error checking missing uploads:', err);
      return res.status(500).json({ success: false, error: 'Failed to check missing uploads' });
    }
  });

  // Restore a content-addressed image from Firebase Firestore back to disk (Admin only, raster only)
  router.post('/api/uploads/restore', requireAdmin, async (req, res) => {
    try {
      const rawFilename =
        typeof req.body?.filename === 'string' ? path.basename(req.body.filename.trim()) : '';
      const dataBase64 = typeof req.body?.dataBase64 === 'string' ? req.body.dataBase64.trim() : '';

      if (
        !rawFilename ||
        !/^[a-zA-Z0-9_.-]{3,160}$/.test(rawFilename) ||
        /\.svg$/i.test(rawFilename) ||
        !dataBase64
      ) {
        return res
          .status(400)
          .json({ success: false, error: 'Некоректні параметри відновлення файлу' });
      }

      const cleanBase64 =
        dataBase64.includes(',') && dataBase64.startsWith('data:')
          ? dataBase64.slice(dataBase64.indexOf(',') + 1)
          : dataBase64;
      const buffer = Buffer.from(cleanBase64, 'base64');
      if (buffer.length === 0) {
        return res.status(400).json({ success: false, error: 'Порожній вміст зображення' });
      }

      const magicExt = detectImageExtFromBuffer(buffer);
      if (!magicExt) {
        return res
          .status(400)
          .json({ success: false, error: 'Файл не є підтримуваним растровим зображенням' });
      }

      const hashMatch = /^([a-f0-9]{24})\.([a-z0-9]+)$/i.exec(rawFilename);
      if (hashMatch) {
        const expectedHash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 24);
        if (hashMatch[1].toLowerCase() !== expectedHash.toLowerCase()) {
          return res
            .status(400)
            .json({ success: false, error: 'Контрольна сума зображення не збігається' });
        }
      }

      const targetPath = path.join(UPLOADS_DIR, rawFilename);
      if (!(await fileExists(targetPath))) {
        await writeFileAtomically(targetPath, buffer);
      }
      return res.json({ success: true, url: `/uploads/${rawFilename}` });
    } catch (err) {
      console.error('Error restoring upload from cloud:', err);
      return res
        .status(500)
        .json({ success: false, error: 'Не вдалося відновити зображення на сервері' });
    }
  });

  // Expose fsp helper if ever needed
  void fsp;
  return router;
}
