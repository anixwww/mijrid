import React, { useEffect } from 'react';
import { AlertTriangle, Info, Trash2, X } from 'lucide-react';

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'default';
  hideCancel?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  description,
  confirmLabel = 'Підтвердити',
  cancelLabel = 'Скасувати',
  variant = 'default',
  hideCancel = false,
  onConfirm,
  onCancel,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const isDanger = variant === 'danger';
  const isWarning = variant === 'warning';

  const headerBg = isDanger
    ? 'bg-rose-50/90 border-rose-200/80'
    : isWarning
    ? 'bg-amber-50/90 border-amber-200/80'
    : 'bg-stone-50 border-stone-200/80';

  const iconBg = isDanger
    ? 'bg-rose-600 text-white'
    : isWarning
    ? 'bg-amber-600 text-white'
    : 'bg-stone-900 text-white';

  const confirmBtn = isDanger
    ? 'bg-rose-600 hover:bg-rose-700 text-white'
    : isWarning
    ? 'bg-amber-600 hover:bg-amber-700 text-white'
    : 'bg-stone-900 hover:bg-stone-800 text-white';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      className="fixed inset-0 bg-black/55 z-[70] flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-stone-200/90 w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`px-5 py-4 border-b flex items-center justify-between gap-3 ${headerBg}`}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-2xs ${iconBg}`}>
              {isDanger ? (
                <Trash2 size={16} />
              ) : isWarning ? (
                <AlertTriangle size={16} />
              ) : (
                <Info size={16} />
              )}
            </div>
            <h3
              id="confirm-dialog-title"
              className="text-sm font-bold text-stone-900 leading-snug truncate"
            >
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-black/5 transition-colors cursor-pointer shrink-0"
            aria-label="Закрити"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <p className="text-xs sm:text-[13px] text-stone-600 leading-relaxed">
            {description}
          </p>

          <div className="flex items-center justify-end gap-2">
            {!hideCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="h-9 px-3.5 text-xs font-semibold text-stone-700 hover:bg-stone-100 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
              >
                {cancelLabel}
              </button>
            )}
            <button
              type="button"
              autoFocus
              onClick={onConfirm}
              className={`h-9 px-4 text-xs font-semibold rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer whitespace-nowrap ${confirmBtn}`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
