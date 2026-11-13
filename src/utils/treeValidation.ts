import { FamilyTreeData, Person } from '../types/tree';
import { extractBirthYear, extractDeathYear, parseDateString } from './dateUtils';

export type ValidationSeverity = 'error' | 'warning';
export type ValidationCategory = 'dates' | 'parent_age' | 'marriage' | 'structure';

export interface TreeValidationIssue {
  id: string;
  severity: ValidationSeverity;
  category: ValidationCategory;
  personId: string;
  relatedPersonId?: string;
  title: string;
  description: string;
  autoFixable?: boolean;
}

export interface TreeValidationSummary {
  issues: TreeValidationIssue[];
  errorCount: number;
  warningCount: number;
  fixableStructureCount: number;
}

function fullName(p?: Person): string {
  if (!p) return 'Невідома особа';
  return [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || 'Без імені';
}

function toComparableDateTuple(
  yearStr?: string,
  monthStr?: string,
  dayStr?: string,
  rawDate?: string
): { y: number; m: number | null; d: number | null } | null {
  const parsed = parseDateString(rawDate);
  const yRaw = (yearStr || parsed.year || '').trim();
  const y = parseInt(yRaw, 10);
  if (isNaN(y) || y <= 0) return null;

  const mRaw = (monthStr || parsed.month || '').trim();
  const m = mRaw ? parseInt(mRaw, 10) : NaN;

  const dRaw = (dayStr || parsed.day || '').trim();
  const d = dRaw ? parseInt(dRaw, 10) : NaN;

  return {
    y,
    m: !isNaN(m) && m >= 1 && m <= 12 ? m : null,
    d: !isNaN(d) && d >= 1 && d <= 31 ? d : null,
  };
}

function isTupleStrictlyBefore(
  a: { y: number; m: number | null; d: number | null },
  b: { y: number; m: number | null; d: number | null }
): boolean {
  if (a.y !== b.y) return a.y < b.y;
  if (a.m !== null && b.m !== null) {
    if (a.m !== b.m) return a.m < b.m;
    if (a.d !== null && b.d !== null) {
      return a.d < b.d;
    }
  }
  return false;
}

/**
 * Validates the family tree for chronological, biological, marriage, and structural graph errors.
 */
export function validateFamilyTree(tree: FamilyTreeData): TreeValidationSummary {
  const persons = tree.persons || {};
  const issues: TreeValidationIssue[] = [];
  const currentYear = new Date().getFullYear();

  const seenIssueIds = new Set<string>();
  const pushIssue = (issue: TreeValidationIssue) => {
    if (seenIssueIds.has(issue.id)) return;
    seenIssueIds.add(issue.id);
    issues.push(issue);
  };

  Object.values(persons).forEach((person) => {
    const name = fullName(person);
    const bYear = extractBirthYear(person);
    const dYear = extractDeathYear(person);
    const bTuple = toComparableDateTuple(person.birthYear, person.birthMonth, person.birthDay, person.birthDate);
    const dTuple = toComparableDateTuple(person.deathYear, person.deathMonth, person.deathDay, person.deathDate);

    // 1. Future dates
    if (bYear !== null && bYear > currentYear) {
      pushIssue({
        id: `future-birth:${person.id}`,
        severity: 'error',
        category: 'dates',
        personId: person.id,
        title: `Рік народження у майбутньому (${bYear})`,
        description: `${name}: вказано рік народження ${bYear}, що перевищує поточний ${currentYear} рік.`,
      });
    }
    if (dYear !== null && dYear > currentYear) {
      pushIssue({
        id: `future-death:${person.id}`,
        severity: 'error',
        category: 'dates',
        personId: person.id,
        title: `Рік смерті у майбутньому (${dYear})`,
        description: `${name}: вказано рік смерті ${dYear}, що перевищує поточний ${currentYear} рік.`,
      });
    }

    // 2. Death before birth
    if (bTuple && dTuple && isTupleStrictlyBefore(dTuple, bTuple)) {
      pushIssue({
        id: `death-before-birth:${person.id}`,
        severity: 'error',
        category: 'dates',
        personId: person.id,
        title: 'Дата смерті передує народженню',
        description: `${name}: дата смерті (${dTuple.y}) раніше дати народження (${bTuple.y}).`,
      });
    } else if (bYear !== null && dYear !== null && dYear < bYear) {
      pushIssue({
        id: `death-before-birth:${person.id}`,
        severity: 'error',
        category: 'dates',
        personId: person.id,
        title: 'Рік смерті менший за рік народження',
        description: `${name}: народження ${bYear}, смерть ${dYear}.`,
      });
    }

    // 3. Unrealistic lifespan or missing deceased flag
    if (bYear !== null && dYear !== null && dYear >= bYear) {
      const lifespan = dYear - bYear;
      if (lifespan > 115) {
        pushIssue({
          id: `long-lifespan:${person.id}`,
          severity: 'warning',
          category: 'dates',
          personId: person.id,
          title: `Надто велика тривалість життя (${lifespan} р.)`,
          description: `${name}: між роком народження (${bYear}) і смерті (${dYear}) — ${lifespan} років. Перевірте можливу одруківку.`,
        });
      }
    } else if (bYear !== null && !person.isDeceased && dYear === null) {
      const ageNow = currentYear - bYear;
      if (ageNow > 115) {
        pushIssue({
          id: `missing-deceased:${person.id}`,
          severity: 'warning',
          category: 'dates',
          personId: person.id,
          title: `Вік живої особи понад ${ageNow} років`,
          description: `${name} (${bYear} р.н.) не позначений як померлий(а), хоча вік сягає ${ageNow} років.`,
        });
      }
    }

    // 4. Parent-child chronological & biological checks
    (person.parents || []).forEach((parentId) => {
      const parent = persons[parentId];
      if (!parent) {
        pushIssue({
          id: `dangling-parent:${person.id}:${parentId}`,
          severity: 'warning',
          category: 'structure',
          personId: person.id,
          title: 'Посилання на відсутнього батька/матір',
          description: `${name} містить зв'язок із видаленою карткою батьків (${parentId}).`,
          autoFixable: true,
        });
        return;
      }

      if (!(parent.children || []).includes(person.id)) {
        pushIssue({
          id: `asym-parent-child:${parent.id}:${person.id}`,
          severity: 'warning',
          category: 'structure',
          personId: person.id,
          relatedPersonId: parent.id,
          title: 'Несиметричний зв’язок «батьки–дитина»',
          description: `${name} вказує ${fullName(parent)} як батька/матір, але у картці батька/матері ця дитина відсутня.`,
          autoFixable: true,
        });
      }

      const pBirth = extractBirthYear(parent);
      const pDeath = extractDeathYear(parent);
      const pName = fullName(parent);

      if (bYear !== null && pBirth !== null) {
        const parentAgeAtBirth = bYear - pBirth;
        if (parentAgeAtBirth <= 0) {
          pushIssue({
            id: `child-older-than-parent:${parent.id}:${person.id}`,
            severity: 'error',
            category: 'parent_age',
            personId: person.id,
            relatedPersonId: parent.id,
            title: 'Дитина старша або ровесник батьків',
            description: `${name} (${bYear} р.н.) не може бути дитиною ${pName} (${pBirth} р.н.).`,
          });
        } else if (parentAgeAtBirth < 11) {
          pushIssue({
            id: `parent-impossibly-young:${parent.id}:${person.id}`,
            severity: 'error',
            category: 'parent_age',
            personId: person.id,
            relatedPersonId: parent.id,
            title: `Нереальний вік батьків при народженні (${parentAgeAtBirth} р.)`,
            description: `${pName} (${pBirth}) мав(ла) лише ${parentAgeAtBirth} р. при народженні ${name} (${bYear}).`,
          });
        } else if (parentAgeAtBirth < 15) {
          pushIssue({
            id: `parent-very-young:${parent.id}:${person.id}`,
            severity: 'warning',
            category: 'parent_age',
            personId: person.id,
            relatedPersonId: parent.id,
            title: `Дуже раннє батьківство (${parentAgeAtBirth} р.)`,
            description: `${pName} (${pBirth}) мав(ла) ${parentAgeAtBirth} р. при народженні ${name} (${bYear}). Перевірте дати.`,
          });
        } else if (parent.gender === 'female' && parentAgeAtBirth > 55) {
          pushIssue({
            id: `mother-too-old:${parent.id}:${person.id}`,
            severity: 'warning',
            category: 'parent_age',
            personId: person.id,
            relatedPersonId: parent.id,
            title: `Великий вік матері при пологах (${parentAgeAtBirth} р.)`,
            description: `${pName} (${pBirth}) мала ${parentAgeAtBirth} р. при народженні ${name} (${bYear}).`,
          });
        } else if (parent.gender !== 'female' && parentAgeAtBirth > 75) {
          pushIssue({
            id: `father-too-old:${parent.id}:${person.id}`,
            severity: 'warning',
            category: 'parent_age',
            personId: person.id,
            relatedPersonId: parent.id,
            title: `Великий вік батька при народженні дитини (${parentAgeAtBirth} р.)`,
            description: `${pName} (${pBirth}) мав ${parentAgeAtBirth} р. при народженні ${name} (${bYear}).`,
          });
        }
      }

      if (bYear !== null && pDeath !== null) {
        if (parent.gender === 'female' && bYear > pDeath) {
          pushIssue({
            id: `born-after-mother-death:${parent.id}:${person.id}`,
            severity: 'error',
            category: 'parent_age',
            personId: person.id,
            relatedPersonId: parent.id,
            title: 'Дитина народжена після смерті матері',
            description: `${name} (${bYear} р.н.) народився(лась) після року смерті матері ${pName} (${pDeath}).`,
          });
        } else if (parent.gender !== 'female' && bYear > pDeath + 1) {
          pushIssue({
            id: `born-after-father-death:${parent.id}:${person.id}`,
            severity: 'error',
            category: 'parent_age',
            personId: person.id,
            relatedPersonId: parent.id,
            title: 'Дитина народжена більш ніж через рік після смерті батька',
            description: `${name} (${bYear} р.н.) народився(лась) після смерті батька ${pName} (${pDeath}).`,
          });
        }
      }
    });

    // 5. Same-gender biological parents check
    if ((person.parents || []).length === 2) {
      const pA = persons[person.parents[0]];
      const pB = persons[person.parents[1]];
      if (pA && pB && pA.gender !== 'unknown' && pA.gender === pB.gender) {
        pushIssue({
          id: `same-gender-parents:${person.id}`,
          severity: 'warning',
          category: 'structure',
          personId: person.id,
          title: 'Обидва батьки мають однакову стать',
          description: `У ${name} обоє батьків (${fullName(pA)} та ${fullName(pB)}) позначені як ${
            pA.gender === 'male' ? 'чоловіки' : 'жінки'
          }.`,
        });
      }
    }

    // 6. Children / Spouses / Siblings reciprocity checks
    (person.children || []).forEach((childId) => {
      const child = persons[childId];
      if (!child) {
        pushIssue({
          id: `dangling-child:${person.id}:${childId}`,
          severity: 'warning',
          category: 'structure',
          personId: person.id,
          title: 'Посилання на відсутню дитину',
          description: `${name} містить зв'язок із видаленою карткою дитини (${childId}).`,
          autoFixable: true,
        });
      } else if (!(child.parents || []).includes(person.id)) {
        pushIssue({
          id: `asym-child-parent:${person.id}:${child.id}`,
          severity: 'warning',
          category: 'structure',
          personId: person.id,
          relatedPersonId: child.id,
          title: 'Несиметричний зв’язок із дитиною',
          description: `${name} містить ${fullName(child)} у дітях, але у картці дитини не вказано цього батька/матір.`,
          autoFixable: true,
        });
      }
    });

    (person.spouses || []).forEach((spouseId) => {
      const spouse = persons[spouseId];
      if (!spouse) {
        pushIssue({
          id: `dangling-spouse:${person.id}:${spouseId}`,
          severity: 'warning',
          category: 'structure',
          personId: person.id,
          title: 'Посилання на відсутнього партнера',
          description: `${name} містить зв'язок із видаленою карткою партнера (${spouseId}).`,
          autoFixable: true,
        });
      } else if (!(spouse.spouses || []).includes(person.id)) {
        const pairKey = [person.id, spouse.id].sort().join('::');
        pushIssue({
          id: `asym-spouse:${pairKey}`,
          severity: 'warning',
          category: 'structure',
          personId: person.id,
          relatedPersonId: spouse.id,
          title: 'Несиметричний зв’язок подружжя',
          description: `${name} має ${fullName(spouse)} у подружжі, але зворотний зв'язок відсутній.`,
          autoFixable: true,
        });
      }
    });

    (person.siblings || []).forEach((sibId) => {
      const sib = persons[sibId];
      if (!sib) {
        pushIssue({
          id: `dangling-sibling:${person.id}:${sibId}`,
          severity: 'warning',
          category: 'structure',
          personId: person.id,
          title: 'Посилання на відсутнього брата/сестру',
          description: `${name} містить зв'язок із видаленою карткою (${sibId}).`,
          autoFixable: true,
        });
      } else if (!(sib.siblings || []).includes(person.id)) {
        const pairKey = [person.id, sib.id].sort().join('::');
        pushIssue({
          id: `asym-sibling:${pairKey}`,
          severity: 'warning',
          category: 'structure',
          personId: person.id,
          relatedPersonId: sib.id,
          title: 'Несиметричний зв’язок братів/сестер',
          description: `${name} та ${fullName(sib)} мають односторонній зв'язок братів/сестер.`,
          autoFixable: true,
        });
      }
    });

    (person.branchLinks || []).forEach((bl) => {
      if (!persons[bl.targetPersonId] || bl.targetPersonId === person.id) {
        pushIssue({
          id: `dangling-branch-link:${person.id}:${bl.id}`,
          severity: 'warning',
          category: 'structure',
          personId: person.id,
          title: 'Міжгілкове посилання на відсутню картку',
          description: `${name} містить стрілку-посилання на відсутню або видалену картку (${bl.targetPersonId}).`,
          autoFixable: true,
        });
      }
    });

    // 7. Ancestor cycle check (self as ancestor)
    const visited = new Set<string>();
    const stack = [...(person.parents || [])];
    while (stack.length > 0) {
      const currId = stack.pop()!;
      if (currId === person.id) {
        pushIssue({
          id: `cycle:${person.id}`,
          severity: 'error',
          category: 'structure',
          personId: person.id,
          title: 'Виявлено циклічний родинний зв’язок',
          description: `${name} є власним предком через ланцюжок батьківських зв'язків.`,
        });
        break;
      }
      if (visited.has(currId)) continue;
      visited.add(currId);
      const curr = persons[currId];
      if (curr?.parents) {
        curr.parents.forEach((pId) => stack.push(pId));
      }
    }
  });

  // 8. Marriage event dates vs spouse lifespans
  Object.entries(tree.connectionOverrides || {}).forEach(([connId, meta]) => {
    if (!connId.startsWith('marriage:') || !meta.eventDate) return;
    const raw = connId.replace(/^marriage:/, '');
    const ids = raw.includes('::') ? raw.split('::') : raw.split(':');
    if (ids.length < 2) return;
    const p1 = persons[ids[0]];
    const p2 = persons[ids[1]];
    if (!p1 || !p2) return;

    const parsedEvent = parseDateString(meta.eventDate);
    const eventYear = parsedEvent.year ? parseInt(parsedEvent.year, 10) : NaN;
    if (isNaN(eventYear)) return;

    [p1, p2].forEach((partner) => {
      const bY = extractBirthYear(partner);
      const dY = extractDeathYear(partner);
      const pName = fullName(partner);
      const label = meta.eventType === 'divorce' ? 'розлучення' : 'шлюбу';

      if (bY !== null && eventYear < bY) {
        pushIssue({
          id: `event-before-birth:${connId}:${partner.id}`,
          severity: 'error',
          category: 'marriage',
          personId: partner.id,
          title: `Дата ${label} (${eventYear}) раніше народження`,
          description: `${pName} (${bY} р.н.): дата події ${eventYear} передує народженню.`,
        });
      } else if (bY !== null && meta.eventType !== 'divorce' && eventYear - bY < 14) {
        pushIssue({
          id: `early-marriage:${connId}:${partner.id}`,
          severity: 'warning',
          category: 'marriage',
          personId: partner.id,
          title: `Ранній шлюб у віці ${eventYear - bY} р.`,
          description: `${pName} (${bY} р.н.): вказана дата події (${eventYear}) у ${eventYear - bY} років.`,
        });
      }

      if (dY !== null && eventYear > dY) {
        pushIssue({
          id: `event-after-death:${connId}:${partner.id}`,
          severity: 'error',
          category: 'marriage',
          personId: partner.id,
          title: `Дата ${label} (${eventYear}) після смерті`,
          description: `${pName} (помер у ${dY}): подія датована ${eventYear} роком.`,
        });
      }
    });
  });

  // Sort: errors first, then warnings
  issues.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'error' ? -1 : 1;
    return a.title.localeCompare(b.title, 'uk');
  });

  return {
    issues,
    errorCount: issues.filter((i) => i.severity === 'error').length,
    warningCount: issues.filter((i) => i.severity === 'warning').length,
    fixableStructureCount: issues.filter((i) => i.autoFixable).length,
  };
}

/**
 * Automatically repairs dangling IDs and restores missing reciprocal links (parents <-> children, spouses <-> spouses, siblings <-> siblings).
 */
export function fixBrokenReciprocalLinks(tree: FamilyTreeData): FamilyTreeData {
  const persons: Record<string, Person> = {};
  Object.entries(tree.persons || {}).forEach(([id, p]) => {
    const cleanBranchLinks = p.branchLinks
      ? p.branchLinks.filter((bl) => Boolean(tree.persons[bl.targetPersonId]) && bl.targetPersonId !== id)
      : undefined;
    persons[id] = {
      ...p,
      parents: (p.parents || []).filter((pid) => Boolean(tree.persons[pid]) && pid !== id),
      children: (p.children || []).filter((cid) => Boolean(tree.persons[cid]) && cid !== id),
      spouses: (p.spouses || []).filter((sid) => Boolean(tree.persons[sid]) && sid !== id),
      siblings: p.siblings
        ? p.siblings.filter((sibId) => Boolean(tree.persons[sibId]) && sibId !== id)
        : undefined,
      branchLinks: cleanBranchLinks && cleanBranchLinks.length > 0 ? cleanBranchLinks : undefined,
    };
  });

  Object.values(persons).forEach((p) => {
    p.parents.forEach((pid) => {
      const parent = persons[pid];
      if (parent && !parent.children.includes(p.id)) {
        parent.children = [...parent.children, p.id];
      }
    });
    p.children.forEach((cid) => {
      const child = persons[cid];
      if (child && !child.parents.includes(p.id)) {
        child.parents = [...child.parents, p.id];
      }
    });
    p.spouses.forEach((sid) => {
      const spouse = persons[sid];
      if (spouse && !spouse.spouses.includes(p.id)) {
        spouse.spouses = [...spouse.spouses, p.id];
      }
    });
    (p.siblings || []).forEach((sibId) => {
      const sib = persons[sibId];
      if (sib) {
        const list = sib.siblings || [];
        if (!list.includes(p.id)) {
          sib.siblings = [...list, p.id];
        }
      }
    });
  });

  return {
    ...tree,
    persons,
    updatedAt: new Date().toISOString(),
  };
}
