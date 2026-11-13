import React, { useState, useEffect } from 'react';
import { Person, GuestSuggestion, GuestSuggestionCategory } from '../types/tree';
import {
  X,
  MessageSquarePlus,
  Sparkles,
  Calendar,
  BookOpen,
  FileSearch,
  ChevronDown,
  ChevronUp,
  Send,
} from 'lucide-react';

interface GuestSuggestionModalProps {
  isOpen: boolean;
  person: Person | null;
  defaultAuthorName?: string;
  onClose: () => void;
  onSubmit: (payload: {
    personId: string;
    category: GuestSuggestionCategory;
    message: string;
    authorName: string;
    suggestedFields?: GuestSuggestion['suggestedFields'];
  }) => Promise<void> | void;
}

const CATEGORY_OPTIONS: Array<{
  id: GuestSuggestionCategory;
  label: string;
  hint: string;
  icon: React.ReactNode;
}> = [
  {
    id: 'correction',
    label: 'Нотатка / Уточнення',
    hint: 'Додати нотатку чи виправити факт',
    icon: <FileSearch size={13.5} />,
  },
  {
    id: 'memory',
    label: 'Спогад / Історія',
    hint: 'Родинний переказ чи життєва історія',
    icon: <Sparkles size={13.5} />,
  },
  {
    id: 'date_place',
    label: 'Дата або місце',
    hint: 'Уточнити дату чи населений пункт',
    icon: <Calendar size={13.5} />,
  },
  {
    id: 'document_hint',
    label: 'Про документ',
    hint: 'Де зберігається фото, запис чи метрика',
    icon: <BookOpen size={13.5} />,
  },
];

export const GuestSuggestionModal: React.FC<GuestSuggestionModalProps> = ({
  isOpen,
  person,
  defaultAuthorName = '',
  onClose,
  onSubmit,
}) => {
  const [category, setCategory] = useState<GuestSuggestionCategory>('correction');
  const [authorName, setAuthorName] = useState(defaultAuthorName);
  const [message, setMessage] = useState('');
  const [showStructured, setShowStructured] = useState(false);

  const [birthDate, setBirthDate] = useState('');
  const [deathDate, setDeathDate] = useState('');
  const [birthPlace, setBirthPlace] = useState('');
  const [residencePlace, setResidencePlace] = useState('');
  const [maidenName, setMaidenName] = useState('');
  const [profession, setProfession] = useState('');
  const [nickname, setNickname] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setCategory('correction');
    setAuthorName(defaultAuthorName || '');
    setMessage('');
    setShowStructured(false);
    setBirthDate('');
    setDeathDate('');
    setBirthPlace('');
    setResidencePlace('');
    setMaidenName('');
    setProfession('');
    setNickname('');
    setError(null);
    setIsSubmitting(false);
  }, [isOpen, person?.id, defaultAuthorName]);

  useEffect(() => {
    if (category === 'date_place') {
      setShowStructured(true);
    }
  }, [category]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen || !person) return null;

  const fullName = [person.firstName, person.lastName].filter(Boolean).join(' ') || 'Особа';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const fields: NonNullable<GuestSuggestion['suggestedFields']> = {};
    if (birthDate.trim()) {
      fields.birthDate = birthDate.trim();
      const yMatch = birthDate.trim().match(/\b(1[6-9]\d{2}|20\d{2})\b/);
      if (yMatch) fields.birthYear = yMatch[1];
    }
    if (deathDate.trim()) {
      fields.deathDate = deathDate.trim();
      const yMatch = deathDate.trim().match(/\b(1[6-9]\d{2}|20\d{2})\b/);
      if (yMatch) fields.deathYear = yMatch[1];
    }
    if (birthPlace.trim()) fields.birthPlace = birthPlace.trim();
    if (residencePlace.trim()) fields.residencePlace = residencePlace.trim();
    if (maidenName.trim()) fields.maidenName = maidenName.trim();
    if (profession.trim()) fields.profession = profession.trim();
    if (nickname.trim()) fields.nickname = nickname.trim();

    const hasAnyField = Object.keys(fields).length > 0;
    const cleanMsg =
      message.trim() || (hasAnyField ? 'Запропоновано уточнення окремих полів картки.' : '');

    if (!cleanMsg) {
      setError('Напишіть текст уточнення, спогад або заповніть хоча б одне поле.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        personId: person.id,
        category,
        message: cleanMsg,
        authorName: authorName.trim() || 'Родич / Гість',
        suggestedFields: hasAnyField ? fields : undefined,
      });
      onClose();
    } catch (err) {
      setError((err as Error)?.message || 'Не вдалося надіслати уточнення.');
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
        className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-stone-200 dark:border-zinc-800 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 bg-gradient-to-r from-amber-50 via-stone-50 to-white dark:from-amber-950/35 dark:via-zinc-900 dark:to-zinc-900 border-b border-stone-200 dark:border-zinc-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-amber-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <MessageSquarePlus size={18} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-stone-900 dark:text-zinc-100 truncate">
                Запропонувати нотатку / уточнення
              </h3>
              <p className="text-[11px] text-stone-500 dark:text-zinc-400 truncate">
                Для картки: <strong className="text-stone-800 dark:text-zinc-200">{fullName}</strong>
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

          {/* Category picker */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-zinc-400 mb-1.5">
              Тип повідомлення
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {CATEGORY_OPTIONS.map((opt) => {
                const active = category === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setCategory(opt.id)}
                    className={`p-2 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-2 ${
                      active
                        ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-400 dark:border-amber-600 text-amber-950 dark:text-amber-100 shadow-2xs'
                        : 'bg-stone-50/70 dark:bg-zinc-800/60 border-stone-200 dark:border-zinc-700 text-stone-700 dark:text-zinc-300 hover:bg-stone-100 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <span className={`mt-0.5 shrink-0 ${active ? 'text-amber-600 dark:text-amber-400' : 'text-stone-400'}`}>
                      {opt.icon}
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-bold leading-tight">{opt.label}</div>
                      <div className="text-[10px] text-stone-500 dark:text-zinc-400 leading-tight mt-0.5">
                        {opt.hint}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Message textarea */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 dark:text-zinc-300 mb-1.5">
              {category === 'memory'
                ? 'Розкажіть спогад або цікаву сімейну історію'
                : 'Що саме варто уточнити чи додати?'}
            </label>
            <textarea
              rows={4}
              autoFocus
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={
                category === 'memory'
                  ? 'Напр.: Дідусь завжди розповідав, як у 1950-х збудував хату біля ставу...'
                  : 'Напр.: Дата народження була 14.03.1924 (за словами тітки Марії), а не 1925...'
              }
              className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50/80 dark:bg-zinc-800/80 text-stone-900 dark:text-zinc-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white dark:focus:bg-zinc-800"
            />
          </div>

          {/* Optional structured field updates */}
          <div className="rounded-xl border border-stone-200 dark:border-zinc-700/90 bg-stone-50/60 dark:bg-zinc-800/40 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowStructured((p) => !p)}
              className="w-full px-3 py-2 flex items-center justify-between text-xs font-semibold text-stone-700 dark:text-zinc-300 hover:bg-stone-100/70 dark:hover:bg-zinc-800 cursor-pointer"
            >
              <span>Запропонувати конкретні значення полів (необов&apos;язково)</span>
              {showStructured ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {showStructured && (
              <div className="p-3 pt-1 border-t border-stone-200/80 dark:border-zinc-700/80 grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                <div>
                  <label className="block text-[10.5px] font-semibold text-stone-500 dark:text-zinc-400 mb-1">
                    Дата / рік народження
                  </label>
                  <input
                    type="text"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    placeholder={person.birthDate || person.birthYear || 'напр. 14.03.1924'}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-stone-900 dark:text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-[10.5px] font-semibold text-stone-500 dark:text-zinc-400 mb-1">
                    Дата / рік смерті
                  </label>
                  <input
                    type="text"
                    value={deathDate}
                    onChange={(e) => setDeathDate(e.target.value)}
                    placeholder={person.deathDate || person.deathYear || 'напр. 1998'}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-stone-900 dark:text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-[10.5px] font-semibold text-stone-500 dark:text-zinc-400 mb-1">
                    Місце народження
                  </label>
                  <input
                    type="text"
                    value={birthPlace}
                    onChange={(e) => setBirthPlace(e.target.value)}
                    placeholder={person.birthPlace || 'с. / м.'}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-stone-900 dark:text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-[10.5px] font-semibold text-stone-500 dark:text-zinc-400 mb-1">
                    Місце проживання
                  </label>
                  <input
                    type="text"
                    value={residencePlace}
                    onChange={(e) => setResidencePlace(e.target.value)}
                    placeholder={person.residencePlace || 'с. / м.'}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-stone-900 dark:text-zinc-100"
                  />
                </div>
                {person.gender === 'female' && (
                  <div>
                    <label className="block text-[10.5px] font-semibold text-stone-500 dark:text-zinc-400 mb-1">
                      Дівоче прізвище
                    </label>
                    <input
                      type="text"
                      value={maidenName}
                      onChange={(e) => setMaidenName(e.target.value)}
                      placeholder={person.maidenName || 'Дівоче прізвище'}
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-stone-900 dark:text-zinc-100"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-[10.5px] font-semibold text-stone-500 dark:text-zinc-400 mb-1">
                    Професія / заняття
                  </label>
                  <input
                    type="text"
                    value={profession}
                    onChange={(e) => setProfession(e.target.value)}
                    placeholder={person.profession || 'напр. коваль, вчителька'}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-stone-900 dark:text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-[10.5px] font-semibold text-stone-500 dark:text-zinc-400 mb-1">
                    Прізвисько / вуличне ім&apos;я
                  </label>
                  <input
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder={person.nickname || 'напр. Богданчик'}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-stone-900 dark:text-zinc-100"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Author name */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 dark:text-zinc-300 mb-1">
              Ваше ім&apos;я (хто пропонує)
            </label>
            <input
              type="text"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              placeholder="Напр.: Олена (онука)"
              className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 dark:border-zinc-700 bg-stone-50/80 dark:bg-zinc-800/80 text-stone-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="p-2.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/60 text-[11px] text-amber-900 dark:text-amber-200 leading-relaxed">
            Уточнення надійде адміністратору дерева й підсвітить картку сигналом сповіщення, поки не буде переглянуте.
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
              className="px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 rounded-xl shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Send size={13} />
              <span>{isSubmitting ? 'Надсилання...' : 'Надіслати пропозицію'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
