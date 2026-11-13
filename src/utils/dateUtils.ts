import { Person } from '../types/tree';

export const UKRAINIAN_MONTHS = [
  { value: '01', name: 'Січень (01)', short: 'січ' },
  { value: '02', name: 'Лютий (02)', short: 'лют' },
  { value: '03', name: 'Березень (03)', short: 'бер' },
  { value: '04', name: 'Квітень (04)', short: 'кві' },
  { value: '05', name: 'Травень (05)', short: 'тра' },
  { value: '06', name: 'Червень (06)', short: 'чер' },
  { value: '07', name: 'Липень (07)', short: 'лип' },
  { value: '08', name: 'Серпень (08)', short: 'сер' },
  { value: '09', name: 'Вересень (09)', short: 'вер' },
  { value: '10', name: 'Жовтень (10)', short: 'жов' },
  { value: '11', name: 'Листопад (11)', short: 'лис' },
  { value: '12', name: 'Грудень (12)', short: 'гру' },
];

export const UKRAINIAN_MONTH_NAMES = UKRAINIAN_MONTHS.map((m) => m.name.split(' ')[0]);

export const MONTH_NAMES_GENITIVE = [
  '',
  'січня',
  'лютого',
  'березня',
  'квітня',
  'травня',
  'червня',
  'липня',
  'серпня',
  'вересня',
  'жовтня',
  'листопада',
  'грудня',
];

/**
 * Extracts a 4-digit birth year from person's data
 */
export function extractBirthYear(person: Person): number | null {
  if (person.birthYear) {
    const yr = parseInt(person.birthYear.trim(), 10);
    if (!isNaN(yr) && yr > 0) return yr;
  }
  if (person.birthDate) {
    const parsed = parseDateString(person.birthDate);
    if (parsed.year) {
      const yr = parseInt(parsed.year, 10);
      if (!isNaN(yr) && yr > 0) return yr;
    }
  }
  if (person.yearsDisplay) {
    const match = person.yearsDisplay.match(/\b(1[6-9]\d{2}|20\d{2})\b/);
    if (match) return parseInt(match[1], 10);
  }
  return null;
}

/**
 * Extracts a 4-digit death year from person's data
 */
export function extractDeathYear(person: Person): number | null {
  if (person.deathYear) {
    const yr = parseInt(person.deathYear.trim(), 10);
    if (!isNaN(yr) && yr > 0) return yr;
  }
  if (person.deathDate) {
    const parsed = parseDateString(person.deathDate);
    if (parsed.year) {
      const yr = parseInt(parsed.year, 10);
      if (!isNaN(yr) && yr > 0) return yr;
    }
  }
  if (person.yearsDisplay) {
    const matches = person.yearsDisplay.match(/\b(1[6-9]\d{2}|20\d{2})\b/g);
    if (matches && matches.length >= 2) {
      return parseInt(matches[1], 10);
    }
  }
  return null;
}

/**
 * Calculates person lifespan or current age in numeric years
 */
export function calculatePersonAgeYears(person: Person): number | null {
  const bYear = extractBirthYear(person);
  if (bYear === null) return null;
  const dYear = extractDeathYear(person);

  if (dYear !== null && dYear >= bYear) {
    return dYear - bYear;
  }

  if (!person.isDeceased && dYear === null) {
    const currentYear = new Date().getFullYear();
    const age = currentYear - bYear;
    if (age >= 0 && age <= 125) {
      return age;
    }
  }

  return null;
}

/**
 * Normalizes day or month to 2 digits (e.g. 3 -> "03")
 */
export function padZero(val?: string | number): string {
  if (!val) return '';
  const num = parseInt(String(val).trim(), 10);
  if (isNaN(num)) return String(val).trim();
  return num < 10 ? `0${num}` : `${num}`;
}

/**
 * Builds formatted date string: e.g. "08.07.1993", "1993", "1910–1912", "бл. 1910"
 */
export function formatSingleDate(
  day?: string | number,
  month?: string | number,
  year?: string | number,
  delimiter: string = '.',
  yearEnd?: string | number,
  isApprox?: boolean
): string {
  const d = padZero(day);
  const m = padZero(month);
  const y = year ? String(year).trim() : '';
  const yEnd = yearEnd ? String(yearEnd).trim() : '';

  if (!y && !m && !d) return '';

  let res = '';
  if (d && m && y) {
    res = `${d}${delimiter}${m}${delimiter}${y}`;
  } else if (m && y) {
    res = `${m}${delimiter}${y}`;
  } else if (y) {
    res = y;
  }

  if (res && yEnd && yEnd !== y) {
    res = `${res}–${yEnd}`;
  }

  if (res && isApprox && !res.startsWith('бл.') && !res.startsWith('~')) {
    res = `бл. ${res}`;
  }

  return res;
}

export interface ParsedDate {
  day: string;
  month: string;
  year: string;
  yearEnd?: string;
  isApprox?: boolean;
}

/**
 * Parses any date string (e.g. "08.07.1993", "1910–1912", "1910-1915", "бл. 1910", "1993") into ParsedDate
 */
export function parseDateString(str?: string): ParsedDate {
  if (!str) return { day: '', month: '', year: '' };

  let s = str.trim();
  const isApprox = /^(бл\.?|близько|~|circa|c\.)\s*/i.test(s);
  if (isApprox) {
    s = s.replace(/^(бл\.?|близько|~|circa|c\.)\s*/i, '').trim();
  }

  // Format: Range of years YYYY-YYYY or YYYY–YYYY (e.g. 1910-1912, 1910–1912)
  const yearRangeMatch = s.match(/^(\d{4})\s*[-—–~./]\s*(\d{4})$/);
  if (yearRangeMatch) {
    return {
      day: '',
      month: '',
      year: yearRangeMatch[1],
      yearEnd: yearRangeMatch[2],
      isApprox: true,
    };
  }

  // Format: DD.MM.YYYY–YYYY or DD.MM.YYYY-YYYY
  const dateRangeMatch = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})\s*[-—–~]\s*(\d{4})$/);
  if (dateRangeMatch) {
    return {
      day: padZero(dateRangeMatch[1]),
      month: padZero(dateRangeMatch[2]),
      year: dateRangeMatch[3],
      yearEnd: dateRangeMatch[4],
      isApprox: true,
    };
  }

  // Format: YYYY-MM-DD
  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    return {
      year: isoMatch[1],
      month: padZero(isoMatch[2]),
      day: padZero(isoMatch[3]),
      isApprox,
    };
  }

  // Format: DD.MM.YYYY or DD/MM/YYYY
  const dotSlashMatch = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (dotSlashMatch) {
    return {
      day: padZero(dotSlashMatch[1]),
      month: padZero(dotSlashMatch[2]),
      year: dotSlashMatch[3],
      isApprox,
    };
  }

  // Format: MM.YYYY or MM/YYYY
  const monthYearMatch = s.match(/^(\d{1,2})[./](\d{4})$/);
  if (monthYearMatch) {
    return {
      day: '',
      month: padZero(monthYearMatch[1]),
      year: monthYearMatch[2],
      isApprox,
    };
  }

  // Just 4-digit year: YYYY
  const yearMatch = s.match(/\b(1[6-9]\d{2}|20\d{2})\b/);
  if (yearMatch) {
    return {
      day: '',
      month: '',
      year: yearMatch[1],
      isApprox,
    };
  }

  return { day: '', month: '', year: '', isApprox };
}

/**
 * Returns formatted person life dates for card display:
 * e.g.:
 *  "08.07.1993"
 *  "1910–1912 (114–116 р.)"
 *  "01.01.1897 — 23.08.1899"
 *  "1908 — 2002"
 */
export function formatPersonLifeDates(person: Person): string {
  const parsedB = parseDateString(person.birthDate);
  const birthDay = person.birthDay || parsedB.day;
  const birthMonth = person.birthMonth || parsedB.month;
  const birthYear =
    person.birthYear ||
    parsedB.year ||
    (person.birthDate ? (person.birthDate.match(/\b(1[6-9]\d{2}|20\d{2})\b/)?.[0] || '') : '');
  const birthYearEnd = person.birthYearEnd || parsedB.yearEnd;
  const isBirthApprox = Boolean(person.isBirthDateApproximate || parsedB.isApprox);

  const parsedD = parseDateString(person.deathDate);
  const deathDay = person.deathDay || parsedD.day;
  const deathMonth = person.deathMonth || parsedD.month;
  const deathYear =
    person.deathYear ||
    parsedD.year ||
    (person.deathDate ? (person.deathDate.match(/\b(1[6-9]\d{2}|20\d{2})\b/)?.[0] || '') : '');

  const formattedBirth = formatSingleDate(birthDay, birthMonth, birthYear, '.', birthYearEnd, isBirthApprox);
  const formattedDeath = formatSingleDate(deathDay, deathMonth, deathYear, '.');
  const ageStr = calculateAge(person);
  const ageSuffix = ageStr ? ` (${ageStr})` : '';

  if (formattedBirth && formattedDeath) {
    return `${formattedBirth} — ${formattedDeath}${ageSuffix}`;
  }

  if (formattedBirth) {
    if (person.isDeceased) {
      return `${formattedBirth} — †${ageSuffix}`;
    }
    return `${formattedBirth}${ageSuffix}`;
  }

  if (formattedDeath) {
    return `† ${formattedDeath}${ageSuffix}`;
  }

  if (person.yearsDisplay) {
    return `${person.yearsDisplay}${ageSuffix}`;
  }

  return '';
}

export function calculateAge(person: Person): string {
  // Extract birth year start & end
  let bYear: number | null = null;
  let bYearEnd: number | null = null;
  let isApprox = Boolean(person.isBirthDateApproximate);

  if (person.birthYear) {
    const parsed = parseDateString(person.birthYear);
    if (parsed.year) bYear = parseInt(parsed.year, 10);
    if (parsed.yearEnd) bYearEnd = parseInt(parsed.yearEnd, 10);
    if (parsed.isApprox) isApprox = true;
  }
  if (person.birthYearEnd) {
    const yrEnd = parseInt(person.birthYearEnd.trim(), 10);
    if (!isNaN(yrEnd)) bYearEnd = yrEnd;
  }
  if (bYear === null && person.birthDate) {
    const parsed = parseDateString(person.birthDate);
    if (parsed.year) bYear = parseInt(parsed.year, 10);
    if (parsed.yearEnd && !bYearEnd) bYearEnd = parseInt(parsed.yearEnd, 10);
    if (parsed.isApprox) isApprox = true;
  }
  if (bYear === null && person.yearsDisplay) {
    const match = person.yearsDisplay.match(/\b(1[6-9]\d{2}|20\d{2})\b/);
    if (match) bYear = parseInt(match[1], 10);
  }

  if (bYear === null || isNaN(bYear)) return '';

  // Extract death year
  let dYear: number | null = null;
  if (person.deathYear) {
    const yr = parseInt(person.deathYear.trim(), 10);
    if (!isNaN(yr)) dYear = yr;
  }
  if (dYear === null && person.deathDate) {
    const parsed = parseDateString(person.deathDate);
    if (parsed.year) dYear = parseInt(parsed.year, 10);
  }
  if (dYear === null && person.yearsDisplay) {
    const years = person.yearsDisplay.match(/\b(1[6-9]\d{2}|20\d{2})\b/g);
    if (years && years.length >= 2) {
      dYear = parseInt(years[1], 10);
    }
  }

  const isDead = Boolean(person.isDeceased || dYear !== null);

  // If deceased but no death year found, cannot compute age at death
  if (isDead && dYear === null) {
    return '';
  }

  const endYear = isDead ? dYear! : new Date().getFullYear();
  if (endYear < bYear) return '';

  // If birth date is a period / range (e.g. 1910–1912)
  if (bYearEnd && bYearEnd !== bYear) {
    const minBirth = Math.min(bYear, bYearEnd);
    const maxBirth = Math.max(bYear, bYearEnd);
    const minAge = Math.max(0, endYear - maxBirth);
    const maxAge = Math.max(0, endYear - minBirth);
    if (minAge === maxAge) return `${minAge} р.`;
    return `${minAge}–${maxAge} р.`;
  }

  let age = endYear - bYear;

  // Month & Day refinement
  const birthDay = person.birthDay || parseDateString(person.birthDate).day;
  const birthMonth = person.birthMonth || parseDateString(person.birthDate).month;
  const deathDay = person.deathDay || parseDateString(person.deathDate).day;
  const deathMonth = person.deathMonth || parseDateString(person.deathDate).month;

  if (birthMonth) {
    const bM = parseInt(birthMonth, 10);
    const bD = birthDay ? parseInt(birthDay, 10) : 1;

    if (!isNaN(bM) && bM >= 1 && bM <= 12) {
      if (isDead && deathMonth) {
        const dM = parseInt(deathMonth, 10);
        const dD = deathDay ? parseInt(deathDay, 10) : 1;
        if (!isNaN(dM) && (dM < bM || (dM === bM && !isNaN(dD) && !isNaN(bD) && dD < bD))) {
          age -= 1;
        }
      } else if (!isDead) {
        const now = new Date();
        const nowM = now.getMonth() + 1;
        const nowD = now.getDate();
        if (nowM < bM || (nowM === bM && !isNaN(bD) && nowD < bD)) {
          age -= 1;
        }
      }
    }
  }

  if (age < 0) return '';

  if (isApprox) {
    return `~${age} р.`;
  }

  return `${age} р.`;
}

export interface CardDatesInfo {
  birth: string;
  death: string;
  isDeceased: boolean;
  isSingleLine: boolean;
  displayLine1: string;
  displayLine2: string;
  fullTitle: string;
  birthFormatted: string;
  deathFormatted: string;
  ageStr: string;
}

/**
 * Returns structured birth and death date display specifically tailored for the minicard.
 * For living persons and deceased persons alike, age is placed in parentheses with the birth date.
 * Death date is kept on its own line/field so both are individually clickable for metric uploads.
 */
export function getCardDates(person: Person): CardDatesInfo {
  const parsedB = parseDateString(person.birthDate);
  const birthDay = person.birthDay || parsedB.day;
  const birthMonth = person.birthMonth || parsedB.month;
  const birthYear =
    person.birthYear ||
    parsedB.year ||
    (person.birthDate ? (person.birthDate.match(/\b(1[6-9]\d{2}|20\d{2})\b/)?.[0] || '') : '');
  const birthYearEnd = person.birthYearEnd || parsedB.yearEnd;
  const isBirthApprox = Boolean(person.isBirthDateApproximate || parsedB.isApprox);

  const parsedD = parseDateString(person.deathDate);
  const deathDay = person.deathDay || parsedD.day;
  const deathMonth = person.deathMonth || parsedD.month;
  const deathYear =
    person.deathYear ||
    parsedD.year ||
    (person.deathDate ? (person.deathDate.match(/\b(1[6-9]\d{2}|20\d{2})\b/)?.[0] || '') : '');

  let formattedBirth = formatSingleDate(birthDay, birthMonth, birthYear, '.', birthYearEnd, isBirthApprox);
  let formattedDeath = formatSingleDate(deathDay, deathMonth, deathYear, '.');
  const ageStr = calculateAge(person);
  const ageSuffix = ageStr ? ` (${ageStr})` : '';

  // Handle explicit yearsDisplay (e.g. "01/01/1897 - 08/23/1899" or "1908 - 1956")
  if (person.yearsDisplay && !formattedBirth && !formattedDeath) {
    const raw = person.yearsDisplay.trim();
    const dashMatch = raw.split(/\s*[-—–]\s*/);
    if (dashMatch.length === 2) {
      formattedBirth = dashMatch[0];
      formattedDeath = dashMatch[1];
    } else {
      formattedBirth = raw;
    }
  }

  const isDeceased = Boolean(person.isDeceased || formattedDeath);

  let displayLine1 = '';
  let displayLine2 = '';

  if (formattedBirth) {
    displayLine1 = `${formattedBirth}${ageSuffix}`;
  } else if (ageStr) {
    displayLine1 = `(${ageStr})`;
  }

  if (formattedDeath) {
    displayLine2 = `† ${formattedDeath}`;
  } else if (isDeceased && formattedBirth) {
    displayLine2 = '†';
  }

  let fullTitle = '';
  if (formattedBirth && formattedDeath) {
    fullTitle = `${formattedBirth} — ${formattedDeath}${ageSuffix}`;
  } else if (formattedBirth) {
    fullTitle = isDeceased ? `${formattedBirth} — †${ageSuffix}` : `${formattedBirth}${ageSuffix}`;
  } else if (formattedDeath) {
    fullTitle = `† ${formattedDeath}${ageSuffix}`;
  } else if (person.yearsDisplay) {
    fullTitle = `${person.yearsDisplay}${ageSuffix}`;
  }

  return {
    birth: formattedBirth,
    death: formattedDeath,
    isDeceased,
    isSingleLine: !displayLine2,
    displayLine1,
    displayLine2,
    fullTitle,
    birthFormatted: formattedBirth,
    deathFormatted: formattedDeath,
    ageStr,
  };
}
