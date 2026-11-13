import React, { useState } from 'react';
import { Person, ReactionEmoji } from '../types/tree';
import { CARD_WIDTH } from '../utils/treeLayout';
import { SilhouetteAvatar } from './SilhouetteAvatar';
import { getCardDates } from '../utils/dateUtils';
import { formatCardId } from '../utils/cardIdUtils';
import { ClanInfo } from '../utils/lineageUtils';
import { getPersonCrossCanvasLinks } from '../utils/crossCanvasLinks';
import { CardFrameOverlay } from './CardFrameOverlay';
import { handleUploadImageError } from '../utils/mediaSync';
import { getPrimaryMetricExternalLink } from '../utils/metricLinks';
import { Pin, Link2, Check, Home, Camera, ExternalLink, ArrowUpRight, Ghost, StickyNote, UserPlus, MessageSquareDot, ImagePlus, ZoomIn, Image as ImageIcon } from 'lucide-react';

function normalizeHex(hex: string): string | null {
  let c = hex.replace('#', '').trim();
  if (c.length === 3) {
    c = c
      .split('')
      .map((ch) => ch + ch)
      .join('');
  }
  if (!/^[0-9a-fA-F]{6}$/.test(c)) return null;
  return `#${c.toLowerCase()}`;
}

function deriveAccentHex(hex: string): string {
  const norm = normalizeHex(hex);
  if (!norm) return '#52525b';
  const r = parseInt(norm.slice(1, 3), 16);
  const g = parseInt(norm.slice(3, 5), 16);
  const b = parseInt(norm.slice(5, 7), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (lum > 0.62) {
    const darkR = Math.max(0, Math.round(r * 0.52));
    const darkG = Math.max(0, Math.round(g * 0.52));
    const darkB = Math.max(0, Math.round(b * 0.52));
    return `#${darkR.toString(16).padStart(2, '0')}${darkG.toString(16).padStart(2, '0')}${darkB.toString(16).padStart(2, '0')}`;
  }
  return norm;
}

export interface PersonCardSurfaceProps {
  person: Person;
  isSelected: boolean;
  isGroupSelected?: boolean;
  isDimmed?: boolean;
  isConnectingSource?: boolean;
  isConnectingTarget?: boolean;
  isLineageActive?: boolean;
  isSimplified?: boolean;
  isCurrentUser?: boolean;
  isAdmin?: boolean;
  clanInfo?: ClanInfo;
  overrideBorderColor?: string;
  crossCanvasSide?: 'left' | 'right';
  connectingTargetSide?: 'left' | 'right';
  groupCheckSide?: 'left' | 'right';
  reactionsMaxWidthClass?: string;
  guestUserId?: string;
  widthPx?: number;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: (e: React.MouseEvent) => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onHoverPerson?: (personId: string | null) => void;
  onToggleFullyVerified?: (personId: string) => void;
  onHighlightHouse?: (houseNumber: string) => void;
  onToggleChronologicalPin?: (personId: string) => void;
  onOpenClanCoatOfArmsModal?: (clan: ClanInfo) => void;
  onOpenMetricModal?: (person: Person, tab?: 'birth' | 'death') => void;
  onToggleReaction?: (personId: string, emoji: ReactionEmoji) => void;
  onSelectTree?: (treeId: string, targetPersonId?: string, sourcePersonId?: string) => void;
  allPersons?: Record<string, Person>;
  onJumpToBranchLink?: (targetPersonId: string, sourcePersonId: string) => void;
  onHoverBranchLink?: (link: { sourceId: string; targetId: string } | null) => void;
  isBranchLinkHighlighted?: boolean;
  isBlindSpotHighlighted?: boolean;
  onOpenPersonSuggestions?: (personId: string) => void;
  onUploadBlankScreenshot?: (personId: string, file: File) => void;
  onOpenBlankScreenshotLightbox?: (person: Person) => void;
}

const PersonCardSurfaceComponent: React.FC<PersonCardSurfaceProps> = ({
  person,
  isSelected,
  isGroupSelected,
  isDimmed,
  isConnectingSource,
  isConnectingTarget,
  isLineageActive,
  isSimplified = false,
  isCurrentUser,
  isAdmin = true,
  clanInfo,
  overrideBorderColor,
  crossCanvasSide = 'right',
  connectingTargetSide = 'right',
  groupCheckSide = 'left',
  reactionsMaxWidthClass = 'max-w-[130px]',
  guestUserId,
  widthPx,
  onClick,
  onDoubleClick,
  onMouseDown,
  onHoverPerson,
  onToggleFullyVerified,
  onHighlightHouse,
  onToggleChronologicalPin,
  onOpenClanCoatOfArmsModal,
  onOpenMetricModal,
  onToggleReaction,
  onSelectTree,
  allPersons,
  onJumpToBranchLink,
  onHoverBranchLink,
  isBranchLinkHighlighted,
  isBlindSpotHighlighted,
  onOpenPersonSuggestions,
  onUploadBlankScreenshot,
  onOpenBlankScreenshotLightbox,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [showBranchMenu, setShowBranchMenu] = useState(false);
  const [showCrossCanvasMenu, setShowCrossCanvasMenu] = useState(false);
  const [isDroppingScreenshot, setIsDroppingScreenshot] = useState(false);

  const crossCanvasLinks = getPersonCrossCanvasLinks(person);

  const fullName = [person.firstName, person.lastName].filter(Boolean).join(' ') || '?';
  const datesInfo = getCardDates(person);
  const isBlankScreenshot = Boolean(person.isBlankScreenshot);
  const isGhost = Boolean(person.isGhost && !isBlankScreenshot);
  const isProposal = Boolean(person.isProposal && !isGhost && !isBlankScreenshot);
  const pendingSuggestionsCount = (person.guestSuggestions || []).filter(
    (s) => s.status === 'pending'
  ).length;
  const ghostNoteText = (person.ghostNote || person.notes || '').trim();

  const rawBg =
    person.cardBgColor?.trim() ||
    (isGhost ? '#f1f5f9' : isProposal ? '#e0f2fe' : clanInfo ? clanInfo.bgColor : '#f4f4f5');
  const normalizedBg = normalizeHex(rawBg) || '#f4f4f5';
  const isNeutralBg =
    normalizedBg === '#ffffff' ||
    normalizedBg === '#f4f4f5' ||
    normalizedBg === '#fafaf9' ||
    normalizedBg === '#e8efe9';

  const clanBorderColor = isProposal ? '#0284c7' : clanInfo ? clanInfo.borderColor : '#e4e4e7';
  const clanAccentColor = isProposal
    ? '#0284c7'
    : person.cardBgColor?.trim()
    ? deriveAccentHex(normalizedBg)
    : clanInfo
    ? clanInfo.color
    : '#71717a';

  const defaultBorder = overrideBorderColor || (isProposal ? '#0284c7' : isNeutralBg ? undefined : clanBorderColor);
  const topStripeColor = isProposal ? '#0284c7' : isNeutralBg && !clanInfo ? '#a1a1aa' : clanAccentColor;

  const cardBgGradient =
    normalizedBg === '#ffffff'
      ? 'linear-gradient(180deg, color-mix(in srgb, #f5f5f4 var(--card-mid-mix), var(--card-bg-base)) 0%, var(--card-bg-base) 60%)'
      : `linear-gradient(180deg, color-mix(in srgb, ${normalizedBg} var(--card-tint-mix), var(--card-bg-base)) 0%, color-mix(in srgb, ${normalizedBg} var(--card-mid-mix), var(--card-bg-base)) 48%, var(--card-bg-base) 92%)`;

  const birthMetricUrls = new Set<string>();
  if (person.birthMetricUrl) birthMetricUrls.add(person.birthMetricUrl);
  person.metricDocuments?.forEach((d) => {
    if (d.type === 'birth' && d.url) birthMetricUrls.add(d.url);
  });
  const birthMetricCount = birthMetricUrls.size;
  const hasBirthMetric = birthMetricCount > 0;
  const birthExternalLink = getPrimaryMetricExternalLink(person, 'birth');

  const deathMetricUrls = new Set<string>();
  if (person.deathMetricUrl) deathMetricUrls.add(person.deathMetricUrl);
  person.metricDocuments?.forEach((d) => {
    if (d.type === 'death' && d.url) deathMetricUrls.add(d.url);
  });
  const deathMetricCount = deathMetricUrls.size;
  const hasDeathMetric = deathMetricCount > 0;
  const deathExternalLink = getPrimaryMetricExternalLink(person, 'death');

  const canInteractBirthMetric = Boolean(birthExternalLink || (onOpenMetricModal && (isAdmin || hasBirthMetric)));
  const canInteractDeathMetric = Boolean(deathExternalLink || (onOpenMetricModal && (isAdmin || hasDeathMetric)));
  const canInteractAnyMetric = Boolean(
    birthExternalLink || deathExternalLink || (onOpenMetricModal && (isAdmin || hasBirthMetric || hasDeathMetric))
  );

  const birthDisplay = datesInfo.displayLine1;
  const deathDisplay = datesInfo.displayLine2;

  return (
    <div
      data-card-surface="true"
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onMouseDown={onMouseDown}
      onMouseEnter={() => {
        setIsHovered(true);
        if (onHoverPerson) onHoverPerson(person.id);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
        setShowBranchMenu(false);
        setShowCrossCanvasMenu(false);
        setIsDroppingScreenshot(false);
        if (onHoverPerson) onHoverPerson(null);
        if (onHoverBranchLink) onHoverBranchLink(null);
      }}
      onDragOver={
        isAdmin && isBlankScreenshot && onUploadBlankScreenshot
          ? (e) => {
              if (e.dataTransfer.types.includes('Files')) {
                e.preventDefault();
                e.stopPropagation();
                setIsDroppingScreenshot(true);
              }
            }
          : undefined
      }
      onDragLeave={
        isAdmin && isBlankScreenshot && onUploadBlankScreenshot
          ? () => setIsDroppingScreenshot(false)
          : undefined
      }
      onDrop={
        isAdmin && isBlankScreenshot && onUploadBlankScreenshot
          ? (e) => {
              const file = e.dataTransfer.files?.[0];
              if (file && file.type.startsWith('image/')) {
                e.preventDefault();
                e.stopPropagation();
                setIsDroppingScreenshot(false);
                onUploadBlankScreenshot(person.id, file);
              } else {
                setIsDroppingScreenshot(false);
              }
            }
          : undefined
      }
      style={{
        width: widthPx ? `${widthPx}px` : `${CARD_WIDTH}px`,
        backgroundColor: isBlankScreenshot && person.screenshotUrl ? '#18181b' : 'var(--card-bg-base)',
        borderColor:
          isSelected || isGroupSelected || isConnectingSource || isConnectingTarget || isBranchLinkHighlighted || isDroppingScreenshot
            ? undefined
            : isHovered
            ? clanAccentColor
            : defaultBorder,
      }}
      className={`h-full cursor-pointer relative rounded-2xl transition-[transform,box-shadow,border-color,opacity] duration-150 ease-out flex flex-col items-center justify-between ${
        isBlankScreenshot ? 'p-0' : 'p-1.5'
      } ${
        isDroppingScreenshot
          ? 'border-2 border-dashed border-amber-500 ring-4 ring-amber-400/40'
          : isBlankScreenshot && !person.screenshotUrl
          ? 'border-2 border-dashed border-stone-400/90 dark:border-zinc-500 shadow-[0_2px_10px_rgba(71,85,105,0.08)]'
          : isBlankScreenshot
          ? 'border border-stone-300/90 dark:border-zinc-700 shadow-[0_4px_14px_rgba(24,24,27,0.12)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.55)]'
          : isGhost
          ? 'border-2 border-dashed border-slate-400/95 dark:border-zinc-500 shadow-[0_2px_10px_rgba(71,85,105,0.08)]'
          : isProposal
          ? 'border-2 border-sky-500/95 dark:border-sky-400 shadow-[0_4px_16px_rgba(2,132,199,0.16)]'
          : 'border border-stone-200/90 dark:border-zinc-700/80 shadow-[0_2px_10px_rgba(24,24,27,0.05),0_1px_2px_rgba(24,24,27,0.04)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.45)]'
      } hover:shadow-[0_10px_24px_-6px_rgba(24,24,27,0.12),0_2px_6px_rgba(24,24,27,0.04)] dark:hover:shadow-[0_12px_28px_rgba(0,0,0,0.65)] hover:-translate-y-0.5 ${
        isConnectingSource
          ? 'border-stone-800 dark:border-emerald-400 ring-4 ring-stone-500/40 dark:ring-emerald-400/40 shadow-xl scale-105 z-40 animate-pulse'
          : isConnectingTarget
          ? 'border-amber-600 dark:border-amber-400 ring-4 ring-amber-500/50 shadow-xl scale-105 z-40'
          : isBranchLinkHighlighted
          ? 'border-indigo-600 dark:border-indigo-400 ring-3 ring-indigo-500/60 shadow-[0_0_24px_rgba(79,70,229,0.4)] scale-[1.03] z-35'
          : isBlindSpotHighlighted
          ? 'border-amber-500 dark:border-amber-400 ring-3 ring-amber-500/75 shadow-[0_0_20px_rgba(245,158,11,0.35)] z-30'
          : isSelected
          ? 'border-stone-900 dark:border-emerald-400 ring-2 ring-stone-900 dark:ring-emerald-400 shadow-[0_10px_28px_rgba(24,24,27,0.16)] scale-[1.02] z-30'
          : isGroupSelected
          ? 'border-stone-700 dark:border-emerald-500/80 ring-2 ring-stone-500/80 dark:ring-emerald-500/60 shadow-md scale-[1.01] z-25'
          : isLineageActive
          ? 'ring-2 ring-stone-400/80 dark:ring-zinc-400/70 shadow-md z-20'
          : 'z-10'
      } ${isDimmed ? 'opacity-20 saturate-50' : isGhost ? 'opacity-[0.86] hover:opacity-100' : 'opacity-100'}`}
    >
      {/* Clipped Modern Surface Layer: Soft tinted header wash + crisp top accent bar */}
      {!isBlankScreenshot && (
        <div
          className="absolute inset-0 rounded-[15px] overflow-hidden pointer-events-none"
          style={{ background: cardBgGradient }}
        >
          <div
            className="w-full h-[3px]"
            style={{ backgroundColor: topStripeColor, opacity: isNeutralBg && !clanInfo ? 0.55 : 0.85 }}
          />
        </div>
      )}

      {/* Decorative Outer Card Frame Overlay */}
      {!isBlankScreenshot && person.cardFrame && person.cardFrame !== 'none' && (
        <CardFrameOverlay frame={person.cardFrame} isSimplified={isSimplified} />
      )}

      {/* Floating Cross-Canvas Link Badge (links to another canvas/branch & card) */}
      {crossCanvasLinks.length > 0 && !isSimplified && (
        <div
          className={`absolute -top-3 ${
            crossCanvasSide === 'left' ? 'left-1' : 'right-1.5'
          } z-35`}
        >
          {(() => {
            const first = crossCanvasLinks[0];
            const badgeColor = first.color || '#047857';
            const singleTitle = first.label?.trim() || first.targetCanvasTitle || 'Інше полотно';
            const tooltip =
              crossCanvasLinks.length === 1
                ? `Перейти на полотно «${first.targetCanvasTitle || 'Інше полотно'}»${
                    first.targetPersonName ? ` → ${first.targetCardId ? `${first.targetCardId} ` : ''}${first.targetPersonName}` : ''
                  }`
                : `Зв'язки з іншими полотнами (${crossCanvasLinks.length}) — натисніть для вибору`;

            return (
              <>
                <button
                  type="button"
                  onMouseDown={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (crossCanvasLinks.length === 1) {
                      onSelectTree?.(first.targetCanvasId, first.targetPersonId || undefined, person.id);
                    } else {
                      setShowCrossCanvasMenu((prev) => !prev);
                    }
                  }}
                  style={{ backgroundColor: badgeColor }}
                  className="px-2 py-0.5 text-white rounded-full text-[9.5px] font-bold shadow-md flex items-center gap-1 transition-transform hover:scale-105 cursor-pointer border border-white/60"
                  title={tooltip}
                >
                  <ExternalLink size={9.5} className="shrink-0" />
                  <span className="max-w-[92px] truncate">
                    {crossCanvasLinks.length === 1
                      ? singleTitle
                      : `${crossCanvasLinks.length} полотна`}
                  </span>
                  {crossCanvasLinks.length === 1 && first.targetCardId && (
                    <span className="text-[8px] font-mono opacity-90 shrink-0">
                      {first.targetCardId}
                    </span>
                  )}
                </button>

                {showCrossCanvasMenu && crossCanvasLinks.length > 1 && (
                  <div
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    className={`absolute top-6 ${
                      crossCanvasSide === 'left' ? 'left-0' : 'right-0'
                    } w-56 bg-white dark:bg-zinc-900 rounded-xl shadow-xl border border-stone-200 dark:border-zinc-700 p-1 z-50 space-y-0.5 animate-in fade-in zoom-in-95 duration-100`}
                  >
                    <div className="px-2 py-1 text-[9.5px] font-bold uppercase tracking-wider text-stone-400 dark:text-zinc-500">
                      Перейти на інше полотно:
                    </div>
                    {crossCanvasLinks.map((ccl) => (
                      <button
                        key={ccl.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowCrossCanvasMenu(false);
                          onSelectTree?.(ccl.targetCanvasId, ccl.targetPersonId || undefined, person.id);
                        }}
                        className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/50 flex items-center gap-1.5 text-[11px] text-stone-800 dark:text-zinc-100 cursor-pointer"
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: ccl.color || '#047857' }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold truncate flex items-center gap-1">
                            <span className="truncate">{ccl.targetCanvasTitle || 'Полотно'}</span>
                            {ccl.targetCardId && (
                              <span className="text-[9px] font-mono text-emerald-700 dark:text-emerald-300 shrink-0">
                                {ccl.targetCardId}
                              </span>
                            )}
                          </div>
                          {(ccl.targetPersonName || ccl.label) && (
                            <div className="text-[9.5px] text-stone-500 dark:text-zinc-400 truncate">
                              {[ccl.targetPersonName, ccl.label].filter(Boolean).join(' · ')}
                            </div>
                          )}
                        </div>
                        <ExternalLink size={11} className="text-stone-400 shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* Chronological Pin Badge (corner float) */}
      {person.isChronologicallyPinned && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            if (onToggleChronologicalPin) onToggleChronologicalPin(person.id);
          }}
          className="absolute -top-2 -left-1.5 w-5 h-5 rounded-full bg-stone-900 text-stone-100 flex items-center justify-center shadow-xs border-2 border-white z-30 cursor-pointer hover:bg-black transition-transform hover:scale-110"
          title="Прикріплено хронологічно до шкали років. Натисніть, щоб відкріпити"
        >
          <Pin size={10} className="fill-current text-stone-100" />
        </div>
      )}

      {/* Ghost / Note Card Corner Badge */}
      {isGhost && !isSimplified && (
        <div
          className={`absolute -top-2.5 ${
            person.isChronologicallyPinned ? 'left-5' : 'left-1.5'
          } z-30 px-1.5 py-0.5 rounded-full bg-slate-700/95 dark:bg-zinc-700 text-white text-[8.5px] font-bold shadow-sm border border-white/75 dark:border-zinc-500 flex items-center gap-0.5 pointer-events-none`}
          title="Примарна картка (нотатка) — зв'язок із родовим деревом ще не встановлено"
        >
          <Ghost size={9} className="shrink-0" />
          <span>Примара</span>
        </div>
      )}

      {/* Proposal Card Corner Badge (distinct sky-blue review card, NOT a ghost card) */}
      {isProposal && !isSimplified && (
        <div
          className={`absolute -top-2.5 ${
            person.isChronologicallyPinned ? 'left-5' : 'left-1.5'
          } z-35 px-1.5 py-0.5 rounded-full bg-sky-600 text-white text-[8.5px] font-bold shadow-sm border border-white flex items-center gap-1 pointer-events-none`}
          title={`Картка-пропозиція від гостя (${person.proposalMeta?.authorName || 'Гість'}) — очікує затвердження адміністратором`}
        >
          <span className="relative flex h-1.5 w-1.5 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-80" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
          </span>
          <UserPlus size={8.5} className="shrink-0" />
          <span>Пропозиція</span>
        </div>
      )}

      {/* Animated Guest Clarification Signal Badge (Top-Right Corner) */}
      {pendingSuggestionsCount > 0 && (
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            if (onOpenPersonSuggestions) {
              onOpenPersonSuggestions(person.id);
            }
          }}
          className={`absolute -top-2.5 ${
            crossCanvasLinks.length > 0 && crossCanvasSide === 'right'
              ? '-right-2'
              : 'right-1'
          } z-40 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-500 hover:bg-amber-600 text-white text-[8.5px] font-extrabold shadow-md border border-white cursor-pointer transition-transform hover:scale-110`}
          title={`Є нерозглянуті уточнення або спогади від гостей (${pendingSuggestionsCount}) — натисніть для перегляду`}
          aria-label={`Нові уточнення від гостей: ${pendingSuggestionsCount}`}
        >
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-full bg-amber-400 animate-ping opacity-65 pointer-events-none"
          />
          <MessageSquareDot size={9.5} className="relative z-10 shrink-0" />
          {!isSimplified && (
            <span className="relative z-10 leading-none tabular-nums">
              {pendingSuggestionsCount}
            </span>
          )}
        </button>
      )}

      {/* Connecting Target Indicator Badge */}
      {isConnectingTarget && (
        <div
          className={`absolute -top-2 ${
            connectingTargetSide === 'left' ? '-left-2' : '-right-2'
          } bg-stone-900 text-white p-1 rounded-full shadow-md z-30 animate-bounce`}
        >
          <Link2 size={11} />
        </div>
      )}

      {/* Clan Coat of Arms Corner Seal (never overlaps dates text) */}
      {clanInfo?.coatOfArmsUrl && !isSimplified && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            if (onOpenClanCoatOfArmsModal && clanInfo) onOpenClanCoatOfArmsModal(clanInfo);
          }}
          className="absolute -bottom-1.5 -left-1.5 w-5 h-5 rounded-full overflow-hidden border-2 border-white shadow-sm z-30 cursor-pointer hover:scale-125 transition-transform bg-white ring-1 ring-amber-300/80"
          title={`Герб роду ${clanInfo.name}${clanInfo.coatOfArmsMotto ? ` («${clanInfo.coatOfArmsMotto}»)` : ''}`}
        >
          <img
            src={clanInfo.coatOfArmsUrl}
            alt={`Герб роду ${clanInfo.name}`}
            onError={(e) => handleUploadImageError(e, clanInfo.coatOfArmsUrl)}
            className="w-full h-full object-contain"
            loading="lazy"
          />
        </div>
      )}

      {/* Floating Cross-Branch Card Link Badge (Bottom-Right Corner) */}
      {(() => {
        if (isSimplified) return null;
        const validLinks = (person.branchLinks || []).filter(
          (bl) => !allPersons || Boolean(allPersons[bl.targetPersonId])
        );
        if (validLinks.length === 0) return null;

        const firstLink = validLinks[0];
        const firstTarget = allPersons?.[firstLink.targetPersonId];
        const firstTargetName = firstTarget
          ? [firstTarget.firstName, firstTarget.lastName].filter(Boolean).join(' ')
          : 'Картка';
        const pillColor = firstLink.color || '#4f46e5';
        const hasPets = Boolean(person.pets && person.pets.length > 0);
        const pillText =
          validLinks.length === 1
            ? firstLink.label?.trim() || firstTargetName
            : `${validLinks.length} зв.`;

        return (
          <div className="absolute -bottom-2.5 right-1 z-35">
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onMouseEnter={() => {
                onHoverBranchLink?.({ sourceId: person.id, targetId: firstLink.targetPersonId });
              }}
              onMouseLeave={() => {
                onHoverBranchLink?.(null);
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (validLinks.length === 1) {
                  onJumpToBranchLink?.(firstLink.targetPersonId, person.id);
                } else {
                  setShowBranchMenu((prev) => !prev);
                }
              }}
              style={{ backgroundColor: pillColor }}
              className="px-1.5 py-0.5 text-white rounded-full text-[9px] font-bold shadow-md flex items-center gap-0.5 transition-transform hover:scale-105 cursor-pointer border border-white/70"
              title={
                validLinks.length === 1
                  ? `Перейти до картки: ${firstTargetName}${firstLink.label ? ` (${firstLink.label})` : ''}`
                  : `Міжгілкові посилання (${validLinks.length}) — натисніть для вибору`
              }
            >
              <ArrowUpRight size={9.5} className="shrink-0" />
              <span className={`${hasPets ? 'max-w-[44px]' : 'max-w-[74px]'} truncate leading-tight`}>
                {pillText}
              </span>
            </button>

            {showBranchMenu && validLinks.length > 1 && (
              <div
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                className="absolute bottom-6 right-0 w-48 bg-white dark:bg-zinc-900 rounded-xl shadow-xl border border-stone-200 dark:border-zinc-700 p-1 z-50 space-y-0.5 animate-in fade-in zoom-in-95 duration-100"
              >
                <div className="px-2 py-1 text-[9.5px] font-bold uppercase tracking-wider text-stone-400 dark:text-zinc-500">
                  Перейти до картки:
                </div>
                {validLinks.map((bl) => {
                  const tgt = allPersons?.[bl.targetPersonId];
                  const tgtName = tgt
                    ? [tgt.firstName, tgt.lastName].filter(Boolean).join(' ') || 'Без імені'
                    : bl.targetPersonId;
                  return (
                    <button
                      key={bl.id}
                      type="button"
                      onMouseEnter={() => {
                        onHoverBranchLink?.({ sourceId: person.id, targetId: bl.targetPersonId });
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowBranchMenu(false);
                        onJumpToBranchLink?.(bl.targetPersonId, person.id);
                      }}
                      className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/50 flex items-center gap-1.5 text-[11px] text-stone-800 dark:text-zinc-100 cursor-pointer"
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: bl.color || '#4f46e5' }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold truncate">{tgtName}</div>
                        {bl.label && (
                          <div className="text-[9.5px] text-indigo-600 dark:text-indigo-400 truncate">
                            {bl.label}
                          </div>
                        )}
                      </div>
                      <ArrowUpRight size={11} className="text-stone-400 shrink-0" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* FULL-BLEED BLANK / PHOTO CARD MODE */}
      {isBlankScreenshot ? (
        <div className="relative z-10 w-full h-full rounded-[15px] overflow-hidden flex flex-col items-center justify-center">
          {person.screenshotUrl ? (
            <>
              <img
                src={person.screenshotUrl}
                alt={fullName}
                onError={(e) => handleUploadImageError(e, person.screenshotUrl)}
                className={`absolute inset-0 w-full h-full select-none pointer-events-none ${
                  person.screenshotFit === 'contain' ? 'object-contain bg-zinc-900' : 'object-cover'
                }`}
                loading="lazy"
              />
              {!isSimplified && (
                <>
                  {onOpenBlankScreenshotLightbox && (isHovered || isSelected) && (
                    <button
                      type="button"
                      onMouseDown={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenBlankScreenshotLightbox(person);
                      }}
                      className="absolute top-1.5 left-1.5 z-20 w-6 h-6 rounded-lg bg-black/65 hover:bg-black/85 text-white border border-white/25 backdrop-blur-xs flex items-center justify-center transition-transform hover:scale-105 cursor-pointer"
                      title="Збільшити фото для розшифровки"
                      aria-label="Збільшити фото"
                    >
                      <ZoomIn size={12} />
                    </button>
                  )}
                  <span
                    className="absolute top-1.5 right-1.5 z-20 px-1.5 py-0.5 rounded-[5px] bg-black/60 text-white border border-white/25 backdrop-blur-xs text-[8.5px] font-mono font-bold tabular-nums leading-none"
                    title={`ID картки: ${formatCardId(person)}`}
                  >
                    {formatCardId(person)}
                  </span>
                  {(isHovered || isSelected || Boolean(ghostNoteText)) && (
                    <div className="absolute inset-x-1.5 bottom-1.5 z-20 px-1.5 py-1 rounded-lg bg-black/70 backdrop-blur-xs text-white text-[8.5px] font-medium pointer-events-none flex items-center justify-center gap-1">
                      {ghostNoteText && (
                        <StickyNote size={9} className="text-amber-300 shrink-0" />
                      )}
                      <span className="truncate">
                        {person.firstName?.trim() && person.firstName !== 'Нерозшифрований запис'
                          ? person.firstName
                          : ghostNoteText || 'Нерозшифрований запис'}
                      </span>
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            <div className="w-full h-full bg-stone-50/95 dark:bg-zinc-900/90 flex flex-col items-center justify-center text-center p-2 gap-1.5 relative">
              {!isSimplified && (
                <span
                  className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-[5px] bg-stone-900/[0.06] dark:bg-white/[0.08] border border-stone-900/[0.08] dark:border-white/[0.08] text-[8.5px] font-mono font-semibold tabular-nums leading-none text-stone-600 dark:text-zinc-300"
                  title={`ID картки: ${formatCardId(person)}`}
                >
                  {formatCardId(person)}
                </span>
              )}
              <div className="w-8 h-8 rounded-xl bg-amber-500/12 dark:bg-amber-400/15 border border-amber-500/25 flex items-center justify-center text-amber-700 dark:text-amber-300">
                <ImagePlus size={16} />
              </div>
              {!isSimplified && (
                <>
                  <span className="text-[9.5px] font-bold text-stone-700 dark:text-zinc-200 leading-tight px-1 line-clamp-2">
                    {person.firstName?.trim() && person.firstName !== 'Нерозшифрований запис'
                      ? person.firstName
                      : 'Картка-фото'}
                  </span>
                  {ghostNoteText && (
                    <span className="text-[8px] text-stone-500 dark:text-zinc-400 italic line-clamp-1 px-1">
                      {ghostNoteText}
                    </span>
                  )}
                  {isAdmin && onUploadBlankScreenshot ? (
                    <label
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => e.stopPropagation()}
                      className="px-2.5 py-1 rounded-lg bg-stone-900 hover:bg-black dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-[9px] font-semibold cursor-pointer transition-colors shadow-2xs"
                    >
                      + Додати фото
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) onUploadBlankScreenshot(person.id, file);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  ) : (
                    <span className="text-[8px] text-stone-400 dark:text-zinc-500">
                      Немає фото
                    </span>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      ) : isSimplified ? (
        <div className="relative z-10 w-full h-full flex flex-col justify-center items-center text-center px-0.5">
          <p className="text-[10px] font-bold text-stone-900 leading-tight truncate w-full">
            {person.lastName || person.firstName}
          </p>
          <p className="text-[8.5px] font-medium text-stone-600 truncate w-full">
            {person.firstName}
          </p>
          {birthDisplay && (
            <p className="text-[7.5px] tabular-nums text-stone-500 truncate mt-0.5">
              {birthDisplay}
            </p>
          )}
        </div>
      ) : (
        /* FULL MODERN 3-ROW VIEW — ZERO OVERLAPS */
        <div className="relative z-10 w-full h-full flex flex-col items-center justify-between pt-0.5">
          {/* ROW 1: Dedicated Top Utility Strip */}
          <div className="w-full h-[16px] flex items-center justify-between gap-1 shrink-0 px-0.5">
            <div className="flex items-center gap-1 min-w-0">
              {isGroupSelected && !isSelected && groupCheckSide === 'left' ? (
                <div className="w-4 h-4 rounded-full bg-stone-800 text-white flex items-center justify-center text-[8.5px] font-bold shadow-2xs shrink-0">
                  ✓
                </div>
              ) : onToggleFullyVerified ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFullyVerified(person.id);
                  }}
                  className={`w-4 h-4 rounded-full flex items-center justify-center cursor-pointer transition-all active:scale-90 shrink-0 ${
                    person.isFullyVerified
                      ? 'bg-emerald-600/12 text-emerald-700 hover:bg-emerald-600/22 ring-1 ring-emerald-600/25'
                      : 'bg-amber-600/12 text-amber-800 hover:bg-amber-600/22 ring-1 ring-amber-600/25'
                  }`}
                  title={
                    person.isFullyVerified
                      ? "Статус: Перевірена (клацніть, щоб змінити на 'Не перевірена')"
                      : "Статус: Не перевірена (клацніть, щоб змінити на 'Перевірена')"
                  }
                  aria-label={person.isFullyVerified ? 'Статус: Перевірена' : 'Статус: Не перевірена'}
                >
                  {person.isFullyVerified ? (
                    <Check size={9.5} strokeWidth={3} className="text-emerald-700 shrink-0" />
                  ) : (
                    <span className="font-bold text-[9.5px] leading-none text-amber-800 select-none">
                      ?
                    </span>
                  )}
                </button>
              ) : (
                <div
                  className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                    person.isFullyVerified
                      ? 'bg-emerald-600/12 text-emerald-700 ring-1 ring-emerald-600/25'
                      : 'bg-amber-600/12 text-amber-800 ring-1 ring-amber-600/25'
                  }`}
                  title={
                    person.isFullyVerified
                      ? 'Інформацію в картці повністю перевірено й підтверджено'
                      : 'Інформація в картці не перевірена'
                  }
                >
                  {person.isFullyVerified ? (
                    <Check size={9} strokeWidth={2.8} className="text-emerald-700 shrink-0" />
                  ) : (
                    <span className="font-bold text-[9.5px] leading-none text-amber-800 select-none">
                      ?
                    </span>
                  )}
                </div>
              )}

              {isCurrentUser && (
                <span
                  className="px-1.5 py-[1px] rounded-full bg-emerald-700 text-white text-[7.5px] font-bold tracking-wide leading-tight shrink-0 shadow-2xs"
                  title="Це ваша картка у родинному дереві"
                >
                  Це ви
                </span>
              )}

              {person.photoAlbum && person.photoAlbum.length > 0 && (
                <span
                  className="h-[16px] px-1 rounded-[5px] bg-sky-500/12 dark:bg-sky-400/15 border border-sky-500/20 text-sky-800 dark:text-sky-300 inline-flex items-center gap-0.5 text-[8px] font-semibold tabular-nums leading-none shrink-0"
                  title={`Фотографії з життя (${person.photoAlbum.length}) — натисніть на картку для перегляду`}
                >
                  <ImageIcon size={8} className="shrink-0" />
                  <span>{person.photoAlbum.length}</span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {isGroupSelected && !isSelected && groupCheckSide === 'right' && (
                <div className="w-4 h-4 rounded-full bg-stone-800 text-white flex items-center justify-center text-[8.5px] font-bold shadow-2xs shrink-0">
                  ✓
                </div>
              )}
              <span
                className="h-[16px] px-1.5 rounded-[5px] bg-stone-900/[0.045] dark:bg-white/[0.08] border border-stone-900/[0.06] dark:border-white/[0.08] inline-flex items-center text-[8.5px] font-mono font-semibold tabular-nums leading-none text-stone-600 dark:text-zinc-300"
                title={`ID картки: ${formatCardId(person)}`}
              >
                {formatCardId(person)}
              </span>
              {person.houseNumber && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onHighlightHouse) onHighlightHouse(person.houseNumber!);
                  }}
                  className="h-[16px] px-1.5 rounded-[5px] bg-stone-900/[0.055] dark:bg-white/[0.08] hover:bg-stone-900/[0.11] dark:hover:bg-white/[0.15] flex items-center gap-0.5 cursor-pointer transition-colors text-stone-700 dark:text-zinc-200"
                  title={`Номер дому народження: №${person.houseNumber}`}
                >
                  <Home size={8.5} strokeWidth={2.2} className="text-stone-500 dark:text-zinc-400 shrink-0" />
                  <span className="text-[8.5px] font-semibold tabular-nums leading-none tracking-tight text-stone-800 dark:text-zinc-100">
                    №{person.houseNumber}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* ROW 2: Avatar + Typographic Name Stack */}
          <div className="flex-1 min-h-0 w-full flex flex-col items-center justify-center gap-0.5 px-0.5 overflow-hidden">
            <div className="shrink-0 flex items-center justify-center">
              <SilhouetteAvatar
                gender={person.gender}
                avatarUrl={person.avatarUrl}
                name={fullName}
                size="card"
              />
            </div>

            <span
              className="text-[10px] font-medium text-stone-600 leading-[1.15] truncate w-full text-center block tracking-tight"
              title={person.firstName}
            >
              {person.firstName || ''}
            </span>

            <span
              className="text-[12px] font-bold text-stone-950 leading-[1.15] truncate w-full text-center block tracking-[-0.015em]"
              title={person.lastName}
            >
              {person.lastName || '?'}
            </span>

            {person.gender === 'female' && person.maidenName && (
              <span
                className="text-[8.5px] italic text-stone-500 leading-[1.1] truncate w-full text-center block"
                title={`Дівоче: ${person.maidenName}`}
              >
                ({person.maidenName})
              </span>
            )}

            {person.nickname && (
              <span
                className="text-[8.5px] font-serif italic text-amber-900/90 dark:text-amber-300/90 leading-[1.1] truncate w-full text-center block"
                title={`«${person.nickname}»`}
              >
                «{person.nickname}»
              </span>
            )}
          </div>

          {/* ROW 3: Crisp Hairline-Separated Date, Ghost Note, or Metric Strip */}
          <div className="shrink-0 w-full pt-1 border-t border-black/[0.06] dark:border-white/[0.08] flex flex-col items-center justify-center gap-[2px]">
            {isGhost && ghostNoteText ? (
              <div className="w-full flex flex-col items-center gap-0.5">
                {birthDisplay && (
                  <span className="text-[8px] font-mono font-semibold text-slate-600 dark:text-zinc-300 leading-none tabular-nums">
                    {birthDisplay}
                  </span>
                )}
                <div
                  className="w-full px-1.5 py-0.5 rounded bg-white/75 dark:bg-zinc-900/70 border border-dashed border-slate-300 dark:border-zinc-700 text-[8px] italic text-slate-700 dark:text-zinc-300 leading-tight line-clamp-2 text-center"
                  title={ghostNoteText}
                >
                  <StickyNote size={8} className="inline-block mr-0.5 text-amber-600 dark:text-amber-400 align-[-1px]" />
                  {ghostNoteText}
                </div>
              </div>
            ) : !birthDisplay && !deathDisplay ? (
              isGhost ? (
                <div
                  className="text-[8px] px-1.5 py-0.5 rounded bg-slate-500/10 text-slate-600 dark:text-zinc-300 font-medium italic truncate max-w-full"
                  title="Примарна картка — зв'язок ще не встановлено"
                >
                  Зв&apos;язок не встановлено
                </div>
              ) : canInteractAnyMetric ? (
                (birthExternalLink || deathExternalLink) && !isAdmin && birthMetricCount + deathMetricCount === 1 ? (
                  <a
                    href={birthExternalLink || deathExternalLink || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    onMouseDown={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    className="text-[8px] px-1.5 py-0.5 rounded-md transition-colors inline-flex items-center gap-1 cursor-pointer font-medium bg-sky-500/12 dark:bg-sky-400/15 hover:bg-sky-500/20 text-sky-950 dark:text-sky-200"
                    title="Відкрити посилання на метрику (FamilySearch / архів)"
                  >
                    <Link2 size={8.5} className="text-sky-700 dark:text-sky-400 shrink-0" />
                    <span>метрика</span>
                  </a>
                ) : (
                  <button
                    type="button"
                    onMouseDown={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onOpenMetricModal) onOpenMetricModal(person, 'birth');
                    }}
                    className={`text-[8px] px-1.5 py-0.5 rounded-md transition-colors inline-flex items-center gap-1 cursor-pointer font-medium ${
                      hasBirthMetric || hasDeathMetric
                        ? 'bg-amber-500/12 dark:bg-amber-400/15 hover:bg-amber-500/20 text-amber-950 dark:text-amber-200'
                        : 'text-stone-400 dark:text-zinc-500 hover:text-stone-700 dark:hover:text-zinc-300 hover:bg-stone-900/[0.04] dark:hover:bg-white/[0.06]'
                    }`}
                    title={
                      hasBirthMetric || hasDeathMetric
                        ? 'Переглянути посилання або фото з метричної книги'
                        : 'Додати посилання або фото з метричної книги'
                    }
                  >
                    {birthExternalLink || deathExternalLink ? (
                      <Link2 size={8.5} className="text-sky-700 dark:text-sky-400 shrink-0" />
                    ) : (
                      <Camera
                        size={8.5}
                        className={
                          hasBirthMetric || hasDeathMetric
                            ? 'text-amber-700 dark:text-amber-400 shrink-0'
                            : 'text-stone-400 dark:text-zinc-500 shrink-0'
                        }
                      />
                    )}
                    <span>
                      {hasBirthMetric || hasDeathMetric
                        ? `метрика${birthMetricCount + deathMetricCount > 1 ? ` (${birthMetricCount + deathMetricCount})` : ''}`
                        : '+ метрика'}
                    </span>
                  </button>
                )
              ) : null
            ) : (
              <>
                {birthDisplay && (
                  birthExternalLink ? (
                    <a
                      href={birthExternalLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      onMouseDown={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full px-1 py-[1px] rounded-[5px] leading-tight inline-flex items-center justify-center gap-1 transition-colors cursor-pointer tabular-nums bg-sky-500/12 dark:bg-sky-400/15 hover:bg-sky-500/22 text-stone-900 dark:text-zinc-100"
                      title={`Відкрити посилання на запис про народження (${birthExternalLink})`}
                    >
                      <span className="inline-flex items-center gap-0.5 shrink-0">
                        <Link2 size={8.5} className="text-sky-700 dark:text-sky-400" />
                        {birthMetricCount > 1 && (
                          <span className="text-[7px] font-bold text-sky-800 dark:text-sky-300 leading-none">
                            {birthMetricCount}
                          </span>
                        )}
                      </span>
                      {datesInfo.birthFormatted ? (
                        <span className="truncate text-[8.8px] leading-none">
                          <span className="font-semibold text-stone-900 dark:text-zinc-100">
                            {datesInfo.birthFormatted}
                          </span>
                          {datesInfo.ageStr && (
                            <span className="text-[7.8px] font-medium text-stone-500 dark:text-zinc-400 ml-0.5">
                              ({datesInfo.ageStr})
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="truncate text-[8.8px] font-medium leading-none">
                          {birthDisplay}
                        </span>
                      )}
                    </a>
                  ) : canInteractBirthMetric ? (
                    <button
                      type="button"
                      onMouseDown={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onOpenMetricModal) onOpenMetricModal(person, 'birth');
                      }}
                      className={`w-full px-1 py-[1px] rounded-[5px] leading-tight inline-flex items-center justify-center gap-1 transition-colors cursor-pointer tabular-nums ${
                        hasBirthMetric
                          ? 'bg-amber-500/12 dark:bg-amber-400/15 hover:bg-amber-500/20 text-stone-900 dark:text-zinc-100'
                          : 'text-stone-700 dark:text-zinc-300 hover:text-stone-950 dark:hover:text-white hover:bg-stone-900/[0.04] dark:hover:bg-white/[0.06]'
                      }`}
                      title={
                        hasBirthMetric
                          ? `Метрика про народження підтверджена фото (${birthMetricCount} шт.) — натисніть для перегляду: ${birthDisplay}`
                          : `Натисніть, щоб прикріпити посилання або скріншот метрики про народження: ${birthDisplay}`
                      }
                    >
                      {hasBirthMetric && (
                        <span className="inline-flex items-center gap-0.5 shrink-0">
                          <Camera size={8.5} className="text-amber-700 dark:text-amber-400" />
                          {birthMetricCount > 1 && (
                            <span className="text-[7px] font-bold text-amber-800 dark:text-amber-300 leading-none">
                              {birthMetricCount}
                            </span>
                          )}
                        </span>
                      )}
                      {datesInfo.birthFormatted ? (
                        <span className="truncate text-[8.8px] leading-none">
                          <span className="font-semibold text-stone-900 dark:text-zinc-100">
                            {datesInfo.birthFormatted}
                          </span>
                          {datesInfo.ageStr && (
                            <span className="text-[7.8px] font-medium text-stone-500 dark:text-zinc-400 ml-0.5">
                              ({datesInfo.ageStr})
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="truncate text-[8.8px] font-medium leading-none">
                          {birthDisplay}
                        </span>
                      )}
                    </button>
                  ) : (
                    <div className="w-full px-1 py-[1px] leading-tight inline-flex items-center justify-center gap-1 text-stone-700 dark:text-zinc-300 tabular-nums">
                      {datesInfo.birthFormatted ? (
                        <span className="truncate text-[8.8px] leading-none">
                          <span className="font-semibold text-stone-900 dark:text-zinc-100">
                            {datesInfo.birthFormatted}
                          </span>
                          {datesInfo.ageStr && (
                            <span className="text-[7.8px] font-medium text-stone-500 dark:text-zinc-400 ml-0.5">
                              ({datesInfo.ageStr})
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="truncate text-[8.8px] font-medium leading-none">
                          {birthDisplay}
                        </span>
                      )}
                    </div>
                  )
                )}

                {deathDisplay && (
                  deathExternalLink ? (
                    <a
                      href={deathExternalLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      onMouseDown={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full px-1 py-[1px] rounded-[5px] leading-tight inline-flex items-center justify-center gap-1 transition-colors cursor-pointer tabular-nums bg-sky-500/12 dark:bg-sky-400/15 hover:bg-sky-500/22 text-stone-900 dark:text-zinc-100"
                      title={`Відкрити посилання на запис про смерть (${deathExternalLink})`}
                    >
                      <span className="inline-flex items-center gap-0.5 shrink-0">
                        <Link2 size={8.5} className="text-sky-700 dark:text-sky-400" />
                        {deathMetricCount > 1 && (
                          <span className="text-[7px] font-bold text-sky-800 dark:text-sky-300 leading-none">
                            {deathMetricCount}
                          </span>
                        )}
                      </span>
                      <span className="truncate text-[8.5px] font-medium leading-none">
                        {deathDisplay}
                      </span>
                    </a>
                  ) : canInteractDeathMetric ? (
                    <button
                      type="button"
                      onMouseDown={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onOpenMetricModal) onOpenMetricModal(person, 'death');
                      }}
                      className={`w-full px-1 py-[1px] rounded-[5px] leading-tight inline-flex items-center justify-center gap-1 transition-colors cursor-pointer tabular-nums ${
                        hasDeathMetric
                          ? 'bg-amber-500/12 dark:bg-amber-400/15 hover:bg-amber-500/20 text-stone-900 dark:text-zinc-100'
                          : 'text-stone-600 dark:text-zinc-400 hover:text-stone-950 dark:hover:text-white hover:bg-stone-900/[0.04] dark:hover:bg-white/[0.06]'
                      }`}
                      title={
                        hasDeathMetric
                          ? `Метрика про смерть підтверджена фото (${deathMetricCount} шт.) — натисніть для перегляду: ${deathDisplay}`
                          : `Натисніть, щоб прикріпити посилання або скріншот метрики про смерть: ${deathDisplay}`
                      }
                    >
                      {hasDeathMetric && (
                        <span className="inline-flex items-center gap-0.5 shrink-0">
                          <Camera size={8.5} className="text-amber-700 dark:text-amber-400" />
                          {deathMetricCount > 1 && (
                            <span className="text-[7px] font-bold text-amber-800 dark:text-amber-300 leading-none">
                              {deathMetricCount}
                            </span>
                          )}
                        </span>
                      )}
                      <span className="truncate text-[8.5px] font-medium leading-none">
                        {deathDisplay}
                      </span>
                    </button>
                  ) : (
                    <div className="w-full px-1 py-[1px] leading-tight inline-flex items-center justify-center gap-1 text-stone-600 dark:text-zinc-400 tabular-nums">
                      <span className="truncate text-[8.5px] font-medium leading-none">
                        {deathDisplay}
                      </span>
                    </div>
                  )
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Reaction Count Badges (Top of Card) */}
      {person.reactions && person.reactions.length > 0 && !isSimplified && (
        <div
          className={`absolute -top-3.5 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-white/95 dark:bg-zinc-900/95 border border-stone-200/90 dark:border-zinc-700/90 rounded-full px-2 py-0.5 shadow-sm z-35 ${reactionsMaxWidthClass} overflow-x-auto pointer-events-auto`}
        >
          {(() => {
            const counts: Record<string, number> = {};
            const userReactedEmojis = new Set<string>();
            person.reactions.forEach((r) => {
              counts[r.emoji] = (counts[r.emoji] || 0) + 1;
              if (guestUserId && r.userId === guestUserId) {
                userReactedEmojis.add(r.emoji);
              }
            });
            return Object.entries(counts).map(([em, cnt]) => {
              const isMyReact = userReactedEmojis.has(em);
              return (
                <button
                  key={em}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onToggleReaction) onToggleReaction(person.id, em as ReactionEmoji);
                  }}
                  className={`flex items-center gap-0.5 text-[9.5px] px-1 rounded-full border transition-transform hover:scale-110 cursor-pointer ${
                    isMyReact
                      ? 'bg-emerald-50 dark:bg-emerald-950/70 border-emerald-400 dark:border-emerald-600 text-emerald-900 dark:text-emerald-200 font-bold'
                      : 'bg-stone-50 dark:bg-zinc-800/90 border-stone-200 dark:border-zinc-700 text-stone-700 dark:text-zinc-200'
                  }`}
                  title="Натисніть, щоб додати/змінити реакцію"
                >
                  <span>{em}</span>
                  <span className="text-[8.5px] tabular-nums">{cnt}</span>
                </button>
              );
            });
          })()}
        </div>
      )}
    </div>
  );
};

export const PersonCardSurface = React.memo(PersonCardSurfaceComponent);
