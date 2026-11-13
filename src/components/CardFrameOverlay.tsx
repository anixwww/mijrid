import React from 'react';
import type { CardFrameStyle } from '../types/tree';
import { normalizeCardFrame } from '../constants/cardFrames';

interface CardFrameOverlayProps {
  frame?: CardFrameStyle;
  isSimplified?: boolean;
  compact?: boolean;
}

export const CardFrameOverlay: React.FC<CardFrameOverlayProps> = ({
  frame,
  isSimplified = false,
  compact = false,
}) => {
  const style = normalizeCardFrame(frame);
  if (style === 'none') return null;

  if (style === 'gilded_corners') {
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-[2.5px] rounded-[18px] z-[22]"
      >
        <div className="absolute inset-0 rounded-[18px] border-[1.5px] border-amber-500/80 dark:border-amber-400/75 shadow-[0_0_0_1px_rgba(245,158,11,0.18)]" />
        {!isSimplified && (
          <>
            {/* Top-left gilded filigree */}
            <svg
              viewBox="0 0 22 22"
              className={`absolute -top-[1px] -left-[1px] ${compact ? 'w-3.5 h-3.5' : 'w-4.5 h-4.5'} text-amber-600 dark:text-amber-300`}
              fill="none"
            >
              <path d="M2 16V6a4 4 0 0 1 4-4h10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M5.5 11.5V6.8a1.3 1.3 0 0 1 1.3-1.3h4.7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.8" />
              <circle cx="4.2" cy="4.2" r="1.4" fill="currentColor" />
            </svg>
            {/* Top-right */}
            <svg
              viewBox="0 0 22 22"
              className={`absolute -top-[1px] -right-[1px] ${compact ? 'w-3.5 h-3.5' : 'w-4.5 h-4.5'} text-amber-600 dark:text-amber-300 scale-x-[-1]`}
              fill="none"
            >
              <path d="M2 16V6a4 4 0 0 1 4-4h10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M5.5 11.5V6.8a1.3 1.3 0 0 1 1.3-1.3h4.7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.8" />
              <circle cx="4.2" cy="4.2" r="1.4" fill="currentColor" />
            </svg>
            {/* Bottom-left */}
            <svg
              viewBox="0 0 22 22"
              className={`absolute -bottom-[1px] -left-[1px] ${compact ? 'w-3.5 h-3.5' : 'w-4.5 h-4.5'} text-amber-600 dark:text-amber-300 scale-y-[-1]`}
              fill="none"
            >
              <path d="M2 16V6a4 4 0 0 1 4-4h10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M5.5 11.5V6.8a1.3 1.3 0 0 1 1.3-1.3h4.7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.8" />
              <circle cx="4.2" cy="4.2" r="1.4" fill="currentColor" />
            </svg>
            {/* Bottom-right */}
            <svg
              viewBox="0 0 22 22"
              className={`absolute -bottom-[1px] -right-[1px] ${compact ? 'w-3.5 h-3.5' : 'w-4.5 h-4.5'} text-amber-600 dark:text-amber-300 scale-[-1]`}
              fill="none"
            >
              <path d="M2 16V6a4 4 0 0 1 4-4h10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M5.5 11.5V6.8a1.3 1.3 0 0 1 1.3-1.3h4.7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.8" />
              <circle cx="4.2" cy="4.2" r="1.4" fill="currentColor" />
            </svg>
          </>
        )}
      </div>
    );
  }

  if (style === 'archival_double') {
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-[3px] rounded-[19px] z-[22]"
      >
        <div className="absolute inset-0 rounded-[19px] border-[2px] border-stone-700/75 dark:border-zinc-300/70" />
        {!isSimplified && (
          <div className="absolute inset-[5px] rounded-[13.5px] border border-stone-500/45 dark:border-zinc-400/35" />
        )}
      </div>
    );
  }

  if (style === 'vyshyvanka') {
    const cornerSize = compact ? 'w-3.5 h-3.5' : 'w-4.5 h-4.5';
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-[2.5px] rounded-[18px] z-[22]"
      >
        <div className="absolute inset-0 rounded-[18px] border-[1.75px] border-rose-700/80 dark:border-rose-400/80" />
        {!isSimplified && (
          <>
            <div className="absolute inset-[4px] rounded-[14px] border border-dashed border-stone-800/30 dark:border-zinc-200/25" />
            {[
              '-top-[1.5px] -left-[1.5px]',
              '-top-[1.5px] -right-[1.5px]',
              '-bottom-[1.5px] -left-[1.5px]',
              '-bottom-[1.5px] -right-[1.5px]',
            ].map((pos, idx) => (
              <svg key={idx} viewBox="0 0 18 18" className={`absolute ${pos} ${cornerSize}`} fill="none">
                <path
                  d="M9 1.5L16.5 9L9 16.5L1.5 9Z"
                  className="fill-rose-700 dark:fill-rose-500 stroke-white dark:stroke-zinc-900"
                  strokeWidth="1.2"
                />
                <path d="M9 5.5L12.5 9L9 12.5L5.5 9Z" className="fill-stone-900 dark:fill-zinc-100" />
              </svg>
            ))}
          </>
        )}
      </div>
    );
  }

  if (style === 'botanical_wreath') {
    const sprigSize = compact ? 'w-4 h-4' : 'w-5 h-5';
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-[2.5px] rounded-[18px] z-[22]"
      >
        <div className="absolute inset-0 rounded-[18px] border-[1.5px] border-emerald-700/75 dark:border-emerald-400/70" />
        {!isSimplified && (
          <>
            {/* Top-left viburnum/laurel sprig */}
            <svg viewBox="0 0 24 24" className={`absolute -top-[2px] -left-[2px] ${sprigSize}`} fill="none">
              <path d="M3 16C3.5 9.5 8 4.5 16 3" className="stroke-emerald-800 dark:stroke-emerald-300" strokeWidth="1.6" strokeLinecap="round" />
              <ellipse cx="7" cy="9" rx="2.6" ry="1.3" transform="rotate(-40 7 9)" className="fill-emerald-700 dark:fill-emerald-400" />
              <ellipse cx="11.5" cy="5.5" rx="2.4" ry="1.2" transform="rotate(-15 11.5 5.5)" className="fill-emerald-700 dark:fill-emerald-400" />
              <ellipse cx="5" cy="13.2" rx="2.2" ry="1.1" transform="rotate(-65 5 13.2)" className="fill-emerald-800 dark:fill-emerald-300" />
              <circle cx="5.2" cy="5.2" r="1.5" className="fill-rose-600 dark:fill-rose-400" />
              <circle cx="7.4" cy="4.2" r="1.1" className="fill-rose-500 dark:fill-rose-300" />
            </svg>
            {/* Bottom-right mirrored sprig */}
            <svg viewBox="0 0 24 24" className={`absolute -bottom-[2px] -right-[2px] ${sprigSize} rotate-180`} fill="none">
              <path d="M3 16C3.5 9.5 8 4.5 16 3" className="stroke-emerald-800 dark:stroke-emerald-300" strokeWidth="1.6" strokeLinecap="round" />
              <ellipse cx="7" cy="9" rx="2.6" ry="1.3" transform="rotate(-40 7 9)" className="fill-emerald-700 dark:fill-emerald-400" />
              <ellipse cx="11.5" cy="5.5" rx="2.4" ry="1.2" transform="rotate(-15 11.5 5.5)" className="fill-emerald-700 dark:fill-emerald-400" />
              <ellipse cx="5" cy="13.2" rx="2.2" ry="1.1" transform="rotate(-65 5 13.2)" className="fill-emerald-800 dark:fill-emerald-300" />
              <circle cx="5.2" cy="5.2" r="1.5" className="fill-rose-600 dark:fill-rose-400" />
              <circle cx="7.4" cy="4.2" r="1.1" className="fill-rose-500 dark:fill-rose-300" />
            </svg>
          </>
        )}
      </div>
    );
  }

  if (style === 'cozy_stitch') {
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-[3px] rounded-[19px] z-[22]"
      >
        <div className="absolute inset-0 rounded-[19px] border-[2px] border-dashed border-amber-800/65 dark:border-amber-400/70 shadow-[0_0_0_2px_rgba(217,119,6,0.12)]" />
      </div>
    );
  }

  if (style === 'royal_seal') {
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-[3px] rounded-[19px] z-[22]"
      >
        <div className="absolute inset-0 rounded-[19px] border-[2px] border-teal-800/80 dark:border-teal-400/80" />
        {!isSimplified && (
          <>
            <div className="absolute inset-[2.5px] rounded-[16px] border border-amber-500/60 dark:border-amber-300/55" />
            <div className="absolute -bottom-[3.5px] left-1/2 -translate-x-1/2 w-2.5 h-2.5 rotate-45 rounded-[2px] bg-amber-500 dark:bg-amber-400 border border-white dark:border-zinc-900 shadow-xs" />
          </>
        )}
      </div>
    );
  }

  return null;
};
