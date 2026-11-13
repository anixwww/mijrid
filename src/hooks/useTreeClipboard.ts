import { useState, useCallback, useEffect, Dispatch, SetStateAction } from 'react';
import { FamilyTreeData, Person, ConnectionMeta, TreeViewport } from '../types/tree';
import { CARD_WIDTH, CARD_HEIGHT } from '../utils/treeLayout';
import { ToastMessage } from '../components/Toast';
import { getNextCardId } from '../utils/cardIdUtils';
import { logUser } from '../utils/logger';

interface UseTreeClipboardOptions {
  tree: FamilyTreeData;
  setTree: Dispatch<SetStateAction<FamilyTreeData>>;
  viewport: TreeViewport;
  selectedPersonIds: Set<string>;
  setSelectedPersonIds: Dispatch<SetStateAction<Set<string>>>;
  setSelectedPersonId: Dispatch<SetStateAction<string | null>>;
  showToast: (msg: Omit<ToastMessage, 'id'>) => void;
}

const CLIPBOARD_STORAGE_KEY = 'rodovid_clipboard_buffer';

export function useTreeClipboard({
  tree,
  setTree,
  viewport,
  selectedPersonIds,
  setSelectedPersonIds,
  setSelectedPersonId,
  showToast,
}: UseTreeClipboardOptions) {
  const [clipboardCount, setClipboardCount] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(CLIPBOARD_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed.persons) ? parsed.persons.length : 0;
      }
    } catch {
      // ignore
    }
    return 0;
  });

  const handleCopySelectedPersons = useCallback(() => {
    if (selectedPersonIds.size === 0) {
      showToast({
        type: 'warning',
        title: 'Нічого не виділено',
        message: 'Натисніть Ctrl+Клік або використайте рамку виділення, щоб вибрати особи.',
      });
      return;
    }

    const selectedList = Array.from(selectedPersonIds)
      .map((id) => tree.persons[id])
      .filter(Boolean);

    if (selectedList.length === 0) return;

    const relevantOverrides: Record<string, ConnectionMeta> = {};
    if (tree.connectionOverrides) {
      Object.entries(tree.connectionOverrides).forEach(([key, conn]) => {
        const parts = key.split('_');
        if (parts.length === 2 && selectedPersonIds.has(parts[0]) && selectedPersonIds.has(parts[1])) {
          relevantOverrides[key] = conn;
        }
      });
    }

    const buffer = {
      persons: selectedList,
      connectionOverrides: relevantOverrides,
      copiedFromTitle: tree.title || 'Родове полотно',
      copiedAt: new Date().toISOString(),
    };

    try {
      localStorage.setItem(CLIPBOARD_STORAGE_KEY, JSON.stringify(buffer));
      setClipboardCount(selectedList.length);
      logUser(`Скопійовано у буфер карток: ${selectedList.length} шт.`, {
        count: selectedList.length,
        sourceTree: tree.title,
      });
      showToast({
        type: 'success',
        title: 'Картки скопійовано у буфер',
        message: `Скопійовано осіб: ${selectedList.length}. Перейдіть в інше полотно та натисніть «Вставити».`,
      });
    } catch (err) {
      console.error('Failed to copy cards to clipboard:', err);
      showToast({
        type: 'error',
        title: 'Помилка копіювання',
        message: 'Не вдалося зберегти картки в буфер.',
      });
    }
  }, [selectedPersonIds, tree, showToast]);

  const handlePasteCopiedBuffer = useCallback(() => {
    try {
      const raw = localStorage.getItem(CLIPBOARD_STORAGE_KEY);
      if (!raw) {
        showToast({
          type: 'warning',
          title: 'Буфер порожній',
          message: 'Спочатку виділіть та скопіюйте картки з іншого полотна.',
        });
        return;
      }

      const buffer = JSON.parse(raw);
      const copiedPersons: Person[] = buffer.persons || [];
      if (copiedPersons.length === 0) return;

      const oldIdSet = new Set(copiedPersons.map((p) => p.id));
      const idMap: Record<string, string> = {};
      copiedPersons.forEach((p, idx) => {
        idMap[p.id] = `p_copy_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`;
      });

      let minX = Infinity;
      let minY = Infinity;
      copiedPersons.forEach((p) => {
        if (typeof p.x === 'number' && p.x < minX) minX = p.x;
        if (typeof p.y === 'number' && p.y < minY) minY = p.y;
      });
      if (minX === Infinity) minX = 0;
      if (minY === Infinity) minY = 0;

      const viewportCenterX = Math.round((-viewport.x + window.innerWidth / 2) / viewport.zoom);
      const viewportCenterY = Math.round((-viewport.y + window.innerHeight / 2) / viewport.zoom);

      const offsetX = viewportCenterX - minX - CARD_WIDTH / 2;
      const offsetY = viewportCenterY - minY - CARD_HEIGHT / 2;

      const newPersonsMap: Record<string, Person> = {};
      const newSelectedIds = new Set<string>();
      let nextCardNum = parseInt(getNextCardId(tree.persons), 10) || 1;

      copiedPersons.forEach((p) => {
        const newId = idMap[p.id];
        newSelectedIds.add(newId);
        const assignedCardId = String(nextCardNum++);

        const remapArray = (arr?: string[]) =>
          (arr || [])
            .map((id) => (oldIdSet.has(id) ? idMap[id] : undefined))
            .filter(Boolean) as string[];

        const remappedSiblings = p.siblings ? remapArray(p.siblings) : undefined;
        const remappedBranchLinks = (p.branchLinks || [])
          .filter((bl) => oldIdSet.has(bl.targetPersonId))
          .map((bl) => ({
            ...bl,
            id: `bl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            targetPersonId: idMap[bl.targetPersonId],
          }));

        newPersonsMap[newId] = {
          ...p,
          id: newId,
          cardId: assignedCardId,
          x: Math.round(p.x + offsetX),
          y: Math.round(p.y + offsetY),
          parents: remapArray(p.parents),
          children: remapArray(p.children),
          spouses: remapArray(p.spouses),
          siblings: remappedSiblings && remappedSiblings.length > 0 ? remappedSiblings : undefined,
          branchLinks: remappedBranchLinks.length > 0 ? remappedBranchLinks : undefined,
        };
      });

      const newConnectionOverrides: Record<string, ConnectionMeta> = {
        ...(tree.connectionOverrides || {}),
      };
      if (buffer.connectionOverrides) {
        Object.entries(buffer.connectionOverrides as Record<string, ConnectionMeta>).forEach(
          ([key, conn]) => {
            const parts = key.split('_');
            if (parts.length === 2 && idMap[parts[0]] && idMap[parts[1]]) {
              const newKey = `${idMap[parts[0]]}_${idMap[parts[1]]}`;
              newConnectionOverrides[newKey] = { ...conn };
            }
          }
        );
      }

      setTree((prev) => ({
        ...prev,
        persons: {
          ...prev.persons,
          ...newPersonsMap,
        },
        connectionOverrides: newConnectionOverrides,
        updatedAt: new Date().toISOString(),
      }));

      setSelectedPersonIds(newSelectedIds);
      if (copiedPersons.length > 0) {
        setSelectedPersonId(idMap[copiedPersons[0].id]);
      }

      logUser(`Вставлено з буфера карток: ${copiedPersons.length} шт.`, {
        count: copiedPersons.length,
        sourceTitle: buffer.copiedFromTitle,
        targetTreeId: tree.id,
      }, 'success');
      showToast({
        type: 'success',
        title: 'Картки успішно вставлено',
        message: `Вставлено ${copiedPersons.length} осіб із джерела "${buffer.copiedFromTitle || 'Інше полотно'}"!`,
      });
    } catch (err) {
      console.error('Failed to paste copied cards:', err);
      showToast({
        type: 'error',
        title: 'Помилка вставки',
        message: 'Не вдалося прочитати скопійовані картки.',
      });
    }
  }, [viewport, tree.id, tree.persons, tree.connectionOverrides, setTree, setSelectedPersonIds, setSelectedPersonId, showToast]);

  const handleCancelCopyClipboard = useCallback(() => {
    try {
      localStorage.removeItem(CLIPBOARD_STORAGE_KEY);
    } catch {
      // ignore
    }
    setClipboardCount(0);
    logUser('Очищено буфер скопійованих карток');
    showToast({
      type: 'info',
      title: 'Копіювання скасовано',
      message: 'Буфер скопійованих карток очищено.',
    });
  }, [showToast]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement ||
        (e.target as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
        if (selectedPersonIds.size > 0) {
          e.preventDefault();
          handleCopySelectedPersons();
        }
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
        if (clipboardCount > 0) {
          e.preventDefault();
          handlePasteCopiedBuffer();
        }
      } else if (e.key === 'Escape') {
        setSelectedPersonIds(new Set());
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    selectedPersonIds,
    clipboardCount,
    handleCopySelectedPersons,
    handlePasteCopiedBuffer,
    setSelectedPersonIds,
  ]);

  return {
    clipboardCount,
    handleCopySelectedPersons,
    handlePasteCopiedBuffer,
    handleCancelCopyClipboard,
  };
}
