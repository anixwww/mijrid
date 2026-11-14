import React, { useState, useMemo, useEffect } from 'react';
import { Person, CrossCanvasLink, BRANCH_LINK_COLOR_PRESETS, BranchLink, BranchLinkCurveStyle, BranchLinkKind } from '../../types/tree';
import { SilhouetteAvatar } from '../SilhouetteAvatar';
import { formatSingleDate, UKRAINIAN_MONTHS } from '../../utils/dateUtils';
import { getBranchLineShapeLabel, normalizeBranchLineShape } from '../../utils/branchLinkGeometry';
import { formatCardId, getPersonIdMatchScore } from '../../utils/cardIdUtils';
import { buildBranchOptions, getClanName } from '../../utils/lineageUtils';
import { CrossCanvasSearchTree } from '../../utils/fileStorage';
import { isSameCanvasId, upsertCrossCanvasLinkList } from '../../utils/crossCanvasLinks';
import { handleUploadImageError } from '../../utils/mediaSync';
import {
  CARD_COLOR_PRESETS,
  EditPersonDraft,
  LiveCardWarning,
  formatDraftYearsDisplay,
} from './types';
import { BranchLinkStyleEditor } from './BranchLinkStyleEditor';
import {
  Upload,
  Calendar,
  Sparkles,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Home,
  Trash2,
  ArrowUpRight,
  Plus,
  Search,
  SlidersHorizontal,
  StickyNote,
  ImagePlus,
  Check,
  Camera,
} from 'lucide-react';

interface BasicInfoTabProps {
  personId: string;
  allPersons: Record<string, Person>;
  currentTreeId?: string;
  draft: EditPersonDraft;
  clanSuggestions: string[];
  serverCanvases: { id: string; title: string }[];
  crossCanvasTrees?: CrossCanvasSearchTree[];
  warnings: LiveCardWarning[];
  isUploadingAvatar: boolean;
  isUploadingScreenshot?: boolean;
  onUpdateField: <K extends keyof EditPersonDraft>(key: K, value: EditPersonDraft[K]) => void;
  onUploadAvatarFile: (file: File) => void;
  onUploadScreenshotFile?: (file: File) => void;
  pendingCrossCanvasGetterRef?: React.MutableRefObject<(() => CrossCanvasLink | null) | null>;
}

const inputBaseClass =
  'w-full min-w-0 text-sm px-3 py-2 rounded-lg border border-stone-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-stone-900 dark:text-zinc-100 placeholder:text-stone-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-600/35 focus:border-emerald-600 dark:focus:border-emerald-500 transition-colors';

const compactInputClass =
  'w-full min-w-0 text-xs px-2.5 py-2 rounded-lg border border-stone-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-stone-900 dark:text-zinc-100 placeholder:text-stone-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-600/35 focus:border-emerald-600 dark:focus:border-emerald-500 transition-colors';

export const BasicInfoTab: React.FC<BasicInfoTabProps> = ({
  personId,
  allPersons,
  currentTreeId,
  draft,
  clanSuggestions,
  serverCanvases,
  crossCanvasTrees = [],
  warnings,
  isUploadingAvatar,
  isUploadingScreenshot = false,
  onUpdateField,
  onUploadAvatarFile,
  onUploadScreenshotFile,
  pendingCrossCanvasGetterRef,
}) => {
  const [showCanvasLink, setShowCanvasLink] = useState(
    Boolean(draft.crossCanvasLinks.length > 0 || draft.targetCanvasId || draft.targetCanvasTitle)
  );
  const [crossCanvasTargetId, setCrossCanvasTargetId] = useState<string>('');
  const [crossCanvasCardSearch, setCrossCanvasCardSearch] = useState<string>('');
  const [crossCanvasTargetPersonId, setCrossCanvasTargetPersonId] = useState<string>('');
  const [crossCanvasLabel, setCrossCanvasLabel] = useState<string>('');
  const [crossCanvasColor, setCrossCanvasColor] = useState<string>('#047857');
  const [showBranchLinks, setShowBranchLinks] = useState(draft.branchLinks.length > 0);
  const [branchSearch, setBranchSearch] = useState('');
  const [selectedTargetBranch, setSelectedTargetBranch] = useState<string>('');
  const [newBranchTargetId, setNewBranchTargetId] = useState('');
  const [newBranchKind, setNewBranchKind] = useState<BranchLinkKind>('branch');
  const [newBranchLabel, setNewBranchLabel] = useState('');
  const [newBranchColor, setNewBranchColor] = useState<string>(BRANCH_LINK_COLOR_PRESETS[0].hex);
  const [newBranchStrokeWidth, setNewBranchStrokeWidth] = useState<number>(2);
  const [newBranchLineShape, setNewBranchLineShape] = useState<BranchLinkCurveStyle>('curved');
  const [editingBranchLinkId, setEditingBranchLinkId] = useState<string | null>(null);
  const [showMobileAppearance, setShowMobileAppearance] = useState(false);

  const otherCanvasTrees = useMemo(() => {
    const sourceTrees =
      crossCanvasTrees.length > 0
        ? crossCanvasTrees
        : serverCanvases.map((c) => ({
            treeId: c.id,
            treeTitle: c.title,
            isMain: false,
            updatedAt: '',
            persons: [],
          }));
    return sourceTrees
      .filter((t) => !currentTreeId || !isSameCanvasId(t.treeId, currentTreeId))
      .sort((a, b) => a.treeTitle.localeCompare(b.treeTitle, 'uk'));
  }, [crossCanvasTrees, serverCanvases, currentTreeId]);

  const effectiveCrossCanvasId =
    crossCanvasTargetId || (otherCanvasTrees.length === 1 ? otherCanvasTrees[0].treeId : '');

  const selectedCrossCanvasTree = useMemo(
    () => otherCanvasTrees.find((t) => isSameCanvasId(t.treeId, effectiveCrossCanvasId)) || null,
    [otherCanvasTrees, effectiveCrossCanvasId]
  );

  const availableCrossCanvasPersons = useMemo(() => {
    if (!selectedCrossCanvasTree) return [];
    const rawQ = crossCanvasCardSearch.trim();
    const q = rawQ.toLowerCase();
    return [...selectedCrossCanvasTree.persons]
      .filter((p) => {
        if (!q) return true;
        if (getPersonIdMatchScore(p, rawQ) > 0) return true;
        const full = `${p.firstName} ${p.lastName} ${p.patronymic || ''} ${p.maidenName || ''} ${p.nickname || ''} ${p.houseNumber || ''} ${p.yearsDisplay || ''}`.toLowerCase();
        return full.includes(q);
      })
      .sort((a, b) => {
        if (rawQ) {
          const sa = getPersonIdMatchScore(a, rawQ);
          const sb = getPersonIdMatchScore(b, rawQ);
          if (sa !== sb) return sb - sa;
        }
        return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'uk');
      });
  }, [selectedCrossCanvasTree, crossCanvasCardSearch]);

  const buildPendingCrossCanvasLink = (): CrossCanvasLink | null => {
    if (!selectedCrossCanvasTree || !crossCanvasTargetPersonId) return null;
    const targetCard = selectedCrossCanvasTree.persons.find((p) => p.id === crossCanvasTargetPersonId);
    if (!targetCard) return null;
    const targetName = [targetCard.firstName, targetCard.lastName].filter(Boolean).join(' ').trim() || 'Картка';
    return {
      id: `ccl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      targetCanvasId: selectedCrossCanvasTree.treeId,
      targetCanvasTitle: selectedCrossCanvasTree.treeTitle,
      targetPersonId: targetCard.id,
      targetPersonName: targetName,
      targetCardId: formatCardId(targetCard),
      label: crossCanvasLabel.trim() || undefined,
      color: crossCanvasColor,
    };
  };

  useEffect(() => {
    if (!pendingCrossCanvasGetterRef) return;
    pendingCrossCanvasGetterRef.current = () => {
      if (!selectedCrossCanvasTree || !crossCanvasTargetPersonId) return null;
      const targetCard = selectedCrossCanvasTree.persons.find((p) => p.id === crossCanvasTargetPersonId);
      if (!targetCard) return null;
      const targetName = [targetCard.firstName, targetCard.lastName].filter(Boolean).join(' ').trim() || 'Картка';
      return {
        id: `ccl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        targetCanvasId: selectedCrossCanvasTree.treeId,
        targetCanvasTitle: selectedCrossCanvasTree.treeTitle,
        targetPersonId: targetCard.id,
        targetPersonName: targetName,
        targetCardId: formatCardId(targetCard),
        label: crossCanvasLabel.trim() || undefined,
        color: crossCanvasColor,
      };
    };
    return () => {
      pendingCrossCanvasGetterRef.current = null;
    };
  }, [
    pendingCrossCanvasGetterRef,
    selectedCrossCanvasTree,
    crossCanvasTargetPersonId,
    crossCanvasLabel,
    crossCanvasColor,
  ]);

  const handleAddCrossCanvasLinkItem = () => {
    const pending = buildPendingCrossCanvasLink();
    if (!pending) return;
    const nextLinks = upsertCrossCanvasLinkList(draft.crossCanvasLinks, pending);
    onUpdateField('crossCanvasLinks', nextLinks);
    setCrossCanvasTargetPersonId('');
    setCrossCanvasLabel('');
  };

  const handleRemoveCrossCanvasLinkItem = (linkId: string) => {
    onUpdateField(
      'crossCanvasLinks',
      draft.crossCanvasLinks.filter((l) => l.id !== linkId)
    );
    if (linkId === 'legacy-canvas-link') {
      onUpdateField('targetCanvasId', '');
      onUpdateField('targetCanvasTitle', '');
    }
  };

  const branchOptions = useMemo(
    () => buildBranchOptions(allPersons, personId),
    [allPersons, personId]
  );

  const effectiveTargetBranch =
    selectedTargetBranch || (branchOptions.length === 1 ? branchOptions[0].name : '');

  const availableBranchTargets = useMemo(() => {
    const rawQ = branchSearch.trim();
    const q = rawQ.toLowerCase();
    if (!effectiveTargetBranch && !q) {
      return [];
    }
    return Object.values(allPersons)
      .filter((p) => p.id !== personId)
      .filter((p) => {
        if (
          effectiveTargetBranch &&
          effectiveTargetBranch !== '__ALL__' &&
          getClanName(p) !== effectiveTargetBranch
        ) {
          return false;
        }
        if (!q) return true;
        if (getPersonIdMatchScore(p, rawQ) > 0) return true;
        const text = `${p.firstName} ${p.lastName} ${p.patronymic || ''} ${p.maidenName || ''} ${p.nickname || ''} ${p.houseNumber || ''} ${p.yearsDisplay || ''} ${getClanName(p)}`.toLowerCase();
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
  }, [allPersons, personId, effectiveTargetBranch, branchSearch]);

  const handleSelectNewBranchKind = (kind: BranchLinkKind) => {
    setNewBranchKind(kind);
    if (kind === 'godparent') {
      setNewBranchLineShape('wavy');
      setNewBranchColor('#d97706');
      if (!newBranchLabel.trim()) {
        setNewBranchLabel(
          draft.gender === 'male'
            ? 'Хресний'
            : draft.gender === 'female'
            ? 'Хресна'
            : 'Хресний / Хресна'
        );
      }
    } else {
      setNewBranchLineShape('curved');
      setNewBranchColor(BRANCH_LINK_COLOR_PRESETS[0].hex);
      if (['Хресний', 'Хресна', 'Хресний / Хресна'].includes(newBranchLabel.trim())) {
        setNewBranchLabel('');
      }
    }
  };

  const handleAddBranchLinkItem = () => {
    if (!newBranchTargetId || newBranchTargetId === personId) return;
    const trimmedLabel =
      newBranchLabel.trim() || (newBranchKind === 'godparent' ? 'Хресний / Хресна' : undefined);
    const existingIdx = draft.branchLinks.findIndex(
      (bl) => bl.targetPersonId === newBranchTargetId && (bl.linkKind || 'branch') === newBranchKind
    );
    if (existingIdx !== -1) {
      const next = [...draft.branchLinks];
      next[existingIdx] = {
        ...next[existingIdx],
        ...(newBranchKind === 'godparent' ? { linkKind: 'godparent' as const } : {}),
        label: trimmedLabel !== undefined ? trimmedLabel : next[existingIdx].label,
        color: newBranchColor,
        strokeWidth: newBranchStrokeWidth,
        lineShape: newBranchLineShape,
      };
      onUpdateField('branchLinks', next);
    } else {
      onUpdateField('branchLinks', [
        ...draft.branchLinks,
        {
          id: `bl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          targetPersonId: newBranchTargetId,
          ...(newBranchKind === 'godparent' ? { linkKind: 'godparent' as const } : {}),
          label: trimmedLabel,
          color: newBranchColor,
          strokeWidth: newBranchStrokeWidth,
          lineShape: newBranchLineShape,
        },
      ]);
    }
    setNewBranchTargetId('');
    setNewBranchLabel(newBranchKind === 'godparent' ? 'Хресний / Хресна' : '');
  };

  const handleUpdateBranchLinkItem = (linkId: string, patch: Partial<BranchLink>) => {
    onUpdateField(
      'branchLinks',
      draft.branchLinks.map((bl) => (bl.id === linkId ? { ...bl, ...patch } : bl))
    );
  };

  const handleRemoveBranchLinkItem = (linkId: string) => {
    if (editingBranchLinkId === linkId) setEditingBranchLinkId(null);
    onUpdateField(
      'branchLinks',
      draft.branchLinks.filter((bl) => bl.id !== linkId)
    );
  };

  const formattedBirthPreview = formatSingleDate(
    draft.birthDay,
    draft.birthMonth,
    draft.birthYear,
    '.',
    draft.birthDateType === 'period' ? draft.birthYearEnd : undefined,
    draft.birthDateType === 'about'
  );

  const formattedDeathPreview = draft.isDeceased
    ? formatSingleDate(draft.deathDay, draft.deathMonth, draft.deathYear, '.')
    : '';

  const handleMobileAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onUploadAvatarFile(file);
    e.target.value = '';
  };

  const handleAutoGenerateYears = () => {
    onUpdateField('yearsDisplay', formatDraftYearsDisplay(draft));
  };

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-150">
      {/* Mobile-only live alerts (on desktop they live in the left rail) */}
      {warnings.length > 0 && (
        <div className="md:hidden space-y-1.5">
          {warnings.map((w) => (
            <div
              key={w.id}
              className={`p-2.5 rounded-lg border text-xs flex items-start gap-2 ${
                w.severity === 'error'
                  ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/60 text-rose-900 dark:text-rose-200'
                  : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200'
              }`}
            >
              {w.severity === 'error' ? (
                <AlertCircle size={14} className="text-rose-600 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
              )}
              <span>{w.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Mobile-only Portrait Bar */}
      <div className="md:hidden flex items-center gap-3.5 pb-4 border-b border-stone-200 dark:border-zinc-800">
        <SilhouetteAvatar
          gender={draft.gender}
          avatarUrl={draft.avatarUrl}
          name={`${draft.firstName} ${draft.lastName}`}
          size="lg"
        />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="text-xs font-semibold text-stone-800 dark:text-zinc-200">Світлина</div>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-stone-50 dark:hover:bg-zinc-700 text-xs text-stone-800 dark:text-zinc-200 font-medium transition-colors">
              <Upload size={13} className="text-emerald-700 dark:text-emerald-400" />
              <span>
                {isUploadingAvatar
                  ? 'Завантаження...'
                  : draft.avatarUrl
                  ? 'Змінити фото'
                  : 'Завантажити фото'}
              </span>
              <input
                type="file"
                accept="image/*"
                onChange={handleMobileAvatarChange}
                disabled={isUploadingAvatar}
                className="hidden"
              />
            </label>
            {draft.avatarUrl && (
              <button
                type="button"
                onClick={() => onUpdateField('avatarUrl', undefined)}
                className="inline-flex items-center gap-1 px-2 py-1.5 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg cursor-pointer"
              >
                <Trash2 size={13} />
                <span>Видалити</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 1: Identity & Names */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h4 className="text-xs font-semibold tracking-wide text-stone-500 dark:text-zinc-400">
            01 · Ідентифікація та імена
          </h4>

          {/* Gender Segmented Switch */}
          <div className="inline-flex items-center bg-stone-100 dark:bg-zinc-800 border border-stone-200 dark:border-zinc-700 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => onUpdateField('gender', 'male')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                draft.gender === 'male'
                  ? 'bg-sky-800 text-white shadow-2xs'
                  : 'text-stone-600 dark:text-zinc-300 hover:text-stone-900 dark:hover:text-white'
              }`}
            >
              Чоловіча
            </button>
            <button
              type="button"
              onClick={() => onUpdateField('gender', 'female')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                draft.gender === 'female'
                  ? 'bg-rose-800 text-white shadow-2xs'
                  : 'text-stone-600 dark:text-zinc-300 hover:text-stone-900 dark:hover:text-white'
              }`}
            >
              Жіноча
            </button>
          </div>
        </div>

        {/* Sticky Note Card Banner & Textarea */}
        <div
          className={`p-3 rounded-xl border transition-colors space-y-2.5 ${
            draft.isGhost
              ? 'border-amber-300 dark:border-amber-700/80 bg-amber-50/75 dark:bg-amber-950/20'
              : 'border-stone-200/80 dark:border-zinc-800 bg-stone-50/50 dark:bg-zinc-900/40'
          }`}
        >
          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <div className="flex items-center gap-2 min-w-0">
              <StickyNote
                size={15}
                className={draft.isGhost ? 'text-amber-600 dark:text-amber-400 shrink-0' : 'text-stone-400 shrink-0'}
              />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-stone-800 dark:text-zinc-200">
                  Нотатка-стікер на полотні
                </div>
                <div className="text-[11px] text-stone-500 dark:text-zinc-400">
                  Відображається на полотні як стікер; усі зв&apos;язки з картками — пунктирною лінією
                </div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={draft.isGhost}
              onChange={(e) => {
                const checked = e.target.checked;
                onUpdateField('isGhost', checked);
                if (checked && draft.isBlankScreenshot) {
                  onUpdateField('isBlankScreenshot', false);
                }
                if (checked && (!draft.cardBgColor || draft.cardBgColor === '#e8efe9' || draft.cardBgColor === '#f1f5f9')) {
                  onUpdateField('cardBgColor', '#fef3c7');
                }
              }}
              className="w-4 h-4 rounded border-stone-300 text-amber-600 accent-amber-600 cursor-pointer shrink-0"
            />
          </label>

          {draft.isGhost && (
            <div className="pt-1 space-y-1">
              <label className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-900 dark:text-amber-300">
                <StickyNote size={12} className="text-amber-600 dark:text-amber-400" />
                <span>Текст нотатки на стікері</span>
              </label>
              <textarea
                rows={3}
                value={draft.ghostNote}
                onChange={(e) => onUpdateField('ghostNote', e.target.value)}
                placeholder="Введіть текст нотатки, гіпотезу або згадку з метрики..."
                className="w-full min-w-0 text-xs px-3 py-2 rounded-lg border border-amber-300/90 dark:border-amber-800/70 bg-white dark:bg-zinc-950 text-stone-900 dark:text-zinc-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500/35 focus:border-amber-500 resize-y"
              />
            </div>
          )}
        </div>

        {/* Blank Screenshot Card (Undeciphered Record) Banner & Upload */}
        <div
          className={`p-3 rounded-xl border transition-colors space-y-2.5 ${
            draft.isBlankScreenshot
              ? 'border-dashed border-amber-400 dark:border-amber-700 bg-amber-50/70 dark:bg-amber-950/20'
              : 'border-stone-200/80 dark:border-zinc-800 bg-stone-50/50 dark:bg-zinc-900/40'
          }`}
        >
          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <div className="flex items-center gap-2 min-w-0">
              <ImagePlus
                size={15}
                className={draft.isBlankScreenshot ? 'text-amber-700 dark:text-amber-400 shrink-0' : 'text-stone-400 shrink-0'}
              />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-stone-800 dark:text-zinc-200">
                  Порожня картка-скріншот (нерозшифрований запис)
                </div>
                <div className="text-[11px] text-stone-500 dark:text-zinc-400">
                  На полотні відображатиметься лише скріншот на всю ширину й висоту картки
                </div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={draft.isBlankScreenshot}
              onChange={(e) => {
                const checked = e.target.checked;
                onUpdateField('isBlankScreenshot', checked);
                if (checked && draft.isGhost) {
                  onUpdateField('isGhost', false);
                }
              }}
              className="w-4 h-4 rounded border-stone-300 text-amber-600 accent-amber-600 cursor-pointer shrink-0"
            />
          </label>

          {draft.isBlankScreenshot && onUploadScreenshotFile && (
            <div className="pt-1 space-y-2.5">
              <div className="flex items-center gap-3 flex-wrap">
                {draft.screenshotUrl && (
                  <img
                    src={draft.screenshotUrl}
                    alt="Скріншот запису"
                    onError={(e) => handleUploadImageError(e, draft.screenshotUrl)}
                    className={`w-16 h-16 rounded-lg border border-amber-300 dark:border-amber-700 shrink-0 bg-zinc-900 ${
                      draft.screenshotFit === 'contain' ? 'object-contain' : 'object-cover'
                    }`}
                  />
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-zinc-900 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-xs font-semibold text-amber-900 dark:text-amber-200 transition-colors">
                    <Upload size={13} />
                    <span>
                      {isUploadingScreenshot
                        ? 'Завантаження...'
                        : draft.screenshotUrl
                        ? 'Замінити фото'
                        : 'Завантажити фото'}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={isUploadingScreenshot}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) onUploadScreenshotFile(file);
                        e.target.value = '';
                      }}
                      className="hidden"
                    />
                  </label>
                  {draft.screenshotUrl && (
                    <button
                      type="button"
                      onClick={() => onUpdateField('screenshotUrl', undefined)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                    >
                      <Trash2 size={13} />
                      <span>Прибрати фото</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Quick conversion actions to standard Person card */}
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    if (
                      draft.screenshotUrl &&
                      !draft.metricDocuments.some((d) => d.url === draft.screenshotUrl)
                    ) {
                      onUpdateField('metricDocuments', [
                        ...draft.metricDocuments,
                        {
                          id: `doc-${Date.now()}`,
                          type: 'other',
                          url: draft.screenshotUrl,
                          title:
                            draft.firstName && draft.firstName !== 'Нерозшифрований запис'
                              ? `Фото: ${draft.firstName}`
                              : 'Фото нерозшифрованого запису',
                        },
                      ]);
                    }
                    if (draft.firstName === 'Нерозшифрований запис') {
                      onUpdateField('firstName', '');
                    }
                    onUpdateField('isBlankScreenshot', false);
                    onUpdateField('screenshotUrl', undefined);
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-semibold transition-colors cursor-pointer shadow-2xs"
                  title="Перевести у звичайну картку особи (фото збережеться в документах)"
                >
                  <Check size={12} />
                  <span>Розшифровано → Картка</span>
                </button>
                {draft.screenshotUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      if (draft.firstName === 'Нерозшифрований запис') {
                        onUpdateField('firstName', '');
                      }
                      onUpdateField('avatarUrl', draft.screenshotUrl);
                      onUpdateField('isBlankScreenshot', false);
                      onUpdateField('screenshotUrl', undefined);
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-semibold transition-colors cursor-pointer shadow-2xs"
                    title="Перевести у звичайну картку особи і поставити це фото як портрет (аватар)"
                  >
                    <Camera size={12} />
                    <span>Як аватар</span>
                  </button>
                )}
              </div>

              {/* Photo Framing Mode */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[11px] font-medium text-stone-600 dark:text-zinc-400">
                  Відображення на картці:
                </span>
                <div className="inline-flex items-center p-0.5 rounded-lg bg-stone-200/70 dark:bg-zinc-800 border border-stone-200 dark:border-zinc-700">
                  <button
                    type="button"
                    onClick={() => onUpdateField('screenshotFit', 'cover')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                      draft.screenshotFit !== 'contain'
                        ? 'bg-white dark:bg-zinc-900 text-stone-900 dark:text-zinc-100 shadow-2xs'
                        : 'text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-200'
                    }`}
                  >
                    На всю картку
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdateField('screenshotFit', 'contain')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                      draft.screenshotFit === 'contain'
                        ? 'bg-white dark:bg-zinc-900 text-stone-900 dark:text-zinc-100 shadow-2xs'
                        : 'text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-200'
                    }`}
                  >
                    Помістити цілком
                  </button>
                </div>
              </div>

              {/* Photo Note */}
              <div className="space-y-1">
                <label className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-900 dark:text-amber-300">
                  <StickyNote size={12} className="text-amber-600 dark:text-amber-400" />
                  <span>Нотатка / звідки фото</span>
                </label>
                <textarea
                  rows={2}
                  value={draft.ghostNote}
                  onChange={(e) => onUpdateField('ghostNote', e.target.value)}
                  placeholder="Напр.: Метрична книга 1906 р., аркуш 14..."
                  className="w-full min-w-0 text-xs px-3 py-2 rounded-lg border border-amber-300/80 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-stone-900 dark:text-zinc-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500/35 resize-y"
                />
              </div>
            </div>
          )}
        </div>

        {/* Core Name Fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div className="min-w-0">
            <label className="block text-xs font-medium text-stone-700 dark:text-zinc-300 mb-1">
              Ім&apos;я <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={draft.firstName}
              onChange={(e) => onUpdateField('firstName', e.target.value)}
              placeholder="напр. Тарас"
              className={inputBaseClass}
            />
          </div>

          <div className="min-w-0">
            <label className="block text-xs font-medium text-stone-700 dark:text-zinc-300 mb-1">
              Прізвище
            </label>
            <input
              type="text"
              value={draft.lastName}
              onChange={(e) => onUpdateField('lastName', e.target.value)}
              placeholder="напр. Коваленко"
              className={inputBaseClass}
            />
          </div>

          <div className="min-w-0">
            <label className="block text-xs font-medium text-stone-700 dark:text-zinc-300 mb-1">
              По батькові
            </label>
            <input
              type="text"
              value={draft.patronymic}
              onChange={(e) => onUpdateField('patronymic', e.target.value)}
              placeholder="напр. Григорович"
              className={inputBaseClass}
            />
          </div>

          <div className="min-w-0">
            <label className="flex items-center justify-between gap-2 text-xs font-medium text-stone-700 dark:text-zinc-300 mb-1">
              <span>Рід (родинна гілка)</span>
              <span className="text-[10.5px] font-normal text-stone-400 dark:text-zinc-500">
                необов&apos;язково
              </span>
            </label>
            <input
              type="text"
              list="edit-person-clan-suggestions"
              value={draft.clanName}
              onChange={(e) => onUpdateField('clanName', e.target.value)}
              placeholder="напр. Кобилецький або Даньків"
              className={inputBaseClass}
            />
            {clanSuggestions.length > 0 && (
              <datalist id="edit-person-clan-suggestions">
                {clanSuggestions.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            )}
          </div>
        </div>

        {/* Maiden Name, Nickname, House Number */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          {draft.gender === 'female' && (
            <div className="min-w-0">
              <label className="block text-xs font-medium text-stone-700 dark:text-zinc-300 mb-1">
                Дівоче прізвище
              </label>
              <input
                type="text"
                value={draft.maidenName}
                onChange={(e) => onUpdateField('maidenName', e.target.value)}
                placeholder="напр. Коваль"
                className={inputBaseClass}
              />
            </div>
          )}

          <div className={`min-w-0 ${draft.gender === 'female' ? '' : 'sm:col-span-2'}`}>
            <label className="block text-xs font-medium text-stone-700 dark:text-zinc-300 mb-1">
              Прізвисько («придомок»)
            </label>
            <input
              type="text"
              value={draft.nickname}
              onChange={(e) => onUpdateField('nickname', e.target.value)}
              placeholder="напр. Чут або Кулинич"
              className={inputBaseClass}
            />
          </div>

          <div className="min-w-0">
            <label
              className="flex items-center gap-1.5 text-xs font-medium text-stone-700 dark:text-zinc-300 mb-1 whitespace-nowrap"
              title="Номер дому народження"
            >
              <Home size={13} className="text-emerald-700 dark:text-emerald-400 shrink-0" />
              <span>Номер дому (№)</span>
            </label>
            <div className="relative flex items-center">
              <input
                type="text"
                value={draft.houseNumber}
                onChange={(e) => onUpdateField('houseNumber', e.target.value)}
                placeholder="47 або 12а"
                className={`${inputBaseClass} font-mono tabular-nums ${
                  draft.houseNumber.trim() ? 'pr-14' : ''
                }`}
              />
              {draft.houseNumber.trim() && (
                <span
                  className="absolute right-2 px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700 text-[10.5px] font-mono font-bold text-emerald-900 dark:text-emerald-300 pointer-events-none"
                  title="Відображатиметься на картці"
                >
                  №{draft.houseNumber.trim()}
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2: Life Chronology */}
      <section className="pt-5 border-t border-stone-200 dark:border-zinc-800 space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold tracking-wide text-stone-500 dark:text-zinc-400 flex items-center gap-1.5">
            <Calendar size={13} className="text-emerald-700 dark:text-emerald-400" />
            <span>02 · Хронологія життя</span>
          </h4>
        </div>

        {/* Birth Date Block */}
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-stone-800 dark:text-zinc-200">
              Дата народження
            </span>
            <span className="text-xs font-mono tabular-nums text-emerald-800 dark:text-emerald-400 font-medium">
              {formattedBirthPreview || 'Не вказано'}
            </span>
          </div>

          {/* Date Precision Mode Switch */}
          <div className="flex items-center gap-1 bg-stone-100 dark:bg-zinc-800/90 p-0.5 rounded-lg text-[11px] border border-stone-200/80 dark:border-zinc-700/80">
            <button
              type="button"
              onClick={() => {
                onUpdateField('birthDateType', 'exact');
                onUpdateField('isBirthDateApproximate', false);
              }}
              className={`flex-1 py-1.5 px-2 rounded-md font-medium transition-all cursor-pointer ${
                draft.birthDateType === 'exact'
                  ? 'bg-white dark:bg-zinc-900 text-stone-900 dark:text-zinc-100 font-semibold shadow-2xs'
                  : 'text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-200'
              }`}
            >
              Точна дата
            </button>
            <button
              type="button"
              onClick={() => {
                onUpdateField('birthDateType', 'period');
                onUpdateField('isBirthDateApproximate', true);
              }}
              className={`flex-1 py-1.5 px-2 rounded-md font-medium transition-all cursor-pointer ${
                draft.birthDateType === 'period'
                  ? 'bg-white dark:bg-zinc-900 text-stone-900 dark:text-zinc-100 font-semibold shadow-2xs'
                  : 'text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-200'
              }`}
            >
              Період років
            </button>
            <button
              type="button"
              onClick={() => {
                onUpdateField('birthDateType', 'about');
                onUpdateField('isBirthDateApproximate', true);
              }}
              className={`flex-1 py-1.5 px-2 rounded-md font-medium transition-all cursor-pointer ${
                draft.birthDateType === 'about'
                  ? 'bg-white dark:bg-zinc-900 text-stone-900 dark:text-zinc-100 font-semibold shadow-2xs'
                  : 'text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-200'
              }`}
            >
              Близько (бл.)
            </button>
          </div>

          {draft.birthDateType !== 'period' ? (
            <div className="grid grid-cols-3 gap-2.5">
              <div className="min-w-0">
                <label className="block text-[11px] text-stone-500 dark:text-zinc-400 mb-1">
                  Число
                </label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={draft.birthDay}
                  onChange={(e) => onUpdateField('birthDay', e.target.value)}
                  placeholder="1–31"
                  className={`${compactInputClass} font-mono tabular-nums`}
                />
              </div>
              <div className="min-w-0">
                <label className="block text-[11px] text-stone-500 dark:text-zinc-400 mb-1">
                  Місяць
                </label>
                <select
                  value={draft.birthMonth}
                  onChange={(e) => onUpdateField('birthMonth', e.target.value)}
                  className={compactInputClass}
                >
                  <option value="">Не обрано</option>
                  {UKRAINIAN_MONTHS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-0">
                <label className="block text-[11px] text-stone-500 dark:text-zinc-400 mb-1">
                  {draft.birthDateType === 'about' ? 'Рік (бл.)' : 'Рік'}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={draft.birthYear}
                  onChange={(e) => onUpdateField('birthYear', e.target.value)}
                  placeholder="1925"
                  className={`${compactInputClass} font-mono tabular-nums`}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="grid grid-cols-2 gap-2.5">
                <div className="min-w-0">
                  <label className="block text-[11px] text-stone-500 dark:text-zinc-400 mb-1">
                    Рік від
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={draft.birthYear}
                    onChange={(e) => onUpdateField('birthYear', e.target.value)}
                    placeholder="1910"
                    className={`${compactInputClass} font-mono tabular-nums`}
                  />
                </div>
                <div className="min-w-0">
                  <label className="block text-[11px] text-stone-500 dark:text-zinc-400 mb-1">
                    Рік до
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={draft.birthYearEnd}
                    onChange={(e) => onUpdateField('birthYearEnd', e.target.value)}
                    placeholder="1912"
                    className={`${compactInputClass} font-mono tabular-nums`}
                  />
                </div>
              </div>
              <p className="text-[11px] text-stone-500 dark:text-zinc-400">
                Використовуйте діапазон, якщо в метриках або переписах рік зазначено орієнтовно.
              </p>
            </div>
          )}
        </div>

        {/* Death Date Block */}
        <div className="pt-3 border-t border-stone-100 dark:border-zinc-800/80 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-stone-800 dark:text-zinc-200 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={draft.isDeceased}
                onChange={(e) => onUpdateField('isDeceased', e.target.checked)}
                className="w-4 h-4 rounded border-stone-300 text-stone-800 focus:ring-stone-600 accent-stone-800 cursor-pointer"
              />
              <span>Особа померла (вказати дату смерті)</span>
            </label>
            {draft.isDeceased && (
              <span className="text-xs font-mono tabular-nums text-stone-600 dark:text-zinc-400 font-medium">
                {formattedDeathPreview || 'Дата не вказана'}
              </span>
            )}
          </div>

          {draft.isDeceased && (
            <div className="grid grid-cols-3 gap-2.5 animate-in fade-in-50 duration-150">
              <div className="min-w-0">
                <label className="block text-[11px] text-stone-500 dark:text-zinc-400 mb-1">
                  Число
                </label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={draft.deathDay}
                  onChange={(e) => onUpdateField('deathDay', e.target.value)}
                  placeholder="1–31"
                  className={`${compactInputClass} font-mono tabular-nums`}
                />
              </div>
              <div className="min-w-0">
                <label className="block text-[11px] text-stone-500 dark:text-zinc-400 mb-1">
                  Місяць
                </label>
                <select
                  value={draft.deathMonth}
                  onChange={(e) => onUpdateField('deathMonth', e.target.value)}
                  className={compactInputClass}
                >
                  <option value="">Не обрано</option>
                  {UKRAINIAN_MONTHS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-0">
                <label className="block text-[11px] text-stone-500 dark:text-zinc-400 mb-1">
                  Рік
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={draft.deathYear}
                  onChange={(e) => onUpdateField('deathYear', e.target.value)}
                  placeholder="1994"
                  className={`${compactInputClass} font-mono tabular-nums`}
                />
              </div>
            </div>
          )}
        </div>

        {/* Custom Years Display Label */}
        <div className="pt-2">
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-stone-700 dark:text-zinc-300">
              Напис дат на картці
            </label>
            <button
              type="button"
              onClick={handleAutoGenerateYears}
              className="text-[11px] font-medium text-emerald-800 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
              title="Сформувати напис на основі введених чисел, місяців та років"
            >
              <Sparkles size={12} />
              <span>Оновити з дат</span>
            </button>
          </div>
          <input
            type="text"
            value={draft.yearsDisplay}
            onChange={(e) => onUpdateField('yearsDisplay', e.target.value)}
            placeholder="напр. 08.07.1925 — 18.09.1994"
            className={`${compactInputClass} font-mono tabular-nums`}
          />
        </div>
      </section>

      {/* SECTION 3: Cross-Canvas Links (Between Different Canvases) */}
      <section className="pt-4 border-t border-stone-200 dark:border-zinc-800">
        <button
          type="button"
          onClick={() => setShowCanvasLink((prev) => !prev)}
          className="w-full flex items-center justify-between py-1 text-left cursor-pointer group"
        >
          <div className="flex items-center gap-2 min-w-0">
            <ExternalLink size={14} className="text-emerald-700 dark:text-emerald-400 shrink-0" />
            <span className="text-xs font-semibold text-stone-800 dark:text-zinc-200 group-hover:text-emerald-800 dark:group-hover:text-emerald-400 transition-colors">
              Міжгілкові зв&apos;язки (між полотнами)
            </span>
            {draft.crossCanvasLinks.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/70 text-[10px] font-bold">
                {draft.crossCanvasLinks.length}
              </span>
            )}
          </div>
          {showCanvasLink ? (
            <ChevronUp size={15} className="text-stone-400 shrink-0" />
          ) : (
            <ChevronDown size={15} className="text-stone-400 shrink-0" />
          )}
        </button>

        {showCanvasLink && (
          <div className="mt-3 space-y-3 pl-4 border-l-2 border-emerald-200 dark:border-emerald-900/70 animate-in fade-in-50 duration-150">
            <p className="text-[11px] text-stone-500 dark:text-zinc-400 leading-relaxed">
              Пов&apos;яжіть цю картку з конкретною карткою на іншому полотні (гілці), щоб переходити між полотнами одним кліком.
            </p>

            {/* Existing cross-canvas links */}
            {draft.crossCanvasLinks.length > 0 && (
              <div className="space-y-1.5">
                {draft.crossCanvasLinks.map((ccl) => (
                  <div
                    key={ccl.id}
                    className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border border-emerald-200/80 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/20 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: ccl.color || '#047857' }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-stone-900 dark:text-zinc-100 truncate flex items-center gap-1.5">
                          <span className="px-1.5 py-0.2 rounded bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 text-[10px] font-bold shrink-0">
                            {ccl.targetCanvasTitle || 'Полотно'}
                          </span>
                          {ccl.targetCardId && (
                            <span className="px-1 py-0.2 rounded bg-white dark:bg-zinc-800 border border-emerald-200 dark:border-zinc-700 font-mono text-[10px] font-bold text-stone-700 dark:text-zinc-200 shrink-0">
                              {ccl.targetCardId}
                            </span>
                          )}
                          {ccl.targetPersonName && (
                            <span className="truncate">→ {ccl.targetPersonName}</span>
                          )}
                        </div>
                        {ccl.label && (
                          <div className="text-[10.5px] text-emerald-800 dark:text-emerald-300 truncate">
                            {ccl.label}
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveCrossCanvasLinkItem(ccl.id)}
                      className="p-1 text-stone-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-md hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer shrink-0"
                      title="Прибрати міжгілкове посилання"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add new cross-canvas link (Step 1 Canvas -> Step 2 Card) */}
            {otherCanvasTrees.length === 0 ? (
              <div className="p-2.5 rounded-lg bg-stone-50 dark:bg-zinc-900/70 border border-stone-200 dark:border-zinc-800 text-[11px] text-stone-500 dark:text-zinc-400">
                Інших полотен (гілок) ще не створено. Створіть нове полотно через меню «Полотна / гілки».
              </div>
            ) : (
              <div className="p-2.5 rounded-xl bg-stone-50/80 dark:bg-zinc-900/70 border border-stone-200/80 dark:border-zinc-800 space-y-2.5">
                <div className="space-y-1">
                  <label className="block text-[10.5px] font-semibold text-stone-600 dark:text-zinc-400">
                    1. Спочатку оберіть гілку (полотно)
                  </label>
                  <select
                    value={effectiveCrossCanvasId}
                    onChange={(e) => {
                      setCrossCanvasTargetId(e.target.value);
                      setCrossCanvasTargetPersonId('');
                      setCrossCanvasCardSearch('');
                    }}
                    className={compactInputClass}
                  >
                    <option value="">— 1. Оберіть полотно —</option>
                    {otherCanvasTrees.map((t) => (
                      <option key={t.treeId} value={t.treeId}>
                        {t.treeTitle} ({t.persons.length} карток)
                      </option>
                    ))}
                  </select>
                </div>

                {selectedCrossCanvasTree && (
                  <>
                    <div className="relative">
                      <Search size={12.5} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
                      <input
                        type="text"
                        value={crossCanvasCardSearch}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCrossCanvasCardSearch(val);
                          const trimmed = val.trim();
                          if (trimmed) {
                            const exactMatch = selectedCrossCanvasTree.persons.find(
                              (p) => getPersonIdMatchScore(p, trimmed) === 3
                            );
                            if (exactMatch) {
                              setCrossCanvasTargetPersonId(exactMatch.id);
                            }
                          }
                        }}
                        placeholder="Пошук картки на полотні за ID (#12) або ПІБ..."
                        className={`${compactInputClass} pl-7 ${crossCanvasCardSearch.trim() ? 'pr-20' : ''}`}
                      />
                      {crossCanvasCardSearch.trim() && (
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono font-semibold text-stone-500 dark:text-zinc-400 pointer-events-none">
                          {availableCrossCanvasPersons.length} збіг.
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <select
                        value={crossCanvasTargetPersonId}
                        onChange={(e) => setCrossCanvasTargetPersonId(e.target.value)}
                        className={compactInputClass}
                      >
                        <option value="">— 2. Оберіть картку —</option>
                        {availableCrossCanvasPersons.map((p) => {
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
                        value={crossCanvasLabel}
                        onChange={(e) => setCrossCanvasLabel(e.target.value)}
                        placeholder="Підпис (необов'язково)"
                        className={compactInputClass}
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <div className="flex items-center gap-1.5">
                        {['#047857', ...BRANCH_LINK_COLOR_PRESETS.slice(0, 5).map((c) => c.hex)].map((hex) => (
                          <button
                            key={hex}
                            type="button"
                            onClick={() => setCrossCanvasColor(hex)}
                            style={{ backgroundColor: hex }}
                            className={`w-5 h-5 rounded-full transition-transform hover:scale-110 cursor-pointer ${
                              crossCanvasColor.toLowerCase() === hex.toLowerCase()
                                ? 'ring-2 ring-offset-1 ring-stone-800 dark:ring-white'
                                : 'opacity-80'
                            }`}
                          />
                        ))}
                      </div>
                      <button
                        type="button"
                        disabled={!crossCanvasTargetPersonId}
                        onClick={handleAddCrossCanvasLinkItem}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:opacity-45 disabled:cursor-not-allowed text-white text-[11px] font-semibold transition-colors cursor-pointer"
                      >
                        <Plus size={12.5} />
                        <span>Додати зв&apos;язок між полотнами</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* SECTION 4: Same-Canvas Card Links (Godparent / Distant Card Arrows) */}
      <section className="pt-4 border-t border-stone-200 dark:border-zinc-800">
        <button
          type="button"
          onClick={() => setShowBranchLinks((prev) => !prev)}
          className="w-full flex items-center justify-between py-1 text-left cursor-pointer group"
        >
          <div className="flex items-center gap-2 min-w-0">
            <ArrowUpRight size={14} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span className="text-xs font-semibold text-stone-800 dark:text-zinc-200 group-hover:text-indigo-700 dark:group-hover:text-indigo-400 transition-colors">
              Стрілки на поточному полотні (хресні / посилання)
            </span>
            {draft.branchLinks.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/70 text-[10px] font-bold">
                {draft.branchLinks.length}
              </span>
            )}
          </div>
          {showBranchLinks ? (
            <ChevronUp size={15} className="text-stone-400 shrink-0" />
          ) : (
            <ChevronDown size={15} className="text-stone-400 shrink-0" />
          )}
        </button>

        {showBranchLinks && (
          <div className="mt-3 space-y-3 pl-4 border-l-2 border-indigo-200 dark:border-indigo-900/70 animate-in fade-in-50 duration-150">
            <p className="text-[11px] text-stone-500 dark:text-zinc-400 leading-relaxed">
              Проведіть хвилясту лінію «Хресний / Хресна» або стрілку до іншої картки в межах поточного полотна.
            </p>

            {/* Existing links */}
            {draft.branchLinks.length > 0 && (
              <div className="space-y-1.5">
                {draft.branchLinks.map((bl) => {
                  const target = allPersons[bl.targetPersonId];
                  const targetName = target
                    ? [target.firstName, target.lastName].filter(Boolean).join(' ') || 'Без імені'
                    : `Видалена картка (${bl.targetPersonId})`;
                  const isEditingThis = editingBranchLinkId === bl.id;
                  const shapeText = getBranchLineShapeLabel(bl.lineShape);
                  const widthVal = bl.strokeWidth ?? 2;
                  return (
                    <div
                      key={bl.id}
                      className="rounded-lg border border-stone-200 dark:border-zinc-700 bg-stone-50/70 dark:bg-zinc-800/60 text-xs overflow-hidden"
                    >
                      <div className="flex items-center justify-between gap-2 px-2.5 py-1.5">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {bl.linkKind === 'godparent' ? (
                            <span
                              className="text-xs leading-none shrink-0 font-bold"
                              style={{ color: bl.color || '#d97706' }}
                            >
                              ✝
                            </span>
                          ) : (
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: bl.color || '#4f46e5' }}
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-stone-900 dark:text-zinc-100 truncate">
                              {target && (
                                <span className="mr-1.5 px-1 py-0.2 rounded bg-indigo-100/80 dark:bg-indigo-900/50 text-indigo-800 dark:text-indigo-200 font-mono text-[10px] font-bold">
                                  {formatCardId(target)}
                                </span>
                              )}
                              {targetName}
                              {target?.yearsDisplay && (
                                <span className="ml-1.5 text-[10px] font-mono text-stone-400 font-normal">
                                  ({target.yearsDisplay})
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {bl.label && (
                                <span className="text-[10.5px] text-indigo-700 dark:text-indigo-300 truncate">
                                  {bl.label}
                                </span>
                              )}
                              <span className="text-[9.5px] font-mono text-stone-500 dark:text-zinc-400">
                                {shapeText} · {widthVal}px
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              setEditingBranchLinkId((prev) => (prev === bl.id ? null : bl.id))
                            }
                            className={`p-1 rounded-md transition-colors cursor-pointer ${
                              isEditingThis
                                ? 'bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300'
                                : 'text-stone-400 hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40'
                            }`}
                            title="Налаштувати стиль (колір, товщина, форма лінії)"
                          >
                            <SlidersHorizontal size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveBranchLinkItem(bl.id)}
                            className="p-1 text-stone-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-md hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                            title="Прибрати посилання"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      {isEditingThis && (
                        <div className="px-3 pb-3 border-t border-stone-200/80 dark:border-zinc-700/80 bg-white/80 dark:bg-zinc-900/70">
                          <BranchLinkStyleEditor
                            label={bl.label || ''}
                            onChangeLabel={(val) =>
                              handleUpdateBranchLinkItem(bl.id, { label: val || undefined })
                            }
                            color={bl.color || (bl.linkKind === 'godparent' ? '#d97706' : '#4f46e5')}
                            onChangeColor={(c) => handleUpdateBranchLinkItem(bl.id, { color: c })}
                            strokeWidth={bl.strokeWidth ?? 2}
                            onChangeStrokeWidth={(w) =>
                              handleUpdateBranchLinkItem(bl.id, { strokeWidth: w })
                            }
                            lineShape={normalizeBranchLineShape(bl.lineShape)}
                            onChangeLineShape={(shape) =>
                              handleUpdateBranchLinkItem(bl.id, { lineShape: shape })
                            }
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add new link */}
            <div className="p-2.5 rounded-xl bg-stone-50/80 dark:bg-zinc-900/70 border border-stone-200/80 dark:border-zinc-800 space-y-2.5">
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => handleSelectNewBranchKind('branch')}
                  className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-all cursor-pointer ${
                    newBranchKind === 'branch'
                      ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-950 dark:text-indigo-200'
                      : 'border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-stone-600 dark:text-zinc-300'
                  }`}
                >
                  ↗ Міжгілковий зв&apos;язок
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectNewBranchKind('godparent')}
                  className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-all cursor-pointer ${
                    newBranchKind === 'godparent'
                      ? 'border-amber-600 bg-amber-50 dark:bg-amber-950/50 text-amber-950 dark:text-amber-200'
                      : 'border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-stone-600 dark:text-zinc-300'
                  }`}
                >
                  ✝️ Хресний / Хресна
                </button>
              </div>

              {/* Step 1: Select Branch */}
              <div className="space-y-1">
                <label className="block text-[10.5px] font-semibold text-stone-600 dark:text-zinc-400">
                  1. Спочатку оберіть гілку (рід)
                </label>
                <select
                  value={effectiveTargetBranch}
                  onChange={(e) => {
                    const nextBranch = e.target.value;
                    setSelectedTargetBranch(nextBranch);
                    if (
                      nextBranch &&
                      nextBranch !== '__ALL__' &&
                      newBranchTargetId &&
                      allPersons[newBranchTargetId] &&
                      getClanName(allPersons[newBranchTargetId]) !== nextBranch
                    ) {
                      setNewBranchTargetId('');
                    }
                  }}
                  className={compactInputClass}
                >
                  <option value="">— 1. Оберіть гілку —</option>
                  <option value="__ALL__">
                    Усі гілки ({Math.max(0, Object.keys(allPersons).length - 1)})
                  </option>
                  {branchOptions.map((b) => (
                    <option key={b.name} value={b.name}>
                      {b.label} ({b.count})
                    </option>
                  ))}
                </select>
              </div>

              <div className="relative">
                <Search size={12.5} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
                <input
                  type="text"
                  value={branchSearch}
                  onChange={(e) => {
                    const val = e.target.value;
                    setBranchSearch(val);
                    const trimmed = val.trim();
                    if (trimmed) {
                      const exactMatch = Object.values(allPersons).find(
                        (p) => p.id !== personId && getPersonIdMatchScore(p, trimmed) === 3
                      );
                      if (exactMatch) {
                        setSelectedTargetBranch(getClanName(exactMatch));
                        setNewBranchTargetId(exactMatch.id);
                      }
                    }
                  }}
                  placeholder={
                    effectiveTargetBranch
                      ? 'Пошук картки за ID (#12), іменем або прізвищем...'
                      : 'Або швидкий пошук за ID (#12) чи ПІБ...'
                  }
                  className={`${compactInputClass} pl-7 ${branchSearch.trim() ? 'pr-20' : ''}`}
                />
                {branchSearch.trim() && (
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono font-semibold text-stone-500 dark:text-zinc-400 pointer-events-none">
                    {availableBranchTargets.length} збіг.
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <select
                  value={newBranchTargetId}
                  onChange={(e) => setNewBranchTargetId(e.target.value)}
                  disabled={!effectiveTargetBranch && !branchSearch.trim()}
                  className={`${compactInputClass} disabled:opacity-60`}
                >
                  <option value="">
                    {!effectiveTargetBranch && !branchSearch.trim()
                      ? '— Спочатку оберіть гілку —'
                      : '— 2. Оберіть картку —'}
                  </option>
                  {availableBranchTargets.map((p) => {
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
                  value={newBranchLabel}
                  onChange={(e) => setNewBranchLabel(e.target.value)}
                  placeholder={
                    newBranchKind === 'godparent'
                      ? 'Хресний / Хресна / Кум'
                      : 'Підпис (напр. Куми, Гілка Івана)'
                  }
                  className={compactInputClass}
                />
              </div>

              <BranchLinkStyleEditor
                color={newBranchColor}
                onChangeColor={setNewBranchColor}
                strokeWidth={newBranchStrokeWidth}
                onChangeStrokeWidth={setNewBranchStrokeWidth}
                lineShape={newBranchLineShape}
                onChangeLineShape={setNewBranchLineShape}
              />

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  disabled={!newBranchTargetId}
                  onClick={handleAddBranchLinkItem}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg disabled:opacity-45 disabled:cursor-not-allowed text-white text-[11px] font-semibold transition-colors cursor-pointer ${
                    newBranchKind === 'godparent'
                      ? 'bg-amber-600 hover:bg-amber-700'
                      : 'bg-indigo-600 hover:bg-indigo-700'
                  }`}
                >
                  <Plus size={12.5} />
                  <span>{newBranchKind === 'godparent' ? 'Додати лінію «Хресний/хресна»' : 'Додати стрілку'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Mobile-only Appearance & Verification Settings */}
      <section className="md:hidden pt-4 border-t border-stone-200 dark:border-zinc-800">
        <button
          type="button"
          onClick={() => setShowMobileAppearance((prev) => !prev)}
          className="w-full flex items-center justify-between py-1 text-left cursor-pointer"
        >
          <span className="flex items-center gap-2 text-xs font-semibold text-stone-800 dark:text-zinc-200">
            <CheckCircle2 size={14} className="text-emerald-700 dark:text-emerald-400" />
            <span>Колір картки та статус достовірності</span>
          </span>
          {showMobileAppearance ? (
            <ChevronUp size={15} className="text-stone-400" />
          ) : (
            <ChevronDown size={15} className="text-stone-400" />
          )}
        </button>

        {showMobileAppearance && (
          <div className="mt-3 space-y-3 pl-5 border-l-2 border-stone-200 dark:border-zinc-700">
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <div>
                <div className="text-xs font-semibold text-stone-800 dark:text-zinc-200">
                  Повністю перевірена картка
                </div>
                <div className="text-[11px] text-stone-500 dark:text-zinc-400">
                  Метрики та архівні дані підтверджено
                </div>
              </div>
              <input
                type="checkbox"
                checked={draft.isFullyVerified}
                onChange={(e) => onUpdateField('isFullyVerified', e.target.checked)}
                className="w-4 h-4 rounded border-stone-300 text-emerald-700 accent-emerald-700"
              />
            </label>

            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <div>
                <div className="text-xs font-semibold text-stone-800 dark:text-zinc-200">
                  Закріпити на часовій шкалі
                </div>
                <div className="text-[11px] text-stone-500 dark:text-zinc-400">
                  Вирівняти вертикально за роком народження
                </div>
              </div>
              <input
                type="checkbox"
                checked={draft.isChronologicallyPinned}
                onChange={(e) => onUpdateField('isChronologicallyPinned', e.target.checked)}
                className="w-4 h-4 rounded border-stone-300 text-emerald-700 accent-emerald-700"
              />
            </label>

            <div>
              <div className="flex items-center justify-between text-xs text-stone-700 dark:text-zinc-300 mb-2">
                <span>Колір фону картки</span>
                <span className="font-mono text-[10px] text-stone-400 uppercase">
                  {draft.cardBgColor}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {CARD_COLOR_PRESETS.map((c) => {
                  const isActive = draft.cardBgColor.toLowerCase() === c.hex.toLowerCase();
                  return (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => onUpdateField('cardBgColor', c.hex)}
                      style={{ backgroundColor: c.hex }}
                      className={`w-7 h-7 rounded-full border flex items-center justify-center ${
                        isActive
                          ? 'ring-2 ring-emerald-700 ring-offset-1 border-emerald-800'
                          : 'border-stone-300'
                      }`}
                      title={c.name}
                    >
                      {isActive && <span className="w-2 h-2 rounded-full bg-emerald-800" />}
                    </button>
                  );
                })}
                <input
                  type="color"
                  value={draft.cardBgColor}
                  onChange={(e) => onUpdateField('cardBgColor', e.target.value)}
                  className="w-7 h-7 rounded border border-stone-300 p-0.5 bg-white cursor-pointer"
                />
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
