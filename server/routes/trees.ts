import express from 'express';
import fs from 'fs';
import path from 'path';
import { createIpRateLimiter, requireAdmin } from '../auth.js';
import {
  ALLOWED_CARD_FRAMES,
  DATA_DIR,
  TREE_FILE,
  VERSION_FILE,
  getTreeFilePath,
  isMainTreeId,
} from '../config.js';
import {
  buildSearchIndex,
  externalizeImages,
  extractTreeMeta,
  fileExists,
  invalidateTreeCaches,
  listTrees,
  readGlobalVersion,
  readTreeJson,
  withFileLock,
  writeGlobalVersion,
  writeJsonAtomically,
} from '../storage.js';

const fsp = fs.promises;

const guestRateLimiter = createIpRateLimiter({
  windowMs: 10 * 60 * 1000,
  maxRequests: 25,
  message: 'Забагато запитів. Будь ласка, зачекайте кілька хвилин.',
});

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function sanitizeStringArray(arr: unknown, maxLen = 64): string[] | undefined {
  if (!Array.isArray(arr)) return undefined;
  return arr
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= 128)
    .map((v) => v.trim())
    .slice(0, maxLen);
}

function sanitizeSuggestedFields(raw: unknown): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const allowedKeys = new Set([
    'firstName',
    'lastName',
    'maidenName',
    'patronymic',
    'nickname',
    'birthYear',
    'birthDate',
    'deathYear',
    'deathDate',
    'birthPlace',
    'deathPlace',
    'residencePlace',
    'profession',
    'notes',
  ]);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.has(k) || !allowedKeys.has(k)) continue;
    if (typeof v === 'string') {
      out[k] = v.trim().slice(0, 1000);
    } else if (typeof v === 'boolean') {
      out[k] = v;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function sanitizeProposalPerson(raw: Record<string, unknown>) {
  const cleanStr = (v: unknown, max = 300) =>
    typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined;
  const gender = raw.gender === 'male' || raw.gender === 'female' ? raw.gender : 'unknown';

  const proposalMetaRaw =
    raw.proposalMeta && typeof raw.proposalMeta === 'object' && !Array.isArray(raw.proposalMeta)
      ? (raw.proposalMeta as Record<string, unknown>)
      : null;

  const proposalMeta = proposalMetaRaw
    ? {
        targetPersonId: cleanStr(proposalMetaRaw.targetPersonId, 128) || '',
        relationType: cleanStr(proposalMetaRaw.relationType, 40) || 'other',
        authorUserId: cleanStr(proposalMetaRaw.authorUserId, 128),
        authorName: cleanStr(proposalMetaRaw.authorName, 120) || 'Гість',
        authorEmail: cleanStr(proposalMetaRaw.authorEmail, 160),
        note: cleanStr(proposalMetaRaw.note, 2000),
        createdAt: cleanStr(proposalMetaRaw.createdAt, 64) || new Date().toISOString(),
      }
    : undefined;

  return {
    id: cleanStr(raw.id, 128) || '',
    cardId: cleanStr(raw.cardId, 40),
    firstName: cleanStr(raw.firstName, 120) || '',
    lastName: cleanStr(raw.lastName, 120) || '',
    maidenName: cleanStr(raw.maidenName, 120),
    patronymic: cleanStr(raw.patronymic, 120),
    gender,
    birthYear: cleanStr(raw.birthYear, 20),
    birthDate: cleanStr(raw.birthDate, 40),
    isDeceased: typeof raw.isDeceased === 'boolean' ? raw.isDeceased : undefined,
    deathYear: cleanStr(raw.deathYear, 20),
    deathDate: cleanStr(raw.deathDate, 40),
    birthPlace: cleanStr(raw.birthPlace, 200),
    residencePlace: cleanStr(raw.residencePlace, 200),
    notes: cleanStr(raw.notes, 3000),
    x: typeof raw.x === 'number' && Number.isFinite(raw.x) ? Math.round(raw.x) : 0,
    y: typeof raw.y === 'number' && Number.isFinite(raw.y) ? Math.round(raw.y) : 0,
    parents: sanitizeStringArray(raw.parents) || [],
    spouses: sanitizeStringArray(raw.spouses) || [],
    children: sanitizeStringArray(raw.children) || [],
    siblings: sanitizeStringArray(raw.siblings),
    proposalMeta,
    isProposal: true,
    isGhost: undefined,
  };
}

export function createTreesRouter(): express.Router {
  const router = express.Router();

  // Global version endpoints
  router.get('/api/version', async (_req, res) => {
    try {
      return res.json({ success: true, version: await readGlobalVersion() });
    } catch (err) {
      console.error('Error reading global version:', err);
      return res.status(500).json({ success: false, error: 'Failed to read global version' });
    }
  });

  router.post('/api/version', requireAdmin, async (req, res) => {
    try {
      const rawVersion = req.body?.version;
      if (typeof rawVersion !== 'string' || !rawVersion.trim()) {
        return res.status(400).json({ success: false, error: 'Невірний формат версії' });
      }
      const savedVersion = await writeGlobalVersion(rawVersion);
      return res.json({ success: true, version: savedVersion });
    } catch (err) {
      console.error('Error updating global version:', err);
      return res.status(500).json({ success: false, error: 'Failed to update global version' });
    }
  });

  // Cached lists & cross-canvas search index
  router.get('/api/trees', async (_req, res) => {
    try {
      const { version, trees } = await listTrees();
      return res.json({ success: true, version, trees });
    } catch (err) {
      console.error('Error listing trees from server storage:', err);
      return res.status(500).json({ success: false, error: 'Failed to list trees' });
    }
  });

  router.get('/api/trees/search-index', async (_req, res) => {
    try {
      const trees = await buildSearchIndex();
      return res.json({ success: true, trees });
    } catch (err) {
      console.error('Error building search index:', err);
      return res.status(500).json({ success: false, error: 'Failed to build search index' });
    }
  });

  // Lightweight metadata endpoints for polling
  router.get('/api/tree/meta', async (_req, res) => {
    try {
      const data = await readTreeJson('my-family-tree');
      if (data) {
        return res.json({ success: true, meta: await extractTreeMeta(data, 'my-family-tree') });
      }
      return res.json({ success: true, meta: null });
    } catch (err) {
      console.error('Error reading main tree meta:', err);
      return res.status(500).json({ success: false, error: 'Failed to read tree meta' });
    }
  });

  router.get('/api/tree/:id/meta', async (req, res) => {
    try {
      const treeId = req.params.id;
      const data = await readTreeJson(treeId);
      if (data) {
        return res.json({ success: true, meta: await extractTreeMeta(data, treeId) });
      }
      return res.status(404).json({ success: false, error: 'Полотно не знайдено на сервері' });
    } catch (err) {
      console.error(`Error reading meta for tree ${req.params.id}:`, err);
      return res.status(500).json({ success: false, error: 'Failed to read tree meta' });
    }
  });

  // Read full tree endpoints (public read)
  router.get('/api/tree', async (_req, res) => {
    try {
      const data = await readTreeJson('my-family-tree');
      if (data) {
        data.version = await readGlobalVersion();
        return res.json({ success: true, data });
      }
      return res.json({ success: true, data: null });
    } catch (err) {
      console.error('Error reading tree from server storage:', err);
      return res.status(500).json({ success: false, error: 'Failed to read tree data' });
    }
  });

  router.get('/api/tree/:id', async (req, res) => {
    try {
      const treeId = req.params.id;
      const data = await readTreeJson(treeId);
      if (data) {
        data.version = await readGlobalVersion();
        return res.json({ success: true, data });
      }
      return res.status(404).json({ success: false, error: 'Полотно не знайдено на сервері' });
    } catch (err) {
      console.error(`Error reading tree ${req.params.id}:`, err);
      return res.status(500).json({ success: false, error: 'Failed to read tree data' });
    }
  });

  const saveTreeHandler = async (treeId: string, body: any, res: express.Response) => {
    if (!body || !body.persons || typeof body.persons !== 'object') {
      return res.status(400).json({ success: false, error: 'Invalid tree data structure' });
    }

    const filePath = getTreeFilePath(treeId);
    const isMain = isMainTreeId(treeId);

    const saved = await withFileLock(filePath, async () => {
      const { value: treeData } = await externalizeImages(body);
      if (await fileExists(VERSION_FILE)) {
        (treeData as any).version = await readGlobalVersion();
      } else if (
        typeof (treeData as any)?.version === 'string' &&
        (treeData as any).version.trim()
      ) {
        await writeJsonAtomically(VERSION_FILE, {
          version: (treeData as any).version.trim(),
          updatedAt: new Date().toISOString(),
        });
      }

      if (isMain && (await fileExists(TREE_FILE))) {
        await fsp.copyFile(TREE_FILE, path.join(DATA_DIR, 'tree.json.bak'));
      }

      await writeJsonAtomically(filePath, treeData);
      invalidateTreeCaches({ version: false });
      return treeData as any;
    });

    return res.json({
      success: true,
      updatedAt: saved?.updatedAt,
      version: saved?.version || 'v0.1',
      message: isMain
        ? 'Tree saved atomically to server'
        : `Tree ${treeId} saved atomically to server`,
    });
  };

  router.post('/api/tree', requireAdmin, async (req, res) => {
    try {
      return await saveTreeHandler('my-family-tree', req.body, res);
    } catch (err) {
      console.error('Error saving tree to server storage:', err);
      return res.status(500).json({ success: false, error: 'Failed to save tree data' });
    }
  });

  router.post('/api/tree/:id', requireAdmin, async (req, res) => {
    try {
      return await saveTreeHandler(String(req.params.id), req.body, res);
    } catch (err) {
      console.error(`Error saving tree ${req.params.id}:`, err);
      return res.status(500).json({ success: false, error: 'Failed to save tree data' });
    }
  });

  router.delete('/api/tree/:id', requireAdmin, async (req, res) => {
    try {
      const treeId = String(req.params.id);
      if (isMainTreeId(treeId)) {
        return res.status(400).json({ success: false, error: 'Головне дерево не можна видалити' });
      }
      const filePath = getTreeFilePath(treeId);
      await withFileLock(filePath, async () => {
        if (await fileExists(filePath)) {
          await fsp.unlink(filePath);
        }
        invalidateTreeCaches();
      });
      return res.json({ success: true, message: `Tree ${treeId} deleted from server` });
    } catch (err) {
      console.error(`Error deleting tree ${req.params.id}:`, err);
      return res.status(500).json({ success: false, error: 'Failed to delete tree data' });
    }
  });

  router.post('/api/tree/:id/rename', requireAdmin, async (req, res) => {
    try {
      const treeId = String(req.params.id);
      if (isMainTreeId(treeId)) {
        return res.status(400).json({
          success: false,
          error: 'Головна гілка ніколи не видаляється і не змінюється назва',
        });
      }

      const newTitle = req.body?.title?.trim();
      if (!newTitle) {
        return res
          .status(400)
          .json({ success: false, error: 'Назва полотна не може бути порожньою' });
      }

      const filePath = getTreeFilePath(treeId);
      const outcome = await withFileLock(filePath, async () => {
        if (!(await fileExists(filePath))) return 'not_found' as const;
        const data = JSON.parse(await fsp.readFile(filePath, 'utf-8'));
        data.title = newTitle.slice(0, 150);
        data.updatedAt = new Date().toISOString();
        await writeJsonAtomically(filePath, data);
        invalidateTreeCaches();
        return 'ok' as const;
      });

      if (outcome === 'not_found') {
        return res.status(404).json({ success: false, error: 'Полотно не знайдено на сервері' });
      }
      return res.json({ success: true, tree: { id: treeId, title: newTitle.slice(0, 150) } });
    } catch (err) {
      console.error(`Error renaming tree ${req.params.id}:`, err);
      return res.status(500).json({ success: false, error: 'Failed to rename tree data' });
    }
  });

  // Safe atomic endpoint for Guest feedback: append a clarification/memory or pending proposal card
  router.post('/api/tree/:id/guest-suggestion', guestRateLimiter, async (req, res) => {
    try {
      const treeId = String(req.params.id || 'my-family-tree');
      const filePath = getTreeFilePath(treeId);

      const result = await withFileLock(filePath, async () => {
        if (!(await fileExists(filePath))) {
          return { status: 404, body: { success: false, error: 'Полотно не знайдено на сервері' } };
        }

        const data = JSON.parse(await fsp.readFile(filePath, 'utf-8'));
        if (!data || !data.persons || typeof data.persons !== 'object') {
          return { status: 400, body: { success: false, error: 'Некоректна структура дерева' } };
        }

        const payload = req.body || {};
        const nowIso = new Date().toISOString();

        if (payload.kind === 'note') {
          const { personId, suggestion } = payload;
          if (!personId || typeof personId !== 'string' || !data.persons[personId]) {
            return { status: 404, body: { success: false, error: 'Картку особи не знайдено' } };
          }
          if (!suggestion || typeof suggestion.message !== 'string' || !suggestion.message.trim()) {
            return {
              status: 400,
              body: { success: false, error: 'Текст уточнення не може бути порожнім' },
            };
          }
          const safeSuggestion = {
            id:
              typeof suggestion.id === 'string' && suggestion.id && !FORBIDDEN_KEYS.has(suggestion.id)
                ? suggestion.id.slice(0, 128)
                : `gs_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            category: ['correction', 'memory', 'date_place', 'document_hint'].includes(
              suggestion.category
            )
              ? suggestion.category
              : 'correction',
            message: String(suggestion.message).trim().slice(0, 4000),
            suggestedFields: sanitizeSuggestedFields(suggestion.suggestedFields),
            authorUserId:
              typeof suggestion.authorUserId === 'string'
                ? suggestion.authorUserId.slice(0, 120)
                : 'guest',
            authorName:
              typeof suggestion.authorName === 'string' && suggestion.authorName.trim()
                ? suggestion.authorName.trim().slice(0, 120)
                : 'Гість',
            authorEmail:
              typeof suggestion.authorEmail === 'string'
                ? suggestion.authorEmail.slice(0, 160)
                : undefined,
            createdAt: typeof suggestion.createdAt === 'string' ? suggestion.createdAt : nowIso,
            status: 'pending',
          };

          const targetPerson = data.persons[personId];
          const existingList = Array.isArray(targetPerson.guestSuggestions)
            ? targetPerson.guestSuggestions
            : [];
          if (!existingList.some((s: any) => s.id === safeSuggestion.id)) {
            targetPerson.guestSuggestions = [...existingList, safeSuggestion];
          }
          data.updatedAt = nowIso;
          await writeJsonAtomically(filePath, data);
          invalidateTreeCaches();
          return {
            status: 200,
            body: { success: true, updatedAt: nowIso, suggestion: safeSuggestion },
          };
        }

        if (payload.kind === 'proposal-card') {
          const {
            proposalPerson,
            targetPersonId,
            linkedAsChildOf,
            linkedAsParentOf,
            linkedAsSpouseOf,
            linkedAsSiblingOf,
            connectionOverridesPatch,
          } = payload;

          if (
            !proposalPerson ||
            typeof proposalPerson !== 'object' ||
            Array.isArray(proposalPerson) ||
            typeof proposalPerson.id !== 'string' ||
            !proposalPerson.id.trim()
          ) {
            return {
              status: 400,
              body: { success: false, error: 'Некоректні дані картки-пропозиції' },
            };
          }
          if (!targetPersonId || typeof targetPersonId !== 'string' || !data.persons[targetPersonId]) {
            return { status: 404, body: { success: false, error: 'Цільову картку не знайдено' } };
          }

          const safeProposal = sanitizeProposalPerson(proposalPerson as Record<string, unknown>);
          const newId = safeProposal.id;
          if (!newId || FORBIDDEN_KEYS.has(newId) || data.persons[newId]) {
            return {
              status: 400,
              body: { success: false, error: 'Некоректний або зайнятий ідентифікатор картки' },
            };
          }

          data.persons[newId] = safeProposal;

          const appendUnique = (arr: unknown, idToAdd: string): string[] => {
            const base = Array.isArray(arr)
              ? arr.filter((x): x is string => typeof x === 'string')
              : [];
            return base.includes(idToAdd) ? base : [...base, idToAdd];
          };

          (Array.isArray(linkedAsChildOf) ? linkedAsChildOf : []).forEach((pid: unknown) => {
            if (typeof pid === 'string' && !FORBIDDEN_KEYS.has(pid) && data.persons[pid]) {
              data.persons[pid].children = appendUnique(data.persons[pid].children, newId);
            }
          });
          (Array.isArray(linkedAsParentOf) ? linkedAsParentOf : []).forEach((cid: unknown) => {
            if (typeof cid === 'string' && !FORBIDDEN_KEYS.has(cid) && data.persons[cid]) {
              data.persons[cid].parents = appendUnique(data.persons[cid].parents, newId);
            }
          });
          (Array.isArray(linkedAsSpouseOf) ? linkedAsSpouseOf : []).forEach((sid: unknown) => {
            if (typeof sid === 'string' && !FORBIDDEN_KEYS.has(sid) && data.persons[sid]) {
              data.persons[sid].spouses = appendUnique(data.persons[sid].spouses, newId);
            }
          });
          (Array.isArray(linkedAsSiblingOf) ? linkedAsSiblingOf : []).forEach((sibId: unknown) => {
            if (typeof sibId === 'string' && !FORBIDDEN_KEYS.has(sibId) && data.persons[sibId]) {
              data.persons[sibId].siblings = appendUnique(data.persons[sibId].siblings, newId);
            }
          });

          if (
            connectionOverridesPatch &&
            typeof connectionOverridesPatch === 'object' &&
            !Array.isArray(connectionOverridesPatch)
          ) {
            data.connectionOverrides = data.connectionOverrides || {};
            Object.entries(connectionOverridesPatch as Record<string, unknown>).forEach(([k, v]) => {
              if (!FORBIDDEN_KEYS.has(k) && k.includes(newId) && v && typeof v === 'object' && !Array.isArray(v)) {
                const meta = v as Record<string, unknown>;
                data.connectionOverrides[k] = {
                  verified: typeof meta.verified === 'boolean' ? meta.verified : false,
                  note: typeof meta.note === 'string' ? meta.note.slice(0, 500) : undefined,
                };
              }
            });
          }

          data.updatedAt = nowIso;
          await writeJsonAtomically(filePath, data);
          invalidateTreeCaches();
          return {
            status: 200,
            body: { success: true, updatedAt: nowIso, proposalPerson: safeProposal },
          };
        }

        return {
          status: 400,
          body: { success: false, error: 'Невідомий тип гостьової пропозиції' },
        };
      });

      return res.status(result.status).json(result.body);
    } catch (err) {
      console.error(`Error saving guest suggestion for tree ${req.params.id}:`, err);
      return res
        .status(500)
        .json({ success: false, error: 'Не вдалося зберегти пропозицію на сервері' });
    }
  });

  // Safe atomic endpoint for identified guests to customize only their own card appearance
  router.post('/api/tree/:id/guest-customize', guestRateLimiter, async (req, res) => {
    try {
      const treeId = String(req.params.id || 'my-family-tree');
      const filePath = getTreeFilePath(treeId);

      const result = await withFileLock(filePath, async () => {
        if (!(await fileExists(filePath))) {
          return { status: 404, body: { success: false, error: 'Полотно не знайдено на сервері' } };
        }

        const data = JSON.parse(await fsp.readFile(filePath, 'utf-8'));
        if (!data || !data.persons || typeof data.persons !== 'object') {
          return { status: 400, body: { success: false, error: 'Некоректна структура дерева' } };
        }

        const payload = req.body || {};
        const personId = typeof payload.personId === 'string' ? payload.personId.trim() : '';
        if (!personId || FORBIDDEN_KEYS.has(personId) || !data.persons[personId]) {
          return { status: 404, body: { success: false, error: 'Картку особи не знайдено' } };
        }

        const targetPerson = data.persons[personId];
        if (targetPerson.isBlankScreenshot) {
          return {
            status: 400,
            body: { success: false, error: 'Цю картку неможливо оформити як особисту' },
          };
        }

        if ('avatarUrl' in payload) {
          if (payload.avatarUrl === null || payload.avatarUrl === '') {
            delete targetPerson.avatarUrl;
          } else if (typeof payload.avatarUrl === 'string') {
            const rawUrl = payload.avatarUrl.trim();
            if (!rawUrl) {
              delete targetPerson.avatarUrl;
            } else if (/^data:image\//i.test(rawUrl)) {
              if (/^data:image\/svg\+xml/i.test(rawUrl)) {
                return {
                  status: 400,
                  body: { success: false, error: 'Формат SVG заборонено з міркувань безпеки' },
                };
              }
              const { value: extResult, count } = await externalizeImages({ avatarUrl: rawUrl });
              if (count === 0 || !extResult.avatarUrl?.startsWith('/uploads/')) {
                return {
                  status: 400,
                  body: { success: false, error: 'Некоректне або пошкоджене зображення' },
                };
              }
              targetPerson.avatarUrl = extResult.avatarUrl;
            } else if (
              (/^\/uploads\/[a-zA-Z0-9._-]+$/.test(rawUrl) && !/\.svg$/i.test(rawUrl)) ||
              /^https?:\/\//i.test(rawUrl)
            ) {
              targetPerson.avatarUrl = rawUrl.slice(0, 1024);
            } else {
              return {
                status: 400,
                body: { success: false, error: 'Некоректне посилання на аватарку' },
              };
            }
          }
        }

        if ('cardBgColor' in payload) {
          if (payload.cardBgColor === null || payload.cardBgColor === '') {
            delete targetPerson.cardBgColor;
          } else if (typeof payload.cardBgColor === 'string') {
            let hex = payload.cardBgColor.trim();
            if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
              hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
            }
            if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
              return {
                status: 400,
                body: { success: false, error: 'Некоректний формат кольору картки' },
              };
            }
            targetPerson.cardBgColor = hex.toLowerCase();
          }
        }

        if ('cardFrame' in payload) {
          if (payload.cardFrame === null || payload.cardFrame === '' || payload.cardFrame === 'none') {
            delete targetPerson.cardFrame;
          } else if (
            typeof payload.cardFrame === 'string' &&
            ALLOWED_CARD_FRAMES.has(payload.cardFrame.trim())
          ) {
            targetPerson.cardFrame = payload.cardFrame.trim();
          } else {
            return {
              status: 400,
              body: { success: false, error: 'Невідомий стиль рамки картки' },
            };
          }
        }

        const nowIso = new Date().toISOString();
        targetPerson.selfCustomizedAt = nowIso;
        data.updatedAt = nowIso;
        await writeJsonAtomically(filePath, data);
        invalidateTreeCaches();

        return {
          status: 200,
          body: {
            success: true,
            updatedAt: nowIso,
            personPatch: {
              avatarUrl: targetPerson.avatarUrl,
              cardBgColor: targetPerson.cardBgColor,
              cardFrame: targetPerson.cardFrame,
              selfCustomizedAt: targetPerson.selfCustomizedAt,
            },
          },
        };
      });

      return res.status(result.status).json(result.body);
    } catch (err) {
      console.error(`Error saving guest customization for tree ${req.params.id}:`, err);
      return res
        .status(500)
        .json({ success: false, error: 'Не вдалося зберегти оформлення на сервері' });
    }
  });

  return router;
}
