import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Search,
  LocateFixed,
  Undo2,
  Calendar,
  GitFork,
  X,
  BarChart3,
  Layers,
  ChevronDown,
  Check,
  Shield,
  Map,
  Magnet,
  Grid,
  StickyNote,
  EyeOff,
  BookMarked,
  CalendarRange,
} from 'lucide-react';
import { Person } from '../types/tree';
import { ClanInfo } from '../utils/lineageUtils';
import { BlindSpotFilterMode, BLIND_SPOT_FILTER_LABELS } from '../utils/archiveAnalysis';
import { isPersonInYearRange } from '../utils/timelineUtils';
import { fetchAllTreesSearchIndex, CrossCanvasSearchTree, MAIN_TREE_ID } from '../utils/fileStorage';
import { formatCardId, getPersonIdMatchScore } from '../utils/cardIdUtils';
import { SilhouetteAvatar } from './SilhouetteAvatar';
import { AnimatedLockIcon } from './AnimatedIcons';

interface CanvasControlsProps {
  isAdmin?: boolean;
  onCenterOnFirstPerson: () => void;
  showTimeline: boolean;
  onToggleTimeline: () => void;
  showMiniMap?: boolean;
  onToggleMiniMap?: () => void;
  showGrid?: boolean;
  onToggleGrid?: () => void;
  persons: Record<string, Person>;
  onSelectAndCenter: (personId: string) => void;
  onOpenMyTrees?: () => void;
  // Undo action
  onUndo?: () => void;
  canUndo?: boolean;
  // Visual lineage & clan enhancements
  selectedClanFilter: string | null;
  onSelectClanFilter: (clanName: string | null) => void;
  clanList: ClanInfo[];
  selectedCount?: number;
  onClearSelection?: () => void;
  hasUserPerson?: boolean;
  // Card Freeze / Lock protection
  isLayoutLocked?: boolean;
  onToggleLockLayout?: () => void;
  // Magnetic Alignment Snap toggle
  isSnapEnabled?: boolean;
  onToggleSnap?: () => void;
  // Cross-canvas search
  currentTreeId?: string;
  currentTreeTitle?: string;
  onSelectTreeAndPerson?: (treeId: string, personId: string) => void;
  // Create quick draft card (ghost note or screenshot)
  onOpenQuickDraft?: () => void;
  // Blind-spot highlighting filter (Admin)
  blindSpotFilter?: BlindSpotFilterMode;
  onChangeBlindSpotFilter?: (mode: BlindSpotFilterMode) => void;
  onOpenArchiveRegistry?: () => void;
  // Admin Birth/Death Chronology modal
  isChronologyOpen?: boolean;
  onOpenChronology?: () => void;
}

export const CanvasControls: React.FC<CanvasControlsProps> = ({
  isAdmin = false,
  onCenterOnFirstPerson,
  showTimeline,
  onToggleTimeline,
  showMiniMap,
  onToggleMiniMap,
  showGrid = true,
  onToggleGrid,
  persons,
  onSelectAndCenter,
  onOpenMyTrees,
  onUndo,
  canUndo,
  selectedClanFilter,
  onSelectClanFilter,
  clanList,
  selectedCount = 0,
  onClearSelection,
  hasUserPerson,
  isLayoutLocked,
  onToggleLockLayout,
  isSnapEnabled = true,
  onToggleSnap,
  currentTreeId,
  currentTreeTitle,
  onSelectTreeAndPerson,
  onOpenQuickDraft,
  blindSpotFilter = 'off',
  onChangeBlindSpotFilter,
  onOpenArchiveRegistry,
  isChronologyOpen = false,
  onOpenChronology,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [isClanDropdownOpen, setIsClanDropdownOpen] = useState(false);
  const [allCanvases, setAllCanvases] = useState<CrossCanvasSearchTree[]>([]);
  const [isLoadingCanvases, setIsLoadingCanvases] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const searchPopoverRef = useRef<HTMLDivElement>(null);
  const searchQueryRef = useRef(searchQuery);
  searchQueryRef.current = searchQuery;

  const normalizedCurrentTreeId =
    !currentTreeId || currentTreeId === 'default-tree' || currentTreeId === 'main-tree'
      ? MAIN_TREE_ID
      : currentTreeId;

  // Load cross-canvas search index whenever search opens
  useEffect(() => {
    if (!isSearchOpen && !isSearchExpanded) return;
    let cancelled = false;
    setIsLoadingCanvases(true);
    fetchAllTreesSearchIndex()
      .then((trees) => {
        if (!cancelled) {
          setAllCanvases(trees);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingCanvases(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isSearchOpen, isSearchExpanded]);

  // Global hotkeys: / or Ctrl+F / Cmd+K to open search, Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in input/textarea/modal
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      const isInputFocused = activeTag === 'input' || activeTag === 'textarea';

      if (e.key === 'Escape') {
        if (isSearchOpen || isSearchExpanded) {
          setIsSearchOpen(false);
          if (!searchQueryRef.current.trim()) setIsSearchExpanded(false);
          searchInputRef.current?.blur();
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'f' || e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        setIsSearchExpanded(true);
        setIsSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
        return;
      }

      if (e.key === '/' && !isInputFocused) {
        e.preventDefault();
        setIsSearchExpanded(true);
        setIsSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSearchOpen, isSearchExpanded]);

  // Click outside to dismiss search popover
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const inInput = searchContainerRef.current?.contains(target);
      const inPopover = searchPopoverRef.current?.contains(target);
      if (!inInput && !inPopover) {
        setIsSearchOpen(false);
        if (!searchQueryRef.current.trim()) {
          setIsSearchExpanded(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Build unified search pool across current live canvas + all other canvases
  const unifiedEntries = useMemo(() => {
    const entries: Array<{
      person: Person;
      treeId: string;
      treeTitle: string;
      isCurrentTree: boolean;
    }> = [];

    const activeTitle =
      currentTreeTitle ||
      allCanvases.find((c) => c.treeId === normalizedCurrentTreeId)?.treeTitle ||
      'Поточне полотно';

    // 1. Live persons from current active canvas
    Object.values(persons).forEach((p) => {
      entries.push({
        person: p,
        treeId: normalizedCurrentTreeId,
        treeTitle: activeTitle,
        isCurrentTree: true,
      });
    });

    // 2. Persons from all other canvases
    allCanvases.forEach((canvas) => {
      if (canvas.treeId === normalizedCurrentTreeId) return;
      canvas.persons.forEach((p) => {
        entries.push({
          person: p,
          treeId: canvas.treeId,
          treeTitle: canvas.treeTitle,
          isCurrentTree: false,
        });
      });
    });

    return entries;
  }, [persons, allCanvases, normalizedCurrentTreeId, currentTreeTitle]);

  // Filter persons across ALL canvases by name, patronymic, maiden name, nickname, house number, year, or year range
  const searchResult = useMemo(() => {
    const rawQuery = searchQuery.trim();
    if (!rawQuery) return { filtered: [], parsedRange: null, parsedYear: null, canvasMatchCount: 0 };

    const isExplicitIdQuery = /^(#|id\s*[:#-]?\s*)/i.test(rawQuery);

    // 1. Check for year range pattern (e.g. "1900-1920", "1900 - 1920", "1900..1920")
    const rangeMatch = !isExplicitIdQuery
      ? rawQuery.match(/\b(1[6-9]\d{2}|20\d{2})\s*[\-–—\.\.]+\s*(1[6-9]\d{2}|20\d{2})\b/)
      : null;

    let minYear: number | null = null;
    let maxYear: number | null = null;
    let singleYear: number | null = null;
    let textQuery = rawQuery;

    if (rangeMatch) {
      const y1 = parseInt(rangeMatch[1], 10);
      const y2 = parseInt(rangeMatch[2], 10);
      minYear = Math.min(y1, y2);
      maxYear = Math.max(y1, y2);
      textQuery = rawQuery.replace(rangeMatch[0], '').trim();
    } else if (!isExplicitIdQuery) {
      // 2. Check for single 4-digit year pattern (e.g. "1916")
      const singleMatch = rawQuery.match(/\b(1[6-9]\d{2}|20\d{2})\b/);
      if (singleMatch) {
        singleYear = parseInt(singleMatch[1], 10);
        minYear = singleYear;
        maxYear = singleYear;
        textQuery = rawQuery.replace(singleMatch[0], '').trim();
      }
    }

    const lowerText = textQuery.toLowerCase();

    const filtered = unifiedEntries.filter(({ person: p, treeTitle }) => {
      // Check year range constraint if specified
      if (minYear !== null && maxYear !== null) {
        const matchesYear = isPersonInYearRange(p, minYear, maxYear);
        if (!matchesYear) return false;
      }

      // Check text or ID portion
      if (lowerText) {
        if (getPersonIdMatchScore(p, textQuery) > 0) {
          return true;
        }
        const houseStr = p.houseNumber ? `№${p.houseNumber} дім ${p.houseNumber} house ${p.houseNumber}` : '';
        const idStr = p.cardId ? `#${p.cardId} id:${p.cardId} ${p.cardId}` : '';
        const fullText = `${p.firstName || ''} ${p.lastName || ''} ${p.patronymic || ''} ${p.maidenName || ''} ${p.nickname || ''} ${p.profession || ''} ${p.birthPlace || ''} ${p.residencePlace || ''} ${p.yearsDisplay || ''} ${houseStr} ${idStr} ${treeTitle}`.toLowerCase();

        const words = lowerText.split(/\s+/).filter(Boolean);
        const matchesText = words.every((word) => fullText.includes(word));
        if (!matchesText) return false;
      }

      return true;
    });

    // Prioritize current canvas matches and exact/higher ID matches first
    filtered.sort((a, b) => {
      if (a.isCurrentTree !== b.isCurrentTree) return a.isCurrentTree ? -1 : 1;
      const sa = getPersonIdMatchScore(a.person, rawQuery);
      const sb = getPersonIdMatchScore(b.person, rawQuery);
      if (sa !== sb) return sb - sa;
      return 0;
    });

    const uniqueCanvases = new Set(filtered.map((item) => item.treeId));

    return {
      filtered,
      parsedRange: minYear !== null && maxYear !== null && minYear !== maxYear ? ([minYear, maxYear] as [number, number]) : null,
      parsedYear: singleYear,
      canvasMatchCount: uniqueCanvases.size,
    };
  }, [searchQuery, unifiedEntries]);

  const filteredResults = searchResult.filtered;

  useEffect(() => {
    setHighlightedIndex(0);
  }, [searchQuery, filteredResults.length]);

  const handlePickSearchResult = (item: { person: Person; treeId: string; isCurrentTree: boolean }) => {
    if (item.isCurrentTree || !onSelectTreeAndPerson) {
      onSelectAndCenter(item.person.id);
    } else {
      onSelectTreeAndPerson(item.treeId, item.person.id);
    }
    setIsSearchOpen(false);
    setSearchQuery('');
    setIsSearchExpanded(false);
  };

  return (
    <>
      {/* Modern Floating Bottom Dock */}
      <nav
        aria-label="Панель керування деревом"
        className="fixed bottom-[max(0.875rem,env(safe-area-inset-bottom))] sm:bottom-5 left-1/2 -translate-x-1/2 z-40 max-w-[calc(100vw-16px)] sm:max-w-[calc(100vw-32px)]"
      >
        {/* Active Blind-Spot Highlight Banner */}
        {isAdmin && blindSpotFilter !== 'off' && onChangeBlindSpotFilter && (
          <div className="mb-2 mx-auto w-fit max-w-full bg-amber-950/95 dark:bg-amber-950 text-amber-50 border border-amber-500/70 rounded-full px-3.5 py-1.5 shadow-lg flex items-center gap-2 text-xs font-semibold animate-in fade-in slide-in-from-bottom-2 duration-150">
            <EyeOff size={14} className="text-amber-300 shrink-0" />
            <span className="truncate">
              Білі плями: <strong className="text-amber-200">{BLIND_SPOT_FILTER_LABELS[blindSpotFilter]}</strong>
            </span>
            {onOpenArchiveRegistry && (
              <button
                type="button"
                onClick={onOpenArchiveRegistry}
                className="px-2.5 py-1 rounded-full bg-amber-800/90 hover:bg-amber-700 text-amber-100 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer shrink-0"
              >
                <BookMarked size={12} />
                <span>Документи</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onChangeBlindSpotFilter('off')}
              className="p-1 rounded-full hover:bg-amber-800 text-amber-200 hover:text-white cursor-pointer shrink-0"
              title="Вимкнути підсвічування білих плям"
              aria-label="Вимкнути підсвічування білих плям"
            >
              <X size={14} />
            </button>
          </div>
        )}
        <div className="bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border border-stone-200/90 dark:border-zinc-800/90 shadow-[0_16px_40px_-8px_rgba(28,25,23,0.16),0_2px_8px_rgba(28,25,23,0.06)] dark:shadow-[0_18px_44px_-8px_rgba(0,0,0,0.68)] rounded-[20px] sm:rounded-2xl p-1.5 flex items-center gap-1.5 transition-all overflow-x-auto overscroll-x-contain scroll-smooth snap-x touch-pan-x no-scrollbar">

          {/* 1. History (Undo Action) - Admin only */}
          {isAdmin && onUndo && (
            <div className={`${isSearchExpanded || searchQuery ? 'hidden sm:flex' : 'flex'} items-center gap-1.5 shrink-0`}>
              <button
                type="button"
                onClick={onUndo}
                disabled={!canUndo}
                className={`group h-11 min-w-[44px] px-3 sm:h-10 sm:min-w-[40px] sm:px-3 rounded-[14px] sm:rounded-xl flex items-center justify-center gap-1.5 text-xs font-semibold transition-all cursor-pointer active:scale-95 shrink-0 whitespace-nowrap snap-start focus-visible:outline-2 focus-visible:outline-emerald-600 ${
                  canUndo
                    ? 'bg-stone-100 hover:bg-stone-200 text-stone-700 hover:text-stone-900 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-200 dark:hover:text-white'
                    : 'bg-stone-100/50 text-stone-400 dark:bg-zinc-800/40 dark:text-zinc-600 cursor-not-allowed opacity-50'
                }`}
                title={canUndo ? 'Скасувати останню дію (Ctrl+Z)' : 'Немає дій для скасування'}
                aria-label="Скасувати"
              >
                <Undo2
                  size={18}
                  className={`transition-transform duration-200 ${
                    canUndo
                      ? 'text-stone-600 dark:text-zinc-300 group-hover:-rotate-12'
                      : 'text-stone-400 dark:text-zinc-600'
                  }`}
                />
                <span className="hidden xl:inline">Скасувати</span>
              </button>
              <div className="h-6 w-px bg-stone-200 dark:bg-zinc-800 shrink-0" />
            </div>
          )}

          {/* 2. Navigation & Layer Toggles */}
          <div className={`${isSearchExpanded || searchQuery ? 'hidden sm:flex' : 'flex'} items-center gap-1.5 shrink-0`}>

            {/* Center on person */}
            <button
              type="button"
              onClick={onCenterOnFirstPerson}
              className={`group h-11 min-w-[44px] ${!isAdmin ? 'px-3' : 'px-3 sm:px-3'} sm:h-10 sm:min-w-[40px] rounded-[14px] sm:rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 hover:text-stone-900 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-200 dark:hover:text-white transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-1.5 font-semibold text-xs shrink-0 whitespace-nowrap snap-start focus-visible:outline-2 focus-visible:outline-emerald-600`}
              title={
                hasUserPerson
                  ? 'Відцентрувати екран на моїй картці'
                  : 'Центрувати на обраній або головній картці'
              }
              aria-label="Центрувати екран"
            >
              <LocateFixed
                size={18}
                className="text-stone-600 dark:text-zinc-300 transition-transform duration-200 group-hover:scale-110 shrink-0"
              />
              {!isAdmin ? (
                <>
                  <span className="sm:hidden">Центр</span>
                  <span className="hidden sm:inline">Центрувати</span>
                </>
              ) : (
                <span className="hidden md:inline">Центрувати</span>
              )}
            </button>

            {/* Timeline ruler toggle - Admin only */}
            {isAdmin && (
              <button
                type="button"
                onClick={onToggleTimeline}
                className={`group h-11 min-w-[44px] px-3 sm:h-10 sm:min-w-[40px] sm:px-3 rounded-[14px] sm:rounded-xl transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-1.5 font-semibold text-xs shrink-0 whitespace-nowrap border snap-start focus-visible:outline-2 focus-visible:outline-emerald-600 ${
                  showTimeline
                    ? 'bg-stone-900 text-white border-stone-900 dark:bg-emerald-600 dark:border-emerald-500 shadow-2xs'
                    : 'bg-stone-100 hover:bg-stone-200 text-stone-700 hover:text-stone-900 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-200 dark:hover:text-white border-transparent'
                }`}
                title={showTimeline ? 'Приховати шкалу років' : 'Показати шкалу років зліва'}
                aria-label="Шкала часу"
                aria-pressed={showTimeline}
              >
                <Calendar
                  size={18}
                  className={`transition-transform duration-200 group-hover:-translate-y-0.5 shrink-0 ${
                    showTimeline ? 'text-emerald-300 dark:text-white' : 'text-stone-600 dark:text-zinc-300'
                  }`}
                />
                <span className="hidden xl:inline">Роки</span>
              </button>
            )}

            {/* Birth & Death Chronology by Years - Admin only */}
            {isAdmin && onOpenChronology && (
              <button
                type="button"
                onClick={onOpenChronology}
                className={`group h-11 min-w-[44px] px-3 sm:h-10 sm:min-w-[40px] sm:px-3 rounded-[14px] sm:rounded-xl transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-1.5 font-semibold text-xs shrink-0 whitespace-nowrap border snap-start focus-visible:outline-2 focus-visible:outline-emerald-600 ${
                  isChronologyOpen
                    ? 'bg-stone-900 text-white border-stone-900 dark:bg-emerald-600 dark:border-emerald-500 shadow-2xs'
                    : 'bg-stone-100 hover:bg-stone-200 text-stone-700 hover:text-stone-900 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-200 dark:hover:text-white border-transparent'
                }`}
                title="Хронологія народжень і смертей по роках"
                aria-label="Хронологія народжень і смертей"
                aria-pressed={isChronologyOpen}
              >
                <CalendarRange
                  size={18}
                  className={`transition-transform duration-200 group-hover:scale-110 shrink-0 ${
                    isChronologyOpen ? 'text-emerald-300 dark:text-white' : 'text-stone-600 dark:text-zinc-300'
                  }`}
                />
                <span className="hidden lg:inline">Хронологія</span>
              </button>
            )}

            {/* MiniMap radar toggle button */}
            {onToggleMiniMap && (
              <button
                type="button"
                onClick={onToggleMiniMap}
                className={`group h-11 min-w-[44px] px-3 sm:h-10 sm:min-w-[40px] sm:px-3 rounded-[14px] sm:rounded-xl transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-1.5 font-semibold text-xs shrink-0 whitespace-nowrap border snap-start focus-visible:outline-2 focus-visible:outline-emerald-600 ${
                  showMiniMap
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-950 dark:bg-emerald-950/60 dark:border-emerald-700 dark:text-emerald-300 font-bold shadow-2xs'
                    : 'bg-stone-100 hover:bg-stone-200 text-stone-700 hover:text-stone-900 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-200 dark:hover:text-white border-transparent'
                }`}
                title={showMiniMap ? 'Сховати міні-карту' : 'Показати міні-карту'}
                aria-label="Міні-карта"
                aria-pressed={showMiniMap}
              >
                <Map
                  size={18}
                  className={`transition-transform duration-200 group-hover:scale-110 shrink-0 ${
                    showMiniMap ? 'text-emerald-700 dark:text-emerald-300' : 'text-stone-600 dark:text-zinc-300'
                  }`}
                />
                {!isAdmin ? (
                  <>
                    <span className="sm:hidden">Карта</span>
                    <span className="hidden sm:inline">Міні-карта</span>
                  </>
                ) : (
                  <span className="hidden sm:inline">Міні-карта</span>
                )}
              </button>
            )}

            {/* Background grid toggle button - for both admin and guest */}
            {onToggleGrid && (
              <button
                type="button"
                onClick={onToggleGrid}
                className={`group h-11 min-w-[44px] px-3 sm:h-10 sm:min-w-[40px] sm:px-3 rounded-[14px] sm:rounded-xl transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-1.5 font-semibold text-xs shrink-0 whitespace-nowrap border snap-start focus-visible:outline-2 focus-visible:outline-emerald-600 ${
                  showGrid
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-950 dark:bg-emerald-950/60 dark:border-emerald-700 dark:text-emerald-300 font-bold shadow-2xs'
                    : 'bg-stone-100 hover:bg-stone-200 text-stone-700 hover:text-stone-900 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-200 dark:hover:text-white border-transparent'
                }`}
                title={showGrid ? 'Приховати фонову сітку' : 'Увімкнути фонову сітку полотна'}
                aria-label="Фонова сітка"
                aria-pressed={showGrid}
              >
                <Grid
                  size={18}
                  className={`transition-transform duration-200 group-hover:scale-110 shrink-0 ${
                    showGrid ? 'text-emerald-700 dark:text-emerald-300' : 'text-stone-600 dark:text-zinc-300'
                  }`}
                />
                <span className={!isAdmin ? 'inline' : 'hidden sm:inline'}>Сітка</span>
              </button>
            )}

            {/* Admin Canvas Tools Divider */}
            {isAdmin && (onToggleLockLayout || onToggleSnap || onOpenQuickDraft) && (
              <div className="h-6 w-px bg-stone-200 dark:bg-zinc-800 shrink-0 mx-0.5" />
            )}

            {/* Card Freeze / Lock Layout Protection Toggle - Admin only */}
            {isAdmin && onToggleLockLayout && (
              <button
                type="button"
                onClick={onToggleLockLayout}
                className={`h-11 min-w-[44px] px-3 sm:h-10 sm:w-10 sm:min-w-[40px] sm:px-0 rounded-[14px] sm:rounded-xl transition-all cursor-pointer active:scale-90 flex items-center justify-center shrink-0 group border snap-start focus-visible:outline-2 focus-visible:outline-emerald-600 ${
                  isLayoutLocked
                    ? 'bg-stone-900 text-white border-stone-900 dark:bg-emerald-600 dark:border-emerald-500 shadow-2xs'
                    : 'bg-stone-100 hover:bg-stone-200 text-stone-700 hover:text-stone-900 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-200 dark:hover:text-white border-transparent'
                }`}
                title={
                  isLayoutLocked
                    ? 'Положення карток заблоковано (натисніть, щоб розблокувати)'
                    : 'Зафіксувати положення карток'
                }
                aria-label={isLayoutLocked ? 'Розблокувати розміщення карток' : 'Зафіксувати розміщення карток'}
                aria-pressed={isLayoutLocked}
              >
                <AnimatedLockIcon
                  locked={Boolean(isLayoutLocked)}
                  size={18}
                  className={
                    isLayoutLocked
                      ? 'text-white'
                      : 'text-stone-600 group-hover:text-stone-900 dark:text-zinc-300 dark:group-hover:text-white'
                  }
                />
              </button>
            )}

            {/* Magnetic Alignment Snap Toggle - Admin only */}
            {isAdmin && onToggleSnap && (
              <button
                type="button"
                onClick={onToggleSnap}
                className={`h-11 min-w-[44px] px-3 sm:h-10 sm:w-10 sm:min-w-[40px] sm:px-0 rounded-[14px] sm:rounded-xl transition-all cursor-pointer active:scale-90 flex items-center justify-center shrink-0 group border snap-start focus-visible:outline-2 focus-visible:outline-emerald-600 ${
                  isSnapEnabled
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-700 shadow-2xs'
                    : 'bg-stone-100 hover:bg-stone-200 text-stone-500 hover:text-stone-900 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-400 dark:hover:text-white border-transparent'
                }`}
                title={
                  isSnapEnabled
                    ? 'Магнітне вирівнювання увімкнено (затисніть Alt під час перетягування для вільного руху)'
                    : 'Магнітне вирівнювання вимкнено (вільне ручне розміщення)'
                }
                aria-label={isSnapEnabled ? 'Вимкнути магнітне вирівнювання' : 'Увімкнути магнітне вирівнювання'}
                aria-pressed={isSnapEnabled}
              >
                <Magnet
                  size={18}
                  className={`transition-transform duration-200 group-hover:scale-110 ${
                    isSnapEnabled ? 'text-emerald-700 dark:text-emerald-300' : ''
                  }`}
                />
              </button>
            )}

            {/* Create Quick Note (Sticker) / Screenshot Card - Admin only */}
            {isAdmin && onOpenQuickDraft && (
              <button
                type="button"
                onClick={onOpenQuickDraft}
                className="group h-11 min-w-[44px] px-3 sm:h-10 sm:min-w-[40px] sm:px-3 rounded-[14px] sm:rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-950 dark:bg-amber-950/40 dark:hover:bg-amber-950/70 dark:text-amber-200 border border-amber-300/90 dark:border-amber-800/70 transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-1.5 font-semibold text-xs shrink-0 whitespace-nowrap snap-start focus-visible:outline-2 focus-visible:outline-amber-500"
                title="Створити нотатку (стікер) або картку-фото на полотні (Alt + подвійний клік)"
                aria-label="Створити нотатку на полотні"
              >
                <StickyNote size={16.5} className="text-amber-600 dark:text-amber-400 transition-transform duration-200 group-hover:scale-110 shrink-0" />
                <span className="hidden md:inline">+ Нотатка</span>
              </button>
            )}
          </div>

          <div className={`${isSearchExpanded || searchQuery ? 'hidden sm:block' : 'block'} h-6 w-px bg-stone-200 dark:bg-zinc-800 shrink-0`} />

          {/* 4. Collapsible Smart Search */}
          <div ref={searchContainerRef} className="relative shrink-0">
            {!isSearchExpanded && !searchQuery ? (
              <button
                type="button"
                onClick={() => {
                  setIsSearchExpanded(true);
                  setIsSearchOpen(true);
                  setTimeout(() => searchInputRef.current?.focus(), 50);
                }}
                className="h-11 min-w-[44px] px-3 sm:h-10 sm:min-w-[40px] sm:px-3.5 rounded-[14px] sm:rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 hover:text-stone-900 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-200 dark:hover:text-white transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-1.5 text-xs font-semibold whitespace-nowrap snap-start focus-visible:outline-2 focus-visible:outline-emerald-600"
                title="Швидкий пошук особи, року чи дому по всіх полотнах (/ або Ctrl+K)"
                aria-label="Пошук"
              >
                <Search size={18} className="text-stone-600 dark:text-zinc-300 shrink-0" />
                <span className={!isAdmin ? 'inline' : 'hidden lg:inline'}>Пошук</span>
                <kbd className="hidden xl:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono font-medium text-stone-500 bg-white border border-stone-200 dark:text-zinc-400 dark:bg-zinc-900 dark:border-zinc-700 rounded-md leading-none">
                  /
                </kbd>
              </button>
            ) : (
              <div className="relative flex items-center animate-in fade-in slide-in-from-right-2 duration-150">
                <Search
                  size={16}
                  className="absolute left-3.5 text-stone-500 dark:text-zinc-400 pointer-events-none"
                />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Пошук по всіх полотнах..."
                  value={searchQuery}
                  onFocus={() => setIsSearchOpen(true)}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setIsSearchOpen(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown' && filteredResults.length > 0) {
                      e.preventDefault();
                      setHighlightedIndex((prev) => (prev + 1) % filteredResults.length);
                    } else if (e.key === 'ArrowUp' && filteredResults.length > 0) {
                      e.preventDefault();
                      setHighlightedIndex((prev) => (prev - 1 + filteredResults.length) % filteredResults.length);
                    } else if (e.key === 'Enter' && filteredResults.length > 0) {
                      e.preventDefault();
                      const chosen = filteredResults[highlightedIndex] || filteredResults[0];
                      if (chosen) handlePickSearchResult(chosen);
                    }
                  }}
                  className="h-11 sm:h-10 w-[calc(100vw-32px)] sm:w-64 md:w-72 text-base sm:text-xs pl-10 pr-11 rounded-[14px] sm:rounded-xl bg-stone-100 text-stone-900 placeholder:text-stone-500 border border-stone-200 focus:outline-hidden focus:bg-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:border-zinc-700 dark:focus:bg-zinc-900 dark:focus:border-emerald-500 transition-all font-medium"
                  title="Швидкий пошук по всіх полотнах: ім'я, дівоче прізвище, № будинку або рік (напр. 1916 чи 1900-1920)"
                />
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setIsSearchOpen(false);
                    setIsSearchExpanded(false);
                  }}
                  className="absolute right-1 w-9 h-9 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center text-stone-500 hover:text-stone-800 hover:bg-stone-200/70 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
                  title="Згорнути пошук (Esc)"
                  aria-label="Очистити пошук"
                >
                  <X size={16} />
                </button>
              </div>
            )}
          </div>

        </div>

        {/* Search Results Dropdown Popover — rendered OUTSIDE overflow-x-auto so it is never clipped */}
        {isSearchOpen && (
          <div
            ref={searchPopoverRef}
            className="absolute bottom-full mb-2.5 left-1/2 -translate-x-1/2 w-[340px] sm:w-[440px] max-w-[calc(100vw-24px)] max-h-[60vh] sm:max-h-80 overflow-y-auto bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-stone-200/90 dark:border-zinc-800 py-1.5 z-50 divide-y divide-stone-100 dark:divide-zinc-800/80 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="px-3.5 py-2 text-[10.5px] uppercase font-bold text-stone-500 dark:text-zinc-400 bg-stone-50/90 dark:bg-zinc-800/90 flex items-center justify-between gap-2 sticky top-0 z-10">
              <span>
                {searchQuery.trim()
                  ? `Знайдено ${filteredResults.length} осіб${searchResult.canvasMatchCount > 1 ? ` (${searchResult.canvasMatchCount} полотна)` : ''}`
                  : `Пошук по всіх полотнах${allCanvases.length > 1 ? ` (${allCanvases.length})` : ''}:`}
              </span>
              <div className="flex items-center gap-1.5">
                {isLoadingCanvases && (
                  <span className="text-[9.5px] font-normal lowercase text-stone-400 dark:text-zinc-500">оновлення...</span>
                )}
                {searchResult.parsedRange && (
                  <span className="flex items-center gap-1 text-[9.5px] font-mono font-bold text-stone-800 bg-stone-200 dark:text-zinc-200 dark:bg-zinc-700 px-2 py-0.5 rounded-full lowercase">
                    <Calendar size={10} />
                    {searchResult.parsedRange[0]}–{searchResult.parsedRange[1]} рр.
                  </span>
                )}
                {searchResult.parsedYear && !searchResult.parsedRange && (
                  <span className="flex items-center gap-1 text-[9.5px] font-mono font-bold text-stone-800 bg-stone-200 dark:text-zinc-200 dark:bg-zinc-700 px-2 py-0.5 rounded-full lowercase">
                    <Calendar size={10} />
                    Рік: {searchResult.parsedYear}
                  </span>
                )}
              </div>
            </div>

            {!searchQuery.trim() ? (
              <div className="p-3 text-xs text-stone-600 dark:text-zinc-400 space-y-1.5">
                <p className="font-medium text-stone-800 dark:text-zinc-200">Підказки для швидкого пошуку (працює по всіх полотнах):</p>
                <ul className="text-[11px] space-y-1 text-stone-600 dark:text-zinc-400 list-disc list-inside">
                  <li>За ID картки: <code className="bg-stone-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded font-mono text-stone-800 dark:text-zinc-200 font-bold">#12</code> або <code className="bg-stone-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded font-mono text-stone-800 dark:text-zinc-200 font-bold">12</code></li>
                  <li>За роком: <code className="bg-stone-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded font-mono text-stone-800 dark:text-zinc-200 font-bold">1916</code></li>
                  <li>За періодом: <code className="bg-stone-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded font-mono text-stone-800 dark:text-zinc-200 font-bold">1900-1930</code></li>
                  <li>За номером дому: <code className="bg-stone-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded font-mono text-stone-800 dark:text-zinc-200 font-bold">№286</code> або <code className="bg-stone-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded font-mono text-stone-800 dark:text-zinc-200 font-bold">дім 329</code></li>
                  <li>За ім&apos;ям, дівочим прізвищем, прізвиськом або назвою полотна</li>
                </ul>
              </div>
            ) : filteredResults.length === 0 ? (
              <div className="px-4 py-5 text-xs text-stone-600 dark:text-zinc-400 text-center space-y-1">
                <p className="font-semibold text-stone-800 dark:text-zinc-200">Нікого не знайдено</p>
                <p className="text-[11px] text-stone-500 dark:text-zinc-400">
                  Спробуйте інше написання імені або введіть період (напр. <code className="bg-stone-100 dark:bg-zinc-800 px-1 rounded">1900-1920</code>)
                </p>
              </div>
            ) : (
              filteredResults.slice(0, 60).map((item, idx) => {
                const p = item.person;
                const fullName = [p.firstName, p.lastName].filter(Boolean).join(' ') || '?';
                const isHighlighted = idx === highlightedIndex;
                return (
                  <button
                    key={`${item.treeId}:${p.id}`}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    onClick={() => handlePickSearchResult(item)}
                    className={`w-full text-left px-3.5 py-2.5 sm:py-2 transition-colors flex items-center justify-between gap-2.5 group cursor-pointer ${
                      isHighlighted ? 'bg-stone-100 dark:bg-zinc-800' : 'hover:bg-stone-50 dark:hover:bg-zinc-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <SilhouetteAvatar
                        gender={p.gender}
                        avatarUrl={p.avatarUrl}
                        name={fullName}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[9.5px] font-mono font-bold text-stone-600 bg-stone-100 border border-stone-200/80 dark:text-zinc-300 dark:bg-zinc-800 dark:border-zinc-700 px-1.5 py-0.2 rounded shrink-0">
                            {formatCardId(p)}
                          </span>
                          <span className="text-xs font-semibold text-stone-900 dark:text-zinc-100 transition-colors truncate">
                            {fullName}
                          </span>
                          {p.gender === 'female' && p.maidenName && (
                            <span className="text-[10px] italic text-stone-600 dark:text-zinc-400 truncate">
                              ({p.maidenName})
                            </span>
                          )}
                          {p.houseNumber && (
                            <span
                              className="text-[9px] font-mono font-bold text-stone-700 bg-stone-100 dark:text-zinc-300 dark:bg-zinc-800 px-1.5 py-0.2 rounded-full shrink-0"
                              title={`Номер дому: №${p.houseNumber}`}
                            >
                              №{p.houseNumber}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[10.5px] text-stone-500 dark:text-zinc-400 font-mono mt-0.5 flex-wrap">
                          {p.yearsDisplay && <span>{p.yearsDisplay}</span>}
                          {p.nickname && <span className="italic text-stone-600 dark:text-zinc-400 font-sans">«{p.nickname}»</span>}
                          <span
                            className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded-md font-sans text-[9.5px] font-medium truncate max-w-[160px] ${
                              item.isCurrentTree
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/70 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/70'
                                : 'bg-amber-50 text-amber-900 border border-amber-200/70 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/70'
                            }`}
                            title={`Полотно: ${item.treeTitle}`}
                          >
                            <Layers size={9} className="shrink-0" />
                            <span className="truncate">{item.treeTitle}</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    <span className="text-[10px] font-semibold text-stone-700 bg-stone-100 group-hover:bg-stone-200 dark:text-zinc-200 dark:bg-zinc-800 dark:group-hover:bg-zinc-700 px-2 py-0.5 rounded-lg shrink-0 transition-all">
                      {item.isCurrentTree ? 'Перейти →' : 'Відкрити →'}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        )}
      </nav>
    </>
  );
};
