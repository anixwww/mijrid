import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Person, ConnectionMeta, BranchLink, CrossCanvasLink } from '../types/tree';
import { uploadFileToServer, fetchServerTrees, fetchAllTreesSearchIndex, CrossCanvasSearchTree } from '../utils/fileStorage';
import { upsertCrossCanvasLinkList } from '../utils/crossCanvasLinks';
import { formatPersonLifeDates } from '../utils/dateUtils';
import { getClanName } from '../utils/lineageUtils';
import { formatCardId } from '../utils/cardIdUtils';
import {
  EditTabType,
  EditPersonDraft,
  buildInitialDraft,
  draftToPerson,
  computeLiveWarnings,
} from './edit-person/types';
import { PersonSummaryRail } from './edit-person/PersonSummaryRail';
import { BasicInfoTab } from './edit-person/BasicInfoTab';
import { BiographyTab } from './edit-person/BiographyTab';
import { RelationsTab } from './edit-person/RelationsTab';
import { DocumentsTab } from './edit-person/DocumentsTab';
import { PhotosTab } from './edit-person/PhotosTab';
import { PetsTab } from './edit-person/PetsTab';
import { FirebasePhotoAuthBanner } from './FirebasePhotoAuthBanner';
import {
  X,
  Users,
  BookOpen,
  Heart,
  FileText,
  Dog,
  Trash2,
  CheckCircle2,
  UserPlus,
  Image as ImageIcon,
} from 'lucide-react';

interface EditPersonModalProps {
  person: Person;
  allPersons: Record<string, Person>;
  currentTreeId?: string;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updated: Person) => void;
  onDelete: (id: string) => void;
  connectionOverrides?: Record<string, ConnectionMeta>;
}

export const EditPersonModal: React.FC<EditPersonModalProps> = ({
  person,
  allPersons,
  currentTreeId,
  isOpen,
  onClose,
  onSave,
  onDelete,
  connectionOverrides,
}) => {
  const [activeTab, setActiveTab] = useState<EditTabType>('basic');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isUploadingScreenshot, setIsUploadingScreenshot] = useState(false);
  const [isUploadingPhotos, setIsUploadingPhotos] = useState(false);
  const [isUploadingDocs, setIsUploadingDocs] = useState(false);
  const [isUploadingPet, setIsUploadingPet] = useState(false);
  const [serverCanvases, setServerCanvases] = useState<{ id: string; title: string }[]>([]);
  const [crossCanvasTrees, setCrossCanvasTrees] = useState<CrossCanvasSearchTree[]>([]);
  const pendingCrossCanvasGetterRef = useRef<(() => CrossCanvasLink | null) | null>(null);
  const isUploadingAnyMedia = isUploadingAvatar || isUploadingScreenshot || isUploadingPhotos || isUploadingDocs || isUploadingPet;

  const initialDraft = useMemo(
    () => buildInitialDraft(person, allPersons),
    // Rebuild initial snapshot only when switching person or opening
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [person.id, isOpen]
  );

  const [draft, setDraft] = useState<EditPersonDraft>(initialDraft);
  const [approveProposalOnSave, setApproveProposalOnSave] = useState(Boolean(person.isProposal));

  useEffect(() => {
    setDraft(initialDraft);
    setApproveProposalOnSave(Boolean(person.isProposal));
    setConfirmDelete(false);
    setModalError(null);
  }, [initialDraft, person.isProposal]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    fetchServerTrees({ includeCloud: true })
      .then((list) => {
        if (!cancelled) {
          setServerCanvases(list.map((t) => ({ id: t.id, title: t.title })));
        }
      })
      .catch(() => {});
    fetchAllTreesSearchIndex({ includeCloud: true })
      .then((trees) => {
        if (!cancelled) {
          setCrossCanvasTrees(trees);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const updateField = useCallback(
    <K extends keyof EditPersonDraft>(key: K, value: EditPersonDraft[K]) => {
      setDraft((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const previewPerson = useMemo(() => draftToPerson(person, draft), [person, draft]);

  const liveWarnings = useMemo(
    () => computeLiveWarnings(previewPerson, allPersons),
    [previewPerson, allPersons]
  );

  const isDirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(initialDraft),
    [draft, initialDraft]
  );

  const clanSuggestions = useMemo(() => {
    const set = new Set<string>();
    Object.values(allPersons).forEach((p) => {
      const c = p.clanName?.trim() || getClanName(p);
      if (c && c !== 'Невідомий рід') {
        set.add(c);
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'uk'));
  }, [allPersons]);

  const handleUploadAvatarFile = useCallback(async (file: File) => {
    try {
      setModalError(null);
      setIsUploadingAvatar(true);
      const url = await uploadFileToServer(file, { kind: 'avatar' });
      setDraft((prev) => ({ ...prev, avatarUrl: url }));
    } catch (err) {
      setModalError((err as Error).message);
    } finally {
      setIsUploadingAvatar(false);
    }
  }, []);

  const handleUploadScreenshotFile = useCallback(async (file: File) => {
    try {
      setModalError(null);
      setIsUploadingScreenshot(true);
      const url = await uploadFileToServer(file, { kind: 'screenshot' });
      setDraft((prev) => ({ ...prev, screenshotUrl: url, isBlankScreenshot: true }));
    } catch (err) {
      setModalError((err as Error).message);
    } finally {
      setIsUploadingScreenshot(false);
    }
  }, []);

  const handleToggleRelationVerification = useCallback((relativeId: string) => {
    setDraft((prev) => ({
      ...prev,
      unverifiedRelations: prev.unverifiedRelations.includes(relativeId)
        ? prev.unverifiedRelations.filter((id) => id !== relativeId)
        : [...prev.unverifiedRelations, relativeId],
    }));
  }, []);

  const handleUnlinkRelative = useCallback(
    (type: 'parent' | 'spouse' | 'child' | 'sibling', id: string) => {
      setDraft((prev) => {
        if (type === 'parent') return { ...prev, parents: prev.parents.filter((pid) => pid !== id) };
        if (type === 'spouse') return { ...prev, spouses: prev.spouses.filter((sid) => sid !== id) };
        if (type === 'child') return { ...prev, children: prev.children.filter((cid) => cid !== id) };
        return { ...prev, siblings: prev.siblings.filter((sid) => sid !== id) };
      });
    },
    []
  );

  const handleUpdateBranchLink = useCallback((linkId: string, patch: Partial<BranchLink>) => {
    setDraft((prev) => ({
      ...prev,
      branchLinks: prev.branchLinks.map((bl) => (bl.id === linkId ? { ...bl, ...patch } : bl)),
    }));
  }, []);

  const handleRemoveBranchLink = useCallback((linkId: string) => {
    setDraft((prev) => ({
      ...prev,
      branchLinks: prev.branchLinks.filter((bl) => bl.id !== linkId),
    }));
  }, []);

  const handleRemoveCrossCanvasLink = useCallback((linkId: string) => {
    setDraft((prev) => ({
      ...prev,
      crossCanvasLinks: prev.crossCanvasLinks.filter((l) => l.id !== linkId),
      ...(linkId === 'legacy-canvas-link' ? { targetCanvasId: '', targetCanvasTitle: '' } : {}),
    }));
  }, []);

  const commitSave = useCallback(() => {
    if (isUploadingAnyMedia) {
      setModalError('Зачекайте, доки завершиться завантаження фотографії...');
      return;
    }
    if (!draft.firstName.trim() && !draft.lastName.trim()) {
      setModalError("Будь ласка, вкажіть хоча б ім'я або прізвище.");
      setActiveTab('basic');
      return;
    }
    const updated = draftToPerson(person, draft);
    const pendingCrossCanvas = pendingCrossCanvasGetterRef.current?.();
    if (pendingCrossCanvas) {
      updated.crossCanvasLinks = upsertCrossCanvasLinkList(updated.crossCanvasLinks, pendingCrossCanvas);
    }
    if (person.isProposal && approveProposalOnSave) {
      updated.isProposal = undefined;
      updated.proposalMeta = undefined;
      if (updated.cardBgColor === '#e0f2fe') {
        updated.cardBgColor = '#e8efe9';
      }
    }
    onSave(updated);
    onClose();
  }, [draft, isUploadingAnyMedia, person, approveProposalOnSave, onSave, onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    commitSave();
  };

  // Keyboard shortcuts: Esc to close, Ctrl/Cmd + S to save
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        commitSave();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose, commitSave]);

  if (!isOpen) return null;

  const relationsCount =
    new Set(draft.parents).size +
    new Set(draft.spouses).size +
    new Set(draft.siblings).size +
    new Set(draft.children).size +
    draft.crossCanvasLinks.length +
    draft.branchLinks.length;

  const displayName =
    [draft.firstName, draft.lastName].filter(Boolean).join(' ').trim() ||
    'Редагувати картку особи';
  const lifeSubtitle = formatPersonLifeDates(previewPerson);
  const genderLabel =
    draft.gender === 'female' ? 'Жінка' : draft.gender === 'male' ? 'Чоловік' : 'Особа';

  const tabs: { id: EditTabType; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: 'basic', label: 'Основне', icon: <Users size={14} /> },
    { id: 'bio', label: 'Біографія', icon: <BookOpen size={14} /> },
    { id: 'relations', label: "Зв'язки", icon: <Heart size={14} />, count: relationsCount },
    { id: 'photos', label: 'Фото', icon: <ImageIcon size={14} />, count: draft.photoAlbum.length },
    { id: 'docs', label: 'Документи', icon: <FileText size={14} />, count: draft.metricDocuments.length },
    { id: 'pets', label: 'Тварини', icon: <Dog size={14} />, count: draft.pets.length },
  ];

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-2.5 sm:p-4 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-[#1c1f24] rounded-2xl shadow-2xl border border-stone-200 dark:border-zinc-800 w-full max-w-4xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 bg-[#f4f7f4] dark:bg-zinc-900/90 border-b border-stone-200 dark:border-zinc-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                draft.gender === 'female'
                  ? 'bg-rose-800 text-white'
                  : 'bg-emerald-800 text-white'
              }`}
            >
              {draft.gender === 'female' ? 'Ж' : 'Ч'}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <h3 className="font-serif-heritage text-lg sm:text-xl font-bold text-stone-900 dark:text-zinc-100 leading-tight truncate">
                  {displayName}
                </h3>
                <span className="px-1.5 py-0.5 rounded-md bg-white dark:bg-zinc-800 border border-stone-200 dark:border-zinc-700 text-[11px] font-mono font-bold text-stone-700 dark:text-zinc-200 shrink-0">
                  {formatCardId(person)}
                </span>
              </div>
              <p className="text-[11.5px] text-stone-500 dark:text-zinc-400 truncate">
                <span>{genderLabel}</span>
                {lifeSubtitle && (
                  <>
                    <span className="mx-1.5">·</span>
                    <span className="font-mono tabular-nums">{lifeSubtitle}</span>
                  </>
                )}
                {draft.clanName.trim() && (
                  <>
                    <span className="mx-1.5">·</span>
                    <span>Рід {draft.clanName.trim()}</span>
                  </>
                )}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-zinc-200 hover:bg-stone-200/60 dark:hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
            title="Закрити (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation Bar */}
        <div className="px-4 sm:px-5 bg-white dark:bg-[#1c1f24] border-b border-stone-200 dark:border-zinc-800 flex items-center gap-1 overflow-x-auto no-scrollbar shrink-0">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold whitespace-nowrap transition-colors shrink-0 cursor-pointer border-b-2 ${
                  isActive
                    ? 'border-emerald-800 dark:border-emerald-400 text-emerald-950 dark:text-emerald-300'
                    : 'border-transparent text-stone-500 dark:text-zinc-400 hover:text-stone-800 dark:hover:text-zinc-200'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
                {typeof tab.count === 'number' && tab.count > 0 && (
                  <span
                    className={`font-mono tabular-nums text-[10.5px] ${
                      isActive
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-stone-400 dark:text-zinc-500'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Two-Column Body + Sticky Footer inside Form */}
        <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 min-h-0 flex overflow-hidden">
            {/* Left Live Preview & Quick Controls Rail (Desktop) */}
            <PersonSummaryRail
              personId={person.id}
              previewPerson={previewPerson}
              draft={draft}
              warnings={liveWarnings}
              isUploadingAvatar={isUploadingAvatar}
              onUpdateField={updateField}
              onUploadAvatarFile={handleUploadAvatarFile}
            />

            {/* Right Active Tab Content */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
              {person.isProposal && (
                <div className="p-3 bg-sky-50 dark:bg-sky-950/40 border border-sky-300 dark:border-sky-800 rounded-xl flex flex-wrap items-center justify-between gap-2.5 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <UserPlus size={15} className="text-sky-600 dark:text-sky-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-bold text-sky-950 dark:text-sky-100">
                        Картка-пропозиція від: {person.proposalMeta?.authorName || 'Гість'}
                      </div>
                      {person.proposalMeta?.note && (
                        <div className="text-[11px] text-sky-800 dark:text-sky-300 truncate">
                          {person.proposalMeta.note}
                        </div>
                      )}
                    </div>
                  </div>
                  <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-zinc-900 border border-sky-200 dark:border-sky-700 text-sky-900 dark:text-sky-200 font-semibold cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={approveProposalOnSave}
                      onChange={(e) => setApproveProposalOnSave(e.target.checked)}
                      className="rounded border-sky-400 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>Підтвердити як постійну картку</span>
                  </label>
                </div>
              )}

              <FirebasePhotoAuthBanner compact />

              {modalError && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/60 rounded-xl text-xs text-rose-800 dark:text-rose-200 flex items-center justify-between gap-2">
                  <span>{modalError}</span>
                  <button
                    type="button"
                    onClick={() => setModalError(null)}
                    className="text-rose-500 hover:text-rose-700 font-bold text-sm cursor-pointer"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}

              {activeTab === 'basic' && (
                <BasicInfoTab
                  personId={person.id}
                  allPersons={allPersons}
                  currentTreeId={currentTreeId}
                  draft={draft}
                  clanSuggestions={clanSuggestions}
                  serverCanvases={serverCanvases}
                  crossCanvasTrees={crossCanvasTrees}
                  warnings={liveWarnings}
                  isUploadingAvatar={isUploadingAvatar}
                  isUploadingScreenshot={isUploadingScreenshot}
                  onUpdateField={updateField}
                  onUploadAvatarFile={handleUploadAvatarFile}
                  onUploadScreenshotFile={handleUploadScreenshotFile}
                  pendingCrossCanvasGetterRef={pendingCrossCanvasGetterRef}
                />
              )}

              {activeTab === 'bio' && (
                <BiographyTab
                  draft={draft}
                  previewPerson={previewPerson}
                  allPersons={allPersons}
                  onUpdateField={updateField}
                />
              )}

              {activeTab === 'relations' && (
                <RelationsTab
                  personId={person.id}
                  draft={draft}
                  allPersons={allPersons}
                  currentTreeId={currentTreeId}
                  crossCanvasTrees={crossCanvasTrees}
                  connectionOverrides={connectionOverrides}
                  onToggleRelationVerification={handleToggleRelationVerification}
                  onUnlinkRelative={handleUnlinkRelative}
                  onUpdateBranchLink={handleUpdateBranchLink}
                  onRemoveBranchLink={handleRemoveBranchLink}
                  onRemoveCrossCanvasLink={handleRemoveCrossCanvasLink}
                />
              )}

              {activeTab === 'photos' && (
                <PhotosTab
                  photos={draft.photoAlbum}
                  currentAvatarUrl={draft.avatarUrl}
                  onChangePhotos={(nextPhotos) => updateField('photoAlbum', nextPhotos)}
                  onSetAsAvatar={(url) => updateField('avatarUrl', url)}
                  onError={(msg) => setModalError(msg)}
                  onUploadingChange={setIsUploadingPhotos}
                />
              )}

              {activeTab === 'docs' && (
                <DocumentsTab
                  metricDocuments={draft.metricDocuments}
                  onChangeDocuments={(docs) => updateField('metricDocuments', docs)}
                  onError={(msg) => setModalError(msg)}
                  onUploadingChange={setIsUploadingDocs}
                />
              )}

              {activeTab === 'pets' && (
                <PetsTab
                  pets={draft.pets}
                  onChangePets={(nextPets) => updateField('pets', nextPets)}
                  onError={(msg) => setModalError(msg)}
                  onUploadingChange={setIsUploadingPet}
                />
              )}
            </div>
          </div>

          {/* Sticky Footer */}
          <div className="px-4 sm:px-5 py-3 bg-stone-50/80 dark:bg-zinc-900/90 border-t border-stone-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-rose-700 dark:text-rose-400 font-medium">
                  Видалити картку?
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onDelete(person.id);
                    onClose();
                  }}
                  className="px-2.5 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg cursor-pointer"
                >
                  Так, видалити
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="px-2.5 py-1.5 text-xs text-stone-600 dark:text-zinc-300 hover:bg-stone-200/70 dark:hover:bg-zinc-800 rounded-lg cursor-pointer"
                >
                  Скасувати
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="px-3 py-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Trash2 size={14} />
                <span>Видалити картку</span>
              </button>
            )}

            <div className="flex items-center gap-2 ml-auto">
              {isDirty && (
                <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-400 font-medium mr-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  Є незбережені зміни
                </span>
              )}

              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 text-xs font-medium text-stone-700 dark:text-zinc-300 hover:bg-stone-200/70 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
              >
                Скасувати
              </button>
              <button
                type="submit"
                disabled={isUploadingAnyMedia}
                className="px-4 sm:px-5 py-2 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 disabled:opacity-60 disabled:cursor-not-allowed rounded-lg shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                title="Зберегти зміни (Ctrl+S)"
              >
                <CheckCircle2 size={14} />
                <span>{isUploadingAnyMedia ? 'Завантаження фото...' : 'Зберегти зміни'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
