import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  RotateCw,
  Maximize2,
  Download,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  RefreshCw,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import {
  getResolvedMediaSrc,
  handleUploadImageError,
  resolveMediaFallbackFromFirestore,
  uploadUrlToMediaId,
} from '../utils/mediaSync';

export interface LightboxDocumentItem {
  id?: string;
  url: string;
  title?: string;
  date?: string;
  typeLabel?: string;
}

interface DocumentLightboxModalProps {
  isOpen: boolean;
  items: LightboxDocumentItem[];
  initialIndex?: number;
  onClose: () => void;
}

type ArchivalFilterMode = 'original' | 'sharp' | 'bw-contrast' | 'invert';

const FILTER_OPTIONS: Array<{ id: ArchivalFilterMode; label: string; css: string }> = [
  { id: 'original', label: 'Оригінал', css: 'none' },
  { id: 'sharp', label: 'Чіткіше', css: 'contrast(1.38) brightness(1.04)' },
  { id: 'bw-contrast', label: 'Ч/Б контраст', css: 'grayscale(1) contrast(1.85) brightness(1.06)' },
  { id: 'invert', label: 'Негатив', css: 'invert(1) contrast(1.2)' },
];

export const DocumentLightboxModal: React.FC<DocumentLightboxModalProps> = ({
  isOpen,
  items,
  initialIndex = 0,
  onClose,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [filterMode, setFilterMode] = useState<ArchivalFilterMode>('original');
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
  const fallbackAttemptedRef = useRef<string>('');

  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const movedDuringDragRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;
    const bounded = Math.max(0, Math.min(initialIndex, Math.max(0, items.length - 1)));
    setCurrentIndex(bounded);
  }, [isOpen, initialIndex, items.length]);

  const resetView = useCallback(() => {
    setZoom(1);
    setRotation(0);
    setPan({ x: 0, y: 0 });
  }, []);

  const currentItem = items[currentIndex];
  const currentUrl = currentItem?.url || '';

  useEffect(() => {
    if (!isOpen || !currentUrl) return;
    resetView();
    setIsLoading(true);
    setHasLoadError(false);
    setFallbackUrl(null);
    fallbackAttemptedRef.current = '';
  }, [isOpen, currentUrl, currentIndex, resetView]);

  const handlePrev = useCallback(() => {
    if (items.length <= 1) return;
    setCurrentIndex((prev) => (prev - 1 + items.length) % items.length);
  }, [items.length]);

  const handleNext = useCallback(() => {
    if (items.length <= 1) return;
    setCurrentIndex((prev) => (prev + 1) % items.length);
  }, [items.length]);

  const clampZoom = (val: number) => Math.min(5, Math.max(0.5, Math.round(val * 100) / 100));

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        setZoom((z) => clampZoom(z + 0.35));
      } else if (e.key === '-') {
        e.preventDefault();
        setZoom((z) => {
          const next = clampZoom(z - 0.35);
          if (next <= 1) setPan({ x: 0, y: 0 });
          return next;
        });
      } else if (e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К') {
        e.preventDefault();
        setRotation((r) => (r + 90) % 360);
      } else if (e.key === '0') {
        e.preventDefault();
        resetView();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, handlePrev, handleNext, resetView]);

  if (!isOpen || !currentItem) return null;

  const resolvedDirect = getResolvedMediaSrc(currentUrl) || currentUrl;
  const isInlineUrl = resolvedDirect.startsWith('data:') || resolvedDirect.startsWith('blob:');
  const isDataUrl = currentUrl.startsWith('data:');
  const effectiveBaseUrl = fallbackUrl || resolvedDirect;
  const displaySrc =
    fallbackUrl
      ? fallbackUrl
      : reloadNonce > 0 && !isInlineUrl
      ? `${resolvedDirect}${resolvedDirect.includes('?') ? '&' : '?'}v=${reloadNonce}`
      : resolvedDirect;

  const activeFilterCss = FILTER_OPTIONS.find((f) => f.id === filterMode)?.css || 'none';
  const isHeicOrTiff = /\.(heic|heif|tiff?)(\?.*)?$/i.test(currentUrl);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.25 : -0.25;
    setZoom((z) => {
      const next = clampZoom(z + delta);
      if (next <= 1) setPan({ x: 0, y: 0 });
      return next;
    });
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    movedDuringDragRef.current = false;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      movedDuringDragRef.current = true;
    }
    setPan({
      x: dragStartRef.current.panX + dx,
      y: dragStartRef.current.panY + dy,
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      setIsDragging(false);
      dragStartRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
  };

  const handleDownloadName = () => {
    const cleanTitle = (currentItem.title || 'metrika')
      .toLowerCase()
      .replace(/[^a-zа-яіїєґ0-9]+/gi, '_')
      .replace(/^_+|_+$/g, '');
    const extMatch = !isDataUrl ? currentUrl.match(/\.([a-z0-9]{2,5})(\?|$)/i) : null;
    const ext = extMatch ? extMatch[1] : 'jpg';
    return `${cleanTitle || 'metrika'}.${ext}`;
  };

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/92 backdrop-blur-sm flex flex-col select-none animate-in fade-in duration-150"
      onClick={onClose}
    >
      {/* Top Toolbar */}
      <div
        className="px-3 sm:px-5 py-2.5 bg-zinc-950/90 border-b border-white/10 flex flex-wrap items-center justify-between gap-2 text-white shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0 flex items-center gap-2.5">
          {currentItem.typeLabel && (
            <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-400/30 text-[10px] font-bold uppercase tracking-wider shrink-0">
              {currentItem.typeLabel}
            </span>
          )}
          <div className="min-w-0">
            <h4 className="text-xs sm:text-sm font-semibold truncate text-zinc-100">
              {currentItem.title || 'Архівний документ'}
            </h4>
            {currentItem.date && (
              <p className="text-[11px] font-mono text-zinc-400 truncate">{currentItem.date}</p>
            )}
          </div>
          {items.length > 1 && (
            <span className="text-[11px] font-mono text-zinc-400 bg-white/10 px-2 py-0.5 rounded-full shrink-0">
              {currentIndex + 1} / {items.length}
            </span>
          )}
        </div>

        {/* Zoom / Rotate / Filter Controls */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Zoom controls */}
          <div className="flex items-center bg-white/10 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => {
                setZoom((z) => {
                  const next = clampZoom(z - 0.35);
                  if (next <= 1) setPan({ x: 0, y: 0 });
                  return next;
                });
              }}
              className="p-1.5 rounded-md hover:bg-white/15 text-zinc-200 cursor-pointer"
              title="Зменшити (-)"
            >
              <ZoomOut size={15} />
            </button>
            <span className="px-2 text-[11px] font-mono tabular-nums min-w-[46px] text-center text-zinc-100">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoom((z) => clampZoom(z + 0.35))}
              className="p-1.5 rounded-md hover:bg-white/15 text-zinc-200 cursor-pointer"
              title="Збільшити (+)"
            >
              <ZoomIn size={15} />
            </button>
            <button
              type="button"
              onClick={() => setZoom(2)}
              className="px-2 py-1 text-[10px] font-semibold rounded-md hover:bg-white/15 text-zinc-200 cursor-pointer hidden sm:inline-block"
              title="Збільшити 200%"
            >
              200%
            </button>
            <button
              type="button"
              onClick={resetView}
              className="p-1.5 rounded-md hover:bg-white/15 text-zinc-200 cursor-pointer"
              title="Вмістити на екран (0)"
            >
              <Maximize2 size={14} />
            </button>
          </div>

          {/* Rotate controls */}
          <div className="flex items-center bg-white/10 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setRotation((r) => (r - 90 + 360) % 360)}
              className="p-1.5 rounded-md hover:bg-white/15 text-zinc-200 cursor-pointer"
              title="Повернути ліворуч на 90°"
            >
              <RotateCcw size={15} />
            </button>
            <button
              type="button"
              onClick={() => setRotation((r) => (r + 90) % 360)}
              className="p-1.5 rounded-md hover:bg-white/15 text-zinc-200 cursor-pointer"
              title="Повернути праворуч на 90° (R)"
            >
              <RotateCw size={15} />
            </button>
          </div>

          {/* Archival Contrast Filters */}
          <div className="flex items-center gap-1 bg-white/10 rounded-lg p-0.5">
            <span className="pl-1.5 pr-0.5 text-zinc-400 hidden md:inline-flex" title="Фільтри читабельності тексту">
              <SlidersHorizontal size={13} />
            </span>
            {FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setFilterMode(opt.id)}
                className={`px-2 py-1 rounded-md text-[10.5px] font-semibold transition-colors cursor-pointer ${
                  filterMode === opt.id
                    ? 'bg-amber-500 text-zinc-950'
                    : 'text-zinc-300 hover:bg-white/15'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Download original */}
          <a
            href={effectiveBaseUrl}
            download={handleDownloadName()}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors cursor-pointer"
            title="Завантажити оригінал файлу"
          >
            <Download size={14} />
            <span className="hidden sm:inline">Завантажити</span>
          </a>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-rose-600 text-white transition-colors cursor-pointer"
            title="Закрити (Esc)"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Main Image Viewport */}
      <div
        className="relative flex-1 overflow-hidden flex items-center justify-center touch-none"
        style={{ cursor: isDragging ? 'grabbing' : zoom > 1 || pan.x !== 0 || pan.y !== 0 ? 'grab' : 'zoom-in' }}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClick={(e) => {
          e.stopPropagation();
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (zoom > 1.1) {
            resetView();
          } else {
            setZoom(2.25);
          }
        }}
      >
        {isLoading && !hasLoadError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-zinc-300 pointer-events-none z-10">
            <Loader2 size={28} className="animate-spin text-amber-400" />
            <span className="text-xs font-medium">Завантаження зображення...</span>
          </div>
        )}

        {hasLoadError ? (
          <div className="max-w-md mx-auto p-6 rounded-2xl bg-zinc-900 border border-white/15 text-center space-y-3 text-zinc-200 z-20">
            <AlertTriangle size={32} className="mx-auto text-amber-400" />
            <h5 className="text-sm font-bold">Не вдалося відобразити зображення у переглядачі</h5>
            <p className="text-xs text-zinc-400 leading-relaxed">
              {isHeicOrTiff
                ? 'Формати HEIC або TIFF можуть не підтримуватися браузером напряму. Ви можете завантажити файл у повній якості на пристрій.'
                : 'Перевірте з’єднання з сервером або спробуйте повторно завантажити фото.'}
            </p>
            <div className="flex items-center justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setHasLoadError(false);
                  setIsLoading(true);
                  setReloadNonce((n) => n + 1);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold cursor-pointer"
              >
                <RefreshCw size={14} />
                <span>Повторити</span>
              </button>
              <a
                href={effectiveBaseUrl}
                download={handleDownloadName()}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
              >
                <Download size={14} />
                <span>Завантажити файл</span>
              </a>
            </div>
          </div>
        ) : (
          <img
            key={`${currentIndex}-${reloadNonce}-${fallbackUrl ? 'fb' : 'orig'}`}
            src={displaySrc}
            alt={currentItem.title || 'Фото метрики'}
            draggable={false}
            onLoad={() => {
              setIsLoading(false);
              setHasLoadError(false);
            }}
            onError={() => {
              if (!fallbackUrl && uploadUrlToMediaId(currentUrl) && fallbackAttemptedRef.current !== currentUrl) {
                fallbackAttemptedRef.current = currentUrl;
                void resolveMediaFallbackFromFirestore(currentUrl).then((resolved) => {
                  if (resolved) {
                    setFallbackUrl(resolved);
                    return;
                  }
                  setIsLoading(false);
                  setHasLoadError(true);
                });
                return;
              }
              setIsLoading(false);
              setHasLoadError(true);
            }}
            className="max-h-[82vh] max-w-[92vw] object-contain shadow-2xl transition-opacity duration-150 select-none"
            style={{
              opacity: isLoading ? 0 : 1,
              filter: activeFilterCss,
              transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom}) rotate(${rotation}deg)`,
              transition: isDragging ? 'none' : 'transform 120ms ease-out, opacity 150ms ease',
            }}
          />
        )}

        {/* Prev / Next Overlay Arrows */}
        {items.length > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handlePrev();
              }}
              className="absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-black/60 hover:bg-black/85 text-white border border-white/15 shadow-xl cursor-pointer z-20 transition-transform hover:scale-105"
              title="Попереднє фото (←)"
            >
              <ChevronLeft size={22} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleNext();
              }}
              className="absolute right-3 sm:right-5 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-black/60 hover:bg-black/85 text-white border border-white/15 shadow-xl cursor-pointer z-20 transition-transform hover:scale-105"
              title="Наступне фото (→)"
            >
              <ChevronRight size={22} />
            </button>
          </>
        )}
      </div>

      {/* Bottom Thumbnail Strip + Shortcut Hint */}
      <div
        className="px-4 py-2 bg-zinc-950/90 border-t border-white/10 flex items-center justify-between gap-3 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[11px] text-zinc-400 hidden sm:block">
          Колесо миші — масштаб · Подвійний клік — збільшення · Перетягування — панорама · R — поворот
        </p>
        {items.length > 1 && (
          <div className="flex items-center gap-1.5 overflow-x-auto mx-auto sm:mx-0">
            {items.map((item, idx) => (
              <button
                key={item.id || `${item.url}-${idx}`}
                type="button"
                onClick={() => setCurrentIndex(idx)}
                className={`relative w-11 h-11 rounded-lg overflow-hidden border-2 shrink-0 cursor-pointer transition-all ${
                  idx === currentIndex
                    ? 'border-amber-400 scale-105 shadow-md'
                    : 'border-white/15 opacity-60 hover:opacity-100'
                }`}
                title={item.title || `Фото ${idx + 1}`}
              >
                <img
                  src={getResolvedMediaSrc(item.url)}
                  alt=""
                  onError={(e) => handleUploadImageError(e, item.url)}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
