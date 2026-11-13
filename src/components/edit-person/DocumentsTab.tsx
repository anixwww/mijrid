import React, { useState } from 'react';
import { MetricDocument } from '../../types/tree';
import { uploadFileToServerDetailed } from '../../utils/fileStorage';
import { handleUploadImageError } from '../../utils/mediaSync';
import {
  isExternalMetricLink,
  normalizeExternalMetricUrl,
  getDefaultMetricLinkTitle,
  getMetricLinkDomainLabel,
} from '../../utils/metricLinks';
import { DocumentLightboxModal, LightboxDocumentItem } from '../DocumentLightboxModal';
import { FileText, Upload, Trash2, Info, ZoomIn, Link2, ExternalLink } from 'lucide-react';

interface DocumentsTabProps {
  metricDocuments: MetricDocument[];
  onChangeDocuments: (docs: MetricDocument[]) => void;
  onError: (message: string) => void;
  onUploadingChange?: (isUploading: boolean) => void;
}

export const DocumentsTab: React.FC<DocumentsTabProps> = ({
  metricDocuments,
  onChangeDocuments,
  onError,
  onUploadingChange,
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [linkUrlInput, setLinkUrlInput] = useState('');
  const [linkTypeInput, setLinkTypeInput] = useState<MetricDocument['type']>('birth');

  const handleAddExternalLink = () => {
    const normalized = normalizeExternalMetricUrl(linkUrlInput);
    if (!normalized) {
      onError('Введіть коректне посилання, наприклад https://www.familysearch.org/...');
      return;
    }
    const newDoc: MetricDocument = {
      id: `link-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: linkTypeInput,
      kind: 'link',
      url: normalized,
      title: getDefaultMetricLinkTitle(normalized, linkTypeInput),
    };
    onChangeDocuments([...metricDocuments, newDoc]);
    setLinkUrlInput('');
  };

  const handleFilesUpload = async (files: File[]) => {
    if (files.length === 0) return;
    setIsUploading(true);
    setUploadPercent(0);
    onUploadingChange?.(true);
    try {
      const added: MetricDocument[] = [];
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
          isDocument: true,
          onProgress: (pct) => setUploadPercent(Math.round(((i + pct / 100) / files.length) * 100)),
        });
        added.push({
          id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          type: 'other',
          kind: 'image',
          url: res.url,
          title: file.name.replace(/\.[^/.]+$/, ''),
        });
      }
      if (added.length > 0) {
        onChangeDocuments([...metricDocuments, ...added]);
      }
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setIsUploading(false);
      setUploadPercent(0);
      onUploadingChange?.(false);
    }
  };

  const imageDocuments = metricDocuments.filter((d) => !isExternalMetricLink(d));

  return (
    <div className="space-y-4 animate-in fade-in-50 duration-150">
      <div className="flex items-start gap-2.5 text-xs text-stone-600 dark:text-zinc-400 pb-3 border-b border-stone-200 dark:border-zinc-800">
        <Info size={15} className="text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
        <span>
          Прикріплюйте посилання на сторінки FamilySearch / архівів (не займає місця в базі) або завантажуйте фотографії й скан-копії метричних книг.
        </span>
      </div>

      {/* Quick External Link Input */}
      <div className="p-3 rounded-xl border border-sky-200 dark:border-sky-800/70 bg-sky-50/50 dark:bg-sky-950/20 space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-900 dark:text-sky-200">
          <Link2 size={14} className="text-sky-600 dark:text-sky-400 shrink-0" />
          <span>Прикріпити посилання (FamilySearch / архів)</span>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <select
            value={linkTypeInput}
            onChange={(e) => setLinkTypeInput(e.target.value as MetricDocument['type'])}
            className="text-xs font-semibold px-2.5 py-2 rounded-lg bg-white dark:bg-zinc-900 text-stone-800 dark:text-zinc-100 border border-sky-200 dark:border-zinc-700 focus:outline-none focus:ring-1 focus:ring-sky-500 cursor-pointer shrink-0"
          >
            <option value="birth">Народження</option>
            <option value="marriage">Шлюб</option>
            <option value="children">Діти</option>
            <option value="death">Смерть</option>
            <option value="other">Інше</option>
          </select>
          <input
            type="url"
            value={linkUrlInput}
            onChange={(e) => setLinkUrlInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddExternalLink();
              }
            }}
            placeholder="https://www.familysearch.org/ark:/61903/..."
            className="flex-1 min-w-0 text-xs px-3 py-2 rounded-lg border border-sky-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-stone-900 dark:text-zinc-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
          />
          <button
            type="button"
            onClick={handleAddExternalLink}
            disabled={!linkUrlInput.trim()}
            className="px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-semibold transition-colors cursor-pointer shrink-0"
          >
            Додати лінк
          </button>
        </div>
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
        className={`w-full flex flex-col items-center justify-center py-4 px-4 border-2 border-dashed rounded-xl cursor-pointer transition-colors group ${
          isDragging
            ? 'border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/30'
            : 'border-emerald-300/80 dark:border-emerald-800/60 bg-emerald-50/25 dark:bg-emerald-950/15 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/30'
        }`}
      >
        <Upload
          size={20}
          className="text-emerald-700 dark:text-emerald-400 mb-1 group-hover:scale-105 transition-transform"
        />
        <span className="text-xs font-semibold text-emerald-950 dark:text-emerald-200">
          {isUploading ? `Завантаження файлів... ${uploadPercent}%` : 'Або завантажити скан / скріншот документа'}
        </span>
        <span className="text-[11px] text-emerald-800/80 dark:text-emerald-400/80 mt-0.5">
          Підтримуються JPG, PNG, WebP (без втрати якості, до 50 MB)
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

      {/* Document List */}
      {metricDocuments.length === 0 ? (
        <div className="text-center py-8 border border-stone-200 dark:border-zinc-800 rounded-xl bg-stone-50/40 dark:bg-zinc-900/40">
          <FileText size={28} className="mx-auto text-stone-300 dark:text-zinc-600 mb-2" />
          <p className="text-xs text-stone-500 dark:text-zinc-400 font-medium">
            Документів і посилань ще не додано
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {metricDocuments.map((doc) => {
            const isLink = isExternalMetricLink(doc);
            const imageIdx = isLink ? -1 : imageDocuments.findIndex((img) => img.id === doc.id);
            return (
              <div
                key={doc.id}
                className="flex items-start gap-3 p-3 bg-white dark:bg-zinc-900/80 border border-stone-200 dark:border-zinc-800 rounded-xl"
              >
                {isLink ? (
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-16 h-16 sm:w-20 sm:h-20 bg-sky-50 dark:bg-sky-950/50 hover:bg-sky-100 dark:hover:bg-sky-900/50 rounded-lg border border-sky-200 dark:border-sky-800 shrink-0 flex flex-col items-center justify-center gap-1 text-sky-700 dark:text-sky-300 transition-colors px-1 text-center"
                    title={`Відкрити посилання: ${doc.url}`}
                  >
                    <ExternalLink size={18} />
                    <span className="text-[9px] font-bold uppercase tracking-wide truncate max-w-full">
                      {getMetricLinkDomainLabel(doc.url)}
                    </span>
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPreviewIndex(imageIdx >= 0 ? imageIdx : 0)}
                    className="relative w-16 h-16 sm:w-20 sm:h-20 bg-stone-100 dark:bg-zinc-800 rounded-lg overflow-hidden border border-stone-200 dark:border-zinc-700 shrink-0 group cursor-pointer"
                    title="Відкрити у збільшеному вигляді"
                  >
                    <img
                      src={doc.url}
                      alt={doc.title}
                      onError={(e) => handleUploadImageError(e, doc.url)}
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                      <ZoomIn size={16} />
                    </span>
                  </button>
                )}

                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={doc.type}
                      onChange={(e) => {
                        const nextType = e.target.value as MetricDocument['type'];
                        onChangeDocuments(
                          metricDocuments.map((d) => (d.id === doc.id ? { ...d, type: nextType } : d))
                        );
                      }}
                      className="text-[11px] font-semibold px-2 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 focus:outline-none focus:ring-1 focus:ring-emerald-600 cursor-pointer"
                    >
                      <option value="birth">Народження</option>
                      <option value="marriage">Шлюб</option>
                      <option value="children">Діти</option>
                      <option value="death">Смерть</option>
                      <option value="other">Інше</option>
                    </select>

                    <input
                      type="text"
                      value={doc.date || ''}
                      onChange={(e) =>
                        onChangeDocuments(
                          metricDocuments.map((d) =>
                            d.id === doc.id ? { ...d, date: e.target.value } : d
                          )
                        )
                      }
                      placeholder="Рік або дата"
                      className="text-xs font-mono tabular-nums px-2 py-1 rounded-md border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-800 text-stone-700 dark:text-zinc-200 w-28 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                    />
                  </div>

                  <input
                    type="text"
                    value={doc.title}
                    onChange={(e) =>
                      onChangeDocuments(
                        metricDocuments.map((d) =>
                          d.id === doc.id ? { ...d, title: e.target.value } : d
                        )
                      )
                    }
                    placeholder="Назва документа (напр. FamilySearch / Запис у метриці)"
                    className="block w-full text-xs font-medium px-2.5 py-1.5 rounded-md border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-stone-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                  />

                  {isLink && (
                    <input
                      type="url"
                      value={doc.url}
                      onChange={(e) =>
                        onChangeDocuments(
                          metricDocuments.map((d) =>
                            d.id === doc.id ? { ...d, url: e.target.value } : d
                          )
                        )
                      }
                      placeholder="https://www.familysearch.org/..."
                      className="block w-full text-[11px] font-mono px-2.5 py-1 rounded-md border border-sky-200 dark:border-sky-800/70 bg-sky-50/40 dark:bg-sky-950/20 text-sky-800 dark:text-sky-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                  )}
                </div>

                <button
                  type="button"
                  onClick={() =>
                    onChangeDocuments(metricDocuments.filter((d) => d.id !== doc.id))
                  }
                  className="p-1.5 rounded-lg text-stone-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer shrink-0"
                  title="Видалити документ"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Lightbox Document Preview */}
      {previewIndex !== null && imageDocuments.length > 0 && (
        <DocumentLightboxModal
          isOpen={previewIndex !== null}
          items={imageDocuments.map(
            (doc): LightboxDocumentItem => ({
              id: doc.id,
              url: doc.url,
              title: doc.title || 'Документ',
              date: doc.date,
              typeLabel:
                doc.type === 'birth'
                  ? 'Народження'
                  : doc.type === 'marriage'
                  ? 'Шлюб'
                  : doc.type === 'death'
                  ? 'Смерть'
                  : doc.type === 'children'
                  ? 'Діти'
                  : 'Інше',
            })
          )}
          initialIndex={previewIndex}
          onClose={() => setPreviewIndex(null)}
        />
      )}
    </div>
  );
};
