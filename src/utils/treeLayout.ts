import { Person, ConnectionLine, ConnectionMeta, AnchorSide } from '../types/tree';
import { ClanInfo, doPersonsShareColor, getPersonVisualColor } from './lineageUtils';

export const CARD_WIDTH = 132;
export const CARD_HEIGHT = 142;
export const GEN_Y_SPACING = 160;
export const COUPLE_GAP = 10;
export const COUPLE_SPOUSE_OFFSET = CARD_WIDTH + COUPLE_GAP; // 142
export const COUPLE_TOTAL_WIDTH = CARD_WIDTH * 2 + COUPLE_GAP; // 274
export const COUPLE_ADJACENCY_THRESHOLD = CARD_WIDTH + 34; // 166

export type { AnchorSide };

function getCardAnchorPoint(
  p: Person,
  anchor?: AnchorSide,
  defaultAnchor: AnchorSide = 'right'
): { x: number; y: number; side: AnchorSide } {
  const side = anchor || defaultAnchor;
  switch (side) {
    case 'top':
      return { x: p.x + CARD_WIDTH / 2, y: p.y, side };
    case 'top-left':
      return { x: p.x + CARD_WIDTH * 0.25, y: p.y, side };
    case 'top-right':
      return { x: p.x + CARD_WIDTH * 0.75, y: p.y, side };
    case 'right':
      return { x: p.x + CARD_WIDTH, y: p.y + CARD_HEIGHT / 2, side };
    case 'right-top':
      return { x: p.x + CARD_WIDTH, y: p.y + CARD_HEIGHT * 0.3, side };
    case 'right-bottom':
      return { x: p.x + CARD_WIDTH, y: p.y + CARD_HEIGHT * 0.7, side };
    case 'bottom':
      return { x: p.x + CARD_WIDTH / 2, y: p.y + CARD_HEIGHT, side };
    case 'bottom-left':
      return { x: p.x + CARD_WIDTH * 0.25, y: p.y + CARD_HEIGHT, side };
    case 'bottom-right':
      return { x: p.x + CARD_WIDTH * 0.75, y: p.y + CARD_HEIGHT, side };
    case 'left':
      return { x: p.x, y: p.y + CARD_HEIGHT / 2, side };
    case 'left-top':
      return { x: p.x, y: p.y + CARD_HEIGHT * 0.3, side };
    case 'left-bottom':
      return { x: p.x, y: p.y + CARD_HEIGHT * 0.7, side };
  }
}

/**
 * Assigns automatic generation ranks to people based on their pedigree relationships:
 * Roots (great-grandparents / earliest ancestors) = 0
 * Children = 1, Grandchildren = 2, Great-grandchildren = 3, etc.
 */
export function calculateGenerations(persons: Record<string, Person>): Record<string, number> {
  const generations: Record<string, number> = {};
  const personList = Object.values(persons);
  if (personList.length === 0) return {};

  personList.forEach((p) => {
    generations[p.id] = 0;
  });

  // Iteratively relax generations
  let changed = true;
  let iterations = 0;
  while (changed && iterations < 25) {
    changed = false;
    iterations++;

    personList.forEach((p) => {
      // 1. Children must be deeper (higher generation number) than parents
      p.parents.forEach((parentId) => {
        if (persons[parentId]) {
          const parentGen = generations[parentId] ?? 0;
          if (generations[p.id] <= parentGen) {
            generations[p.id] = parentGen + 1;
            changed = true;
          }
        }
      });

      // 2. Spouses should share the same generation
      p.spouses.forEach((spouseId) => {
        if (persons[spouseId]) {
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
    });
  }

  return generations;
}

export interface HorizontalSegment {
  y: number;
  minX: number;
  maxX: number;
  lineId?: string;
}

export interface VerticalSegment {
  x: number;
  minY: number;
  maxY: number;
  lineId?: string;
}

/**
 * Creates silky-smooth SVG orthogonal paths with rounded corners and
 * arc jump-over bridges for intersecting lines.
 */
export function createRoundedOrthogonalPath(
  points: { x: number; y: number }[],
  radius: number = 8,
  crossingHorizontals?: HorizontalSegment[],
  currentLineId?: string
): string {
  if (points.length < 2) return '';

  // 1. Filter duplicate or near-identical consecutive points
  const clean: { x: number; y: number }[] = [];
  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    if (clean.length === 0) {
      clean.push(pt);
    } else {
      const prev = clean[clean.length - 1];
      if (Math.hypot(pt.x - prev.x, pt.y - prev.y) > 0.5) {
        clean.push(pt);
      }
    }
  }

  // 2. Collapse collinear segments
  const filtered: { x: number; y: number }[] = [];
  for (let i = 0; i < clean.length; i++) {
    if (i === 0 || i === clean.length - 1) {
      filtered.push(clean[i]);
    } else {
      const prev = filtered[filtered.length - 1];
      const curr = clean[i];
      const next = clean[i + 1];
      const isCollinearX = Math.abs(prev.x - curr.x) < 0.5 && Math.abs(curr.x - next.x) < 0.5;
      const isCollinearY = Math.abs(prev.y - curr.y) < 0.5 && Math.abs(curr.y - next.y) < 0.5;
      if (!isCollinearX && !isCollinearY) {
        filtered.push(curr);
      }
    }
  }

  if (filtered.length <= 1) return '';

  // Helper to render a straight segment from pStart to pEnd with bridge jump-overs if vertical
  const renderSegmentWithBridges = (
    pStart: { x: number; y: number },
    pEnd: { x: number; y: number }
  ): string => {
    const isVertical = Math.abs(pStart.x - pEnd.x) < 0.5;
    if (!isVertical || !crossingHorizontals || crossingHorizontals.length === 0) {
      return ` L ${pEnd.x} ${pEnd.y}`;
    }

    const x = pStart.x;
    const minY = Math.min(pStart.y, pEnd.y);
    const maxY = Math.max(pStart.y, pEnd.y);
    if (maxY - minY < 12) {
      return ` L ${pEnd.x} ${pEnd.y}`;
    }

    // Find all crossing horizontal segments
    const bridges: number[] = [];
    crossingHorizontals.forEach((h) => {
      if (currentLineId && h.lineId && h.lineId === currentLineId) return;
      // Must extend at least 4px on both sides of x to be a true crossing (not a corner or T-junction)
      if (h.minX < x - 4 && h.maxX > x + 4) {
        // Must be strictly inside the segment, away from corners and endpoints
        if (h.y > minY + 4 && h.y < maxY - 4) {
          bridges.push(h.y);
        }
      }
    });

    if (bridges.length === 0) {
      return ` L ${pEnd.x} ${pEnd.y}`;
    }

    // Sort in traversal direction
    const movingDown = pEnd.y > pStart.y;
    bridges.sort((a, b) => (movingDown ? a - b : b - a));

    // Deduplicate close crossings
    const cleanBridges: number[] = [];
    bridges.forEach((by) => {
      if (cleanBridges.length === 0 || Math.abs(by - cleanBridges[cleanBridges.length - 1]) >= 12) {
        cleanBridges.push(by);
      }
    });

    let segD = '';
    const bridgeRadius = 4.5; // refined elegant jump-over arc radius
    cleanBridges.forEach((by) => {
      if (movingDown) {
        segD += ` L ${x} ${by - bridgeRadius}`;
        // Clockwise arc from (x, by - r) to (x, by + r) bulges smoothly to +X
        segD += ` A ${bridgeRadius} ${bridgeRadius} 0 0 1 ${x} ${by + bridgeRadius}`;
      } else {
        segD += ` L ${x} ${by + bridgeRadius}`;
        // Counter-clockwise arc from (x, by + r) to (x, by - r) bulges smoothly to +X
        segD += ` A ${bridgeRadius} ${bridgeRadius} 0 0 0 ${x} ${by - bridgeRadius}`;
      }
    });

    segD += ` L ${pEnd.x} ${pEnd.y}`;
    return segD;
  };

  if (filtered.length === 2) {
    let d = `M ${filtered[0].x} ${filtered[0].y}`;
    d += renderSegmentWithBridges(filtered[0], filtered[1]);
    return d;
  }

  let d = `M ${filtered[0].x} ${filtered[0].y}`;
  for (let i = 1; i < filtered.length - 1; i++) {
    const pPrev = filtered[i - 1];
    const pCurr = filtered[i];
    const pNext = filtered[i + 1];

    const dPrev = Math.hypot(pCurr.x - pPrev.x, pCurr.y - pPrev.y);
    const dNext = Math.hypot(pNext.x - pCurr.x, pNext.y - pCurr.y);
    const r = Math.min(radius, dPrev / 2, dNext / 2);

    if (r < 1) {
      d += renderSegmentWithBridges(filtered[i - 1], pCurr);
      continue;
    }

    const vPrevX = (pCurr.x - pPrev.x) / dPrev;
    const vPrevY = (pCurr.y - pPrev.y) / dPrev;
    const vNextX = (pNext.x - pCurr.x) / dNext;
    const vNextY = (pNext.y - pCurr.y) / dNext;

    const b1x = pCurr.x - vPrevX * r;
    const b1y = pCurr.y - vPrevY * r;
    const b2x = pCurr.x + vNextX * r;
    const b2y = pCurr.y + vNextY * r;

    // Segment from previous corner exit (or start) to current corner entry b1
    const segStart = i === 1 ? filtered[0] : {
      x: filtered[i - 1].x + ((pCurr.x - filtered[i - 1].x) / dPrev) * (Math.min(radius, dPrev / 2)),
      y: filtered[i - 1].y + ((pCurr.y - filtered[i - 1].y) / dPrev) * (Math.min(radius, dPrev / 2)),
    };
    d += renderSegmentWithBridges(segStart, { x: b1x, y: b1y });

    // Smooth rounded corner
    d += ` Q ${pCurr.x} ${pCurr.y} ${b2x} ${b2y}`;
  }

  // Final segment to last point
  const lastIdx = filtered.length - 1;
  const secondLast = filtered[lastIdx - 1];
  const dLast = Math.hypot(filtered[lastIdx].x - secondLast.x, filtered[lastIdx].y - secondLast.y);
  const rLast = Math.min(radius, dLast / 2);
  const finalStart = {
    x: secondLast.x + ((filtered[lastIdx].x - secondLast.x) / dLast) * rLast,
    y: secondLast.y + ((filtered[lastIdx].y - secondLast.y) / dLast) * rLast,
  };
  d += renderSegmentWithBridges(finalStart, filtered[lastIdx]);

  return d;
}

/**
 * Calculates adaptive anchor attachment points between two cards
 * examining the full perimeter of cards and relative offset angle.
 */
function getOptimalAnchorPoints(
  p1: Person,
  p2: Person,
  preferredFrom?: AnchorSide,
  preferredTo?: AnchorSide
): { from: { x: number; y: number; side: AnchorSide }; to: { x: number; y: number; side: AnchorSide } } {
  if (preferredFrom && preferredTo) {
    return {
      from: getCardAnchorPoint(p1, preferredFrom),
      to: getCardAnchorPoint(p2, preferredTo),
    };
  }

  const c1x = p1.x + CARD_WIDTH / 2;
  const c1y = p1.y + CARD_HEIGHT / 2;
  const c2x = p2.x + CARD_WIDTH / 2;
  const c2y = p2.y + CARD_HEIGHT / 2;

  const dx = c2x - c1x;
  const dy = c2y - c1y;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  // Near horizontal level (same generation tier)
  if (absDy <= CARD_HEIGHT * 0.45) {
    const fromSide: AnchorSide = dx > 0 ? 'right' : 'left';
    const toSide: AnchorSide = dx > 0 ? 'left' : 'right';
    return {
      from: getCardAnchorPoint(p1, preferredFrom || fromSide),
      to: getCardAnchorPoint(p2, preferredTo || toSide),
    };
  }

  // Pure vertical descent/ascent
  if (absDx <= CARD_WIDTH * 0.35) {
    const fromSide: AnchorSide = dy > 0 ? 'bottom' : 'top';
    const toSide: AnchorSide = dy > 0 ? 'top' : 'bottom';
    return {
      from: getCardAnchorPoint(p1, preferredFrom || fromSide),
      to: getCardAnchorPoint(p2, preferredTo || toSide),
    };
  }

  // Diagonal / complex displacement: route along corner perimeter anchors
  if (absDx >= absDy * 0.75) {
    const fromSide: AnchorSide = dx > 0 ? (dy > 0 ? 'right-bottom' : 'right-top') : (dy > 0 ? 'left-bottom' : 'left-top');
    const toSide: AnchorSide = dx > 0 ? (dy > 0 ? 'left-top' : 'left-bottom') : (dy > 0 ? 'right-top' : 'right-bottom');
    return {
      from: getCardAnchorPoint(p1, preferredFrom || fromSide),
      to: getCardAnchorPoint(p2, preferredTo || toSide),
    };
  } else {
    const fromSide: AnchorSide = dy > 0 ? (dx > 0 ? 'bottom-right' : 'bottom-left') : (dx > 0 ? 'top-right' : 'top-left');
    const toSide: AnchorSide = dy > 0 ? (dx > 0 ? 'top-left' : 'top-right') : (dx > 0 ? 'bottom-left' : 'bottom-right');
    return {
      from: getCardAnchorPoint(p1, preferredFrom || fromSide),
      to: getCardAnchorPoint(p2, preferredTo || toSide),
    };
  }
}

/**
 * Checks whether a person is actively paired in an undivorced CoupleCard unit
 * and determines their relative side within that couple unit ('left' | 'right').
 */
export function getPersonCoupleContext(
  person: Person,
  persons: Record<string, Person>,
  connectionOverrides?: Record<string, ConnectionMeta>
): { isInCouple: boolean; partner?: Person; sideInCouple?: 'left' | 'right' } {
  if (!person || !person.spouses || !Array.isArray(person.spouses)) return { isInCouple: false };

  for (const sId of person.spouses) {
    const sp = persons[sId];
    if (!sp) continue;

    const mKey = [person.id, sId].sort().join('::');
    const isDivorced = connectionOverrides?.[`marriage:${mKey}`]?.eventType === 'divorce';
    if (isDivorced) continue;

    // Check if adjacent as a unified CoupleCard pair (supports legacy 114px and current 142px offset)
    if (Math.abs(person.x - sp.x) <= COUPLE_ADJACENCY_THRESHOLD && Math.abs(person.y - sp.y) <= 40) {
      const isLeft = person.x < sp.x;
      return {
        isInCouple: true,
        partner: sp,
        sideInCouple: isLeft ? 'left' : 'right',
      };
    }
  }

  return { isInCouple: false };
}

/**
 * Anti-overlapping Adaptive Orthogonal Routing for Connections:
 * Detects overlapping horizontal distributor bars and vertical lines across family branches,
 * and dynamically reroutes conflicting segments into offset routing tracks (lanes).
 * Incorporates genealogical credibility (достовірність) and archival citations.
 */
export function generateConnections(
  persons: Record<string, Person>,
  connectionOverrides?: Record<string, ConnectionMeta>,
  defaultVerifiedColor: string = '#475569',
  clanMap?: Record<string, ClanInfo>
): ConnectionLine[] {
  if (!persons || typeof persons !== 'object') return [];

  const processedMarriages = new Set<string>();
  const processedParentGroups = new Set<string>();
  const processedSiblingGroups = new Set<string>();

  const getMarriageKey = (id1: string, id2: string) => [id1, id2].sort().join('::');
  const getParentsKey = (parents: string[]) => [...parents].sort().join('::');

  // Track existing line segments to prevent overlapping lines
  const occupiedHorizontalSegments: HorizontalSegment[] = [];
  const occupiedVerticalSegments: VerticalSegment[] = [];

  interface SpecLine extends ConnectionLine {
    pointsList?: { x: number; y: number }[][];
  }

  const specLines: SpecLine[] = [];
  const allHorizontalSegments: HorizontalSegment[] = [];

  const registerLine = (line: ConnectionLine, pointsList?: { x: number; y: number }[][]) => {
    specLines.push({ ...line, pointsList });
    if (pointsList) {
      pointsList.forEach((pts) => {
        for (let i = 0; i < pts.length - 1; i++) {
          const p1 = pts[i];
          const p2 = pts[i + 1];
          if (Math.abs(p1.y - p2.y) < 0.5 && Math.abs(p1.x - p2.x) > 1) {
            allHorizontalSegments.push({
              y: p1.y,
              minX: Math.min(p1.x, p2.x),
              maxX: Math.max(p1.x, p2.x),
              lineId: line.id,
            });
          }
        }
      });
    }
  };

  const doesHOverlap = (testY: number, minX: number, maxX: number, thresholdY: number = 8) => {
    return occupiedHorizontalSegments.some(
      (seg) =>
        Math.abs(seg.y - testY) < thresholdY &&
        Math.max(seg.minX, minX) < Math.min(seg.maxX, maxX) - 5
    );
  };

  // Normalize CoupleCard visual coordinates in a shallow lookup map so SVG anchors,
  // couple bridges, and card-collision avoidance match CoupleCard's exact rendered box.
  const visualPersons: Record<string, Person> = { ...persons };
  const couplePartnerMap: Record<string, string> = {};
  const processedVisualCouples = new Set<string>();
  Object.values(persons).forEach((p) => {
    if (!p || processedVisualCouples.has(p.id) || !p.spouses) return;
    const spouseId = p.spouses.find((sId) => {
      const sp = persons[sId];
      if (!sp || processedVisualCouples.has(sId)) return false;
      const mKey = [p.id, sId].sort().join('::');
      const isDivorced = connectionOverrides?.[`marriage:${mKey}`]?.eventType === 'divorce';
      if (isDivorced) return false;
      return Math.abs(p.x - sp.x) <= COUPLE_ADJACENCY_THRESHOLD && Math.abs(p.y - sp.y) <= 40;
    });
    if (spouseId) {
      processedVisualCouples.add(p.id);
      processedVisualCouples.add(spouseId);
      const sp = persons[spouseId];
      const leftP = p.x <= sp.x ? p : sp;
      const rightP = leftP.id === p.id ? sp : p;
      const coupleX = Math.min(leftP.x, rightP.x);
      const coupleY = Math.min(leftP.y, rightP.y);
      visualPersons[leftP.id] = { ...leftP, x: coupleX, y: coupleY };
      visualPersons[rightP.id] = { ...rightP, x: coupleX + COUPLE_SPOUSE_OFFSET, y: coupleY };
      couplePartnerMap[leftP.id] = rightP.id;
      couplePartnerMap[rightP.id] = leftP.id;
    }
  });

  const doesHOverlapCard = (testY: number, x1: number, x2: number, ignoreIds: string[] = []) => {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    return Object.values(visualPersons).some((p) => {
      if (!p || ignoreIds.includes(p.id)) return false;
      const pMinX = p.x;
      const pMaxX = p.x + CARD_WIDTH;
      const pMinY = p.y;
      const pMaxY = p.y + CARD_HEIGHT;
      const xOverlap = Math.max(minX, pMinX) < Math.min(maxX, pMaxX) - 5;
      const yOverlap = testY > pMinY - 6 && testY < pMaxY + 6;
      return xOverlap && yOverlap;
    });
  };

  const doesVOverlap = (testX: number, minY: number, maxY: number, thresholdX: number = 8) => {
    const cutsThroughCard = Object.values(visualPersons).some(
      (p) => testX > p.x + 2 && testX < p.x + CARD_WIDTH - 2 && maxY > p.y + 2 && minY < p.y + CARD_HEIGHT - 2
    );
    if (cutsThroughCard) return true;

    return occupiedVerticalSegments.some(
      (seg) =>
        Math.abs(seg.x - testX) < thresholdX &&
        Math.max(seg.minY, minY) < Math.min(seg.maxY, maxY) - 5
    );
  };

  const parentGroups: Record<string, { parents: string[]; children: string[] }> = {};
  const personList = Object.values(visualPersons);

  personList.forEach((person) => {
    if (person && person.parents && Array.isArray(person.parents) && person.parents.length > 0) {
      const validParents = person.parents.filter((pid) => !!visualPersons[pid]);
      if (validParents.length > 0) {
        let effectiveParents = [...validParents];
        // If child only has 1 parent listed, but that parent is part of an active couple card:
        if (effectiveParents.length === 1) {
          const singleParent = visualPersons[effectiveParents[0]];
          const activePartnerId = singleParent ? couplePartnerMap[singleParent.id] : undefined;
          if (activePartnerId && !effectiveParents.includes(activePartnerId)) {
            effectiveParents.push(activePartnerId);
          }
        }
        const pKey = getParentsKey(effectiveParents);
        if (!parentGroups[pKey]) {
          parentGroups[pKey] = { parents: [...effectiveParents].sort(), children: [] };
        }
        parentGroups[pKey].children.push(person.id);
      }
    }
  });

  // 1. Draw Marriages
  personList.forEach((person) => {
    if (!person || !person.spouses || !Array.isArray(person.spouses)) return;

    person.spouses.forEach((spouseId) => {
      const spouse = visualPersons[spouseId];
      if (!spouse) return;

      const mKey = getMarriageKey(person.id, spouse.id);
      if (processedMarriages.has(mKey)) return;
      processedMarriages.add(mKey);

      let [leftP, rightP] = person.x <= spouse.x ? [person, spouse] : [spouse, person];
      const override = connectionOverrides?.[`marriage:${mKey}`];
      const isDivorced = override?.eventType === 'divorce';

      if (!isDivorced && couplePartnerMap[leftP.id] === rightP.id) {
        return; // Adjacent CoupleCard handles its own marriage medallion representation
      }
      
      let fromAnchor = override?.fromAnchor;
      let toAnchor = override?.toAnchor;

      let startPt: { x: number; y: number; side: AnchorSide };
      let endPt: { x: number; y: number; side: AnchorSide };

      if (isDivorced) {
        const ctxLeft = getPersonCoupleContext(leftP, visualPersons, connectionOverrides);
        const ctxRight = getPersonCoupleContext(rightP, visualPersons, connectionOverrides);

        const leftBlockedByPartner = ctxLeft.isInCouple && ctxLeft.sideInCouple === 'left' && rightP.x > leftP.x;
        const rightBlockedByPartner = ctxRight.isInCouple && ctxRight.sideInCouple === 'right' && leftP.x < rightP.x;

        if (leftBlockedByPartner || rightBlockedByPartner) {
          startPt = getCardAnchorPoint(leftP, fromAnchor || 'top');
          endPt = getCardAnchorPoint(rightP, toAnchor || 'top');
        } else {
          startPt = getCardAnchorPoint(leftP, fromAnchor || 'right');
          endPt = getCardAnchorPoint(rightP, toAnchor || 'left');
        }
      } else {
        const anchors = getOptimalAnchorPoints(leftP, rightP, fromAnchor, toAnchor);
        startPt = anchors.from;
        endPt = anchors.to;
      }

      let d = '';
      let midX = (startPt.x + endPt.x) / 2;
      let midY = (startPt.y + endPt.y) / 2;
      let ptsList: { x: number; y: number }[][] = [];

      if (startPt.side === 'top' && endPt.side === 'top') {
        let routeY = Math.min(startPt.y, endPt.y) - 22;
        let offset = 0;
        const minX = Math.min(startPt.x, endPt.x);
        const maxX = Math.max(startPt.x, endPt.x);
        const ignoreCardIds = [leftP.id, rightP.id];

        while (
          doesHOverlap(routeY, minX, maxX) ||
          doesHOverlapCard(routeY, minX, maxX, ignoreCardIds)
        ) {
          offset -= 14;
          routeY = Math.min(startPt.y, endPt.y) - 22 + offset;
          if (Math.abs(offset) > 180) break;
        }

        const pts = [
          { x: startPt.x, y: startPt.y },
          { x: startPt.x, y: routeY },
          { x: endPt.x, y: routeY },
          { x: endPt.x, y: endPt.y },
        ];
        ptsList = [pts];
        d = createRoundedOrthogonalPath(pts, 8, occupiedHorizontalSegments, `marriage:${mKey}`);

        occupiedHorizontalSegments.push({ y: routeY, minX, maxX });
        occupiedVerticalSegments.push({ x: startPt.x, minY: routeY, maxY: startPt.y });
        occupiedVerticalSegments.push({ x: endPt.x, minY: routeY, maxY: endPt.y });

        midX = (startPt.x + endPt.x) / 2;
        midY = routeY;
      } else if (
        (startPt.side === 'right' && endPt.side === 'left') ||
        (startPt.side === 'left' && endPt.side === 'right')
      ) {
        const pLeft = startPt.x <= endPt.x ? startPt : endPt;
        const pRight = startPt.x <= endPt.x ? endPt : startPt;

        if (Math.abs(pLeft.y - pRight.y) < 8) {
          if (!isDivorced && Math.abs(pRight.x - pLeft.x) <= 24) {
            d = '';
            ptsList = [];
          } else {
            let routeY = pLeft.y;
            let offset = 0;
            const ignoreCardIds = [leftP.id, rightP.id];

            while (
              doesHOverlap(routeY, pLeft.x, pRight.x) ||
              doesHOverlapCard(routeY, pLeft.x, pRight.x, ignoreCardIds)
            ) {
              offset = offset === 0 ? CARD_HEIGHT / 2 + 16 : offset > 0 ? -offset : -offset + 16;
              routeY = pLeft.y + offset;
              if (Math.abs(offset) > 300) break;
            }

            if (routeY === pLeft.y) {
              const pts = [{ x: pLeft.x, y: pLeft.y }, { x: pRight.x, y: pLeft.y }];
              ptsList = [pts];
              d = `M ${pLeft.x} ${pLeft.y} L ${pRight.x} ${pLeft.y}`;
              occupiedHorizontalSegments.push({ y: pLeft.y, minX: pLeft.x, maxX: pRight.x });
            } else {
              const pts = [
                { x: pLeft.x, y: pLeft.y },
                { x: pLeft.x + 8, y: routeY },
                { x: pRight.x - 8, y: routeY },
                { x: pRight.x, y: pRight.y },
              ];
              ptsList = [pts];
              d = createRoundedOrthogonalPath(pts, 8, occupiedHorizontalSegments, `marriage:${mKey}`);
              occupiedHorizontalSegments.push({ y: routeY, minX: pLeft.x, maxX: pRight.x });
              midY = routeY;
            }
          }
        } else {
          let stepX = (pLeft.x + pRight.x) / 2;
          let vOffset = 0;
          const minY = Math.min(pLeft.y, pRight.y);
          const maxY = Math.max(pLeft.y, pRight.y);
          while (doesVOverlap(stepX, minY, maxY)) {
            vOffset = vOffset === 0 ? 14 : vOffset > 0 ? -vOffset : -vOffset + 14;
            stepX = (pLeft.x + pRight.x) / 2 + vOffset;
          }

          const pts = [
            { x: pLeft.x, y: pLeft.y },
            { x: stepX, y: pLeft.y },
            { x: stepX, y: pRight.y },
            { x: pRight.x, y: pRight.y },
          ];
          ptsList = [pts];
          d = createRoundedOrthogonalPath(pts, 8, occupiedHorizontalSegments, `marriage:${mKey}`);

          occupiedHorizontalSegments.push({ y: pLeft.y, minX: Math.min(pLeft.x, stepX), maxX: Math.max(pLeft.x, stepX) });
          occupiedHorizontalSegments.push({ y: pRight.y, minX: Math.min(stepX, pRight.x), maxX: Math.max(stepX, pRight.x) });
          occupiedVerticalSegments.push({ x: stepX, minY, maxY });
          midX = stepX;
        }
      } else if (startPt.side === 'bottom' && endPt.side === 'top') {
        if (Math.abs(startPt.x - endPt.x) < 8) {
          const pts = [{ x: startPt.x, y: startPt.y }, { x: startPt.x, y: endPt.y }];
          ptsList = [pts];
          d = `M ${startPt.x} ${startPt.y} L ${startPt.x} ${endPt.y}`;
          occupiedVerticalSegments.push({ x: startPt.x, minY: startPt.y, maxY: endPt.y });
        } else {
          const stepY = (startPt.y + endPt.y) / 2;
          const pts = [
            { x: startPt.x, y: startPt.y },
            { x: startPt.x, y: stepY },
            { x: endPt.x, y: stepY },
            { x: endPt.x, y: endPt.y },
          ];
          ptsList = [pts];
          d = createRoundedOrthogonalPath(pts, 8, occupiedHorizontalSegments, `marriage:${mKey}`);
          occupiedVerticalSegments.push({ x: startPt.x, minY: Math.min(startPt.y, stepY), maxY: Math.max(startPt.y, stepY) });
          occupiedVerticalSegments.push({ x: endPt.x, minY: Math.min(stepY, endPt.y), maxY: Math.max(stepY, endPt.y) });
          occupiedHorizontalSegments.push({ y: stepY, minX: Math.min(startPt.x, endPt.x), maxX: Math.max(startPt.x, endPt.x) });
          midY = stepY;
        }
      } else {
        const midStepX = (startPt.x + endPt.x) / 2;
        const pts = [
          { x: startPt.x, y: startPt.y },
          { x: midStepX, y: startPt.y },
          { x: midStepX, y: endPt.y },
          { x: endPt.x, y: endPt.y },
        ];
        ptsList = [pts];
        d = createRoundedOrthogonalPath(pts, 8, occupiedHorizontalSegments, `marriage:${mKey}`);
      }

      const hasUnverifiedCard = !leftP.isFullyVerified || !rightP.isFullyVerified;
      const isUnverified = (override?.verified !== undefined
        ? !override.verified
        : (hasUnverifiedCard || person.unverifiedRelations?.includes(spouse.id) || spouse.unverifiedRelations?.includes(person.id))) && !isDivorced;

      const sharedMatch = doPersonsShareColor(leftP, rightP, clanMap);

      let color = isDivorced ? '#e11d48' : (isUnverified ? '#9ca3af' : (sharedMatch.shares && sharedMatch.color ? sharedMatch.color : defaultVerifiedColor));
      if (override?.color && override.color !== '#15803d' && override.color !== '#64748b' && override.color !== '#475569') {
        color = override.color;
      }

      const confidenceLevel = override?.confidenceLevel
        ? override.confidenceLevel
        : isDivorced
        ? 'verified'
        : isUnverified
        ? 'hypothetical'
        : 'verified';

      registerLine({
        id: `marriage:${mKey}`,
        type: 'marriage',
        path: d,
        fromId: leftP.id,
        toId: rightP.id,
        isVerified: !isUnverified,
        confidenceLevel,
        archiveSource: override?.archiveSource,
        color,
        isDashed: isDivorced || isUnverified || confidenceLevel === 'hypothetical',
        label: override?.label || (isDivorced ? 'Розлучення' : undefined),
        eventDate: override?.eventDate,
        eventType: override?.eventType || (isDivorced ? 'divorce' : undefined),
        isMainBranch: override?.isMainBranch,
        strokeWidth: override?.strokeWidth,
        notes: override?.notes,
        personIds: [leftP.id, rightP.id],
        midX,
        midY,
        startPt: { x: startPt.x, y: startPt.y },
        endPt: { x: endPt.x, y: endPt.y },
      }, ptsList);
    });
  });

  // 2. Draw Parent-Child Descents with Adaptive Routing & Clean Couple Bridges
  Object.entries(parentGroups).forEach(([pKey, group]) => {
    if (processedParentGroups.has(pKey)) return;
    processedParentGroups.add(pKey);

    const { parents, children } = group;
    const parentObjs = parents.map((id) => visualPersons[id]).filter(Boolean);
    const childObjs = children.map((id) => visualPersons[id]).filter(Boolean);

    if (parentObjs.length === 0 || childObjs.length === 0) return;

    const minChildY = Math.min(...childObjs.map((c) => c.y));
    const maxChildBottom = Math.max(...childObjs.map((c) => c.y + CARD_HEIGHT));
    const minParentTop = Math.min(...parentObjs.map((p) => p.y));
    const maxParentBottom = Math.max(...parentObjs.map((p) => p.y + CARD_HEIGHT));

    const childrenAreAbove = maxChildBottom <= minParentTop + 20;

    let sourceX: number;
    let sourceY: number;
    let isCoupleUnit = false;
    let coupleBridge: ConnectionLine['coupleBridge'] | undefined;

    if (parentObjs.length >= 2) {
      const p1 = parentObjs[0];
      const p2 = parentObjs[1];
      const mKey = [p1.id, p2.id].sort().join('::');
      const marriageLine = specLines.find((l) => l.id === `marriage:${mKey}`);
      const marriageOverride = connectionOverrides?.[`marriage:${mKey}`];
      const isDivorced = marriageOverride?.eventType === 'divorce';
      const [leftP, rightP] = p1.x <= p2.x ? [p1, p2] : [p2, p1];
      const isAdjacent = !isDivorced && couplePartnerMap[leftP.id] === rightP.id;

      if (isAdjacent) {
        isCoupleUnit = true;
        const X1 = leftP.x + CARD_WIDTH / 2;
        const X2 = rightP.x + CARD_WIDTH / 2;
        sourceX = (X1 + X2) / 2;

        const hasCouplePets = [leftP, rightP].some(
          (p) => p.pets && p.pets.some((pet) => pet.isCouplePet)
        );
        const hasSinglePets = [leftP, rightP].some(
          (p) => p.pets && p.pets.some((pet) => !pet.isCouplePet)
        );
        const rawClearance =
          hasCouplePets && hasSinglePets
            ? 92
            : hasCouplePets || hasSinglePets
            ? 48
            : 0;

        const sharedCoupleColor = doPersonsShareColor(leftP, rightP, clanMap);
        const leftIsUnverified = !leftP.isFullyVerified;
        const rightIsUnverified = !rightP.isFullyVerified;
        const leftArmColor = leftIsUnverified
          ? '#94a3b8'
          : (sharedCoupleColor.shares && sharedCoupleColor.color)
          ? sharedCoupleColor.color
          : getPersonVisualColor(leftP, clanMap).stroke;
        const rightArmColor = rightIsUnverified
          ? '#94a3b8'
          : (sharedCoupleColor.shares && sharedCoupleColor.color)
          ? sharedCoupleColor.color
          : getPersonVisualColor(rightP, clanMap).stroke;

        if (!childrenAreAbove) {
          const baseParentBottom = Math.max(leftP.y, rightP.y) + CARD_HEIGHT;
          const gapToChildren = Math.max(0, minChildY - baseParentBottom);
          const effectiveClearance = gapToChildren > 24 ? Math.min(rawClearance, gapToChildren - 24) : 0;
          const collectorOffset = gapToChildren > 0
            ? Math.min(18, Math.max(10, Math.floor((gapToChildren - effectiveClearance) * 0.35)))
            : 16;
          const bridgeY = baseParentBottom + effectiveClearance + collectorOffset;
          sourceY = bridgeY;

          const leftArmPts = [
            { x: X1, y: baseParentBottom },
            { x: X1, y: bridgeY },
            { x: sourceX, y: bridgeY },
          ];
          const rightArmPts = [
            { x: X2, y: baseParentBottom },
            { x: X2, y: bridgeY },
            { x: sourceX, y: bridgeY },
          ];
          const armRadius = Math.min(10, collectorOffset * 0.75, Math.abs(sourceX - X1) * 0.35);
          const leftArmPath = createRoundedOrthogonalPath(leftArmPts, armRadius);
          const rightArmPath = createRoundedOrthogonalPath(rightArmPts, armRadius);

          occupiedHorizontalSegments.push({ y: bridgeY, minX: X1, maxX: X2 });
          occupiedVerticalSegments.push({ x: X1, minY: baseParentBottom, maxY: bridgeY });
          occupiedVerticalSegments.push({ x: X2, minY: baseParentBottom, maxY: bridgeY });

          coupleBridge = {
            key: pKey,
            leftArmPath,
            rightArmPath,
            leftColor: leftArmColor,
            rightColor: rightArmColor,
            junctionX: sourceX,
            junctionY: bridgeY,
            isVerified: !leftIsUnverified && !rightIsUnverified,
            leftDashed: leftIsUnverified,
            rightDashed: rightIsUnverified,
            parentIds: [leftP.id, rightP.id],
            bounds: {
              minX: X1,
              maxX: X2,
              minY: baseParentBottom,
              maxY: bridgeY,
            },
          };
        } else {
          const baseParentTop = Math.min(leftP.y, rightP.y);
          const gapAbove = Math.max(0, baseParentTop - maxChildBottom);
          const collectorOffset = gapAbove > 0
            ? Math.min(24, Math.max(14, Math.floor(gapAbove * 0.35)))
            : 22;
          const bridgeY = baseParentTop - collectorOffset;
          sourceY = bridgeY;

          const leftArmPts = [
            { x: X1, y: baseParentTop },
            { x: X1, y: bridgeY },
            { x: sourceX, y: bridgeY },
          ];
          const rightArmPts = [
            { x: X2, y: baseParentTop },
            { x: X2, y: bridgeY },
            { x: sourceX, y: bridgeY },
          ];
          const armRadius = Math.min(10, collectorOffset * 0.65, Math.abs(sourceX - X1) * 0.35);
          const leftArmPath = createRoundedOrthogonalPath(leftArmPts, armRadius);
          const rightArmPath = createRoundedOrthogonalPath(rightArmPts, armRadius);

          occupiedHorizontalSegments.push({ y: bridgeY, minX: X1, maxX: X2 });
          occupiedVerticalSegments.push({ x: X1, minY: bridgeY, maxY: baseParentTop });
          occupiedVerticalSegments.push({ x: X2, minY: bridgeY, maxY: baseParentTop });

          coupleBridge = {
            key: pKey,
            leftArmPath,
            rightArmPath,
            leftColor: leftArmColor,
            rightColor: rightArmColor,
            junctionX: sourceX,
            junctionY: bridgeY,
            isVerified: !leftIsUnverified && !rightIsUnverified,
            leftDashed: leftIsUnverified,
            rightDashed: rightIsUnverified,
            parentIds: [leftP.id, rightP.id],
            bounds: {
              minX: X1,
              maxX: X2,
              minY: bridgeY,
              maxY: baseParentTop,
            },
          };
        }
      } else if (isDivorced || Math.abs(rightP.x - leftP.x) > COUPLE_ADJACENCY_THRESHOLD) {
        const marriageX = marriageOverride?.eventX ?? marriageLine?.midX ?? (leftP.x + rightP.x + CARD_WIDTH) / 2;
        const marriageY = marriageOverride?.eventY ?? marriageLine?.midY ?? (leftP.y + CARD_HEIGHT / 2);

        sourceX = marriageX;
        sourceY = childrenAreAbove ? marriageY - 14 : marriageY + 14;
        occupiedHorizontalSegments.push({ y: marriageY, minX: marriageX - 52, maxX: marriageX + 52 });
      } else {
        sourceX = (leftP.x + rightP.x + CARD_WIDTH) / 2;
        sourceY = childrenAreAbove
          ? Math.min(...parentObjs.map((p) => p.y))
          : Math.max(...parentObjs.map((p) => p.y + CARD_HEIGHT));
      }
    } else {
      sourceX = parentObjs[0].x + CARD_WIDTH / 2;
      sourceY = childrenAreAbove ? parentObjs[0].y : parentObjs[0].y + CARD_HEIGHT;
    }

    const childTargetPoints = childObjs.map((c) => ({
      id: c.id,
      x: c.x + CARD_WIDTH / 2,
      y: childrenAreAbove ? c.y + CARD_HEIGHT : c.y,
    }));

    const override = connectionOverrides?.[`descent:${pKey}`];
    const isTrunkUnverified = override?.verified !== undefined ? !override.verified : false;

    // SPECIAL ADAPTIVE CASE: Exactly 1 child
    if (childObjs.length === 1) {
      const childObj = childObjs[0];
      const childX = childTargetPoints[0].x;
      const childTargetY = childTargetPoints[0].y;

      let singlePath = '';
      let ptsList: { x: number; y: number }[][] = [];
      let endPt = { x: childX, y: childTargetY };
      let midX = (sourceX + childX) / 2;
      let midY = (sourceY + childTargetY) / 2;
      let junctionPt: { x: number; y: number } | undefined;

      if (!childrenAreAbove && childTargetY >= sourceY - 6) {
        if (Math.abs(sourceX - childX) <= 4) {
          const alignedX = sourceX;
          endPt = { x: alignedX, y: childTargetY };
          const pts = [{ x: alignedX, y: sourceY }, endPt];
          ptsList = [pts];
          singlePath = `M ${alignedX} ${sourceY} L ${alignedX} ${childTargetY}`;
          midX = alignedX;
          occupiedVerticalSegments.push({ x: alignedX, minY: Math.min(sourceY, childTargetY), maxY: Math.max(sourceY, childTargetY) });
        } else {
          const midDropY = sourceY + (childTargetY - sourceY) * 0.45;
          const pts = [
            { x: sourceX, y: sourceY },
            { x: sourceX, y: midDropY },
            { x: childX, y: midDropY },
            { x: childX, y: childTargetY },
          ];
          ptsList = [pts];
          singlePath = createRoundedOrthogonalPath(pts, 10, occupiedHorizontalSegments, `descent:child:${pKey}:${childObj.id}`);
          midY = midDropY;
          junctionPt = { x: sourceX, y: midDropY };
          occupiedVerticalSegments.push({ x: sourceX, minY: Math.min(sourceY, midDropY), maxY: Math.max(sourceY, midDropY) });
          occupiedHorizontalSegments.push({ y: midDropY, minX: Math.min(sourceX, childX), maxX: Math.max(sourceX, childX) });
          occupiedVerticalSegments.push({ x: childX, minY: Math.min(midDropY, childTargetY), maxY: Math.max(midDropY, childTargetY) });
        }
      } else if (childrenAreAbove && childTargetY <= sourceY + 6) {
        if (Math.abs(sourceX - childX) <= 4) {
          const alignedX = sourceX;
          endPt = { x: alignedX, y: childTargetY };
          const pts = [{ x: alignedX, y: sourceY }, endPt];
          ptsList = [pts];
          singlePath = `M ${alignedX} ${sourceY} L ${alignedX} ${childTargetY}`;
          midX = alignedX;
          occupiedVerticalSegments.push({ x: alignedX, minY: Math.min(sourceY, childTargetY), maxY: Math.max(sourceY, childTargetY) });
        } else {
          const midDropY = sourceY + (childTargetY - sourceY) * 0.45;
          const pts = [
            { x: sourceX, y: sourceY },
            { x: sourceX, y: midDropY },
            { x: childX, y: midDropY },
            { x: childX, y: childTargetY },
          ];
          ptsList = [pts];
          singlePath = createRoundedOrthogonalPath(pts, 10, occupiedHorizontalSegments, `descent:child:${pKey}:${childObj.id}`);
          midY = midDropY;
          junctionPt = { x: sourceX, y: midDropY };
          occupiedVerticalSegments.push({ x: sourceX, minY: Math.min(sourceY, midDropY), maxY: Math.max(sourceY, midDropY) });
          occupiedHorizontalSegments.push({ y: midDropY, minX: Math.min(sourceX, childX), maxX: Math.max(sourceX, childX) });
          occupiedVerticalSegments.push({ x: childX, minY: Math.min(midDropY, childTargetY), maxY: Math.max(midDropY, childTargetY) });
        }
      } else {
        // Side-by-side placement on nearly same tier: route cleanly from couple union / outer edge without crossing cards
        const sideEndX = childX > sourceX ? childObj.x : childObj.x + CARD_WIDTH;
        const sideEndY = childObj.y + CARD_HEIGHT / 2;
        if (isCoupleUnit) {
          const approachX = childX > sourceX ? sideEndX - 18 : sideEndX + 18;
          const pts = [
            { x: sourceX, y: sourceY },
            { x: approachX, y: sourceY },
            { x: approachX, y: sideEndY },
            { x: sideEndX, y: sideEndY },
          ];
          ptsList = [pts];
          singlePath = createRoundedOrthogonalPath(pts, 10, occupiedHorizontalSegments, `descent:child:${pKey}:${childObj.id}`);
          endPt = { x: sideEndX, y: sideEndY };
          midX = (sourceX + approachX) / 2;
          midY = sourceY;
        } else {
          const sideStartX = childX > sourceX ? parentObjs[0].x + CARD_WIDTH : parentObjs[0].x;
          const sideStartY = parentObjs[0].y + CARD_HEIGHT / 2;
          const pts = [
            { x: sideStartX, y: sideStartY },
            { x: (sideStartX + sideEndX) / 2, y: sideStartY },
            { x: (sideStartX + sideEndX) / 2, y: sideEndY },
            { x: sideEndX, y: sideEndY },
          ];
          ptsList = [pts];
          singlePath = createRoundedOrthogonalPath(pts, 10, occupiedHorizontalSegments, `descent:child:${pKey}:${childObj.id}`);
          endPt = { x: sideEndX, y: sideEndY };
        }
      }

      const matchingParentForChild = parentObjs.find((p) => doPersonsShareColor(p, childObj, clanMap).shares);
      const sharedMatchColor = matchingParentForChild
        ? doPersonsShareColor(matchingParentForChild, childObj, clanMap).color
        : undefined;

      const childOverride = connectionOverrides?.[`descent:child:${pKey}:${childObj.id}`] || override;
      const isCardUnverified = !childObj.isFullyVerified || parentObjs.some((p) => !p.isFullyVerified);
      const isChildUnverified = childOverride?.verified !== undefined
        ? !childOverride.verified
        : (isCardUnverified || isTrunkUnverified || parents.some((pId) => childObj?.unverifiedRelations?.includes(pId)));
      const childConfidence = childOverride?.confidenceLevel || (isChildUnverified ? 'hypothetical' : 'verified');

      const finalSingleChildColor = (childOverride?.color && childOverride.color !== '#15803d' && childOverride.color !== '#64748b' && childOverride.color !== '#475569')
        ? childOverride.color
        : (isChildUnverified ? '#9ca3af' : (sharedMatchColor || defaultVerifiedColor));

      registerLine({
        id: `descent:child:${pKey}:${childObj.id}`,
        type: 'child-branch',
        path: singlePath,
        fromId: parents[0],
        toId: childObj.id,
        fromAnchor: childrenAreAbove ? 'top' : 'bottom',
        toAnchor: childrenAreAbove ? 'bottom' : 'top',
        isVerified: !isChildUnverified,
        confidenceLevel: childConfidence,
        archiveSource: childOverride?.archiveSource,
        color: finalSingleChildColor,
        isDashed: isChildUnverified || childConfidence === 'hypothetical',
        label: childOverride?.label,
        eventDate: childOverride?.eventDate,
        eventType: childOverride?.eventType,
        isMainBranch: childOverride?.isMainBranch,
        strokeWidth: childOverride?.strokeWidth ?? override?.strokeWidth,
        notes: childOverride?.notes,
        personIds: [...parents, childObj.id],
        midX,
        midY,
        startPt: { x: sourceX, y: sourceY },
        endPt,
        junctionPt,
        coupleBridge,
      }, ptsList);
      return;
    }

    // MULTIPLE CHILDREN (Horizontal Distributor Bar Layout)
    const minChildX = Math.min(...childTargetPoints.map((c) => c.x));
    const maxChildX = Math.max(...childTargetPoints.map((c) => c.x));

    const rawDistributorY = childrenAreAbove
      ? Math.min(
          minParentTop - 16,
          Math.max(maxChildBottom + 16, (minParentTop + maxChildBottom) / 2)
        )
      : Math.max(
          maxParentBottom + 16,
          Math.min(minChildY - 16, (maxParentBottom + minChildY) / 2)
        );

    const baseDistributorY = isCoupleUnit
      ? (childrenAreAbove
          ? Math.min(sourceY - 14, rawDistributorY)
          : Math.max(sourceY + 14, rawDistributorY))
      : rawDistributorY;

    let verticalDropX = sourceX;
    if (!isCoupleUnit) {
      let vAttempts = 0;
      let vOffset = 0;
      const vMinY = Math.min(sourceY, baseDistributorY);
      const vMaxY = Math.max(sourceY, baseDistributorY);

      while (doesVOverlap(verticalDropX, vMinY, vMaxY) && vAttempts < 8) {
        vAttempts++;
        vOffset = vOffset === 0 ? 10 : vOffset > 0 ? -vOffset : -vOffset + 10;
        verticalDropX = sourceX + vOffset;
      }
    }

    const barLeft = Math.min(minChildX, sourceX, verticalDropX);
    const barRight = Math.max(maxChildX, sourceX, verticalDropX);

    let distributorY = baseDistributorY;
    let trackOffset = 0;
    const maxAllowableDistributorY = childrenAreAbove ? minParentTop - 8 : minChildY - 8;
    const minAllowableDistributorY = childrenAreAbove ? maxChildBottom + 8 : maxParentBottom + 8;

    let attempts = 0;
    while (
      (doesHOverlap(distributorY, barLeft, barRight) || doesHOverlapCard(distributorY, barLeft, barRight)) &&
      attempts < 14
    ) {
      attempts++;
      trackOffset = trackOffset === 0 ? 14 : trackOffset > 0 ? -trackOffset : -trackOffset + 14;
      const candidateY = baseDistributorY + trackOffset;
      if (candidateY >= Math.min(minAllowableDistributorY, maxAllowableDistributorY) && candidateY <= Math.max(minAllowableDistributorY, maxAllowableDistributorY)) {
        distributorY = candidateY;
      }
    }

    occupiedHorizontalSegments.push({ y: distributorY, minX: barLeft, maxX: barRight });
    occupiedVerticalSegments.push({ x: verticalDropX, minY: Math.min(sourceY, distributorY), maxY: Math.max(sourceY, distributorY) });

    childTargetPoints.forEach((c, idx) => {
      const childObj = childObjs[idx];
      const matchingParentForChild = parentObjs.find((p) => doPersonsShareColor(p, childObj, clanMap).shares);
      const shareCheck = matchingParentForChild
        ? doPersonsShareColor(matchingParentForChild, childObj, clanMap)
        : (parentObjs.length > 0 ? doPersonsShareColor(parentObjs[0], childObj, clanMap) : { shares: false });
      const sharedMatchColor = shareCheck.shares ? shareCheck.color : (matchingParentForChild ? getPersonVisualColor(matchingParentForChild, clanMap).stroke : undefined);

      const childVisualColor = sharedMatchColor || defaultVerifiedColor;

      const childOverride = connectionOverrides?.[`descent:child:${pKey}:${c.id}`] || override;
      const isCardUnverified = !childObj?.isFullyVerified || parentObjs.some((p) => !p.isFullyVerified);
      const isChildUnverified = childOverride?.verified !== undefined
        ? !childOverride.verified
        : (isCardUnverified || isTrunkUnverified || parents.some((pId) => childObj?.unverifiedRelations?.includes(pId)));
      const childConfidence = childOverride?.confidenceLevel || (isChildUnverified ? 'hypothetical' : 'verified');

      let childColor = (childOverride?.color && childOverride.color !== '#15803d' && childOverride.color !== '#64748b' && childOverride.color !== '#475569')
        ? childOverride.color
        : (isChildUnverified ? '#9ca3af' : childVisualColor);

      const childPoints: { x: number; y: number }[] = [{ x: sourceX, y: sourceY }];
      if (verticalDropX !== sourceX) {
        const dropStepY = childrenAreAbove
          ? Math.max(distributorY + 6, sourceY - 12)
          : Math.min(distributorY - 6, sourceY + 12);
        childPoints.push({ x: sourceX, y: dropStepY });
        childPoints.push({ x: verticalDropX, y: dropStepY });
      }
      childPoints.push({ x: verticalDropX, y: distributorY });
      if (Math.abs(c.x - verticalDropX) > 1) {
        childPoints.push({ x: c.x, y: distributorY });
      }
      childPoints.push({ x: c.x, y: c.y });

      const lineId = `descent:child:${pKey}:${c.id}`;
      const fullBranchPath = createRoundedOrthogonalPath(childPoints, 9, occupiedHorizontalSegments, lineId);
      occupiedVerticalSegments.push({ x: c.x, minY: Math.min(distributorY, c.y), maxY: Math.max(distributorY, c.y) });

      registerLine({
        id: lineId,
        type: 'child-branch',
        path: fullBranchPath,
        fromId: parents[0],
        toId: c.id,
        fromAnchor: childrenAreAbove ? 'top' : 'bottom',
        toAnchor: childrenAreAbove ? 'bottom' : 'top',
        isVerified: !isChildUnverified,
        confidenceLevel: childConfidence,
        archiveSource: childOverride?.archiveSource,
        color: childColor,
        isDashed: isChildUnverified || childConfidence === 'hypothetical',
        label: childOverride?.label,
        eventDate: childOverride?.eventDate,
        eventType: childOverride?.eventType,
        isMainBranch: childOverride?.isMainBranch,
        strokeWidth: childOverride?.strokeWidth ?? override?.strokeWidth,
        notes: childOverride?.notes,
        personIds: [...parents, c.id],
        midX: c.x,
        midY: (distributorY + c.y) / 2,
        startPt: { x: sourceX, y: sourceY },
        endPt: { x: c.x, y: c.y },
        junctionPt: { x: c.x, y: distributorY },
        coupleBridge,
      }, [childPoints]);
    });
  });

  // 3. Draw Orphan Sibling Ties (using visualPersons coordinates)
  personList.forEach((person) => {
    if (!person || !person.siblings || person.siblings.length === 0) return;
    const hasKnownParents = person.parents && person.parents.some((pid) => !!visualPersons[pid]);
    if (hasKnownParents) return;

    const group: Person[] = [person];
    person.siblings.forEach((sId) => {
      const sib = visualPersons[sId];
      if (sib && (!sib.parents || !sib.parents.some((pid) => !!visualPersons[pid]))) {
        if (!group.some((p) => p.id === sib.id)) {
          group.push(sib);
        }
      }
    });

    if (group.length >= 2) {
      const gKey = group.map((p) => p.id).sort().join('::');
      if (processedSiblingGroups.has(gKey)) return;
      processedSiblingGroups.add(gKey);

      group.sort((a, b) => a.x - b.x);
      const minX = group[0].x + CARD_WIDTH / 2;
      const maxX = group[group.length - 1].x + CARD_WIDTH / 2;
      const minY = Math.min(...group.map((p) => p.y));
      const tieY = minY - 18;

      let tiePath = `M ${minX} ${tieY} L ${maxX} ${tieY}`;
      const ptsList: { x: number; y: number }[][] = [
        [{ x: minX, y: tieY }, { x: maxX, y: tieY }],
      ];

      group.forEach((p) => {
        const cx = p.x + CARD_WIDTH / 2;
        const dropPts = [{ x: cx, y: tieY }, { x: cx, y: p.y }];
        ptsList.push(dropPts);
        const dropD = createRoundedOrthogonalPath(dropPts, 6, occupiedHorizontalSegments, `sibling:${gKey}`);
        tiePath += ` ${dropD}`;
      });

      const override = connectionOverrides?.[`sibling:${gKey}`];
      const hasUnverifiedSibling = group.some((p) => !p.isFullyVerified);
      const isUnverified = override?.verified !== undefined
        ? !override.verified
        : (hasUnverifiedSibling || group.some((p) => p.unverifiedRelations && group.some((other) => p.unverifiedRelations?.includes(other.id))));

      const confidence = override?.confidenceLevel || (isUnverified ? 'hypothetical' : 'verified');

      const allSiblingsShareColor = group.length >= 2 && group.every((s) => doPersonsShareColor(group[0], s, clanMap).shares);
      const sharedSiblingColor = allSiblingsShareColor
        ? doPersonsShareColor(group[0], group[1], clanMap).color
        : defaultVerifiedColor;

      registerLine({
        id: `sibling:${gKey}`,
        type: 'sibling-tie',
        path: tiePath,
        isVerified: !isUnverified,
        confidenceLevel: confidence,
        archiveSource: override?.archiveSource,
        color: (override?.color && override.color !== '#15803d' && override.color !== '#64748b' && override.color !== '#475569')
          ? override.color
          : (isUnverified ? '#9ca3af' : (sharedSiblingColor || defaultVerifiedColor)),
        isDashed: isUnverified || confidence === 'hypothetical',
        label: override?.label || 'Рідні брати / сестри',
        eventDate: override?.eventDate,
        eventType: override?.eventType,
        isMainBranch: override?.isMainBranch,
        strokeWidth: override?.strokeWidth,
        notes: override?.notes,
        personIds: group.map((p) => p.id),
        midX: (minX + maxX) / 2,
        midY: tieY,
      }, ptsList);
    }
  });

  // PASS 2: Apply complete 2-way bridge arc intersections and compute exact bounds across all lines
  const finalLines: ConnectionLine[] = specLines.map((line) => {
    let finalPath = line.path;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    if (line.pointsList && line.pointsList.length > 0) {
      finalPath = line.pointsList
        .map((pts) => {
          for (const pt of pts) {
            if (pt.x < minX) minX = pt.x;
            if (pt.x > maxX) maxX = pt.x;
            if (pt.y < minY) minY = pt.y;
            if (pt.y > maxY) maxY = pt.y;
          }
          return createRoundedOrthogonalPath(pts, 9, allHorizontalSegments, line.id);
        })
        .join(' ');
    }

    if (line.coupleBridge) {
      const cb = line.coupleBridge.bounds;
      if (cb.minX < minX) minX = cb.minX;
      if (cb.maxX > maxX) maxX = cb.maxX;
      if (cb.minY < minY) minY = cb.minY;
      if (cb.maxY > maxY) maxY = cb.maxY;
    }

    const bounds = Number.isFinite(minX)
      ? { minX, maxX, minY, maxY }
      : undefined;

    const { pointsList, ...rest } = line;
    return { ...rest, path: finalPath, bounds };
  });

  return finalLines;
}
