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
        className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col max-h-[92vh]"
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
              <p className="text-xs text-stone-600">
                Родинний герб та девіз для карток і бічної панелі
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-stone-200/60 text-stone-500 hover:text-stone-800 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Current Coat of Arms Preview */}
          <div className="flex flex-col items-center justify-center p-5 rounded-2xl bg-stone-50/80 border border-stone-200/90 text-center relative">
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
              <div className="flex flex-col items-center py-6 text-stone-400">
                <Shield size={54} strokeWidth={1.2} className="mb-2 text-stone-300" />
                <p className="text-xs font-semibold text-stone-600">
                  Герб для цього роду ще не завантажено
                </p>
                <p className="text-[11px] text-stone-400 max-w-xs mt-1">
                  Завантажте фото або готове зображення родинного герба з комп&apos;ютера
                </p>
              </div>
            )}

            {motto && previewUrl && (
              <div className="mt-3 px-3 py-1 rounded-full bg-amber-50 border border-amber-200/80 text-amber-950 text-xs font-serif italic tracking-wide">
                «{motto}»
              </div>
            )}
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
              {errorMsg}
            </div>
          )}

          {isAdmin && <FirebasePhotoAuthBanner compact />}

          {isAdmin ? (
            <div className="space-y-4">
              {/* Motto Input */}
              <div>
                <label className="block text-[11px] font-bold text-stone-700 uppercase tracking-wider mb-1">
                  Родинне гасло / Девіз
                </label>
                <input
                  type="text"
                  value={motto}
                  onChange={(e) => setMotto(e.target.value)}
                  placeholder={`Рід ${clan.name}`}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-stone-300 focus:outline-hidden focus:ring-2 focus:ring-emerald-600/40 bg-stone-50/50"
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
                    ? 'border-emerald-600 bg-emerald-50/50'
                    : 'border-stone-300 hover:border-emerald-500'
                }`}
              >
                {isUploading ? (
                  <div className="py-3 flex flex-col items-center gap-2 text-stone-600">
                    <RefreshCw size={26} className="animate-spin text-emerald-700" />
                    <span className="text-xs font-semibold">Завантаження фото...</span>
                  </div>
                ) : (
                  <>
                    <Upload size={30} className="mx-auto text-stone-400 mb-2" />
                    <p className="text-xs font-bold text-stone-800">
                      Перетягніть фото сюди або оберіть з комп&apos;ютера
                    </p>
                    <p className="text-[11px] text-stone-500 mt-0.5">
                      Підтримуються формати PNG, JPG, WebP, GIF
                    </p>
                    <label className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold shadow-xs cursor-pointer transition-all">
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
            <p className="text-xs text-stone-500 text-center italic">
              Завантаження та видалення гербів доступне в режимі Адміністратора.
            </p>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-stone-50 border-t border-stone-200 flex items-center justify-end">
          <button
            type="button"
            onClick={handleDone}
            className="px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-900 text-white text-xs font-bold shadow-xs cursor-pointer transition-all"
          >
            Готово
          </button>
        </div>
      </div>
    </div>
  );
};
