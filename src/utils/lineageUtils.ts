import { Person, ConnectionMeta, ClanCoatOfArmsItem } from '../types/tree';

export interface ClanInfo {
  name: string;
  count: number;
  color: string;
  bgColor: string;
  borderColor: string;
  badgeBg: string;
  badgeText: string;
  coatOfArmsUrl?: string;
  coatOfArmsMotto?: string;
  coatOfArmsDescription?: string;
}

// 8 harmonious heritage lineage colors (warm, earthy, distinguishable)
const CLAN_PALETTES = [
  {
    color: '#52525b', // Slate Gray
    bgColor: '#f4f4f5',
    borderColor: '#e4e4e7',
    badgeBg: '#e4e4e7',
    badgeText: '#27272a',
  },
  {
    color: '#b45309', // Amber / Ocher
    bgColor: '#fffbeb',
    borderColor: '#fde68a',
    badgeBg: '#fef3c7',
    badgeText: '#92400e',
  },
  {
    color: '#1d4ed8', // Sapphire / Indigo
    bgColor: '#eff6ff',
    borderColor: '#bfdbfe',
    badgeBg: '#dbeafe',
    badgeText: '#1e40af',
  },
  {
    color: '#c2410c', // Terracotta
    bgColor: '#fff7ed',
    borderColor: '#fed7aa',
    badgeBg: '#ffedd5',
    badgeText: '#9a3412',
  },
  {
    color: '#6d28d9', // Deep Purple / Royal
    bgColor: '#faf5ff',
    borderColor: '#e9d5ff',
    badgeBg: '#f3e8ff',
    badgeText: '#5b21b6',
  },
  {
    color: '#0f766e', // Teal / Pine
    bgColor: '#f0fdfa',
    borderColor: '#99f6e4',
    badgeBg: '#ccfbf1',
    badgeText: '#115e59',
  },
  {
    color: '#be123c', // Crimson / Ruby
    bgColor: '#fff1f2',
    borderColor: '#fecdd3',
    badgeBg: '#ffe4e6',
    badgeText: '#9f1239',
  },
  {
    color: '#475569', // Slate / Stone
    bgColor: '#f8fafc',
    borderColor: '#cbd5e1',
    badgeBg: '#e2e8f0',
    badgeText: '#334155',
  },
];

/**
 * Normalizes last name into clan root (e.g., "Коваленко", "Коваленківна" -> "Коваленко")
 */
export function getClanName(person: Person): string {
  if (person.clanName && person.clanName.trim()) {
    return person.clanName.trim();
  }
  const raw = (person.lastName || person.maidenName || '').trim();
  if (!raw || raw === '?') return 'Невідомий рід';

  // Normalize common Ukrainian gendered surname endings to common clan stem
  let clean = raw;
  if (clean.endsWith('ська')) clean = clean.slice(0, -4) + 'ський';
  else if (clean.endsWith('цька')) clean = clean.slice(0, -4) + 'цький';
  else if (clean.endsWith('івна')) clean = clean.slice(0, -4) + 'ів';
  else if (clean.endsWith('ова')) clean = clean.slice(0, -3) + 'ов';
  else if (clean.endsWith('єва')) clean = clean.slice(0, -3) + 'єв';
  return clean;
}

export interface BranchOption {
  name: string;
  label: string;
  count: number;
}

/**
 * Groups persons into selectable family/clan branches with counts,
 * sorting largest branches first and placing 'Невідомий рід' at the end.
 */
export function buildBranchOptions(
  persons: Record<string, Person>,
  excludePersonId?: string
): BranchOption[] {
  const counts = new Map<string, number>();
  let unknownHasDraft = false;

  Object.values(persons).forEach((p) => {
    if (excludePersonId && p.id === excludePersonId) return;
    const branch = getClanName(p);
    counts.set(branch, (counts.get(branch) || 0) + 1);
    if (branch === 'Невідомий рід' && (p.isBlankScreenshot || p.isGhost)) {
      unknownHasDraft = true;
    }
  });

  return Array.from(counts.entries())
    .sort((a, b) => {
      if (a[0] === 'Невідомий рід') return 1;
      if (b[0] === 'Невідомий рід') return -1;
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0], 'uk');
    })
    .map(([name, count]) => ({
      name,
      label:
        name === 'Невідомий рід' && unknownHasDraft
          ? 'Невідомий рід / Нерозшифровані'
          : name,
      count,
    }));
}

/**
 * Computes all distinct clans across persons and maps them to palette colors and coat of arms
 */
export function buildClanMap(
  persons: Record<string, Person>,
  clanCoatOfArms?: Record<string, ClanCoatOfArmsItem | string>
): Map<string, ClanInfo> {
  const counts = new Map<string, number>();

  Object.values(persons).forEach((p) => {
    const clan = getClanName(p);
    counts.set(clan, (counts.get(clan) || 0) + 1);
  });

  // Sort clans by frequency descending, putting 'Невідомий рід' at the end
  const sortedClans = Array.from(counts.entries()).sort((a, b) => {
    if (a[0] === 'Невідомий рід') return 1;
    if (b[0] === 'Невідомий рід') return -1;
    return b[1] - a[1];
  });

  const clanMap = new Map<string, ClanInfo>();
  sortedClans.forEach(([clan, count], index) => {
    const palette = CLAN_PALETTES[index % CLAN_PALETTES.length];
    const rawCrest = clanCoatOfArms?.[clan];
    const coatOfArmsUrl = typeof rawCrest === 'string' ? rawCrest : rawCrest?.url;
    const coatOfArmsMotto = typeof rawCrest === 'object' ? rawCrest?.motto : undefined;
    const coatOfArmsDescription = typeof rawCrest === 'object' ? rawCrest?.description : undefined;

    clanMap.set(clan, {
      name: clan,
      count,
      color: palette.color,
      bgColor: palette.bgColor,
      borderColor: palette.borderColor,
      badgeBg: palette.badgeBg,
      badgeText: palette.badgeText,
      coatOfArmsUrl,
      coatOfArmsMotto,
      coatOfArmsDescription,
    });
  });

  return clanMap;
}

/**
 * Helper to identify the father of a person
 */
function findFatherId(personId: string, persons: Record<string, Person>): string | null {
  const p = persons[personId];
  if (!p || !p.parents || p.parents.length === 0) return null;

  // 1. Explicit male parent
  const maleParent = p.parents.find((parentId) => persons[parentId]?.gender === 'male');
  if (maleParent) return maleParent;

  // 2. Parent married to female
  const marriedToFemale = p.parents.find((parentId) => {
    const parent = persons[parentId];
    return parent && parent.spouses?.some((sId) => persons[sId]?.gender === 'female');
  });
  if (marriedToFemale) return marriedToFemale;

  // 3. Fallback: non-female parent
  const nonFemale = p.parents.find((parentId) => persons[parentId]?.gender !== 'female');
  if (nonFemale) return nonFemale;

  return null;
}

/**
 * Helper to identify sons of a person (male line descendants)
 */
function findSonIds(personId: string, persons: Record<string, Person>): string[] {
  const p = persons[personId];
  if (!p || !p.children || p.children.length === 0) return [];

  return p.children.filter((childId) => {
    const child = persons[childId];
    return child && child.gender === 'male';
  });
}

/**
 * Traverses strictly along the male (patrilineal) line:
 * - Upwards: Only through fathers (father -> paternal grandfather -> paternal great-grandfather...)
 * - Downwards: Only through sons (sons -> grandsons through sons -> great-grandsons through sons...)
 * Excludes maternal lines, daughters' descendants, and spouses.
 */
export function getPatrilinealLineageIds(
  rootId: string,
  persons: Record<string, Person>
): {
  ancestorIds: Set<string>;
  descendantIds: Set<string>;
  allLineageIds: Set<string>;
} {
  const ancestorIds = new Set<string>();
  const descendantIds = new Set<string>();

  const root = persons[rootId];
  if (!root) {
    return { ancestorIds, descendantIds, allLineageIds: new Set<string>() };
  }

  // 1. Traverse Ancestors UP exclusively through fathers
  let currentAncestorId = findFatherId(rootId, persons);
  const visitedAncestors = new Set<string>();
  while (currentAncestorId && !visitedAncestors.has(currentAncestorId)) {
    visitedAncestors.add(currentAncestorId);
    ancestorIds.add(currentAncestorId);
    currentAncestorId = findFatherId(currentAncestorId, persons);
  }

  // 2. Traverse Descendants DOWN exclusively through sons
  // If root is female, she has no male-line descendants (her children's male line is via their father).
  // If root is male, trace down through his sons and sons' sons.
  if (root.gender === 'male') {
    const queue = [...findSonIds(rootId, persons)];
    const visitedDescendants = new Set<string>();

    while (queue.length > 0) {
      const sonId = queue.shift()!;
      if (!visitedDescendants.has(sonId)) {
        visitedDescendants.add(sonId);
        descendantIds.add(sonId);
        const nextSons = findSonIds(sonId, persons);
        queue.push(...nextSons);
      }
    }
  }

  const allLineageIds = new Set<string>([rootId, ...ancestorIds, ...descendantIds]);

  return { ancestorIds, descendantIds, allLineageIds };
}

/**
 * Lineage ID function now computes direct patrilineal male line
 */
export const getLineageIds = getPatrilinealLineageIds;

/**
 * Traverses recursively downwards to find all descendants of a person (for branch collapse)
 */
export function getAllDescendantIds(
  personId: string,
  persons: Record<string, Person>
): Set<string> {
  const descendants = new Set<string>();

  function walk(id: string) {
    const p = persons[id];
    if (!p) return;
    (p.children || []).forEach((cId) => {
      if (!descendants.has(cId) && persons[cId]) {
        descendants.add(cId);
        // Also hide spouse if that spouse is only connected to this branch
        const child = persons[cId];
        if (child && child.spouses) {
          child.spouses.forEach((sId) => {
            const spouse = persons[sId];
            if (spouse && (spouse.parents || []).length === 0) {
              descendants.add(sId);
            }
          });
        }
        walk(cId);
      }
    });
  }

  walk(personId);
  return descendants;
}

/**
 * Recursively collects all descendant IDs (children, grandchildren, etc.) and all their spouses
 * so that moving a root ancestor card cleanly moves the entire sub-tree branch together.
 */
export function getBranchDescendantIds(
  rootId: string,
  persons: Record<string, Person>
): Set<string> {
  const result = new Set<string>();
  const root = persons[rootId];
  if (!root) return result;

  // Include root's spouse(s)
  (root.spouses || []).forEach((sId) => {
    if (persons[sId]) result.add(sId);
  });

  function walk(id: string) {
    const p = persons[id];
    if (!p) return;
    (p.children || []).forEach((cId) => {
      if (!result.has(cId) && persons[cId]) {
        result.add(cId);
        // Include spouse of this child/descendant
        const child = persons[cId];
        if (child && child.spouses) {
          child.spouses.forEach((sId) => {
            if (persons[sId]) result.add(sId);
          });
        }
        walk(cId);
      }
    });
  }

  walk(rootId);
  return result;
}

/**
 * Swaps positions of two spouses in a couple card (left <-> right)
 */
export function swapSpousePositions(
  id1: string,
  id2: string,
  persons: Record<string, Person>
): Record<string, Person> {
  const p1 = persons[id1];
  const p2 = persons[id2];
  if (!p1 || !p2) return persons;

  const minX = Math.min(p1.x, p2.x);
  const minY = Math.min(p1.y, p2.y);

  // If p1 was on the left (or equal), make p2 on the left and p1 on the right
  const wasP1Left = p1.x < p2.x || (p1.x === p2.x && p1.gender === 'male');
  const SPOUSE_OFFSET = 142; // CARD_WIDTH (132) + COUPLE_GAP (10)

  const newP2X = wasP1Left ? minX : minX + SPOUSE_OFFSET;
  const newP1X = wasP1Left ? minX + SPOUSE_OFFSET : minX;

  return {
    ...persons,
    [id1]: {
      ...p1,
      x: newP1X,
      y: minY,
    },
    [id2]: {
      ...p2,
      x: newP2X,
      y: minY,
    },
  };
}

// Preset background color to corresponding crisp stroke color
const PRESET_BG_TO_STROKE: Record<string, string> = {
  '#e8efe9': '#64748b', // Neutral gray
  '#fbf7ee': '#b45309', // Vintage cream
  '#e0f2fe': '#0284c7', // Sky blue
  '#ffe4e6': '#e11d48', // Rose pink
  '#fef3c7': '#d97706', // Amber yellow
  '#f3e8ff': '#7c3aed', // Lilac purple
  '#ffffff': '#57534e', // Neutral stone
};

function deriveStrokeColor(hex: string): string {
  let c = hex.replace('#', '').trim();
  if (c.length === 3) c = c.split('').map((ch) => ch + ch).join('');
  if (c.length !== 6) return '#64748b';

  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);

  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (lum > 0.65) {
    const darkR = Math.max(0, Math.round(r * 0.45));
    const darkG = Math.max(0, Math.round(g * 0.45));
    const darkB = Math.max(0, Math.round(b * 0.45));
    return `#${darkR.toString(16).padStart(2, '0')}${darkG.toString(16).padStart(2, '0')}${darkB.toString(16).padStart(2, '0')}`;
  }
  return `#${c}`;
}

/**
 * Returns normalized color key and stroke color for a person's card
 */
export function getPersonVisualColor(
  person: Person,
  clanMap?: Record<string, ClanInfo>
): {
  key: string;
  bg: string;
  stroke: string;
  isCustom: boolean;
} {
  if (person.cardBgColor && person.cardBgColor.trim() !== '') {
    const raw = person.cardBgColor.toLowerCase().trim();
    const stroke = PRESET_BG_TO_STROKE[raw] || deriveStrokeColor(raw);
    return {
      key: `custom:${raw}`,
      bg: raw,
      stroke,
      isCustom: true,
    };
  }

  const clanName = getClanName(person);
  const clan = clanMap?.[clanName];
  if (clan) {
    return {
      key: `clan:${clanName.toLowerCase()}`,
      bg: clan.bgColor,
      stroke: clan.color,
      isCustom: false,
    };
  }

  return {
    key: 'default:#f4f4f5',
    bg: '#f4f4f5',
    stroke: '#64748b',
    isCustom: false,
  };
}

export function doPersonsShareColor(
  p1: Person,
  p2: Person,
  clanMap?: Record<string, ClanInfo>
): { shares: boolean; color?: string } {
  if (!p1 || !p2) return { shares: false };
  const c1 = getPersonVisualColor(p1, clanMap);
  const c2 = getPersonVisualColor(p2, clanMap);

  const rawBg1 = p1.cardBgColor?.toLowerCase().trim() || c1.bg.toLowerCase().trim();
  const rawBg2 = p2.cardBgColor?.toLowerCase().trim() || c2.bg.toLowerCase().trim();

  // If both have the same background color or same stroke color, and it's not the default neutral background
  if (rawBg1 === rawBg2 && rawBg1 !== '#f4f4f5' && rawBg1 !== '#e8efe9') {
    return { shares: true, color: c1.stroke };
  }

  if (c1.stroke === c2.stroke && c1.stroke !== '#64748b') {
    return { shares: true, color: c1.stroke };
  }

  if (c1.key === c2.key && !c1.key.startsWith('default:')) {
    return { shares: true, color: c1.stroke };
  }

  return { shares: false };
}

export interface CouplePair {
  id: string; // e.g. "couple:p1:p2"
  person1: Person; // left spouse
  person2: Person; // right spouse
  isDirectPair: boolean;
}

export interface TreeRenderUnits {
  couples: CouplePair[];
  singles: Person[];
  personToCoupleMap: Record<string, CouplePair>;
}

/**
 * Groups persons into married couples (Double Card units) and single individuals
 */
export function groupPersonsIntoRenderUnits(
  persons: Record<string, Person>,
  connectionOverrides?: Record<string, ConnectionMeta>
): TreeRenderUnits {
  const couples: CouplePair[] = [];
  const singles: Person[] = [];
  const processed = new Set<string>();
  const personToCoupleMap: Record<string, CouplePair> = {};

  const personList = Object.values(persons);

  personList.forEach((person) => {
    if (processed.has(person.id)) return;

    // Check if person has an adjacent spouse present in persons to form a unified Double Card
    // IMPORTANT: Divorced partners (eventType === 'divorce') must NEVER be paired as a Double Card!
    const primarySpouseId = (person.spouses || []).find((sId) => {
      const sp = persons[sId];
      if (!sp || processed.has(sId)) return false;

      const mKey = [person.id, sId].sort().join('::');
      const isDivorced = connectionOverrides?.[`marriage:${mKey}`]?.eventType === 'divorce';
      if (isDivorced) return false;

      // Pair as Double Card if placed adjacent to each other (handles both 114px legacy and 142px current offset)
      return Math.abs(person.x - sp.x) <= 166 && Math.abs(person.y - sp.y) <= 40;
    });

    if (primarySpouseId) {
      const spouse = persons[primarySpouseId];
      processed.add(person.id);
      processed.add(spouse.id);

      // Determine left and right spouse based on current x coordinates (respecting user swapping/placement)
      let leftP = person.x <= spouse.x ? person : spouse;
      let rightP = leftP.id === person.id ? spouse : person;

      const couple: CouplePair = {
        id: `couple:${leftP.id}:${rightP.id}`,
        person1: leftP,
        person2: rightP,
        isDirectPair: true,
      };

      couples.push(couple);
      personToCoupleMap[leftP.id] = couple;
      personToCoupleMap[rightP.id] = couple;
    } else {
      processed.add(person.id);
      singles.push(person);
    }
  });

  return { couples, singles, personToCoupleMap };
}

/**
 * Aligns spouse coordinates so they are placed snugly side-by-side as a unified double card
 */
export function normalizeCoupleCoordinates(
  persons: Record<string, Person>,
  connectionOverrides?: Record<string, ConnectionMeta>
): Record<string, Person> {
  const updated = { ...persons };
  const processed = new Set<string>();

  Object.values(persons).forEach((p) => {
    if (processed.has(p.id)) return;
    const spouseId = (p.spouses || []).find((sId) => {
      const sp = persons[sId];
      if (!sp || processed.has(sId)) return false;

      const mKey = [p.id, sId].sort().join('::');
      const isDivorced = connectionOverrides?.[`marriage:${mKey}`]?.eventType === 'divorce';
      if (isDivorced) return false;

      return Math.abs(p.x - sp.x) <= 166 && Math.abs(p.y - sp.y) <= 40;
    });

    if (spouseId) {
      processed.add(p.id);
      processed.add(spouseId);
      const spouse = persons[spouseId];
      // Respect current x positions (left is whichever has smaller x)
      const leftP = p.x <= spouse.x ? p : spouse;
      const rightP = (leftP.id === p.id) ? spouse : p;

      const expectedRightX = leftP.x + 142; // CARD_WIDTH (132) + COUPLE_GAP (10)
      const expectedRightY = leftP.y;

      if (rightP.x !== expectedRightX || rightP.y !== expectedRightY) {
        updated[rightP.id] = {
          ...rightP,
          x: expectedRightX,
          y: expectedRightY,
        };
      }
    }
  });

  return updated;
}

