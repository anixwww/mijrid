import React, { useState, useRef } from 'react';
import { Person, ConnectionMeta, ReactionEmoji } from '../types/tree';
import { CARD_WIDTH, CARD_HEIGHT, COUPLE_TOTAL_WIDTH } from '../utils/treeLayout';
import { ClanInfo, doPersonsShareColor } from '../utils/lineageUtils';
import { ArrowLeftRight, HeartCrack, Heart, PawPrint } from 'lucide-react';
import { PersonCardSurface } from './PersonCardSurface';
import { getResolvedMediaSrc, handleUploadImageError } from '../utils/mediaSync';

interface CoupleCardProps {
  person1: Person; // Left spouse
  person2: Person; // Right spouse
  isSelected1: boolean;
  isSelected2: boolean;
  isGroupSelected1?: boolean;
  isGroupSelected2?: boolean;
  onSelect: (personId: string, e?: React.MouseEvent) => void;
  onEdit: (person: Person) => void;
  onToggleChronologicalPin?: (personId: string) => void;
  onToggleFullyVerified?: (personId: string) => void;
  onDragStart?: (e: React.MouseEvent, personId: string) => void;
  onLongPress?: (e: React.MouseEvent, personId: string) => void;
  onHighlightHouse?: (houseNumber: string) => void;
  onOpenMetricModal?: (person: Person, tab?: 'birth' | 'death') => void;
  onSwapSpouses?: (personId1: string, personId2: string) => void;
  onDisconnectCouple?: (personId1: string, personId2: string) => void;
  isDimmed1?: boolean;
  isDimmed2?: boolean;
  isConnectingSource1?: boolean;
  isConnectingSource2?: boolean;
  isConnectingTarget1?: boolean;
  isConnectingTarget2?: boolean;
  clanInfo1?: ClanInfo;
  clanInfo2?: ClanInfo;
  isLineageActive1?: boolean;
  isLineageActive2?: boolean;
  isDescendantCollapsed?: boolean;
  descendantCount?: number;
  onToggleBranchCollapse?: (personId: string) => void;
  zoomLevel?: number;
  isSimplified?: boolean;
  marriageMeta?: ConnectionMeta;
  onMarriageClick?: (marriageKey: string) => void;
  clanMap?: Record<string, ClanInfo>;
  onToggleReaction?: (personId: string, emoji: ReactionEmoji) => void;
  guestUserId?: string;
  onHoverPerson?: (personId: string | null) => void;
  isCurrentUser1?: boolean;
  isCurrentUser2?: boolean;
  userPersonId?: string | null;
  onOpenClanCoatOfArmsModal?: (clan: ClanInfo) => void;
  onSelectTree?: (treeId: string, targetPersonId?: string, sourcePersonId?: string) => void;
  allPersons?: Record<string, Person>;
  onJumpToBranchLink?: (targetPersonId: string, sourcePersonId: string) => void;
  onHoverBranchLink?: (link: { sourceId: string; targetId: string } | null) => void;
  isBranchLinkHighlighted1?: boolean;
  isBranchLinkHighlighted2?: boolean;
  isBlindSpotHighlighted1?: boolean;
  isBlindSpotHighlighted2?: boolean;
  onOpenPersonSuggestions?: (personId: string) => void;
  onOpenBlankScreenshotLightbox?: (person: Person) => void;
  isAdmin?: boolean;
}

const CoupleCardComponent: React.FC<CoupleCardProps> = ({
  person1,
  person2,
  isSelected1,
  isSelected2,
  isGroupSelected1,
  isGroupSelected2,
  onSelect,
  onEdit,
  onToggleChronologicalPin,
  onToggleFullyVerified,
  onDragStart,
  onLongPress,
  onHighlightHouse,
  onOpenMetricModal,
  onSwapSpouses,
  onDisconnectCouple,
  isDimmed1,
  isDimmed2,
  isConnectingSource1,
  isConnectingSource2,
  isConnectingTarget1,
  isConnectingTarget2,
  clanInfo1,
  clanInfo2,
  isLineageActive1,
  isLineageActive2,
  zoomLevel = 1.0,
  isSimplified: isSimplifiedProp,
  marriageMeta,
  onMarriageClick,
  clanMap,
  onToggleReaction,
  guestUserId,
  onHoverPerson,
  isCurrentUser1,
  isCurrentUser2,
  onOpenClanCoatOfArmsModal,
  onSelectTree,
  allPersons,
  onJumpToBranchLink,
  onHoverBranchLink,
  isBranchLinkHighlighted1,
  isBranchLinkHighlighted2,
  isBlindSpotHighlighted1,
  isBlindSpotHighlighted2,
  onOpenPersonSuggestions,
  onOpenBlankScreenshotLightbox,
  isAdmin = true,
}) => {
  const [activeReactionPersonId, setActiveReactionPersonId] = useState<string | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Check if both spouses share the same color (e.g. same clan or same custom background)
  const sharedColorCheck = doPersonsShareColor(person1, person2, clanMap);
  const isColorMatched = sharedColorCheck.shares;
  const matchedStrokeColor = sharedColorCheck.color || '#64748b';

  const handleMouseDown = (e: React.MouseEvent, person: Person) => {
    if (e.button !== 0) return;
    startPosRef.current = { x: e.clientX, y: e.clientY };

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (onLongPress) onLongPress(e, person.id);
    }, 400);

    if (onDragStart) {
      // Dragging either spouse moves the whole couple card unit
      onDragStart(e, person.id);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const dist = Math.hypot(e.clientX - startPosRef.current.x, e.clientY - startPosRef.current.y);
    if (dist > 6 && timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleMouseUp = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const isSimplified = isSimplifiedProp ?? zoomLevel < 0.45;
  const marriageKey = [person1.id, person2.id].sort().join('::');

  // Overall couple geometry: left position is left spouse x, top is min y
  const coupleX = Math.min(person1.x, person2.x);
  const coupleY = Math.min(person1.y, person2.y);
  const totalWidth = COUPLE_TOTAL_WIDTH;

  return (
    <div
      data-family-card="true"
      data-couple-card="true"
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        transform: `translate3d(${coupleX}px, ${coupleY}px, 0)`,
        width: `${totalWidth}px`,
        height: `${CARD_HEIGHT}px`,
        contain: 'layout style',
      }}
      className="group select-none"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      }}
    >
      {/* Unified Modern Top Floating Action Bar (hover or when either spouse is selected) */}
      {(onSwapSpouses || onDisconnectCouple) && (() => {
        const hasTopReactions =
          !isSimplified &&
          ((person1.reactions && person1.reactions.length > 0) ||
            (person2.reactions && person2.reactions.length > 0));
        return (
        <div
          className={`absolute ${
            hasTopReactions ? '-top-9.5' : '-top-4'
          } left-1/2 -translate-x-1/2 transition-opacity duration-150 bg-white/95 dark:bg-zinc-900/95 border border-stone-200/90 dark:border-zinc-700/90 rounded-full p-0.5 shadow-lg flex items-center gap-0.5 z-40 whitespace-nowrap ${
            isSelected1 || isSelected2
              ? 'opacity-100'
              : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'
          }`}
        >
          {onSwapSpouses && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSwapSpouses(person1.id, person2.id);
              }}
              className="hover:bg-stone-100 dark:hover:bg-zinc-800 text-stone-700 dark:text-zinc-200 hover:text-stone-950 dark:hover:text-white rounded-full px-2 py-0.5 text-[9.5px] font-semibold flex items-center gap-1 cursor-pointer active:scale-95 transition-colors"
              title="Змінити картки місцями (ліворуч ⇄ праворуч)"
            >
              <ArrowLeftRight size={10} className="text-amber-600 dark:text-amber-400" />
              <span>Змінити місцями</span>
            </button>
          )}

          {onSwapSpouses && onDisconnectCouple && (
            <span className="w-px h-3 bg-stone-200 dark:bg-zinc-700" aria-hidden="true" />
          )}

          {onDisconnectCouple && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDisconnectCouple(person1.id, person2.id);
              }}
              className="hover:bg-rose-50 dark:hover:bg-rose-950/60 text-rose-700 dark:text-rose-400 hover:text-rose-900 dark:hover:text-rose-200 rounded-full px-2 py-0.5 text-[9.5px] font-semibold flex items-center gap-1 cursor-pointer active:scale-95 transition-colors"
              title="Роз'єднати пару (розлучення) — розділити на дві окремі картки"
            >
              <HeartCrack size={10} className="text-rose-600 dark:text-rose-400" />
              <span>Роз'єднати</span>
            </button>
          )}
        </div>
        );
      })()}

      {/* Two Separate Cards Joined Visually by Central Union Medallion */}
      <div className="w-full h-full relative flex items-center justify-between">
        {/* LEFT SPOUSE CARD */}
        <PersonCardSurface
          person={person1}
          isSelected={isSelected1}
          isGroupSelected={isGroupSelected1}
          isDimmed={isDimmed1}
          isConnectingSource={isConnectingSource1}
          isConnectingTarget={isConnectingTarget1}
          isLineageActive={isLineageActive1}
          isSimplified={isSimplified}
          isCurrentUser={isCurrentUser1}
          isAdmin={isAdmin}
          clanInfo={clanInfo1}
          overrideBorderColor={isColorMatched ? matchedStrokeColor : undefined}
          crossCanvasSide="left"
          connectingTargetSide="left"
          groupCheckSide="left"
          reactionsMaxWidthClass="max-w-[110px]"
          guestUserId={guestUserId}
          widthPx={CARD_WIDTH}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(person1.id, e);
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onEdit(person1);
          }}
          onMouseDown={(e) => handleMouseDown(e, person1)}
          onHoverPerson={onHoverPerson}
          onToggleFullyVerified={onToggleFullyVerified}
          onHighlightHouse={onHighlightHouse}
          onToggleChronologicalPin={onToggleChronologicalPin}
          onOpenClanCoatOfArmsModal={onOpenClanCoatOfArmsModal}
          onOpenMetricModal={onOpenMetricModal}
          onToggleReaction={onToggleReaction}
          onOpenReactionPicker={
            onToggleReaction
              ? () => setActiveReactionPersonId((prev) => (prev === person1.id ? null : person1.id))
              : undefined
          }
          onSelectTree={onSelectTree}
          allPersons={allPersons}
          onJumpToBranchLink={onJumpToBranchLink}
          onHoverBranchLink={onHoverBranchLink}
          isBranchLinkHighlighted={isBranchLinkHighlighted1}
          isBlindSpotHighlighted={isBlindSpotHighlighted1}
          onOpenPersonSuggestions={onOpenPersonSuggestions}
          onOpenBlankScreenshotLightbox={onOpenBlankScreenshotLightbox}
        />

        {/* CENTRAL UNION RINGS OR PAIR MEDALLION */}
        {(() => {
          const isDivorced = marriageMeta?.eventType === 'divorce';
          const isCohabitation =
            !isDivorced &&
            (marriageMeta?.eventType === 'cohabitation' ||
              (marriageMeta?.label && marriageMeta.label.toLowerCase().includes('без шлюбу')));
          const isInteractiveMarriage = Boolean(onMarriageClick);
          return (
            <div
              onClick={
                isInteractiveMarriage
                  ? (e) => {
                      e.stopPropagation();
                      if (onMarriageClick) onMarriageClick(marriageKey);
                    }
                  : undefined
              }
              className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full shadow-md border flex items-center justify-center transition-transform z-30 ${
                isInteractiveMarriage ? 'cursor-pointer hover:scale-115' : 'cursor-default'
              } ${
                isDivorced
                  ? 'bg-rose-50 dark:bg-rose-950/90 border-rose-400 dark:border-rose-500'
                  : isCohabitation
                  ? 'bg-emerald-50 dark:bg-emerald-950/90 border-emerald-400 dark:border-emerald-500'
                  : 'bg-white/95 dark:bg-zinc-900/95'
              }`}
              style={{
                borderColor: isDivorced
                  ? '#e11d48'
                  : isCohabitation
                  ? '#059669'
                  : isColorMatched
                  ? matchedStrokeColor
                  : '#d97706',
                boxShadow: isDivorced
                  ? '0 2px 8px rgba(225, 29, 72, 0.28)'
                  : isColorMatched
                  ? `0 2px 8px ${matchedStrokeColor}38`
                  : '0 2px 6px rgba(24,24,27,0.14)',
              }}
              title={
                isDivorced
                  ? marriageMeta?.eventDate
                    ? `Розлучена пара (${marriageMeta.eventDate})${isInteractiveMarriage ? ' · Натисніть для редагування або роз\'єднання' : ''}`
                    : `Розлучена пара${isInteractiveMarriage ? ' · Натисніть для налаштування або роз\'єднання на окремі картки' : ''}`
                  : isCohabitation
                  ? marriageMeta?.eventDate
                    ? `Пара без шлюбу (${marriageMeta.eventDate})${isInteractiveMarriage ? ' · Натисніть для налаштування' : ''}`
                    : `Пара (без шлюбу / цивільний союз)${isInteractiveMarriage ? ' · Натисніть для налаштування' : ''}`
                  : marriageMeta?.eventDate
                  ? `Подружжя (${marriageMeta.eventDate})${isInteractiveMarriage ? ' · Натисніть для редагування шлюбу' : ''}`
                  : `Подружжя${isInteractiveMarriage ? ' · Натисніть для налаштування шлюбу' : ''}`
              }
            >
              {isDivorced ? (
                <HeartCrack size={12.5} className="text-rose-600 dark:text-rose-400" />
              ) : isCohabitation ? (
                <Heart size={12.5} className="text-emerald-700 dark:text-emerald-400 fill-emerald-100 dark:fill-emerald-900/60" />
              ) : (
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none">
                  <circle
                    cx="9"
                    cy="12"
                    r="5"
                    stroke={isColorMatched ? matchedStrokeColor : '#d97706'}
                    strokeWidth="2"
                  />
                  <circle
                    cx="15"
                    cy="12"
                    r="5"
                    stroke={isColorMatched ? matchedStrokeColor : '#b45309'}
                    strokeWidth="2"
                  />
                </svg>
              )}

              {/* Marriage / Pair Date Badge if configured */}
              {marriageMeta?.eventDate && !isSimplified && (
                <span
                  className={`absolute -top-4 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded-md text-[7.5px] tabular-nums font-bold shadow-xs whitespace-nowrap ${
                    isDivorced
                      ? 'bg-rose-100 dark:bg-rose-950/90 text-rose-950 dark:text-rose-200 border border-rose-300 dark:border-rose-700/80'
                      : isCohabitation
                      ? 'bg-emerald-100 dark:bg-emerald-950/90 text-emerald-950 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700/80'
                      : 'bg-amber-50 dark:bg-amber-950/90 text-amber-950 dark:text-amber-200 border border-amber-300 dark:border-amber-700/80'
                  }`}
                >
                  {isDivorced ? `💔 ${marriageMeta.eventDate}` : marriageMeta.eventDate}
                </span>
              )}
            </div>
          );
        })()}

        {/* RIGHT SPOUSE CARD */}
        <PersonCardSurface
          person={person2}
          isSelected={isSelected2}
          isGroupSelected={isGroupSelected2}
          isDimmed={isDimmed2}
          isConnectingSource={isConnectingSource2}
          isConnectingTarget={isConnectingTarget2}
          isLineageActive={isLineageActive2}
          isSimplified={isSimplified}
          isCurrentUser={isCurrentUser2}
          isAdmin={isAdmin}
          clanInfo={clanInfo2}
          overrideBorderColor={isColorMatched ? matchedStrokeColor : undefined}
          crossCanvasSide="right"
          connectingTargetSide="right"
          groupCheckSide="right"
          reactionsMaxWidthClass="max-w-[110px]"
          guestUserId={guestUserId}
          widthPx={CARD_WIDTH}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(person2.id, e);
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onEdit(person2);
          }}
          onMouseDown={(e) => handleMouseDown(e, person2)}
          onHoverPerson={onHoverPerson}
          onToggleFullyVerified={onToggleFullyVerified}
          onHighlightHouse={onHighlightHouse}
          onToggleChronologicalPin={onToggleChronologicalPin}
          onOpenClanCoatOfArmsModal={onOpenClanCoatOfArmsModal}
          onOpenMetricModal={onOpenMetricModal}
          onToggleReaction={onToggleReaction}
          onOpenReactionPicker={
            onToggleReaction
              ? () => setActiveReactionPersonId((prev) => (prev === person2.id ? null : person2.id))
              : undefined
          }
          onSelectTree={onSelectTree}
          allPersons={allPersons}
          onJumpToBranchLink={onJumpToBranchLink}
          onHoverBranchLink={onHoverBranchLink}
          isBranchLinkHighlighted={isBranchLinkHighlighted2}
          isBlindSpotHighlighted={isBlindSpotHighlighted2}
          onOpenPersonSuggestions={onOpenPersonSuggestions}
          onOpenBlankScreenshotLightbox={onOpenBlankScreenshotLightbox}
        />
      </div>

      {/* Reaction Picker Popup for Person 1 */}
      {activeReactionPersonId === person1.id && (
        <div className="absolute -top-14 left-1/4 -translate-x-1/2 bg-white dark:bg-zinc-900 rounded-full shadow-xl border border-stone-200 dark:border-zinc-700 px-3 py-1.5 flex items-center gap-2 z-50 animate-in fade-in zoom-in-95 duration-150">
          {(['❤️', '😮', '👍', '👎', '😢'] as ReactionEmoji[]).map((em) => (
            <button
              key={em}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onToggleReaction) onToggleReaction(person1.id, em);
                setActiveReactionPersonId(null);
              }}
              className="text-base hover:scale-125 transition-transform p-1 cursor-pointer"
            >
              {em}
            </button>
          ))}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setActiveReactionPersonId(null);
            }}
            className="text-stone-400 hover:text-stone-700 dark:text-zinc-400 dark:hover:text-zinc-200 text-xs font-bold ml-1 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Reaction Picker Popup for Person 2 */}
      {activeReactionPersonId === person2.id && (
        <div className="absolute -top-14 right-1/4 translate-x-1/2 bg-white dark:bg-zinc-900 rounded-full shadow-xl border border-stone-200 dark:border-zinc-700 px-3 py-1.5 flex items-center gap-2 z-50 animate-in fade-in zoom-in-95 duration-150">
          {(['❤️', '😮', '👍', '👎', '😢'] as ReactionEmoji[]).map((em) => (
            <button
              key={em}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onToggleReaction) onToggleReaction(person2.id, em);
                setActiveReactionPersonId(null);
              }}
              className="text-base hover:scale-125 transition-transform p-1 cursor-pointer"
            >
              {em}
            </button>
          ))}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setActiveReactionPersonId(null);
            }}
            className="text-stone-400 hover:text-stone-700 dark:text-zinc-400 dark:hover:text-zinc-200 text-xs font-bold ml-1 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Pets Banner for Couple (docked directly via Paw Medallion on card seam) */}
      {(() => {
        const couplePets = [
          ...(person1.pets || []).filter((p) => p.isCouplePet),
          ...(person2.pets || []).filter((p) => p.isCouplePet),
        ];
        const pets1 = (person1.pets || []).filter((p) => !p.isCouplePet);
        const pets2 = (person2.pets || []).filter((p) => !p.isCouplePet);

        const getPetIcon = (t: string) => {
          if (t === 'cat') return '🐱';
          if (t === 'dog') return '🐶';
          if (t === 'horse') return '🐴';
          if (t === 'cow') return '🐮';
          if (t === 'bird') return '🦜';
          return '🐾';
        };
        const individualTopOffset = couplePets.length > 0 ? CARD_HEIGHT + 74 : CARD_HEIGHT + 10;

        return (
          <>
            {/* Wide Couple Pet Card docked via Central Paw Medallion */}
            {couplePets.length > 0 && !isSimplified && (
              <>
                <div
                  className="absolute left-1/2 -translate-x-1/2 w-5.5 h-5.5 rounded-full shadow-md border border-amber-500/90 dark:border-amber-400/80 bg-white/95 dark:bg-zinc-900/95 flex items-center justify-center z-30 pointer-events-none"
                  style={{ top: `${CARD_HEIGHT - 6}px` }}
                  title={`Спільний улюбленець пари: ${couplePets.map((p) => p.name).join(', ')}`}
                >
                  <PawPrint size={11.5} className="text-amber-600 dark:text-amber-400" />
                </div>

                <div
                  className="absolute left-0 w-full bg-white/95 dark:bg-zinc-900/95 hover:bg-amber-50 dark:hover:bg-amber-950/40 border border-amber-300/90 dark:border-amber-400/75 rounded-xl px-3 pt-2.5 pb-2 text-[9.5px] font-semibold text-stone-900 dark:text-zinc-100 shadow-sm flex items-center justify-center gap-3.5 flex-wrap z-25 transition-all cursor-default"
                  style={{ top: `${CARD_HEIGHT + 10}px` }}
                >
                  {couplePets.map((pet) => (
                    <div
                      key={pet.id}
                      className="flex items-center gap-2.5 truncate"
                      title={`Улюбленець пари: ${pet.name}${pet.breed ? ` (${pet.breed})` : ''}`}
                    >
                      <div className="w-10 h-10 rounded-lg bg-amber-100/90 dark:bg-amber-900/50 border border-amber-300/80 dark:border-amber-600/70 flex items-center justify-center text-lg shrink-0 overflow-hidden">
                        {pet.avatarUrl ? (
                          <img
                            src={getResolvedMediaSrc(pet.avatarUrl)}
                            alt={pet.name}
                            onError={(e) => handleUploadImageError(e, pet.avatarUrl)}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          getPetIcon(pet.type)
                        )}
                      </div>
                      <div className="min-w-0 flex-1 leading-tight text-left">
                        <span className="text-[10.5px] font-bold text-stone-900 dark:text-zinc-100 truncate block">
                          {pet.name}
                        </span>
                        {pet.breed && (
                          <span className="text-[8px] font-medium text-amber-800/90 dark:text-amber-300/90 truncate block">
                            {pet.breed}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Spouse 1 Individual Pet Mini-Card */}
            {pets1.length > 0 && !isSimplified && (
              <>
                {couplePets.length === 0 && (
                  <div
                    className="absolute -translate-x-1/2 w-5.5 h-5.5 rounded-full shadow-md border border-amber-500/90 dark:border-amber-400/80 bg-white/95 dark:bg-zinc-900/95 flex items-center justify-center z-30 pointer-events-none"
                    style={{ left: `${CARD_WIDTH / 2}px`, top: `${CARD_HEIGHT - 6}px` }}
                    title={`Улюбленець: ${pets1.map((p) => p.name).join(', ')}`}
                  >
                    <PawPrint size={11.5} className="text-amber-600 dark:text-amber-400" />
                  </div>
                )}

                <div
                  className="absolute -translate-x-1/2 flex flex-col items-center gap-1.5 z-25 w-[132px]"
                  style={{ left: `${CARD_WIDTH / 2}px`, top: `${individualTopOffset}px` }}
                >
                  {pets1.map((pet, idx) => (
                    <div
                      key={pet.id}
                      className={`w-full bg-white/95 dark:bg-zinc-900/95 hover:bg-amber-50 dark:hover:bg-amber-950/40 border border-amber-300/90 dark:border-amber-400/75 rounded-xl px-2 ${
                        idx === 0 && couplePets.length === 0 ? 'pt-2.5 pb-1.5' : 'py-1.5'
                      } flex items-center gap-2 shadow-sm transition-all text-left cursor-default`}
                      title={`Домашній улюбленець: ${pet.name}${pet.breed ? ` (${pet.breed})` : ''}`}
                    >
                      <div className="w-9 h-9 rounded-lg bg-amber-100/90 dark:bg-amber-900/50 border border-amber-300/80 dark:border-amber-600/70 flex items-center justify-center text-base shrink-0 overflow-hidden">
                        {pet.avatarUrl ? (
                          <img
                            src={getResolvedMediaSrc(pet.avatarUrl)}
                            alt={pet.name}
                            onError={(e) => handleUploadImageError(e, pet.avatarUrl)}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          getPetIcon(pet.type)
                        )}
                      </div>
                      <div className="min-w-0 flex-1 leading-tight">
                        <span className="text-[10px] font-bold text-stone-900 dark:text-zinc-100 truncate block">
                          {pet.name}
                        </span>
                        {pet.breed && (
                          <span className="text-[7.5px] text-amber-800/90 dark:text-amber-300/90 font-medium truncate block">
                            {pet.breed}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Spouse 2 Individual Pet Mini-Card */}
            {pets2.length > 0 && !isSimplified && (
              <>
                {couplePets.length === 0 && (
                  <div
                    className="absolute translate-x-1/2 w-5.5 h-5.5 rounded-full shadow-md border border-amber-500/90 dark:border-amber-400/80 bg-white/95 dark:bg-zinc-900/95 flex items-center justify-center z-30 pointer-events-none"
                    style={{ right: `${CARD_WIDTH / 2}px`, top: `${CARD_HEIGHT - 6}px` }}
                    title={`Улюбленець: ${pets2.map((p) => p.name).join(', ')}`}
                  >
                    <PawPrint size={11.5} className="text-amber-600 dark:text-amber-400" />
                  </div>
                )}

                <div
                  className="absolute translate-x-1/2 flex flex-col items-center gap-1.5 z-25 w-[132px]"
                  style={{ right: `${CARD_WIDTH / 2}px`, top: `${individualTopOffset}px` }}
                >
                  {pets2.map((pet, idx) => (
                    <div
                      key={pet.id}
                      className={`w-full bg-white/95 dark:bg-zinc-900/95 hover:bg-amber-50 dark:hover:bg-amber-950/40 border border-amber-300/90 dark:border-amber-400/75 rounded-xl px-2 ${
                        idx === 0 && couplePets.length === 0 ? 'pt-2.5 pb-1.5' : 'py-1.5'
                      } flex items-center gap-2 shadow-sm transition-all text-left cursor-default`}
                      title={`Домашній улюбленець: ${pet.name}${pet.breed ? ` (${pet.breed})` : ''}`}
                    >
                      <div className="w-9 h-9 rounded-lg bg-amber-100/90 dark:bg-amber-900/50 border border-amber-300/80 dark:border-amber-600/70 flex items-center justify-center text-base shrink-0 overflow-hidden">
                        {pet.avatarUrl ? (
                          <img
                            src={getResolvedMediaSrc(pet.avatarUrl)}
                            alt={pet.name}
                            onError={(e) => handleUploadImageError(e, pet.avatarUrl)}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          getPetIcon(pet.type)
                        )}
                      </div>
                      <div className="min-w-0 flex-1 leading-tight">
                        <span className="text-[10px] font-bold text-stone-900 dark:text-zinc-100 truncate block">
                          {pet.name}
                        </span>
                        {pet.breed && (
                          <span className="text-[7.5px] text-amber-800/90 dark:text-amber-300/90 font-medium truncate block">
                            {pet.breed}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        );
      })()}
    </div>
  );
};

export const CoupleCard = React.memo(CoupleCardComponent);
