import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Person, BRANCH_LINK_COLOR_PRESETS } from '../types/tree';
import { CreateGhostCardInput, CreateBlankScreenshotCardInput } from '../utils/treeMutations';
import { uploadFileToServerDetailed } from '../utils/fileStorage';
import { formatCardId, getPersonIdMatchScore } from '../utils/cardIdUtils';
import { buildBranchOptions, getClanName } from '../utils/lineageUtils';
import { CARD_WIDTH, CARD_HEIGHT } from '../utils/treeLayout';
import {
  X,
  ImagePlus,
  StickyNote,
  ArrowUpRight,
  Sparkles,
  Search,
  Upload,
  Trash2,
  ClipboardPaste,
  Loader2,
  AlertCircle,
} from 'lucide-react';

export type QuickDraftMode = 'ghost' | 'screenshot';

interface QuickDraftModalProps {
  isOpen: boolean;
  initialMode?: QuickDraftMode;
  allPersons: Record<string, Person>;
  initialCoords?: { x: number; y: number } | null;
  onClose: () => void;
  onCreateGhost: (data: CreateGhostCardInput) => void;
  onCreateBlankScreenshot: (data: CreateBlankScreenshotCardInput) => void;
}

const GHOST_COLOR_PRESETS = [
  { name: 'Жовтий стікер', hex: '#fef3c7' },
  { name: 'Кремовий', hex: '#fef9c3' },
  { name: 'Мʼятний', hex: '#dcfce7' },
  { name: 'Блакитний', hex: '#e0f2fe' },
  { name: 'Бузковий', hex: '#f3e8ff' },
  { name: 'Рожевий', hex: '#ffe4e6' },
] as const;

const GHOST_NOTE_TEMPLATES = [
  'Хрещений батько',
  'Хрещена мати',
  'Свідок шлюбу',
  'Ймовірний брат / сестра',
  'Згадка у метриці',
] as const;

export const QuickDraftModal: React.FC<QuickDraftModalProps> = ({
  isOpen,
  initialMode = 'ghost',
  allPersons,
  initialCoords,
  onClose,
  onCreateGhost,
  onCreateBlankScreenshot,
}) => {
  const [mode, setMode] = useState<QuickDraftMode>(initialMode);

  // Shared fields
  const [titleOrFirstName, setTitleOrFirstName] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [notes, setNotes] = useState('');

  // Sticky note fields
  const [cardBgColor, setCardBgColor] = useState<string>(GHOST_COLOR_PRESETS[0].hex);

  // Screenshot-specific fields
  const [screenshotUrl, setScreenshotUrl] = useState<string>('');
  const [screenshotFit, setScreenshotFit] = useState<'cover' | 'contain'>('cover');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Shared optional hint arrow picker
  const [hintBranch, setHintBranch] = useState('__ALL__');
  const [hintSearch, setHintSearch] = useState('');
  const [hintTargetId, setHintTargetId] = useState('');
  const [hintLabel, setHintLabel] = useState('');
  const [hintColor] = useState<string>(BRANCH_LINK_COLOR_PRESETS[0].hex);

  const [error, setError] = useState<string | null>(null);

  const branchOptions = useMemo(() => buildBranchOptions(allPersons), [allPersons]);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setTitleOrFirstName('');
      setBirthYear('');
      setNotes('');
      setCardBgColor(GHOST_COLOR_PRESETS[0].hex);
      setScreenshotUrl('');
      setScreenshotFit('cover');
      setIsUploading(false);
      setUploadProgress(null);
      setIsDragging(false);
      setHintBranch(branchOptions.length === 1 ? branchOptions[0].name : '__ALL__');
      setHintSearch('');
      setHintTargetId('');
      setHintLabel('');
      setError(null);
    }
  }, [isOpen, initialMode, branchOptions]);

  const handleUploadImageFile = useCallback(async (file: File) => {
    setError(null);
    setIsUploading(true);
    setUploadProgress(5);
    try {
      const res = await uploadFileToServerDetailed(file, {
        onProgress: (pct) => setUploadProgress(pct),
      });
      setScreenshotUrl(res.url);
    } catch (err) {
      setError((err as Error)?.message || 'Не вдалося завантажити фото.');
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    const onPaste = (e: ClipboardEvent) => {
      if (mode !== 'screenshot') return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          if (blob) {
            e.preventDefault();
            const ext = item.type.split('/')[1] || 'png';
            const file = new File([blob], `screenshot-${Date.now()}.${ext}`, { type: item.type });
            void handleUploadImageFile(file);
            return;
          }
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('paste', onPaste);
    };
  }, [isOpen, mode, onClose, handleUploadImageFile]);

  const sortedPersons = useMemo(() => {
    const rawQ = hintSearch.trim();
    const q = rawQ.toLowerCase();
    return Object.values(allPersons)
      .filter((p) => {
        if (hintBranch && hintBranch !== '__ALL__' && getClanName(p) !== hintBranch) {
          return false;
        }
        if (!q) return true;
        if (getPersonIdMatchScore(p, rawQ) > 0) return true;
        const text = `${p.firstName} ${p.lastName} ${p.maidenName || ''} ${p.nickname || ''} ${p.yearsDisplay || ''} ${getClanName(p)}`.toLowerCase();
        return text.includes(q);
      })
      .sort((a, b) => {
        if (rawQ) {
          const sa = getPersonIdMatchScore(a, rawQ);
          const sb = getPersonIdMatchScore(b, rawQ);
          if (sa !== sb) return sb - sa;
        }
        return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'uk');
      });
  }, [allPersons, hintBranch, hintSearch]);

  if (!isOpen) return null;

  const submitForm = () => {
    if (mode === 'screenshot') {
      if (isUploading) return;
      onCreateBlankScreenshot({
        screenshotUrl: screenshotUrl || undefined,
        screenshotFit,
        title: titleOrFirstName.trim() || 'Нерозшифрований запис',
        birthYear: birthYear.trim() || undefined,
        notes: notes.trim() || undefined,
        x: initialCoords?.x,
        y: initialCoords?.y,
        hintTargetPersonId: hintTargetId || undefined,
        hintLabel: hintLabel.trim() || undefined,
        hintColor,
      });
      onClose();
      return;
    }

    if (!titleOrFirstName.trim() && !notes.trim()) {
      setError('Введіть текст нотатки або заголовок стікера.');
      return;
    }

    onCreateGhost({
      firstName: titleOrFirstName.trim() || 'Нотатка',
      lastName: undefined,
      gender: 'unknown',
      birthYear: /^\d{4}$/.test(birthYear.trim()) ? birthYear.trim() : undefined,
      yearsDisplay: birthYear.trim() || undefined,
      ghostNote: notes.trim() || undefined,
      cardBgColor,
      x: initialCoords?.x,
      y: initialCoords?.y,
      hintTargetPersonId: hintTargetId || undefined,
      hintLabel: hintLabel.trim() || undefined,
      hintColor: mode === 'ghost' ? '#d97706' : hintColor,
    });
    onClose();
  };

  const handleApplyNoteTemplate = (tpl: string) => {
    setError(null);
    setNotes((prev) => {
      const clean = prev.trim();
      if (!clean) return `${tpl}. `;
      if (clean.toLowerCase().includes(tpl.toLowerCase())) return prev;
      return `${clean}\n${tpl}`;
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/55 z-50 flex items-center justify-center p-3 sm:p-4 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-stone-200 dark:border-zinc-800 w-full max-w-xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header + Segmented Mode Switcher */}
        <div className="px-4 sm:px-5 py-3.5 bg-stone-50 dark:bg-zinc-900/95 border-b border-stone-200 dark:border-zinc-800 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="w-9 h-9 rounded-xl border bg-amber-100 dark:bg-amber-950/60 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300 flex items-center justify-center shrink-0"
              >
                {mode === 'screenshot' ? <ImagePlus size={18} /> : <StickyNote size={18} />}
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-stone-900 dark:text-zinc-100 leading-tight">
                  {mode === 'screenshot' ? 'Картка-фото на полотні' : 'Нотатка (стікер) на полотні'}
                </h3>
                <p className="text-[11px] text-stone-500 dark:text-zinc-400 mt-0.5 leading-snug">
                  {mode === 'screenshot'
                    ? 'Картка для архівного фото чи нерозшифрованого запису'
                    : 'Стікер для факту, гіпотези чи згадки — звʼязки малюються пунктиром'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 sm:w-8 sm:h-8 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-zinc-200 hover:bg-stone-200/50 dark:hover:bg-zinc-800 transition-colors cursor-pointer shrink-0 flex items-center justify-center"
              aria-label="Закрити"
            >
              <X size={18} />
            </button>
          </div>

          <div className="grid grid-cols-2 p-1 rounded-xl bg-stone-200/75 dark:bg-zinc-800 border border-stone-200 dark:border-zinc-700">
            <button
              type="button"
              onClick={() => {
                setMode('ghost');
                setError(null);
              }}
              className={`py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                mode === 'ghost'
                  ? 'bg-amber-50 dark:bg-zinc-900 text-amber-950 dark:text-amber-300 shadow-xs'
                  : 'text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-200'
              }`}
            >
              <StickyNote size={14} />
              <span>Нотатка (стікер)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('screenshot');
                setError(null);
              }}
              className={`py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                mode === 'screenshot'
                  ? 'bg-white dark:bg-zinc-900 text-amber-950 dark:text-amber-300 shadow-xs'
                  : 'text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-200'
              }`}
            >
              <ImagePlus size={14} />
              <span>Картка-фото (скріншот)</span>
            </button>
          </div>
        </div>

        {/* Body */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitForm();
          }}
          className="p-4 sm:p-5 space-y-4 overflow-y-auto"
        >
          {error && (
            <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-200 flex items-start gap-2">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Screenshot upload & preview */}
          {mode === 'screenshot' && (
            <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-4 items-center">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  style={{ width: `${CARD_WIDTH}px`, height: `${CARD_HEIGHT}px` }}
                  className={`relative rounded-2xl overflow-hidden shadow-md flex items-center justify-center ${
                    screenshotUrl
                      ? 'border border-stone-300 dark:border-zinc-700 bg-zinc-900'
                      : 'border-2 border-dashed border-stone-300 dark:border-zinc-600 bg-stone-50 dark:bg-zinc-800/70'
                  }`}
                >
                  {screenshotUrl ? (
                    <img
                      src={screenshotUrl}
                      alt="Попередній перегляд фото"
                      className={`w-full h-full ${screenshotFit === 'contain' ? 'object-contain' : 'object-cover'}`}
                    />
                  ) : (
                    <div className="p-3 text-center flex flex-col items-center gap-1.5 text-stone-400 dark:text-zinc-500">
                      <ImagePlus size={22} />
                      <span className="text-[10px] font-medium leading-tight">Порожня картка</span>
                    </div>
                  )}
                </div>

                <div className="inline-flex items-center p-0.5 rounded-lg bg-stone-100 dark:bg-zinc-800 border border-stone-200 dark:border-zinc-700">
                  <button
                    type="button"
                    onClick={() => setScreenshotFit('cover')}
                    className={`px-2 py-1 rounded-md text-[10.5px] font-semibold transition-colors cursor-pointer ${
                      screenshotFit === 'cover'
                        ? 'bg-white dark:bg-zinc-900 text-stone-900 dark:text-zinc-100 shadow-2xs'
                        : 'text-stone-500 dark:text-zinc-400'
                    }`}
                  >
                    Заповнити
                  </button>
                  <button
                    type="button"
                    onClick={() => setScreenshotFit('contain')}
                    className={`px-2 py-1 rounded-md text-[10.5px] font-semibold transition-colors cursor-pointer ${
                      screenshotFit === 'contain'
                        ? 'bg-white dark:bg-zinc-900 text-stone-900 dark:text-zinc-100 shadow-2xs'
                        : 'text-stone-500 dark:text-zinc-400'
                    }`}
                  >
                    Цілком
                  </button>
                </div>
              </div>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) void handleUploadImageFile(file);
                }}
                className={`rounded-2xl border-2 border-dashed p-4 text-center transition-all flex flex-col items-center justify-center gap-2.5 min-h-[160px] ${
                  isDragging
                    ? 'border-amber-500 bg-amber-50/70 dark:bg-amber-950/30'
                    : 'border-stone-300 dark:border-zinc-700 bg-stone-50/70 dark:bg-zinc-800/40'
                }`}
              >
                {isUploading ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 size={24} className="animate-spin text-amber-600" />
                    <span className="text-xs font-semibold text-stone-700 dark:text-zinc-200">
                      Завантаження фото{uploadProgress !== null ? ` (${uploadProgress}%)` : '...'}
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 flex-wrap justify-center">
                      <label className="cursor-pointer inline-flex items-center gap-1.5 h-10 sm:h-auto px-3.5 py-2 rounded-xl bg-stone-900 hover:bg-black dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-semibold shadow-xs transition-colors">
                        <Upload size={14} />
                        <span>{screenshotUrl ? 'Замінити фото' : 'Завантажити фото'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void handleUploadImageFile(file);
                            e.target.value = '';
                          }}
                          className="hidden"
                        />
                      </label>
                      {screenshotUrl && (
                        <button
                          type="button"
                          onClick={() => setScreenshotUrl('')}
                          className="inline-flex items-center gap-1 h-10 sm:h-auto px-2.5 py-2 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 hover:bg-rose-100 text-xs font-semibold transition-colors cursor-pointer"
                        >
                          <Trash2 size={13} />
                          <span>Очистити</span>
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-stone-500 dark:text-zinc-400">
                      <ClipboardPaste size={13} className="text-amber-600 dark:text-amber-400 shrink-0" />
                      <span>Перетягніть файл або натисніть Ctrl+V</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Identity / Sticker Title & Period Fields */}
          {mode === 'ghost' ? (
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_150px] gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-stone-700 dark:text-zinc-300 mb-1">
                  Заголовок стікера (необов&apos;язково)
                </label>
                <input
                  type="text"
                  value={titleOrFirstName}
                  onChange={(e) => {
                    setTitleOrFirstName(e.target.value);
                    setError(null);
                  }}
                  placeholder="напр. Згадка 1908 р. або Брат Івана?"
                  className="w-full h-10 text-xs px-3 py-2 rounded-xl border border-stone-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-stone-900 dark:text-zinc-100"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-stone-700 dark:text-zinc-300 mb-1">
                  Рік / період (необов&apos;язково)
                </label>
                <input
                  type="text"
                  value={birthYear}
                  onChange={(e) => setBirthYear(e.target.value)}
                  placeholder="напр. бл. 1910"
                  className="w-full h-10 text-xs px-3 py-2 rounded-xl border border-stone-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-stone-900 dark:text-zinc-100"
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_130px] gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-stone-700 dark:text-zinc-300 mb-1">
                  Коротка назва для пошуку (необов&apos;язково)
                </label>
                <input
                  type="text"
                  value={titleOrFirstName}
                  onChange={(e) => setTitleOrFirstName(e.target.value)}
                  placeholder="Напр.: Запис №45 — нерозбірливо"
                  className="w-full h-10 text-xs px-3 py-2 rounded-xl border border-stone-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-stone-900 dark:text-zinc-100"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-stone-700 dark:text-zinc-300 mb-1">
                  Рік (якщо відомо)
                </label>
                <input
                  type="text"
                  value={birthYear}
                  onChange={(e) => setBirthYear(e.target.value)}
                  placeholder="напр. 1906"
                  className="w-full h-10 text-xs px-3 py-2 rounded-xl border border-stone-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-stone-900 dark:text-zinc-100"
                />
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-stone-700 dark:text-zinc-300">
              <StickyNote size={12.5} className="text-amber-600 dark:text-amber-400" />
              <span>
                {mode === 'screenshot'
                  ? 'Нотатка / звідки фото (необовʼязково)'
                  : 'Текст нотатки на стікері'}
              </span>
            </label>
            {mode === 'ghost' && (
              <div className="flex flex-wrap gap-1.5">
                {GHOST_NOTE_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl}
                    type="button"
                    onClick={() => handleApplyNoteTemplate(tpl)}
                    className="px-2 py-1 rounded-lg bg-stone-100 hover:bg-amber-50 text-stone-700 hover:text-amber-900 dark:bg-zinc-800 dark:hover:bg-amber-950/40 dark:text-zinc-300 border border-stone-200/80 dark:border-zinc-700 text-[11px] font-medium transition-colors cursor-pointer"
                  >
                    + {tpl}
                  </button>
                ))}
              </div>
            )}
            <textarea
              autoFocus={mode === 'ghost'}
              rows={mode === 'screenshot' ? 2 : 4}
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  e.preventDefault();
                  submitForm();
                }
              }}
              placeholder={
                mode === 'screenshot'
                  ? 'Напр.: Метрична книга 1906 р., аркуш 14 — розшифрувати свідків.'
                  : 'Напр.: Згаданий як хрещений батько у метриці 1908 р., перевірити с. Заріччя.'
              }
              className={`w-full text-xs px-3 py-2.5 rounded-xl border text-stone-900 dark:text-zinc-100 placeholder:text-stone-400 resize-y ${
                mode === 'ghost'
                  ? 'border-amber-300/90 dark:border-amber-800/70 bg-amber-50/75 dark:bg-zinc-950'
                  : 'border-dashed border-stone-300 dark:border-zinc-700 bg-stone-50/60 dark:bg-zinc-950'
              }`}
            />
          </div>

          {/* Sticky Note Color Picker */}
          {mode === 'ghost' && (
            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-[11px] font-semibold text-stone-700 dark:text-zinc-300">
                Колір стікера:
              </span>
              <div className="flex items-center gap-2">
                {GHOST_COLOR_PRESETS.map((c) => {
                  const active = cardBgColor.toLowerCase() === c.hex.toLowerCase();
                  return (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => setCardBgColor(c.hex)}
                      style={{ backgroundColor: c.hex }}
                      className={`w-6 h-6 rounded-md border transition-transform hover:scale-110 cursor-pointer ${
                        active
                          ? 'ring-2 ring-amber-600 dark:ring-amber-400 ring-offset-1 border-amber-700'
                          : 'border-stone-300 dark:border-zinc-600'
                      }`}
                      title={c.name}
                      aria-label={c.name}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Shared Optional Link Arrow Picker */}
          {Object.keys(allPersons).length > 0 && (
            <div className="p-3 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-dashed border-amber-300 dark:border-amber-900/60 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-950 dark:text-amber-200">
                  <ArrowUpRight size={13} className="text-amber-600 dark:text-amber-400" />
                  <span>Прив&apos;язати пунктирною лінією до картки (необов&apos;язково)</span>
                </div>
                {hintTargetId && (
                  <button
                    type="button"
                    onClick={() => {
                      setHintTargetId('');
                      setHintLabel('');
                    }}
                    className="text-[10.5px] font-semibold text-indigo-700 dark:text-indigo-300 hover:underline cursor-pointer"
                  >
                    Скинути
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
                  <input
                    type="text"
                    value={hintSearch}
                    onChange={(e) => {
                      const val = e.target.value;
                      setHintSearch(val);
                      const trimmed = val.trim();
                      if (trimmed) {
                        const exact = Object.values(allPersons).find(
                          (p) => getPersonIdMatchScore(p, trimmed) === 3
                        );
                        if (exact) setHintTargetId(exact.id);
                      }
                    }}
                    placeholder="Пошук картки за ID (#12), ПІБ..."
                    className="w-full h-9 text-xs pl-8 pr-2.5 py-1.5 rounded-lg border border-indigo-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-stone-900 dark:text-zinc-100"
                  />
                </div>

                <select
                  value={hintBranch}
                  onChange={(e) => {
                    const nextBranch = e.target.value;
                    setHintBranch(nextBranch);
                    if (
                      nextBranch !== '__ALL__' &&
                      hintTargetId &&
                      allPersons[hintTargetId] &&
                      getClanName(allPersons[hintTargetId]) !== nextBranch
                    ) {
                      setHintTargetId('');
                    }
                  }}
                  className="w-full h-9 text-xs px-2.5 py-1.5 rounded-lg border border-indigo-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-stone-900 dark:text-zinc-100"
                >
                  <option value="__ALL__">Усі гілки ({Object.keys(allPersons).length})</option>
                  {branchOptions.map((b) => (
                    <option key={b.name} value={b.name}>
                      {b.label} ({b.count})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <select
                  value={hintTargetId}
                  onChange={(e) => setHintTargetId(e.target.value)}
                  className="w-full h-9 text-xs px-2.5 py-1.5 rounded-lg border border-indigo-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-stone-900 dark:text-zinc-100"
                >
                  <option value="">— Оберіть картку ({sortedPersons.length}) —</option>
                  {sortedPersons.map((p) => {
                    const pName = [p.firstName, p.lastName].filter(Boolean).join(' ') || 'Без імені';
                    return (
                      <option key={p.id} value={p.id}>
                        {formatCardId(p)} · {pName}
                        {p.yearsDisplay ? ` (${p.yearsDisplay})` : ''}
                      </option>
                    );
                  })}
                </select>
                <input
                  type="text"
                  value={hintLabel}
                  onChange={(e) => setHintLabel(e.target.value)}
                  disabled={!hintTargetId}
                  placeholder={mode === 'screenshot' ? 'Напр.: Можливий запис' : 'Напр.: Можливий брат?'}
                  className="w-full h-9 text-xs px-2.5 py-1.5 rounded-lg border border-indigo-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-stone-900 dark:text-zinc-100 disabled:opacity-50"
                />
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="pt-3 flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 dark:border-zinc-800">
            <span className="inline-flex items-center gap-1 text-[10.5px] text-stone-400 dark:text-zinc-500">
              <Sparkles size={11} />
              <span>Зв&apos;язати можна пізніше перетягуванням</span>
            </span>
            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 text-xs font-medium text-stone-600 dark:text-zinc-300 hover:bg-stone-100 dark:hover:bg-zinc-800 rounded-xl transition-colors cursor-pointer"
              >
                Скасувати
              </button>
              <button
                type="submit"
                disabled={isUploading}
                className={`px-4 py-2 text-xs font-semibold disabled:opacity-50 active:scale-95 rounded-xl shadow-xs transition-all inline-flex items-center gap-1.5 cursor-pointer ${
                  mode === 'screenshot'
                    ? 'text-white bg-stone-900 hover:bg-black dark:bg-emerald-600 dark:hover:bg-emerald-500'
                    : 'text-amber-950 bg-amber-400 hover:bg-amber-500'
                }`}
              >
                {mode === 'screenshot' ? <ImagePlus size={14} /> : <StickyNote size={14} />}
                <span>
                  {mode === 'screenshot'
                    ? screenshotUrl
                      ? 'Створити картку-фото'
                      : 'Створити порожню картку'
                    : 'Додати стікер на полотно'}
                </span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
