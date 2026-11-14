import React, {
  Dispatch,
  MutableRefObject,
  SetStateAction,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { FamilyTreeData, TreeViewport } from '../types/tree';
import { CARD_HEIGHT, CARD_WIDTH } from '../utils/treeLayout';

interface UseCanvasViewportOptions {
  treeRef: MutableRefObject<FamilyTreeData>;
  isSidebarOpen: boolean;
  showTimelineRef: MutableRefObject<boolean>;
  setSelectedPersonId: Dispatch<SetStateAction<string | null>>;
  setSelectedPersonIds: Dispatch<SetStateAction<Set<string>>>;
  setIsSidebarOpen: Dispatch<SetStateAction<boolean>>;
  onClearTransientUi?: () => void;
}

export function useCanvasViewport({
  treeRef,
  isSidebarOpen,
  showTimelineRef,
  setSelectedPersonId,
  setSelectedPersonIds,
  setIsSidebarOpen,
  onClearTransientUi,
}: UseCanvasViewportOptions) {
  const [viewport, setViewport] = useState<TreeViewport>({
    x: 120,
    y: 60,
    zoom: 0.9,
  });

  const liveViewportRef = useRef<TreeViewport>(viewport);
  const committedViewportRef = useRef<TreeViewport>(viewport);
  const canvasLayerRef = useRef<HTMLDivElement | null>(null);
  const timelineTrackRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wheelCommitTimerRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (committedViewportRef.current !== viewport) {
      liveViewportRef.current = viewport;
      committedViewportRef.current = viewport;
    }
  }, [viewport]);

  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({
    width: typeof window !== 'undefined' ? window.innerWidth : 1200,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  });

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setContainerSize({ width: rect.width, height: rect.height });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const visibleBounds = useMemo(() => {
    const CULL_BUFFER = 650;
    const minX = -viewport.x / viewport.zoom - CULL_BUFFER;
    const maxX = (containerSize.width - viewport.x) / viewport.zoom + CULL_BUFFER;
    const minY = -viewport.y / viewport.zoom - CULL_BUFFER;
    const maxY = (containerSize.height - viewport.y) / viewport.zoom + CULL_BUFFER;
    return { minX, maxX, minY, maxY };
  }, [viewport.x, viewport.y, viewport.zoom, containerSize]);

  const [isPanning, setIsPanning] = useState(false);
  const isPanningRef = useRef(false);
  isPanningRef.current = isPanning;
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const panCandidateRef = useRef<{
    active: boolean;
    startClientX: number;
    startClientY: number;
    offsetX: number;
    offsetY: number;
    startedOnCard: boolean;
    startedOnInteractive: boolean;
  } | null>(null);
  const didPanRef = useRef<boolean>(false);
  const lastPanEndTimeRef = useRef<number>(0);
  const panRafRef = useRef<number | null>(null);
  const pendingPanPosRef = useRef<{ x: number; y: number } | null>(null);
  const pinchStartRef = useRef<{
    dist: number;
    zoom: number;
    viewportX: number;
    viewportY: number;
    centerX: number;
    centerY: number;
    canvasX: number;
    canvasY: number;
  } | null>(null);

  const applyViewportDom = useCallback(
    (next: TreeViewport) => {
      liveViewportRef.current = next;
      if (canvasLayerRef.current) {
        canvasLayerRef.current.style.transform = `translate3d(${next.x}px, ${next.y}px, 0px) scale(${next.zoom})`;
      }
      if (timelineTrackRef.current) {
        timelineTrackRef.current.style.transform = `translate3d(0px, ${next.y}px, 0px)`;
      }
      const committed = committedViewportRef.current;
      const dxCanvas = Math.abs(next.x / next.zoom - committed.x / committed.zoom);
      const dyCanvas = Math.abs(next.y / next.zoom - committed.y / committed.zoom);
      const crossedLod = (next.zoom < 0.48) !== (committed.zoom < 0.48);
      const zoomRatio = Math.abs(next.zoom - committed.zoom) / committed.zoom;

      if (
        dxCanvas > 340 ||
        dyCanvas > 340 ||
        crossedLod ||
        zoomRatio > 0.14 ||
        (showTimelineRef.current && next.zoom !== committed.zoom)
      ) {
        committedViewportRef.current = next;
        setViewport(next);
      }
    },
    [showTimelineRef]
  );

  const schedulePanUpdate = useCallback(
    (x: number, y: number) => {
      pendingPanPosRef.current = { x, y };
      if (panRafRef.current === null) {
        panRafRef.current = requestAnimationFrame(() => {
          panRafRef.current = null;
          if (pendingPanPosRef.current) {
            const { x: newX, y: newY } = pendingPanPosRef.current;
            applyViewportDom({
              x: newX,
              y: newY,
              zoom: liveViewportRef.current.zoom,
            });
          }
        });
      }
    },
    [applyViewportDom]
  );

  const flushPanUpdate = useCallback(() => {
    if (panRafRef.current !== null) {
      cancelAnimationFrame(panRafRef.current);
      panRafRef.current = null;
    }
    if (pendingPanPosRef.current) {
      const { x: newX, y: newY } = pendingPanPosRef.current;
      pendingPanPosRef.current = null;
      const finalVp: TreeViewport = { x: newX, y: newY, zoom: liveViewportRef.current.zoom };
      liveViewportRef.current = finalVp;
      committedViewportRef.current = finalVp;
      setViewport(finalVp);
    } else if (
      liveViewportRef.current.x !== committedViewportRef.current.x ||
      liveViewportRef.current.y !== committedViewportRef.current.y ||
      liveViewportRef.current.zoom !== committedViewportRef.current.zoom
    ) {
      const finalVp = liveViewportRef.current;
      committedViewportRef.current = finalVp;
      setViewport(finalVp);
    }
  }, []);

  const centerOnPerson = useCallback(
    (personId: string, openSidebar = false) => {
      const p = treeRef.current.persons[personId];
      if (!p || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const currentZoom = liveViewportRef.current.zoom;
      const targetX = rect.width / 2 - (p.x + CARD_WIDTH / 2) * currentZoom;
      const targetY = rect.height / 2 - (p.y + CARD_HEIGHT / 2) * currentZoom;
      setViewport((prev) => ({
        ...prev,
        x: targetX,
        y: targetY,
      }));
      setSelectedPersonId(personId);
      if (openSidebar) {
        setIsSidebarOpen(true);
      }
    },
    [treeRef, setSelectedPersonId, setIsSidebarOpen]
  );

  const fitToContent = useCallback(() => {
    const persons = Object.values(treeRef.current.persons);
    if (persons.length === 0 || !containerRef.current) {
      setViewport({ x: 120, y: 80, zoom: 0.9 });
      return;
    }

    const minX = Math.min(...persons.map((p) => p.x));
    const minY = Math.min(...persons.map((p) => p.y));
    const maxX = Math.max(...persons.map((p) => p.x + CARD_WIDTH));
    const maxY = Math.max(...persons.map((p) => p.y + CARD_HEIGHT));

    const contentWidth = maxX - minX + 160;
    const contentHeight = maxY - minY + 160;

    const containerRect = containerRef.current.getBoundingClientRect();
    const availableWidth = containerRect.width - (isSidebarOpen ? 340 : 80);
    const availableHeight = containerRect.height - 100;

    const scaleX = availableWidth / contentWidth;
    const scaleY = availableHeight / contentHeight;
    const newZoom = Math.min(1.2, Math.max(0.35, Math.min(scaleX, scaleY)));

    const newX = (availableWidth - contentWidth * newZoom) / 2 - minX * newZoom + 90;
    const newY = (availableHeight - contentHeight * newZoom) / 2 - minY * newZoom + 50;

    setViewport({
      x: newX,
      y: newY,
      zoom: Number(newZoom.toFixed(2)),
    });
  }, [treeRef, isSidebarOpen]);

  const handleMiniMapNavigate = useCallback((newX: number, newY: number) => {
    setViewport((prev) => ({ ...prev, x: newX, y: newY }));
  }, []);

  const startPanCandidate = useCallback(
    (clientX: number, clientY: number, startedOnCard: boolean, startedOnInteractive: boolean) => {
      const vp = liveViewportRef.current;
      didPanRef.current = false;
      panCandidateRef.current = {
        active: !startedOnInteractive,
        startClientX: clientX,
        startClientY: clientY,
        offsetX: clientX - vp.x,
        offsetY: clientY - vp.y,
        startedOnCard,
        startedOnInteractive,
      };
    },
    []
  );

  const movePanOrCandidate = useCallback(
    (clientX: number, clientY: number, threshold = 5) => {
      if (isPanningRef.current) {
        schedulePanUpdate(clientX - panStartRef.current.x, clientY - panStartRef.current.y);
      } else if (panCandidateRef.current?.active) {
        const dist = Math.hypot(
          clientX - panCandidateRef.current.startClientX,
          clientY - panCandidateRef.current.startClientY
        );
        if (dist > threshold) {
          didPanRef.current = true;
          panStartRef.current = {
            x: panCandidateRef.current.offsetX,
            y: panCandidateRef.current.offsetY,
          };
          panCandidateRef.current = null;
          setIsPanning(true);
          schedulePanUpdate(clientX - panStartRef.current.x, clientY - panStartRef.current.y);
        }
      }
    },
    [schedulePanUpdate]
  );

  const endPanOrCandidate = useCallback(
    (canClearSelection: boolean) => {
      const cand = panCandidateRef.current;
      panCandidateRef.current = null;
      if (isPanningRef.current && didPanRef.current) {
        lastPanEndTimeRef.current = Date.now();
      } else if (
        canClearSelection &&
        cand &&
        cand.active &&
        !didPanRef.current &&
        !cand.startedOnCard &&
        !cand.startedOnInteractive
      ) {
        setSelectedPersonId(null);
        setSelectedPersonIds(new Set());
      }
      setIsPanning(false);
      flushPanUpdate();
    },
    [flushPanUpdate, setSelectedPersonId, setSelectedPersonIds]
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const vp = liveViewportRef.current;
      if (e.touches.length === 2) {
        panCandidateRef.current = null;
        setIsPanning(false);
        flushPanUpdate();

        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        const centerX = (t1.clientX + t2.clientX) / 2;
        const centerY = (t1.clientY + t2.clientY) / 2;

        const rect = containerRef.current ? containerRef.current.getBoundingClientRect() : { left: 0, top: 0 };
        const canvasX = (centerX - rect.left - vp.x) / vp.zoom;
        const canvasY = (centerY - rect.top - vp.y) / vp.zoom;

        pinchStartRef.current = {
          dist: Math.max(10, dist),
          zoom: vp.zoom,
          viewportX: vp.x,
          viewportY: vp.y,
          centerX,
          centerY,
          canvasX,
          canvasY,
        };
        return;
      }

      if (e.touches.length === 1) {
        pinchStartRef.current = null;
        onClearTransientUi?.();
        const targetEl = e.target as HTMLElement | null;
        const startedOnCard = Boolean(targetEl?.closest('[data-family-card="true"]'));
        const startedOnInteractive = Boolean(
          targetEl?.closest('button, input, textarea, select, a, aside, nav, [role="dialog"]')
        );
        startPanCandidate(e.touches[0].clientX, e.touches[0].clientY, startedOnCard, startedOnInteractive);
      }
    },
    [flushPanUpdate, onClearTransientUi, startPanCandidate]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2 && pinchStartRef.current) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const currentDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        const currentCenterX = (t1.clientX + t2.clientX) / 2;
        const currentCenterY = (t1.clientY + t2.clientY) / 2;

        const scaleFactor = currentDist / pinchStartRef.current.dist;
        const newZoom = Math.min(2.5, Math.max(0.2, Number((pinchStartRef.current.zoom * scaleFactor).toFixed(3))));

        const rect = containerRef.current ? containerRef.current.getBoundingClientRect() : { left: 0, top: 0 };
        const newViewportX = currentCenterX - rect.left - pinchStartRef.current.canvasX * newZoom;
        const newViewportY = currentCenterY - rect.top - pinchStartRef.current.canvasY * newZoom;

        applyViewportDom({
          x: newViewportX,
          y: newViewportY,
          zoom: newZoom,
        });
        return;
      }

      if (e.touches.length === 1) {
        movePanOrCandidate(e.touches[0].clientX, e.touches[0].clientY, 6);
      }
    },
    [applyViewportDom, movePanOrCandidate]
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length < 2) {
        pinchStartRef.current = null;
        flushPanUpdate();
      }
      if (e.touches.length === 0) {
        endPanOrCandidate(true);
      }
    },
    [endPanOrCandidate, flushPanUpdate]
  );

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (panCandidateRef.current || isPanningRef.current) {
        if (isPanningRef.current && didPanRef.current) {
          lastPanEndTimeRef.current = Date.now();
        }
        panCandidateRef.current = null;
        setIsPanning(false);
        flushPanUpdate();
      }
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [flushPanUpdate]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let wheelRafId: number | null = null;
    let accumulatedDelta = 0;
    let lastMouseX = 0;
    let lastMouseY = 0;

    const onWheelHandler = (e: WheelEvent) => {
      e.preventDefault();

      const rect = container.getBoundingClientRect();
      lastMouseX = e.clientX - rect.left;
      lastMouseY = e.clientY - rect.top;

      const zoomIntensity = e.ctrlKey ? 0.02 : 0.0015;
      accumulatedDelta += -e.deltaY * zoomIntensity;

      if (wheelRafId === null) {
        wheelRafId = requestAnimationFrame(() => {
          wheelRafId = null;
          const delta = accumulatedDelta;
          accumulatedDelta = 0;
          const mouseX = lastMouseX;
          const mouseY = lastMouseY;

          const prev = liveViewportRef.current;
          const factor = Math.exp(delta);
          const newZoom = Math.min(2.5, Math.max(0.2, Number((prev.zoom * factor).toFixed(3))));
          if (newZoom === prev.zoom) return;

          const canvasX = (mouseX - prev.x) / prev.zoom;
          const canvasY = (mouseY - prev.y) / prev.zoom;
          const newX = Math.round(mouseX - canvasX * newZoom);
          const newY = Math.round(mouseY - canvasY * newZoom);

          applyViewportDom({ x: newX, y: newY, zoom: newZoom });

          if (wheelCommitTimerRef.current !== null) {
            window.clearTimeout(wheelCommitTimerRef.current);
          }
          wheelCommitTimerRef.current = window.setTimeout(() => {
            wheelCommitTimerRef.current = null;
            const latest = liveViewportRef.current;
            if (
              latest.x !== committedViewportRef.current.x ||
              latest.y !== committedViewportRef.current.y ||
              latest.zoom !== committedViewportRef.current.zoom
            ) {
              committedViewportRef.current = latest;
              setViewport(latest);
            }
          }, 95);
        });
      }
    };

    container.addEventListener('wheel', onWheelHandler, { passive: false });
    return () => {
      if (wheelRafId !== null) cancelAnimationFrame(wheelRafId);
      if (wheelCommitTimerRef.current !== null) window.clearTimeout(wheelCommitTimerRef.current);
      container.removeEventListener('wheel', onWheelHandler);
    };
  }, [applyViewportDom]);

  return {
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
  };
}
