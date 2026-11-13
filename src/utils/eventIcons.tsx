import React from 'react';
import { FileText, Droplets, Church, Bookmark, HeartCrack, Users } from 'lucide-react';

export type EventTypeKey = 'marriage' | 'engagement' | 'baptism' | 'church' | 'divorce' | 'cohabitation' | 'custom';

export interface EventTypeConfig {
  id: EventTypeKey;
  title: string;
  defaultLabel: string;
  description: string;
  color: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
}

export const EVENT_TYPES_CONFIG: Record<EventTypeKey, EventTypeConfig> = {
  marriage: {
    id: 'marriage',
    title: 'Офіційний шлюб',
    defaultLabel: 'Шлюб',
    description: 'Офіційний або цивільний шлюб (документ)',
    color: '#e11d48', // rose-600
    bgColor: '#fff1f2',
    borderColor: '#fecdd3',
    textColor: '#9f1239',
  },
  cohabitation: {
    id: 'cohabitation',
    title: 'Пара (без шлюбу)',
    defaultLabel: 'Пара (без шлюбу)',
    description: 'Пара / сумісне проживання без шлюбу та вінчання',
    color: '#52525b', // slate-600
    bgColor: '#f4f4f5',
    borderColor: '#e4e4e7',
    textColor: '#27272a',
  },
  engagement: {
    id: 'engagement',
    title: 'Заручини',
    defaultLabel: 'Заручини',
    description: 'Заручини / обручини (два кільця)',
    color: '#d97706', // amber-600
    bgColor: '#fffbeb',
    borderColor: '#fde68a',
    textColor: '#92400e',
  },
  divorce: {
    id: 'divorce',
    title: 'Розлучення',
    defaultLabel: 'Розлучення',
    description: 'Розірвання шлюбу / розлучення пари',
    color: '#64748b', // slate-500
    bgColor: '#f8fafc',
    borderColor: '#cbd5e1',
    textColor: '#334155',
  },
  baptism: {
    id: 'baptism',
    title: 'Хрещення',
    defaultLabel: 'Хрещення',
    description: 'Таїнство хрещення та миропомазання',
    color: '#0284c7', // sky-600
    bgColor: '#f0f9ff',
    borderColor: '#bae6fd',
    textColor: '#0369a1',
  },
  church: {
    id: 'church',
    title: 'Вінчання',
    defaultLabel: 'Вінчання',
    description: 'Церковний шлюб у храмі',
    color: '#7c3aed', // violet-600
    bgColor: '#f5f3ff',
    borderColor: '#ddd6fe',
    textColor: '#5b21b6',
  },
  custom: {
    id: 'custom',
    title: 'Інша подія',
    defaultLabel: 'Ключова подія',
    description: 'Особливий запис, переселення, грамота',
    color: '#52525b', // slate-600
    bgColor: '#f4f4f5',
    borderColor: '#e4e4e7',
    textColor: '#27272a',
  },
};

/**
 * Returns a React Lucide / Custom Icon component for modal UI
 */
export const EventLucideIcon: React.FC<{ type: EventTypeKey; size?: number; className?: string }> = ({
  type,
  size = 16,
  className = '',
}) => {
  switch (type) {
    case 'marriage':
      // Document icon for marriage
      return <FileText size={size} className={className} />;
    case 'engagement':
      // Two interlocking rings for engagement
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={className}
        >
          <circle cx="8" cy="12" r="5" />
          <circle cx="16" cy="12" r="5" />
        </svg>
      );
    case 'cohabitation':
      return <Users size={size} className={className} />;
    case 'divorce':
      return <HeartCrack size={size} className={className} />;
    case 'baptism':
      return <Droplets size={size} className={className} />;
    case 'church':
      return <Church size={size} className={className} />;
    case 'custom':
    default:
      return <Bookmark size={size} className={className} />;
  }
};

/**
 * Crisp vector SVG paths for rendering inside canvas <svg>
 */
export const renderSvgEventGlyph = (type: EventTypeKey | undefined, strokeColor: string) => {
  switch (type) {
    case 'marriage':
      // Official document sheet with lines
      return (
        <g stroke={strokeColor} fill="none" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M -4,-5.5 L 1.5,-5.5 L 4.5,-2.5 L 4.5,5.5 L -4,5.5 Z" />
          <path d="M 1.5,-5.5 L 1.5,-2.5 L 4.5,-2.5" />
          <line x1="-2" y1="-1" x2="2.5" y2="-1" />
          <line x1="-2" y1="1.5" x2="2.5" y2="1.5" />
          <line x1="-2" y1="3.8" x2="0.5" y2="3.8" />
        </g>
      );

    case 'cohabitation':
      // Heart symbol for pair / cohabitation
      return (
        <g stroke={strokeColor} fill="none" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M -4,-1.5 C -4,-3.5 -1,-3.5 0,-1 C 1,-3.5 4,-3.5 4,-1.5 C 4,1 0,4.5 0,4.5 C 0,4.5 -4,1 -4,-1.5 Z" />
        </g>
      );

    case 'engagement':
      // Two interlocking rings
      return (
        <g stroke={strokeColor} fill="none" strokeWidth="1.5" strokeLinecap="round">
          <circle cx="-3" cy="0" r="4.2" />
          <circle cx="3" cy="0" r="4.2" />
        </g>
      );

    case 'divorce':
      // Broken line through heart/union
      return (
        <g stroke={strokeColor} fill="none" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M -4,-2 C -4,-4 -1,-4 0,-1 C 1,-4 4,-4 4,-2 C 4,1 0,4.5 0,4.5 C 0,4.5 -4,1 -4,-2 Z" />
          <line x1="-1.5" y1="-3.5" x2="0" y2="-0.5" />
          <line x1="0" y1="-0.5" x2="-1.2" y2="1.5" />
          <line x1="-1.2" y1="1.5" x2="0.5" y2="4" />
        </g>
      );

    case 'baptism':
      // Sacred droplet with cross
      return (
        <g stroke={strokeColor} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
          <path
            d="M 0,-5.5 C 2.5,-2 4.5,0.8 4.5,3.2 A 4.5,4.5 0 0,1 -4.5,3.2 C -4.5,0.8 -2.5,-2 0,-5.5 Z"
            fill="none"
          />
          <line x1="0" y1="0.5" x2="0" y2="4.5" />
          <line x1="-1.8" y1="2" x2="1.8" y2="2" />
        </g>
      );

    case 'church':
      // Church with spire and cross
      return (
        <g stroke={strokeColor} fill="none" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
          <line x1="0" y1="-6.5" x2="0" y2="-4" />
          <line x1="-1.5" y1="-5.2" x2="1.5" y2="-5.2" />
          <path d="M -4.5,0 L 0,-4 L 4.5,0" />
          <path d="M -3.8,0 L -3.8,5 L 3.8,5 L 3.8,0" />
          <path d="M -1.3,5 L -1.3,2.8 A 1.3,1.3 0 0,1 1.3,2.8 L 1.3,5" />
        </g>
      );

    case 'custom':
    default:
      // Milestone bookmark / heraldic ribbon
      return (
        <g stroke={strokeColor} fill="none" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M -3.8,-5 L 3.8,-5 L 3.8,5 L 0,2.6 L -3.8,5 Z" />
        </g>
      );
  }
};
