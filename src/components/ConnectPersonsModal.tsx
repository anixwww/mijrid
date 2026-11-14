import React, { useState, useMemo, useEffect } from 'react';
import { Person, RelativeType, ConfidenceLevel, BRANCH_LINK_COLOR_PRESETS, BranchLinkCurveStyle, BranchLinkKind, NOTE_PROBABLE_RELATION_PRESETS } from '../types/tree';
import { buildWavyPath } from '../utils/branchLinkGeometry';
import { formatCardId, getPersonIdMatchScore } from '../utils/cardIdUtils';
import { buildBranchOptions, getClanName } from '../utils/lineageUtils';
import { CrossCanvasSearchTree, fetchAllTreesSearchIndex } from '../utils/fileStorage';
import { isSameCanvasId } from '../utils/crossCanvasLinks';
import { X, Link2, Heart, Users, User, FileText, Flame, ShieldAlert, ArrowUpRight, Palette, StickyNote, FolderTree, ExternalLink, Search } from 'lucide-react';

export interface ConnectOptions {
  verified: boolean;
  confidenceLevel: ConfidenceLevel;
  archiveSource?: string;
  isMainBranch?: boolean;
  linkExistingSpouseChildren?: boolean;
  eventType?: 'marriage' | 'cohabitation' | 'divorce';
  graduateGhostCards?: boolean;
}

export interface BranchLinkConnectOptions {
  linkKind?: BranchLinkKind;
  label?: string;
  probableRelation?: string;
  color?: string;
  strokeWidth?: number;
  lineShape?: BranchLinkCurveStyle;
  bidirectional: boolean;
  reverseLabel?: string;
}

export interface CrossCanvasConnectPayload {
  targetCanvasId: string;
  targetCanvasTitle: string;
  targetPersonId: string;
  targetPersonName: string;
  targetCardId: string;
  label?: string;
  color?: string;
  bidirectional: boolean;
}

interface ConnectPersonsModalProps {
  sourcePerson: Person;
  allPersons: Record<string, Person>;
  currentTreeId?: string;
  currentTreeTitle?: string;
  isOpen: boolean;
  onClose: () => void;
  onConnect: (targetId: string, relationType: RelativeType, options: ConnectOptions) => void;
  onConnectBranchLink?: (targetId: string, options: BranchLinkConnectOptions) => void;
  onConnectCrossCanvasLink?: (payload: CrossCanvasConnectPayload) => void;
  initialTargetId?: string;
  initialMode?: 'relation' | 'branch-link' | 'godparent';
  crossCanvasTrees?: CrossCanvasSearchTree[];
}

/**
 * Checks if targetId is an ancestor of personId
 */
function isAncestorOf(persons: Record<string, Person>, personId: string, targetId: string, visited = new Set<string>()): boolean {
  if (visited.has(personId)) return false;
  visited.add(personId);

  const person = persons[personId];
  if (!person || !person.parents) return false;

  for (const parentId of person.parents) {
    if (parentId === targetId) return true;
    if (isAncestorOf(persons, parentId, targetId, visited)) return true;
  }
  return false;
}

/**
 * Checks if targetId is a descendant of personId
 */
function isDescendantOf(persons: Record<string, Person>, personId: string, targetId: string, visited = new Set<string>()): boolean {
  if (visited.has(personId)) return false;
  visited.add(personId);

  const person = persons[personId];
  if (!person || !person.children) return false;

  for (const childId of person.children) {
    if (childId === targetId) return true;
    if (isDescendantOf(persons, childId, targetId, visited)) return true;
  }
  return false;
}

export const ConnectPersonsModal: React.FC<ConnectPersonsModalProps> = ({
  sourcePerson,
  allPersons,
  currentTreeId,
  currentTreeTitle,
  isOpen,
  onClose,
  onConnect,
  onConnectBranchLink,
  onConnectCrossCanvasLink,
  initialTargetId,
  initialMode = 'relation',
  crossCanvasTrees: initialCrossCanvasTrees,
}) => {
  const [selectedTargetId, setSelectedTargetId] = useState<string>(initialTargetId || '');
  const [connectionKind, setConnectionKind] = useState<'relation' | 'branch-link' | 'godparent' | 'note-link'>(initialMode);
  const [relationType, setRelationType] = useState<RelativeType>('spouse');
  const [unionType, setUnionType] = useState<'marriage' | 'cohabitation' | 'divorce'>('marriage');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBranch, setSelectedBranch] = useState<string>('');

  // Cross-canvas state (between different canvases)
  const [crossCanvasTrees, setCrossCanvasTrees] = useState<CrossCanvasSearchTree[]>(
    () => initialCrossCanvasTrees || []
  );
  const [selectedTargetCanvasId, setSelectedTargetCanvasId] = useState<string>('');
  const [crossCanvasColor, setCrossCanvasColor] = useState<string>('#047857');
  const [crossCanvasBidirectional, setCrossCanvasBidirectional] = useState<boolean>(true);

  // Credibility and Archival Evidence
  const [confidenceLevel, setConfidenceLevel] = useState<ConfidenceLevel>('verified');
  const [archiveSource, setArchiveSource] = useState('');
  const [isMainBranch, setIsMainBranch] = useState(false);
  const [linkExistingSpouseChildren, setLinkExistingSpouseChildren] = useState(true);
  const [graduateGhostCards, setGraduateGhostCards] = useState(false);

  // Cross-branch / Godparent link options
  const [branchLabel, setBranchLabel] = useState('');
  const [probableRelation, setProbableRelation] = useState('');
  const [branchColor, setBranchColor] = useState<string>(BRANCH_LINK_COLOR_PRESETS[0].hex);
  const [branchStrokeWidth, setBranchStrokeWidth] = useState<number>(2);
  const [branchLineShape, setBranchLineShape] = useState<BranchLinkCurveStyle>('curved');
  const [branchBidirectional, setBranchBidirectional] = useState(false);

  const branchOptions = useMemo(
    () => buildBranchOptions(allPersons, sourcePerson.id),
    [allPersons, sourcePerson.id]
  );

  const otherCanvasTrees = useMemo(
    () => crossCanvasTrees.filter((t) => !isSameCanvasId(t.treeId, currentTreeId)),
    [crossCanvasTrees, currentTreeId]
  );

  const defaultGodparentLabel =
    sourcePerson.gender === 'male'
      ? 'Хресний'
      : sourcePerson.gender === 'female'
      ? 'Хресна'
      : 'Хресний / Хресна';

  const selectGodparentMode = () => {
    setConnectionKind('godparent');
    setBranchLabel(defaultGodparentLabel);
    setProbableRelation('');
    setBranchColor('#d97706');
    setBranchStrokeWidth(2);
    setBranchLineShape('wavy');
    setBranchBidirectional(false);
    if (selectedTargetId && !allPersons[selectedTargetId]) {
      setSelectedTargetId('');
    }
  };

  const selectBranchLinkMode = () => {
    setConnectionKind('branch-link');
    setBranchLabel('');
    setProbableRelation('');
    setBranchColor(BRANCH_LINK_COLOR_PRESETS[0].hex);
    setBranchStrokeWidth(2);
    setBranchLineShape('curved');
    setBranchBidirectional(false);
    setSearchQuery('');
    setSelectedTargetId('');
    if (!onConnectCrossCanvasLink) {
      setSelectedTargetCanvasId('__CURRENT__');
    } else if (otherCanvasTrees.length === 1) {
      setSelectedTargetCanvasId(otherCanvasTrees[0].treeId);
    } else {
      setSelectedTargetCanvasId('');
    }
  };

  const selectNoteLinkMode = () => {
    setConnectionKind('note-link');
    setSelectedTargetCanvasId('__CURRENT__');
    setBranchLabel('');
    setProbableRelation('');
    setBranchColor('#d97706');
    setBranchStrokeWidth(2);
    setBranchLineShape('curved');
    setBranchBidirectional(false);
    if (selectedTargetId && !allPersons[selectedTargetId]) {
      setSelectedTargetId('');
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    if (initialCrossCanvasTrees && initialCrossCanvasTrees.length > 0) {
      setCrossCanvasTrees(initialCrossCanvasTrees);
      return;
    }
    let cancelled = false;
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
  }, [isOpen, initialCrossCanvasTrees]);

  useEffect(() => {
    if (isOpen) {
      const initialTarget = initialTargetId ? allPersons[initialTargetId] : null;
      const involvesNoteOnOpen = Boolean(
        sourcePerson.isGhost ||
          sourcePerson.isBlankScreenshot ||
          initialTarget?.isGhost ||
          initialTarget?.isBlankScreenshot
      );
      const nextKind =
        initialMode === 'relation' && involvesNoteOnOpen ? 'note-link' : initialMode;

      setConnectionKind(nextKind);
      setSelectedTargetId(initialTargetId || '');
      setSearchQuery('');
      setCrossCanvasColor('#047857');
      setCrossCanvasBidirectional(true);
      setProbableRelation('');
      if (initialTarget) {
        setSelectedBranch(getClanName(initialTarget));
        setSelectedTargetCanvasId('__CURRENT__');
      } else {
        setSelectedTargetCanvasId(nextKind === 'note-link' ? '__CURRENT__' : '');
        if (branchOptions.length === 1) {
          setSelectedBranch(branchOptions[0].name);
        } else {
          setSelectedBranch('');
        }
      }
      setGraduateGhostCards(false);
      if (nextKind === 'godparent') {
        setBranchLabel(defaultGodparentLabel);
        setBranchColor('#d97706');
        setBranchStrokeWidth(2);
        setBranchLineShape('wavy');
        setBranchBidirectional(false);
      } else if (nextKind === 'note-link') {
        setBranchLabel('');
        setBranchColor('#d97706');
        setBranchStrokeWidth(2);
        setBranchLineShape('curved');
        setBranchBidirectional(false);
      } else {
        setBranchLabel('');
        setBranchColor(BRANCH_LINK_COLOR_PRESETS[0].hex);
        setBranchStrokeWidth(2);
        setBranchLineShape('curved');
        setBranchBidirectional(false);
      }
    }
  }, [isOpen, initialMode, initialTargetId, sourcePerson.id, sourcePerson.isGhost, sourcePerson.isBlankScreenshot, defaultGodparentLabel, allPersons, branchOptions]);

  const effectiveTargetCanvasId =
    selectedTargetCanvasId || (otherCanvasTrees.length === 1 && !initialTargetId ? otherCanvasTrees[0].treeId : '');

  const isCrossCanvasPickerActive =
    connectionKind === 'branch-link' &&
    Boolean(onConnectCrossCanvasLink) &&
    effectiveTargetCanvasId !== '__CURRENT__';

  const selectedCrossCanvasTree = useMemo(
    () => otherCanvasTrees.find((t) => t.treeId === effectiveTargetCanvasId) || null,
    [otherCanvasTrees, effectiveTargetCanvasId]
  );

  const crossCanvasEntries = useMemo(() => {
    if (!isCrossCanvasPickerActive) return [];
    const q = searchQuery.trim();
    if (!selectedCrossCanvasTree && !q) return [];

    const treesToScan = selectedCrossCanvasTree ? [selectedCrossCanvasTree] : otherCanvasTrees;
    const entries: Array<{ tree: CrossCanvasSearchTree; person: Person; score: number }> = [];

    treesToScan.forEach((ct) => {
      (ct.persons || []).forEach((p) => {
        if (!p) return;
        const score = q ? getPersonIdMatchScore(p, q) : 0;
        if (q) {
          if (score === 0) {
            const full = `${p.firstName} ${p.lastName} ${p.patronymic || ''} ${p.maidenName || ''} ${p.nickname || ''} ${p.houseNumber || ''} ${p.yearsDisplay || ''} ${p.clanName || ''} ${ct.treeTitle}`.toLowerCase();
            if (!full.includes(q.toLowerCase())) return;
          }
        }
        entries.push({ tree: ct, person: p, score });
      });
    });

    entries.sort((a, b) => {
      if (q && a.score !== b.score) return b.score - a.score;
      return `${a.person.lastName} ${a.person.firstName}`.localeCompare(
        `${b.person.lastName} ${b.person.firstName}`,
        'uk'
      );
    });

    return entries;
  }, [isCrossCanvasPickerActive, selectedCrossCanvasTree, otherCanvasTrees, searchQuery]);

  const selectedCrossCanvasEntry = useMemo(() => {
    if (!isCrossCanvasPickerActive || !selectedTargetId) return null;
    if (selectedCrossCanvasTree) {
      const p = selectedCrossCanvasTree.persons.find((item) => item.id === selectedTargetId);
      if (p) return { tree: selectedCrossCanvasTree, person: p };
    }
    for (const ct of otherCanvasTrees) {
      const p = ct.persons.find((item) => item.id === selectedTargetId);
      if (p) return { tree: ct, person: p };
    }
    return null;
  }, [isCrossCanvasPickerActive, selectedTargetId, selectedCrossCanvasTree, otherCanvasTrees]);

  const sourceFullName = [sourcePerson.firstName, sourcePerson.lastName].filter(Boolean).join(' ') || '?';
  const targetPerson = !isCrossCanvasPickerActive && selectedTargetId ? allPersons[selectedTargetId] : null;
  const targetFullName = isCrossCanvasPickerActive
    ? selectedCrossCanvasEntry
      ? [selectedCrossCanvasEntry.person.firstName, selectedCrossCanvasEntry.person.lastName].filter(Boolean).join(' ') || '?'
      : ''
    : targetPerson
    ? [targetPerson.firstName, targetPerson.lastName].filter(Boolean).join(' ') || '?'
    : '';

  const involvesNote = Boolean(
    sourcePerson.isGhost ||
      sourcePerson.isBlankScreenshot ||
      targetPerson?.isGhost ||
      targetPerson?.isBlankScreenshot ||
      selectedCrossCanvasEntry?.person.isGhost ||
      selectedCrossCanvasEntry?.person.isBlankScreenshot
  );

  // Cycle and validity check
  const cycleWarning = useMemo(() => {
    if (isCrossCanvasPickerActive) return null;
    if (!selectedTargetId || !targetPerson) return null;
    if (selectedTargetId === sourcePerson.id) {
      return "Неможливо з'єднати особу із самою собою.";
    }
    if (connectionKind === 'branch-link' || connectionKind === 'godparent' || connectionKind === 'note-link') {
      return null;
    }

    if (relationType === 'parent') {
      if (isDescendantOf(allPersons, sourcePerson.id, selectedTargetId)) {
        return `⚠️ Генеалогічний конфлікт: ${targetFullName} вже є нащадком ${sourceFullName}. Особа не може бути батьком власного предка.`;
      }
    } else if (relationType === 'child') {
      if (isAncestorOf(allPersons, sourcePerson.id, selectedTargetId)) {
        return `⚠️ Генеалогічний конфлікт: ${targetFullName} вже є предком ${sourceFullName}. Особа не може бути дитиною власного нащадка.`;
      }
    } else if (relationType === 'spouse') {
      if ((sourcePerson.spouses || []).includes(selectedTargetId)) {
        return `Ці особи вже зазначені як подружжя.`;
      }
    }

    return null;
  }, [isCrossCanvasPickerActive, selectedTargetId, targetPerson, connectionKind, relationType, sourcePerson, allPersons, sourceFullName, targetFullName]);

  // Filter available target persons on current canvas: Step 1 Branch -> Step 2 Card (with instant #ID / text search)
  const availablePersons = useMemo(() => {
    if (isCrossCanvasPickerActive) return [];
    const q = searchQuery.trim();
    if (!selectedBranch && !q) {
      return [];
    }
    const list = Object.values(allPersons).filter((p) => {
      if (p.id === sourcePerson.id) return false;
      if (selectedBranch && selectedBranch !== '__ALL__' && getClanName(p) !== selectedBranch) {
        return false;
      }
      if (!q) return true;
      if (getPersonIdMatchScore(p, q) > 0) return true;
      const full = `${p.firstName} ${p.lastName} ${p.patronymic || ''} ${p.maidenName || ''} ${p.nickname || ''} ${p.houseNumber || ''} ${p.yearsDisplay || ''} ${getClanName(p)}`.toLowerCase();
      return full.includes(q.toLowerCase());
    });

    if (q) {
      list.sort((a, b) => {
        const sa = getPersonIdMatchScore(a, q);
        const sb = getPersonIdMatchScore(b, q);
        if (sa !== sb) return sb - sa;
        return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'uk');
      });
    } else {
      list.sort((a, b) =>
        `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'uk')
      );
    }
    return list;
  }, [isCrossCanvasPickerActive, allPersons, sourcePerson.id, selectedBranch, searchQuery]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isCrossCanvasPickerActive) {
      if (!selectedCrossCanvasEntry || !onConnectCrossCanvasLink) return;
      const tPerson = selectedCrossCanvasEntry.person;
      const tTree = selectedCrossCanvasEntry.tree;
      const tName = [tPerson.firstName, tPerson.lastName].filter(Boolean).join(' ').trim() || 'Картка';
      onConnectCrossCanvasLink({
        targetCanvasId: tTree.treeId,
        targetCanvasTitle: tTree.treeTitle,
        targetPersonId: tPerson.id,
        targetPersonName: tName,
        targetCardId: formatCardId(tPerson),
        label: branchLabel.trim() || undefined,
        color: crossCanvasColor,
        bidirectional: crossCanvasBidirectional,
      });
      onClose();
      return;
    }

    if (!selectedTargetId || cycleWarning) {
      return;
    }

    if (connectionKind === 'branch-link' || connectionKind === 'godparent' || connectionKind === 'note-link') {
      const cleanLabel = branchLabel.trim() || (connectionKind === 'godparent' ? defaultGodparentLabel : undefined);
      const cleanProbableRelation =
        connectionKind === 'note-link' || (connectionKind === 'branch-link' && involvesNote)
          ? probableRelation.trim() || undefined
          : undefined;
      const reverseGodparentLabel =
        cleanLabel === 'Кум / Кума'
          ? 'Кум / Кума'
          : targetPerson?.gender === 'male'
          ? 'Хрещеник'
          : targetPerson?.gender === 'female'
          ? 'Хрещениця'
          : 'Хрещеник / Хрещениця';

      onConnectBranchLink?.(selectedTargetId, {
        linkKind: connectionKind === 'godparent' ? 'godparent' : 'branch',
        label: cleanLabel,
        probableRelation: cleanProbableRelation,
        color: branchColor,
        strokeWidth: branchStrokeWidth,
        lineShape:
          connectionKind === 'note-link' && branchLineShape === 'wavy'
            ? 'curved'
            : branchLineShape,
        bidirectional: branchBidirectional,
        reverseLabel: connectionKind === 'godparent' && branchBidirectional ? reverseGodparentLabel : undefined,
      });
      onClose();
      return;
    }

    onConnect(selectedTargetId, relationType, {
      verified: confidenceLevel === 'verified',
      confidenceLevel,
      archiveSource: archiveSource.trim() || undefined,
      isMainBranch,
      linkExistingSpouseChildren: relationType === 'spouse' ? linkExistingSpouseChildren : undefined,
      eventType: relationType === 'spouse' ? unionType : undefined,
      graduateGhostCards: (sourcePerson.isGhost || targetPerson?.isGhost) ? graduateGhostCards : undefined,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 dark:bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-stone-200 dark:border-zinc-800 w-full max-w-lg overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 bg-[#f4f7f4] dark:bg-zinc-950/60 border-b border-[#d8e2d9] dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/70 border border-emerald-300 dark:border-emerald-800 flex items-center justify-center text-emerald-800 dark:text-emerald-300 shrink-0">
              <Link2 size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-stone-900 dark:text-zinc-100">
                Встановлення родинного зв'язку (лінії)
              </h3>
              <p className="text-xs text-stone-600 dark:text-zinc-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                <span>Вихідна особа:</span>
                <span className="font-semibold text-emerald-900 dark:text-emerald-300">{sourceFullName}</span>
                <span className="px-1.5 py-0.2 rounded bg-emerald-100/90 dark:bg-emerald-950/80 border border-emerald-300/70 dark:border-emerald-800 text-[10px] font-mono font-bold text-emerald-900 dark:text-emerald-300">
                  {formatCardId(sourcePerson)}
                </span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-stone-400 dark:text-zinc-400 hover:text-stone-700 dark:hover:text-zinc-200 hover:bg-stone-200/50 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {/* 1. Relation Type Selector with clear genealogical direction */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 dark:text-zinc-300 uppercase tracking-wider mb-2">
              Тип родинного зв'язку
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                {
                  type: 'spouse',
                  title: '💍 Подружжя / Пара',
                  desc: 'Шлюбний або цивільний союз обох осіб',
                  icon: Heart,
                  color: 'text-rose-600 dark:text-rose-400',
                },
                {
                  type: 'parent',
                  title: '⬆️ Батьки',
                  desc: `Обрана особа є батьком/матір'ю для ${sourceFullName}`,
                  icon: User,
                  color: 'text-emerald-700 dark:text-emerald-400',
                },
                {
                  type: 'child',
                  title: '⬇️ Дитина',
                  desc: `Обрана особа є дитиною для ${sourceFullName}`,
                  icon: Users,
                  color: 'text-amber-700 dark:text-amber-400',
                },
                {
                  type: 'sibling',
                  title: '🤝 Брат / Сестра',
                  desc: `Рідний брат або сестра для ${sourceFullName}`,
                  icon: Users,
                  color: 'text-sky-700 dark:text-sky-400',
                },
              ].map((item) => {
                const isSelected = relationType === item.type;
                const Icon = item.icon;
                return (
                  <button
                    key={item.type}
                    type="button"
                    onClick={() => {
                      setConnectionKind('relation');
                      setRelationType(item.type as RelativeType);
                      if (selectedTargetId && !allPersons[selectedTargetId]) {
                        setSelectedTargetId('');
                      }
                    }}
                    className={`p-2.5 rounded-xl border text-left flex flex-col gap-1 transition-all cursor-pointer ${
                      connectionKind === 'relation' && isSelected
                        ? 'border-emerald-700 dark:border-emerald-500 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-950 dark:text-emerald-200 ring-2 ring-emerald-600/30 font-semibold shadow-xs'
                        : 'border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/70 text-stone-700 dark:text-zinc-200 hover:bg-stone-50 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <Icon size={14} className={connectionKind === 'relation' && isSelected ? 'text-emerald-800 dark:text-emerald-300' : item.color} />
                      <span>{item.title}</span>
                    </div>
                    <span className="text-[10px] text-stone-500 dark:text-zinc-400 font-normal leading-tight">
                      {item.desc}
                    </span>
                  </button>
                );
              })}

              {(onConnectBranchLink || onConnectCrossCanvasLink) && (
                <>
                  {onConnectBranchLink && (
                    <button
                      type="button"
                      onClick={selectGodparentMode}
                      className={`p-2.5 rounded-xl border text-left flex flex-col gap-1 transition-all cursor-pointer ${
                        connectionKind === 'godparent'
                          ? 'border-amber-600 dark:border-amber-500 bg-amber-50 dark:bg-amber-950/60 text-amber-950 dark:text-amber-200 ring-2 ring-amber-500/30 font-semibold shadow-xs'
                          : 'border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/70 text-stone-700 dark:text-zinc-200 hover:bg-amber-50/40 dark:hover:bg-amber-950/30'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-xs">
                        <svg className="w-4 h-3 shrink-0 overflow-visible" viewBox="0 0 18 12">
                          <path
                            d="M 1 6 Q 3.5 1 6 6 T 11 6 T 16 6"
                            fill="none"
                            stroke={connectionKind === 'godparent' ? '#d97706' : '#b45309'}
                            strokeWidth="2"
                            strokeLinecap="round"
                          />
                        </svg>
                        <span>✝️ Хресний / Хресна</span>
                      </div>
                      <span className="text-[10px] text-stone-500 dark:text-zinc-400 font-normal leading-tight">
                        Хвиляста лінія духовного зв&apos;язку від картки до картки
                      </span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={selectBranchLinkMode}
                    className={`p-2.5 rounded-xl border text-left flex flex-col gap-1 transition-all cursor-pointer ${
                      connectionKind === 'branch-link'
                        ? 'border-emerald-700 dark:border-emerald-500 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-950 dark:text-emerald-200 ring-2 ring-emerald-600/30 font-semibold shadow-xs'
                        : 'border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/70 text-stone-700 dark:text-zinc-200 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/30'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <ExternalLink size={14} className="text-emerald-700 dark:text-emerald-400 shrink-0" />
                      <span>↗ Міжгілковий зв&apos;язок</span>
                    </div>
                    <span className="text-[10px] text-stone-500 dark:text-zinc-400 font-normal leading-tight">
                      Перехід до картки на іншому полотні (або стрілка на цьому)
                    </span>
                  </button>

                  {onConnectBranchLink && (
                    <button
                      type="button"
                      onClick={selectNoteLinkMode}
                      className={`col-span-2 p-2.5 rounded-xl border text-left flex flex-col gap-1 transition-all cursor-pointer ${
                        connectionKind === 'note-link'
                          ? 'border-amber-600 dark:border-amber-500 bg-amber-50 dark:bg-amber-950/60 text-amber-950 dark:text-amber-200 ring-2 ring-amber-500/30 font-semibold shadow-xs'
                          : 'border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/70 text-stone-700 dark:text-zinc-200 hover:bg-amber-50/40 dark:hover:bg-amber-950/30'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 font-bold text-xs">
                          <StickyNote size={14} className="text-amber-600 dark:text-amber-400 shrink-0" />
                          <span>Зв&apos;язок нотатки (пунктирна лінія)</span>
                        </div>
                        <svg className="w-10 h-2.5 shrink-0" viewBox="0 0 40 10">
                          <line
                            x1="1"
                            y1="5"
                            x2="38"
                            y2="5"
                            stroke="#d97706"
                            strokeWidth="2"
                            strokeDasharray="4 3"
                          />
                        </svg>
                      </div>
                      <span className="text-[10px] text-stone-500 dark:text-zinc-400 font-normal leading-tight">
                        Прикріпити нотатку-стікер до картки або до іншої нотатки пунктиром
                      </span>
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Union Type Selector when relation is Spouse */}
          {connectionKind === 'relation' && relationType === 'spouse' && (
            <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/30 rounded-xl border border-emerald-200/80 dark:border-emerald-800/70 space-y-2 animate-in fade-in duration-150">
              <label className="block text-xs font-semibold text-emerald-950 dark:text-emerald-200 uppercase tracking-wider">
                Тип союзу (пара)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setUnionType('marriage')}
                  className={`py-2 px-2.5 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    unionType === 'marriage'
                      ? 'border-emerald-700 dark:border-emerald-500 bg-white dark:bg-zinc-900 text-emerald-950 dark:text-emerald-200 ring-1 ring-emerald-600 font-semibold shadow-2xs'
                      : 'border-emerald-200/60 dark:border-emerald-800/60 bg-emerald-50/50 dark:bg-zinc-800/60 text-stone-700 dark:text-zinc-300 hover:bg-white dark:hover:bg-zinc-800'
                  }`}
                >
                  <span className="text-base">💍</span>
                  <span>Шлюб</span>
                </button>

                <button
                  type="button"
                  onClick={() => setUnionType('divorce')}
                  className={`py-2 px-2.5 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    unionType === 'divorce'
                      ? 'border-rose-600 dark:border-rose-500 bg-rose-50 dark:bg-rose-950/50 text-rose-950 dark:text-rose-200 ring-1 ring-rose-500 font-semibold shadow-2xs'
                      : 'border-emerald-200/60 dark:border-emerald-800/60 bg-emerald-50/50 dark:bg-zinc-800/60 text-stone-700 dark:text-zinc-300 hover:bg-white dark:hover:bg-zinc-800 hover:text-rose-900 dark:hover:text-rose-300'
                  }`}
                >
                  <span className="text-base">💔</span>
                  <span>Розлучення</span>
                </button>

                <button
                  type="button"
                  onClick={() => setUnionType('cohabitation')}
                  className={`py-2 px-2.5 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    unionType === 'cohabitation'
                      ? 'border-emerald-700 dark:border-emerald-500 bg-white dark:bg-zinc-900 text-emerald-950 dark:text-emerald-200 ring-1 ring-emerald-600 font-semibold shadow-2xs'
                      : 'border-emerald-200/60 dark:border-emerald-800/60 bg-emerald-50/50 dark:bg-zinc-800/60 text-stone-700 dark:text-zinc-300 hover:bg-white dark:hover:bg-zinc-800'
                  }`}
                >
                  <span className="text-base">💚</span>
                  <span>Без шлюбу</span>
                </button>
              </div>
            </div>
          )}

          {/* 2. Target Person Selector */}
          {isCrossCanvasPickerActive ? (
            <div className="space-y-2.5">
              <label className="block text-xs font-semibold text-stone-700 dark:text-zinc-300 uppercase tracking-wider">
                Зв&apos;язок між полотнами (гілками):
              </label>

              {/* Step 1: Select Canvas / Branch */}
              <div className="space-y-1">
                <label className="flex items-center gap-1.5 text-[11px] font-semibold text-stone-600 dark:text-zinc-400">
                  <ExternalLink size={12.5} className="text-emerald-700 dark:text-emerald-400 shrink-0" />
                  <span>1. Спочатку оберіть гілку (полотно)</span>
                </label>
                <select
                  value={effectiveTargetCanvasId}
                  onChange={(e) => {
                    const nextVal = e.target.value;
                    setSelectedTargetCanvasId(nextVal);
                    setSelectedTargetId('');
                    setSearchQuery('');
                  }}
                  className="w-full text-xs px-3 py-2 rounded-lg border border-stone-300 dark:border-zinc-700 focus:outline-none focus:ring-1 focus:ring-emerald-600 bg-white dark:bg-zinc-800 font-medium text-stone-800 dark:text-zinc-100 cursor-pointer"
                >
                  <option value="">— Оберіть інше полотно (гілку) —</option>
                  {otherCanvasTrees.map((t) => (
                    <option key={t.treeId} value={t.treeId}>
                      {t.treeTitle} ({t.persons.length} карток)
                    </option>
                  ))}
                  {onConnectBranchLink && (
                    <option value="__CURRENT__">
                      📍 Поточне полотно{currentTreeTitle ? ` «${currentTreeTitle}»` : ''} (стрілка на цьому ж полотні)
                    </option>
                  )}
                </select>
              </div>

              {otherCanvasTrees.length === 0 && (
                <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 text-[11px] text-amber-900 dark:text-amber-200 leading-snug">
                  Інших полотен (гілок) ще не створено. Ви можете створити нове полотно через меню «Полотна / гілки» або обрати «Поточне полотно» вище для стрілки на цьому полотні.
                </div>
              )}

              {/* Step 2: Select Card on Chosen Canvas */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-stone-600 dark:text-zinc-400">
                    2. Оберіть картку
                    {selectedCrossCanvasTree ? ` (полотно «${selectedCrossCanvasTree.treeTitle}»)` : ''}
                  </span>
                  {(selectedCrossCanvasTree || searchQuery.trim()) && (
                    <span className="text-[10px] font-mono text-stone-500 dark:text-zinc-400">
                      {crossCanvasEntries.length} шт.
                    </span>
                  )}
                </div>
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400 dark:text-zinc-500 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSearchQuery(val);
                      const trimmed = val.trim();
                      if (trimmed && selectedCrossCanvasTree) {
                        const exact = selectedCrossCanvasTree.persons.find(
                          (p) => getPersonIdMatchScore(p, trimmed) === 3
                        );
                        if (exact) setSelectedTargetId(exact.id);
                      }
                    }}
                    placeholder={
                      selectedCrossCanvasTree
                        ? 'Пошук за ID (#12), ПІБ, № дому...'
                        : 'Пошук за ID (#12) чи ПІБ по всіх інших полотнах...'
                    }
                    className="w-full text-xs pl-8 pr-3 py-2 rounded-lg border border-stone-300 dark:border-zinc-700 focus:outline-none focus:ring-1 focus:ring-emerald-600 bg-stone-50 dark:bg-zinc-800/80 text-stone-900 dark:text-zinc-100 placeholder:text-stone-400 dark:placeholder:text-zinc-500"
                  />
                </div>
                <div className="max-h-44 overflow-y-auto rounded-xl border border-stone-200 dark:border-zinc-700 divide-y divide-stone-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900 shadow-inner">
                  {!selectedCrossCanvasTree && !searchQuery.trim() ? (
                    <div className="p-4 text-center text-xs text-stone-500 dark:text-zinc-400">
                      Спочатку оберіть гілку (полотно) вище, щоб побачити картки, або введіть <code className="px-1 py-0.5 bg-stone-100 dark:bg-zinc-800 rounded font-mono text-[10.5px]">#ID</code> у пошук.
                    </div>
                  ) : crossCanvasEntries.length === 0 ? (
                    <div className="p-4 text-center text-xs text-stone-500 dark:text-zinc-400 italic">
                      Карток за запитом не знайдено
                    </div>
                  ) : (
                    crossCanvasEntries.map(({ tree: ct, person: p }) => {
                      const isSelected =
                        selectedTargetId === p.id &&
                        (!selectedCrossCanvasTree || ct.treeId === selectedCrossCanvasTree.treeId);
                      const pName = [p.firstName, p.lastName].filter(Boolean).join(' ') || '?';
                      return (
                        <div
                          key={`${ct.treeId}:${p.id}`}
                          onClick={() => {
                            setSelectedTargetCanvasId(ct.treeId);
                            setSelectedTargetId(p.id);
                          }}
                          className={`px-3 py-2 text-xs flex items-center justify-between cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-950 dark:text-emerald-200 font-semibold'
                              : 'hover:bg-stone-50 dark:hover:bg-zinc-800/80 text-stone-800 dark:text-zinc-200'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span className="text-[10px] font-mono font-bold text-stone-700 dark:text-zinc-300 bg-stone-100 dark:bg-zinc-800 border border-stone-200 dark:border-zinc-700 px-1.5 py-0.2 rounded shrink-0">
                              {formatCardId(p)}
                            </span>
                            <span className="font-medium truncate">{pName}</span>
                            {!selectedCrossCanvasTree && (
                              <span className="text-[9.5px] font-medium text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200/80 dark:border-emerald-800/70 px-1.5 py-0.2 rounded shrink-0">
                                {ct.treeTitle}
                              </span>
                            )}
                            {p.yearsDisplay && (
                              <span className="text-[10px] text-stone-500 dark:text-zinc-400 font-mono shrink-0">
                                ({p.yearsDisplay})
                              </span>
                            )}
                            {p.houseNumber && (
                              <span className="text-[9px] font-mono text-emerald-800 dark:text-emerald-300 bg-emerald-100/70 dark:bg-emerald-950/60 px-1 py-0.2 rounded shrink-0">
                                №{p.houseNumber}
                              </span>
                            )}
                          </div>
                          <input
                            type="radio"
                            name="target-cross-person"
                            checked={isSelected}
                            onChange={() => {
                              setSelectedTargetCanvasId(ct.treeId);
                              setSelectedTargetId(p.id);
                            }}
                            className="accent-emerald-700 shrink-0"
                          />
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="block text-xs font-semibold text-stone-700 dark:text-zinc-300 uppercase tracking-wider">
                  Вибір картки для з&apos;єднання:
                </label>
                {connectionKind === 'branch-link' && onConnectCrossCanvasLink && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTargetCanvasId('');
                      setSelectedTargetId('');
                      setSearchQuery('');
                    }}
                    className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 hover:text-emerald-900 dark:hover:text-emerald-300 underline cursor-pointer"
                  >
                    ← Обрати інше полотно
                  </button>
                )}
              </div>

              {/* Step 1: Select Branch */}
              <div className="space-y-1">
                <label className="flex items-center gap-1.5 text-[11px] font-semibold text-stone-600 dark:text-zinc-400">
                  <FolderTree size={12.5} className="text-emerald-700 dark:text-emerald-400 shrink-0" />
                  <span>1. Спочатку оберіть гілку (рід)</span>
                </label>
                <select
                  value={selectedBranch}
                  onChange={(e) => {
                    const nextBranch = e.target.value;
                    setSelectedBranch(nextBranch);
                    if (
                      nextBranch &&
                      nextBranch !== '__ALL__' &&
                      selectedTargetId &&
                      allPersons[selectedTargetId] &&
                      getClanName(allPersons[selectedTargetId]) !== nextBranch
                    ) {
                      setSelectedTargetId('');
                    }
                  }}
                  className="w-full text-xs px-3 py-2 rounded-lg border border-stone-300 dark:border-zinc-700 focus:outline-none focus:ring-1 focus:ring-emerald-600 bg-white dark:bg-zinc-800 font-medium text-stone-800 dark:text-zinc-100 cursor-pointer"
                >
                  <option value="">— Оберіть гілку —</option>
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

              {/* Step 2: Select Card */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-stone-600 dark:text-zinc-400">
                    2. Оберіть картку
                    {selectedBranch && selectedBranch !== '__ALL__'
                      ? ` (гілка «${selectedBranch}»)`
                      : ''}
                  </span>
                  {(selectedBranch || searchQuery.trim()) && (
                    <span className="text-[10px] font-mono text-stone-500 dark:text-zinc-400">
                      {availablePersons.length} шт.
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={
                    selectedBranch
                      ? 'Фільтр за ID (#12), іменем, номером дому...'
                      : 'Або швидкий пошук за ID (#12) чи іменем...'
                  }
                  className="w-full text-xs px-3 py-2 rounded-lg border border-stone-300 dark:border-zinc-700 focus:outline-none focus:ring-1 focus:ring-emerald-600 bg-stone-50 dark:bg-zinc-800/80 text-stone-900 dark:text-zinc-100 placeholder:text-stone-400 dark:placeholder:text-zinc-500"
                />
                <div className="max-h-44 overflow-y-auto rounded-xl border border-stone-200 dark:border-zinc-700 divide-y divide-stone-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900 shadow-inner">
                  {!selectedBranch && !searchQuery.trim() ? (
                    <div className="p-4 text-center text-xs text-stone-500 dark:text-zinc-400">
                      Спочатку оберіть гілку вище, щоб переглянути її картки (або введіть <code className="px-1 py-0.5 bg-stone-100 dark:bg-zinc-800 rounded font-mono text-[10.5px]">#ID</code> у пошук).
                    </div>
                  ) : availablePersons.length === 0 ? (
                    <div className="p-4 text-center text-xs text-stone-500 dark:text-zinc-400 italic">
                      Осіб за запитом не знайдено
                    </div>
                  ) : (
                    availablePersons.map((p) => {
                      const isSelected = selectedTargetId === p.id;
                      const pName = [p.firstName, p.lastName].filter(Boolean).join(' ') || '?';
                      const pBranch = getClanName(p);
                      return (
                        <div
                          key={p.id}
                          onClick={() => setSelectedTargetId(p.id)}
                          className={`px-3 py-2 text-xs flex items-center justify-between cursor-pointer transition-colors ${
                            isSelected ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-950 dark:text-emerald-200 font-semibold' : 'hover:bg-stone-50 dark:hover:bg-zinc-800/80 text-stone-800 dark:text-zinc-200'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span className="text-[10px] font-mono font-bold text-stone-700 dark:text-zinc-300 bg-stone-100 dark:bg-zinc-800 border border-stone-200 dark:border-zinc-700 px-1.5 py-0.2 rounded shrink-0">
                              {formatCardId(p)}
                            </span>
                            <span className="font-medium truncate">{pName}</span>
                            {(!selectedBranch || selectedBranch === '__ALL__') && (
                              <span className="text-[9.5px] font-medium text-indigo-800 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/80 dark:border-indigo-800/70 px-1.5 py-0.2 rounded shrink-0">
                                {pBranch}
                              </span>
                            )}
                            {p.isGhost && (
                              <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-amber-900 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 px-1.5 py-0.2 rounded-sm shrink-0">
                                <StickyNote size={9} />
                                Нотатка
                              </span>
                            )}
                            {p.yearsDisplay && (
                              <span className="text-[10px] text-stone-500 dark:text-zinc-400 font-mono shrink-0">({p.yearsDisplay})</span>
                            )}
                            {p.houseNumber && (
                              <span className="text-[9px] font-mono text-emerald-800 dark:text-emerald-300 bg-emerald-100/70 dark:bg-emerald-950/60 px-1 py-0.2 rounded shrink-0">
                                №{p.houseNumber}
                              </span>
                            )}
                          </div>
                          <input
                            type="radio"
                            name="target-person"
                            checked={isSelected}
                            onChange={() => setSelectedTargetId(p.id)}
                            className="accent-emerald-700 shrink-0"
                          />
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Conflict / Cycle Warning Banner */}
          {cycleWarning && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl flex items-start gap-2.5 text-xs text-rose-900 dark:text-rose-200 animate-in fade-in">
              <ShieldAlert size={16} className="text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div className="leading-tight">{cycleWarning}</div>
            </div>
          )}

          {/* 3. Options Card: Cross-Canvas vs Same-Canvas Branch/Godparent vs Genealogical Credibility */}
          {isCrossCanvasPickerActive ? (
            <div className="p-3.5 rounded-xl border bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200/80 dark:border-emerald-800/70 space-y-3">
              {selectedCrossCanvasEntry && (
                <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-emerald-200 dark:border-emerald-800 text-xs">
                  <ExternalLink size={13} className="text-emerald-700 dark:text-emerald-400 shrink-0" />
                  <span className="px-1.5 py-0.2 rounded bg-emerald-100 dark:bg-emerald-950/80 text-emerald-900 dark:text-emerald-300 text-[10px] font-bold shrink-0">
                    {selectedCrossCanvasEntry.tree.treeTitle}
                  </span>
                  <span className="font-mono font-bold text-[10px] text-stone-700 dark:text-zinc-300 bg-stone-100 dark:bg-zinc-800 px-1 rounded shrink-0">
                    {formatCardId(selectedCrossCanvasEntry.person)}
                  </span>
                  <span className="font-semibold text-stone-900 dark:text-zinc-100 truncate">
                    {targetFullName}
                  </span>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 text-emerald-950 dark:text-emerald-200">
                  Підпис переходу (необов&apos;язково)
                </label>
                <input
                  type="text"
                  value={branchLabel}
                  onChange={(e) => setBranchLabel(e.target.value)}
                  placeholder="напр. Гілка батька / Продовження роду / Куми"
                  className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800 focus:outline-none focus:ring-1 focus:ring-emerald-600 bg-white dark:bg-zinc-900 text-stone-900 dark:text-zinc-100 placeholder:text-stone-400 dark:placeholder:text-zinc-500"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-emerald-950 dark:text-emerald-200">Колір бейджа:</span>
                <div className="flex items-center gap-1.5">
                  {['#047857', ...BRANCH_LINK_COLOR_PRESETS.slice(0, 5).map((c) => c.hex)].map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => setCrossCanvasColor(hex)}
                      style={{ backgroundColor: hex }}
                      className={`w-5.5 h-5.5 rounded-full transition-transform hover:scale-110 cursor-pointer ${
                        crossCanvasColor.toLowerCase() === hex.toLowerCase()
                          ? 'ring-2 ring-offset-1 ring-stone-800 dark:ring-zinc-200 dark:ring-offset-zinc-900'
                          : 'opacity-80'
                      }`}
                    />
                  ))}
                  <label
                    className="relative w-5.5 h-5.5 rounded-full border border-dashed border-emerald-400 dark:border-emerald-600 bg-white dark:bg-zinc-900 flex items-center justify-center cursor-pointer hover:border-emerald-600 overflow-hidden"
                    title="Обрати довільний колір"
                  >
                    <input
                      type="color"
                      value={crossCanvasColor}
                      onChange={(e) => setCrossCanvasColor(e.target.value)}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    <Palette size={11} className="text-emerald-700 dark:text-emerald-400 pointer-events-none" />
                  </label>
                </div>
              </div>

              <label className="flex items-start gap-2 cursor-pointer pt-1.5 border-t border-emerald-200/70 dark:border-emerald-800/60">
                <input
                  type="checkbox"
                  checked={crossCanvasBidirectional}
                  onChange={(e) => setCrossCanvasBidirectional(e.target.checked)}
                  className="mt-0.5 rounded text-emerald-700 focus:ring-emerald-600 accent-emerald-700 w-3.5 h-3.5 cursor-pointer"
                />
                <span className="text-xs font-medium text-stone-800 dark:text-zinc-200 leading-snug">
                  Створити зворотне посилання на картці у цільовому полотні (двосторонній перехід ↔)
                </span>
              </label>
            </div>
          ) : connectionKind === 'branch-link' || connectionKind === 'godparent' || connectionKind === 'note-link' ? (
            <div
              className={`p-3.5 rounded-xl border space-y-3 ${
                connectionKind === 'godparent' || connectionKind === 'note-link'
                  ? 'bg-amber-50/60 dark:bg-amber-950/25 border-amber-200/90 dark:border-amber-800/70'
                  : 'bg-indigo-50/60 dark:bg-indigo-950/25 border-indigo-200/80 dark:border-indigo-800/70'
              }`}
            >
              {connectionKind === 'godparent' && (
                <div>
                  <span className="block text-[11px] font-bold text-amber-950 dark:text-amber-200 uppercase tracking-wider mb-1.5">
                    Швидкий вибір ролі
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {['Хресний', 'Хресна', 'Хресний / Хресна', 'Кум / Кума'].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setBranchLabel(preset)}
                        className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-all cursor-pointer ${
                          branchLabel === preset
                            ? 'border-amber-600 bg-amber-600 text-white shadow-2xs'
                            : 'border-amber-200 dark:border-amber-800 bg-white dark:bg-zinc-900 text-amber-950 dark:text-amber-200 hover:bg-amber-50 dark:hover:bg-amber-950/50'
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {(connectionKind === 'note-link' || (connectionKind === 'branch-link' && involvesNote)) && (
                <div className="space-y-2 pb-1 border-b border-amber-200/70 dark:border-amber-800/60">
                  <div className="flex items-center justify-between gap-2">
                    <span className="block text-[11px] font-bold text-amber-950 dark:text-amber-200 uppercase tracking-wider">
                      Вид ймовірного родинного зв&apos;язку
                    </span>
                    {probableRelation && (
                      <button
                        type="button"
                        onClick={() => setProbableRelation('')}
                        className="text-[10.5px] font-semibold text-amber-800 dark:text-amber-300 hover:underline cursor-pointer"
                      >
                        Очистити
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {NOTE_PROBABLE_RELATION_PRESETS.map((preset) => {
                      const active =
                        probableRelation.trim().toLowerCase() === preset.label.toLowerCase();
                      return (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => setProbableRelation(active ? '' : preset.label)}
                          className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1 transition-all cursor-pointer ${
                            active
                              ? 'border-amber-600 bg-amber-600 text-white shadow-2xs'
                              : 'border-amber-200 dark:border-amber-800 bg-white dark:bg-zinc-900 text-amber-950 dark:text-amber-200 hover:bg-amber-50 dark:hover:bg-amber-950/50'
                          }`}
                        >
                          <span>{preset.icon}</span>
                          <span>{preset.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  <input
                    type="text"
                    value={probableRelation}
                    onChange={(e) => setProbableRelation(e.target.value)}
                    placeholder="Або введіть свій варіант: напр. Батьки, Подружжя, Брат..."
                    className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-amber-200 dark:border-amber-800 focus:outline-none focus:ring-1 focus:ring-amber-600 bg-white dark:bg-zinc-900 text-stone-900 dark:text-zinc-100 placeholder:text-stone-400 dark:placeholder:text-zinc-500"
                  />
                </div>
              )}

              <div>
                <label
                  className={`block text-[11px] font-bold uppercase tracking-wider mb-1 ${
                    connectionKind === 'godparent' || connectionKind === 'note-link'
                      ? 'text-amber-950 dark:text-amber-200'
                      : 'text-indigo-950 dark:text-indigo-200'
                  }`}
                >
                  {connectionKind === 'godparent'
                    ? 'Підпис на хвилястій лінії'
                    : connectionKind === 'note-link'
                    ? "Додатковий підпис на лінії (необов'язково)"
                    : "Підпис на стрілці (необов'язково)"}
                </label>
                <input
                  type="text"
                  value={branchLabel}
                  onChange={(e) => setBranchLabel(e.target.value)}
                  placeholder={
                    connectionKind === 'godparent'
                      ? 'напр. Хресний / Хресна / Кум'
                      : connectionKind === 'note-link'
                      ? 'напр. Згадка з метрики 1908 р.'
                      : 'напр. Споріднена гілка / Куми / Перехід до роду'
                  }
                  className={`w-full text-xs px-2.5 py-1.5 rounded-lg border focus:outline-none focus:ring-1 bg-white dark:bg-zinc-900 text-stone-900 dark:text-zinc-100 placeholder:text-stone-400 dark:placeholder:text-zinc-500 ${
                    connectionKind === 'godparent' || connectionKind === 'note-link'
                      ? 'border-amber-200 dark:border-amber-800 focus:ring-amber-600'
                      : 'border-indigo-200 dark:border-indigo-800 focus:ring-indigo-600'
                  }`}
                />
              </div>

              {/* Line Shape: Curved vs Straight (vs Wavy when not pure note-link) */}
              <div className="space-y-1.5">
                <span
                  className={`block text-[11px] font-semibold ${
                    connectionKind === 'godparent' || connectionKind === 'note-link'
                      ? 'text-amber-950 dark:text-amber-200'
                      : 'text-indigo-950 dark:text-indigo-200'
                  }`}
                >
                  Форма пунктирної лінії:
                </span>
                <div className={`grid ${connectionKind === 'note-link' ? 'grid-cols-2' : 'grid-cols-3'} gap-2`}>
                  <button
                    type="button"
                    onClick={() => setBranchLineShape('curved')}
                    className={`px-2 py-1.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      branchLineShape === 'curved'
                        ? 'border-indigo-600 dark:border-indigo-500 bg-white dark:bg-zinc-900 text-indigo-950 dark:text-indigo-200 ring-1 ring-indigo-500 shadow-2xs'
                        : 'border-stone-200/80 dark:border-zinc-700 bg-white/70 dark:bg-zinc-800/70 text-stone-600 dark:text-zinc-300 hover:bg-white dark:hover:bg-zinc-800'
                    }`}
                  >
                    <svg className="w-5 h-3.5 overflow-visible shrink-0" viewBox="0 0 24 16">
                      <path
                        d="M 2 13 Q 12 2 22 10"
                        fill="none"
                        stroke={branchLineShape === 'curved' ? branchColor : '#78716c'}
                        strokeWidth="2"
                        strokeDasharray="3 2"
                      />
                    </svg>
                    <span className="truncate">Вигнута</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setBranchLineShape('straight')}
                    className={`px-2 py-1.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      branchLineShape === 'straight'
                        ? 'border-indigo-600 dark:border-indigo-500 bg-white dark:bg-zinc-900 text-indigo-950 dark:text-indigo-200 ring-1 ring-indigo-500 shadow-2xs'
                        : 'border-stone-200/80 dark:border-zinc-700 bg-white/70 dark:bg-zinc-800/70 text-stone-600 dark:text-zinc-300 hover:bg-white dark:hover:bg-zinc-800'
                    }`}
                  >
                    <svg className="w-5 h-3.5 overflow-visible shrink-0" viewBox="0 0 24 16">
                      <line
                        x1="2"
                        y1="13"
                        x2="22"
                        y2="3"
                        stroke={branchLineShape === 'straight' ? branchColor : '#78716c'}
                        strokeWidth="2"
                        strokeDasharray="3 2"
                      />
                    </svg>
                    <span className="truncate">Пряма</span>
                  </button>
                  {connectionKind !== 'note-link' && (
                    <button
                      type="button"
                      onClick={() => setBranchLineShape('wavy')}
                      className={`px-2 py-1.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        branchLineShape === 'wavy'
                          ? 'border-amber-600 dark:border-amber-500 bg-white dark:bg-zinc-900 text-amber-950 dark:text-amber-200 ring-1 ring-amber-500 shadow-2xs'
                          : 'border-stone-200/80 dark:border-zinc-700 bg-white/70 dark:bg-zinc-800/70 text-stone-600 dark:text-zinc-300 hover:bg-white dark:hover:bg-zinc-800'
                      }`}
                    >
                      <svg className="w-5.5 h-3.5 overflow-visible shrink-0" viewBox="0 0 24 16">
                        <path
                          d="M 1 8 Q 4 2 7 8 T 13 8 T 19 8 L 23 8"
                          fill="none"
                          stroke={branchLineShape === 'wavy' ? branchColor : '#78716c'}
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                      </svg>
                      <span className="truncate">Хвиляста</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Color Swatches + Custom Color */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-indigo-950 dark:text-indigo-200">Колір стрілки:</span>
                <div className="flex items-center gap-1.5">
                  {BRANCH_LINK_COLOR_PRESETS.map((preset) => (
                    <button
                      key={preset.hex}
                      type="button"
                      onClick={() => setBranchColor(preset.hex)}
                      style={{ backgroundColor: preset.hex }}
                      className={`w-5.5 h-5.5 rounded-full transition-transform hover:scale-110 cursor-pointer ${
                        branchColor.toLowerCase() === preset.hex.toLowerCase()
                          ? 'ring-2 ring-offset-1 ring-stone-800 dark:ring-zinc-200 dark:ring-offset-zinc-900'
                          : 'opacity-80'
                      }`}
                      title={preset.name}
                    />
                  ))}
                  <label
                    className="relative w-5.5 h-5.5 rounded-full border border-dashed border-indigo-400 dark:border-indigo-600 bg-white dark:bg-zinc-900 flex items-center justify-center cursor-pointer hover:border-indigo-600 overflow-hidden"
                    title="Обрати довільний колір"
                  >
                    <input
                      type="color"
                      value={branchColor}
                      onChange={(e) => setBranchColor(e.target.value)}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    <Palette size={11} className="text-indigo-700 dark:text-indigo-400 pointer-events-none" />
                  </label>
                </div>
              </div>

              {/* Thickness Slider & Presets */}
              <div className="space-y-1.5 pt-1 border-t border-indigo-200/60 dark:border-indigo-800/60">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-indigo-950 dark:text-indigo-200">Товщина лінії:</span>
                  <span className="text-[10.5px] font-mono font-bold text-indigo-800 dark:text-indigo-300 bg-white dark:bg-zinc-900 px-1.5 py-0.5 rounded border border-indigo-200 dark:border-indigo-800">
                    {branchStrokeWidth} px
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={1}
                    max={10}
                    step={1}
                    value={branchStrokeWidth}
                    onChange={(e) => setBranchStrokeWidth(Number(e.target.value))}
                    className="w-full accent-indigo-600 cursor-pointer h-1.5 bg-indigo-200/70 dark:bg-indigo-950 rounded-lg"
                  />
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  {[1, 2, 3, 4, 6, 8, 10].map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => setBranchStrokeWidth(w)}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold border cursor-pointer transition-colors ${
                        branchStrokeWidth === w
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white dark:bg-zinc-900 text-stone-700 dark:text-zinc-300 border-indigo-200/80 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/60'
                      }`}
                    >
                      {w}px
                    </button>
                  ))}
                </div>
              </div>

              {/* Live Arrow / Line Preview */}
              {(() => {
                const arrowLen = Math.max(10, Math.min(22, 8.5 + branchStrokeWidth * 1.3));
                const arrowHalfH = Math.max(5, Math.min(11, 4 + branchStrokeWidth * 0.7));
                const refX = Math.max(2, Number((arrowLen * 0.62).toFixed(1)));
                const notchX = Number((arrowLen * 0.2).toFixed(1));
                const previewText =
                  branchLabel.trim() ||
                  (connectionKind === 'godparent'
                    ? defaultGodparentLabel
                    : targetFullName
                    ? `→ ${targetFullName}`
                    : 'Міжгілкове посилання');

                return (
                  <div className="p-2.5 bg-white/85 dark:bg-zinc-900/85 rounded-xl border border-stone-200/80 dark:border-zinc-700/80 flex flex-col items-center gap-1">
                    <span className="text-[9.5px] font-bold uppercase tracking-wider text-stone-400 dark:text-zinc-500">
                      Попередній перегляд стрілки
                    </span>
                    <div className="relative w-full h-12 flex items-center justify-center">
                      <svg className="w-full h-12 overflow-visible" viewBox="0 0 300 48">
                        <defs>
                          <marker
                            id="connect-modal-arrow-preview"
                            viewBox={`0 0 ${arrowLen} ${arrowHalfH * 2}`}
                            refX={refX}
                            refY={arrowHalfH}
                            markerWidth={arrowLen}
                            markerHeight={arrowHalfH * 2}
                            markerUnits="userSpaceOnUse"
                            orient="auto"
                          >
                            <path
                              d={`M 0 0 L ${arrowLen} ${arrowHalfH} L 0 ${arrowHalfH * 2} L ${notchX} ${arrowHalfH} z`}
                              fill={branchColor}
                            />
                          </marker>
                        </defs>
                        <path
                          d={
                            branchLineShape === 'straight'
                              ? 'M 16 24 L 284 24'
                              : branchLineShape === 'wavy'
                              ? buildWavyPath({ x: 16, y: 24 }, { x: 284, y: 24 }).pathD
                              : 'M 16 34 Q 150 4 284 30'
                          }
                          fill="none"
                          stroke={branchColor}
                          strokeWidth={branchStrokeWidth}
                          strokeDasharray={involvesNote || branchLineShape !== 'wavy' ? '7 4' : undefined}
                          strokeLinecap={branchLineShape === 'wavy' && !involvesNote ? 'round' : 'butt'}
                          strokeLinejoin="round"
                          markerEnd="url(#connect-modal-arrow-preview)"
                        />
                        <circle
                          cx={16}
                          cy={branchLineShape === 'curved' ? 34 : 24}
                          r={Math.max(2.5, Math.min(5, branchStrokeWidth * 0.7 + 1))}
                          fill={branchColor}
                        />
                      </svg>
                      <span
                        style={{ borderColor: branchColor }}
                        className={`absolute px-2 py-0.5 rounded-full bg-white/95 dark:bg-zinc-900/95 border shadow-xs text-[10px] font-bold text-stone-800 dark:text-zinc-100 inline-flex items-center gap-1 max-w-[235px] ${
                          branchLineShape === 'curved' ? 'top-1.5' : 'top-1/2 -translate-y-1/2'
                        }`}
                      >
                        {connectionKind === 'godparent' ? (
                          <span className="text-[10px] leading-none shrink-0" style={{ color: branchColor }}>
                            ✝
                          </span>
                        ) : (
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: branchColor }} />
                        )}
                        {(connectionKind === 'note-link' || (connectionKind === 'branch-link' && involvesNote)) &&
                          probableRelation.trim() && (
                            <span
                              style={{
                                backgroundColor: `${branchColor}1a`,
                                color: branchColor,
                              }}
                              className="px-1.5 py-0.2 rounded-full text-[9px] font-extrabold shrink-0"
                            >
                              {probableRelation.trim()}
                            </span>
                          )}
                        <span className="truncate">{previewText}</span>
                        <ArrowUpRight size={10} className="shrink-0" style={{ color: branchColor }} />
                      </span>
                    </div>
                    {(involvesNote || connectionKind === 'note-link') && (
                      <span className="text-[10px] font-medium text-amber-800 dark:text-amber-300">
                        Лінія зв&apos;язку з нотаткою завжди пунктирна
                      </span>
                    )}
                  </div>
                );
              })()}

              <label className="flex items-center gap-2 cursor-pointer pt-1 border-t border-stone-200/70 dark:border-zinc-700/70">
                <input
                  type="checkbox"
                  checked={branchBidirectional}
                  onChange={(e) => setBranchBidirectional(e.target.checked)}
                  className="rounded text-indigo-700 focus:ring-indigo-600 accent-indigo-700 w-3.5 h-3.5 cursor-pointer"
                />
                <span className="text-xs font-medium text-stone-800 dark:text-zinc-200">
                  {connectionKind === 'godparent'
                    ? 'Зворотне посилання на картці хрещеника (малюється однією спільною лінією ↔)'
                    : 'Посилання для переходу на обох картках (малюється однією спільною лінією ↔)'}
                </span>
              </label>
            </div>
          ) : (
            <div className="p-3.5 bg-[#fbfbfa] dark:bg-zinc-950/60 rounded-xl border border-stone-200 dark:border-zinc-800 space-y-3">
              <div>
                <label className="block text-xs font-bold text-stone-800 dark:text-zinc-200 uppercase tracking-wider mb-1.5">
                  Рівень достовірності зв'язку
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    {
                      level: 'verified' as ConfidenceLevel,
                      label: '🟢 Перевірений',
                      sub: 'Є метрика / документ',
                      color: 'border-emerald-600 dark:border-emerald-500 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-200 ring-1 ring-emerald-600',
                    },
                    {
                      level: 'hypothetical' as ConfidenceLevel,
                      label: '⚪ Неперевірений',
                      sub: 'Версія / спогади (пунктир)',
                      color: 'border-stone-500 dark:border-zinc-500 bg-stone-100 dark:bg-zinc-800 text-stone-900 dark:text-zinc-100 ring-1 ring-stone-400 dark:ring-zinc-500',
                    },
                  ].map((item) => {
                    const isCur = confidenceLevel === item.level;
                    return (
                      <button
                        key={item.level}
                        type="button"
                        onClick={() => setConfidenceLevel(item.level)}
                        className={`py-2 px-2 rounded-lg border text-left flex flex-col transition-all cursor-pointer ${
                          isCur
                            ? `${item.color} font-semibold shadow-2xs`
                            : 'border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-stone-700 dark:text-zinc-300 hover:bg-stone-50 dark:hover:bg-zinc-800'
                        }`}
                      >
                        <span className="text-[11px] font-bold leading-tight">{item.label}</span>
                        <span className="text-[9.5px] text-stone-500 dark:text-zinc-400 font-normal leading-tight mt-0.5">{item.sub}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Archival Citation Input */}
              <div>
                <label className="block text-[11px] font-medium text-stone-700 dark:text-zinc-300 mb-1 flex items-center gap-1">
                  <FileText size={12} className="text-emerald-700 dark:text-emerald-400" />
                  <span>Архівне джерело або запис метрики (необов'язково)</span>
                </label>
                <input
                  type="text"
                  value={archiveSource}
                  onChange={(e) => setArchiveSource(e.target.value)}
                  placeholder="напр. ЦДІАЛ, фонд 201, опис 4а, спр. 115, арк. 32"
                  className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-stone-300 dark:border-zinc-700 focus:outline-none focus:ring-1 focus:ring-emerald-600 bg-white dark:bg-zinc-900 text-stone-900 dark:text-zinc-100 placeholder:text-stone-400 dark:placeholder:text-zinc-500"
                />
              </div>

              {/* Main lineage branch checkbox */}
              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={isMainBranch}
                  onChange={(e) => setIsMainBranch(e.target.checked)}
                  className="rounded text-emerald-800 focus:ring-emerald-600 accent-emerald-800 w-3.5 h-3.5 cursor-pointer"
                />
                <span className="text-xs font-medium text-stone-800 dark:text-zinc-200 flex items-center gap-1">
                  <Flame size={13} className="text-amber-600 dark:text-amber-400" />
                  <span>Пряма лінія роду (виділити лінію товстішим накресленням)</span>
                </span>
              </label>

              {/* Spouse children option */}
              {relationType === 'spouse' && targetPerson && (targetPerson.children?.length ?? 0) > 0 && (
                <label className="flex items-center gap-2 cursor-pointer pt-1 border-t border-stone-200/80 dark:border-zinc-800">
                  <input
                    type="checkbox"
                    checked={linkExistingSpouseChildren}
                    onChange={(e) => setLinkExistingSpouseChildren(e.target.checked)}
                    className="rounded text-emerald-800 focus:ring-emerald-600 accent-emerald-800 w-3.5 h-3.5 cursor-pointer"
                  />
                  <span className="text-xs text-stone-700 dark:text-zinc-300">
                    Пов'язати з дітьми подружжя ({targetPerson.children.length} осіб)
                  </span>
                </label>
              )}

              {/* Auto-graduate sticky note card when relation is established */}
              {(sourcePerson.isGhost || targetPerson?.isGhost) && (
                <div className="space-y-1.5 pt-1.5 border-t border-dashed border-amber-300 dark:border-amber-800">
                  {!graduateGhostCards && (
                    <p className="text-[11px] font-medium text-amber-900 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-lg px-2.5 py-1.5 leading-snug">
                      Зв&apos;язок із нотаткою автоматично малюватиметься пунктирною лінією.
                    </p>
                  )}
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={graduateGhostCards}
                      onChange={(e) => setGraduateGhostCards(e.target.checked)}
                      className="mt-0.5 rounded text-emerald-800 focus:ring-emerald-600 accent-emerald-800 w-3.5 h-3.5 cursor-pointer"
                    />
                    <span className="text-xs text-stone-800 dark:text-zinc-200 leading-snug">
                      Перетворити нотатку на звичайну картку особи після з&apos;єднання
                    </span>
                  </label>
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="pt-3 flex items-center justify-end gap-3 border-t border-stone-100 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-stone-700 dark:text-zinc-300 hover:bg-stone-100 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
            >
              Скасувати
            </button>
            <button
              type="submit"
              disabled={
                isCrossCanvasPickerActive
                  ? !selectedCrossCanvasEntry
                  : !selectedTargetId || !!cycleWarning
              }
              className={`px-5 py-2 text-xs font-semibold text-white rounded-lg shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer ${
                isCrossCanvasPickerActive
                  ? 'bg-emerald-700 hover:bg-emerald-800'
                  : connectionKind === 'godparent' || connectionKind === 'note-link'
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : connectionKind === 'branch-link'
                  ? 'bg-indigo-600 hover:bg-indigo-700'
                  : 'bg-emerald-800 hover:bg-emerald-900'
              }`}
            >
              {isCrossCanvasPickerActive ? (
                <ExternalLink size={14} />
              ) : connectionKind === 'branch-link' || connectionKind === 'godparent' || connectionKind === 'note-link' ? (
                <ArrowUpRight size={14} />
              ) : (
                <Link2 size={14} />
              )}
              <span>
                {connectionKind === 'godparent'
                  ? 'Створити лінію «Хресний / Хресна»'
                  : connectionKind === 'note-link'
                  ? 'Провести пунктирну лінію'
                  : connectionKind === 'branch-link'
                  ? "Створити міжгілковий зв'язок"
                  : "З'єднати лінією"}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
