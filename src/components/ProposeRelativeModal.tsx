import React, { useState, useEffect } from 'react';
import { Person, Gender } from '../types/tree';
import { X, UserPlus, Send, Sparkles } from 'lucide-react';

export type ProposableRelationType =
  | 'father'
  | 'mother'
  | 'spouse'
  | 'child'
  | 'brother'
  | 'sister';

interface ProposeRelativeModalProps {
  isOpen: boolean;
  targetPerson: Person | null;
  defaultAuthorName?: string;
  onClose: () => void;
  onSubmit: (data: {
    relationType: ProposableRelationType;
    firstName: string;
    lastName: string;
    maidenName?: string;
    gender: Gender;
    birthYear?: string;
    birthDate?: string;
    isDeceased?: boolean;
    deathYear?: string;
    birthPlace?: string;
    residencePlace?: string;
    note?: string;
    authorName: string;
  }) => Promise<void> | void;
}

const RELATION_OPTIONS: Array<{ id: ProposableRelationType; label: string; gender: Gender }> = [
  { id: 'father', label: 'Батько', gender: 'male' },
  { id: 'mother', label: 'Мати', gender: 'female' },
  { id: 'spouse', label: 'Подружжя', gender: 'unknown' },
  { id: 'child', label: 'Дитина', gender: 'male' },
  { id: 'brother', label: 'Брат', gender: 'male' },
  { id: 'sister', label: 'Сестра', gender: 'female' },
];

export const ProposeRelativeModal: React.FC<ProposeRelativeModalProps> = ({
  isOpen,
  targetPerson,
  defaultAuthorName = '',
  onClose,
  onSubmit,
}) => {
  const [relationType, setRelationType] = useState<ProposableRelationType>('child');
  const [gender, setGender] = useState<Gender>('male');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [maidenName, setMaidenName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [isDeceased, setIsDeceased] = useState(false);
  const [deathYear, setDeathYear] = useState('');
  const [birthPlace, setBirthPlace] = useState('');
  const [residencePlace, setResidencePlace] = useState('');
  const [note, setNote] = useState('');
  const [authorName, setAuthorName] = useState(defaultAuthorName);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !targetPerson) return;
    setRelationType('child');
    setGender('male');
    setFirstName('');
    setLastName(targetPerson.lastName || '');
    setMaidenName('');
    setBirthDate('');
    setIsDeceased(false);
    setDeathYear('');
    setBirthPlace('');
    setResidencePlace('');
    setNote('');
    setAuthorName(defaultAuthorName || '');
    setError(null);
    setIsSubmitting(false);
  }, [isOpen, targetPerson?.id, defaultAuthorName]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen || !targetPerson) return null;

  const targetFullName =
    [targetPerson.firstName, targetPerson.lastName].filter(Boolean).join(' ') || 'Особа';

  const handleSelectRelation = (rel: ProposableRelationType) => {
    setRelationType(rel);
    if (rel === 'father' || rel === 'brother') {
      setGender('male');
    } else if (rel === 'mother' || rel === 'sister') {
      setGender('female');
    } else if (rel === 'spouse') {
      setGender(targetPerson.gender === 'male' ? 'female' : 'male');
    }
    if (rel === 'spouse' || rel === 'mother') {
      setLastName('');
    } else if (!lastName.trim() && targetPerson.lastName) {
      setLastName(targetPerson.lastName);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!firstName.trim() && !lastName.trim()) {
      setError("Вкажіть хоча б ім'я або прізвище родича.");
      return;
    }

    const bTrim = birthDate.trim();
    const yearMatch = bTrim.match(/\b(1[6-9]\d{2}|20\d{2})\b/);
    const birthYear = yearMatch ? yearMatch[1] : /^\d{4}$/.test(bTrim) ? bTrim : undefined;

    setIsSubmitting(true);
    try {
      await onSubmit({
        relationType,
        firstName: firstName.trim() || 'Невідомо',
        lastName: lastName.trim(),
        maidenName: gender === 'female' ? maidenName.trim() || undefined : undefined,
        gender,
        birthYear,
        birthDate: bTrim || undefined,
        isDeceased,
        deathYear: isDeceased ? deathYear.trim() || undefined : undefined,
        birthPlace: birthPlace.trim() || undefined,
        residencePlace: residencePlace.trim() || undefined,
        note: note.trim() || undefined,
        authorName: authorName.trim() || 'Родич / Гість',
      });
      onClose();
    } catch (err) {
      setError((err as Error)?.message || 'Не вдалося запропонувати картку.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-sky-200 dark:border-zinc-800 overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 bg-gradient-to-r from-sky-50 via-sky-50/40 to-white dark:from-sky-950/50 dark:via-zinc-900 dark:to-zinc-900 border-b border-sky-200/80 dark:border-zinc-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-sky-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <UserPlus size={18} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-stone-900 dark:text-zinc-100 truncate">
                Запропонувати нового родича
              </h3>
              <p className="text-[11px] text-stone-500 dark:text-zinc-400 truncate">
                До картки: <strong className="text-stone-800 dark:text-zinc-200">{targetFullName}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-zinc-200 hover:bg-stone-200/60 dark:hover:bg-zinc-800 cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-200">
              {error}
            </div>
          )}

          {/* Relative Type Picker */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-zinc-400 mb-1.5">
              Ким доводиться для «{targetFullName}»?
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {RELATION_OPTIONS.map((opt) => {
                const active = relationType === opt.id;
                const displayLabel =
                  opt.id === 'spouse'
                    ? targetPerson.gender === 'male'
                      ? 'Дружина'
                      : targetPerson.gender === 'female'
                      ? 'Чоловік'
                      : 'Подружжя'
                    : opt.label;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleSelectRelation(opt.id)}
                    className={`px-2.5 py-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                      active
                        ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                        : 'bg-stone-50 dark:bg-zinc-800/70 text-stone-700 dark:text-zinc-300 border-stone-200 dark:border-zinc-700 hover:bg-sky-50 dark:hover:bg-sky-950/30'
                    }`}
                  >
                    {displayLabel}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Gender when child or spouse */}
          {(relationType === 'child' || relationType === 'spouse') && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-stone-600 dark:text-zinc-300">Стать:</span>
              <div className="inline-flex p-0.5 rounded-lg bg-stone-100 dark:bg-zinc-800 border border-stone-200 dark:border-zinc-700">
                <button
                  type="button"
                  onClick={() => setGender('male')}
                  className={`px-3 py-1 rounded-md text-xs font-semibold cursor-pointer ${
                    gender === 'male'
                      ? 'bg-white dark:bg-zinc-900 text-sky-700 dark:text-sky-400 shadow-2xs'
                      : 'text-stone-500 dark:text-zinc-400'
                  }`}
                >
                  ♂ Чоловік
                </button>
                <button
                  type="button"
                  onClick={() => setGender('female')}
                  className={`px-3 py-1 rounded-md text-xs font-semibold cursor-pointer ${
                    gender === 'female'
                      ? 'bg-white dark:bg-zinc-900 text-rose-700 dark:text-rose-400 shadow-2xs'
                      : 'text-stone-500 dark:text-zinc-400'
                  }`}
                >
                  ♀ Жінка
                </button>
              </div>
            </div>
          )}

          {/* Name & Surname */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-stone-700 dark:text-zinc-300 mb-1">
                Ім&apos;я
              </label>
              <input
                type="text"
                autoFocus
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Напр.: Марія"
                className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50/80 dark:bg-zinc-800/80 text-stone-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white dark:focus:bg-zinc-800"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 dark:text-zinc-300 mb-1">
                Прізвище
              </label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Прізвище"
                className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50/80 dark:bg-zinc-800/80 text-stone-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white dark:focus:bg-zinc-800"
              />
            </div>
          </div>

          {gender === 'female' && (
            <div>
              <label className="block text-xs font-semibold text-stone-700 dark:text-zinc-300 mb-1">
                Дівоче прізвище (якщо відомо)
              </label>
              <input
                type="text"
                value={maidenName}
                onChange={(e) => setMaidenName(e.target.value)}
                placeholder="Напр.: Коваленко"
                className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50/80 dark:bg-zinc-800/80 text-stone-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
          )}

          {/* Birth / Death */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold text-stone-700 dark:text-zinc-300 mb-1">
                Рік або дата народження
              </label>
              <input
                type="text"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                placeholder="Напр.: 1954 або 12.05.1954"
                className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50/80 dark:bg-zinc-800/80 text-stone-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-700 dark:text-zinc-300 cursor-pointer select-none py-2">
                <input
                  type="checkbox"
                  checked={isDeceased}
                  onChange={(e) => setIsDeceased(e.target.checked)}
                  className="rounded border-stone-300 text-sky-600 focus:ring-sky-500"
                />
                <span>Померла особа</span>
              </label>
              {isDeceased && (
                <input
                  type="text"
                  value={deathYear}
                  onChange={(e) => setDeathYear(e.target.value)}
                  placeholder="Рік смерті"
                  className="flex-1 min-w-0 px-2.5 py-1.5 text-xs rounded-lg border border-stone-200 dark:border-zinc-700 bg-stone-50/80 dark:bg-zinc-800 text-stone-900 dark:text-zinc-100"
                />
              )}
            </div>
          </div>

          {/* Places */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-stone-700 dark:text-zinc-300 mb-1">
                Місце народження
              </label>
              <input
                type="text"
                value={birthPlace}
                onChange={(e) => setBirthPlace(e.target.value)}
                placeholder="Село або місто"
                className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50/80 dark:bg-zinc-800/80 text-stone-900 dark:text-zinc-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 dark:text-zinc-300 mb-1">
                Місце проживання
              </label>
              <input
                type="text"
                value={residencePlace}
                onChange={(e) => setResidencePlace(e.target.value)}
                placeholder="Де проживала особа"
                className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50/80 dark:bg-zinc-800/80 text-stone-900 dark:text-zinc-100"
              />
            </div>
          </div>

          {/* Note & Author */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 dark:text-zinc-300 mb-1">
              Нотатка, коментар або джерело інформації
            </label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Напр.: Дядько Петро, про якого розповідала бабуся; жив у Києві..."
              className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50/80 dark:bg-zinc-800/80 text-stone-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 dark:text-zinc-300 mb-1">
              Ваше ім&apos;я (хто пропонує)
            </label>
            <input
              type="text"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              placeholder="Напр.: Андрій"
              className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50/80 dark:bg-zinc-800/80 text-stone-900 dark:text-zinc-100"
            />
          </div>

          <div className="p-2.5 rounded-xl bg-sky-50/80 dark:bg-sky-950/35 border border-sky-200 dark:border-sky-800/60 text-[11px] text-sky-950 dark:text-sky-200 flex items-start gap-2 leading-relaxed">
            <Sparkles size={14} className="text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
            <span>
              Нова картка з&apos;явиться на полотні зі статусом <strong>«Пропозиція»</strong>. Адміністратор зможе відредагувати її, затвердити в родоводі або видалити.
            </span>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-stone-600 dark:text-zinc-300 hover:bg-stone-100 dark:hover:bg-zinc-800 rounded-xl cursor-pointer"
            >
              Скасувати
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-50 rounded-xl shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Send size={13} />
              <span>{isSubmitting ? 'Додавання...' : 'Запропонувати картку'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
