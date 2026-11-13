import { Person, Gender, MetricDocument, PersonPhoto, Pet, BranchLink, CrossCanvasLink, CardFrameStyle } from '../../types/tree';
import { normalizeCardFrame } from '../../constants/cardFrames';
import { getPersonCrossCanvasLinks } from '../../utils/crossCanvasLinks';
import {
  formatSingleDate,
  parseDateString,
  extractBirthYear,
  extractDeathYear,
  padZero,
} from '../../utils/dateUtils';
import { checkGenderMismatch } from '../../utils/genderValidation';

export type EditTabType = 'basic' | 'bio' | 'relations' | 'photos' | 'docs' | 'pets';

export interface CardColorPreset {
  name: string;
  hex: string;
}

export const CARD_COLOR_PRESETS: CardColorPreset[] = [
  { name: 'Чебрецевий', hex: '#e8efe9' },
  { name: 'Вінтажний', hex: '#fbf7ee' },
  { name: 'Блакитний', hex: '#e0f2fe' },
  { name: 'Рожевий', hex: '#ffe4e6' },
  { name: 'Бурштиновий', hex: '#fef3c7' },
  { name: 'Бузковий', hex: '#f3e8ff' },
  { name: 'Білий', hex: '#ffffff' },
];

export interface EditPersonDraft {
  // Basic & Identity
  firstName: string;
  lastName: string;
  patronymic: string;
  clanName: string;
  maidenName: string;
  nickname: string;
  gender: Gender;
  houseNumber: string;
  isFullyVerified: boolean;
  isChronologicallyPinned: boolean;
  isGhost: boolean;
  ghostNote: string;
  isBlankScreenshot: boolean;
  screenshotUrl?: string;
  screenshotFit: 'cover' | 'contain';
  cardBgColor: string;
  cardFrame: CardFrameStyle;
  avatarUrl?: string;

  // Cross-canvas
  targetCanvasId: string;
  targetCanvasTitle: string;
  crossCanvasLinks: CrossCanvasLink[];

  // Cross-branch card links (same canvas)
  branchLinks: BranchLink[];

  // Birth Date
  birthDay: string;
  birthMonth: string;
  birthYear: string;
  birthYearEnd: string;
  isBirthDateApproximate: boolean;
  birthDateType: 'exact' | 'period' | 'about';

  // Death Date
  isDeceased: boolean;
  deathDay: string;
  deathMonth: string;
  deathYear: string;

  // Custom display string
  yearsDisplay: string;

  // Biography & Geography
  biography: string;
  birthPlace: string;
  residencePlace: string;
  migrationNotes: string;
  deathPlace: string;
  burialPlace: string;
  education: string;
  profession: string;
  workplaceNotes: string;
  deathCause: string;
  midwife: string;
  godparents: string;
  interestingStories: string;

  // Relations & Attachments
  parents: string[];
  spouses: string[];
  children: string[];
  siblings: string[];
  unverifiedRelations: string[];
  metricDocuments: MetricDocument[];
  photoAlbum: PersonPhoto[];
  pets: Pet[];
}

export function buildInitialDraft(
  person: Person,
  allPersons: Record<string, Person>
): EditPersonDraft {
  const parsedBirth = parseDateString(person.birthDate);
  const parsedDeath = parseDateString(person.deathDate);

  const birthYearEnd = person.birthYearEnd || parsedBirth.yearEnd || '';
  const isBirthDateApproximate = Boolean(
    person.isBirthDateApproximate || parsedBirth.isApprox || birthYearEnd
  );
  const birthDateType: 'exact' | 'period' | 'about' = person.birthDateType
    ? person.birthDateType
    : birthYearEnd
    ? 'period'
    : isBirthDateApproximate
    ? 'about'
    : 'exact';

  const directSiblings = person.siblings || [];
  const sharedParentSibs = Object.values(allPersons)
    .filter((other) => {
      if (other.id === person.id) return false;
      return (
        person.parents &&
        person.parents.length > 0 &&
        other.parents?.some((pId) => person.parents.includes(pId))
      );
    })
    .map((s) => s.id);

  return {
    firstName: person.firstName || '',
    lastName: person.lastName || '',
    patronymic: person.patronymic || '',
    clanName: person.clanName || '',
    maidenName: person.maidenName || '',
    nickname: person.nickname || '',
    gender: person.gender || 'male',
    houseNumber: person.houseNumber || '',
    isFullyVerified: Boolean(person.isFullyVerified),
    isChronologicallyPinned: Boolean(person.isChronologicallyPinned),
    isGhost: Boolean(person.isGhost),
    ghostNote: person.ghostNote || '',
    isBlankScreenshot: Boolean(person.isBlankScreenshot),
    screenshotUrl: person.screenshotUrl,
    screenshotFit: person.screenshotFit === 'contain' ? 'contain' : 'cover',
    cardBgColor: person.cardBgColor || (person.isGhost ? '#f1f5f9' : '#e8efe9'),
    cardFrame: normalizeCardFrame(person.cardFrame),
    avatarUrl: person.avatarUrl,

    targetCanvasId: person.targetCanvasId || '',
    targetCanvasTitle: person.targetCanvasTitle || '',
    crossCanvasLinks: getPersonCrossCanvasLinks(person).map((l) => ({ ...l })),
    branchLinks: [...(person.branchLinks || [])],

    birthDay: person.birthDay || parsedBirth.day || '',
    birthMonth: person.birthMonth || parsedBirth.month || '',
    birthYear: person.birthYear || parsedBirth.year || '',
    birthYearEnd,
    isBirthDateApproximate,
    birthDateType,

    isDeceased: Boolean(
      person.isDeceased || person.deathDate || person.deathYear || parsedDeath.year
    ),
    deathDay: person.deathDay || parsedDeath.day || '',
    deathMonth: person.deathMonth || parsedDeath.month || '',
    deathYear: person.deathYear || parsedDeath.year || '',

    yearsDisplay: person.yearsDisplay || '',

    biography: person.biography || '',
    birthPlace: person.birthPlace || '',
    residencePlace: person.residencePlace || '',
    migrationNotes: person.migrationNotes || '',
    deathPlace: person.deathPlace || '',
    burialPlace: person.burialPlace || '',
    education: person.education || '',
    profession: person.profession || '',
    workplaceNotes: person.workplaceNotes || '',
    deathCause: person.deathCause || '',
    midwife: person.midwife || '',
    godparents: person.godparents || '',
    interestingStories: person.interestingStories || person.notes || '',

    parents: [...(person.parents || [])],
    spouses: [...(person.spouses || [])],
    children: [...(person.children || [])],
    siblings: Array.from(new Set([...directSiblings, ...sharedParentSibs])),
    unverifiedRelations: [...(person.unverifiedRelations || [])],
    metricDocuments: [...(person.metricDocuments || [])],
    photoAlbum: [...(person.photoAlbum || [])],
    pets: [...(person.pets || [])],
  };
}

export function formatDraftYearsDisplay(draft: EditPersonDraft): string {
  const isPeriod = draft.birthDateType === 'period' || Boolean(draft.birthYearEnd.trim());
  const isApprox = draft.birthDateType === 'about' || draft.isBirthDateApproximate;
  const formattedBirth = formatSingleDate(
    draft.birthDay,
    draft.birthMonth,
    draft.birthYear,
    '.',
    isPeriod ? draft.birthYearEnd.trim() : undefined,
    isApprox
  );
  const formattedDeath = draft.isDeceased
    ? formatSingleDate(draft.deathDay, draft.deathMonth, draft.deathYear, '.')
    : '';

  if (formattedBirth && formattedDeath) {
    return `${formattedBirth} — ${formattedDeath}`;
  }
  if (formattedBirth) {
    return draft.isDeceased ? `${formattedBirth} —` : formattedBirth;
  }
  if (formattedDeath) {
    return formattedDeath;
  }
  return '';
}

export function draftToPerson(base: Person, draft: EditPersonDraft): Person {
  const isPeriod = draft.birthDateType === 'period' || Boolean(draft.birthYearEnd.trim());
  const isApprox = draft.birthDateType === 'about' || draft.isBirthDateApproximate;
  const formattedBirth = formatSingleDate(
    draft.birthDay,
    draft.birthMonth,
    draft.birthYear,
    '.',
    isPeriod ? draft.birthYearEnd.trim() : undefined,
    isApprox
  );
  const formattedDeath = draft.isDeceased
    ? formatSingleDate(draft.deathDay, draft.deathMonth, draft.deathYear, '.')
    : '';

  let finalYears = draft.yearsDisplay.trim();
  if (!finalYears || /^[\d./—\s-]+$/.test(finalYears)) {
    const autoYears = formatDraftYearsDisplay(draft);
    if (autoYears) {
      finalYears = autoYears;
    }
  }

  const realCrossCanvasLinks = draft.crossCanvasLinks.filter(
    (l) => l.id !== 'legacy-canvas-link' && Boolean(l.targetCanvasId)
  );
  const legacyCrossCanvasLink = draft.crossCanvasLinks.find(
    (l) => l.id === 'legacy-canvas-link' && Boolean(l.targetCanvasId)
  );

  return {
    ...base,
    firstName: draft.firstName.trim(),
    lastName: draft.lastName.trim(),
    patronymic: draft.patronymic.trim() || undefined,
    clanName: draft.clanName.trim() || undefined,
    maidenName: draft.maidenName.trim() || undefined,
    nickname: draft.nickname.trim() || undefined,
    gender: draft.gender,
    yearsDisplay: finalYears || undefined,
    birthDate:
      formattedBirth ||
      (draft.birthYear.trim()
        ? isPeriod && draft.birthYearEnd.trim()
          ? `${draft.birthYear.trim()}–${draft.birthYearEnd.trim()}`
          : draft.birthYear.trim()
        : undefined),
    birthDay: draft.birthDay ? padZero(draft.birthDay) : undefined,
    birthMonth: draft.birthMonth ? padZero(draft.birthMonth) : undefined,
    birthYear: draft.birthYear.trim() || undefined,
    birthYearEnd: isPeriod && draft.birthYearEnd.trim() ? draft.birthYearEnd.trim() : undefined,
    isBirthDateApproximate: isApprox || isPeriod,
    birthDateType: draft.birthDateType,
    deathDate: formattedDeath || undefined,
    deathDay: draft.isDeceased && draft.deathDay ? padZero(draft.deathDay) : undefined,
    deathMonth: draft.isDeceased && draft.deathMonth ? padZero(draft.deathMonth) : undefined,
    deathYear: draft.isDeceased && draft.deathYear.trim() ? draft.deathYear.trim() : undefined,
    isDeceased: draft.isDeceased,
    biography: draft.biography.trim() || undefined,
    birthPlace: draft.birthPlace.trim() || undefined,
    residencePlace: draft.residencePlace.trim() || undefined,
    migrationNotes: draft.migrationNotes.trim() || undefined,
    deathPlace: draft.isDeceased ? draft.deathPlace.trim() || undefined : undefined,
    burialPlace: draft.isDeceased ? draft.burialPlace.trim() || undefined : undefined,
    education: draft.education.trim() || undefined,
    profession: draft.profession.trim() || undefined,
    workplaceNotes: draft.workplaceNotes.trim() || undefined,
    deathCause: draft.isDeceased ? draft.deathCause.trim() || undefined : undefined,
    midwife: draft.midwife.trim() || undefined,
    godparents: draft.godparents.trim() || undefined,
    houseNumber: draft.houseNumber.trim() || undefined,
    isFullyVerified: draft.isFullyVerified,
    isChronologicallyPinned: draft.isChronologicallyPinned,
    isGhost: draft.isGhost && !draft.isBlankScreenshot ? true : undefined,
    ghostNote: draft.ghostNote.trim() || undefined,
    isBlankScreenshot: draft.isBlankScreenshot ? true : undefined,
    screenshotUrl: draft.screenshotUrl || undefined,
    screenshotFit: draft.isBlankScreenshot ? draft.screenshotFit : undefined,
    cardBgColor: draft.cardBgColor || '#e8efe9',
    cardFrame: draft.cardFrame !== 'none' ? draft.cardFrame : undefined,
    unverifiedRelations: draft.unverifiedRelations,
    interestingStories: draft.interestingStories.trim() || undefined,
    notes:
      draft.interestingStories.trim() ||
      (draft.isGhost || draft.isBlankScreenshot ? draft.ghostNote.trim() || undefined : undefined),
    avatarUrl: draft.avatarUrl || undefined,
    parents: draft.parents,
    spouses: draft.spouses,
    children: draft.children,
    siblings: draft.siblings.length > 0 ? draft.siblings : undefined,
    metricDocuments: draft.metricDocuments.length > 0 ? draft.metricDocuments : undefined,
    photoAlbum: draft.photoAlbum.length > 0 ? draft.photoAlbum : undefined,
    pets: draft.pets.length > 0 ? draft.pets : undefined,
    targetCanvasId: legacyCrossCanvasLink?.targetCanvasId || draft.targetCanvasId.trim() || undefined,
    targetCanvasTitle: legacyCrossCanvasLink?.targetCanvasTitle || draft.targetCanvasTitle.trim() || undefined,
    targetCanvasPersonId: legacyCrossCanvasLink?.targetPersonId || undefined,
    crossCanvasLinks: realCrossCanvasLinks.length > 0 ? realCrossCanvasLinks : undefined,
    branchLinks: draft.branchLinks.length > 0 ? draft.branchLinks : undefined,
  };
}

export interface LiveCardWarning {
  id: string;
  severity: 'error' | 'warning';
  message: string;
}

export function computeLiveWarnings(
  draftPerson: Person,
  allPersons: Record<string, Person>
): LiveCardWarning[] {
  const warnings: LiveCardWarning[] = [];
  const currentYear = new Date().getFullYear();

  const genderWarn = checkGenderMismatch(draftPerson.firstName, draftPerson.gender);
  if (genderWarn) {
    warnings.push({ id: 'gender', severity: 'warning', message: genderWarn });
  }

  const bYear = extractBirthYear(draftPerson);
  const dYear = draftPerson.isDeceased ? extractDeathYear(draftPerson) : null;

  if (bYear !== null && bYear > currentYear) {
    warnings.push({
      id: 'future-birth',
      severity: 'error',
      message: `Рік народження (${bYear}) перевищує поточний ${currentYear} рік.`,
    });
  }

  if (dYear !== null && dYear > currentYear) {
    warnings.push({
      id: 'future-death',
      severity: 'error',
      message: `Рік смерті (${dYear}) перевищує поточний ${currentYear} рік.`,
    });
  }

  if (bYear !== null && dYear !== null && dYear < bYear) {
    warnings.push({
      id: 'death-before-birth',
      severity: 'error',
      message: `Рік смерті (${dYear}) менший за рік народження (${bYear}).`,
    });
  } else if (bYear !== null && dYear !== null && dYear - bYear > 115) {
    warnings.push({
      id: 'long-lifespan',
      severity: 'warning',
      message: `Тривалість життя ${dYear - bYear} років — перевірте дати.`,
    });
  }

  if (bYear !== null && draftPerson.birthYearEnd) {
    const endYr = parseInt(draftPerson.birthYearEnd, 10);
    if (!isNaN(endYr) && endYr < bYear) {
      warnings.push({
        id: 'period-inverted',
        severity: 'error',
        message: `Кінець періоду (${endYr}) менший за початок (${bYear}).`,
      });
    }
  }

  if (bYear !== null) {
    (draftPerson.parents || []).forEach((pId) => {
      const parent = allPersons[pId];
      if (!parent) return;
      const pName = [parent.firstName, parent.lastName].filter(Boolean).join(' ').trim() || 'Батько/мати';
      const pBirth = extractBirthYear(parent);
      const pDeath = extractDeathYear(parent);

      if (pBirth !== null) {
        const age = bYear - pBirth;
        if (age <= 0) {
          warnings.push({
            id: `older-parent-${pId}`,
            severity: 'error',
            message: `Особа не може бути старшою або ровесником ${pName} (${pBirth} р.н.).`,
          });
        } else if (age < 12) {
          warnings.push({
            id: `young-parent-${pId}`,
            severity: 'error',
            message: `${pName} мав(ла) лише ${age} р. на момент народження цієї особи.`,
          });
        }
      }
      if (pDeath !== null) {
        if (parent.gender === 'female' && bYear > pDeath) {
          warnings.push({
            id: `after-mother-death-${pId}`,
            severity: 'error',
            message: `Народження (${bYear}) після смерті матері ${pName} (${pDeath}).`,
          });
        } else if (parent.gender !== 'female' && bYear > pDeath + 1) {
          warnings.push({
            id: `after-father-death-${pId}`,
            severity: 'error',
            message: `Народження (${bYear}) після смерті батька ${pName} (${pDeath}).`,
          });
        }
      }
    });

    (draftPerson.children || []).forEach((cId) => {
      const child = allPersons[cId];
      if (!child) return;
      const cBirth = extractBirthYear(child);
      if (cBirth === null) return;
      const cName = [child.firstName, child.lastName].filter(Boolean).join(' ').trim() || 'Дитина';
      const ageAtChild = cBirth - bYear;
      if (ageAtChild <= 0) {
        warnings.push({
          id: `child-older-${cId}`,
          severity: 'error',
          message: `Дитина ${cName} (${cBirth} р.н.) старша за батька/матір.`,
        });
      } else if (ageAtChild < 12) {
        warnings.push({
          id: `child-too-early-${cId}`,
          severity: 'error',
          message: `Вік при народженні дитини ${cName} — лише ${ageAtChild} р.`,
        });
      }
    });
  }

  return warnings;
}

export function computeCompleteness(draft: EditPersonDraft): {
  filled: number;
  total: number;
  percent: number;
} {
  const checks = [
    Boolean(draft.firstName.trim()),
    Boolean(draft.lastName.trim()),
    Boolean(draft.avatarUrl),
    Boolean(draft.birthYear.trim() || draft.yearsDisplay.trim()),
    Boolean(draft.birthPlace.trim() || draft.residencePlace.trim()),
    Boolean(draft.profession.trim() || draft.education.trim()),
    Boolean(draft.biography.trim() || draft.interestingStories.trim()),
    draft.metricDocuments.length > 0 || draft.isFullyVerified,
  ];
  const filled = checks.filter(Boolean).length;
  return {
    filled,
    total: checks.length,
    percent: Math.round((filled / checks.length) * 100),
  };
}
