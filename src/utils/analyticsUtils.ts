/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Person, Gender } from '../types/tree';
import { getClanName } from './lineageUtils';

export interface NameStat {
  name: string;
  count: number;
  percentage: number;
  genderBreakdown: {
    male: number;
    female: number;
    unknown: number;
  };
  personIds: string[];
}

export interface SurnameStat {
  surname: string;
  rawExamples: string[];
  count: number;
  percentage: number;
  maleCount: number;
  femaleCount: number;
  maidenCount: number;
  clanName: string;
  personIds: string[];
}

export interface PlaceStat {
  place: string;
  count: number;
  percentage: number;
  personIds: string[];
}

export interface ProfessionStat {
  profession: string;
  count: number;
  percentage: number;
  personIds: string[];
}

export interface MonthStat {
  monthIndex: number; // 1 to 12
  monthName: string;
  season: 'Зима' | 'Весна' | 'Літо' | 'Осінь';
  count: number;
  percentage: number;
}

export interface LongestLivingPerson {
  person: Person;
  age: number;
  yearsSpan: string;
}

export interface MostChildrenRecord {
  parents: Person[];
  childrenCount: number;
  children: Person[];
}

export interface NameInheritanceRecord {
  name: string;
  ancestor: Person;
  descendant: Person;
  relation: string;
}

export interface ComprehensiveDemographics {
  totalPersons: number;
  genderCounts: {
    male: number;
    female: number;
    unknown: number;
  };
  genderPercentages: {
    male: number;
    female: number;
    unknown: number;
  };
  livingCount: number;
  deceasedCount: number;
  averageLifespan: number | null;
  longestLivingList: LongestLivingPerson[];
  youngestLiving: { person: Person; age: number } | null;
  ageCohorts: {
    label: string;
    range: string;
    count: number;
    percentage: number;
  }[];
  generationCounts: {
    generation: number;
    count: number;
  }[];
  centuryCounts: {
    century: string;
    count: number;
  }[];
  birthPlaces: PlaceStat[];
  residencePlaces: PlaceStat[];
  professions: ProfessionStat[];
  birthMonths: MonthStat[];
  seasonCounts: {
    season: 'Зима' | 'Весна' | 'Літо' | 'Осінь';
    count: number;
    percentage: number;
  }[];
  familyRecords: {
    mostChildren: MostChildrenRecord[];
    averageChildrenPerFamily: number;
    totalCouples: number;
    divorcedCouplesCount: number;
    singleParentsCount: number;
    averageAgeAtFirstChild: number | null;
  };
  heritageEchoes: {
    inheritedNames: NameInheritanceRecord[];
    rareNames: { name: string; person: Person }[];
  };
  archiveStats: {
    totalPhotos: number;
    totalDocuments: number;
    totalStories: number;
    totalPets: number;
    verifiedPersonsCount: number;
    verifiedPercentage: number;
  };
}

import { UKRAINIAN_MONTH_NAMES as UKRAINIAN_MONTHS, calculatePersonAgeYears as calculatePersonAge } from './dateUtils';
export { calculatePersonAge };

/**
 * Normalizes first name
 */
export function normalizeFirstName(raw: string): string {
  const cleaned = raw.trim();
  if (!cleaned || cleaned === '?' || cleaned.toLowerCase() === 'невідомо') return '';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/**
 * Parses month (1-12) from month string or date string
 */
export function extractBirthMonth(person: Person): number | null {
  if (person.birthMonth) {
    const parsed = parseInt(person.birthMonth, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 12) return parsed;
    // Check by name
    const idx = UKRAINIAN_MONTHS.findIndex(
      (m) => m.toLowerCase() === person.birthMonth?.toLowerCase().trim()
    );
    if (idx !== -1) return idx + 1;
  }

  if (person.birthDate) {
    // Check YYYY-MM-DD or DD.MM.YYYY
    const partsDot = person.birthDate.split('.');
    if (partsDot.length === 3) {
      const m = parseInt(partsDot[1], 10);
      if (!isNaN(m) && m >= 1 && m <= 12) return m;
    }
    const partsDash = person.birthDate.split('-');
    if (partsDash.length === 3) {
      const m = parseInt(partsDash[1], 10);
      if (!isNaN(m) && m >= 1 && m <= 12) return m;
    }
  }

  return null;
}

/**
 * Computes frequency distribution of first names
 */
export function getTopFirstNames(
  persons: Record<string, Person>,
  genderFilter: 'all' | 'male' | 'female' = 'all'
): NameStat[] {
  const counts = new Map<
    string,
    {
      count: number;
      male: number;
      female: number;
      unknown: number;
      personIds: string[];
    }
  >();

  const personList = Object.values(persons);
  let relevantTotal = 0;

  personList.forEach((p) => {
    if (genderFilter !== 'all' && p.gender !== genderFilter) {
      return;
    }

    const name = normalizeFirstName(p.firstName || '');
    if (!name) return;

    relevantTotal++;
    const current = counts.get(name) || {
      count: 0,
      male: 0,
      female: 0,
      unknown: 0,
      personIds: [],
    };

    current.count++;
    if (p.gender === 'male') current.male++;
    else if (p.gender === 'female') current.female++;
    else current.unknown++;
    current.personIds.push(p.id);

    counts.set(name, current);
  });

  if (relevantTotal === 0) return [];

  return Array.from(counts.entries())
    .map(([name, data]) => ({
      name,
      count: data.count,
      percentage: Math.round((data.count / relevantTotal) * 1000) / 10,
      genderBreakdown: {
        male: data.male,
        female: data.female,
        unknown: data.unknown,
      },
      personIds: data.personIds,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'uk'));
}

/**
 * Computes frequency distribution of surnames
 */
export function getTopSurnames(
  persons: Record<string, Person>,
  options: { normalizeToClan?: boolean; countMaidenNames?: boolean } = {}
): SurnameStat[] {
  const { normalizeToClan = true, countMaidenNames = true } = options;

  const counts = new Map<
    string,
    {
      count: number;
      maleCount: number;
      femaleCount: number;
      maidenCount: number;
      rawExamples: Set<string>;
      clanName: string;
      personIds: Set<string>;
    }
  >();

  const personList = Object.values(persons);
  let totalSurnamesCounted = 0;

  personList.forEach((p) => {
    const rawLast = (p.lastName || '').trim();
    const rawMaiden = (p.maidenName || '').trim();

    const surnamesToCount: { name: string; isMaiden: boolean }[] = [];

    if (rawLast && rawLast !== '?' && rawLast.toLowerCase() !== 'невідомо') {
      surnamesToCount.push({ name: rawLast, isMaiden: false });
    }

    if (countMaidenNames && rawMaiden && rawMaiden !== '?' && rawMaiden !== rawLast) {
      surnamesToCount.push({ name: rawMaiden, isMaiden: true });
    }

    surnamesToCount.forEach(({ name: rawName, isMaiden }) => {
      totalSurnamesCounted++;
      const clan = getClanName(p);
      const displayKey = normalizeToClan ? clan : rawName;

      const current = counts.get(displayKey) || {
        count: 0,
        maleCount: 0,
        femaleCount: 0,
        maidenCount: 0,
        rawExamples: new Set<string>(),
        clanName: clan,
        personIds: new Set<string>(),
      };

      current.count++;
      current.rawExamples.add(rawName);
      current.personIds.add(p.id);

      if (isMaiden) current.maidenCount++;
      if (p.gender === 'male') current.maleCount++;
      else if (p.gender === 'female') current.femaleCount++;

      counts.set(displayKey, current);
    });
  });

  if (totalSurnamesCounted === 0) return [];

  return Array.from(counts.entries())
    .map(([surname, data]) => ({
      surname,
      rawExamples: Array.from(data.rawExamples),
      count: data.count,
      percentage: Math.round((data.count / totalSurnamesCounted) * 1000) / 10,
      maleCount: data.maleCount,
      femaleCount: data.femaleCount,
      maidenCount: data.maidenCount,
      clanName: data.clanName,
      personIds: Array.from(data.personIds),
    }))
    .sort((a, b) => b.count - a.count || a.surname.localeCompare(b.surname, 'uk'));
}

/**
 * Computes comprehensive demographic, geographical, occupational, and family records
 */
export function getComprehensiveDemographics(
  persons: Record<string, Person>,
  generations: Record<string, number>
): ComprehensiveDemographics {
  const personList = Object.values(persons);
  const totalPersons = personList.length;

  let male = 0;
  let female = 0;
  let unknown = 0;
  let livingCount = 0;
  let deceasedCount = 0;

  const lifespans: number[] = [];
  const longestLivingList: LongestLivingPerson[] = [];
  let youngestLiving: { person: Person; age: number } | null = null;

  const birthPlaceCounts = new Map<string, string[]>();
  const residencePlaceCounts = new Map<string, string[]>();
  const professionCounts = new Map<string, string[]>();
  const monthCounts = new Array(12).fill(0);

  const genCountMap = new Map<number, number>();
  const centuryMap = new Map<string, number>([
    ['До XIX ст.', 0],
    ['XIX ст. (1800-1899)', 0],
    ['XX ст. (1900-1999)', 0],
    ['XXI ст. (2000+)', 0],
  ]);

  const ageCohorts = [
    { label: 'Діти та підлітки', range: '0–17 р.', min: 0, max: 17, count: 0 },
    { label: 'Молодь', range: '18–35 р.', min: 18, max: 35, count: 0 },
    { label: 'Зрілий вік', range: '36–60 р.', min: 36, max: 60, count: 0 },
    { label: 'Поважний вік', range: '61–80 р.', min: 61, max: 80, count: 0 },
    { label: 'Довгожителі', range: '81+ р.', min: 81, max: 150, count: 0 },
  ];

  let totalPhotos = 0;
  let totalDocuments = 0;
  let totalStories = 0;
  let totalPets = 0;
  let verifiedPersonsCount = 0;

  personList.forEach((p) => {
    // Gender
    if (p.gender === 'male') male++;
    else if (p.gender === 'female') female++;
    else unknown++;

    // Status
    if (p.isDeceased || p.deathYear || p.deathDate) {
      deceasedCount++;
    } else {
      livingCount++;
    }

    if (p.isFullyVerified) {
      verifiedPersonsCount++;
    }

    // Archives
    if (p.photoAlbum && Array.isArray(p.photoAlbum)) {
      totalPhotos += p.photoAlbum.length;
    }
    if (p.metricDocuments && Array.isArray(p.metricDocuments)) {
      totalDocuments += p.metricDocuments.length;
    }
    if (p.interestingStories || p.biography) {
      totalStories++;
    }
    if (p.pets && Array.isArray(p.pets)) {
      totalPets += p.pets.length;
    }

    // Age
    const age = calculatePersonAge(p);
    if (age !== null) {
      if (p.isDeceased || p.deathYear) {
        lifespans.push(age);
        const b = p.birthYear || '?';
        const d = p.deathYear || '?';
        longestLivingList.push({
          person: p,
          age,
          yearsSpan: `${b}–${d}`,
        });
      } else {
        if (!youngestLiving || age < youngestLiving.age) {
          youngestLiving = { person: p, age };
        }
      }

      // Cohort
      const cohort = ageCohorts.find((c) => age >= c.min && age <= c.max);
      if (cohort) cohort.count++;
    }

    // Places
    const bp = (p.birthPlace || '').trim();
    if (bp && bp !== '?' && bp.toLowerCase() !== 'невідомо') {
      const list = birthPlaceCounts.get(bp) || [];
      list.push(p.id);
      birthPlaceCounts.set(bp, list);
    }

    const rp = (p.residencePlace || '').trim();
    if (rp && rp !== '?' && rp.toLowerCase() !== 'невідомо') {
      const list = residencePlaceCounts.get(rp) || [];
      list.push(p.id);
      residencePlaceCounts.set(rp, list);
    }

    // Professions
    const prof = (p.profession || '').trim();
    if (prof && prof !== '?' && prof.toLowerCase() !== 'невідомо') {
      const normalizedProf = prof.charAt(0).toUpperCase() + prof.slice(1);
      const list = professionCounts.get(normalizedProf) || [];
      list.push(p.id);
      professionCounts.set(normalizedProf, list);
    }

    // Birth Month
    const m = extractBirthMonth(p);
    if (m !== null && m >= 1 && m <= 12) {
      monthCounts[m - 1]++;
    }

    // Generations
    const g = generations[p.id] ?? 0;
    genCountMap.set(g, (genCountMap.get(g) || 0) + 1);

    // Century
    const bYear = parseInt(p.birthYear || '', 10);
    if (!isNaN(bYear)) {
      if (bYear < 1800) {
        centuryMap.set('До XIX ст.', (centuryMap.get('До XIX ст.') || 0) + 1);
      } else if (bYear < 1900) {
        centuryMap.set('XIX ст. (1800-1899)', (centuryMap.get('XIX ст. (1800-1899)') || 0) + 1);
      } else if (bYear < 2000) {
        centuryMap.set('XX ст. (1900-1999)', (centuryMap.get('XX ст. (1900-1999)') || 0) + 1);
      } else {
        centuryMap.set('XXI ст. (2000+)', (centuryMap.get('XXI ст. (2000+)') || 0) + 1);
      }
    }
  });

  // Sort longest living descending
  longestLivingList.sort((a, b) => b.age - a.age);

  const averageLifespan =
    lifespans.length > 0
      ? Math.round(lifespans.reduce((a, b) => a + b, 0) / lifespans.length)
      : null;

  // Birthplaces stats
  const totalPlacesRecorded = Array.from(birthPlaceCounts.values()).reduce((sum, ids) => sum + ids.length, 0);
  const birthPlaces: PlaceStat[] = Array.from(birthPlaceCounts.entries())
    .map(([place, ids]) => ({
      place,
      count: ids.length,
      percentage: totalPlacesRecorded > 0 ? Math.round((ids.length / totalPlacesRecorded) * 1000) / 10 : 0,
      personIds: ids,
    }))
    .sort((a, b) => b.count - a.count);

  // Residence stats
  const totalResRecorded = Array.from(residencePlaceCounts.values()).reduce((sum, ids) => sum + ids.length, 0);
  const residencePlaces: PlaceStat[] = Array.from(residencePlaceCounts.entries())
    .map(([place, ids]) => ({
      place,
      count: ids.length,
      percentage: totalResRecorded > 0 ? Math.round((ids.length / totalResRecorded) * 1000) / 10 : 0,
      personIds: ids,
    }))
    .sort((a, b) => b.count - a.count);

  // Profession stats
  const totalProfRecorded = Array.from(professionCounts.values()).reduce((sum, ids) => sum + ids.length, 0);
  const professions: ProfessionStat[] = Array.from(professionCounts.entries())
    .map(([profession, ids]) => ({
      profession,
      count: ids.length,
      percentage: totalProfRecorded > 0 ? Math.round((ids.length / totalProfRecorded) * 1000) / 10 : 0,
      personIds: ids,
    }))
    .sort((a, b) => b.count - a.count);

  // Months & Seasons
  const totalMonthRecorded = monthCounts.reduce((a, b) => a + b, 0);
  const birthMonths: MonthStat[] = UKRAINIAN_MONTHS.map((name, idx) => {
    const c = monthCounts[idx];
    let season: 'Зима' | 'Весна' | 'Літо' | 'Осінь' = 'Зима';
    if (idx === 11 || idx === 0 || idx === 1) season = 'Зима';
    else if (idx >= 2 && idx <= 4) season = 'Весна';
    else if (idx >= 5 && idx <= 7) season = 'Літо';
    else season = 'Осінь';

    return {
      monthIndex: idx + 1,
      monthName: name,
      season,
      count: c,
      percentage: totalMonthRecorded > 0 ? Math.round((c / totalMonthRecorded) * 100) : 0,
    };
  });

  const seasonMap = { Зима: 0, Весна: 0, Літо: 0, Осінь: 0 };
  birthMonths.forEach((m) => {
    seasonMap[m.season] += m.count;
  });
  const seasonCounts = (['Весна', 'Літо', 'Осінь', 'Зима'] as const).map((s) => ({
    season: s,
    count: seasonMap[s],
    percentage: totalMonthRecorded > 0 ? Math.round((seasonMap[s] / totalMonthRecorded) * 100) : 0,
  }));

  // Family Records (Most children, couples)
  const familyRecordsMap = new Map<string, { parents: Person[]; children: Set<string> }>();
  let totalCouples = 0;
  const processedSpousePairs = new Set<string>();

  personList.forEach((p) => {
    (p.spouses || []).forEach((sId) => {
      const pairKey = [p.id, sId].sort().join('::');
      if (!processedSpousePairs.has(pairKey)) {
        processedSpousePairs.add(pairKey);
        totalCouples++;
      }
    });

    if (p.children && p.children.length > 0) {
      // Find co-parents
      p.children.forEach((cId) => {
        const child = persons[cId];
        if (!child) return;
        const parents = (child.parents || []).map((id) => persons[id]).filter(Boolean);
        const pKey = parents.map((pr) => pr.id).sort().join('::');
        const entry = familyRecordsMap.get(pKey) || { parents, children: new Set<string>() };
        entry.children.add(child.id);
        familyRecordsMap.set(pKey, entry);
      });
    }
  });

  const mostChildren: MostChildrenRecord[] = Array.from(familyRecordsMap.values())
    .map((rec) => ({
      parents: rec.parents,
      childrenCount: rec.children.size,
      children: Array.from(rec.children).map((id) => persons[id]).filter(Boolean),
    }))
    .filter((r) => r.childrenCount > 0)
    .sort((a, b) => b.childrenCount - a.childrenCount)
    .slice(0, 5);

  const totalChildrenInFamilies = mostChildren.reduce((sum, f) => sum + f.childrenCount, 0);
  const averageChildrenPerFamily =
    mostChildren.length > 0 ? Math.round((totalChildrenInFamilies / mostChildren.length) * 10) / 10 : 0;

  // Average age at first child
  const agesAtFirstChild: number[] = [];
  personList.forEach((parent) => {
    const parentBYear = parseInt(parent.birthYear || '', 10);
    if (isNaN(parentBYear) || !parent.children || parent.children.length === 0) return;

    const childYears = parent.children
      .map((cId) => parseInt(persons[cId]?.birthYear || '', 10))
      .filter((y) => !isNaN(y));

    if (childYears.length > 0) {
      const minChildYear = Math.min(...childYears);
      const ageAtFirst = minChildYear - parentBYear;
      if (ageAtFirst >= 14 && ageAtFirst <= 60) {
        agesAtFirstChild.push(ageAtFirst);
      }
    }
  });

  const averageAgeAtFirstChild =
    agesAtFirstChild.length > 0
      ? Math.round(agesAtFirstChild.reduce((a, b) => a + b, 0) / agesAtFirstChild.length)
      : null;

  // Name Inheritance & Echoes
  const inheritedNames: NameInheritanceRecord[] = [];
  const nameOccurrences = new Map<string, Person[]>();

  personList.forEach((p) => {
    const n = normalizeFirstName(p.firstName || '');
    if (!n) return;
    const list = nameOccurrences.get(n) || [];
    list.push(p);
    nameOccurrences.set(n, list);

    // Check if named after grandfather or father
    (p.parents || []).forEach((parentId) => {
      const parent = persons[parentId];
      if (parent && normalizeFirstName(parent.firstName) === n) {
        inheritedNames.push({
          name: n,
          ancestor: parent,
          descendant: p,
          relation: parent.gender === 'male' ? 'від батька до сина' : 'від матері до доньки',
        });
      }

      if (parent) {
        (parent.parents || []).forEach((grandparentId) => {
          const grand = persons[grandparentId];
          if (grand && normalizeFirstName(grand.firstName) === n) {
            inheritedNames.push({
              name: n,
              ancestor: grand,
              descendant: p,
              relation: grand.gender === 'male' ? 'від діда до онука' : 'від бабусі до онуки',
            });
          }
        });
      }
    });
  });

  // Rare names (occurring exactly once)
  const rareNames: { name: string; person: Person }[] = [];
  nameOccurrences.forEach((list, name) => {
    if (list.length === 1) {
      rareNames.push({ name, person: list[0] });
    }
  });

  return {
    totalPersons,
    genderCounts: { male, female, unknown },
    genderPercentages: {
      male: totalPersons > 0 ? Math.round((male / totalPersons) * 100) : 0,
      female: totalPersons > 0 ? Math.round((female / totalPersons) * 100) : 0,
      unknown: totalPersons > 0 ? Math.round((unknown / totalPersons) * 100) : 0,
    },
    livingCount,
    deceasedCount,
    averageLifespan,
    longestLivingList: longestLivingList.slice(0, 5),
    youngestLiving,
    ageCohorts: ageCohorts.map((c) => ({
      ...c,
      percentage: totalPersons > 0 ? Math.round((c.count / totalPersons) * 100) : 0,
    })),
    generationCounts: Array.from(genCountMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([generation, count]) => ({ generation, count })),
    centuryCounts: Array.from(centuryMap.entries()).map(([century, count]) => ({
      century,
      count,
    })),
    birthPlaces,
    residencePlaces,
    professions,
    birthMonths,
    seasonCounts,
    familyRecords: {
      mostChildren,
      averageChildrenPerFamily,
      totalCouples,
      divorcedCouplesCount: 0,
      singleParentsCount: 0,
      averageAgeAtFirstChild,
    },
    heritageEchoes: {
      inheritedNames,
      rareNames: rareNames.slice(0, 12),
    },
    archiveStats: {
      totalPhotos,
      totalDocuments,
      totalStories,
      totalPets,
      verifiedPersonsCount,
      verifiedPercentage: totalPersons > 0 ? Math.round((verifiedPersonsCount / totalPersons) * 100) : 0,
    },
  };
}
