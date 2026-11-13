import React, { useRef, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Download,
  Upload,
  BarChart3,
  Calendar,
  Heart,
  FolderTree,
  Plus,
  Pencil,
  Trash2,
  Crown,
  GripVertical,
  Check,
  Layers,
  Tag,
  Terminal,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  UserCheck,
  Sun,
  Moon,
  MessageSquareHeart,
  Paintbrush,
} from 'lucide-react';
import { ServerStatusIndicator } from './ServerStatusIndicator';
import {
  AnimatedThemeIcon,
  AnimatedMenuIcon,
  AnimatedValidationIcon,
} from './AnimatedIcons';
import { fetchServerTrees, MAIN_TREE_ID, TREES_CHANGED_EVENT } from '../utils/fileStorage';

interface TopNavbarProps {
  isAdmin: boolean;
  onOpenAuthModal: () => void;
  onToggleAdminRole?: () => void;
  onOpenMyTrees?: () => void;
  currentTreeTitle?: string;
  currentTreeId?: string;
  treeVersion?: string;
  onUpdateVersion?: (newVersion: string) => void;
  isMainTree?: boolean;
  onReturnToMainTree?: () => void;
  onSelectTree?: (treeId: string) => void;
  onCreateNewTree?: (title: string) => void;
  onRenameTree?: (treeId: string, newTitle: string) => Promise<boolean>;
  onDeleteTree?: (treeId: string, title: string) => Promise<boolean>;
  onExportImage: () => void;
  personCount: number;
  generationCount: number;
  onSyncNow?: () => void;
  onRestoreFromCloud?: () => void;
  lastSavedTime?: Date | null;
  syncStatus?: 'synced' | 'syncing' | 'error' | 'offline';
  isServerConnected?: boolean;
  isFirebaseSyncing?: boolean;
  firebaseSyncMode?: 'push' | 'pull' | null;
  lastFirebaseSyncTime?: Date | null;
  hasUnsyncedFirebaseChanges?: boolean;
  onOpenOverview?: (tab: 'stats' | 'chronology' | 'validation' | 'archive') => void;
  onOpenReactionsModal?: () => void;
  totalReactionsCount?: number;
  isCalendarOpen?: boolean;
  onToggleCalendar?: () => void;
  notifications?: any[];
  onSelectNotificationPerson?: (personId: string) => void;
  onClearNotifications?: () => void;
  onOpenShortcutsModal?: () => void;
  userPersonName?: string | null;
  onOpenUserIdentity?: () => void;
  onLoadJsonFile?: (file: File) => void;
  onOpenImportModal?: () => void;
  onOpenLogs?: () => void;
  isDark?: boolean;
  onToggleTheme?: () => void;
  validationIssueCount?: number;
  validationErrorCount?: number;
  isVersionModalOpen?: boolean;
  onCloseVersionModal?: () => void;
  archiveGapCount?: number;
  onOpenGuestFeedback?: () => void;
  pendingGuestFeedbackCount?: number;
  onOpenGuestCustomize?: () => void;
}

export interface CanvasItem {
  id: string;
  title: string;
  personCount?: number;
  isMain?: boolean;
}

const TAB_ORDER_STORAGE_KEY = 'rodovid_canvas_tab_order';

export const TopNavbar: React.FC<TopNavbarProps> = ({
  isAdmin,
  onOpenAuthModal,
  onToggleAdminRole,
  onOpenMyTrees,
  currentTreeTitle,
  currentTreeId,
  treeVersion = 'v0.1',
  onUpdateVersion,
  isMainTree = true,
  onReturnToMainTree,
  onSelectTree,
  onCreateNewTree,
  onRenameTree,
  onDeleteTree,
  onExportImage,
  personCount,
  onSyncNow,
  onRestoreFromCloud,
  lastSavedTime,
  syncStatus = 'synced',
  isServerConnected = true,
  isFirebaseSyncing = false,
  firebaseSyncMode = null,
  lastFirebaseSyncTime = null,
  hasUnsyncedFirebaseChanges = false,
  onOpenOverview,
  onOpenReactionsModal,
  totalReactionsCount = 0,
  isCalendarOpen,
  onToggleCalendar,
  onOpenShortcutsModal,
  userPersonName,
  onOpenUserIdentity,
  onOpenImportModal,
  onLoadJsonFile,
  onOpenLogs,
  isDark = false,
  onToggleTheme,
  validationIssueCount = 0,
  validationErrorCount = 0,
  isVersionModalOpen: externalVersionModalOpen = false,
  onCloseVersionModal,
  archiveGapCount = 0,
  onOpenGuestFeedback,
  pendingGuestFeedbackCount = 0,
  onOpenGuestCustomize,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [canvasList, setCanvasList] = useState<CanvasItem[]>([]);

  // Modals inside TopNavbar for Admin canvas & version management
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newCanvasTitle, setNewCanvasTitle] = useState('');
  const [versionInput, setVersionInput] = useState(treeVersion || 'v0.1');

  useEffect(() => {
    if (externalVersionModalOpen) {
      setVersionInput(treeVersion || 'v0.1');
    }
  }, [externalVersionModalOpen, treeVersion]);
  const [renameTarget, setRenameTarget] = useState<{ id: string; title: string } | null>(null);
  const [renameInputTitle, setRenameInputTitle] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);

  // Tab drag & drop / long-press reorder state
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isPointerDownRef = useRef(false);
  const pointerStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const isLongPressActiveRef = useRef(false);

  // Tab container horizontal scroll state & refs
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkTabScroll = useCallback(() => {
    const el = tabsContainerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  const scrollTabs = (direction: 'left' | 'right') => {
    if (tabsContainerRef.current) {
      const scrollAmount = direction === 'left' ? -220 : 220;
      tabsContainerRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
      setTimeout(checkTabScroll, 250);
    }
  };

  const handleTabsWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (tabsContainerRef.current && e.deltaY !== 0) {
      tabsContainerRef.current.scrollLeft += e.deltaY * 0.8;
      checkTabScroll();
    }
  };

  useEffect(() => {
    checkTabScroll();
    window.addEventListener('resize', checkTabScroll);
    return () => window.removeEventListener('resize', checkTabScroll);
  }, [checkTabScroll, canvasList]);

  // Auto-scroll active tab into view
  useEffect(() => {
    const activeTabId = isMainTree ? MAIN_TREE_ID : currentTreeId;
    if (!activeTabId || !tabsContainerRef.current) return;
    const activeEl = tabsContainerRef.current.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape ? CSS.escape(activeTabId) : activeTabId}"]`);
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
    checkTabScroll();
  }, [currentTreeId, isMainTree, canvasList, checkTabScroll]);

  // Load canvases and order them based on stored order
  const loadCanvases = useCallback(async () => {
    const list: CanvasItem[] = [];

    // 1. Main tree is ALWAYS first
    list.push({
      id: MAIN_TREE_ID,
      title: 'Головне дерево',
      isMain: true,
      personCount: isMainTree ? personCount : undefined,
    });

    // 2. Read from localStorage index
    try {
      const raw = localStorage.getItem('rodovid_local_trees_index');
      if (raw) {
        const localList = JSON.parse(raw);
        if (Array.isArray(localList)) {
          for (const item of localList) {
            const isMain =
              item.id === MAIN_TREE_ID || item.id === 'default-tree' || item.id === 'main-tree';
            if (!isMain && !list.some((c) => c.id === item.id)) {
              list.push({
                id: item.id,
                title: item.title || 'Родове полотно',
                personCount: item.personCount,
                isMain: false,
              });
            }
          }
        }
      }
    } catch {}

    // 3. Read from server trees
    try {
      const serverTrees = await fetchServerTrees();
      if (Array.isArray(serverTrees)) {
        for (const st of serverTrees) {
          const isMain =
            st.id === MAIN_TREE_ID || st.id === 'default-tree' || st.id === 'main-tree';
          if (!isMain && !list.some((c) => c.id === st.id)) {
            list.push({
              id: st.id,
              title: st.title || 'Родове полотно',
              personCount: st.personCount,
              isMain: false,
            });
          }
        }
      }
    } catch {}

    // 4. Ensure active tree is present
    if (!isMainTree && currentTreeId && !list.some((c) => c.id === currentTreeId)) {
      list.push({
        id: currentTreeId,
        title: currentTreeTitle || 'Поточне полотно',
        personCount,
        isMain: false,
      });
    }

    // 5. Apply custom tab order from localStorage
    try {
      const rawOrder = localStorage.getItem(TAB_ORDER_STORAGE_KEY);
      if (rawOrder) {
        const orderedIds: string[] = JSON.parse(rawOrder);
        if (Array.isArray(orderedIds)) {
          const mainItem = list[0];
          const secondary = list.slice(1);
          secondary.sort((a, b) => {
            const idxA = orderedIds.indexOf(a.id);
            const idxB = orderedIds.indexOf(b.id);
            if (idxA === -1 && idxB === -1) return 0;
            if (idxA === -1) return 1;
            if (idxB === -1) return -1;
            return idxA - idxB;
          });
          setCanvasList([mainItem, ...secondary]);
          return;
        }
      }
    } catch {}

    setCanvasList(list);
  }, [currentTreeId, currentTreeTitle, isMainTree, personCount, lastFirebaseSyncTime]);

  useEffect(() => {
    loadCanvases();
  }, [loadCanvases]);

  useEffect(() => {
    const onTreesChanged = () => {
      void loadCanvases();
    };
    window.addEventListener(TREES_CHANGED_EVENT, onTreesChanged);
    return () => window.removeEventListener(TREES_CHANGED_EVENT, onTreesChanged);
  }, [loadCanvases]);

  // Click outside listener for menu
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close menus on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsMenuOpen(false);
        setIsCreateModalOpen(false);
        setRenameTarget(null);
        setDeleteTarget(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handle reordering tab swap
  const handleSwapTabs = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    if (sourceId === MAIN_TREE_ID || targetId === MAIN_TREE_ID) {
      // Main tree stays at index 0
      return;
    }

    setCanvasList((prev) => {
      const main = prev[0];
      const rest = prev.slice(1);
      const sourceIdx = rest.findIndex((t) => t.id === sourceId);
      const targetIdx = rest.findIndex((t) => t.id === targetId);
      if (sourceIdx === -1 || targetIdx === -1) return prev;

      const updated = [...rest];
      const [moved] = updated.splice(sourceIdx, 1);
      updated.splice(targetIdx, 0, moved);

      const finalList = [main, ...updated];
      try {
        localStorage.setItem(
          TAB_ORDER_STORAGE_KEY,
          JSON.stringify(updated.map((t) => t.id))
        );
      } catch {}
      return finalList;
    });
  };

  // Mouse long-press & drag handlers
  const handleTabMouseDown = (tabId: string, e: React.MouseEvent) => {
    // Only secondary tabs can be reordered
    if (tabId === MAIN_TREE_ID) return;
    // Don't trigger if clicked on buttons or input
    if ((e.target as HTMLElement).closest('button, input')) return;

    isPointerDownRef.current = true;
    pointerStartPosRef.current = { x: e.clientX, y: e.clientY };
    isLongPressActiveRef.current = false;

    // Start timer for long-press reorder mode (180ms)
    longPressTimerRef.current = setTimeout(() => {
      if (isPointerDownRef.current) {
        isLongPressActiveRef.current = true;
        setDraggedTabId(tabId);
      }
    }, 180);
  };

  const handleTabMouseMove = (tabId: string, e: React.MouseEvent) => {
    if (!isPointerDownRef.current || !pointerStartPosRef.current) return;
    const dx = Math.abs(e.clientX - pointerStartPosRef.current.x);
    const dy = Math.abs(e.clientY - pointerStartPosRef.current.y);

    if ((dx > 6 || dy > 6) && !isLongPressActiveRef.current && tabId !== MAIN_TREE_ID) {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      isLongPressActiveRef.current = true;
      setDraggedTabId(tabId);
    }

    if (draggedTabId && tabId !== MAIN_TREE_ID && tabId !== draggedTabId) {
      setDragOverTabId(tabId);
    }
  };

  const handleGlobalMouseUp = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (draggedTabId && dragOverTabId && dragOverTabId !== MAIN_TREE_ID) {
      handleSwapTabs(draggedTabId, dragOverTabId);
    }
    setDraggedTabId(null);
    setDragOverTabId(null);
    isPointerDownRef.current = false;
    pointerStartPosRef.current = null;
    isLongPressActiveRef.current = false;
  }, [draggedTabId, dragOverTabId]);

  useEffect(() => {
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [handleGlobalMouseUp]);

  // Native HTML5 drag and drop support
  const handleDragStart = (tabId: string, e: React.DragEvent) => {
    if (tabId === MAIN_TREE_ID) {
      e.preventDefault();
      return;
    }
    setDraggedTabId(tabId);
    e.dataTransfer.setData('text/plain', tabId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (tabId: string, e: React.DragEvent) => {
    e.preventDefault();
    if (tabId === MAIN_TREE_ID || tabId === draggedTabId) return;
    e.dataTransfer.dropEffect = 'move';
    setDragOverTabId(tabId);
  };

  const handleDrop = (targetId: string, e: React.DragEvent) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData('text/plain') || draggedTabId;
    if (sourceId && targetId && sourceId !== targetId && targetId !== MAIN_TREE_ID) {
      handleSwapTabs(sourceId, targetId);
    }
    setDraggedTabId(null);
    setDragOverTabId(null);
  };

  // Create canvas submit
  const handleCreateCanvasSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCanvasTitle.trim() || !onCreateNewTree) return;
    onCreateNewTree(newCanvasTitle.trim());
    setNewCanvasTitle('');
    setIsCreateModalOpen(false);
  };

  // Rename canvas submit
  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameTarget || !renameInputTitle.trim()) return;
    if (renameTarget.id === MAIN_TREE_ID) return;

    setIsRenaming(true);
    try {
      if (onRenameTree) {
        await onRenameTree(renameTarget.id, renameInputTitle.trim());
      }
      setCanvasList((prev) =>
        prev.map((t) => (t.id === renameTarget.id ? { ...t, title: renameInputTitle.trim() } : t))
      );
      setRenameTarget(null);
    } finally {
      setIsRenaming(false);
    }
  };

  // Delete canvas confirm
  const handleDeleteConfirm = async () => {
    const target = deleteTarget;
    if (!target || target.id === MAIN_TREE_ID || isDeleting) return;
    setIsDeleting(true);
    try {
      let deleted = true;
      if (onDeleteTree) {
        deleted = await onDeleteTree(target.id, target.title);
      }
      if (deleted !== false) {
        setCanvasList((prev) => prev.filter((t) => t.id !== target.id));
        setDeleteTarget(null);
        void loadCanvases();
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <header className="relative z-40 select-none bg-white/95 dark:bg-[#141619]/95 backdrop-blur-md border-b border-stone-200/85 dark:border-zinc-800/90">
      <div className="h-12 px-2.5 sm:px-4 flex items-center justify-between gap-2.5">
        
        {/* ================================================================ */}
        {/* BROWSER-STYLE CANVAS TABS NAVIGATION WITH SCROLL CONTROLS        */}
        {/* ================================================================ */}
        <div className="relative flex items-center flex-1 min-w-0 group/tabs">
          {/* Scroll Left Button */}
          {canScrollLeft && (
            <button
              type="button"
              onClick={() => scrollTabs('left')}
              className="absolute left-0 z-20 h-8 w-8 bg-gradient-to-r from-white via-white/95 dark:from-[#141619] dark:via-[#141619]/95 to-transparent flex items-center justify-start text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-100 transition-all cursor-pointer"
              title="Прокрутити вкладки вліво"
              aria-label="Прокрутити вліво"
            >
              <div className="w-5 h-5 rounded-md bg-white dark:bg-zinc-800 shadow-xs border border-stone-200 dark:border-zinc-700 flex items-center justify-center hover:bg-stone-50 dark:hover:bg-zinc-700 transition-colors">
                <ChevronLeft size={13} className="text-stone-700 dark:text-zinc-200" />
              </div>
            </button>
          )}

          {/* Scrollable Tabs List */}
          <div
            ref={tabsContainerRef}
            onScroll={checkTabScroll}
            onWheel={handleTabsWheel}
            className="flex items-center gap-1 overflow-x-auto no-scrollbar flex-1 min-w-0 py-1.5 scroll-smooth"
          >
            {canvasList.map((tab) => {
              const isMain = tab.isMain || tab.id === MAIN_TREE_ID;
              const isSelected = isMain ? isMainTree : tab.id === currentTreeId;
              const isBeingDragged = draggedTabId === tab.id;
              const isDragOver = dragOverTabId === tab.id;

              return (
                <div
                  key={tab.id}
                  data-tab-id={tab.id}
                  draggable={!isMain}
                  onDragStart={(e) => handleDragStart(tab.id, e)}
                  onDragOver={(e) => handleDragOver(tab.id, e)}
                  onDragLeave={() => setDragOverTabId(null)}
                  onDrop={(e) => handleDrop(tab.id, e)}
                  onMouseDown={(e) => handleTabMouseDown(tab.id, e)}
                  onMouseMove={(e) => handleTabMouseMove(tab.id, e)}
                  onMouseLeave={() => {
                    if (longPressTimerRef.current) {
                      clearTimeout(longPressTimerRef.current);
                      longPressTimerRef.current = null;
                    }
                  }}
                  onClick={() => {
                    if (isLongPressActiveRef.current) return;
                    if (isMain) {
                      if (onReturnToMainTree) onReturnToMainTree();
                    } else if (onSelectTree) {
                      onSelectTree(tab.id);
                    }
                  }}
                  className={`group relative h-8.5 rounded-lg flex items-center gap-2 px-2.5 sm:px-3 text-xs transition-all duration-150 cursor-pointer select-none shrink-0 border whitespace-nowrap ${
                    isSelected
                      ? 'bg-stone-100/95 dark:bg-zinc-800/95 text-stone-950 dark:text-zinc-50 font-semibold border-stone-200/95 dark:border-zinc-700/90 shadow-[0_1px_2px_rgba(0,0,0,0.04)]'
                      : 'bg-transparent hover:bg-stone-100/75 dark:hover:bg-zinc-800/55 text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-100 border-transparent font-medium'
                  } ${isBeingDragged ? 'opacity-40 scale-95' : ''} ${
                    isDragOver ? 'ring-2 ring-emerald-500/70 bg-emerald-50/50 dark:bg-emerald-950/40' : ''
                  }`}
                  title={
                    isMain
                      ? 'Головне дерево (захищене: не видаляється і не перейменовується)'
                      : `Полотно: ${tab.title}. Затисніть мишкою для переміщення вкладки.`
                  }
                >
                  {/* Active bottom accent indicator */}
                  {isSelected && (
                    <span
                      aria-hidden="true"
                      className="absolute -bottom-[1px] inset-x-2.5 h-[2px] rounded-full bg-emerald-700 dark:bg-emerald-400"
                    />
                  )}

                  {/* Drag handle / indicator icon */}
                  {!isMain && isAdmin ? (
                    <GripVertical
                      size={11}
                      className="text-stone-300 dark:text-zinc-600 group-hover:text-stone-500 dark:group-hover:text-zinc-400 cursor-grab shrink-0 -ml-1 transition-colors"
                    />
                  ) : null}

                  {/* Tab Icon */}
                  {isMain ? (
                    <Crown
                      size={13}
                      className={
                        isSelected
                          ? 'text-amber-600 dark:text-amber-400 fill-amber-400/80 dark:fill-amber-400/25 shrink-0'
                          : 'text-amber-600/75 dark:text-amber-400/70 shrink-0'
                      }
                    />
                  ) : (
                    <FolderTree
                      size={13}
                      className={
                        isSelected
                          ? 'text-emerald-700 dark:text-emerald-400 shrink-0'
                          : 'text-stone-400 dark:text-zinc-500 group-hover:text-stone-600 dark:group-hover:text-zinc-300 shrink-0'
                      }
                    />
                  )}

                  {/* Tab Title */}
                  <span className="max-w-[110px] sm:max-w-[175px] truncate text-xs leading-none tracking-[-0.01em]">
                    {tab.title}
                  </span>

                  {/* Person Count (clean tabular numeral, unboxed) */}
                  {tab.personCount !== undefined && tab.personCount > 0 && (
                    <span
                      className={`text-[11px] font-mono tabular-nums shrink-0 leading-none ${
                        isSelected
                          ? 'text-emerald-800/85 dark:text-emerald-400/90 font-semibold'
                          : 'text-stone-400 dark:text-zinc-500 font-normal'
                      }`}
                    >
                      {tab.personCount}
                    </span>
                  )}

                  {/* Admin Actions on Secondary Tabs: Rename & Delete */}
                  {!isMain && isAdmin && (
                    <div
                      className={`flex items-center gap-0.5 ml-0.5 transition-opacity shrink-0 ${
                        isSelected
                          ? 'opacity-100 sm:opacity-75 sm:group-hover:opacity-100'
                          : 'opacity-0 group-hover:opacity-100'
                      }`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Rename Button */}
                      <button
                        type="button"
                        onClick={() => {
                          setRenameTarget({ id: tab.id, title: tab.title });
                          setRenameInputTitle(tab.title);
                        }}
                        className="p-1 rounded-md text-stone-400 dark:text-zinc-500 hover:text-stone-900 dark:hover:text-zinc-100 hover:bg-stone-200/70 dark:hover:bg-zinc-700/80 transition-colors cursor-pointer"
                        title="Змінити назву полотна"
                        aria-label="Змінити назву"
                      >
                        <Pencil size={11} />
                      </button>

                      {/* Delete Button */}
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteTarget({ id: tab.id, title: tab.title });
                        }}
                        className="p-1 rounded-md text-stone-400 dark:text-zinc-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/60 transition-colors cursor-pointer"
                        title="Видалити це полотно"
                        aria-label="Видалити полотно"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Plus Button: Add New Canvas Tab (Admin only) */}
            {isAdmin && (
              <button
                type="button"
                onClick={() => {
                  setNewCanvasTitle('');
                  setIsCreateModalOpen(true);
                }}
                className="group h-8 w-8 rounded-lg border border-dashed border-stone-300/90 dark:border-zinc-700/80 bg-transparent hover:bg-emerald-700 dark:hover:bg-emerald-600 hover:border-solid hover:border-emerald-700 dark:hover:border-emerald-600 text-stone-500 dark:text-zinc-400 hover:text-white flex items-center justify-center transition-all duration-150 cursor-pointer active:scale-95 shrink-0 ml-0.5"
                title="Додати нове родове полотно (вкладку)"
                aria-label="Додати нове полотно"
              >
                <Plus size={14} className="transition-transform duration-200 group-hover:rotate-90" />
              </button>
            )}
          </div>

          {/* Scroll Right Button */}
          {canScrollRight && (
            <button
              type="button"
              onClick={() => scrollTabs('right')}
              className="absolute right-0 z-20 h-8 w-8 bg-gradient-to-l from-white via-white/95 dark:from-[#141619] dark:via-[#141619]/95 to-transparent flex items-center justify-end text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-100 transition-all cursor-pointer"
              title="Прокрутити вкладки вправо"
              aria-label="Прокрутити вправо"
            >
              <div className="w-5 h-5 rounded-md bg-white dark:bg-zinc-800 shadow-xs border border-stone-200 dark:border-zinc-700 flex items-center justify-center hover:bg-stone-50 dark:hover:bg-zinc-700 transition-colors">
                <ChevronRight size={13} className="text-stone-700 dark:text-zinc-200" />
              </div>
            </button>
          )}
        </div>

        <div className="hidden sm:block h-5 w-px bg-stone-200/85 dark:bg-zinc-800 shrink-0" aria-hidden="true" />

        {/* ================================================================ */}
        {/* RIGHT CONTROLS: Role, Server Status & Master Menu                */}
        {/* ================================================================ */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Admin Role Status Button (Hidden for Guest) */}
          {isAdmin && (
            <button
              type="button"
              onClick={onOpenAuthModal}
              className="h-8.5 px-2.5 sm:px-3 rounded-lg border flex items-center gap-1.5 text-xs font-semibold transition-all cursor-pointer select-none active:scale-95 shrink-0 whitespace-nowrap bg-emerald-50/90 hover:bg-emerald-100 text-emerald-900 border-emerald-200/90 dark:bg-emerald-950/50 dark:hover:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-800/70"
              title="Ви увійшли як Адміністратор (натисніть для налаштування або переходу в режим гостя)"
            >
              <ShieldCheck size={14} className="text-emerald-700 dark:text-emerald-400 shrink-0" />
              <span className="hidden sm:inline text-xs">Адмін</span>
            </button>
          )}

          {/* Server / Cloud Status Indicator (Admin only) */}
          {isAdmin && (
            <ServerStatusIndicator
              syncStatus={syncStatus}
              isServerConnected={isServerConnected}
              isAdmin={isAdmin}
              onSyncNow={onSyncNow}
              onRestoreFromCloud={onRestoreFromCloud}
              lastSavedTime={lastSavedTime}
              isFirebaseSyncing={isFirebaseSyncing}
              firebaseSyncMode={firebaseSyncMode}
              lastFirebaseSyncTime={lastFirebaseSyncTime}
              hasUnsyncedFirebaseChanges={hasUnsyncedFirebaseChanges}
            />
          )}

          {/* Pending Guest Feedback / Proposals Alert Button (Admin only) */}
          {isAdmin && onOpenGuestFeedback && pendingGuestFeedbackCount > 0 && (
            <button
              type="button"
              onClick={onOpenGuestFeedback}
              className="relative h-8.5 px-2.5 rounded-lg border border-amber-300 dark:border-amber-700/80 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/60 dark:hover:bg-amber-950/90 text-amber-900 dark:text-amber-200 flex items-center gap-1.5 text-xs font-semibold transition-all cursor-pointer active:scale-95 shrink-0 whitespace-nowrap"
              title={`Є нерозглянуті уточнення або картки-пропозиції від гостей (${pendingGuestFeedbackCount})`}
            >
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-600" />
              </span>
              <MessageSquareHeart size={14} className="text-amber-700 dark:text-amber-400 shrink-0" />
              <span className="hidden lg:inline">Пропозиції</span>
              <span className="font-mono tabular-nums text-[11px] font-bold leading-none text-amber-800 dark:text-amber-200">
                {pendingGuestFeedbackCount}
              </span>
            </button>
          )}

          {/* Validation Status Button (Admin only) */}
          {isAdmin && onOpenOverview && (
            <button
              type="button"
              onClick={() => onOpenOverview('validation')}
              className={`group relative h-8.5 px-2.5 rounded-lg border flex items-center gap-1.5 text-xs font-semibold transition-all cursor-pointer active:scale-95 shrink-0 whitespace-nowrap ${
                validationErrorCount > 0
                  ? 'bg-rose-50 hover:bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/50 dark:hover:bg-rose-950/80 dark:text-rose-300 dark:border-rose-800/70'
                  : validationIssueCount > 0
                  ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:hover:bg-amber-950/80 dark:text-amber-300 dark:border-amber-800/70'
                  : 'bg-stone-50/90 dark:bg-zinc-900 hover:bg-stone-100 dark:hover:bg-zinc-800 text-emerald-700 dark:text-emerald-400 border-stone-200/90 dark:border-zinc-800'
              }`}
              title={
                validationIssueCount > 0
                  ? `Перевірка дерева: виявлено зауважень (${validationIssueCount})`
                  : 'Перевірка логічних помилок у дереві (помилок немає)'
              }
              aria-label="Перевірка логічних помилок у дереві"
            >
              <AnimatedValidationIcon
                issueCount={validationIssueCount}
                errorCount={validationErrorCount}
                size={14}
              />
              <span className="hidden lg:inline">Перевірка</span>
              {validationIssueCount > 0 && (
                <span
                  className={`font-mono tabular-nums text-[11px] font-bold leading-none ${
                    validationErrorCount > 0
                      ? 'text-rose-700 dark:text-rose-300'
                      : 'text-amber-700 dark:text-amber-300'
                  }`}
                >
                  {validationIssueCount}
                </span>
              )}
            </button>
          )}

          {/* Theme Toggle Button (Light / Dark mode) */}
          {onToggleTheme && (
            <button
              type="button"
              onClick={onToggleTheme}
              className="group h-8.5 w-8.5 rounded-lg bg-stone-50/90 dark:bg-zinc-900 hover:bg-stone-100 dark:hover:bg-zinc-800 text-stone-700 dark:text-amber-300 border border-stone-200/90 dark:border-zinc-800 flex items-center justify-center transition-all cursor-pointer active:scale-95 shrink-0"
              title={isDark ? 'Увімкнути світлий режим' : 'Увімкнути темний режим'}
              aria-label={isDark ? 'Увімкнути світлий режим' : 'Увімкнути темний режим'}
            >
              <AnimatedThemeIcon isDark={isDark} size={15} />
            </button>
          )}

          {/* Master Menu Dropdown */}
          <div ref={menuRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setIsMenuOpen((prev) => !prev)}
              className={`h-8.5 px-3 rounded-lg flex items-center gap-2 text-xs font-semibold transition-all cursor-pointer select-none active:scale-95 whitespace-nowrap ${
                isMenuOpen
                  ? 'bg-stone-900 dark:bg-emerald-600 text-white border border-transparent'
                  : 'bg-stone-50/90 dark:bg-zinc-900 hover:bg-stone-100 dark:hover:bg-zinc-800 text-stone-900 dark:text-zinc-100 border border-stone-200/90 dark:border-zinc-800'
              }`}
              title="Головне меню"
              aria-label="Головне меню"
              aria-expanded={isMenuOpen}
            >
              <AnimatedMenuIcon isOpen={isMenuOpen} size={15} />
              <span className="hidden xs:inline sm:inline text-xs">Меню</span>
            </button>

            {/* Menu Popover */}
            {isMenuOpen && (
              <div className="fixed sm:absolute right-3 sm:right-0 top-13 sm:top-10.5 w-[calc(100vw-24px)] sm:w-64 max-w-sm bg-white dark:bg-zinc-900 rounded-xl shadow-2xl border border-stone-200/90 dark:border-zinc-800 p-1.5 z-50 space-y-1 animate-in fade-in zoom-in-95 duration-150">
                {/* Primary Views */}
                <div className="space-y-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      onToggleCalendar?.();
                      setIsMenuOpen(false);
                    }}
                    className={`w-full h-8.5 px-2.5 rounded-lg text-xs font-semibold flex items-center gap-2.5 transition-colors cursor-pointer text-left ${
                      isCalendarOpen
                        ? 'bg-stone-100 dark:bg-zinc-800 text-stone-900 dark:text-zinc-100 font-bold'
                        : 'hover:bg-stone-100 dark:hover:bg-zinc-800/80 text-stone-800 dark:text-zinc-200'
                    }`}
                  >
                    <Calendar size={15} className="text-stone-600 dark:text-zinc-400 shrink-0" />
                    <span className="flex-1 truncate">Календар подій</span>
                  </button>

                  {onOpenOverview && (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenOverview('stats');
                        setIsMenuOpen(false);
                      }}
                      className="w-full h-8.5 px-2.5 rounded-lg hover:bg-stone-100 dark:hover:bg-zinc-800/80 text-stone-800 dark:text-zinc-200 text-xs font-semibold flex items-center gap-2.5 transition-colors cursor-pointer text-left"
                    >
                      <BarChart3 size={15} className="text-stone-600 dark:text-zinc-400 shrink-0" />
                      <span className="flex-1 truncate">Огляд та аналітика</span>
                      {isAdmin && (validationIssueCount > 0 || archiveGapCount > 0) && (
                        <span className="text-[11px] font-mono tabular-nums font-bold leading-none text-amber-700 dark:text-amber-400">
                          {validationIssueCount + archiveGapCount}
                        </span>
                      )}
                    </button>
                  )}

                  {onOpenUserIdentity && (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenUserIdentity();
                        setIsMenuOpen(false);
                      }}
                      className="w-full h-8.5 px-2.5 rounded-lg hover:bg-stone-100 dark:hover:bg-zinc-800/80 text-stone-800 dark:text-zinc-200 text-xs font-semibold flex items-center gap-2.5 transition-colors cursor-pointer text-left"
                    >
                      <UserCheck size={15} className="text-emerald-700 dark:text-emerald-400 shrink-0" />
                      <span className="flex-1 truncate">
                        {userPersonName ? `Ви: ${userPersonName}` : 'Хто ви у дереві?'}
                      </span>
                    </button>
                  )}

                  {userPersonName && onOpenGuestCustomize && (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenGuestCustomize();
                        setIsMenuOpen(false);
                      }}
                      className="w-full h-8.5 px-2.5 rounded-lg hover:bg-emerald-50/90 dark:hover:bg-emerald-950/40 text-emerald-900 dark:text-emerald-300 text-xs font-semibold flex items-center gap-2.5 transition-colors cursor-pointer text-left"
                    >
                      <Paintbrush size={15} className="text-emerald-700 dark:text-emerald-400 shrink-0" />
                      <span className="flex-1 truncate">Оформити мою картку</span>
                    </button>
                  )}
                </div>

                {/* Export Section */}
                <div className="pt-1 border-t border-stone-100 dark:border-zinc-800 space-y-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      onExportImage();
                      setIsMenuOpen(false);
                    }}
                    className="w-full h-8.5 px-2.5 rounded-lg hover:bg-stone-100 dark:hover:bg-zinc-800/80 text-stone-800 dark:text-zinc-200 text-xs font-semibold flex items-center gap-2.5 transition-colors cursor-pointer text-left"
                  >
                    <Download size={15} className="text-stone-600 dark:text-zinc-400 shrink-0" />
                    <span className="flex-1 truncate">Експорт (PDF / PNG / SVG / JSON)</span>
                  </button>
                </div>

                {/* Admin-only Section */}
                {isAdmin && (
                  <div className="pt-1 border-t border-stone-100 dark:border-zinc-800 space-y-0.5">
                    <div className="px-2.5 py-1 text-[10px] font-semibold tracking-wider text-stone-400 dark:text-zinc-500">
                      Керування
                    </div>

                    {onOpenGuestFeedback && (
                      <button
                        type="button"
                        onClick={() => {
                          onOpenGuestFeedback();
                          setIsMenuOpen(false);
                        }}
                        className="w-full h-8.5 px-2.5 rounded-lg hover:bg-amber-50/80 dark:hover:bg-amber-950/40 text-stone-800 dark:text-zinc-200 text-xs font-semibold flex items-center gap-2.5 transition-colors cursor-pointer text-left"
                      >
                        <MessageSquareHeart size={15} className="text-amber-600 dark:text-amber-400 shrink-0" />
                        <span className="flex-1 truncate">Пропозиції гостей</span>
                        {pendingGuestFeedbackCount > 0 && (
                          <span className="px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 text-[10px] font-mono tabular-nums font-bold leading-none">
                            {pendingGuestFeedbackCount}
                          </span>
                        )}
                      </button>
                    )}

                    {onOpenReactionsModal && (
                      <button
                        type="button"
                        onClick={() => {
                          onOpenReactionsModal();
                          setIsMenuOpen(false);
                        }}
                        className="w-full h-8.5 px-2.5 rounded-lg hover:bg-stone-100 dark:hover:bg-zinc-800/80 text-stone-800 dark:text-zinc-200 text-xs font-semibold flex items-center gap-2.5 transition-colors cursor-pointer text-left"
                      >
                        <Heart size={15} className="text-rose-600 fill-rose-600 shrink-0" />
                        <span className="flex-1 truncate">Реакції відвідувачів</span>
                        {totalReactionsCount > 0 && (
                          <span className="text-[11px] text-rose-700 dark:text-rose-400 font-mono tabular-nums font-bold leading-none">
                            {totalReactionsCount}
                          </span>
                        )}
                      </button>
                    )}

                    {onOpenImportModal && (
                      <button
                        type="button"
                        onClick={() => {
                          onOpenImportModal();
                          setIsMenuOpen(false);
                        }}
                        className="w-full h-8.5 px-2.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-emerald-900 dark:text-emerald-300 text-xs font-semibold flex items-center gap-2.5 transition-colors cursor-pointer text-left"
                      >
                        <Upload size={15} className="text-emerald-700 dark:text-emerald-400 shrink-0" />
                        <span className="flex-1 truncate">Імпорт JSON</span>
                      </button>
                    )}

                    {onOpenLogs && (
                      <button
                        type="button"
                        onClick={() => {
                          onOpenLogs();
                          setIsMenuOpen(false);
                        }}
                        className="w-full h-8.5 px-2.5 rounded-lg hover:bg-stone-100 dark:hover:bg-zinc-800/80 text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-100 text-xs font-semibold flex items-center gap-2.5 transition-colors cursor-pointer text-left"
                      >
                        <Terminal size={15} className="text-stone-500 dark:text-zinc-400 shrink-0" />
                        <span className="flex-1 truncate">Системний журнал</span>
                      </button>
                    )}
                  </div>
                )}

                {!isAdmin && (
                  <div className="pt-1 border-t border-stone-100 dark:border-zinc-800 space-y-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        onOpenAuthModal();
                        setIsMenuOpen(false);
                      }}
                      className="w-full h-8.5 px-2.5 rounded-lg hover:bg-emerald-50/90 dark:hover:bg-emerald-950/40 text-emerald-900 dark:text-emerald-300 text-xs font-semibold flex items-center gap-2.5 transition-colors cursor-pointer text-left"
                    >
                      <ShieldCheck size={15} className="text-emerald-700 dark:text-emerald-400 shrink-0" />
                      <span className="flex-1 truncate">Вхід адміністратора</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ================================================================ */}
      {/* MODAL: Створення нового родового полотна (вкладки)                */}
      {/* ================================================================ */}
      {isCreateModalOpen &&
        createPortal(
          <div
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-150"
            onClick={() => setIsCreateModalOpen(false)}
          >
          <div
            className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-stone-200 dark:border-zinc-800 w-full max-w-sm overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 bg-gradient-to-r from-emerald-50 to-stone-50 dark:from-emerald-950/40 dark:to-zinc-900 border-b border-stone-200 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-700 text-white flex items-center justify-center shrink-0">
                  <Plus size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-stone-900 dark:text-zinc-100 leading-tight">
                    Нове родове полотно
                  </h3>
                  <p className="text-[11px] text-stone-500 dark:text-zinc-400">Створення окремої вкладки / гілки</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1 rounded-lg text-stone-400 dark:text-zinc-500 hover:text-stone-700 dark:hover:text-zinc-200 hover:bg-stone-200/50 dark:hover:bg-zinc-800"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateCanvasSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-zinc-300 mb-1.5">
                  Назва полотна
                </label>
                <input
                  type="text"
                  autoFocus
                  value={newCanvasTitle}
                  onChange={(e) => setNewCanvasTitle(e.target.value)}
                  placeholder="напр. Гілка Савчуків, Материнська лінія..."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-emerald-600 bg-stone-50 dark:bg-zinc-800/80 text-stone-900 dark:text-zinc-100 placeholder:text-stone-400 dark:placeholder:text-zinc-500 focus:bg-white dark:focus:bg-zinc-800"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-3.5 py-2 text-xs font-medium text-stone-600 dark:text-zinc-300 hover:bg-stone-100 dark:hover:bg-zinc-800 rounded-xl transition-colors cursor-pointer"
                >
                  Скасувати
                </button>
                <button
                  type="submit"
                  disabled={!newCanvasTitle.trim()}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 active:scale-95 rounded-xl shadow-xs transition-all cursor-pointer"
                >
                  Створити полотно
                </button>
              </div>
            </form>
          </div>
        </div>,
          document.body
        )}

      {/* ================================================================ */}
      {/* MODAL: Перейменування полотна (тільки другорядні)                */}
      {/* ================================================================ */}
      {renameTarget &&
        createPortal(
          <div
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-150"
            onClick={() => setRenameTarget(null)}
          >
          <div
            className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-stone-200 dark:border-zinc-800 w-full max-w-sm overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 bg-stone-50 dark:bg-zinc-800/60 border-b border-stone-200 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-stone-800 dark:bg-zinc-700 text-white flex items-center justify-center shrink-0">
                  <Pencil size={15} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-stone-900 dark:text-zinc-100 leading-tight">
                    Зміна назви полотна
                  </h3>
                  <p className="text-[11px] text-stone-500 dark:text-zinc-400">Вкажіть нову назву для цієї вкладки</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRenameTarget(null)}
                className="p-1 rounded-lg text-stone-400 dark:text-zinc-500 hover:text-stone-700 dark:hover:text-zinc-200 hover:bg-stone-200/50 dark:hover:bg-zinc-800"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleRenameSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-zinc-300 mb-1.5">
                  Нова назва полотна
                </label>
                <input
                  type="text"
                  autoFocus
                  value={renameInputTitle}
                  onChange={(e) => setRenameInputTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-emerald-600 bg-stone-50 dark:bg-zinc-800/80 text-stone-900 dark:text-zinc-100 focus:bg-white dark:focus:bg-zinc-800"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRenameTarget(null)}
                  className="px-3.5 py-2 text-xs font-medium text-stone-600 dark:text-zinc-300 hover:bg-stone-100 dark:hover:bg-zinc-800 rounded-xl transition-colors cursor-pointer"
                >
                  Скасувати
                </button>
                <button
                  type="submit"
                  disabled={!renameInputTitle.trim() || isRenaming}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 active:scale-95 rounded-xl shadow-xs transition-all cursor-pointer"
                >
                  {isRenaming ? 'Збереження...' : 'Зберегти назву'}
                </button>
              </div>
            </form>
          </div>
        </div>,
          document.body
        )}

      {/* ================================================================ */}
      {/* MODAL: Підтвердження видалення полотна                           */}
      {/* ================================================================ */}
      {deleteTarget &&
        createPortal(
          <div
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-150"
            onClick={() => setDeleteTarget(null)}
          >
          <div
            className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-stone-200 dark:border-zinc-800 w-full max-w-sm overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 bg-rose-50 dark:bg-rose-950/50 border-b border-rose-200 dark:border-rose-900/60 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0">
                  <Trash2 size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-rose-950 dark:text-rose-200 leading-tight">
                    Видалити родове полотно?
                  </h3>
                  <p className="text-[11px] text-rose-700 dark:text-rose-400">Цю дію неможливо буде скасувати</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="p-1 rounded-lg text-rose-400 hover:text-rose-700 dark:hover:text-rose-200 hover:bg-rose-100/50 dark:hover:bg-rose-900/40"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs text-stone-600 dark:text-zinc-300 leading-relaxed">
                Ви впевнені, що хочете назавжди видалити полотно{' '}
                <strong className="text-stone-900 dark:text-zinc-100 font-bold">«{deleteTarget.title}»</strong>? Усі
                особи та зв’язки на цьому полотні будуть видалені.
              </p>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="px-3.5 py-2 text-xs font-medium text-stone-600 dark:text-zinc-300 hover:bg-stone-100 dark:hover:bg-zinc-800 rounded-xl transition-colors cursor-pointer"
                >
                  Скасувати
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleDeleteConfirm}
                  className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 active:scale-95 rounded-xl shadow-xs transition-all cursor-pointer"
                >
                  {isDeleting ? 'Видалення...' : 'Видалити полотно'}
                </button>
              </div>
            </div>
          </div>
        </div>,
          document.body
        )}

      {/* ================================================================ */}
      {/* MODAL: Зміна версії родового дерева (для Адміністратора)         */}
      {/* ================================================================ */}
      {externalVersionModalOpen &&
        createPortal(
          <div
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-150"
            onClick={() => onCloseVersionModal?.()}
          >
          <div
            className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-stone-200 dark:border-zinc-800 w-full max-w-sm overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 bg-gradient-to-r from-amber-50 to-stone-50 dark:from-amber-950/40 dark:to-zinc-900 border-b border-stone-200 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                  <Tag size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-stone-900 dark:text-zinc-100 leading-tight">
                    Версія родового дерева
                  </h3>
                  <p className="text-[11px] text-stone-500 dark:text-zinc-400">Застосовується до всіх полотен родоводу</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onCloseVersionModal?.()}
                className="p-1 rounded-lg text-stone-400 dark:text-zinc-500 hover:text-stone-700 dark:hover:text-zinc-200 hover:bg-stone-200/50 dark:hover:bg-zinc-800"
              >
                <X size={16} />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (versionInput.trim() && onUpdateVersion) {
                  onUpdateVersion(versionInput.trim());
                }
                onCloseVersionModal?.();
              }}
              className="p-5 space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-zinc-300 mb-1.5">
                  Номер версії (наприклад: v0.1, v0.2, v1.0)
                </label>
                <input
                  type="text"
                  value={versionInput}
                  onChange={(e) => setVersionInput(e.target.value)}
                  placeholder="v0.1"
                  className="w-full px-3 py-2 text-sm font-mono font-bold rounded-xl border border-stone-300 dark:border-zinc-700 bg-white dark:bg-zinc-800/80 text-stone-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                />
              </div>

              {/* Quick Increment Buttons */}
              <div className="flex items-center gap-2 pt-0.5">
                <span className="text-[11px] font-semibold text-stone-500 dark:text-zinc-400">Швидка зміна:</span>
                <button
                  type="button"
                  onClick={() => {
                    const raw = (versionInput || 'v0.1').replace(/[^0-9.]/g, '');
                    const num = parseFloat(raw) || 0.1;
                    const next = (num + 0.1).toFixed(1);
                    setVersionInput(`v${next}`);
                  }}
                  className="px-2.5 py-1 text-xs font-mono font-bold bg-amber-100 dark:bg-amber-950/60 hover:bg-amber-200 dark:hover:bg-amber-900/60 text-amber-900 dark:text-amber-300 rounded-lg transition-colors cursor-pointer"
                >
                  +0.1
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const raw = (versionInput || 'v0.1').replace(/[^0-9.]/g, '');
                    const num = parseFloat(raw) || 0.1;
                    const next = (Math.floor(num) + 1.0).toFixed(1);
                    setVersionInput(`v${next}`);
                  }}
                  className="px-2.5 py-1 text-xs font-mono font-bold bg-amber-100 dark:bg-amber-950/60 hover:bg-amber-200 dark:hover:bg-amber-900/60 text-amber-900 dark:text-amber-300 rounded-lg transition-colors cursor-pointer"
                >
                  +1.0
                </button>
              </div>

              <div className="p-3 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/60 text-[11px] text-amber-900 dark:text-amber-200 leading-relaxed">
                Збережена версія буде застосована до кожного полотна родоводу та негайно відправлена на сервер. Усі користувачі в режимі гостя миттєво підтягнуть її при синхронізації.
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => onCloseVersionModal?.()}
                  className="px-3.5 py-2 text-xs font-semibold text-stone-600 dark:text-zinc-300 hover:bg-stone-100 dark:hover:bg-zinc-800 rounded-xl transition-colors cursor-pointer"
                >
                  Скасувати
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 active:scale-95 rounded-xl shadow-xs transition-all cursor-pointer"
                >
                  Зберегти та опублікувати
                </button>
              </div>
            </form>
          </div>
        </div>,
          document.body
        )}
    </header>
  );
};
