/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  ChevronDown,
  RefreshCw,
  Cloud,
  CloudOff,
  Check,
  LogOut,
  AlertTriangle,
  Copy,
  Loader2,
  HardDrive,
} from 'lucide-react';
import { AnimatedSyncIcon, SyncIconState } from './AnimatedIcons';
import { useAuth, describeFirebaseAuthError, FirebaseAuthErrorDetails } from '../context/AuthContext';

export type SyncStatusType = 'synced' | 'syncing' | 'error' | 'offline' | 'rejected' | 'schema_mismatch';

type FirebaseConnectionState =
  | 'checking'
  | 'syncing'
  | 'offline'
  | 'error'
  | 'disconnected'
  | 'pending'
  | 'connected';

export interface ServerStatusIndicatorProps {
  syncStatus?: SyncStatusType;
  isServerConnected?: boolean;
  isAdmin?: boolean;
  onSyncNow?: () => void;
  lastSavedTime?: Date | null;
  isFirebaseSyncing?: boolean;
  firebaseSyncMode?: 'push' | 'pull' | null;
  lastFirebaseSyncTime?: Date | null;
  hasUnsyncedFirebaseChanges?: boolean;
  className?: string;
}

function formatClockTime(date?: Date | null): string {
  if (!date) return '';
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export const ServerStatusIndicator: React.FC<ServerStatusIndicatorProps> = ({
  syncStatus = 'synced',
  isServerConnected = true,
  isAdmin = true,
  onSyncNow,
  lastSavedTime,
  isFirebaseSyncing = false,
  firebaseSyncMode = null,
  lastFirebaseSyncTime = null,
  hasUnsyncedFirebaseChanges = false,
  className = '',
}) => {
  const { currentUser, isCloudAuthenticated, loading: authLoading, signInWithGoogle, logOut } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<FirebaseAuthErrorDetails | null>(null);
  const [copiedHelper, setCopiedHelper] = useState<'domain' | 'url' | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const isOffline = !isServerConnected || syncStatus === 'offline';
  const hasSyncError =
    syncStatus === 'error' || syncStatus === 'rejected' || syncStatus === 'schema_mismatch';
  const isSyncing = syncStatus === 'syncing' || isFirebaseSyncing;

  useEffect(() => {
    if (isCloudAuthenticated) {
      setAuthError(null);
      setIsSigningIn(false);
    }
  }, [isCloudAuthenticated]);

  const handleGoogleSignIn = async () => {
    if (isSigningIn || isOffline) return;
    setAuthError(null);
    setIsSigningIn(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setAuthError(describeFirebaseAuthError(err));
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleCopyText = async (text: string, type: 'domain' | 'url') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedHelper(type);
      window.setTimeout(() => setCopiedHelper((prev) => (prev === type ? null : prev)), 2000);
    } catch {
      /* clipboard permission denied */
    }
  };

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

  const firebaseState: FirebaseConnectionState = authLoading
    ? 'checking'
    : isFirebaseSyncing
    ? 'syncing'
    : isOffline
    ? 'offline'
    : hasSyncError
    ? 'error'
    : !isCloudAuthenticated
    ? 'disconnected'
    : hasUnsyncedFirebaseChanges || !lastFirebaseSyncTime
    ? 'pending'
    : 'connected';

  const iconState: SyncIconState =
    firebaseState === 'syncing'
      ? 'firestore-syncing'
      : syncStatus === 'syncing'
      ? 'server-syncing'
      : firebaseState === 'offline' || firebaseState === 'disconnected' || firebaseState === 'checking'
      ? 'local'
      : firebaseState === 'error'
      ? 'error'
      : 'firestore-synced';

  const isActivelyTransferring =
    iconState === 'firestore-syncing' || iconState === 'server-syncing';

  const getStatusConfig = () => {
    switch (firebaseState) {
      case 'checking':
        return {
          label: 'Перевірка…',
          title: 'Перевірка зв’язку з Firebase',
          subtitle: 'Ініціалізація сесії…',
          triggerClasses:
            'bg-stone-100 text-stone-700 border-stone-300 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700',
          glyphBoxClasses:
            'bg-stone-200/80 text-stone-700 dark:bg-zinc-800 dark:text-zinc-300',
          iconColor: 'text-stone-600 dark:text-zinc-300',
          dotColor: 'bg-stone-400',
          firebaseRowDot: 'bg-stone-400',
          firebaseRowText: 'Перевірка…',
          firebaseRowTone: 'text-stone-500 dark:text-zinc-400',
        };

      case 'syncing':
        return {
          label: 'Хмара…',
          title:
            firebaseSyncMode === 'pull'
              ? 'Завантаження з Firebase…'
              : 'Синхронізація з Firebase…',
          subtitle: 'Передача даних у Firestore',
          triggerClasses:
            'bg-amber-50 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-800/70 cursor-wait',
          glyphBoxClasses:
            'bg-amber-100/90 text-amber-700 dark:bg-amber-950/70 dark:text-amber-400',
          iconColor: 'text-amber-600 dark:text-amber-400',
          dotColor: 'bg-amber-500',
          firebaseRowDot: 'bg-amber-500 animate-pulse',
          firebaseRowText: 'Синхронізація…',
          firebaseRowTone: 'text-amber-700 dark:text-amber-400',
        };

      case 'offline':
        return {
          label: 'Офлайн',
          title: 'Немає інтернет-з’єднання',
          subtitle: 'Зміни зберігаються лише локально',
          triggerClasses:
            'bg-stone-100 hover:bg-stone-200/80 text-stone-700 border-stone-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-300 dark:border-zinc-700',
          glyphBoxClasses:
            'bg-stone-200/80 text-stone-700 dark:bg-zinc-800 dark:text-zinc-300',
          iconColor: 'text-stone-600 dark:text-zinc-300',
          dotColor: 'bg-stone-500',
          firebaseRowDot: 'bg-stone-400 dark:bg-zinc-500',
          firebaseRowText: 'Немає мережі',
          firebaseRowTone: 'text-stone-500 dark:text-zinc-400',
        };

      case 'error':
        return {
          label: 'Помилка',
          title: 'Помилка зв’язку з Firebase',
          subtitle: 'Дані збережено локально у браузері',
          triggerClasses:
            'bg-rose-50 hover:bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-950/60 dark:hover:bg-rose-950/80 dark:text-rose-200 dark:border-rose-800/70',
          glyphBoxClasses:
            'bg-rose-100/90 text-rose-700 dark:bg-rose-950/70 dark:text-rose-400',
          iconColor: 'text-rose-600 dark:text-rose-400',
          dotColor: 'bg-rose-500',
          firebaseRowDot: 'bg-rose-500',
          firebaseRowText: 'Помилка запису',
          firebaseRowTone: 'text-rose-600 dark:text-rose-400',
        };

      case 'disconnected':
        return {
          label: 'Локально',
          title: 'Firebase не підключено',
          subtitle: 'Збереження працює тільки в браузері',
          triggerClasses:
            'bg-white hover:bg-stone-50 text-stone-800 border-stone-200/90 dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:text-zinc-200 dark:border-zinc-700/90',
          glyphBoxClasses:
            'bg-stone-100 text-stone-600 dark:bg-zinc-800 dark:text-zinc-300',
          iconColor: 'text-stone-600 dark:text-zinc-300',
          dotColor: 'bg-amber-500',
          firebaseRowDot: 'bg-stone-400 dark:bg-zinc-500',
          firebaseRowText: 'Не підключено',
          firebaseRowTone: 'text-stone-500 dark:text-zinc-400',
        };

      case 'pending':
        return {
          label: 'Хмара',
          title: 'Firebase підключено',
          subtitle: 'Є зміни, що очікують синхронізації',
          triggerClasses:
            'bg-white hover:bg-amber-50/50 text-stone-800 border-amber-300/90 dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:text-zinc-200 dark:border-amber-700/70',
          glyphBoxClasses:
            'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400',
          iconColor: 'text-emerald-600 dark:text-emerald-400',
          dotColor: 'bg-amber-500',
          firebaseRowDot: 'bg-amber-500',
          firebaseRowText: 'Є незбережені зміни',
          firebaseRowTone: 'text-amber-700 dark:text-amber-400',
        };

      case 'connected':
      default:
        return {
          label: 'Firebase',
          title: 'Firebase підключено',
          subtitle: lastFirebaseSyncTime
            ? `Хмару оновлено о ${formatClockTime(lastFirebaseSyncTime)}`
            : 'Локально та у хмарі актуально',
          triggerClasses:
            'bg-white hover:bg-emerald-50/50 text-stone-800 border-emerald-200/90 dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:text-zinc-200 dark:border-emerald-800/60',
          glyphBoxClasses:
            'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400',
          iconColor: 'text-emerald-600 dark:text-emerald-400',
          dotColor: 'bg-emerald-500',
          firebaseRowDot: 'bg-emerald-500',
          firebaseRowText: lastFirebaseSyncTime
            ? formatClockTime(lastFirebaseSyncTime)
            : 'Актуально',
          firebaseRowTone: 'text-emerald-700 dark:text-emerald-400',
        };
    }
  };

  const currentConfig = getStatusConfig();

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`relative h-8.5 px-2.5 sm:px-3 rounded-lg border flex items-center gap-1.5 text-xs font-semibold transition-colors duration-150 cursor-pointer select-none active:scale-95 whitespace-nowrap ${currentConfig.triggerClasses} ${className}`}
        title={`${currentConfig.title} — ${currentConfig.subtitle}`}
        aria-label={`Стан синхронізації: ${currentConfig.title}`}
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
        {isAdmin && firebaseState === 'pending' && (
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
            className="fixed sm:absolute right-3 sm:right-0 top-14 sm:top-11 w-[calc(100vw-24px)] sm:w-80 max-w-xs bg-white/95 dark:bg-[#1c1f24]/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-stone-200/90 dark:border-zinc-800 overflow-hidden z-50"
          >
            {/* Header */}
            <div className="px-4 py-3 flex items-start justify-between gap-2.5 border-b border-stone-100 dark:border-zinc-800">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`w-8.5 h-8.5 rounded-xl flex items-center justify-center shrink-0 ${currentConfig.glyphBoxClasses}`}
                >
                  <AnimatedSyncIcon state={iconState} size={17} />
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
                    <span className="text-[11px] text-stone-500 dark:text-zinc-400 truncate">
                      {currentConfig.subtitle}
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
              {/* Storage & Firebase Connection Layers */}
              <div className="rounded-xl bg-stone-50/90 dark:bg-zinc-900/70 border border-stone-200/80 dark:border-zinc-800 divide-y divide-stone-200/70 dark:divide-zinc-800/80">
                {/* Local browser persistence */}
                <div className="px-3 py-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <HardDrive size={13} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span className="text-[11px] font-medium text-stone-700 dark:text-zinc-300 truncate">
                      Локально (браузер)
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span className="text-[11px] font-mono tabular-nums text-stone-600 dark:text-zinc-400">
                      {lastSavedTime ? formatClockTime(lastSavedTime) : 'Активно'}
                    </span>
                  </div>
                </div>

                {/* Firebase Firestore connection */}
                <div className="px-3 py-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {isCloudAuthenticated && !isOffline ? (
                      <Cloud
                        size={13}
                        className={`shrink-0 ${
                          firebaseState === 'error'
                            ? 'text-rose-500 dark:text-rose-400'
                            : firebaseState === 'pending' || firebaseState === 'syncing'
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      />
                    ) : (
                      <CloudOff size={13} className="text-stone-400 dark:text-zinc-500 shrink-0" />
                    )}
                    <span className="text-[11px] font-medium text-stone-700 dark:text-zinc-300 truncate">
                      Firebase Firestore
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`w-1.5 h-1.5 rounded-full ${currentConfig.firebaseRowDot}`} />
                    <span
                      className={`text-[11px] font-mono tabular-nums font-medium ${currentConfig.firebaseRowTone}`}
                    >
                      {currentConfig.firebaseRowText}
                    </span>
                  </div>
                </div>
              </div>

              {/* Admin Cloud Auth & State-Aware Action */}
              {isAdmin && (
                authLoading ? (
                  <div className="flex items-center justify-center gap-2 py-2 text-xs text-stone-500 dark:text-zinc-400">
                    <Loader2 size={14} className="animate-spin" />
                    <span>Перевірка підключення Google…</span>
                  </div>
                ) : isCloudAuthenticated && currentUser ? (
                  <div className="space-y-2.5">
                    {/* Connected Google Account Chip */}
                    <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/50">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-5 h-5 rounded-full bg-emerald-600/15 dark:bg-emerald-500/20 flex items-center justify-center shrink-0">
                          <Check size={11} className="text-emerald-700 dark:text-emerald-400" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold text-emerald-950 dark:text-emerald-100 truncate">
                            {currentUser.email}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void logOut()}
                        title="Відключити Google-акаунт"
                        aria-label="Відключити Google-акаунт"
                        className="px-2 py-1 rounded-lg text-[11px] font-medium text-stone-500 hover:text-rose-600 hover:bg-white/70 dark:text-zinc-400 dark:hover:text-rose-400 dark:hover:bg-zinc-800/70 flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                      >
                        <LogOut size={12} />
                        <span>Вийти</span>
                      </button>
                    </div>

                    {/* State-aware Firebase Sync Action */}
                    {onSyncNow && (
                      <button
                        type="button"
                        disabled={isSyncing || isOffline}
                        onClick={() => {
                          onSyncNow();
                          setIsOpen(false);
                        }}
                        className={`group w-full h-9.5 px-3.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-[0.98] disabled:opacity-55 disabled:cursor-not-allowed ${
                          firebaseState === 'error'
                            ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-xs'
                            : firebaseState === 'pending' || firebaseState === 'syncing'
                            ? 'bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white shadow-xs'
                            : 'bg-stone-100 hover:bg-emerald-50 text-stone-800 hover:text-emerald-900 border border-stone-200/90 hover:border-emerald-300 dark:bg-zinc-800/90 dark:hover:bg-emerald-950/50 dark:text-zinc-200 dark:hover:text-emerald-300 dark:border-zinc-700 dark:hover:border-emerald-800/70'
                        }`}
                      >
                        <RefreshCw
                          size={14}
                          className={
                            isSyncing
                              ? 'animate-spin'
                              : 'transition-transform duration-300 group-hover:rotate-180'
                          }
                        />
                        <span>
                          {isSyncing
                            ? 'Синхронізація…'
                            : isOffline
                            ? 'Очікується мережа…'
                            : firebaseState === 'error'
                            ? 'Повторити синхронізацію'
                            : firebaseState === 'pending'
                            ? 'Синхронізувати з Firebase'
                            : 'Оновити у хмарі'}
                        </span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <p className="text-[11px] text-stone-500 dark:text-zinc-400 leading-relaxed">
                      Усі зміни автоматично зберігаються у браузері. Підключіть Google, щоб синхронізувати дерево з хмарою Firebase.
                    </p>

                    <button
                      type="button"
                      disabled={isSigningIn || isOffline}
                      onClick={() => void handleGoogleSignIn()}
                      className="w-full h-9.5 px-3.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer active:scale-[0.98] disabled:opacity-55 disabled:cursor-not-allowed"
                    >
                      {isSigningIn ? (
                        <>
                          <Loader2 size={14} className="animate-spin shrink-0" />
                          <span>Відкриття вікна Google…</span>
                        </>
                      ) : (
                        <>
                          <Cloud size={14} className="shrink-0" />
                          <span>
                            {isOffline ? 'Потрібен інтернет для входу' : 'Підключити Google'}
                          </span>
                        </>
                      )}
                    </button>

                    {authError && (
                      <div className="p-2.5 rounded-xl bg-rose-50/90 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/70 text-[11px] text-rose-900 dark:text-rose-200 space-y-1.5">
                        <div className="flex items-start gap-1.5">
                          <AlertTriangle size={13} className="text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                          <span className="leading-snug">{authError.message}</span>
                        </div>

                        {authError.code === 'auth/unauthorized-domain' && authError.domain && (
                          <div className="space-y-1 pt-0.5 border-t border-rose-200/70 dark:border-rose-800/50">
                            <p className="text-[10px] text-rose-700 dark:text-rose-300 leading-snug">
                              Додайте цей домен у Firebase Console ({authError.projectId || 'проєкт'}) → Authentication → Settings → Authorized domains:
                            </p>
                            <div className="flex items-center gap-1">
                              <code className="flex-1 px-1.5 py-1 rounded bg-white/80 dark:bg-zinc-900/80 border border-rose-200/80 dark:border-rose-800/60 font-mono text-[10px] truncate select-all">
                                {authError.domain}
                              </code>
                              <button
                                type="button"
                                onClick={() => void handleCopyText(authError.domain!, 'domain')}
                                className="px-2 py-1 rounded bg-rose-100 hover:bg-rose-200 dark:bg-rose-900/60 dark:hover:bg-rose-900 text-[10px] font-semibold flex items-center gap-1 cursor-pointer shrink-0"
                                title="Скопіювати домен"
                              >
                                {copiedHelper === 'domain' ? <Check size={11} /> : <Copy size={11} />}
                                <span>{copiedHelper === 'domain' ? 'Скопійовано' : 'Копіювати'}</span>
                              </button>
                            </div>
                          </div>
                        )}

                        {authError.code === 'auth/popup-blocked' && typeof window !== 'undefined' && (
                          <div className="pt-0.5 border-t border-rose-200/70 dark:border-rose-800/50 flex items-center justify-between gap-2">
                            <span className="text-[10px] text-rose-700 dark:text-rose-300 leading-snug">
                              Якщо вікно блокується у вбудованій рамці — відкрийте сайт у новій вкладці:
                            </span>
                            <button
                              type="button"
                              onClick={() => void handleCopyText(window.location.href, 'url')}
                              className="px-2 py-1 rounded bg-rose-100 hover:bg-rose-200 dark:bg-rose-900/60 dark:hover:bg-rose-900 text-[10px] font-semibold flex items-center gap-1 cursor-pointer shrink-0"
                            >
                              {copiedHelper === 'url' ? <Check size={11} /> : <Copy size={11} />}
                              <span>{copiedHelper === 'url' ? 'Скопійовано' : 'URL'}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
