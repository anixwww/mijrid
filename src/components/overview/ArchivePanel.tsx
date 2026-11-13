import React, { useState, useMemo, useRef } from 'react';
import { ArchiveSourceEntry, FamilyTreeData } from '../../types/tree';
import { analyzeArchiveGaps, BlindSpotFilterMode } from '../../utils/archiveAnalysis';
import {
  BookMarked,
  Plus,
  CheckCircle2,
  Trash2,
  Pencil,
  AlertTriangle,
  Sparkles,
  Check,
  ArrowRight,
} from 'lucide-react';

export interface ArchivePanelProps {
  onClose: () => void;
  tree: FamilyTreeData;
  blindSpotFilter: BlindSpotFilterMode;
  onChangeBlindSpotFilter: (mode: BlindSpotFilterMode) => void;
  onSaveRegistry: (entries: ArchiveSourceEntry[]) => void;
  onSelectPersonAndCenter: (personId: string) => void;
}

export const ArchivePanel: React.FC<ArchivePanelProps> = ({
  onClose,
  tree,
  blindSpotFilter,
  onChangeBlindSpotFilter,
  onSaveRegistry,
  onSelectPersonAndCenter,
}) => {
  const [activeTab, setActiveTab] = useState<'documents' | 'blind_spots'>('documents');
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [yearFrom, setYearFrom] = useState('');
  const [yearTo, setYearTo] = useState('');
  const [noteText, setNoteText] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const noteInputRef = useRef<HTMLInputElement | null>(null);

  const report = useMemo(() => analyzeArchiveGaps(tree), [tree]);
  const entries = tree.archiveRegistry || [];

  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => a.yearFrom - b.yearFrom || a.yearTo - b.yearTo);
  }, [entries]);

  const resetForm = () => {
    setEditingEntryId(null);
    setYearFrom('');
    setYearTo('');
    setNoteText('');
  };

  const handleEditEntry = (entry: ArchiveSourceEntry) => {
    const legacyParts = [
      entry.archiveCode && entry.archiveCode !== 'Без шифру' ? entry.archiveCode : '',
      entry.title,
      entry.notes && entry.notes !== entry.title ? entry.notes : '',
    ].filter(Boolean);

    setEditingEntryId(entry.id);
    setYearFrom(String(entry.yearFrom));
    setYearTo(entry.yearTo && entry.yearTo !== entry.yearFrom ? String(entry.yearTo) : '');
    setNoteText(legacyParts.join(' · '));
    setActiveTab('documents');
    window.setTimeout(() => noteInputRef.current?.focus(), 40);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedFrom = parseInt(yearFrom.trim(), 10);
    const parsedTo = parseInt(yearTo.trim(), 10);
    const cleanNote = noteText.trim();

    if (!Number.isFinite(parsedFrom) && !cleanNote) return;

    const safeFrom = Number.isFinite(parsedFrom)
      ? parsedFrom
      : Number.isFinite(parsedTo)
      ? parsedTo
      : new Date().getFullYear();
    const safeTo = Number.isFinite(parsedTo) ? Math.max(safeFrom, parsedTo) : safeFrom;

    const entry: ArchiveSourceEntry = {
      id: editingEntryId || `arch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      archiveCode: '',
      title: cleanNote || 'Переглянутий документ',
      sourceType: 'other',
      yearFrom: safeFrom,
      yearTo: safeTo,
      status: 'completed',
      notes: undefined,
      updatedAt: new Date().toISOString(),
    };

    const nextEntries = editingEntryId
      ? entries.map((it) => (it.id === editingEntryId ? entry : it))
      : [entry, ...entries];

    onSaveRegistry(nextEntries);
    resetForm();
  };

  const handleDeleteEntry = (entryId: string) => {
    onSaveRegistry(entries.filter((e) => e.id !== entryId));
    if (editingEntryId === entryId) {
      resetForm();
    }
    setConfirmDeleteId(null);
  };

  const handleJumpToAddYears = (from: number, to: number) => {
    setEditingEntryId(null);
    setYearFrom(String(from));
    setYearTo(String(to));
    setActiveTab('documents');
    window.setTimeout(() => noteInputRef.current?.focus(), 40);
  };

  const formatEntryNote = (entry: ArchiveSourceEntry) => {
    const parts = [
      entry.archiveCode && entry.archiveCode !== 'Без шифру' ? entry.archiveCode : '',
      entry.title,
      entry.locality || '',
      entry.notes && entry.notes !== entry.title ? entry.notes : '',
    ].filter(Boolean);
    return parts.join(' · ') || 'Переглянутий документ';
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Sub-Tabs + Canvas Highlight Toggle */}
      <div className="px-4 sm:px-5 py-2.5 border-b border-stone-200 dark:border-zinc-800 bg-stone-50/70 dark:bg-zinc-950/40 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('documents')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
              activeTab === 'documents'
                ? 'bg-stone-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-2xs'
                : 'text-stone-600 dark:text-zinc-400 hover:bg-stone-200/60 dark:hover:bg-zinc-800'
            }`}
          >
            Пройдені документи ({entries.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('blind_spots')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
              activeTab === 'blind_spots'
                ? 'bg-amber-600 text-white shadow-2xs'
                : 'text-stone-600 dark:text-zinc-400 hover:bg-stone-200/60 dark:hover:bg-zinc-800'
            }`}
          >
            Білі плями ({report.personsWithGapsCount})
          </button>
        </div>

        <button
          type="button"
          onClick={() => onChangeBlindSpotFilter(blindSpotFilter === 'off' ? 'all-gaps' : 'off')}
          className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer border ${
            blindSpotFilter !== 'off'
              ? 'bg-amber-500 text-zinc-950 border-amber-600'
              : 'bg-white dark:bg-zinc-900 text-stone-700 dark:text-zinc-300 border-stone-200 dark:border-zinc-700 hover:border-amber-400'
          }`}
          title="Підсвітити картки з білими плямами на полотні"
        >
          <Sparkles size={13} />
          <span>{blindSpotFilter !== 'off' ? 'Підсвітка на полотні: увімк.' : 'Підсвітити на полотні'}</span>
        </button>
      </div>

      {/* Content */}
      <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4 bg-white dark:bg-zinc-900">
        {activeTab === 'documents' ? (
          <>
            <form
              onSubmit={handleSubmit}
              className="p-3 rounded-2xl bg-stone-50 dark:bg-zinc-950/60 border border-stone-200 dark:border-zinc-800 space-y-2.5"
            >
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="flex items-center gap-1.5 shrink-0">
                  <input
                    type="number"
                    min={1500}
                    max={2100}
                    value={yearFrom}
                    onChange={(e) => setYearFrom(e.target.value)}
                    placeholder="Від (рік)"
                    aria-label="Рік від"
                    className="w-full sm:w-24 h-10 sm:h-9 px-2.5 text-sm sm:text-xs font-mono tabular-nums rounded-xl border border-stone-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-stone-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                  <span className="text-stone-400 text-xs font-bold shrink-0">–</span>
                  <input
                    type="number"
                    min={1500}
                    max={2100}
                    value={yearTo}
                    onChange={(e) => setYearTo(e.target.value)}
                    placeholder="До (рік)"
                    aria-label="Рік до"
                    className="w-full sm:w-24 h-10 sm:h-9 px-2.5 text-sm sm:text-xs font-mono tabular-nums rounded-xl border border-stone-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-stone-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>

                <input
                  ref={noteInputRef}
                  type="text"
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Назва документа / примітка (напр. Метрика с. Моринці)"
                  aria-label="Назва документа або примітка"
                  className="flex-1 min-w-0 h-10 sm:h-9 px-3 text-sm sm:text-xs rounded-xl border border-stone-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-stone-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="submit"
                    disabled={!yearFrom.trim() && !noteText.trim()}
                    className="flex-1 sm:flex-none h-10 sm:h-9 px-3.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-45 disabled:pointer-events-none text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                  >
                    {editingEntryId ? <Check size={14} /> : <Plus size={14} />}
                    <span>{editingEntryId ? 'Зберегти' : 'Додати'}</span>
                  </button>

                  {editingEntryId && (
                    <button
                      type="button"
                      onClick={resetForm}
                      className="h-10 sm:h-9 px-3 rounded-xl bg-stone-200 dark:bg-zinc-800 text-stone-700 dark:text-zinc-300 text-xs font-semibold cursor-pointer"
                    >
                      Скасувати
                    </button>
                  )}
                </div>
              </div>
            </form>

            {sortedEntries.length === 0 ? (
              <div className="py-10 text-center rounded-2xl border border-dashed border-stone-300 dark:border-zinc-700 text-stone-500 dark:text-zinc-400 space-y-1.5">
                <BookMarked size={26} className="mx-auto opacity-60" />
                <p className="text-xs font-semibold text-stone-700 dark:text-zinc-300">
                  Поки немає переглянутих документів
                </p>
                <p className="text-[11px] max-w-sm mx-auto">
                  Вкажіть роки зверху та назву документа — це одразу закриє відповідні десятиліття на карті білих плям.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-stone-100 dark:divide-zinc-800 rounded-2xl border border-stone-200 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-900">
                {sortedEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className={`px-3.5 py-2.5 flex items-center justify-between gap-3 hover:bg-stone-50/80 dark:hover:bg-zinc-800/40 transition-colors ${
                      editingEntryId === entry.id ? 'bg-emerald-50/60 dark:bg-emerald-950/25' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="px-2 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/70 text-emerald-900 dark:text-emerald-300 font-mono tabular-nums text-xs font-bold shrink-0">
                        {entry.yearFrom === entry.yearTo
                          ? entry.yearFrom
                          : `${entry.yearFrom}–${entry.yearTo}`}
                      </span>
                      <span className="text-xs sm:text-[13px] font-medium text-stone-800 dark:text-zinc-200 break-words min-w-0">
                        {formatEntryNote(entry)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleEditEntry(entry)}
                        className="p-2 rounded-lg text-stone-400 hover:text-stone-800 dark:hover:text-zinc-100 hover:bg-stone-100 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
                        title="Редагувати"
                        aria-label="Редагувати запис"
                      >
                        <Pencil size={13.5} />
                      </button>

                      {confirmDeleteId === entry.id ? (
                        <button
                          type="button"
                          onClick={() => handleDeleteEntry(entry.id)}
                          className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold cursor-pointer"
                        >
                          Видалити
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(entry.id)}
                          className="p-2 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer transition-colors"
                          title="Видалити"
                          aria-label="Видалити запис"
                        >
                          <Trash2 size={13.5} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="space-y-5">
            {report.decadeCoverage.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-zinc-400">
                    Роки у дереві
                  </h4>
                  <span className="text-[11px] text-stone-500 dark:text-zinc-400">
                    Клік по білій плямі → додати переглянутий документ
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {report.decadeCoverage.map((dec) => {
                    const isCovered = dec.coverageStatus === 'covered';
                    const isBlindSpot = dec.coverageStatus === 'blind_spot';

                    return (
                      <button
                        key={dec.decadeLabel}
                        type="button"
                        onClick={() => handleJumpToAddYears(dec.startYear, dec.endYear)}
                        className={`p-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                          isCovered
                            ? 'bg-emerald-50/80 dark:bg-emerald-950/35 border-emerald-300 dark:border-emerald-800 text-emerald-950 dark:text-emerald-200 hover:bg-emerald-100/70'
                            : isBlindSpot
                            ? 'bg-rose-50/70 dark:bg-rose-950/25 border-dashed border-rose-400 dark:border-rose-700 text-rose-950 dark:text-rose-200 hover:bg-rose-100/70'
                            : 'bg-stone-50 dark:bg-zinc-800/50 border-stone-200 dark:border-zinc-700 text-stone-700 dark:text-zinc-300 hover:border-stone-400'
                        }`}
                      >
                        <div className="font-mono text-xs font-bold flex items-center justify-between gap-1">
                          <span>{dec.decadeLabel}</span>
                          {isCovered ? (
                            <CheckCircle2 size={13} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                          ) : isBlindSpot ? (
                            <AlertTriangle size={13} className="text-rose-600 dark:text-rose-400 shrink-0" />
                          ) : null}
                        </div>
                        <div className="text-[11px] opacity-85 mt-1">
                          {dec.matchingSources.length > 0
                            ? `Документів: ${dec.matchingSources.length}`
                            : isCovered
                            ? 'Метрики є'
                            : `Біла пляма (${dec.personCount} ос.)`}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-zinc-400">
                Особи без підтверджених даних ({report.gapList.length})
              </h4>

              {report.gapList.length === 0 ? (
                <div className="py-8 text-center rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 text-xs font-semibold">
                  Білих плям по картках не виявлено
                </div>
              ) : (
                <div className="divide-y divide-stone-100 dark:divide-zinc-800 rounded-2xl border border-stone-200 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-900">
                  {report.gapList.map((item) => (
                    <button
                      key={item.personId}
                      type="button"
                      onClick={() => {
                        onSelectPersonAndCenter(item.personId);
                        onClose();
                      }}
                      className="w-full px-3.5 py-2.5 text-left hover:bg-amber-50/60 dark:hover:bg-zinc-800/60 transition-colors cursor-pointer flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-stone-900 dark:text-zinc-100 truncate">
                            {item.personName}
                          </span>
                          {item.birthYear && (
                            <span className="text-[11px] font-mono text-stone-500 dark:text-zinc-400 shrink-0">
                              {item.birthYear}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-stone-500 dark:text-zinc-400 truncate mt-0.5">
                          {item.gaps.map((g) => g.label).join(' · ')}
                        </p>
                      </div>

                      <ArrowRight size={14} className="text-stone-400 shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-2.5 bg-stone-50/90 dark:bg-zinc-950/60 border-t border-stone-200 dark:border-zinc-800 flex items-center justify-between text-[11px] text-stone-500 dark:text-zinc-400 shrink-0">
        <span>Записуйте переглянуті роки та назву документа для контролю білих плям</span>
        <span>Документів: {entries.length}</span>
      </div>
    </div>
  );
};
