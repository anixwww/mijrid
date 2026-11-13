/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Person, ConnectionMeta } from '../types/tree';
import { CARD_WIDTH, CARD_HEIGHT } from './treeLayout';

export type LayoutMode = 'classic' | 'radial' | 'butterfly' | 'snapGrid';

export interface LayoutOptions {
  mode?: LayoutMode;
  generationGap?: number; // Distance between generational tiers (default: 230px)
  cardGap?: number; // Minimum gap between adjacent cards/couples (default: 44px)
  branchGap?: number; // Gap between distinct family subtrees (default: 64px)
  focalPersonId?: string; // Central person for butterfly/radial modes
  preserveRootOrder?: boolean;
}

export interface LayoutResult {
  persons: Record<string, Person>;
  stats: {
    generationCount: number;
    unitCount: number;
    width: number;
    height: number;
  };
}

const COUPLE_WIDTH = CARD_WIDTH * 2 + 10; // 274px
const COUPLE_OFFSET_X = CARD_WIDTH + 10; // p2.x = p1.x + 142

interface FamilyUnit {
  id: string;
  type: 'couple' | 'single';
  memberIds: string[];
  generation: number;
  x: number;
  y: number;
  width: number;
  height: number;
  parentUnitIds: string[];
  childrenUnitIds: string[];
}

/**
 * Calculates strict generational tiers (0 = oldest ancestors, 1 = next, etc.)
 * Ensures that:
 * - gen(child) >= max(gen(parents)) + 1
 * - gen(spouse1) === gen(spouse2)
 * - min generation is normalized to 0
 */
export function computeStrictGenerations(
  persons: Record<string, Person>,
  connectionOverrides?: Record<string, ConnectionMeta>
): Record<string, number> {
  const generations: Record<string, number> = {};
  const personList = Object.values(persons);
  if (personList.length === 0) return {};

  personList.forEach((p) => {
    generations[p.id] = 0;
  });

  // Iterative relaxation to establish genealogical DAG tiers
  let changed = true;
  let iterations = 0;
  const maxIterations = Math.max(50, personList.length * 2);

  while (changed && iterations < maxIterations) {
    changed = false;
    iterations++;

    personList.forEach((p) => {
      // 1. Children must strictly be 1 generation below parents
      (p.parents || []).forEach((parentId) => {
        if (persons[parentId]) {
          const parentGen = generations[parentId] ?? 0;
          if (generations[p.id] <= parentGen) {
            generations[p.id] = parentGen + 1;
            changed = true;
          }
        }
      });

      // 2. Undivorced spouses must strictly be on the same generation tier
      (p.spouses || []).forEach((spouseId) => {
        if (persons[spouseId]) {
          const mKey = [p.id, spouseId].sort().join('::');
          const isDivorced = connectionOverrides?.[`marriage:${mKey}`]?.eventType === 'divorce';
          // Even divorced couples are typically on the same generation tier
          const maxG = Math.max(generations[p.id], generations[spouseId]);
          if (generations[p.id] !== maxG) {
            generations[p.id] = maxG;
            changed = true;
          }
          if (generations[spouseId] !== maxG) {
            generations[spouseId] = maxG;
            changed = true;
          }
        }
      });

      // 3. Siblings must share the same generation
      (p.siblings || []).forEach((siblingId) => {
        if (persons[siblingId]) {
          const maxG = Math.max(generations[p.id], generations[siblingId]);
          if (generations[p.id] !== maxG) {
            generations[p.id] = maxG;
            changed = true;
          }
          if (generations[siblingId] !== maxG) {
            generations[siblingId] = maxG;
            changed = true;
          }
        }
      });
    });
  }

  // Normalize so lowest generation is 0
  const allGens = Object.values(generations);
  const minGen = allGens.length > 0 ? Math.min(...allGens) : 0;
  if (minGen !== 0) {
    personList.forEach((p) => {
      generations[p.id] -= minGen;
    });
  }

  return generations;
}

/**
 * Builds cohesive family layout units:
 * - Undivorced married couple => 1 couple unit (width 218px)
 * - Single person / divorced person => 1 single unit (width 104px)
 */
function buildFamilyUnits(
  persons: Record<string, Person>,
  generations: Record<string, number>,
  connectionOverrides?: Record<string, ConnectionMeta>
): {
  units: FamilyUnit[];
  personToUnitMap: Record<string, FamilyUnit>;
} {
  const units: FamilyUnit[] = [];
  const personToUnitMap: Record<string, FamilyUnit> = {};
  const processedPersons = new Set<string>();

  const personList = Object.values(persons);

  personList.forEach((person) => {
    if (processedPersons.has(person.id)) return;

    // Check if this person has an active undivorced primary spouse
    const primarySpouseId = (person.spouses || []).find((sId) => {
      const sp = persons[sId];
      if (!sp || processedPersons.has(sId)) return false;
      const mKey = [person.id, sId].sort().join('::');
      const isDivorced = connectionOverrides?.[`marriage:${mKey}`]?.eventType === 'divorce';
      return !isDivorced;
    });

    if (primarySpouseId) {
      const spouse = persons[primarySpouseId];
      processedPersons.add(person.id);
      processedPersons.add(spouse.id);

      // Order left & right: male typically on left, or based on current position
      let p1 = person;
      let p2 = spouse;
      if (person.gender === 'female' && spouse.gender === 'male') {
        p1 = spouse;
        p2 = person;
      } else if (person.x > spouse.x) {
        p1 = spouse;
        p2 = person;
      }

      const gen = Math.max(generations[p1.id] ?? 0, generations[p2.id] ?? 0);
      const unit: FamilyUnit = {
        id: `unit:couple:${p1.id}:${p2.id}`,
        type: 'couple',
        memberIds: [p1.id, p2.id],
        generation: gen,
        x: 0,
        y: 0,
        width: COUPLE_WIDTH,
        height: CARD_HEIGHT,
        parentUnitIds: [],
        childrenUnitIds: [],
      };

      units.push(unit);
      personToUnitMap[p1.id] = unit;
      personToUnitMap[p2.id] = unit;
    } else {
      processedPersons.add(person.id);
      const gen = generations[person.id] ?? 0;
      const unit: FamilyUnit = {
        id: `unit:single:${person.id}`,
        type: 'single',
        memberIds: [person.id],
        generation: gen,
        x: 0,
        y: 0,
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        parentUnitIds: [],
        childrenUnitIds: [],
      };

      units.push(unit);
      personToUnitMap[person.id] = unit;
    }
  });

  // Link parent-child relationships between units
  units.forEach((unit) => {
    const parentUnitSet = new Set<string>();
    const childUnitSet = new Set<string>();

    unit.memberIds.forEach((mId) => {
      const p = persons[mId];
      if (!p) return;

      // Parents
      (p.parents || []).forEach((parentId) => {
        const pUnit = personToUnitMap[parentId];
        if (pUnit && pUnit.id !== unit.id) {
          parentUnitSet.add(pUnit.id);
        }
      });

      // Children
      (p.children || []).forEach((childId) => {
        const cUnit = personToUnitMap[childId];
        if (cUnit && cUnit.id !== unit.id) {
          childUnitSet.add(cUnit.id);
        }
      });
    });

    unit.parentUnitIds = Array.from(parentUnitSet);
    unit.childrenUnitIds = Array.from(childUnitSet);
  });

  return { units, personToUnitMap };
}

/**
 * CLASSIC GENERATIONAL TREE LAYOUT
 * - Strict horizontal tiers (Y = startY + gen * generationGap)
 * - Parents centered horizontally over their children groups
 * - Recursive subtree bounding boxes prevent line crossings
 * - Uniform card gaps & generational gaps
 */
function layoutClassic(
  persons: Record<string, Person>,
  generations: Record<string, number>,
  connectionOverrides?: Record<string, ConnectionMeta>,
  options: LayoutOptions = {}
): Record<string, Person> {
  const {
    generationGap = 230,
    cardGap = 44,
    branchGap = 64,
  } = options;

  const { units, personToUnitMap } = buildFamilyUnits(persons, generations, connectionOverrides);
  if (units.length === 0) return {};

  const unitMap = new Map<string, FamilyUnit>(units.map((u) => [u.id, u]));

  // Find root units (units with no parents inside the tree)
  const rootUnits = units.filter((u) => u.parentUnitIds.length === 0);
  // Sort roots by generation (earliest first), then by average current X
  rootUnits.sort((a, b) => {
    if (a.generation !== b.generation) return a.generation - b.generation;
    const avgXA = a.memberIds.reduce((sum, id) => sum + (persons[id]?.x || 0), 0) / a.memberIds.length;
    const avgXB = b.memberIds.reduce((sum, id) => sum + (persons[id]?.x || 0), 0) / b.memberIds.length;
    return avgXA - avgXB;
  });

  // Keep track of placed units to avoid infinite loops in cyclic or complex graphs
  const placedUnitIds = new Set<string>();

  // Helper: recursively compute subtree width and layout subtree
  function layoutSubtree(unit: FamilyUnit, currentLeftX: number): { width: number; centerX: number } {
    placedUnitIds.add(unit.id);

    // Get unplaced children of this unit
    const validChildUnits = unit.childrenUnitIds
      .map((id) => unitMap.get(id)!)
      .filter((c) => c && !placedUnitIds.has(c.id));

    // Sort children by birth year or current X
    validChildUnits.sort((a, b) => {
      const birthA = Math.min(...a.memberIds.map((id) => parseInt(persons[id]?.birthYear || '9999', 10) || 9999));
      const birthB = Math.min(...b.memberIds.map((id) => parseInt(persons[id]?.birthYear || '9999', 10) || 9999));
      if (birthA !== birthB) return birthA - birthB;
      const avgXA = a.memberIds.reduce((sum, id) => sum + (persons[id]?.x || 0), 0) / a.memberIds.length;
      const avgXB = b.memberIds.reduce((sum, id) => sum + (persons[id]?.x || 0), 0) / b.memberIds.length;
      return avgXA - avgXB;
    });

    if (validChildUnits.length === 0) {
      unit.x = currentLeftX;
      return { width: unit.width, centerX: unit.x + unit.width / 2 };
    }

    // Recursively layout all children side by side
    let childCursorX = currentLeftX;
    const childCenters: number[] = [];

    validChildUnits.forEach((child, index) => {
      const childLayout = layoutSubtree(child, childCursorX);
      childCenters.push(childLayout.centerX);
      childCursorX += childLayout.width + (index < validChildUnits.length - 1 ? cardGap : 0);
    });

    const childrenTotalWidth = childCursorX - currentLeftX;
    const childrenMidX = (childCenters[0] + childCenters[childCenters.length - 1]) / 2;

    if (childrenTotalWidth >= unit.width) {
      // Center parent over children midpoint
      unit.x = childrenMidX - unit.width / 2;
      return { width: childrenTotalWidth, centerX: childrenMidX };
    } else {
      // Parent is wider than children bundle: center children under parent
      unit.x = currentLeftX;
      const parentCenterX = unit.x + unit.width / 2;
      const shiftX = parentCenterX - childrenMidX;

      // Shift child subtrees so they are centered under parent
      validChildUnits.forEach((child) => {
        shiftSubtree(child, shiftX);
      });

      return { width: unit.width, centerX: parentCenterX };
    }
  }

  function shiftSubtree(unit: FamilyUnit, deltaX: number) {
    unit.x += deltaX;
    unit.childrenUnitIds.forEach((childId) => {
      const c = unitMap.get(childId);
      if (c && placedUnitIds.has(c.id)) {
        shiftSubtree(c, deltaX);
      }
    });
  }

  // Place each root tree side by side
  let treeCursorX = 100;
  rootUnits.forEach((root) => {
    if (placedUnitIds.has(root.id)) return;
    const result = layoutSubtree(root, treeCursorX);
    treeCursorX += result.width + branchGap;
  });

  // Handle any remaining unplaced units (disconnected nodes)
  units.forEach((u) => {
    if (!placedUnitIds.has(u.id)) {
      u.x = treeCursorX;
      treeCursorX += u.width + cardGap;
      placedUnitIds.add(u.id);
    }
  });

  // Set Y coordinates strictly by generation tier: Y = 100 + gen * generationGap
  units.forEach((unit) => {
    unit.y = 100 + unit.generation * generationGap;
  });

  // TIER COLLISION RESOLVER PASS:
  // Sweep left-to-right on each generation tier and ensure minimum cardGap between every adjacent unit
  const unitsByGen = new Map<number, FamilyUnit[]>();
  units.forEach((u) => {
    const list = unitsByGen.get(u.generation) || [];
    list.push(u);
    unitsByGen.set(u.generation, list);
  });

  // Sort tiers and adjust overlapping units
  Array.from(unitsByGen.keys())
    .sort((a, b) => a - b)
    .forEach((gen) => {
      const tierUnits = unitsByGen.get(gen)!;
      tierUnits.sort((a, b) => a.x - b.x);

      for (let i = 0; i < tierUnits.length - 1; i++) {
        const curr = tierUnits[i];
        const next = tierUnits[i + 1];
        const requiredNextX = curr.x + curr.width + cardGap;
        if (next.x < requiredNextX) {
          const shift = requiredNextX - next.x;
          shiftSubtree(next, shift);
        }
      }
    });

  // Map updated unit coordinates back to individual persons
  const updatedPersons: Record<string, Person> = {};
  Object.values(persons).forEach((p) => {
    const unit = personToUnitMap[p.id];
    if (!unit) {
      updatedPersons[p.id] = { ...p };
      return;
    }

    if (unit.type === 'couple') {
      const [id1, id2] = unit.memberIds;
      if (p.id === id1) {
        updatedPersons[p.id] = {
          ...p,
          x: Math.round(unit.x),
          y: Math.round(unit.y),
        };
      } else {
        updatedPersons[p.id] = {
          ...p,
          x: Math.round(unit.x + COUPLE_OFFSET_X),
          y: Math.round(unit.y),
        };
      }
    } else {
      updatedPersons[p.id] = {
        ...p,
        x: Math.round(unit.x),
        y: Math.round(unit.y),
      };
    }
  });

  return updatedPersons;
}

/**
 * RADIAL / SPHERICAL CONCENTRIC LAYOUT
 * - Root / earliest ancestor at the center
 * - Generations placed on concentric rings (spherical circles)
 * - Equal radius distance between generations
 * - Angles distributed cleanly to prevent overlaps
 */
function layoutRadial(
  persons: Record<string, Person>,
  generations: Record<string, number>,
  connectionOverrides?: Record<string, ConnectionMeta>,
  options: LayoutOptions = {}
): Record<string, Person> {
  const { focalPersonId } = options;
  const { units, personToUnitMap } = buildFamilyUnits(persons, generations, connectionOverrides);
  if (units.length === 0) return {};

  const personList = Object.values(persons);

  // Pick root / focal unit
  let focalUnit: FamilyUnit | undefined;
  if (focalPersonId && personToUnitMap[focalPersonId]) {
    focalUnit = personToUnitMap[focalPersonId];
  } else {
    // Choose root unit with generation 0 and most descendants
    const gen0Units = units.filter((u) => u.generation === 0);
    focalUnit = gen0Units[0] || units[0];
  }

  const centerX = 1600;
  const centerY = 1400;
  const RADIUS_STEP = 320; // Distance between concentric generation rings

  // Group units by generation relative to focal unit
  const focalGen = focalUnit.generation;
  const unitsByGen = new Map<number, FamilyUnit[]>();
  units.forEach((u) => {
    const relGen = Math.abs(u.generation - focalGen);
    const list = unitsByGen.get(relGen) || [];
    list.push(u);
    unitsByGen.set(relGen, list);
  });

  const updatedPersons: Record<string, Person> = {};
  const processedUnits = new Set<string>();

  // Center the focal unit
  focalUnit.x = centerX - focalUnit.width / 2;
  focalUnit.y = centerY - CARD_HEIGHT / 2;
  processedUnits.add(focalUnit.id);

  // For each generation ring, distribute units around the circumference
  Array.from(unitsByGen.keys())
    .sort((a, b) => a - b)
    .forEach((relGen) => {
      const ringUnits = unitsByGen.get(relGen)!.filter((u) => u.id !== focalUnit?.id);
      if (ringUnits.length === 0) return;

      const radius = relGen * RADIUS_STEP;
      const angleStep = (2 * Math.PI) / ringUnits.length;

      ringUnits.forEach((unit, idx) => {
        // Start angle at top (-PI/2) and rotate clockwise
        const angle = -Math.PI / 2 + idx * angleStep;
        unit.x = Math.round(centerX + radius * Math.cos(angle) - unit.width / 2);
        unit.y = Math.round(centerY + radius * Math.sin(angle) - CARD_HEIGHT / 2);
        processedUnits.add(unit.id);
      });
    });

  // Map to individual persons
  personList.forEach((p) => {
    const unit = personToUnitMap[p.id];
    if (!unit) {
      updatedPersons[p.id] = { ...p };
      return;
    }

    if (unit.type === 'couple') {
      const [id1] = unit.memberIds;
      if (p.id === id1) {
        updatedPersons[p.id] = { ...p, x: unit.x, y: unit.y };
      } else {
        updatedPersons[p.id] = { ...p, x: unit.x + COUPLE_OFFSET_X, y: unit.y };
      }
    } else {
      updatedPersons[p.id] = { ...p, x: unit.x, y: unit.y };
    }
  });

  return updatedPersons;
}

/**
 * BUTTERFLY / HOURGLASS BALANCED LAYOUT
 * - Focal person/couple placed at central level
 * - Ancestors branch UPWARDS in strict generational tiers (-Y)
 * - Descendants branch DOWNWARDS in strict generational tiers (+Y)
 */
function layoutButterfly(
  persons: Record<string, Person>,
  generations: Record<string, number>,
  connectionOverrides?: Record<string, ConnectionMeta>,
  options: LayoutOptions = {}
): Record<string, Person> {
  const { focalPersonId, generationGap = 230 } = options;
  const personList = Object.values(persons);
  if (personList.length === 0) return {};

  const focalId = focalPersonId && persons[focalPersonId]
    ? focalPersonId
    : personList[Math.floor(personList.length / 2)].id;

  const focalGen = generations[focalId] ?? 0;

  // Run classic layout first to get optimal horizontal distribution
  const classicPositions = layoutClassic(persons, generations, connectionOverrides, options);

  // Now adjust Y coordinates:
  // Nodes with gen <= focalGen are placed upwards from base
  // Nodes with gen > focalGen are placed downwards from base
  const baseY = 800;
  const updatedPersons: Record<string, Person> = {};

  Object.values(classicPositions).forEach((p) => {
    const gen = generations[p.id] ?? 0;
    const diff = gen - focalGen;
    const newY = baseY + diff * generationGap;

    updatedPersons[p.id] = {
      ...p,
      y: Math.round(newY),
    };
  });

  return updatedPersons;
}

/**
 * SNAP TO GENERATION GRID LAYOUT
 * - Keeps user's existing horizontal order
 * - Snaps every person to the exact generational Y coordinate
 * - Resolves horizontal overlaps
 */
function layoutSnapGrid(
  persons: Record<string, Person>,
  generations: Record<string, number>,
  connectionOverrides?: Record<string, ConnectionMeta>,
  options: LayoutOptions = {}
): Record<string, Person> {
  const { generationGap = 230, cardGap = 44 } = options;
  const { units, personToUnitMap } = buildFamilyUnits(persons, generations, connectionOverrides);
  if (units.length === 0) return {};

  // Preserve existing X average for units
  units.forEach((u) => {
    const avgX = u.memberIds.reduce((sum, id) => sum + (persons[id]?.x || 0), 0) / u.memberIds.length;
    u.x = avgX;
    u.y = 100 + u.generation * generationGap;
  });

  // Group by generation and sort by X to prevent overlaps
  const unitsByGen = new Map<number, FamilyUnit[]>();
  units.forEach((u) => {
    const list = unitsByGen.get(u.generation) || [];
    list.push(u);
    unitsByGen.set(u.generation, list);
  });

  Array.from(unitsByGen.keys()).forEach((gen) => {
    const tierUnits = unitsByGen.get(gen)!;
    tierUnits.sort((a, b) => a.x - b.x);

    for (let i = 0; i < tierUnits.length - 1; i++) {
      const curr = tierUnits[i];
      const next = tierUnits[i + 1];
      const requiredNextX = curr.x + curr.width + cardGap;
      if (next.x < requiredNextX) {
        next.x = requiredNextX;
      }
    }
  });

  const updatedPersons: Record<string, Person> = {};
  Object.values(persons).forEach((p) => {
    const unit = personToUnitMap[p.id];
    if (!unit) {
      updatedPersons[p.id] = { ...p };
      return;
    }

    if (unit.type === 'couple') {
      const [id1] = unit.memberIds;
      if (p.id === id1) {
        updatedPersons[p.id] = { ...p, x: Math.round(unit.x), y: Math.round(unit.y) };
      } else {
        updatedPersons[p.id] = { ...p, x: Math.round(unit.x + COUPLE_OFFSET_X), y: Math.round(unit.y) };
      }
    } else {
      updatedPersons[p.id] = { ...p, x: Math.round(unit.x), y: Math.round(unit.y) };
    }
  });

  return updatedPersons;
}

/**
 * Main Entry Point: Automatically adapts and arranges all tree cards
 */
export function autoArrangeTree(
  persons: Record<string, Person>,
  connectionOverrides?: Record<string, ConnectionMeta>,
  options: LayoutOptions = {}
): LayoutResult {
  const mode = options.mode || 'classic';
  const generations = computeStrictGenerations(persons, connectionOverrides);
  const genValues = Object.values(generations);
  const generationCount = genValues.length > 0 ? Math.max(...genValues) + 1 : 0;

  let arrangedPersons: Record<string, Person>;

  switch (mode) {
    case 'radial':
      arrangedPersons = layoutRadial(persons, generations, connectionOverrides, options);
      break;
    case 'butterfly':
      arrangedPersons = layoutButterfly(persons, generations, connectionOverrides, options);
      break;
    case 'snapGrid':
      arrangedPersons = layoutSnapGrid(persons, generations, connectionOverrides, options);
      break;
    case 'classic':
    default:
      arrangedPersons = layoutClassic(persons, generations, connectionOverrides, options);
      break;
  }

  // Calculate bounding box
  const placed = Object.values(arrangedPersons);
  const minX = placed.length > 0 ? Math.min(...placed.map((p) => p.x)) : 0;
  const maxX = placed.length > 0 ? Math.max(...placed.map((p) => p.x + CARD_WIDTH)) : 0;
  const minY = placed.length > 0 ? Math.min(...placed.map((p) => p.y)) : 0;
  const maxY = placed.length > 0 ? Math.max(...placed.map((p) => p.y + CARD_HEIGHT)) : 0;

  return {
    persons: arrangedPersons,
    stats: {
      generationCount,
      unitCount: Object.keys(persons).length,
      width: Math.max(0, maxX - minX),
      height: Math.max(0, maxY - minY),
    },
  };
}
