import React from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title?: string;
  message: string;
}

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed top-20 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2.5 max-w-md w-full px-4 pointer-events-none items-center"
    >
      {toasts.map((toast) => {
        const isSuccess = toast.type === 'success';
        const isError = toast.type === 'error';
        const isWarning = toast.type === 'warning';

        const bg = isSuccess
          ? 'bg-emerald-900/95 text-emerald-50 border-emerald-700/80'
          : isError
          ? 'bg-rose-950/95 text-rose-50 border-rose-800/80'
          : isWarning
          ? 'bg-amber-950/95 text-amber-50 border-amber-800/80'
          : 'bg-stone-900/95 text-stone-50 border-stone-700/80';

        const iconColor = isSuccess
          ? 'text-emerald-400'
          : isError
          ? 'text-rose-400'
          : isWarning
          ? 'text-amber-400'
          : 'text-stone-400';

        return (
          <div
            key={toast.id}
            className={`${bg} backdrop-blur-md rounded-2xl px-4 py-3 shadow-2xl border flex items-start gap-3 pointer-events-auto transition-all animate-in fade-in slide-in-from-top-4 duration-200 w-full max-w-md`}
          >
            <div className="shrink-0 mt-0.5">
              {isSuccess ? (
                <CheckCircle2 size={18} className={iconColor} />
              ) : isError || isWarning ? (
                <AlertCircle size={18} className={iconColor} />
              ) : (
                <Info size={18} className={iconColor} />
              )}
            </div>

            <div className="flex-1 min-w-0 pr-1">
              {toast.title && (
                <h4 className="text-xs font-bold leading-tight mb-0.5">{toast.title}</h4>
              )}
              <p className="text-[11.5px] leading-relaxed opacity-90 break-words">{toast.message}</p>
            </div>

            <button
              onClick={() => onDismiss(toast.id)}
              className="shrink-0 p-1 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              aria-label="Закрити"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
