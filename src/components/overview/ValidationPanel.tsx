import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Wrench,
  ArrowUpRight,
  Calendar,
  Users,
  Heart,
  GitFork,
} from 'lucide-react';
import { FamilyTreeData, Person } from '../../types/tree';
import {
  validateFamilyTree,
  ValidationCategory,
  TreeValidationIssue,
} from '../../utils/treeValidation';

export interface ValidationPanelProps {
  onClose: () => void;
  tree: FamilyTreeData;
  isAdmin: boolean;
  onSelectPerson: (personId: string) => void;
  onEditPerson?: (person: Person) => void;
  onAutoFixStructure: () => void;
}

export const ValidationPanel: React.FC<ValidationPanelProps> = ({
  onClose,
  tree,
  isAdmin,
  onSelectPerson,
  onEditPerson,
  onAutoFixStructure,
}) => {
  const [filter, setFilter] = useState<'all' | 'error' | 'warning'>('all');

  const summary = useMemo(() => validateFamilyTree(tree), [tree]);

  const filteredIssues = summary.issues.filter((issue) => {
    if (filter === 'all') return true;
    return issue.severity === filter;
  });

  const getCategoryBadge = (cat: ValidationCategory) => {
    switch (cat) {
      case 'dates':
        return { label: 'Дати', icon: <Calendar size={11} /> };
      case 'parent_age':
        return { label: 'Вік батьків', icon: <Users size={11} /> };
      case 'marriage':
        return { label: 'Шлюб', icon: <Heart size={11} /> };
      case 'structure':
        return { label: 'Зв’язки', icon: <GitFork size={11} /> };
    }
  };

  const handleLocate = (issue: TreeValidationIssue) => {
    onSelectPerson(issue.personId);
    onClose();
  };

  const handleEdit = (issue: TreeValidationIssue) => {
    const p = tree.persons[issue.personId];
    if (p && onEditPerson) {
      onEditPerson(p);
      onClose();
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Summary & Filter Bar */}
      <div className="px-5 py-3 bg-stone-50 dark:bg-zinc-950/60 border-b border-stone-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              filter === 'all'
                ? 'bg-stone-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-xs'
                : 'bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-700 text-stone-600 dark:text-zinc-300 hover:bg-stone-100 dark:hover:bg-zinc-800'
            }`}
          >
            Усі ({summary.issues.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('error')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              filter === 'error'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-700 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40'
            }`}
          >
            Помилки ({summary.errorCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter('warning')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              filter === 'warning'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-700 text-amber-800 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40'
            }`}
          >
            Попередження ({summary.warningCount})
          </button>
        </div>

        {isAdmin && summary.fixableStructureCount > 0 && (
          <button
            type="button"
            onClick={onAutoFixStructure}
            className="px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer active:scale-98"
          >
            <Wrench size={13} />
            <span>Виправити зв’язки ({summary.fixableStructureCount})</span>
          </button>
        )}
      </div>

      {/* Issues List */}
      <div className="flex-1 overflow-y-auto p-5 space-y-2.5 bg-white dark:bg-zinc-900">
        {filteredIssues.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 flex items-center justify-center">
              <CheckCircle2 size={30} />
            </div>
            <h4 className="text-sm font-bold text-stone-900 dark:text-zinc-100">
              {summary.issues.length === 0
                ? 'Логічних помилок не виявлено'
                : 'У цій категорії немає зауважень'}
            </h4>
            <p className="text-xs text-stone-500 dark:text-zinc-400 max-w-sm mx-auto">
              {summary.issues.length === 0
                ? 'Усі перевірені дати народження, смерті, шлюбів, вік батьків та зв’язки у дереві узгоджені.'
                : 'Спробуйте перемкнути фільтр зверху, щоб переглянути інші записи.'}
            </p>
          </div>
        ) : (
          filteredIssues.map((issue) => {
            const cat = getCategoryBadge(issue.category);
            const isError = issue.severity === 'error';
            return (
              <div
                key={issue.id}
                className={`p-3.5 rounded-xl border transition-all flex items-start justify-between gap-3 ${
                  isError
                    ? 'bg-rose-50/60 dark:bg-rose-950/30 border-rose-200/90 dark:border-rose-800/60'
                    : 'bg-amber-50/50 dark:bg-amber-950/25 border-amber-200/90 dark:border-amber-800/55'
                }`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div
                    className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${
                      isError
                        ? 'bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300'
                        : 'bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300'
                    }`}
                  >
                    {isError ? <AlertCircle size={16} /> : <AlertTriangle size={16} />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-stone-900 dark:text-zinc-100">
                        {issue.title}
                      </span>
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/80 dark:bg-zinc-800/90 border border-stone-200 dark:border-zinc-700 text-[10px] font-semibold text-stone-600 dark:text-zinc-300">
                        {cat.icon}
                        <span>{cat.label}</span>
                      </span>
                    </div>
                    <p className="text-[11.5px] text-stone-600 dark:text-zinc-300 mt-1 leading-relaxed">
                      {issue.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleLocate(issue)}
                    className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-800 hover:bg-stone-100 dark:hover:bg-zinc-700 border border-stone-200 dark:border-zinc-700 text-[11px] font-semibold text-stone-800 dark:text-zinc-100 flex items-center gap-1 transition-colors cursor-pointer"
                    title="Перейти до картки на дереві"
                  >
                    <span>Показати</span>
                    <ArrowUpRight size={12} />
                  </button>
                  {isAdmin && onEditPerson && tree.persons[issue.personId] && (
                    <button
                      type="button"
                      onClick={() => handleEdit(issue)}
                      className="px-2.5 py-1.5 rounded-lg bg-stone-900 dark:bg-zinc-700 hover:bg-stone-800 dark:hover:bg-zinc-600 border border-transparent dark:border-zinc-600 text-white text-[11px] font-semibold transition-colors cursor-pointer"
                    >
                      Редагувати
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-2.5 bg-stone-50/90 dark:bg-zinc-950/60 border-t border-stone-200 dark:border-zinc-800 flex items-center justify-between text-[11px] text-stone-500 dark:text-zinc-400 shrink-0">
        <span>Перевірено карток: {Object.keys(tree.persons || {}).length}</span>
        <span>Аналіз дат життя, віку батьків, шлюбів та цілісності зв’язків</span>
      </div>
    </div>
  );
};
