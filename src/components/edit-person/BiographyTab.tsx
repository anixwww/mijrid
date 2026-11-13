import React, { useState, useEffect } from 'react';
import { Person } from '../../types/tree';
import { EditPersonDraft } from './types';
import { requestAiBiography } from '../../utils/aiBiography';
import { BookOpen, MapPin, Briefcase, UserCheck, Sparkles, Loader2, Check } from 'lucide-react';

interface BiographyTabProps {
  draft: EditPersonDraft;
  previewPerson: Person;
  allPersons: Record<string, Person>;
  onUpdateField: <K extends keyof EditPersonDraft>(key: K, value: EditPersonDraft[K]) => void;
}

const fieldInputClass =
  'w-full min-w-0 text-xs sm:text-[13px] px-3 py-2 rounded-lg border border-stone-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-stone-900 dark:text-zinc-100 placeholder:text-stone-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-600/35 focus:border-emerald-600 dark:focus:border-emerald-500 transition-colors';

export const BiographyTab: React.FC<BiographyTabProps> = ({
  draft,
  previewPerson,
  allPersons,
  onUpdateField,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiDone, setAiDone] = useState(false);

  useEffect(() => {
    setAiError(null);
    setAiDone(false);
  }, [previewPerson.id]);

  const handleGenerateAiBio = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    setAiError(null);
    setAiDone(false);
    try {
      const generated = await requestAiBiography(previewPerson, allPersons);
      onUpdateField('biography', generated);
      setAiDone(true);
    } catch (err) {
      setAiError((err as Error).message || 'Не вдалося створити біографію AI');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-150">
      {/* 01: Biography */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-stone-600 dark:text-zinc-300">
            <BookOpen size={14} className="text-emerald-700 dark:text-emerald-400 shrink-0" />
            <span>01 · Життєпис особи</span>
          </label>
          <button
            type="button"
            onClick={handleGenerateAiBio}
            disabled={isGenerating}
            title="Проаналізувати дати, примітки та факти цієї особи й скласти біографію за допомогою Gemini AI"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-xs transition-all cursor-pointer disabled:opacity-60 disabled:cursor-wait"
          >
            {isGenerating ? (
              <>
                <Loader2 size={13} className="animate-spin shrink-0" />
                <span>Створення…</span>
              </>
            ) : (
              <>
                <Sparkles size={13} className="shrink-0" />
                <span>Створити біографію AI</span>
              </>
            )}
          </button>
        </div>

        {aiError && (
          <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/60 text-xs text-rose-800 dark:text-rose-200">
            {aiError}
          </div>
        )}

        {aiDone && !aiError && (
          <div className="px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 text-[11px] text-emerald-800 dark:text-emerald-200 flex items-center gap-1.5">
            <Check size={12} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>Текст біографії згенеровано на основі дат і приміток. Натисніть «Зберегти», щоб зафіксувати зміни.</span>
          </div>
        )}

        <textarea
          rows={5}
          value={draft.biography}
          onChange={(e) => onUpdateField('biography', e.target.value)}
          placeholder="Довільна біографія особи, історія життя, сімейний шлях..."
          className={`${fieldInputClass} leading-relaxed resize-y`}
        />
      </section>

      {/* 02: Geography & Migration */}
      <section className="pt-5 border-t border-stone-200 dark:border-zinc-800 space-y-3">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-stone-600 dark:text-zinc-300">
          <MapPin size={14} className="text-emerald-700 dark:text-emerald-400 shrink-0" />
          <span>02 · Географія та місця</span>
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div className="min-w-0">
            <label className="block text-[11px] font-medium text-stone-600 dark:text-zinc-400 mb-1">
              Місце народження
            </label>
            <input
              type="text"
              value={draft.birthPlace}
              onChange={(e) => onUpdateField('birthPlace', e.target.value)}
              placeholder="напр. с. Великі Дідушичі"
              className={fieldInputClass}
            />
          </div>
          <div className="min-w-0">
            <label className="block text-[11px] font-medium text-stone-600 dark:text-zinc-400 mb-1">
              Місце проживання / адреса
            </label>
            <input
              type="text"
              value={draft.residencePlace}
              onChange={(e) => onUpdateField('residencePlace', e.target.value)}
              placeholder="напр. м. Стрий, вул. Франка"
              className={fieldInputClass}
            />
          </div>
          <div className="sm:col-span-2 min-w-0">
            <label className="block text-[11px] font-medium text-stone-600 dark:text-zinc-400 mb-1">
              Переїзди, міграція та еміграція
            </label>
            <input
              type="text"
              value={draft.migrationNotes}
              onChange={(e) => onUpdateField('migrationNotes', e.target.value)}
              placeholder="напр. Переїзд до Львова у 1938 р., еміграція до Канади (1948 р.)"
              className={fieldInputClass}
            />
          </div>
          {draft.isDeceased && (
            <>
              <div className="min-w-0">
                <label className="block text-[11px] font-medium text-stone-600 dark:text-zinc-400 mb-1">
                  Місце смерті
                </label>
                <input
                  type="text"
                  value={draft.deathPlace}
                  onChange={(e) => onUpdateField('deathPlace', e.target.value)}
                  placeholder="напр. м. Мюнхен"
                  className={fieldInputClass}
                />
              </div>
              <div className="min-w-0">
                <label className="block text-[11px] font-medium text-stone-600 dark:text-zinc-400 mb-1">
                  Місце поховання / цвинтар
                </label>
                <input
                  type="text"
                  value={draft.burialPlace}
                  onChange={(e) => onUpdateField('burialPlace', e.target.value)}
                  placeholder="напр. Личаківський цвинтар, поле 12"
                  className={fieldInputClass}
                />
              </div>
            </>
          )}
        </div>
      </section>

      {/* 03: Education & Profession */}
      <section className="pt-5 border-t border-stone-200 dark:border-zinc-800 space-y-3">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-stone-600 dark:text-zinc-300">
          <Briefcase size={14} className="text-emerald-700 dark:text-emerald-400 shrink-0" />
          <span>03 · Навчання й професія</span>
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div className="sm:col-span-2 min-w-0">
            <label className="block text-[11px] font-medium text-stone-600 dark:text-zinc-400 mb-1">
              Освіта та навчальні заклади
            </label>
            <input
              type="text"
              value={draft.education}
              onChange={(e) => onUpdateField('education', e.target.value)}
              placeholder="напр. Початкова школа с. Дідушичі, Львівська гімназія №1"
              className={fieldInputClass}
            />
          </div>
          <div className="min-w-0">
            <label className="block text-[11px] font-medium text-stone-600 dark:text-zinc-400 mb-1">
              Професія / Рід занять / Посада
            </label>
            <input
              type="text"
              value={draft.profession}
              onChange={(e) => onUpdateField('profession', e.target.value)}
              placeholder="напр. Господар, тесляр, вчитель"
              className={fieldInputClass}
            />
          </div>
          <div className="min-w-0">
            <label className="block text-[11px] font-medium text-stone-600 dark:text-zinc-400 mb-1">
              Місце роботи, служба, ремесло
            </label>
            <input
              type="text"
              value={draft.workplaceNotes}
              onChange={(e) => onUpdateField('workplaceNotes', e.target.value)}
              placeholder="напр. Залізниця, служба в армії (1941–1945)"
              className={fieldInputClass}
            />
          </div>
        </div>
      </section>

      {/* 04: Midwife / Godparents / Cause of death */}
      <section className="pt-5 border-t border-stone-200 dark:border-zinc-800 space-y-3">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-stone-600 dark:text-zinc-300">
          <UserCheck size={14} className="text-emerald-700 dark:text-emerald-400 shrink-0" />
          <span>04 · Повитуха, хресні та куми</span>
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div className="min-w-0">
            <label className="block text-[11px] font-medium text-stone-600 dark:text-zinc-400 mb-1">
              Повитуха / Баба-повитуха
            </label>
            <input
              type="text"
              value={draft.midwife}
              onChange={(e) => onUpdateField('midwife', e.target.value)}
              placeholder="напр. баба Гафія Ковалиха"
              className={fieldInputClass}
            />
          </div>
          <div className="min-w-0">
            <label className="block text-[11px] font-medium text-stone-600 dark:text-zinc-400 mb-1">
              Хресні батьки та куми
            </label>
            <input
              type="text"
              value={draft.godparents}
              onChange={(e) => onUpdateField('godparents', e.target.value)}
              placeholder="напр. Іван Коваль, Маріяна Слив'як"
              className={fieldInputClass}
            />
          </div>
          {draft.isDeceased && (
            <div className="sm:col-span-2 min-w-0">
              <label className="block text-[11px] font-medium text-stone-600 dark:text-zinc-400 mb-1">
                Причина смерті
              </label>
              <input
                type="text"
                value={draft.deathCause}
                onChange={(e) => onUpdateField('deathCause', e.target.value)}
                placeholder="напр. Природна старість, хвороба..."
                className={fieldInputClass}
              />
            </div>
          )}
        </div>
      </section>

      {/* 05: Interesting Stories */}
      <section className="pt-5 border-t border-stone-200 dark:border-zinc-800 space-y-2">
        <label className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-stone-600 dark:text-zinc-300">
          <Sparkles size={14} className="text-amber-600 dark:text-amber-400 shrink-0" />
          <span>05 · Цікаві історії та родинні перекази</span>
        </label>
        <textarea
          rows={4}
          value={draft.interestingStories}
          onChange={(e) => onUpdateField('interestingStories', e.target.value)}
          placeholder="Цікаві історії з життя, курйозні випадки, родинні перекази, легенди та пам'ятні спогади..."
          className={`${fieldInputClass} leading-relaxed resize-y`}
        />
      </section>
    </div>
  );
};
