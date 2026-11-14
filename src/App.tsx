import React, { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import {
  FamilyTreeData,
  Person,
  RelativeType,
  ConnectionMeta,
  ReactionEmoji,
  PersonReaction,
  ArchiveSourceEntry,
  GuestSuggestion,
  GuestSuggestionCategory,
  ProposalCardMeta,
  CardFrameStyle,
} from './types/tree';
import { sampleTreeData } from './data/initialTreeData';
import {
  loadTreeFromLocalStorage,
  saveTreeLocally,
  syncTreeToServer,
  submitGuestSuggestionToServer,
  submitGuestCustomizeToServer,
  uploadFileToServerDetailed,
  fetchAllTreesSearchIndex,
  CrossCanvasSearchTree,
} from './utils/fileStorage';
import { getResolvedMediaSrc, handleUploadImageError } from './utils/mediaSync';
import {
  createReciprocalCrossCanvasLinkOnTargetTree,
  isSameCanvasId,
  normalizeCanvasId,
  removeCrossCanvasLinkFromPerson,
  syncReciprocalCrossCanvasLinksOnSave,
  upsertCrossCanvasLinkList,
} from './utils/crossCanvasLinks';
import {
  CARD_WIDTH,
  CARD_HEIGHT,
  generateConnections,
  calculateGenerations,
} from './utils/treeLayout';
import {
  generateTimelineTicks,
  extractBirthYear,
  yearToY,
  DEFAULT_START_YEAR,
  DEFAULT_END_YEAR,
  DEFAULT_PIXELS_PER_YEAR,
} from './utils/timelineUtils';
import { downloadTreeSvgFile, downloadTreePngFile, PreparedPrintTree } from './utils/treeExport';
import {
  buildClanMap,
  getClanName,
  swapSpousePositions,
  groupPersonsIntoRenderUnits,
  ClanInfo,
} from './utils/lineageUtils';
import { validateFamilyTree, fixBrokenReciprocalLinks } from './utils/treeValidation';
import {
  AddRelativeInput,
  applyAddRelative,
  applySaveConnectionMeta,
  applyDisconnectCouple,
  applyConnectPersons,
  applyAddBranchLink,
  applyUpdateBranchLink,
  applyBatchBranchLinkStyle,
  applyRemoveBranchLink,
  applyToggleRelationVerification,
  applyBatchConnectionsVerification,
  applyDeletePerson,
  applySavePerson,
  CreateGhostCardInput,
  applyCreateGhostCard,
  applyToggleGhostStatus,
  CreateBlankScreenshotCardInput,
  applyCreateBlankScreenshotCard,
  applyUpdateBlankScreenshot,
  applyAddGuestSuggestion,
  applyResolveGuestSuggestion,
  applyCreateProposalRelative,
  applyApproveProposalCard,
} from './utils/treeMutations';
import { getBranchLineShapeLabel, normalizeBranchLineShape } from './utils/branchLinkGeometry';
import { analyzeArchiveGaps, BlindSpotFilterMode } from './utils/archiveAnalysis';
import { getNextCardId } from './utils/cardIdUtils';
import { extractCalendarEvents } from './utils/calendarEvents';
import { logError, logTree, logUser } from './utils/logger';
import { useTheme } from './hooks/useTheme';
import { useAdminRole } from './hooks/useAdminRole';
import { useTreeHistory } from './hooks/useTreeHistory';
import { useTreeSync, ConfirmDialogRequest } from './hooks/useTreeSync';
import { useTreeClipboard } from './hooks/useTreeClipboard';
import { useCanvasViewport } from './hooks/useCanvasViewport';
import { useCardDragAndAlign } from './hooks/useCardDragAndAlign';
import { useCanvasKeyboard } from './hooks/useCanvasKeyboard';
import { TopNavbar } from './components/TopNavbar';
import { FamilyCard } from './components/FamilyCard';
import { CoupleCard } from './components/CoupleCard';
import { TreeConnections } from './components/TreeConnections';
import { CanvasControls } from './components/CanvasControls';
import { DetailsSidebar } from './components/DetailsSidebar';
import { BranchLinksOverlay } from './components/BranchLinksOverlay';
import { TimelineRuler, CanvasTimelineGuidelines } from './components/TimelineRuler';
import { ToastContainer, ToastMessage } from './components/Toast';
import { MiniMap } from './components/MiniMap';
import { ConfirmDialog } from './components/ConfirmDialog';
import { BatchSelectionBar } from './components/BatchSelectionBar';
import { SplashScreen } from './components/SplashScreen';
import { buildSpatialGrid, getVisibleItemsFromGrid } from './utils/virtualization';
import type { BranchLinkStyleSavePayload } from './components/EditBranchLinkModal';
import type {
  ConnectOptions,
  BranchLinkConnectOptions,
  CrossCanvasConnectPayload,
} from './components/ConnectPersonsModal';
import type { ProposableRelationType } from './components/ProposeRelativeModal';
import type { QuickDraftMode } from './components/QuickDraftModal';
import type { OverviewTabId } from './components/TreeOverviewModal';

const AddRelativeModal = lazy(() => import('./components/AddRelativeModal').then((m) => ({ default: m.AddRelativeModal })));
const EditPersonModal = lazy(() => import('./components/EditPersonModal').then((m) => ({ default: m.EditPersonModal })));
const EditConnectionModal = lazy(() => import('./components/EditConnectionModal').then((m) => ({ default: m.EditConnectionModal })));
const EditBranchLinkModal = lazy(() => import('./components/EditBranchLinkModal').then((m) => ({ default: m.EditBranchLinkModal })));
const ConnectPersonsModal = lazy(() => import('./components/ConnectPersonsModal').then((m) => ({ default: m.ConnectPersonsModal })));
const QuickDraftModal = lazy(() => import('./components/QuickDraftModal').then((m) => ({ default: m.QuickDraftModal })));
const TreeOverviewModal = lazy(() => import('./components/TreeOverviewModal').then((m) => ({ default: m.TreeOverviewModal })));
const GuestSuggestionModal = lazy(() => import('./components/GuestSuggestionModal').then((m) => ({ default: m.GuestSuggestionModal })));
const ProposeRelativeModal = lazy(() => import('./components/ProposeRelativeModal').then((m) => ({ default: m.ProposeRelativeModal })));
const GuestFeedbackModal = lazy(() => import('./components/GuestFeedbackModal').then((m) => ({ default: m.GuestFeedbackModal })));
const ExportModal = lazy(() => import('./components/ExportModal').then((m) => ({ default: m.ExportModal })));
const PrintTreeModal = lazy(() => import('./components/PrintTreeModal').then((m) => ({ default: m.PrintTreeModal })));
const ImportJsonModal = lazy(() => import('./components/ImportJsonModal').then((m) => ({ default: m.ImportJsonModal })));
const UserIdentityModal = lazy(() => import('./components/UserIdentityModal').then((m) => ({ default: m.UserIdentityModal })));
const GuestCustomizeModal = lazy(() => import('./components/GuestCustomizeModal').then((m) => ({ default: m.GuestCustomizeModal })));
const ClanCoatOfArmsModal = lazy(() => import('./components/ClanCoatOfArmsModal').then((m) => ({ default: m.ClanCoatOfArmsModal })));
const MetricModal = lazy(() => import('./components/MetricModal').then((m) => ({ default: m.MetricModal })));
const DatesCalendarSidebar = lazy(() => import('./components/DatesCalendarSidebar').then((m) => ({ default: m.DatesCalendarSidebar })));
const ReactionsModal = lazy(() => import('./components/ReactionsModal').then((m) => ({ default: m.ReactionsModal })));
const SystemLogsModal = lazy(() => import('./components/SystemLogsModal').then((m) => ({ default: m.SystemLogsModal })));
const ShortcutsHelpModal = lazy(() => import('./components/ShortcutsHelpModal').then((m) => ({ default: m.ShortcutsHelpModal })));
const DocumentLightboxModal = lazy(() => import('./components/DocumentLightboxModal').then((m) => ({ default: m.DocumentLightboxModal })));
const GuestShareModal = lazy(() => import('./components/GuestShareModal').then((m) => ({ default: m.GuestShareModal })));
import { AlignmentGuidesOverlay } from './components/AlignmentGuidesOverlay';
import { useAuth } from './context/AuthContext';
import { Cake, Flame, X as CloseIcon, FolderTree, Upload, ArrowLeft, StickyNote, Image as ImageIcon, ChevronDown, ZoomIn, Link2, LogOut, Filter } from 'lucide-react';

interface ConnectingMode {
  sourceId: string;
  currentX: number;
  currentY: number;
  targetId: string | null;
}

export default function App() {
  // Light / Dark Theme State
  const { isDark, handleToggleTheme } = useTheme();

  // Toast Notifications & Confirmation Dialog
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogRequest | null>(null);

  const showToast = useCallback((msg: Omit<ToastMessage, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { ...msg, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Modals State
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);
  const [isReactionsModalOpen, setIsReactionsModalOpen] = useState(false);

  // Selection State (initialized synchronously from local cache if available)
  const initialDefaultPersonId = useMemo(() => {
    const saved = loadTreeFromLocalStorage();
    if (!saved?.persons) return null;
    if (saved.selectedPersonId && saved.persons[saved.selectedPersonId]) {
      return saved.selectedPersonId;
    }
    return Object.keys(saved.persons)[0] || null;
  }, []);

  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(initialDefaultPersonId);
  const [selectedPersonIds, setSelectedPersonIds] = useState<Set<string>>(
    new Set(initialDefaultPersonId ? [initialDefaultPersonId] : [])
  );
  const [selectionBox, setSelectionBox] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);

  const handleGuestCleanup = useCallback(() => {
    setSelectedPersonIds(new Set());
    setSelectionBox(null);
    setBlindSpotFilter('off');
  }, []);

  // Admin vs Guest Role Hook
  const {
    isAdmin,
    isAdminRef,
    isGuestLinkSession,
    canExitGuestPreview,
    handleExitGuestPreview,
    handleToggleAdminRole,
  } = useAdminRole({
    showToast,
    onGuestCleanup: handleGuestCleanup,
  });

  // User Identity State
  const [userPersonId, setUserPersonId] = useState<string | null>(() => {
    try {
      return localStorage.getItem('family_tree_user_person_id');
    } catch {
      return null;
    }
  });

  // Refs bridging History, Dragging, and Sync hooks without circular initialization
  const isDraggingCardRef = useRef<boolean>(false);
  const setTreeRef = useRef<React.Dispatch<React.SetStateAction<FamilyTreeData>>>(() => {});
  const setLastSavedTimeRef = useRef<React.Dispatch<React.SetStateAction<Date | null>>>(() => {});
  const fitToContentRef = useRef<() => void>(() => {});

  const {
    historyStack,
    isUndoActionRef,
    pushHistorySnapshot,
    handleUndo,
  } = useTreeHistory({
    onRestoreTree: (snapshot) => setTreeRef.current(snapshot),
    onAfterUndo: () => setLastSavedTimeRef.current(new Date()),
    onToggleShortcuts: () => setIsShortcutsModalOpen((prev) => !prev),
  });

  // Persistent Tree & Server Sync Hook
  const {
    tree,
    setTree,
    treeRef,
    isInitialLoading,
    lastSavedTime,
    setLastSavedTime,
    syncStatus,
    isServerConnected,
    isFirebaseSyncing,
    firebaseSyncMode,
    lastFirebaseSyncTime,
    hasUnsyncedFirebaseChanges,
    hasCenteredTreeIdRef,
    pendingFocusPersonIdRef,
    guestShareState,
    ensureCloudPublishedForShare,
    handleUpdateVersion,
    handleUnifiedSync,
    handleRestoreFromCloud,
    handleCreateNewTree,
    handleSelectTree,
    handleRenameTree,
    handleDeleteTree,
    handleImportTreeFromJson,
  } = useTreeSync({
    isAdmin,
    isAdminRef,
    isDraggingCardRef,
    isUndoActionRef,
    pushHistorySnapshot,
    showToast,
    setConfirmDialog,
    setSelectedPersonId,
    setSelectedPersonIds,
    setUserPersonId,
    onAfterImportFit: () => fitToContentRef.current(),
  });

  setTreeRef.current = setTree;
  setLastSavedTimeRef.current = setLastSavedTime;

  // Authentication context
  const { currentUser, userProfile } = useAuth();

  // UI state needed by viewport/drag hooks
  const [showTimeline, setShowTimeline] = useState(false);
  const showTimelineRef = useRef(showTimeline);
  showTimelineRef.current = showTimeline;
  const [showMiniMap, setShowMiniMap] = useState(true);
  const [showCanvasGrid, setShowCanvasGrid] = useState<boolean>(() => {
    try {
      return localStorage.getItem('family_tree_show_canvas_grid') !== 'false';
    } catch {
      return true;
    }
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [highlightedHouseNumber, setHighlightedHouseNumber] = useState<string | null>(null);

  // Freeze / Lock Layout Protection State
  const [isLayoutLocked, setIsLayoutLocked] = useState<boolean>(() => {
    try {
      return localStorage.getItem('mijrid_is_layout_locked') === 'true';
    } catch {
      return false;
    }
  });

  // Magnetic Alignment Snap Toggle State
  const [isSnapEnabled, setIsSnapEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('rodovid_snap_enabled');
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });

  const renderUnitsRef = useRef<{
    personToCoupleMap: Record<string, { person1: Person; person2: Person }>;
  }>({ personToCoupleMap: {} });
  const selectedPersonIdsRef = useRef(selectedPersonIds);
  selectedPersonIdsRef.current = selectedPersonIds;

  const clearTransientViewportUi = useCallback(() => {
    setHighlightedHouseNumber(null);
  }, []);

  const {
    viewport,
    setViewport,
    liveViewportRef,
    canvasLayerRef,
    timelineTrackRef,
    containerRef,
    containerSize,
    visibleBounds,
    isPanning,
    lastPanEndTimeRef,
    centerOnPerson,
    fitToContent,
    handleMiniMapNavigate,
    startPanCandidate,
    movePanOrCandidate,
    endPanOrCandidate,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  } = useCanvasViewport({
    treeRef,
    isSidebarOpen,
    showTimelineRef,
    setSelectedPersonId,
    setSelectedPersonIds,
    setIsSidebarOpen,
    onClearTransientUi: clearTransientViewportUi,
  });

  fitToContentRef.current = fitToContent;

  const {
    draggingCard,
    alignmentProposal,
    dragOverlayRect,
    dragFreeNearest,
    isAltFreeDrag,
    nudgeOverlay,
    setNudgeOverlay,
    showTimedNudgeOverlay,
    handleCardDragStart,
    updateCardDragMove,
    finishCardDrag,
    cancelCardDrag,
    handleManualAlign,
    handleGroupSelectedByGenerations,
  } = useCardDragAndAlign({
    isAdmin,
    isLayoutLocked,
    isSnapEnabled,
    treeRef,
    setTree,
    liveViewportRef,
    renderUnitsRef,
    selectedPersonIds,
    selectedPersonIdsRef,
    isDraggingCardRef,
    setSelectedPersonId,
    setSelectedPersonIds,
    pushHistorySnapshot,
    showToast,
  });
  const [showCalendarWidget, setShowCalendarWidget] = useState<boolean>(() => {
    try {
      return localStorage.getItem('family_tree_show_calendar_widget') === 'true';
    } catch {
      return false;
    }
  });

  const handleToggleCanvasGrid = () => {
    setShowCanvasGrid((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('family_tree_show_canvas_grid', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [addingRelativeTarget, setAddingRelativeTarget] = useState<{
    target: Person | null;
    initialType: RelativeType;
  } | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [preparedPrintTree, setPreparedPrintTree] = useState<PreparedPrintTree | null>(null);
  const [overviewModalTab, setOverviewModalTab] = useState<OverviewTabId | null>(null);
  const [isVersionModalOpen, setIsVersionModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isLogsModalOpen, setIsLogsModalOpen] = useState(false);
  const [draggedJsonFile, setDraggedJsonFile] = useState<File | null>(null);
  const [isDraggingFileOnCanvas, setIsDraggingFileOnCanvas] = useState(false);
  const [editingConnectionId, setEditingConnectionId] = useState<string | null>(null);
  const [connectingPerson, setConnectingPerson] = useState<Person | null>(null);
  const [connectModalInitialMode, setConnectModalInitialMode] = useState<'relation' | 'branch-link' | 'godparent'>('relation');
  const [preselectedTargetId, setPreselectedTargetId] = useState<string | null>(null);
  const [connectingMode, setConnectingMode] = useState<ConnectingMode | null>(null);
  const [quickDraftModalState, setQuickDraftModalState] = useState<{
    mode: QuickDraftMode;
    coords?: { x: number; y: number } | null;
  } | null>(null);
  const [canvasPhotoLightboxPerson, setCanvasPhotoLightboxPerson] = useState<Person | null>(null);
  const [openHudTray, setOpenHudTray] = useState<'ghost' | 'photo' | null>(null);
  const ghostCycleIndexRef = useRef<number>(0);

  // Blind Spots + Guest Feedback States
  const [blindSpotFilter, setBlindSpotFilter] = useState<BlindSpotFilterMode>('off');
  const [isGuestFeedbackOpen, setIsGuestFeedbackOpen] = useState(false);
  const [guestFeedbackInitialTab, setGuestFeedbackInitialTab] = useState<'suggestions' | 'proposals'>('suggestions');
  const [guestSuggestionTarget, setGuestSuggestionTarget] = useState<Person | null>(null);
  const [proposeRelativeTarget, setProposeRelativeTarget] = useState<Person | null>(null);
  const [customizePersonTarget, setCustomizePersonTarget] = useState<Person | null>(null);
  const [isGuestShareModalOpen, setIsGuestShareModalOpen] = useState(false);
  const [guestShareInitialTreeId, setGuestShareInitialTreeId] = useState<string | undefined>(undefined);

  const isGuestShareActive =
    !isAdmin && (isGuestLinkSession || guestShareState.status === 'active');
  const isStrictReadOnlyGuest =
    !isAdmin && guestShareState.status === 'active' && Boolean(guestShareState.share?.readOnly);
  const isCanvasLockedGuest =
    !isAdmin && guestShareState.status === 'active' && !guestShareState.share?.allowAllCanvases;
  const isGuestShareBlocked =
    !isAdmin &&
    (guestShareState.status === 'not_found' ||
      guestShareState.status === 'disabled' ||
      guestShareState.status === 'expired' ||
      guestShareState.status === 'error');

  // Cross-branch & Cross-canvas links state
  const [crossCanvasTrees, setCrossCanvasTrees] = useState<CrossCanvasSearchTree[]>([]);
  const refreshCrossCanvasIndex = useCallback(() => {
    fetchAllTreesSearchIndex({ includeCloud: true })
      .then((list) => setCrossCanvasTrees(list))
      .catch(() => {});
  }, []);

  const [hoveredBranchLink, setHoveredBranchLink] = useState<{ sourceId: string; targetId: string } | null>(null);
  const [branchJumpReturn, setBranchJumpReturn] = useState<{
    fromTreeId?: string;
    fromTreeTitle?: string;
    fromPersonId: string;
    fromName: string;
    toPersonId: string;
  } | null>(null);
  const [pulsingBranchTargetId, setPulsingBranchTargetId] = useState<string | null>(null);
  const branchJumpPulseTimerRef = useRef<number | null>(null);
  const pendingPulsePersonIdRef = useRef<string | null>(null);
  const [editingBranchLinkTarget, setEditingBranchLinkTarget] = useState<
    { sourceId: string; linkId: string } | 'batch' | null
  >(null);

  // Clan & Lineage Readability States
  const [selectedClanFilter, setSelectedClanFilter] = useState<string | null>(null);
  const [hoveredPersonId, setHoveredPersonId] = useState<string | null>(null);
  const [coatOfArmsModalClan, setCoatOfArmsModalClan] = useState<ClanInfo | null>(null);

  const handleToggleLockLayout = useCallback(() => {
    setIsLayoutLocked((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('mijrid_is_layout_locked', String(next));
      } catch {}
      return next;
    });
  }, []);

  const handleToggleSnap = useCallback(() => {
    setIsSnapEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('rodovid_snap_enabled', String(next));
      } catch {}
      return next;
    });
  }, []);
  const [customUserName, setCustomUserName] = useState<{ firstName: string; lastName: string } | null>(() => {
    try {
      const saved = localStorage.getItem('family_tree_user_name');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      return null;
    }
    return null;
  });

  // Listen to global display name update events from AuthContext / modals
  useEffect(() => {
    const handleNameUpdated = (e: any) => {
      if (e.detail) {
        const { firstName, lastName, fullName } = e.detail;
        if (firstName !== undefined && lastName !== undefined) {
          setCustomUserName({ firstName, lastName });
        } else if (fullName) {
          const parts = fullName.trim().split(/\s+/);
          setCustomUserName({ firstName: parts[0] || fullName, lastName: parts.slice(1).join(' ') || '' });
        }
      }
    };
    window.addEventListener('family_tree_user_name_updated', handleNameUpdated);
    return () => window.removeEventListener('family_tree_user_name_updated', handleNameUpdated);
  }, []);

  const [isUserIdentityModalOpen, setIsUserIdentityModalOpen] = useState<boolean>(false);

  // Auto-open identity modal for new visitors who have not chosen their card yet
  const hasPromptedUserRef = useRef(false);
  useEffect(() => {
    let savedPersonId: string | null = null;
    try {
      savedPersonId = localStorage.getItem('family_tree_user_person_id');
    } catch {
      savedPersonId = null;
    }
    const hasPersons = Object.keys(tree.persons).length > 0;

    if (!savedPersonId && hasPersons && !hasPromptedUserRef.current) {
      hasPromptedUserRef.current = true;
      const timer = setTimeout(() => {
        setIsUserIdentityModalOpen(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [tree.persons]);

  const userPerson = userPersonId ? tree.persons[userPersonId] : null;
  const userPersonName = userPerson
    ? `${userPerson.firstName || ''} ${userPerson.lastName || ''}`.trim()
    : (customUserName ? `${customUserName.firstName || ''} ${customUserName.lastName || ''}`.trim() : null);

  // Calculate resolved display name: user customization takes precedence over Google account name
  const getResolvedDisplayName = useCallback(() => {
    if (customUserName) {
      const full = `${customUserName.firstName || ''} ${customUserName.lastName || ''}`.trim();
      if (full) return full;
    }
    try {
      const local = localStorage.getItem('family_tree_display_name');
      if (local && local.trim()) return local.trim();
    } catch {
      /* ignore */
    }
    if (userProfile?.displayName && userProfile.displayName.trim()) return userProfile.displayName.trim();
    if (currentUser?.displayName && currentUser.displayName.trim()) return currentUser.displayName.trim();
    if (currentUser?.email) return currentUser.email.split('@')[0];
    return 'Гість';
  }, [customUserName, userProfile, currentUser]);

  // Guest / User Reactions State & Helper
  const [guestUserId] = useState<string>(() => {
    try {
      let uid = localStorage.getItem('family_tree_guest_uid');
      if (!uid) {
        uid = 'guest-' + Math.random().toString(36).substring(2, 9);
        localStorage.setItem('family_tree_guest_uid', uid);
      }
      return uid;
    } catch {
      return 'guest-' + Math.random().toString(36).substring(2, 9);
    }
  });

  const handleToggleReaction = useCallback((personId: string, emoji: ReactionEmoji) => {
    setTree((prev) => {
      const p = prev.persons[personId];
      if (!p) return prev;
      const reactions = [...(p.reactions || [])];
      const uidToUse = currentUser ? currentUser.uid : guestUserId;
      const existingIndex = reactions.findIndex((r) => r.emoji === emoji && (r.userId === uidToUse || r.userId === guestUserId));
      if (existingIndex >= 0) {
        reactions.splice(existingIndex, 1);
        logUser(`Прибрано реакцію ${emoji} з картки «${p.firstName} ${p.lastName}»`, { personId });
      } else {
        const authorName = getResolvedDisplayName();
        const authorEmail = currentUser?.email || undefined;
        reactions.push({
          id: `react_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          emoji,
          userId: uidToUse,
          userName: authorName,
          userEmail: authorEmail,
          createdAt: new Date().toLocaleDateString('uk-UA', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          }),
        });
        logUser(`Додано реакцію ${emoji} до картки «${p.firstName} ${p.lastName}»`, { personId, authorName });
      }
      return {
        ...prev,
        updatedAt: new Date().toISOString(),
        persons: {
          ...prev.persons,
          [personId]: {
            ...p,
            reactions,
          },
        },
      };
    });
  }, [guestUserId, currentUser, getResolvedDisplayName]);

  const handleDeleteReaction = useCallback((personId: string, reactionIdOrIdx: string | number) => {
    logUser('Адміністратор видалив реакцію на картці', { personId });
    setTree((prev) => {
      const p = prev.persons[personId];
      if (!p || !p.reactions) return prev;
      let newReactions: PersonReaction[];
      if (typeof reactionIdOrIdx === 'number') {
        newReactions = p.reactions.filter((_, idx) => idx !== reactionIdOrIdx);
      } else {
        newReactions = p.reactions.filter((r, idx) => (r.id ? r.id !== reactionIdOrIdx : idx.toString() !== reactionIdOrIdx));
      }
      return {
        ...prev,
        updatedAt: new Date().toISOString(),
        persons: {
          ...prev.persons,
          [personId]: {
            ...p,
            reactions: newReactions,
          },
        },
      };
    });
  }, []);

  const handleClearAllReactions = useCallback(() => {
    logUser('Очищено всі реакції на полотні');
    setTree((prev) => {
      const newPersons = { ...prev.persons };
      Object.keys(newPersons).forEach((id) => {
        if (newPersons[id].reactions) {
          newPersons[id] = { ...newPersons[id], reactions: [] };
        }
      });
      return { ...prev, updatedAt: new Date().toISOString(), persons: newPersons };
    });
  }, []);

  const totalReactionsCount = useMemo(() => {
    if (!tree?.persons) return 0;
    return Object.values(tree.persons).reduce((acc, p) => acc + (p.reactions?.length || 0), 0);
  }, [tree]);

  const handleSaveClanCoatOfArms = useCallback(
    (clanName: string, coatOfArmsData: { url: string; motto?: string; description?: string } | null) => {
      setTree((prev) => {
        const current = { ...(prev.clanCoatOfArms || {}) };
        if (coatOfArmsData) {
          current[clanName] = coatOfArmsData;
        } else {
          delete current[clanName];
        }
        return {
          ...prev,
          updatedAt: new Date().toISOString(),
          clanCoatOfArms: current,
        };
      });
      setLastSavedTime(new Date());
      logUser(
        coatOfArmsData ? `Оновлено герб роду «${clanName}»` : `Видалено герб роду «${clanName}»`,
        { clanName }
      );
    },
    []
  );

  // Metric Document Modal State
  const [metricModalTarget, setMetricModalTarget] = useState<{ person: Person; tab?: 'birth' | 'death' } | null>(null);

  const handleOpenMetricModal = useCallback((person: Person, tab: 'birth' | 'death' = 'birth') => {
    setMetricModalTarget({ person, tab });
  }, []);

  const handleSaveMetricPerson = useCallback(
    (updatedPerson: Person, meta?: { action: 'upload' | 'delete' | 'update'; message?: string }) => {
      const nowIso = new Date().toISOString();
      const nextTree: FamilyTreeData = {
        ...treeRef.current,
        updatedAt: nowIso,
        persons: {
          ...treeRef.current.persons,
          [updatedPerson.id]: updatedPerson,
        },
      };
      treeRef.current = nextTree;
      setTree(nextTree);
      setLastSavedTime(new Date(nowIso));
      setMetricModalTarget((prev) => (prev ? { ...prev, person: updatedPerson } : null));

      logTree(
        `Метричні документи оновлено для «${updatedPerson.firstName} ${updatedPerson.lastName}» (${meta?.action || 'update'})`,
        { personId: updatedPerson.id, count: updatedPerson.metricDocuments?.length || 0 },
        'info'
      );

      if (isAdminRef.current) {
        void syncTreeToServer(nextTree);
      }

      if (meta?.message) {
        showToast({
          type: meta.action === 'delete' ? 'info' : 'success',
          title: meta.action === 'delete' ? 'Фото видалено' : 'Метрику оновлено',
          message: meta.message,
        });
      }
    },
    [setLastSavedTime, showToast]
  );

  // Freeze heavy non-drag O(N) graph/validation/archive/timeline memos while dragging a card at 60fps
  const settledTreeRef = useRef<FamilyTreeData>(tree);
  if (!draggingCard) {
    settledTreeRef.current = tree;
  }
  const settledTree = settledTreeRef.current;

  useEffect(() => {
    // Only auto-center once per tree load, do not re-center when adding/editing cards
    if (hasCenteredTreeIdRef.current === tree.id && !pendingFocusPersonIdRef.current && Object.keys(tree.persons).length > 0) {
      return;
    }

    const personKeys = Object.keys(tree.persons);
    if (personKeys.length === 0) return;

    const centerTarget = () => {
      const pendingTarget =
        pendingFocusPersonIdRef.current && tree.persons[pendingFocusPersonIdRef.current]
          ? pendingFocusPersonIdRef.current
          : null;

      const targetId =
        pendingTarget ||
        (userPersonId && tree.persons[userPersonId] ? userPersonId : null) ||
        selectedPersonId ||
        personKeys[0];

      if (!targetId || !containerRef.current) return;

      const p = tree.persons[targetId];
      if (p) {
        const rect = containerRef.current.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        const targetX = rect.width / 2 - (p.x + CARD_WIDTH / 2) * 0.9;
        const targetY = rect.height / 2 - (p.y + CARD_HEIGHT / 2) * 0.9;
        setViewport({
          x: targetX,
          y: targetY,
          zoom: 0.9,
        });
        if (pendingTarget) {
          setSelectedPersonId(pendingTarget);
          pendingFocusPersonIdRef.current = null;
          if (pendingPulsePersonIdRef.current === pendingTarget) {
            pendingPulsePersonIdRef.current = null;
            setPulsingBranchTargetId(pendingTarget);
            if (branchJumpPulseTimerRef.current !== null) {
              window.clearTimeout(branchJumpPulseTimerRef.current);
            }
            branchJumpPulseTimerRef.current = window.setTimeout(() => {
              setPulsingBranchTargetId(null);
            }, 2400);
          }
        } else if (userPersonId && tree.persons[userPersonId]) {
          setSelectedPersonId(userPersonId);
        }
        hasCenteredTreeIdRef.current = tree.id;
      }
    };

    centerTarget();
    const timer = setTimeout(centerTarget, 120);
    return () => clearTimeout(timer);
  }, [tree.id, userPersonId]);

  const personKeysLength = Object.keys(tree.persons).length;
  useEffect(() => {
    if (isDraggingCardRef.current) return;
    refreshCrossCanvasIndex();
  }, [tree.id, personKeysLength, refreshCrossCanvasIndex]);

  // Selected person object
  const selectedPerson = selectedPersonId ? tree.persons[selectedPersonId] || null : null;

  // Compute clans map and list (settled outside active drag for 60fps drag)
  const clanMap = useMemo(
    () => buildClanMap(settledTree.persons, settledTree.clanCoatOfArms),
    [settledTree.persons, settledTree.clanCoatOfArms]
  );
  const clanList = useMemo(() => Array.from(clanMap.values()), [clanMap]);

  // All persons are visible without branch collapsing
  const visiblePersons = useMemo(() => {
    return Object.values(tree.persons);
  }, [tree.persons]);

  // Nearest upcoming event for floating widget
  const nearestCalendarEvent = useMemo(() => {
    const events = extractCalendarEvents(settledTree.persons);
    if (events.length === 0) return null;
    const sorted = [...events].sort((a, b) => a.daysUntil - b.daysUntil);
    return sorted[0] || null;
  }, [settledTree.persons]);

  // Handler for card fully verified status toggle
  const handleToggleFullyVerified = useCallback((personId: string) => {
    setTree((prev) => {
      const p = prev.persons[personId];
      if (!p) return prev;
      const nextStatus = !p.isFullyVerified;
      showToast({
        type: nextStatus ? 'success' : 'info',
        title: nextStatus ? 'Картка перевірена ✓' : 'Картка не перевірена',
        message: `${p.firstName} ${p.lastName}: встановлено статус «${nextStatus ? 'Перевірена' : 'Не перевірена'}». ${nextStatus ? 'Лінії зв’язку активні.' : 'Зв’язок відображається пунктирною сірою лінією.'}`,
      });
      return {
        ...prev,
        updatedAt: new Date().toISOString(),
        persons: {
          ...prev.persons,
          [personId]: {
            ...p,
            isFullyVerified: nextStatus,
          },
        },
      };
    });
  }, [showToast]);

  const clanRecord = useMemo(() => Object.fromEntries(clanMap.entries()), [clanMap]);

  // Generated connection lines with verification status (green for verified, gray for unverified, or auto-colored matching card color)
  const connections = useMemo(() => {
    // Only generate connections among non-collapsed persons
    const activePersons: Record<string, Person> = {};
    visiblePersons.forEach((p) => {
      activePersons[p.id] = p;
    });

    return generateConnections(
      activePersons,
      tree.connectionOverrides,
      tree.verifiedColor || '#64748b',
      clanRecord
    );
  }, [visiblePersons, tree.connectionOverrides, tree.verifiedColor, clanRecord]);

  // Group persons into married couples (Double Card units) and singles
  const renderUnits = useMemo(() => {
    const activePersons: Record<string, Person> = {};
    visiblePersons.forEach((p) => {
      activePersons[p.id] = p;
    });
    return groupPersonsIntoRenderUnits(activePersons, tree.connectionOverrides);
  }, [visiblePersons, tree.connectionOverrides]);
  renderUnitsRef.current = renderUnits;

  // Spatial Grid Index for Couples - Built once when renderUnits changes O(N)
  const couplesSpatialGrid = useMemo(() => {
    return buildSpatialGrid(renderUnits.couples, (c) => {
      const minX = Math.min(c.person1.x, c.person2.x);
      const minY = Math.min(c.person1.y, c.person2.y);
      const maxX = minX + CARD_WIDTH * 2 + 10;
      const maxY = minY + CARD_HEIGHT;
      return { minX, maxX, minY, maxY };
    });
  }, [renderUnits.couples]);

  // Spatial Grid Index for Singles - Built once when renderUnits changes O(N)
  const singlesSpatialGrid = useMemo(() => {
    return buildSpatialGrid(renderUnits.singles, (s) => {
      const minX = s.x;
      const minY = s.y;
      const maxX = minX + CARD_WIDTH;
      const maxY = minY + CARD_HEIGHT;
      return { minX, maxX, minY, maxY };
    });
  }, [renderUnits.singles]);

  // Fast O(K) Viewport Virtualized Render Units Lookup
  const visibleRenderUnits = useMemo(() => {
    const visibleCouples = getVisibleItemsFromGrid(couplesSpatialGrid, visibleBounds);
    const visibleSingles = getVisibleItemsFromGrid(singlesSpatialGrid, visibleBounds);

    const coupleSet = new Set(visibleCouples);
    const singleSet = new Set(visibleSingles);

    // Always include selected / active persons so they never vanish while interacted with
    if (selectedPersonId) {
      const couple = renderUnits.personToCoupleMap[selectedPersonId];
      if (couple) coupleSet.add(couple);
      const single = renderUnits.singles.find((s) => s.id === selectedPersonId);
      if (single) singleSet.add(single);
    }
    if (draggingCard) {
      const couple = renderUnits.personToCoupleMap[draggingCard.id];
      if (couple) coupleSet.add(couple);
      const single = renderUnits.singles.find((s) => s.id === draggingCard.id);
      if (single) singleSet.add(single);
    }
    if (connectingMode) {
      const couple = renderUnits.personToCoupleMap[connectingMode.sourceId];
      if (couple) coupleSet.add(couple);
      const single = renderUnits.singles.find((s) => s.id === connectingMode.sourceId);
      if (single) singleSet.add(single);
    }
    if (pulsingBranchTargetId) {
      const couple = renderUnits.personToCoupleMap[pulsingBranchTargetId];
      if (couple) coupleSet.add(couple);
      const single = renderUnits.singles.find((s) => s.id === pulsingBranchTargetId);
      if (single) singleSet.add(single);
    }
    if (hoveredBranchLink) {
      [hoveredBranchLink.sourceId, hoveredBranchLink.targetId].forEach((pid) => {
        const couple = renderUnits.personToCoupleMap[pid];
        if (couple) coupleSet.add(couple);
        const single = renderUnits.singles.find((s) => s.id === pid);
        if (single) singleSet.add(single);
      });
    }

    return {
      couples: Array.from(coupleSet),
      singles: Array.from(singleSet),
    };
  }, [
    couplesSpatialGrid,
    singlesSpatialGrid,
    visibleBounds,
    selectedPersonId,
    draggingCard,
    connectingMode,
    pulsingBranchTargetId,
    hoveredBranchLink,
    renderUnits,
  ]);

  // Calculate timeline bounds and ticks
  const { timelineTicks, startYear } = useMemo(() => {
    let minYear = DEFAULT_START_YEAR;
    let maxYear = DEFAULT_END_YEAR;

    Object.values(settledTree.persons).forEach((p) => {
      const yr = extractBirthYear(p);
      if (yr) {
        if (yr < minYear) minYear = Math.floor(yr / 50) * 50;
        if (yr > maxYear) maxYear = Math.ceil((yr + 20) / 10) * 10;
      }
    });

    const ticks = generateTimelineTicks(minYear, maxYear, 10, DEFAULT_PIXELS_PER_YEAR);
    return { timelineTicks: ticks, startYear: minYear };
  }, [settledTree.persons]);

  // Calculate stats
  const personCount = Object.keys(settledTree.persons).length;
  const generationsMap = useMemo(() => {
    return calculateGenerations(settledTree.persons);
  }, [settledTree.persons]);

  const generationCount = useMemo(() => {
    if (personCount === 0) return 0;
    const unique = new Set(Object.values(generationsMap));
    return Math.max(1, unique.size);
  }, [generationsMap, personCount]);

  // Handle saving user identity and centering on card
  const handleSaveUserIdentity = useCallback(
    (personId: string | null, customName?: { firstName: string; lastName: string }) => {
      try {
        localStorage.setItem('family_tree_user_prompted', 'true');

        if (personId) {
          localStorage.setItem('family_tree_user_person_id', personId);
        } else {
          localStorage.removeItem('family_tree_user_person_id');
        }

        if (customName) {
          localStorage.setItem('family_tree_user_name', JSON.stringify(customName));
          const fullName = `${customName.firstName || ''} ${customName.lastName || ''}`.trim();
          if (fullName) {
            localStorage.setItem('family_tree_display_name', fullName);
          }
        } else {
          localStorage.removeItem('family_tree_user_name');
          localStorage.removeItem('family_tree_display_name');
        }
      } catch {
        /* ignore storage errors */
      }

      setUserPersonId(personId || null);
      setCustomUserName(customName || null);

      // Automatically center on person if linked
      if (personId && tree.persons[personId]) {
        centerOnPerson(personId, false);
        const p = tree.persons[personId];
        logUser(`Користувач обрав свою картку в дереві: «${p.firstName} ${p.lastName}»`, { personId });
        showToast({
          type: 'success',
          title: 'Вас відзначено в родовому дереві',
          message: `Вибрано: ${p.firstName} ${p.lastName}. Екран відцентровано на вашій картці.`,
        });
      } else {
        logUser('Оновлено налаштування профілю користувача', {
          hasCustomName: Boolean(customName),
        });
      }
    },
    [tree.persons, centerOnPerson, showToast]
  );

  const handleSaveGuestCustomize = useCallback(
    async (
      targetPersonId: string,
      patch: { avatarUrl: string | null; cardBgColor: string | null; cardFrame: CardFrameStyle }
    ): Promise<boolean> => {
      const currentTree = treeRef.current;
      const existing = currentTree.persons[targetPersonId];
      if (!existing) return false;

      const nowIso = new Date().toISOString();

      if (isAdminRef.current) {
        isUndoActionRef.current = false;
        const nextPerson: Person = {
          ...existing,
          avatarUrl: patch.avatarUrl || undefined,
          cardBgColor: patch.cardBgColor || undefined,
          cardFrame: patch.cardFrame !== 'none' ? patch.cardFrame : undefined,
          selfCustomizedAt: nowIso,
        };
        setTree((prev) => ({
          ...prev,
          persons: {
            ...prev.persons,
            [targetPersonId]: nextPerson,
          },
          updatedAt: nowIso,
        }));
        logUser(`Оформлено картку «${existing.firstName} ${existing.lastName}»`, { targetPersonId });
        showToast({
          type: 'success',
          title: 'Картку оформлено',
          message: 'Аватарку, колір та рамку оновлено.',
        });
        return true;
      }

      const res = await submitGuestCustomizeToServer(currentTree.id, {
        personId: targetPersonId,
        avatarUrl: patch.avatarUrl,
        cardBgColor: patch.cardBgColor,
        cardFrame: patch.cardFrame,
      });

      if (!res.ok) {
        logError('user', 'Не вдалося зберегти оформлення картки гостем', res.error);
        showToast({
          type: 'error',
          title: 'Помилка збереження',
          message: res.error || 'Не вдалося зберегти оформлення картки.',
        });
        return false;
      }

      const serverUpdatedAt = res.updatedAt || nowIso;
      const appliedPatch = res.personPatch;
      const latestTree = treeRef.current;
      const latestPerson = latestTree.persons[targetPersonId] || existing;
      const nextPerson: Person = {
        ...latestPerson,
        avatarUrl: appliedPatch ? appliedPatch.avatarUrl : patch.avatarUrl || undefined,
        cardBgColor: appliedPatch ? appliedPatch.cardBgColor : patch.cardBgColor || undefined,
        cardFrame: appliedPatch
          ? appliedPatch.cardFrame
          : patch.cardFrame !== 'none'
          ? patch.cardFrame
          : undefined,
        selfCustomizedAt: appliedPatch?.selfCustomizedAt || serverUpdatedAt,
      };
      const nextTree: FamilyTreeData = {
        ...latestTree,
        persons: {
          ...latestTree.persons,
          [targetPersonId]: nextPerson,
        },
        updatedAt: serverUpdatedAt,
      };
      isUndoActionRef.current = true;
      treeRef.current = nextTree;
      setTree(nextTree);
      saveTreeLocally(nextTree, false);

      logUser(`Гість оформив свою картку «${existing.firstName} ${existing.lastName}»`, { targetPersonId, localOnly: Boolean(res.localOnly) });
      showToast({
        type: 'success',
        title: 'Оформлення збережено',
        message: res.localOnly
          ? 'Оформлення картки збережено локально у вашому браузері.'
          : 'Ваша картка оновлена.',
      });
      return true;
    },
    [isAdminRef, isUndoActionRef, setTree, showToast, treeRef]
  );

  // Swap Spouses left <-> right (User request)
  const handleSwapSpouses = useCallback((id1: string, id2: string) => {
    if (!isAdmin) return;
    setTree((prev) => {
      const updated = swapSpousePositions(id1, id2, prev.persons);
      return {
        ...prev,
        persons: updated,
      };
    });
  }, [isAdmin]);

  // Handle Person Card Selection (Supports Ctrl+click multi-selection for Admin)
  const handleSelectPerson = useCallback((id: string, e?: React.MouseEvent) => {
    if (Date.now() - lastPanEndTimeRef.current < 90) {
      return;
    }
    if ((e?.ctrlKey || e?.metaKey) && isAdmin) {
      setSelectedPersonIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
      setSelectedPersonId(id);
    } else {
      setSelectedPersonId(id);
      setSelectedPersonIds(isAdmin ? new Set([id]) : new Set());
      setIsSidebarOpen(true);
    }
  }, [isAdmin]);

  // Canvas Mouse Down (Panning threshold or Box Selection)
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setHighlightedHouseNumber(null);
    const targetForTray = e.target as HTMLElement | null;
    if (!targetForTray?.closest('[data-hud-tray="true"]')) {
      setOpenHudTray(null);
    }
    const vp = liveViewportRef.current;

    // If Ctrl or Meta is pressed on empty canvas, start Rubberband Box Selection (Admin mode only)
    if ((e.ctrlKey || e.metaKey) && isAdmin) {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const canvasX = Math.round((e.clientX - rect.left - vp.x) / vp.zoom);
      const canvasY = Math.round((e.clientY - rect.top - vp.y) / vp.zoom);
      setSelectionBox({
        startX: canvasX,
        startY: canvasY,
        currentX: canvasX,
        currentY: canvasY,
      });
      return;
    }

    const targetEl = e.target as HTMLElement | null;
    const startedOnCard = Boolean(targetEl?.closest('[data-family-card="true"]'));
    const startedOnInteractive = Boolean(
      targetEl?.closest('button, input, textarea, select, a, aside, nav, [role="dialog"]')
    );
    startPanCandidate(e.clientX, e.clientY, startedOnCard, startedOnInteractive);
  };

  // Mouse Move
  const handleMouseMove = (e: React.MouseEvent) => {
    if (selectionBox && containerRef.current) {
      const vp = liveViewportRef.current;
      const rect = containerRef.current.getBoundingClientRect();
      const currentX = Math.round((e.clientX - rect.left - vp.x) / vp.zoom);
      const currentY = Math.round((e.clientY - rect.top - vp.y) / vp.zoom);
      setSelectionBox((prev) => (prev ? { ...prev, currentX, currentY } : null));

      const minX = Math.min(selectionBox.startX, currentX);
      const maxX = Math.max(selectionBox.startX, currentX);
      const minY = Math.min(selectionBox.startY, currentY);
      const maxY = Math.max(selectionBox.startY, currentY);

      const newlySelected = new Set<string>();
      Object.values(tree.persons).forEach((p) => {
        if (
          p.x + CARD_WIDTH >= minX &&
          p.x <= maxX &&
          p.y + CARD_HEIGHT >= minY &&
          p.y <= maxY
        ) {
          newlySelected.add(p.id);
        }
      });
      setSelectedPersonIds(newlySelected);
      if (newlySelected.size > 0 && (!selectedPersonId || !newlySelected.has(selectedPersonId))) {
        setSelectedPersonId(Array.from(newlySelected)[0]);
      }
      return;
    }

    if (connectingMode && containerRef.current) {
      const vp = liveViewportRef.current;
      const rect = containerRef.current.getBoundingClientRect();
      const currentX = Math.round((e.clientX - rect.left - vp.x) / vp.zoom);
      const currentY = Math.round((e.clientY - rect.top - vp.y) / vp.zoom);

      let hoveredTargetId: string | null = null;
      Object.values(tree.persons).forEach((p) => {
        if (p.id === connectingMode.sourceId) return;
        if (
          currentX >= p.x - 12 &&
          currentX <= p.x + CARD_WIDTH + 12 &&
          currentY >= p.y - 12 &&
          currentY <= p.y + CARD_HEIGHT + 12
        ) {
          hoveredTargetId = p.id;
        }
      });

      setConnectingMode((prev) =>
        prev
          ? {
              ...prev,
              currentX,
              currentY,
              targetId: hoveredTargetId,
            }
          : null
      );
      return;
    }

    if (draggingCard) {
      updateCardDragMove(e);
      return;
    }

    movePanOrCandidate(e.clientX, e.clientY, 5);
  };

  const handleMouseUp = () => {
    endPanOrCandidate(!selectionBox && !connectingMode && !draggingCard);

    if (selectionBox) {
      setSelectionBox(null);
    }

    if (connectingMode) {
      const sourcePerson = tree.persons[connectingMode.sourceId];
      const targetId = connectingMode.targetId;
      setConnectingMode(null);

      if (sourcePerson && targetId && sourcePerson.id !== targetId) {
        setPreselectedTargetId(targetId);
        setConnectingPerson(sourcePerson);
      }
      return;
    }

    if (draggingCard) {
      finishCardDrag();
    }
  };

  // Card Long Press Start (Activates manual connection line drag)
  const handleCardLongPress = useCallback(
    (e: React.MouseEvent, personId: string) => {
      e.stopPropagation();
      if (!isAdmin) return;
      cancelCardDrag();
      if (!containerRef.current) return;
      const vp = liveViewportRef.current;
      const rect = containerRef.current.getBoundingClientRect();
      const canvasX = Math.round((e.clientX - rect.left - vp.x) / vp.zoom);
      const canvasY = Math.round((e.clientY - rect.top - vp.y) / vp.zoom);
      setConnectingMode({
        sourceId: personId,
        currentX: canvasX,
        currentY: canvasY,
        targetId: null,
      });
    },
    [isAdmin, cancelCardDrag, containerRef, liveViewportRef]
  );

  // Canvas Double Click: Create new person at click coordinates (Owner creates regular card, guest/user proposes ghost card)
  const handleCanvasDoubleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-family-card="true"]')) return;
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const canvasX = Math.round((e.clientX - rect.left - viewport.x) / viewport.zoom);
    const canvasY = Math.round((e.clientY - rect.top - viewport.y) / viewport.zoom);

    if (!isAdmin) return;

    if (e.altKey) {
      setQuickDraftModalState({ mode: 'ghost', coords: { x: canvasX, y: canvasY } });
      return;
    }

    // Tree Owner: create regular new card at exact double-clicked position
    const newId = `p-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const newPerson: Person = {
      id: newId,
      cardId: getNextCardId(tree.persons),
      firstName: 'Нова особа',
      lastName: '',
      gender: 'unknown',
      parents: [],
      spouses: [],
      children: [],
      x: canvasX,
      y: canvasY,
    };

    setTree((prev) => ({
      ...prev,
      persons: {
        ...prev.persons,
        [newId]: newPerson,
      },
      selectedPersonId: newId,
      updatedAt: new Date().toISOString(),
    }));
    setSelectedPersonId(newId);
    setIsSidebarOpen(true);
    setEditingPerson(newPerson);
    logTree('Створено окрему картку особи на полотні', { newId, cardId: newPerson.cardId });
  };

  // Add Relative Handler with Chronological Timeline Alignment
  const handleAddRelativeConfirm = (data: AddRelativeInput) => {
    const target = addingRelativeTarget?.target || null;
    const result = applyAddRelative(tree, target, data, startYear);

    setTree(result.nextTree);
    setSelectedPersonId(result.newId);
    setAddingRelativeTarget(null);
    logTree(
      `Додано картку «${[data.firstName, data.lastName].filter(Boolean).join(' ')}» (${target ? data.relationType : 'перша особа'})`,
      { newId: result.newId, targetId: target?.id, relationType: data.relationType },
      'success'
    );

    if (result.isFirstCard) {
      setTimeout(() => {
        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          const targetX = rect.width / 2 - (result.newX + CARD_WIDTH / 2) * 0.9;
          const targetY = rect.height / 2 - (result.newY + CARD_HEIGHT / 2) * 0.9;
          setViewport({
            x: targetX,
            y: targetY,
            zoom: 0.9,
          });
        }
      }, 50);
    }
  };

  const ghostPersons = useMemo(
    () => Object.values(tree.persons).filter((p) => Boolean(p.isGhost)),
    [tree.persons]
  );

  const blankScreenshotPersons = useMemo(
    () => Object.values(tree.persons).filter((p) => Boolean(p.isBlankScreenshot)),
    [tree.persons]
  );

  const handleOpenQuickDraftAtViewportCenter = useCallback(
    (mode: QuickDraftMode = 'ghost') => {
      if (!isAdmin) return;
      if (!containerRef.current || Object.keys(tree.persons).length === 0) {
        setQuickDraftModalState({ mode, coords: null });
        return;
      }
      const rect = containerRef.current.getBoundingClientRect();
      const centerX = Math.round((rect.width / 2 - viewport.x) / viewport.zoom - CARD_WIDTH / 2);
      const centerY = Math.round((rect.height / 2 - viewport.y) / viewport.zoom - CARD_HEIGHT / 2);
      setQuickDraftModalState({ mode, coords: { x: centerX, y: centerY } });
    },
    [isAdmin, tree.persons, viewport]
  );

  const handleCreateGhostCard = useCallback(
    (data: CreateGhostCardInput) => {
      pushHistorySnapshot(tree);
      const result = applyCreateGhostCard(tree, data, startYear);
      setTree(result.nextTree);
      setSelectedPersonId(result.newId);
      setSelectedPersonIds(isAdmin ? new Set([result.newId]) : new Set());
      setIsSidebarOpen(true);
      setPulsingBranchTargetId(result.newId);
      if (branchJumpPulseTimerRef.current !== null) {
        window.clearTimeout(branchJumpPulseTimerRef.current);
      }
      branchJumpPulseTimerRef.current = window.setTimeout(() => {
        setPulsingBranchTargetId(null);
      }, 2000);
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setViewport((prevVp) => ({
          ...prevVp,
          x: rect.width / 2 - (result.newX + CARD_WIDTH / 2) * prevVp.zoom,
          y: rect.height / 2 - (result.newY + CARD_HEIGHT / 2) * prevVp.zoom,
        }));
      }
      logTree(
        `Створено нотатку-стікер «${[data.firstName, data.lastName].filter(Boolean).join(' ')}»`,
        { newId: result.newId }
      );
      showToast({
        type: 'info',
        title: 'Нотатку (стікер) створено',
        message: `Стікер «${[data.firstName, data.lastName].filter(Boolean).join(' ')}» додано на полотно.`,
      });
    },
    [tree, startYear, isAdmin, pushHistorySnapshot, setTree, showToast]
  );

  const handleToggleGhostStatus = useCallback(
    (personId: string, isGhost: boolean, openEditAfter = false) => {
      const p = tree.persons[personId];
      if (!p) return;
      pushHistorySnapshot(tree);
      setTree((prev) => applyToggleGhostStatus(prev, personId, isGhost));
      if (openEditAfter && !isGhost) {
        setEditingPerson({
          ...p,
          isGhost: undefined,
        });
      }
      logTree(
        isGhost ? `Картку переведено в нотатку-стікер: «${p.firstName} ${p.lastName}»` : `Нотатку перетворено на картку особи: «${p.firstName} ${p.lastName}»`,
        { personId }
      );
      showToast({
        type: isGhost ? 'info' : 'success',
        title: isGhost ? 'Переведено у стікер-нотатку' : 'Перетворено на картку особи',
        message: isGhost
          ? `Картка «${[p.firstName, p.lastName].filter(Boolean).join(' ')}» тепер відображається як стікер-нотатка.`
          : openEditAfter
          ? `Нотатку «${[p.firstName, p.lastName].filter(Boolean).join(' ')}» переведено в картку особи — заповніть деталі.`
          : `Нотатку «${[p.firstName, p.lastName].filter(Boolean).join(' ')}» переведено у звичайну картку.`,
      });
    },
    [tree, pushHistorySnapshot, setTree, showToast]
  );


  const handleCreateBlankScreenshotCard = useCallback(
    (data: CreateBlankScreenshotCardInput) => {
      pushHistorySnapshot(tree);
      const result = applyCreateBlankScreenshotCard(tree, data);
      setTree(result.nextTree);
      setSelectedPersonId(result.newId);
      setSelectedPersonIds(isAdmin ? new Set([result.newId]) : new Set());
      setIsSidebarOpen(true);
      setPulsingBranchTargetId(result.newId);
      if (branchJumpPulseTimerRef.current !== null) {
        window.clearTimeout(branchJumpPulseTimerRef.current);
      }
      branchJumpPulseTimerRef.current = window.setTimeout(() => {
        setPulsingBranchTargetId(null);
      }, 2000);
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setViewport((prevVp) => ({
          ...prevVp,
          x: rect.width / 2 - (result.newX + CARD_WIDTH / 2) * prevVp.zoom,
          y: rect.height / 2 - (result.newY + CARD_HEIGHT / 2) * prevVp.zoom,
        }));
      }
        logTree('Створено картку-скріншот', {
          newId: result.newId,
          hasScreenshot: Boolean(data.screenshotUrl),
        });
        showToast({
        type: 'success',
        title: data.screenshotUrl ? 'Картку зі скріншотом створено' : 'Порожню картку створено',
        message: data.screenshotUrl
          ? 'Скріншот заповнив всю картку. Натисніть на неї, щоб збільшити та розшифрувати.'
          : 'Можна перетягнути або вставити (Ctrl+V) скріншот прямо у картку.',
      });
    },
    [tree, isAdmin, pushHistorySnapshot, setTree, showToast]
  );

  const handleUploadBlankScreenshot = useCallback(
    async (personId: string, file: File) => {
      if (!isAdmin) return;
      try {
        const res = await uploadFileToServerDetailed(file, { kind: 'screenshot' });
        pushHistorySnapshot(tree);
        setTree((prev) => applyUpdateBlankScreenshot(prev, personId, res.url, true));
        logTree('Завантажено скріншот у картку', { personId, fileName: file.name }, 'success');
        showToast({
          type: 'success',
          title: 'Скріншот завантажено',
          message: 'Зображення оновлено на всю картку.',
        });
      } catch (err) {
        logError('tree', 'Помилка завантаження скріншоту у картку', err);
        showToast({
          type: 'error',
          title: 'Помилка завантаження',
          message: (err as Error)?.message || 'Не вдалося завантажити скріншот.',
        });
      }
    },
    [isAdmin, tree, pushHistorySnapshot, setTree, showToast]
  );

  const handleOpenBlankScreenshotLightbox = useCallback((p: Person) => {
    if (p.screenshotUrl) {
      setCanvasPhotoLightboxPerson(p);
    }
  }, []);

  const handleCreatePhotoCardFromFile = useCallback(
    async (file: File, coords?: { x: number; y: number } | null) => {
      if (!isAdmin) return;
      try {
        const res = await uploadFileToServerDetailed(file, { kind: 'screenshot' });
        const currentTree = treeRef.current;
        const baseName = file.name
          .replace(/\.[^.]+$/, '')
          .replace(/[_-]+/g, ' ')
          .trim();
        const title = baseName && baseName.toLowerCase() !== 'image' ? baseName.slice(0, 60) : 'Новий скріншот';

        let targetCoords = coords || null;
        if (!targetCoords && containerRef.current && Object.keys(currentTree.persons).length > 0) {
          const rect = containerRef.current.getBoundingClientRect();
          const vp = liveViewportRef.current;
          targetCoords = {
            x: Math.round((rect.width / 2 - vp.x) / vp.zoom - CARD_WIDTH / 2),
            y: Math.round((rect.height / 2 - vp.y) / vp.zoom - CARD_HEIGHT / 2),
          };
        }

        pushHistorySnapshot(currentTree);
        const result = applyCreateBlankScreenshotCard(currentTree, {
          title,
          screenshotUrl: res.url,
          screenshotFit: 'cover',
          x: targetCoords?.x,
          y: targetCoords?.y,
        });
        setTree(result.nextTree);
        setSelectedPersonId(result.newId);
        setSelectedPersonIds(new Set([result.newId]));
        setIsSidebarOpen(true);
        setPulsingBranchTargetId(result.newId);
        if (branchJumpPulseTimerRef.current !== null) {
          window.clearTimeout(branchJumpPulseTimerRef.current);
        }
        branchJumpPulseTimerRef.current = window.setTimeout(() => {
          setPulsingBranchTargetId(null);
        }, 2000);
        if (!coords && containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          setViewport((prevVp) => ({
            ...prevVp,
            x: rect.width / 2 - (result.newX + CARD_WIDTH / 2) * prevVp.zoom,
            y: rect.height / 2 - (result.newY + CARD_HEIGHT / 2) * prevVp.zoom,
          }));
        }
        logTree(`Створено картку-фото «${title}» з файлу`, { newId: result.newId, fileName: file.name }, 'success');
        showToast({
          type: 'success',
          title: 'Картку-фото створено',
          message: `«${title}» додано на полотно.`,
        });
      } catch (err) {
        logError('tree', 'Помилка створення картки-фото з файлу', err);
        showToast({
          type: 'error',
          title: 'Помилка завантаження',
          message: (err as Error)?.message || 'Не вдалося завантажити зображення.',
        });
      }
    },
    [isAdmin, pushHistorySnapshot, setTree, showToast]
  );

  const clearEscapeUi = useCallback(() => {
    setSelectionBox(null);
    setNudgeOverlay(null);
    setOpenHudTray(null);
  }, [setNudgeOverlay]);

  const hasBlockingModalOpen = Boolean(
    editingPerson ||
      addingRelativeTarget ||
      isExportModalOpen ||
      isPrintModalOpen ||
      overviewModalTab !== null ||
      isVersionModalOpen ||
      isImportModalOpen ||
      isLogsModalOpen ||
      editingConnectionId ||
      connectingPerson ||
      isShortcutsModalOpen ||
      isUserIdentityModalOpen ||
      metricModalTarget ||
      quickDraftModalState ||
      isGuestFeedbackOpen ||
      guestSuggestionTarget ||
      proposeRelativeTarget ||
      customizePersonTarget ||
      isGuestShareModalOpen ||
      confirmDialog ||
      canvasPhotoLightboxPerson
  );

  useCanvasKeyboard({
    isAdmin,
    isLayoutLocked,
    hasDraggingCard: Boolean(draggingCard),
    hasBlockingModalOpen,
    selectedPersonId,
    selectedPersonIds,
    selectedPerson,
    treeRef,
    setTree,
    renderUnitsRef,
    pushHistorySnapshot,
    setSelectedPersonIds,
    onClearEscapeUi: clearEscapeUi,
    onShowNudgeOverlay: showTimedNudgeOverlay,
    onUploadBlankScreenshot: handleUploadBlankScreenshot,
    onCreatePhotoCardFromFile: handleCreatePhotoCardFromFile,
  });

  const handleCycleGhostCards = useCallback(() => {
    if (ghostPersons.length === 0) return;
    const idx = ghostCycleIndexRef.current % ghostPersons.length;
    ghostCycleIndexRef.current = idx + 1;
    const target = ghostPersons[idx];
    if (!target) return;
    centerOnPerson(target.id, true);
    setPulsingBranchTargetId(target.id);
    if (branchJumpPulseTimerRef.current !== null) {
      window.clearTimeout(branchJumpPulseTimerRef.current);
    }
    branchJumpPulseTimerRef.current = window.setTimeout(() => {
      setPulsingBranchTargetId(null);
    }, 2200);
  }, [ghostPersons, centerOnPerson]);

  // Archive Registry & Blind Spots analysis (Admin, settled outside drag)
  const archiveReport = useMemo(
    () => (isAdmin ? analyzeArchiveGaps(settledTree) : null),
    [isAdmin, settledTree]
  );

  const blindSpotHighlightedIds = useMemo(() => {
    const ids = new Set<string>();
    if (!isAdmin || blindSpotFilter === 'off' || !archiveReport) return ids;
    Object.values(archiveReport.personGapsById).forEach((info) => {
      if (
        blindSpotFilter === 'all-gaps' ||
        info.gaps.some((g) => g.kind === blindSpotFilter)
      ) {
        ids.add(info.personId);
      }
    });
    return ids;
  }, [isAdmin, blindSpotFilter, archiveReport]);

  const pendingGuestFeedbackCount = useMemo(() => {
    let count = 0;
    Object.values(settledTree.persons).forEach((p) => {
      if (p.isProposal) count += 1;
      if (p.guestSuggestions?.length) {
        count += p.guestSuggestions.filter((s) => s.status === 'pending').length;
      }
    });
    return count;
  }, [settledTree.persons]);

  // Stable card/overlay handlers so React.memo on CoupleCard, FamilyCard, TreeConnections, BranchLinksOverlay, and MiniMap stays effective
  const handleHighlightHouse = useCallback((houseNumber: string) => {
    setHighlightedHouseNumber((prev) => (prev === houseNumber ? null : houseNumber));
  }, []);

  const handleEditPerson = useCallback((p: Person) => {
    if (p.isBlankScreenshot && p.screenshotUrl) {
      setCanvasPhotoLightboxPerson(p);
      return;
    }
    setEditingPerson(p);
  }, []);

  const handleGuestDoubleClickCard = useCallback(
    (p: Person) => {
      if (p.isBlankScreenshot && p.screenshotUrl) {
        setCanvasPhotoLightboxPerson(p);
        return;
      }
      handleSelectPerson(p.id);
    },
    [handleSelectPerson]
  );

  const handleOpenMarriageConnection = useCallback((key: string) => {
    setEditingConnectionId(`marriage:${key}`);
  }, []);

  const handleOpenClanCoatOfArms = useCallback((clan: ClanInfo) => {
    setCoatOfArmsModalClan(clan);
  }, []);

  const handleOpenPersonSuggestions = useCallback((id: string) => {
    setSelectedPersonId(id);
    setIsSidebarOpen(true);
  }, []);

  const handleOpenLineConnection = useCallback((connId: string) => {
    setEditingConnectionId(connId);
  }, []);

  const handleEditBranchLink = useCallback((sourceId: string, linkId: string) => {
    setEditingBranchLinkTarget({ sourceId, linkId });
  }, []);

  const handleCloseMiniMap = useCallback(() => {
    setShowMiniMap(false);
  }, []);

  const handleSaveArchiveRegistry = useCallback(
    (entries: ArchiveSourceEntry[]) => {
      if (!isAdmin) return;
      pushHistorySnapshot(tree);
      setTree((prev) => ({
        ...prev,
        archiveRegistry: entries,
        updatedAt: new Date().toISOString(),
      }));
      logUser(`Оновлено архівний реєстр документів (записів: ${entries.length})`);
      showToast({
        type: 'success',
        title: 'Список документів оновлено',
        message: `Збережено записів: ${entries.length}.`,
      });
    },
    [isAdmin, tree, pushHistorySnapshot, setTree, showToast]
  );

  const handleSubmitGuestSuggestion = useCallback(
    async (payload: {
      personId: string;
      category: GuestSuggestionCategory;
      message: string;
      authorName: string;
      suggestedFields?: GuestSuggestion['suggestedFields'];
    }) => {
      const target = treeRef.current.persons[payload.personId];
      if (!target) return;

      const suggestion: GuestSuggestion = {
        id: `gs-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        category: payload.category,
        message: payload.message,
        suggestedFields: payload.suggestedFields,
        authorUserId: currentUser ? currentUser.uid : guestUserId,
        authorName: payload.authorName.trim() || getResolvedDisplayName(),
        authorEmail: currentUser?.email || undefined,
        createdAt: new Date().toISOString(),
        status: 'pending',
      };

      const nextTree = applyAddGuestSuggestion(treeRef.current, payload.personId, suggestion);
      isUndoActionRef.current = true;
      treeRef.current = nextTree;
      setTree(nextTree);
      saveTreeLocally(nextTree, false);
      setGuestSuggestionTarget(null);

      let isLocalOnly = false;
      if (!isAdminRef.current) {
        const res = await submitGuestSuggestionToServer(nextTree.id || 'my-family-tree', {
          kind: 'note',
          personId: payload.personId,
          suggestion,
        });
        if (!res.ok) {
          showToast({
            type: 'warning',
            title: 'Збережено локально',
            message: res.error || 'Не вдалося зберегти уточнення.',
          });
          return;
        }
        isLocalOnly = Boolean(res.localOnly);
        if (res.updatedAt) {
          const syncedTree: FamilyTreeData = { ...treeRef.current, updatedAt: res.updatedAt };
          isUndoActionRef.current = true;
          treeRef.current = syncedTree;
          setTree(syncedTree);
          saveTreeLocally(syncedTree, false);
        }
      }

      logUser(`Гість надіслав уточнення до картки «${target.firstName} ${target.lastName}»`, {
        personId: payload.personId,
        category: payload.category,
        localOnly: isLocalOnly,
      });
      showToast({
        type: 'success',
        title: isLocalOnly ? 'Нотатку збережено локально' : 'Нотатку / уточнення збережено',
        message: isLocalOnly
          ? `Повідомлення до картки «${[target.firstName, target.lastName].filter(Boolean).join(' ')}» збережено локально у вашому браузері.`
          : `Повідомлення до картки «${[target.firstName, target.lastName].filter(Boolean).join(' ')}» збережено.`,
      });
    },
    [currentUser, guestUserId, getResolvedDisplayName, setTree, showToast]
  );

  const handleSubmitProposeRelative = useCallback(
    async (data: {
      relationType: ProposableRelationType;
      firstName: string;
      lastName: string;
      maidenName?: string;
      gender: 'male' | 'female' | 'unknown';
      birthYear?: string;
      birthDate?: string;
      isDeceased?: boolean;
      deathYear?: string;
      birthPlace?: string;
      residencePlace?: string;
      note?: string;
      authorName: string;
    }) => {
      if (!proposeRelativeTarget) return;
      const currentTree = treeRef.current;
      const target = currentTree.persons[proposeRelativeTarget.id];
      if (!target) return;

      const mappedRelationType: RelativeType =
        data.relationType === 'father' || data.relationType === 'mother'
          ? 'parent'
          : data.relationType === 'brother' || data.relationType === 'sister'
            ? 'sibling'
            : data.relationType;

      const resolvedAuthor = data.authorName.trim() || getResolvedDisplayName();
      const proposalMeta: ProposalCardMeta = {
        targetPersonId: target.id,
        relationType: data.relationType,
        authorUserId: currentUser ? currentUser.uid : guestUserId,
        authorName: resolvedAuthor,
        authorEmail: currentUser?.email || undefined,
        note: data.note?.trim() || undefined,
        createdAt: new Date().toISOString(),
      };

      const relativeInput: AddRelativeInput = {
        relationType: mappedRelationType,
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        maidenName: data.maidenName?.trim() || undefined,
        gender: data.gender,
        birthYear: data.birthYear?.trim() || undefined,
        birthDate: data.birthDate?.trim() || undefined,
        isDeceased: data.isDeceased,
        deathYear: data.deathYear?.trim() || undefined,
        birthPlace: data.birthPlace?.trim() || undefined,
        residencePlace: data.residencePlace?.trim() || undefined,
        notes: data.note?.trim()
          ? `[Пропозиція гостя ${resolvedAuthor}]: ${data.note.trim()}`
          : undefined,
      };

      const { nextTree, proposalPerson } = applyCreateProposalRelative(
        currentTree,
        target,
        relativeInput,
        proposalMeta,
        startYear
      );

      const connectionOverridesPatch: Record<string, ConnectionMeta> = {};
      Object.entries(nextTree.connectionOverrides || {}).forEach(([k, v]) => {
        if (k.includes(proposalPerson.id) && v) {
          connectionOverridesPatch[k] = v;
        }
      });

      const linkedAsSiblingOf = Object.keys(nextTree.persons).filter(
        (pid) =>
          pid !== proposalPerson.id &&
          nextTree.persons[pid]?.siblings?.includes(proposalPerson.id) &&
          !currentTree.persons[pid]?.siblings?.includes(proposalPerson.id)
      );

      isUndoActionRef.current = true;
      treeRef.current = nextTree;
      setTree(nextTree);
      saveTreeLocally(nextTree, false);
      setProposeRelativeTarget(null);
      setSelectedPersonId(proposalPerson.id);
      setIsSidebarOpen(true);

      setPulsingBranchTargetId(proposalPerson.id);
      if (branchJumpPulseTimerRef.current !== null) {
        window.clearTimeout(branchJumpPulseTimerRef.current);
      }
      branchJumpPulseTimerRef.current = window.setTimeout(() => {
        setPulsingBranchTargetId(null);
      }, 2200);

      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setViewport((prevVp) => ({
          ...prevVp,
          x: rect.width / 2 - (proposalPerson.x + CARD_WIDTH / 2) * prevVp.zoom,
          y: rect.height / 2 - (proposalPerson.y + CARD_HEIGHT / 2) * prevVp.zoom,
        }));
      }

      let isLocalOnly = false;
      if (!isAdminRef.current) {
        const res = await submitGuestSuggestionToServer(currentTree.id || 'my-family-tree', {
          kind: 'proposal-card',
          proposalPerson,
          targetPersonId: target.id,
          linkedAsChildOf: proposalPerson.parents || [],
          linkedAsParentOf: proposalPerson.children || [],
          linkedAsSpouseOf: proposalPerson.spouses || [],
          linkedAsSiblingOf,
          connectionOverridesPatch:
            Object.keys(connectionOverridesPatch).length > 0 ? connectionOverridesPatch : undefined,
        });
        if (!res.ok) {
          showToast({
            type: 'warning',
            title: 'Картку створено локально',
            message: res.error || 'Не вдалося зберегти пропозицію.',
          });
          return;
        }
        isLocalOnly = Boolean(res.localOnly);
        if (res.updatedAt) {
          const syncedTree: FamilyTreeData = { ...treeRef.current, updatedAt: res.updatedAt };
          isUndoActionRef.current = true;
          treeRef.current = syncedTree;
          setTree(syncedTree);
          saveTreeLocally(syncedTree, false);
        }
      }

      logUser(`Гість запропонував нового родича: «${proposalPerson.firstName} ${proposalPerson.lastName}»`, {
        proposalPersonId: proposalPerson.id,
        targetPersonId: target.id,
        localOnly: isLocalOnly,
      });
      showToast({
        type: 'success',
        title: isLocalOnly ? 'Картку-пропозицію збережено локально' : 'Картку-пропозицію додано',
        message: isLocalOnly
          ? `«${[proposalPerson.firstName, proposalPerson.lastName].filter(Boolean).join(' ')}» збережено локально у вашому браузері.`
          : `«${[proposalPerson.firstName, proposalPerson.lastName].filter(Boolean).join(' ')}» збережено.`,
      });
    },
    [proposeRelativeTarget, getResolvedDisplayName, currentUser, guestUserId, startYear, setTree, showToast]
  );

  const handleResolveGuestSuggestion = useCallback(
    (personId: string, suggestionId: string, action: 'approve' | 'reject' | 'mark_approved') => {
      if (!isAdmin) return;
      pushHistorySnapshot(tree);
      setTree((prev) => applyResolveGuestSuggestion(prev, personId, suggestionId, action));
      logUser(`Опрацьовано гостьове уточнення (${action})`, { personId, suggestionId });
      showToast({
        type: action === 'reject' ? 'info' : 'success',
        title:
          action === 'approve'
            ? 'Уточнення застосовано'
            : action === 'mark_approved'
              ? 'Уточнення затверджено'
              : 'Уточнення відхилено',
        message:
          action === 'approve'
            ? 'Запропоновані дані та текст додано до картки.'
            : action === 'mark_approved'
              ? 'Позначено як опрацьоване без перезапису полів.'
              : 'Нотатку переміщено до відхилених.',
      });
    },
    [isAdmin, tree, pushHistorySnapshot, setTree, showToast]
  );

  const handleApproveProposalCard = useCallback(
    (personId: string) => {
      if (!isAdmin) return;
      const p = tree.persons[personId];
      if (!p) return;
      pushHistorySnapshot(tree);
      setTree((prev) => applyApproveProposalCard(prev, personId));
      logUser(`Підтверджено картку-пропозицію «${p.firstName} ${p.lastName}»`, { personId });
      showToast({
        type: 'success',
        title: 'Картку-пропозицію підтверджено',
        message: `«${[p.firstName, p.lastName].filter(Boolean).join(' ')}» тепер повноцінна картка дерева.`,
      });
    },
    [isAdmin, tree, pushHistorySnapshot, setTree, showToast]
  );

  const handleDeleteProposalCard = useCallback(
    (personId: string) => {
      if (!isAdmin) return;
      const p = tree.persons[personId];
      pushHistorySnapshot(tree);
      setTree((prev) => applyDeletePerson(prev, personId));
      if (selectedPersonId === personId) {
        setSelectedPersonId(null);
        setIsSidebarOpen(false);
      }
      logUser(`Видалено картку-пропозицію «${p ? `${p.firstName} ${p.lastName}` : personId}»`, { personId });
      showToast({
        type: 'info',
        title: 'Пропозицію видалено',
        message: p
          ? `Картку-пропозицію «${[p.firstName, p.lastName].filter(Boolean).join(' ')}» видалено з полотна.`
          : 'Картку-пропозицію видалено.',
      });
    },
    [isAdmin, tree, selectedPersonId, pushHistorySnapshot, setTree, showToast]
  );

  // Save connection metadata (verified status & archival notes)
  const handleSaveConnectionMeta = (connectionId: string, meta: ConnectionMeta) => {
    setTree((prev) => applySaveConnectionMeta(prev, connectionId, meta));
    logTree('Оновлено параметри родинного зв’язку', { connectionId, verified: meta.verified });
  };

  // Disconnect a couple (dissolve marriage / divorce / cohabitation)
  const handleDisconnectCouple = useCallback(
    (id1: string, id2: string) => {
      if (!isAdmin) return;
      setTree((prev) => applyDisconnectCouple(prev, id1, id2));
      logTree('Розірвано шлюбний зв’язок між картками', { id1, id2 });
    },
    [isAdmin, setTree]
  );

  // Connect two persons manually with credibility and archival citation support
  const handleConnectPersons = (
    targetId: string,
    relationType: RelativeType,
    options?: ConnectOptions
  ) => {
    if (!connectingPerson) return;
    const sourceId = connectingPerson.id;
    setTree((prev) => applyConnectPersons(prev, sourceId, targetId, relationType, options));
    logTree(`Створено родинний зв’язок (${relationType})`, { sourceId, targetId });
  };

  // Create a cross-branch or godparent link (arrow/wavy line reference between two cards)
  const handleConnectBranchLink = useCallback(
    (targetId: string, options: BranchLinkConnectOptions) => {
      if (!connectingPerson) return;
      const sourceId = connectingPerson.id;
      setTree((prev) => applyAddBranchLink(prev, sourceId, targetId, options));
      const targetP = tree.persons[targetId];
      const targetName = targetP ? `${targetP.firstName} ${targetP.lastName}`.trim() : 'картки';
      const isGodparent = options.linkKind === 'godparent';
      logTree(
        isGodparent ? `Додано лінію «Хресний / Хресна» до ${targetName}` : `Створено стрілку-посилання до ${targetName}`,
        { sourceId, targetId, bidirectional: options.bidirectional }
      );
      showToast({
        type: 'success',
        title: isGodparent ? 'Лінію «Хресний / Хресна» додано' : 'Міжгілковий зв’язок створено',
        message: isGodparent
          ? options.bidirectional
            ? `Проведено двосторонню хвилясту лінію до ${targetName}.`
            : `Проведено хвилясту лінію до ${targetName}.`
          : options.bidirectional
          ? `Додано двосторонню стрілку-посилання до ${targetName}.`
          : `Додано стрілку-посилання до ${targetName}.`,
      });
    },
    [connectingPerson, tree.persons, setTree, showToast]
  );

  const handleRemoveBranchLink = useCallback(
    (sourcePersonId: string, linkId: string) => {
      setTree((prev) => applyRemoveBranchLink(prev, sourcePersonId, linkId, false));
      logTree('Видалено стрілку-посилання на полотні', { sourcePersonId, linkId });
    },
    [setTree]
  );

  const totalBranchLinksCount = useMemo(() => {
    let count = 0;
    Object.values(tree.persons).forEach((p) => {
      (p.branchLinks || []).forEach((bl) => {
        if (tree.persons[bl.targetPersonId]) count += 1;
      });
    });
    return count;
  }, [tree.persons]);

  const handleJumpToBranchLink = useCallback(
    (targetPersonId: string, sourcePersonId: string) => {
      const sourceP = tree.persons[sourcePersonId];
      const targetP = tree.persons[targetPersonId];
      if (!targetP) return;

      if (sourceP && sourcePersonId !== targetPersonId) {
        const fromName = `${sourceP.firstName} ${sourceP.lastName}`.trim() || 'Попередня картка';
        setBranchJumpReturn({
          fromTreeId: tree.id,
          fromTreeTitle: tree.title,
          fromPersonId: sourcePersonId,
          fromName,
          toPersonId: targetPersonId,
        });
      }

      centerOnPerson(targetPersonId, false);
      setPulsingBranchTargetId(targetPersonId);
      if (branchJumpPulseTimerRef.current !== null) {
        window.clearTimeout(branchJumpPulseTimerRef.current);
      }
      branchJumpPulseTimerRef.current = window.setTimeout(() => {
        setPulsingBranchTargetId(null);
      }, 2400);
    },
    [tree.id, tree.title, tree.persons, centerOnPerson]
  );

  // Jump to a specific card on another canvas (or same canvas) via cross-canvas link
  const handleJumpToCrossCanvasLink = useCallback(
    (targetCanvasId: string, targetPersonId?: string, sourcePersonId?: string) => {
      if (isCanvasLockedGuest && !isSameCanvasId(targetCanvasId, tree.id)) {
        showToast({
          type: 'info',
          title: 'Обмеження гостьового посилання',
          message: 'Це гостьове посилання відкриває лише поточне полотно.',
        });
        return;
      }
      const srcId = sourcePersonId || selectedPersonId || '';
      const srcP = srcId ? tree.persons[srcId] : undefined;
      const fromName = srcP
        ? `${srcP.firstName} ${srcP.lastName}`.trim() || 'Попередня картка'
        : tree.title || 'Попереднє полотно';

      setBranchJumpReturn({
        fromTreeId: tree.id,
        fromTreeTitle: tree.title || 'Попереднє полотно',
        fromPersonId: srcId,
        fromName,
        toPersonId: targetPersonId || '',
      });

      if (isSameCanvasId(targetCanvasId, tree.id)) {
        if (targetPersonId && tree.persons[targetPersonId]) {
          centerOnPerson(targetPersonId, false);
          setPulsingBranchTargetId(targetPersonId);
          if (branchJumpPulseTimerRef.current !== null) {
            window.clearTimeout(branchJumpPulseTimerRef.current);
          }
          branchJumpPulseTimerRef.current = window.setTimeout(() => {
            setPulsingBranchTargetId(null);
          }, 2400);
        }
        return;
      }

      logUser(`Перехід по міжгілковому посиланню на полотно «${targetCanvasId}»`, {
        targetCanvasId,
        targetPersonId,
      });

      if (targetPersonId) {
        pendingPulsePersonIdRef.current = targetPersonId;
      }
      void handleSelectTree(targetCanvasId, targetPersonId);
    },
    [isCanvasLockedGuest, tree.id, tree.title, tree.persons, selectedPersonId, centerOnPerson, handleSelectTree, showToast]
  );

  // Create a cross-canvas link between current card and a card on another canvas
  const handleConnectCrossCanvasLink = useCallback(
    (payload: CrossCanvasConnectPayload) => {
      if (!connectingPerson) return;
      const sourceId = connectingPerson.id;
      const sourceSnapshot = treeRef.current.persons[sourceId] || connectingPerson;
      const currentCanvasId = treeRef.current.id || 'my-family-tree';
      const currentCanvasTitle = treeRef.current.title || 'Головне родове дерево';

      setTree((prev) => {
        const src = prev.persons[sourceId];
        if (!src) return prev;
        const nextLinks = upsertCrossCanvasLinkList(src.crossCanvasLinks, {
          targetCanvasId: normalizeCanvasId(payload.targetCanvasId),
          targetCanvasTitle: payload.targetCanvasTitle,
          targetPersonId: payload.targetPersonId,
          targetPersonName: payload.targetPersonName,
          targetCardId: payload.targetCardId,
          label: payload.label,
          color: payload.color,
        });
        return {
          ...prev,
          updatedAt: new Date().toISOString(),
          persons: {
            ...prev.persons,
            [sourceId]: {
              ...src,
              crossCanvasLinks: nextLinks,
            },
          },
        };
      });

      logTree(
        `Створено міжгілковий зв’язок до полотна «${payload.targetCanvasTitle}» (${payload.targetCardId} ${payload.targetPersonName})`,
        {
          sourceCanvasId: currentCanvasId,
          sourcePersonId: sourceId,
          targetCanvasId: payload.targetCanvasId,
          targetPersonId: payload.targetPersonId,
          bidirectional: payload.bidirectional,
        },
        'success'
      );

      if (payload.bidirectional) {
        void createReciprocalCrossCanvasLinkOnTargetTree({
          sourceTreeId: currentCanvasId,
          sourceTreeTitle: currentCanvasTitle,
          sourcePerson: sourceSnapshot,
          targetCanvasId: payload.targetCanvasId,
          targetPersonId: payload.targetPersonId,
          label: payload.label,
          color: payload.color,
        }).then((ok) => {
          refreshCrossCanvasIndex();
          if (!ok) {
            showToast({
              type: 'warning',
              title: 'Посилання створено на цьому полотні',
              message: 'Не вдалося автоматично додати зворотне посилання на цільовому полотні.',
            });
          }
        });
      } else {
        refreshCrossCanvasIndex();
      }

      showToast({
        type: 'success',
        title: 'Міжгілковий зв’язок створено',
        message: `З’єднано з полотном «${payload.targetCanvasTitle}» (${payload.targetCardId} ${payload.targetPersonName}).`,
      });
    },
    [connectingPerson, treeRef, setTree, refreshCrossCanvasIndex, showToast]
  );

  const handleRemoveCrossCanvasLink = useCallback(
    (personId: string, linkId: string) => {
      logTree('Видалено міжгілкове посилання з картки', { personId, linkId });
      setTree((prev) => {
        const p = prev.persons[personId];
        if (!p) return prev;
        return {
          ...prev,
          updatedAt: new Date().toISOString(),
          persons: {
            ...prev.persons,
            [personId]: removeCrossCanvasLinkFromPerson(p, linkId),
          },
        };
      });
    },
    [setTree]
  );

  // Toggle relation verification between two persons
  const handleToggleRelationVerification = (personId: string, relativeId: string) => {
    setTree((prev) => applyToggleRelationVerification(prev, personId, relativeId));
  };

  // Batch update verification status for selected connections
  const handleBatchSetConnectionStatus = useCallback(
    (connectionIds: string[], verified: boolean) => {
      if (connectionIds.length === 0) return;
      setTree((prev) => applyBatchConnectionsVerification(prev, connectionIds, verified));
      logTree(
        `Пакетна зміна статусу зв’язків (${connectionIds.length}): ${
          verified ? 'Перевірені' : 'Неперевірені'
        }`,
        { count: connectionIds.length, verified }
      );
      showToast({
        type: 'success',
        title: verified ? 'Зв’язки позначено перевіреними' : 'Зв’язки позначено неперевіреними',
        message: `Оновлено ${connectionIds.length} зв’язків (${
          verified ? 'суцільні лінії' : 'пунктирні лінії'
        }).`,
      });
    },
    [setTree, showToast]
  );


  // Toggle chronological pin status for a person
  const handleToggleChronologicalPin = useCallback(
    (personId: string) => {
      setTree((prev) => {
        const p = prev.persons[personId];
        if (!p) return prev;

        const nextPinned = !p.isChronologicallyPinned;
        let targetY = p.y;
        if (nextPinned) {
          const birthYr = extractBirthYear(p);
          if (birthYr) {
            targetY = yearToY(birthYr, startYear, DEFAULT_PIXELS_PER_YEAR);
          }
        }

        return {
          ...prev,
          persons: {
            ...prev.persons,
            [personId]: {
              ...p,
              y: targetY,
              isChronologicallyPinned: nextPinned,
            },
          },
        };
      });
    },
    [startYear, setTree]
  );

  // Delete person
  const handleDeletePerson = (id: string) => {
    const p = treeRef.current.persons[id];
    logTree(`Видалено картку особи «${p ? `${p.firstName} ${p.lastName}`.trim() : id}»`, { id });
    setTree((prev) => applyDeletePerson(prev, id));
    if (selectedPersonId === id) {
      setSelectedPersonId(null);
      setIsSidebarOpen(false);
    }
  };

  // Save edited person
  const handleSavePerson = (updated: Person) => {
    const prevPerson = treeRef.current.persons[updated.id];
    setTree((prev) => applySavePerson(prev, updated, startYear));
    logTree(`Збережено зміни в картці «${[updated.firstName, updated.lastName].filter(Boolean).join(' ')}»`, {
      personId: updated.id,
      crossCanvasLinksCount: updated.crossCanvasLinks?.length || 0,
    });
    void syncReciprocalCrossCanvasLinksOnSave(
      treeRef.current.id || 'my-family-tree',
      treeRef.current.title || 'Головне родове дерево',
      prevPerson,
      updated
    )
      .then(() => refreshCrossCanvasIndex())
      .catch(() => {});
  };


  fitToContentRef.current = fitToContent;

  // Center viewport on the user's card or first record in the tree
  const handleCenterOnFirstPerson = useCallback(() => {
    const targetPersonId =
      (userPersonId && tree.persons[userPersonId] ? userPersonId : null) ||
      (selectedPersonId && tree.persons[selectedPersonId] ? selectedPersonId : null) ||
      Object.keys(tree.persons)[0];

    if (targetPersonId) {
      centerOnPerson(targetPersonId);
    } else {
      fitToContent();
    }
  }, [userPersonId, selectedPersonId, tree.persons, centerOnPerson, fitToContent]);

  // Load the fictional example tree
  const handleLoadDemo = () => {
    setConfirmDialog({
      title: 'Завантажити приклад дерева?',
      description: 'На поточному полотні буде відкрито демонстраційне родове дерево.',
      confirmLabel: 'Завантажити',
      variant: 'default',
      onConfirm: () => {
        setConfirmDialog(null);
        hasCenteredTreeIdRef.current = null;
        setTree(sampleTreeData);
        setSelectedPersonId(sampleTreeData.selectedPersonId ?? null);
        setTimeout(fitToContent, 100);
      },
    });
  };

  // Quick Load JSON file from computer
  const handleLoadJson = async (file: File) => {
    if (!isAdmin) {
      showToast({
        type: 'warning',
        title: 'Необхідні права адміністратора',
        message: 'Імпорт файлів доступний лише в режимі адміністратора.',
      });
      return;
    }
    setDraggedJsonFile(file);
    setIsImportModalOpen(true);
  };

  // Clipboard buffer hook (copy/paste cards across canvases + Ctrl+C / Ctrl+V / Esc)
  const {
    clipboardCount,
    handleCopySelectedPersons,
    handlePasteCopiedBuffer,
    handleCancelCopyClipboard,
  } = useTreeClipboard({
    tree,
    setTree,
    viewport,
    selectedPersonIds,
    setSelectedPersonIds,
    setSelectedPersonId,
    showToast,
  });

  // Tree validation summary (chronological, parent age, marriage, and graph integrity checks - Admin only, settled outside drag)
  const validationSummary = useMemo(
    () =>
      isAdmin
        ? validateFamilyTree(settledTree)
        : { issues: [], errorCount: 0, warningCount: 0, fixableStructureCount: 0 },
    [isAdmin, settledTree]
  );

  const handleAutoFixStructure = useCallback(() => {
    setTree((prev) => fixBrokenReciprocalLinks(prev));
    logTree('Виконано автовиправлення пошкоджених зв’язків дерева');
    showToast({
      type: 'success',
      title: 'Зв’язки виправлено',
      message: 'Відновлено симетрію родинних зв’язків та очищено пошкоджені посилання.',
    });
  }, [setTree, showToast]);

  // Export handlers
  const handleExportPng = async () => {
    try {
      await downloadTreePngFile(tree);
      logUser(`Експортовано полотно «${tree.title}» у PNG`);
      showToast({
        type: 'success',
        title: 'Зображення збережено',
        message: 'Файл PNG високої чіткості завантажено.',
      });
    } catch (err) {
      logError('user', 'Помилка експорту PNG', err);
      showToast({
        type: 'error',
        title: 'Помилка створення PNG',
        message: (err as Error).message,
      });
    }
  };

  const handleExportSvg = async () => {
    try {
      await downloadTreeSvgFile(tree);
      logUser(`Експортовано полотно «${tree.title}» у SVG`);
      showToast({
        type: 'success',
        title: 'Векторний файл збережено',
        message: 'Файл SVG для широкоформатного друку завантажено.',
      });
    } catch (err) {
      logError('user', 'Помилка експорту SVG', err);
      showToast({
        type: 'error',
        title: 'Помилка експорту SVG',
        message: (err as Error).message,
      });
    }
  };

  const handlePreparedSvgChange = useCallback((prepared: PreparedPrintTree | null) => {
    setPreparedPrintTree(prepared);
  }, []);

  const isMainTree = !tree.id || tree.id === 'my-family-tree' || tree.id === 'main-tree' || tree.id === 'default-tree';

  return (
    <>
    <div className="no-print h-screen w-screen flex flex-col overflow-hidden bg-[#f8faf8] dark:bg-[#111315] select-none animate-in fade-in duration-700 ease-out">
      {/* 1. Top Navbar */}
      <TopNavbar
        isAdmin={isAdmin}
        onToggleAdminRole={handleToggleAdminRole}
        onOpenVersionModal={isAdmin ? () => setIsVersionModalOpen(true) : undefined}
        currentTreeTitle={tree.title || (isMainTree ? 'Головне дерево' : 'Родове полотно')}
        currentTreeId={tree.id || 'my-family-tree'}
        treeVersion={tree.version || 'v0.1'}
        onUpdateVersion={handleUpdateVersion}
        isVersionModalOpen={isVersionModalOpen}
        onCloseVersionModal={() => setIsVersionModalOpen(false)}
        isMainTree={isMainTree}
        onReturnToMainTree={() => handleSelectTree('my-family-tree')}
        onSelectTree={handleSelectTree}
        onCreateNewTree={handleCreateNewTree}
        onRenameTree={handleRenameTree}
        onDeleteTree={handleDeleteTree}
        onExportImage={() => setIsExportModalOpen(true)}
        personCount={personCount}
        generationCount={generationCount}
        onSyncNow={handleUnifiedSync}
        onRestoreFromCloud={handleRestoreFromCloud}
        lastSavedTime={lastSavedTime}
        syncStatus={syncStatus}
        isServerConnected={isServerConnected}
        isFirebaseSyncing={isFirebaseSyncing}
        firebaseSyncMode={firebaseSyncMode}
        lastFirebaseSyncTime={lastFirebaseSyncTime}
        hasUnsyncedFirebaseChanges={hasUnsyncedFirebaseChanges}
        onOpenOverview={(tab) => setOverviewModalTab(!isAdmin ? 'stats' : tab)}
        onOpenReactionsModal={() => setIsReactionsModalOpen(true)}
        totalReactionsCount={totalReactionsCount}
        isCalendarOpen={isCalendarOpen}
        onToggleCalendar={() => {
          setIsCalendarOpen((prev) => !prev);
          if (!isCalendarOpen) {
            setIsSidebarOpen(false);
          }
        }}
        onOpenShortcutsModal={() => setIsShortcutsModalOpen(true)}
        userPersonName={isStrictReadOnlyGuest ? null : userPersonName}
        onOpenUserIdentity={isStrictReadOnlyGuest ? undefined : () => setIsUserIdentityModalOpen(true)}
        onOpenGuestCustomize={
          !isStrictReadOnlyGuest &&
          userPersonId &&
          tree.persons[userPersonId] &&
          !tree.persons[userPersonId].isBlankScreenshot
            ? () => setCustomizePersonTarget(tree.persons[userPersonId])
            : undefined
        }
        onOpenImportModal={() => {
          setDraggedJsonFile(null);
          setIsImportModalOpen(true);
        }}
        onLoadJsonFile={handleLoadJson}
        onOpenLogs={() => setIsLogsModalOpen(true)}
        isDark={isDark}
        onToggleTheme={handleToggleTheme}
        validationIssueCount={validationSummary.issues.length}
        validationErrorCount={validationSummary.errorCount}
        archiveGapCount={isAdmin && archiveReport ? archiveReport.personsWithGapsCount : 0}
        onOpenGuestFeedback={
          isAdmin
            ? () => {
                setGuestFeedbackInitialTab('suggestions');
                setIsGuestFeedbackOpen(true);
              }
            : undefined
        }
        pendingGuestFeedbackCount={isAdmin ? pendingGuestFeedbackCount : 0}
        onOpenGuestShare={
          isAdmin
            ? () => {
                setGuestShareInitialTreeId(tree.id || 'my-family-tree');
                setIsGuestShareModalOpen(true);
              }
            : undefined
        }
        isGuestShareActive={isGuestShareActive}
        guestShareReadOnly={isStrictReadOnlyGuest}
        lockedSingleCanvas={isCanvasLockedGuest}
        canExitGuestPreview={canExitGuestPreview}
        onExitGuestPreview={handleExitGuestPreview}
      />

      {/* 2. Interactive Canvas Container */}
      <div
        ref={containerRef}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDoubleClick={handleCanvasDoubleClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onDragOver={(e) => {
          if (!isAdmin) return;
          if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault();
            setIsDraggingFileOnCanvas(true);
          }
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setIsDraggingFileOnCanvas(false);
          }
        }}
        onDrop={(e) => {
          if (!isAdmin) return;
          setIsDraggingFileOnCanvas(false);
          const dropped = e.dataTransfer.files?.[0];
          if (!dropped) return;
          if (dropped.name.endsWith('.json') || dropped.type.includes('json')) {
            e.preventDefault();
            setDraggedJsonFile(dropped);
            setIsImportModalOpen(true);
            return;
          }
          if (dropped.type.startsWith('image/')) {
            e.preventDefault();
            if (dropped.type.toLowerCase().includes('svg') || /\.svg$/i.test(dropped.name)) {
              showToast({
                type: 'warning',
                title: 'Формат не підтримується',
                message: 'З міркувань безпеки SVG-файли заборонені. Використовуйте PNG, JPG, WebP або GIF.',
              });
              return;
            }
            let dropCoords: { x: number; y: number } | null = null;
            if (containerRef.current) {
              const rect = containerRef.current.getBoundingClientRect();
              const vp = liveViewportRef.current;
              dropCoords = {
                x: Math.round((e.clientX - rect.left - vp.x) / vp.zoom - CARD_WIDTH / 2),
                y: Math.round((e.clientY - rect.top - vp.y) / vp.zoom - CARD_HEIGHT / 2),
              };
            }
            void handleCreatePhotoCardFromFile(dropped, dropCoords);
          }
        }}
        className={`flex-1 relative overflow-hidden cursor-grab active:cursor-grabbing bg-[#f8faf8] dark:bg-[#111315] ${
          showCanvasGrid ? 'canvas-grid-pattern' : ''
        } touch-none`}
      >
        {/* Full-canvas Drag & Drop Overlay for Admin */}
        {isDraggingFileOnCanvas && isAdmin && (
          <div className="absolute inset-0 bg-emerald-950/70 z-50 flex flex-col items-center justify-center p-6 backdrop-blur-xs text-white pointer-events-none animate-in fade-in duration-150">
            <div className="w-20 h-20 rounded-3xl bg-emerald-500/20 border-2 border-emerald-400 border-dashed flex items-center justify-center mb-4">
              <Upload size={38} className="text-emerald-300 animate-bounce" />
            </div>
            <h3 className="text-xl font-bold">Відпустіть фото (скріншот) або .json тут</h3>
            <p className="text-sm text-emerald-200 mt-1 max-w-md text-center">
              Зображення створить нову картку-фото на полотні, а файл .json імпортує дерево
            </p>
          </div>
        )}
        {/* Left Sticky Chronological Timeline Ruler */}
        {showTimeline && (
          <TimelineRuler
            ticks={timelineTicks}
            viewportY={viewport.y}
            zoom={viewport.zoom}
            trackRef={timelineTrackRef}
          />
        )}

        {/* Transformable Canvas Layer */}
        <div
          ref={canvasLayerRef}
          style={{
            transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0px) scale(${viewport.zoom})`,
            transformOrigin: '0 0',
            willChange: isPanning || draggingCard ? 'transform' : 'auto',
            position: 'absolute',
            top: 0,
            left: 0,
            width: '12000px',
            height: '12000px',
            pointerEvents: isPanning ? 'none' : 'auto',
          }}
        >
          {/* Horizontal Year Guidelines across canvas */}
          {showTimeline && (
            <CanvasTimelineGuidelines
              ticks={timelineTicks}
              selectedPerson={selectedPerson}
              allPersons={tree.persons}
            />
          )}

          {/* Connection Lines (Orthogonal SVG under cards, culled with visibleBounds) */}
          <TreeConnections
            connections={connections}
            onLineClick={isAdmin ? handleOpenLineConnection : undefined}
            hoveredPersonId={hoveredPersonId}
            selectedPersonId={selectedPersonId}
            visibleBounds={visibleBounds}
            isDark={isDark}
          />

          {/* Cross-Branch Links Curved/Straight Arrows Overlay */}
          <BranchLinksOverlay
            persons={tree.persons}
            connectionOverrides={tree.connectionOverrides}
            renderUnits={renderUnits}
            visibleBounds={visibleBounds}
            showAll={true}
            hoveredPersonId={hoveredPersonId}
            selectedPersonId={selectedPersonId}
            hoveredBranchLink={hoveredBranchLink}
            onHoverBranchLink={setHoveredBranchLink}
            onJumpToBranchLink={handleJumpToBranchLink}
            isAdmin={isAdmin}
            onEditBranchLink={handleEditBranchLink}
            isDark={isDark}
          />

          {/* Married Couples (Virtualised via Spatial Hash Grid O(K)) */}
          {visibleRenderUnits.couples.map((couple) => {
            const p1 = couple.person1;
            const p2 = couple.person2;

            const clan1 = getClanName(p1);
            const clan2 = getClanName(p2);
            const clanInfo1 = clanMap.get(clan1);
            const clanInfo2 = clanMap.get(clan2);

            const isHouseDimmed1 = highlightedHouseNumber !== null && p1.houseNumber !== highlightedHouseNumber;
            const isHouseDimmed2 = highlightedHouseNumber !== null && p2.houseNumber !== highlightedHouseNumber;

            const isClanDimmed1 = selectedClanFilter !== null && clan1 !== selectedClanFilter;
            const isClanDimmed2 = selectedClanFilter !== null && clan2 !== selectedClanFilter;

            const isDimmed1 = Boolean(
              isHouseDimmed1 ||
                isClanDimmed1 ||
                (isAdmin && blindSpotFilter !== 'off' && !blindSpotHighlightedIds.has(p1.id))
            );
            const isDimmed2 = Boolean(
              isHouseDimmed2 ||
                isClanDimmed2 ||
                (isAdmin && blindSpotFilter !== 'off' && !blindSpotHighlightedIds.has(p2.id))
            );

            const mKey = [p1.id, p2.id].sort().join('::');
            const marriageMeta = tree.connectionOverrides?.[`marriage:${mKey}`];

            return (
              <CoupleCard
                key={couple.id}
                person1={p1}
                person2={p2}
                isSelected1={selectedPersonId === p1.id}
                isSelected2={selectedPersonId === p2.id}
                isGroupSelected1={selectedPersonIds.has(p1.id)}
                isGroupSelected2={selectedPersonIds.has(p2.id)}
                onSwapSpouses={isAdmin ? handleSwapSpouses : undefined}
                onDisconnectCouple={isAdmin ? handleDisconnectCouple : undefined}
                isConnectingSource1={connectingMode?.sourceId === p1.id}
                isConnectingSource2={connectingMode?.sourceId === p2.id}
                isConnectingTarget1={connectingMode?.targetId === p1.id}
                isConnectingTarget2={connectingMode?.targetId === p2.id}
                isDimmed1={isDimmed1}
                isDimmed2={isDimmed2}
                clanInfo1={clanInfo1}
                clanInfo2={clanInfo2}
                clanMap={clanRecord}
                marriageMeta={marriageMeta}
                onMarriageClick={isAdmin ? handleOpenMarriageConnection : undefined}
                isSimplified={viewport.zoom < 0.48}

                onSelect={handleSelectPerson}
                onHighlightHouse={handleHighlightHouse}
                onEdit={isAdmin ? handleEditPerson : handleGuestDoubleClickCard}
                onToggleChronologicalPin={isAdmin ? handleToggleChronologicalPin : undefined}
                onToggleFullyVerified={isAdmin ? handleToggleFullyVerified : undefined}
                onDragStart={isAdmin && !isLayoutLocked ? handleCardDragStart : undefined}
                onLongPress={isAdmin ? handleCardLongPress : undefined}
                onToggleReaction={isStrictReadOnlyGuest ? undefined : handleToggleReaction}
                guestUserId={guestUserId}
                onHoverPerson={setHoveredPersonId}
                isCurrentUser1={userPersonId === p1.id}
                isCurrentUser2={userPersonId === p2.id}
                userPersonId={userPersonId}
                onOpenClanCoatOfArmsModal={handleOpenClanCoatOfArms}
                onOpenMetricModal={handleOpenMetricModal}
                isAdmin={isAdmin}
                onSelectTree={handleJumpToCrossCanvasLink}
                allPersons={tree.persons}
                onJumpToBranchLink={handleJumpToBranchLink}
                onHoverBranchLink={setHoveredBranchLink}
                isBranchLinkHighlighted1={
                  pulsingBranchTargetId === p1.id ||
                  hoveredBranchLink?.targetId === p1.id
                }
                isBranchLinkHighlighted2={
                  pulsingBranchTargetId === p2.id ||
                  hoveredBranchLink?.targetId === p2.id
                }
                isBlindSpotHighlighted1={isAdmin && blindSpotFilter !== 'off' && blindSpotHighlightedIds.has(p1.id)}
                isBlindSpotHighlighted2={isAdmin && blindSpotFilter !== 'off' && blindSpotHighlightedIds.has(p2.id)}
                onOpenPersonSuggestions={handleOpenPersonSuggestions}
                onOpenBlankScreenshotLightbox={handleOpenBlankScreenshotLightbox}
              />
            );
          })}

          {/* Single Person Cards (Virtualised via Spatial Hash Grid O(K)) */}
          {visibleRenderUnits.singles.map((person) => {

            const clan = getClanName(person);
            const clanInfo = clanMap.get(clan);

            // House filter dimming
            const isHouseDimmed = highlightedHouseNumber !== null && person.houseNumber !== highlightedHouseNumber;

            // Clan filter dimming
            const isClanDimmed = selectedClanFilter !== null && clan !== selectedClanFilter;

            const isDimmed = Boolean(
              isHouseDimmed ||
                isClanDimmed ||
                (isAdmin && blindSpotFilter !== 'off' && !blindSpotHighlightedIds.has(person.id))
            );

            return (
              <FamilyCard
                key={person.id}
                person={person}
                isSelected={selectedPersonId === person.id}
                isGroupSelected={selectedPersonIds.has(person.id)}
                isConnectingSource={connectingMode?.sourceId === person.id}
                isConnectingTarget={connectingMode?.targetId === person.id}
                isDimmed={isDimmed}
                clanInfo={clanInfo}
                isSimplified={viewport.zoom < 0.48}
                onSelect={handleSelectPerson}
                onHighlightHouse={handleHighlightHouse}
                onEdit={isAdmin ? handleEditPerson : handleGuestDoubleClickCard}
                onToggleChronologicalPin={isAdmin ? handleToggleChronologicalPin : undefined}
                onToggleFullyVerified={isAdmin ? handleToggleFullyVerified : undefined}
                onDragStart={isAdmin && !isLayoutLocked ? handleCardDragStart : undefined}
                onLongPress={isAdmin ? handleCardLongPress : undefined}
                onToggleReaction={isStrictReadOnlyGuest ? undefined : handleToggleReaction}
                guestUserId={guestUserId}
                onHoverPerson={setHoveredPersonId}
                isCurrentUser={userPersonId === person.id}
                userPersonId={userPersonId}
                onOpenClanCoatOfArmsModal={handleOpenClanCoatOfArms}
                onOpenMetricModal={handleOpenMetricModal}
                isAdmin={isAdmin}
                onSelectTree={handleJumpToCrossCanvasLink}
                allPersons={tree.persons}
                onJumpToBranchLink={handleJumpToBranchLink}
                onHoverBranchLink={setHoveredBranchLink}
                isBranchLinkHighlighted={
                  pulsingBranchTargetId === person.id ||
                  hoveredBranchLink?.targetId === person.id
                }
                isBlindSpotHighlighted={isAdmin && blindSpotFilter !== 'off' && blindSpotHighlightedIds.has(person.id)}
                onOpenPersonSuggestions={handleOpenPersonSuggestions}
                onUploadBlankScreenshot={isAdmin ? handleUploadBlankScreenshot : undefined}
                onOpenBlankScreenshotLightbox={handleOpenBlankScreenshotLightbox}
              />
            );
          })}

          {/* Interactive Manual Connection Rubberband Overlay */}
          {connectingMode && (() => {
            const sourcePerson = tree.persons[connectingMode.sourceId];
            if (!sourcePerson) return null;
            const targetPerson = connectingMode.targetId ? tree.persons[connectingMode.targetId] : null;

            const startX = sourcePerson.x + CARD_WIDTH / 2;
            const startY = sourcePerson.y + CARD_HEIGHT / 2;
            const endX = targetPerson ? targetPerson.x + CARD_WIDTH / 2 : connectingMode.currentX;
            const endY = targetPerson ? targetPerson.y + CARD_HEIGHT / 2 : connectingMode.currentY;

            const midX = (startX + endX) / 2;
            const pathD = `M ${startX} ${startY} Q ${midX} ${startY - 30} ${endX} ${endY}`;

            return (
              <svg
                className="absolute top-0 left-0 w-full h-full pointer-events-none"
                style={{ overflow: 'visible', zIndex: 45 }}
              >
                <defs>
                  <linearGradient id="connectGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#059669" />
                    <stop offset="100%" stopColor="#047857" />
                  </linearGradient>
                  <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                </defs>

                {/* Outer Glow */}
                <path
                  d={pathD}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="6"
                  strokeOpacity="0.4"
                  filter="url(#glow)"
                />

                {/* Dashed Connection Line */}
                <path
                  d={pathD}
                  fill="none"
                  stroke="url(#connectGradient)"
                  strokeWidth="3.5"
                  strokeDasharray="8,6"
                />

                {/* Source Anchor Pin */}
                <circle cx={startX} cy={startY} r="7" fill="#059669" stroke="#ffffff" strokeWidth="2.5" />

                {/* End Cursor / Target Anchor */}
                {targetPerson ? (
                  <g transform={`translate(${endX}, ${endY})`}>
                    <circle cx="0" cy="0" r="12" fill="#059669" stroke="#ffffff" strokeWidth="3" opacity="0.9" />
                    <circle cx="0" cy="0" r="6" fill="#ffffff" />
                    <g transform={`translate(0, ${-CARD_HEIGHT / 2 - 16})`}>
                      <rect
                        x="-70"
                        y="-12"
                        width="140"
                        height="24"
                        rx="12"
                        fill="#047857"
                        className="shadow-md"
                      />
                      <text
                        x="0"
                        y="4"
                        textAnchor="middle"
                        fontSize="11"
                        fontWeight="700"
                        fill="#ffffff"
                        className="font-sans"
                      >
                        🔗 З'єднати з {[targetPerson.firstName, targetPerson.lastName].filter(Boolean).join(' ') || 'особою'}
                      </text>
                    </g>
                  </g>
                ) : (
                  <g transform={`translate(${endX}, ${endY})`}>
                    <circle cx="0" cy="0" r="6" fill="#10b981" stroke="#ffffff" strokeWidth="2" />
                  </g>
                )}
              </svg>
            );
          })()}

          {/* Alignment Proposals & Nearest-Card cm Distance Overlay */}
          {draggingCard && dragOverlayRect && (
            <AlignmentGuidesOverlay
              movingRect={dragOverlayRect}
              proposal={alignmentProposal}
              standaloneNearest={dragFreeNearest}
              zoom={viewport.zoom}
              isDark={isDark}
              isFreeDrag={isAltFreeDrag}
            />
          )}
          {!draggingCard && nudgeOverlay && (
            <AlignmentGuidesOverlay
              movingRect={nudgeOverlay.movingRect}
              proposal={nudgeOverlay.proposal}
              standaloneNearest={nudgeOverlay.nearest}
              zoom={viewport.zoom}
              isDark={isDark}
              isNudgeMode
            />
          )}

          {/* Rubberband Selection Box (Marquee rectangle when holding Ctrl) */}
          {selectionBox && (() => {
            const minX = Math.min(selectionBox.startX, selectionBox.currentX);
            const maxX = Math.max(selectionBox.startX, selectionBox.currentX);
            const minY = Math.min(selectionBox.startY, selectionBox.currentY);
            const maxY = Math.max(selectionBox.startY, selectionBox.currentY);
            const width = Math.max(2, maxX - minX);
            const height = Math.max(2, maxY - minY);
            return (
              <div
                style={{
                  position: 'absolute',
                  left: `${minX}px`,
                  top: `${minY}px`,
                  width: `${width}px`,
                  height: `${height}px`,
                  border: '1.5px dashed #059669',
                  backgroundColor: 'rgba(5, 150, 105, 0.12)',
                  pointerEvents: 'none',
                  zIndex: 48,
                  borderRadius: '6px',
                }}
              />
            );
          })()}
        </div>

        {/* Empty Canvas State when there are no cards */}
        {personCount === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-4 z-30">
            <div className="bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md rounded-3xl border border-stone-200/90 dark:border-zinc-800 shadow-2xl p-7 sm:p-8 max-w-md w-full text-center pointer-events-auto space-y-5 animate-in fade-in zoom-in-95 duration-200">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-50 border border-emerald-200/70 dark:bg-emerald-950/60 dark:border-emerald-800/70 flex items-center justify-center text-emerald-700 dark:text-emerald-300 shadow-2xs">
                <FolderTree size={28} strokeWidth={1.75} />
              </div>

              <div>
                <h2 className="text-2xl font-bold text-stone-900 dark:text-zinc-100 font-serif-heritage tracking-tight">
                  Порожнє родове полотно
                </h2>
                <p className="text-xs sm:text-[13px] text-stone-600 dark:text-zinc-400 mt-1.5 leading-relaxed">
                  {isAdmin
                    ? 'Додайте першу особу або імпортуйте готовий файл родоводу, щоб розпочати.'
                    : 'Це полотно ще не заповнене.'}
                </p>
              </div>

              {isAdmin && (
                <div className="pt-1 space-y-3">
                  <button
                    type="button"
                    onClick={() => setAddingRelativeTarget({ target: null, initialType: 'child' })}
                    className="w-full h-11 px-5 rounded-2xl bg-stone-900 hover:bg-stone-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 active:scale-[0.98] text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-md shadow-stone-900/10 transition-all cursor-pointer"
                  >
                    <span>Додати першу особу</span>
                  </button>

                  <div className="space-y-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => setQuickDraftModalState({ mode: 'ghost', coords: null })}
                      className="w-full h-10 px-4 rounded-2xl border border-amber-300 dark:border-amber-800/70 bg-amber-50/90 hover:bg-amber-100 dark:bg-amber-950/30 dark:hover:bg-amber-950/50 text-amber-950 dark:text-amber-200 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      <StickyNote size={15} className="text-amber-600 dark:text-amber-400" />
                      <span>Додати нотатку (стікер)</span>
                    </button>

                    <div className="flex items-center justify-center gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setDraggedJsonFile(null);
                          setIsImportModalOpen(true);
                        }}
                        className="text-xs font-semibold text-stone-600 hover:text-emerald-800 dark:text-zinc-400 dark:hover:text-emerald-400 transition-colors cursor-pointer"
                      >
                        Імпортувати JSON
                      </button>
                      <span className="text-stone-300 dark:text-zinc-700">•</span>
                      <button
                        type="button"
                        onClick={handleLoadDemo}
                        className="text-xs font-semibold text-stone-600 hover:text-emerald-800 dark:text-zinc-400 dark:hover:text-emerald-400 transition-colors cursor-pointer"
                      >
                        Завантажити приклад
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Cross-Branch Links, Ghost Cards & Return Breadcrumb (Top-Left) */}
        {(() => {
          const hasCrossTreeReturn = Boolean(
            branchJumpReturn?.fromTreeId && !isSameCanvasId(branchJumpReturn.fromTreeId, tree.id)
          );
          const hasSameTreeReturn = Boolean(
            branchJumpReturn &&
              (!branchJumpReturn.fromTreeId || isSameCanvasId(branchJumpReturn.fromTreeId, tree.id)) &&
              tree.persons[branchJumpReturn.fromPersonId]
          );
          const canShowReturnBreadcrumb = hasCrossTreeReturn || hasSameTreeReturn;

          if (
            ghostPersons.length === 0 &&
            blankScreenshotPersons.length === 0 &&
            !canShowReturnBreadcrumb &&
            selectedClanFilter === null
          ) {
            return null;
          }

          return (
            <div
              data-hud-tray="true"
              className={`absolute top-4 ${
                showTimeline ? 'left-20' : 'left-4'
              } z-20 flex flex-wrap items-center gap-2 pointer-events-none`}
            >
              {ghostPersons.length > 0 && (
                <div className="relative pointer-events-auto">
                  <button
                    type="button"
                    onClick={() => setOpenHudTray((prev) => (prev === 'ghost' ? null : 'ghost'))}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border shadow-md backdrop-blur-md transition-all cursor-pointer ${
                      openHudTray === 'ghost'
                        ? 'bg-amber-500 text-amber-950 border-amber-600 dark:bg-amber-400 dark:text-zinc-950 dark:border-amber-300'
                        : 'border-amber-300 dark:border-amber-700/80 bg-amber-50/95 dark:bg-zinc-900/95 text-amber-950 dark:text-amber-200 hover:border-amber-400 hover:bg-amber-100 dark:hover:bg-zinc-800'
                    }`}
                    title="Список нотаток (стікерів) на полотні"
                  >
                    <StickyNote size={13.5} className={openHudTray === 'ghost' ? 'text-current' : 'text-amber-600 dark:text-amber-400'} />
                    <span>Нотатки ({ghostPersons.length})</span>
                    <ChevronDown size={12.5} className={`transition-transform ${openHudTray === 'ghost' ? 'rotate-180' : ''}`} />
                  </button>

                  {openHudTray === 'ghost' && (
                    <div className="absolute left-0 top-full mt-2 w-72 sm:w-80 bg-white/98 dark:bg-zinc-900/98 border border-amber-200/90 dark:border-zinc-700/90 rounded-2xl shadow-2xl backdrop-blur-md overflow-hidden z-40 animate-in fade-in slide-in-from-top-1 duration-150">
                      <div className="px-3.5 py-2.5 border-b border-amber-100 dark:border-zinc-800 bg-amber-50/50 dark:bg-amber-950/20 flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                          <StickyNote size={13} />
                          Нотатки ({ghostPersons.length})
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={handleCycleGhostCards}
                            className="px-2 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-amber-900 dark:text-zinc-200 text-[10.5px] font-semibold cursor-pointer transition-colors"
                            title="Переходити по черзі між нотатками"
                          >
                            По колу →
                          </button>
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => {
                                setOpenHudTray(null);
                                handleOpenQuickDraftAtViewportCenter('ghost');
                              }}
                              className="px-2 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-amber-950 text-[10.5px] font-semibold cursor-pointer transition-colors"
                            >
                              + Нова
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="max-h-64 overflow-y-auto divide-y divide-stone-100 dark:divide-zinc-800">
                        {ghostPersons.map((gp) => {
                          const gName = [gp.firstName, gp.lastName].filter(Boolean).join(' ').trim() || 'Нотатка';
                          const gNote = gp.ghostNote || gp.interestingStories || gp.notes || '';
                          return (
                            <button
                              key={gp.id}
                              type="button"
                              onClick={() => {
                                setOpenHudTray(null);
                                centerOnPerson(gp.id, true);
                                setPulsingBranchTargetId(gp.id);
                                if (branchJumpPulseTimerRef.current !== null) {
                                  window.clearTimeout(branchJumpPulseTimerRef.current);
                                }
                                branchJumpPulseTimerRef.current = window.setTimeout(() => {
                                  setPulsingBranchTargetId(null);
                                }, 2200);
                              }}
                              className={`w-full px-3.5 py-2.5 text-left hover:bg-amber-50/70 dark:hover:bg-zinc-800/80 transition-colors cursor-pointer flex items-start gap-2.5 ${
                                selectedPersonId === gp.id ? 'bg-amber-50 dark:bg-zinc-800/90' : ''
                              }`}
                            >
                              <div className="w-7 h-7 rounded-md border border-amber-300 dark:border-amber-700 bg-amber-100 dark:bg-amber-950/60 flex items-center justify-center shrink-0 mt-0.5">
                                <StickyNote size={13} className="text-amber-700 dark:text-amber-400" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-1.5">
                                  <span className="text-xs font-semibold text-stone-900 dark:text-zinc-100 truncate">
                                    {gName}
                                  </span>
                                  {gp.cardId && (
                                    <span className="text-[10px] font-mono text-stone-400 dark:text-zinc-500 shrink-0">
                                      #{gp.cardId}
                                    </span>
                                  )}
                                </div>
                                {gNote ? (
                                  <p className="text-[11px] text-stone-600 dark:text-zinc-400 line-clamp-2 mt-0.5 leading-snug">
                                    {gNote}
                                  </p>
                                ) : (
                                  <p className="text-[10.5px] text-stone-400 dark:text-zinc-500 italic mt-0.5">
                                    Без тексту нотатки
                                  </p>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {blankScreenshotPersons.length > 0 && (
                <div className="relative pointer-events-auto">
                  <button
                    type="button"
                    onClick={() => setOpenHudTray((prev) => (prev === 'photo' ? null : 'photo'))}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border shadow-md backdrop-blur-md transition-all cursor-pointer ${
                      openHudTray === 'photo'
                        ? 'bg-sky-700 text-white border-sky-800'
                        : 'border-sky-300 dark:border-sky-700/80 bg-white/95 dark:bg-zinc-900/95 text-sky-900 dark:text-sky-200 hover:border-sky-500 hover:bg-sky-50/70 dark:hover:bg-zinc-800'
                    }`}
                    title="Список нерозшифрованих карток-фото на полотні"
                  >
                    <ImageIcon size={13.5} className={openHudTray === 'photo' ? 'text-white' : 'text-sky-600 dark:text-sky-400'} />
                    <span>Картки-фото ({blankScreenshotPersons.length})</span>
                    <ChevronDown size={12.5} className={`transition-transform ${openHudTray === 'photo' ? 'rotate-180' : ''}`} />
                  </button>

                  {openHudTray === 'photo' && (
                    <div className="absolute left-0 top-full mt-2 w-72 sm:w-80 bg-white/98 dark:bg-zinc-900/98 border border-sky-200/90 dark:border-zinc-700/90 rounded-2xl shadow-2xl backdrop-blur-md overflow-hidden z-40 animate-in fade-in slide-in-from-top-1 duration-150">
                      <div className="px-3.5 py-2.5 border-b border-stone-100 dark:border-zinc-800 flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-sky-900 dark:text-sky-300 flex items-center gap-1.5">
                          <ImageIcon size={13} />
                          Картки-фото ({blankScreenshotPersons.length})
                        </span>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => {
                              setOpenHudTray(null);
                              handleOpenQuickDraftAtViewportCenter('screenshot');
                            }}
                            className="px-2 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-[10.5px] font-semibold cursor-pointer transition-colors"
                          >
                            + Додати
                          </button>
                        )}
                      </div>
                      <div className="max-h-64 overflow-y-auto divide-y divide-stone-100 dark:divide-zinc-800">
                        {blankScreenshotPersons.map((bp) => {
                          const bName = [bp.firstName, bp.lastName].filter(Boolean).join(' ').trim() || 'Картка-фото';
                          const bNote = bp.ghostNote || bp.notes || '';
                          return (
                            <div
                              key={bp.id}
                              onClick={() => {
                                setOpenHudTray(null);
                                centerOnPerson(bp.id, true);
                                setPulsingBranchTargetId(bp.id);
                                if (branchJumpPulseTimerRef.current !== null) {
                                  window.clearTimeout(branchJumpPulseTimerRef.current);
                                }
                                branchJumpPulseTimerRef.current = window.setTimeout(() => {
                                  setPulsingBranchTargetId(null);
                                }, 2200);
                              }}
                              className={`w-full px-3.5 py-2 text-left hover:bg-sky-50/70 dark:hover:bg-zinc-800/80 transition-colors cursor-pointer flex items-center gap-2.5 ${
                                selectedPersonId === bp.id ? 'bg-sky-50 dark:bg-zinc-800/90' : ''
                              }`}
                            >
                              <div className="w-10 h-10 rounded-lg border border-stone-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 overflow-hidden flex items-center justify-center shrink-0">
                                {bp.screenshotUrl ? (
                                  <img
                                    src={getResolvedMediaSrc(bp.screenshotUrl)}
                                    alt={bName}
                                    onError={(e) => handleUploadImageError(e, bp.screenshotUrl)}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <ImageIcon size={16} className="text-sky-500/70" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-1.5">
                                  <span className="text-xs font-semibold text-stone-900 dark:text-zinc-100 truncate">
                                    {bName}
                                  </span>
                                  <span
                                    className={`text-[10px] font-medium shrink-0 ${
                                      bp.screenshotUrl
                                        ? 'text-emerald-700 dark:text-emerald-400'
                                        : 'text-amber-700 dark:text-amber-400'
                                    }`}
                                  >
                                    {bp.screenshotUrl ? 'Фото є' : 'Порожня'}
                                  </span>
                                </div>
                                {bNote ? (
                                  <p className="text-[11px] text-stone-500 dark:text-zinc-400 truncate mt-0.5">
                                    {bNote}
                                  </p>
                                ) : (
                                  <p className="text-[10.5px] text-stone-400 dark:text-zinc-500 mt-0.5">
                                    {bp.birthYear ? `Рік: ${bp.birthYear}` : 'Очікує розшифрування'}
                                  </p>
                                )}
                              </div>
                              {bp.screenshotUrl && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenHudTray(null);
                                    setCanvasPhotoLightboxPerson(bp);
                                  }}
                                  className="p-1.5 rounded-lg text-stone-500 hover:text-sky-700 hover:bg-sky-100 dark:text-zinc-400 dark:hover:text-sky-300 dark:hover:bg-zinc-700 transition-colors shrink-0 cursor-pointer"
                                  title="Збільшити фото на весь екран"
                                >
                                  <ZoomIn size={14} />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {selectedClanFilter !== null && (
                <div className="pointer-events-auto inline-flex items-center gap-1.5 bg-amber-50/95 dark:bg-zinc-900/95 text-amber-950 dark:text-amber-200 text-xs font-semibold pl-2.5 pr-1.5 py-1.5 rounded-xl shadow-md border border-amber-300/90 dark:border-amber-700/80 backdrop-blur-md animate-in fade-in slide-in-from-left-1 duration-150">
                  <Filter size={12.5} className="text-amber-700 dark:text-amber-400 shrink-0" />
                  <span className="max-w-[200px] truncate">Рід: {selectedClanFilter}</span>
                  <button
                    type="button"
                    onClick={() => setSelectedClanFilter(null)}
                    className="p-0.5 rounded-lg text-amber-700 hover:text-amber-950 hover:bg-amber-200/70 dark:text-amber-300 dark:hover:text-white dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                    title="Скинути фільтр роду"
                  >
                    <CloseIcon size={12} />
                  </button>
                </div>
              )}

              {canShowReturnBreadcrumb && branchJumpReturn && (
                <div className="pointer-events-auto inline-flex items-center gap-1 bg-emerald-950/95 text-white text-xs font-semibold pl-2.5 pr-1.5 py-1.5 rounded-xl shadow-lg border border-emerald-500/50 animate-in fade-in slide-in-from-left-2 duration-150">
                  <button
                    type="button"
                    onClick={() => {
                      const ret = branchJumpReturn;
                      setBranchJumpReturn(null);
                      if (ret.fromTreeId && !isSameCanvasId(ret.fromTreeId, tree.id)) {
                        if (ret.fromPersonId) {
                          pendingPulsePersonIdRef.current = ret.fromPersonId;
                        }
                        void handleSelectTree(ret.fromTreeId, ret.fromPersonId || undefined);
                      } else if (ret.fromPersonId) {
                        centerOnPerson(ret.fromPersonId, false);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 hover:text-emerald-200 transition-colors cursor-pointer"
                    title="Повернутися назад до вихідної картки"
                  >
                    <ArrowLeft size={13} />
                    <span className="max-w-[240px] truncate">
                      {hasCrossTreeReturn
                        ? `Повернутися: ${branchJumpReturn.fromTreeTitle || 'Полотно'} · ${branchJumpReturn.fromName}`
                        : `Повернутися до: ${branchJumpReturn.fromName}`}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setBranchJumpReturn(null)}
                    className="p-0.5 rounded-lg text-emerald-300 hover:text-white hover:bg-emerald-800/70 transition-colors cursor-pointer"
                    title="Сховати"
                  >
                    <CloseIcon size={12} />
                  </button>
                </div>
              )}
            </div>
          );
        })()}

        {/* Connection Mode Top Hint Toast */}
        {connectingMode && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
            <div className="bg-emerald-900/95 text-emerald-50 text-xs font-medium px-4 py-2.5 rounded-full shadow-lg border border-emerald-500/40 flex items-center gap-2.5 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>Режим ручного зв'язку: проведіть лінію до бажаної картки та відпустіть</span>
            </div>
          </div>
        )}

        {/* Floating Nearest Calendar Event Widget */}
        {showCalendarWidget && nearestCalendarEvent && (
          <div className="absolute top-4 right-4 z-20 animate-in fade-in slide-in-from-top-2 duration-200">
            <div
              onClick={() => {
                centerOnPerson(nearestCalendarEvent.person.id);
              }}
              className="bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md rounded-xl border border-stone-200/90 dark:border-zinc-800 shadow-lg p-2.5 sm:p-3 flex items-center gap-3 cursor-pointer hover:border-emerald-400 dark:hover:border-emerald-600 hover:shadow-xl transition-all group max-w-[280px] sm:max-w-[320px]"
              title="Натисніть для переходу до особи на дереві"
            >
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-2xs ${
                  nearestCalendarEvent.daysUntil === 0
                    ? 'bg-amber-500 text-white animate-bounce'
                    : nearestCalendarEvent.type === 'birth'
                    ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300'
                    : 'bg-stone-800 text-stone-100 dark:bg-zinc-800 dark:text-zinc-200'
                }`}
              >
                {nearestCalendarEvent.type === 'birth' ? (
                  <Cake size={18} />
                ) : (
                  <Flame size={18} />
                )}
              </div>

              <div className="min-w-0 flex-1 leading-tight">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 dark:text-zinc-400 flex items-center gap-1 truncate">
                    <span>
                      {nearestCalendarEvent.type === 'birth' ? 'Дн. народження' : 'День пам’яті'}
                    </span>
                  </span>
                  <span
                    className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded shrink-0 ${
                      nearestCalendarEvent.daysUntil === 0
                        ? 'bg-amber-500 text-white'
                        : nearestCalendarEvent.daysUntil === 1
                        ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/70 dark:text-amber-300'
                        : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
                    }`}
                  >
                    {nearestCalendarEvent.daysUntil === 0
                      ? 'Сьогодні'
                      : nearestCalendarEvent.daysUntil === 1
                      ? 'Завтра'
                      : `через ${nearestCalendarEvent.daysUntil} дн.`}
                  </span>
                </div>

                <p className="text-xs font-bold text-stone-900 dark:text-zinc-100 group-hover:text-emerald-900 dark:group-hover:text-emerald-300 truncate mt-0.5">
                  {nearestCalendarEvent.person.firstName} {nearestCalendarEvent.person.lastName}
                </p>

                <p className="text-[10.5px] text-stone-500 dark:text-zinc-400 font-medium truncate mt-0.5">
                  {nearestCalendarEvent.dateStr}
                  {nearestCalendarEvent.ageOrYearsAgo !== undefined && (
                    <span className="text-stone-400 dark:text-zinc-500 font-mono text-[9.5px] ml-1">
                      ({nearestCalendarEvent.type === 'birth' ? `${nearestCalendarEvent.ageOrYearsAgo} р.` : `${nearestCalendarEvent.ageOrYearsAgo} р. тому`})
                    </span>
                  )}
                </p>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowCalendarWidget(false);
                  try {
                    localStorage.setItem('family_tree_show_calendar_widget', 'false');
                  } catch {}
                }}
                className="text-stone-300 hover:text-stone-600 dark:text-zinc-500 dark:hover:text-zinc-200 p-1 rounded-md transition-colors shrink-0"
                title="Сховати віджет з екрану"
              >
                <CloseIcon size={13} />
              </button>
            </div>
          </div>
        )}

        {/* 3. Bottom Controls Toolbar */}
        <CanvasControls
          isAdmin={isAdmin}
          onCenterOnFirstPerson={handleCenterOnFirstPerson}
          showTimeline={showTimeline}
          onToggleTimeline={() => setShowTimeline(!showTimeline)}
          showMiniMap={showMiniMap}
          onToggleMiniMap={() => setShowMiniMap((prev) => !prev)}
          showGrid={showCanvasGrid}
          onToggleGrid={handleToggleCanvasGrid}
          persons={tree.persons}
          onSelectAndCenter={centerOnPerson}
          onUndo={handleUndo}
          canUndo={historyStack.length > 0}
          selectedClanFilter={selectedClanFilter}
          onSelectClanFilter={setSelectedClanFilter}
          clanList={clanList}
          hasUserPerson={!!userPersonId}
          isLayoutLocked={isLayoutLocked}
          onToggleLockLayout={handleToggleLockLayout}
          isSnapEnabled={isSnapEnabled}
          onToggleSnap={handleToggleSnap}
          currentTreeId={tree.id}
          currentTreeTitle={tree.title}
          crossCanvasTrees={crossCanvasTrees}
          onSelectTreeAndPerson={(treeId, personId) => {
            if (isCanvasLockedGuest && !isSameCanvasId(treeId, tree.id)) {
              showToast({
                type: 'info',
                title: 'Обмеження гостьового посилання',
                message: 'Це гостьове посилання відкриває лише поточне полотно.',
              });
              return;
            }
            void handleSelectTree(treeId, personId);
          }}
          onOpenQuickDraft={isAdmin ? () => handleOpenQuickDraftAtViewportCenter('ghost') : undefined}
          blindSpotFilter={isAdmin ? blindSpotFilter : 'off'}
          onChangeBlindSpotFilter={isAdmin ? setBlindSpotFilter : undefined}
          onOpenArchiveRegistry={isAdmin ? () => setOverviewModalTab('archive') : undefined}
        />

        {/* Blocked / Invalid / Disabled / Expired Guest Share Link Overlay */}
        {isGuestShareBlocked && (
          <div className="absolute inset-0 z-40 bg-[#f8faf8]/95 dark:bg-[#111315]/95 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-white dark:bg-zinc-900 rounded-2xl border border-stone-200 dark:border-zinc-800 shadow-2xl p-6 text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 flex items-center justify-center mx-auto">
                <Link2 size={24} />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-base font-bold text-stone-900 dark:text-zinc-100">
                  {guestShareState.status === 'disabled'
                    ? 'Гостьове посилання призупинено'
                    : guestShareState.status === 'expired'
                    ? 'Термін дії посилання вичерпано'
                    : 'Гостьове посилання недоступне'}
                </h2>
                <p className="text-xs text-stone-600 dark:text-zinc-400 leading-relaxed">
                  {guestShareState.errorMessage ||
                    'Зверніться до адміністратора родового дерева, щоб отримати актуальне гостьове посилання.'}
                </p>
              </div>
              {canExitGuestPreview && (
                <button
                  type="button"
                  onClick={handleExitGuestPreview}
                  className="px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <LogOut size={14} />
                  <span>Повернутися до режиму адміністратора</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 4. Inspector Sidebar */}
      <DetailsSidebar
        person={selectedPerson}
        allPersons={tree.persons}
        isOpen={isSidebarOpen && !!selectedPerson}
        isAdmin={isAdmin}
        userPersonId={isStrictReadOnlyGuest ? null : userPersonId}
        onSetUserPersonId={isStrictReadOnlyGuest ? undefined : (id) => handleSaveUserIdentity(id)}
        onClose={() => setIsSidebarOpen(false)}
        onEdit={(p) => setEditingPerson(p)}
        onAddRelative={(target, relationType) => {
          setAddingRelativeTarget({ target, initialType: relationType });
        }}
        onSelectPerson={centerOnPerson}
        onToggleRelationVerification={handleToggleRelationVerification}
        onToggleFullyVerified={isAdmin ? handleToggleFullyVerified : undefined}
        onOpenConnectModal={(p) => {
          setConnectModalInitialMode('relation');
          setConnectingPerson(p);
        }}
        onOpenBranchLinkModal={(p) => {
          setConnectModalInitialMode('branch-link');
          setConnectingPerson(p);
        }}
        onEditBranchLink={
          isAdmin
            ? (sourceId, linkId) => setEditingBranchLinkTarget({ sourceId, linkId })
            : undefined
        }
        onRemoveBranchLink={isAdmin ? handleRemoveBranchLink : undefined}
        onOpenMetricModal={handleOpenMetricModal}
        onDisconnectSpouse={isAdmin ? handleDisconnectCouple : undefined}
        onEditMarriageConnection={(connId) => {
          setEditingConnectionId(connId);
        }}
        connectionOverrides={tree.connectionOverrides}
        clanMap={clanRecord}
        onOpenClanCoatOfArmsModal={(clan) => setCoatOfArmsModalClan(clan)}
        onDeleteReaction={handleDeleteReaction}
        onOpenReactionsModal={() => setIsReactionsModalOpen(true)}
        onToggleGhostStatus={isAdmin ? handleToggleGhostStatus : undefined}
        onOpenGuestSuggestion={
          !isAdmin && !isStrictReadOnlyGuest ? (p) => setGuestSuggestionTarget(p) : undefined
        }
        onOpenProposeRelative={
          !isAdmin && !isStrictReadOnlyGuest ? (p) => setProposeRelativeTarget(p) : undefined
        }
        onResolveGuestSuggestion={isAdmin ? handleResolveGuestSuggestion : undefined}
        onApproveProposal={isAdmin ? handleApproveProposalCard : undefined}
        onDeleteProposal={isAdmin ? handleDeleteProposalCard : undefined}
        currentTreeId={tree.id}
        crossCanvasTrees={crossCanvasTrees}
        onSelectTree={handleJumpToCrossCanvasLink}
        onRemoveCrossCanvasLink={isAdmin ? handleRemoveCrossCanvasLink : undefined}
        onOpenGuestCustomize={
          isStrictReadOnlyGuest ? undefined : (p) => setCustomizePersonTarget(p)
        }
      />

      <Suspense fallback={null}>
        {/* 4.5. Dates & Anniversaries Calendar Sidebar (Birthdays and Deaths) */}
        {isCalendarOpen && (
          <DatesCalendarSidebar
            isOpen={isCalendarOpen}
            onClose={() => setIsCalendarOpen(false)}
            allPersons={tree.persons}
            onSelectPerson={(personId) => {
              centerOnPerson(personId);
              setIsCalendarOpen(false);
            }}
            showWidget={showCalendarWidget}
            onToggleWidget={() => {
              setShowCalendarWidget((prev) => {
                const next = !prev;
                try {
                  localStorage.setItem('family_tree_show_calendar_widget', String(next));
                } catch {}
                return next;
              });
            }}
          />
        )}

        {/* 5. Modals */}
        {addingRelativeTarget && (
          <AddRelativeModal
            targetPerson={addingRelativeTarget.target}
            initialType={addingRelativeTarget.initialType}
            isOpen={!!addingRelativeTarget}
            onClose={() => setAddingRelativeTarget(null)}
            onAdd={handleAddRelativeConfirm}
            allPersons={tree.persons}
            connectionOverrides={tree.connectionOverrides}
          />
        )}

        {quickDraftModalState && (
          <QuickDraftModal
            isOpen={true}
            initialMode={quickDraftModalState.mode}
            allPersons={tree.persons}
            initialCoords={quickDraftModalState.coords}
            onClose={() => setQuickDraftModalState(null)}
            onCreateGhost={handleCreateGhostCard}
            onCreateBlankScreenshot={handleCreateBlankScreenshotCard}
          />
        )}

        {editingPerson && (
          <EditPersonModal
            person={editingPerson}
            allPersons={tree.persons}
            currentTreeId={tree.id}
            crossCanvasTrees={crossCanvasTrees}
            isOpen={!!editingPerson}
            connectionOverrides={tree.connectionOverrides}
            onDelete={handleDeletePerson}
            onClose={() => {
              if (editingPerson) {
                setTree((prev) => {
                  const existing = prev.persons[editingPerson.id];
                  if (
                    existing &&
                    !existing.isBlankScreenshot &&
                    !existing.screenshotUrl &&
                    (!existing.firstName.trim() || existing.firstName === 'Нова особа') &&
                    !existing.lastName.trim()
                  ) {
                    const { [editingPerson.id]: _, ...rest } = prev.persons;
                    return {
                      ...prev,
                      persons: rest,
                      selectedPersonId: prev.selectedPersonId === editingPerson.id ? null : prev.selectedPersonId,
                    };
                  }
                  return prev;
                });
                if (selectedPersonId === editingPerson.id) {
                  setSelectedPersonId(null);
                  setIsSidebarOpen(false);
                }
              }
              setEditingPerson(null);
            }}
            onSave={handleSavePerson}
          />
        )}

        {editingConnectionId && (
          <EditConnectionModal
            connectionId={editingConnectionId}
            initialMeta={tree.connectionOverrides?.[editingConnectionId]}
            isCurrentlyVerified={
              connections.find((c) => c.id === editingConnectionId)?.isVerified ??
              (tree.connectionOverrides?.[editingConnectionId]?.verified ?? true)
            }
            connectionLabel={(() => {
              const conn = connections.find((c) => c.id === editingConnectionId);
              if (!conn) return undefined;
              if (conn.type === 'marriage') {
                const p1 = tree.persons[conn.fromId || ''];
                const p2 = tree.persons[conn.toId || ''];
                if (p1 && p2) return `${p1.firstName} ${p1.lastName} та ${p2.firstName} ${p2.lastName}`;
              }
              if (conn.type === 'child-branch') {
                const childId = conn.id.split(':').pop() || '';
                const child = tree.persons[childId];
                if (child) return `Дитина: ${child.firstName} ${child.lastName}`;
              }
              return undefined;
            })()}
            isOpen={!!editingConnectionId}
            onClose={() => setEditingConnectionId(null)}
            onSave={handleSaveConnectionMeta}
          />
        )}

        {editingBranchLinkTarget && (() => {
          const isBatch = editingBranchLinkTarget === 'batch';
          const sourceP = !isBatch ? tree.persons[editingBranchLinkTarget.sourceId] : null;
          const linkObj =
            !isBatch && sourceP
              ? sourceP.branchLinks?.find((bl) => bl.id === editingBranchLinkTarget.linkId) || null
              : null;
          const targetP = linkObj ? tree.persons[linkObj.targetPersonId] : null;
          const hasReciprocal = Boolean(
            sourceP &&
              targetP &&
              targetP.branchLinks?.some((bl) => bl.targetPersonId === sourceP.id)
          );
          if (!isBatch && (!sourceP || !linkObj)) {
            return null;
          }
          const allLinks = Object.values(tree.persons).flatMap((p) => p.branchLinks || []);
          const firstRegularLink = allLinks.find((bl) => (bl.linkKind || 'branch') === 'branch');
          const firstLink = (isBatch ? firstRegularLink : undefined) || allLinks[0];
          const hasRegularBranchLinks = Boolean(firstRegularLink);
          return (
            <EditBranchLinkModal
              isOpen={true}
              mode={isBatch ? 'batch' : 'single'}
              sourcePerson={sourceP}
              targetPerson={targetP}
              link={linkObj}
              hasReciprocal={hasReciprocal}
              totalLinksCount={totalBranchLinksCount}
              defaultStyle={
                firstLink
                  ? {
                      color: firstLink.color || '#4f46e5',
                      strokeWidth: firstLink.strokeWidth ?? 2,
                      lineShape: normalizeBranchLineShape(firstLink.lineShape),
                    }
                  : undefined
              }
              onClose={() => setEditingBranchLinkTarget(null)}
              onSave={(payload: BranchLinkStyleSavePayload) => {
                const shapeLabel = getBranchLineShapeLabel(payload.lineShape);
                if (isBatch) {
                  setTree((prev) =>
                    applyBatchBranchLinkStyle(prev, {
                      color: payload.color,
                      strokeWidth: payload.strokeWidth,
                      lineShape: payload.lineShape,
                      onlyKind: hasRegularBranchLinks ? 'branch' : undefined,
                    })
                  );
                  showToast({
                    type: 'success',
                    title: 'Стиль міжгілкових стрілок оновлено',
                    message: `Застосовано: ${shapeLabel} лінія, ${payload.strokeWidth} px.`,
                  });
                } else if (sourceP && linkObj) {
                  setTree((prev) => {
                    let next = applyUpdateBranchLink(prev, sourceP.id, linkObj.id, {
                      probableRelation: payload.probableRelation,
                      label: payload.label,
                      color: payload.color,
                      strokeWidth: payload.strokeWidth,
                      lineShape: payload.lineShape,
                      updateReciprocal: payload.updateReciprocal,
                    });
                    if (payload.applyToAll) {
                      next = applyBatchBranchLinkStyle(next, {
                        color: payload.color,
                        strokeWidth: payload.strokeWidth,
                        lineShape: payload.lineShape,
                      });
                    }
                    return next;
                  });
                  showToast({
                    type: 'success',
                    title: 'Налаштування лінії збережено',
                    message: `Форма: ${shapeLabel}, товщина ${payload.strokeWidth} px.`,
                  });
                }
              }}
              onDelete={
                !isBatch && sourceP && linkObj
                  ? () =>
                      setTree((prev) =>
                        applyRemoveBranchLink(prev, sourceP.id, linkObj.id, true)
                      )
                  : undefined
              }
            />
          );
        })()}

        {connectingPerson && (
          <ConnectPersonsModal
            sourcePerson={connectingPerson}
            allPersons={tree.persons}
            currentTreeId={tree.id}
            currentTreeTitle={tree.title}
            crossCanvasTrees={crossCanvasTrees}
            isOpen={!!connectingPerson}
            initialTargetId={preselectedTargetId || undefined}
            initialMode={connectModalInitialMode}
            onClose={() => {
              setConnectingPerson(null);
              setPreselectedTargetId(null);
              setConnectModalInitialMode('relation');
            }}
            onConnect={(targetId, relType, options) => {
              handleConnectPersons(targetId, relType, options);
              setPreselectedTargetId(null);
              setConnectModalInitialMode('relation');
            }}
            onConnectBranchLink={(targetId, options) => {
              handleConnectBranchLink(targetId, options);
              setPreselectedTargetId(null);
              setConnectModalInitialMode('relation');
            }}
            onConnectCrossCanvasLink={(payload) => {
              handleConnectCrossCanvasLink(payload);
              setPreselectedTargetId(null);
              setConnectModalInitialMode('relation');
            }}
          />
        )}

        {isExportModalOpen && (
          <ExportModal
            tree={tree}
            isOpen={isExportModalOpen}
            onClose={() => setIsExportModalOpen(false)}
            onExportPng={handleExportPng}
            onExportSvg={handleExportSvg}
            onOpenPrintPreview={() => setIsPrintModalOpen(true)}
          />
        )}

        {/* Optimized Print & PDF Preview Modal */}
        {isPrintModalOpen && (
          <PrintTreeModal
            tree={tree}
            isOpen={isPrintModalOpen}
            onClose={() => {
              setIsPrintModalOpen(false);
              setPreparedPrintTree(null);
            }}
            onPreparedSvgChange={handlePreparedSvgChange}
          />
        )}

        {/* Unified Tree Overview & Analytics Modal */}
        {overviewModalTab !== null && (
          <TreeOverviewModal
            isOpen={true}
            activeTab={overviewModalTab}
            onChangeTab={(tab) => setOverviewModalTab(!isAdmin ? 'stats' : tab)}
            onClose={() => setOverviewModalTab(null)}
            isAdmin={isAdmin}
            tree={tree}
            generations={generationsMap}
            clanList={clanList}
            blindSpotFilter={blindSpotFilter}
            onChangeBlindSpotFilter={setBlindSpotFilter}
            onSaveRegistry={handleSaveArchiveRegistry}
            onSelectPerson={(id) => centerOnPerson(id, true)}
            onEditPerson={(p) => setEditingPerson(p)}
            onFilterClan={(clan) => setSelectedClanFilter(clan)}
            onAutoFixStructure={handleAutoFixStructure}
          />
        )}

        {/* Guest Feedback & Proposal Cards Inbox (Admin only) */}
        {isAdmin && isGuestFeedbackOpen && (
          <GuestFeedbackModal
            isOpen={isGuestFeedbackOpen}
            tree={tree}
            initialTab={guestFeedbackInitialTab}
            onClose={() => setIsGuestFeedbackOpen(false)}
            onSelectPerson={(id) => centerOnPerson(id, true)}
            onEditPerson={(p) => setEditingPerson(p)}
            onResolveSuggestion={handleResolveGuestSuggestion}
            onApproveProposal={handleApproveProposalCard}
            onDeleteProposal={handleDeleteProposalCard}
          />
        )}

        {/* Guest Suggestion / Memory Modal (Guest mode) */}
        {guestSuggestionTarget && (
          <GuestSuggestionModal
            isOpen={!!guestSuggestionTarget}
            person={guestSuggestionTarget}
            defaultAuthorName={getResolvedDisplayName() === 'Гість' ? '' : getResolvedDisplayName()}
            onClose={() => setGuestSuggestionTarget(null)}
            onSubmit={handleSubmitGuestSuggestion}
          />
        )}

        {/* Guest Propose Relative Card Modal (Guest mode) */}
        {proposeRelativeTarget && (
          <ProposeRelativeModal
            isOpen={!!proposeRelativeTarget}
            targetPerson={proposeRelativeTarget}
            defaultAuthorName={getResolvedDisplayName() === 'Гість' ? '' : getResolvedDisplayName()}
            onClose={() => setProposeRelativeTarget(null)}
            onSubmit={handleSubmitProposeRelative}
          />
        )}

        {/* Admin JSON Import & Immediate Sync Modal */}
        {isImportModalOpen && (
          <ImportJsonModal
            isOpen={isImportModalOpen}
            onClose={() => {
              setIsImportModalOpen(false);
              setDraggedJsonFile(null);
            }}
            onImportTree={handleImportTreeFromJson}
            currentTreeTitle={tree.title || (isMainTree ? 'Головне дерево' : 'Родове полотно')}
            initialFile={draggedJsonFile}
          />
        )}

        {/* System Logs Modal (Admin view for server, DB, auth & runtime events) */}
        {isLogsModalOpen && (
          <SystemLogsModal
            isOpen={isLogsModalOpen}
            onClose={() => setIsLogsModalOpen(false)}
          />
        )}

        {/* Clan Coat of Arms Modal (Upload or Generate Clan Crest) */}
        {coatOfArmsModalClan && (
          <ClanCoatOfArmsModal
            isOpen={!!coatOfArmsModalClan}
            onClose={() => setCoatOfArmsModalClan(null)}
            clan={coatOfArmsModalClan}
            isAdmin={isAdmin}
            onSaveCoatOfArms={handleSaveClanCoatOfArms}
          />
        )}

        {/* Metric Document Modal */}
        {metricModalTarget && (
          <MetricModal
            person={tree.persons[metricModalTarget.person.id] || metricModalTarget.person}
            isOpen={!!metricModalTarget}
            isAdmin={isAdmin}
            initialTab={metricModalTarget.tab || 'birth'}
            onClose={() => setMetricModalTarget(null)}
            onSave={handleSaveMetricPerson}
          />
        )}

        {/* 8. User Identity Modal (Who are you in this tree) */}
        {isUserIdentityModalOpen && (
          <UserIdentityModal
            isOpen={isUserIdentityModalOpen}
            onClose={() => {
              try {
                localStorage.setItem('family_tree_user_prompted', 'true');
              } catch {}
              setIsUserIdentityModalOpen(false);
            }}
            allPersons={tree.persons}
            currentUserPersonId={userPersonId}
            currentCustomName={customUserName}
            onSaveIdentity={handleSaveUserIdentity}
            onOpenCustomize={(personId) => {
              const target = tree.persons[personId];
              if (target && !target.isBlankScreenshot) {
                setCustomizePersonTarget(target);
              }
            }}
          />
        )}

        {/* 8.5. Guest Card Customization Modal (Avatar, Card Color & Outer Frame) */}
        {customizePersonTarget && (tree.persons[customizePersonTarget.id] || customizePersonTarget) && (() => {
          const liveTarget = tree.persons[customizePersonTarget.id] || customizePersonTarget;
          const targetClan = clanMap.get(getClanName(liveTarget));
          return (
            <GuestCustomizeModal
              isOpen={!!customizePersonTarget}
              person={liveTarget}
              clanInfo={targetClan}
              onClose={() => setCustomizePersonTarget(null)}
              onSave={(patch) => handleSaveGuestCustomize(liveTarget.id, patch)}
            />
          );
        })()}

        {/* 9. Reactions & Feedback Manager Modal for Tree Owner */}
        {isReactionsModalOpen && (
          <ReactionsModal
            isOpen={isReactionsModalOpen}
            onClose={() => setIsReactionsModalOpen(false)}
            tree={tree}
            isAdmin={isAdmin}
            onDeleteReaction={handleDeleteReaction}
            onClearAllReactions={handleClearAllReactions}
            onSelectPerson={centerOnPerson}
          />
        )}

        {/* 11.2 Guest Share Link Generator Modal (Admin only) */}
        {isAdmin && isGuestShareModalOpen && (
          <GuestShareModal
            isOpen={isGuestShareModalOpen}
            onClose={() => setIsGuestShareModalOpen(false)}
            currentTree={tree}
            initialTreeId={guestShareInitialTreeId}
            hasUnsyncedFirebaseChanges={hasUnsyncedFirebaseChanges}
            isFirebaseSyncing={isFirebaseSyncing}
            onPublishToCloud={ensureCloudPublishedForShare}
            showToast={showToast}
          />
        )}

        {/* 11. Keyboard Shortcuts & User Help Modal */}
        {isShortcutsModalOpen && (
          <ShortcutsHelpModal
            isOpen={isShortcutsModalOpen}
            onClose={() => setIsShortcutsModalOpen(false)}
          />
        )}

        {/* 11.5 Canvas Photo Card Fullscreen Lightbox */}
        {canvasPhotoLightboxPerson && canvasPhotoLightboxPerson.screenshotUrl && (
          <DocumentLightboxModal
            isOpen={true}
            items={[
              {
                id: canvasPhotoLightboxPerson.id,
                url: canvasPhotoLightboxPerson.screenshotUrl,
                title:
                  [canvasPhotoLightboxPerson.firstName, canvasPhotoLightboxPerson.lastName]
                    .filter(Boolean)
                    .join(' ') || 'Картка-фото (скріншот)',
                date: canvasPhotoLightboxPerson.birthYear
                  ? `${canvasPhotoLightboxPerson.birthYear}`
                  : undefined,
                typeLabel: 'Картка-фото',
              },
            ]}
            initialIndex={0}
            onClose={() => setCanvasPhotoLightboxPerson(null)}
          />
        )}
      </Suspense>

      {/* 15. Floating Batch Selection & Clipboard Toolbar */}
      <BatchSelectionBar
        isAdmin={isAdmin}
        selectedPersonIds={selectedPersonIds}
        clipboardCount={clipboardCount}
        persons={tree.persons}
        connections={connections}
        connectionOverrides={tree.connectionOverrides}
        onCopySelected={handleCopySelectedPersons}
        onSelectAll={() => setSelectedPersonIds(new Set(Object.keys(tree.persons)))}
        onDeleteSelected={() => {
          const countToDelete = selectedPersonIds.size;
          const idsSnapshot = new Set(selectedPersonIds);
          setConfirmDialog({
            title: `Видалити ${countToDelete} карток?`,
            description: `Ви впевнені, що хочете видалити виділені картки (${countToDelete} осіб) із цього полотна?`,
            confirmLabel: 'Видалити',
            variant: 'danger',
            onConfirm: () => {
              setConfirmDialog(null);
              setTree((prev) => {
                let nextTree = prev;
                idsSnapshot.forEach((id) => {
                  nextTree = applyDeletePerson(nextTree, id);
                });
                return nextTree;
              });
              setSelectedPersonIds(new Set());
              logTree(`Пакетне видалення карток (${countToDelete} осіб)`, { count: countToDelete });
              showToast({
                type: 'info',
                title: 'Картки видалено',
                message: `Видалено ${countToDelete} осіб.`,
              });
            },
          });
        }}
        onClearSelection={() => setSelectedPersonIds(new Set())}
        onPasteBuffer={handlePasteCopiedBuffer}
        onCancelClipboard={handleCancelCopyClipboard}
        onAlignSelected={handleManualAlign}
        onGroupByGenerations={handleGroupSelectedByGenerations}
        onBatchSetConnectionStatus={handleBatchSetConnectionStatus}
      />

      {/* 12. Interactive Radar Mini-Map Navigation */}
      {showMiniMap && (
        <MiniMap
          persons={settledTree.persons}
          viewport={viewport}
          containerSize={containerSize}
          onNavigate={handleMiniMapNavigate}
          onClose={handleCloseMiniMap}
        />
      )}

      {/* 13. Toast Notifications Container */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Initial Loading Splash Screen */}
      <SplashScreen visible={isInitialLoading} />

      {/* 14. Unified In-App Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!confirmDialog}
        title={confirmDialog?.title || ''}
        description={confirmDialog?.description || ''}
        confirmLabel={confirmDialog?.confirmLabel || 'Підтвердити'}
        variant={confirmDialog?.variant || 'default'}
        onConfirm={() => confirmDialog?.onConfirm()}
        onCancel={() => setConfirmDialog(null)}
      />
    </div>

    {/* Clean print sheet rendered exclusively for @media print / Save as PDF */}
    {preparedPrintTree && (
      <div
        id="rodovid-print-sheet"
        className="hidden print:flex"
        dangerouslySetInnerHTML={{ __html: preparedPrintTree.svgMarkup }}
      />
    )}
    </>
  );
}


