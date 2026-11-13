import React, {
  Dispatch,
  MutableRefObject,
  SetStateAction,
  useCallback,
  useRef,
  useState,
} from 'react';
import { FamilyTreeData, Person, TreeViewport } from '../types/tree';
import { extractBirthYear } from '../utils/timelineUtils';
import { getBranchDescendantIds } from '../utils/lineageUtils';
import {
  AlignmentProposal,
  GuideDistanceSegment,
  ManualAlignAction,
  UnitRect,
  applyManualAlignment,
  buildStationaryUnits,
  computeAlignmentProposal,
  computeNearestCardMeasurement,
  getMovingUnitRect,
  groupSelectedByGenerations,
} from '../utils/alignmentUtils';
import { ToastMessage } from '../components/Toast';
import { logUser } from '../utils/logger';

export interface DraggingCardState {
  id: string;
  spouseId?: string;
  startX: number;
  startY: number;
  origX: number;
  origY: number;
  spouseOrigX?: number;
  spouseOrigY?: number;
  movingCards: Map<string, { origX: number; origY: number; isPinned: boolean }>;
}

interface UseCardDragAndAlignOptions {
  isAdmin: boolean;
  isLayoutLocked: boolean;
  isSnapEnabled: boolean;
  treeRef: MutableRefObject<FamilyTreeData>;
  setTree: Dispatch<SetStateAction<FamilyTreeData>>;
  liveViewportRef: MutableRefObject<TreeViewport>;
  renderUnitsRef: MutableRefObject<{
    personToCoupleMap: Record<string, { person1: Person; person2: Person }>;
  }>;
  selectedPersonIds: Set<string>;
  selectedPersonIdsRef: MutableRefObject<Set<string>>;
  isDraggingCardRef: MutableRefObject<boolean>;
  setSelectedPersonId: Dispatch<SetStateAction<string | null>>;
  setSelectedPersonIds: Dispatch<SetStateAction<Set<string>>>;
  pushHistorySnapshot: (snapshot: FamilyTreeData) => void;
  showToast: (msg: Omit<ToastMessage, 'id'>) => void;
}

export function useCardDragAndAlign({
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
}: UseCardDragAndAlignOptions) {
  const [draggingCard, setDraggingCard] = useState<DraggingCardState | null>(null);
  const [alignmentProposal, setAlignmentProposal] = useState<AlignmentProposal | null>(null);
  const [dragOverlayRect, setDragOverlayRect] = useState<UnitRect | null>(null);
  const [dragFreeNearest, setDragFreeNearest] = useState<
    (GuideDistanceSegment & { targetRect: UnitRect }) | null
  >(null);
  const [isAltFreeDrag, setIsAltFreeDrag] = useState<boolean>(false);
  const [nudgeOverlay, setNudgeOverlay] = useState<{
    movingRect: UnitRect;
    proposal: AlignmentProposal | null;
    nearest: (GuideDistanceSegment & { targetRect: UnitRect }) | null;
  } | null>(null);

  const cardDragRafRef = useRef<number | null>(null);
  const pendingCardDragRef = useRef<{ dx: number; dy: number } | null>(null);
  const pendingDragMetaRef = useRef<{
    isAltFree: boolean;
    proposal: AlignmentProposal | null;
    snappedRect: UnitRect;
    freeNearest: (GuideDistanceSegment & { targetRect: UnitRect }) | null;
  } | null>(null);
  const dragStartTreeRef = useRef<FamilyTreeData | null>(null);
  const stationaryUnitsRef = useRef<UnitRect[]>([]);
  const lastDragAppliedDeltaRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const nudgeOverlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showTimedNudgeOverlay = useCallback(
    (overlay: {
      movingRect: UnitRect;
      proposal: AlignmentProposal | null;
      nearest: (GuideDistanceSegment & { targetRect: UnitRect }) | null;
    }) => {
      setNudgeOverlay(overlay);
      if (nudgeOverlayTimerRef.current) {
        clearTimeout(nudgeOverlayTimerRef.current);
      }
      nudgeOverlayTimerRef.current = setTimeout(() => {
        setNudgeOverlay(null);
      }, 1500);
    },
    []
  );

  const handleCardDragStart = useCallback(
    (e: React.MouseEvent, personId: string) => {
      if (isLayoutLocked) return;
      e.stopPropagation();
      const currentTree = treeRef.current;
      const p = currentTree.persons[personId];
      if (!p) return;
      setAlignmentProposal(null);

      isDraggingCardRef.current = true;
      dragStartTreeRef.current = currentTree;

      const movingMap = new Map<string, { origX: number; origY: number; isPinned: boolean }>();
      const isCtrlShift = (e.ctrlKey || e.metaKey) && e.shiftKey;

      const personToCoupleMap = renderUnitsRef.current.personToCoupleMap;
      const activeCouple = personToCoupleMap[personId];
      const pairedPartner = activeCouple
        ? activeCouple.person1.id === personId
          ? activeCouple.person2
          : activeCouple.person1
        : undefined;
      const partnerId = pairedPartner?.id;
      const partner = partnerId ? currentTree.persons[partnerId] : undefined;

      const selIds = selectedPersonIdsRef.current;

      if (selIds.size > 1 && selIds.has(personId)) {
        selIds.forEach((id) => {
          const item = currentTree.persons[id];
          if (item) {
            const birthYr = extractBirthYear(item);
            const isPinned = Boolean(item.isChronologicallyPinned && birthYr);
            movingMap.set(item.id, { origX: item.x, origY: item.y, isPinned });
          }
        });
      } else if (isCtrlShift) {
        const branchIds = getBranchDescendantIds(personId, currentTree.persons);
        branchIds.add(personId);

        branchIds.forEach((id) => {
          const item = currentTree.persons[id];
          if (item) {
            const birthYr = extractBirthYear(item);
            const isPinned = Boolean(item.isChronologicallyPinned && birthYr);
            movingMap.set(item.id, { origX: item.x, origY: item.y, isPinned });
          }
        });

        setSelectedPersonId(personId);
        setSelectedPersonIds(new Set([personId]));
      } else {
        const birthYr = extractBirthYear(p);
        const isPinned = Boolean(p.isChronologicallyPinned && birthYr);
        movingMap.set(p.id, { origX: p.x, origY: p.y, isPinned });

        if (partner) {
          const sBirthYr = extractBirthYear(partner);
          const sPinned = Boolean(partner.isChronologicallyPinned && sBirthYr);
          movingMap.set(partner.id, { origX: partner.x, origY: partner.y, isPinned: sPinned });
        }

        setSelectedPersonId(personId);
        setSelectedPersonIds(new Set([personId]));
      }

      const movingIdSet = new Set(movingMap.keys());
      stationaryUnitsRef.current = buildStationaryUnits(
        currentTree.persons,
        personToCoupleMap,
        movingIdSet
      );
      lastDragAppliedDeltaRef.current = { dx: 0, dy: 0 };
      setNudgeOverlay(null);
      setDragOverlayRect(null);
      setDragFreeNearest(null);

      setDraggingCard({
        id: personId,
        spouseId: partner ? partnerId : undefined,
        startX: e.clientX,
        startY: e.clientY,
        origX: p.x,
        origY: p.y,
        spouseOrigX: partner ? partner.x : undefined,
        spouseOrigY: partner ? partner.y : undefined,
        movingCards: movingMap,
      });
    },
    [
      isLayoutLocked,
      isDraggingCardRef,
      renderUnitsRef,
      selectedPersonIdsRef,
      setSelectedPersonId,
      setSelectedPersonIds,
      treeRef,
    ]
  );

  const updateCardDragMove = useCallback(
    (e: React.MouseEvent) => {
      if (!draggingCard) return;
      const vpZoom = liveViewportRef.current.zoom;
      const dx = (e.clientX - draggingCard.startX) / vpZoom;
      const dy = (e.clientY - draggingCard.startY) / vpZoom;

      const draggedPerson = treeRef.current.persons[draggingCard.id];
      const birthYr = draggedPerson ? extractBirthYear(draggedPerson) : null;
      const isPinned = Boolean(draggedPerson?.isChronologicallyPinned && birthYr);

      const rawPositions = new Map<string, { x: number; y: number }>();
      const movingIdSet = new Set<string>();
      let anyMovingPinned = isPinned;

      draggingCard.movingCards.forEach((info, cardId) => {
        movingIdSet.add(cardId);
        if (info.isPinned) anyMovingPinned = true;
        rawPositions.set(cardId, {
          x: Math.round(info.origX + dx),
          y: info.isPinned ? info.origY : Math.round(info.origY + dy),
        });
      });

      const rawMovingRect = getMovingUnitRect(
        movingIdSet,
        rawPositions,
        renderUnitsRef.current.personToCoupleMap,
        draggingCard.id
      );

      const snapActive = (isSnapEnabled && !e.altKey) || (!isSnapEnabled && e.shiftKey);
      const effectiveThreshold = Math.max(
        10,
        Math.round(16 / Math.max(0.45, Math.min(1.5, vpZoom)))
      );

      const proposal = computeAlignmentProposal(rawMovingRect, stationaryUnitsRef.current, {
        thresholdPx: effectiveThreshold,
        isPinnedY: anyMovingPinned,
        snapEnabled: snapActive,
      });

      const snapDx =
        proposal && proposal.proposedX !== undefined ? proposal.proposedX - rawMovingRect.x : 0;
      const snapDy =
        proposal && !anyMovingPinned && proposal.proposedY !== undefined
          ? proposal.proposedY - rawMovingRect.y
          : 0;

      const appliedDx = dx + snapDx;
      const appliedDy = dy + snapDy;
      lastDragAppliedDeltaRef.current = { dx: appliedDx, dy: appliedDy };

      const snappedRect: UnitRect = {
        ...rawMovingRect,
        x: Math.round(rawMovingRect.x + snapDx),
        y: anyMovingPinned ? rawMovingRect.y : Math.round(rawMovingRect.y + snapDy),
      };

      pendingDragMetaRef.current = {
        isAltFree: !snapActive,
        proposal,
        snappedRect,
        freeNearest: !proposal
          ? computeNearestCardMeasurement(snappedRect, stationaryUnitsRef.current)
          : null,
      };

      pendingCardDragRef.current = { dx: appliedDx, dy: appliedDy };
      if (cardDragRafRef.current === null) {
        cardDragRafRef.current = requestAnimationFrame(() => {
          cardDragRafRef.current = null;
          if (!pendingCardDragRef.current || !isDraggingCardRef.current) return;
          const { dx: curDx, dy: curDy } = pendingCardDragRef.current;
          const meta = pendingDragMetaRef.current;
          if (meta) {
            setIsAltFreeDrag(meta.isAltFree);
            setAlignmentProposal(meta.proposal);
            setDragOverlayRect(meta.snappedRect);
            setDragFreeNearest(meta.freeNearest);
          }
          setTree((prev) => {
            const updatedPersons: Record<string, Person> = { ...prev.persons };
            draggingCard.movingCards.forEach((info, cardId) => {
              const p = updatedPersons[cardId];
              if (!p) return;
              const newX = Math.round(info.origX + curDx);
              const newY = info.isPinned ? info.origY : Math.round(info.origY + curDy);
              updatedPersons[cardId] = {
                ...p,
                x: newX,
                y: newY,
              };
            });

            return {
              ...prev,
              persons: updatedPersons,
            };
          });
        });
      }
    },
    [draggingCard, isDraggingCardRef, isSnapEnabled, liveViewportRef, renderUnitsRef, setTree, treeRef]
  );

  const finishCardDrag = useCallback(() => {
    if (!draggingCard) return;
    const draggedPerson = treeRef.current.persons[draggingCard.id];
    const finalDelta = pendingCardDragRef.current || lastDragAppliedDeltaRef.current;
    const didMove = Math.round(finalDelta.dx) !== 0 || Math.round(finalDelta.dy) !== 0;

    if (draggedPerson && didMove) {
      setTree((prev) => {
        const updatedPersons: Record<string, Person> = { ...prev.persons };
        draggingCard.movingCards.forEach((info, cardId) => {
          const p = updatedPersons[cardId];
          if (!p) return;
          const newX = Math.round(info.origX + finalDelta.dx);
          const newY = info.isPinned ? info.origY : Math.round(info.origY + finalDelta.dy);
          updatedPersons[cardId] = {
            ...p,
            x: newX,
            y: newY,
          };
        });

        return {
          ...prev,
          persons: updatedPersons,
          updatedAt: new Date().toISOString(),
        };
      });

      if (dragStartTreeRef.current) {
        pushHistorySnapshot(dragStartTreeRef.current);
        dragStartTreeRef.current = null;
      }
      const movedCount = draggingCard.movingCards.size;
      const personName = [draggedPerson.firstName, draggedPerson.lastName].filter(Boolean).join(' ') || 'Картка';
      logUser(
        movedCount > 1
          ? `Переміщено групу карток (${movedCount} шт.) на полотні`
          : `Переміщено картку «${personName}»`,
        {
          personId: draggedPerson.id,
          movedCount,
          dx: Math.round(finalDelta.dx),
          dy: Math.round(finalDelta.dy),
        }
      );
    } else {
      dragStartTreeRef.current = null;
    }

    if (cardDragRafRef.current !== null) {
      cancelAnimationFrame(cardDragRafRef.current);
      cardDragRafRef.current = null;
    }
    pendingCardDragRef.current = null;
    pendingDragMetaRef.current = null;
    lastDragAppliedDeltaRef.current = { dx: 0, dy: 0 };
    isDraggingCardRef.current = false;
    setDraggingCard(null);
    setAlignmentProposal(null);
    setDragOverlayRect(null);
    setDragFreeNearest(null);
    setIsAltFreeDrag(false);
  }, [draggingCard, isDraggingCardRef, pushHistorySnapshot, setTree, treeRef]);

  const cancelCardDrag = useCallback(() => {
    if (cardDragRafRef.current !== null) {
      cancelAnimationFrame(cardDragRafRef.current);
      cardDragRafRef.current = null;
    }
    pendingCardDragRef.current = null;
    pendingDragMetaRef.current = null;
    dragStartTreeRef.current = null;
    isDraggingCardRef.current = false;
    setDraggingCard(null);
    setAlignmentProposal(null);
    setDragOverlayRect(null);
    setDragFreeNearest(null);
    setIsAltFreeDrag(false);
  }, [isDraggingCardRef]);

  const handleManualAlign = useCallback(
    (action: ManualAlignAction, gapCm = 1.2) => {
      if (!isAdmin || selectedPersonIds.size < 2) return;
      const currentTree = treeRef.current;
      pushHistorySnapshot(currentTree);
      const { updatedPersons, alignedUnitCount, skippedPinnedCount } = applyManualAlignment(
        currentTree.persons,
        renderUnitsRef.current.personToCoupleMap,
        selectedPersonIds,
        action,
        gapCm
      );
      if (alignedUnitCount < 2) return;

      setTree((prev) => ({
        ...prev,
        persons: updatedPersons,
        updatedAt: new Date().toISOString(),
      }));
      setNudgeOverlay(null);

      const actionLabels: Record<ManualAlignAction, string> = {
        left: 'Вирівняно по лівому краю',
        'center-x': 'Вирівняно по центру горизонтально',
        right: 'Вирівняно по правому краю',
        top: 'Вирівняно по верхньому краю',
        'center-y': 'Вирівняно по центру вертикально',
        bottom: 'Вирівняно по нижньому краю',
        'distribute-x': 'Рівномірно розподілено по горизонталі',
        'distribute-y': 'Рівномірно розподілено по вертикалі',
        'pack-row': `Вирівняно в ряд (крок ${gapCm} см)`,
        'pack-col': `Вирівняно в стовпець (крок ${gapCm} см)`,
      };

      logUser(`${actionLabels[action]} (${alignedUnitCount} ел.)`, {
        action,
        alignedUnitCount,
        skippedPinnedCount,
      });

      showToast({
        type: 'success',
        title: actionLabels[action],
        message:
          skippedPinnedCount > 0
            ? `Оброблено ${alignedUnitCount} елементів (${skippedPinnedCount} закріплених за роком зберегли висоту).`
            : `Вирівняно ${alignedUnitCount} елементів.`,
      });
    },
    [isAdmin, selectedPersonIds, treeRef, renderUnitsRef, pushHistorySnapshot, setTree, showToast]
  );

  const handleGroupSelectedByGenerations = useCallback(() => {
    if (!isAdmin || selectedPersonIds.size < 2) return;
    const currentTree = treeRef.current;
    pushHistorySnapshot(currentTree);
    const { updatedPersons, groupedUnitCount, generationCount, skippedPinnedCount } =
      groupSelectedByGenerations(
        currentTree.persons,
        renderUnitsRef.current.personToCoupleMap,
        selectedPersonIds,
        currentTree.connectionOverrides
      );
    if (groupedUnitCount < 2) {
      showToast({
        type: 'info',
        title: 'Недостатньо карток для групування',
        message: 'Виділіть щонайменше дві окремі картки або кілька поколінь (діти та батьки).',
      });
      return;
    }

    setTree((prev) => ({
      ...prev,
      persons: updatedPersons,
      updatedAt: new Date().toISOString(),
    }));
    setNudgeOverlay(null);

    logUser(`Згруповано картки по поколіннях (${generationCount} пок., ${groupedUnitCount} ел.)`, {
      generationCount,
      groupedUnitCount,
      skippedPinnedCount,
    });

    showToast({
      type: 'success',
      title: `Згруповано по поколіннях (${generationCount})`,
      message:
        skippedPinnedCount > 0
          ? `Упорядковано ${groupedUnitCount} елементів (діди зверху → батьки → діти; ${skippedPinnedCount} закріплених за роком зберегли висоту).`
          : `Упорядковано ${groupedUnitCount} елементів по ${generationCount} поколіннях (діди зверху → батьки → діти).`,
    });
  }, [isAdmin, selectedPersonIds, treeRef, renderUnitsRef, pushHistorySnapshot, setTree, showToast]);

  return {
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
  };
}
