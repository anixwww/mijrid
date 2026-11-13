import React, { useMemo } from 'react';
import { Person, ConnectionMeta, BranchLinkCurveStyle, BranchLinkKind } from '../types/tree';
import { CARD_WIDTH, CARD_HEIGHT, COUPLE_SPOUSE_OFFSET } from '../utils/treeLayout';
import { groupPersonsIntoRenderUnits } from '../utils/lineageUtils';
import { buildBranchLinkArcGeometry, normalizeBranchLineShape } from '../utils/branchLinkGeometry';
import { ArrowUpRight, Settings } from 'lucide-react';

interface BranchLinksOverlayProps {
  persons: Record<string, Person>;
  connectionOverrides?: Record<string, ConnectionMeta>;
  renderUnits?: {
    couples: Array<{ person1: Person; person2: Person }>;
    singles: Person[];
  };
  visibleBounds?: { minX: number; maxX: number; minY: number; maxY: number };
  showAll: boolean;
  hoveredPersonId: string | null;
  selectedPersonId: string | null;
  hoveredBranchLink: { sourceId: string; targetId: string } | null;
  onHoverBranchLink?: (link: { sourceId: string; targetId: string } | null) => void;
  onJumpToBranchLink?: (targetPersonId: string, sourcePersonId: string) => void;
  isAdmin?: boolean;
  onEditBranchLink?: (sourcePersonId: string, linkId: string) => void;
  isDark?: boolean;
}

interface RenderedArc {
  key: string;
  linkId: string;
  sourceId: string;
  targetId: string;
  linkKind: BranchLinkKind;
  isBidirectional: boolean;
  pathD: string;
  startPt: { x: number; y: number };
  midX: number;
  midY: number;
  color: string;
  strokeWidth: number;
  lineShape: BranchLinkCurveStyle;
  markerId: string;
  label: string;
  sourceFullName: string;
  targetFullName: string;
  jumpTargetId: string;
  jumpSourceId: string;
  jumpTargetName: string;
  isEmphasized: boolean;
}

interface MarkerSpec {
  id: string;
  color: string;
  strokeWidth: number;
}

const BranchLinksOverlayComponent: React.FC<BranchLinksOverlayProps> = ({
  persons,
  connectionOverrides,
  renderUnits,
  visibleBounds,
  showAll,
  hoveredPersonId,
  selectedPersonId,
  hoveredBranchLink,
  onHoverBranchLink,
  onJumpToBranchLink,
  isAdmin = false,
  onEditBranchLink,
  isDark = false,
}) => {
  const posMap = useMemo(() => {
    const units = renderUnits || groupPersonsIntoRenderUnits(persons, connectionOverrides);
    const map: Record<string, { x: number; y: number }> = {};

    units.couples.forEach((c) => {
      const cx = Math.min(c.person1.x, c.person2.x);
      const cy = Math.min(c.person1.y, c.person2.y);
      map[c.person1.id] = { x: cx, y: cy };
      map[c.person2.id] = { x: cx + COUPLE_SPOUSE_OFFSET, y: cy };
    });
    units.singles.forEach((s) => {
      map[s.id] = { x: s.x, y: s.y };
    });
    return map;
  }, [renderUnits, persons, connectionOverrides]);

  const { arcs, markers } = useMemo(() => {
    const result: RenderedArc[] = [];
    const markerMap = new Map<string, MarkerSpec>();
    const renderedBidirectionalPairs = new Set<string>();

    Object.values(persons).forEach((source) => {
      if (!source.branchLinks || source.branchLinks.length === 0) return;
      const srcPos = posMap[source.id];
      if (!srcPos) return;

      const eligibleLinks = source.branchLinks.filter((bl) => {
        const target = persons[bl.targetPersonId];
        if (!target || target.id === source.id) return false;
        const tgtPos = posMap[target.id];
        if (!tgtPos) return false;

        const linkKind: BranchLinkKind = bl.linkKind === 'godparent' ? 'godparent' : 'branch';
        const reverseLink = (target.branchLinks || []).find(
          (rev) =>
            rev.targetPersonId === source.id &&
            (rev.linkKind === 'godparent' ? 'godparent' : 'branch') === linkKind
        );
        if (reverseLink) {
          const pairKey = [source.id, target.id].sort().join('::') + `:${linkKind}`;
          if (renderedBidirectionalPairs.has(pairKey) || source.id > target.id) {
            return false;
          }
          renderedBidirectionalPairs.add(pairKey);
        }
        return true;
      });

      const samePairTotals = new Map<string, number>();
      const samePairSeen = new Map<string, number>();

      eligibleLinks.forEach((bl) => {
        const shapeKey = `${bl.targetPersonId}:${normalizeBranchLineShape(bl.lineShape)}`;
        samePairTotals.set(shapeKey, (samePairTotals.get(shapeKey) || 0) + 1);
      });

      eligibleLinks.forEach((bl) => {
        const target = persons[bl.targetPersonId];
        if (!target) return;
        const tgtPos = posMap[target.id];
        if (!tgtPos) return;

        const linkKind: BranchLinkKind = bl.linkKind === 'godparent' ? 'godparent' : 'branch';
        const lineShape = normalizeBranchLineShape(bl.lineShape);

        const reverseLink = (target.branchLinks || []).find(
          (rev) =>
            rev.targetPersonId === source.id &&
            (rev.linkKind === 'godparent' ? 'godparent' : 'branch') === linkKind
        );
        const isBidirectional = Boolean(reverseLink);

        const shapeKey = `${bl.targetPersonId}:${lineShape}`;
        const parallelTotal = samePairTotals.get(shapeKey) || 1;
        const parallelIndex = samePairSeen.get(shapeKey) || 0;
        samePairSeen.set(shapeKey, parallelIndex + 1);

        const matchesHoverLink =
          hoveredBranchLink &&
          ((hoveredBranchLink.sourceId === source.id && hoveredBranchLink.targetId === target.id) ||
            (hoveredBranchLink.sourceId === target.id && hoveredBranchLink.targetId === source.id));

        const matchesPerson =
          hoveredPersonId === source.id ||
          hoveredPersonId === target.id ||
          selectedPersonId === source.id ||
          selectedPersonId === target.id;

        if (
          !showAll &&
          linkKind !== 'godparent' &&
          lineShape !== 'wavy' &&
          !matchesHoverLink &&
          !matchesPerson
        ) {
          return;
        }

        const scx = srcPos.x + CARD_WIDTH / 2;
        const scy = srcPos.y + CARD_HEIGHT / 2;
        const tcx = tgtPos.x + CARD_WIDTH / 2;
        const tcy = tgtPos.y + CARD_HEIGHT / 2;

        if (visibleBounds && !matchesHoverLink && !matchesPerson) {
          const margin = 320;
          const minArcX = Math.min(scx, tcx) - margin;
          const maxArcX = Math.max(scx, tcx) + margin;
          const minArcY = Math.min(scy, tcy) - margin;
          const maxArcY = Math.max(scy, tcy) + margin;
          if (
            maxArcX < visibleBounds.minX ||
            minArcX > visibleBounds.maxX ||
            maxArcY < visibleBounds.minY ||
            minArcY > visibleBounds.maxY
          ) {
            return;
          }
        }

        const baseWidth =
          typeof bl.strokeWidth === 'number' && bl.strokeWidth >= 1 && bl.strokeWidth <= 10
            ? Math.round(bl.strokeWidth)
            : 2;
        const isEmphasized = Boolean(
          matchesHoverLink ||
            hoveredPersonId === source.id ||
            selectedPersonId === source.id ||
            (isBidirectional &&
              (hoveredPersonId === target.id || selectedPersonId === target.id))
        );
        const currentStrokeWidth = isEmphasized ? Math.min(11, baseWidth + 0.8) : baseWidth;
        const symEndPad = 10 + Math.max(0, currentStrokeWidth - 2) * 0.45;

        const { pathD, midX, midY, startPt } = buildBranchLinkArcGeometry({
          scx,
          scy,
          tcx,
          tcy,
          cardWidth: CARD_WIDTH,
          cardHeight: CARD_HEIGHT,
          lineShape,
          hasReverseSameLine: false,
          strokeWidth: currentStrokeWidth,
          startPad: isBidirectional ? symEndPad : 5,
          parallelIndex,
          parallelTotal,
        });

        const color = bl.color || (linkKind === 'godparent' ? '#d97706' : '#4f46e5');
        const safeColorKey = color.replace(/[^a-zA-Z0-9_-]/g, '') || 'default';
        const markerKey = `${safeColorKey}-w${baseWidth}`;
        const markerId = `branch-arrow-${markerKey}`;
        if (!markerMap.has(markerKey)) {
          markerMap.set(markerKey, { id: markerId, color, strokeWidth: baseWidth });
        }

        const sourceFullName =
          [source.firstName, source.lastName].filter(Boolean).join(' ') || 'Картка';
        const targetFullName =
          [target.firstName, target.lastName].filter(Boolean).join(' ') || 'Картка';
        const jumpToSource = isBidirectional && selectedPersonId === target.id;
        const jumpTargetId = jumpToSource ? source.id : target.id;
        const jumpSourceId = jumpToSource ? target.id : source.id;
        const jumpTargetName = jumpToSource ? sourceFullName : targetFullName;

        const customLabel = bl.label?.trim() || reverseLink?.label?.trim() || '';
        const defaultLabel =
          linkKind === 'godparent'
            ? 'Хресний / Хресна'
            : isBidirectional
            ? `↔ ${jumpTargetName}`
            : `→ ${targetFullName}`;
        const label = customLabel || defaultLabel;

        result.push({
          key: `${source.id}-${bl.id}-${target.id}`,
          linkId: bl.id,
          sourceId: source.id,
          targetId: target.id,
          linkKind,
          isBidirectional,
          pathD,
          startPt,
          midX,
          midY,
          color,
          strokeWidth: currentStrokeWidth,
          lineShape,
          markerId,
          label,
          sourceFullName,
          targetFullName,
          jumpTargetId,
          jumpSourceId,
          jumpTargetName,
          isEmphasized,
        });
      });
    });

    return { arcs: result, markers: Array.from(markerMap.values()) };
  }, [persons, posMap, visibleBounds, showAll, hoveredPersonId, selectedPersonId, hoveredBranchLink]);

  if (arcs.length === 0) return null;

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: hoveredBranchLink ? 34 : 24 }}
    >
      <svg
        className="absolute top-0 left-0 w-full h-full pointer-events-none"
        style={{ overflow: 'visible' }}
      >
        <defs>
          {markers.map((m) => {
            const arrowLen = Math.max(11, Math.min(24, 9 + m.strokeWidth * 1.4));
            const arrowHalfH = Math.max(5.5, Math.min(12, 4.2 + m.strokeWidth * 0.75));
            const refX = Math.max(2, Number((arrowLen * 0.62).toFixed(1)));
            const notchX = Number((arrowLen * 0.2).toFixed(1));
            return (
              <marker
                key={m.id}
                id={m.id}
                viewBox={`0 0 ${arrowLen} ${arrowHalfH * 2}`}
                refX={refX}
                refY={arrowHalfH}
                markerWidth={arrowLen}
                markerHeight={arrowHalfH * 2}
                markerUnits="userSpaceOnUse"
                orient="auto-start-reverse"
              >
                <path
                  d={`M 0 0 L ${arrowLen} ${arrowHalfH} L 0 ${arrowHalfH * 2} L ${notchX} ${arrowHalfH} z`}
                  fill={m.color}
                />
              </marker>
            );
          })}
        </defs>

        {arcs.map((arc) => (
          <g key={arc.key}>
            {/* Soft halo for legibility over genealogical lines */}
            <path
              d={arc.pathD}
              fill="none"
              stroke={isDark ? 'rgba(9, 9, 11, 0.78)' : 'rgba(255, 255, 255, 0.88)'}
              strokeWidth={arc.strokeWidth + 2.8}
              strokeLinecap="butt"
              pointerEvents="none"
            />
            <path
              d={arc.pathD}
              fill="none"
              stroke={arc.color}
              strokeWidth={arc.strokeWidth}
              strokeDasharray={arc.lineShape === 'wavy' ? undefined : '7 4'}
              strokeLinecap={arc.lineShape === 'wavy' ? 'round' : 'butt'}
              strokeLinejoin="round"
              markerStart={arc.isBidirectional ? `url(#${arc.markerId})` : undefined}
              markerEnd={`url(#${arc.markerId})`}
              opacity={arc.isEmphasized ? 1 : 0.9}
              pointerEvents="none"
            />
            {/* Origin anchor dot on 1-way links so direction source -> target is crystal clear */}
            {!arc.isBidirectional && (
              <circle
                cx={arc.startPt.x}
                cy={arc.startPt.y}
                r={Math.max(2.6, Math.min(5.5, arc.strokeWidth * 0.7 + 1.2))}
                fill={arc.color}
                stroke={isDark ? '#18181b' : '#ffffff'}
                strokeWidth={1.3}
                opacity={arc.isEmphasized ? 1 : 0.9}
                pointerEvents="none"
              />
            )}
            {/* Hit target along the arrow line (hover highlight + admin edit) */}
            <path
              d={arc.pathD}
              fill="none"
              stroke="transparent"
              strokeWidth={Math.max(18, arc.strokeWidth + 14)}
              strokeLinecap="round"
              className={`pointer-events-auto ${isAdmin && onEditBranchLink ? 'cursor-pointer' : 'cursor-default'}`}
              onMouseEnter={() =>
                onHoverBranchLink?.({ sourceId: arc.sourceId, targetId: arc.targetId })
              }
              onMouseLeave={() => onHoverBranchLink?.(null)}
              onMouseDown={(e) => {
                if (isAdmin && onEditBranchLink) e.stopPropagation();
              }}
              onClick={(e) => {
                if (isAdmin && onEditBranchLink) {
                  e.stopPropagation();
                  onEditBranchLink(arc.sourceId, arc.linkId);
                }
              }}
            >
              <title>
                {isAdmin && onEditBranchLink
                  ? 'Клікніть, щоб налаштувати стиль стрілки (колір, товщина, форма)'
                  : `${arc.sourceFullName} ${arc.isBidirectional ? '↔' : '→'} ${arc.targetFullName}`}
              </title>
            </path>
          </g>
        ))}
      </svg>

      {/* Clickable Midpoint Pill Labels */}
      {arcs.map((arc) => (
        <div
          key={`pill-${arc.key}`}
          style={{
            left: `${arc.midX}px`,
            top: `${arc.midY}px`,
          }}
          className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 flex items-center gap-0.5"
          onMouseEnter={() =>
            onHoverBranchLink?.({ sourceId: arc.sourceId, targetId: arc.targetId })
          }
          onMouseLeave={() => onHoverBranchLink?.(null)}
        >
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onJumpToBranchLink?.(arc.jumpTargetId, arc.jumpSourceId);
            }}
            style={{
              borderColor: arc.color,
            }}
            className={`px-2 py-0.5 rounded-full bg-white/95 dark:bg-zinc-900/95 border shadow-md hover:scale-105 transition-transform flex items-center gap-1 text-[10px] font-bold text-stone-800 dark:text-zinc-100 max-w-[185px] cursor-pointer ${
              arc.isEmphasized ? 'scale-105 shadow-lg' : ''
            }`}
            title={`Перейти до картки: ${arc.jumpTargetName}`}
          >
            {arc.linkKind === 'godparent' ? (
              <span className="text-[10px] leading-none shrink-0" style={{ color: arc.color }}>
                ✝
              </span>
            ) : (
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: arc.color }}
              />
            )}
            <span className="truncate">{arc.label}</span>
            <ArrowUpRight size={10.5} className="shrink-0" style={{ color: arc.color }} />
          </button>

          {isAdmin && onEditBranchLink && (
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onEditBranchLink(arc.sourceId, arc.linkId);
              }}
              style={{ borderColor: arc.color }}
              className="w-5 h-5 rounded-full bg-white/95 dark:bg-zinc-900/95 border shadow-md flex items-center justify-center text-stone-500 hover:text-indigo-600 dark:text-zinc-400 dark:hover:text-indigo-300 hover:scale-110 transition-all cursor-pointer shrink-0"
              title="Налаштувати стиль стрілки (колір, товщина, форма)"
            >
              <Settings size={10} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
};

export const BranchLinksOverlay = React.memo(BranchLinksOverlayComponent);
