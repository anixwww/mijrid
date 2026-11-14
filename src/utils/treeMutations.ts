import {
  FamilyTreeData,
  Person,
  RelativeType,
  ConnectionMeta,
  ConnectionLine,
  BranchLink,
  BranchLinkCurveStyle,
  BranchLinkKind,
  GuestSuggestion,
  ProposalCardMeta,
} from '../types/tree';
import { CARD_WIDTH, GEN_Y_SPACING, COUPLE_SPOUSE_OFFSET, COUPLE_ADJACENCY_THRESHOLD } from './treeLayout';
import { extractBirthYear, yearToY, DEFAULT_PIXELS_PER_YEAR } from './timelineUtils';
import { normalizeBranchLineShape } from './branchLinkGeometry';
import { getNextCardId } from './cardIdUtils';
import { ConnectOptions } from '../components/ConnectPersonsModal';

export interface AddRelativeInput {
  relationType?: RelativeType;
  eventType?: 'marriage' | 'cohabitation' | 'divorce';
  eventDate?: string;
  markPreviousSpouseDivorced?: boolean;
  previousSpouseIdToDivorce?: string;
  linkAllExistingChildren?: boolean;
  firstName: string;
  lastName: string;
  maidenName?: string;
  nickname?: string;
  gender: 'male' | 'female' | 'unknown';
  yearsDisplay?: string;
  birthDate?: string;
  birthDay?: string;
  birthMonth?: string;
  birthYear?: string;
  birthYearEnd?: string;
  isBirthDateApproximate?: boolean;
  birthDateType?: 'exact' | 'period' | 'about';
  deathDate?: string;
  deathDay?: string;
  deathMonth?: string;
  deathYear?: string;
  isDeceased?: boolean;
  houseNumber?: string;
  birthPlace?: string;
  residencePlace?: string;
  deathPlace?: string;
  burialPlace?: string;
  profession?: string;
  deathCause?: string;
  godparents?: string;
  cardBgColor?: string;
  isVerified?: boolean;
  avatarUrl?: string;
  flagEmoji?: string;
  notes?: string;
}

/**
 * Helper to shift colliding cards to the right so newly inserted cards do not overlap.
 */
export function shiftCollidingCards(
  all: Record<string, Person>,
  x: number,
  y: number,
  widthNeeded = 130
): void {
  const colliding = Object.values(all).filter(
    (p) => Math.abs(p.y - y) < 85 && p.x >= x - 15
  );
  if (colliding.length > 0) {
    colliding.forEach((p) => {
      all[p.id] = {
        ...all[p.id],
        x: all[p.id].x + widthNeeded,
      };
    });
  }
}

export function applyAddRelative(
  prev: FamilyTreeData,
  target: Person | null,
  data: AddRelativeInput,
  startYear: number
): { nextTree: FamilyTreeData; newId: string; isFirstCard: boolean; newX: number; newY: number } {
  const newId = `p-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const additionalConnOverrides: Record<string, ConnectionMeta> = {};

  const mockPerson: Person = {
    id: newId,
    firstName: data.firstName,
    lastName: data.lastName,
    gender: data.gender,
    yearsDisplay: data.yearsDisplay,
    birthDate: data.birthDate,
    birthYear: data.birthYear,
    parents: [],
    spouses: [],
    children: [],
    x: 0,
    y: 0,
  };
  const enteredBirthYear = extractBirthYear(mockPerson);

  let newX = 350;
  let newY = 700;

  const newParents: string[] = [];
  const newSpouses: string[] = [];
  const newChildren: string[] = [];
  let newPersonSiblings: string[] = [];
  const updatedPersons: Record<string, Person> = { ...prev.persons };

  if (!target) {
    if (enteredBirthYear) {
      newY = yearToY(enteredBirthYear, startYear, DEFAULT_PIXELS_PER_YEAR);
    } else {
      newY = yearToY(1980, startYear, DEFAULT_PIXELS_PER_YEAR);
    }

    const existingPersons = Object.values(prev.persons);
    if (existingPersons.length > 0) {
      const maxX = Math.max(...existingPersons.map((p) => p.x));
      const avgY = existingPersons.reduce((sum, p) => sum + p.y, 0) / existingPersons.length;
      newX = maxX + 240;
      newY = Math.round(avgY);
    } else {
      newX = 400;
    }
  } else {
    const targetBirthYear = extractBirthYear(target);

    switch (data.relationType) {
      case 'father':
      case 'mother':
      case 'parent': {
        if (enteredBirthYear) {
          newY = yearToY(enteredBirthYear, startYear, DEFAULT_PIXELS_PER_YEAR);
        } else if (targetBirthYear) {
          newY = yearToY(targetBirthYear - 28, startYear, DEFAULT_PIXELS_PER_YEAR);
        } else {
          newY = target.y - GEN_Y_SPACING;
        }

        const currentParents = target.parents || [];
        if (currentParents.length === 0) {
          if (data.relationType === 'father') {
            newX = target.x - 62;
          } else if (data.relationType === 'mother') {
            newX = target.x + 62;
          } else {
            newX = target.x;
          }
        } else {
          const firstParent = updatedPersons[currentParents[0]];
          if (firstParent) {
            newY = firstParent.y;
            if (data.relationType === 'mother' || data.gender === 'female') {
              newX = firstParent.x + CARD_WIDTH;
            } else {
              newX = firstParent.x - CARD_WIDTH;
            }
            updatedPersons[firstParent.id] = {
              ...firstParent,
              spouses: firstParent.spouses.includes(newId)
                ? firstParent.spouses
                : [...firstParent.spouses, newId],
            };
            newSpouses.push(firstParent.id);

            (firstParent.children || []).forEach((cId) => {
              if (!newChildren.includes(cId)) newChildren.push(cId);
              const c = updatedPersons[cId];
              if (c && !c.parents.includes(newId)) {
                updatedPersons[cId] = {
                  ...c,
                  parents: [...c.parents, newId],
                };
              }
            });
          }
        }

        shiftCollidingCards(updatedPersons, newX, newY, 130);

        if (!newChildren.includes(target.id)) newChildren.push(target.id);
        updatedPersons[target.id] = {
          ...(updatedPersons[target.id] || target),
          parents: [...(target.parents || []), newId],
        };
        break;
      }

      case 'spouse': {
        newY = target.y;
        const existingSpouses = (target.spouses || []).map((sId) => updatedPersons[sId]).filter(Boolean);

        if (
          data.markPreviousSpouseDivorced &&
          data.previousSpouseIdToDivorce &&
          updatedPersons[data.previousSpouseIdToDivorce]
        ) {
          const prevSpouse = updatedPersons[data.previousSpouseIdToDivorce];
          const prevMKey = [target.id, prevSpouse.id].sort().join('::');

          additionalConnOverrides[`marriage:${prevMKey}`] = {
            ...(prev.connectionOverrides?.[`marriage:${prevMKey}`] || { verified: true }),
            eventType: 'divorce',
            label: 'Розлучення',
            color: '#e11d48',
          };

          const movedX = target.x - CARD_WIDTH - 80;
          updatedPersons[prevSpouse.id] = {
            ...prevSpouse,
            x: movedX,
          };
          shiftCollidingCards(updatedPersons, movedX, prevSpouse.y, 110);
        }

        const activeSpouses = existingSpouses.filter((sp) => {
          const mKey = [target.id, sp.id].sort().join('::');
          return (
            prev.connectionOverrides?.[`marriage:${mKey}`]?.eventType !== 'divorce' &&
            sp.id !== data.previousSpouseIdToDivorce
          );
        });

        if (data.eventType === 'divorce') {
          newX = target.x - CARD_WIDTH - 80;
        } else if (activeSpouses.length > 0 && !data.markPreviousSpouseDivorced) {
          const maxX = Math.max(target.x, ...existingSpouses.map((s) => s.x));
          newX = maxX + CARD_WIDTH + 60;
        } else {
          newX = target.x + COUPLE_SPOUSE_OFFSET;
        }

        shiftCollidingCards(updatedPersons, newX, newY, 120);

        newSpouses.push(target.id);
        updatedPersons[target.id] = {
          ...(updatedPersons[target.id] || target),
          spouses: [...(target.spouses || []), newId],
        };

        const shouldLinkChildren =
          data.linkAllExistingChildren !== undefined
            ? data.linkAllExistingChildren
            : existingSpouses.length === 0;

        if (shouldLinkChildren && target.children && target.children.length > 0) {
          target.children.forEach((cId) => {
            const child = updatedPersons[cId];
            if (child && !child.parents.includes(newId)) {
              updatedPersons[cId] = {
                ...child,
                parents: [...child.parents, newId],
              };
              newChildren.push(child.id);
            }
          });
        }
        break;
      }

      case 'child':
      case 'son':
      case 'daughter': {
        if (enteredBirthYear) {
          newY = yearToY(enteredBirthYear, startYear, DEFAULT_PIXELS_PER_YEAR);
        } else if (targetBirthYear) {
          newY = yearToY(targetBirthYear + 28, startYear, DEFAULT_PIXELS_PER_YEAR);
        } else {
          newY = target.y + GEN_Y_SPACING;
        }

        const spouseIds = target.spouses || [];
        const primarySpouse = spouseIds.length > 0 ? updatedPersons[spouseIds[0]] : null;

        const existingChildIds = Array.from(
          new Set([...(target.children || []), ...(primarySpouse?.children || [])])
        );

        if (existingChildIds.length === 0) {
          newX = primarySpouse ? Math.round((target.x + primarySpouse.x) / 2) : target.x;
        } else {
          const maxChildX = Math.max(
            ...existingChildIds.map((cid) => updatedPersons[cid]?.x ?? target.x)
          );
          newX = maxChildX + 130;
        }

        shiftCollidingCards(updatedPersons, newX, newY, 130);

        newParents.push(target.id);
        spouseIds.forEach((spouseId) => {
          if (updatedPersons[spouseId] && !newParents.includes(spouseId)) {
            newParents.push(spouseId);
            updatedPersons[spouseId] = {
              ...updatedPersons[spouseId],
              children: [...(updatedPersons[spouseId].children || []), newId],
            };
          }
        });

        updatedPersons[target.id] = {
          ...(updatedPersons[target.id] || target),
          children: [...(target.children || []), newId],
        };
        break;
      }

      case 'sibling':
      case 'brother':
      case 'sister': {
        if (enteredBirthYear) {
          newY = yearToY(enteredBirthYear, startYear, DEFAULT_PIXELS_PER_YEAR);
        } else {
          newY = target.y;
        }

        const familyUnitXs = [
          target.x,
          ...(target.spouses || []).map((sid) => updatedPersons[sid]?.x ?? target.x),
        ];
        const maxFamilyUnitX = Math.max(...familyUnitXs);

        const existingSiblingIds =
          target.parents && target.parents.length > 0
            ? Array.from(
                new Set(
                  target.parents
                    .flatMap((pid) => updatedPersons[pid]?.children || [])
                    .filter((cid) => cid !== target.id)
                )
              )
            : target.siblings || [];

        const existingSiblingXs = existingSiblingIds
          .map((sid) => updatedPersons[sid]?.x)
          .filter((x): x is number => x !== undefined);

        newX = Math.max(maxFamilyUnitX, ...existingSiblingXs) + 130;

        shiftCollidingCards(updatedPersons, newX, newY, 130);

        if (target.parents && target.parents.length > 0) {
          target.parents.forEach((pId) => {
            newParents.push(pId);
            const p = updatedPersons[pId];
            if (p && !p.children.includes(newId)) {
              updatedPersons[pId] = {
                ...p,
                children: [...p.children, newId],
              };
            }
          });
        } else {
          updatedPersons[target.id] = {
            ...updatedPersons[target.id],
            siblings: Array.from(new Set([...(updatedPersons[target.id].siblings || []), newId])),
          };
          newPersonSiblings = Array.from(
            new Set([target.id, ...(updatedPersons[target.id].siblings || []).filter((id) => id !== newId)])
          );
          existingSiblingIds.forEach((sid) => {
            if (updatedPersons[sid]) {
              updatedPersons[sid] = {
                ...updatedPersons[sid],
                siblings: Array.from(new Set([...(updatedPersons[sid].siblings || []), newId])),
              };
            }
          });
        }
        break;
      }
    }
  }

  const unverifiedRelations: string[] = [];
  if (target && data.isVerified === false) {
    unverifiedRelations.push(target.id);
    if (updatedPersons[target.id]) {
      updatedPersons[target.id] = {
        ...updatedPersons[target.id],
        unverifiedRelations: [...(updatedPersons[target.id].unverifiedRelations || []), newId],
      };
    }
  }

  const newPerson: Person = {
    id: newId,
    cardId: getNextCardId(prev.persons),
    firstName: data.firstName,
    lastName: data.lastName,
    maidenName: data.maidenName,
    nickname: data.nickname,
    gender: data.gender,
    yearsDisplay: data.yearsDisplay,
    birthDate: data.birthDate,
    birthDay: data.birthDay,
    birthMonth: data.birthMonth,
    birthYear: data.birthYear,
    birthYearEnd: data.birthYearEnd,
    isBirthDateApproximate: data.isBirthDateApproximate,
    birthDateType: data.birthDateType,
    deathDate: data.deathDate,
    deathDay: data.deathDay,
    deathMonth: data.deathMonth,
    deathYear: data.deathYear,
    isDeceased: data.isDeceased,
    houseNumber: data.houseNumber,
    birthPlace: data.birthPlace,
    residencePlace: data.residencePlace,
    deathPlace: data.deathPlace,
    burialPlace: data.burialPlace,
    profession: data.profession,
    deathCause: data.deathCause,
    godparents: data.godparents,
    cardBgColor: data.cardBgColor,
    unverifiedRelations,
    avatarUrl: data.avatarUrl,
    flagEmoji: data.flagEmoji,
    notes: data.notes,
    parents: newParents,
    spouses: newSpouses,
    children: newChildren,
    siblings: newPersonSiblings.length > 0 ? newPersonSiblings : undefined,
    x: newX,
    y: newY,
  };

  const isFirstCard = Object.keys(prev.persons).length === 0;
  updatedPersons[newId] = newPerson;

  const connOverrides = { ...(prev.connectionOverrides || {}), ...additionalConnOverrides };
  if (target && data.relationType === 'spouse') {
    const mKey = [target.id, newId].sort().join('::');
    connOverrides[`marriage:${mKey}`] = {
      verified: data.isVerified !== false,
      eventType: data.eventType || 'marriage',
      eventDate: data.eventDate,
      label:
        data.eventType === 'divorce'
          ? 'Розлучення'
          : data.eventType === 'cohabitation'
          ? 'Пара (без шлюбу)'
          : 'Шлюб',
      color: data.eventType === 'divorce' ? '#e11d48' : undefined,
    };
  }

  return {
    nextTree: {
      ...prev,
      persons: updatedPersons,
      connectionOverrides: connOverrides,
      selectedPersonId: newId,
      updatedAt: new Date().toISOString(),
    },
    newId,
    isFirstCard,
    newX,
    newY,
  };
}

function applyConnectionVerificationToPersons(
  personsCopy: Record<string, Person>,
  connectionId: string,
  verified: boolean
): void {
  if (connectionId.startsWith('marriage:')) {
    const raw = connectionId.replace(/^marriage:/, '');
    const ids = raw.includes('::') ? raw.split('::') : raw.split(':');
    if (ids.length >= 2) {
      const [id1, id2] = ids;
      const p1 = personsCopy[id1];
      const p2 = personsCopy[id2];
      if (p1) {
        const list = p1.unverifiedRelations || [];
        personsCopy[id1] = {
          ...p1,
          unverifiedRelations: verified
            ? list.filter((id) => id !== id2)
            : list.includes(id2)
            ? list
            : [...list, id2],
        };
      }
      if (p2) {
        const list = p2.unverifiedRelations || [];
        personsCopy[id2] = {
          ...p2,
          unverifiedRelations: verified
            ? list.filter((id) => id !== id1)
            : list.includes(id1)
            ? list
            : [...list, id1],
        };
      }
    }
  } else if (connectionId.startsWith('descent:child:')) {
    const raw = connectionId.replace(/^descent:child:/, '');
    const lastColonIndex = raw.lastIndexOf(':');
    if (lastColonIndex !== -1) {
      const pKey = raw.substring(0, lastColonIndex);
      const childId = raw.substring(lastColonIndex + 1);
      const parentIds = (pKey.includes('::') ? pKey.split('::') : [pKey]).filter(Boolean);
      const child = personsCopy[childId];
      if (child) {
        const list = child.unverifiedRelations || [];
        personsCopy[childId] = {
          ...child,
          unverifiedRelations: verified
            ? list.filter((id) => !parentIds.includes(id))
            : Array.from(new Set([...list, ...parentIds])),
        };
      }
      parentIds.forEach((pid) => {
        const parent = personsCopy[pid];
        if (parent) {
          const list = parent.unverifiedRelations || [];
          personsCopy[pid] = {
            ...parent,
            unverifiedRelations: verified
              ? list.filter((id) => id !== childId)
              : list.includes(childId)
              ? list
              : [...list, childId],
          };
        }
      });
    }
  } else if (connectionId.startsWith('sibling:')) {
    const raw = connectionId.replace(/^sibling:/, '');
    const ids = (raw.includes('::') ? raw.split('::') : raw.split(':')).filter(Boolean);
    if (ids.length >= 2) {
      ids.forEach((pid) => {
        const person = personsCopy[pid];
        if (!person) return;
        const others = ids.filter((id) => id !== pid);
        const list = person.unverifiedRelations || [];
        personsCopy[pid] = {
          ...person,
          unverifiedRelations: verified
            ? list.filter((id) => !others.includes(id))
            : Array.from(new Set([...list, ...others])),
        };
      });
    }
  }
}

export function applySaveConnectionMeta(
  prev: FamilyTreeData,
  connectionId: string,
  meta: ConnectionMeta
): FamilyTreeData {
  const personsCopy = { ...prev.persons };
  applyConnectionVerificationToPersons(personsCopy, connectionId, meta.verified);

  return {
    ...prev,
    persons: personsCopy,
    connectionOverrides: {
      ...(prev.connectionOverrides || {}),
      [connectionId]: meta,
    },
  };
}

export type BatchConnectionScope = 'between' | 'touching';

export interface BatchConnectionTargetsResult {
  connectionIds: string[];
  verifiedCount: number;
  unverifiedCount: number;
}

export function collectBatchConnectionTargets(
  persons: Record<string, Person>,
  connectionOverrides: Record<string, ConnectionMeta> | undefined,
  connections: ConnectionLine[],
  selectedIds: Set<string>,
  scope: BatchConnectionScope
): BatchConnectionTargetsResult {
  if (selectedIds.size === 0) {
    return { connectionIds: [], verifiedCount: 0, unverifiedCount: 0 };
  }

  const connectionIds: string[] = [];
  const seenIds = new Set<string>();
  let verifiedCount = 0;
  let unverifiedCount = 0;

  connections.forEach((conn) => {
    const ids = (conn.personIds || []).filter((id) => Boolean(persons[id]));
    if (ids.length === 0) return;
    if (ids.some((id) => persons[id]?.isGhost)) return;

    let matches = false;
    if (conn.type === 'marriage') {
      matches =
        scope === 'between'
          ? ids.length >= 2 && ids.every((id) => selectedIds.has(id))
          : ids.some((id) => selectedIds.has(id));
    } else if (conn.type === 'child-branch') {
      const childId = conn.toId;
      const parentIds = ids.filter((id) => id !== childId);
      if (scope === 'between') {
        matches = Boolean(
          childId &&
            selectedIds.has(childId) &&
            parentIds.some((pid) => selectedIds.has(pid))
        );
      } else {
        matches = Boolean(
          (childId && selectedIds.has(childId)) ||
            parentIds.some((pid) => selectedIds.has(pid))
        );
      }
    } else if (conn.type === 'sibling-tie') {
      matches =
        scope === 'between'
          ? ids.filter((id) => selectedIds.has(id)).length >= 2
          : ids.some((id) => selectedIds.has(id));
    }

    if (matches && !seenIds.has(conn.id)) {
      seenIds.add(conn.id);
      connectionIds.push(conn.id);
      if (conn.isVerified) {
        verifiedCount += 1;
      } else {
        unverifiedCount += 1;
      }
    }
  });

  // Also include adjacent CoupleCard marriages (not emitted as SVG lines in generateConnections)
  const processedMarriageIds = new Set<string>();
  Object.values(persons).forEach((p1) => {
    if (!p1 || p1.isGhost || !p1.spouses || p1.spouses.length === 0) return;
    p1.spouses.forEach((spouseId) => {
      const p2 = persons[spouseId];
      if (!p2 || p2.isGhost) return;
      const mKey = [p1.id, p2.id].sort().join('::');
      const connId = `marriage:${mKey}`;
      if (processedMarriageIds.has(connId) || seenIds.has(connId)) return;
      processedMarriageIds.add(connId);

      const matches =
        scope === 'between'
          ? selectedIds.has(p1.id) && selectedIds.has(p2.id)
          : selectedIds.has(p1.id) || selectedIds.has(p2.id);

      if (!matches) return;

      const override = connectionOverrides?.[connId];
      const isDivorced = override?.eventType === 'divorce';
      const isVerified =
        isDivorced ||
        (override?.verified !== undefined
          ? override.verified
          : Boolean(p1.isFullyVerified) &&
            Boolean(p2.isFullyVerified) &&
            !p1.unverifiedRelations?.includes(p2.id) &&
            !p2.unverifiedRelations?.includes(p1.id));

      seenIds.add(connId);
      connectionIds.push(connId);
      if (isVerified) {
        verifiedCount += 1;
      } else {
        unverifiedCount += 1;
      }
    });
  });

  return { connectionIds, verifiedCount, unverifiedCount };
}

export function applyBatchConnectionsVerification(
  prev: FamilyTreeData,
  connectionIds: string[],
  verified: boolean
): FamilyTreeData {
  if (connectionIds.length === 0) return prev;

  const personsCopy: Record<string, Person> = { ...prev.persons };
  const overridesCopy: Record<string, ConnectionMeta> = {
    ...(prev.connectionOverrides || {}),
  };

  const uniqueIds = Array.from(new Set(connectionIds));
  uniqueIds.forEach((connectionId) => {
    applyConnectionVerificationToPersons(personsCopy, connectionId, verified);
    overridesCopy[connectionId] = {
      ...(overridesCopy[connectionId] || {}),
      verified,
      confidenceLevel: verified ? 'verified' : 'hypothetical',
    };
  });

  return {
    ...prev,
    persons: personsCopy,
    connectionOverrides: overridesCopy,
  };
}

export function applyDisconnectCouple(
  prev: FamilyTreeData,
  id1: string,
  id2: string
): FamilyTreeData {
  const p1 = prev.persons[id1];
  const p2 = prev.persons[id2];
  if (!p1 || !p2) return prev;

  const mKey = [id1, id2].sort().join('::');
  const connectionOverrides = { ...(prev.connectionOverrides || {}) };

  connectionOverrides[`marriage:${mKey}`] = {
    ...(connectionOverrides[`marriage:${mKey}`] || { verified: true }),
    eventType: 'divorce',
    label: 'Розлучення',
    color: '#e11d48',
  };

  const updatedPersons: Record<string, Person> = { ...prev.persons };
  const leftP = p1.x <= p2.x ? p1 : p2;
  const rightP = p1.x <= p2.x ? p2 : p1;
  const newRightX = leftP.x + CARD_WIDTH + 80;

  updatedPersons[leftP.id] = { ...leftP };
  updatedPersons[rightP.id] = {
    ...updatedPersons[rightP.id],
    x: newRightX,
  };

  shiftCollidingCards(updatedPersons, newRightX, rightP.y, 100);

  return {
    ...prev,
    persons: updatedPersons,
    connectionOverrides,
  };
}

export function applyReuniteCouple(
  prev: FamilyTreeData,
  id1: string,
  id2: string
): FamilyTreeData {
  const p1 = prev.persons[id1];
  const p2 = prev.persons[id2];
  if (!p1 || !p2) return prev;

  const mKey = [id1, id2].sort().join('::');
  const connectionOverrides = { ...(prev.connectionOverrides || {}) };

  connectionOverrides[`marriage:${mKey}`] = {
    ...(connectionOverrides[`marriage:${mKey}`] || { verified: true }),
    eventType: 'marriage',
    label: 'Шлюб',
    color: undefined,
  };

  const updatedPersons: Record<string, Person> = { ...prev.persons };
  const leftP = p1.x <= p2.x ? p1 : p2;
  const rightP = p1.x <= p2.x ? p2 : p1;

  updatedPersons[leftP.id] = { ...leftP };
  updatedPersons[rightP.id] = {
    ...updatedPersons[rightP.id],
    x: leftP.x + COUPLE_SPOUSE_OFFSET,
    y: leftP.y,
  };

  return {
    ...prev,
    persons: updatedPersons,
    connectionOverrides,
  };
}

export function applyRemoveConnection(
  prev: FamilyTreeData,
  connectionId: string
): FamilyTreeData {
  const persons = { ...prev.persons };
  const connectionOverrides = { ...(prev.connectionOverrides || {}) };
  delete connectionOverrides[connectionId];

  if (connectionId.startsWith('marriage:') || connectionId.startsWith('cohabitation:')) {
    const raw = connectionId.replace(/^(marriage|cohabitation):/, '');
    const ids = raw.includes('::') ? raw.split('::') : raw.split(':');
    if (ids.length >= 2) {
      const [id1, id2] = ids;
      if (persons[id1]) {
        persons[id1] = {
          ...persons[id1],
          spouses: (persons[id1].spouses || []).filter((id) => id !== id2),
        };
      }
      if (persons[id2]) {
        persons[id2] = {
          ...persons[id2],
          spouses: (persons[id2].spouses || []).filter((id) => id !== id1),
        };
      }
      if (persons[id1] && persons[id2]) {
        const leftP = persons[id1].x <= persons[id2].x ? persons[id1] : persons[id2];
        const rightP = persons[id1].x <= persons[id2].x ? persons[id2] : persons[id1];
        if (
          Math.abs(rightP.x - leftP.x) <= COUPLE_ADJACENCY_THRESHOLD &&
          Math.abs(rightP.y - leftP.y) <= 40
        ) {
          persons[rightP.id] = {
            ...persons[rightP.id],
            x: leftP.x + CARD_WIDTH + 52,
          };
        }
      }
    }
  } else if (connectionId.startsWith('descent:child:')) {
    const raw = connectionId.replace('descent:child:', '');
    const lastColonIndex = raw.lastIndexOf(':');
    if (lastColonIndex !== -1) {
      const pKey = raw.substring(0, lastColonIndex);
      const childId = raw.substring(lastColonIndex + 1);
      const parentIds = pKey.split('::');

      const child = persons[childId];
      if (child && child.parents) {
        persons[childId] = {
          ...child,
          parents: child.parents.filter((pid) => !parentIds.includes(pid)),
          unverifiedRelations: (child.unverifiedRelations || []).filter(
            (pid) => !parentIds.includes(pid)
          ),
        };
      }

      parentIds.forEach((pid) => {
        if (persons[pid]) {
          persons[pid] = {
            ...persons[pid],
            children: (persons[pid].children || []).filter((cid) => cid !== childId),
            unverifiedRelations: (persons[pid].unverifiedRelations || []).filter(
              (cid) => cid !== childId
            ),
          };
        }
      });
    }
  } else if (connectionId.startsWith('descent:')) {
    const parentIds = connectionId.replace('descent:', '').split('::');

    Object.keys(persons).forEach((childId) => {
      const child = persons[childId];
      if (!child || !child.parents) return;
      const hasThisParentGroup = parentIds.every((pid) => child.parents.includes(pid));
      if (hasThisParentGroup) {
        persons[childId] = {
          ...child,
          parents: child.parents.filter((pid) => !parentIds.includes(pid)),
        };
      }
    });

    parentIds.forEach((pid) => {
      if (persons[pid]) {
        const currentChildren = persons[pid].children || [];
        persons[pid] = {
          ...persons[pid],
          children: currentChildren.filter((cid) => {
            const child = persons[cid];
            return child && child.parents && child.parents.includes(pid);
          }),
        };
      }
    });
  } else if (connectionId.startsWith('sibling:')) {
    const ids = connectionId.replace('sibling:', '').split('::');
    ids.forEach((id) => {
      if (persons[id] && persons[id].siblings) {
        persons[id] = {
          ...persons[id],
          siblings: persons[id].siblings.filter((sibId) => !ids.includes(sibId)),
        };
      }
    });
  }

  return {
    ...prev,
    persons,
    connectionOverrides,
  };
}

export function applyConnectPersons(
  prev: FamilyTreeData,
  sourceId: string,
  targetId: string,
  relationType: RelativeType,
  options?: ConnectOptions
): FamilyTreeData {
  const persons = { ...prev.persons };
  const connectionOverrides = { ...(prev.connectionOverrides || {}) };
  const sourceBase = persons[sourceId];
  const targetBase = persons[targetId];
  if (!sourceBase || !targetBase) return prev;

  const source = { ...sourceBase };
  const target = { ...targetBase };

  const isVerified = options ? options.verified : true;
  const confidenceLevel = options?.confidenceLevel || (isVerified ? 'verified' : 'hypothetical');
  const archiveSource = options?.archiveSource;
  const isMainBranch = options?.isMainBranch || false;

  const applyUnverified = (p1: Person, p2Id: string, unverified: boolean) => {
    const list = p1.unverifiedRelations || [];
    if (unverified) {
      if (!list.includes(p2Id)) p1.unverifiedRelations = [...list, p2Id];
    } else {
      p1.unverifiedRelations = list.filter((id) => id !== p2Id);
    }
  };

  switch (relationType) {
    case 'spouse': {
      if (!source.spouses.includes(targetId)) source.spouses = [...source.spouses, targetId];
      if (!target.spouses.includes(sourceId)) target.spouses = [...target.spouses, sourceId];

      applyUnverified(source, targetId, !isVerified);
      applyUnverified(target, sourceId, !isVerified);

      if (options?.linkExistingSpouseChildren && target.children && target.children.length > 0) {
        target.children.forEach((cId) => {
          const child = persons[cId];
          if (child && !child.parents.includes(sourceId)) {
            persons[cId] = {
              ...child,
              parents: [...child.parents, sourceId],
            };
            if (!source.children.includes(cId)) {
              source.children = [...source.children, cId];
            }
          }
        });
      }

      const mKey = [sourceId, targetId].sort().join('::');
      connectionOverrides[`marriage:${mKey}`] = {
        verified: isVerified,
        confidenceLevel,
        archiveSource,
        isMainBranch,
        eventType: options?.eventType || 'marriage',
        color: isMainBranch ? '#b45309' : isVerified ? (prev.verifiedColor || '#15803d') : '#78716c',
      };
      break;
    }

    case 'parent': {
      if (!source.parents.includes(targetId)) source.parents = [...source.parents, targetId];
      if (!target.children.includes(sourceId)) target.children = [...target.children, sourceId];

      applyUnverified(source, targetId, !isVerified);
      applyUnverified(target, sourceId, !isVerified);

      const pKey = source.parents.slice().sort().join('::');
      connectionOverrides[`descent:child:${pKey}:${sourceId}`] = {
        verified: isVerified,
        confidenceLevel,
        archiveSource,
        isMainBranch,
        color: isMainBranch ? '#b45309' : isVerified ? (prev.verifiedColor || '#15803d') : '#78716c',
      };
      break;
    }

    case 'child': {
      if (!source.children.includes(targetId)) source.children = [...source.children, targetId];
      if (!target.parents.includes(sourceId)) target.parents = [...target.parents, sourceId];

      applyUnverified(source, targetId, !isVerified);
      applyUnverified(target, sourceId, !isVerified);

      const pKey = target.parents.slice().sort().join('::');
      connectionOverrides[`descent:child:${pKey}:${targetId}`] = {
        verified: isVerified,
        confidenceLevel,
        archiveSource,
        isMainBranch,
        color: isMainBranch ? '#b45309' : isVerified ? (prev.verifiedColor || '#15803d') : '#78716c',
      };
      break;
    }

    case 'sibling': {
      const sharedParents = Array.from(
        new Set([...(source.parents || []), ...(target.parents || [])])
      );
      if (sharedParents.length > 0) {
        source.parents = sharedParents;
        target.parents = sharedParents;
        sharedParents.forEach((pId) => {
          if (persons[pId]) {
            const p = { ...persons[pId] };
            p.children = Array.from(new Set([...(p.children || []), sourceId, targetId]));
            persons[pId] = p;
          }
        });
      } else {
        source.siblings = Array.from(new Set([...(source.siblings || []), targetId]));
        target.siblings = Array.from(new Set([...(target.siblings || []), sourceId]));

        const gKey = [sourceId, targetId].sort().join('::');
        connectionOverrides[`sibling:${gKey}`] = {
          verified: isVerified,
          confidenceLevel,
          archiveSource,
          isMainBranch,
          label: 'Рідні брати / сестри',
          color: isMainBranch ? '#b45309' : '#0284c7',
        };
      }

      applyUnverified(source, targetId, !isVerified);
      applyUnverified(target, sourceId, !isVerified);
      break;
    }
  }

  if (options?.graduateGhostCards) {
    if (source.isGhost) source.isGhost = undefined;
    if (target.isGhost) target.isGhost = undefined;
  }

  persons[sourceId] = source;
  persons[targetId] = target;

  return {
    ...prev,
    persons,
    connectionOverrides,
    updatedAt: new Date().toISOString(),
  };
}

export interface CreateGhostCardInput {
  firstName: string;
  lastName?: string;
  gender: 'male' | 'female' | 'unknown';
  birthYear?: string;
  yearsDisplay?: string;
  ghostNote?: string;
  cardBgColor?: string;
  x?: number;
  y?: number;
  hintTargetPersonId?: string;
  hintProbableRelation?: string;
  hintLabel?: string;
  hintColor?: string;
}

export function applyCreateGhostCard(
  prev: FamilyTreeData,
  data: CreateGhostCardInput,
  startYear: number
): { nextTree: FamilyTreeData; newId: string; newX: number; newY: number } {
  const newId = `ghost-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const persons = { ...prev.persons };

  const cleanFirst = data.firstName.trim() || 'Нотатка';
  const cleanLast = (data.lastName || '').trim();
  const cleanNote = data.ghostNote?.trim() || undefined;
  const cleanYear = data.birthYear?.trim() || undefined;
  const cleanYearsDisplay = data.yearsDisplay?.trim() || cleanYear || undefined;

  let newX = typeof data.x === 'number' ? Math.round(data.x) : 400;
  let newY = typeof data.y === 'number' ? Math.round(data.y) : 400;

  if (typeof data.x !== 'number' || typeof data.y !== 'number') {
    const existing = Object.values(prev.persons);
    if (existing.length > 0) {
      const avgX = existing.reduce((s, p) => s + p.x, 0) / existing.length;
      const avgY = existing.reduce((s, p) => s + p.y, 0) / existing.length;
      newX = typeof data.x === 'number' ? Math.round(data.x) : Math.round(avgX);
      if (typeof data.y === 'number') {
        newY = Math.round(data.y);
      } else if (cleanYear && /^\d{4}$/.test(cleanYear)) {
        newY = yearToY(parseInt(cleanYear, 10), startYear, DEFAULT_PIXELS_PER_YEAR);
      } else {
        newY = Math.round(avgY);
      }
    } else if (cleanYear && /^\d{4}$/.test(cleanYear)) {
      newY = yearToY(parseInt(cleanYear, 10), startYear, DEFAULT_PIXELS_PER_YEAR);
    }
  }

  shiftCollidingCards(persons, newX, newY, 130);

  const initialBranchLinks: BranchLink[] | undefined =
    data.hintTargetPersonId && persons[data.hintTargetPersonId]
      ? [
          {
            id: `bl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            targetPersonId: data.hintTargetPersonId,
            probableRelation: data.hintProbableRelation?.trim() || undefined,
            label: data.hintLabel?.trim() || undefined,
            color: data.hintColor || '#d97706',
            lineShape: 'curved',
            strokeWidth: 2,
          },
        ]
      : undefined;

  const newGhost: Person = {
    id: newId,
    cardId: getNextCardId(prev.persons),
    firstName: cleanFirst,
    lastName: cleanLast,
    gender: data.gender || 'unknown',
    birthYear: cleanYear,
    yearsDisplay: cleanYearsDisplay,
    isGhost: true,
    ghostNote: cleanNote,
    notes: cleanNote,
    cardBgColor: data.cardBgColor || '#fef3c7',
    parents: [],
    spouses: [],
    children: [],
    branchLinks: initialBranchLinks,
    x: newX,
    y: newY,
  };

  persons[newId] = newGhost;

  return {
    nextTree: {
      ...prev,
      persons,
      selectedPersonId: newId,
      updatedAt: new Date().toISOString(),
    },
    newId,
    newX,
    newY,
  };
}

export function applyToggleGhostStatus(
  prev: FamilyTreeData,
  personId: string,
  isGhost: boolean
): FamilyTreeData {
  const person = prev.persons[personId];
  if (!person) return prev;
  return {
    ...prev,
    persons: {
      ...prev.persons,
      [personId]: {
        ...person,
        isGhost: isGhost ? true : undefined,
        ...(isGhost ? { isBlankScreenshot: undefined } : {}),
      },
    },
    updatedAt: new Date().toISOString(),
  };
}

export interface CreateBlankScreenshotCardInput {
  screenshotUrl?: string;
  screenshotFit?: 'cover' | 'contain';
  title?: string;
  birthYear?: string;
  notes?: string;
  x?: number;
  y?: number;
  hintTargetPersonId?: string;
  hintProbableRelation?: string;
  hintLabel?: string;
  hintColor?: string;
}

export function applyCreateBlankScreenshotCard(
  prev: FamilyTreeData,
  data: CreateBlankScreenshotCardInput
): { nextTree: FamilyTreeData; newId: string; newX: number; newY: number } {
  const newId = `blank-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const persons = { ...prev.persons };

  const cleanTitle = data.title?.trim() || 'Нерозшифрований запис';
  const cleanNote = data.notes?.trim() || undefined;
  const cleanYear = data.birthYear?.trim() || undefined;

  let newX = typeof data.x === 'number' ? Math.round(data.x) : 400;
  let newY = typeof data.y === 'number' ? Math.round(data.y) : 400;

  if (typeof data.x !== 'number' || typeof data.y !== 'number') {
    const existing = Object.values(prev.persons);
    if (existing.length > 0) {
      const avgX = existing.reduce((s, p) => s + p.x, 0) / existing.length;
      const avgY = existing.reduce((s, p) => s + p.y, 0) / existing.length;
      newX = typeof data.x === 'number' ? Math.round(data.x) : Math.round(avgX);
      newY = typeof data.y === 'number' ? Math.round(data.y) : Math.round(avgY);
    }
  }

  shiftCollidingCards(persons, newX, newY, 130);

  const initialBranchLinks: BranchLink[] | undefined =
    data.hintTargetPersonId && persons[data.hintTargetPersonId]
      ? [
          {
            id: `bl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            targetPersonId: data.hintTargetPersonId,
            probableRelation: data.hintProbableRelation?.trim() || undefined,
            label: data.hintLabel?.trim() || 'Нерозшифрований зв’язок',
            color: data.hintColor || '#64748b',
            lineShape: 'curved',
            strokeWidth: 2,
          },
        ]
      : undefined;

  const newCard: Person = {
    id: newId,
    cardId: getNextCardId(prev.persons),
    firstName: cleanTitle,
    lastName: '',
    gender: 'unknown',
    birthYear: cleanYear && /^\d{4}$/.test(cleanYear) ? cleanYear : undefined,
    yearsDisplay: cleanYear || undefined,
    isBlankScreenshot: true,
    screenshotUrl: data.screenshotUrl || undefined,
    screenshotFit: data.screenshotFit === 'contain' ? 'contain' : 'cover',
    notes: cleanNote,
    ghostNote: cleanNote,
    cardBgColor: '#f8fafc',
    parents: [],
    spouses: [],
    children: [],
    branchLinks: initialBranchLinks,
    x: newX,
    y: newY,
  };

  persons[newId] = newCard;

  return {
    nextTree: {
      ...prev,
      persons,
      selectedPersonId: newId,
      updatedAt: new Date().toISOString(),
    },
    newId,
    newX,
    newY,
  };
}

export function applyUpdateBlankScreenshot(
  prev: FamilyTreeData,
  personId: string,
  screenshotUrl: string | undefined,
  enableBlankMode = true
): FamilyTreeData {
  const person = prev.persons[personId];
  if (!person) return prev;
  return {
    ...prev,
    persons: {
      ...prev.persons,
      [personId]: {
        ...person,
        isBlankScreenshot: enableBlankMode ? true : person.isBlankScreenshot,
        ...(enableBlankMode ? { isGhost: undefined } : {}),
        screenshotUrl: screenshotUrl || undefined,
      },
    },
    updatedAt: new Date().toISOString(),
  };
}

export function applyToggleRelationVerification(
  prev: FamilyTreeData,
  personId: string,
  relativeId: string
): FamilyTreeData {
  const p1 = prev.persons[personId];
  const p2 = prev.persons[relativeId];
  if (!p1) return prev;

  const unverified1 = p1.unverifiedRelations || [];
  const isCurrentlyUnverified = unverified1.includes(relativeId);

  const newUnverified1 = isCurrentlyUnverified
    ? unverified1.filter((id) => id !== relativeId)
    : [...unverified1, relativeId];

  const updated = {
    ...prev.persons,
    [personId]: {
      ...p1,
      unverifiedRelations: newUnverified1,
    },
  };

  if (p2) {
    const unverified2 = p2.unverifiedRelations || [];
    const newUnverified2 = isCurrentlyUnverified
      ? unverified2.filter((id) => id !== personId)
      : [...unverified2, personId];
    updated[relativeId] = {
      ...p2,
      unverifiedRelations: newUnverified2,
    };
  }

  return {
    ...prev,
    persons: updated,
  };
}

export interface AddBranchLinkOptions {
  linkKind?: BranchLinkKind;
  probableRelation?: string;
  label?: string;
  color?: string;
  strokeWidth?: number;
  lineShape?: BranchLinkCurveStyle;
  bidirectional?: boolean;
  reverseLabel?: string;
}

export interface UpdateBranchLinkOptions {
  linkKind?: BranchLinkKind;
  probableRelation?: string;
  label?: string;
  color?: string;
  strokeWidth?: number;
  lineShape?: BranchLinkCurveStyle;
  updateReciprocal?: boolean;
}

export interface BatchBranchLinkStyleOptions {
  color?: string;
  strokeWidth?: number;
  lineShape?: BranchLinkCurveStyle;
  onlyKind?: BranchLinkKind;
}

function normalizeBranchStrokeWidth(value?: number): number | undefined {
  if (typeof value !== 'number' || Number.isNaN(value)) return undefined;
  return Math.max(1, Math.min(10, Math.round(value)));
}

function getReciprocalProbableRelation(relation?: string): string | undefined {
  const clean = relation?.trim();
  if (!clean) return undefined;
  switch (clean) {
    case 'Батьки':
    case 'Батько':
    case 'Мати':
      return 'Дитина';
    case 'Дитина':
      return 'Батьки';
    case 'Дідусь / Бабуся':
      return 'Онук / Онука';
    case 'Онук / Онука':
      return 'Дідусь / Бабуся';
    case 'Дядько / Тітка':
      return 'Племінник / Племінниця';
    case 'Племінник / Племінниця':
      return 'Дядько / Тітка';
    case 'Хресний / Хресна':
    case 'Хресні':
      return 'Хрещеник / Хрещениця';
    default:
      return clean;
  }
}

export function applyAddBranchLink(
  prev: FamilyTreeData,
  sourceId: string,
  targetId: string,
  options: AddBranchLinkOptions = {}
): FamilyTreeData {
  if (!sourceId || !targetId || sourceId === targetId) return prev;
  const source = prev.persons[sourceId];
  const target = prev.persons[targetId];
  if (!source || !target) return prev;

  const cleanKind: BranchLinkKind = options.linkKind === 'godparent' ? 'godparent' : 'branch';
  const cleanLabel = options.label?.trim() || undefined;
  const cleanProbableRelation = options.probableRelation?.trim() || undefined;
  const defaultColor = cleanKind === 'godparent' ? '#d97706' : '#4f46e5';
  const cleanColor = options.color?.trim() || defaultColor;
  const cleanWidth = normalizeBranchStrokeWidth(options.strokeWidth) ?? 2;
  const cleanShape: BranchLinkCurveStyle = normalizeBranchLineShape(
    options.lineShape ?? (cleanKind === 'godparent' ? 'wavy' : 'curved')
  );

  const upsertLink = (
    existing: BranchLink[] | undefined,
    toId: string,
    label?: string,
    probableRel?: string
  ): BranchLink[] => {
    const list = [...(existing || [])];
    const idx = list.findIndex(
      (l) => l.targetPersonId === toId && (l.linkKind || 'branch') === cleanKind
    );
    if (idx !== -1) {
      list[idx] = {
        ...list[idx],
        ...(cleanKind === 'godparent' ? { linkKind: 'godparent' as const } : {}),
        probableRelation:
          options.probableRelation !== undefined ? probableRel : list[idx].probableRelation,
        label: label !== undefined ? label : list[idx].label,
        color: cleanColor,
        strokeWidth: cleanWidth,
        lineShape: cleanShape,
      };
      return list;
    }
    return [
      ...list,
      {
        id: `bl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        targetPersonId: toId,
        ...(cleanKind === 'godparent' ? { linkKind: 'godparent' as const } : {}),
        probableRelation: probableRel,
        label,
        color: cleanColor,
        strokeWidth: cleanWidth,
        lineShape: cleanShape,
      },
    ];
  };

  const persons = { ...prev.persons };
  persons[sourceId] = {
    ...source,
    branchLinks: upsertLink(source.branchLinks, targetId, cleanLabel, cleanProbableRelation),
  };

  if (options.bidirectional) {
    const revLabel = options.reverseLabel?.trim() || cleanLabel;
    const revProbableRel = getReciprocalProbableRelation(cleanProbableRelation);
    persons[targetId] = {
      ...target,
      branchLinks: upsertLink(target.branchLinks, sourceId, revLabel, revProbableRel),
    };
  }

  return {
    ...prev,
    persons,
    updatedAt: new Date().toISOString(),
  };
}

export function applyUpdateBranchLink(
  prev: FamilyTreeData,
  sourceId: string,
  linkId: string,
  options: UpdateBranchLinkOptions
): FamilyTreeData {
  const source = prev.persons[sourceId];
  if (!source || !source.branchLinks || source.branchLinks.length === 0) return prev;

  const idx = source.branchLinks.findIndex((l) => l.id === linkId);
  if (idx === -1) return prev;

  const current = source.branchLinks[idx];
  const nextKind = options.linkKind !== undefined ? options.linkKind : current.linkKind;
  const cleanColor = options.color !== undefined ? options.color.trim() || '#4f46e5' : current.color;
  const cleanWidth =
    options.strokeWidth !== undefined
      ? normalizeBranchStrokeWidth(options.strokeWidth)
      : current.strokeWidth;
  const cleanShape =
    options.lineShape !== undefined ? normalizeBranchLineShape(options.lineShape) : current.lineShape;
  const cleanLabel =
    options.label !== undefined ? options.label.trim() || undefined : current.label;
  const cleanProbableRelation =
    options.probableRelation !== undefined
      ? options.probableRelation.trim() || undefined
      : current.probableRelation;

  const updatedLink: BranchLink = {
    ...current,
    linkKind: nextKind === 'godparent' ? 'godparent' : undefined,
    probableRelation: cleanProbableRelation,
    label: cleanLabel,
    color: cleanColor,
    strokeWidth: cleanWidth,
    lineShape: cleanShape,
  };

  const persons = { ...prev.persons };
  const nextSourceLinks = [...source.branchLinks];
  nextSourceLinks[idx] = updatedLink;
  persons[sourceId] = {
    ...source,
    branchLinks: nextSourceLinks,
  };

  if (options.updateReciprocal && persons[current.targetPersonId]) {
    const target = persons[current.targetPersonId];
    if (target.branchLinks && target.branchLinks.length > 0) {
      let changed = false;
      const revProbableRel =
        options.probableRelation !== undefined
          ? getReciprocalProbableRelation(cleanProbableRelation)
          : undefined;
      const nextTargetLinks = target.branchLinks.map((tl) => {
        if (
          tl.targetPersonId === sourceId &&
          (tl.linkKind || 'branch') === (current.linkKind || 'branch')
        ) {
          changed = true;
          return {
            ...tl,
            ...(options.probableRelation !== undefined ? { probableRelation: revProbableRel } : {}),
            color: cleanColor,
            strokeWidth: cleanWidth,
            lineShape: cleanShape,
          };
        }
        return tl;
      });
      if (changed) {
        persons[current.targetPersonId] = {
          ...target,
          branchLinks: nextTargetLinks,
        };
      }
    }
  }

  return {
    ...prev,
    persons,
    updatedAt: new Date().toISOString(),
  };
}

export function applyBatchBranchLinkStyle(
  prev: FamilyTreeData,
  options: BatchBranchLinkStyleOptions
): FamilyTreeData {
  const cleanWidth =
    options.strokeWidth !== undefined ? normalizeBranchStrokeWidth(options.strokeWidth) : undefined;
  const cleanColor = options.color !== undefined ? options.color.trim() || '#4f46e5' : undefined;
  const cleanShape =
    options.lineShape !== undefined ? normalizeBranchLineShape(options.lineShape) : undefined;

  let anyChanged = false;
  const persons: Record<string, Person> = { ...prev.persons };

  Object.keys(persons).forEach((pid) => {
    const p = persons[pid];
    if (!p.branchLinks || p.branchLinks.length === 0) return;
    let personChanged = false;
    const nextLinks = p.branchLinks.map((bl) => {
      if (options.onlyKind && (bl.linkKind || 'branch') !== options.onlyKind) {
        return bl;
      }
      personChanged = true;
      return {
        ...bl,
        ...(cleanColor !== undefined ? { color: cleanColor } : {}),
        ...(cleanWidth !== undefined ? { strokeWidth: cleanWidth } : {}),
        ...(cleanShape !== undefined ? { lineShape: cleanShape } : {}),
      };
    });
    if (personChanged) {
      anyChanged = true;
      persons[pid] = {
        ...p,
        branchLinks: nextLinks,
      };
    }
  });

  if (!anyChanged) return prev;

  return {
    ...prev,
    persons,
    updatedAt: new Date().toISOString(),
  };
}

export function applyRemoveBranchLink(
  prev: FamilyTreeData,
  sourceId: string,
  linkId: string,
  removeReciprocal = false
): FamilyTreeData {
  const source = prev.persons[sourceId];
  if (!source || !source.branchLinks || source.branchLinks.length === 0) return prev;

  const removedLink = source.branchLinks.find((l) => l.id === linkId || l.targetPersonId === linkId);
  if (!removedLink) return prev;

  const persons = { ...prev.persons };
  const nextSourceLinks = source.branchLinks.filter((l) => l.id !== removedLink.id);
  persons[sourceId] = {
    ...source,
    branchLinks: nextSourceLinks.length > 0 ? nextSourceLinks : undefined,
  };

  if (removeReciprocal && persons[removedLink.targetPersonId]) {
    const target = persons[removedLink.targetPersonId];
    const nextTargetLinks = (target.branchLinks || []).filter((l) => l.targetPersonId !== sourceId);
    persons[removedLink.targetPersonId] = {
      ...target,
      branchLinks: nextTargetLinks.length > 0 ? nextTargetLinks : undefined,
    };
  }

  return {
    ...prev,
    persons,
    updatedAt: new Date().toISOString(),
  };
}

export function applyDeletePerson(prev: FamilyTreeData, id: string): FamilyTreeData {
  const updated = { ...prev.persons };
  delete updated[id];

  Object.keys(updated).forEach((pId) => {
    const p = updated[pId];
    const filteredBranchLinks = p.branchLinks
      ? p.branchLinks.filter((bl) => bl.targetPersonId !== id)
      : undefined;
    updated[pId] = {
      ...p,
      parents: p.parents.filter((pid) => pid !== id),
      spouses: p.spouses.filter((sid) => sid !== id),
      children: p.children.filter((cid) => cid !== id),
      siblings: p.siblings ? p.siblings.filter((sibId) => sibId !== id) : undefined,
      branchLinks:
        filteredBranchLinks && filteredBranchLinks.length > 0 ? filteredBranchLinks : undefined,
    };
  });

  return {
    ...prev,
    persons: updated,
    selectedPersonId: prev.selectedPersonId === id ? null : prev.selectedPersonId,
    updatedAt: new Date().toISOString(),
  };
}

export function applySavePerson(
  prev: FamilyTreeData,
  updatedInput: Person,
  startYear: number
): FamilyTreeData {
  const updated = { ...updatedInput };
  const birthYr = extractBirthYear(updated);
  if (updated.isChronologicallyPinned && birthYr) {
    updated.y = yearToY(birthYr, startYear, DEFAULT_PIXELS_PER_YEAR);
  }

  const oldPerson = prev.persons[updated.id];
  const persons = { ...prev.persons, [updated.id]: updated };

  if (updated.cardBgColor && updated.lastName?.trim() && !updated.isGhost && !updated.isProposal) {
    const targetLastName = updated.lastName.trim().toLowerCase();
    Object.values(persons).forEach((p) => {
      if (!p.isGhost && !p.isProposal && p.lastName && p.lastName.trim().toLowerCase() === targetLastName) {
        persons[p.id] = {
          ...p,
          cardBgColor: updated.cardBgColor,
        };
      }
    });
  }

  if (oldPerson) {
    oldPerson.parents.forEach((pId) => {
      if (!updated.parents.includes(pId) && persons[pId]) {
        persons[pId] = {
          ...persons[pId],
          children: (persons[pId].children || []).filter((cid) => cid !== updated.id),
        };
      }
    });

    oldPerson.spouses.forEach((sId) => {
      if (!updated.spouses.includes(sId) && persons[sId]) {
        persons[sId] = {
          ...persons[sId],
          spouses: (persons[sId].spouses || []).filter((sid) => sid !== updated.id),
        };
      }
    });

    oldPerson.children.forEach((cId) => {
      if (!updated.children.includes(cId) && persons[cId]) {
        persons[cId] = {
          ...persons[cId],
          parents: (persons[cId].parents || []).filter((pid) => pid !== updated.id),
        };
      }
    });

    (oldPerson.siblings || []).forEach((sId) => {
      if (!updated.siblings?.includes(sId) && persons[sId]) {
        persons[sId] = {
          ...persons[sId],
          siblings: (persons[sId].siblings || []).filter((sid) => sid !== updated.id),
        };
      }
    });
  }

  return {
    ...prev,
    persons,
    updatedAt: new Date().toISOString(),
  };
}

export function applyBatchClanColor(
  prev: FamilyTreeData,
  personId: string,
  color: string
): FamilyTreeData {
  const p = prev.persons[personId];
  if (!p) return prev;
  const targetLastName = p.lastName?.trim().toLowerCase();
  const updatedPersons = { ...prev.persons };
  Object.values(updatedPersons).forEach((other) => {
    if (
      (targetLastName && other.lastName && other.lastName.trim().toLowerCase() === targetLastName) ||
      other.id === personId
    ) {
      updatedPersons[other.id] = {
        ...other,
        cardBgColor: color,
      };
    }
  });
  return {
    ...prev,
    persons: updatedPersons,
  };
}

export function applyAddGuestSuggestion(
  prev: FamilyTreeData,
  personId: string,
  suggestion: GuestSuggestion
): FamilyTreeData {
  const person = prev.persons[personId];
  if (!person) return prev;
  const existing = person.guestSuggestions || [];
  if (existing.some((s) => s.id === suggestion.id)) return prev;
  return {
    ...prev,
    persons: {
      ...prev.persons,
      [personId]: {
        ...person,
        guestSuggestions: [...existing, suggestion],
      },
    },
    updatedAt: new Date().toISOString(),
  };
}

export function applyResolveGuestSuggestion(
  prev: FamilyTreeData,
  personId: string,
  suggestionId: string,
  action: 'approve' | 'reject' | 'mark_approved'
): FamilyTreeData {
  const person = prev.persons[personId];
  if (!person || !person.guestSuggestions) return prev;
  const targetSuggestion = person.guestSuggestions.find((s) => s.id === suggestionId);
  if (!targetSuggestion) return prev;

  const nowIso = new Date().toISOString();
  const updatedSuggestions = person.guestSuggestions.map((s) =>
    s.id === suggestionId
      ? {
          ...s,
          status: action === 'reject' ? ('rejected' as const) : ('approved' as const),
          resolvedAt: nowIso,
        }
      : s
  );

  let updatedPerson: Person = {
    ...person,
    guestSuggestions: updatedSuggestions,
  };

  if (action === 'approve') {
    const fields = targetSuggestion.suggestedFields;
    if (fields) {
      if (fields.birthDate?.trim()) updatedPerson.birthDate = fields.birthDate.trim();
      if (fields.birthYear?.trim()) updatedPerson.birthYear = fields.birthYear.trim();
      if (fields.deathDate?.trim()) {
        updatedPerson.deathDate = fields.deathDate.trim();
        updatedPerson.isDeceased = true;
      }
      if (fields.deathYear?.trim()) {
        updatedPerson.deathYear = fields.deathYear.trim();
        updatedPerson.isDeceased = true;
      }
      if (fields.birthPlace?.trim()) updatedPerson.birthPlace = fields.birthPlace.trim();
      if (fields.residencePlace?.trim()) updatedPerson.residencePlace = fields.residencePlace.trim();
      if (fields.maidenName?.trim()) updatedPerson.maidenName = fields.maidenName.trim();
      if (fields.nickname?.trim()) updatedPerson.nickname = fields.nickname.trim();
      if (fields.profession?.trim()) updatedPerson.profession = fields.profession.trim();
    }

    const msg = targetSuggestion.message?.trim();
    if (msg) {
      const prefix = `[${targetSuggestion.authorName || 'Гість'}]`;
      const line = `${prefix}: ${msg}`;
      if (targetSuggestion.category === 'memory') {
        const currentStories = (updatedPerson.interestingStories || '').trim();
        if (!currentStories.includes(msg)) {
          updatedPerson.interestingStories = currentStories ? `${currentStories}\n\n${line}` : line;
        }
      } else {
        const currentNotes = (updatedPerson.notes || '').trim();
        if (!currentNotes.includes(msg)) {
          updatedPerson.notes = currentNotes ? `${currentNotes}\n\n${line}` : line;
        }
      }
    }
  }

  return {
    ...prev,
    persons: {
      ...prev.persons,
      [personId]: updatedPerson,
    },
    updatedAt: nowIso,
  };
}

export function applyCreateProposalRelative(
  prev: FamilyTreeData,
  target: Person,
  input: AddRelativeInput,
  proposalMeta: ProposalCardMeta,
  startYear: number
): { nextTree: FamilyTreeData; proposalPerson: Person } {
  const { nextTree, newId } = applyAddRelative(prev, target, input, startYear);
  const created = nextTree.persons[newId];
  const proposalPerson: Person = {
    ...created,
    isGhost: undefined,
    isProposal: true,
    proposalMeta,
    cardBgColor: '#e0f2fe',
  };
  return {
    nextTree: {
      ...nextTree,
      persons: {
        ...nextTree.persons,
        [newId]: proposalPerson,
      },
    },
    proposalPerson,
  };
}

export function applyApproveProposalCard(
  prev: FamilyTreeData,
  personId: string
): FamilyTreeData {
  const person = prev.persons[personId];
  if (!person) return prev;

  const targetPerson = person.proposalMeta?.targetPersonId
    ? prev.persons[person.proposalMeta.targetPersonId]
    : undefined;
  const restoredBg =
    person.cardBgColor === '#e0f2fe'
      ? targetPerson?.cardBgColor && !targetPerson.isProposal && !targetPerson.isGhost
        ? targetPerson.cardBgColor
        : '#e8efe9'
      : person.cardBgColor;

  return {
    ...prev,
    persons: {
      ...prev.persons,
      [personId]: {
        ...person,
        isProposal: undefined,
        proposalMeta: undefined,
        cardBgColor: restoredBg,
      },
    },
    updatedAt: new Date().toISOString(),
  };
}

