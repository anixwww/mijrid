import React, { useState, useMemo } from 'react';
import {
  Search,
  Users,
  Award,
  Calendar,
  Heart,
  ChevronRight,
  ExternalLink,
  MapPin,
  Briefcase,
  Baby,
  Sun,
  Sparkles,
  Compass,
} from 'lucide-react';
import { Person } from '../../types/tree';
import { ClanInfo } from '../../utils/lineageUtils';
import {
  getTopFirstNames,
  getTopSurnames,
  getComprehensiveDemographics,
  NameStat,
  SurnameStat,
  PlaceStat,
  ProfessionStat,
} from '../../utils/analyticsUtils';

export interface StatsPanelProps {
  onClose: () => void;
  persons: Record<string, Person>;
  generations: Record<string, number>;
  clanList: ClanInfo[];
  onSelectPerson?: (personId: string) => void;
  onFilterClan?: (clanName: string | null) => void;
}

type TabType = 'names' | 'surnames' | 'geography' | 'families' | 'seasons';
type ViewMode = 'chart' | 'list';

export const StatsPanel: React.FC<StatsPanelProps> = ({
  onClose,
  persons,
  generations,
  clanList,
  onSelectPerson,
  onFilterClan,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('names');
  const [viewMode, setViewMode] = useState<ViewMode>('chart');
  const [searchQuery, setSearchQuery] = useState('');

  // First names filter
  const [genderFilter, setGenderFilter] = useState<'all' | 'male' | 'female'>('all');

  // Surnames options
  const [normalizeToClan, setNormalizeToClan] = useState(true);
  const [countMaidenNames, setCountMaidenNames] = useState(true);

  // Selected item to show person drilldown
  const [selectedNameStat, setSelectedNameStat] = useState<NameStat | null>(null);
  const [selectedSurnameStat, setSelectedSurnameStat] = useState<SurnameStat | null>(null);
  const [selectedPlaceStat, setSelectedPlaceStat] = useState<PlaceStat | null>(null);
  const [selectedProfStat, setSelectedProfStat] = useState<ProfessionStat | null>(null);

  // Calculate data
  const nameStats = useMemo(() => {
    return getTopFirstNames(persons, genderFilter);
  }, [persons, genderFilter]);

  const surnameStats = useMemo(() => {
    return getTopSurnames(persons, { normalizeToClan, countMaidenNames });
  }, [persons, normalizeToClan, countMaidenNames]);

  const demographics = useMemo(() => {
    return getComprehensiveDemographics(persons, generations);
  }, [persons, generations]);

  // Filtered lists by search query
  const filteredNames = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return nameStats;
    return nameStats.filter((n) => n.name.toLowerCase().includes(q));
  }, [nameStats, searchQuery]);

  const filteredSurnames = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return surnameStats;
    return surnameStats.filter(
      (s) =>
        s.surname.toLowerCase().includes(q) ||
        s.rawExamples.some((ex) => ex.toLowerCase().includes(q))
    );
  }, [surnameStats, searchQuery]);

  const maxNameCount = nameStats[0]?.count || 1;
  const maxSurnameCount = surnameStats[0]?.count || 1;
  const maxPlaceCount = demographics.birthPlaces[0]?.count || 1;
  const maxMonthCount = Math.max(...demographics.birthMonths.map((m) => m.count), 1);

  // Clan color lookup
  const getClanColor = (clanName: string) => {
    const found = clanList.find((c) => c.name === clanName);
    return found ? found.color : '#047857';
  };

  const handlePersonClick = (personId: string) => {
    if (onSelectPerson) {
      onSelectPerson(personId);
      onClose();
    }
  };

  const tabs: { id: TabType; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: 'names', label: 'Імена', icon: <Users className="w-4 h-4" />, count: nameStats.length },
    { id: 'surnames', label: 'Прізвища й роди', icon: <Compass className="w-4 h-4" />, count: surnameStats.length },
    { id: 'geography', label: 'Географія та фах', icon: <MapPin className="w-4 h-4" /> },
    { id: 'families', label: 'Родини та довголіття', icon: <Heart className="w-4 h-4" /> },
    { id: 'seasons', label: 'Місяці й пори року', icon: <Calendar className="w-4 h-4" /> },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Tab & Filter Bar */}
      <div className="px-3.5 sm:px-6 py-2.5 bg-white dark:bg-zinc-900 border-b border-stone-100 dark:border-zinc-800 flex items-center justify-between gap-2 overflow-x-auto no-scrollbar shrink-0">
        <div className="flex items-center gap-1 bg-stone-100/90 dark:bg-zinc-800 p-1 rounded-xl overflow-x-auto max-w-full">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                setSelectedNameStat(null);
                setSelectedSurnameStat(null);
                setSelectedPlaceStat(null);
                setSelectedProfStat(null);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-zinc-900 text-emerald-950 dark:text-emerald-300 shadow-2xs'
                  : 'text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-100'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span className="text-[10px] opacity-60">({tab.count})</span>
              )}
            </button>
          ))}
        </div>

        {(activeTab === 'names' || activeTab === 'surnames') && (
          <div className="flex items-center gap-2 shrink-0">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Швидкий пошук..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1 text-xs rounded-lg border border-stone-200 dark:border-zinc-700 bg-stone-50/60 dark:bg-zinc-800 text-stone-900 dark:text-zinc-100 focus:bg-white dark:focus:bg-zinc-900 focus:border-emerald-500 focus:outline-none w-36 sm:w-44 transition-colors"
              />
            </div>

            <div className="flex items-center bg-stone-100 dark:bg-zinc-800 rounded-lg p-0.5 border border-stone-200/60 dark:border-zinc-700/60">
              <button
                type="button"
                onClick={() => setViewMode('chart')}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${
                  viewMode === 'chart'
                    ? 'bg-white dark:bg-zinc-900 text-emerald-900 dark:text-emerald-300 shadow-2xs'
                    : 'text-stone-500 dark:text-zinc-400 hover:text-stone-800 dark:hover:text-zinc-200'
                }`}
                title="Відобразити у вигляді діаграми"
              >
                Діаграма
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${
                  viewMode === 'list'
                    ? 'bg-white dark:bg-zinc-900 text-emerald-900 dark:text-emerald-300 shadow-2xs'
                    : 'text-stone-500 dark:text-zinc-400 hover:text-stone-800 dark:hover:text-zinc-200'
                }`}
                title="Відобразити у вигляді детального списку"
              >
                Список
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Content Body */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-stone-50/40 dark:bg-zinc-950/30">
        {activeTab === 'names' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-stone-500 dark:text-zinc-400 mr-1">Стать:</span>
                {(
                  [
                    { id: 'all', label: 'Усі імена' },
                    { id: 'male', label: 'Чоловічі' },
                    { id: 'female', label: 'Жіночі' },
                  ] as const
                ).map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setGenderFilter(g.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      genderFilter === g.id
                        ? 'bg-emerald-700 text-white shadow-2xs'
                        : 'bg-white dark:bg-zinc-900 text-stone-600 dark:text-zinc-300 hover:bg-stone-100 dark:hover:bg-zinc-800 border border-stone-200/80 dark:border-zinc-700'
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>

              <div className="text-xs text-stone-500 dark:text-zinc-400">
                Знайдено унікальних імен: <strong className="text-stone-800 dark:text-zinc-200">{filteredNames.length}</strong>
              </div>
            </div>

            {filteredNames.length === 0 ? (
              <div className="text-center py-12 text-stone-400 text-sm">
                Імен за цим критерієм не знайдено
              </div>
            ) : viewMode === 'chart' ? (
              <div className="space-y-2.5 bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-stone-200/80 dark:border-zinc-800 shadow-2xs">
                {filteredNames.map((item, index) => {
                  const barWidth = Math.max(6, Math.round((item.count / maxNameCount) * 100));
                  const isTop3 = index < 3;

                  return (
                    <div
                      key={item.name}
                      onClick={() => setSelectedNameStat(item)}
                      className="group p-2 -mx-2 rounded-xl hover:bg-emerald-50/40 dark:hover:bg-emerald-950/30 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-5 h-5 rounded-md flex items-center justify-center font-bold text-[10px] ${
                              index === 0
                                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                : index === 1
                                ? 'bg-stone-200 text-stone-700'
                                : index === 2
                                ? 'bg-orange-100 text-orange-800'
                                : 'text-stone-400 bg-stone-100 dark:bg-zinc-800'
                            }`}
                          >
                            {index + 1}
                          </span>
                          <span className="font-bold text-stone-900 dark:text-zinc-100 group-hover:text-emerald-950 dark:group-hover:text-emerald-300">
                            {item.name}
                          </span>
                          {item.genderBreakdown.male > 0 && item.genderBreakdown.female === 0 && (
                            <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">чол.</span>
                          )}
                          {item.genderBreakdown.female > 0 && item.genderBreakdown.male === 0 && (
                            <span className="text-[10px] text-rose-600 dark:text-rose-400 font-medium">жін.</span>
                          )}
                          {item.genderBreakdown.male > 0 && item.genderBreakdown.female > 0 && (
                            <span className="text-[10px] text-purple-600 dark:text-purple-400 font-medium">чол. + жін.</span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 font-mono text-[11px]">
                          <span className="text-stone-500 dark:text-zinc-400">{item.percentage}%</span>
                          <span className="font-bold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-200/60 dark:border-emerald-800/60">
                            {item.count} {item.count === 1 ? 'особа' : item.count < 5 ? 'особи' : 'осіб'}
                          </span>
                        </div>
                      </div>

                      <div className="h-3 w-full bg-stone-100 dark:bg-zinc-800 rounded-full overflow-hidden flex">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            isTop3
                              ? 'bg-gradient-to-r from-emerald-600 to-teal-500'
                              : 'bg-emerald-500/80 group-hover:bg-emerald-600'
                          }`}
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-stone-200/80 dark:border-zinc-800 overflow-hidden shadow-2xs divide-y divide-stone-100 dark:divide-zinc-800">
                {filteredNames.map((item, index) => (
                  <div
                    key={item.name}
                    onClick={() => setSelectedNameStat(item)}
                    className="p-3.5 hover:bg-stone-50 dark:hover:bg-zinc-800/60 flex items-center justify-between cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 text-center font-mono font-bold text-xs text-stone-400">
                        #{index + 1}
                      </span>
                      <div>
                        <div className="font-bold text-stone-900 dark:text-zinc-100 text-sm">{item.name}</div>
                        <div className="text-[11px] text-stone-500 dark:text-zinc-400">
                          {item.genderBreakdown.male > 0 && `${item.genderBreakdown.male} чол.`}
                          {item.genderBreakdown.male > 0 && item.genderBreakdown.female > 0 && ', '}
                          {item.genderBreakdown.female > 0 && `${item.genderBreakdown.female} жін.`}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono text-stone-500 dark:text-zinc-400">{item.percentage}%</span>
                      <span className="font-bold text-xs text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 rounded-lg border border-emerald-200/60 dark:border-emerald-800/60">
                        {item.count}
                      </span>
                      <ChevronRight className="w-4 h-4 text-stone-400" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {demographics.heritageEchoes.inheritedNames.length > 0 && (
              <div className="p-5 bg-white dark:bg-zinc-900 rounded-2xl border border-stone-200/80 dark:border-zinc-800 shadow-2xs space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-600" />
                  <h4 className="text-xs font-bold text-stone-900 dark:text-zinc-100 uppercase tracking-wider">
                    Спадковість імен: названі на честь предків
                  </h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {demographics.heritageEchoes.inheritedNames.map((rec, i) => (
                    <div
                      key={i}
                      className="p-3 rounded-xl bg-amber-50/40 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/50 flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-bold text-stone-900 dark:text-zinc-100">
                          «{rec.name}» — <span className="text-amber-800 dark:text-amber-400 font-semibold">{rec.relation}</span>
                        </div>
                        <div className="text-[11px] text-stone-500 dark:text-zinc-400 mt-0.5">
                          Предок: {rec.ancestor.firstName} {rec.ancestor.lastName} ➔ Нащадок: {rec.descendant.firstName} {rec.descendant.lastName}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {demographics.heritageEchoes.rareNames.length > 0 && (
              <div className="p-5 bg-white dark:bg-zinc-900 rounded-2xl border border-stone-200/80 dark:border-zinc-800 shadow-2xs space-y-3">
                <h4 className="text-xs font-bold text-stone-900 dark:text-zinc-100 uppercase tracking-wider">
                  Рідкісні та колоритні імена роду (зустрічаються лише 1 раз):
                </h4>
                <div className="flex flex-wrap gap-2">
                  {demographics.heritageEchoes.rareNames.map(({ name, person }) => (
                    <button
                      key={person.id}
                      type="button"
                      onClick={() => handlePersonClick(person.id)}
                      className="px-3 py-1.5 rounded-lg bg-stone-100 dark:bg-zinc-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 hover:text-emerald-900 dark:hover:text-emerald-300 border border-stone-200 dark:border-zinc-700 text-xs font-medium text-stone-800 dark:text-zinc-200 transition-colors cursor-pointer flex items-center gap-1.5"
                      title={`Знайти ${person.firstName} ${person.lastName} на дереві`}
                    >
                      <span className="font-bold">{name}</span>
                      <span className="text-[10px] text-stone-400 font-mono">
                        ({person.birthYear || '?'})
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'surnames' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center flex-wrap gap-3">
                <label className="flex items-center gap-1.5 text-xs text-stone-700 dark:text-zinc-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={normalizeToClan}
                    onChange={(e) => setNormalizeToClan(e.target.checked)}
                    className="rounded accent-emerald-600"
                  />
                  <span>Об&apos;єднувати форми роду (Коваленко / Коваленківна)</span>
                </label>

                <label className="flex items-center gap-1.5 text-xs text-stone-700 dark:text-zinc-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={countMaidenNames}
                    onChange={(e) => setCountMaidenNames(e.target.checked)}
                    className="rounded accent-emerald-600"
                  />
                  <span>Враховувати дівочі прізвища дружин</span>
                </label>
              </div>

              <div className="text-xs text-stone-500 dark:text-zinc-400">
                Унікальних родів/прізвищ: <strong className="text-stone-800 dark:text-zinc-200">{filteredSurnames.length}</strong>
              </div>
            </div>

            {filteredSurnames.length === 0 ? (
              <div className="text-center py-12 text-stone-400 text-sm">
                Прізвищ за цим критерієм не знайдено
              </div>
            ) : viewMode === 'chart' ? (
              <div className="space-y-2.5 bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-stone-200/80 dark:border-zinc-800 shadow-2xs">
                {filteredSurnames.map((item, index) => {
                  const barWidth = Math.max(6, Math.round((item.count / maxSurnameCount) * 100));
                  const clanColor = getClanColor(item.clanName);
                  const isTop3 = index < 3;

                  return (
                    <div
                      key={item.surname}
                      onClick={() => setSelectedSurnameStat(item)}
                      className="group p-2 -mx-2 rounded-xl hover:bg-stone-50 dark:hover:bg-zinc-800/60 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-5 h-5 rounded-md flex items-center justify-center font-bold text-[10px] ${
                              index === 0
                                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                : index === 1
                                ? 'bg-stone-200 text-stone-700'
                                : index === 2
                                ? 'bg-orange-100 text-orange-800'
                                : 'text-stone-400 bg-stone-100 dark:bg-zinc-800'
                            }`}
                          >
                            {index + 1}
                          </span>

                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs"
                            style={{ backgroundColor: clanColor }}
                          />

                          <span className="font-bold text-stone-900 dark:text-zinc-100 group-hover:text-emerald-950 dark:group-hover:text-emerald-300">
                            Рід {item.surname}
                          </span>

                          {item.rawExamples.length > 1 && (
                            <span className="text-[10.5px] text-stone-400 truncate max-w-xs">
                              ({item.rawExamples.slice(0, 3).join(', ')})
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 font-mono text-[11px]">
                          <span className="text-stone-500 dark:text-zinc-400">{item.percentage}%</span>
                          <span className="font-bold text-stone-900 dark:text-zinc-100 bg-stone-100 dark:bg-zinc-800 px-2 py-0.5 rounded-md border border-stone-200/60 dark:border-zinc-700">
                            {item.count} {item.count === 1 ? 'носій' : item.count < 5 ? 'носії' : 'носіїв'}
                          </span>
                        </div>
                      </div>

                      <div className="h-3 w-full bg-stone-100 dark:bg-zinc-800 rounded-full overflow-hidden flex">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            isTop3
                              ? 'bg-gradient-to-r from-amber-600 to-amber-500'
                              : 'bg-stone-500 group-hover:bg-stone-700'
                          }`}
                          style={{
                            width: `${barWidth}%`,
                            backgroundColor: isTop3 ? undefined : clanColor,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-stone-200/80 dark:border-zinc-800 overflow-hidden shadow-2xs divide-y divide-stone-100 dark:divide-zinc-800">
                {filteredSurnames.map((item, index) => {
                  const clanColor = getClanColor(item.clanName);
                  return (
                    <div
                      key={item.surname}
                      onClick={() => setSelectedSurnameStat(item)}
                      className="p-3.5 hover:bg-stone-50 dark:hover:bg-zinc-800/60 flex items-center justify-between cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-6 text-center font-mono font-bold text-xs text-stone-400">
                          #{index + 1}
                        </span>
                        <span
                          className="w-3 h-3 rounded-full shrink-0 shadow-2xs"
                          style={{ backgroundColor: clanColor }}
                        />
                        <div>
                          <div className="font-bold text-stone-900 dark:text-zinc-100 text-sm">Рід {item.surname}</div>
                          <div className="text-[11px] text-stone-500 dark:text-zinc-400">
                            {item.maleCount > 0 && `${item.maleCount} чол.`}
                            {item.maleCount > 0 && item.femaleCount > 0 && ', '}
                            {item.femaleCount > 0 && `${item.femaleCount} жін.`}
                            {item.maidenCount > 0 && ` (${item.maidenCount} дівочих)`}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono text-stone-500 dark:text-zinc-400">{item.percentage}%</span>
                        <span className="font-bold text-xs text-stone-800 dark:text-zinc-200 bg-stone-100 dark:bg-zinc-800 px-2.5 py-1 rounded-lg border border-stone-200/60 dark:border-zinc-700">
                          {item.count}
                        </span>
                        <ChevronRight className="w-4 h-4 text-stone-400" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'geography' && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-stone-200/80 dark:border-zinc-800 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                  <h4 className="text-xs font-bold text-stone-900 dark:text-zinc-100 uppercase tracking-wider">
                    Географія народження: найпопулярніші міста та села роду
                  </h4>
                </div>
                <span className="text-xs text-stone-500 dark:text-zinc-400">
                  Усього зафіксовано локацій: <strong className="text-stone-800 dark:text-zinc-200">{demographics.birthPlaces.length}</strong>
                </span>
              </div>

              {demographics.birthPlaces.length === 0 ? (
                <div className="text-stone-400 text-xs py-4 text-center">
                  Місця народження ще не заповнені в картках
                </div>
              ) : (
                <div className="space-y-2">
                  {demographics.birthPlaces.slice(0, 10).map((item, idx) => {
                    const barWidth = Math.max(6, Math.round((item.count / maxPlaceCount) * 100));
                    return (
                      <div
                        key={item.place}
                        onClick={() => setSelectedPlaceStat(item)}
                        className="group p-2 -mx-2 rounded-xl hover:bg-stone-50 dark:hover:bg-zinc-800/60 cursor-pointer transition-colors"
                      >
                        <div className="flex items-center justify-between text-xs mb-1">
                          <div className="flex items-center gap-2">
                            <span className="w-5 text-center font-mono text-stone-400 text-[10px]">
                              #{idx + 1}
                            </span>
                            <span className="font-bold text-stone-900 dark:text-zinc-100 group-hover:text-emerald-900 dark:group-hover:text-emerald-300">
                              {item.place}
                            </span>
                          </div>
                          <span className="font-bold text-stone-800 dark:text-zinc-200 bg-stone-100 dark:bg-zinc-800 px-2 py-0.5 rounded text-[11px]">
                            {item.count} {item.count === 1 ? 'особа' : 'осіб'} ({item.percentage}%)
                          </span>
                        </div>
                        <div className="h-2 w-full bg-stone-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-600 rounded-full transition-all duration-500"
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-stone-200/80 dark:border-zinc-800 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                  <h4 className="text-xs font-bold text-stone-900 dark:text-zinc-100 uppercase tracking-wider">
                    Ремесла, професії та покликання предків
                  </h4>
                </div>
                <span className="text-xs text-stone-500 dark:text-zinc-400">
                  Унікальних професій: <strong className="text-stone-800 dark:text-zinc-200">{demographics.professions.length}</strong>
                </span>
              </div>

              {demographics.professions.length === 0 ? (
                <div className="text-stone-400 text-xs py-4 text-center">
                  Професії ще не заповнені в картках родичів
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {demographics.professions.map((item) => (
                    <div
                      key={item.profession}
                      onClick={() => setSelectedProfStat(item)}
                      className="p-3 rounded-xl bg-stone-50 dark:bg-zinc-800/60 border border-stone-200 dark:border-zinc-700 hover:border-emerald-300 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/30 cursor-pointer transition-all flex items-center justify-between"
                    >
                      <div>
                        <div className="font-bold text-xs text-stone-900 dark:text-zinc-100">{item.profession}</div>
                        <div className="text-[10px] text-stone-500 dark:text-zinc-400">
                          {item.count} {item.count === 1 ? 'представник' : 'представники'}
                        </div>
                      </div>
                      <span className="text-xs font-bold font-mono text-emerald-800 dark:text-emerald-300 bg-emerald-100/70 dark:bg-emerald-950/60 px-2 py-0.5 rounded">
                        {item.count}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'families' && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-stone-200/80 dark:border-zinc-800 shadow-2xs space-y-3">
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-600" />
                <h4 className="text-xs font-bold text-stone-900 dark:text-zinc-100 uppercase tracking-wider">
                  Рекордсмени довголіття: Топ-5 предків роду
                </h4>
              </div>

              {demographics.longestLivingList.length === 0 ? (
                <div className="text-stone-400 text-xs py-4 text-center">
                  Недостатньо дат для підрахунку віку
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {demographics.longestLivingList.map((rec, idx) => (
                    <div
                      key={rec.person.id}
                      onClick={() => handlePersonClick(rec.person.id)}
                      className="p-3.5 rounded-xl border border-amber-200/80 dark:border-amber-800/60 bg-amber-50/30 dark:bg-amber-950/20 hover:bg-amber-100/40 dark:hover:bg-amber-950/40 cursor-pointer transition-all flex items-center justify-between"
                    >
                      <div>
                        <div className="flex items-center gap-1.5 text-xs font-bold text-stone-900 dark:text-zinc-100">
                          <span className="w-4 h-4 rounded-full bg-amber-200 text-amber-900 flex items-center justify-center text-[10px]">
                            {idx + 1}
                          </span>
                          <span>{rec.person.firstName} {rec.person.lastName}</span>
                        </div>
                        <div className="text-[11px] text-stone-500 dark:text-zinc-400 mt-0.5">
                          {rec.yearsSpan}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-base font-bold font-serif-heritage text-amber-900 dark:text-amber-300">
                          {rec.age}
                        </span>
                        <span className="text-[10px] text-stone-500 dark:text-zinc-400 ml-1">років</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-stone-200/80 dark:border-zinc-800 shadow-2xs space-y-3">
              <h4 className="text-xs font-bold text-stone-900 dark:text-zinc-100 uppercase tracking-wider">
                Розподіл за віковими когортами:
              </h4>
              <div className="space-y-2">
                {demographics.ageCohorts.map((cohort) => (
                  <div key={cohort.label} className="flex items-center gap-3 text-xs">
                    <span className="w-32 text-stone-700 dark:text-zinc-300 font-medium shrink-0">
                      {cohort.label} ({cohort.range})
                    </span>
                    <div className="flex-1 h-3 bg-stone-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-600 rounded-full transition-all duration-500"
                        style={{ width: `${cohort.percentage}%` }}
                      />
                    </div>
                    <span className="w-16 text-right font-mono text-stone-600 dark:text-zinc-300">
                      <strong>{cohort.count}</strong> ({cohort.percentage}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-stone-200/80 dark:border-zinc-800 shadow-2xs space-y-3">
              <div className="flex items-center gap-2">
                <Baby className="w-4 h-4 text-rose-600" />
                <h4 className="text-xs font-bold text-stone-900 dark:text-zinc-100 uppercase tracking-wider">
                  Найбагатодітніші сім&apos;ї родоводу
                </h4>
              </div>

              {demographics.familyRecords.mostChildren.length === 0 ? (
                <div className="text-stone-400 text-xs py-4 text-center">
                  Немає зафіксованих дітей у родинах
                </div>
              ) : (
                <div className="space-y-3">
                  {demographics.familyRecords.mostChildren.map((rec, i) => {
                    const parentNames = rec.parents
                      .map((p) => `${p.firstName} ${p.lastName}`)
                      .join(' та ');
                    return (
                      <div
                        key={i}
                        className="p-3.5 rounded-xl bg-stone-50 dark:bg-zinc-800/60 border border-stone-200/80 dark:border-zinc-700 flex items-center justify-between"
                      >
                        <div>
                          <div className="text-xs font-bold text-stone-900 dark:text-zinc-100">
                            Батьки: {parentNames || 'Невідомо'}
                          </div>
                          <div className="text-[11px] text-stone-500 dark:text-zinc-400 mt-1">
                            Діти ({rec.childrenCount}): {rec.children.map((c) => c.firstName).join(', ')}
                          </div>
                        </div>
                        <span className="font-bold text-xs text-rose-800 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 px-3 py-1 rounded-lg border border-rose-200 dark:border-rose-800/60 shrink-0">
                          {rec.childrenCount} дітей
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-stone-200/80 dark:border-zinc-800 shadow-2xs">
                <div className="text-xs text-stone-500 dark:text-zinc-400 mb-1">Середня кількість дітей на родину:</div>
                <div className="text-xl font-bold text-stone-900 dark:text-zinc-100 font-serif-heritage">
                  {demographics.familyRecords.averageChildrenPerFamily} дитини
                </div>
              </div>

              <div className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-stone-200/80 dark:border-zinc-800 shadow-2xs">
                <div className="text-xs text-stone-500 dark:text-zinc-400 mb-1">Середній вік при народженні первістка:</div>
                <div className="text-xl font-bold text-stone-900 dark:text-zinc-100 font-serif-heritage">
                  {demographics.familyRecords.averageAgeAtFirstChild
                    ? `${demographics.familyRecords.averageAgeAtFirstChild} років`
                    : '—'}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'seasons' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {demographics.seasonCounts.map((s) => (
                <div
                  key={s.season}
                  className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-stone-200/80 dark:border-zinc-800 shadow-2xs"
                >
                  <div className="text-xs text-stone-500 dark:text-zinc-400 flex items-center gap-1.5 mb-1">
                    <Sun className="w-3.5 h-3.5 text-amber-500" />
                    <span>{s.season}</span>
                  </div>
                  <div className="text-xl font-bold text-stone-900 dark:text-zinc-100 font-serif-heritage">
                    {s.count} <span className="text-xs font-normal text-stone-400">({s.percentage}%)</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-stone-200/80 dark:border-zinc-800 shadow-2xs space-y-3">
              <h4 className="text-xs font-bold text-stone-900 dark:text-zinc-100 uppercase tracking-wider">
                Розподіл народжень за місяцями року:
              </h4>
              <div className="space-y-2">
                {demographics.birthMonths.map((m) => {
                  const barWidth = Math.max(4, Math.round((m.count / maxMonthCount) * 100));
                  return (
                    <div key={m.monthIndex} className="flex items-center gap-3 text-xs">
                      <span className="w-24 text-stone-700 dark:text-zinc-300 font-medium shrink-0">
                        {m.monthName}
                      </span>
                      <div className="flex-1 h-3 bg-stone-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-600 rounded-full transition-all duration-500"
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                      <span className="w-16 text-right font-mono text-stone-600 dark:text-zinc-300">
                        <strong>{m.count}</strong> ({m.percentage}%)
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Drilldown Drawer for Name */}
        {selectedNameStat && (
          <div className="mt-6 p-4 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/60 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-center justify-between mb-3">
              <div className="font-bold text-emerald-950 dark:text-emerald-200 text-sm">
                Особи з ім&apos;ям «{selectedNameStat.name}» ({selectedNameStat.count}):
              </div>
              <button
                type="button"
                onClick={() => setSelectedNameStat(null)}
                className="text-emerald-700 dark:text-emerald-400 hover:text-emerald-900 text-xs font-semibold cursor-pointer"
              >
                Закрити
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {selectedNameStat.personIds.map((id) => {
                const p = persons[id];
                if (!p) return null;
                return (
                  <div
                    key={id}
                    onClick={() => handlePersonClick(p.id)}
                    className="p-2.5 rounded-lg bg-white dark:bg-zinc-900 border border-emerald-200/80 dark:border-emerald-800/60 hover:border-emerald-400 hover:shadow-xs transition-all cursor-pointer flex items-center justify-between group"
                  >
                    <div className="truncate mr-2">
                      <div className="text-xs font-bold text-stone-900 dark:text-zinc-100 group-hover:text-emerald-900 dark:group-hover:text-emerald-300 truncate">
                        {p.firstName} {p.lastName}
                      </div>
                      <div className="text-[10px] text-stone-500 dark:text-zinc-400">
                        {p.yearsDisplay || p.birthYear || 'Роки невідомі'}
                      </div>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-stone-400 group-hover:text-emerald-700 shrink-0" />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Drilldown Drawer for Surname */}
        {selectedSurnameStat && (
          <div className="mt-6 p-4 rounded-xl bg-stone-100/80 dark:bg-zinc-900/90 border border-stone-200/90 dark:border-zinc-700 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-stone-900 dark:text-zinc-100 text-sm">
                  Представники роду «{selectedSurnameStat.surname}» ({selectedSurnameStat.count}):
                </span>
                {onFilterClan && (
                  <button
                    type="button"
                    onClick={() => {
                      onFilterClan(selectedSurnameStat.clanName);
                      onClose();
                    }}
                    className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-200 bg-emerald-100 dark:bg-emerald-900/60 hover:bg-emerald-200 px-2 py-0.5 rounded cursor-pointer transition-colors"
                  >
                    Фільтрувати на дереві
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedSurnameStat(null)}
                className="text-stone-500 hover:text-stone-900 dark:hover:text-zinc-100 text-xs font-semibold cursor-pointer"
              >
                Закрити
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {selectedSurnameStat.personIds.map((id) => {
                const p = persons[id];
                if (!p) return null;
                return (
                  <div
                    key={id}
                    onClick={() => handlePersonClick(p.id)}
                    className="p-2.5 rounded-lg bg-white dark:bg-zinc-800 border border-stone-200 dark:border-zinc-700 hover:border-emerald-400 hover:shadow-xs transition-all cursor-pointer flex items-center justify-between group"
                  >
                    <div className="truncate mr-2">
                      <div className="text-xs font-bold text-stone-900 dark:text-zinc-100 group-hover:text-emerald-900 dark:group-hover:text-emerald-300 truncate">
                        {p.firstName} {p.lastName} {p.maidenName ? `(${p.maidenName})` : ''}
                      </div>
                      <div className="text-[10px] text-stone-500 dark:text-zinc-400">
                        {p.yearsDisplay || p.birthYear || 'Роки невідомі'}
                      </div>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-stone-400 group-hover:text-emerald-700 shrink-0" />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Drilldown Drawer for Place */}
        {selectedPlaceStat && (
          <div className="mt-6 p-4 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/60 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-center justify-between mb-3">
              <div className="font-bold text-emerald-950 dark:text-emerald-200 text-sm">
                Народилися у «{selectedPlaceStat.place}» ({selectedPlaceStat.count}):
              </div>
              <button
                type="button"
                onClick={() => setSelectedPlaceStat(null)}
                className="text-emerald-700 dark:text-emerald-400 hover:text-emerald-900 text-xs font-semibold cursor-pointer"
              >
                Закрити
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {selectedPlaceStat.personIds.map((id) => {
                const p = persons[id];
                if (!p) return null;
                return (
                  <div
                    key={id}
                    onClick={() => handlePersonClick(p.id)}
                    className="p-2.5 rounded-lg bg-white dark:bg-zinc-900 border border-emerald-200/80 dark:border-emerald-800/60 hover:border-emerald-400 hover:shadow-xs transition-all cursor-pointer flex items-center justify-between group"
                  >
                    <div className="truncate mr-2">
                      <div className="text-xs font-bold text-stone-900 dark:text-zinc-100 group-hover:text-emerald-900 dark:group-hover:text-emerald-300 truncate">
                        {p.firstName} {p.lastName}
                      </div>
                      <div className="text-[10px] text-stone-500 dark:text-zinc-400">
                        {p.yearsDisplay || p.birthYear || 'Роки невідомі'}
                      </div>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-stone-400 group-hover:text-emerald-700 shrink-0" />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Drilldown Drawer for Profession */}
        {selectedProfStat && (
          <div className="mt-6 p-4 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-800/60 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-center justify-between mb-3">
              <div className="font-bold text-blue-950 dark:text-blue-200 text-sm">
                За фахом «{selectedProfStat.profession}» ({selectedProfStat.count}):
              </div>
              <button
                type="button"
                onClick={() => setSelectedProfStat(null)}
                className="text-blue-700 dark:text-blue-400 hover:text-blue-900 text-xs font-semibold cursor-pointer"
              >
                Закрити
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {selectedProfStat.personIds.map((id) => {
                const p = persons[id];
                if (!p) return null;
                return (
                  <div
                    key={id}
                    onClick={() => handlePersonClick(p.id)}
                    className="p-2.5 rounded-lg bg-white dark:bg-zinc-900 border border-blue-200/80 dark:border-blue-800/60 hover:border-blue-400 hover:shadow-xs transition-all cursor-pointer flex items-center justify-between group"
                  >
                    <div className="truncate mr-2">
                      <div className="text-xs font-bold text-stone-900 dark:text-zinc-100 group-hover:text-blue-900 dark:group-hover:text-blue-300 truncate">
                        {p.firstName} {p.lastName}
                      </div>
                      <div className="text-[10px] text-stone-500 dark:text-zinc-400">
                        {p.yearsDisplay || p.birthYear || 'Роки невідомі'}
                      </div>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-stone-400 group-hover:text-blue-700 shrink-0" />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-2.5 bg-stone-50/90 dark:bg-zinc-950/60 border-t border-stone-200 dark:border-zinc-800 flex items-center justify-between text-[11px] text-stone-500 dark:text-zinc-400 shrink-0">
        <span>Клікніть на будь-яку особу в списках, щоб знайти та відкрити її на дереві</span>
        <span>Осіб у статистиці: {demographics.totalPersons}</span>
      </div>
    </div>
  );
};
