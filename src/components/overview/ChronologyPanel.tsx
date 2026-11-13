import React, { useMemo, useRef, useState } from 'react';
import {
  X,
  Search,
  ArrowUpDown,
  CalendarRange,
  ArrowUp,
  ArrowDown,
  RotateCcw,
} from 'lucide-react';
import { Person } from '../../types/tree';
import { ClanInfo, getClanName } from '../../utils/lineageUtils';
import { calculateAge, parseDateString } from '../../utils/dateUtils';

export interface ChronologyPanelProps {
  onClose: () => void;
  persons: Record<string, Person>;
  clanList?: ClanInfo[];
  onSelectPerson: (personId: string) => void;
}

type EventFilter = 'all' | 'birth' | 'death';
type SortDirection = 'asc' | 'desc';

interface ChronologyEvent {
  id: string;
  type: 'birth' | 'death';
  year: number;
  month: number | null;
  day: number | null;
  isApprox: boolean;
  dateHint: string;
  ageHint: string;
  displayName: string;
  person: Person;
}

interface YearGroup {
  year: number;
  decade: number;
  birthsCount: number;
  deathsCount: number;
  events: ChronologyEvent[];
}

interface DecadeGroup {
  decade: number;
  label: string;
  birthsCount: number;
  deathsCount: number;
  years: YearGroup[];
}

const VALID_YEAR_RE = /\b(1[5-9]\d{2}|20\d{2})\b/;
const VALID_YEAR_GLOBAL_RE = /\b(1[5-9]\d{2}|20\d{2})\b/g;

function extractKnownBirth(person: Person): {
  year: number;
  month: number | null;
  day: number | null;
  isApprox: boolean;
  dateHint: string;
} | null {
  const parsedB = parseDateString(person.birthDate);
  let year: number | null = null;

  if (person.birthYear) {
    const parsedY = parseDateString(person.birthYear);
    if (parsedY.year) {
      const yr = parseInt(parsedY.year, 10);
      if (!isNaN(yr) && yr >= 1500 && yr <= 2099) year = yr;
    } else {
      const m = person.birthYear.match(VALID_YEAR_RE);
      if (m) year = parseInt(m[1], 10);
    }
  }

  if (year === null && person.birthDate) {
    if (parsedB.year) {
      const yr = parseInt(parsedB.year, 10);
      if (!isNaN(yr) && yr >= 1500 && yr <= 2099) year = yr;
    } else {
      const m = person.birthDate.match(VALID_YEAR_RE);
      if (m) year = parseInt(m[1], 10);
    }
  }

  if (year === null && person.yearsDisplay) {
    const trimmed = person.yearsDisplay.trim();
    const startsWithDeathOnly = /^[†?–—-]/.test(trimmed);
    if (!startsWithDeathOnly) {
      const m = trimmed.match(VALID_YEAR_RE);
      if (m) year = parseInt(m[1], 10);
    }
  }

  if (year === null) return null;

  const rawDay = person.birthDay || parsedB.day;
  const rawMonth = person.birthMonth || parsedB.month;
  const dayNum = rawDay ? parseInt(rawDay, 10) : NaN;
  const monthNum = rawMonth ? parseInt(rawMonth, 10) : NaN;
  const day = !isNaN(dayNum) && dayNum >= 1 && dayNum <= 31 ? dayNum : null;
  const month = !isNaN(monthNum) && monthNum >= 1 && monthNum <= 12 ? monthNum : null;
  const isApprox = Boolean(
    person.isBirthDateApproximate ||
      person.birthDateType === 'about' ||
      person.birthDateType === 'period' ||
      parsedB.isApprox
  );

  let dateHint = '';
  if (day && month) {
    dateHint = `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}`;
  } else if (month) {
    dateHint = `${String(month).padStart(2, '0')}.${year}`;
  } else if (person.birthYearEnd && person.birthYearEnd !== String(year)) {
    dateHint = `–${person.birthYearEnd}`;
  } else if (isApprox) {
    dateHint = 'бл.';
  }

  return { year, month, day, isApprox, dateHint };
}

function extractKnownDeath(
  person: Person,
  birthYear: number
): {
  year: number;
  month: number | null;
  day: number | null;
  isApprox: boolean;
  dateHint: string;
} | null {
  const parsedD = parseDateString(person.deathDate);
  let year: number | null = null;

  if (person.deathYear) {
    const parsedY = parseDateString(person.deathYear);
    if (parsedY.year) {
      const yr = parseInt(parsedY.year, 10);
      if (!isNaN(yr) && yr >= 1500 && yr <= 2099) year = yr;
    } else {
      const m = person.deathYear.match(VALID_YEAR_RE);
      if (m) year = parseInt(m[1], 10);
    }
  }

  if (year === null && person.deathDate) {
    if (parsedD.year) {
      const yr = parseInt(parsedD.year, 10);
      if (!isNaN(yr) && yr >= 1500 && yr <= 2099) year = yr;
    } else {
      const m = person.deathDate.match(VALID_YEAR_RE);
      if (m) year = parseInt(m[1], 10);
    }
  }

  if (year === null && person.yearsDisplay) {
    const matches = person.yearsDisplay.match(VALID_YEAR_GLOBAL_RE);
    if (matches && matches.length >= 2) {
      const candidate = parseInt(matches[1], 10);
      if (candidate >= birthYear) year = candidate;
    }
  }

  if (year === null) return null;

  const rawDay = person.deathDay || parsedD.day;
  const rawMonth = person.deathMonth || parsedD.month;
  const dayNum = rawDay ? parseInt(rawDay, 10) : NaN;
  const monthNum = rawMonth ? parseInt(rawMonth, 10) : NaN;
  const day = !isNaN(dayNum) && dayNum >= 1 && dayNum <= 31 ? dayNum : null;
  const month = !isNaN(monthNum) && monthNum >= 1 && monthNum <= 12 ? monthNum : null;
  const isApprox = Boolean(parsedD.isApprox);

  let dateHint = '';
  if (day && month) {
    dateHint = `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}`;
  } else if (month) {
    dateHint = `${String(month).padStart(2, '0')}.${year}`;
  } else if (isApprox) {
    dateHint = 'бл.';
  }

  return { year, month, day, isApprox, dateHint };
}

export const ChronologyPanel: React.FC<ChronologyPanelProps> = ({
  onClose,
  persons,
  clanList = [],
  onSelectPerson,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [eventFilter, setEventFilter] = useState<EventFilter>('all');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [selectedClan, setSelectedClan] = useState<string>('all');
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const analysis = useMemo(() => {
    const allList = Object.values(persons).filter((p) => !p.isProposal);
    const events: ChronologyEvent[] = [];
    let includedPersonsCount = 0;
    let skippedNoBirthCount = 0;
    let totalBirths = 0;
    let totalDeaths = 0;

    const q = searchQuery.trim().toLowerCase();

    allList.forEach((p) => {
      const birth = extractKnownBirth(p);
      if (!birth) {
        skippedNoBirthCount += 1;
        return;
      }

      if (selectedClan !== 'all' && getClanName(p) !== selectedClan) {
        return;
      }

      const displayName =
        [p.firstName, p.lastName].filter(Boolean).join(' ').trim() ||
        p.patronymic?.trim() ||
        'Без імені';

      const death = extractKnownDeath(p, birth.year);
      const ageStr = calculateAge(p);

      if (q) {
        const houseStr = p.houseNumber ? `№${p.houseNumber} ${p.houseNumber}` : '';
        const haystack = [
          p.firstName,
          p.lastName,
          p.patronymic,
          p.maidenName,
          p.nickname,
          p.birthPlace,
          p.deathPlace,
          houseStr,
          String(birth.year),
          death ? String(death.year) : '',
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        const words = q.split(/\s+/).filter(Boolean);
        if (!words.every((w) => haystack.includes(w))) {
          return;
        }
      }

      includedPersonsCount += 1;

      if (eventFilter === 'all' || eventFilter === 'birth') {
        totalBirths += 1;
        events.push({
          id: `${p.id}:birth`,
          type: 'birth',
          year: birth.year,
          month: birth.month,
          day: birth.day,
          isApprox: birth.isApprox,
          dateHint: birth.dateHint,
          ageHint: '',
          displayName,
          person: p,
        });
      }

      if (death && (eventFilter === 'all' || eventFilter === 'death')) {
        totalDeaths += 1;
        events.push({
          id: `${p.id}:death`,
          type: 'death',
          year: death.year,
          month: death.month,
          day: death.day,
          isApprox: death.isApprox,
          dateHint: death.dateHint,
          ageHint: ageStr,
          displayName,
          person: p,
        });
      }
    });

    const yearMap = new Map<number, ChronologyEvent[]>();
    events.forEach((ev) => {
      const list = yearMap.get(ev.year);
      if (list) list.push(ev);
      else yearMap.set(ev.year, [ev]);
    });

    const sortedYears = Array.from(yearMap.keys()).sort((a, b) =>
      sortDirection === 'asc' ? a - b : b - a
    );

    const decadeMap = new Map<number, YearGroup[]>();

    sortedYears.forEach((yr) => {
      const evs = yearMap.get(yr)!;
      evs.sort((a, b) => {
        const mA = a.month ?? 13;
        const mB = b.month ?? 13;
        if (mA !== mB) return mA - mB;
        const dA = a.day ?? 32;
        const dB = b.day ?? 32;
        if (dA !== dB) return dA - dB;
        if (a.type !== b.type) return a.type === 'birth' ? -1 : 1;
        return a.displayName.localeCompare(b.displayName, 'uk');
      });

      let birthsCount = 0;
      let deathsCount = 0;
      evs.forEach((e) => {
        if (e.type === 'birth') birthsCount += 1;
        else deathsCount += 1;
      });

      const decade = Math.floor(yr / 10) * 10;
      const yearGroup: YearGroup = {
        year: yr,
        decade,
        birthsCount,
        deathsCount,
        events: evs,
      };

      const decList = decadeMap.get(decade);
      if (decList) decList.push(yearGroup);
      else decadeMap.set(decade, [yearGroup]);
    });

    const decades: DecadeGroup[] = Array.from(decadeMap.entries()).map(([decade, years]) => {
      let birthsCount = 0;
      let deathsCount = 0;
      years.forEach((y) => {
        birthsCount += y.birthsCount;
        deathsCount += y.deathsCount;
      });
      return {
        decade,
        label: `${decade}-ті`,
        birthsCount,
        deathsCount,
        years,
      };
    });

    const minYear = sortedYears.length > 0 ? Math.min(...sortedYears) : null;
    const maxYear = sortedYears.length > 0 ? Math.max(...sortedYears) : null;

    return {
      decades,
      includedPersonsCount,
      skippedNoBirthCount,
      totalBirths,
      totalDeaths,
      minYear,
      maxYear,
    };
  }, [persons, selectedClan, searchQuery, eventFilter, sortDirection]);

  const scrollToDecade = (decade: number) => {
    const container = scrollContainerRef.current;
    const target = document.getElementById(`chronology-decade-${decade}`);
    if (container && target) {
      const topOffset = target.offsetTop - container.offsetTop - 8;
      container.scrollTo({ top: Math.max(0, topOffset), behavior: 'smooth' });
    }
  };

  const hasActiveFilters =
    searchQuery.trim() !== '' || eventFilter !== 'all' || selectedClan !== 'all';

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Compact Summary Strip */}
      <div className="px-5 py-2 bg-stone-50/70 dark:bg-zinc-950/40 border-b border-stone-200 dark:border-zinc-800 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-stone-600 dark:text-zinc-400 tabular-nums shrink-0">
        {analysis.minYear !== null && analysis.maxYear !== null && (
          <>
            <span className="font-mono font-semibold text-stone-800 dark:text-zinc-200">
              {analysis.minYear}–{analysis.maxYear} рр.
            </span>
            <span aria-hidden="true">·</span>
          </>
        )}
        <span>
          Осіб у хронології: <strong className="text-stone-900 dark:text-zinc-100">{analysis.includedPersonsCount}</strong>
        </span>
        <span aria-hidden="true">·</span>
        <span className="text-emerald-800 dark:text-emerald-400">
          ★ Народжень: <strong className="tabular-nums">{analysis.totalBirths}</strong>
        </span>
        <span aria-hidden="true">·</span>
        <span className="text-rose-800 dark:text-rose-400">
          † Смертей: <strong className="tabular-nums">{analysis.totalDeaths}</strong>
        </span>
        {analysis.skippedNoBirthCount > 0 && (
          <>
            <span aria-hidden="true">·</span>
            <span
              className="text-stone-500 dark:text-zinc-400"
              title="Картки без вказаної дати/року народження автоматично не додаються до хронології"
            >
              Без дати народження: {analysis.skippedNoBirthCount}
            </span>
          </>
        )}
      </div>

      {/* Filter & Controls Toolbar */}
      <div className="px-5 py-3 border-b border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-wrap items-center gap-2.5 shrink-0">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 dark:text-zinc-500 pointer-events-none"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Пошук за іменем, прізвищем, роком, № дому..."
            className="w-full h-9 pl-8 pr-8 text-xs rounded-lg bg-stone-100 dark:bg-zinc-800 border border-stone-200 dark:border-zinc-700 text-stone-900 dark:text-zinc-100 placeholder:text-stone-500 dark:placeholder:text-zinc-400 focus:outline-hidden focus:bg-white dark:focus:bg-zinc-900 focus:border-emerald-600 dark:focus:border-emerald-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-stone-400 hover:text-stone-700 dark:hover:text-zinc-200 cursor-pointer"
              aria-label="Очистити пошук"
            >
              <X size={13} />
            </button>
          )}
        </div>

        <div
          className="flex items-center gap-1 p-1 bg-stone-100 dark:bg-zinc-800 rounded-lg border border-stone-200/80 dark:border-zinc-700/80 shrink-0"
          role="group"
          aria-label="Фільтр подій"
        >
          {(
            [
              { id: 'all', label: 'Усі події' },
              { id: 'birth', label: '★ Народження' },
              { id: 'death', label: '† Смерті' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setEventFilter(opt.id)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                eventFilter === opt.id
                  ? 'bg-white dark:bg-zinc-900 text-stone-900 dark:text-zinc-100 shadow-2xs'
                  : 'text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {clanList.length > 1 && (
          <select
            value={selectedClan}
            onChange={(e) => setSelectedClan(e.target.value)}
            className="h-9 px-2.5 text-xs font-semibold rounded-lg bg-stone-100 dark:bg-zinc-800 border border-stone-200 dark:border-zinc-700 text-stone-800 dark:text-zinc-200 focus:outline-hidden focus:border-emerald-600 cursor-pointer max-w-[180px]"
            aria-label="Фільтр за родом"
          >
            <option value="all">Усі роди ({Object.keys(persons).length})</option>
            {clanList.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name} ({c.count})
              </option>
            ))}
          </select>
        )}

        <button
          type="button"
          onClick={() => setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
          className="h-9 px-3 rounded-lg bg-stone-100 hover:bg-stone-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 border border-stone-200 dark:border-zinc-700 text-xs font-semibold text-stone-800 dark:text-zinc-200 flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          title="Змінити порядок років"
        >
          {sortDirection === 'asc' ? (
            <>
              <ArrowUp size={13} className="text-emerald-700 dark:text-emerald-400" />
              <span>Давні → нові</span>
            </>
          ) : (
            <>
              <ArrowDown size={13} className="text-emerald-700 dark:text-emerald-400" />
              <span>Нові → давні</span>
            </>
          )}
        </button>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setEventFilter('all');
              setSelectedClan('all');
            }}
            className="h-9 px-2.5 rounded-lg text-xs font-semibold text-stone-600 hover:text-stone-900 hover:bg-stone-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            title="Скинути всі фільтри"
          >
            <RotateCcw size={13} />
            <span>Скинути</span>
          </button>
        )}
      </div>

      {/* Decade Quick Jump Strip */}
      {analysis.decades.length > 1 && (
        <div className="px-5 py-2 border-b border-stone-200/80 dark:border-zinc-800/80 bg-stone-50/70 dark:bg-zinc-950/40 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
          <span className="text-[11px] font-semibold text-stone-500 dark:text-zinc-400 mr-1 whitespace-nowrap shrink-0 flex items-center gap-1">
            <ArrowUpDown size={11} />
            Десятиліття:
          </span>
          {analysis.decades.map((dec) => (
            <button
              key={dec.decade}
              type="button"
              onClick={() => scrollToDecade(dec.decade)}
              className="px-2 py-1 rounded-md text-[11px] font-mono font-semibold text-stone-700 hover:text-stone-950 bg-white hover:bg-stone-100 border border-stone-200/90 dark:text-zinc-300 dark:hover:text-white dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:border-zinc-700/80 transition-colors cursor-pointer whitespace-nowrap shrink-0 tabular-nums"
              title={`${dec.label}: ★ ${dec.birthsCount}, † ${dec.deathsCount}`}
            >
              {dec.label}
            </button>
          ))}
        </div>
      )}

      {/* Main Chronology Timeline Scroll Area */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-5 py-4 bg-white dark:bg-zinc-900"
      >
        {analysis.decades.length === 0 ? (
          <div className="py-16 text-center max-w-md mx-auto space-y-3">
            <CalendarRange size={36} className="mx-auto text-stone-300 dark:text-zinc-600" />
            <h3 className="text-sm font-bold text-stone-800 dark:text-zinc-200">
              {hasActiveFilters
                ? 'За обраними фільтрами подій не знайдено'
                : 'Немає карток із відомою датою народження'}
            </h3>
            <p className="text-xs text-stone-500 dark:text-zinc-400 leading-relaxed">
              {hasActiveFilters
                ? 'Спробуйте змінити пошуковий запит або скинути фільтри подій та роду.'
                : 'У хронологію автоматично потрапляють лише картки, в яких вказано рік або дату народження. Картки без дати народження сюди не додаються.'}
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setEventFilter('all');
                  setSelectedClan('all');
                }}
                className="px-4 py-2 rounded-lg bg-stone-900 hover:bg-stone-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                Скинути фільтри
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {analysis.decades.map((dec) => (
              <section
                key={dec.decade}
                id={`chronology-decade-${dec.decade}`}
                className="scroll-mt-3"
              >
                <div className="sticky top-0 z-10 -mx-1 px-1 py-1.5 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xs border-b border-stone-200 dark:border-zinc-800 flex items-baseline justify-between gap-3 mb-2">
                  <h3 className="text-xs font-bold tracking-wide text-stone-500 dark:text-zinc-400 font-mono tabular-nums">
                    {dec.label}
                  </h3>
                  <span className="text-[11px] text-stone-500 dark:text-zinc-400 tabular-nums">
                    ★ {dec.birthsCount} нар. · † {dec.deathsCount} см.
                  </span>
                </div>

                <div className="divide-y divide-stone-100 dark:divide-zinc-800/80">
                  {dec.years.map((yrGroup) => (
                    <div
                      key={yrGroup.year}
                      className="py-2.5 flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4"
                    >
                      <div className="sm:w-24 shrink-0 flex sm:flex-col items-baseline sm:items-start justify-between gap-1 pt-0.5">
                        <span className="font-mono text-base font-bold text-stone-900 dark:text-zinc-100 tabular-nums">
                          {yrGroup.year}
                        </span>
                        <span className="text-[11px] text-stone-500 dark:text-zinc-400 tabular-nums">
                          {yrGroup.birthsCount > 0 && (
                            <span className="text-emerald-700 dark:text-emerald-400 mr-1.5">
                              ★{yrGroup.birthsCount}
                            </span>
                          )}
                          {yrGroup.deathsCount > 0 && (
                            <span className="text-rose-700 dark:text-rose-400">
                              †{yrGroup.deathsCount}
                            </span>
                          )}
                        </span>
                      </div>

                      <div className="flex-1 flex flex-wrap items-center gap-1.5 sm:gap-2">
                        {yrGroup.events.map((ev) => {
                          const isBirth = ev.type === 'birth';
                          const p = ev.person;
                          const tooltipParts = [
                            ev.displayName,
                            isBirth ? 'Народження' : 'Смерть',
                            isBirth
                              ? p.birthDate || p.birthYear || String(ev.year)
                              : p.deathDate || p.deathYear || String(ev.year),
                            ev.ageHint ? `(${ev.ageHint})` : '',
                            isBirth && p.birthPlace ? `Місце: ${p.birthPlace}` : '',
                            !isBirth && p.deathPlace ? `Місце: ${p.deathPlace}` : '',
                            p.houseNumber ? `Дім №${p.houseNumber}` : '',
                            'Клікніть, щоб перейти до картки',
                          ].filter(Boolean);

                          return (
                            <button
                              key={ev.id}
                              type="button"
                              onClick={() => {
                                onSelectPerson(p.id);
                                onClose();
                              }}
                              title={tooltipParts.join(' · ')}
                              className={`group inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-semibold transition-colors cursor-pointer active:scale-[0.98] ${
                                p.isGhost ? 'border-dashed' : ''
                              } ${
                                isBirth
                                  ? 'bg-emerald-50/90 hover:bg-emerald-100 border-emerald-300/80 text-emerald-950 dark:bg-emerald-950/45 dark:hover:bg-emerald-900/60 dark:border-emerald-800/80 dark:text-emerald-100'
                                  : 'bg-rose-50/90 hover:bg-rose-100 border-rose-300/80 text-rose-950 dark:bg-rose-950/45 dark:hover:bg-rose-900/60 dark:border-rose-800/80 dark:text-rose-100'
                              }`}
                            >
                              <span
                                aria-hidden="true"
                                className={`font-mono text-[11px] font-bold shrink-0 ${
                                  isBirth
                                    ? 'text-emerald-700 dark:text-emerald-400'
                                    : 'text-rose-700 dark:text-rose-400'
                                }`}
                              >
                                {isBirth ? '★' : '†'}
                              </span>
                              <span className="truncate max-w-[220px]">{ev.displayName}</span>
                              {(ev.dateHint || ev.ageHint) && (
                                <span className="font-mono text-[10.5px] font-normal opacity-75 tabular-nums whitespace-nowrap shrink-0">
                                  {[ev.dateHint, ev.ageHint].filter(Boolean).join(' · ')}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {/* Footer Legend */}
      <div className="px-5 py-2.5 bg-stone-50/90 dark:bg-zinc-950/60 border-t border-stone-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-2 text-[11px] text-stone-600 dark:text-zinc-400 shrink-0">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">★</span>
            <span>Народження</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="font-mono font-bold text-rose-700 dark:text-rose-400">†</span>
            <span>Смерть</span>
          </span>
          <span className="hidden sm:inline text-stone-400 dark:text-zinc-500">·</span>
          <span className="hidden sm:inline">Натисніть на блок особи, щоб перейти до неї на полотні</span>
        </div>
        <span className="text-stone-500 dark:text-zinc-400">
          Автоматично синхронізується з датами в картках
        </span>
      </div>
    </div>
  );
};
