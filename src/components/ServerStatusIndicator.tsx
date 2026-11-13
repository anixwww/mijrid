/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ChevronDown, RefreshCw, Download, Cloud, Check, LogOut } from 'lucide-react';
import { AnimatedSyncIcon, SyncIconState } from './AnimatedIcons';
import { useAuth } from '../context/AuthContext';

export type SyncStatusType = 'synced' | 'syncing' | 'error' | 'offline' | 'rejected' | 'schema_mismatch';

export interface ServerStatusIndicatorProps {
  syncStatus?: SyncStatusType;
  isServerConnected?: boolean;
  isAdmin?: boolean;
  onSyncNow?: () => void;
  onRestoreFromCloud?: () => void;
  lastSavedTime?: Date | null;
  isFirebaseSyncing?: boolean;
  firebaseSyncMode?: 'push' | 'pull' | null;
  lastFirebaseSyncTime?: Date | null;
  hasUnsyncedFirebaseChanges?: boolean;
  className?: string;
}

export const ServerStatusIndicator: React.FC<ServerStatusIndicatorProps> = ({
  syncStatus = 'synced',
  isServerConnected = true,
  isAdmin = true,
  onSyncNow,
  onRestoreFromCloud,
  lastSavedTime,
  isFirebaseSyncing = false,
  firebaseSyncMode = null,
  lastFirebaseSyncTime = null,
  hasUnsyncedFirebaseChanges = false,
  className = '',
}) => {
  const { currentUser, isCloudAuthenticated, signInWithGoogle, logOut } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isSyncing = syncStatus === 'syncing' || isFirebaseSyncing;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const iconState: SyncIconState = isFirebaseSyncing
    ? 'firestore-syncing'
    : !isServerConnected || syncStatus === 'offline'
    ? 'local'
    : syncStatus === 'error' || syncStatus === 'rejected' || syncStatus === 'schema_mismatch'
    ? 'error'
    : syncStatus === 'syncing'
    ? 'server-syncing'
    : lastFirebaseSyncTime && !hasUnsyncedFirebaseChanges
    ? 'firestore-synced'
    : 'server-synced';

  const isActivelyTransferring =
    iconState === 'firestore-syncing' || iconState === 'server-syncing';

  const getStatusConfig = () => {
    if (iconState === 'firestore-syncing') {
      const isPull = firebaseSyncMode === 'pull';
      return {
        label: isPull ? 'Хмара ↓…' : 'Хмара ↑…',
        title: isPull ? 'Відновлення з Firebase' : 'Синхронізація з хмарою',
        desc: isPull
          ? 'Триває відновлення збережених полотен з хмари Firebase…'
          : 'Збереження усіх полотен у хмару Firebase…',
        triggerClasses:
          'bg-amber-50 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-800/70 cursor-wait',
        glyphBoxClasses:
          'bg-amber-100/90 text-amber-700 dark:bg-amber-950/70 dark:text-amber-400',
        iconColor: 'text-amber-600 dark:text-amber-400',
        dotColor: 'bg-amber-500',
      };
    }

    if (iconState === 'firestore-synced') {
      return {
        label: 'Синхр.',
        title: 'Сервер та хмара актуальні',
        desc: isAdmin
          ? 'Усі полотна збережено локально, на сервері та в хмарі Firebase.'
          : 'Ви переглядаєте актуальну версію дерева.',
        triggerClasses:
          'bg-white hover:bg-emerald-50/50 text-stone-800 border-emerald-200/90 dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:text-zinc-200 dark:border-emerald-800/60',
        glyphBoxClasses:
          'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400',
        iconColor: 'text-emerald-600 dark:text-emerald-400',
        dotColor: 'bg-emerald-500',
      };
    }

    if (iconState === 'server-syncing') {
      return {
        label: 'Синхр…',
        title: 'Синхронізація…',
        desc: 'Триває збереження даних на сервері…',
        triggerClasses:
          'bg-sky-50 text-sky-900 border-sky-300 dark:bg-sky-950/60 dark:text-sky-200 dark:border-sky-800/70 cursor-wait',
        glyphBoxClasses:
          'bg-sky-100/90 text-sky-700 dark:bg-sky-950/70 dark:text-sky-400',
        iconColor: 'text-sky-600 dark:text-sky-400',
        dotColor: 'bg-sky-500',
      };
    }

    if (iconState === 'local') {
      return {
        label: 'Локал',
        title: 'Локальний режим (у браузері)',
        desc: isAdmin
          ? 'Сервер зараз недоступний — зміни збережено локально у браузері.'
          : 'Відображається локально кешована копія дерева.',
        triggerClasses:
          'bg-stone-100 hover:bg-stone-200/80 text-stone-700 border-stone-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-300 dark:border-zinc-700',
        glyphBoxClasses:
          'bg-stone-200/80 text-stone-700 dark:bg-zinc-800 dark:text-zinc-300',
        iconColor: 'text-stone-600 dark:text-zinc-300',
        dotColor: 'bg-stone-500',
      };
    }

    if (iconState === 'error') {
      return {
        label: 'Помилка',
        title: 'Помилка синхронізації',
        desc: 'Дані збережено локально. Натисніть «Синхронізувати», щоб повторити відправку.',
        triggerClasses:
          'bg-rose-50 hover:bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-950/60 dark:hover:bg-rose-950/80 dark:text-rose-200 dark:border-rose-800/70',
        glyphBoxClasses:
          'bg-rose-100/90 text-rose-700 dark:bg-rose-950/70 dark:text-rose-400',
        iconColor: 'text-rose-600 dark:text-rose-400',
        dotColor: 'bg-rose-500',
      };
    }

    return {
      label: isAdmin ? 'Онлайн' : 'Онлайн',
      title: 'Синхронізація активна',
      desc: isAdmin
        ? isCloudAuthenticated
          ? 'Зміни зберігаються автоматично. Одна кнопка синхронізує і сервер, і Firebase.'
          : 'Зміни зберігаються автоматично на сервер. Підключіть Google для синхронізації з хмарою Firebase.'
        : 'Ви переглядаєте актуальну версію дерева.',
      triggerClasses:
        'bg-white hover:bg-stone-50 text-stone-800 border-stone-200/90 dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:text-zinc-200 dark:border-zinc-700/90',
      glyphBoxClasses:
        'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      dotColor: 'bg-emerald-500',
    };
  };

  const currentConfig = getStatusConfig();

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`relative h-8.5 px-2.5 sm:px-3 rounded-lg border flex items-center gap-1.5 text-xs font-semibold transition-colors duration-150 cursor-pointer select-none active:scale-95 whitespace-nowrap ${currentConfig.triggerClasses} ${className}`}
        title={
          isAdmin && hasUnsyncedFirebaseChanges && isCloudAuthenticated && !isSyncing
            ? `${currentConfig.title} (є несинхронізовані зміни для хмари)`
            : currentConfig.title
        }
        aria-label={`Стан синхронізації: ${currentConfig.label}`}
        aria-expanded={isOpen}
      >
        <AnimatedSyncIcon
          state={iconState}
          size={15}
          className={currentConfig.iconColor}
        />
        <span className="hidden md:inline text-xs font-semibold tracking-tight">
          {currentConfig.label}
        </span>
        {isAdmin && hasUnsyncedFirebaseChanges && isCloudAuthenticated && iconState === 'server-synced' && (
          <span
            className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"
            title="Є зміни, які ще не надіслано у Firebase"
          />
        )}
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 26 }}
          className="inline-flex items-center justify-center text-stone-400 dark:text-zinc-500"
        >
          <ChevronDown size={12} />
        </motion.span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="fixed sm:absolute right-3 sm:right-0 top-14 sm:top-11 w-[calc(100vw-24px)] sm:w-76 max-w-xs bg-white/95 dark:bg-[#1c1f24]/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-stone-200/90 dark:border-zinc-800 overflow-hidden z-50"
          >
            {/* Header */}
            <div className="px-4 py-3 flex items-start justify-between gap-2.5 border-b border-stone-100 dark:border-zinc-800">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${currentConfig.glyphBoxClasses}`}
                >
                  <AnimatedSyncIcon state={iconState} size={16} />
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-stone-900 dark:text-zinc-100 leading-tight truncate">
                    {currentConfig.title}
                  </h4>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${currentConfig.dotColor} ${
                        isActivelyTransferring ? 'animate-pulse' : ''
                      }`}
                    />
                    <span className="text-[11px] text-stone-500 dark:text-zinc-400 font-mono tabular-nums truncate">
                      {lastSavedTime
                        ? `Оновлено: ${lastSavedTime.toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}`
                        : isServerConnected
                        ? 'Зв’язок активний'
                        : 'Лише локально'}
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 dark:text-zinc-500 dark:hover:text-zinc-200 dark:hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
                aria-label="Закрити"
              >
                <X size={15} />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <p className="text-xs text-stone-600 dark:text-zinc-400 leading-relaxed">
                {currentConfig.desc}
              </p>

              {/* Google Account status row (single compact line) */}
              {isAdmin && (
                isCloudAuthenticated && currentUser ? (
                  <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-800/50">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Check size={12} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span className="text-[11px] font-medium text-emerald-900 dark:text-emerald-200 truncate">
                        {currentUser.email}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => void logOut()}
                      title="Відключити Google-акаунт"
                      className="p-1 rounded-md text-stone-400 hover:text-rose-600 cursor-pointer shrink-0"
                    >
                      <LogOut size={12} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => void signInWithGoogle().catch(() => {})}
                    className="w-full px-2.5 py-1.5 rounded-xl bg-stone-50 hover:bg-stone-100 dark:bg-zinc-900 dark:hover:bg-zinc-800 border border-stone-200/80 dark:border-zinc-800 text-[11px] font-semibold text-stone-700 dark:text-zinc-300 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Cloud size={12.5} className="text-amber-600 dark:text-amber-400 shrink-0" />
                    <span>Підключити Google для хмари</span>
                  </button>
                )
              )}

              {/* Primary Unified Sync Action + Secondary Recovery */}
              <div className="space-y-1.5">
                {isAdmin && onSyncNow && (
                  <button
                    type="button"
                    disabled={isSyncing}
                    onClick={() => {
                      onSyncNow();
                      setIsOpen(false);
                    }}
                    className="group w-full h-9.5 px-3.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer active:scale-[0.98] disabled:opacity-50"
                    title="Зберегти зміни локально, на сервер та у хмару Firebase"
                  >
                    <RefreshCw
                      size={14}
                      className={isSyncing ? 'animate-spin' : 'transition-transform duration-300 group-hover:rotate-180'}
                    />
                    <span>{isSyncing ? 'Синхронізація…' : 'Синхронізувати'}</span>
                  </button>
                )}

                {onRestoreFromCloud && (
                  <button
                    type="button"
                    disabled={isSyncing}
                    onClick={() => {
                      onRestoreFromCloud();
                      setIsOpen(false);
                    }}
                    className="w-full py-1.5 px-2 rounded-lg text-[11px] font-medium text-stone-500 hover:text-stone-800 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-stone-100/80 dark:hover:bg-zinc-800/70 flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                    title="Завантажити збережену версію з хмари або сервера"
                  >
                    <Download size={12} className="shrink-0" />
                    <span>Відновити з хмари / сервера</span>
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
