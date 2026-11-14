import React, { useState } from 'react';
import { PersonPhoto } from '../../types/tree';
import { uploadFileToServerDetailed } from '../../utils/fileStorage';
import { getResolvedMediaSrc, handleUploadImageError } from '../../utils/mediaSync';
import { DocumentLightboxModal, LightboxDocumentItem } from '../DocumentLightboxModal';
import { Image as ImageIcon, Upload, Trash2, Info, ZoomIn, UserCheck } from 'lucide-react';

interface PhotosTabProps {
  photos: PersonPhoto[];
  currentAvatarUrl?: string;
  onChangePhotos: (photos: PersonPhoto[]) => void;
  onSetAsAvatar?: (url: string) => void;
  onError: (message: string) => void;
  onUploadingChange?: (isUploading: boolean) => void;
}

export const PhotosTab: React.FC<PhotosTabProps> = ({
  photos,
  currentAvatarUrl,
  onChangePhotos,
  onSetAsAvatar,
  onError,
  onUploadingChange,
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const handleFilesUpload = async (files: File[]) => {
    if (files.length === 0) return;
    setIsUploading(true);
    setUploadPercent(0);
    onUploadingChange?.(true);
    try {
      const added: PersonPhoto[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith('image/') && !/\.(jpe?g|png|gif|webp|avif|bmp|tiff?|svg|ico|heic|heif)$/i.test(file.name)) {
          onError(`Файл ${file.name} не є підтримуваним зображенням.`);
          continue;
        }
        if (file.size > 50 * 1024 * 1024) {
          onError(`Файл ${file.name} занадто великий (>50MB). Будь ласка, оберіть файл до 50 MB.`);
          continue;
        }
        const res = await uploadFileToServerDetailed(file, {
          kind: 'album',
          onProgress: (pct) => setUploadPercent(Math.round(((i + pct / 100) / files.length) * 100)),
        });
        added.push({
          id: `photo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          url: res.url,
          caption: '',
        });
      }
      if (added.length > 0) {
        onChangePhotos([...photos, ...added]);
      }
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setIsUploading(false);
      setUploadPercent(0);
      onUploadingChange?.(false);
    }
  };

  const updatePhoto = (id: string, patch: Partial<PersonPhoto>) => {
    onChangePhotos(photos.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  return (
    <div className="space-y-4 animate-in fade-in-50 duration-150">
      <div className="flex items-start gap-2.5 text-xs text-stone-600 dark:text-zinc-400 pb-3 border-b border-stone-200 dark:border-zinc-800">
        <Info size={15} className="text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
        <span>
          Буденні та сімейні фотографії з життя (окремо від архівних метрик). Усі відвідувачі дерева зможуть переглядати ці фото у профілі особи.
        </span>
      </div>

      {/* Upload Dropzone */}
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          handleFilesUpload(Array.from(e.dataTransfer.files || []));
        }}
        className={`w-full flex flex-col items-center justify-center py-5 px-4 border-2 border-dashed rounded-xl cursor-pointer transition-colors group ${
          isDragging
            ? 'border-sky-600 bg-sky-50/70 dark:bg-sky-950/30'
            : 'border-sky-300/80 dark:border-sky-800/60 bg-sky-50/25 dark:bg-sky-950/15 hover:bg-sky-50/50 dark:hover:bg-sky-950/30'
        }`}
      >
        <Upload
          size={22}
          className="text-sky-600 dark:text-sky-400 mb-1.5 group-hover:scale-105 transition-transform"
        />
        <span className="text-xs font-semibold text-sky-950 dark:text-sky-200">
          {isUploading ? `Завантаження фото... ${uploadPercent}%` : 'Додати фотографії з життя або перетягніть сюди'}
        </span>
        <span className="text-[11px] text-sky-800/80 dark:text-sky-400/80 mt-0.5">
          Можна обрати декілька фото одразу (JPG, PNG, WebP · збереження у Firebase)
        </span>
        <input
          type="file"
          accept="image/*"
          multiple
          disabled={isUploading}
          onChange={(e) => {
            handleFilesUpload(Array.from(e.target.files || []));
            e.target.value = '';
          }}
          className="hidden"
        />
      </label>

      {/* Photos List */}
      {photos.length === 0 ? (
        <div className="text-center py-8 border border-stone-200 dark:border-zinc-800 rounded-xl bg-stone-50/40 dark:bg-zinc-900/40">
          <ImageIcon size={28} className="mx-auto text-stone-300 dark:text-zinc-600 mb-2" />
          <p className="text-xs text-stone-500 dark:text-zinc-400 font-medium">
            Фотографій з життя ще не додано
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {photos.map((photo, idx) => {
            const isCurrentAvatar = Boolean(currentAvatarUrl && currentAvatarUrl === photo.url);
            return (
              <div
                key={photo.id}
                className="flex items-start gap-3 p-3 bg-white dark:bg-zinc-900/80 border border-stone-200 dark:border-zinc-800 rounded-xl"
              >
                <button
                  type="button"
                  onClick={() => setPreviewIndex(idx)}
                  className="relative w-20 h-20 sm:w-24 sm:h-24 bg-stone-100 dark:bg-zinc-800 rounded-lg overflow-hidden border border-stone-200 dark:border-zinc-700 shrink-0 group cursor-pointer"
                  title="Відкрити у збільшеному вигляді"
                >
                  <img
                    src={getResolvedMediaSrc(photo.url)}
                    alt={photo.caption || photo.title || 'Фото з життя'}
                    onError={(e) => handleUploadImageError(e, photo.url)}
                    className="w-full h-full object-cover"
                  />
                  <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                    <ZoomIn size={16} />
                  </span>
                </button>

                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={photo.caption ?? photo.title ?? ''}
                      onChange={(e) => updatePhoto(photo.id, { caption: e.target.value, title: e.target.value })}
                      placeholder="Підпис (напр. На весіллі, біля хати, 9 травня...)"
                      className="flex-1 min-w-[160px] text-xs font-medium px-2.5 py-1.5 rounded-md border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-stone-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-sky-600"
                    />
                    <input
                      type="text"
                      value={photo.date || ''}
                      onChange={(e) => updatePhoto(photo.id, { date: e.target.value })}
                      placeholder="Рік / дата"
                      className="text-xs font-mono tabular-nums px-2.5 py-1.5 rounded-md border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-800 text-stone-700 dark:text-zinc-200 w-28 focus:outline-none focus:ring-1 focus:ring-sky-600"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={photo.notes || ''}
                      onChange={(e) => updatePhoto(photo.id, { notes: e.target.value })}
                      placeholder="Додаткова примітка (хто поруч, місце зйомки...)"
                      className="flex-1 min-w-[160px] text-[11px] px-2.5 py-1 rounded-md border border-stone-200/80 dark:border-zinc-700/80 bg-stone-50/70 dark:bg-zinc-900 text-stone-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-sky-600"
                    />
                    {onSetAsAvatar && (
                      <button
                        type="button"
                        onClick={() => onSetAsAvatar(photo.url)}
                        disabled={isCurrentAvatar}
                        className={`px-2 py-1 rounded-md text-[10.5px] font-semibold inline-flex items-center gap-1 border transition-colors shrink-0 ${
                          isCurrentAvatar
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 cursor-default'
                            : 'bg-stone-50 dark:bg-zinc-800 hover:bg-sky-50 dark:hover:bg-sky-950/40 text-stone-700 dark:text-zinc-200 border-stone-200 dark:border-zinc-700 cursor-pointer'
                        }`}
                        title="Встановити це фото як головний аватар на картці"
                      >
                        <UserCheck size={11.5} />
                        <span>{isCurrentAvatar ? 'На аватарі' : 'На аватар'}</span>
                      </button>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onChangePhotos(photos.filter((p) => p.id !== photo.id))}
                  className="p-1.5 rounded-lg text-stone-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer shrink-0"
                  title="Видалити фото"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Lightbox Photo Preview */}
      {previewIndex !== null && (
        <DocumentLightboxModal
          isOpen={previewIndex !== null}
          items={photos.map(
            (photo): LightboxDocumentItem => ({
              id: photo.id,
              url: photo.url,
              title: photo.caption || photo.title || 'Фотографія з життя',
              date: photo.date,
              typeLabel: 'Фото з життя',
            })
          )}
          initialIndex={previewIndex}
          onClose={() => setPreviewIndex(null)}
        />
      )}
    </div>
  );
};
