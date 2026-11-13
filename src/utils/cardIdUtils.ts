import { FamilyTreeData, Person } from '../types/tree';

/**
 * Formats a card's visible short ID (e.g. "#12").
 */
export function formatCardId(person: Pick<Person, 'id' | 'cardId'>): string {
  if (person.cardId && person.cardId.trim()) {
    return `#${person.cardId.trim()}`;
  }
  return `#${person.id}`;
}

/**
 * Normalizes a numeric or string cardId token from user input (e.g. "#12", "id:12", "ID 12", "12" -> "12").
 */
export function normalizeCardIdQuery(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^(id\s*[:#-]?\s*|#)/i, '')
    .trim();
}

/**
 * Computes the next unused positive integer cardId across all cards in a tree.
 */
export function getNextCardId(persons: Record<string, Person>): string {
  let maxNum = 0;
  const used = new Set<string>();

  Object.values(persons).forEach((p) => {
    const cid = p.cardId?.trim();
    if (!cid) return;
    used.add(cid);
    if (/^\d+$/.test(cid)) {
      const n = parseInt(cid, 10);
      if (Number.isFinite(n) && n > maxNum) {
        maxNum = n;
      }
    }
  });

  let next = maxNum + 1;
  while (used.has(String(next))) {
    next += 1;
  }
  return String(next);
}

/**
 * Ensures every Person in the tree has a unique, persistent `cardId`.
 * Existing valid unique IDs are preserved; missing or colliding IDs are assigned sequentially.
 */
export function ensureTreeCardIds(tree: FamilyTreeData): { tree: FamilyTreeData; changed: boolean } {
  const personsMap = tree.persons || {};
  const used = new Set<string>();
  let maxNum = 0;
  let needsId: Person[] | null = null;
  let count = 0;

  for (const key in personsMap) {
    if (!Object.prototype.hasOwnProperty.call(personsMap, key)) continue;
    const p = personsMap[key];
    if (!p) continue;
    count += 1;
    const raw = p.cardId?.trim();
    if (raw && !used.has(raw)) {
      used.add(raw);
      if (/^\d+$/.test(raw)) {
        const n = parseInt(raw, 10);
        if (Number.isFinite(n) && n > maxNum) {
          maxNum = n;
        }
      }
    } else {
      if (!needsId) needsId = [];
      needsId.push(p);
    }
  }

  if (count === 0 || !needsId || needsId.length === 0) {
    return { tree, changed: false };
  }

  // Sort deterministically so initial numbering feels natural (oldest / top-left first)
  needsId.sort((a, b) => {
    const ay = a.birthYear ? parseInt(a.birthYear, 10) : Number.MAX_SAFE_INTEGER;
    const by = b.birthYear ? parseInt(b.birthYear, 10) : Number.MAX_SAFE_INTEGER;
    if (ay !== by && Number.isFinite(ay) && Number.isFinite(by)) return ay - by;
    if ((a.y ?? 0) !== (b.y ?? 0)) return (a.y ?? 0) - (b.y ?? 0);
    if ((a.x ?? 0) !== (b.x ?? 0)) return (a.x ?? 0) - (b.x ?? 0);
    return a.id.localeCompare(b.id);
  });

  const nextPersons: Record<string, Person> = { ...personsMap };
  let nextNum = maxNum + 1;

  needsId.forEach((p) => {
    while (used.has(String(nextNum))) {
      nextNum += 1;
    }
    const assigned = String(nextNum);
    used.add(assigned);
    nextNum += 1;
    nextPersons[p.id] = {
      ...nextPersons[p.id],
      cardId: assigned,
    };
  });

  return {
    tree: {
      ...tree,
      persons: nextPersons,
    },
    changed: true,
  };
}

/**
 * Scores how well a person matches a search query by their visible cardId or internal id.
 * 3 = exact match, 2 = startsWith match, 1 = substring match, 0 = no ID match.
 */
export function getPersonIdMatchScore(
  person: Pick<Person, 'id' | 'cardId'>,
  rawQuery: string
): number {
  const qRaw = rawQuery.trim().toLowerCase();
  if (!qRaw) return 0;

  const qNorm = normalizeCardIdQuery(qRaw);
  const cid = (person.cardId || '').trim().toLowerCase();
  const pid = (person.id || '').trim().toLowerCase();

  if (qNorm && cid) {
    if (cid === qNorm || `#${cid}` === qRaw) return 3;
    if (cid.startsWith(qNorm)) return 2;
    if (cid.includes(qNorm)) return 1;
  }

  if (pid === qRaw || (qNorm && pid === qNorm)) return 3;
  if (pid.startsWith(qRaw) || (qNorm && pid.startsWith(qNorm))) return 2;
  if (pid.includes(qRaw) || (qNorm && pid.includes(qNorm))) return 1;

  return 0;
}
