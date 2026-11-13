import { Person, ConnectionMeta } from '../types/tree';
import { extractBirthYear } from './timelineUtils';
import { CARD_HEIGHT, CARD_WIDTH, COUPLE_GAP, COUPLE_SPOUSE_OFFSET, COUPLE_TOTAL_WIDTH } from './treeLayout';

/**
 * Standard CSS/SVG 96 DPI pixel-to-centimeter conversion:
 * 1 inch = 2.54 cm = 96 px => 1 cm = 96 / 2.54 ≈ 37.79527559 px
 */
export const PX_PER_CM = 96 / 2.54;

export function pxToCm(px: number): number {
  return px / PX_PER_CM;
}

export function cmToPx(cm: number): number {
  return cm * PX_PER_CM;
}

export function formatPxAsCm(px: number): string {
  const absPx = Math.abs(px);
  if (absPx < 1.5) return '0 см';
  const cm = absPx / PX_PER_CM;
  if (cm < 0.1) return `${cm.toFixed(2)} см`;
  return `${cm.toFixed(1)} см`;
}

export interface CouplePairInfo {
  person1: Person;
  person2: Person;
}

export interface UnitRect {
  id: string;
  personIds: string[];
  x: number;
  y: number;
  width: number;
  height: number;
  isCouple: boolean;
  isPinnedY?: boolean;
  spouseCentersX?: [number, number];
}

export interface GuideDistanceSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  distancePx: number;
  labelCm: string;
  targetUnitId: string;
}

export interface EqualSpacingBracket {
  axis: 'x' | 'y';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  gapPx: number;
  labelCm: string;
}

export interface AlignmentProposal {
  proposedX?: number;
  proposedY?: number;
  guideX?: number;
  guideY?: number;
  guideXKind?: 'left' | 'center' | 'right' | 'spouse-center' | 'spacing';
  guideYKind?: 'top' | 'bottom' | 'spacing';
  guideXSpan?: { minY: number; maxY: number };
  guideYSpan?: { minX: number; maxX: number };
  xDistance?: GuideDistanceSegment;
  yDistance?: GuideDistanceSegment;
  nearestDistance?: GuideDistanceSegment & { sameAsGuide: boolean };
  spacingBrackets?: EqualSpacingBracket[];
  movingWidth: number;
  movingHeight: number;
}

/**
 * Builds visual bounding boxes for all stationary single cards and undivorced couples.
 */
export function buildStationaryUnits(
  persons: Record<string, Person>,
  personToCoupleMap: Record<string, CouplePairInfo>,
  excludedPersonIds: Set<string>
): UnitRect[] {
  const units: UnitRect[] = [];
  const visited = new Set<string>();

  for (const person of Object.values(persons)) {
    if (visited.has(person.id) || excludedPersonIds.has(person.id)) continue;

    const couple = personToCoupleMap[person.id];
    if (couple && !excludedPersonIds.has(couple.person1.id) && !excludedPersonIds.has(couple.person2.id)) {
      visited.add(couple.person1.id);
      visited.add(couple.person2.id);
      const minX = Math.min(couple.person1.x, couple.person2.x);
      const minY = Math.min(couple.person1.y, couple.person2.y);
      units.push({
        id: `couple:${couple.person1.id}:${couple.person2.id}`,
        personIds: [couple.person1.id, couple.person2.id],
        x: minX,
        y: minY,
        width: COUPLE_TOTAL_WIDTH,
        height: CARD_HEIGHT,
        isCouple: true,
        spouseCentersX: [
          minX + CARD_WIDTH / 2,
          minX + CARD_WIDTH + COUPLE_GAP + CARD_WIDTH / 2,
        ],
      });
    } else {
      visited.add(person.id);
      units.push({
        id: person.id,
        personIds: [person.id],
        x: person.x,
        y: person.y,
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        isCouple: false,
      });
    }
  }

  return units;
}

/**
 * Computes the visual bounding rect for the currently moving card / couple / selection.
 */
export function getMovingUnitRect(
  movingIds: Set<string>,
  positions: Map<string, { x: number; y: number }>,
  personToCoupleMap: Record<string, CouplePairInfo>,
  primaryId: string
): UnitRect {
  const couple = personToCoupleMap[primaryId];
  if (
    couple &&
    movingIds.size === 2 &&
    movingIds.has(couple.person1.id) &&
    movingIds.has(couple.person2.id)
  ) {
    const p1 = positions.get(couple.person1.id) || { x: couple.person1.x, y: couple.person1.y };
    const p2 = positions.get(couple.person2.id) || { x: couple.person2.x, y: couple.person2.y };
    const minX = Math.min(p1.x, p2.x);
    const minY = Math.min(p1.y, p2.y);
    return {
      id: `moving:${couple.person1.id}:${couple.person2.id}`,
      personIds: [couple.person1.id, couple.person2.id],
      x: minX,
      y: minY,
      width: COUPLE_TOTAL_WIDTH,
      height: CARD_HEIGHT,
      isCouple: true,
    };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const ids: string[] = [];

  movingIds.forEach((id) => {
    const pos = positions.get(id);
    if (!pos) return;
    ids.push(id);
    if (pos.x < minX) minX = pos.x;
    if (pos.y < minY) minY = pos.y;
    if (pos.x + CARD_WIDTH > maxX) maxX = pos.x + CARD_WIDTH;
    if (pos.y + CARD_HEIGHT > maxY) maxY = pos.y + CARD_HEIGHT;
  });

  if (!Number.isFinite(minX)) {
    return {
      id: primaryId,
      personIds: [primaryId],
      x: 0,
      y: 0,
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      isCouple: false,
    };
  }

  return {
    id: `moving:${primaryId}`,
    personIds: ids,
    x: minX,
    y: minY,
    width: Math.max(CARD_WIDTH, maxX - minX),
    height: Math.max(CARD_HEIGHT, maxY - minY),
    isCouple: Boolean(couple && movingIds.has(couple.person1.id) && movingIds.has(couple.person2.id)),
  };
}

function getVerticalGapBetweenRects(a: { y: number; height: number }, b: { y: number; height: number }): number {
  if (a.y + a.height <= b.y) return b.y - (a.y + a.height);
  if (b.y + b.height <= a.y) return a.y - (b.y + b.height);
  return 0;
}

function getHorizontalGapBetweenRects(a: { x: number; width: number }, b: { x: number; width: number }): number {
  if (a.x + a.width <= b.x) return b.x - (a.x + a.width);
  if (b.x + b.width <= a.x) return a.x - (b.x + b.width);
  return 0;
}

function computeRectEdgeDistance(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): { x1: number; y1: number; x2: number; y2: number; dist: number } {
  const aRight = a.x + a.width;
  const aBottom = a.y + a.height;
  const bRight = b.x + b.width;
  const bBottom = b.y + b.height;

  let x1: number;
  let x2: number;
  if (aRight < b.x) {
    x1 = aRight;
    x2 = b.x;
  } else if (bRight < a.x) {
    x1 = a.x;
    x2 = bRight;
  } else {
    const overlapLeft = Math.max(a.x, b.x);
    const overlapRight = Math.min(aRight, bRight);
    x1 = (overlapLeft + overlapRight) / 2;
    x2 = x1;
  }

  let y1: number;
  let y2: number;
  if (aBottom < b.y) {
    y1 = aBottom;
    y2 = b.y;
  } else if (bBottom < a.y) {
    y1 = a.y;
    y2 = bBottom;
  } else {
    const overlapTop = Math.max(a.y, b.y);
    const overlapBottom = Math.min(aBottom, bBottom);
    y1 = (overlapTop + overlapBottom) / 2;
    y2 = y1;
  }

  return {
    x1,
    y1,
    x2,
    y2,
    dist: Math.hypot(x2 - x1, y2 - y1),
  };
}

/**
 * Computes smart alignment proposals (edges, centers, couple spouse centers, equal spacing)
 * and calculates exact distances to the nearest aligned/neighbor cards in centimeters.
 */
export function computeAlignmentProposal(
  movingRect: UnitRect,
  stationaryUnits: UnitRect[],
  options: {
    thresholdPx: number;
    isPinnedY: boolean;
    snapEnabled: boolean;
  }
): AlignmentProposal | null {
  if (stationaryUnits.length === 0) return null;

  const { thresholdPx, isPinnedY, snapEnabled } = options;

  type CandidateX = {
    score: number;
    diff: number;
    proposedX: number;
    guideX: number;
    kind: AlignmentProposal['guideXKind'];
    target: UnitRect;
    brackets?: EqualSpacingBracket[];
  };

  type CandidateY = {
    score: number;
    diff: number;
    proposedY: number;
    guideY: number;
    kind: AlignmentProposal['guideYKind'];
    target: UnitRect;
    brackets?: EqualSpacingBracket[];
  };

  const bestXHolder: { value: CandidateX | null } = { value: null };
  const bestYHolder: { value: CandidateY | null } = { value: null };

  const movingCenterX = movingRect.x + movingRect.width / 2;
  const movingRight = movingRect.x + movingRect.width;
  const movingBottom = movingRect.y + movingRect.height;

  const tryCandidateX = (
    diff: number,
    proposedX: number,
    guideX: number,
    kind: AlignmentProposal['guideXKind'],
    target: UnitRect,
    brackets?: EqualSpacingBracket[]
  ) => {
    if (diff > thresholdPx) return;
    const vGap = getVerticalGapBetweenRects(movingRect, target);
    const score = diff + vGap * 0.008;
    if (!bestXHolder.value || score < bestXHolder.value.score) {
      bestXHolder.value = { score, diff, proposedX, guideX, kind, target, brackets };
    }
  };

  const tryCandidateY = (
    diff: number,
    proposedY: number,
    guideY: number,
    kind: AlignmentProposal['guideYKind'],
    target: UnitRect,
    brackets?: EqualSpacingBracket[]
  ) => {
    if (diff > thresholdPx) return;
    const hGap = getHorizontalGapBetweenRects(movingRect, target);
    const score = diff + hGap * 0.008;
    if (!bestYHolder.value || score < bestYHolder.value.score) {
      bestYHolder.value = { score, diff, proposedY, guideY, kind, target, brackets };
    }
  };

  if (snapEnabled) {
    for (const target of stationaryUnits) {
      const targetCenterX = target.x + target.width / 2;
      const targetRight = target.x + target.width;
      const targetBottom = target.y + target.height;

      // 1. Left edge alignment
      tryCandidateX(Math.abs(movingRect.x - target.x), target.x, target.x, 'left', target);

      // 2. Center X alignment (essential for Couple <-> Single centering)
      tryCandidateX(
        Math.abs(movingCenterX - targetCenterX),
        Math.round(targetCenterX - movingRect.width / 2),
        targetCenterX,
        'center',
        target
      );

      // 3. Right edge alignment
      tryCandidateX(
        Math.abs(movingRight - targetRight),
        targetRight - movingRect.width,
        targetRight,
        'right',
        target
      );

      // 4. Single card centered directly under either spouse of a stationary CoupleCard
      if (!movingRect.isCouple && target.spouseCentersX) {
        for (const spouseCenterX of target.spouseCentersX) {
          tryCandidateX(
            Math.abs(movingCenterX - spouseCenterX),
            Math.round(spouseCenterX - movingRect.width / 2),
            spouseCenterX,
            'spouse-center',
            target
          );
        }
      }

      // 5. Horizontal row alignment (Top / Bottom)
      if (!isPinnedY) {
        tryCandidateY(Math.abs(movingRect.y - target.y), target.y, target.y, 'top', target);
        tryCandidateY(
          Math.abs(movingBottom - targetBottom),
          targetBottom - movingRect.height,
          targetBottom,
          'bottom',
          target
        );
      }
    }

    // 6. Equal horizontal spacing on the same row
    const sameRowUnits = stationaryUnits
      .filter((u) => {
        const overlapY = Math.min(movingBottom, u.y + u.height) - Math.max(movingRect.y, u.y);
        return overlapY > 24;
      })
      .sort((a, b) => a.x - b.x);

    if (sameRowUnits.length >= 2) {
      for (let i = 0; i < sameRowUnits.length - 1; i++) {
        const a = sameRowUnits[i];
        const b = sameRowUnits[i + 1];
        const abGap = b.x - (a.x + a.width);
        if (abGap < 8 || abGap > 400) continue;

        // Place moving card to the right of B with the same gap as A->B
        const afterBX = b.x + b.width + abGap;
        const diffAfter = Math.abs(movingRect.x - afterBX);
        if (diffAfter <= thresholdPx) {
          const midYA = a.y + a.height / 2;
          const midYB = b.y + b.height / 2;
          tryCandidateX(diffAfter, afterBX, afterBX, 'spacing', b, [
            {
              axis: 'x',
              x1: a.x + a.width,
              y1: midYA,
              x2: b.x,
              y2: midYA,
              gapPx: abGap,
              labelCm: formatPxAsCm(abGap),
            },
            {
              axis: 'x',
              x1: b.x + b.width,
              y1: midYB,
              x2: afterBX,
              y2: midYB,
              gapPx: abGap,
              labelCm: formatPxAsCm(abGap),
            },
          ]);
        }

        // Place moving card to the left of A with the same gap as A->B
        const beforeAX = a.x - abGap - movingRect.width;
        const diffBefore = Math.abs(movingRect.x - beforeAX);
        if (diffBefore <= thresholdPx) {
          const midYA = a.y + a.height / 2;
          const midYB = b.y + b.height / 2;
          tryCandidateX(diffBefore, beforeAX, beforeAX + movingRect.width, 'spacing', a, [
            {
              axis: 'x',
              x1: beforeAX + movingRect.width,
              y1: midYA,
              x2: a.x,
              y2: midYA,
              gapPx: abGap,
              labelCm: formatPxAsCm(abGap),
            },
            {
              axis: 'x',
              x1: a.x + a.width,
              y1: midYB,
              x2: b.x,
              y2: midYB,
              gapPx: abGap,
              labelCm: formatPxAsCm(abGap),
            },
          ]);
        }

        // Center moving card evenly between A and B if space fits
        const availableBetween = b.x - (a.x + a.width);
        if (availableBetween >= movingRect.width + 16) {
          const centeredX = Math.round(a.x + a.width + (availableBetween - movingRect.width) / 2);
          const diffCenter = Math.abs(movingRect.x - centeredX);
          if (diffCenter <= thresholdPx) {
            const equalGap = (availableBetween - movingRect.width) / 2;
            const midY = movingRect.y + movingRect.height / 2;
            tryCandidateX(diffCenter, centeredX, centeredX + movingRect.width / 2, 'spacing', a, [
              {
                axis: 'x',
                x1: a.x + a.width,
                y1: midY,
                x2: centeredX,
                y2: midY,
                gapPx: equalGap,
                labelCm: formatPxAsCm(equalGap),
              },
              {
                axis: 'x',
                x1: centeredX + movingRect.width,
                y1: midY,
                x2: b.x,
                y2: midY,
                gapPx: equalGap,
                labelCm: formatPxAsCm(equalGap),
              },
            ]);
          }
        }
      }
    }

    // 7. Equal vertical spacing in the same column
    if (!isPinnedY) {
      const sameColUnits = stationaryUnits
        .filter((u) => {
          const overlapX = Math.min(movingRight, u.x + u.width) - Math.max(movingRect.x, u.x);
          return overlapX > 24;
        })
        .sort((a, b) => a.y - b.y);

      if (sameColUnits.length >= 2) {
        for (let i = 0; i < sameColUnits.length - 1; i++) {
          const a = sameColUnits[i];
          const b = sameColUnits[i + 1];
          const abGap = b.y - (a.y + a.height);
          if (abGap < 8 || abGap > 400) continue;

          const afterBY = b.y + b.height + abGap;
          const diffAfter = Math.abs(movingRect.y - afterBY);
          if (diffAfter <= thresholdPx) {
            const midX = b.x + b.width / 2;
            tryCandidateY(diffAfter, afterBY, afterBY, 'spacing', b, [
              {
                axis: 'y',
                x1: midX,
                y1: a.y + a.height,
                x2: midX,
                y2: b.y,
                gapPx: abGap,
                labelCm: formatPxAsCm(abGap),
              },
              {
                axis: 'y',
                x1: midX,
                y1: b.y + b.height,
                x2: midX,
                y2: afterBY,
                gapPx: abGap,
                labelCm: formatPxAsCm(abGap),
              },
            ]);
          }

          const beforeAY = a.y - abGap - movingRect.height;
          const diffBefore = Math.abs(movingRect.y - beforeAY);
          if (diffBefore <= thresholdPx) {
            const midX = a.x + a.width / 2;
            tryCandidateY(diffBefore, beforeAY, beforeAY + movingRect.height, 'spacing', a, [
              {
                axis: 'y',
                x1: midX,
                y1: beforeAY + movingRect.height,
                x2: midX,
                y2: a.y,
                gapPx: abGap,
                labelCm: formatPxAsCm(abGap),
              },
              {
                axis: 'y',
                x1: midX,
                y1: a.y + a.height,
                x2: midX,
                y2: b.y,
                gapPx: abGap,
                labelCm: formatPxAsCm(abGap),
              },
            ]);
          }
        }
      }
    }
  }

  const bestX = bestXHolder.value;
  const bestY = bestYHolder.value;

  if (!bestX && !bestY) {
    return null;
  }

  const effectiveRect: UnitRect = {
    ...movingRect,
    x: bestX ? bestX.proposedX : movingRect.x,
    y: bestY ? bestY.proposedY : movingRect.y,
  };

  // Compute distance in cm along the X alignment line to the closest card on that guide
  let xDistance: GuideDistanceSegment | undefined;
  let guideXSpan: { minY: number; maxY: number } | undefined;
  if (bestX) {
    const t = bestX.target;
    const gX = bestX.guideX;
    const minY = Math.min(effectiveRect.y, t.y);
    const maxY = Math.max(effectiveRect.y + effectiveRect.height, t.y + t.height);
    guideXSpan = { minY: minY - 28, maxY: maxY + 28 };

    const segY1 =
      effectiveRect.y >= t.y + t.height
        ? t.y + t.height
        : t.y >= effectiveRect.y + effectiveRect.height
        ? effectiveRect.y + effectiveRect.height
        : Math.max(effectiveRect.y, t.y);
    const segY2 =
      effectiveRect.y >= t.y + t.height
        ? effectiveRect.y
        : t.y >= effectiveRect.y + effectiveRect.height
        ? t.y
        : Math.min(effectiveRect.y + effectiveRect.height, t.y + t.height);
    const gapPx =
      effectiveRect.y >= t.y + t.height
        ? effectiveRect.y - (t.y + t.height)
        : t.y >= effectiveRect.y + effectiveRect.height
        ? t.y - (effectiveRect.y + effectiveRect.height)
        : 0;

    xDistance = {
      x1: gX,
      y1: segY1,
      x2: gX,
      y2: segY2,
      distancePx: gapPx,
      labelCm: formatPxAsCm(gapPx),
      targetUnitId: t.id,
    };
  }

  // Compute distance in cm along the Y alignment line to the closest card on that guide
  let yDistance: GuideDistanceSegment | undefined;
  let guideYSpan: { minX: number; maxX: number } | undefined;
  if (bestY) {
    const t = bestY.target;
    const gY = bestY.guideY;
    const minX = Math.min(effectiveRect.x, t.x);
    const maxX = Math.max(effectiveRect.x + effectiveRect.width, t.x + t.width);
    guideYSpan = { minX: minX - 28, maxX: maxX + 28 };

    const segX1 =
      effectiveRect.x >= t.x + t.width
        ? t.x + t.width
        : t.x >= effectiveRect.x + effectiveRect.width
        ? effectiveRect.x + effectiveRect.width
        : Math.max(effectiveRect.x, t.x);
    const segX2 =
      effectiveRect.x >= t.x + t.width
        ? effectiveRect.x
        : t.x >= effectiveRect.x + effectiveRect.width
        ? t.x
        : Math.min(effectiveRect.x + effectiveRect.width, t.x + t.width);
    const gapPx =
      effectiveRect.x >= t.x + t.width
        ? effectiveRect.x - (t.x + t.width)
        : t.x >= effectiveRect.x + effectiveRect.width
        ? t.x - (effectiveRect.x + effectiveRect.width)
        : 0;

    yDistance = {
      x1: segX1,
      y1: gY,
      x2: segX2,
      y2: gY,
      distancePx: gapPx,
      labelCm: formatPxAsCm(gapPx),
      targetUnitId: t.id,
    };
  }

  // Compute overall nearest stationary card/unit from effectiveRect (2D edge distance in cm)
  let nearestUnit: UnitRect | null = null;
  let nearestGeom: { x1: number; y1: number; x2: number; y2: number; dist: number } | null = null;
  for (const unit of stationaryUnits) {
    const geom = computeRectEdgeDistance(effectiveRect, unit);
    if (!nearestGeom || geom.dist < nearestGeom.dist) {
      nearestGeom = geom;
      nearestUnit = unit;
    }
  }

  let nearestDistance: AlignmentProposal['nearestDistance'];
  if (nearestUnit && nearestGeom) {
    const sameAsX = Boolean(
      xDistance &&
        xDistance.targetUnitId === nearestUnit.id &&
        Math.abs(xDistance.distancePx - nearestGeom.dist) < 4
    );
    const sameAsY = Boolean(
      yDistance &&
        yDistance.targetUnitId === nearestUnit.id &&
        Math.abs(yDistance.distancePx - nearestGeom.dist) < 4
    );
    nearestDistance = {
      x1: nearestGeom.x1,
      y1: nearestGeom.y1,
      x2: nearestGeom.x2,
      y2: nearestGeom.y2,
      distancePx: nearestGeom.dist,
      labelCm: formatPxAsCm(nearestGeom.dist),
      targetUnitId: nearestUnit.id,
      sameAsGuide: sameAsX || sameAsY,
    };
  }

  const spacingBrackets: EqualSpacingBracket[] = [
    ...(bestX?.brackets || []),
    ...(bestY?.brackets || []),
  ];

  return {
    proposedX: bestX?.proposedX,
    proposedY: bestY?.proposedY,
    guideX: bestX?.guideX,
    guideY: bestY?.guideY,
    guideXKind: bestX?.kind,
    guideYKind: bestY?.kind,
    guideXSpan,
    guideYSpan,
    xDistance,
    yDistance,
    nearestDistance,
    spacingBrackets: spacingBrackets.length > 0 ? spacingBrackets : undefined,
    movingWidth: movingRect.width,
    movingHeight: movingRect.height,
  };
}

/**
 * Computes standalone nearest-card distance (used during free manual placement with Alt or Arrow nudging).
 */
export function computeNearestCardMeasurement(
  movingRect: UnitRect,
  stationaryUnits: UnitRect[]
): (GuideDistanceSegment & { targetRect: UnitRect }) | null {
  if (stationaryUnits.length === 0) return null;
  let nearestUnit: UnitRect | null = null;
  let nearestGeom: { x1: number; y1: number; x2: number; y2: number; dist: number } | null = null;

  for (const unit of stationaryUnits) {
    const geom = computeRectEdgeDistance(movingRect, unit);
    if (!nearestGeom || geom.dist < nearestGeom.dist) {
      nearestGeom = geom;
      nearestUnit = unit;
    }
  }

  if (!nearestUnit || !nearestGeom) return null;
  return {
    x1: nearestGeom.x1,
    y1: nearestGeom.y1,
    x2: nearestGeom.x2,
    y2: nearestGeom.y2,
    distancePx: nearestGeom.dist,
    labelCm: formatPxAsCm(nearestGeom.dist),
    targetUnitId: nearestUnit.id,
    targetRect: nearestUnit,
  };
}

export type ManualAlignAction =
  | 'left'
  | 'center-x'
  | 'right'
  | 'top'
  | 'center-y'
  | 'bottom'
  | 'distribute-x'
  | 'distribute-y'
  | 'pack-row'
  | 'pack-col';

interface SelectedUnit {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  memberIds: string[];
  isPinnedY: boolean;
}

function buildSelectedUnits(
  persons: Record<string, Person>,
  personToCoupleMap: Record<string, CouplePairInfo>,
  selectedPersonIds: Set<string>
): SelectedUnit[] {
  const units: SelectedUnit[] = [];
  const visited = new Set<string>();

  selectedPersonIds.forEach((id) => {
    if (visited.has(id)) return;
    const p = persons[id];
    if (!p) return;

    const couple = personToCoupleMap[id];
    if (couple) {
      const p1 = persons[couple.person1.id];
      const p2 = persons[couple.person2.id];
      if (p1 && p2) {
        visited.add(p1.id);
        visited.add(p2.id);
        const minX = Math.min(p1.x, p2.x);
        const minY = Math.min(p1.y, p2.y);
        const isPinnedY = Boolean(
          (p1.isChronologicallyPinned && extractBirthYear(p1)) ||
            (p2.isChronologicallyPinned && extractBirthYear(p2))
        );
        units.push({
          id: `couple:${p1.id}:${p2.id}`,
          x: minX,
          y: minY,
          width: COUPLE_TOTAL_WIDTH,
          height: CARD_HEIGHT,
          memberIds: [p1.id, p2.id],
          isPinnedY,
        });
        return;
      }
    }

    visited.add(id);
    const isPinnedY = Boolean(p.isChronologicallyPinned && extractBirthYear(p));
    units.push({
      id: p.id,
      x: p.x,
      y: p.y,
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      memberIds: [p.id],
      isPinnedY,
    });
  });

  return units;
}

/**
 * Applies manual alignment, equal distribution, or exact-cm row/column spacing
 * to selected persons while keeping undivorced CoupleCards together and honoring chronological pins.
 */
export function applyManualAlignment(
  persons: Record<string, Person>,
  personToCoupleMap: Record<string, CouplePairInfo>,
  selectedPersonIds: Set<string>,
  action: ManualAlignAction,
  gapCm = 1.2
): {
  updatedPersons: Record<string, Person>;
  alignedUnitCount: number;
  skippedPinnedCount: number;
} {
  const units = buildSelectedUnits(persons, personToCoupleMap, selectedPersonIds);
  if (units.length < 2) {
    return { updatedPersons: persons, alignedUnitCount: 0, skippedPinnedCount: 0 };
  }

  const nextPersons: Record<string, Person> = { ...persons };
  let skippedPinnedCount = 0;

  const shiftUnit = (unit: SelectedUnit, dx: number, dy: number) => {
    const rDx = Math.round(dx);
    const rDy = unit.isPinnedY ? 0 : Math.round(dy);
    if (unit.isPinnedY && Math.abs(dy) > 0.5) {
      skippedPinnedCount++;
    }
    if (rDx === 0 && rDy === 0) return;

    unit.memberIds.forEach((memberId) => {
      const m = nextPersons[memberId];
      if (!m) return;
      nextPersons[memberId] = {
        ...m,
        x: m.x + rDx,
        y: m.y + rDy,
      };
    });
  };

  if (action === 'left') {
    const minX = Math.min(...units.map((u) => u.x));
    units.forEach((u) => shiftUnit(u, minX - u.x, 0));
  } else if (action === 'center-x') {
    const minX = Math.min(...units.map((u) => u.x));
    const maxR = Math.max(...units.map((u) => u.x + u.width));
    const centerX = (minX + maxR) / 2;
    units.forEach((u) => shiftUnit(u, centerX - (u.x + u.width / 2), 0));
  } else if (action === 'right') {
    const maxR = Math.max(...units.map((u) => u.x + u.width));
    units.forEach((u) => shiftUnit(u, maxR - (u.x + u.width), 0));
  } else if (action === 'top') {
    const movable = units.filter((u) => !u.isPinnedY);
    skippedPinnedCount = units.length - movable.length;
    if (movable.length >= 1) {
      const minY = Math.min(...units.map((u) => u.y));
      movable.forEach((u) => shiftUnit(u, 0, minY - u.y));
    }
  } else if (action === 'center-y') {
    const movable = units.filter((u) => !u.isPinnedY);
    skippedPinnedCount = units.length - movable.length;
    if (movable.length >= 1) {
      const minY = Math.min(...units.map((u) => u.y));
      const maxB = Math.max(...units.map((u) => u.y + u.height));
      const centerY = (minY + maxB) / 2;
      movable.forEach((u) => shiftUnit(u, 0, centerY - (u.y + u.height / 2)));
    }
  } else if (action === 'bottom') {
    const movable = units.filter((u) => !u.isPinnedY);
    skippedPinnedCount = units.length - movable.length;
    if (movable.length >= 1) {
      const maxB = Math.max(...units.map((u) => u.y + u.height));
      movable.forEach((u) => shiftUnit(u, 0, maxB - (u.y + u.height)));
    }
  } else if (action === 'distribute-x') {
    if (units.length >= 3) {
      const sorted = [...units].sort((a, b) => a.x - b.x);
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const totalSpan = last.x + last.width - first.x;
      const sumWidths = sorted.reduce((acc, u) => acc + u.width, 0);
      const gap = (totalSpan - sumWidths) / (sorted.length - 1);
      let cursorX = first.x + first.width + gap;
      for (let i = 1; i < sorted.length - 1; i++) {
        shiftUnit(sorted[i], cursorX - sorted[i].x, 0);
        cursorX += sorted[i].width + gap;
      }
    }
  } else if (action === 'distribute-y') {
    const movable = units.filter((u) => !u.isPinnedY).sort((a, b) => a.y - b.y);
    skippedPinnedCount = units.length - movable.length;
    if (movable.length >= 3) {
      const first = movable[0];
      const last = movable[movable.length - 1];
      const totalSpan = last.y + last.height - first.y;
      const sumHeights = movable.reduce((acc, u) => acc + u.height, 0);
      const gap = (totalSpan - sumHeights) / (movable.length - 1);
      let cursorY = first.y + first.height + gap;
      for (let i = 1; i < movable.length - 1; i++) {
        shiftUnit(movable[i], 0, cursorY - movable[i].y);
        cursorY += movable[i].height + gap;
      }
    }
  } else if (action === 'pack-row') {
    const gapPx = Math.max(0, Math.round(cmToPx(gapCm)));
    const sorted = [...units].sort((a, b) => a.x - b.x);
    const targetY = Math.round(
      units.reduce((sum, u) => sum + u.y, 0) / units.length
    );
    let cursorX = sorted[0].x;
    sorted.forEach((u, idx) => {
      const nextX = idx === 0 ? sorted[0].x : cursorX;
      shiftUnit(u, nextX - u.x, targetY - u.y);
      cursorX = nextX + u.width + gapPx;
    });
  } else if (action === 'pack-col') {
    const gapPx = Math.max(0, Math.round(cmToPx(gapCm)));
    const sorted = [...units].sort((a, b) => a.y - b.y);
    const avgCenterX = Math.round(
      units.reduce((sum, u) => sum + u.x + u.width / 2, 0) / units.length
    );
    let cursorY = sorted[0].y;
    sorted.forEach((u, idx) => {
      const nextX = Math.round(avgCenterX - u.width / 2);
      const nextY = idx === 0 ? sorted[0].y : cursorY;
      shiftUnit(u, nextX - u.x, nextY - u.y);
      cursorY = nextY + u.height + gapPx;
    });
  }

  return {
    updatedPersons: nextPersons,
    alignedUnitCount: units.length,
    skippedPinnedCount,
  };
}

export interface GenerationalGroupResult {
  updatedPersons: Record<string, Person>;
  groupedUnitCount: number;
  generationCount: number;
  skippedPinnedCount: number;
}

/**
 * Automatically groups and arranges ONLY the selected cards by generation
 * with oldest ancestors (grandparents, etc.) at the top, parents below them, and children at the bottom.
 * Keeps undivorced couples together, aligns connected branches cleanly without overlaps,
 * and anchors the arranged block at the selection's existing canvas position.
 */
export function groupSelectedByGenerations(
  persons: Record<string, Person>,
  personToCoupleMap: Record<string, CouplePairInfo>,
  selectedPersonIds: Set<string>,
  connectionOverrides?: Record<string, ConnectionMeta>,
  options?: { generationGap?: number; cardGap?: number }
): GenerationalGroupResult {
  const generationGap = options?.generationGap ?? 214;
  const cardGap = options?.cardGap ?? 36;

  // 1. Expand selected set to include undivorced partners so CoupleCards never tear apart
  const activeIds = new Set<string>();
  selectedPersonIds.forEach((id) => {
    const p = persons[id];
    if (!p) return;
    activeIds.add(id);
    const couple = personToCoupleMap[id];
    if (couple) {
      if (persons[couple.person1.id]) activeIds.add(couple.person1.id);
      if (persons[couple.person2.id]) activeIds.add(couple.person2.id);
    }
  });

  if (activeIds.size < 2) {
    return {
      updatedPersons: persons,
      groupedUnitCount: 0,
      generationCount: 0,
      skippedPinnedCount: 0,
    };
  }

  // 2. Compute generation tiers strictly within the selected subset:
  //    tier 0 = youngest (children), tier 1 = parents, tier 2 = grandparents, ...
  const gen: Record<string, number> = {};
  const idList = Array.from(activeIds);
  idList.forEach((id) => {
    gen[id] = 0;
  });

  const isSelected = (id: string) => activeIds.has(id) && Boolean(persons[id]);

  // Pass A: Bottom-up relaxation (parents must be >= child + 1; spouses & siblings share tier)
  let changed = true;
  let iter = 0;
  const maxIter = Math.max(40, idList.length * 4);
  while (changed && iter < maxIter) {
    changed = false;
    iter++;

    for (const id of idList) {
      const p = persons[id];
      if (!p) continue;

      for (const parentId of p.parents || []) {
        if (parentId !== id && isSelected(parentId)) {
          if (gen[parentId] <= gen[id]) {
            gen[parentId] = gen[id] + 1;
            changed = true;
          }
        }
      }

      for (const childId of p.children || []) {
        if (childId !== id && isSelected(childId)) {
          if (gen[id] <= gen[childId]) {
            gen[id] = gen[childId] + 1;
            changed = true;
          }
        }
      }

      for (const spouseId of p.spouses || []) {
        if (spouseId !== id && isSelected(spouseId)) {
          const maxG = Math.max(gen[id], gen[spouseId]);
          if (gen[id] !== maxG || gen[spouseId] !== maxG) {
            gen[id] = maxG;
            gen[spouseId] = maxG;
            changed = true;
          }
        }
      }

      for (const sibId of p.siblings || []) {
        if (sibId !== id && isSelected(sibId)) {
          const maxG = Math.max(gen[id], gen[sibId]);
          if (gen[id] !== maxG || gen[sibId] !== maxG) {
            gen[id] = maxG;
            gen[sibId] = maxG;
            changed = true;
          }
        }
      }
    }

    // Siblings that share any parent ID in the full tree also belong to the same tier
    const parentToSelectedChildren = new Map<string, string[]>();
    for (const id of idList) {
      const p = persons[id];
      if (!p) continue;
      for (const parId of p.parents || []) {
        const list = parentToSelectedChildren.get(parId);
        if (list) list.push(id);
        else parentToSelectedChildren.set(parId, [id]);
      }
    }
    parentToSelectedChildren.forEach((sibGroup) => {
      if (sibGroup.length < 2) return;
      const maxG = Math.max(...sibGroup.map((sid) => gen[sid]));
      for (const sid of sibGroup) {
        if (gen[sid] !== maxG) {
          gen[sid] = maxG;
          changed = true;
        }
      }
    });
  }

  // Pass B: Align childless siblings / aunts / uncles up (toward larger tier number)
  // to sit on the same row as siblings sharing their selected parents
  let changedB = true;
  let iterB = 0;
  while (changedB && iterB < maxIter) {
    changedB = false;
    iterB++;

    // Build spouse/sibling equivalence groups so raising one member raises the whole peer group safely
    const visitedComp = new Set<string>();
    for (const startId of idList) {
      if (visitedComp.has(startId)) continue;
      const comp: string[] = [];
      const queue = [startId];
      visitedComp.add(startId);

      while (queue.length > 0) {
        const currId = queue.shift()!;
        comp.push(currId);
        const curr = persons[currId];
        if (!curr) continue;
        const peers = [...(curr.spouses || []), ...(curr.siblings || [])];
        for (const peerId of peers) {
          if (isSelected(peerId) && !visitedComp.has(peerId)) {
            visitedComp.add(peerId);
            queue.push(peerId);
          }
        }
      }

      let maxAllowedTier = Infinity;
      let hasSelectedParent = false;
      for (const mId of comp) {
        const m = persons[mId];
        if (!m) continue;
        for (const parId of m.parents || []) {
          if (isSelected(parId)) {
            hasSelectedParent = true;
            maxAllowedTier = Math.min(maxAllowedTier, gen[parId] - 1);
          }
        }
      }

      if (hasSelectedParent && Number.isFinite(maxAllowedTier)) {
        const currentTier = Math.max(...comp.map((mId) => gen[mId]));
        if (maxAllowedTier > currentTier) {
          for (const mId of comp) {
            gen[mId] = maxAllowedTier;
          }
          changedB = true;
        }
      }
    }
  }

  // Normalize minimum tier to 0
  const minGen = Math.min(...idList.map((id) => gen[id]));
  if (minGen !== 0) {
    idList.forEach((id) => {
      gen[id] -= minGen;
    });
  }

  // 3. Build family units (couples stay together; singles stand alone)
  interface GenUnit {
    id: string;
    isCouple: boolean;
    memberIds: [string] | [string, string]; // ordered left-to-right for couples
    tier: number;
    x: number;
    y: number;
    origCenterX: number;
    origY: number;
    width: number;
    height: number;
    isPinnedY: boolean;
    parentUnitIds: string[];
    childUnitIds: string[];
  }

  const units: GenUnit[] = [];
  const personToUnit = new Map<string, GenUnit>();
  const processed = new Set<string>();

  for (const id of idList) {
    if (processed.has(id)) continue;
    const p = persons[id];
    if (!p) continue;

    const couple = personToCoupleMap[id];
    if (couple && activeIds.has(couple.person1.id) && activeIds.has(couple.person2.id)) {
      const c1 = persons[couple.person1.id];
      const c2 = persons[couple.person2.id];
      if (c1 && c2 && !processed.has(c1.id) && !processed.has(c2.id)) {
        const mKey = [c1.id, c2.id].sort().join('::');
        const isDivorced = connectionOverrides?.[`marriage:${mKey}`]?.eventType === 'divorce';
        if (!isDivorced) {
          processed.add(c1.id);
          processed.add(c2.id);

          let leftP = c1;
          let rightP = c2;
          if (c1.x > c2.x || (c1.x === c2.x && c1.gender === 'female' && c2.gender === 'male')) {
            leftP = c2;
            rightP = c1;
          }

          const minX = Math.min(leftP.x, rightP.x);
          const minY = Math.min(leftP.y, rightP.y);
          const isPinnedY = Boolean(
            (leftP.isChronologicallyPinned && extractBirthYear(leftP)) ||
              (rightP.isChronologicallyPinned && extractBirthYear(rightP))
          );
          const unit: GenUnit = {
            id: `couple:${leftP.id}:${rightP.id}`,
            isCouple: true,
            memberIds: [leftP.id, rightP.id],
            tier: Math.max(gen[leftP.id], gen[rightP.id]),
            x: minX,
            y: minY,
            origCenterX: minX + COUPLE_TOTAL_WIDTH / 2,
            origY: minY,
            width: COUPLE_TOTAL_WIDTH,
            height: CARD_HEIGHT,
            isPinnedY,
            parentUnitIds: [],
            childUnitIds: [],
          };
          units.push(unit);
          personToUnit.set(leftP.id, unit);
          personToUnit.set(rightP.id, unit);
          continue;
        }
      }
    }

    processed.add(id);
    const isPinnedY = Boolean(p.isChronologicallyPinned && extractBirthYear(p));
    const unit: GenUnit = {
      id: `single:${id}`,
      isCouple: false,
      memberIds: [id],
      tier: gen[id],
      x: p.x,
      y: p.y,
      origCenterX: p.x + CARD_WIDTH / 2,
      origY: p.y,
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      isPinnedY,
      parentUnitIds: [],
      childUnitIds: [],
    };
    units.push(unit);
    personToUnit.set(id, unit);
  }

  if (units.length < 2) {
    return {
      updatedPersons: persons,
      groupedUnitCount: 0,
      generationCount: 0,
      skippedPinnedCount: 0,
    };
  }

  // Link units (childUnitIds = tier - 1 side; parentUnitIds = tier + 1 side)
  const unitById = new Map<string, GenUnit>(units.map((u) => [u.id, u]));
  for (const unit of units) {
    const pSet = new Set<string>();
    const cSet = new Set<string>();
    for (const mId of unit.memberIds) {
      const m = persons[mId];
      if (!m) continue;
      for (const parId of m.parents || []) {
        const pUnit = personToUnit.get(parId);
        if (pUnit && pUnit.id !== unit.id) pSet.add(pUnit.id);
      }
      for (const chId of m.children || []) {
        const cUnit = personToUnit.get(chId);
        if (cUnit && cUnit.id !== unit.id) cSet.add(cUnit.id);
      }
    }
    unit.parentUnitIds = Array.from(pSet);
    unit.childUnitIds = Array.from(cSet);
  }

  // Capture anchor center X & top Y of the original selection
  const origMinX = Math.min(...units.map((u) => u.x));
  const origMaxX = Math.max(...units.map((u) => u.x + u.width));
  const origCenterX = (origMinX + origMaxX) / 2;
  const origMinY = Math.min(...units.map((u) => u.origY));

  const maxTier = Math.max(...units.map((u) => u.tier));
  const tiers: GenUnit[][] = Array.from({ length: maxTier + 1 }, () => []);
  for (const u of units) {
    tiers[u.tier].push(u);
  }

  // Helper to pack a tier around each unit's desiredCenterX without overlaps while keeping centered
  const packTier = (tierUnits: GenUnit[], desiredCenterFn: (u: GenUnit) => number) => {
    if (tierUnits.length === 0) return;

    const desiredMap = new Map<string, number>();
    tierUnits.forEach((u) => {
      desiredMap.set(u.id, desiredCenterFn(u));
    });

    tierUnits.sort((a, b) => {
      const da = desiredMap.get(a.id)!;
      const db = desiredMap.get(b.id)!;
      if (Math.abs(da - db) > 1) return da - db;
      return a.origCenterX - b.origCenterX;
    });

    // Place initially at desired centers
    tierUnits.forEach((u) => {
      u.x = desiredMap.get(u.id)! - u.width / 2;
    });

    // Resolve overlaps left-to-right
    for (let i = 1; i < tierUnits.length; i++) {
      const prev = tierUnits[i - 1];
      const curr = tierUnits[i];
      const minAllowedX = prev.x + prev.width + cardGap;
      if (curr.x < minAllowedX) {
        curr.x = minAllowedX;
      }
    }

    // Re-center the tier so the average center matches the average desired center
    const avgDesired =
      tierUnits.reduce((sum, u) => sum + desiredMap.get(u.id)!, 0) / tierUnits.length;
    const avgPlaced =
      tierUnits.reduce((sum, u) => sum + (u.x + u.width / 2), 0) / tierUnits.length;
    const shift = avgDesired - avgPlaced;
    tierUnits.forEach((u) => {
      u.x += shift;
    });
  };

  // Initial pack on tier 0 (children)
  packTier(tiers[0], (u) => u.origCenterX);

  // Pass 1 (Top-Down: Children -> Parents -> Grandparents)
  for (let t = 1; t <= maxTier; t++) {
    packTier(tiers[t], (u) => {
      const connectedChildren = u.childUnitIds
        .map((id) => unitById.get(id))
        .filter((cu): cu is GenUnit => Boolean(cu && cu.tier < t));
      if (connectedChildren.length > 0) {
        return (
          connectedChildren.reduce((sum, cu) => sum + (cu.x + cu.width / 2), 0) /
          connectedChildren.length
        );
      }
      return u.origCenterX;
    });
  }

  // Pass 2 (Ancestors -> Children): pull leaf units and single-child branches under their parents
  for (let t = maxTier - 1; t >= 0; t--) {
    packTier(tiers[t], (u) => {
      const connectedParents = u.parentUnitIds
        .map((id) => unitById.get(id))
        .filter((pu): pu is GenUnit => Boolean(pu && pu.tier > t));
      if (connectedParents.length > 0) {
        const hasChildrenBelow = u.childUnitIds.some((cid) => {
          const cu = unitById.get(cid);
          return Boolean(cu && cu.tier < t);
        });
        const parentHasMultipleBranches = connectedParents.some(
          (pu) => pu.childUnitIds.length > 1
        );
        if (!hasChildrenBelow || !parentHasMultipleBranches) {
          return (
            connectedParents.reduce((sum, pu) => sum + (pu.x + pu.width / 2), 0) /
            connectedParents.length
          );
        }
      }
      return u.x + u.width / 2;
    });
  }

  // Pass 3 (Children -> Ancestors): center parents over their finalized children
  for (let t = 1; t <= maxTier; t++) {
    packTier(tiers[t], (u) => {
      const connectedChildren = u.childUnitIds
        .map((id) => unitById.get(id))
        .filter((cu): cu is GenUnit => Boolean(cu && cu.tier < t));
      if (connectedChildren.length > 0) {
        return (
          connectedChildren.reduce((sum, cu) => sum + (cu.x + cu.width / 2), 0) /
          connectedChildren.length
        );
      }
      return u.x + u.width / 2;
    });
  }

  // Pass 4 (Final leaf polish): center childless units directly under their final parents
  for (let t = maxTier - 1; t >= 0; t--) {
    packTier(tiers[t], (u) => {
      const hasChildrenBelow = u.childUnitIds.some((cid) => {
        const cu = unitById.get(cid);
        return Boolean(cu && cu.tier < t);
      });
      if (!hasChildrenBelow) {
        const connectedParents = u.parentUnitIds
          .map((id) => unitById.get(id))
          .filter((pu): pu is GenUnit => Boolean(pu && pu.tier > t));
        if (connectedParents.length > 0) {
          return (
            connectedParents.reduce((sum, pu) => sum + (pu.x + pu.width / 2), 0) /
            connectedParents.length
          );
        }
      }
      return u.x + u.width / 2;
    });
  }

  // 4. Re-anchor the entire arranged block horizontally around origCenterX
  //    and place oldest ancestors (maxTier) at top (row 0) down to children (tier 0) at bottom
  const placedMinX = Math.min(...units.map((u) => u.x));
  const placedMaxX = Math.max(...units.map((u) => u.x + u.width));
  const placedCenterX = (placedMinX + placedMaxX) / 2;
  const globalShiftX = origCenterX - placedCenterX;

  let skippedPinnedCount = 0;
  const nextPersons: Record<string, Person> = { ...persons };

  for (const unit of units) {
    const finalX = Math.round(unit.x + globalShiftX);
    const rowFromTop = maxTier - unit.tier;
    const targetY = Math.round(origMinY + rowFromTop * generationGap);
    const finalY = unit.isPinnedY ? unit.origY : targetY;
    if (unit.isPinnedY && Math.abs(targetY - unit.origY) > 1) {
      skippedPinnedCount++;
    }

    if (unit.isCouple && unit.memberIds.length === 2) {
      const [leftId, rightId] = unit.memberIds;
      const pLeft = nextPersons[leftId];
      const pRight = nextPersons[rightId];
      if (pLeft) {
        nextPersons[leftId] = { ...pLeft, x: finalX, y: finalY };
      }
      if (pRight) {
        nextPersons[rightId] = { ...pRight, x: finalX + COUPLE_SPOUSE_OFFSET, y: finalY };
      }
    } else {
      const [singleId] = unit.memberIds;
      const pSingle = nextPersons[singleId];
      if (pSingle) {
        nextPersons[singleId] = { ...pSingle, x: finalX, y: finalY };
      }
    }
  }

  return {
    updatedPersons: nextPersons,
    groupedUnitCount: units.length,
    generationCount: maxTier + 1,
    skippedPinnedCount,
  };
}
