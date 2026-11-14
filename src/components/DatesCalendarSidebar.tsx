import React, { useState, useMemo } from 'react';
import {
  Calendar,
  X,
  Cake,
  Flame,
  ChevronLeft,
  ChevronRight,
  Search,
  Bell,
  Clock,
  Crosshair,
  Sparkles,
  Filter,
} from 'lucide-react';
import { Person } from '../types/tree';
import { SilhouetteAvatar } from './SilhouetteAvatar';
import { UKRAINIAN_MONTHS, MONTH_NAMES_GENITIVE } from '../utils/dateUtils';
import { EventType, CalendarEventItem, extractCalendarEvents } from '../utils/calendarEvents';
export { MONTH_NAMES_GENITIVE, extractCalendarEvents };
export type { EventType, CalendarEventItem };

interface DatesCalendarSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  allPersons: Record<string, Person>;
  onSelectPerson: (personId: string) => void;
  showWidget?: boolean;
  onToggleWidget?: () => void;
}

export const DatesCalendarSidebar: React.FC<DatesCalendarSidebarProps> = ({
  isOpen,
  onClose,
  allPersons,
  onSelectPerson,
  showWidget = false,
  onToggleWidget,
}) => {
  const [filterType, setFilterType] = useState<'all' | 'birth' | 'death'>('all');
  const [selectedMonth, setSelectedMonth] = useState<number>(() => new Date().getMonth() + 1); // 1-12
  const [viewMode, setViewMode] = useState<'upcoming' | 'month'>('upcoming');
  const [searchQuery, setSearchQuery] = useState('');

  const now = useMemo(() => new Date(), []);
  const currentDay = now.getDate();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  // Extract all valid birth and death events with day and month
  const allEvents = useMemo(() => {
    return extractCalendarEvents(allPersons);
  }, [allPersons]);

  // Today events
  const todayEvents = useMemo(() => {
    return allEvents.filter((ev) => ev.daysUntil === 0);
  }, [allEvents]);

  // Upcoming events sorted by daysUntil ascending
  const upcomingEvents = useMemo(() => {
    let filtered = allEvents;
    if (filterType !== 'all') {
      filtered = filtered.filter((ev) => ev.type === filterType);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((ev) => {
        const name = `${ev.person.firstName} ${ev.person.lastName} ${ev.person.maidenName || ''}`.toLowerCase();
        return name.includes(q);
      });
    }

    return [...filtered].sort((a, b) => a.daysUntil - b.daysUntil);
  }, [allEvents, filterType, searchQuery]);

  // Month-view events sorted by day
  const monthEvents = useMemo(() => {
    let filtered = allEvents.filter((ev) => ev.month === selectedMonth);
    if (filterType !== 'all') {
      filtered = filtered.filter((ev) => ev.type === filterType);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((ev) => {
        const name = `${ev.person.firstName} ${ev.person.lastName} ${ev.person.maidenName || ''}`.toLowerCase();
        return name.includes(q);
      });
    }

    return [...filtered].sort((a, b) => a.day - b.day);
  }, [allEvents, selectedMonth, filterType, searchQuery]);

  if (!isOpen) return null;

  return (
    <aside
      className="fixed top-13 right-0 bottom-0 w-full sm:w-92 max-w-full sm:max-w-md bg-white dark:bg-zinc-900 border-l border-stone-200/90 dark:border-zinc-800 shadow-2xl z-30 flex flex-col overflow-hidden animate-in slide-in-from-right duration-200"
    >
      {/* Top Header */}
      <div className="px-4 py-3 bg-gradient-to-r from-emerald-50 via-stone-50 to-amber-50/40 dark:from-emerald-950/30 dark:via-zinc-900 dark:to-amber-950/20 border-b border-stone-200 dark:border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-emerald-700 text-white flex items-center justify-center shadow-xs">
            <Calendar size={16} />
          </div>
          <div>
            <h3 className="text-xs font-bold text-stone-900 dark:text-zinc-100 uppercase tracking-wider flex items-center gap-1.5">
              <span>Календар пам'ятних дат</span>
            </h3>
            <p className="text-[10px] text-stone-500 dark:text-zinc-400 font-medium">
              Дні народжень та роковини роду
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-stone-400 dark:text-zinc-400 hover:text-stone-700 dark:hover:text-zinc-100 hover:bg-stone-200/60 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          title="Закрити календар"
        >
          <X size={16} />
        </button>
      </div>

      {/* Widget on Canvas Toggle Switch */}
      {onToggleWidget && (
        <div className="px-4 py-2.5 bg-stone-50 dark:bg-zinc-950/60 border-b border-stone-200/90 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-stone-800 dark:text-zinc-200">
              Віджет на екрані
            </span>
            <span className="text-[10px] text-stone-500 dark:text-zinc-400">
              (найближча дата)
            </span>
          </div>

          <button
            type="button"
            onClick={onToggleWidget}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              showWidget ? 'bg-emerald-600' : 'bg-stone-300 dark:bg-zinc-700'
            }`}
            role="switch"
            aria-checked={showWidget}
            title={showWidget ? 'Вимкнути віджет на екрані' : 'Увімкнути віджет на екрані'}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                showWidget ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      )}

      {/* Today Notice Banner (if any) */}
      {todayEvents.length > 0 && (
        <div className="mx-3 mt-3 p-2.5 bg-gradient-to-r from-amber-50 to-emerald-50 dark:from-amber-950/40 dark:to-emerald-950/40 border border-amber-300/80 dark:border-amber-800/70 rounded-xl shadow-2xs flex items-start gap-2.5 animate-pulse">
          <div className="w-6 h-6 rounded-lg bg-amber-500 text-white flex items-center justify-center shrink-0 mt-0.5">
            <Bell size={13} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold text-amber-950 dark:text-amber-200 flex items-center gap-1">
              <span>Сьогодні пам'ятна дата!</span>
              <span className="text-[9px] bg-amber-200/70 dark:bg-amber-900/70 text-amber-900 dark:text-amber-200 px-1.5 rounded">
                {todayEvents.length}
              </span>
            </div>
            <div className="space-y-1 mt-1">
              {todayEvents.map((ev, i) => {
                const name = `${ev.person.firstName} ${ev.person.lastName}`;
                return (
                  <button
                    key={`today-${ev.person.id}-${i}`}
                    onClick={() => onSelectPerson(ev.person.id)}
                    className="w-full text-left flex items-center justify-between text-[11px] font-medium text-stone-800 dark:text-zinc-200 hover:text-emerald-800 dark:hover:text-emerald-400 hover:underline cursor-pointer"
                  >
                    <span className="truncate">
                      {ev.type === 'birth' ? '🎂 День народження: ' : '🕯️ День пам’яті: '}
                      <span className="font-bold">{name}</span>
                    </span>
                    <Crosshair size={11} className="text-emerald-700 dark:text-emerald-400 shrink-0 ml-1" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Tabs / Filters Bar */}
      <div className="p-3 border-b border-stone-200 dark:border-zinc-800 bg-stone-50/60 dark:bg-zinc-950/50 space-y-2.5">
        {/* Mode Selector (Найближчі / По місяцях) */}
        <div className="grid grid-cols-2 p-0.5 bg-stone-200/80 dark:bg-zinc-800 rounded-xl text-xs font-semibold text-stone-600 dark:text-zinc-400">
          <button
            onClick={() => setViewMode('upcoming')}
            className={`py-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              viewMode === 'upcoming'
                ? 'bg-white dark:bg-zinc-700 text-stone-900 dark:text-zinc-100 shadow-xs'
                : 'hover:text-stone-900 dark:hover:text-zinc-200'
            }`}
          >
            <Clock size={13} className={viewMode === 'upcoming' ? 'text-emerald-700 dark:text-emerald-400' : 'text-stone-500 dark:text-zinc-400'} />
            <span>Найближчі дати</span>
          </button>
          <button
            onClick={() => setViewMode('month')}
            className={`py-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              viewMode === 'month'
                ? 'bg-white dark:bg-zinc-700 text-stone-900 dark:text-zinc-100 shadow-xs'
                : 'hover:text-stone-900 dark:hover:text-zinc-200'
            }`}
          >
            <Calendar size={13} className={viewMode === 'month' ? 'text-emerald-700 dark:text-emerald-400' : 'text-stone-500 dark:text-zinc-400'} />
            <span>По місяцях</span>
          </button>
        </div>

        {/* Month Selector Carousel (if viewMode === 'month') */}
        {viewMode === 'month' && (
          <div className="flex items-center justify-between bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-700 rounded-xl px-2 py-1 shadow-2xs">
            <button
              onClick={() => setSelectedMonth((m) => (m === 1 ? 12 : m - 1))}
              className="p-1 rounded-lg text-stone-500 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-100 hover:bg-stone-100 dark:hover:bg-zinc-800 cursor-pointer"
              title="Попередній місяць"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs font-bold text-stone-800 dark:text-zinc-200">
              {UKRAINIAN_MONTHS.find((m) => parseInt(m.value, 10) === selectedMonth)?.name}
            </span>
            <button
              onClick={() => setSelectedMonth((m) => (m === 12 ? 1 : m + 1))}
              className="p-1 rounded-lg text-stone-500 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-100 hover:bg-stone-100 dark:hover:bg-zinc-800 cursor-pointer"
              title="Наступний місяць"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* Filter Types (Всі / Народження / Смерті) & Search */}
        <div className="flex items-center gap-1.5">
          <div className="flex-1 flex items-center bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-700 rounded-xl px-2.5 py-1 text-xs shadow-2xs focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500">
            <Search size={12} className="text-stone-400 dark:text-zinc-500 shrink-0 mr-1.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Пошук особи..."
              className="w-full bg-transparent border-none text-xs text-stone-800 dark:text-zinc-100 placeholder-stone-400 dark:placeholder-zinc-500 focus:outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-stone-400 dark:text-zinc-500 hover:text-stone-600 dark:hover:text-zinc-300 p-0.5 cursor-pointer"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setFilterType('all')}
              className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                filterType === 'all'
                  ? 'bg-stone-800 dark:bg-zinc-200 text-white dark:text-zinc-900'
                  : 'bg-stone-100 dark:bg-zinc-800 text-stone-600 dark:text-zinc-300 hover:bg-stone-200 dark:hover:bg-zinc-700'
              }`}
            >
              Всі
            </button>
            <button
              onClick={() => setFilterType('birth')}
              className={`p-1 px-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                filterType === 'birth'
                  ? 'bg-rose-600 text-white'
                  : 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950/80'
              }`}
              title="Лише дні народження"
            >
              <Cake size={11} />
            </button>
            <button
              onClick={() => setFilterType('death')}
              className={`p-1 px-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                filterType === 'death'
                  ? 'bg-stone-800 dark:bg-zinc-200 text-white dark:text-zinc-900'
                  : 'bg-stone-100 dark:bg-zinc-800 text-stone-700 dark:text-zinc-300 hover:bg-stone-200 dark:hover:bg-zinc-700'
              }`}
              title="Лише роковини смерті"
            >
              <Flame size={11} />
            </button>
          </div>
        </div>
      </div>

      {/* Events List Feed */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {(() => {
          const displayedList = viewMode === 'upcoming' ? upcomingEvents : monthEvents;

          if (displayedList.length === 0) {
            return (
              <div className="h-64 flex flex-col items-center justify-center text-center p-4 text-stone-400 dark:text-zinc-500">
                <Calendar size={32} className="opacity-30 mb-2" />
                <p className="text-xs font-semibold text-stone-600 dark:text-zinc-300">
                  Пам'ятних дат не знайдено
                </p>
                <p className="text-[11px] text-stone-400 dark:text-zinc-500 mt-0.5">
                  Перевірте чи вказані день та місяць у картках родичів
                </p>
              </div>
            );
          }

          return displayedList.map((ev, idx) => {
            const fullName = [ev.person.firstName, ev.person.lastName].filter(Boolean).join(' ');
            const isBirth = ev.type === 'birth';
            const isToday = ev.daysUntil === 0;
            const isTomorrow = ev.daysUntil === 1;

            return (
              <div
                key={`${ev.type}-${ev.person.id}-${idx}`}
                onClick={() => onSelectPerson(ev.person.id)}
                className={`p-2.5 rounded-xl border transition-all cursor-pointer group flex items-start gap-2.5 shadow-2xs hover:shadow-xs ${
                  isToday
                    ? 'bg-amber-50/90 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700 ring-2 ring-amber-400/40 hover:bg-amber-100/80 dark:hover:bg-amber-950/60'
                    : isBirth
                    ? 'bg-white dark:bg-zinc-900 hover:bg-rose-50/40 dark:hover:bg-rose-950/25 border-stone-200 dark:border-zinc-800 hover:border-rose-300 dark:hover:border-rose-700/70'
                    : 'bg-white dark:bg-zinc-900 hover:bg-stone-50 dark:hover:bg-zinc-800/70 border-stone-200 dark:border-zinc-800 hover:border-stone-400 dark:hover:border-zinc-600'
                }`}
              >
                {/* Avatar with type badge */}
                <div className="relative shrink-0 mt-0.5">
                  <SilhouetteAvatar
                    gender={ev.person.gender}
                    avatarUrl={ev.person.avatarUrl}
                    name={fullName}
                    size="sm"
                  />
                  <div
                    className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] shadow-xs border border-white dark:border-zinc-900 ${
                      isBirth ? 'bg-rose-500 text-white' : 'bg-stone-800 dark:bg-zinc-700 text-white'
                    }`}
                  >
                    {isBirth ? <Cake size={9} /> : <Flame size={9} />}
                  </div>
                </div>

                {/* Event info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-bold text-stone-900 dark:text-zinc-100 group-hover:text-emerald-900 dark:group-hover:text-emerald-300 truncate block">
                      {fullName}
                    </span>
                    {ev.daysUntil <= 30 && (
                      <span
                        className={`text-[9.5px] font-mono font-bold px-1.5 py-0.2 rounded shrink-0 ${
                          isToday
                            ? 'bg-amber-500 text-white animate-pulse'
                            : isTomorrow
                            ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-300'
                            : 'bg-stone-100 dark:bg-zinc-800 text-stone-600 dark:text-zinc-300'
                        }`}
                      >
                        {isToday ? 'Сьогодні' : isTomorrow ? 'Завтра' : `через ${ev.daysUntil} дн.`}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 text-[11px] text-stone-600 dark:text-zinc-400 mt-0.5">
                    <span className="font-semibold text-stone-800 dark:text-zinc-200">
                      {ev.dateStr}
                    </span>
                    {ev.ageOrYearsAgo !== undefined && (
                      <span className="text-stone-400 dark:text-zinc-500 font-mono text-[10px]">
                        ({isBirth ? `${ev.ageOrYearsAgo} р.` : `${ev.ageOrYearsAgo} р. тому`})
                      </span>
                    )}
                  </div>

                  <div className="text-[10px] text-stone-500 dark:text-zinc-400 flex items-center justify-between mt-1 pt-1 border-t border-stone-100 dark:border-zinc-800">
                    <span className="truncate">
                      {isBirth ? '🎂 День народження' : '🕯️ Роковини смерті'}
                    </span>
                    <span className="text-emerald-700 dark:text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 shrink-0 font-medium">
                      <span>На дерево</span>
                      <Crosshair size={11} />
                    </span>
                  </div>
                </div>
              </div>
            );
          });
        })()}
      </div>

      {/* Footer Info */}
      <div className="p-3 bg-stone-50 dark:bg-zinc-950/60 border-t border-stone-200 dark:border-zinc-800 text-center">
        <p className="text-[11px] text-stone-500 dark:text-zinc-400">
          Всього дат у базі: <span className="font-bold text-stone-800 dark:text-zinc-200">{allEvents.length}</span> (
          {allEvents.filter((e) => e.type === 'birth').length} народж., {allEvents.filter((e) => e.type === 'death').length} роковин)
        </p>
      </div>
    </aside>
  );
};
