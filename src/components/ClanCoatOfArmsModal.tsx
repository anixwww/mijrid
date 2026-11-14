import React, { useState, useEffect } from 'react';
import { Shield, Upload, X, Trash2, RefreshCw } from 'lucide-react';
import { ClanInfo } from '../utils/lineageUtils';
import { uploadFileToServer } from '../utils/fileStorage';
import { getResolvedMediaSrc, handleUploadImageError } from '../utils/mediaSync';
import { FirebasePhotoAuthBanner } from './FirebasePhotoAuthBanner';

interface ClanCoatOfArmsModalProps {
  isOpen: boolean;
  onClose: () => void;
  clan: ClanInfo;
  isAdmin: boolean;
  onSaveCoatOfArms: (
    clanName: string,
    coatOfArmsData: { url: string; motto?: string; description?: string } | null
  ) => void;
}

export const ClanCoatOfArmsModal: React.FC<ClanCoatOfArmsModalProps> = ({
  isOpen,
  onClose,
  clan,
  isAdmin,
  onSaveCoatOfArms,
}) => {
  const [motto, setMotto] = useState(clan.coatOfArmsMotto || `РІД ${clan.name.toUpperCase()}`);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(clan.coatOfArmsUrl || null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setMotto(clan.coatOfArmsMotto || `РІД ${clan.name.toUpperCase()}`);
      setPreviewUrl(clan.coatOfArmsUrl || null);
      setErrorMsg(null);
    }
  }, [isOpen, clan]);

  if (!isOpen) return null;

  const processFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Оберіть файл зображення (PNG, JPG, WebP або SVG)');
      return;
    }

    try {
      setIsUploading(true);
      setErrorMsg(null);
      const url = await uploadFileToServer(file, { kind: 'crest' });
      setPreviewUrl(url);
      onSaveCoatOfArms(clan.name, {
        url,
        motto: motto.trim() || undefined,
        description: `Завантажений герб роду ${clan.name}`,
      });
    } catch (err) {
      setErrorMsg((err as Error)?.message || 'Помилка завантаження файлу зображення');
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processFile(file);
    e.target.value = '';
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (!isAdmin) return;
    const file = e.dataTransfer.files?.[0];
    if (file) {
      await processFile(file);
    }
  };

  const handleDone = () => {
    if (isAdmin && previewUrl) {
      onSaveCoatOfArms(clan.name, {
        url: previewUrl,
        motto: motto.trim() || undefined,
        description: clan.coatOfArmsDescription || `Завантажений герб роду ${clan.name}`,
      });
    }
    onClose();
  };

  const handleRemove = () => {
    setPreviewUrl(null);
    onSaveCoatOfArms(clan.name, null);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-stone-200 dark:border-zinc-800 overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          className="p-5 border-b flex items-center justify-between"
          style={{ backgroundColor: clan.bgColor, borderColor: clan.borderColor }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center shadow-xs"
              style={{ backgroundColor: clan.badgeBg, color: clan.color }}
            >
              <Shield size={22} className="stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-stone-900 font-serif-heritage">
                  Герб роду «{clan.name}»
                </h3>
                <span
                  className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                  style={{ backgroundColor: clan.badgeBg, color: clan.badgeText }}
                >
                  {clan.count} осіб
                </span>
              </div>
              <p className="text-xs text-stone-700">
                Родинний герб та девіз для карток і бічної панелі
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-black/10 text-stone-600 hover:text-stone-900 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Current Coat of Arms Preview */}
          <div className="flex flex-col items-center justify-center p-5 rounded-2xl bg-stone-50/80 dark:bg-zinc-950/60 border border-stone-200/90 dark:border-zinc-800 text-center relative">
            {previewUrl ? (
              <div className="relative group">
                <img
                  src={getResolvedMediaSrc(previewUrl)}
                  alt={`Герб роду ${clan.name}`}
                  onError={(e) => handleUploadImageError(e, previewUrl)}
                  className="w-40 h-48 object-contain drop-shadow-md rounded-lg transition-transform group-hover:scale-105"
                />
                {isAdmin && (
                  <button
                    type="button"
                    onClick={handleRemove}
                    className="absolute -top-2 -right-2 p-1.5 rounded-full bg-rose-600 text-white shadow-md hover:bg-rose-700 transition-all cursor-pointer opacity-90 hover:opacity-100"
                    title="Видалити герб"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center py-6 text-stone-400 dark:text-zinc-500">
                <Shield size={54} strokeWidth={1.2} className="mb-2 text-stone-300 dark:text-zinc-700" />
                <p className="text-xs font-semibold text-stone-600 dark:text-zinc-300">
                  Герб для цього роду ще не завантажено
                </p>
                <p className="text-[11px] text-stone-400 dark:text-zinc-500 max-w-xs mt-1">
                  Завантажте фото або готове зображення родинного герба з комп&apos;ютера
                </p>
              </div>
            )}

            {motto && previewUrl && (
              <div className="mt-3 px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-950/50 border border-amber-200/80 dark:border-amber-800/70 text-amber-950 dark:text-amber-200 text-xs font-serif italic tracking-wide">
                «{motto}»
              </div>
            )}
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/70 text-rose-800 dark:text-rose-200 text-xs">
              {errorMsg}
            </div>
          )}

          {isAdmin && <FirebasePhotoAuthBanner compact />}

          {isAdmin ? (
            <div className="space-y-4">
              {/* Motto Input */}
              <div>
                <label className="block text-[11px] font-bold text-stone-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                  Родинне гасло / Девіз
                </label>
                <input
                  type="text"
                  value={motto}
                  onChange={(e) => setMotto(e.target.value)}
                  placeholder={`Рід ${clan.name}`}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-stone-300 dark:border-zinc-700 focus:outline-hidden focus:ring-2 focus:ring-emerald-600/40 bg-stone-50/50 dark:bg-zinc-950 text-stone-900 dark:text-zinc-100"
                />
              </div>

              {/* Upload Custom Photo */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-2xl p-6 text-center transition-colors ${
                  isDragging
                    ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/30'
                    : 'border-stone-300 dark:border-zinc-700 hover:border-emerald-500'
                }`}
              >
                {isUploading ? (
                  <div className="py-3 flex flex-col items-center gap-2 text-stone-600 dark:text-zinc-300">
                    <RefreshCw size={26} className="animate-spin text-emerald-700 dark:text-emerald-400" />
                    <span className="text-xs font-semibold">Завантаження фото...</span>
                  </div>
                ) : (
                  <>
                    <Upload size={30} className="mx-auto text-stone-400 dark:text-zinc-500 mb-2" />
                    <p className="text-xs font-bold text-stone-800 dark:text-zinc-200">
                      Перетягніть фото сюди або оберіть з комп&apos;ютера
                    </p>
                    <p className="text-[11px] text-stone-500 dark:text-zinc-400 mt-0.5">
                      Підтримуються формати PNG, JPG, WebP, GIF
                    </p>
                    <label className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-stone-900 dark:bg-emerald-700 hover:bg-stone-800 dark:hover:bg-emerald-600 text-white text-xs font-semibold shadow-xs cursor-pointer transition-all">
                      <Upload size={13} />
                      <span>{previewUrl ? 'Замінити фото герба' : 'Завантажити фото'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </label>
                  </>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-stone-500 dark:text-zinc-400 text-center italic">
              Завантаження та видалення гербів доступне в режимі Адміністратора.
            </p>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-stone-50 dark:bg-zinc-950/60 border-t border-stone-200 dark:border-zinc-800 flex items-center justify-end">
          <button
            type="button"
            onClick={handleDone}
            className="px-4 py-2 rounded-xl bg-stone-800 dark:bg-zinc-800 hover:bg-stone-900 dark:hover:bg-zinc-700 text-white text-xs font-bold shadow-xs cursor-pointer transition-all"
          >
            Готово
          </button>
        </div>
      </div>
    </div>
  );
};
