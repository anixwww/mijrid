import React from 'react';
import { motion, AnimatePresence } from 'motion/react';

export type SyncIconState =
  | 'firestore-syncing'
  | 'firestore-synced'
  | 'server-syncing'
  | 'server-synced'
  | 'local'
  | 'error';

interface AnimatedSyncIconProps {
  state: SyncIconState;
  size?: number;
  className?: string;
}

/**
 * Steady vector icon clearly distinguishing Firebase Firestore, Express Server, and Local storage states
 * without unmount/remount flickering.
 */
export const AnimatedSyncIcon: React.FC<AnimatedSyncIconProps> = ({
  state,
  size = 16,
  className = '',
}) => {
  return (
    <span
      className={`relative inline-flex items-center justify-center shrink-0 transition-colors duration-200 ${className}`}
      style={{ width: size, height: size }}
    >
      {state === 'firestore-syncing' && (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          {/* Outer smooth sync arc */}
          <g
            className="animate-spin"
            style={{ transformOrigin: '12px 12px', animationDuration: '1.1s' }}
          >
            <path
              d="M20.5 12A8.5 8.5 0 0 0 5.9 6.1"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M3.5 12a8.5 8.5 0 0 0 14.6 5.9"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              opacity="0.45"
            />
          </g>
          {/* Firebase flame core */}
          <path
            d="M12.2 6.8c-.4 1.5-1.5 2.4-2.2 3.4-.8 1.1-1.1 2.1-.8 3.3.3 1.4 1.5 2.4 2.9 2.4 1.6 0 2.9-1.3 2.9-3 0-1.4-.7-2.6-1.6-3.7-.3-.4-.8-1.4-1.2-2.4Z"
            fill="currentColor"
          />
        </svg>
      )}

      {state === 'firestore-synced' && (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          {/* Cloud contour */}
          <path
            d="M6.5 18.5h11a3.5 3.5 0 0 0 .5-6.96A5.5 5.5 0 0 0 7.36 10.1 4 4 0 0 0 6.5 18.5Z"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Firebase flame inside cloud */}
          <path
            d="M12.3 10.2c-.35 1-1.1 1.65-1.55 2.35-.45.7-.6 1.35-.4 2.05.25.85 1 1.45 1.85 1.45 1 0 1.8-.8 1.8-1.85 0-.85-.45-1.6-1-2.3-.25-.3-.5-.95-.7-1.7Z"
            fill="currentColor"
          />
        </svg>
      )}

      {state === 'server-syncing' && (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <g
            className="animate-spin"
            style={{ transformOrigin: '12px 12px', animationDuration: '1.1s' }}
          >
            <path
              d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"
              stroke="currentColor"
              strokeWidth="2.1"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M3 3v5h5"
              stroke="currentColor"
              strokeWidth="2.1"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"
              stroke="currentColor"
              strokeWidth="2.1"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.45"
            />
          </g>
          {/* Server node center */}
          <rect x="9.2" y="9.2" width="5.6" height="5.6" rx="1.4" fill="currentColor" />
        </svg>
      )}

      {state === 'server-synced' && (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          {/* Top server blade */}
          <rect
            x="3.5"
            y="4.5"
            width="17"
            height="6"
            rx="1.8"
            stroke="currentColor"
            strokeWidth="1.9"
          />
          {/* Bottom server blade */}
          <rect
            x="3.5"
            y="13.5"
            width="17"
            height="6"
            rx="1.8"
            stroke="currentColor"
            strokeWidth="1.9"
          />
          {/* Status LEDs */}
          <circle cx="7" cy="7.5" r="1" fill="currentColor" />
          <circle cx="7" cy="16.5" r="1" fill="currentColor" />
          {/* Active connection bars */}
          <path
            d="M11.5 7.5h5.5M11.5 16.5h5.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      )}

      {state === 'local' && (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          {/* Local storage drive / device chassis */}
          <path
            d="M4 14.5 6.2 6.6A2 2 0 0 1 8.12 5h7.76a2 2 0 0 1 1.92 1.6L20 14.5"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <rect
            x="3.5"
            y="13.5"
            width="17"
            height="6"
            rx="2"
            stroke="currentColor"
            strokeWidth="1.9"
          />
          <circle cx="16.5" cy="16.5" r="1" fill="currentColor" />
          <path
            d="M7 16.5h4.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      )}

      {state === 'error' && (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <line
            x1="12"
            y1="9"
            x2="12"
            y2="13.2"
            stroke="currentColor"
            strokeWidth="2.1"
            strokeLinecap="round"
          />
          <circle cx="12" cy="17" r="1.15" fill="currentColor" />
        </svg>
      )}
    </span>
  );
};

interface AnimatedThemeIconProps {
  isDark: boolean;
  size?: number;
}

/**
 * Smoothly morphing Sun / Moon theme toggle icon with gentle ambient details.
 */
export const AnimatedThemeIcon: React.FC<AnimatedThemeIconProps> = ({ isDark, size = 16 }) => {
  return (
    <span
      className="relative inline-flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
    >
      <AnimatePresence mode="wait" initial={false}>
        {isDark ? (
          <motion.svg
            key="sun"
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            initial={{ rotate: -65, scale: 0.65, opacity: 0 }}
            animate={{ rotate: 0, scale: 1, opacity: 1 }}
            exit={{ rotate: 65, scale: 0.65, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 360, damping: 22 }}
          >
            <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="2" />
            <motion.g
              whileHover={{ rotate: 45 }}
              transition={{ type: 'spring', stiffness: 260, damping: 18 }}
              style={{ originX: '12px', originY: '12px' }}
            >
              <path
                d="M12 2v2.2M12 19.8V22M4.93 4.93l1.56 1.56M17.51 17.51l1.56 1.56M2 12h2.2M19.8 12H22M4.93 19.07l1.56-1.56M17.51 6.49l1.56-1.56"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </motion.g>
          </motion.svg>
        ) : (
          <motion.svg
            key="moon"
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            initial={{ rotate: 45, scale: 0.65, opacity: 0 }}
            animate={{ rotate: 0, scale: 1, opacity: 1 }}
            exit={{ rotate: -45, scale: 0.65, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 360, damping: 22 }}
          >
            <path
              d="M20.354 15.354A9 9 0 0 1 8.646 3.646 9.003 9.003 0 0 0 12 21a9.003 9.003 0 0 0 8.354-5.646Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <motion.circle
              cx="18"
              cy="6"
              r="1.1"
              fill="currentColor"
              animate={{ opacity: [0.35, 1, 0.35], scale: [0.85, 1.15, 0.85] }}
              transition={{ repeat: Infinity, duration: 2.6, ease: 'easeInOut' }}
            />
          </motion.svg>
        )}
      </AnimatePresence>
    </span>
  );
};

interface AnimatedMenuIconProps {
  isOpen: boolean;
  size?: number;
}

/**
 * Three-bar hamburger icon that smoothly morphs into an X when open.
 */
export const AnimatedMenuIcon: React.FC<AnimatedMenuIconProps> = ({ isOpen, size = 15 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      className="shrink-0"
    >
      <motion.line
        x1="4"
        x2="20"
        initial={false}
        animate={
          isOpen
            ? { y1: 12, y2: 12, rotate: 45 }
            : { y1: 6.5, y2: 6.5, rotate: 0 }
        }
        transition={{ type: 'spring', stiffness: 420, damping: 28 }}
        style={{ originX: '12px', originY: '12px' }}
      />
      <motion.line
        x1="4"
        y1="12"
        x2="20"
        y2="12"
        initial={false}
        animate={isOpen ? { opacity: 0, scaleX: 0.4 } : { opacity: 1, scaleX: 1 }}
        transition={{ duration: 0.14 }}
        style={{ originX: '12px', originY: '12px' }}
      />
      <motion.line
        x1="4"
        x2="20"
        initial={false}
        animate={
          isOpen
            ? { y1: 12, y2: 12, rotate: -45 }
            : { y1: 17.5, y2: 17.5, rotate: 0 }
        }
        transition={{ type: 'spring', stiffness: 420, damping: 28 }}
        style={{ originX: '12px', originY: '12px' }}
      />
    </svg>
  );
};

interface AnimatedValidationIconProps {
  issueCount: number;
  errorCount: number;
  size?: number;
}

/**
 * Animated validation glyph: subtle alert pulse when errors/warnings exist, crisp check draw when clean.
 */
export const AnimatedValidationIcon: React.FC<AnimatedValidationIconProps> = ({
  issueCount,
  errorCount,
  size = 15,
}) => {
  if (issueCount > 0) {
    return (
      <span
        className="relative inline-flex items-center justify-center shrink-0"
        style={{ width: size, height: size }}
      >
        {errorCount > 0 && (
          <motion.span
            className="absolute inset-0 rounded-full bg-rose-500/30"
            animate={{ scale: [1, 1.55, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
          />
        )}
        <motion.svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          initial={{ scale: 0.85 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 22 }}
        >
          <path
            d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <line
            x1="12"
            y1="9"
            x2="12"
            y2="13"
            stroke="currentColor"
            strokeWidth="2.1"
            strokeLinecap="round"
          />
          <circle cx="12" cy="17" r="1" fill="currentColor" />
        </motion.svg>
      </span>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className="shrink-0"
    >
      <circle cx="12" cy="12" r="9.2" stroke="currentColor" strokeWidth="1.9" />
      <motion.path
        d="m8.6 12.2 2.3 2.3 4.6-4.7"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.32, ease: 'easeOut' }}
      />
    </svg>
  );
};

interface AnimatedLockIconProps {
  locked: boolean;
  size?: number;
  className?: string;
}

/**
 * Spring-animated padlock glyph for freezing/unfreezing tree card positions.
 */
export const AnimatedLockIcon: React.FC<AnimatedLockIconProps> = ({
  locked,
  size = 15,
  className = '',
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
    >
      <motion.path
        d="M7 11V7a5 5 0 0 1 10 0v4"
        initial={false}
        animate={
          locked
            ? { y: 0, rotate: 0 }
            : { y: -3.2, rotate: -26 }
        }
        transition={{ type: 'spring', stiffness: 420, damping: 24 }}
        style={{ originX: '17px', originY: '11px' }}
      />
      <motion.rect
        x="3"
        y="11"
        width="18"
        height="11"
        rx="2.5"
        ry="2.5"
        initial={false}
        animate={{
          fillOpacity: locked ? 0.16 : 0,
        }}
        fill="currentColor"
        transition={{ duration: 0.18 }}
      />
      <motion.circle
        cx="12"
        cy="16"
        r="1.25"
        fill="currentColor"
        initial={false}
        animate={{ scale: locked ? 1.15 : 0.9 }}
        transition={{ type: 'spring', stiffness: 450, damping: 24 }}
        style={{ originX: '12px', originY: '16px' }}
      />
      <path d="M12 17.2v1.6" strokeWidth="1.9" />
    </svg>
  );
};

interface AnimatedFocusIconProps {
  active: boolean;
  size?: number;
}

/**
 * Animated crosshair/focus rings for lineage focus toggle.
 */
export const AnimatedFocusIcon: React.FC<AnimatedFocusIconProps> = ({ active, size = 15 }) => {
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
      className="shrink-0"
    >
      <motion.circle
        cx="12"
        cy="12"
        r="3"
        initial={false}
        animate={active ? { scale: [1, 1.25, 1] } : { scale: 1 }}
        transition={active ? { repeat: Infinity, duration: 2.2, ease: 'easeInOut' } : { duration: 0.2 }}
        style={{ originX: '12px', originY: '12px' }}
      />
      <motion.path
        d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"
        initial={false}
        animate={{ scale: active ? 0.92 : 1 }}
        transition={{ type: 'spring', stiffness: 360, damping: 22 }}
        style={{ originX: '12px', originY: '12px' }}
      />
    </svg>
  );
};
