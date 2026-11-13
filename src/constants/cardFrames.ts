import type { CardFrameStyle } from '../types/tree';

export interface CardFramePreset {
  id: CardFrameStyle;
  name: string;
  subtitle: string;
  accentHex: string;
}

export const CARD_FRAME_PRESETS: CardFramePreset[] = [
  {
    id: 'none',
    name: 'Класична',
    subtitle: 'Чиста картка без додаткової рамки',
    accentHex: '#78716c',
  },
  {
    id: 'gilded_corners',
    name: 'Золочені кутики',
    subtitle: 'Музейні латунні філігранні кутики',
    accentHex: '#b45309',
  },
  {
    id: 'archival_double',
    name: 'Архівне паспарту',
    subtitle: 'Подвійний кант старовинного фотоальбому',
    accentHex: '#44403c',
  },
  {
    id: 'vyshyvanka',
    name: 'Родовий орнамент',
    subtitle: 'Українські геометричні мотиви вишивки',
    accentHex: '#be123c',
  },
  {
    id: 'botanical_wreath',
    name: 'Калиновий вінок',
    subtitle: 'Витончене ботанічне гілля по кутах',
    accentHex: '#047857',
  },
  {
    id: 'cozy_stitch',
    name: 'Тихий пунктир',
    subtitle: 'Рукописний альбом із тисненням та стібком',
    accentHex: '#92400e',
  },
  {
    id: 'royal_seal',
    name: 'Шляхетна печатка',
    subtitle: 'Подвійний бронзово-смарагдовий вінець',
    accentHex: '#0f766e',
  },
];

export const ALLOWED_CARD_FRAME_IDS: readonly CardFrameStyle[] = CARD_FRAME_PRESETS.map(
  (f) => f.id
);

export function normalizeCardFrame(value?: string | null): CardFrameStyle {
  if (!value || typeof value !== 'string') return 'none';
  const trimmed = value.trim() as CardFrameStyle;
  return (ALLOWED_CARD_FRAME_IDS as readonly string[]).includes(trimmed) ? trimmed : 'none';
}

export interface GuestCardColorPreset {
  name: string;
  hex: string;
}

export const GUEST_CARD_COLOR_PRESETS: GuestCardColorPreset[] = [
  { name: 'Чебрецевий', hex: '#e8efe9' },
  { name: 'Вінтажний', hex: '#fbf7ee' },
  { name: 'Блакитний', hex: '#e0f2fe' },
  { name: 'Рожевий', hex: '#ffe4e6' },
  { name: 'Бурштиновий', hex: '#fef3c7' },
  { name: 'Бузковий', hex: '#f3e8ff' },
  { name: 'Сріблястий', hex: '#f1f5f9' },
  { name: 'Білий', hex: '#ffffff' },
];
