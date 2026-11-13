import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Check, Search, X, Users, Sparkles, ShieldCheck, Paintbrush } from 'lucide-react';
import { Person } from '../types/tree';
import { SilhouetteAvatar } from './SilhouetteAvatar';

interface UserIdentityModalProps {
  isOpen: boolean;
  onClose: () => void;
  allPersons: Record<string, Person>;
  currentUserPersonId: string | null;
  currentCustomName?: { firstName: string; lastName: string } | null;
  onSaveIdentity: (personId: string | null, customName?: { firstName: string; lastName: string }) => void;
  onOpenCustomize?: (personId: string) => void;
}

export const UserIdentityModal: React.FC<UserIdentityModalProps> = ({
  isOpen,
  onClose,
  allPersons,
  currentUserPersonId,
  onSaveIdentity,
  onOpenCustomize,
}) => {
  const [query, setQuery] = useState('');
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(currentUserPersonId);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedPersonId(currentUserPersonId);
      setQuery('');
      setTimeout(() => {
        inputRef.current?.focus();
      }, 120);
    }
  }, [isOpen, currentUserPersonId]);

  const personsList = useMemo(() => {
    return Object.values(allPersons).sort((a, b) => {
      const nameA = `${a.lastName || ''} ${a.firstName || ''}`.trim();
      const nameB = `${b.lastName || ''} ${b.firstName || ''}`.trim();
      return nameA.localeCompare(nameB, 'uk');
    });
  }, [allPersons]);

  const matchingPersons = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const terms = q.split(/\s+/).filter(Boolean);
    return personsList.filter((p) => {
      const fullName = `${p.firstName || ''} ${p.lastName || ''} ${p.maidenName || ''} ${p.patronymic || ''} ${p.nickname || ''}`.toLowerCase();
      return terms.every((term) => fullName.includes(term));
    });
  }, [personsList, query]);

  if (!isOpen) return null;

  const handleSelectPerson = (p: Person) => {
    setSelectedPersonId(p.id);
    setQuery(`${p.firstName || ''} ${p.lastName || ''}`.trim());
  };

  const resolveFinalPersonId = (): string | null => {
    let finalPersonId = selectedPersonId;
    if (!finalPersonId && matchingPersons.length === 1) {
      finalPersonId = matchingPersons[0].id;
    }
    return finalPersonId;
  };

  const commitIdentity = (finalPersonId: string) => {
    const person = allPersons[finalPersonId];
    if (person) {
      onSaveIdentity(finalPersonId, {
        firstName: person.firstName || '',
        lastName: person.lastName || '',
      });
    } else {
      onSaveIdentity(finalPersonId, undefined);
    }
    onClose();
  };

  const handleConfirm = () => {
    const finalPersonId = resolveFinalPersonId();
    if (!finalPersonId) return;
    commitIdentity(finalPersonId);
  };

  const handleConfirmAndCustomize = () => {
    const finalPersonId = resolveFinalPersonId() || currentUserPersonId;
    if (!finalPersonId || !allPersons[finalPersonId]) return;
    commitIdentity(finalPersonId);
    onOpenCustomize?.(finalPersonId);
  };

  const handleClear = () => {
    setSelectedPersonId(null);
    setQuery('');
    onSaveIdentity(null, undefined);
    onClose();
  };

  const selectedPerson = selectedPersonId ? allPersons[selectedPersonId] : null;
  const currentIdentifiedPerson = currentUserPersonId ? allPersons[currentUserPersonId] : null;
  const canConfirm = Boolean(selectedPersonId || matchingPersons.length === 1);

  return (
    <div
      className="fixed inset-0 bg-stone-950/65 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-stone-200/90 dark:border-zinc-800 w-full max-w-lg overflow-hidden flex flex-col relative animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Decorative Top Banner */}
        <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-emerald-500 via-teal-500 to-amber-500" />

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-stone-100 dark:border-zinc-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60 flex items-center justify-center shadow-xs">
              <Users size={20} />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-stone-900 dark:text-zinc-100 tracking-tight flex items-center gap-1.5">
                <span>Хто ви у цьому родовому дереві?</span>
                <Sparkles size={16} className="text-amber-500 fill-amber-400 animate-pulse" />
              </h3>
              <p className="text-xs text-stone-500 dark:text-zinc-400 mt-0.5">
                Знайдіть себе у списку або вкажіть своє ім'я для персоналізації
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-stone-100 dark:bg-zinc-800 text-stone-400 hover:text-stone-700 dark:hover:text-zinc-200 flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Закрити"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4">
          {currentIdentifiedPerson && onOpenCustomize && (
            <div className="p-3 rounded-2xl bg-emerald-50/90 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/70 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <SilhouetteAvatar
                  gender={currentIdentifiedPerson.gender}
                  avatarUrl={currentIdentifiedPerson.avatarUrl}
                  name={`${currentIdentifiedPerson.firstName} ${currentIdentifiedPerson.lastName}`}
                  size="sm"
                />
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">
                    Зараз ви позначені як:
                  </div>
                  <div className="text-xs font-bold text-stone-900 dark:text-zinc-100 truncate">
                    {[currentIdentifiedPerson.firstName, currentIdentifiedPerson.lastName]
                      .filter(Boolean)
                      .join(' ')}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenCustomize(currentIdentifiedPerson.id);
                }}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-[11px] font-bold shadow-xs transition-colors cursor-pointer"
              >
                <Paintbrush size={13} />
                <span>Оформити картку</span>
              </button>
            </div>
          )}

          {/* Search Input Box */}
          <div className="relative">
            <Search
              size={18}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none"
            />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (selectedPerson && `${selectedPerson.firstName} ${selectedPerson.lastName}` !== e.target.value) {
                  setSelectedPersonId(null);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleConfirm();
                }
              }}
              placeholder="Введіть своє ім'я або прізвище..."
              className="w-full pl-11 pr-10 py-3 text-sm bg-stone-50 dark:bg-zinc-800/90 border border-stone-300 dark:border-zinc-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:bg-white dark:focus:bg-zinc-800 text-stone-900 dark:text-zinc-100 font-medium transition-all shadow-inner"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setSelectedPersonId(null);
                  inputRef.current?.focus();
                }}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 dark:hover:text-zinc-200 p-1 cursor-pointer"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Persons Selector List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-stone-500 dark:text-zinc-400 px-1 font-semibold">
              <span>
                {query.trim() ? `Знайдено (${matchingPersons.length})` : 'Список членів родини'}
              </span>
              {selectedPerson && (
                <span className="text-emerald-700 dark:text-emerald-400 font-bold flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                  <ShieldCheck size={13} />
                  Вибрано
                </span>
              )}
            </div>

            <div className="max-h-60 overflow-y-auto space-y-1.5 border border-stone-200 dark:border-zinc-800 rounded-2xl p-2 bg-stone-50/70 dark:bg-zinc-950/50 shadow-inner">
              {!query.trim() ? (
                <div className="py-8 px-4 text-center text-xs text-stone-400 dark:text-zinc-500 font-medium">
                  Почніть вводити букви вашого імені або прізвища у полі вище...
                </div>
              ) : matchingPersons.length === 0 ? (
                <div className="py-8 px-4 text-center text-xs text-stone-500 dark:text-zinc-400">
                  Осіб із такими даними не знайдено. Перевірте правильність написання.
                </div>
              ) : (
                matchingPersons.map((p) => {
                  const isSelected = selectedPersonId === p.id;
                  const fullName = [p.firstName, p.lastName].filter(Boolean).join(' ') || 'Без імені';
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelectPerson(p)}
                      className={`w-full p-2.5 rounded-xl text-left flex items-center justify-between gap-3 transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-50 dark:bg-emerald-950/80 border-2 border-emerald-600 dark:border-emerald-500 text-emerald-950 dark:text-emerald-200 shadow-sm scale-[1.01]'
                          : 'bg-white dark:bg-zinc-800/90 hover:bg-stone-100 dark:hover:bg-zinc-800 border border-stone-200/90 dark:border-zinc-700/80 text-stone-800 dark:text-zinc-200'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <SilhouetteAvatar
                          gender={p.gender}
                          avatarUrl={p.avatarUrl}
                          name={fullName}
                          size="md"
                        />
                        <div className="min-w-0">
                          <span className="text-xs font-bold truncate block">
                            {fullName}
                            {p.maidenName ? ` (${p.maidenName})` : ''}
                          </span>
                          {p.yearsDisplay && (
                            <span className="text-[10px] text-stone-500 dark:text-zinc-400 font-mono block mt-0.5">
                              {p.yearsDisplay}
                            </span>
                          )}
                        </div>
                      </div>

                      {isSelected ? (
                        <div className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                          <Check size={14} strokeWidth={3} />
                        </div>
                      ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-stone-300 dark:border-zinc-600 shrink-0" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex flex-col gap-2">
            <button
              type="button"
              disabled={!canConfirm}
              onClick={handleConfirm}
              className={`w-full py-3 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer ${
                canConfirm
                  ? 'bg-emerald-800 hover:bg-emerald-900 active:bg-emerald-950 text-white shadow-emerald-900/20 hover:scale-[1.01]'
                  : 'bg-stone-200 dark:bg-zinc-800 text-stone-400 dark:text-zinc-600 cursor-not-allowed shadow-none'
              }`}
            >
              <Check size={16} strokeWidth={2.5} />
              <span>Підтвердити вибір</span>
            </button>

            {onOpenCustomize && canConfirm && (
              <button
                type="button"
                onClick={handleConfirmAndCustomize}
                className="w-full py-2.5 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 border border-emerald-700/40 dark:border-emerald-500/40 bg-emerald-50/80 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-950/70 text-emerald-900 dark:text-emerald-200 transition-colors cursor-pointer"
              >
                <Paintbrush size={15} />
                <span>Підтвердити та оформити свою картку</span>
              </button>
            )}

            {currentUserPersonId && (
              <button
                type="button"
                onClick={handleClear}
                className="text-xs text-stone-400 dark:text-zinc-500 hover:text-stone-700 dark:hover:text-zinc-300 hover:underline text-center cursor-pointer py-1 font-medium"
              >
                Скинути мій вибір
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
