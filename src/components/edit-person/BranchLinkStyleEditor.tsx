import React from 'react';
import {
  BRANCH_LINK_COLOR_PRESETS,
  BranchLinkCurveStyle,
  NOTE_PROBABLE_RELATION_PRESETS,
} from '../../types/tree';
import { Check, Palette } from 'lucide-react';

interface BranchLinkStyleEditorProps {
  label?: string;
  onChangeLabel?: (value: string) => void;
  probableRelation?: string;
  onChangeProbableRelation?: (value: string) => void;
  color: string;
  onChangeColor: (color: string) => void;
  strokeWidth: number;
  onChangeStrokeWidth: (width: number) => void;
  lineShape: BranchLinkCurveStyle;
  onChangeLineShape: (shape: BranchLinkCurveStyle) => void;
}

const WIDTH_PRESETS = [1, 2, 3, 4, 6, 8, 10] as const;

export const BranchLinkStyleEditor: React.FC<BranchLinkStyleEditorProps> = ({
  label,
  onChangeLabel,
  probableRelation,
  onChangeProbableRelation,
  color,
  onChangeColor,
  strokeWidth,
  onChangeStrokeWidth,
  lineShape,
  onChangeLineShape,
}) => {
  return (
    <div className="space-y-2.5 pt-2">
      {onChangeProbableRelation && (
        <div className="space-y-1.5 pb-1 border-b border-amber-200/70 dark:border-amber-900/40">
          <div className="flex items-center justify-between gap-2">
            <label className="block text-[10.5px] font-semibold text-amber-900 dark:text-amber-300">
              Ймовірний родинний зв&apos;язок
            </label>
            {probableRelation?.trim() && (
              <button
                type="button"
                onClick={() => onChangeProbableRelation('')}
                className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 hover:underline cursor-pointer"
              >
                Очистити
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            {NOTE_PROBABLE_RELATION_PRESETS.map((preset) => {
              const active =
                (probableRelation || '').trim().toLowerCase() === preset.label.toLowerCase();
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => onChangeProbableRelation(active ? '' : preset.label)}
                  className={`px-2 py-0.5 rounded-md border text-[10.5px] font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer ${
                    active
                      ? 'border-amber-600 bg-amber-600 text-white'
                      : 'border-amber-200 dark:border-amber-800 bg-white dark:bg-zinc-900 text-amber-950 dark:text-amber-200 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                  }`}
                >
                  <span>{preset.icon}</span>
                  <span>{preset.label}</span>
                </button>
              );
            })}
          </div>
          <input
            type="text"
            value={probableRelation ?? ''}
            onChange={(e) => onChangeProbableRelation(e.target.value)}
            placeholder="напр. Батьки, Подружжя, Дитина..."
            className="w-full min-w-0 text-xs px-2.5 py-1.5 rounded-lg border border-amber-300 dark:border-amber-800 bg-white dark:bg-zinc-900 text-stone-900 dark:text-zinc-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500/35 focus:border-amber-500"
          />
        </div>
      )}

      {onChangeLabel && (
        <div>
          <label className="block text-[10.5px] font-medium text-stone-600 dark:text-zinc-400 mb-1">
            Підпис стрілки
          </label>
          <input
            type="text"
            value={label ?? ''}
            onChange={(e) => onChangeLabel(e.target.value)}
            placeholder="напр. Куми, Гілка Івана"
            className="w-full min-w-0 text-xs px-2.5 py-1.5 rounded-lg border border-stone-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-stone-900 dark:text-zinc-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/35 focus:border-indigo-500"
          />
        </div>
      )}

      {/* Shape Switch: Curved vs Straight vs Wavy */}
      <div className="space-y-1">
        <span className="block text-[10.5px] font-medium text-stone-600 dark:text-zinc-400">
          Форма лінії
        </span>
        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={() => onChangeLineShape('curved')}
            className={`px-2 py-1.5 rounded-lg border text-[11px] font-semibold flex items-center justify-center gap-1 transition-all cursor-pointer ${
              lineShape === 'curved'
                ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-950 dark:text-indigo-200 ring-1 ring-indigo-500/40'
                : 'border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-stone-600 dark:text-zinc-300 hover:bg-stone-50 dark:hover:bg-zinc-800'
            }`}
          >
            <svg className="w-4.5 h-3.5 overflow-visible shrink-0" viewBox="0 0 20 14">
              <path
                d="M 1 11 Q 10 1 19 9"
                fill="none"
                stroke={lineShape === 'curved' ? color : '#78716c'}
                strokeWidth="2"
                strokeDasharray="3 2"
              />
            </svg>
            <span className="truncate">Вигнута</span>
          </button>

          <button
            type="button"
            onClick={() => onChangeLineShape('straight')}
            className={`px-2 py-1.5 rounded-lg border text-[11px] font-semibold flex items-center justify-center gap-1 transition-all cursor-pointer ${
              lineShape === 'straight'
                ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-950 dark:text-indigo-200 ring-1 ring-indigo-500/40'
                : 'border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-stone-600 dark:text-zinc-300 hover:bg-stone-50 dark:hover:bg-zinc-800'
            }`}
          >
            <svg className="w-4.5 h-3.5 overflow-visible shrink-0" viewBox="0 0 20 14">
              <line
                x1="1"
                y1="11"
                x2="19"
                y2="3"
                stroke={lineShape === 'straight' ? color : '#78716c'}
                strokeWidth="2"
                strokeDasharray="3 2"
              />
            </svg>
            <span className="truncate">Пряма</span>
          </button>

          <button
            type="button"
            onClick={() => onChangeLineShape('wavy')}
            className={`px-2 py-1.5 rounded-lg border text-[11px] font-semibold flex items-center justify-center gap-1 transition-all cursor-pointer ${
              lineShape === 'wavy'
                ? 'border-amber-600 bg-amber-50 dark:bg-amber-950/50 text-amber-950 dark:text-amber-200 ring-1 ring-amber-500/40'
                : 'border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-stone-600 dark:text-zinc-300 hover:bg-stone-50 dark:hover:bg-zinc-800'
            }`}
          >
            <svg className="w-5 h-3.5 overflow-visible shrink-0" viewBox="0 0 22 14">
              <path
                d="M 1 7 Q 3.5 2 6 7 T 11 7 T 16 7 T 21 7"
                fill="none"
                stroke={lineShape === 'wavy' ? color : '#78716c'}
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <span className="truncate">Хвиляста</span>
          </button>
        </div>
      </div>

      {/* Color Swatches + Custom Color */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[10.5px] font-medium text-stone-600 dark:text-zinc-400">
          Колір:
        </span>
        <div className="flex items-center gap-1.5 flex-wrap">
          {BRANCH_LINK_COLOR_PRESETS.map((preset) => {
            const active = color.toLowerCase() === preset.hex.toLowerCase();
            return (
              <button
                key={preset.hex}
                type="button"
                onClick={() => onChangeColor(preset.hex)}
                style={{ backgroundColor: preset.hex }}
                className={`w-5 h-5 rounded-full transition-transform hover:scale-110 cursor-pointer flex items-center justify-center ${
                  active
                    ? 'ring-2 ring-offset-1 ring-stone-700 dark:ring-zinc-300 dark:ring-offset-zinc-900'
                    : 'opacity-80'
                }`}
                title={preset.name}
              >
                {active && <Check size={10} className="text-white" strokeWidth={3} />}
              </button>
            );
          })}
          <label
            className="relative w-5 h-5 rounded-full border border-dashed border-stone-400 dark:border-zinc-600 hover:border-indigo-500 flex items-center justify-center cursor-pointer overflow-hidden bg-white dark:bg-zinc-900"
            title="Довільний колір"
          >
            <input
              type="color"
              value={color}
              onChange={(e) => onChangeColor(e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
            <Palette size={10} className="text-stone-600 dark:text-zinc-300 pointer-events-none" />
          </label>
        </div>
      </div>

      {/* Thickness Slider & Presets */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10.5px] font-medium text-stone-600 dark:text-zinc-400">
            Товщина лінії
          </span>
          <span className="text-[10.5px] font-mono font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 px-1.5 py-0.5 rounded">
            {strokeWidth} px
          </span>
        </div>
        <input
          type="range"
          min={1}
          max={10}
          step={1}
          value={strokeWidth}
          onChange={(e) => onChangeStrokeWidth(Number(e.target.value))}
          className="w-full accent-indigo-600 cursor-pointer h-1.5 bg-stone-200 dark:bg-zinc-700 rounded-lg"
        />
        <div className="flex items-center gap-1 flex-wrap">
          {WIDTH_PRESETS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => onChangeStrokeWidth(w)}
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold border cursor-pointer transition-colors ${
                strokeWidth === w
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white dark:bg-zinc-900 text-stone-700 dark:text-zinc-300 border-stone-200 dark:border-zinc-700 hover:bg-stone-100 dark:hover:bg-zinc-800'
              }`}
            >
              {w}px
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
