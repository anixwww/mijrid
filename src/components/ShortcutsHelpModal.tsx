import React from 'react';
import { X, Keyboard, Command, MousePointer, ZoomIn, Search, Sparkles, Layers } from 'lucide-react';

interface ShortcutsHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShortcutsHelpModal: React.FC<ShortcutsHelpModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const shortcuts = [
    {
      category: 'Навігація та полотно',
      items: [
        { keys: ['Затиснути й тягнути'], desc: 'Переміщення по полотну дерева (панорамування)' },
        { keys: ['Коліщатко миші'], desc: 'Плавне збільшення або зменшення масштабу' },
        { keys: ['Подвійний клік на полі'], desc: 'Швидке додавання нової особи на це місце' },
        { keys: ['Подвійний клік на картці'], desc: 'Відкрити вікно редагування даних особи' },
      ],
    },
    {
      category: 'Гарячі клавіші',
      items: [
        { keys: ['Ctrl', 'Z'], desc: 'Скасувати останню дію (до 35 кроків назад)' },
        { keys: ['Ctrl', 'F'], alt: ['/'], desc: 'Швидкий розумний пошук особи, року чи дому' },
        { keys: ['Ctrl', 'Alt', 'L'], desc: 'Автоматичне впорядкування дерева (покоління, радіальне)' },
        { keys: ['Ctrl', 'Alt', 'A'], desc: 'Панель аналітики, статистики та демографії роду' },
        { keys: ['Ctrl', 'Клік'], desc: 'Виділення декількох карток для вирівнювання або переміщення' },
        { keys: ['Ctrl', 'Тягнути поле'], desc: 'Прямокутне рамкове виділення групи карток' },
        { keys: ['← ↑ → ↓'], desc: 'Точний ручний зсув обраної картки на 1px (+Shift: 10px)' },
        { keys: ['Esc'], desc: 'Зняти виділення / закрити вікно пошуку чи модальне вікно' },
      ],
    },
    {
      category: 'Зв’язки, вирівнювання та фіксація',
      items: [
        { keys: ['Alt', 'Перетягування'], desc: 'Вільне переміщення картки без магнітного вирівнювання' },
        { keys: ['Затиснути картку 0.4с'], desc: 'Режим ручного зв’язку (провести лінію до іншої особи)' },
        { keys: ['Клік по лінії'], desc: 'Налаштування типу зв’язку (шлюб, розлучення, дата, джерело)' },
        { keys: ['Заморозити'], desc: 'Захист положення карток від випадкових зсувів мишею' },
      ],
    },
  ];

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-stone-200 dark:border-zinc-800 w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 bg-stone-50 dark:bg-zinc-950/60 border-b border-stone-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-700 text-white flex items-center justify-center shadow-xs">
              <Keyboard size={16} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-stone-900 dark:text-zinc-100 leading-tight">
                Гарячі клавіші та керування
              </h3>
              <p className="text-[11px] text-stone-500 dark:text-zinc-400">
                Зручні комбінації для швидкої роботи з родоводом
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-stone-400 dark:text-zinc-400 hover:text-stone-700 dark:hover:text-zinc-100 hover:bg-stone-200/50 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            aria-label="Закрити"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs divide-y divide-stone-100 dark:divide-zinc-800">
          {shortcuts.map((group, idx) => (
            <div key={group.category} className={idx > 0 ? 'pt-3 space-y-2' : 'space-y-2'}>
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-stone-400 dark:text-zinc-500">
                {group.category}
              </h4>
              <div className="space-y-1.5">
                {group.items.map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-3 py-1 px-2 rounded-lg hover:bg-stone-50 dark:hover:bg-zinc-800/70"
                  >
                    <span className="text-stone-700 dark:text-zinc-200 font-medium">{item.desc}</span>
                    <div className="flex items-center gap-1 shrink-0 font-mono">
                      {item.keys.map((k, ki) => (
                        <kbd
                          key={ki}
                          className="px-2 py-0.5 rounded-md bg-stone-100 dark:bg-zinc-800 border border-stone-300 dark:border-zinc-700 text-stone-800 dark:text-zinc-200 text-[10.5px] font-semibold shadow-2xs"
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-stone-50 dark:bg-zinc-950/60 border-t border-stone-200 dark:border-zinc-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
          >
            Зрозуміло
          </button>
        </div>
      </div>
    </div>
  );
};
