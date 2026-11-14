import React from 'react';
import { FamilyTreeData } from '../types/tree';
import { downloadTreeJson } from '../utils/fileStorage';
import { downloadGedcomFile } from '../utils/gedcomExport';
import { X, Image as ImageIcon, Download, Printer, FileCode, Sparkles } from 'lucide-react';

interface ExportModalProps {
  tree: FamilyTreeData;
  isOpen: boolean;
  onClose: () => void;
  onExportPng: () => void;
  onExportSvg: () => void;
  onOpenPrintPreview: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  tree,
  isOpen,
  onClose,
  onExportPng,
  onExportSvg,
  onOpenPrintPreview,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="no-print fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl border border-stone-200 dark:border-zinc-800 w-full max-w-md overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 bg-[#f4f7f4] dark:bg-zinc-950/60 border-b border-[#d8e2d9] dark:border-zinc-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-stone-900 dark:text-zinc-100">
            Експорт родового дерева
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-stone-400 dark:text-zinc-400 hover:text-stone-700 dark:hover:text-zinc-100 hover:bg-stone-200/50 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Options */}
        <div className="p-5 space-y-3">
          {/* 1. Optimized Print / PDF */}
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenPrintPreview();
            }}
            className="w-full p-3.5 rounded-xl border-2 border-purple-200 dark:border-purple-800/70 bg-purple-50/40 dark:bg-purple-950/30 hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-950/50 text-left transition-all group flex items-start gap-3 cursor-pointer"
          >
            <div className="p-2 rounded-lg bg-purple-600 text-white shrink-0 shadow-2xs">
              <Printer size={18} />
            </div>
            <div className="flex-1">
              <div className="text-xs font-bold text-stone-900 dark:text-zinc-100 group-hover:text-purple-950 dark:group-hover:text-purple-200 flex items-center gap-1.5 flex-wrap">
                <span>Сформувати дерево для друку (PDF)</span>
                <span className="text-[10px] text-purple-800 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/60 px-1.5 py-0.2 rounded font-semibold inline-flex items-center gap-1">
                  <Sparkles size={10} />
                  Оптимізація + PDF
                </span>
              </div>
              <p className="text-[11px] text-stone-600 dark:text-zinc-400 mt-0.5">
                Автоматично вирівнює полотно, вбудовує фото, підбирає орієнтацію аркуша та формує чистий PDF без зайвих панелей.
              </p>
            </div>
          </button>

          {/* 2. Download JSON */}
          <button
            type="button"
            onClick={() => {
              downloadTreeJson(tree);
              onClose();
            }}
            className="w-full p-3.5 rounded-xl border border-stone-200 dark:border-zinc-800 hover:border-emerald-600 dark:hover:border-emerald-600 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/30 text-left transition-all group flex items-start gap-3 cursor-pointer"
          >
            <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 shrink-0">
              <Download size={18} />
            </div>
            <div>
              <div className="text-xs font-semibold text-stone-900 dark:text-zinc-100 group-hover:text-emerald-900 dark:group-hover:text-emerald-300 flex items-center gap-1.5">
                <span>Файл проєкту (.json)</span>
                <span className="text-[10px] text-emerald-700 dark:text-emerald-300 bg-emerald-100/70 dark:bg-emerald-950/70 px-1.5 py-0.2 rounded font-normal">
                  Рекомендовано для редагування
                </span>
              </div>
              <p className="text-[11px] text-stone-500 dark:text-zinc-400 mt-0.5">
                Зберігає всі картки, родинні зв'язки, фотографії та точні координати для відкриття пізніше.
              </p>
            </div>
          </button>

          {/* 3. Download GEDCOM (.ged) */}
          <button
            type="button"
            onClick={() => {
              downloadGedcomFile(tree);
              onClose();
            }}
            className="w-full p-3.5 rounded-xl border border-stone-200 dark:border-zinc-800 hover:border-emerald-600 dark:hover:border-emerald-600 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/30 text-left transition-all group flex items-start gap-3 cursor-pointer"
          >
            <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-950/70 text-indigo-800 dark:text-indigo-300 shrink-0">
              <FileCode size={18} />
            </div>
            <div>
              <div className="text-xs font-semibold text-stone-900 dark:text-zinc-100 group-hover:text-indigo-900 dark:group-hover:text-indigo-300 flex items-center gap-1.5">
                <span>Стандарт GEDCOM (.ged)</span>
                <span className="text-[10px] text-indigo-700 dark:text-indigo-300 bg-indigo-100/70 dark:bg-indigo-950/70 px-1.5 py-0.2 rounded font-normal">
                  Для інших ген. програм
                </span>
              </div>
              <p className="text-[11px] text-stone-500 dark:text-zinc-400 mt-0.5">
                Міжнародний формат генеалогічних даних для відкриття в MyHeritage, Gramps, Ancestry тощо.
              </p>
            </div>
          </button>

          {/* 4. Export PNG */}
          <button
            type="button"
            onClick={() => {
              onExportPng();
              onClose();
            }}
            className="w-full p-3.5 rounded-xl border border-stone-200 dark:border-zinc-800 hover:border-emerald-600 dark:hover:border-emerald-600 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/30 text-left transition-all group flex items-start gap-3 cursor-pointer"
          >
            <div className="p-2 rounded-lg bg-sky-100 dark:bg-sky-950/70 text-sky-800 dark:text-sky-300 shrink-0">
              <ImageIcon size={18} />
            </div>
            <div>
              <div className="text-xs font-semibold text-stone-900 dark:text-zinc-100 group-hover:text-sky-900 dark:group-hover:text-sky-300">
                Зображення високої чіткості (.png)
              </div>
              <p className="text-[11px] text-stone-500 dark:text-zinc-400 mt-0.5">
                Готова фотографія вашого генеалогічного дерева для друку або надсилання рідним.
              </p>
            </div>
          </button>

          {/* 5. Export SVG */}
          <button
            type="button"
            onClick={() => {
              onExportSvg();
              onClose();
            }}
            className="w-full p-3.5 rounded-xl border border-stone-200 dark:border-zinc-800 hover:border-emerald-600 dark:hover:border-emerald-600 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/30 text-left transition-all group flex items-start gap-3 cursor-pointer"
          >
            <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 shrink-0">
              <Download size={18} />
            </div>
            <div>
              <div className="text-xs font-semibold text-stone-900 dark:text-zinc-100 group-hover:text-amber-900 dark:group-hover:text-amber-300">
                Векторний файл (.svg)
              </div>
              <p className="text-[11px] text-stone-500 dark:text-zinc-400 mt-0.5">
                Масштабований вектор без втрати якості на будь-якому розмірі (для плакатів та банерів).
              </p>
            </div>
          </button>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-stone-50 dark:bg-zinc-950/60 border-t border-stone-200 dark:border-zinc-800 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-stone-700 dark:text-zinc-300 hover:bg-stone-200/60 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
          >
            Закрити
          </button>
        </div>
      </div>
    </div>
  );
};
