import React, { useState, useRef, useEffect } from 'react';
import {
  Users,
  Copy,
  Trash2,
  Clipboard,
  X as CloseIcon,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignHorizontalSpaceAround,
  AlignVerticalSpaceAround,
  Ruler,
  ChevronDown,
  GitFork,
} from 'lucide-react';
import { Person } from '../types/tree';
import { ManualAlignAction } from '../utils/alignmentUtils';

interface BatchSelectionBarProps {
  isAdmin: boolean;
  selectedPersonIds: Set<string>;
  clipboardCount: number;
  persons: Record<string, Person>;
  onCopySelected: () => void;
  onSelectAll: () => void;
  onDeleteSelected: () => void;
  onClearSelection: () => void;
  onPasteBuffer: () => void;
  onCancelClipboard: () => void;
  onAlignSelected?: (action: ManualAlignAction, gapCm?: number) => void;
  onGroupByGenerations?: () => void;
}

const CM_GAP_PRESETS = [0.5, 1.0, 1.2, 2.0];

export const BatchSelectionBar: React.FC<BatchSelectionBarProps> = ({
  isAdmin,
  selectedPersonIds,
  clipboardCount,
  onCopySelected,
  onSelectAll,
  onDeleteSelected,
  onClearSelection,
  onPasteBuffer,
  onCancelClipboard,
  onAlignSelected,
  onGroupByGenerations,
}) => {
  const [isAlignMenuOpen, setIsAlignMenuOpen] = useState(false);
  const [customGapCm, setCustomGapCm] = useState('1.2');
  const alignWrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedPersonIds.size < 2) {
      setIsAlignMenuOpen(false);
    }
  }, [selectedPersonIds.size]);

  useEffect(() => {
    if (!isAlignMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (alignWrapperRef.current && !alignWrapperRef.current.contains(e.target as Node)) {
        setIsAlignMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isAlignMenuOpen]);

  if (!isAdmin || (selectedPersonIds.size <= 1 && clipboardCount === 0)) {
    return null;
  }

  const parsedGapCm = Math.max(0, Math.min(25, parseFloat(customGapCm.replace(',', '.')) || 1.2));

  const triggerAlign = (action: ManualAlignAction, gapCm?: number) => {
    onAlignSelected?.(action, gapCm);
  };

  return (
    <div
      ref={alignWrapperRef}
      className="fixed bottom-[calc(max(0.875rem,env(safe-area-inset-bottom))+4.5rem)] sm:bottom-22 left-1/2 -translate-x-1/2 z-40 max-w-[calc(100vw-16px)] sm:max-w-[calc(100vw-24px)] select-none"
    >
      {/* Manual Alignment Popover (rendered outside overflow container so it is never clipped) */}
      {isAlignMenuOpen && selectedPersonIds.size >= 2 && onAlignSelected && (
        <div className="mb-2.5 mx-auto w-[312px] sm:w-[340px] max-w-[calc(100vw-24px)] bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border border-stone-200/90 dark:border-zinc-700/80 rounded-2xl shadow-2xl p-3 space-y-3 text-xs animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between border-b border-stone-100 dark:border-zinc-800 pb-2">
            <div className="flex items-center gap-1.5 font-bold text-stone-900 dark:text-zinc-100">
              <Ruler size={13.5} className="text-emerald-700 dark:text-emerald-400" />
              <span>Ручне вирівнювання ({selectedPersonIds.size})</span>
            </div>
            <button
              type="button"
              onClick={() => setIsAlignMenuOpen(false)}
              className="w-8 h-8 sm:w-7 sm:h-7 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-zinc-200 hover:bg-stone-100 dark:hover:bg-zinc-800 cursor-pointer flex items-center justify-center"
              aria-label="Закрити"
            >
              <CloseIcon size={15} />
            </button>
          </div>

          {/* Edge & Center Alignment */}
          <div className="space-y-1.5">
            <div className="text-[10.5px] font-semibold uppercase tracking-wider text-stone-400 dark:text-zinc-500">
              Вирівняти по краю / центру
            </div>
            <div className="grid grid-cols-6 gap-1.5 sm:gap-1">
              <button
                type="button"
                onClick={() => triggerAlign('left')}
                className="h-10 sm:h-8 rounded-lg bg-stone-100 hover:bg-emerald-50 hover:text-emerald-800 dark:bg-zinc-800 dark:hover:bg-emerald-950/60 dark:text-zinc-200 dark:hover:text-emerald-300 flex items-center justify-center transition-colors cursor-pointer active:scale-95"
                title="По лівому краю"
              >
                <AlignStartVertical size={16} />
              </button>
              <button
                type="button"
                onClick={() => triggerAlign('center-x')}
                className="h-10 sm:h-8 rounded-lg bg-stone-100 hover:bg-emerald-50 hover:text-emerald-800 dark:bg-zinc-800 dark:hover:bg-emerald-950/60 dark:text-zinc-200 dark:hover:text-emerald-300 flex items-center justify-center transition-colors cursor-pointer active:scale-95"
                title="По центру (горизонтально)"
              >
                <AlignCenterVertical size={16} />
              </button>
              <button
                type="button"
                onClick={() => triggerAlign('right')}
                className="h-10 sm:h-8 rounded-lg bg-stone-100 hover:bg-emerald-50 hover:text-emerald-800 dark:bg-zinc-800 dark:hover:bg-emerald-950/60 dark:text-zinc-200 dark:hover:text-emerald-300 flex items-center justify-center transition-colors cursor-pointer active:scale-95"
                title="По правому краю"
              >
                <AlignEndVertical size={16} />
              </button>
              <button
                type="button"
                onClick={() => triggerAlign('top')}
                className="h-10 sm:h-8 rounded-lg bg-stone-100 hover:bg-emerald-50 hover:text-emerald-800 dark:bg-zinc-800 dark:hover:bg-emerald-950/60 dark:text-zinc-200 dark:hover:text-emerald-300 flex items-center justify-center transition-colors cursor-pointer active:scale-95"
                title="По верхньому краю"
              >
                <AlignStartHorizontal size={16} />
              </button>
              <button
                type="button"
                onClick={() => triggerAlign('center-y')}
                className="h-10 sm:h-8 rounded-lg bg-stone-100 hover:bg-emerald-50 hover:text-emerald-800 dark:bg-zinc-800 dark:hover:bg-emerald-950/60 dark:text-zinc-200 dark:hover:text-emerald-300 flex items-center justify-center transition-colors cursor-pointer active:scale-95"
                title="По центру (вертикально)"
              >
                <AlignCenterHorizontal size={16} />
              </button>
              <button
                type="button"
                onClick={() => triggerAlign('bottom')}
                className="h-10 sm:h-8 rounded-lg bg-stone-100 hover:bg-emerald-50 hover:text-emerald-800 dark:bg-zinc-800 dark:hover:bg-emerald-950/60 dark:text-zinc-200 dark:hover:text-emerald-300 flex items-center justify-center transition-colors cursor-pointer active:scale-95"
                title="По нижньому краю"
              >
                <AlignEndHorizontal size={16} />
              </button>
            </div>
          </div>

          {/* Equal Distribution (3+ cards) */}
          {selectedPersonIds.size >= 3 && (
            <div className="space-y-1.5">
              <div className="text-[10.5px] font-semibold uppercase tracking-wider text-stone-400 dark:text-zinc-500">
                Рівномірний розподіл
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => triggerAlign('distribute-x')}
                  className="h-10 sm:h-8 px-2.5 rounded-lg bg-stone-100 hover:bg-emerald-50 text-stone-700 hover:text-emerald-800 dark:bg-zinc-800 dark:hover:bg-emerald-950/60 dark:text-zinc-200 dark:hover:text-emerald-300 font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer active:scale-95"
                  title="Вирівняти інтервали по горизонталі між крайніми картками"
                >
                  <AlignHorizontalSpaceAround size={15} />
                  <span>По горизонталі</span>
                </button>
                <button
                  type="button"
                  onClick={() => triggerAlign('distribute-y')}
                  className="h-10 sm:h-8 px-2.5 rounded-lg bg-stone-100 hover:bg-emerald-50 text-stone-700 hover:text-emerald-800 dark:bg-zinc-800 dark:hover:bg-emerald-950/60 dark:text-zinc-200 dark:hover:text-emerald-300 font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer active:scale-95"
                  title="Вирівняти інтервали по вертикалі між крайніми картками"
                >
                  <AlignVerticalSpaceAround size={15} />
                  <span>По вертикалі</span>
                </button>
              </div>
            </div>
          )}

          {/* Exact Spacing in cm */}
          <div className="space-y-1.5 pt-1 border-t border-stone-100 dark:border-zinc-800">
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-semibold uppercase tracking-wider text-stone-400 dark:text-zinc-500">
                Інтервал між картками (см)
              </span>
              <div className="flex items-center gap-1">
                {CM_GAP_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setCustomGapCm(String(preset))}
                    className={`px-2 py-1 sm:px-1.5 sm:py-0.5 rounded text-[11px] sm:text-[10px] font-mono font-semibold transition-colors cursor-pointer ${
                      Math.abs(parsedGapCm - preset) < 0.05
                        ? 'bg-emerald-700 text-white'
                        : 'bg-stone-100 dark:bg-zinc-800 text-stone-600 dark:text-zinc-300 hover:bg-stone-200 dark:hover:bg-zinc-700'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <div className="relative w-20 shrink-0">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="25"
                  value={customGapCm}
                  onChange={(e) => setCustomGapCm(e.target.value)}
                  className="w-full h-10 sm:h-8 pl-2 pr-6 rounded-lg border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-800 text-base sm:text-xs font-mono font-semibold text-stone-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-stone-400 dark:text-zinc-400 pointer-events-none">
                  см
                </span>
              </div>
              <button
                type="button"
                onClick={() => triggerAlign('pack-row', parsedGapCm)}
                className="flex-1 h-10 sm:h-8 px-2.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-semibold transition-colors cursor-pointer active:scale-95"
                title={`Вирівняти в один горизонтальний ряд з кроком ${parsedGapCm} см`}
              >
                У ряд
              </button>
              <button
                type="button"
                onClick={() => triggerAlign('pack-col', parsedGapCm)}
                className="flex-1 h-10 sm:h-8 px-2.5 rounded-lg bg-stone-800 hover:bg-stone-900 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-white font-semibold transition-colors cursor-pointer active:scale-95"
                title={`Вирівняти у вертикальний стовпець з кроком ${parsedGapCm} см`}
              >
                У стовпець
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Floating Bar */}
      <div className="bg-stone-900/95 text-white border border-stone-700/80 backdrop-blur-xl px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-[18px] sm:rounded-2xl shadow-2xl flex items-center gap-1.5 sm:gap-2 text-xs animate-in slide-in-from-bottom duration-150 overflow-x-auto overscroll-x-contain touch-pan-x no-scrollbar">
        {selectedPersonIds.size > 0 && (
          <>
            <div className="flex items-center gap-1.5 font-semibold text-amber-300 shrink-0 tabular-nums whitespace-nowrap">
              <Users size={14} />
              <span>Обрано: {selectedPersonIds.size}</span>
            </div>

            <div className="h-4 w-px bg-stone-700 shrink-0" />

            {selectedPersonIds.size >= 2 && onAlignSelected && (
              <button
                type="button"
                onClick={() => setIsAlignMenuOpen((prev) => !prev)}
                className={`h-10 sm:h-9 px-3 rounded-xl font-semibold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 shrink-0 whitespace-nowrap ${
                  isAlignMenuOpen
                    ? 'bg-sky-600 text-white'
                    : 'bg-stone-800 hover:bg-stone-700 text-sky-300'
                }`}
                title="Ручне вирівнювання карток та задання відстані у см"
              >
                <Ruler size={15} />
                <span>Вирівняти</span>
                <ChevronDown
                  size={13}
                  className={`transition-transform duration-150 ${isAlignMenuOpen ? 'rotate-180' : ''}`}
                />
              </button>
            )}

            {selectedPersonIds.size >= 2 && onGroupByGenerations && (
              <button
                type="button"
                onClick={onGroupByGenerations}
                className="h-10 sm:h-9 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 shrink-0 whitespace-nowrap shadow-xs"
                title="Автоматично вирівняти вибрані картки по поколіннях: діди зверху, нижче батьки, знизу діти"
              >
                <GitFork size={15} />
                <span>По поколіннях</span>
              </button>
            )}

            <button
              type="button"
              onClick={onCopySelected}
              className="h-10 sm:h-9 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 shrink-0 whitespace-nowrap"
              title="Скопіювати виділені особи у буфер (Ctrl+C)"
            >
              <Copy size={15} />
              <span>Копіювати</span>
            </button>

            <button
              type="button"
              onClick={onSelectAll}
              className="h-10 sm:h-9 px-3 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 font-medium flex items-center gap-1 transition-all cursor-pointer shrink-0 whitespace-nowrap"
            >
              <span>Усі</span>
            </button>

            <button
              type="button"
              onClick={onDeleteSelected}
              className="h-10 sm:h-9 px-3 rounded-xl bg-rose-900/60 hover:bg-rose-800 text-rose-200 font-medium flex items-center gap-1.5 transition-all cursor-pointer shrink-0 whitespace-nowrap"
              title="Видалити всі виділені картки з цього дерева"
            >
              <Trash2 size={15} />
              <span>Видалити</span>
            </button>

            <button
              type="button"
              onClick={onClearSelection}
              className="w-10 h-10 sm:w-9 sm:h-9 rounded-xl hover:bg-stone-800 text-stone-400 hover:text-stone-200 transition-colors cursor-pointer shrink-0 flex items-center justify-center"
              title="Скасувати виділення (Esc)"
              aria-label="Скасувати виділення"
            >
              <CloseIcon size={16} />
            </button>
          </>
        )}

        {clipboardCount > 0 && (
          <div className="flex items-center gap-1.5 shrink-0">
            {selectedPersonIds.size > 0 && <div className="h-5 w-px bg-stone-700 shrink-0 mr-0.5" />}
            <button
              type="button"
              onClick={onPasteBuffer}
              className="h-10 sm:h-9 px-3.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 shrink-0 shadow-2xs"
              title="Вставити скопійовані картки на це полотно (Ctrl+V)"
            >
              <Clipboard size={15} />
              <span>Вставити скопійовані ({clipboardCount})</span>
            </button>
            <button
              type="button"
              onClick={onCancelClipboard}
              className="w-10 h-10 sm:w-9 sm:h-9 rounded-xl hover:bg-stone-800 text-stone-400 hover:text-white transition-colors cursor-pointer shrink-0 flex items-center justify-center"
              title="Скасувати копіювання (очистити буфер)"
              aria-label="Скасувати копіювання"
            >
              <CloseIcon size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
