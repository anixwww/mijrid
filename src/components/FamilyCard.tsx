import React, { useState, useRef } from 'react';
import { Person, ReactionEmoji } from '../types/tree';
import { CARD_WIDTH, CARD_HEIGHT } from '../utils/treeLayout';
import { ClanInfo } from '../utils/lineageUtils';
import { PawPrint } from 'lucide-react';
import { PersonCardSurface } from './PersonCardSurface';
import { getResolvedMediaSrc, handleUploadImageError } from '../utils/mediaSync';

interface FamilyCardProps {
  person: Person;
  isSelected: boolean;
  isGroupSelected?: boolean;
  onSelect: (personId: string, e?: React.MouseEvent) => void;
  onEdit: (person: Person) => void;
  onToggleChronologicalPin?: (personId: string) => void;
  onToggleFullyVerified?: (personId: string) => void;
  onDragStart?: (e: React.MouseEvent, personId: string) => void;
  onLongPress?: (e: React.MouseEvent, personId: string) => void;
  onHighlightHouse?: (houseNumber: string) => void;
  onOpenMetricModal?: (person: Person, tab?: 'birth' | 'death') => void;
  isDimmed?: boolean;
  isConnectingSource?: boolean;
  isConnectingTarget?: boolean;
  // Visual enhancements
  clanInfo?: ClanInfo;
  isLineageActive?: boolean;
  isDescendantCollapsed?: boolean;
  descendantCount?: number;
  onToggleBranchCollapse?: (personId: string) => void;
  zoomLevel?: number; // for Level of Detail (LOD)
  isSimplified?: boolean;
  onHoverPerson?: (personId: string | null) => void;
  isCurrentUser?: boolean;
  userPersonId?: string | null;
  onOpenClanCoatOfArmsModal?: (clan: ClanInfo) => void;
  onToggleReaction?: (personId: string, emoji: ReactionEmoji) => void;
  guestUserId?: string;
  onSelectTree?: (treeId: string, targetPersonId?: string, sourcePersonId?: string) => void;
  allPersons?: Record<string, Person>;
  onJumpToBranchLink?: (targetPersonId: string, sourcePersonId: string) => void;
  onHoverBranchLink?: (link: { sourceId: string; targetId: string } | null) => void;
  isBranchLinkHighlighted?: boolean;
  isBlindSpotHighlighted?: boolean;
  onOpenPersonSuggestions?: (personId: string) => void;
  onUploadBlankScreenshot?: (personId: string, file: File) => void;
  onOpenBlankScreenshotLightbox?: (person: Person) => void;
  isAdmin?: boolean;
}

const FamilyCardComponent: React.FC<FamilyCardProps> = ({
  person,
  isSelected,
  isGroupSelected,
  onSelect,
  onEdit,
  onToggleChronologicalPin,
  onToggleFullyVerified,
  onDragStart,
  onLongPress,
  onHighlightHouse,
  onOpenMetricModal,
  isDimmed,
  isConnectingSource,
  isConnectingTarget,
  clanInfo,
  isLineageActive,
  zoomLevel = 1.0,
  isSimplified: isSimplifiedProp,
  onToggleReaction,
  guestUserId,
  onHoverPerson,
  isCurrentUser,
  onOpenClanCoatOfArmsModal,
  onSelectTree,
  allPersons,
  onJumpToBranchLink,
  onHoverBranchLink,
  isBranchLinkHighlighted,
  isBlindSpotHighlighted,
  onOpenPersonSuggestions,
  onUploadBlankScreenshot,
  onOpenBlankScreenshotLightbox,
  isAdmin = true,
}) => {
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    startPosRef.current = { x: e.clientX, y: e.clientY };

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setShowReactionPicker(true);
      if (onLongPress) onLongPress(e, person.id);
    }, 400);

    if (onDragStart) {
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

  // Level of detail check: when zooming far out (< 0.48), show simplified fast card
  const isSimplifiedView = isSimplifiedProp ?? zoomLevel < 0.45;

  return (
    <div
      data-family-card="true"
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        transform: `translate3d(${person.x}px, ${person.y}px, 0)`,
        width: `${CARD_WIDTH}px`,
        height: `${CARD_HEIGHT}px`,
        contain: 'layout style',
      }}
      className="group select-none"
      onMouseLeave={() => {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      <PersonCardSurface
        person={person}
        isSelected={isSelected}
        isGroupSelected={isGroupSelected}
        isDimmed={isDimmed}
        isConnectingSource={isConnectingSource}
        isConnectingTarget={isConnectingTarget}
        isLineageActive={isLineageActive}
        isSimplified={isSimplifiedView}
        isCurrentUser={isCurrentUser}
        isAdmin={isAdmin}
        clanInfo={clanInfo}
        crossCanvasSide="right"
        connectingTargetSide="right"
        groupCheckSide="left"
        reactionsMaxWidthClass="max-w-[130px]"
        guestUserId={guestUserId}
        widthPx={CARD_WIDTH}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(person.id, e);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onEdit(person);
        }}
        onMouseDown={handleMouseDown}
        onHoverPerson={onHoverPerson}
        onToggleFullyVerified={onToggleFullyVerified}
        onHighlightHouse={onHighlightHouse}
        onToggleChronologicalPin={onToggleChronologicalPin}
        onOpenClanCoatOfArmsModal={onOpenClanCoatOfArmsModal}
        onOpenMetricModal={onOpenMetricModal}
        onToggleReaction={onToggleReaction}
        onSelectTree={onSelectTree}
        allPersons={allPersons}
        onJumpToBranchLink={onJumpToBranchLink}
        onHoverBranchLink={onHoverBranchLink}
        isBranchLinkHighlighted={isBranchLinkHighlighted}
        isBlindSpotHighlighted={isBlindSpotHighlighted}
        onOpenPersonSuggestions={onOpenPersonSuggestions}
        onUploadBlankScreenshot={onUploadBlankScreenshot}
        onOpenBlankScreenshotLightbox={onOpenBlankScreenshotLightbox}
      />

      {/* Pet Cards docked directly under single person card via Paw Medallion */}
      {person.pets && person.pets.length > 0 && !isSimplifiedView && (
        <>
          {/* Circular Paw Medallion straddling card bottom & pet card top (analogous to CoupleCard rings) */}
          <div
            className="absolute left-1/2 -translate-x-1/2 w-5.5 h-5.5 rounded-full shadow-md border border-amber-500/90 dark:border-amber-400/80 bg-white/95 dark:bg-zinc-900/95 flex items-center justify-center z-30 pointer-events-none"
            style={{ top: `${CARD_HEIGHT - 6}px` }}
            title={`Домашній улюбленець: ${person.pets.map((p) => p.name).join(', ')}`}
          >
            <PawPrint size={11.5} className="text-amber-600 dark:text-amber-400" />
          </div>

          <div
            className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 z-25 w-[132px]"
            style={{ top: `${CARD_HEIGHT + 10}px` }}
          >
            {person.pets.map((pet, idx) => {
              const getPetIcon = (t: string) => {
                if (t === 'cat') return '🐱';
                if (t === 'dog') return '🐶';
                if (t === 'horse') return '🐴';
                if (t === 'cow') return '🐮';
                if (t === 'bird') return '🦜';
                return '🐾';
              };
              return (
                <div
                  key={pet.id}
                  className={`w-full bg-white/95 dark:bg-zinc-900/95 hover:bg-amber-50 dark:hover:bg-amber-950/40 border border-amber-300/90 dark:border-amber-400/75 rounded-xl px-2 ${
                    idx === 0 ? 'pt-2.5 pb-1.5' : 'py-1.5'
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
              );
            })}
          </div>
        </>
      )}

      {/* Reaction Picker Popup on Long Press */}
      {showReactionPicker && (
        <div className="absolute -top-14 left-1/2 -translate-x-1/2 bg-white dark:bg-zinc-900 rounded-full shadow-xl border border-stone-200 dark:border-zinc-700 px-3 py-1.5 flex items-center gap-2 z-50 animate-in fade-in zoom-in-95 duration-150">
          {(['❤️', '😮', '👍', '👎', '😢'] as ReactionEmoji[]).map((em) => (
            <button
              key={em}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onToggleReaction) onToggleReaction(person.id, em);
                setShowReactionPicker(false);
              }}
              className="text-base hover:scale-125 transition-transform p-1 cursor-pointer"
              title={em}
            >
              {em}
            </button>
          ))}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowReactionPicker(false);
            }}
            className="text-stone-400 hover:text-stone-700 dark:text-zinc-400 dark:hover:text-zinc-200 text-xs font-bold ml-1 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
};

export const FamilyCard = React.memo(FamilyCardComponent);
