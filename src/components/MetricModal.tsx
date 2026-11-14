import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Person, MetricDocument } from '../types/tree';
import { uploadFileToServerDetailed } from '../utils/fileStorage';
import {
  getResolvedMediaSrc,
  handleUploadImageError,
  resolveMediaFallbackFromFirestore,
  uploadUrlToMediaId,
} from '../utils/mediaSync';
import {
  getDefaultMetricLinkTitle,
  getMetricLinkDomainLabel,
  isExternalMetricLink,
  normalizeExternalMetricUrl,
} from '../utils/metricLinks';
import { DocumentLightboxModal, LightboxDocumentItem } from './DocumentLightboxModal';
import { FirebasePhotoAuthBanner } from './FirebasePhotoAuthBanner';
import {
  X,
  Upload,
  Trash2,
  Camera,
  Calendar,
  FileText,
  ZoomIn,
  Download,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ClipboardPaste,
  Star,
  Plus,
  Loader2,
  Save,
  Link2,
  ExternalLink,
} from 'lucide-react';

export type MetricModalTab = 'birth' | 'death' | 'other';

interface MetricModalProps {
  person: Person | null;
  isOpen: boolean;
  isAdmin?: boolean;
  onClose: () => void;
  onSave: (updatedPerson: Person, meta?: { action: 'upload' | 'delete' | 'update'; message?: string }) => void;
  initialTab?: 'birth' | 'death';
}

function getNormalizedDocsForPerson(person: Person | null): MetricDocument[] {
  if (!person) return [];
  const baseDocs = Array.isArray(person.metricDocuments) ? [...person.metricDocuments] : [];

  if (person.birthMetricUrl && !baseDocs.some((d) => d.type === 'birth' && d.url === person.birthMetricUrl)) {
    baseDocs.unshift({
      id: `legacy_birth_${person.id}`,
      type: 'birth',
      url: person.birthMetricUrl,
      title: 'Метричний запис про народження',
      date: person.birthDate || person.birthYear,
    });
  }

  if (person.deathMetricUrl && !baseDocs.some((d) => d.type === 'death' && d.url === person.deathMetricUrl)) {
    baseDocs.unshift({
      id: `legacy_death_${person.id}`,
      type: 'death',
      url: person.deathMetricUrl,
      title: 'Метричний запис про смерть',
      date: person.deathDate || person.deathYear,
    });
  }

  return baseDocs;
}

function buildUpdatedPersonWithDocs(person: Person, nextDocs: MetricDocument[]): Person {
  const firstBirth = nextDocs.find((d) => d.type === 'birth');
  const firstDeath = nextDocs.find((d) => d.type === 'death');
  return {
    ...person,
    birthMetricUrl: firstBirth?.url,
    deathMetricUrl: firstDeath?.url,
    metricDocuments: nextDocs.length > 0 ? nextDocs : undefined,
  };
}

function defaultDocTitle(tab: MetricModalTab): string {
  if (tab === 'birth') return 'Метричний запис про народження';
  if (tab === 'death') return 'Метричний запис про смерть';
  return 'Архівний документ';
}

export const MetricModal: React.FC<MetricModalProps> = ({
  person,
  isOpen,
  isAdmin = true,
  onClose,
  onSave,
  initialTab = 'birth',
}) => {
  const [activeTab, setActiveTab] = useState<MetricModalTab>(initialTab);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadStatusText, setUploadStatusText] = useState<string>('');
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [warningMsg, setWarningMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [failedFiles, setFailedFiles] = useState<File[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingDate, setEditingDate] = useState('');
  const [editingUrl, setEditingUrl] = useState('');
  const [linkUrlInput, setLinkUrlInput] = useState('');
  const [linkTitleInput, setLinkTitleInput] = useState('');
  const [showAddLinkBox, setShowAddLinkBox] = useState(false);
  const [previewImgError, setPreviewImgError] = useState(false);
  const [previewReloadNonce, setPreviewReloadNonce] = useState(0);
  const [resolvedPreviewOverride, setResolvedPreviewOverride] = useState<string | null>(null);
  const previewFallbackUrlRef = useRef<string>('');
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const addMoreInputRef = useRef<HTMLInputElement | null>(null);

  const allDocs = useMemo(() => getNormalizedDocsForPerson(person), [person]);

  const birthDocs = useMemo(() => allDocs.filter((d) => d.type === 'birth'), [allDocs]);
  const deathDocs = useMemo(() => allDocs.filter((d) => d.type === 'death'), [allDocs]);
  const otherDocs = useMemo(
    () => allDocs.filter((d) => d.type !== 'birth' && d.type !== 'death'),
    [allDocs]
  );

  const tabDocs = useMemo(() => {
    if (activeTab === 'birth') return birthDocs;
    if (activeTab === 'death') return deathDocs;
    return otherDocs;
  }, [activeTab, birthDocs, deathDocs, otherDocs]);

  const selectedDoc = useMemo(() => {
    if (tabDocs.length === 0) return null;
    return tabDocs.find((d) => d.id === selectedDocId) || tabDocs[0];
  }, [tabDocs, selectedDocId]);

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab(initialTab);
    setErrorMsg(null);
    setWarningMsg(null);
    setSuccessMsg(null);
    setFailedFiles([]);
    setConfirmDeleteId(null);
    setLightboxOpen(false);
    setLinkUrlInput('');
    setLinkTitleInput('');
    setShowAddLinkBox(false);
  }, [isOpen, initialTab, person?.id]);

  useEffect(() => {
    setConfirmDeleteId(null);
    setPreviewImgError(false);
    setPreviewReloadNonce(0);
    if (tabDocs.length > 0 && !tabDocs.some((d) => d.id === selectedDocId)) {
      setSelectedDocId(tabDocs[0].id);
    } else if (tabDocs.length === 0) {
      setSelectedDocId(null);
    }
  }, [activeTab, tabDocs, selectedDocId]);

  useEffect(() => {
    if (selectedDoc) {
      setEditingTitle(selectedDoc.title || '');
      setEditingDate(selectedDoc.date || '');
      setEditingUrl(selectedDoc.url || '');
      setPreviewImgError(false);
      setResolvedPreviewOverride(null);
      previewFallbackUrlRef.current = '';
    } else {
      setEditingTitle('');
      setEditingDate('');
      setEditingUrl('');
      setResolvedPreviewOverride(null);
      previewFallbackUrlRef.current = '';
    }
  }, [selectedDoc?.id, selectedDoc?.title, selectedDoc?.date, selectedDoc?.url]);

  const processFilesUpload = useCallback(
    async (files: File[]) => {
      if (!person || !isAdmin || files.length === 0 || isUploading) return;

      setIsUploading(true);
      setUploadProgress(0);
      setErrorMsg(null);
      setWarningMsg(null);
      setSuccessMsg(null);
      setFailedFiles([]);

      const currentAllDocs = getNormalizedDocsForPerson(person);
      const uploadedDocs: MetricDocument[] = [];
      const failed: File[] = [];
      let lastError = '';
      let hadLocalFallback = false;

      try {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const label = files.length > 1 ? `(${i + 1}/${files.length}) ${file.name || 'Фото'}` : file.name || 'Фото';
          setUploadStatusText(`Завантаження: ${label}`);
          try {
            const res = await uploadFileToServerDetailed(file, {
              kind: 'metric',
              isDocument: true,
              onProgress: (pct) => {
                const overall = Math.round(((i + pct / 100) / files.length) * 100);
                setUploadProgress(overall);
              },
            });

            if (res.storage === 'local') {
              hadLocalFallback = true;
            }

            const docType: MetricDocument['type'] = activeTab === 'other' ? 'other' : activeTab;
            const defaultDate =
              activeTab === 'birth'
                ? person.birthDate || person.birthYear
                : activeTab === 'death'
                ? person.deathDate || person.deathYear
                : undefined;

            uploadedDocs.push({
              id: `metric_${docType}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              type: docType,
              url: res.url,
              title:
                files.length === 1 && activeTab !== 'other'
                  ? defaultDocTitle(activeTab)
                  : file.name
                  ? file.name.replace(/\.[^/.]+$/, '') || defaultDocTitle(activeTab)
                  : defaultDocTitle(activeTab),
              date: defaultDate,
            });
          } catch (err: any) {
            failed.push(file);
            lastError = err?.message || 'Не вдалося завантажити фотографію метрики';
          }
        }

        if (uploadedDocs.length > 0) {
          const nextDocs = [...currentAllDocs, ...uploadedDocs];
          const updatedPerson = buildUpdatedPersonWithDocs(person, nextDocs);
          setSelectedDocId(uploadedDocs[uploadedDocs.length - 1].id);
          onSave(updatedPerson, {
            action: 'upload',
            message:
              uploadedDocs.length === 1
                ? 'Фото метрики додано та збережено'
                : `Додано фото метрики (${uploadedDocs.length} шт.)`,
          });
          if (hadLocalFallback) {
            setWarningMsg(
              'Сервер недоступний: фото тимчасово збережено в пам’яті браузера і буде відправлено у хмару при синхронізації.'
            );
          } else {
            setSuccessMsg(
              uploadedDocs.length === 1
                ? 'Фото метрики завантажено та збережено у Firebase в оригінальній якості.'
                : `Завантажено та збережено у Firebase: ${uploadedDocs.length} фото.`
            );
          }
        }

        if (failed.length > 0) {
          setFailedFiles(failed);
          setErrorMsg(
            failed.length === files.length
              ? lastError || 'Не вдалося завантажити фотографію.'
              : `Не вдалося завантажити ${failed.length} з ${files.length} файлів: ${lastError}`
          );
        }
      } finally {
        setIsUploading(false);
        setUploadProgress(0);
        setUploadStatusText('');
      }
    },
    [person, isAdmin, isUploading, activeTab, onSave]
  );

  // Support Ctrl+V image paste inside MetricModal for quick archive screenshots
  useEffect(() => {
    if (!isOpen || !isAdmin || !person) return;
    const handlePaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      const items = e.clipboardData?.items;
      if (!items) return;
      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          if (blob) {
            const ext = blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
            const namedFile = new File([blob], `metrika_${Date.now()}.${ext}`, {
              type: blob.type || 'image/png',
            });
            imageFiles.push(namedFile);
          }
        }
      }
      if (imageFiles.length > 0) {
        e.preventDefault();
        void processFilesUpload(imageFiles);
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen, isAdmin, person, processFilesUpload]);

  // Escape closes MetricModal when Lightbox is not open
  useEffect(() => {
    if (!isOpen || lightboxOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, lightboxOpen, onClose]);

  const lightboxItems: LightboxDocumentItem[] = useMemo(() => {
    return allDocs
      .filter((d) => !isExternalMetricLink(d))
      .map((d) => ({
        id: d.id,
        url: d.url,
        title: d.title,
        date: d.date,
        typeLabel:
          d.type === 'birth'
            ? 'Народження'
            : d.type === 'death'
            ? 'Смерть'
            : d.type === 'marriage'
            ? 'Шлюб'
            : d.type === 'children'
            ? 'Діти'
            : 'Документ',
      }));
  }, [allDocs]);

  if (!isOpen || !person) return null;

  const handleAddExternalLink = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isAdmin || !person) return;
    const normalizedUrl = normalizeExternalMetricUrl(linkUrlInput);
    if (!normalizedUrl) {
      setErrorMsg('Вкажіть коректне посилання (наприклад, https://www.familysearch.org/ark:/61903/...)');
      return;
    }
    setErrorMsg(null);
    const docType: MetricDocument['type'] = activeTab === 'other' ? 'other' : activeTab;
    const defaultDate =
      activeTab === 'birth'
        ? person.birthDate || person.birthYear
        : activeTab === 'death'
        ? person.deathDate || person.deathYear
        : undefined;
    const newDoc: MetricDocument = {
      id: `metric_link_${docType}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: docType,
      url: normalizedUrl,
      kind: 'link',
      title: linkTitleInput.trim() || getDefaultMetricLinkTitle(normalizedUrl, docType),
      date: defaultDate,
    };
    const nextDocs = [...allDocs, newDoc];
    setSelectedDocId(newDoc.id);
    setLinkUrlInput('');
    setLinkTitleInput('');
    setShowAddLinkBox(false);
    onSave(buildUpdatedPersonWithDocs(person, nextDocs), {
      action: 'upload',
      message: 'Посилання на метрику додано',
    });
    setSuccessMsg('Посилання на запис збережено. Клік по даті тепер відкриватиме його напряму.');
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
    if (picked.length > 0) {
      void processFilesUpload(picked);
    }
  };

  const handleSaveMetadata = () => {
    if (!isAdmin || !selectedDoc) return;
    const isLink = isExternalMetricLink(selectedDoc);
    const nextTitle = editingTitle.trim() || defaultDocTitle(activeTab);
    const nextDate = editingDate.trim() || undefined;
    let nextUrl = selectedDoc.url;
    if (isLink && editingUrl.trim() && editingUrl.trim() !== selectedDoc.url) {
      const normalized = normalizeExternalMetricUrl(editingUrl);
      if (!normalized) {
        setErrorMsg('Некоректне посилання URL. Перевірте адресу.');
        return;
      }
      nextUrl = normalized;
    }
    if (
      nextTitle === (selectedDoc.title || '') &&
      nextDate === (selectedDoc.date || undefined) &&
      nextUrl === selectedDoc.url
    ) {
      return;
    }
    setErrorMsg(null);
    const nextDocs = allDocs.map((d) =>
      d.id === selectedDoc.id ? { ...d, title: nextTitle, date: nextDate, url: nextUrl } : d
    );
    onSave(buildUpdatedPersonWithDocs(person, nextDocs), {
      action: 'update',
      message: isLink ? 'Посилання та реквізити оновлено' : 'Опис фото метрики оновлено',
    });
    setSuccessMsg(isLink ? 'Посилання та опис збережено.' : 'Назву та реквізити фото збережено.');
  };

  const handleSetPrimary = (docId: string) => {
    if (!isAdmin) return;
    const target = allDocs.find((d) => d.id === docId);
    if (!target) return;
    const rest = allDocs.filter((d) => d.id !== docId);
    const nextDocs = [target, ...rest];
    onSave(buildUpdatedPersonWithDocs(person, nextDocs), {
      action: 'update',
      message: 'Встановлено основне фото метрики',
    });
    setSuccessMsg('Обране фото встановлено як основне.');
  };

  const handleDeleteDoc = (docId: string) => {
    if (!isAdmin) return;
    const nextDocs = allDocs.filter((d) => d.id !== docId);
    setConfirmDeleteId(null);
    onSave(buildUpdatedPersonWithDocs(person, nextDocs), {
      action: 'delete',
      message: 'Фото метрики видалено',
    });
    setSuccessMsg('Фотографію видалено з картки.');
  };

  const openLightboxForSelected = () => {
    if (!selectedDoc) return;
    const idx = lightboxItems.findIndex((item) => item.id === selectedDoc.id);
    setLightboxIndex(idx >= 0 ? idx : 0);
    setLightboxOpen(true);
  };

  const personName = `${person.firstName || ''} ${person.lastName || ''}`.trim() || 'Особа';
  const showDeathTab = Boolean(person.isDeceased || deathDocs.length > 0 || activeTab === 'death');

  const isSelectedPrimary =
    selectedDoc &&
    ((activeTab === 'birth' && birthDocs[0]?.id === selectedDoc.id) ||
      (activeTab === 'death' && deathDocs[0]?.id === selectedDoc.id));

  const rawSelectedUrl = selectedDoc?.url || '';
  const cachedOrDirectSelectedUrl =
    resolvedPreviewOverride || getResolvedMediaSrc(rawSelectedUrl) || rawSelectedUrl;
  const selectedIsInline =
    cachedOrDirectSelectedUrl.startsWith('data:') || cachedOrDirectSelectedUrl.startsWith('blob:');
  const selectedPreviewSrc =
    selectedDoc && previewReloadNonce > 0 && !selectedIsInline
      ? `${cachedOrDirectSelectedUrl}${cachedOrDirectSelectedUrl.includes('?') ? '&' : '?'}v=${previewReloadNonce}`
      : cachedOrDirectSelectedUrl;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-2.5 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      >
        <div
          className={`bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border w-full max-w-3xl overflow-hidden flex flex-col max-h-[92vh] transition-colors ${
            isDraggingOver
              ? 'border-emerald-500 ring-4 ring-emerald-500/25'
              : 'border-stone-200 dark:border-zinc-700'
          }`}
          onClick={(e) => e.stopPropagation()}
          onDragOver={(e) => {
            if (!isAdmin) return;
            e.preventDefault();
            setIsDraggingOver(true);
          }}
          onDragLeave={(e) => {
            if (!isAdmin) return;
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setIsDraggingOver(false);
            }
          }}
          onDrop={(e) => {
            if (!isAdmin) return;
            e.preventDefault();
            setIsDraggingOver(false);
            const dropped = Array.from(e.dataTransfer.files || []);
            if (dropped.length > 0) {
              void processFilesUpload(dropped);
            }
          }}
        >
          {/* Modal Header */}
          <div className="px-5 py-3.5 bg-gradient-to-r from-stone-900 to-stone-800 text-white flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center justify-center shrink-0">
                <Camera size={18} />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-bold leading-tight truncate">
                  Метрична книга та архівні документи
                </h3>
                <p className="text-xs text-stone-300 truncate">
                  {personName} {person.yearsDisplay ? `(${person.yearsDisplay})` : ''}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
              title="Закрити (Esc)"
            >
              <X size={18} />
            </button>
          </div>

          {/* Tab Navigation */}
          <div className="flex border-b border-stone-200 dark:border-zinc-800 bg-stone-50 dark:bg-zinc-950/60 px-4 pt-3 gap-1.5 sm:gap-2 shrink-0 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab('birth')}
              className={`px-3.5 py-2 text-xs font-bold rounded-t-xl transition-all cursor-pointer flex items-center gap-2 border-t border-x shrink-0 ${
                activeTab === 'birth'
                  ? 'bg-white dark:bg-zinc-900 text-emerald-950 dark:text-emerald-300 border-stone-200 dark:border-zinc-700 border-b-white dark:border-b-zinc-900 -mb-px shadow-2xs'
                  : 'text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-200 border-transparent hover:bg-stone-100 dark:hover:bg-zinc-800/60'
              }`}
            >
              <Calendar size={14} className={activeTab === 'birth' ? 'text-emerald-700 dark:text-emerald-400' : 'text-stone-400'} />
              <span>Народження</span>
              {birthDocs.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-800 dark:text-amber-300 text-[10px] font-bold">
                  {birthDocs.length}
                </span>
              )}
            </button>

            {showDeathTab && (
              <button
                type="button"
                onClick={() => setActiveTab('death')}
                className={`px-3.5 py-2 text-xs font-bold rounded-t-xl transition-all cursor-pointer flex items-center gap-2 border-t border-x shrink-0 ${
                  activeTab === 'death'
                    ? 'bg-white dark:bg-zinc-900 text-emerald-950 dark:text-emerald-300 border-stone-200 dark:border-zinc-700 border-b-white dark:border-b-zinc-900 -mb-px shadow-2xs'
                    : 'text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-200 border-transparent hover:bg-stone-100 dark:hover:bg-zinc-800/60'
                }`}
              >
                <FileText size={14} className={activeTab === 'death' ? 'text-emerald-700 dark:text-emerald-400' : 'text-stone-400'} />
                <span>Смерть</span>
                {deathDocs.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-800 dark:text-amber-300 text-[10px] font-bold">
                    {deathDocs.length}
                  </span>
                )}
              </button>
            )}

            {(otherDocs.length > 0 || isAdmin) && (
              <button
                type="button"
                onClick={() => setActiveTab('other')}
                className={`px-3.5 py-2 text-xs font-bold rounded-t-xl transition-all cursor-pointer flex items-center gap-2 border-t border-x shrink-0 ${
                  activeTab === 'other'
                    ? 'bg-white dark:bg-zinc-900 text-emerald-950 dark:text-emerald-300 border-stone-200 dark:border-zinc-700 border-b-white dark:border-b-zinc-900 -mb-px shadow-2xs'
                    : 'text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-200 border-transparent hover:bg-stone-100 dark:hover:bg-zinc-800/60'
                }`}
              >
                <FileText size={14} className={activeTab === 'other' ? 'text-emerald-700 dark:text-emerald-400' : 'text-stone-400'} />
                <span>Інші документи</span>
                {otherDocs.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-stone-200 dark:bg-zinc-700 text-stone-700 dark:text-zinc-200 text-[10px] font-bold">
                    {otherDocs.length}
                  </span>
                )}
              </button>
            )}
          </div>

          {/* Content Body */}
          <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-3.5">
            {isAdmin && <FirebasePhotoAuthBanner compact />}

            {/* Upload Progress Bar */}
            {isUploading && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-emerald-950 dark:text-emerald-200">
                  <span className="flex items-center gap-2 truncate">
                    <Loader2 size={14} className="animate-spin text-emerald-700 dark:text-emerald-400 shrink-0" />
                    <span className="truncate">{uploadStatusText || 'Завантаження фотографії...'}</span>
                  </span>
                  <span className="font-mono tabular-nums shrink-0">{uploadProgress}%</span>
                </div>
                <div className="w-full h-1.5 bg-emerald-200/70 dark:bg-emerald-900 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 dark:bg-emerald-400 transition-all duration-150"
                    style={{ width: `${Math.max(6, uploadProgress)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Status Banners */}
            {errorMsg && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs rounded-xl flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2 flex-1 min-w-0">
                  <AlertTriangle size={15} className="text-rose-600 shrink-0" />
                  <span>{errorMsg}</span>
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  {failedFiles.length > 0 && isAdmin && (
                    <button
                      type="button"
                      onClick={() => void processFilesUpload(failedFiles)}
                      disabled={isUploading}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-700 hover:bg-rose-800 text-white font-semibold cursor-pointer"
                    >
                      <RefreshCw size={12} />
                      <span>Повторити</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setErrorMsg(null)}
                    className="p-1 text-rose-500 hover:text-rose-700 font-bold cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}

            {warningMsg && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs rounded-xl flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <AlertTriangle size={15} className="text-amber-600 shrink-0" />
                  <span>{warningMsg}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setWarningMsg(null)}
                  className="text-amber-700 font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

            {successMsg && !errorMsg && (
              <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 text-xs rounded-xl flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                  <span>{successMsg}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setSuccessMsg(null)}
                  className="text-emerald-700 font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Date Info Summary */}
            <div className="p-3 bg-stone-50 dark:bg-zinc-800/60 rounded-xl border border-stone-200 dark:border-zinc-700 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div>
                <span className="text-stone-500 dark:text-zinc-400 font-medium">
                  {activeTab === 'birth'
                    ? 'Дата народження:'
                    : activeTab === 'death'
                    ? 'Дата смерті:'
                    : 'Документи особи:'}
                </span>
                <span className="font-bold text-stone-900 dark:text-zinc-100 font-mono ml-2">
                  {activeTab === 'birth'
                    ? person.birthDate || person.birthYear || 'Не вказана'
                    : activeTab === 'death'
                    ? person.deathDate || person.deathYear || 'Не вказана'
                    : `${otherDocs.length} файл(ів)`}
                </span>
              </div>
              {tabDocs.length > 0 ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200 font-bold text-[11px] border border-amber-300 dark:border-amber-700">
                  {tabDocs.some((d) => isExternalMetricLink(d)) ? (
                    <Link2 size={13} className="text-sky-700 dark:text-sky-300" />
                  ) : (
                    <Camera size={13} className="text-amber-800 dark:text-amber-300" />
                  )}
                  <span>Записів: {tabDocs.length}</span>
                </span>
              ) : (
                <span className="text-stone-400 dark:text-zinc-500 text-[11px] font-medium">
                  Посилання або скан відсутні
                </span>
              )}
            </div>

            {/* Active Viewer + Thumbnail Strip */}
            {selectedDoc ? (
              <div className="space-y-3">
                {/* Large Interactive Preview OR External Link Card */}
                {isExternalMetricLink(selectedDoc) ? (
                  <div className="rounded-xl border border-sky-200 dark:border-sky-800/70 bg-gradient-to-br from-sky-50/80 via-white to-stone-50 dark:from-sky-950/30 dark:via-zinc-900 dark:to-zinc-900 p-5 space-y-3 shadow-2xs">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-10 h-10 rounded-xl bg-sky-100 dark:bg-sky-900/60 text-sky-700 dark:text-sky-300 flex items-center justify-center shrink-0 border border-sky-200 dark:border-sky-800">
                          <Link2 size={18} />
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="px-2 py-0.5 rounded-md bg-sky-600 text-white text-[10px] font-bold uppercase tracking-wider">
                              {getMetricLinkDomainLabel(selectedDoc.url)}
                            </span>
                            {selectedDoc.date && (
                              <span className="text-[11px] font-mono text-stone-500 dark:text-zinc-400">
                                {selectedDoc.date}
                              </span>
                            )}
                          </div>
                          <h5 className="text-sm font-bold text-stone-900 dark:text-zinc-100 truncate mt-1">
                            {selectedDoc.title || 'Посилання на метричну сторінку'}
                          </h5>
                        </div>
                      </div>
                      <a
                        href={selectedDoc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-700 hover:bg-sky-800 text-white text-xs font-bold shadow-sm transition-colors shrink-0"
                      >
                        <ExternalLink size={14} />
                        <span>Відкрити сторінку</span>
                      </a>
                    </div>

                    <div className="px-3 py-2 rounded-lg bg-white/90 dark:bg-zinc-950/60 border border-stone-200 dark:border-zinc-800 text-[11px] font-mono text-sky-800 dark:text-sky-300 break-all">
                      {selectedDoc.url}
                    </div>
                  </div>
                ) : (
                  <div className="relative group rounded-xl border border-stone-300 dark:border-zinc-700 overflow-hidden bg-stone-950 min-h-[240px] max-h-[46vh] flex items-center justify-center shadow-inner">
                    {previewImgError ? (
                      <div className="p-6 text-center space-y-2.5 text-stone-300">
                        <AlertTriangle size={26} className="mx-auto text-amber-400" />
                        <p className="text-xs font-medium">
                          Не вдалося відобразити прев’ю зображення. Можливо, це HEIC/TIFF або тимчасовий збій мережі.
                        </p>
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setPreviewImgError(false);
                              setPreviewReloadNonce((n) => n + 1);
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-semibold cursor-pointer"
                          >
                            <RefreshCw size={13} />
                            <span>Повторити</span>
                          </button>
                          <a
                            href={cachedOrDirectSelectedUrl}
                            download
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
                          >
                            <Download size={13} />
                            <span>Завантажити оригінал</span>
                          </a>
                        </div>
                      </div>
                    ) : (
                      <>
                        <img
                          src={selectedPreviewSrc}
                          alt={selectedDoc.title || 'Фото метрики'}
                          onClick={openLightboxForSelected}
                          onError={() => {
                            if (
                              !resolvedPreviewOverride &&
                              uploadUrlToMediaId(selectedDoc.url) &&
                              previewFallbackUrlRef.current !== selectedDoc.url
                            ) {
                              previewFallbackUrlRef.current = selectedDoc.url;
                              void resolveMediaFallbackFromFirestore(selectedDoc.url).then((resolved) => {
                                if (resolved) {
                                  setResolvedPreviewOverride(resolved);
                                } else {
                                  setPreviewImgError(true);
                                }
                              });
                              return;
                            }
                            setPreviewImgError(true);
                          }}
                          className="max-h-[45vh] w-auto object-contain cursor-zoom-in transition-transform duration-150 group-hover:scale-[1.01]"
                        />

                        {/* Floating Viewer Bar */}
                        <div className="absolute bottom-3 right-3 flex items-center gap-1.5 z-10">
                          <button
                            type="button"
                            onClick={openLightboxForSelected}
                            className="px-3 py-1.5 rounded-xl bg-black/75 hover:bg-black/90 text-white font-bold text-xs shadow-lg border border-white/15 flex items-center gap-1.5 backdrop-blur-xs cursor-pointer transition-transform active:scale-95"
                          >
                            <ZoomIn size={14} className="text-amber-300" />
                            <span>На весь екран (лупа / поворот / контраст)</span>
                          </button>
                          <a
                            href={cachedOrDirectSelectedUrl}
                            download
                            onClick={(e) => e.stopPropagation()}
                            className="p-2 rounded-xl bg-black/75 hover:bg-black/90 text-white shadow-lg border border-white/15 backdrop-blur-xs transition-transform active:scale-95"
                            title="Завантажити оригінал"
                          >
                            <Download size={14} />
                          </a>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Multi-Item Strip (links + screenshots) */}
                {(tabDocs.length > 1 || isAdmin) && (
                  <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    {tabDocs.map((doc, idx) => {
                      const isActive = doc.id === selectedDoc.id;
                      const isLink = isExternalMetricLink(doc);
                      return (
                        <button
                          key={doc.id}
                          type="button"
                          onClick={() => setSelectedDocId(doc.id)}
                          className={`relative w-16 h-16 rounded-xl overflow-hidden border-2 shrink-0 cursor-pointer transition-all bg-stone-100 dark:bg-zinc-800 ${
                            isActive
                              ? isLink
                                ? 'border-sky-500 ring-2 ring-sky-400/40 scale-[1.02]'
                                : 'border-amber-500 ring-2 ring-amber-400/40 scale-[1.02]'
                              : 'border-stone-200 dark:border-zinc-700 opacity-75 hover:opacity-100'
                          }`}
                          title={doc.title || `Запис ${idx + 1}`}
                        >
                          {isLink ? (
                            <div className="w-full h-full flex flex-col items-center justify-center p-1 bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 gap-0.5">
                              <Link2 size={16} />
                              <span className="text-[8px] font-bold leading-tight truncate max-w-full">
                                {getMetricLinkDomainLabel(doc.url)}
                              </span>
                            </div>
                          ) : (
                            <img
                              src={getResolvedMediaSrc(doc.url)}
                              alt=""
                              onError={(e) => handleUploadImageError(e, doc.url)}
                              className="w-full h-full object-cover"
                            />
                          )}
                          {idx === 0 && (activeTab === 'birth' || activeTab === 'death') && (
                            <span
                              className="absolute top-1 left-1 px-1 py-0.2 rounded bg-amber-500 text-[8px] font-bold text-zinc-950 leading-tight"
                              title="Основний запис"
                            >
                              ★
                            </span>
                          )}
                        </button>
                      );
                    })}

                    {isAdmin && (
                      <>
                        <button
                          type="button"
                          onClick={() => setShowAddLinkBox((v) => !v)}
                          className={`w-16 h-16 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 shrink-0 cursor-pointer transition-colors ${
                            showAddLinkBox
                              ? 'border-sky-600 bg-sky-100/80 dark:bg-sky-950/50 text-sky-900 dark:text-sky-200'
                              : 'border-sky-400 dark:border-sky-700 bg-sky-50/60 dark:bg-sky-950/20 hover:bg-sky-100/70 dark:hover:bg-sky-950/40 text-sky-800 dark:text-sky-300'
                          }`}
                          title="Прикріпити посилання на FamilySearch або архів"
                        >
                          <Link2 size={16} />
                          <span className="text-[8.5px] font-bold leading-none">+ Лінк</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => addMoreInputRef.current?.click()}
                          disabled={isUploading}
                          className="w-16 h-16 rounded-xl border-2 border-dashed border-emerald-400 dark:border-emerald-700 bg-emerald-50/60 dark:bg-emerald-950/20 hover:bg-emerald-100/70 dark:hover:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 flex flex-col items-center justify-center gap-1 shrink-0 cursor-pointer transition-colors"
                          title="Додати ще скан-копію або фото метрики"
                        >
                          <Plus size={16} />
                          <span className="text-[8.5px] font-bold leading-none">+ Фото</span>
                        </button>
                      </>
                    )}
                    <input
                      ref={addMoreInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleFileInputChange}
                      className="hidden"
                      disabled={isUploading}
                    />
                  </div>
                )}

                {/* Inline Add Link Form when toggled */}
                {isAdmin && showAddLinkBox && (
                  <form
                    onSubmit={handleAddExternalLink}
                    className="p-3 rounded-xl border border-sky-200 dark:border-sky-800/70 bg-sky-50/60 dark:bg-sky-950/25 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-sky-950 dark:text-sky-200 flex items-center gap-1.5">
                        <Link2 size={13} />
                        Прикріпити посилання на FamilySearch / архів
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowAddLinkBox(false)}
                        className="text-stone-400 hover:text-stone-700 dark:hover:text-zinc-200 cursor-pointer"
                      >
                        <X size={13} />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input
                        type="url"
                        value={linkUrlInput}
                        onChange={(e) => setLinkUrlInput(e.target.value)}
                        placeholder="https://www.familysearch.org/ark:/61903/..."
                        className="sm:col-span-2 text-xs px-2.5 py-1.5 rounded-lg border border-sky-200 dark:border-sky-800 bg-white dark:bg-zinc-900 text-stone-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-sky-600"
                        autoFocus
                      />
                      <input
                        type="text"
                        value={linkTitleInput}
                        onChange={(e) => setLinkTitleInput(e.target.value)}
                        placeholder="Підпис (необов’язково)"
                        className="text-xs px-2.5 py-1.5 rounded-lg border border-sky-200 dark:border-sky-800 bg-white dark:bg-zinc-900 text-stone-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-sky-600"
                      />
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={!linkUrlInput.trim()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-700 hover:bg-sky-800 disabled:opacity-50 text-white text-xs font-bold cursor-pointer"
                      >
                        <Link2 size={13} />
                        <span>Зберегти посилання</span>
                      </button>
                    </div>
                  </form>
                )}

                {/* Metadata & Actions */}
                {isAdmin ? (
                  <div className="p-3 bg-stone-50 dark:bg-zinc-800/50 rounded-xl border border-stone-200 dark:border-zinc-700 space-y-2.5">
                    {isExternalMetricLink(selectedDoc) && (
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-500 dark:text-zinc-400 mb-1">
                          URL-посилання на сторінку
                        </label>
                        <input
                          type="url"
                          value={editingUrl}
                          onChange={(e) => setEditingUrl(e.target.value)}
                          onBlur={handleSaveMetadata}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveMetadata();
                          }}
                          placeholder="https://www.familysearch.org/..."
                          className="w-full text-xs font-mono px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-stone-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-sky-600"
                        />
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-500 dark:text-zinc-400 mb-1">
                          Назва запису
                        </label>
                        <input
                          type="text"
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          onBlur={handleSaveMetadata}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveMetadata();
                          }}
                          placeholder="Напр. Метричний запис про народження № 14"
                          className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-stone-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-500 dark:text-zinc-400 mb-1">
                          Дата / архів / ф. оп. спр.
                        </label>
                        <div className="flex gap-1">
                          <input
                            type="text"
                            value={editingDate}
                            onChange={(e) => setEditingDate(e.target.value)}
                            onBlur={handleSaveMetadata}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveMetadata();
                            }}
                            placeholder="1898, ЦДІАК ф.127"
                            className="w-full text-xs font-mono px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-stone-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                          />
                          <button
                            type="button"
                            onClick={handleSaveMetadata}
                            className="px-2 py-1.5 rounded-lg bg-stone-200 dark:bg-zinc-700 hover:bg-emerald-600 hover:text-white text-stone-700 dark:text-zinc-200 transition-colors cursor-pointer shrink-0"
                            title="Зберегти підпис"
                          >
                            <Save size={13} />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-stone-200/80 dark:border-zinc-700/80">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setShowAddLinkBox((v) => !v)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50/70 dark:bg-sky-950/30 hover:bg-sky-100 dark:hover:bg-sky-900/40 text-xs font-bold text-sky-900 dark:text-sky-200 transition-colors cursor-pointer"
                        >
                          <Link2 size={13.5} />
                          <span>Додати посилання</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => addMoreInputRef.current?.click()}
                          disabled={isUploading}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-stone-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 hover:bg-stone-100 dark:hover:bg-zinc-800 text-xs font-bold text-stone-800 dark:text-zinc-100 transition-colors cursor-pointer"
                        >
                          <Upload size={13.5} className="text-emerald-700 dark:text-emerald-400" />
                          <span>{isUploading ? 'Завантаження...' : 'Додати скріншот'}</span>
                        </button>

                        {!isSelectedPrimary && (activeTab === 'birth' || activeTab === 'death') && (
                          <button
                            type="button"
                            onClick={() => handleSetPrimary(selectedDoc.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-xs font-bold text-amber-900 transition-colors cursor-pointer"
                          >
                            <Star size={13.5} className="text-amber-600" />
                            <span>Зробити основним</span>
                          </button>
                        )}
                      </div>

                      {confirmDeleteId === selectedDoc.id ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleDeleteDoc(selectedDoc.id)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-xs font-bold text-white cursor-pointer"
                          >
                            <Trash2 size={13} />
                            <span>Так, видалити</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2.5 py-1.5 rounded-xl bg-stone-200 dark:bg-zinc-700 text-xs font-semibold text-stone-700 dark:text-zinc-200 cursor-pointer"
                          >
                            Скасувати
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(selectedDoc.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-800/70 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-xs font-bold text-rose-800 dark:text-rose-200 transition-colors cursor-pointer"
                        >
                          <Trash2 size={13.5} />
                          <span>{isExternalMetricLink(selectedDoc) ? 'Видалити посилання' : 'Видалити це фото'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-stone-50 dark:bg-zinc-800/50 rounded-xl border border-stone-200 dark:border-zinc-700 flex items-center justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <p className="font-semibold text-stone-900 dark:text-zinc-100 truncate">
                        {selectedDoc.title || 'Метричний запис'}
                      </p>
                      {selectedDoc.date && (
                        <p className="font-mono text-[11px] text-stone-500 dark:text-zinc-400 truncate">
                          {selectedDoc.date}
                        </p>
                      )}
                    </div>
                    {isExternalMetricLink(selectedDoc) ? (
                      <a
                        href={selectedDoc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-700 hover:bg-sky-800 text-white text-xs font-bold shrink-0"
                      >
                        <ExternalLink size={13.5} />
                        <span>Відкрити посилання</span>
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={openLightboxForSelected}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-900 text-white text-xs font-bold cursor-pointer shrink-0"
                      >
                        <ZoomIn size={13.5} />
                        <span>Детальний перегляд</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : isAdmin ? (
              /* Empty state: Primary Link Input (Recommended for Firestore) + Optional Screenshot Dropzone */
              <div className="space-y-3">
                <form
                  onSubmit={handleAddExternalLink}
                  className="p-4 rounded-2xl border border-sky-200 dark:border-sky-800/70 bg-sky-50/55 dark:bg-sky-950/25 space-y-2.5"
                >
                  <div className="flex items-start gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-sky-100 dark:bg-sky-900/60 text-sky-700 dark:text-sky-300 flex items-center justify-center shrink-0">
                      <Link2 size={18} />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs sm:text-sm font-bold text-stone-900 dark:text-zinc-100">
                        Прикріпити посилання на сторінку (FamilySearch / архів)
                      </h4>
                      <p className="text-[11px] text-stone-600 dark:text-zinc-400 mt-0.5">
                        Рекомендовано: займає мінімум місця в базі, а клік по даті на картці одразу відкриватиме сторінку запису.
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      type="url"
                      value={linkUrlInput}
                      onChange={(e) => setLinkUrlInput(e.target.value)}
                      placeholder="https://www.familysearch.org/ark:/61903/..."
                      className="sm:col-span-2 text-xs px-3 py-2 rounded-xl border border-sky-200 dark:border-sky-800 bg-white dark:bg-zinc-900 text-stone-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-600/40"
                    />
                    <input
                      type="text"
                      value={linkTitleInput}
                      onChange={(e) => setLinkTitleInput(e.target.value)}
                      placeholder="Підпис (необов’язково)"
                      className="text-xs px-3 py-2 rounded-xl border border-sky-200 dark:border-sky-800 bg-white dark:bg-zinc-900 text-stone-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-600/40"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={!linkUrlInput.trim()}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-700 hover:bg-sky-800 disabled:opacity-50 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
                    >
                      <Link2 size={14} />
                      <span>Додати посилання</span>
                    </button>
                  </div>
                </form>

                {/* Optional Screenshot Dropzone */}
                <div
                  onClick={() => !isUploading && fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-5 text-center transition-all flex flex-col items-center justify-center space-y-2.5 cursor-pointer ${
                    isDraggingOver
                      ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/30 scale-[1.01]'
                      : 'border-stone-300 dark:border-zinc-700 hover:border-emerald-500 bg-stone-50/60 dark:bg-zinc-800/40 hover:bg-emerald-50/30 dark:hover:bg-emerald-950/20'
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 flex items-center justify-center shadow-2xs">
                    <Camera size={20} />
                  </div>

                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-stone-900 dark:text-zinc-100">
                      Або завантажте скріншот метрики (за бажанням)
                    </h4>
                    <p className="text-[11px] text-stone-500 dark:text-zinc-400 mt-0.5 max-w-md">
                      Оберіть файл, перетягніть скан-копію сюди або вставте знімок через{' '}
                      <kbd className="px-1.5 py-0.5 rounded bg-stone-200 dark:bg-zinc-700 text-stone-800 dark:text-zinc-200 font-mono text-[10px]">
                        Ctrl+V
                      </kbd>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-2 pt-0.5">
                    <button
                      type="button"
                      disabled={isUploading}
                      onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                      }}
                      className="cursor-pointer inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 disabled:opacity-60 text-white font-bold text-xs shadow-sm transition-all active:scale-95"
                    >
                      <Upload size={14} />
                      <span>{isUploading ? 'Завантаження...' : 'Обрати скріншот'}</span>
                    </button>
                    <span className="inline-flex items-center gap-1 text-[11px] text-stone-500 dark:text-zinc-400 px-2">
                      <ClipboardPaste size={13} />
                      <span>JPG, PNG, WebP · до 50 МБ</span>
                    </span>
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFileInputChange}
                    className="hidden"
                    disabled={isUploading}
                  />
                </div>
              </div>
            ) : (
              /* Empty state for Guest */
              <div className="border border-stone-200 dark:border-zinc-700 rounded-2xl p-8 text-center bg-stone-50/50 dark:bg-zinc-800/30 space-y-2">
                <Camera size={28} className="mx-auto text-stone-400" />
                <p className="text-xs font-medium text-stone-600 dark:text-zinc-400">
                  У цій категорії ще немає прикріплених посилань або фотографій метричних книг.
                </p>
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div className="px-5 py-3 bg-stone-100 dark:bg-zinc-950/70 border-t border-stone-200 dark:border-zinc-800 flex items-center justify-between gap-3 shrink-0">
            <p className="text-[11px] text-stone-500 dark:text-zinc-400">
              {isAdmin
                ? 'Порада: можна перетягнути фото прямо у вікно або вставити скріншот через Ctrl+V.'
                : 'Натисніть на фото для збільшення, повороту чи підсилення контрасту тексту.'}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-900 text-white text-xs font-bold transition-colors cursor-pointer shrink-0"
            >
              Готово
            </button>
          </div>
        </div>
      </div>

      {/* Interactive Fullscreen Viewer */}
      <DocumentLightboxModal
        isOpen={lightboxOpen}
        items={lightboxItems}
        initialIndex={lightboxIndex}
        onClose={() => setLightboxOpen(false)}
      />
    </>
  );
};
