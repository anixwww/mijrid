import React, { useState } from 'react';
import { Person } from '../../types/tree';
import { CARD_FRAME_PRESETS } from '../../constants/cardFrames';
import { CardFrameOverlay } from '../CardFrameOverlay';
import { SilhouetteAvatar } from '../SilhouetteAvatar';
import { getCardDates } from '../../utils/dateUtils';
import { formatCardId } from '../../utils/cardIdUtils';
import { handleUploadImageError } from '../../utils/mediaSync';
import {
  CARD_COLOR_PRESETS,
  EditPersonDraft,
  LiveCardWarning,
  computeCompleteness,
} from './types';
import {
  Upload,
  CheckCircle2,
  Pin,
  AlertCircle,
  AlertTriangle,
  ExternalLink,
  Copy,
  Check,
  Trash2,
  Home,
  ArrowUpRight,
  StickyNote,
} from 'lucide-react';

interface PersonSummaryRailProps {
  personId: string;
  previewPerson: Person;
  draft: EditPersonDraft;
  warnings: LiveCardWarning[];
  isUploadingAvatar: boolean;
  onUpdateField: <K extends keyof EditPersonDraft>(key: K, value: EditPersonDraft[K]) => void;
  onUploadAvatarFile: (file: File) => void;
}

export const PersonSummaryRail: React.FC<PersonSummaryRailProps> = ({
  personId,
  previewPerson,
  draft,
  warnings,
  isUploadingAvatar,
  onUpdateField,
  onUploadAvatarFile,
}) => {
  const [isDraggingPhoto, setIsDraggingPhoto] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  const datesInfo = getCardDates(previewPerson);
  const completeness = computeCompleteness(draft);
  const fullName =
    [draft.firstName, draft.lastName].filter(Boolean).join(' ').trim() || 'Нова особа';

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadAvatarFile(file);
    }
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingPhoto(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      onUploadAvatarFile(file);
    }
  };

  const cardIdLabel = formatCardId(previewPerson);

  const handleCopyId = () => {
    navigator.clipboard?.writeText(cardIdLabel).then(() => {
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 1600);
    }).catch(() => {});
  };

  return (
    <aside className="hidden md:flex md:w-[272px] shrink-0 flex-col justify-between bg-[#f6f7f5] dark:bg-zinc-900/70 border-r border-stone-200/90 dark:border-zinc-800 p-4 overflow-y-auto">
      <div className="space-y-4">
        {/* Live Mini-Card Preview */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-stone-500 dark:text-zinc-400">
              Перегляд на полотні
            </span>
            {draft.isFullyVerified && (
              <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 size={11} />
                Перевірено
              </span>
            )}
          </div>

          {draft.isGhost && !draft.isBlankScreenshot ? (
            <div
              style={{
                background: `linear-gradient(155deg, #fef9c3 0%, ${
                  draft.cardBgColor && draft.cardBgColor !== '#f1f5f9' && draft.cardBgColor !== '#e8efe9'
                    ? draft.cardBgColor
                    : '#fef08a'
                } 100%)`,
                borderColor: '#eab308',
                clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 16px), calc(100% - 16px) 100%, 0 100%)',
              }}
              className="relative rounded-sm border p-3.5 pt-4 min-h-[155px] flex flex-col justify-between shadow-md text-stone-900"
            >
              {/* Washi tape */}
              <div
                className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-12 h-3 rounded-xs pointer-events-none"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.65)',
                  border: '1px solid rgba(0,0,0,0.08)',
                  transform: 'rotate(-1.5deg)',
                }}
              />
              <div className="space-y-1.5 text-left">
                {(() => {
                  const rawT = fullName;
                  const noteStr = draft.ghostNote.trim();
                  const showT =
                    rawT &&
                    rawT !== 'Нотатка' &&
                    rawT !== 'Примарна нотатка' &&
                    rawT !== 'Невідома особа' &&
                    rawT !== 'Нова особа';
                  return (
                    <>
                      {(showT || !noteStr) && (
                        <div className="text-xs font-bold text-stone-900 leading-snug break-words">
                          {showT ? rawT : 'Нотатка'}
                        </div>
                      )}
                      {noteStr ? (
                        <div className="text-[11.5px] leading-relaxed text-stone-800 whitespace-pre-wrap break-words line-clamp-5">
                          {noteStr}
                        </div>
                      ) : (
                        <div className="text-[11px] italic text-stone-600">
                          Введіть текст нотатки...
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              {(datesInfo.displayLine1 || datesInfo.displayLine2) && (
                <div className="mt-2 pt-1.5 border-t border-black/10 text-[10px] font-mono text-stone-700">
                  {datesInfo.displayLine1 || datesInfo.displayLine2}
                </div>
              )}

              {/* Dog-ear fold */}
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                className="absolute bottom-0 right-0 pointer-events-none"
              >
                <polygon points="0,16 0,0 16,0" fill="#facc15" opacity="0.88" />
              </svg>
            </div>
          ) : (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingPhoto(true);
            }}
            onDragLeave={() => setIsDraggingPhoto(false)}
            onDrop={handleDrop}
            style={{ backgroundColor: draft.isBlankScreenshot && draft.screenshotUrl ? '#18181b' : (draft.cardBgColor || '#e8efe9') }}
            className={`relative rounded-xl transition-all shadow-xs ${
              draft.isBlankScreenshot && draft.screenshotUrl ? 'p-0 min-h-[175px]' : 'p-3.5'
            } ${
              draft.isBlankScreenshot && !draft.screenshotUrl ? 'border-2 border-dashed' : 'border'
            } ${
              isDraggingPhoto
                ? 'border-emerald-600 ring-2 ring-emerald-500/30'
                : draft.isBlankScreenshot && !draft.screenshotUrl
                ? 'border-slate-400 dark:border-zinc-500 opacity-90'
                : 'border-stone-300/80 dark:border-zinc-700'
            }`}
          >
            {!draft.isBlankScreenshot && draft.cardFrame !== 'none' && (
              <CardFrameOverlay frame={draft.cardFrame} compact />
            )}
            {draft.isBlankScreenshot && draft.screenshotUrl ? (
              <div className="relative w-full h-[185px] rounded-xl overflow-hidden">
                <img
                  src={draft.screenshotUrl}
                  alt={fullName}
                  onError={(e) => handleUploadImageError(e, draft.screenshotUrl)}
                  className={`w-full h-full ${
                    draft.screenshotFit === 'contain' ? 'object-contain' : 'object-cover'
                  }`}
                />
                <span
                  className="absolute top-2 left-2 inline-flex items-center px-1.5 py-0.5 rounded bg-black/60 border border-white/25 text-[10px] font-mono font-bold text-white"
                  title={`ID картки: ${cardIdLabel}`}
                >
                  {cardIdLabel}
                </span>
                <div className="absolute inset-x-2 bottom-2 px-2 py-1 rounded-md bg-black/65 text-white text-[10px] font-medium truncate text-center">
                  {fullName}
                </div>
              </div>
            ) : (
              <>
            <div className="absolute top-2.5 left-2.5 flex items-center gap-1">
              <span
                className="inline-flex items-center px-1.5 py-0.5 rounded bg-white/85 border border-stone-300/80 text-[10px] font-mono font-bold text-stone-700"
                title={`ID картки: ${cardIdLabel}`}
              >
                {cardIdLabel}
              </span>
            </div>

            {/* House Number Badge */}
            {draft.houseNumber.trim() && (
              <div
                className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/90 border border-stone-300/80 text-[10px] font-mono font-bold text-stone-800"
                title="Номер дому народження"
              >
                <Home size={10} className="text-emerald-800" />
                <span>№{draft.houseNumber.trim()}</span>
              </div>
            )}

            <div className="flex flex-col items-center text-center pt-1">
              <div className="relative group mb-2.5">
                <SilhouetteAvatar
                  gender={draft.gender}
                  avatarUrl={draft.avatarUrl}
                  name={fullName}
                  size="lg"
                />
                <label
                  className="absolute inset-0 rounded-xl bg-black/45 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white cursor-pointer transition-opacity"
                  title="Завантажити або змінити світлину"
                >
                  <Upload size={16} />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileInput}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="font-serif-heritage text-base font-bold text-stone-900 leading-tight break-words w-full">
                {fullName}
              </div>

              {draft.patronymic.trim() && (
                <div className="text-[11px] text-stone-700 mt-0.5">
                  {draft.patronymic.trim()}
                </div>
              )}

              {(draft.maidenName.trim() || draft.nickname.trim()) && (
                <div className="text-[11px] text-stone-600 mt-0.5 truncate max-w-full">
                  {[
                    draft.gender === 'female' && draft.maidenName.trim()
                      ? `дівоче ${draft.maidenName.trim()}`
                      : null,
                    draft.nickname.trim() ? `«${draft.nickname.trim()}»` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              )}

              {(datesInfo.displayLine1 || datesInfo.displayLine2) && (
                <div className="mt-2 pt-2 border-t border-black/10 w-full text-[11px] font-mono tabular-nums text-stone-800 space-y-0.5">
                  {datesInfo.displayLine1 && <div>{datesInfo.displayLine1}</div>}
                  {datesInfo.displayLine2 && <div>{datesInfo.displayLine2}</div>}
                </div>
              )}

              {(draft.crossCanvasLinks.length > 0 || draft.targetCanvasId) && (
                <div
                  className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-white px-2 py-0.5 rounded-full shadow-2xs max-w-full truncate"
                  style={{ backgroundColor: draft.crossCanvasLinks[0]?.color || '#047857' }}
                >
                  <ExternalLink size={10} className="shrink-0" />
                  <span className="truncate">
                    {draft.crossCanvasLinks.length > 1
                      ? `${draft.crossCanvasLinks.length} полотна`
                      : draft.crossCanvasLinks[0]?.targetCanvasTitle || draft.targetCanvasTitle || 'Пов’язане полотно'}
                  </span>
                </div>
              )}

              {draft.branchLinks.length > 0 && (
                <div className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-semibold text-white px-2 py-0.5 rounded-full shadow-2xs max-w-full truncate"
                  style={{ backgroundColor: draft.branchLinks[0].color || '#4f46e5' }}
                >
                  <ArrowUpRight size={10} className="shrink-0" />
                  <span className="truncate">
                    {draft.branchLinks.length === 1
                      ? draft.branchLinks[0].label || 'Посилання на картку'
                      : `${draft.branchLinks.length} міжгілк. зв’язки`}
                  </span>
                </div>
              )}
            </div>
              </>
            )}
          </div>
          )}

          {/* Photo controls (hidden for pure sticky notes) */}
          {!(draft.isGhost && !draft.isBlankScreenshot) && (
          <div className="mt-2 flex items-center gap-1.5">
            <label className="flex-1 cursor-pointer inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-stone-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-stone-50 dark:hover:bg-zinc-700/80 text-xs font-medium text-stone-800 dark:text-zinc-200 transition-colors">
              <Upload size={13} className="text-emerald-700 dark:text-emerald-400" />
              <span>
                {isUploadingAvatar
                  ? 'Завантаження...'
                  : draft.avatarUrl
                  ? 'Змінити фото'
                  : 'Додати фото'}
              </span>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileInput}
                disabled={isUploadingAvatar}
                className="hidden"
              />
            </label>

            {draft.avatarUrl && (
              <button
                type="button"
                onClick={() => onUpdateField('avatarUrl', undefined)}
                className="p-1.5 rounded-lg border border-stone-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-stone-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                title="Прибрати світлину"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
          )}
        </div>

        {/* Card Color Swatches */}
        <div className="pt-3 border-t border-stone-200 dark:border-zinc-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-stone-600 dark:text-zinc-300">
              Колір картки роду
            </span>
            <span className="text-[10px] font-mono text-stone-400 dark:text-zinc-500 uppercase">
              {draft.cardBgColor}
            </span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {CARD_COLOR_PRESETS.map((c) => {
              const isActive = draft.cardBgColor.toLowerCase() === c.hex.toLowerCase();
              return (
                <button
                  key={c.hex}
                  type="button"
                  onClick={() => onUpdateField('cardBgColor', c.hex)}
                  style={{ backgroundColor: c.hex }}
                  className={`w-6 h-6 rounded-full border transition-transform hover:scale-110 flex items-center justify-center cursor-pointer ${
                    isActive
                      ? 'ring-2 ring-emerald-700 dark:ring-emerald-400 ring-offset-1 dark:ring-offset-zinc-900 border-emerald-800'
                      : 'border-stone-300 dark:border-zinc-600'
                  }`}
                  title={c.name}
                >
                  {isActive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-900" />}
                </button>
              );
            })}

            <label
              className="w-6 h-6 rounded-full border border-dashed border-stone-400 dark:border-zinc-600 flex items-center justify-center cursor-pointer overflow-hidden bg-white dark:bg-zinc-800 hover:border-emerald-700"
              title="Власний колір"
            >
              <input
                type="color"
                value={draft.cardBgColor}
                onChange={(e) => onUpdateField('cardBgColor', e.target.value)}
                className="w-8 h-8 border-0 p-0 cursor-pointer opacity-90"
              />
            </label>
          </div>

          {!draft.isBlankScreenshot && (
            <div className="mt-3 pt-2.5 border-t border-stone-200/70 dark:border-zinc-800">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-semibold text-stone-600 dark:text-zinc-300">
                  Зовнішня рамка
                </span>
                <span className="text-[10px] text-stone-400 dark:text-zinc-500 truncate max-w-[120px]">
                  {CARD_FRAME_PRESETS.find((f) => f.id === draft.cardFrame)?.name || 'Класична'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {CARD_FRAME_PRESETS.map((preset) => {
                  const active = draft.cardFrame === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => onUpdateField('cardFrame', preset.id)}
                      className={`px-2 py-1 rounded-lg border text-[10.5px] font-medium text-left truncate transition-colors cursor-pointer ${
                        active
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-600 dark:border-emerald-500 text-emerald-900 dark:text-emerald-200'
                          : 'bg-white dark:bg-zinc-800 border-stone-200 dark:border-zinc-700 text-stone-700 dark:text-zinc-300 hover:border-stone-400'
                      }`}
                      title={preset.subtitle}
                    >
                      {preset.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Verification & Timeline Pin Toggles */}
        <div className="pt-3 border-t border-stone-200 dark:border-zinc-800 space-y-2">
          <label className="flex items-start gap-2.5 cursor-pointer group">
            <input
              type="checkbox"
              checked={draft.isFullyVerified}
              onChange={(e) => onUpdateField('isFullyVerified', e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-stone-300 text-emerald-700 focus:ring-emerald-600 accent-emerald-700 cursor-pointer"
            />
            <div className="min-w-0">
              <div className="text-xs font-medium text-stone-800 dark:text-zinc-200 flex items-center gap-1">
                <CheckCircle2 size={12} className="text-emerald-700 dark:text-emerald-400 shrink-0" />
                <span>Перевірена картка</span>
              </div>
              <p className="text-[10.5px] text-stone-500 dark:text-zinc-400 leading-snug">
                Дані підтверджено метриками
              </p>
            </div>
          </label>

          <label className="flex items-start gap-2.5 cursor-pointer group">
            <input
              type="checkbox"
              checked={draft.isChronologicallyPinned}
              onChange={(e) => onUpdateField('isChronologicallyPinned', e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-stone-300 text-emerald-700 focus:ring-emerald-600 accent-emerald-700 cursor-pointer"
            />
            <div className="min-w-0">
              <div className="text-xs font-medium text-stone-800 dark:text-zinc-200 flex items-center gap-1">
                <Pin size={12} className="text-stone-600 dark:text-zinc-400 shrink-0" />
                <span>Шкала часу</span>
              </div>
              <p className="text-[10.5px] text-stone-500 dark:text-zinc-400 leading-snug">
                Вирівняти вертикально за роком
              </p>
            </div>
          </label>

          <label className="flex items-start gap-2.5 cursor-pointer group">
            <input
              type="checkbox"
              checked={draft.isGhost}
              onChange={(e) => {
                const checked = e.target.checked;
                onUpdateField('isGhost', checked);
                if (checked && draft.isBlankScreenshot) {
                  onUpdateField('isBlankScreenshot', false);
                }
                if (checked && (!draft.cardBgColor || draft.cardBgColor === '#e8efe9' || draft.cardBgColor === '#f1f5f9')) {
                  onUpdateField('cardBgColor', '#fef3c7');
                }
              }}
              className="mt-0.5 w-4 h-4 rounded border-stone-300 text-amber-600 focus:ring-amber-500 accent-amber-600 cursor-pointer"
            />
            <div className="min-w-0">
              <div className="text-xs font-medium text-stone-800 dark:text-zinc-200 flex items-center gap-1">
                <StickyNote size={12} className="text-amber-600 dark:text-amber-400 shrink-0" />
                <span>Нотатка (стікер)</span>
              </div>
              <p className="text-[10.5px] text-stone-500 dark:text-zinc-400 leading-snug">
                Стікер на полотні з пунктирними зв&apos;язками
              </p>
            </div>
          </label>
        </div>

        {/* Live Logical Warnings */}
        {warnings.length > 0 && (
          <div className="pt-3 border-t border-stone-200 dark:border-zinc-800 space-y-1.5">
            {warnings.map((w) => (
              <div
                key={w.id}
                className={`p-2 rounded-lg border text-[11px] leading-snug flex items-start gap-1.5 ${
                  w.severity === 'error'
                    ? 'bg-rose-50/90 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/60 text-rose-900 dark:text-rose-200'
                    : 'bg-amber-50/90 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200'
                }`}
              >
                {w.severity === 'error' ? (
                  <AlertCircle size={13} className="text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle size={13} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                )}
                <span>{w.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Completeness Footer & Subtle Copyable ID */}
      <div className="pt-4 mt-4 border-t border-stone-200 dark:border-zinc-800 space-y-2">
        <div>
          <div className="flex items-center justify-between text-[11px] text-stone-500 dark:text-zinc-400 mb-1">
            <span>Заповненість картки</span>
            <span className="font-mono tabular-nums font-semibold text-stone-700 dark:text-zinc-300">
              {completeness.percent}%
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-stone-200 dark:bg-zinc-800 overflow-hidden">
            <div
              className="h-full bg-emerald-700 dark:bg-emerald-500 rounded-full transition-all duration-300"
              style={{ width: `${completeness.percent}%` }}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={handleCopyId}
          className="w-full flex items-center justify-between text-[10.5px] font-mono text-stone-500 dark:text-zinc-400 hover:text-stone-700 dark:hover:text-zinc-200 transition-colors cursor-pointer pt-1"
          title={`Скопіювати ID картки (${cardIdLabel})`}
        >
          <span className="truncate">ID картки: <strong className="text-stone-800 dark:text-zinc-200">{cardIdLabel}</strong></span>
          {copiedId ? (
            <Check size={11} className="text-emerald-600 shrink-0" />
          ) : (
            <Copy size={11} className="shrink-0" />
          )}
        </button>
      </div>
    </aside>
  );
};
