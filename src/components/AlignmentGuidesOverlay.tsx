import React from 'react';
import {
  AlignmentProposal,
  GuideDistanceSegment,
  UnitRect,
} from '../utils/alignmentUtils';

interface AlignmentGuidesOverlayProps {
  movingRect: UnitRect;
  proposal: AlignmentProposal | null;
  standaloneNearest?: (GuideDistanceSegment & { targetRect: UnitRect }) | null;
  zoom: number;
  isDark: boolean;
  isFreeDrag?: boolean;
  isNudgeMode?: boolean;
}

const DistanceBadge: React.FC<{
  x: number;
  y: number;
  label: string;
  invZoom: number;
  tone: 'emerald' | 'sky' | 'amber';
  isDark: boolean;
}> = ({ x, y, label, invZoom, tone, isDark }) => {
  const width = Math.max(46, label.length * 6.4 + 14);
  const height = 19;

  const colors =
    tone === 'emerald'
      ? {
          bg: isDark ? '#065f46' : '#059669',
          border: isDark ? '#34d399' : '#047857',
          text: '#ffffff',
        }
      : tone === 'sky'
      ? {
          bg: isDark ? '#075985' : '#0284c7',
          border: isDark ? '#38bdf8' : '#0369a1',
          text: '#ffffff',
        }
      : {
          bg: isDark ? '#92400e' : '#d97706',
          border: isDark ? '#fbbf24' : '#b45309',
          text: '#ffffff',
        };

  return (
    <g transform={`translate(${x}, ${y}) scale(${invZoom})`}>
      <rect
        x={-width / 2}
        y={-height / 2}
        width={width}
        height={height}
        rx={6}
        fill={colors.bg}
        stroke={colors.border}
        strokeWidth={1}
      />
      <text
        x={0}
        y={3.5}
        textAnchor="middle"
        fontSize={10}
        fontWeight={700}
        fill={colors.text}
        className="font-mono"
      >
        {label}
      </text>
    </g>
  );
};

export const AlignmentGuidesOverlay: React.FC<AlignmentGuidesOverlayProps> = ({
  movingRect,
  proposal,
  standaloneNearest,
  zoom,
  isDark,
  isFreeDrag = false,
  isNudgeMode = false,
}) => {
  if (!proposal && !standaloneNearest) return null;

  const safeZoom = Math.max(0.25, zoom);
  const invZoom = 1 / safeZoom;
  const strokeMain = isDark ? '#34d399' : '#059669';
  const strokeNearest = isDark ? '#38bdf8' : '#0284c7';
  const strokeSpacing = isDark ? '#fbbf24' : '#d97706';

  const targetX = proposal?.proposedX !== undefined ? proposal.proposedX : movingRect.x;
  const targetY = proposal?.proposedY !== undefined ? proposal.proposedY : movingRect.y;
  const boxW = proposal?.movingWidth ?? movingRect.width;
  const boxH = proposal?.movingHeight ?? movingRect.height;

  const tickHalf = 5 * invZoom;
  const dotR = 3.2 * invZoom;

  return (
    <svg
      className="absolute top-0 left-0 w-full h-full pointer-events-none"
      style={{ overflow: 'visible', zIndex: 35 }}
    >
      {/* 1. Vertical Alignment Guide Line + Distance in cm */}
      {proposal?.guideX !== undefined && (
        <g>
          <line
            x1={proposal.guideX}
            y1={proposal.guideXSpan?.minY ?? targetY - 120}
            x2={proposal.guideX}
            y2={proposal.guideXSpan?.maxY ?? targetY + boxH + 120}
            stroke={strokeMain}
            strokeWidth={1.6 * invZoom}
            strokeDasharray={`${5 * invZoom},${3.5 * invZoom}`}
            opacity={0.9}
          />

          {/* Subtle opposite edge reference when aligning card-to-card edges */}
          {proposal.guideXKind === 'left' && (
            <line
              x1={proposal.guideX + boxW}
              y1={proposal.guideXSpan?.minY ?? targetY - 60}
              x2={proposal.guideX + boxW}
              y2={proposal.guideXSpan?.maxY ?? targetY + boxH + 60}
              stroke={strokeMain}
              strokeWidth={1 * invZoom}
              strokeDasharray={`${3 * invZoom},${3 * invZoom}`}
              opacity={0.35}
            />
          )}

          {/* Vertical gap segment + cm badge to closest aligned card */}
          {proposal.xDistance && (
            <g>
              {proposal.xDistance.distancePx >= 2 && (
                <>
                  <line
                    x1={proposal.xDistance.x1}
                    y1={proposal.xDistance.y1}
                    x2={proposal.xDistance.x2}
                    y2={proposal.xDistance.y2}
                    stroke={strokeMain}
                    strokeWidth={2 * invZoom}
                  />
                  {/* Perpendicular end ticks */}
                  <line
                    x1={proposal.xDistance.x1 - tickHalf}
                    y1={proposal.xDistance.y1}
                    x2={proposal.xDistance.x1 + tickHalf}
                    y2={proposal.xDistance.y1}
                    stroke={strokeMain}
                    strokeWidth={1.6 * invZoom}
                  />
                  <line
                    x1={proposal.xDistance.x2 - tickHalf}
                    y1={proposal.xDistance.y2}
                    x2={proposal.xDistance.x2 + tickHalf}
                    y2={proposal.xDistance.y2}
                    stroke={strokeMain}
                    strokeWidth={1.6 * invZoom}
                  />
                </>
              )}
              <circle
                cx={proposal.xDistance.x1}
                cy={proposal.xDistance.y1}
                r={dotR}
                fill={strokeMain}
              />
              <circle
                cx={proposal.xDistance.x2}
                cy={proposal.xDistance.y2}
                r={dotR}
                fill={strokeMain}
              />
              <DistanceBadge
                x={(proposal.xDistance.x1 + proposal.xDistance.x2) / 2}
                y={(proposal.xDistance.y1 + proposal.xDistance.y2) / 2}
                label={`↕ ${proposal.xDistance.labelCm}`}
                invZoom={invZoom}
                tone="emerald"
                isDark={isDark}
              />
            </g>
          )}
        </g>
      )}

      {/* 2. Horizontal Alignment Guide Line + Distance in cm */}
      {proposal?.guideY !== undefined && (
        <g>
          <line
            x1={proposal.guideYSpan?.minX ?? targetX - 120}
            y1={proposal.guideY}
            x2={proposal.guideYSpan?.maxX ?? targetX + boxW + 120}
            y2={proposal.guideY}
            stroke={strokeMain}
            strokeWidth={1.6 * invZoom}
            strokeDasharray={`${5 * invZoom},${3.5 * invZoom}`}
            opacity={0.9}
          />

          {proposal.guideYKind === 'top' && (
            <line
              x1={proposal.guideYSpan?.minX ?? targetX - 60}
              y1={proposal.guideY + boxH}
              x2={proposal.guideYSpan?.maxX ?? targetX + boxW + 60}
              y2={proposal.guideY + boxH}
              stroke={strokeMain}
              strokeWidth={1 * invZoom}
              strokeDasharray={`${3 * invZoom},${3 * invZoom}`}
              opacity={0.35}
            />
          )}

          {/* Horizontal gap segment + cm badge to closest aligned card */}
          {proposal.yDistance && (
            <g>
              {proposal.yDistance.distancePx >= 2 && (
                <>
                  <line
                    x1={proposal.yDistance.x1}
                    y1={proposal.yDistance.y1}
                    x2={proposal.yDistance.x2}
                    y2={proposal.yDistance.y2}
                    stroke={strokeMain}
                    strokeWidth={2 * invZoom}
                  />
                  <line
                    x1={proposal.yDistance.x1}
                    y1={proposal.yDistance.y1 - tickHalf}
                    x2={proposal.yDistance.x1}
                    y2={proposal.yDistance.y1 + tickHalf}
                    stroke={strokeMain}
                    strokeWidth={1.6 * invZoom}
                  />
                  <line
                    x1={proposal.yDistance.x2}
                    y1={proposal.yDistance.y2 - tickHalf}
                    x2={proposal.yDistance.x2}
                    y2={proposal.yDistance.y2 + tickHalf}
                    stroke={strokeMain}
                    strokeWidth={1.6 * invZoom}
                  />
                </>
              )}
              <circle
                cx={proposal.yDistance.x1}
                cy={proposal.yDistance.y1}
                r={dotR}
                fill={strokeMain}
              />
              <circle
                cx={proposal.yDistance.x2}
                cy={proposal.yDistance.y2}
                r={dotR}
                fill={strokeMain}
              />
              <DistanceBadge
                x={(proposal.yDistance.x1 + proposal.yDistance.x2) / 2}
                y={(proposal.yDistance.y1 + proposal.yDistance.y2) / 2}
                label={`↔ ${proposal.yDistance.labelCm}`}
                invZoom={invZoom}
                tone="emerald"
                isDark={isDark}
              />
            </g>
          )}
        </g>
      )}

      {/* 3. Equal-Spacing Brackets (when snapped to equal gap with neighbors) */}
      {proposal?.spacingBrackets?.map((br, idx) => (
        <g key={`sp-${idx}`}>
          <line
            x1={br.x1}
            y1={br.y1}
            x2={br.x2}
            y2={br.y2}
            stroke={strokeSpacing}
            strokeWidth={1.8 * invZoom}
          />
          {br.axis === 'x' ? (
            <>
              <line
                x1={br.x1}
                y1={br.y1 - tickHalf}
                x2={br.x1}
                y2={br.y1 + tickHalf}
                stroke={strokeSpacing}
                strokeWidth={1.5 * invZoom}
              />
              <line
                x1={br.x2}
                y1={br.y2 - tickHalf}
                x2={br.x2}
                y2={br.y2 + tickHalf}
                stroke={strokeSpacing}
                strokeWidth={1.5 * invZoom}
              />
            </>
          ) : (
            <>
              <line
                x1={br.x1 - tickHalf}
                y1={br.y1}
                x2={br.x1 + tickHalf}
                y2={br.y1}
                stroke={strokeSpacing}
                strokeWidth={1.5 * invZoom}
              />
              <line
                x1={br.x2 - tickHalf}
                y1={br.y2}
                x2={br.x2 + tickHalf}
                y2={br.y2}
                stroke={strokeSpacing}
                strokeWidth={1.5 * invZoom}
              />
            </>
          )}
          <DistanceBadge
            x={(br.x1 + br.x2) / 2}
            y={(br.y1 + br.y2) / 2}
            label={`= ${br.labelCm}`}
            invZoom={invZoom}
            tone="amber"
            isDark={isDark}
          />
        </g>
      ))}

      {/* 4. Nearest Card Caliper Line (shown when overall nearest card is different from the aligned guide target, OR in free/nudge mode) */}
      {(() => {
        const nearest =
          proposal?.nearestDistance && !proposal.nearestDistance.sameAsGuide
            ? proposal.nearestDistance
            : !proposal
            ? standaloneNearest
            : null;
        if (!nearest || nearest.distancePx > 1200) return null;

        return (
          <g>
            <line
              x1={nearest.x1}
              y1={nearest.y1}
              x2={nearest.x2}
              y2={nearest.y2}
              stroke={strokeNearest}
              strokeWidth={1.5 * invZoom}
              strokeDasharray={`${3.5 * invZoom},${2.5 * invZoom}`}
              opacity={0.95}
            />
            <circle cx={nearest.x1} cy={nearest.y1} r={dotR} fill={strokeNearest} />
            <circle cx={nearest.x2} cy={nearest.y2} r={dotR} fill={strokeNearest} />
            <DistanceBadge
              x={(nearest.x1 + nearest.x2) / 2}
              y={(nearest.y1 + nearest.y2) / 2}
              label={nearest.labelCm}
              invZoom={invZoom}
              tone="sky"
              isDark={isDark}
            />
          </g>
        );
      })()}

      {/* 5. Landing Outline & Subtle Hint Chip */}
      {!isNudgeMode && (proposal || isFreeDrag) && (
        <g transform={`translate(${targetX}, ${targetY})`}>
          {proposal && (
            <rect
              x={0}
              y={0}
              width={boxW}
              height={boxH}
              rx={12}
              fill="none"
              stroke={strokeMain}
              strokeWidth={2 * invZoom}
              strokeDasharray={`${5 * invZoom},${3 * invZoom}`}
              opacity={0.85}
            />
          )}
          <g transform={`translate(${boxW / 2}, ${boxH + 16 * invZoom}) scale(${invZoom})`}>
            {(() => {
              const label = isFreeDrag
                ? 'Вільне переміщення'
                : 'Вирівняно • Alt — вільно';
              const pillW = isFreeDrag ? 128 : 154;
              return (
                <>
                  <rect
                    x={-pillW / 2}
                    y={-10}
                    width={pillW}
                    height={20}
                    rx={6}
                    fill={
                      isFreeDrag
                        ? isDark
                          ? '#27272a'
                          : '#44403c'
                        : isDark
                        ? '#065f46'
                        : '#047857'
                    }
                    stroke={
                      isFreeDrag
                        ? isDark
                          ? '#52525b'
                          : '#292524'
                        : isDark
                        ? '#34d399'
                        : '#065f46'
                    }
                    strokeWidth={1}
                  />
                  <text
                    x={0}
                    y={3.5}
                    textAnchor="middle"
                    fontSize={9.5}
                    fontWeight={600}
                    fill="#ffffff"
                    className="font-sans"
                  >
                    {label}
                  </text>
                </>
              );
            })()}
          </g>
        </g>
      )}
    </svg>
  );
};
