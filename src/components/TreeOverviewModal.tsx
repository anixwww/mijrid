import React, { useEffect, useMemo } from 'react';
import {
  X,
  BarChart3,
  CalendarRange,
  ShieldCheck,
  BookMarked,
} from 'lucide-react';
import { ArchiveSourceEntry, FamilyTreeData, Person } from '../types/tree';
import { ClanInfo } from '../utils/lineageUtils';
import { BlindSpotFilterMode, analyzeArchiveGaps } from '../utils/archiveAnalysis';
import { validateFamilyTree } from '../utils/treeValidation';
import { StatsPanel } from './overview/StatsPanel';
import { ChronologyPanel } from './overview/ChronologyPanel';
import { ValidationPanel } from './overview/ValidationPanel';
import { ArchivePanel } from './overview/ArchivePanel';

export type OverviewTabId = 'stats' | 'chronology' | 'validation' | 'archive';

export interface TreeOverviewModalProps {
  isOpen: boolean;
  activeTab: OverviewTabId;
  onChangeTab: (tab: OverviewTabId) => void;
  onClose: () => void;
  isAdmin: boolean;
  tree: FamilyTreeData;
  generations: Record<string, number>;
  clanList: ClanInfo[];
  blindSpotFilter: BlindSpotFilterMode;
  onChangeBlindSpotFilter: (mode: BlindSpotFilterMode) => void;
  onSaveRegistry: (entries: ArchiveSourceEntry[]) => void;
  onSelectPerson: (personId: string) => void;
  onEditPerson?: (person: Person) => void;
  onFilterClan?: (clanName: string | null) => void;
  onAutoFixStructure: () => void;
}

export const TreeOverviewModal: React.FC<TreeOverviewModalProps> = ({
  isOpen,
  activeTab,
  onChangeTab,
  onClose,
  isAdmin,
  tree,
  generations,
  clanList,
  blindSpotFilter,
  onChangeBlindSpotFilter,
  onSaveRegistry,
  onSelectPerson,
  onEditPerson,
  onFilterClan,
  onAutoFixStructure,
}) => {
  const effectiveTab: OverviewTabId = isAdmin ? activeTab : 'stats';

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const validationSummary = useMemo(
    () => (isAdmin ? validateFamilyTree(tree) : null),
    [isAdmin, tree]
  );

  const archiveReport = useMemo(
    () => (isAdmin ? analyzeArchiveGaps(tree) : null),
    [isAdmin, tree]
  );

  if (!isOpen) return null;

  const visiblePersonsCount = Object.values(tree.persons || {}).filter((p) => !p.isProposal).length;

  const tabs: {
    id: OverviewTabId;
    label: string;
    icon: React.ReactNode;
    badge?: number | string;
    badgeTone?: 'rose' | 'amber' | 'neutral';
  }[] = [
    {
      id: 'stats',
      label: 'Статистика',
      icon: <BarChart3 size={15} />,
      badge: visiblePersonsCount,
      badgeTone: 'neutral',
    },
    ...(isAdmin
      ? [
          {
            id: 'chronology' as const,
            label: 'Хронологія',
            icon: <CalendarRange size={15} />,
          },
          {
            id: 'validation' as const,
            label: 'Перевірка',
            icon: <ShieldCheck size={15} />,
            badge: validationSummary ? validationSummary.issues.length : undefined,
            badgeTone:
              validationSummary && validationSummary.errorCount > 0
                ? ('rose' as const)
                : validationSummary && validationSummary.warningCount > 0
                ? ('amber' as const)
                : ('neutral' as const),
          },
          {
            id: 'archive' as const,
            label: 'Архів',
            icon: <BookMarked size={15} />,
            badge:
              archiveReport && archiveReport.personsWithGapsCount > 0
                ? archiveReport.personsWithGapsCount
                : undefined,
            badgeTone: 'amber' as const,
          },
        ]
      : []),
  ];

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-5 bg-stone-900/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tree-overview-modal-title"
    >
      <div
        className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-stone-200 dark:border-zinc-800 w-full max-w-5xl h-[92vh] max-h-[880px] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Unified Header + 4-Tab Bar */}
        <div className="px-4 sm:px-6 pt-3.5 pb-2.5 bg-stone-50/90 dark:bg-zinc-950/60 border-b border-stone-200 dark:border-zinc-800 flex flex-col gap-3 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <h2
                id="tree-overview-modal-title"
                className="text-base sm:text-lg font-bold text-stone-900 dark:text-zinc-100 font-serif-heritage truncate"
              >
                Огляд та аналітика роду
              </h2>
              <span className="text-[11px] px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 font-semibold shrink-0">
                {visiblePersonsCount} осіб
              </span>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-stone-400 hover:text-stone-800 dark:hover:text-zinc-100 hover:bg-stone-200/70 dark:hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
              title="Закрити (Esc)"
              aria-label="Закрити огляд роду"
            >
              <X size={18} />
            </button>
          </div>

          {tabs.length > 1 && (
            <div
              className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5"
              role="tablist"
              aria-label="Розділи огляду роду"
            >
              {tabs.map((tab) => {
                const isActive = effectiveTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => onChangeTab(tab.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 border ${
                      isActive
                        ? 'bg-stone-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-stone-900 dark:border-zinc-100 shadow-xs'
                        : 'bg-white dark:bg-zinc-900 text-stone-600 dark:text-zinc-300 border-stone-200 dark:border-zinc-700 hover:border-stone-300 dark:hover:border-zinc-600'
                    }`}
                  >
                    {tab.icon}
                    <span>{tab.label}</span>
                    {tab.badge !== undefined && tab.badge !== 0 && (
                      <span
                        className={`px-1.5 py-0.2 rounded-md text-[10px] font-mono font-bold tabular-nums ${
                          isActive
                            ? 'bg-white/20 dark:bg-zinc-900/15 text-current'
                            : tab.badgeTone === 'rose'
                            ? 'bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300'
                            : tab.badgeTone === 'amber'
                            ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300'
                            : 'bg-stone-100 dark:bg-zinc-800 text-stone-600 dark:text-zinc-400'
                        }`}
                      >
                        {tab.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Active Panel Body */}
        {effectiveTab === 'stats' && (
          <StatsPanel
            onClose={onClose}
            persons={tree.persons}
            generations={generations}
            clanList={clanList}
            onSelectPerson={onSelectPerson}
            onFilterClan={onFilterClan}
          />
        )}

        {effectiveTab === 'chronology' && isAdmin && (
          <ChronologyPanel
            onClose={onClose}
            persons={tree.persons}
            clanList={clanList}
            onSelectPerson={onSelectPerson}
          />
        )}

        {effectiveTab === 'validation' && isAdmin && (
          <ValidationPanel
            onClose={onClose}
            tree={tree}
            isAdmin={isAdmin}
            onSelectPerson={onSelectPerson}
            onEditPerson={onEditPerson}
            onAutoFixStructure={onAutoFixStructure}
          />
        )}

        {effectiveTab === 'archive' && isAdmin && (
          <ArchivePanel
            onClose={onClose}
            tree={tree}
            blindSpotFilter={blindSpotFilter}
            onChangeBlindSpotFilter={onChangeBlindSpotFilter}
            onSaveRegistry={onSaveRegistry}
            onSelectPersonAndCenter={onSelectPerson}
          />
        )}
      </div>
    </div>
  );
};
