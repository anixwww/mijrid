import React, { useState } from 'react';
import { DownloadCloud, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../utils/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already running as an installed standalone PWA, hide the button
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="h-8 px-2.5 rounded-xl bg-stone-100/90 hover:bg-stone-200/90 text-stone-700 hover:text-stone-900 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
        title="Встановити додаток «Родовід» на комп'ютер чи телефон"
      >
        <DownloadCloud size={13} className="text-stone-600" />
        <span className="hidden md:inline">Встановити</span>
      </button>
    );
  }

  // iOS Safari flow (beforeinstallprompt is not supported by WebKit)
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="h-8 px-2.5 rounded-xl bg-stone-100/90 hover:bg-stone-200/90 text-stone-700 hover:text-stone-900 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
          title="Встановити «Родовід» на iPhone чи iPad"
        >
          <Smartphone size={13} className="text-stone-600" />
          <span className="hidden md:inline">На екран iOS</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border border-stone-200 animate-in fade-in zoom-in-95 duration-150">
              <h3 className="text-base font-bold text-stone-900 font-serif-heritage">
                Встановлення на iPhone / iPad
              </h3>
              <p className="mt-3 text-xs text-stone-700 leading-relaxed space-y-1">
                1. Натисніть кнопку <strong>«Поділитися»</strong> (іконка квадрата зі стрілкою вгору) внизу в браузері Safari.<br />
                2. Прокрутіть список униз і виберіть <strong>«На екран "Початок"»</strong>.<br />
                3. Натисніть <strong>«Додати»</strong> у правому верхньому кутку.
              </p>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-xl bg-stone-900 py-2 text-xs font-semibold text-white hover:bg-stone-800 transition-colors cursor-pointer"
              >
                Зрозуміло
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
