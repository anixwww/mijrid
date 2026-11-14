export type Gender = 'male' | 'female' | 'unknown';

export type RelativeType = 
  | 'father' 
  | 'mother' 
  | 'parent'
  | 'spouse' 
  | 'child' 
  | 'son'
  | 'daughter'
  | 'sibling' 
  | 'brother' 
  | 'sister';

export type CardFrameStyle =
  | 'none'
  | 'gilded_corners'
  | 'archival_double'
  | 'vyshyvanka'
  | 'botanical_wreath'
  | 'cozy_stitch'
  | 'royal_seal';

export interface MetricDocument {
  id: string;
  type: 'birth' | 'marriage' | 'death' | 'children' | 'other';
  url: string; // image path/base64 or external webpage link (e.g. FamilySearch)
  kind?: 'image' | 'link';
  title: string;
  date?: string;
}

export interface PersonPhoto {
  id: string;
  url: string;
  caption?: string;
  title?: string;
  date?: string;
  notes?: string;
}

export interface Pet {
  id: string;
  name: string;
  type: 'dog' | 'cat' | 'horse' | 'bird' | 'cow' | 'other';
  birthYear?: string;
  deathYear?: string;
  avatarUrl?: string;
  breed?: string;
  notes?: string;
  isCouplePet?: boolean; // Плашка тварини на всю ширину пари
}

export interface Person {
  id: string;
  cardId?: string; // Унікальний короткий видимий ID картки (напр. "1", "2", "145")
  firstName: string;
  lastName: string;
  patronymic?: string;
  maidenName?: string;
  nickname?: string;
  clanName?: string; // Вказаний рід (якщо задано вручну)
  gender: Gender;
  birthDate?: string;
  birthDay?: string;
  birthMonth?: string;
  birthYear?: string;
  birthYearEnd?: string; // Кінець діапазону / періоду для приблизної дати (напр. "1915" для 1910–1915)
  isBirthDateApproximate?: boolean; // Приблизна дата / період
  birthDateType?: 'exact' | 'period' | 'about'; // Режим дати: точна, період (від-до), близько
  birthMetricUrl?: string; // Фото метрики про народження
  deathDate?: string;
  deathDay?: string;
  deathMonth?: string;
  deathYear?: string;
  deathMetricUrl?: string; // Фото метрики про смерть
  isDeceased?: boolean;
  yearsDisplay?: string;
  birthPlace?: string; // Місце народження
  residencePlace?: string; // Місце проживання
  migrationNotes?: string; // Переїзди, міграція та еміграція
  deathPlace?: string; // Місце смерті
  burialPlace?: string; // Місце поховання
  education?: string; // Освіта та навчальні заклади
  profession?: string; // Професія / Рід занять
  workplaceNotes?: string; // Місце роботи, служба, звання
  deathCause?: string; // Причина смерті
  midwife?: string; // Повитуха / Баба-повитуха
  godparents?: string; // Хресні / Куми
  houseNumber?: string; // Номер дому народження (e.g. "47", "12a")
  isChronologicallyPinned?: boolean; // Pinned vertically to birth year on timeline
  isFullyVerified?: boolean; // Вся інформація в картці достовірна й перевірена
  isGhost?: boolean; // Картка-нотатка (стікер на полотні з пунктирними зв'язками)
  ghostNote?: string; // Основний текст нотатки на стікері
  isBlankScreenshot?: boolean; // Порожня картка-скріншот (нерозшифрований запис на всю ширину й висоту картки)
  screenshotUrl?: string; // Зображення скріншоту, що заповнює всю картку
  screenshotFit?: 'cover' | 'contain'; // Режим масштабування фото на картці (заповнити чи показати повністю)
  cardBgColor?: string; // Custom card background color (e.g. #e8efe9, #fbf7ee, #e0f2fe)
  cardFrame?: CardFrameStyle; // Зовнішня декоративна рамка картки
  selfCustomizedAt?: string; // ISO-час останнього самостійного оформлення гостем
  notes?: string;
  biography?: string; // Довільний життєпис особи
  interestingStories?: string; // Цікаві історії, родинні перекази, курйози та спогади
  avatarUrl?: string; // base64 data url or path
  flagEmoji?: string; // e.g. '🇺🇦'
  parents: string[];  // IDs of parents
  spouses: string[];  // IDs of spouses
  children: string[]; // IDs of children
  siblings?: string[]; // IDs of direct siblings when parents are not specified
  unverifiedRelations?: string[]; // IDs of related persons whose relation is unverified
  metricDocuments?: MetricDocument[]; // Фото метрик, документів
  photoAlbum?: PersonPhoto[]; // Персональний альбом фотографій
  pets?: Pet[]; // Домашні тварини
  reactions?: PersonReaction[]; // Емодзі-реакції користувачів
  targetCanvasId?: string; // ID іншого полотна (дерева), на яке посилається стрілка
  targetCanvasTitle?: string; // Назва іншого полотна
  targetCanvasPersonId?: string; // ID картки на іншому полотні (сумісність)
  crossCanvasLinks?: CrossCanvasLink[]; // Міжгілкові зв'язки (посилання на картки на інших полотнах)
  branchLinks?: BranchLink[]; // Стрілки-посилання та лінії хресних у межах полотна
  guestSuggestions?: GuestSuggestion[]; // Уточнення та спогади від гостей
  isProposal?: boolean; // Картка-пропозиція від гостя (очікує затвердження адміном)
  proposalMeta?: ProposalCardMeta; // Метадані картки-пропозиції
  x: number;
  y: number;
}

export type GuestSuggestionCategory = 'correction' | 'memory' | 'date_place' | 'document_hint';
export type GuestSuggestionStatus = 'pending' | 'approved' | 'rejected';

export interface GuestSuggestion {
  id: string;
  category: GuestSuggestionCategory;
  message: string;
  suggestedFields?: {
    birthDate?: string;
    birthYear?: string;
    deathDate?: string;
    deathYear?: string;
    birthPlace?: string;
    residencePlace?: string;
    maidenName?: string;
    nickname?: string;
    profession?: string;
  };
  authorUserId: string;
  authorName: string;
  authorEmail?: string;
  createdAt: string;
  status: GuestSuggestionStatus;
  resolvedAt?: string;
}

export interface ProposalCardMeta {
  targetPersonId: string;
  relationType: 'father' | 'mother' | 'spouse' | 'child' | 'brother' | 'sister';
  authorUserId: string;
  authorName: string;
  authorEmail?: string;
  note?: string;
  createdAt: string;
}

export type ArchiveSourceType =
  | 'metric_birth'
  | 'metric_marriage'
  | 'metric_death'
  | 'metric_mixed'
  | 'confession'
  | 'revision'
  | 'other';

export type ArchiveSourceStatus = 'planned' | 'in_progress' | 'completed';

export interface ArchiveSourceEntry {
  id: string;
  archiveCode: string; // напр. "ЦДІАК ф.127, оп.1080, спр.45"
  title: string; // напр. "Метрична книга с. Моринці"
  sourceType: ArchiveSourceType;
  locality?: string;
  yearFrom: number;
  yearTo: number;
  status: ArchiveSourceStatus;
  notes?: string;
  linkedPersonIds?: string[];
  updatedAt: string;
}

export type BranchLinkCurveStyle = 'curved' | 'straight' | 'wavy';
export type BranchLinkKind = 'branch' | 'godparent';

export interface CrossCanvasLink {
  id: string;
  targetCanvasId: string;
  targetCanvasTitle?: string;
  targetPersonId: string;
  targetPersonName?: string;
  targetCardId?: string;
  label?: string;
  color?: string;
}

export interface BranchLink {
  id: string;
  targetPersonId: string;
  linkKind?: BranchLinkKind; // 'branch' (міжгілковий) | 'godparent' (хресний/хресна)
  label?: string;
  color?: string;
  strokeWidth?: number; // Товщина лінії (1..10 px)
  lineShape?: BranchLinkCurveStyle; // 'curved' (вигнута) | 'straight' (пряма) | 'wavy' (хвиляста)
}

export const BRANCH_LINK_COLOR_PRESETS = [
  { name: 'Індиго', hex: '#4f46e5' },
  { name: 'Смарагдовий', hex: '#059669' },
  { name: 'Бурштиновий', hex: '#d97706' },
  { name: 'Рубіновий', hex: '#e11d48' },
  { name: 'Лазуровий', hex: '#0284c7' },
  { name: 'Фіалковий', hex: '#7c3aed' },
] as const;

export type ReactionEmoji = '❤️' | '😮' | '👍' | '👎' | '😢';

export interface PersonReaction {
  id?: string;
  emoji: ReactionEmoji | string;
  userId: string;
  userName?: string;
  userEmail?: string;
  createdAt?: string;
}

export type ConfidenceLevel = 'verified' | 'hypothetical';
export type ConnectionLineStyle = 'orthogonal' | 'curved' | 'direct';

export type AnchorSide =
  | 'top'
  | 'top-left'
  | 'top-right'
  | 'right'
  | 'right-top'
  | 'right-bottom'
  | 'bottom'
  | 'bottom-left'
  | 'bottom-right'
  | 'left'
  | 'left-top'
  | 'left-bottom';

export interface ConnectionMeta {
  verified: boolean;
  confidenceLevel?: ConfidenceLevel; // Рівень достовірності зв'язку
  archiveSource?: string; // Архівне джерело (метрична книга, ревізька казка тощо)
  lineStyle?: ConnectionLineStyle; // Стиль накреслення лінії
  color?: string; // e.g. green or custom
  label?: string; // Custom key event text (e.g. "Шлюб", "Весілля 1925")
  eventDate?: string; // e.g. "12.05.1925"
  eventType?: 'marriage' | 'engagement' | 'church' | 'baptism' | 'divorce' | 'cohabitation' | 'custom';
  isMainBranch?: boolean; // Головна гілка (товстіша лінія)
  strokeWidth?: number; // Товщина лінії від 1 до 12px
  eventX?: number; // Координата X іконки події на полотні
  eventY?: number; // Координата Y іконки події на полотні
  hasNoEvent?: boolean; // Явне вимкнення/видалення події з лінії
  notes?: string;
  fromAnchor?: AnchorSide;
  toAnchor?: AnchorSide;
}

export interface ClanCoatOfArmsItem {
  url: string;
  description?: string;
  motto?: string;
  style?: string;
  updatedAt?: string;
}

export interface FamilyTreeData {
  id: string;
  title: string;
  version?: string; // Версія дерева, наприклад "v0.1", "v1.0"
  description?: string;
  createdAt: string;
  updatedAt: string;
  persons: Record<string, Person>;
  connectionOverrides?: Record<string, ConnectionMeta>; // key is e.g. "marriage:id1:id2" or "child:parentId:childId"
  verifiedColor?: string; // Preferred gray shade for verified links (default: #64748b)
  selectedPersonId?: string | null;
  clanCoatOfArms?: Record<string, ClanCoatOfArmsItem | string>;
  archiveRegistry?: ArchiveSourceEntry[];
}

export interface TreeViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface CoupleBridgeInfo {
  key: string;
  leftArmPath: string;
  rightArmPath: string;
  leftColor: string;
  rightColor: string;
  junctionX: number;
  junctionY: number;
  isVerified: boolean;
  leftDashed?: boolean;
  rightDashed?: boolean;
  parentIds: [string, string];
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

export interface ConnectionLine {
  id: string;
  type: 'marriage' | 'child-branch' | 'parent-drop' | 'sibling-tie';
  path: string; // SVG path d attribute
  fromId?: string;
  toId?: string;
  fromAnchor?: AnchorSide;
  toAnchor?: AnchorSide;
  personIds?: string[];
  isVerified: boolean;
  confidenceLevel?: ConfidenceLevel;
  archiveSource?: string;
  color: string;
  isDashed?: boolean;
  label?: string;
  eventDate?: string;
  eventType?: string;
  isMainBranch?: boolean;
  strokeWidth?: number;
  hasNoEvent?: boolean;
  notes?: string;
  midX?: number;
  midY?: number;
  eventX?: number;
  eventY?: number;
  startPt?: { x: number; y: number };
  endPt?: { x: number; y: number };
  junctionPt?: { x: number; y: number };
  coupleBridge?: CoupleBridgeInfo;
  bounds?: { minX: number; maxX: number; minY: number; maxY: number };
}
