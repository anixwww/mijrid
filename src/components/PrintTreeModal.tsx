import React, { useEffect, useState } from 'react';
import { FamilyTreeData } from '../types/tree';
import {
  prepareTreeForPrint,
  PreparedPrintTree,
  PrintOptimizationOptions,
} from '../utils/treeExport';
import {
  X,
  Printer,
  Sparkles,
  Grid,
  FileText,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';

interface PrintTreeModalProps {
  tree: FamilyTreeData;
  isOpen: boolean;
  onClose: () => void;
  onPreparedSvgChange: (prepared: PreparedPrintTree | null) => void;
}

export const PrintTreeModal: React.FC<PrintTreeModalProps> = ({
  tree,
  isOpen,
  onClose,
  onPreparedSvgChange,
}) => {
  const [options, setOptions] = useState<PrintOptimizationOptions>({
    layoutMode: 'compact',
    orientation: 'auto',
    showGrid: false,
    includeHeader: true,
  });
  const [prepared, setPrepared] = useState<PreparedPrintTree | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      onPreparedSvgChange(null);
      return;
    }

    let cancelled = false;
    setIsPreparing(true);
    prepareTreeForPrint(tree, options)
      .then((res) => {
        if (!cancelled) {
          setPrepared(res);
          onPreparedSvgChange(res);
        }
      })
      .finally(() => {
        if (!cancelled) setIsPreparing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, tree, options, onPreparedSvgChange]);

  useEffect(() => {
    if (!prepared) return;
    let styleEl = document.getElementById('rodovid-print-page-style') as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'rodovid-print-page-style';
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = `@page { size: ${prepared.orientation}; margin: 8mm; }`;
  }, [prepared]);

  if (!isOpen) return null;

  const handlePrintPdf = () => {
    if (!prepared) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.print();
      });
    });
  };

  return (
    <div
      className="no-print fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3 sm:p-5 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-stone-200 w-full max-w-5xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 bg-[#f4f7f4] border-b border-[#d8e2d9] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-700 text-white flex items-center justify-center shadow-xs shrink-0">
              <Printer size={18} />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-stone-900">
                Підготовка дерева до друку та PDF
              </h3>
              <p className="text-[11px] text-stone-500">
                Світла архівна палітра, вбудовані фото та автоматичне масштабування під аркуш
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Optimization Controls */}
        <div className="px-5 py-3 bg-stone-50 border-b border-stone-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {/* Layout optimization toggle */}
            <div className="flex items-center rounded-xl bg-stone-200/70 p-0.5 border border-stone-200">
              <button
                type="button"
                onClick={() => setOptions((prev) => ({ ...prev, layoutMode: 'compact' }))}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  options.layoutMode === 'compact'
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <Sparkles size={13} className="text-emerald-700" />
                <span>Оптимізувати компактно</span>
              </button>
              <button
                type="button"
                onClick={() => setOptions((prev) => ({ ...prev, layoutMode: 'preserve' }))}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  options.layoutMode === 'preserve'
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                Поточне положення
              </button>
            </div>

            {/* Orientation */}
            <div className="flex items-center rounded-xl bg-stone-200/70 p-0.5 border border-stone-200">
              {([
                { id: 'auto', label: 'Авто' },
                { id: 'landscape', label: 'Альбомна' },
                { id: 'portrait', label: 'Книжкова' },
              ] as const).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setOptions((prev) => ({ ...prev, orientation: item.id }))}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    options.orientation === item.id
                      ? 'bg-white text-stone-900 shadow-xs'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {/* Grid & Header toggles */}
            <button
              type="button"
              onClick={() => setOptions((prev) => ({ ...prev, showGrid: !prev.showGrid }))}
              className={`px-2.5 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                options.showGrid
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                  : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-100'
              }`}
            >
              <Grid size={13} />
              <span>Сітка</span>
            </button>

            <button
              type="button"
              onClick={() => setOptions((prev) => ({ ...prev, includeHeader: !prev.includeHeader }))}
              className={`px-2.5 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                options.includeHeader
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                  : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-100'
              }`}
            >
              <FileText size={13} />
              <span>Заголовок</span>
            </button>
          </div>

          {prepared && (
            <div className="flex items-center gap-2 text-[11px] font-medium text-stone-600">
              <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
              <span>
                {prepared.personCount} осіб · {prepared.generationCount} пок. ·{' '}
                {prepared.orientation === 'landscape' ? 'Альбомна' : 'Книжкова'}
              </span>
            </div>
          )}
        </div>

        {/* Live Paper Preview */}
        <div className="flex-1 overflow-auto bg-stone-200/70 p-4 sm:p-6 flex items-center justify-center min-h-[300px]">
          {isPreparing || !prepared ? (
            <div className="flex flex-col items-center gap-2 text-stone-600 py-12">
              <RefreshCw size={28} className="animate-spin text-purple-700" />
              <span className="text-xs font-semibold">Оптимізація дерева та зображень для друку...</span>
            </div>
          ) : (
            <div
              className="bg-white shadow-xl border border-stone-300 rounded-lg p-3 sm:p-4 max-w-full max-h-full overflow-auto"
              style={{
                aspectRatio: prepared.orientation === 'landscape' ? '297 / 210' : '210 / 297',
                width: prepared.orientation === 'landscape' ? 'min(100%, 780px)' : 'min(100%, 480px)',
              }}
            >
              <div
                className="w-full h-full flex items-center justify-center [&>svg]:w-full [&>svg]:h-full [&>svg]:max-h-full [&>svg]:max-w-full"
                dangerouslySetInnerHTML={{ __html: prepared.svgMarkup }}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-stone-50 border-t border-stone-200 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] text-stone-500">
            У вікні друку браузера оберіть «Зберегти у форматі PDF» — на аркуші буде лише чисте дерево.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-stone-700 hover:bg-stone-200/60 rounded-xl transition-colors cursor-pointer"
            >
              Скасувати
            </button>
            <button
              type="button"
              disabled={isPreparing || !prepared || prepared.personCount === 0}
              onClick={handlePrintPdf}
              className="px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2 shadow-sm transition-all cursor-pointer active:scale-98"
            >
              <Printer size={15} />
              <span>Зберегти в PDF / Друкувати</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
