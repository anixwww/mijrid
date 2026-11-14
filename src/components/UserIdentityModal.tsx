import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Check, Search, X, Users } from 'lucide-react';
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
  onSaveIdentity,
}) => {
  const [query, setQuery] = useState('');
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedPersonId(null);
      setQuery('');
      setTimeout(() => {
        inputRef.current?.focus();
      }, 120);
    }
  }, [isOpen]);

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
  };

  const handleConfirm = () => {
    if (!selectedPersonId) return;
    const person = allPersons[selectedPersonId];
    if (person) {
      onSaveIdentity(selectedPersonId, {
        firstName: person.firstName || '',
        lastName: person.lastName || '',
      });
    } else {
      onSaveIdentity(selectedPersonId, undefined);
    }
    onClose();
  };

  const hasQuery = query.trim().length > 0;
  const canConfirm = Boolean(selectedPersonId && allPersons[selectedPersonId]);

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
              <h3 className="text-lg font-extrabold text-stone-900 dark:text-zinc-100 tracking-tight">
                Знайдіть себе у родовому дереві
              </h3>
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
                if (selectedPersonId) {
                  setSelectedPersonId(null);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canConfirm) {
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
                aria-label="Очистити пошук"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Search Results (appears once user starts typing) */}
          {hasQuery && (
            <div className="max-h-60 overflow-y-auto space-y-1.5 border border-stone-200 dark:border-zinc-800 rounded-2xl p-2 bg-stone-50/70 dark:bg-zinc-950/50 shadow-inner animate-in fade-in slide-in-from-top-1 duration-150">
              {matchingPersons.length === 0 ? (
                <div className="py-6 px-4 text-center text-xs text-stone-500 dark:text-zinc-400">
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
                          ? 'bg-emerald-50 dark:bg-emerald-950/80 border-2 border-emerald-600 dark:border-emerald-500 text-emerald-950 dark:text-emerald-200 shadow-sm'
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
          )}

          {/* Confirm Button (appears only after clicking a result row) */}
          {canConfirm && (
            <button
              type="button"
              onClick={handleConfirm}
              className="w-full py-3 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer bg-emerald-800 hover:bg-emerald-900 active:bg-emerald-950 text-white shadow-emerald-900/20 animate-in fade-in slide-in-from-bottom-1 duration-150"
            >
              <Check size={16} strokeWidth={2.5} />
              <span>Підтвердити</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
