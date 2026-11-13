import React, { useRef, useMemo, useState } from 'react';
import { Person, TreeViewport } from '../types/tree';
import { CARD_WIDTH, CARD_HEIGHT } from '../utils/treeLayout';
import { Map, ChevronDown, ChevronUp, X } from 'lucide-react';

interface MiniMapProps {
  persons: Record<string, Person>;
  viewport: TreeViewport;
  containerSize: { width: number; height: number };
  onNavigate: (newX: number, newY: number) => void;
  onClose?: () => void;
}

const MiniMapComponent: React.FC<MiniMapProps> = ({
  persons,
  viewport,
  containerSize,
  onNavigate,
  onClose,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const isDraggingRef = useRef(false);
  const mapSvgRef = useRef<SVGSVGElement>(null);

  const personList = useMemo(() => Object.values(persons), [persons]);

  // Compute world bounding box with margin
  const bounds = useMemo(() => {
    if (personList.length === 0) {
      return { minX: 0, minY: 0, maxX: 1000, maxY: 800, width: 1000, height: 800 };
    }
    const pad = 200;
    const minX = Math.min(...personList.map((p) => p.x)) - pad;
    const minY = Math.min(...personList.map((p) => p.y)) - pad;
    const maxX = Math.max(...personList.map((p) => p.x + CARD_WIDTH)) + pad;
    const maxY = Math.max(...personList.map((p) => p.y + CARD_HEIGHT)) + pad;
    const width = Math.max(800, maxX - minX);
    const height = Math.max(600, maxY - minY);
    return { minX, minY, maxX, maxY, width, height };
  }, [personList]);

  // MiniMap Dimensions
  const MAP_WIDTH = 190;
  const MAP_HEIGHT = 130;

  // Transform world coordinates to minimap coordinates
  const scale = Math.min(MAP_WIDTH / bounds.width, MAP_HEIGHT / bounds.height);
  const offsetX = (MAP_WIDTH - bounds.width * scale) / 2;
  const offsetY = (MAP_HEIGHT - bounds.height * scale) / 2;

  const toMapX = (worldX: number) => offsetX + (worldX - bounds.minX) * scale;
  const toMapY = (worldY: number) => offsetY + (worldY - bounds.minY) * scale;

  const nodeRects = useMemo(() => {
    const mw = Math.max(3, CARD_WIDTH * scale);
    const mh = Math.max(3, CARD_HEIGHT * scale);
    return personList.map((p) => {
      const mx = offsetX + (p.x - bounds.minX) * scale;
      const my = offsetY + (p.y - bounds.minY) * scale;
      const color =
        p.isBlankScreenshot
          ? p.screenshotUrl
            ? '#fcd34d'
            : '#f5f5f4'
          : p.cardBgColor ||
            (p.isProposal ? '#bae6fd' : p.gender === 'female' ? '#fed7aa' : '#bae6fd');

      return (
        <rect
          key={p.id}
          x={mx}
          y={my}
          width={mw}
          height={mh}
          rx={1}
          fill={color}
          stroke={p.isBlankScreenshot ? '#d97706' : p.isGhost ? '#475569' : p.isProposal ? '#0284c7' : '#78716c'}
          strokeWidth={p.isGhost || p.isProposal || p.isBlankScreenshot ? 0.9 : 0.5}
          strokeDasharray={p.isGhost || (p.isBlankScreenshot && !p.screenshotUrl) ? '2 1.5' : undefined}
          opacity={p.isGhost ? 0.6 : 0.88}
        />
      );
    });
  }, [personList, bounds.minX, bounds.minY, offsetX, offsetY, scale]);

  // Viewport rectangle in world coordinates
  const vpWorldX = -viewport.x / viewport.zoom;
  const vpWorldY = -viewport.y / viewport.zoom;
  const vpWorldW = containerSize.width / viewport.zoom;
  const vpWorldH = containerSize.height / viewport.zoom;

  // Viewport rectangle in minimap coordinates
  const vpMapX = toMapX(vpWorldX);
  const vpMapY = toMapY(vpWorldY);
  const vpMapW = vpWorldW * scale;
  const vpMapH = vpWorldH * scale;

  const handleInteractAtClientXY = (clientX: number, clientY: number) => {
    if (!mapSvgRef.current) return;
    const rect = mapSvgRef.current.getBoundingClientRect();
    const clickMapX = clientX - rect.left;
    const clickMapY = clientY - rect.top;

    // Convert click on map back to world coordinate (center viewport on this point)
    const targetWorldX = bounds.minX + (clickMapX - offsetX) / scale;
    const targetWorldY = bounds.minY + (clickMapY - offsetY) / scale;

    const newViewportX = containerSize.width / 2 - targetWorldX * viewport.zoom;
    const newViewportY = containerSize.height / 2 - targetWorldY * viewport.zoom;

    onNavigate(newViewportX, newViewportY);
  };

  const handleInteract = (e: React.MouseEvent) => {
    handleInteractAtClientXY(e.clientX, e.clientY);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    isDraggingRef.current = true;
    handleInteract(e);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    e.stopPropagation();
    handleInteract(e);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (e.touches.length > 0) {
      isDraggingRef.current = true;
      handleInteractAtClientXY(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDraggingRef.current) return;
    e.stopPropagation();
    if (e.touches.length > 0) {
      handleInteractAtClientXY(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  const handleDragEnd = () => {
    isDraggingRef.current = false;
  };

  if (personList.length === 0) return null;

  return (
    <div
      className="fixed bottom-[calc(max(0.875rem,env(safe-area-inset-bottom))+4.5rem)] sm:bottom-22 left-3 sm:left-4 z-40 select-none transition-all duration-150 max-w-[210px] animate-in fade-in zoom-in-95"
      onMouseUp={handleDragEnd}
      onMouseLeave={handleDragEnd}
      onTouchEnd={handleDragEnd}
    >
      <div className="bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md rounded-2xl border border-stone-200/90 dark:border-zinc-800 shadow-2xl overflow-hidden flex flex-col">
        {/* Toggle & Close Bar */}
        <div className="px-2.5 py-1.5 flex items-center justify-between gap-1.5 border-b border-stone-100 dark:border-zinc-800 bg-stone-50/80 dark:bg-zinc-800/80">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1.5 text-[11px] font-bold text-stone-800 dark:text-zinc-200 hover:text-stone-950 dark:hover:text-white cursor-pointer truncate"
            title="Міні-карта дерева для швидкої навігації"
          >
            <Map size={13} className="text-emerald-700 dark:text-emerald-400 shrink-0" />
            <span className="truncate">Огляд ({personList.length})</span>
          </button>
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1 rounded text-stone-400 hover:text-stone-700 dark:hover:text-zinc-200 hover:bg-stone-200/60 dark:hover:bg-zinc-700/60 cursor-pointer"
              title={isExpanded ? 'Згорнути' : 'Розгорнути'}
              aria-label={isExpanded ? 'Згорнути' : 'Розгорнути'}
            >
              {isExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="p-1 rounded text-stone-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 cursor-pointer"
                title="Закрити міні-карту"
                aria-label="Закрити"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {isExpanded && (
          <div className="relative p-1.5 bg-[#f8faf8] dark:bg-zinc-950 cursor-crosshair">
            <svg
              ref={mapSvgRef}
              width={MAP_WIDTH}
              height={MAP_HEIGHT}
              className="rounded-lg bg-stone-100/80 dark:bg-zinc-900 border border-stone-200/60 dark:border-zinc-800 overflow-hidden touch-none"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
            >
              {/* Nodes preview (memoized independently from viewport camera rect) */}
              {nodeRects}

              {/* Viewport Camera Rectangle */}
              <rect
                x={Math.max(0, vpMapX)}
                y={Math.max(0, vpMapY)}
                width={Math.min(MAP_WIDTH, Math.max(8, vpMapW))}
                height={Math.min(MAP_HEIGHT, Math.max(6, vpMapH))}
                fill="rgba(5, 150, 105, 0.15)"
                stroke="#059669"
                strokeWidth={1.8}
                rx={2}
                className="pointer-events-none"
              />
            </svg>
            <div className="text-[9.5px] text-stone-500 font-medium text-center pt-1 leading-none">
              Клацніть або торкніться для переходу
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const MiniMap = React.memo(MiniMapComponent);
