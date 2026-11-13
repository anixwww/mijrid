import { CrossCanvasLink, Person } from '../types/tree';
import { formatCardId } from './cardIdUtils';
import {
  loadTreeById,
  MAIN_TREE_ID,
  notifyTreesChanged,
  setUnsyncedFirebaseChangesStorage,
  syncTreeToServer,
} from './fileStorage';
import {
  isCloudWriteAuthenticated,
  saveTreeToFirestore,
} from './firestoreTreeService';
import { logDatabase, logTree } from './logger';

export function normalizeCanvasId(treeId?: string): string {
  const raw = (treeId || '').trim();
  if (!raw || raw === MAIN_TREE_ID || raw === 'main-tree' || raw === 'default-tree') {
    return MAIN_TREE_ID;
  }
  return raw;
}

export function isSameCanvasId(a?: string, b?: string): boolean {
  return normalizeCanvasId(a) === normalizeCanvasId(b);
}

/**
 * Returns normalized cross-canvas links for a person, seamlessly including legacy
 * `targetCanvasId` / `targetCanvasTitle` if not already represented in `crossCanvasLinks`.
 */
export function getPersonCrossCanvasLinks(person: Person): CrossCanvasLink[] {
  const list: CrossCanvasLink[] = Array.isArray(person.crossCanvasLinks)
    ? person.crossCanvasLinks.filter((l) => Boolean(l && l.targetCanvasId))
    : [];

  if (person.targetCanvasId) {
    const legacyCanvasNorm = normalizeCanvasId(person.targetCanvasId);
    const alreadyPresent = list.some(
      (l) =>
        normalizeCanvasId(l.targetCanvasId) === legacyCanvasNorm &&
        (!person.targetCanvasPersonId || l.targetPersonId === person.targetCanvasPersonId)
    );
    if (!alreadyPresent) {
      list.push({
        id: 'legacy-canvas-link',
        targetCanvasId: person.targetCanvasId,
        targetCanvasTitle: person.targetCanvasTitle || 'Інше полотно',
        targetPersonId: person.targetCanvasPersonId || '',
        color: '#047857',
      });
    }
  }

  return list;
}

export function upsertCrossCanvasLinkList(
  existing: CrossCanvasLink[] | undefined,
  link: Omit<CrossCanvasLink, 'id'> & { id?: string }
): CrossCanvasLink[] {
  const list = [...(existing || [])];
  const targetCanvasNorm = normalizeCanvasId(link.targetCanvasId);
  const existingIdx = list.findIndex(
    (item) =>
      normalizeCanvasId(item.targetCanvasId) === targetCanvasNorm &&
      item.targetPersonId === link.targetPersonId
  );

  const normalizedItem: CrossCanvasLink = {
    id: link.id || `ccl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    targetCanvasId: link.targetCanvasId,
    targetCanvasTitle: link.targetCanvasTitle?.trim() || undefined,
    targetPersonId: link.targetPersonId,
    targetPersonName: link.targetPersonName?.trim() || undefined,
    targetCardId: link.targetCardId?.trim() || undefined,
    label: link.label?.trim() || undefined,
    color: link.color?.trim() || '#047857',
  };

  if (existingIdx !== -1) {
    list[existingIdx] = {
      ...list[existingIdx],
      ...normalizedItem,
      id: list[existingIdx].id,
    };
    return list;
  }

  return [...list, normalizedItem];
}

export function removeCrossCanvasLinkFromPerson(person: Person, linkId: string): Person {
  if (linkId === 'legacy-canvas-link') {
    return {
      ...person,
      targetCanvasId: undefined,
      targetCanvasTitle: undefined,
      targetCanvasPersonId: undefined,
    };
  }

  const currentList = person.crossCanvasLinks || [];
  const removed = currentList.find((l) => l.id === linkId);
  const nextList = currentList.filter((l) => l.id !== linkId);

  let nextTargetCanvasId = person.targetCanvasId;
  let nextTargetCanvasTitle = person.targetCanvasTitle;
  let nextTargetCanvasPersonId = person.targetCanvasPersonId;

  if (
    removed &&
    person.targetCanvasId &&
    isSameCanvasId(person.targetCanvasId, removed.targetCanvasId) &&
    (!person.targetCanvasPersonId || person.targetCanvasPersonId === removed.targetPersonId)
  ) {
    nextTargetCanvasId = undefined;
    nextTargetCanvasTitle = undefined;
    nextTargetCanvasPersonId = undefined;
  }

  return {
    ...person,
    crossCanvasLinks: nextList.length > 0 ? nextList : undefined,
    targetCanvasId: nextTargetCanvasId,
    targetCanvasTitle: nextTargetCanvasTitle,
    targetCanvasPersonId: nextTargetCanvasPersonId,
  };
}

export interface ReciprocalCrossCanvasInput {
  sourceTreeId: string;
  sourceTreeTitle: string;
  sourcePerson: Person;
  targetCanvasId: string;
  targetPersonId: string;
  label?: string;
  color?: string;
}

/**
 * Persists a reciprocal cross-canvas link onto the target card in the target canvas,
 * updates local/Express storage, marks Firebase unsynced, and immediately writes to
 * Firestore if cloud authentication is active.
 */
export async function createReciprocalCrossCanvasLinkOnTargetTree(
  input: ReciprocalCrossCanvasInput
): Promise<boolean> {
  try {
    const targetTree = await loadTreeById(input.targetCanvasId, {
      allowEmpty: true,
      includeCloud: true,
    });
    if (!targetTree || !targetTree.persons || !targetTree.persons[input.targetPersonId]) {
      return false;
    }

    const targetPerson = targetTree.persons[input.targetPersonId];
    const sourceName =
      [input.sourcePerson.firstName, input.sourcePerson.lastName].filter(Boolean).join(' ').trim() ||
      'Картка';

    const nextLinks = upsertCrossCanvasLinkList(targetPerson.crossCanvasLinks, {
      targetCanvasId: normalizeCanvasId(input.sourceTreeId),
      targetCanvasTitle: input.sourceTreeTitle || 'Родове полотно',
      targetPersonId: input.sourcePerson.id,
      targetPersonName: sourceName,
      targetCardId: formatCardId(input.sourcePerson),
      label: input.label,
      color: input.color,
    });

    const updatedTree = {
      ...targetTree,
      updatedAt: new Date().toISOString(),
      persons: {
        ...targetTree.persons,
        [input.targetPersonId]: {
          ...targetPerson,
          crossCanvasLinks: nextLinks,
        },
      },
    };

    const serverSaved = await syncTreeToServer(updatedTree);
    setUnsyncedFirebaseChangesStorage(true);
    notifyTreesChanged();

    logTree(
      `Створено зворотне міжгілкове посилання на полотні «${updatedTree.title}» (${sourceName} ↔ ${[targetPerson.firstName, targetPerson.lastName].filter(Boolean).join(' ') || input.targetPersonId})`,
      {
        sourceTreeId: input.sourceTreeId,
        targetCanvasId: updatedTree.id,
        targetPersonId: input.targetPersonId,
        serverSaved,
      },
      'success'
    );

    if (isCloudWriteAuthenticated()) {
      void saveTreeToFirestore(updatedTree.id, updatedTree, undefined, undefined, true).catch((err) => {
        logDatabase('Не вдалося одразу зберегти зворотне посилання в Firebase', {
          targetCanvasId: updatedTree.id,
          error: String(err),
        }, 'warn');
      });
    }

    return true;
  } catch (err) {
    console.warn('Failed to create reciprocal cross-canvas link:', err);
    return false;
  }
}

/**
 * Syncs newly added cross-canvas links from a saved person in EditPersonModal
 * onto their target canvases reciprocally.
 */
export async function syncReciprocalCrossCanvasLinksOnSave(
  sourceTreeId: string,
  sourceTreeTitle: string,
  prevPerson: Person | undefined,
  updatedPerson: Person
): Promise<void> {
  const prevLinks = getPersonCrossCanvasLinks(prevPerson || updatedPerson);
  const nextLinks = getPersonCrossCanvasLinks(updatedPerson);
  if (nextLinks.length === 0) return;

  const prevKeys = new Set(
    prevLinks.map((l) => `${normalizeCanvasId(l.targetCanvasId)}::${l.targetPersonId || ''}`)
  );

  for (const link of nextLinks) {
    if (!link.targetCanvasId || !link.targetPersonId) continue;
    const key = `${normalizeCanvasId(link.targetCanvasId)}::${link.targetPersonId}`;
    if (prevPerson && prevKeys.has(key)) continue;

    await createReciprocalCrossCanvasLinkOnTargetTree({
      sourceTreeId,
      sourceTreeTitle,
      sourcePerson: updatedPerson,
      targetCanvasId: link.targetCanvasId,
      targetPersonId: link.targetPersonId,
      label: link.label,
      color: link.color,
    });
  }
}
