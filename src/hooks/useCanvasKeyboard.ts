import { Dispatch, MutableRefObject, SetStateAction, useEffect, useRef } from 'react';
import { FamilyTreeData, Person } from '../types/tree';
import { extractBirthYear } from '../utils/timelineUtils';
import {
  AlignmentProposal,
  GuideDistanceSegment,
  UnitRect,
  buildStationaryUnits,
  computeAlignmentProposal,
  computeNearestCardMeasurement,
  getMovingUnitRect,
} from '../utils/alignmentUtils';

interface UseCanvasKeyboardOptions {
  isAdmin: boolean;
  isLayoutLocked: boolean;
  hasDraggingCard: boolean;
  hasBlockingModalOpen: boolean;
  selectedPersonId: string | null;
  selectedPersonIds: Set<string>;
  selectedPerson: Person | null;
  treeRef: MutableRefObject<FamilyTreeData>;
  setTree: Dispatch<SetStateAction<FamilyTreeData>>;
  renderUnitsRef: MutableRefObject<{
    personToCoupleMap: Record<string, { person1: Person; person2: Person }>;
  }>;
  pushHistorySnapshot: (snapshot: FamilyTreeData) => void;
  setSelectedPersonIds: Dispatch<SetStateAction<Set<string>>>;
  onClearEscapeUi: () => void;
  onShowNudgeOverlay: (overlay: {
    movingRect: UnitRect;
    proposal: AlignmentProposal | null;
    nearest: (GuideDistanceSegment & { targetRect: UnitRect }) | null;
  }) => void;
  onUploadBlankScreenshot: (personId: string, file: File) => Promise<void>;
  onCreatePhotoCardFromFile: (file: File) => Promise<void>;
}

export function useCanvasKeyboard({
  isAdmin,
  isLayoutLocked,
  hasDraggingCard,
  hasBlockingModalOpen,
  selectedPersonId,
  selectedPersonIds,
  selectedPerson,
  treeRef,
  setTree,
  renderUnitsRef,
  pushHistorySnapshot,
  setSelectedPersonIds,
  onClearEscapeUi,
  onShowNudgeOverlay,
  onUploadBlankScreenshot,
  onCreatePhotoCardFromFile,
}: UseCanvasKeyboardOptions) {
  const nudgeSnapshotActiveRef = useRef<boolean>(false);
  const nudgeSnapshotResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedPersonIds(new Set());
        onClearEscapeUi();
        return;
      }

      if (
        !isAdmin ||
        isLayoutLocked ||
        selectedPersonIds.size === 0 ||
        hasDraggingCard ||
        hasBlockingModalOpen
      ) {
        return;
      }

      const activeEl = document.activeElement as HTMLElement | null;
      const tag = activeEl?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || activeEl?.isContentEditable) {
        return;
      }

      let stepX = 0;
      let stepY = 0;
      const step = e.shiftKey ? 10 : 1;
      if (e.key === 'ArrowLeft') stepX = -step;
      else if (e.key === 'ArrowRight') stepX = step;
      else if (e.key === 'ArrowUp') stepY = -step;
      else if (e.key === 'ArrowDown') stepY = step;
      else return;

      e.preventDefault();

      const currentTree = treeRef.current;
      const personToCoupleMap = renderUnitsRef.current.personToCoupleMap;

      const moveIds = new Set<string>();
      selectedPersonIds.forEach((id) => {
        if (!currentTree.persons[id]) return;
        moveIds.add(id);
        const couple = personToCoupleMap[id];
        if (couple) {
          moveIds.add(couple.person1.id);
          moveIds.add(couple.person2.id);
        }
      });
      if (moveIds.size === 0) return;

      if (!nudgeSnapshotActiveRef.current) {
        pushHistorySnapshot(currentTree);
        nudgeSnapshotActiveRef.current = true;
      }
      if (nudgeSnapshotResetTimerRef.current) {
        clearTimeout(nudgeSnapshotResetTimerRef.current);
      }
      nudgeSnapshotResetTimerRef.current = setTimeout(() => {
        nudgeSnapshotActiveRef.current = false;
      }, 650);

      const updatedPositions = new Map<string, { x: number; y: number }>();
      let anyPinnedY = false;

      setTree((prev) => {
        const nextPersons: Record<string, Person> = { ...prev.persons };
        moveIds.forEach((id) => {
          const p = nextPersons[id];
          if (!p) return;
          const birthYr = extractBirthYear(p);
          const isPinned = Boolean(p.isChronologicallyPinned && birthYr);
          if (isPinned) anyPinnedY = true;
          const nextX = p.x + stepX;
          const nextY = isPinned ? p.y : p.y + stepY;
          nextPersons[id] = { ...p, x: nextX, y: nextY };
          updatedPositions.set(id, { x: nextX, y: nextY });
        });
        return {
          ...prev,
          persons: nextPersons,
          updatedAt: new Date().toISOString(),
        };
      });

      if (updatedPositions.size === 0) {
        moveIds.forEach((id) => {
          const p = currentTree.persons[id];
          if (!p) return;
          const birthYr = extractBirthYear(p);
          const isPinned = Boolean(p.isChronologicallyPinned && birthYr);
          if (isPinned) anyPinnedY = true;
          updatedPositions.set(id, {
            x: p.x + stepX,
            y: isPinned ? p.y : p.y + stepY,
          });
        });
      }

      const primaryId =
        selectedPersonId && moveIds.has(selectedPersonId)
          ? selectedPersonId
          : Array.from(moveIds)[0];
      const movingRect = getMovingUnitRect(
        moveIds,
        updatedPositions,
        personToCoupleMap,
        primaryId
      );
      const stationary = buildStationaryUnits(currentTree.persons, personToCoupleMap, moveIds);
      const exactGuideProposal = computeAlignmentProposal(movingRect, stationary, {
        thresholdPx: 2,
        isPinnedY: anyPinnedY,
        snapEnabled: true,
      });
      const nearest = computeNearestCardMeasurement(movingRect, stationary);

      onShowNudgeOverlay({
        movingRect,
        proposal: exactGuideProposal,
        nearest,
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isAdmin,
    isLayoutLocked,
    hasDraggingCard,
    hasBlockingModalOpen,
    selectedPersonId,
    selectedPersonIds,
    treeRef,
    setTree,
    renderUnitsRef,
    pushHistorySnapshot,
    setSelectedPersonIds,
    onClearEscapeUi,
    onShowNudgeOverlay,
  ]);

  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      if (!isAdmin || hasBlockingModalOpen) return;
      const activeEl = document.activeElement as HTMLElement | null;
      const tag = activeEl?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || activeEl?.isContentEditable) {
        return;
      }

      const items = e.clipboardData?.items;
      if (!items) return;
      let pastedImage: File | null = null;
      for (let i = 0; i < items.length; i++) {
        const type = items[i].type.toLowerCase();
        if (type.startsWith('image/') && !type.includes('svg')) {
          pastedImage = items[i].getAsFile();
          if (pastedImage) break;
        }
      }
      if (!pastedImage) return;

      e.preventDefault();
      if (selectedPerson && selectedPerson.isBlankScreenshot) {
        void onUploadBlankScreenshot(selectedPerson.id, pastedImage);
      } else {
        void onCreatePhotoCardFromFile(pastedImage);
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, [
    isAdmin,
    hasBlockingModalOpen,
    selectedPerson,
    onUploadBlankScreenshot,
    onCreatePhotoCardFromFile,
  ]);
}
