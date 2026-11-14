import React, { useState, useMemo, useEffect } from 'react';
import { Person, RelativeType, ConnectionMeta } from '../types/tree';
import { SilhouetteAvatar } from './SilhouetteAvatar';
import { formatPersonLifeDates, formatSingleDate, calculateAge } from '../utils/dateUtils';
import { handleUploadImageError } from '../utils/mediaSync';
import { getPrimaryMetricExternalLink, getMetricLinkDomainLabel, isExternalMetricLink } from '../utils/metricLinks';
import {
  X,
  Pencil,
  Trash2,
  Heart,
  Users,
  User,
  Check,
  ChevronRight,
  FileText,
  HeartCrack,
  Camera,
  BookOpen,
  Dog,
  Briefcase,
  MapPin,
  UserCheck,
  Sparkles,
  Settings,
  Shield,
  Home,
  ArrowUpRight,
  Plus,
  StickyNote,
  Link2,
  MessageSquarePlus,
  MessageSquareDot,
  UserPlus,
  Ban,
  Copy,
  ImagePlus,
  ZoomIn,
  ExternalLink,
  Paintbrush,
  Image as ImageIcon,
} from 'lucide-react';
import { ClanInfo, getClanName } from '../utils/lineageUtils';
import { getBranchLineShapeLabel } from '../utils/branchLinkGeometry';
import { formatCardId } from '../utils/cardIdUtils';
import { CrossCanvasSearchTree } from '../utils/fileStorage';
import { getPersonCrossCanvasLinks, isSameCanvasId } from '../utils/crossCanvasLinks';
import { DocumentLightboxModal, LightboxDocumentItem } from './DocumentLightboxModal';

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
  if (!norm) return '#0f766e';
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

interface DetailsSidebarProps {
  person: Person | null;
  allPersons: Record<string, Person>;
  isOpen: boolean;
  isAdmin?: boolean;
  userPersonId?: string | null;
  onClose: () => void;
  onEdit: (person: Person) => void;
  onDelete: (personId: string) => void;
  onAddRelative: (targetPerson: Person, relationType: RelativeType) => void;
  onSelectPerson: (personId: string) => void;
  onToggleRelationVerification?: (personId: string, relativeId: string) => void;
  onToggleFullyVerified?: (personId: string) => void;
  onOpenConnectModal?: (person: Person) => void;
  onOpenMetricModal?: (person: Person, tab?: 'birth' | 'death') => void;
  onDisconnectSpouse?: (personId1: string, personId2: string) => void;
  onEditMarriageConnection?: (connectionId: string) => void;
  connectionOverrides?: Record<string, ConnectionMeta>;
  clanMap?: Record<string, ClanInfo>;
  onOpenClanCoatOfArmsModal?: (clan: ClanInfo) => void;
  onDeleteReaction?: (personId: string, reactionIdOrIdx: string | number) => void;
  onOpenReactionsModal?: () => void;
  onSetUserPersonId?: (personId: string) => void;
  onOpenBranchLinkModal?: (person: Person) => void;
  onEditBranchLink?: (sourcePersonId: string, linkId: string) => void;
  onRemoveBranchLink?: (sourcePersonId: string, linkId: string) => void;
  onToggleGhostStatus?: (personId: string, isGhost: boolean, openEditAfter?: boolean) => void;
  onOpenGuestSuggestion?: (person: Person) => void;
  onOpenProposeRelative?: (person: Person) => void;
  onResolveGuestSuggestion?: (
    personId: string,
    suggestionId: string,
    action: 'approve' | 'reject' | 'mark_approved'
  ) => void;
  onApproveProposal?: (personId: string) => void;
  onDeleteProposal?: (personId: string) => void;
  currentTreeId?: string;
  crossCanvasTrees?: CrossCanvasSearchTree[];
  onSelectTree?: (treeId: string, targetPersonId?: string, sourcePersonId?: string) => void;
  onRemoveCrossCanvasLink?: (personId: string, linkId: string) => void;
  onOpenGuestCustomize?: (person: Person) => void;
}

export const DetailsSidebar: React.FC<DetailsSidebarProps> = ({
  person,
  allPersons,
  isOpen,
  isAdmin = true,
  userPersonId,
  onClose,
  onEdit,
  onDelete,
  onAddRelative,
  onSelectPerson,
  onToggleRelationVerification,
  onToggleFullyVerified,
  onOpenConnectModal,
  onOpenMetricModal,
  onDisconnectSpouse,
  onEditMarriageConnection,
  connectionOverrides,
  clanMap,
  onOpenClanCoatOfArmsModal,
  onDeleteReaction,
  onOpenReactionsModal,
  onSetUserPersonId,
  onOpenBranchLinkModal,
  onEditBranchLink,
  onRemoveBranchLink,
  onToggleGhostStatus,
  onOpenGuestSuggestion,
  onOpenProposeRelative,
  onResolveGuestSuggestion,
  onApproveProposal,
  onDeleteProposal,
  currentTreeId,
  crossCanvasTrees = [],
  onSelectTree,
  onRemoveCrossCanvasLink,
  onOpenGuestCustomize,
}) => {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [photoAlbumLightboxIndex, setPhotoAlbumLightboxIndex] = useState<number | null>(null);
  const [screenshotLightboxOpen, setScreenshotLightboxOpen] = useState(false);
  const [isAddRelativeOpen, setIsAddRelativeOpen] = useState(false);
  const [confirmDeleteProposal, setConfirmDeleteProposal] = useState(false);
  const [copiedCardId, setCopiedCardId] = useState(false);

  useEffect(() => {
    setIsAddRelativeOpen(false);
    setConfirmDeleteProposal(false);
    setCopiedCardId(false);
    setScreenshotLightboxOpen(false);
    setPhotoAlbumLightboxIndex(null);
    setLightboxIndex(null);
  }, [person?.id]);

  const personClanName = person ? person.clanName || getClanName(person) : null;
  const personClanInfo = useMemo(() => {
    if (!personClanName || !clanMap) return null;
    return clanMap[personClanName] || null;
  }, [personClanName, clanMap]);

  if (!isOpen || !person) return null;

  const fullName = [person.firstName, person.lastName].filter(Boolean).join(' ') || '?';
  const lifeDates = formatPersonLifeDates(person);
  const formattedBirth = formatSingleDate(person.birthDay, person.birthMonth, person.birthYear, '.') || person.birthDate;
  const formattedDeath = formatSingleDate(person.deathDay, person.deathMonth, person.deathYear, '.') || person.deathDate;
  const personAge = calculateAge(person);

  const hasBirthMetric = !!(person.birthMetricUrl || person.metricDocuments?.some((d) => d.type === 'birth'));
  const hasDeathMetric = !!(person.deathMetricUrl || person.metricDocuments?.some((d) => d.type === 'death'));
  const birthExternalLink = getPrimaryMetricExternalLink(person, 'birth');
  const deathExternalLink = getPrimaryMetricExternalLink(person, 'death');

  const rawHeroHex = person.cardBgColor?.trim() || (personClanInfo ? personClanInfo.bgColor : '#e8efe9');
  const normHeroHex = normalizeHex(rawHeroHex) || '#e8efe9';
  const heroAccentColor = person.cardBgColor?.trim()
    ? deriveAccentHex(normHeroHex)
    : personClanInfo
    ? personClanInfo.color
    : '#047857';
  const isNeutralHero =
    normHeroHex === '#ffffff' ||
    normHeroHex === '#f4f4f5' ||
    normHeroHex === '#fafaf9' ||
    normHeroHex === '#e8efe9';
  const heroHeaderGradient = isNeutralHero
    ? 'linear-gradient(180deg, color-mix(in srgb, #e8efe9 var(--card-mid-mix), var(--card-bg-base)) 0%, transparent 75%)'
    : `linear-gradient(180deg, color-mix(in srgb, ${normHeroHex} var(--card-mid-mix), var(--card-bg-base)) 0%, transparent 88%)`;

  const parents = Array.from(new Set(person.parents || [])).map((id) => allPersons[id]).filter(Boolean);
  const spouses = Array.from(new Set(person.spouses || [])).map((id) => allPersons[id]).filter(Boolean);
  const children = Array.from(new Set(person.children || [])).map((id) => allPersons[id]).filter(Boolean);
  const siblings = Array.from(
    new Set(
      Object.values(allPersons).filter((other) => {
        if (other.id === person.id) return false;
        const sharesParent =
          person.parents &&
          person.parents.length > 0 &&
          other.parents?.some((pId) => person.parents.includes(pId));
        const isDirectSibling =
          person.siblings?.includes(other.id) || other.siblings?.includes(person.id);
        return sharesParent || isDirectSibling;
      })
    )
  );

  const hasBiographicalDetails = !!(
    formattedBirth ||
    personAge ||
    person.birthPlace ||
    formattedDeath ||
    person.deathPlace ||
    person.residencePlace ||
    person.burialPlace ||
    person.houseNumber ||
    person.profession ||
    person.deathCause ||
    person.godparents
  );

  const lifePhotos = person.photoAlbum || [];

  return (
    <aside className="fixed top-13 right-0 bottom-0 w-full sm:w-[368px] max-w-full bg-[#fafaf9] border-l border-stone-200/90 shadow-2xl z-30 flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">
      {/* Top Drawer Header */}
      <div className="px-4 py-3 bg-white/95 backdrop-blur-md border-b border-stone-200/80 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-xs font-bold uppercase tracking-wider text-stone-700 truncate">
            Відомості про особу
          </h3>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${
              isAdmin
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/80'
                : 'bg-stone-100 text-stone-600 border border-stone-200/80'
            }`}
          >
            {isAdmin ? 'Адмін' : 'Гість'}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg text-stone-400 hover:text-stone-800 hover:bg-stone-100 transition-colors cursor-pointer"
          aria-label="Закрити панель"
        >
          <X size={16} />
        </button>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-4 pb-24 sm:pb-14 space-y-3.5">
        {/* HERO IDENTITY CARD (Pure Read-Only + 3 Primary Action Buttons) */}
        <div className="rounded-2xl bg-white border border-stone-200/90 shadow-sm overflow-hidden relative">
          <div
            className="absolute inset-x-0 top-0 h-32 pointer-events-none"
            style={{ background: heroHeaderGradient }}
          />
          <div
            className="h-1 w-full relative z-10"
            style={{ backgroundColor: heroAccentColor }}
          />

          {/* Hero Top Bar: Gender Badge + Card ID + Verification Status */}
          <div className="relative z-10 px-3.5 pt-2.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/85 border border-stone-200/70 text-[11px] font-medium text-stone-600">
                {person.isGhost && !person.isBlankScreenshot ? (
                  <>
                    <StickyNote size={11} className="text-amber-600 shrink-0" />
                    <span>Нотатка</span>
                  </>
                ) : person.gender === 'female' ? (
                  '♀ Жінка'
                ) : person.gender === 'male' ? (
                  '♂ Чоловік'
                ) : (
                  'Особа'
                )}
              </span>

              <button
                type="button"
                onClick={() => {
                  const formatted = formatCardId(person);
                  navigator.clipboard?.writeText(formatted).then(() => {
                    setCopiedCardId(true);
                    setTimeout(() => setCopiedCardId(false), 1500);
                  }).catch(() => {});
                }}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/85 hover:bg-white text-stone-700 hover:text-stone-950 border border-stone-200/80 text-[10.5px] font-mono font-bold shadow-2xs transition-all cursor-pointer shrink-0"
                title={`Унікальний ID картки: ${formatCardId(person)} (натисніть, щоб скопіювати для пошуку)`}
              >
                <span>{formatCardId(person)}</span>
                {copiedCardId ? (
                  <Check size={10.5} className="text-emerald-600 shrink-0" />
                ) : (
                  <Copy size={10} className="text-stone-400 shrink-0" />
                )}
              </button>
            </div>

            {isAdmin && onToggleFullyVerified ? (
              <button
                type="button"
                onClick={() => onToggleFullyVerified(person.id)}
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition-all cursor-pointer border shadow-2xs ${
                  person.isFullyVerified
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700'
                    : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300'
                }`}
                title="Змінити статус перевірки картки"
              >
                {person.isFullyVerified ? (
                  <>
                    <Check size={11.5} strokeWidth={2.8} />
                    <span>Перевірена</span>
                  </>
                ) : (
                  <>
                    <span className="font-bold">?</span>
                    <span>Не перевірена</span>
                  </>
                )}
              </button>
            ) : (
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                  person.isFullyVerified
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-amber-50 text-amber-800 border-amber-200'
                }`}
              >
                {person.isFullyVerified ? (
                  <>
                    <Check size={11} strokeWidth={2.8} />
                    <span>Перевірена</span>
                  </>
                ) : (
                  <>
                    <span className="font-bold">?</span>
                    <span>Не перевірена</span>
                  </>
                )}
              </span>
            )}
          </div>

          {/* Center Profile Identity (Read-Only) */}
          <div className="relative z-10 px-4 pt-2.5 pb-3.5 flex flex-col items-center text-center">
            {!(person.isGhost && !person.isBlankScreenshot) ? (
              <SilhouetteAvatar
                gender={person.gender}
                avatarUrl={person.avatarUrl}
                name={fullName}
                size="lg"
              />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-700 shadow-2xs">
                <StickyNote size={22} />
              </div>
            )}

            <h2 className="mt-2.5 text-[17px] font-bold text-stone-950 leading-snug tracking-tight">
              {fullName}
            </h2>

            {person.patronymic && (
              <p className="text-xs font-medium text-stone-500 mt-0.5">{person.patronymic}</p>
            )}

            {userPersonId === person.id ? (
              <div className="mt-2 flex flex-col items-center gap-1.5">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-700 text-white text-[11px] font-semibold shadow-2xs">
                  <UserCheck size={12} className="shrink-0" />
                  <span>Це ви у дереві</span>
                </div>
                {onOpenGuestCustomize && !person.isBlankScreenshot && (
                  <button
                    type="button"
                    onClick={() => onOpenGuestCustomize(person)}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white hover:bg-emerald-50 dark:bg-zinc-800 dark:hover:bg-emerald-950/60 text-emerald-900 dark:text-emerald-300 text-[11.5px] font-bold border border-emerald-300 dark:border-emerald-700/70 shadow-2xs transition-colors cursor-pointer"
                    title="Змінити аватарку, колір картки та вибрати зовнішню рамку"
                  >
                    <Paintbrush size={12} className="text-emerald-700 dark:text-emerald-400 shrink-0" />
                    <span>Оформити мою картку</span>
                  </button>
                )}
              </div>
            ) : (
              !userPersonId &&
              onSetUserPersonId && (
                <button
                  type="button"
                  onClick={() => onSetUserPersonId(person.id)}
                  className="mt-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 hover:bg-emerald-100 text-emerald-900 text-[11px] font-semibold border border-emerald-200 transition-colors cursor-pointer"
                  title="Позначити цю особу як себе у родинному дереві"
                >
                  <UserCheck size={11} className="text-emerald-700" />
                  <span>Позначити як «Це я»</span>
                </button>
              )
            )}

            {/* Read-Only Metadata Badges */}
            {(person.houseNumber || (person.gender === 'female' && person.maidenName) || person.nickname || lifeDates) && (
              <div className="flex flex-wrap items-center justify-center gap-1.5 mt-2.5">
                {person.houseNumber && (
                  <span className="text-xs text-stone-800 bg-stone-100/90 px-2 py-0.5 rounded-lg border border-stone-200/80 inline-flex items-center gap-1">
                    <Home size={10.5} className="text-amber-700 shrink-0" />
                    <span className="font-semibold tabular-nums text-stone-900">Дім №{person.houseNumber}</span>
                  </span>
                )}

                {person.gender === 'female' && person.maidenName && (
                  <span className="text-xs text-stone-800 bg-stone-100/90 px-2 py-0.5 rounded-lg border border-stone-200/80 inline-flex items-center gap-1">
                    <span className="text-stone-500 text-[10.5px]">дівоче:</span>
                    <span className="font-semibold">{person.maidenName}</span>
                  </span>
                )}

                {person.nickname && (
                  <span className="text-xs font-serif italic text-amber-900 bg-amber-50/90 px-2 py-0.5 rounded-lg border border-amber-200/80">
                    «{person.nickname}»
                  </span>
                )}

                {lifeDates && (
                  <span className="text-xs tabular-nums font-medium text-emerald-950 bg-emerald-50/90 px-2.5 py-0.5 rounded-lg border border-emerald-200/80">
                    {lifeDates}
                  </span>
                )}
              </div>
            )}

            {/* 3 Primary Admin Action Buttons */}
            {isAdmin && (
              <div className="w-full mt-3.5 pt-3 border-t border-stone-100 space-y-2">
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => onEdit(person)}
                    className="h-9 px-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                    title="Редагувати дані, фото, біографію та зв'язки в анкеті"
                  >
                    <Pencil size={13} className="shrink-0" />
                    <span>Редагувати</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsAddRelativeOpen((prev) => !prev)}
                    className={`h-9 px-2 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1 border transition-colors cursor-pointer ${
                      isAddRelativeOpen
                        ? 'bg-stone-900 text-white border-stone-900'
                        : 'bg-stone-50 hover:bg-stone-100 text-stone-800 border-stone-200'
                    }`}
                    title="Створити нову картку родича"
                  >
                    <Plus size={13.5} className="shrink-0" />
                    <span>Родич</span>
                  </button>

                  {onOpenConnectModal ? (
                    <button
                      type="button"
                      onClick={() => onOpenConnectModal(person)}
                      className="h-9 px-2 rounded-xl bg-stone-50 hover:bg-stone-100 text-stone-800 border border-stone-200 text-xs font-semibold inline-flex items-center justify-center gap-1 transition-colors cursor-pointer"
                      title="Зв'язати з наявною карткою"
                    >
                      <Link2 size={13} className="shrink-0" />
                      <span>Зв&apos;язати</span>
                    </button>
                  ) : (
                    <div />
                  )}
                </div>

                {isAddRelativeOpen && (
                  <div className="grid grid-cols-2 gap-1.5 pt-1 animate-in fade-in duration-150">
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddRelativeOpen(false);
                        onAddRelative(person, 'father');
                      }}
                      className="px-2.5 py-2 rounded-xl bg-stone-50/80 hover:bg-emerald-50 border border-stone-200/90 hover:border-emerald-300 text-stone-800 text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <User size={13} className="text-emerald-700 shrink-0" />
                      <span>Батько</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsAddRelativeOpen(false);
                        onAddRelative(person, 'mother');
                      }}
                      className="px-2.5 py-2 rounded-xl bg-stone-50/80 hover:bg-emerald-50 border border-stone-200/90 hover:border-emerald-300 text-stone-800 text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <User size={13} className="text-emerald-700 shrink-0" />
                      <span>Мати</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsAddRelativeOpen(false);
                        onAddRelative(person, 'spouse');
                      }}
                      className="px-2.5 py-2 rounded-xl bg-stone-50/80 hover:bg-rose-50 border border-stone-200/90 hover:border-rose-300 text-stone-800 text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <Heart size={13} className="text-rose-600 shrink-0" />
                      <span>
                        {person.gender === 'female' ? 'Чоловік' : person.gender === 'male' ? 'Дружина' : 'Подружжя'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsAddRelativeOpen(false);
                        onAddRelative(person, 'child');
                      }}
                      className="px-2.5 py-2 rounded-xl bg-stone-50/80 hover:bg-amber-50 border border-stone-200/90 hover:border-amber-300 text-stone-800 text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <Users size={13} className="text-amber-700 shrink-0" />
                      <span>Дитина</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsAddRelativeOpen(false);
                        onAddRelative(person, 'sibling');
                      }}
                      className="col-span-2 px-2.5 py-2 rounded-xl bg-stone-50/80 hover:bg-sky-50 border border-stone-200/90 hover:border-sky-300 text-stone-800 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      <Users size={13} className="text-sky-700 shrink-0" />
                      <span>Брат / Сестра</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* BLANK / PHOTO CARD BANNER (Read-Only preview + jump to full editor) */}
        {person.isBlankScreenshot && (
          <div className="rounded-2xl border-2 border-dashed border-amber-400/90 dark:border-amber-700/80 bg-amber-50/75 dark:bg-amber-950/25 p-3.5 shadow-2xs space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-xl bg-amber-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                <ImagePlus size={14} />
              </span>
              <div className="min-w-0">
                <div className="text-xs font-bold text-stone-900 dark:text-zinc-100 leading-tight">
                  Картка-фото (скріншот)
                </div>
                <div className="text-[10.5px] text-stone-600 dark:text-zinc-400 leading-snug">
                  {person.screenshotUrl
                    ? 'Натисніть на фото для збільшення й фільтрів контрасту'
                    : 'Порожня картка — вставте фото (Ctrl+V) на полотні або відкрийте редактор'}
                </div>
              </div>
            </div>

            {person.screenshotUrl && (
              <div
                onClick={() => setScreenshotLightboxOpen(true)}
                className="group relative rounded-xl overflow-hidden border border-amber-300 dark:border-amber-700 bg-stone-950 cursor-zoom-in shadow-xs"
                title="Відкрити у збільшеному перегляді з фільтрами для розшифровки"
              >
                <img
                  src={person.screenshotUrl}
                  alt={fullName}
                  onError={(e) => handleUploadImageError(e, person.screenshotUrl)}
                  className="w-full max-h-64 object-contain mx-auto"
                />
                <div className="absolute bottom-2 right-2 px-2 py-1 rounded-lg bg-black/75 text-white text-[10px] font-semibold inline-flex items-center gap-1 opacity-90 group-hover:opacity-100 transition-opacity">
                  <ZoomIn size={11.5} />
                  <span>Збільшити / Фільтри</span>
                </div>
              </div>
            )}

            {(person.ghostNote || person.notes) && (
              <div className="p-2.5 rounded-xl bg-white/90 dark:bg-zinc-900/80 border border-dashed border-amber-300 dark:border-amber-800/70 text-xs text-stone-800 dark:text-zinc-200 leading-relaxed whitespace-pre-wrap flex items-start gap-2">
                <StickyNote size={13.5} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <span className="min-w-0 flex-1">{person.ghostNote || person.notes}</span>
              </div>
            )}

            {isAdmin && (
              <button
                type="button"
                onClick={() => onEdit(person)}
                className="w-full px-3 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
              >
                <Pencil size={13} />
                <span>Редагувати або розшифрувати в анкеті</span>
              </button>
            )}
          </div>
        )}

        {/* STICKY NOTE CARD BANNER */}
        {person.isGhost && (
          <div className="rounded-2xl border border-amber-300/90 dark:border-amber-700/80 bg-amber-50/90 dark:bg-amber-950/25 p-3.5 shadow-2xs space-y-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-7 h-7 rounded-xl bg-amber-400 text-amber-950 flex items-center justify-center shrink-0 shadow-2xs">
                <StickyNote size={14} />
              </span>
              <div className="min-w-0">
                <div className="text-xs font-bold text-amber-950 dark:text-amber-200 leading-tight">
                  Нотатка-стікер на полотні
                </div>
                <div className="text-[10.5px] text-amber-800/85 dark:text-amber-300/80 leading-snug">
                  Усі зв&apos;язки з картками відображаються пунктирною лінією
                </div>
              </div>
            </div>

            {(person.ghostNote || person.notes) && (
              <div className="p-2.5 rounded-xl bg-white/95 dark:bg-zinc-950/80 border border-amber-200 dark:border-amber-800/70 text-xs text-stone-800 dark:text-zinc-200 leading-relaxed whitespace-pre-wrap flex items-start gap-2">
                <StickyNote size={13.5} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <span className="min-w-0 flex-1">{person.ghostNote || person.notes}</span>
              </div>
            )}

            {isAdmin && onToggleGhostStatus && (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                <button
                  type="button"
                  onClick={() => onToggleGhostStatus(person.id, false, true)}
                  className="flex-1 min-w-[140px] px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                >
                  <UserCheck size={13.5} className="shrink-0" />
                  <span>Заповнити як особу</span>
                </button>
                <button
                  type="button"
                  onClick={() => onToggleGhostStatus(person.id, false)}
                  className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-zinc-800 hover:bg-stone-100 text-stone-700 dark:text-zinc-200 border border-stone-300 dark:border-zinc-600 text-[11px] font-semibold inline-flex items-center justify-center gap-1 transition-colors cursor-pointer"
                >
                  <Check size={12} />
                  <span>Звичайна картка</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* PROPOSAL CARD REVIEW BANNER */}
        {person.isProposal && (
          <div className="rounded-2xl border-2 border-sky-400/90 bg-sky-50/90 p-3.5 shadow-2xs space-y-2.5">
            <div className="flex items-start gap-2.5">
              <span className="w-7 h-7 rounded-xl bg-sky-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                <UserPlus size={14} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-bold text-sky-950 leading-tight">
                    Картка-пропозиція від гостя
                  </span>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-500 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-600" />
                  </span>
                </div>
                <div className="text-[11px] text-sky-900/90 leading-snug mt-0.5">
                  Автор: <strong>{person.proposalMeta?.authorName || 'Гість'}</strong>
                  {person.proposalMeta?.targetPersonId && allPersons[person.proposalMeta.targetPersonId] && (
                    <span>
                      {' '}· для{' '}
                      <button
                        type="button"
                        onClick={() => onSelectPerson(person.proposalMeta!.targetPersonId)}
                        className="underline font-semibold hover:text-sky-700 cursor-pointer"
                      >
                        {allPersons[person.proposalMeta.targetPersonId].firstName}{' '}
                        {allPersons[person.proposalMeta.targetPersonId].lastName}
                      </button>
                    </span>
                  )}
                </div>
              </div>
            </div>

            {person.proposalMeta?.note && (
              <div className="p-2.5 rounded-xl bg-white border border-sky-200 text-xs text-stone-800 leading-relaxed whitespace-pre-wrap">
                {person.proposalMeta.note}
              </div>
            )}

            {isAdmin ? (
              confirmDeleteProposal ? (
                <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-rose-50 border border-rose-200">
                  <span className="text-[11px] font-semibold text-rose-800">
                    Видалити пропозицію?
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmDeleteProposal(false);
                        onDeleteProposal?.(person.id);
                        onClose();
                      }}
                      className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-semibold cursor-pointer"
                    >
                      Так
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteProposal(false)}
                      className="px-2 py-1 rounded-lg bg-white text-stone-600 border border-stone-200 text-[11px] font-semibold cursor-pointer"
                    >
                      Ні
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {onApproveProposal && (
                    <button
                      type="button"
                      onClick={() => onApproveProposal(person.id)}
                      className="flex-1 min-w-[120px] px-2.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-semibold inline-flex items-center justify-center gap-1 transition-colors cursor-pointer shadow-2xs"
                    >
                      <Check size={12.5} />
                      <span>Підтвердити картку</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onEdit(person)}
                    className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-sky-100 text-sky-900 border border-sky-300 text-[11px] font-semibold inline-flex items-center justify-center gap-1 transition-colors cursor-pointer"
                  >
                    <Pencil size={12} />
                    <span>Редагувати</span>
                  </button>
                  {onDeleteProposal && (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteProposal(true)}
                      className="px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[11px] font-semibold inline-flex items-center justify-center gap-1 transition-colors cursor-pointer"
                      title="Відхилити та видалити картку-пропозицію"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              )
            ) : (
              <div className="text-[11px] text-sky-800 font-medium">
                Очікує перевірки й затвердження адміністратором родоводу.
              </div>
            )}
          </div>
        )}

        {/* PENDING GUEST CLARIFICATIONS */}
        {(() => {
          const pendingSuggestions = (person.guestSuggestions || []).filter(
            (s) => s.status === 'pending'
          );
          if (pendingSuggestions.length === 0) return null;

          const fieldLabels: Record<string, string> = {
            birthDate: 'Дата нар.',
            birthYear: 'Рік нар.',
            deathDate: 'Дата смерті',
            deathYear: 'Рік смерті',
            birthPlace: 'Місце нар.',
            residencePlace: 'Проживання',
            maidenName: 'Дівоче',
            nickname: 'Прізвисько',
            profession: 'Професія',
          };

          return (
            <div className="rounded-2xl border-2 border-amber-300/90 bg-amber-50/75 p-3.5 shadow-2xs space-y-2.5">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-amber-950 flex items-center gap-2">
                <span className="relative w-6 h-6 rounded-lg bg-amber-500 text-white flex items-center justify-center shrink-0">
                  <span className="animate-ping absolute inset-0 rounded-lg bg-amber-400 opacity-60 pointer-events-none" />
                  <MessageSquareDot size={13} className="relative z-10" />
                </span>
                <span>Уточнення від гостей ({pendingSuggestions.length})</span>
              </h4>

              <div className="space-y-2">
                {pendingSuggestions.map((s) => {
                  const fields = Object.entries(s.suggestedFields || {}).filter(([, v]) =>
                    Boolean(v && String(v).trim())
                  );
                  return (
                    <div
                      key={s.id}
                      className="p-2.5 rounded-xl bg-white border border-amber-200/90 space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2 text-[10.5px] text-stone-500">
                        <span className="font-bold text-stone-800">{s.authorName || 'Гість'}</span>
                        <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-semibold text-[9.5px]">
                          {s.category === 'memory'
                            ? 'Спогад'
                            : s.category === 'date_place'
                            ? 'Дата / місце'
                            : s.category === 'document_hint'
                            ? 'Документ'
                            : 'Уточнення'}
                        </span>
                      </div>
                      <p className="text-stone-800 leading-relaxed whitespace-pre-wrap">
                        {s.message}
                      </p>
                      {fields.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {fields.map(([k, val]) => (
                            <span
                              key={k}
                              className="px-1.5 py-0.5 rounded bg-sky-50 border border-sky-200 text-[10px] text-sky-900"
                            >
                              {fieldLabels[k] || k}: <strong>{String(val)}</strong>
                            </span>
                          ))}
                        </div>
                      )}
                      {isAdmin && onResolveGuestSuggestion && (
                        <div className="flex flex-wrap items-center justify-end gap-1.5 pt-1 border-t border-stone-100">
                          <button
                            type="button"
                            onClick={() => onResolveGuestSuggestion(person.id, s.id, 'reject')}
                            className="px-2 py-1 rounded-lg bg-stone-100 hover:bg-rose-50 text-stone-600 hover:text-rose-700 text-[10.5px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Ban size={11} />
                            <span>Відхилити</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onResolveGuestSuggestion(person.id, s.id, 'approve')}
                            className="px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-[10.5px] font-semibold inline-flex items-center gap-1 cursor-pointer shadow-2xs"
                          >
                            <Check size={11.5} />
                            <span>Затвердити в 1 клік</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* GUEST MODE CONTRIBUTION ACTIONS */}
        {!isAdmin && !person.isBlankScreenshot && (onOpenGuestSuggestion || (onOpenProposeRelative && !person.isProposal)) && (
          <div className="bg-white rounded-2xl border border-amber-200/90 p-3.5 shadow-2xs space-y-2.5">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-amber-950 flex items-center gap-1.5">
              <Sparkles size={13} className="text-amber-600" />
              <span>Допомогти доповнити родовід</span>
            </h4>
            <div className="space-y-1.5">
              {onOpenGuestSuggestion && (
                <button
                  type="button"
                  onClick={() => onOpenGuestSuggestion(person)}
                  className="w-full px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-950 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <MessageSquarePlus size={14} className="text-amber-700 shrink-0" />
                  <span>Запропонувати нотатку / уточнення</span>
                </button>
              )}
              {onOpenProposeRelative && !person.isProposal && (
                <button
                  type="button"
                  onClick={() => onOpenProposeRelative(person)}
                  className="w-full px-3 py-2 rounded-xl bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-950 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <UserPlus size={14} className="text-sky-700 shrink-0" />
                  <span>Запропонувати родича</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* BIOGRAPHICAL ARCHIVE SUMMARY (Read-Only) */}
        {hasBiographicalDetails && (
          <div className="bg-white rounded-2xl border border-stone-200/90 p-3.5 shadow-2xs space-y-2">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-stone-600 flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-stone-100 text-stone-700 flex items-center justify-center shrink-0">
                <FileText size={13} />
              </span>
              <span>Основна інформація</span>
            </h4>
            <div className="divide-y divide-stone-100 text-xs">
              {formattedBirth && (
                <div className="flex items-center justify-between py-2 first:pt-0 last:pb-0 gap-2">
                  <span className="text-stone-500 shrink-0">Народження</span>
                  <div className="flex items-center gap-1 justify-end min-w-0">
                    {birthExternalLink ? (
                      <a
                        href={birthExternalLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="tabular-nums font-semibold px-2 py-0.5 rounded-lg inline-flex items-center gap-1.5 transition-colors cursor-pointer bg-sky-50 hover:bg-sky-100 text-sky-950 border border-sky-200/90"
                        title={`Відкрити посилання на метрику про народження (${birthExternalLink})`}
                      >
                        <Link2 size={12} className="text-sky-700 shrink-0" />
                        <span>{formattedBirth}</span>
                        {personAge && (
                          <span className="text-[10px] font-semibold text-emerald-900 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200/60">
                            {personAge}
                          </span>
                        )}
                        <ExternalLink size={11} className="text-sky-600 shrink-0" />
                      </a>
                    ) : (isAdmin || hasBirthMetric) && onOpenMetricModal ? (
                      <button
                        type="button"
                        onClick={() => onOpenMetricModal(person, 'birth')}
                        className={`tabular-nums font-medium px-2 py-0.5 rounded-lg inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                          hasBirthMetric
                            ? 'bg-amber-100/90 hover:bg-amber-200 text-amber-950 font-semibold border border-amber-300/80'
                            : 'bg-stone-100 hover:bg-stone-200 text-stone-800'
                        }`}
                      >
                        <Camera size={12} className={hasBirthMetric ? 'text-amber-800 shrink-0' : 'text-stone-400 shrink-0'} />
                        <span>{formattedBirth}</span>
                        {personAge && (
                          <span className="text-[10px] font-semibold text-emerald-900 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200/60">
                            {personAge}
                          </span>
                        )}
                      </button>
                    ) : (
                      <span className="tabular-nums font-semibold text-stone-900 inline-flex items-center gap-1.5 flex-wrap justify-end">
                        <span>{formattedBirth}</span>
                        {personAge && (
                          <span className="text-[10px] font-semibold text-emerald-900 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200/60">
                            {personAge}
                          </span>
                        )}
                      </span>
                    )}
                    {birthExternalLink && (isAdmin || hasBirthMetric) && onOpenMetricModal && (
                      <button
                        type="button"
                        onClick={() => onOpenMetricModal(person, 'birth')}
                        className="p-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-600 hover:text-stone-900 transition-colors cursor-pointer shrink-0"
                        title="Переглянути або додати документи метрики"
                      >
                        <Camera size={12} />
                      </button>
                    )}
                  </div>
                </div>
              )}

              {formattedDeath && (
                <div className="flex items-center justify-between py-2 first:pt-0 last:pb-0 gap-2">
                  <span className="text-stone-500 shrink-0">Смерть</span>
                  <div className="flex items-center gap-1 justify-end min-w-0">
                    {deathExternalLink ? (
                      <a
                        href={deathExternalLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="tabular-nums font-semibold px-2 py-0.5 rounded-lg inline-flex items-center gap-1.5 transition-colors cursor-pointer bg-sky-50 hover:bg-sky-100 text-sky-950 border border-sky-200/90"
                        title={`Відкрити посилання на метрику про смерть (${deathExternalLink})`}
                      >
                        <Link2 size={12} className="text-sky-700 shrink-0" />
                        <span>{formattedDeath}</span>
                        <ExternalLink size={11} className="text-sky-600 shrink-0" />
                      </a>
                    ) : (isAdmin || hasDeathMetric) && onOpenMetricModal ? (
                      <button
                        type="button"
                        onClick={() => onOpenMetricModal(person, 'death')}
                        className={`tabular-nums font-medium px-2 py-0.5 rounded-lg inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                          hasDeathMetric
                            ? 'bg-amber-100/90 hover:bg-amber-200 text-amber-950 font-semibold border border-amber-300/80'
                            : 'bg-stone-100 hover:bg-stone-200 text-stone-800'
                        }`}
                      >
                        <Camera size={12} className={hasDeathMetric ? 'text-amber-800 shrink-0' : 'text-stone-400 shrink-0'} />
                        <span>{formattedDeath}</span>
                      </button>
                    ) : (
                      <span className="tabular-nums font-semibold text-stone-900">{formattedDeath}</span>
                    )}
                    {deathExternalLink && (isAdmin || hasDeathMetric) && onOpenMetricModal && (
                      <button
                        type="button"
                        onClick={() => onOpenMetricModal(person, 'death')}
                        className="p-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-600 hover:text-stone-900 transition-colors cursor-pointer shrink-0"
                        title="Переглянути або додати документи метрики"
                      >
                        <Camera size={12} />
                      </button>
                    )}
                  </div>
                </div>
              )}

              {person.birthPlace && (
                <div className="flex items-start justify-between py-2 first:pt-0 last:pb-0 gap-3">
                  <span className="text-stone-500 shrink-0">Місце народж.</span>
                  <span className="text-stone-900 font-medium text-right break-words min-w-0">
                    {person.birthPlace}
                  </span>
                </div>
              )}

              {person.residencePlace && (
                <div className="flex items-start justify-between py-2 first:pt-0 last:pb-0 gap-3">
                  <span className="text-stone-500 shrink-0">Проживання</span>
                  <span className="text-stone-900 font-medium text-right break-words min-w-0">
                    {person.residencePlace}
                  </span>
                </div>
              )}

              {person.deathPlace && (
                <div className="flex items-start justify-between py-2 first:pt-0 last:pb-0 gap-3">
                  <span className="text-stone-500 shrink-0">Місце смерті</span>
                  <span className="text-stone-900 font-medium text-right break-words min-w-0">
                    {person.deathPlace}
                  </span>
                </div>
              )}

              {person.burialPlace && (
                <div className="flex items-start justify-between py-2 first:pt-0 last:pb-0 gap-3">
                  <span className="text-stone-500 shrink-0">Поховання</span>
                  <span className="text-stone-900 font-medium text-right break-words min-w-0">
                    {person.burialPlace}
                  </span>
                </div>
              )}

              {person.houseNumber && (
                <div className="flex items-center justify-between py-2 first:pt-0 last:pb-0 gap-3">
                  <span className="text-stone-500 shrink-0">Номер дому</span>
                  <span className="tabular-nums font-bold text-emerald-800">№{person.houseNumber}</span>
                </div>
              )}

              {person.profession && (
                <div className="flex items-start justify-between py-2 first:pt-0 last:pb-0 gap-3">
                  <span className="text-stone-500 shrink-0">Професія</span>
                  <span className="font-semibold text-stone-900 text-right break-words min-w-0">
                    {person.profession}
                  </span>
                </div>
              )}

              {person.deathCause && (
                <div className="flex items-start justify-between py-2 first:pt-0 last:pb-0 gap-3">
                  <span className="text-stone-500 shrink-0">Причина смерті</span>
                  <span className="text-stone-800 italic text-right break-words min-w-0">
                    {person.deathCause}
                  </span>
                </div>
              )}

              {person.godparents && (
                <div className="flex items-start justify-between py-2 first:pt-0 last:pb-0 gap-3">
                  <span className="text-stone-500 shrink-0">Хресні / Куми</span>
                  <span className="text-stone-900 font-medium text-right break-words min-w-0">
                    {person.godparents}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* BIOGRAPHY (Read-Only) */}
        {!person.isBlankScreenshot && (person.biography || (!isAdmin && onOpenGuestSuggestion)) && (
          <div className="bg-white rounded-2xl p-3.5 border border-stone-200/90 shadow-2xs space-y-2">
            <h4 className="text-[11px] font-bold text-stone-700 uppercase tracking-wider flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                <BookOpen size={13} />
              </span>
              <span>Біографія</span>
            </h4>
            {person.biography ? (
              <p className="text-xs text-stone-700 leading-relaxed whitespace-pre-wrap">{person.biography}</p>
            ) : (
              <div className="text-xs text-stone-500 leading-relaxed space-y-2">
                <p>Детальна біографія цієї особи ще не додана.</p>
                {!isAdmin && onOpenGuestSuggestion && (
                  <button
                    type="button"
                    onClick={() => onOpenGuestSuggestion(person)}
                    className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-800 hover:text-amber-950 underline cursor-pointer"
                  >
                    <MessageSquarePlus size={12} />
                    <span>Поділитися спогадом або нотаткою →</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* NOTES */}
        {person.notes && !person.isBlankScreenshot && !person.isGhost && (
          <div className="bg-white rounded-2xl p-3.5 border border-stone-200/90 shadow-2xs space-y-2">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-stone-700 flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
                <StickyNote size={13} />
              </span>
              <span>Примітки</span>
            </h4>
            <p className="text-xs text-stone-700 leading-relaxed whitespace-pre-wrap">
              {person.notes}
            </p>
          </div>
        )}

        {/* INTERESTING STORIES */}
        {person.interestingStories && (
          <div className="bg-white rounded-2xl p-3.5 border border-amber-200/90 shadow-2xs space-y-2">
            <h4 className="text-[11px] font-bold text-amber-950 uppercase tracking-wider flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <Sparkles size={13} />
              </span>
              <span>Цікаві історії</span>
            </h4>
            <p className="text-xs text-stone-700 leading-relaxed whitespace-pre-wrap">
              {person.interestingStories}
            </p>
          </div>
        )}

        {/* CLAN / LINEAGE CARD (Read-Only + Coat of Arms viewer) */}
        {(person.clanName || personClanName) && (
          <div className="bg-white rounded-2xl border border-stone-200/90 p-3 shadow-2xs">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                {personClanInfo?.coatOfArmsUrl ? (
                  <img
                    src={personClanInfo.coatOfArmsUrl}
                    alt={`Герб ${personClanInfo.name}`}
                    onError={(e) => handleUploadImageError(e, personClanInfo.coatOfArmsUrl)}
                    className="w-8 h-8 object-contain rounded-lg border border-stone-200/80 bg-stone-50 p-0.5 shrink-0 cursor-pointer"
                    onClick={() => onOpenClanCoatOfArmsModal && onOpenClanCoatOfArmsModal(personClanInfo)}
                    title="Переглянути герб роду"
                  />
                ) : (
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border"
                    style={{
                      backgroundColor: personClanInfo?.badgeBg || '#fef3c7',
                      color: personClanInfo?.color || '#92400e',
                      borderColor: personClanInfo?.borderColor || '#fde68a',
                    }}
                  >
                    <Shield size={15} />
                  </div>
                )}
                <div className="min-w-0 text-left">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-stone-400 leading-none">
                    Рід
                  </div>
                  <div className="text-sm font-bold text-stone-900 truncate mt-0.5">
                    {person.clanName || personClanName}
                  </div>
                </div>
              </div>

              {personClanInfo && onOpenClanCoatOfArmsModal && (isAdmin || personClanInfo.coatOfArmsUrl) && (
                <button
                  type="button"
                  onClick={() => onOpenClanCoatOfArmsModal(personClanInfo)}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200/90 transition-colors cursor-pointer shrink-0"
                  title="Герб роду"
                >
                  {personClanInfo.coatOfArmsUrl ? 'Герб ✓' : '+ Герб'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* GEOGRAPHY */}
        {person.migrationNotes && (
          <div className="bg-white rounded-2xl p-3.5 border border-stone-200/90 shadow-2xs space-y-2">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-stone-700 flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-sky-50 text-sky-700 flex items-center justify-center shrink-0">
                <MapPin size={13} />
              </span>
              <span>Міграція та переїзди</span>
            </h4>
            <p className="text-xs text-stone-800 leading-relaxed whitespace-pre-wrap">{person.migrationNotes}</p>
          </div>
        )}

        {/* EDUCATION & WORK */}
        {(person.education || person.workplaceNotes) && (
          <div className="bg-white rounded-2xl p-3.5 border border-stone-200/90 shadow-2xs space-y-2">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-stone-700 flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0">
                <Briefcase size={13} />
              </span>
              <span>Навчання й служба</span>
            </h4>
            <div className="text-xs space-y-1.5 text-stone-800">
              {person.education && (
                <div><span className="text-stone-500 font-medium">Освіта:</span> {person.education}</div>
              )}
              {person.workplaceNotes && (
                <div><span className="text-stone-500 font-medium">Робота / служба:</span> {person.workplaceNotes}</div>
              )}
            </div>
          </div>
        )}

        {/* MIDWIFE */}
        {person.midwife && (
          <div className="bg-white rounded-2xl p-3.5 border border-stone-200/90 shadow-2xs space-y-1.5">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-stone-700 flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                <UserCheck size={13} />
              </span>
              <span>Повитуха</span>
            </h4>
            <p className="text-xs text-stone-800">{person.midwife}</p>
          </div>
        )}

        {/* PETS SECTION */}
        {person.pets && person.pets.length > 0 && (
          <div className="bg-white dark:bg-zinc-900 rounded-2xl p-3.5 border border-stone-200/90 dark:border-zinc-800 shadow-2xs space-y-2">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-stone-700 dark:text-zinc-300 flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0">
                <Dog size={13} />
              </span>
              <span>Домашні улюбленці ({person.pets.length})</span>
            </h4>
            <div className="space-y-1.5">
              {person.pets.map((pet) => (
                <div key={pet.id} className="flex items-center gap-2.5 p-2 bg-stone-50/80 dark:bg-zinc-800/70 rounded-xl border border-stone-200/80 dark:border-zinc-700/80">
                  <div className="w-11 h-11 rounded-xl bg-amber-100 dark:bg-amber-900/50 border border-amber-200 dark:border-amber-700/70 text-amber-900 dark:text-amber-200 flex items-center justify-center font-bold text-lg shrink-0 overflow-hidden">
                    {pet.avatarUrl ? (
                      <img
                        src={pet.avatarUrl}
                        alt={pet.name}
                        onError={(e) => handleUploadImageError(e, pet.avatarUrl)}
                        className="w-full h-full object-cover"
                      />
                    ) : pet.type === 'cat' ? (
                      '🐱'
                    ) : pet.type === 'bird' ? (
                      '🦜'
                    ) : pet.type === 'horse' ? (
                      '🐴'
                    ) : pet.type === 'cow' ? (
                      '🐮'
                    ) : pet.type === 'other' ? (
                      '🐾'
                    ) : (
                      '🐶'
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-stone-900 dark:text-zinc-100 truncate">{pet.name}</span>
                      {pet.isCouplePet && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300 font-semibold shrink-0">
                          Пара
                        </span>
                      )}
                    </div>
                    {pet.breed && <span className="text-[10px] text-stone-500 dark:text-zinc-400 block truncate">{pet.breed}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* FAMILY CONNECTIONS HIERARCHY (Relative Navigation) */}
        <div className="bg-white rounded-2xl p-3.5 border border-stone-200/90 shadow-2xs space-y-3.5">
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-stone-600 flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-stone-100 text-stone-700 flex items-center justify-center shrink-0">
              <Users size={13} />
            </span>
            <span>Родинні зв&apos;язки</span>
          </h4>

          {/* Parents */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-stone-500 block">Батьки</span>
            {parents.length === 0 ? (
              <p className="text-xs text-stone-400 italic">Не вказані</p>
            ) : (
              parents.map((p) => {
                const isUnverified = person.unverifiedRelations?.includes(p.id);
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-stone-50/70 hover:bg-stone-100/90 border border-stone-200/60 text-xs text-stone-800 transition-colors group"
                  >
                    <button
                      type="button"
                      onClick={() => onSelectPerson(p.id)}
                      className="font-medium group-hover:text-emerald-800 flex items-center gap-1.5 truncate text-left cursor-pointer min-w-0 flex-1"
                    >
                      <span className="truncate">{p.firstName} {p.lastName}</span>
                      {p.houseNumber && (
                        <span className="text-[9.5px] tabular-nums font-semibold text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded shrink-0">
                          №{p.houseNumber}
                        </span>
                      )}
                    </button>
                    {isAdmin && onToggleRelationVerification ? (
                      <button
                        type="button"
                        onClick={() => onToggleRelationVerification(person.id, p.id)}
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border transition-colors shrink-0 cursor-pointer inline-flex items-center gap-1 ${
                          isUnverified
                            ? 'bg-white text-stone-600 border-stone-300 hover:bg-stone-100'
                            : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                        }`}
                        title="Змінити достовірність зв'язку"
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${isUnverified ? 'bg-stone-400' : 'bg-emerald-500'}`} />
                        <span>{isUnverified ? 'Неперевірений' : 'Достовірний'}</span>
                      </button>
                    ) : (
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${isUnverified ? 'bg-stone-300' : 'bg-emerald-500'}`}
                        title={isUnverified ? 'Неперевірений зв’язок' : 'Достовірний зв’язок'}
                      />
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Spouses */}
          <div className="space-y-2 pt-2 border-t border-stone-100">
            <span className="text-[11px] font-semibold text-stone-600 flex items-center gap-1.5">
              <Heart size={12} className="text-rose-600" />
              <span>
                {person.gender === 'female'
                  ? 'Чоловік / Подружжя'
                  : person.gender === 'male'
                  ? 'Дружина / Подружжя'
                  : 'Подружжя'}{' '}
                ({spouses.length})
              </span>
            </span>

            {spouses.length === 0 ? (
              <p className="text-xs text-stone-400 italic">Немає</p>
            ) : (
              spouses.map((s) => {
                const isUnverified = person.unverifiedRelations?.includes(s.id);
                const mKey = [person.id, s.id].sort().join('::');
                const connId = `marriage:${mKey}`;
                const override = connectionOverrides?.[connId];
                const isDivorced = override?.eventType === 'divorce';
                const isCohabitation = override?.eventType === 'cohabitation';

                return (
                  <div
                    key={s.id}
                    className={`p-2.5 rounded-xl text-xs transition-colors border flex flex-col gap-1.5 ${
                      isDivorced
                        ? 'bg-rose-50/40 border-rose-200/70'
                        : isCohabitation
                        ? 'bg-emerald-50/40 border-emerald-200/70'
                        : 'bg-stone-50/70 border-stone-200/80'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <button
                        type="button"
                        onClick={() => onSelectPerson(s.id)}
                        className="font-semibold text-stone-900 hover:text-rose-800 flex items-center gap-1.5 truncate text-left cursor-pointer min-w-0"
                      >
                        <span className="truncate">{s.firstName} {s.lastName}</span>
                        {s.maidenName && (
                          <span className="text-[10px] text-stone-500 font-normal truncate">
                            ({s.maidenName})
                          </span>
                        )}
                        {s.houseNumber && (
                          <span className="text-[9.5px] tabular-nums font-semibold text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded shrink-0">
                            №{s.houseNumber}
                          </span>
                        )}
                      </button>

                      {isDivorced ? (
                        <span className="px-1.5 py-0.5 rounded-md text-[9.5px] font-bold bg-rose-100 text-rose-900 border border-rose-200 flex items-center gap-1 shrink-0">
                          <span>💔 Розлучені</span>
                          {override?.eventDate && <span className="tabular-nums">({override.eventDate})</span>}
                        </span>
                      ) : isCohabitation ? (
                        <span className="px-1.5 py-0.5 rounded-md text-[9.5px] font-bold bg-emerald-100 text-emerald-950 border border-emerald-200 flex items-center gap-1 shrink-0">
                          <span>Без шлюбу</span>
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded-md text-[9.5px] font-bold bg-amber-50 text-amber-900 border border-amber-200 flex items-center gap-1 shrink-0">
                          <span>💍 Шлюб</span>
                          {override?.eventDate && <span className="tabular-nums">({override.eventDate})</span>}
                        </span>
                      )}
                    </div>

                    {(isAdmin || onToggleRelationVerification) && (
                      <div className="flex items-center justify-between pt-1.5 border-t border-stone-200/60">
                        <div>
                          {isAdmin && onToggleRelationVerification ? (
                            <button
                              type="button"
                              onClick={() => onToggleRelationVerification(person.id, s.id)}
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border transition-colors shrink-0 cursor-pointer inline-flex items-center gap-1 ${
                                isUnverified
                                  ? 'bg-white text-stone-600 border-stone-300'
                                  : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              }`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${isUnverified ? 'bg-stone-400' : 'bg-emerald-500'}`} />
                              <span>{isUnverified ? 'Неперевірений' : 'Достовірний'}</span>
                            </button>
                          ) : (
                            <span className="text-[10px] text-stone-500 inline-flex items-center gap-1">
                              <span className={`w-1.5 h-1.5 rounded-full ${isUnverified ? 'bg-stone-300' : 'bg-emerald-500'}`} />
                              <span>{isUnverified ? 'Неперевірений зв’язок' : 'Підтверджений зв’язок'}</span>
                            </span>
                          )}
                        </div>

                        {isAdmin && (
                          <div className="flex items-center gap-1 shrink-0">
                            {!isDivorced && onDisconnectSpouse && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDisconnectSpouse(person.id, s.id);
                                }}
                                className="px-2 py-0.5 text-[10px] font-semibold text-rose-700 hover:text-rose-900 bg-rose-50 hover:bg-rose-100 rounded-md border border-rose-200 flex items-center gap-1 transition-colors cursor-pointer"
                              >
                                <HeartCrack size={11} className="text-rose-600" />
                                <span>Розлучення</span>
                              </button>
                            )}
                            {onEditMarriageConnection && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onEditMarriageConnection(connId);
                                }}
                                className="p-1 text-stone-500 hover:text-stone-800 hover:bg-stone-100 rounded-md border border-stone-200 transition-colors cursor-pointer"
                                title={isDivorced ? 'Редагувати деталі розлучення' : 'Редагувати дату шлюбу, вінчання'}
                              >
                                <Settings size={12} />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Siblings */}
          <div className="space-y-1.5 pt-2 border-t border-stone-100">
            <span className="text-[11px] font-semibold text-stone-500 block">Брати та сестри</span>
            {siblings.length === 0 ? (
              <p className="text-xs text-stone-400 italic">Немає або не вказані</p>
            ) : (
              siblings.map((sib) => (
                <button
                  key={sib.id}
                  type="button"
                  onClick={() => onSelectPerson(sib.id)}
                  className="w-full text-left px-2.5 py-1.5 rounded-xl bg-stone-50/70 hover:bg-sky-50 border border-stone-200/60 flex items-center justify-between text-xs text-stone-800 transition-colors group cursor-pointer"
                >
                  <span className="font-medium group-hover:text-sky-800 flex items-center gap-1.5 truncate">
                    <span className="truncate">{sib.firstName} {sib.lastName}</span>
                    {sib.houseNumber && (
                      <span className="text-[9.5px] tabular-nums font-semibold text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded shrink-0">
                        №{sib.houseNumber}
                      </span>
                    )}
                  </span>
                  <ChevronRight size={14} className="text-stone-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
                </button>
              ))
            )}
          </div>

          {/* Children */}
          <div className="space-y-1.5 pt-2 border-t border-stone-100">
            <span className="text-[11px] font-semibold text-stone-500 block">Діти</span>
            {children.length === 0 ? (
              <p className="text-xs text-stone-400 italic">Немає</p>
            ) : (
              children.map((c) => {
                const isUnverified = person.unverifiedRelations?.includes(c.id);
                return (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-stone-50/70 hover:bg-amber-50/60 border border-stone-200/60 text-xs text-stone-800 transition-colors group"
                  >
                    <button
                      type="button"
                      onClick={() => onSelectPerson(c.id)}
                      className="font-medium group-hover:text-amber-900 flex items-center gap-1.5 truncate text-left cursor-pointer min-w-0 flex-1"
                    >
                      <span className="truncate">{c.firstName} {c.lastName}</span>
                      {c.houseNumber && (
                        <span className="text-[9.5px] tabular-nums font-semibold text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded shrink-0">
                          №{c.houseNumber}
                        </span>
                      )}
                    </button>
                    {isAdmin && onToggleRelationVerification ? (
                      <button
                        type="button"
                        onClick={() => onToggleRelationVerification(person.id, c.id)}
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border transition-colors shrink-0 cursor-pointer inline-flex items-center gap-1 ${
                          isUnverified
                            ? 'bg-white text-stone-600 border-stone-300 hover:bg-stone-100'
                            : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${isUnverified ? 'bg-stone-400' : 'bg-emerald-500'}`} />
                        <span>{isUnverified ? 'Неперевірений' : 'Достовірний'}</span>
                      </button>
                    ) : (
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${isUnverified ? 'bg-stone-300' : 'bg-emerald-500'}`}
                        title={isUnverified ? 'Неперевірений зв’язок' : 'Достовірний зв’язок'}
                      />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* CROSS-CANVAS LINKS SECTION */}
        {(() => {
          const outgoingCross = getPersonCrossCanvasLinks(person);
          const incomingCross: Array<{
            sourceTreeId: string;
            sourceTreeTitle: string;
            sourcePerson: Person;
            linkLabel?: string;
            linkColor?: string;
          }> = [];

          crossCanvasTrees.forEach((ct) => {
            if (currentTreeId && isSameCanvasId(ct.treeId, currentTreeId)) return;
            (ct.persons || []).forEach((other) => {
              const links = getPersonCrossCanvasLinks(other);
              const match = links.find(
                (l) =>
                  (!currentTreeId || isSameCanvasId(l.targetCanvasId, currentTreeId)) &&
                  (l.targetPersonId === person.id || other.targetCanvasPersonId === person.id)
              );
              if (match) {
                incomingCross.push({
                  sourceTreeId: ct.treeId,
                  sourceTreeTitle: ct.treeTitle,
                  sourcePerson: other,
                  linkLabel: match.label,
                  linkColor: match.color,
                });
              }
            });
          });

          if (outgoingCross.length === 0 && incomingCross.length === 0 && !isAdmin) {
            return null;
          }

          return (
            <div className="bg-white rounded-2xl p-3.5 border border-emerald-200/90 shadow-2xs space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-emerald-950 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                    <ExternalLink size={13} />
                  </span>
                  <span>Міжгілкові зв&apos;язки ({outgoingCross.length + incomingCross.length})</span>
                </h4>
                {isAdmin && onOpenBranchLinkModal && (
                  <button
                    type="button"
                    onClick={() => onOpenBranchLinkModal(person)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10.5px] font-semibold transition-colors cursor-pointer"
                  >
                    <Plus size={11} />
                    <span>Додати</span>
                  </button>
                )}
              </div>

              {outgoingCross.length === 0 && incomingCross.length === 0 ? (
                <p className="text-xs text-stone-400 italic">
                  Немає зв&apos;язків з іншими полотнами (гілками)
                </p>
              ) : (
                <div className="space-y-1.5">
                  {outgoingCross.map((ccl) => (
                    <div
                      key={ccl.id}
                      className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-emerald-50/50 hover:bg-emerald-100/70 border border-emerald-200/70 text-xs transition-colors group"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          onSelectTree?.(ccl.targetCanvasId, ccl.targetPersonId || undefined, person.id)
                        }
                        className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer"
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: ccl.color || '#047857' }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-stone-900 group-hover:text-emerald-900 truncate flex items-center gap-1.5 flex-wrap">
                            <span className="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-900 text-[9.5px] font-bold shrink-0">
                              {ccl.targetCanvasTitle || 'Полотно'}
                            </span>
                            {ccl.targetCardId && (
                              <span className="px-1 py-0.2 rounded bg-white border border-emerald-200 text-stone-700 font-mono text-[9.5px] font-bold shrink-0">
                                {ccl.targetCardId}
                              </span>
                            )}
                            {ccl.targetPersonName && (
                              <span className="truncate">→ {ccl.targetPersonName}</span>
                            )}
                          </div>
                          {ccl.label && (
                            <div className="text-[10px] text-emerald-800 truncate mt-0.5">
                              {ccl.label}
                            </div>
                          )}
                        </div>
                        <ExternalLink size={12} className="text-emerald-600 shrink-0" />
                      </button>

                      {isAdmin && onRemoveCrossCanvasLink && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveCrossCanvasLink(person.id, ccl.id);
                          }}
                          className="p-1 rounded-md text-stone-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer shrink-0"
                          title="Прибрати зв'язок між полотнами"
                        >
                          <Trash2 size={12.5} />
                        </button>
                      )}
                    </div>
                  ))}

                  {incomingCross.map((inc) => {
                    const srcName =
                      `${inc.sourcePerson.firstName} ${inc.sourcePerson.lastName}`.trim() || 'Без імені';
                    return (
                      <button
                        key={`in-ccl-${inc.sourceTreeId}-${inc.sourcePerson.id}`}
                        type="button"
                        onClick={() => onSelectTree?.(inc.sourceTreeId, inc.sourcePerson.id, person.id)}
                        className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-stone-50/80 hover:bg-emerald-50/60 border border-stone-200/80 text-xs transition-colors group cursor-pointer text-left"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: inc.linkColor || '#047857' }}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-stone-800 group-hover:text-emerald-900 truncate flex items-center gap-1.5 flex-wrap">
                              <span className="px-1.5 py-0.2 rounded bg-stone-200/80 text-stone-800 text-[9.5px] font-bold shrink-0">
                                {inc.sourceTreeTitle}
                              </span>
                              <span className="px-1 py-0.2 rounded bg-white border border-stone-200 text-stone-700 font-mono text-[9.5px] font-bold shrink-0">
                                {formatCardId(inc.sourcePerson)}
                              </span>
                              <span className="truncate">← Від: {srcName}</span>
                            </div>
                            {inc.linkLabel && (
                              <div className="text-[10px] text-stone-500 truncate mt-0.5">
                                {inc.linkLabel}
                              </div>
                            )}
                          </div>
                        </div>
                        <ExternalLink size={12} className="text-stone-400 group-hover:text-emerald-700 shrink-0" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* SAME-CANVAS CARD LINKS SECTION */}
        {(() => {
          const outgoingLinks = (person.branchLinks || []).filter((bl) => Boolean(allPersons[bl.targetPersonId]));
          const incomingSources = Object.values(allPersons).filter(
            (other) =>
              other.id !== person.id &&
              other.branchLinks?.some((bl) => bl.targetPersonId === person.id)
          );
          if (outgoingLinks.length === 0 && incomingSources.length === 0 && !isAdmin) {
            return null;
          }
          return (
            <div className="bg-white rounded-2xl p-3.5 border border-indigo-200/80 shadow-2xs space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-indigo-950 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0">
                    <ArrowUpRight size={13} />
                  </span>
                  <span>Стрілки на цьому полотні ({outgoingLinks.length + incomingSources.length})</span>
                </h4>
                {isAdmin && onOpenBranchLinkModal && (
                  <button
                    type="button"
                    onClick={() => onOpenBranchLinkModal(person)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-[10.5px] font-semibold transition-colors cursor-pointer"
                  >
                    <Plus size={11} />
                    <span>Додати</span>
                  </button>
                )}
              </div>

              {outgoingLinks.length === 0 && incomingSources.length === 0 ? (
                <p className="text-xs text-stone-400 italic">
                  Немає посилань на інші картки полотна
                </p>
              ) : (
                <div className="space-y-1.5">
                  {outgoingLinks.map((bl) => {
                    const target = allPersons[bl.targetPersonId];
                    if (!target) return null;
                    const tName = `${target.firstName} ${target.lastName}`.trim() || 'Без імені';
                    const shapeText = getBranchLineShapeLabel(bl.lineShape);
                    const widthVal = bl.strokeWidth ?? 2;
                    return (
                      <div
                        key={bl.id}
                        className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-indigo-50/50 hover:bg-indigo-100/70 border border-indigo-200/70 text-xs transition-colors group"
                      >
                        <button
                          type="button"
                          onClick={() => onSelectPerson(target.id)}
                          className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer"
                        >
                          {bl.linkKind === 'godparent' ? (
                            <span
                              className="text-xs leading-none shrink-0 font-bold"
                              style={{ color: bl.color || '#d97706' }}
                            >
                              ✝
                            </span>
                          ) : (
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: bl.color || '#4f46e5' }}
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-stone-900 group-hover:text-indigo-900 truncate flex items-center gap-1.5">
                              <span className="px-1 py-0.2 rounded bg-indigo-100/80 text-indigo-800 font-mono text-[9.5px] font-bold shrink-0">
                                {formatCardId(target)}
                              </span>
                              <span className="truncate">→ {tName}</span>
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {bl.label && (
                                <span className="text-[10px] text-indigo-700 truncate">
                                  {bl.label}
                                </span>
                              )}
                              <span className="text-[9px] font-mono text-stone-500">
                                {shapeText} · {widthVal}px
                              </span>
                            </div>
                          </div>
                          <ChevronRight size={13} className="text-indigo-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
                        </button>
                        {isAdmin && onEditBranchLink && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditBranchLink(person.id, bl.id);
                            }}
                            className="p-1 rounded-md text-stone-400 hover:text-indigo-700 hover:bg-indigo-100 transition-colors cursor-pointer shrink-0"
                            title="Налаштувати стиль стрілки"
                          >
                            <Settings size={12.5} />
                          </button>
                        )}
                        {isAdmin && onRemoveBranchLink && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onRemoveBranchLink(person.id, bl.id);
                            }}
                            className="p-1 rounded-md text-stone-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer shrink-0"
                            title="Прибрати посилання"
                          >
                            <Trash2 size={12.5} />
                          </button>
                        )}
                      </div>
                    );
                  })}

                  {incomingSources.map((src) => {
                    const sLink = src.branchLinks?.find((bl) => bl.targetPersonId === person.id);
                    const sName = `${src.firstName} ${src.lastName}`.trim() || 'Без імені';
                    return (
                      <button
                        key={`in-${src.id}`}
                        type="button"
                        onClick={() => onSelectPerson(src.id)}
                        className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-stone-50/80 hover:bg-stone-100 border border-stone-200/70 text-xs transition-colors group cursor-pointer text-left"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {sLink?.linkKind === 'godparent' ? (
                            <span
                              className="text-xs leading-none shrink-0 font-bold"
                              style={{ color: sLink?.color || '#d97706' }}
                            >
                              ✝
                            </span>
                          ) : (
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: sLink?.color || '#4f46e5' }}
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-stone-800 group-hover:text-indigo-900 truncate flex items-center gap-1.5">
                              <span className="px-1 py-0.2 rounded bg-stone-200/70 text-stone-700 font-mono text-[9.5px] font-bold shrink-0">
                                {formatCardId(src)}
                              </span>
                              <span className="truncate">← Від: {sName}</span>
                            </div>
                            {sLink?.label && (
                              <div className="text-[10px] text-stone-500 truncate">
                                {sLink.label}
                              </div>
                            )}
                          </div>
                        </div>
                        <ChevronRight size={13} className="text-stone-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* EVERYDAY LIFE PHOTOS SECTION (Read-Only Gallery) */}
        {lifePhotos.length > 0 && !person.isBlankScreenshot && (
          <div className="bg-white dark:bg-zinc-900 rounded-2xl p-3.5 border border-stone-200/90 dark:border-zinc-800 shadow-2xs space-y-2.5">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-stone-600 dark:text-zinc-300 flex items-center gap-2 min-w-0">
              <span className="w-6 h-6 rounded-lg bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-400 flex items-center justify-center shrink-0">
                <ImageIcon size={13} />
              </span>
              <span className="truncate">Фотографії з життя ({lifePhotos.length})</span>
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {lifePhotos.map((photo, idx) => {
                const captionText = photo.caption || photo.title || '';
                return (
                  <div
                    key={photo.id}
                    className="group relative rounded-xl border border-stone-200 dark:border-zinc-700 overflow-hidden bg-stone-100 dark:bg-zinc-800 aspect-square cursor-zoom-in hover:border-sky-500 transition-colors shadow-2xs"
                    onClick={() => setPhotoAlbumLightboxIndex(idx)}
                    title={captionText ? `${captionText}${photo.date ? ` (${photo.date})` : ''}` : 'Натисніть для перегляду'}
                  >
                    <img
                      src={photo.url}
                      alt={captionText || 'Фото з життя'}
                      onError={(e) => handleUploadImageError(e, photo.url)}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    {(captionText || photo.date) ? (
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-2 pt-4 pb-1.5 flex flex-col justify-end pointer-events-none">
                        {photo.date && (
                          <span className="text-[9.5px] font-mono font-bold text-sky-200 leading-none">
                            {photo.date}
                          </span>
                        )}
                        {captionText && (
                          <span className="text-[10px] font-medium text-white truncate leading-tight mt-0.5">
                            {captionText}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="absolute bottom-1.5 right-1.5 p-1 rounded-md bg-black/55 text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                        <ZoomIn size={12} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* METRIC DOCUMENTS SECTION (Read-Only + viewer/modal trigger) */}
        {(() => {
          const allMetricGallery: Array<{
            id: string;
            type: string;
            url: string;
            title: string;
            date?: string;
            typeLabel: string;
            isLink: boolean;
          }> = [];
          const seenUrls = new Set<string>();
          const typeLabelFor = (t: string) =>
            t === 'birth'
              ? 'Народження'
              : t === 'marriage'
              ? 'Шлюб'
              : t === 'death'
              ? 'Смерть'
              : t === 'children'
              ? 'Діти'
              : 'Інше';

          (person.metricDocuments || []).forEach((doc) => {
            if (!doc.url || seenUrls.has(doc.url)) return;
            seenUrls.add(doc.url);
            allMetricGallery.push({
              id: doc.id,
              type: doc.type,
              url: doc.url,
              title: doc.title || 'Документ',
              date: doc.date,
              typeLabel: typeLabelFor(doc.type),
              isLink: isExternalMetricLink(doc),
            });
          });
          if (person.birthMetricUrl && !seenUrls.has(person.birthMetricUrl)) {
            seenUrls.add(person.birthMetricUrl);
            allMetricGallery.unshift({
              id: `legacy_birth_${person.id}`,
              type: 'birth',
              url: person.birthMetricUrl,
              title: 'Метричний запис про народження',
              date: person.birthDate || person.birthYear,
              typeLabel: 'Народження',
              isLink: isExternalMetricLink(person.birthMetricUrl),
            });
          }
          if (person.deathMetricUrl && !seenUrls.has(person.deathMetricUrl)) {
            seenUrls.add(person.deathMetricUrl);
            allMetricGallery.push({
              id: `legacy_death_${person.id}`,
              type: 'death',
              url: person.deathMetricUrl,
              title: 'Метричний запис про смерть',
              date: person.deathDate || person.deathYear,
              typeLabel: 'Смерть',
              isLink: isExternalMetricLink(person.deathMetricUrl),
            });
          }

          if (allMetricGallery.length === 0) return null;

          const linkDocs = allMetricGallery.filter((d) => d.isLink);
          const imageDocs = allMetricGallery.filter((d) => !d.isLink);

          return (
            <div className="bg-white rounded-2xl p-3.5 border border-stone-200/90 shadow-2xs space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-stone-600 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
                    <FileText size={13} />
                  </span>
                  <span>Документи та метрики ({allMetricGallery.length})</span>
                </h4>
                {onOpenMetricModal && isAdmin && (
                  <button
                    type="button"
                    onClick={() => onOpenMetricModal(person, 'birth')}
                    className="text-[11px] font-semibold text-emerald-800 hover:text-emerald-950 cursor-pointer"
                  >
                    + Додати
                  </button>
                )}
              </div>

              {linkDocs.length > 0 && (
                <div className="space-y-1.5">
                  {linkDocs.map((doc) => (
                    <a
                      key={doc.id}
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between gap-2.5 p-2.5 rounded-xl bg-sky-50/75 hover:bg-sky-100/90 border border-sky-200/90 transition-colors group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-8 h-8 rounded-lg bg-white border border-sky-200 text-sky-700 flex items-center justify-center shrink-0 shadow-2xs">
                          <Link2 size={14} />
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-sky-800">
                              {getMetricLinkDomainLabel(doc.url)}
                            </span>
                            <span className="text-[10px] text-stone-400">·</span>
                            <span className="text-[10px] font-semibold text-stone-600">{doc.typeLabel}</span>
                          </div>
                          <div className="text-xs font-semibold text-stone-900 truncate">
                            {doc.title}
                          </div>
                        </div>
                      </div>
                      <ExternalLink size={14} className="text-sky-700 shrink-0 group-hover:translate-x-0.5 transition-transform" />
                    </a>
                  ))}
                </div>
              )}

              {imageDocs.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {imageDocs.map((doc, idx) => (
                    <div
                      key={doc.id}
                      className="group relative rounded-xl border border-stone-200 overflow-hidden bg-stone-50 aspect-square cursor-zoom-in hover:border-emerald-500 transition-colors shadow-2xs"
                      onClick={() => setLightboxIndex(idx)}
                    >
                      <img
                        src={doc.url}
                        alt={doc.title}
                        onError={(e) => handleUploadImageError(e, doc.url)}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2">
                        <span className="text-[9px] font-bold text-white uppercase tracking-wider truncate">
                          {doc.typeLabel}
                        </span>
                        <span className="text-[8px] text-white/90 truncate leading-tight mt-0.5">{doc.title}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* REACTIONS LIST */}
        {person.reactions && person.reactions.length > 0 && (
          <div className="bg-white rounded-2xl p-3.5 border border-rose-200/80 shadow-2xs space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-[11px] font-bold text-rose-950 uppercase tracking-wider flex items-center gap-1.5">
                <Heart size={12.5} className="text-rose-600 shrink-0 fill-rose-600" />
                <span>Реакції відвідувачів ({person.reactions.length})</span>
              </h4>
              {isAdmin && onOpenReactionsModal && (
                <button
                  type="button"
                  onClick={onOpenReactionsModal}
                  className="text-[11px] font-semibold text-rose-700 hover:text-rose-900 underline cursor-pointer"
                >
                  Управління →
                </button>
              )}
            </div>
            <div className="space-y-1.5">
              {person.reactions.map((r, idx) => (
                <div
                  key={r.id || idx}
                  className="p-2 rounded-xl bg-rose-50/40 border border-rose-100 flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-base">{r.emoji}</span>
                    <div className="min-w-0 text-xs">
                      <div className="font-semibold text-stone-800 truncate">
                        {r.userName || 'Гість'}
                        {isAdmin && r.userEmail && (
                          <span className="text-stone-400 font-normal ml-1 text-[10px]">({r.userEmail})</span>
                        )}
                      </div>
                      {r.createdAt && <div className="text-[10px] text-stone-400">{r.createdAt}</div>}
                    </div>
                  </div>
                  {isAdmin && onDeleteReaction && (
                    <button
                      type="button"
                      onClick={() => onDeleteReaction(person.id, r.id || idx)}
                      className="p-1.5 rounded-lg bg-white hover:bg-rose-100 text-stone-400 hover:text-rose-700 border border-stone-200 transition-colors cursor-pointer"
                      title="Видалити реакцію"
                    >
                      <Trash2 size={12.5} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* DANGER ZONE */}
        {isAdmin && (
          <div className="pt-1">
            <button
              type="button"
              onClick={() => {
                onDelete(person.id);
                onClose();
              }}
              className="w-full px-3 py-2.5 text-xs font-semibold text-rose-700 hover:text-rose-800 bg-rose-50/70 hover:bg-rose-100 border border-rose-200/80 rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Trash2 size={13.5} />
              <span>Видалити цю картку</span>
            </button>
          </div>
        )}
      </div>

      {/* Lightbox Modal for Metric / Photo */}
      {lightboxIndex !== null && (() => {
        const items: LightboxDocumentItem[] = [];
        const seen = new Set<string>();
        const typeLabelFor = (t: string) =>
          t === 'birth'
            ? 'Народження'
            : t === 'marriage'
            ? 'Шлюб'
            : t === 'death'
            ? 'Смерть'
            : t === 'children'
            ? 'Діти'
            : 'Інше';

        (person.metricDocuments || []).forEach((doc) => {
          if (!doc.url || seen.has(doc.url) || isExternalMetricLink(doc)) return;
          seen.add(doc.url);
          items.push({
            id: doc.id,
            url: doc.url,
            title: doc.title || 'Документ',
            date: doc.date,
            typeLabel: typeLabelFor(doc.type),
          });
        });
        if (person.birthMetricUrl && !seen.has(person.birthMetricUrl) && !isExternalMetricLink(person.birthMetricUrl)) {
          seen.add(person.birthMetricUrl);
          items.unshift({
            id: `legacy_birth_${person.id}`,
            url: person.birthMetricUrl,
            title: 'Метричний запис про народження',
            date: person.birthDate || person.birthYear,
            typeLabel: 'Народження',
          });
        }
        if (person.deathMetricUrl && !seen.has(person.deathMetricUrl) && !isExternalMetricLink(person.deathMetricUrl)) {
          seen.add(person.deathMetricUrl);
          items.push({
            id: `legacy_death_${person.id}`,
            url: person.deathMetricUrl,
            title: 'Метричний запис про смерть',
            date: person.deathDate || person.deathYear,
            typeLabel: 'Смерть',
          });
        }

        if (items.length === 0) return null;

        return (
          <DocumentLightboxModal
            isOpen={lightboxIndex !== null}
            items={items}
            initialIndex={lightboxIndex}
            onClose={() => setLightboxIndex(null)}
          />
        );
      })()}

      {/* Dedicated Lightbox for Undeciphered Screenshot Card */}
      {screenshotLightboxOpen && person.screenshotUrl && (
        <DocumentLightboxModal
          isOpen={screenshotLightboxOpen}
          items={[
            {
              id: `screenshot-${person.id}`,
              url: person.screenshotUrl,
              title: person.firstName || 'Нерозшифрований запис',
              typeLabel: 'Скріншот запису',
            },
          ]}
          initialIndex={0}
          onClose={() => setScreenshotLightboxOpen(false)}
        />
      )}

      {/* Public Lightbox for Everyday Life Photos */}
      {photoAlbumLightboxIndex !== null && lifePhotos.length > 0 && (
        <DocumentLightboxModal
          isOpen={photoAlbumLightboxIndex !== null}
          items={lifePhotos.map(
            (photo): LightboxDocumentItem => ({
              id: photo.id,
              url: photo.url,
              title: photo.caption || photo.title || `Фото · ${fullName}`,
              date: photo.date,
              typeLabel: 'Фото з життя',
            })
          )}
          initialIndex={photoAlbumLightboxIndex}
          onClose={() => setPhotoAlbumLightboxIndex(null)}
        />
      )}
    </aside>
  );
};
