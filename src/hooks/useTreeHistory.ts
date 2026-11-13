import { useState, useRef, useCallback, useEffect } from 'react';
import { FamilyTreeData } from '../types/tree';
import { logUser } from '../utils/logger';

interface UseTreeHistoryOptions {
  onRestoreTree: (snapshot: FamilyTreeData) => void;
  onAfterUndo?: () => void;
  onToggleShortcuts?: () => void;
}

export function useTreeHistory({
  onRestoreTree,
  onAfterUndo,
  onToggleShortcuts,
}: UseTreeHistoryOptions) {
  const [historyStack, setHistoryStack] = useState<FamilyTreeData[]>([]);
  const isUndoActionRef = useRef<boolean>(false);

  const pushHistorySnapshot = useCallback((snapshot: FamilyTreeData) => {
    setHistoryStack((prevStack) => {
      const next = [...prevStack, snapshot];
      if (next.length > 35) next.shift();
      return next;
    });
  }, []);

  const handleUndo = useCallback(() => {
    if (historyStack.length === 0) return;
    setHistoryStack((prevStack) => {
      if (prevStack.length === 0) return prevStack;
      const nextStack = [...prevStack];
      const previousState = nextStack.pop();
      if (previousState) {
        isUndoActionRef.current = true;
        logUser('Скасовано останню дію (Undo)', {
          treeId: previousState.id,
          personCount: Object.keys(previousState.persons || {}).length,
        });
        onRestoreTree(previousState);
        onAfterUndo?.();
      }
      return nextStack;
    });
  }, [historyStack.length, onRestoreTree, onAfterUndo]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }

      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        onToggleShortcuts?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, onToggleShortcuts]);

  return {
    historyStack,
    isUndoActionRef,
    pushHistorySnapshot,
    handleUndo,
  };
}
