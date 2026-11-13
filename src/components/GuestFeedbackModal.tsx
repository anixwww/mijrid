import React, { useState, useMemo, useEffect } from 'react';
import {
  FamilyTreeData,
  Person,
  GuestSuggestion,
  GuestSuggestionCategory,
} from '../types/tree';
import {
  X,
  MessageSquareHeart,
  UserPlus,
  Check,
  Trash2,
  Pencil,
  Navigation,
  Search,
  Sparkles,
  CheckCircle2,
  Clock,
  Ban,
} from 'lucide-react';
import { SilhouetteAvatar } from './SilhouetteAvatar';

interface GuestFeedbackModalProps {
  isOpen: boolean;
  tree: FamilyTreeData;
  initialTab?: 'suggestions' | 'proposals';
  onClose: () => void;
  onSelectPerson: (personId: string) => void;
  onEditPerson: (person: Person) => void;
  onResolveSuggestion: (
    personId: string,
    suggestionId: string,
    action: 'approve' | 'reject' | 'mark_approved'
  ) => void;
  onApproveProposal: (personId: string) => void;
  onDeleteProposal: (personId: string) => void;
}

const CATEGORY_LABELS: Record<GuestSuggestionCategory, { label: string; badgeClass: string }> = {
  correction: {
    label: 'Уточнення',
    badgeClass: 'bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
  },
  memory: {
    label: 'Спогад / Історія',
    badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
  },
  date_place: {
    label: 'Дата / Місце',
    badgeClass: 'bg-sky-100 text-sky-900 border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800',
  },
  document_hint: {
    label: 'Документ',
    badgeClass: 'bg-indigo-100 text-indigo-900 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800',
  },
};

const RELATION_LABELS: Record<string, string> = {
  father: 'Батько',
  mother: 'Мати',
  spouse: 'Подружжя',
  child: 'Дитина',
  brother: 'Брат',
  sister: 'Сестра',
};

const FIELD_LABELS: Record<string, string> = {
  birthDate: 'Дата народження',
  birthYear: 'Рік народження',
  deathDate: 'Дата смерті',
  deathYear: 'Рік смерті',
  birthPlace: 'Місце народження',
  residencePlace: 'Місце проживання',
  maidenName: 'Дівоче прізвище',
  nickname: 'Прізвисько',
  profession: 'Професія',
};

export const GuestFeedbackModal: React.FC<GuestFeedbackModalProps> = ({
  isOpen,
  tree,
  initialTab = 'suggestions',
  onClose,
  onSelectPerson,
  onEditPerson,
  onResolveSuggestion,
  onApproveProposal,
  onDeleteProposal,
}) => {
  const [activeTab, setActiveTab] = useState<'suggestions' | 'proposals'>(initialTab);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'resolved' | 'all'>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setConfirmDeleteId(null);
    }
  }, [isOpen, initialTab]);

  const allSuggestions = useMemo(() => {
    const rows: Array<{ person: Person; suggestion: GuestSuggestion }> = [];
    Object.values(tree.persons || {}).forEach((p) => {
      (p.guestSuggestions || []).forEach((s) => {
        rows.push({ person: p, suggestion: s });
      });
    });
    rows.sort((a, b) => {
      if (a.suggestion.status === 'pending' && b.suggestion.status !== 'pending') return -1;
      if (a.suggestion.status !== 'pending' && b.suggestion.status === 'pending') return 1;
      return (b.suggestion.createdAt || '').localeCompare(a.suggestion.createdAt || '');
    });
    return rows;
  }, [tree.persons]);

  const proposalPersons = useMemo(() => {
    return Object.values(tree.persons || {})
      .filter((p) => Boolean(p.isProposal))
      .sort((a, b) =>
        (b.proposalMeta?.createdAt || '').localeCompare(a.proposalMeta?.createdAt || '')
      );
  }, [tree.persons]);

  const pendingSuggestionsCount = useMemo(
    () => allSuggestions.filter((r) => r.suggestion.status === 'pending').length,
    [allSuggestions]
  );

  const filteredSuggestions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allSuggestions.filter(({ person, suggestion }) => {
      if (statusFilter === 'pending' && suggestion.status !== 'pending') return false;
      if (statusFilter === 'resolved' && suggestion.status === 'pending') return false;
      if (!q) return true;
      const text = `${person.firstName} ${person.lastName} ${suggestion.message} ${suggestion.authorName}`.toLowerCase();
      return text.includes(q);
    });
  }, [allSuggestions, statusFilter, searchQuery]);

  const filteredProposals = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return proposalPersons;
    return proposalPersons.filter((p) => {
      const target = p.proposalMeta?.targetPersonId ? tree.persons[p.proposalMeta.targetPersonId] : null;
      const text = `${p.firstName} ${p.lastName} ${p.proposalMeta?.authorName || ''} ${p.proposalMeta?.note || ''} ${target ? `${target.firstName} ${target.lastName}` : ''}`.toLowerCase();
      return text.includes(q);
    });
  }, [proposalPersons, searchQuery, tree.persons]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-stone-200 dark:border-zinc-800 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-amber-50/80 via-white to-sky-50/80 dark:from-amber-950/30 dark:via-zinc-900 dark:to-sky-950/30 border-b border-stone-200 dark:border-zinc-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-amber-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <MessageSquareHeart size={18} />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-stone-900 dark:text-zinc-100 leading-tight truncate">
                Пропозиції та уточнення від родичів
              </h3>
              <p className="text-[11.5px] text-stone-500 dark:text-zinc-400 truncate">
                Перегляд спогадів, виправлень до карток і запропонованих нових родичів
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-zinc-200 hover:bg-stone-200/60 dark:hover:bg-zinc-800 cursor-pointer shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tabs & Filter Bar */}
        <div className="px-4 sm:px-5 pt-2.5 pb-2.5 bg-stone-50/70 dark:bg-zinc-900/80 border-b border-stone-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveTab('suggestions')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'suggestions'
                  ? 'bg-amber-600 text-white shadow-2xs'
                  : 'bg-white dark:bg-zinc-800 text-stone-700 dark:text-zinc-300 border border-stone-200 dark:border-zinc-700 hover:bg-stone-100'
              }`}
            >
              <Sparkles size={13} />
              <span>Уточнення та спогади</span>
              {pendingSuggestionsCount > 0 && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                    activeTab === 'suggestions'
                      ? 'bg-white/25 text-white'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-900/70 dark:text-amber-200'
                  }`}
                >
                  {pendingSuggestionsCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('proposals')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'proposals'
                  ? 'bg-sky-600 text-white shadow-2xs'
                  : 'bg-white dark:bg-zinc-800 text-stone-700 dark:text-zinc-300 border border-stone-200 dark:border-zinc-700 hover:bg-stone-100'
              }`}
            >
              <UserPlus size={13} />
              <span>Картки-пропозиції</span>
              {proposalPersons.length > 0 && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                    activeTab === 'proposals'
                      ? 'bg-white/25 text-white'
                      : 'bg-sky-100 text-sky-800 dark:bg-sky-900/70 dark:text-sky-200'
                  }`}
                >
                  {proposalPersons.length}
                </span>
              )}
            </button>
          </div>

          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Пошук за іменем або текстом..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-stone-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
        </div>

        {/* Sub-filter for suggestions */}
        {activeTab === 'suggestions' && (
          <div className="px-4 sm:px-5 py-2 bg-white dark:bg-zinc-900 border-b border-stone-100 dark:border-zinc-800 flex items-center gap-1.5 shrink-0">
            {(
              [
                { id: 'pending', label: `Нові (${pendingSuggestionsCount})` },
                { id: 'resolved', label: `Опрацьовані (${allSuggestions.length - pendingSuggestionsCount})` },
                { id: 'all', label: `Усі (${allSuggestions.length})` },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setStatusFilter(f.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                  statusFilter === f.id
                    ? 'bg-stone-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                    : 'bg-stone-100 dark:bg-zinc-800 text-stone-600 dark:text-zinc-300 hover:bg-stone-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 bg-stone-50/40 dark:bg-zinc-950/40">
          {activeTab === 'suggestions' ? (
            filteredSuggestions.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <CheckCircle2 size={32} className="mx-auto text-emerald-500/70" />
                <div className="text-sm font-bold text-stone-700 dark:text-zinc-200">
                  {statusFilter === 'pending'
                    ? 'Немає нерозглянутих уточнень'
                    : 'Список уточнень порожній'}
                </div>
                <p className="text-xs text-stone-500 dark:text-zinc-400 max-w-sm mx-auto">
                  Коли гості натиснуть «Запропонувати уточнення / спогад» на будь-якій картці, їхні нотатки з&apos;являться тут та підсвітять картку на полотні.
                </p>
              </div>
            ) : (
              filteredSuggestions.map(({ person, suggestion }) => {
                const catMeta = CATEGORY_LABELS[suggestion.category] || CATEGORY_LABELS.correction;
                const fullName = [person.firstName, person.lastName].filter(Boolean).join(' ') || '?';
                const fieldEntries = Object.entries(suggestion.suggestedFields || {}).filter(
                  ([, v]) => Boolean(v && String(v).trim())
                );
                const isPending = suggestion.status === 'pending';

                return (
                  <div
                    key={suggestion.id}
                    className={`rounded-2xl bg-white dark:bg-zinc-900 border p-3.5 shadow-2xs space-y-2.5 ${
                      isPending
                        ? 'border-amber-300/90 dark:border-amber-700/70'
                        : 'border-stone-200/80 dark:border-zinc-800 opacity-85'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <SilhouetteAvatar
                          gender={person.gender}
                          avatarUrl={person.avatarUrl}
                          name={fullName}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <button
                              type="button"
                              onClick={() => {
                                onSelectPerson(person.id);
                                onClose();
                              }}
                              className="text-xs font-bold text-stone-900 dark:text-zinc-100 hover:text-emerald-700 dark:hover:text-emerald-400 cursor-pointer truncate"
                            >
                              {fullName}
                            </button>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${catMeta.badgeClass}`}>
                              {catMeta.label}
                            </span>
                            {suggestion.status === 'pending' ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 text-[10px] font-semibold">
                                <Clock size={10} />
                                Нове
                              </span>
                            ) : suggestion.status === 'approved' ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 text-[10px] font-semibold">
                                <Check size={10} />
                                Затверджено
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-stone-100 dark:bg-zinc-800 text-stone-500 text-[10px] font-semibold">
                                <Ban size={10} />
                                Відхилено
                              </span>
                            )}
                          </div>
                          <div className="text-[10.5px] text-stone-500 dark:text-zinc-400 mt-0.5">
                            Автор: <strong className="text-stone-700 dark:text-zinc-200">{suggestion.authorName}</strong>
                            {suggestion.createdAt && (
                              <span className="ml-2">
                                · {new Date(suggestion.createdAt).toLocaleString('uk-UA')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          onSelectPerson(person.id);
                          onClose();
                        }}
                        className="px-2 py-1 rounded-lg bg-stone-100 dark:bg-zinc-800 hover:bg-stone-200 dark:hover:bg-zinc-700 text-stone-700 dark:text-zinc-200 text-[10.5px] font-semibold inline-flex items-center gap-1 cursor-pointer shrink-0"
                      >
                        <Navigation size={11} />
                        <span>До картки</span>
                      </button>
                    </div>

                    <div className="p-2.5 rounded-xl bg-stone-50 dark:bg-zinc-800/70 border border-stone-200/70 dark:border-zinc-700/70 text-xs text-stone-800 dark:text-zinc-200 whitespace-pre-wrap leading-relaxed">
                      {suggestion.message}
                    </div>

                    {fieldEntries.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {fieldEntries.map(([fieldKey, val]) => (
                          <span
                            key={fieldKey}
                            className="px-2 py-1 rounded-lg bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/60 text-[11px] text-sky-950 dark:text-sky-200"
                          >
                            <span className="text-sky-700 dark:text-sky-400 font-semibold">
                              {FIELD_LABELS[fieldKey] || fieldKey}:
                            </span>{' '}
                            <strong>{String(val)}</strong>
                          </span>
                        ))}
                      </div>
                    )}

                    {isPending && (
                      <div className="flex flex-wrap items-center justify-end gap-1.5 pt-1 border-t border-stone-100 dark:border-zinc-800">
                        <button
                          type="button"
                          onClick={() => onResolveSuggestion(person.id, suggestion.id, 'reject')}
                          className="px-2.5 py-1.5 rounded-lg bg-stone-100 hover:bg-rose-50 text-stone-600 hover:text-rose-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-rose-950/50 dark:hover:text-rose-300 text-[11px] font-semibold cursor-pointer transition-colors"
                        >
                          Відхилити
                        </button>
                        <button
                          type="button"
                          onClick={() => onResolveSuggestion(person.id, suggestion.id, 'mark_approved')}
                          className="px-2.5 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 dark:bg-zinc-800 dark:text-zinc-200 text-[11px] font-semibold cursor-pointer transition-colors"
                          title="Позначити переглянутим без автоматичної зміни тексту картки"
                        >
                          Лише позначити
                        </button>
                        <button
                          type="button"
                          onClick={() => onResolveSuggestion(person.id, suggestion.id, 'approve')}
                          className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer shadow-2xs transition-colors"
                          title="Автоматично застосувати запропоновані поля та додати текст у картку"
                        >
                          <Check size={12.5} />
                          <span>Затвердити в 1 клік</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )
          ) : filteredProposals.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <UserPlus size={32} className="mx-auto text-sky-500/70" />
              <div className="text-sm font-bold text-stone-700 dark:text-zinc-200">
                Немає карток-пропозицій
              </div>
              <p className="text-xs text-stone-500 dark:text-zinc-400 max-w-sm mx-auto">
                Коли гість запропонує додати батьків, подружжя, дитину, брата чи сестру, нова картка-пропозиція з&apos;явиться на полотні та у цьому списку для вашої перевірки.
              </p>
            </div>
          ) : (
            filteredProposals.map((prop) => {
              const propName = [prop.firstName, prop.lastName].filter(Boolean).join(' ') || 'Без імені';
              const target = prop.proposalMeta?.targetPersonId
                ? tree.persons[prop.proposalMeta.targetPersonId]
                : null;
              const targetName = target
                ? [target.firstName, target.lastName].filter(Boolean).join(' ')
                : 'Картка';
              const relLabel =
                RELATION_LABELS[prop.proposalMeta?.relationType || ''] || 'Родич';
              const isConfirmingDel = confirmDeleteId === prop.id;

              return (
                <div
                  key={prop.id}
                  className="rounded-2xl bg-white dark:bg-zinc-900 border border-sky-300/90 dark:border-sky-700/80 p-3.5 shadow-2xs space-y-2.5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <SilhouetteAvatar
                        gender={prop.gender}
                        avatarUrl={prop.avatarUrl}
                        name={propName}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-stone-900 dark:text-zinc-100 truncate">
                            {propName}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-200 dark:bg-sky-950/70 dark:text-sky-300 dark:border-sky-800">
                            Пропозиція · {relLabel}
                          </span>
                        </div>
                        <div className="text-[11px] text-stone-500 dark:text-zinc-400 mt-0.5">
                          Для: <strong className="text-stone-700 dark:text-zinc-200">{targetName}</strong>
                          {prop.proposalMeta?.authorName && (
                            <span className="ml-2">
                              · Від: <strong className="text-stone-700 dark:text-zinc-200">{prop.proposalMeta.authorName}</strong>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        onSelectPerson(prop.id);
                        onClose();
                      }}
                      className="px-2 py-1 rounded-lg bg-stone-100 dark:bg-zinc-800 hover:bg-stone-200 dark:hover:bg-zinc-700 text-stone-700 dark:text-zinc-200 text-[10.5px] font-semibold inline-flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <Navigation size={11} />
                      <span>На полотні</span>
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2 text-[11px] text-stone-600 dark:text-zinc-300">
                    {(prop.birthDate || prop.birthYear) && (
                      <span className="px-2 py-0.5 rounded-md bg-stone-100 dark:bg-zinc-800">
                        Нар.: <strong>{prop.birthDate || prop.birthYear}</strong>
                      </span>
                    )}
                    {(prop.deathDate || prop.deathYear) && (
                      <span className="px-2 py-0.5 rounded-md bg-stone-100 dark:bg-zinc-800">
                        Помер: <strong>{prop.deathDate || prop.deathYear}</strong>
                      </span>
                    )}
                    {prop.birthPlace && (
                      <span className="px-2 py-0.5 rounded-md bg-stone-100 dark:bg-zinc-800">
                        Місце нар.: <strong>{prop.birthPlace}</strong>
                      </span>
                    )}
                    {prop.residencePlace && (
                      <span className="px-2 py-0.5 rounded-md bg-stone-100 dark:bg-zinc-800">
                        Проживання: <strong>{prop.residencePlace}</strong>
                      </span>
                    )}
                  </div>

                  {(prop.proposalMeta?.note || prop.notes) && (
                    <div className="p-2.5 rounded-xl bg-sky-50/60 dark:bg-sky-950/30 border border-sky-200/70 dark:border-sky-800/50 text-xs text-stone-800 dark:text-zinc-200 whitespace-pre-wrap">
                      {prop.proposalMeta?.note || prop.notes}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-end gap-1.5 pt-1 border-t border-stone-100 dark:border-zinc-800">
                    {isConfirmingDel ? (
                      <>
                        <span className="text-[11px] text-rose-700 dark:text-rose-400 font-semibold mr-1">
                          Видалити пропозицію?
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            onDeleteProposal(prop.id);
                            setConfirmDeleteId(null);
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-semibold cursor-pointer"
                        >
                          Так, видалити
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2.5 py-1.5 rounded-lg bg-stone-100 dark:bg-zinc-800 text-stone-600 dark:text-zinc-300 text-[11px] font-semibold cursor-pointer"
                        >
                          Скасувати
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(prop.id)}
                          className="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:hover:bg-rose-950/70 dark:text-rose-300 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 size={12} />
                          <span>Видалити</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onEditPerson(prop);
                            onClose();
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-800 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-100 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Pencil size={12} />
                          <span>Редагувати</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onApproveProposal(prop.id)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer shadow-2xs"
                        >
                          <Check size={12.5} />
                          <span>Підтвердити картку</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
