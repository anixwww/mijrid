import React, { useState, useEffect } from 'react';
import { ConnectionMeta } from '../types/tree';
import { X, CheckCircle2, AlertCircle, Link2, Check } from 'lucide-react';

interface EditConnectionModalProps {
  connectionId: string;
  initialMeta?: ConnectionMeta;
  isCurrentlyVerified?: boolean;
  connectionLabel?: string;
  isOpen: boolean;
  onClose: () => void;
  onSave: (connectionId: string, meta: ConnectionMeta) => void;
}

export const EditConnectionModal: React.FC<EditConnectionModalProps> = ({
  connectionId,
  initialMeta,
  isCurrentlyVerified = true,
  connectionLabel,
  isOpen,
  onClose,
  onSave,
}) => {
  // Determine initial state: prioritize explicit initialMeta.verified, otherwise fallback to isCurrentlyVerified
  const [isVerified, setIsVerified] = useState<boolean>(
    initialMeta?.verified !== undefined
      ? initialMeta.verified
      : initialMeta?.confidenceLevel === 'hypothetical'
      ? false
      : isCurrentlyVerified
  );

  // Line thickness in px (1-12 px)
  const [strokeWidth, setStrokeWidth] = useState<number>(
    typeof initialMeta?.strokeWidth === 'number' && initialMeta.strokeWidth >= 1 && initialMeta.strokeWidth <= 12
      ? initialMeta.strokeWidth
      : 2
  );

  useEffect(() => {
    if (isOpen) {
      setIsVerified(
        initialMeta?.verified !== undefined
          ? initialMeta.verified
          : initialMeta?.confidenceLevel === 'hypothetical'
          ? false
          : isCurrentlyVerified
      );
      setStrokeWidth(
        typeof initialMeta?.strokeWidth === 'number' && initialMeta.strokeWidth >= 1 && initialMeta.strokeWidth <= 12
          ? initialMeta.strokeWidth
          : 2
      );
    }
  }, [isOpen, initialMeta, isCurrentlyVerified]);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    const updatedMeta: ConnectionMeta = {
      ...(initialMeta || {}),
      verified: isVerified,
      confidenceLevel: isVerified ? 'verified' : 'hypothetical',
      strokeWidth: Math.max(1, Math.min(12, Math.round(strokeWidth))),
      hasNoEvent: true,
      eventType: undefined,
      eventDate: undefined,
      label: undefined,
      eventX: undefined,
      eventY: undefined,
    };

    onSave(connectionId, updatedMeta);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-stone-200 w-full max-w-sm overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 bg-[#f8faf8] border-b border-[#e2e8e2] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-800 shrink-0">
              <Link2 size={16} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-stone-900 leading-tight">Статус зв'язку</h3>
              {connectionLabel && (
                <p className="text-[11px] text-stone-500 truncate max-w-[220px]">
                  {connectionLabel}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-200/50 transition-colors cursor-pointer"
          >
            <X size={17} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-5 space-y-3.5">
          <div className="text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1">
            Оберіть статус перевірки
          </div>

          {/* Option 1: Verified */}
          <button
            type="button"
            onClick={() => setIsVerified(true)}
            className={`w-full p-3.5 rounded-xl border text-left flex items-start gap-3 transition-all cursor-pointer ${
              isVerified
                ? 'border-emerald-600 bg-emerald-50 text-emerald-950 ring-2 ring-emerald-600/30 font-semibold shadow-xs'
                : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
            }`}
          >
            <div
              className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                isVerified ? 'bg-emerald-600 text-white' : 'bg-stone-100 text-stone-400'
              }`}
            >
              <CheckCircle2 size={17} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold">Перевірено</span>
                {isVerified && <Check size={16} className="text-emerald-700" strokeWidth={2.5} />}
              </div>
              <p className="text-[11px] text-stone-500 mt-0.5 leading-snug">
                Суцільна лінія на схемі. Родинний зв'язок підтверджено документально.
              </p>
            </div>
          </button>

          {/* Option 2: Unverified */}
          <button
            type="button"
            onClick={() => setIsVerified(false)}
            className={`w-full p-3.5 rounded-xl border text-left flex items-start gap-3 transition-all cursor-pointer ${
              !isVerified
                ? 'border-amber-600 bg-amber-50/70 text-amber-950 ring-2 ring-amber-500/30 font-semibold shadow-xs'
                : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
            }`}
          >
            <div
              className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                !isVerified ? 'bg-amber-600 text-white' : 'bg-stone-100 text-stone-400'
              }`}
            >
              <AlertCircle size={17} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold">Не перевірено</span>
                {!isVerified && <Check size={16} className="text-amber-700" strokeWidth={2.5} />}
              </div>
              <p className="text-[11px] text-stone-500 mt-0.5 leading-snug">
                Пунктирна лінія на схемі. Потребує підтвердження або додаткового дослідження.
              </p>
            </div>
          </button>

          {/* Section: Line Thickness (1-12 px) */}
          <div className="pt-2 border-t border-stone-200/80 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-stone-700 uppercase tracking-wider">
                Товщина лінії
              </span>
              <span className="text-xs font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md font-mono">
                {strokeWidth} px
              </span>
            </div>

            {/* Slider */}
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-stone-400 font-mono">1</span>
              <input
                type="range"
                min={1}
                max={12}
                step={1}
                value={strokeWidth}
                onChange={(e) => setStrokeWidth(Number(e.target.value))}
                className="w-full accent-emerald-700 cursor-pointer h-2 bg-stone-200 rounded-lg"
              />
              <span className="text-[11px] text-stone-400 font-mono">12</span>
            </div>

            {/* Presets */}
            <div className="flex items-center justify-between gap-1 flex-wrap">
              {[1, 2, 3, 4, 6, 8, 10, 12].map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setStrokeWidth(w)}
                  className={`px-2 py-1 rounded-lg text-[11px] font-mono font-semibold transition-all cursor-pointer border ${
                    strokeWidth === w
                      ? 'bg-emerald-700 text-white border-emerald-700 shadow-2xs'
                      : 'bg-stone-50 hover:bg-stone-100 text-stone-700 border-stone-200'
                  }`}
                >
                  {w}px
                </button>
              ))}
            </div>

            {/* Live Line Preview */}
            <div className="p-2.5 bg-stone-100/80 rounded-xl border border-stone-200 flex flex-col items-center justify-center gap-1">
              <div className="text-[10px] text-stone-400 uppercase font-semibold tracking-wider">
                Попередній перегляд лінії
              </div>
              <svg className="w-full h-8 overflow-visible">
                <line
                  x1="12"
                  y1="16"
                  x2="260"
                  y2="16"
                  stroke={!isVerified ? '#94a3b8' : '#475569'}
                  strokeWidth={strokeWidth}
                  strokeDasharray={!isVerified ? '6,5' : undefined}
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </div>

          {/* Actions Footer */}
          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-stone-600 hover:bg-stone-100 rounded-xl transition-colors cursor-pointer"
            >
              Скасувати
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 active:scale-95 rounded-xl shadow-xs transition-all cursor-pointer"
            >
              Зберегти
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
