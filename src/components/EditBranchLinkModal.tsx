import React, { useState, useEffect } from 'react';
import {
  BranchLink,
  BranchLinkCurveStyle,
  BRANCH_LINK_COLOR_PRESETS,
  Person,
} from '../types/tree';
import { buildWavyPath, normalizeBranchLineShape } from '../utils/branchLinkGeometry';
import {
  X,
  ArrowUpRight,
  Trash2,
  Check,
  Palette,
  SlidersHorizontal,
} from 'lucide-react';

export interface BranchLinkStyleSavePayload {
  label?: string;
  color: string;
  strokeWidth: number;
  lineShape: BranchLinkCurveStyle;
  updateReciprocal?: boolean;
  applyToAll?: boolean;
}

interface EditBranchLinkModalProps {
  isOpen: boolean;
  mode: 'single' | 'batch';
  sourcePerson?: Person | null;
  targetPerson?: Person | null;
  link?: BranchLink | null;
  hasReciprocal?: boolean;
  totalLinksCount?: number;
  defaultStyle?: {
    color: string;
    strokeWidth: number;
    lineShape: BranchLinkCurveStyle;
  };
  onClose: () => void;
  onSave: (payload: BranchLinkStyleSavePayload) => void;
  onDelete?: () => void;
}

const STROKE_WIDTH_PRESETS = [1, 2, 3, 4, 6, 8, 10] as const;

export const EditBranchLinkModal: React.FC<EditBranchLinkModalProps> = ({
  isOpen,
  mode,
  sourcePerson,
  targetPerson,
  link,
  hasReciprocal = false,
  totalLinksCount = 0,
  defaultStyle,
  onClose,
  onSave,
  onDelete,
}) => {
  const [label, setLabel] = useState('');
  const [color, setColor] = useState<string>(BRANCH_LINK_COLOR_PRESETS[0].hex);
  const [strokeWidth, setStrokeWidth] = useState<number>(2);
  const [lineShape, setLineShape] = useState<BranchLinkCurveStyle>('curved');
  const [updateReciprocal, setUpdateReciprocal] = useState(true);
  const [applyToAll, setApplyToAll] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (mode === 'single' && link) {
      setLabel(link.label || '');
      setColor(link.color || defaultStyle?.color || BRANCH_LINK_COLOR_PRESETS[0].hex);
      setStrokeWidth(
        typeof link.strokeWidth === 'number' && link.strokeWidth >= 1 && link.strokeWidth <= 10
          ? link.strokeWidth
          : defaultStyle?.strokeWidth ?? 2
      );
      setLineShape(normalizeBranchLineShape(link.lineShape ?? defaultStyle?.lineShape));
      setUpdateReciprocal(true);
      setApplyToAll(false);
    } else {
      setLabel('');
      setColor(defaultStyle?.color || BRANCH_LINK_COLOR_PRESETS[0].hex);
      setStrokeWidth(defaultStyle?.strokeWidth ?? 2);
      setLineShape(normalizeBranchLineShape(defaultStyle?.lineShape));
      setUpdateReciprocal(false);
      setApplyToAll(true);
    }
  }, [isOpen, mode, link, defaultStyle]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sourceName = sourcePerson
    ? [sourcePerson.firstName, sourcePerson.lastName].filter(Boolean).join(' ') || 'Картка'
    : '';
  const targetName = targetPerson
    ? [targetPerson.firstName, targetPerson.lastName].filter(Boolean).join(' ') || 'Картка'
    : '';

  const previewLabel =
    mode === 'single'
      ? label.trim() || (targetName ? `→ ${targetName}` : 'Міжгілкове посилання')
      : 'Міжгілкове посилання';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      label: mode === 'single' ? label.trim() || undefined : undefined,
      color: color || '#4f46e5',
      strokeWidth: Math.max(1, Math.min(10, Math.round(strokeWidth))),
      lineShape,
      updateReciprocal: mode === 'single' ? updateReciprocal : false,
      applyToAll: mode === 'batch' ? true : applyToAll,
    });
    onClose();
  };

  const arrowLen = Math.max(11, Math.min(24, 9 + strokeWidth * 1.4));
  const arrowHalfH = Math.max(5.5, Math.min(12, 4.2 + strokeWidth * 0.75));
  const previewRefX = Math.max(2, Number((arrowLen * 0.62).toFixed(1)));
  const previewNotchX = Number((arrowLen * 0.2).toFixed(1));

  return (
    <div
      className="fixed inset-0 bg-black/55 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-stone-200 dark:border-zinc-800 w-full max-w-md overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 bg-indigo-50/70 dark:bg-indigo-950/30 border-b border-indigo-200/80 dark:border-indigo-900/60 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-indigo-100 dark:bg-indigo-900/70 border border-indigo-300 dark:border-indigo-700 flex items-center justify-center text-indigo-700 dark:text-indigo-300 shrink-0">
              <SlidersHorizontal size={16} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-stone-900 dark:text-zinc-100 leading-tight truncate">
                {mode === 'batch'
                  ? 'Стиль міжгілкових стрілок'
                  : link?.linkKind === 'godparent'
                  ? 'Налаштування лінії «Хресний / Хресна»'
                  : 'Налаштування міжгілкового зв’язку'}
              </h3>
              <p className="text-[11px] text-stone-600 dark:text-zinc-400 truncate mt-0.5">
                {mode === 'batch'
                  ? `Загальний стиль для всіх стрілок полотна (${totalLinksCount})`
                  : `${sourceName} → ${targetName}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-zinc-200 hover:bg-stone-200/50 dark:hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
            aria-label="Закрити"
          >
            <X size={17} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
          {/* Label (Single Link Mode) */}
          {mode === 'single' && (
            <div>
              <label className="block text-[11px] font-bold text-stone-700 dark:text-zinc-300 uppercase tracking-wider mb-1.5">
                Підпис на стрілці (необов&apos;язково)
              </label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="напр. Куми, Споріднена гілка, Гілка Івана"
                className="w-full text-xs px-3 py-2 rounded-xl border border-stone-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-stone-900 dark:text-zinc-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/35 focus:border-indigo-500"
              />
            </div>
          )}

          {/* Line Shape Switcher: Curved vs Straight vs Wavy */}
          <div className="space-y-1.5">
            <span className="block text-[11px] font-bold text-stone-700 dark:text-zinc-300 uppercase tracking-wider">
              Форма лінії
            </span>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setLineShape('curved')}
                className={`p-2.5 rounded-xl border text-left flex flex-col gap-1.5 transition-all cursor-pointer ${
                  lineShape === 'curved'
                    ? 'border-indigo-600 bg-indigo-50/90 dark:bg-indigo-950/40 text-indigo-950 dark:text-indigo-200 ring-2 ring-indigo-500/25 font-semibold shadow-2xs'
                    : 'border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-stone-700 dark:text-zinc-300 hover:bg-stone-50 dark:hover:bg-zinc-800/70'
                }`}
              >
                <svg className="w-8 h-5 shrink-0 overflow-visible" viewBox="0 0 32 20">
                  <path
                    d="M 2 15 Q 16 2 29 12"
                    fill="none"
                    stroke={lineShape === 'curved' ? color : '#78716c'}
                    strokeWidth="2.2"
                    strokeDasharray="4 2.5"
                    strokeLinecap="round"
                  />
                  <polygon
                    points="29,12 23,9.5 25,15"
                    fill={lineShape === 'curved' ? color : '#78716c'}
                  />
                </svg>
                <div className="min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[11.5px] font-bold">Вигнута</span>
                    {lineShape === 'curved' && <Check size={12} className="text-indigo-600 dark:text-indigo-400 shrink-0" />}
                  </div>
                  <p className="text-[9.5px] text-stone-500 dark:text-zinc-400 font-normal leading-tight mt-0.5">
                    Плавна дуга
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setLineShape('straight')}
                className={`p-2.5 rounded-xl border text-left flex flex-col gap-1.5 transition-all cursor-pointer ${
                  lineShape === 'straight'
                    ? 'border-indigo-600 bg-indigo-50/90 dark:bg-indigo-950/40 text-indigo-950 dark:text-indigo-200 ring-2 ring-indigo-500/25 font-semibold shadow-2xs'
                    : 'border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-stone-700 dark:text-zinc-300 hover:bg-stone-50 dark:hover:bg-zinc-800/70'
                }`}
              >
                <svg className="w-8 h-5 shrink-0 overflow-visible" viewBox="0 0 32 20">
                  <line
                    x1="2"
                    y1="15"
                    x2="28"
                    y2="5"
                    stroke={lineShape === 'straight' ? color : '#78716c'}
                    strokeWidth="2.2"
                    strokeDasharray="4 2.5"
                    strokeLinecap="round"
                  />
                  <polygon
                    points="29,4.5 22.5,4.5 25.5,9.5"
                    fill={lineShape === 'straight' ? color : '#78716c'}
                  />
                </svg>
                <div className="min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[11.5px] font-bold">Пряма</span>
                    {lineShape === 'straight' && <Check size={12} className="text-indigo-600 dark:text-indigo-400 shrink-0" />}
                  </div>
                  <p className="text-[9.5px] text-stone-500 dark:text-zinc-400 font-normal leading-tight mt-0.5">
                    Пряма лінія
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setLineShape('wavy')}
                className={`p-2.5 rounded-xl border text-left flex flex-col gap-1.5 transition-all cursor-pointer ${
                  lineShape === 'wavy'
                    ? 'border-amber-600 bg-amber-50/90 dark:bg-amber-950/40 text-amber-950 dark:text-amber-200 ring-2 ring-amber-500/25 font-semibold shadow-2xs'
                    : 'border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-stone-700 dark:text-zinc-300 hover:bg-stone-50 dark:hover:bg-zinc-800/70'
                }`}
              >
                <svg className="w-8 h-5 shrink-0 overflow-visible" viewBox="0 0 32 20">
                  <path
                    d="M 2 10 Q 5.5 4 9 10 T 16 10 T 23 10 L 28 10"
                    fill="none"
                    stroke={lineShape === 'wavy' ? color : '#78716c'}
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  />
                  <polygon
                    points="30,10 25,7 25,13"
                    fill={lineShape === 'wavy' ? color : '#78716c'}
                  />
                </svg>
                <div className="min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[11.5px] font-bold">Хвиляста</span>
                    {lineShape === 'wavy' && <Check size={12} className="text-amber-600 dark:text-amber-400 shrink-0" />}
                  </div>
                  <p className="text-[9.5px] text-stone-500 dark:text-zinc-400 font-normal leading-tight mt-0.5">
                    Хресна лінія
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* Color Picker */}
          <div className="space-y-2 pt-2 border-t border-stone-200/80 dark:border-zinc-800">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-stone-700 dark:text-zinc-300 uppercase tracking-wider">
                Колір стрілки
              </span>
              <span className="text-[11px] font-mono font-semibold text-stone-500 dark:text-zinc-400 uppercase">
                {color}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {BRANCH_LINK_COLOR_PRESETS.map((preset) => {
                const isActive = color.toLowerCase() === preset.hex.toLowerCase();
                return (
                  <button
                    key={preset.hex}
                    type="button"
                    onClick={() => setColor(preset.hex)}
                    style={{ backgroundColor: preset.hex }}
                    className={`w-7 h-7 rounded-full transition-transform hover:scale-110 cursor-pointer flex items-center justify-center ${
                      isActive
                        ? 'ring-2 ring-offset-2 ring-stone-800 dark:ring-zinc-200 dark:ring-offset-zinc-900 scale-105'
                        : 'opacity-85 hover:opacity-100'
                    }`}
                    title={preset.name}
                  >
                    {isActive && <Check size={13} className="text-white drop-shadow" strokeWidth={3} />}
                  </button>
                );
              })}

              {/* Custom Color Swatch */}
              <label
                className="relative w-7 h-7 rounded-full border-2 border-dashed border-stone-300 dark:border-zinc-600 hover:border-indigo-500 flex items-center justify-center cursor-pointer transition-colors overflow-hidden"
                title="Обрати довільний колір"
              >
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <Palette size={13} className="text-stone-600 dark:text-zinc-300 pointer-events-none" />
              </label>
            </div>
          </div>

          {/* Line Thickness (1-10 px) */}
          <div className="space-y-2.5 pt-2 border-t border-stone-200/80 dark:border-zinc-800">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-stone-700 dark:text-zinc-300 uppercase tracking-wider">
                Товщина лінії
              </span>
              <span className="text-xs font-bold text-indigo-800 dark:text-indigo-200 bg-indigo-100 dark:bg-indigo-950/70 px-2 py-0.5 rounded-md font-mono">
                {strokeWidth} px
              </span>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-[11px] text-stone-400 font-mono">1</span>
              <input
                type="range"
                min={1}
                max={10}
                step={1}
                value={strokeWidth}
                onChange={(e) => setStrokeWidth(Number(e.target.value))}
                className="w-full accent-indigo-600 cursor-pointer h-2 bg-stone-200 dark:bg-zinc-700 rounded-lg"
              />
              <span className="text-[11px] text-stone-400 font-mono">10</span>
            </div>

            <div className="flex items-center justify-between gap-1 flex-wrap">
              {STROKE_WIDTH_PRESETS.map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setStrokeWidth(w)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold transition-all cursor-pointer border ${
                    strokeWidth === w
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                      : 'bg-stone-50 dark:bg-zinc-800 hover:bg-stone-100 dark:hover:bg-zinc-700 text-stone-700 dark:text-zinc-300 border-stone-200 dark:border-zinc-700'
                  }`}
                >
                  {w}px
                </button>
              ))}
            </div>
          </div>

          {/* Live Arrow Preview */}
          <div className="p-3 bg-stone-100/80 dark:bg-zinc-950 rounded-xl border border-stone-200 dark:border-zinc-800 flex flex-col items-center gap-1.5">
            <div className="text-[10px] text-stone-400 dark:text-zinc-500 uppercase font-semibold tracking-wider">
              Попередній перегляд стрілки
            </div>
            <div className="relative w-full h-14 flex items-center justify-center">
              <svg className="w-full h-14 overflow-visible" viewBox="0 0 320 56">
                <defs>
                  <marker
                    id="branch-style-preview-arrow"
                    viewBox={`0 0 ${arrowLen} ${arrowHalfH * 2}`}
                    refX={previewRefX}
                    refY={arrowHalfH}
                    markerWidth={arrowLen}
                    markerHeight={arrowHalfH * 2}
                    markerUnits="userSpaceOnUse"
                    orient="auto"
                  >
                    <path
                      d={`M 0 0 L ${arrowLen} ${arrowHalfH} L 0 ${arrowHalfH * 2} L ${previewNotchX} ${arrowHalfH} z`}
                      fill={color}
                    />
                  </marker>
                </defs>
                <path
                  d={
                    lineShape === 'straight'
                      ? 'M 18 28 L 302 28'
                      : lineShape === 'wavy'
                      ? buildWavyPath({ x: 18, y: 28 }, { x: 302, y: 28 }).pathD
                      : 'M 18 38 Q 160 4 302 34'
                  }
                  fill="none"
                  stroke={color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={lineShape === 'wavy' ? undefined : '7 4'}
                  strokeLinecap={lineShape === 'wavy' ? 'round' : 'butt'}
                  strokeLinejoin="round"
                  markerEnd="url(#branch-style-preview-arrow)"
                />
                <circle
                  cx={18}
                  cy={lineShape === 'curved' ? 38 : 28}
                  r={Math.max(2.6, Math.min(5.5, strokeWidth * 0.7 + 1.2))}
                  fill={color}
                />
              </svg>
              <span
                style={{ borderColor: color }}
                className={`absolute px-2 py-0.5 rounded-full bg-white/95 dark:bg-zinc-900/95 border shadow-xs text-[10px] font-bold text-stone-800 dark:text-zinc-100 inline-flex items-center gap-1 max-w-[180px] ${
                  lineShape === 'straight' || lineShape === 'wavy' ? 'top-1/2 -translate-y-1/2' : 'top-2.5'
                }`}
              >
                {link?.linkKind === 'godparent' ? (
                  <span className="text-[10px] leading-none shrink-0" style={{ color }}>
                    ✝
                  </span>
                ) : (
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                )}
                <span className="truncate">{previewLabel}</span>
                <ArrowUpRight size={10} className="shrink-0" style={{ color }} />
              </span>
            </div>
          </div>

          {/* Scope options (Single Link Mode) */}
          {mode === 'single' && (hasReciprocal || totalLinksCount > 1) && (
            <div className="space-y-2 pt-1">
              {hasReciprocal && (
                <label className="flex items-center gap-2 cursor-pointer text-xs text-stone-700 dark:text-zinc-300">
                  <input
                    type="checkbox"
                    checked={updateReciprocal}
                    onChange={(e) => setUpdateReciprocal(e.target.checked)}
                    className="rounded accent-indigo-600 w-3.5 h-3.5 cursor-pointer"
                  />
                  <span>Застосувати стиль також до зворотного посилання</span>
                </label>
              )}

              {totalLinksCount > 1 && (
                <label className="flex items-center gap-2 cursor-pointer text-xs text-stone-700 dark:text-zinc-300">
                  <input
                    type="checkbox"
                    checked={applyToAll}
                    onChange={(e) => setApplyToAll(e.target.checked)}
                    className="rounded accent-indigo-600 w-3.5 h-3.5 cursor-pointer"
                  />
                  <span>Застосувати колір, товщину та форму до всіх стрілок ({totalLinksCount})</span>
                </label>
              )}
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-2 flex items-center justify-between gap-2 border-t border-stone-100 dark:border-zinc-800">
            {mode === 'single' && onDelete ? (
              <button
                type="button"
                onClick={() => {
                  onDelete();
                  onClose();
                }}
                className="px-3 py-2 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Trash2 size={13.5} />
                <span>Видалити</span>
              </button>
            ) : (
              <span />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 text-xs font-medium text-stone-600 dark:text-zinc-300 hover:bg-stone-100 dark:hover:bg-zinc-800 rounded-xl transition-colors cursor-pointer"
              >
                Скасувати
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-95 rounded-xl shadow-xs transition-all cursor-pointer"
              >
                Зберегти
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
