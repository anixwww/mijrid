import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ImagePlus,
  Paintbrush,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload,
  X,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import type { CardFrameStyle, Person } from '../types/tree';
import type { ClanInfo } from '../utils/lineageUtils';
import {
  CARD_FRAME_PRESETS,
  GUEST_CARD_COLOR_PRESETS,
  normalizeCardFrame,
} from '../constants/cardFrames';
import { uploadFileToServerDetailed } from '../utils/fileStorage';
import { getAuthToken } from '../utils/auth';
import { isCloudWriteAuthenticated } from '../utils/firestoreTreeService';
import { CARD_HEIGHT, CARD_WIDTH } from '../utils/treeLayout';
import { PersonCardSurface } from './PersonCardSurface';
import { CardFrameOverlay } from './CardFrameOverlay';
import { SilhouetteAvatar } from './SilhouetteAvatar';

interface GuestCustomizeModalProps {
  isOpen: boolean;
  person: Person;
  clanInfo?: ClanInfo;
  onClose: () => void;
  onSave: (patch: {
    avatarUrl: string | null;
    cardBgColor: string | null;
    cardFrame: CardFrameStyle;
  }) => Promise<boolean>;
}

const noop = () => {};

export const GuestCustomizeModal: React.FC<GuestCustomizeModalProps> = ({
  isOpen,
  person,
  clanInfo,
  onClose,
  onSave,
}) => {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(person.avatarUrl || null);
  const [cardBgColor, setCardBgColor] = useState<string | null>(person.cardBgColor || null);
  const [cardFrame, setCardFrame] = useState<CardFrameStyle>(() =>
    normalizeCardFrame(person.cardFrame)
  );
  const [isDraggingPhoto, setIsDraggingPhoto] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setAvatarUrl(person.avatarUrl || null);
      setCardBgColor(person.cardBgColor || null);
      setCardFrame(normalizeCardFrame(person.cardFrame));
      setErrorMsg(null);
      setUploadProgress(null);
      setIsUploading(false);
      setIsSaving(false);
    }
  }, [isOpen, person.id, person.avatarUrl, person.cardBgColor, person.cardFrame]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSaving) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, isSaving, onClose]);

  const previewPerson = useMemo<Person>(() => {
    return {
      ...person,
      avatarUrl: avatarUrl || undefined,
      cardBgColor: cardBgColor || undefined,
      cardFrame: cardFrame !== 'none' ? cardFrame : undefined,
    };
  }, [person, avatarUrl, cardBgColor, cardFrame]);

  if (!isOpen) return null;

  const fullName =
    [person.firstName, person.lastName].filter(Boolean).join(' ').trim() || 'Ваша картка';

  const convertGuestRasterToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const maxDim = 512;
          const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
          const targetW = Math.max(1, Math.round((img.width || maxDim) * scale));
          const targetH = Math.max(1, Math.round((img.height || maxDim) * scale));
          const canvas = document.createElement('canvas');
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            URL.revokeObjectURL(objectUrl);
            reject(new Error('Не вдалося обробити зображення у браузері.'));
            return;
          }
          ctx.drawImage(img, 0, 0, targetW, targetH);
          URL.revokeObjectURL(objectUrl);
          let dataUrl = canvas.toDataURL('image/webp', 0.85);
          if (!dataUrl.startsWith('data:image/webp')) {
            dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          }
          resolve(dataUrl);
        } catch (err) {
          URL.revokeObjectURL(objectUrl);
          reject(err);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Не вдалося прочитати вибране зображення.'));
      };
      img.src = objectUrl;
    });
  };

  const handleUploadFile = async (file: File) => {
    const isSvg =
      file.type.toLowerCase().includes('svg') || /\.svg$/i.test(file.name);
    if (isSvg) {
      setErrorMsg('Формат SVG заборонено з міркувань безпеки. Виберіть JPG, PNG або WebP.');
      return;
    }
    const isRasterImage =
      file.type.startsWith('image/') ||
      /\.(jpg|jpeg|png|webp|gif|avif|bmp|heic|heif)$/i.test(file.name);
    if (!isRasterImage) {
      setErrorMsg('Оберіть растрове зображення (JPG, PNG, WebP).');
      return;
    }

    setErrorMsg(null);
    setIsUploading(true);
    setUploadProgress(15);
    try {
      if (isCloudWriteAuthenticated() || getAuthToken()) {
        const res = await uploadFileToServerDetailed(file, {
          kind: 'avatar',
          onProgress: (pct) => setUploadProgress(pct),
        });
        setAvatarUrl(res.url);
      } else {
        setUploadProgress(55);
        const dataUrl = await convertGuestRasterToDataUrl(file);
        setUploadProgress(100);
        setAvatarUrl(dataUrl);
      }
    } catch (err) {
      setErrorMsg((err as Error)?.message || 'Не вдалося завантажити фото.');
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void handleUploadFile(file);
    }
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingPhoto(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void handleUploadFile(file);
    }
  };

  const handleResetAppearance = () => {
    setCardBgColor(null);
    setCardFrame('none');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isUploading || isSaving) return;
    setErrorMsg(null);
    setIsSaving(true);
    try {
      const ok = await onSave({
        avatarUrl,
        cardBgColor,
        cardFrame,
      });
      if (ok) {
        onClose();
      } else {
        setErrorMsg('Не вдалося зберегти зміни. Перевірте з’єднання та спробуйте ще раз.');
      }
    } catch (err) {
      setErrorMsg((err as Error)?.message || 'Сталася помилка під час збереження.');
    } finally {
      setIsSaving(false);
    }
  };

  const activeColorHex = cardBgColor || clanInfo?.bgColor || '#e8efe9';
  const activeColorPreset = cardBgColor
    ? GUEST_CARD_COLOR_PRESETS.find((c) => c.hex.toLowerCase() === cardBgColor.toLowerCase())
    : null;
  const activeFramePreset =
    CARD_FRAME_PRESETS.find((f) => f.id === cardFrame) || CARD_FRAME_PRESETS[0];

  return (
    <div
      className="fixed inset-0 bg-stone-950/65 z-50 flex items-center justify-center p-3 sm:p-4 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={() => {
        if (!isSaving) onClose();
      }}
    >
      <div
        className="bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-stone-200/90 dark:border-zinc-800 w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col relative animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-600 via-teal-600 to-amber-500" />

        {/* Modal Header */}
        <div className="px-5 sm:px-6 pt-5 pb-4 border-b border-stone-100 dark:border-zinc-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60 flex items-center justify-center shrink-0">
              <Paintbrush size={19} />
            </div>
            <div className="min-w-0">
              <h3 className="text-base sm:text-lg font-extrabold text-stone-900 dark:text-zinc-100 tracking-tight truncate">
                Оформлення вашої картки
              </h3>
              <p className="text-xs text-stone-500 dark:text-zinc-400 truncate mt-0.5">
                {fullName} — виберіть світлину, колір та декоративну рамку
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={isSaving}
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-stone-100 dark:bg-zinc-800 text-stone-500 hover:text-stone-800 dark:hover:text-zinc-200 flex items-center justify-center transition-colors cursor-pointer shrink-0 disabled:opacity-50"
            aria-label="Закрити"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
          {/* Left: Live Card Preview */}
          <div className="md:w-[250px] shrink-0 bg-[#f6f7f4] dark:bg-zinc-950/60 border-b md:border-b-0 md:border-r border-stone-200/80 dark:border-zinc-800 p-4 sm:p-5 flex flex-col items-center justify-between gap-4">
            <div className="w-full flex flex-col items-center">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-zinc-400 mb-3">
                Живий вигляд на полотні
              </span>

              <div className="w-full rounded-2xl border border-stone-200/90 dark:border-zinc-800 bg-[#f8faf8] dark:bg-[#111315] canvas-grid-pattern py-6 px-4 flex items-center justify-center">
                <div
                  style={{
                    width: `${CARD_WIDTH}px`,
                    height: `${CARD_HEIGHT}px`,
                  }}
                  className="transform scale-[1.12] origin-center pointer-events-none select-none"
                >
                  <PersonCardSurface
                    person={previewPerson}
                    isSelected={false}
                    isCurrentUser={true}
                    isAdmin={false}
                    clanInfo={clanInfo}
                    onClick={noop}
                    onDoubleClick={noop}
                    onMouseDown={noop}
                  />
                </div>
              </div>
            </div>

            <div className="w-full space-y-2 text-center">
              <div className="text-[11px] text-stone-500 dark:text-zinc-400 leading-snug">
                Рамка:{' '}
                <strong className="text-stone-800 dark:text-zinc-200">
                  {activeFramePreset.name}
                </strong>
                {' · '}
                Колір:{' '}
                <strong className="text-stone-800 dark:text-zinc-200">
                  {cardBgColor
                    ? activeColorPreset?.name || cardBgColor.toUpperCase()
                    : clanInfo
                    ? `Рід (${clanInfo.name})`
                    : 'Стандартний'}
                </strong>
              </div>

              {(cardBgColor || cardFrame !== 'none') && (
                <button
                  type="button"
                  onClick={handleResetAppearance}
                  className="inline-flex items-center gap-1.5 text-[11px] font-medium text-stone-500 hover:text-stone-800 dark:text-zinc-400 dark:hover:text-zinc-200 cursor-pointer py-1 px-2 rounded-lg hover:bg-stone-200/60 dark:hover:bg-zinc-800 transition-colors"
                >
                  <RotateCcw size={12} />
                  <span>Скинути колір і рамку</span>
                </button>
              )}
            </div>
          </div>

          {/* Right: Controls */}
          <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-6">
            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/70 text-rose-800 dark:text-rose-200 text-xs flex items-start gap-2">
                <AlertCircle size={15} className="shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Section 1: Avatar */}
            <section className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-zinc-300 flex items-center gap-1.5">
                  <ImagePlus size={14} className="text-emerald-700 dark:text-emerald-400" />
                  <span>1. Аватарка (фото профілю)</span>
                </h4>
                {avatarUrl && (
                  <button
                    type="button"
                    onClick={() => setAvatarUrl(null)}
                    disabled={isUploading}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-600 dark:text-rose-400 hover:underline cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 size={12} />
                    <span>Прибрати фото</span>
                  </button>
                )}
              </div>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingPhoto(true);
                }}
                onDragLeave={() => setIsDraggingPhoto(false)}
                onDrop={handleDrop}
                className={`rounded-2xl border-2 border-dashed p-3.5 flex items-center gap-4 transition-colors ${
                  isDraggingPhoto
                    ? 'border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/30'
                    : 'border-stone-200 dark:border-zinc-700 bg-stone-50/70 dark:bg-zinc-800/40'
                }`}
              >
                <div className="shrink-0">
                  <SilhouetteAvatar
                    gender={person.gender}
                    avatarUrl={avatarUrl || undefined}
                    name={fullName}
                    size="lg"
                  />
                </div>

                <div className="min-w-0 flex-1 space-y-2">
                  <div className="text-xs text-stone-700 dark:text-zinc-300 leading-snug">
                    {isUploading
                      ? `Завантаження світлини... ${uploadProgress ?? ''}%`
                      : 'Перетягніть фото сюди або виберіть файл з пристрою (JPG, PNG, WebP).'}
                  </div>

                  {isUploading && uploadProgress !== null && (
                    <div className="h-1.5 w-full rounded-full bg-stone-200 dark:bg-zinc-700 overflow-hidden">
                      <div
                        className="h-full bg-emerald-600 transition-all duration-200"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={isUploading}
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-zinc-800 border border-stone-300 dark:border-zinc-600 hover:border-emerald-600 text-xs font-semibold text-stone-800 dark:text-zinc-100 shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <Upload size={13} className="text-emerald-700 dark:text-emerald-400" />
                      <span>{avatarUrl ? 'Змінити фото' : 'Завантажити фото'}</span>
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif,image/avif,image/bmp"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* Section 2: Card Background Color */}
            <section className="space-y-2.5 pt-2 border-t border-stone-100 dark:border-zinc-800">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-zinc-300 flex items-center gap-1.5">
                  <Paintbrush size={14} className="text-emerald-700 dark:text-emerald-400" />
                  <span>2. Колір картки</span>
                </h4>
                {cardBgColor && (
                  <button
                    type="button"
                    onClick={() => setCardBgColor(null)}
                    className="text-[11px] font-medium text-stone-500 hover:text-stone-800 dark:text-zinc-400 dark:hover:text-zinc-200 hover:underline cursor-pointer"
                  >
                    Повернути колір роду
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {GUEST_CARD_COLOR_PRESETS.map((preset) => {
                  const isActive =
                    Boolean(cardBgColor) &&
                    cardBgColor!.toLowerCase() === preset.hex.toLowerCase();
                  return (
                    <button
                      key={preset.hex}
                      type="button"
                      onClick={() => setCardBgColor(preset.hex)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                        isActive
                          ? 'border-emerald-700 dark:border-emerald-400 bg-emerald-50/70 dark:bg-emerald-950/50 text-emerald-950 dark:text-emerald-100 ring-1 ring-emerald-600/30'
                          : 'border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/80 text-stone-700 dark:text-zinc-300 hover:border-stone-400'
                      }`}
                    >
                      <span
                        className="w-4 h-4 rounded-full border border-black/15 shrink-0 flex items-center justify-center"
                        style={{ backgroundColor: preset.hex }}
                      >
                        {isActive && <Check size={10} className="text-stone-900" strokeWidth={3} />}
                      </span>
                      <span>{preset.name}</span>
                    </button>
                  );
                })}

                <label
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-dashed border-stone-300 dark:border-zinc-600 bg-stone-50 dark:bg-zinc-800/70 hover:border-emerald-600 text-xs font-medium text-stone-700 dark:text-zinc-300 cursor-pointer transition-colors"
                  title="Обрати власний відтінок"
                >
                  <input
                    type="color"
                    value={activeColorHex}
                    onChange={(e) => setCardBgColor(e.target.value)}
                    className="w-4 h-4 rounded border-0 p-0 bg-transparent cursor-pointer"
                  />
                  <span>Свій колір</span>
                </label>
              </div>
            </section>

            {/* Section 3: Outer Card Frames */}
            <section className="space-y-2.5 pt-2 border-t border-stone-100 dark:border-zinc-800">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-zinc-300 flex items-center gap-1.5">
                  <Sparkles size={14} className="text-amber-600 dark:text-amber-400" />
                  <span>3. Зовнішня рамка картки</span>
                </h4>
                <span className="text-[11px] text-stone-400 dark:text-zinc-500">
                  {CARD_FRAME_PRESETS.length} варіантів
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {CARD_FRAME_PRESETS.map((preset) => {
                  const isActive = cardFrame === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setCardFrame(preset.id)}
                      className={`p-2.5 rounded-2xl border text-left flex items-center gap-3 transition-all cursor-pointer ${
                        isActive
                          ? 'border-emerald-700 dark:border-emerald-400 bg-emerald-50/75 dark:bg-emerald-950/50 ring-1 ring-emerald-600/30 shadow-xs'
                          : 'border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-800/60 hover:border-stone-400 dark:hover:border-zinc-600'
                      }`}
                    >
                      {/* Miniature frame sample */}
                      <div className="relative w-11 h-12 shrink-0 flex items-center justify-center">
                        <div
                          className="relative w-9 h-10 rounded-xl border border-stone-300/90 dark:border-zinc-600 shadow-2xs flex flex-col items-center justify-center gap-1"
                          style={{ backgroundColor: activeColorHex }}
                        >
                          <CardFrameOverlay frame={preset.id} compact />
                          <span className="w-3.5 h-3.5 rounded-full bg-stone-800/15 dark:bg-white/20" />
                          <span className="w-5 h-1 rounded-full bg-stone-800/20 dark:bg-white/25" />
                        </div>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="text-xs font-bold text-stone-900 dark:text-zinc-100 truncate">
                            {preset.name}
                          </span>
                          {isActive && (
                            <span className="w-4 h-4 rounded-full bg-emerald-700 text-white flex items-center justify-center shrink-0">
                              <Check size={10} strokeWidth={3} />
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-stone-500 dark:text-zinc-400 leading-snug mt-0.5 line-clamp-2">
                          {preset.subtitle}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>

          {/* Sticky Footer */}
          <div className="md:hidden px-4 py-3 border-t border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-end gap-2 shrink-0">
            <button
              type="button"
              disabled={isSaving}
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-stone-300 dark:border-zinc-700 text-xs font-semibold text-stone-700 dark:text-zinc-300 hover:bg-stone-100 dark:hover:bg-zinc-800 cursor-pointer"
            >
              Скасувати
            </button>
            <button
              type="submit"
              disabled={isUploading || isSaving}
              className="px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
            >
              {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              <span>{isSaving ? 'Збереження...' : 'Зберегти оформлення'}</span>
            </button>
          </div>
        </form>

        {/* Desktop Footer */}
        <div className="hidden md:flex px-6 py-3.5 border-t border-stone-100 dark:border-zinc-800 bg-stone-50/70 dark:bg-zinc-900/90 items-center justify-between gap-3 shrink-0">
          <span className="text-[11px] text-stone-500 dark:text-zinc-400">
            Зміни збережуться на сервері й одразу стануть видимими на дереві
          </span>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              disabled={isSaving}
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-stone-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-semibold text-stone-700 dark:text-zinc-300 hover:bg-stone-100 dark:hover:bg-zinc-700 transition-colors cursor-pointer disabled:opacity-50"
            >
              Скасувати
            </button>
            <button
              type="button"
              disabled={isUploading || isSaving}
              onClick={(e) => {
                void handleSubmit(e as unknown as React.FormEvent);
              }}
              className="px-5 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 active:bg-emerald-950 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-md shadow-emerald-900/15 transition-colors cursor-pointer disabled:opacity-50"
            >
              {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              <span>{isSaving ? 'Збереження...' : 'Зберегти оформлення'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
