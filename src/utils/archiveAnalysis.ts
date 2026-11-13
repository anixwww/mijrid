import { ArchiveSourceEntry, ArchiveSourceType, ArchiveSourceStatus, FamilyTreeData, Person } from '../types/tree';
import { extractBirthYear } from './timelineUtils';

export type BlindSpotFilterMode =
  | 'off'
  | 'all-gaps'
  | 'missing-birth-metric'
  | 'missing-death-metric'
  | 'missing-dates'
  | 'missing-parents'
  | 'unverified-links'
  | 'ghost-and-proposals';

export type GapKind = Exclude<BlindSpotFilterMode, 'off' | 'all-gaps'>;

export interface PersonGapBadge {
  kind: GapKind;
  label: string;
  severity: 'high' | 'medium' | 'info';
}

export interface PersonGapInfo {
  personId: string;
  personName: string;
  birthYear: number | null;
  deathYear: number | null;
  locality: string;
  gaps: PersonGapBadge[];
}

export interface DecadeCoverageItem {
  decadeLabel: string;
  startYear: number;
  endYear: number;
  personCount: number;
  birthMetricVerifiedCount: number;
  matchingSources: ArchiveSourceEntry[];
  coverageStatus: 'covered' | 'in_progress' | 'planned' | 'blind_spot' | 'empty';
}

export interface ArchiveAnalysisReport {
  totalPersons: number;
  birthMetricCount: number;
  deceasedCount: number;
  deathMetricCount: number;
  personsWithGapsCount: number;
  gapCounts: Record<GapKind, number>;
  personGapsById: Record<string, PersonGapInfo>;
  gapList: PersonGapInfo[];
  decadeCoverage: DecadeCoverageItem[];
  sourceCounts: {
    total: number;
    completed: number;
    in_progress: number;
    planned: number;
  };
}

export const ARCHIVE_SOURCE_TYPE_LABELS: Record<ArchiveSourceType, string> = {
  metric_birth: 'Метрика (народження)',
  metric_marriage: 'Метрика (шлюби)',
  metric_death: 'Метрика (смерть)',
  metric_mixed: 'Метрика (змішана)',
  confession: 'Сповідний розпис',
  revision: 'Ревізька казка / перепис',
  other: 'Інше архівне джерело',
};

export const ARCHIVE_SOURCE_STATUS_LABELS: Record<ArchiveSourceStatus, string> = {
  planned: 'Заплановано',
  in_progress: 'В роботі',
  completed: 'Опрацьовано',
};

export const BLIND_SPOT_FILTER_LABELS: Record<BlindSpotFilterMode, string> = {
  off: 'Вимкнено',
  'all-gaps': 'Усі «білі плями»',
  'missing-birth-metric': 'Без фото метрики народження',
  'missing-death-metric': 'Без фото метрики смерті',
  'missing-dates': 'Без точної дати народження',
  'missing-parents': 'Невідомі батьки',
  'unverified-links': 'Непідтверджені зв’язки',
  'ghost-and-proposals': 'Примарні та пропозиції',
};

function hasBirthMetricPhoto(p: Person): boolean {
  return Boolean(p.birthMetricUrl || p.metricDocuments?.some((d) => d.type === 'birth'));
}

function hasDeathMetricPhoto(p: Person): boolean {
  return Boolean(p.deathMetricUrl || p.metricDocuments?.some((d) => d.type === 'death'));
}

export function analyzeArchiveGaps(tree: FamilyTreeData): ArchiveAnalysisReport {
  const persons = Object.values(tree.persons || {});
  const sources = tree.archiveRegistry || [];

  const personGapsById: Record<string, PersonGapInfo> = {};
  const gapCounts: Record<GapKind, number> = {
    'missing-birth-metric': 0,
    'missing-death-metric': 0,
    'missing-dates': 0,
    'missing-parents': 0,
    'unverified-links': 0,
    'ghost-and-proposals': 0,
  };

  let birthMetricCount = 0;
  let deceasedCount = 0;
  let deathMetricCount = 0;
  let minYear = 2100;
  let maxYear = 1700;

  // Map connection overrides that explicitly mark a person's relation as unverified/hypothetical
  const personsInUnverifiedConnections = new Set<string>();
  Object.entries(tree.connectionOverrides || {}).forEach(([key, meta]) => {
    if (meta && (meta.verified === false || meta.confidenceLevel === 'hypothetical')) {
      const cleaned = key
        .replace(/^marriage:/, '')
        .replace(/^descent:child:/, '')
        .replace(/^sibling:/, '');
      cleaned.split(/[:]+/).forEach((id) => {
        if (id && tree.persons[id]) {
          personsInUnverifiedConnections.add(id);
        }
      });
    }
  });

  persons.forEach((p) => {
    const bYear = extractBirthYear(p);
    const dYear = p.deathYear && /^\d{4}/.test(p.deathYear.trim()) ? parseInt(p.deathYear.trim().slice(0, 4), 10) : null;
    if (bYear !== null) {
      minYear = Math.min(minYear, bYear);
      maxYear = Math.max(maxYear, bYear);
    }
    if (dYear !== null) {
      minYear = Math.min(minYear, dYear);
      maxYear = Math.max(maxYear, dYear);
    }

    const hasBirth = hasBirthMetricPhoto(p);
    const hasDeath = hasDeathMetricPhoto(p);
    if (hasBirth) birthMetricCount += 1;
    if (p.isDeceased) {
      deceasedCount += 1;
      if (hasDeath) deathMetricCount += 1;
    }

    const gaps: PersonGapBadge[] = [];
    const isBlankScreenshot = Boolean(p.isBlankScreenshot);
    const isGhostOrProposal = Boolean(p.isGhost || p.isProposal || isBlankScreenshot);

    if (isGhostOrProposal) {
      gaps.push({
        kind: 'ghost-and-proposals',
        label: p.isProposal
          ? 'Картка-пропозиція (потребує перевірки)'
          : isBlankScreenshot
          ? 'Порожня картка-скріншот (нерозшифрований запис)'
          : 'Примарна картка (нотатка)',
        severity: 'info',
      });
      gapCounts['ghost-and-proposals'] += 1;
    }

    if (!p.isProposal && !p.isGhost && !isBlankScreenshot && !hasBirth) {
      gaps.push({
        kind: 'missing-birth-metric',
        label: 'Немає фото метрики народження',
        severity: bYear !== null && bYear <= 1945 ? 'high' : 'medium',
      });
      gapCounts['missing-birth-metric'] += 1;
    }

    if (!p.isProposal && !p.isGhost && !isBlankScreenshot && p.isDeceased && !hasDeath) {
      gaps.push({
        kind: 'missing-death-metric',
        label: 'Немає фото метрики смерті',
        severity: 'medium',
      });
      gapCounts['missing-death-metric'] += 1;
    }

    if (!isBlankScreenshot && (bYear === null || p.isBirthDateApproximate || p.birthDateType === 'about' || p.birthDateType === 'period')) {
      gaps.push({
        kind: 'missing-dates',
        label: bYear === null ? 'Невідомий рік народження' : 'Приблизна дата народження',
        severity: bYear === null ? 'high' : 'info',
      });
      gapCounts['missing-dates'] += 1;
    }

    if (!p.isGhost && !isBlankScreenshot && (!p.parents || p.parents.length < 2)) {
      gaps.push({
        kind: 'missing-parents',
        label: !p.parents || p.parents.length === 0 ? 'Невідомі батьки' : 'Відомий лише один з батьків',
        severity: 'medium',
      });
      gapCounts['missing-parents'] += 1;
    }

    if (
      (p.unverifiedRelations && p.unverifiedRelations.length > 0) ||
      personsInUnverifiedConnections.has(p.id)
    ) {
      gaps.push({
        kind: 'unverified-links',
        label: 'Є непідтверджені зв’язки',
        severity: 'high',
      });
      gapCounts['unverified-links'] += 1;
    }

    if (gaps.length > 0) {
      const personName = [p.firstName, p.lastName].filter(Boolean).join(' ') || 'Без імені';
      personGapsById[p.id] = {
        personId: p.id,
        personName,
        birthYear: bYear,
        deathYear: dYear,
        locality: p.birthPlace || p.residencePlace || '',
        gaps,
      };
    }
  });

  sources.forEach((s) => {
    if (s.yearFrom > 1500 && s.yearFrom < 2100) minYear = Math.min(minYear, s.yearFrom);
    if (s.yearTo > 1500 && s.yearTo < 2100) maxYear = Math.max(maxYear, s.yearTo);
  });

  const decadeCoverage: DecadeCoverageItem[] = [];
  if (minYear <= maxYear && minYear >= 1600 && maxYear <= 2100) {
    const startDecade = Math.floor(minYear / 10) * 10;
    const endDecade = Math.floor(Math.min(maxYear, new Date().getFullYear()) / 10) * 10;

    for (let dec = startDecade; dec <= endDecade; dec += 10) {
      const decEnd = dec + 9;
      let personCount = 0;
      let birthMetricVerifiedCount = 0;

      persons.forEach((p) => {
        if (p.isGhost || p.isProposal || p.isBlankScreenshot) return;
        const by = extractBirthYear(p);
        if (by !== null && by >= dec && by <= decEnd) {
          personCount += 1;
          if (hasBirthMetricPhoto(p)) birthMetricVerifiedCount += 1;
        }
      });

      const matchingSources = sources.filter((s) => s.yearTo >= dec && s.yearFrom <= decEnd);
      let coverageStatus: DecadeCoverageItem['coverageStatus'] = 'empty';
      if (matchingSources.some((s) => s.status === 'completed')) {
        coverageStatus = 'covered';
      } else if (matchingSources.some((s) => s.status === 'in_progress')) {
        coverageStatus = 'in_progress';
      } else if (matchingSources.some((s) => s.status === 'planned')) {
        coverageStatus = 'planned';
      } else if (personCount > 0 && birthMetricVerifiedCount < personCount) {
        coverageStatus = 'blind_spot';
      } else if (personCount > 0) {
        coverageStatus = 'covered';
      }

      if (personCount > 0 || matchingSources.length > 0) {
        decadeCoverage.push({
          decadeLabel: `${dec}–${decEnd}`,
          startYear: dec,
          endYear: decEnd,
          personCount,
          birthMetricVerifiedCount,
          matchingSources,
          coverageStatus,
        });
      }
    }
  }

  const gapList = Object.values(personGapsById).sort((a, b) => {
    if (b.gaps.length !== a.gaps.length) return b.gaps.length - a.gaps.length;
    return (a.birthYear ?? 9999) - (b.birthYear ?? 9999);
  });

  return {
    totalPersons: persons.length,
    birthMetricCount,
    deceasedCount,
    deathMetricCount,
    personsWithGapsCount: gapList.length,
    gapCounts,
    personGapsById,
    gapList,
    decadeCoverage,
    sourceCounts: {
      total: sources.length,
      completed: sources.filter((s) => s.status === 'completed').length,
      in_progress: sources.filter((s) => s.status === 'in_progress').length,
      planned: sources.filter((s) => s.status === 'planned').length,
    },
  };
}
