import React, { useMemo, useState, useRef, useEffect } from 'react';
import { ConnectionLine, CoupleBridgeInfo } from '../types/tree';

interface TreeConnectionsProps {
  connections: ConnectionLine[];
  onLineClick?: (connectionId: string, clickCoords: { x: number; y: number }) => void;
  activeLineageIds?: Set<string>;
  hoveredPersonId?: string | null;
  selectedPersonId?: string | null;
  visibleBounds?: { minX: number; maxX: number; minY: number; maxY: number };
  isDark?: boolean;
}

interface UniqueCoupleBridge {
  bridge: CoupleBridgeInfo;
  childConns: ConnectionLine[];
}

const TreeConnectionsComponent: React.FC<TreeConnectionsProps> = ({
  connections,
  onLineClick,
  activeLineageIds,
  hoveredPersonId,
  selectedPersonId,
  visibleBounds,
  isDark = false,
}) => {
  const [hoveredConnId, setHoveredConnId] = useState<string | null>(null);
  const [hoveredBridgeKey, setHoveredBridgeKey] = useState<string | null>(null);
  const [hoverMousePos, setHoverMousePos] = useState<{ x: number; y: number } | null>(null);
  const hoverRafRef = useRef<number | null>(null);
  const pendingHoverPosRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    return () => {
      if (hoverRafRef.current !== null) {
        cancelAnimationFrame(hoverRafRef.current);
      }
    };
  }, []);

  const scheduleHoverMousePos = (coords: { x: number; y: number } | null) => {
    if (!coords) {
      if (hoverRafRef.current !== null) {
        cancelAnimationFrame(hoverRafRef.current);
        hoverRafRef.current = null;
      }
      pendingHoverPosRef.current = null;
      setHoverMousePos(null);
      return;
    }
    pendingHoverPosRef.current = coords;
    if (hoverRafRef.current === null) {
      hoverRafRef.current = requestAnimationFrame(() => {
        hoverRafRef.current = null;
        if (pendingHoverPosRef.current) {
          setHoverMousePos(pendingHoverPosRef.current);
        }
      });
    }
  };

  // Filter connections using exact geometric bounds (with safe margin for long curved paths)
  const visibleConnections = useMemo(() => {
    if (!visibleBounds) return connections;
    const MARGIN = 450;
    return connections.filter((conn) => {
      if (conn.bounds) {
        if (
          conn.bounds.maxX < visibleBounds.minX - MARGIN ||
          conn.bounds.minX > visibleBounds.maxX + MARGIN ||
          conn.bounds.maxY < visibleBounds.minY - MARGIN ||
          conn.bounds.minY > visibleBounds.maxY + MARGIN
        ) {
          return false;
        }
        return true;
      }
      if (typeof conn.midX === 'number' && typeof conn.midY === 'number') {
        const FALLBACK_MARGIN = 1200;
        if (
          conn.midX < visibleBounds.minX - FALLBACK_MARGIN ||
          conn.midX > visibleBounds.maxX + FALLBACK_MARGIN ||
          conn.midY < visibleBounds.minY - FALLBACK_MARGIN ||
          conn.midY > visibleBounds.maxY + FALLBACK_MARGIN
        ) {
          return false;
        }
      }
      return true;
    });
  }, [connections, visibleBounds]);

  // Deduplicate couple bridges so each couple fork renders cleanly once instead of N stacked paths
  const uniqueBridges = useMemo<UniqueCoupleBridge[]>(() => {
    const map = new Map<string, UniqueCoupleBridge>();
    visibleConnections.forEach((conn) => {
      if (!conn.coupleBridge) return;
      const existing = map.get(conn.coupleBridge.key);
      if (existing) {
        existing.childConns.push(conn);
      } else {
        map.set(conn.coupleBridge.key, {
          bridge: conn.coupleBridge,
          childConns: [conn],
        });
      }
    });
    return Array.from(map.values());
  }, [visibleConnections]);

  const hoveredConn = useMemo(() => {
    if (!hoveredConnId) return null;
    return visibleConnections.find((c) => c.id === hoveredConnId) || null;
  }, [hoveredConnId, visibleConnections]);

  const hoveredBridgeItem = useMemo(() => {
    if (!hoveredBridgeKey) return null;
    return uniqueBridges.find((b) => b.bridge.key === hoveredBridgeKey) || null;
  }, [hoveredBridgeKey, uniqueBridges]);

  const hasDirectLineHover = hoveredConnId !== null || hoveredBridgeKey !== null;
  const hasLineageFocus = Boolean(activeLineageIds && activeLineageIds.size > 0);

  const getSvgCoords = (e: React.MouseEvent<SVGElement>) => {
    const svgElement = e.currentTarget.ownerSVGElement;
    if (svgElement) {
      const ctm = svgElement.getScreenCTM();
      if (ctm) {
        const pt = svgElement.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const svgP = pt.matrixTransform(ctm.inverse());
        return { x: svgP.x, y: svgP.y };
      }
    }
    return null;
  };

  // Precompute visual state for every visible connection so we can layer active lines cleanly on top
  const preparedConnections = useMemo(() => {
    return visibleConnections.map((conn) => {
      const idsInConn = conn.personIds || ([conn.fromId, conn.toId].filter(Boolean) as string[]);
      const isDirectlyHovered = hoveredConnId === conn.id;
      const isBridgeSiblingActive = Boolean(
        hoveredBridgeKey && conn.coupleBridge?.key === hoveredBridgeKey
      );
      const isHovered = isDirectlyHovered || isBridgeSiblingActive;

      let isLineageLine = false;
      let isLineageDimmed = false;
      if (hasLineageFocus && activeLineageIds) {
        const matchesCount = idsInConn.filter((id) => activeLineageIds.has(id)).length;
        if (matchesCount > 0) {
          isLineageLine = true;
        } else {
          isLineageDimmed = true;
        }
      }

      const isConnectedToHoveredPerson = Boolean(
        hoveredPersonId && idsInConn.includes(hoveredPersonId)
      );
      const isConnectedToSelectedPerson = Boolean(
        selectedPersonId && !hoveredPersonId && idsInConn.includes(selectedPersonId)
      );

      const isDimmedByLineHover =
        hasDirectLineHover &&
        !isHovered &&
        !(hoveredConn?.coupleBridge && conn.coupleBridge?.key === hoveredConn.coupleBridge.key);

      const isHighlightActive =
        isHovered || isLineageLine || isConnectedToHoveredPerson || isConnectedToSelectedPerson;

      const isUnverifiedLine =
        !conn.isVerified || conn.isDashed || conn.confidenceLevel === 'hypothetical';

      const baseColor = isUnverifiedLine
        ? isDark
          ? '#64748b'
          : '#94a3b8'
        : conn.isMainBranch
        ? isDark
          ? '#f59e0b'
          : '#b45309'
        : conn.color || (isDark ? '#94a3b8' : '#475569');

      const strokeColor = isLineageLine
        ? isDark
          ? '#34d399'
          : '#0f172a'
        : isHovered || isConnectedToHoveredPerson
        ? isUnverifiedLine
          ? isDark
            ? '#e2e8f0'
            : '#1e293b'
          : conn.type === 'marriage' && conn.eventType === 'divorce'
          ? '#f43f5e'
          : conn.color && conn.color !== '#475569' && conn.color !== '#64748b'
          ? conn.color
          : isDark
          ? '#f8fafc'
          : '#0f172a'
        : isConnectedToSelectedPerson
        ? isUnverifiedLine
          ? isDark
            ? '#cbd5e1'
            : '#334155'
          : baseColor
        : baseColor;

      const customWidth =
        typeof conn.strokeWidth === 'number' && conn.strokeWidth >= 1 && conn.strokeWidth <= 12
          ? conn.strokeWidth
          : undefined;
      const baseStrokeWidth =
        customWidth !== undefined
          ? customWidth
          : conn.isMainBranch
          ? 3.2
          : conn.isVerified
          ? 2.0
          : 1.75;
      const activeStrokeWidth =
        customWidth !== undefined
          ? Math.min(16, customWidth + 1.4)
          : conn.isMainBranch
          ? 4.0
          : isConnectedToSelectedPerson && !isHovered && !isConnectedToHoveredPerson
          ? 2.6
          : 3.0;
      const currentStrokeWidth = isHighlightActive ? activeStrokeWidth : baseStrokeWidth;

      const opacityClass = isLineageDimmed
        ? 'opacity-20'
        : isDimmedByLineHover
        ? 'opacity-30'
        : 'opacity-100';

      return {
        conn,
        isHovered,
        isLineageLine,
        isConnectedToHoveredPerson,
        isConnectedToSelectedPerson,
        isHighlightActive,
        isUnverifiedLine,
        strokeColor,
        currentStrokeWidth,
        opacityClass,
      };
    });
  }, [
    visibleConnections,
    hoveredConnId,
    hoveredBridgeKey,
    hoveredConn,
    hasDirectLineHover,
    hasLineageFocus,
    activeLineageIds,
    hoveredPersonId,
    selectedPersonId,
    isDark,
  ]);

  // Precompute visual state for deduplicated couple bridges
  const preparedBridges = useMemo(() => {
    return uniqueBridges.map(({ bridge, childConns }) => {
      const isDirectlyHovered = hoveredBridgeKey === bridge.key;
      const isChildHovered = Boolean(
        hoveredConnId && childConns.some((c) => c.id === hoveredConnId)
      );
      const isHovered = isDirectlyHovered || isChildHovered;

      const allPersonIds = new Set<string>(bridge.parentIds);
      childConns.forEach((c) => {
        c.personIds?.forEach((id) => allPersonIds.add(id));
      });

      const isLineageBridge = Boolean(
        hasLineageFocus &&
          activeLineageIds &&
          childConns.some((c) => c.personIds?.some((id) => activeLineageIds.has(id)))
      );
      const isLineageDimmed = hasLineageFocus && !isLineageBridge;

      const isConnectedToHoveredPerson = Boolean(
        hoveredPersonId && allPersonIds.has(hoveredPersonId)
      );
      const isConnectedToSelectedPerson = Boolean(
        selectedPersonId && !hoveredPersonId && allPersonIds.has(selectedPersonId)
      );

      const isDimmedByLineHover = hasDirectLineHover && !isHovered;
      const isHighlightActive =
        isHovered || isLineageBridge || isConnectedToHoveredPerson || isConnectedToSelectedPerson;

      const leftStroke = isLineageBridge
        ? isDark
          ? '#34d399'
          : '#0f172a'
        : (isHovered || isConnectedToHoveredPerson) && bridge.leftDashed
        ? isDark
          ? '#e2e8f0'
          : '#1e293b'
        : bridge.leftColor;

      const rightStroke = isLineageBridge
        ? isDark
          ? '#34d399'
          : '#0f172a'
        : (isHovered || isConnectedToHoveredPerson) && bridge.rightDashed
        ? isDark
          ? '#e2e8f0'
          : '#1e293b'
        : bridge.rightColor;

      const hubStroke = isLineageBridge
        ? isDark
          ? '#34d399'
          : '#059669'
        : bridge.isVerified
        ? bridge.leftColor === bridge.rightColor
          ? bridge.leftColor
          : isDark
          ? '#e2e8f0'
          : '#334155'
        : isDark
        ? '#94a3b8'
        : '#64748b';

      const strokeWidth = isHighlightActive
        ? isConnectedToSelectedPerson && !isHovered && !isConnectedToHoveredPerson
          ? 2.5
          : 2.9
        : 2.0;

      const opacityClass = isLineageDimmed
        ? 'opacity-20'
        : isDimmedByLineHover
        ? 'opacity-30'
        : 'opacity-100';

      const marriageConnId = `marriage:${[...bridge.parentIds].sort().join('::')}`;

      return {
        bridge,
        isHovered,
        marriageConnId,
        isHighlightActive,
        isLineageBridge,
        isConnectedToHoveredPerson,
        leftStroke,
        rightStroke,
        hubStroke,
        strokeWidth,
        opacityClass,
      };
    });
  }, [
    uniqueBridges,
    hoveredBridgeKey,
    hoveredConnId,
    hasLineageFocus,
    activeLineageIds,
    hoveredPersonId,
    selectedPersonId,
    hasDirectLineHover,
    isDark,
  ]);

  const baseConnections = preparedConnections.filter((item) => !item.isHighlightActive);
  const activeConnections = preparedConnections.filter((item) => item.isHighlightActive);

  const baseBridges = preparedBridges.filter((item) => !item.isHighlightActive);
  const activeBridges = preparedBridges.filter((item) => item.isHighlightActive);

  const renderBridgeItem = (item: (typeof preparedBridges)[number]) => {
    const {
      bridge,
      isHovered,
      marriageConnId,
      isHighlightActive,
      isLineageBridge,
      isConnectedToHoveredPerson,
      leftStroke,
      rightStroke,
      hubStroke,
      strokeWidth,
      opacityClass,
    } = item;

    const handleBridgeMove = (e: React.MouseEvent<SVGPathElement>) => {
      const coords = getSvgCoords(e);
      if (coords) scheduleHoverMousePos(coords);
    };

    const handleBridgeClick = (e: React.MouseEvent<SVGElement>) => {
      if (!onLineClick) return;
      e.stopPropagation();
      const coords = getSvgCoords(e) || { x: bridge.junctionX, y: bridge.junctionY };
      onLineClick(marriageConnId, coords);
    };

    return (
      <g
        key={`bridge-${bridge.key}`}
        className={`pointer-events-auto transition-opacity duration-150 ${opacityClass}`}
      >
        {/* Wide transparent hit area for both spouse bridge arms */}
        <path
          d={`${bridge.leftArmPath} ${bridge.rightArmPath}`}
          fill="none"
          stroke="transparent"
          strokeWidth="20"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={onLineClick ? 'cursor-pointer pointer-events-stroke' : 'pointer-events-stroke'}
          onMouseEnter={() => setHoveredBridgeKey(bridge.key)}
          onMouseMove={handleBridgeMove}
          onMouseLeave={() => {
            setHoveredBridgeKey(null);
            scheduleHoverMousePos(null);
          }}
          onClick={handleBridgeClick}
        />

        {/* Soft ambient halo when highlighted */}
        {isHighlightActive && (
          <>
            <path
              d={bridge.leftArmPath}
              fill="none"
              stroke={isLineageBridge || isConnectedToHoveredPerson ? (isDark ? '#34d399' : '#cbd5e1') : leftStroke}
              strokeWidth={strokeWidth + 4}
              opacity={isDark ? 0.25 : 0.35}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="pointer-events-none"
            />
            <path
              d={bridge.rightArmPath}
              fill="none"
              stroke={isLineageBridge || isConnectedToHoveredPerson ? (isDark ? '#34d399' : '#cbd5e1') : rightStroke}
              strokeWidth={strokeWidth + 4}
              opacity={isDark ? 0.25 : 0.35}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="pointer-events-none"
            />
          </>
        )}

        {/* Left Spouse Arm */}
        <path
          d={bridge.leftArmPath}
          fill="none"
          stroke={leftStroke}
          strokeWidth={strokeWidth}
          strokeDasharray={bridge.leftDashed ? '5,4' : undefined}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="pointer-events-none"
        />

        {/* Highlight overlay when hovered/connected to hovered card (solid for verified, dashed for unverified) */}
        {(isHovered || isConnectedToHoveredPerson) && (
          <path
            d={bridge.leftArmPath}
            fill="none"
            stroke={isDark ? '#34d399' : '#059669'}
            strokeWidth={strokeWidth + 0.6}
            strokeDasharray={bridge.leftDashed ? '6,8' : undefined}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={
              bridge.leftDashed
                ? 'pointer-events-none animate-connection-flow opacity-80'
                : 'pointer-events-none opacity-95'
            }
          />
        )}

        {/* Right Spouse Arm */}
        <path
          d={bridge.rightArmPath}
          fill="none"
          stroke={rightStroke}
          strokeWidth={strokeWidth}
          strokeDasharray={bridge.rightDashed ? '5,4' : undefined}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="pointer-events-none"
        />

        {/* Highlight overlay when hovered/connected to hovered card (solid for verified, dashed for unverified) */}
        {(isHovered || isConnectedToHoveredPerson) && (
          <path
            d={bridge.rightArmPath}
            fill="none"
            stroke={isDark ? '#34d399' : '#059669'}
            strokeWidth={strokeWidth + 0.6}
            strokeDasharray={bridge.rightDashed ? '6,8' : undefined}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={
              bridge.rightDashed
                ? 'pointer-events-none animate-connection-flow opacity-80'
                : 'pointer-events-none opacity-95'
            }
          />
        )}

        {/* Couple Union Junction Node directly beneath marriage rings */}
        <circle
          cx={bridge.junctionX}
          cy={bridge.junctionY}
          r={isHighlightActive ? 4.4 : 3.2}
          fill={isDark ? '#18181b' : '#ffffff'}
          stroke={hubStroke}
          strokeWidth={isHighlightActive ? 2.2 : 1.75}
          className="pointer-events-none"
        />
        {isHighlightActive && (
          <circle
            cx={bridge.junctionX}
            cy={bridge.junctionY}
            r={1.6}
            fill={hubStroke}
            className="pointer-events-none"
          />
        )}
      </g>
    );
  };

  const renderConnectionItem = (item: (typeof preparedConnections)[number]) => {
    const {
      conn,
      isHovered,
      isLineageLine,
      isConnectedToHoveredPerson,
      isHighlightActive,
      isUnverifiedLine,
      strokeColor,
      currentStrokeWidth,
      opacityClass,
    } = item;

    if (!conn.path) return null;

    const handlePathClick = (e: React.MouseEvent<SVGElement>) => {
      if (!onLineClick) return;
      e.stopPropagation();
      const coords = getSvgCoords(e) || { x: conn.midX || 0, y: conn.midY || 0 };
      onLineClick(conn.id, coords);
    };

    const handleMouseMoveOnPath = (e: React.MouseEvent<SVGPathElement>) => {
      const coords = getSvgCoords(e);
      if (coords) scheduleHoverMousePos(coords);
    };

    const isDivorcedMarriage = conn.type === 'marriage' && conn.eventType === 'divorce';

    return (
      <g
        key={conn.id}
        className={`pointer-events-auto transition-opacity duration-150 ${opacityClass}`}
      >
        {/* Wide transparent hit area for effortless clicking and hover */}
        <path
          d={conn.path}
          fill="none"
          stroke="transparent"
          strokeWidth="22"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={onLineClick ? 'cursor-pointer pointer-events-stroke' : 'pointer-events-stroke'}
          onMouseEnter={() => setHoveredConnId(conn.id)}
          onMouseMove={handleMouseMoveOnPath}
          onMouseLeave={() => {
            setHoveredConnId(null);
            scheduleHoverMousePos(null);
          }}
          onClick={handlePathClick}
        />

        {/* Ambient halo underlay when hovered, selected, or focused */}
        {isHighlightActive && (
          <path
            d={conn.path}
            fill="none"
            stroke={
              isLineageLine || isConnectedToHoveredPerson
                ? isDark
                  ? '#34d399'
                  : '#cbd5e1'
                : strokeColor
            }
            strokeWidth={currentStrokeWidth + 4}
            opacity={isDark ? 0.26 : 0.36}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="pointer-events-none"
          />
        )}

        {/* Core Visible Connection Line */}
        <path
          d={conn.path}
          fill="none"
          stroke={strokeColor}
          strokeWidth={currentStrokeWidth}
          strokeDasharray={isUnverifiedLine ? '5,4' : undefined}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="pointer-events-none"
        />

        {/* Highlight overlay when connection is directly hovered or connected to hovered person (solid for verified, dashed for unverified) */}
        {(isHovered || isConnectedToHoveredPerson) && (
          <path
            d={conn.path}
            fill="none"
            stroke={
              isDivorcedMarriage
                ? '#f43f5e'
                : isDark
                ? '#34d399'
                : '#059669'
            }
            strokeWidth={currentStrokeWidth + 0.6}
            strokeDasharray={isUnverifiedLine ? '6,8' : undefined}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={
              isUnverifiedLine
                ? 'pointer-events-none animate-connection-flow opacity-85'
                : 'pointer-events-none opacity-95'
            }
          />
        )}

        {/* T-junction / Distributor Split Node */}
        {conn.type === 'child-branch' && conn.junctionPt && (
          <circle
            cx={conn.junctionPt.x}
            cy={conn.junctionPt.y}
            r={isHighlightActive ? 3.2 : 2.3}
            fill={isDark ? '#18181b' : '#ffffff'}
            stroke={strokeColor}
            strokeWidth={isHighlightActive ? 2.0 : 1.5}
            className="pointer-events-none"
          />
        )}

        {/* Crisp Terminal Docking Dot at Child Card Edge */}
        {conn.type === 'child-branch' && conn.endPt && (
          <circle
            cx={conn.endPt.x}
            cy={conn.endPt.y}
            r={isHighlightActive ? 2.8 : 2.0}
            fill={strokeColor}
            stroke={isDark ? '#18181b' : '#ffffff'}
            strokeWidth={1.2}
            className="pointer-events-none"
          />
        )}

        {/* Divorce Break Marker on Marriage Line */}
        {isDivorcedMarriage && typeof conn.midX === 'number' && typeof conn.midY === 'number' && (
          <g transform={`translate(${conn.midX}, ${conn.midY})`} className="pointer-events-none">
            <circle
              cx="0"
              cy="0"
              r={isHighlightActive ? 10 : 8.5}
              fill={isDark ? '#271219' : '#fff1f2'}
              stroke="#e11d48"
              strokeWidth={isHighlightActive ? 1.8 : 1.4}
            />
            <line x1="-3.5" y1="3.5" x2="0" y2="-3.5" stroke="#e11d48" strokeWidth="1.6" strokeLinecap="round" />
            <line x1="0" y1="3.5" x2="3.5" y2="-3.5" stroke="#e11d48" strokeWidth="1.6" strokeLinecap="round" />
          </g>
        )}
      </g>
    );
  };

  // Compute tooltip display content & width dynamically
  const tooltipInfo = useMemo(() => {
    if (!hoverMousePos) return null;

    let label = '';
    let dotColor = '#10b981';

    if (hoveredConn) {
      if (hoveredConn.type === 'marriage' && hoveredConn.eventType === 'divorce') {
        label = 'Розлучення';
        dotColor = '#e11d48';
      } else if (hoveredConn.label) {
        label = hoveredConn.label;
        dotColor = hoveredConn.isVerified && !hoveredConn.isDashed ? '#10b981' : '#f59e0b';
      } else if (hoveredConn.isVerified && !hoveredConn.isDashed) {
        label = 'Перевірений звʼязок';
        dotColor = '#10b981';
      } else {
        label = 'Гіпотетичний звʼязок';
        dotColor = '#f59e0b';
      }

      if (hoveredConn.eventDate) {
        label = `${label} · ${hoveredConn.eventDate}`;
      }
    } else if (hoveredBridgeItem) {
      label = hoveredBridgeItem.bridge.isVerified
        ? 'Спільне походження (пара)'
        : 'Гіпотетичне походження';
      dotColor = hoveredBridgeItem.bridge.isVerified ? '#10b981' : '#f59e0b';
    } else {
      return null;
    }

    const canClick = Boolean(onLineClick);
    const subText = canClick ? 'клікніть' : '';
    const estimatedWidth = Math.min(
      320,
      Math.max(150, Math.round(label.length * 5.9 + (canClick ? 74 : 34)))
    );

    return {
      label,
      subText,
      dotColor,
      width: estimatedWidth,
    };
  }, [hoveredConn, hoveredBridgeItem, hoverMousePos, onLineClick]);

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none overflow-visible select-none"
      style={{ pointerEvents: 'none' }}
    >
      {/* 1. Base Layer: Non-active connection paths & couple bridges */}
      <g>{baseConnections.map(renderConnectionItem)}</g>
      <g>{baseBridges.map(renderBridgeItem)}</g>

      {/* 2. Top Layer: Active / Hovered / Selected / Lineage paths & couple bridges */}
      <g>{activeConnections.map(renderConnectionItem)}</g>
      <g>{activeBridges.map(renderBridgeItem)}</g>

      {/* 3. Interactive Tooltip Overlay */}
      {tooltipInfo && hoverMousePos && (
        <g
          transform={`translate(${hoverMousePos.x}, ${hoverMousePos.y - 20})`}
          className="pointer-events-none z-50 animate-in fade-in zoom-in-95 duration-100"
        >
          <rect
            x={-tooltipInfo.width / 2}
            y="-15"
            width={tooltipInfo.width}
            height="26"
            rx="8"
            fill={isDark ? '#18181b' : '#0f172a'}
            stroke={isDark ? '#3f3f46' : '#334155'}
            strokeWidth="1"
            opacity="0.96"
          />

          <circle
            cx={-tooltipInfo.width / 2 + 14}
            cy="-2"
            r="3.5"
            fill={tooltipInfo.dotColor}
          />

          <text
            x={-tooltipInfo.width / 2 + 24}
            y="1.5"
            fontSize="10"
            fill="#f8fafc"
            fontWeight="600"
            letterSpacing="0.01em"
            className="font-sans select-none"
          >
            {tooltipInfo.label}
          </text>

          {tooltipInfo.subText && (
            <text
              x={tooltipInfo.width / 2 - 12}
              y="1.5"
              fontSize="9"
              fill="#94a3b8"
              fontWeight="500"
              textAnchor="end"
              className="font-sans select-none"
            >
              {tooltipInfo.subText}
            </text>
          )}
        </g>
      )}
    </svg>
  );
};

export const TreeConnections = React.memo(TreeConnectionsComponent);
