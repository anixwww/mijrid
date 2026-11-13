import { BranchLinkCurveStyle } from '../types/tree';

export function normalizeBranchLineShape(shape?: string | null): BranchLinkCurveStyle {
  if (shape === 'straight') return 'straight';
  if (shape === 'wavy') return 'wavy';
  return 'curved';
}

export function getBranchLineShapeLabel(shape?: string | null): string {
  const norm = normalizeBranchLineShape(shape);
  if (norm === 'straight') return 'пряма';
  if (norm === 'wavy') return 'хвиляста';
  return 'вигнута';
}

export function intersectCardEdge(
  cx: number,
  cy: number,
  towardsX: number,
  towardsY: number,
  cardWidth: number,
  cardHeight: number,
  pad = 5
): { x: number; y: number } {
  const dx = towardsX - cx;
  const dy = towardsY - cy;
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
    return { x: cx, y: cy };
  }
  const halfW = cardWidth / 2 + pad;
  const halfH = cardHeight / 2 + pad;
  const tx = Math.abs(dx) > 0.001 ? halfW / Math.abs(dx) : Infinity;
  const ty = Math.abs(dy) > 0.001 ? halfH / Math.abs(dy) : Infinity;
  const t = Math.min(tx, ty, 1);
  return {
    x: cx + dx * t,
    y: cy + dy * t,
  };
}

/**
 * Builds a smooth C1-continuous sinusoidal SVG path between startPt and endPt,
 * with a tiny straight lead into endPt so the arrowhead aligns cleanly with the card edge.
 */
export function buildWavyPath(
  startPt: { x: number; y: number },
  endPt: { x: number; y: number }
): { pathD: string; midX: number; midY: number } {
  const dx = endPt.x - startPt.x;
  const dy = endPt.y - startPt.y;
  const dist = Math.hypot(dx, dy);

  const midX = (startPt.x + endPt.x) / 2;
  const midY = (startPt.y + endPt.y) / 2;

  if (dist < 14) {
    return {
      pathD: `M ${startPt.x.toFixed(1)} ${startPt.y.toFixed(1)} L ${endPt.x.toFixed(1)} ${endPt.y.toFixed(1)}`,
      midX,
      midY,
    };
  }

  const ux = dx / dist;
  const uy = dy / dist;
  const nx = -uy;
  const ny = ux;

  // Leave a short straight tail (6px) at the end so markerEnd arrowhead points directly along the chord
  const tailLen = Math.min(6, dist * 0.15);
  const waveDist = Math.max(8, dist - tailLen);

  const halfWaves = Math.max(4, Math.round(waveDist / 16));
  const step = waveDist / halfWaves;
  const amp = Math.min(8.5, Math.max(5.5, step * 0.42));

  const p1x = startPt.x + ux * step;
  const p1y = startPt.y + uy * step;
  const c0x = (startPt.x + p1x) / 2 + nx * amp;
  const c0y = (startPt.y + p1y) / 2 + ny * amp;

  const segments: string[] = [
    `M ${startPt.x.toFixed(1)} ${startPt.y.toFixed(1)}`,
    `Q ${c0x.toFixed(1)} ${c0y.toFixed(1)} ${p1x.toFixed(1)} ${p1y.toFixed(1)}`,
  ];

  for (let i = 2; i <= halfWaves; i += 1) {
    const px = startPt.x + ux * (step * i);
    const py = startPt.y + uy * (step * i);
    segments.push(`T ${px.toFixed(1)} ${py.toFixed(1)}`);
  }

  if (tailLen > 0.5) {
    segments.push(`L ${endPt.x.toFixed(1)} ${endPt.y.toFixed(1)}`);
  }

  return {
    pathD: segments.join(' '),
    midX,
    midY,
  };
}

export function buildBranchLinkArcGeometry(params: {
  scx: number;
  scy: number;
  tcx: number;
  tcy: number;
  cardWidth: number;
  cardHeight: number;
  lineShape: BranchLinkCurveStyle;
  hasReverseSameLine: boolean;
  strokeWidth?: number;
  startPad?: number;
  parallelIndex?: number;
  parallelTotal?: number;
}): {
  pathD: string;
  midX: number;
  midY: number;
  startPt: { x: number; y: number };
  endPt: { x: number; y: number };
} {
  const {
    scx,
    scy,
    tcx,
    tcy,
    cardWidth,
    cardHeight,
    lineShape,
    hasReverseSameLine,
    strokeWidth = 2,
    startPad = 5,
    parallelIndex = 0,
    parallelTotal = 1,
  } = params;

  const dx = tcx - scx;
  const dy = tcy - scy;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = -dy / dist;
  const ny = dx / dist;

  // Keep arrowhead tip clearly outside card edge regardless of stroke thickness
  const endPad = 10 + Math.max(0, strokeWidth - 2) * 0.45;
  const resolvedStartPad = Math.max(5, startPad);
  const parallelShift =
    parallelTotal > 1 ? (parallelIndex - (parallelTotal - 1) / 2) * 20 : 0;

  if (lineShape === 'straight') {
    const reverseShift = hasReverseSameLine ? 16 : 0;
    const offset = reverseShift + parallelShift;
    const ox = nx * offset;
    const oy = ny * offset;

    const startPt = intersectCardEdge(
      scx + ox,
      scy + oy,
      tcx + ox,
      tcy + oy,
      cardWidth,
      cardHeight,
      resolvedStartPad
    );
    const endPt = intersectCardEdge(
      tcx + ox,
      tcy + oy,
      scx + ox,
      scy + oy,
      cardWidth,
      cardHeight,
      endPad
    );

    const midT = hasReverseSameLine ? 0.42 : 0.5;
    return {
      pathD: `M ${startPt.x.toFixed(1)} ${startPt.y.toFixed(1)} L ${endPt.x.toFixed(1)} ${endPt.y.toFixed(1)}`,
      midX: startPt.x + (endPt.x - startPt.x) * midT,
      midY: startPt.y + (endPt.y - startPt.y) * midT,
      startPt,
      endPt,
    };
  }

  if (lineShape === 'wavy') {
    const reverseShift = hasReverseSameLine ? 17 : 0;
    const offset = reverseShift + parallelShift;
    const ox = nx * offset;
    const oy = ny * offset;

    const startPt = intersectCardEdge(
      scx + ox,
      scy + oy,
      tcx + ox,
      tcy + oy,
      cardWidth,
      cardHeight,
      resolvedStartPad
    );
    const endPt = intersectCardEdge(
      tcx + ox,
      tcy + oy,
      scx + ox,
      scy + oy,
      cardWidth,
      cardHeight,
      endPad
    );

    const wavy = buildWavyPath(startPt, endPt);
    const midT = hasReverseSameLine ? 0.42 : 0.5;
    return {
      pathD: wavy.pathD,
      midX: startPt.x + (endPt.x - startPt.x) * midT,
      midY: startPt.y + (endPt.y - startPt.y) * midT,
      startPt,
      endPt,
    };
  }

  // Curved: bend perpendicular to chord; opposite directions naturally bend to opposite sides
  const baseCurve = Math.min(130, Math.max(46, dist * 0.18));
  const curveAmount = baseCurve + parallelShift * 1.4;
  const ctrlX = (scx + tcx) / 2 + nx * curveAmount;
  const ctrlY = (scy + tcy) / 2 + ny * curveAmount;

  const startPt = intersectCardEdge(scx, scy, ctrlX, ctrlY, cardWidth, cardHeight, resolvedStartPad);
  const endPt = intersectCardEdge(tcx, tcy, ctrlX, ctrlY, cardWidth, cardHeight, endPad);

  return {
    pathD: `M ${startPt.x.toFixed(1)} ${startPt.y.toFixed(1)} Q ${ctrlX.toFixed(1)} ${ctrlY.toFixed(1)} ${endPt.x.toFixed(1)} ${endPt.y.toFixed(1)}`,
    midX: 0.25 * startPt.x + 0.5 * ctrlX + 0.25 * endPt.x,
    midY: 0.25 * startPt.y + 0.5 * ctrlY + 0.25 * endPt.y,
    startPt,
    endPt,
  };
}
