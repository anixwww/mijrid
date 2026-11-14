/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Link2,
  Copy,
  Check,
  Eye,
  Pause,
  Play,
  Trash2,
  Cloud,
  Loader2,
  Layers,
  Clock,
  UserCheck,
  ExternalLink,
  AlertTriangle,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { FamilyTreeData, Person } from '../types/tree';
import { useAuth, describeFirebaseAuthError, FirebaseAuthErrorDetails } from '../context/AuthContext';
import {
  fetchServerTrees,
  loadTreeById,
  MAIN_TREE_ID,
  normalizeTreeId,
  LocalTreeIndexItem,
} from '../utils/fileStorage';
import {
  buildGuestShareUrl,
  createGuestShareLink,
  deleteGuestShareLink,
  GuestShareLink,
  isShareExpired,
  listAdminGuestShareLinks,
  updateGuestShareLink,
} from '../utils/guestShareService';
import { ToastMessage } from './Toast';

interface GuestShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTree: FamilyTreeData;
  initialTreeId?: string;
  hasUnsyncedFirebaseChanges: boolean;
  isFirebaseSyncing: boolean;
  onPublishToCloud: () => Promise<{ ok: boolean; error?: string }>;
  showToast: (msg: Omit<ToastMessage, 'id'>) => void;
}

export const GuestShareModal: React.FC<GuestShareModalProps> = ({
  isOpen,
  onClose,
  currentTree,
  initialTreeId,
  hasUnsyncedFirebaseChanges,
  isFirebaseSyncing,
  onPublishToCloud,
  showToast,
}) => {
  const { currentUser, isCloudAuthenticated, signInWithGoogle } = useAuth();

  const [canvases, setCanvases] = useState<LocalTreeIndexItem[]>([]);
  const [selectedTreeId, setSelectedTreeId] = useState<string>(() =>
    normalizeTreeId(initialTreeId || currentTree.id || MAIN_TREE_ID).targetId
  );
  const [titleInput, setTitleInput] = useState('');
  const [focusPersonId, setFocusPersonId] = useState('');
  const [personSearch, setPersonSearch] = useState('');
  const [selectablePersons, setSelectablePersons] = useState<Person[]>([]);
  const [allowAllCanvases, setAllowAllCanvases] = useState(true);
  const [readOnly, setReadOnly] = useState(true);
  const [expiresInDays, setExpiresInDays] = useState<'never' | '7' | '30'>('never');

  const [links, setLinks] = useState<GuestShareLink[]>([]);
  const [isLoadingLinks, setIsLoadingLinks] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [authError, setAuthError] = useState<FirebaseAuthErrorDetails | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyLinkId, setBusyLinkId] = useState<string | null>(null);

  const isDevHost =
    typeof window !== 'undefined' && window.location.hostname.startsWith('ais-dev-');

  useEffect(() => {
    if (!isOpen) return;
    const nextTreeId = normalizeTreeId(initialTreeId || currentTree.id || MAIN_TREE_ID).targetId;
    setSelectedTreeId(nextTreeId);
    setTitleInput('');
    setFocusPersonId('');
    setPersonSearch('');
    setActionError(null);
    setAuthError(null);
    setConfirmDeleteId(null);
  }, [isOpen, initialTreeId, currentTree.id]);

  // Load available canvases
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const loadCanvases = async () => {
      const list = await fetchServerTrees({ includeCloud: true }).catch(() => []);
      if (cancelled) return;
      const byId = new Map<string, LocalTreeIndexItem>();
      list.forEach((item) => {
        const { targetId, isMainTree } = normalizeTreeId(item.id);
        byId.set(targetId, { ...item, id: targetId, isMain: isMainTree });
      });
      const currentNorm = normalizeTreeId(currentTree.id || MAIN_TREE_ID);
      if (!byId.has(currentNorm.targetId)) {
        byId.set(currentNorm.targetId, {
          id: currentNorm.targetId,
          title: currentTree.title || (currentNorm.isMainTree ? 'Головне родове дерево' : 'Родове полотно'),
          personCount: Object.keys(currentTree.persons || {}).length,
          updatedAt: currentTree.updatedAt || new Date().toISOString(),
          isMain: currentNorm.isMainTree,
        });
      }
      const sorted = Array.from(byId.values()).sort((a, b) => {
        if (a.isMain || a.id === MAIN_TREE_ID) return -1;
        if (b.isMain || b.id === MAIN_TREE_ID) return 1;
        return (a.title || '').localeCompare(b.title || '', 'uk');
      });
      setCanvases(sorted);
    };
    void loadCanvases();
    return () => {
      cancelled = true;
    };
  }, [isOpen, currentTree]);

  // Load persons of selected canvas for optional starting focus
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const currentNormId = normalizeTreeId(currentTree.id || MAIN_TREE_ID).targetId;
    if (selectedTreeId === currentNormId) {
      const list = Object.values(currentTree.persons || {}).filter(
        (p) => p && !p.isBlankScreenshot
      );
      list.sort((a, b) =>
        `${a.lastName || ''} ${a.firstName || ''}`.localeCompare(
          `${b.lastName || ''} ${b.firstName || ''}`,
          'uk'
        )
      );
      setSelectablePersons(list);
      return;
    }

    loadTreeById(selectedTreeId, { includeCloud: true })
      .then((loaded) => {
        if (cancelled) return;
        const list = Object.values(loaded?.persons || {}).filter(
          (p) => p && !p.isBlankScreenshot
        );
        list.sort((a, b) =>
          `${a.lastName || ''} ${a.firstName || ''}`.localeCompare(
            `${b.lastName || ''} ${b.firstName || ''}`,
            'uk'
          )
        );
        setSelectablePersons(list);
      })
      .catch(() => {
        if (!cancelled) setSelectablePersons([]);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, selectedTreeId, currentTree]);

  const loadLinks = useCallback(async () => {
    if (!isCloudAuthenticated) {
      setLinks([]);
      return;
    }
    setIsLoadingLinks(true);
    try {
      const list = await listAdminGuestShareLinks();
      setLinks(list);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Не вдалося завантажити список посилань.');
    } finally {
      setIsLoadingLinks(false);
    }
  }, [isCloudAuthenticated]);

  useEffect(() => {
    if (isOpen && isCloudAuthenticated) {
      void loadLinks();
    }
  }, [isOpen, isCloudAuthenticated, loadLinks]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const filteredPersons = useMemo(() => {
    const q = personSearch.trim().toLowerCase();
    if (!q) return selectablePersons.slice(0, 60);
    return selectablePersons
      .filter((p) => {
        const full = [p.firstName, p.lastName, p.maidenName, p.cardId ? `#${p.cardId}` : '']
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return full.includes(q);
      })
      .slice(0, 60);
  }, [personSearch, selectablePersons]);

  const selectedCanvasMeta = useMemo(
    () => canvases.find((c) => c.id === selectedTreeId),
    [canvases, selectedTreeId]
  );

  const copyUrl = async (url: string, key: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        throw new Error('Clipboard unavailable');
      }
    } catch {
      try {
        const input = document.createElement('input');
        input.value = url;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      } catch {
        /* ignore copy error */
      }
    }
    setCopiedId(key);
    window.setTimeout(() => {
      setCopiedId((prev) => (prev === key ? null : prev));
    }, 2400);
  };

  const handleGoogleSignIn = async () => {
    if (isSigningIn) return;
    setIsSigningIn(true);
    setAuthError(null);
    setActionError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setAuthError(describeFirebaseAuthError(err));
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleManualPublish = async () => {
    if (isPublishing || isFirebaseSyncing) return;
    setIsPublishing(true);
    setActionError(null);
    try {
      const res = await onPublishToCloud();
      if (res.ok) {
        showToast({
          type: 'success',
          title: 'Дерево опубліковано',
          message: 'Актуальні картки та фото збережено у Firebase Firestore для гостей.',
        });
      } else {
        setActionError(res.error || 'Не вдалося опублікувати дерево.');
      }
    } finally {
      setIsPublishing(false);
    }
  };

  const handleCreateLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCreating || !isCloudAuthenticated) return;

    setIsCreating(true);
    setActionError(null);
    try {
      // Ensure latest local edits & photos are published so guests see fresh data immediately
      if (hasUnsyncedFirebaseChanges) {
        const pubRes = await onPublishToCloud();
        if (!pubRes.ok) {
          setActionError(
            pubRes.error || 'Спочатку опублікуйте дерево в хмару Firebase, щоб гості могли його бачити.'
          );
          return;
        }
      }

      const canvasTitle = selectedCanvasMeta?.title || currentTree.title || 'Родове дерево';
      const created = await createGuestShareLink({
        title: titleInput.trim() || `Для гостей — ${canvasTitle}`,
        treeId: selectedTreeId,
        treeTitle: canvasTitle,
        focusPersonId: focusPersonId || undefined,
        allowAllCanvases,
        readOnly,
        expiresInDays: expiresInDays === 'never' ? null : Number(expiresInDays),
      });

      setLinks((prev) => [created, ...prev]);
      setTitleInput('');
      setFocusPersonId('');
      setPersonSearch('');

      const shareUrl = buildGuestShareUrl(created.id);
      await copyUrl(shareUrl, created.id);

      showToast({
        type: 'success',
        title: 'Гостьове посилання створено',
        message: 'Посилання скопійовано в буфер обміну та готове до перегляду гостями.',
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Не вдалося створити гостьове посилання.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleToggleActive = async (link: GuestShareLink) => {
    if (busyLinkId) return;
    setBusyLinkId(link.id);
    setActionError(null);
    const nextActive = !link.isActive;
    try {
      await updateGuestShareLink(link.id, { isActive: nextActive });
      setLinks((prev) =>
        prev.map((item) => (item.id === link.id ? { ...item, isActive: nextActive } : item))
      );
      showToast({
        type: 'info',
        title: nextActive ? 'Посилання активовано' : 'Посилання призупинено',
        message: nextActive
          ? 'Гості знову можуть переглядати дерево за цим посиланням.'
          : 'Доступ за цим посиланням тимчасово вимкнено.',
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Не вдалося оновити статус посилання.');
    } finally {
      setBusyLinkId(null);
    }
  };

  const handleConfirmDelete = async (linkId: string) => {
    if (busyLinkId) return;
    setBusyLinkId(linkId);
    setActionError(null);
    try {
      await deleteGuestShareLink(linkId);
      setLinks((prev) => prev.filter((item) => item.id !== linkId));
      setConfirmDeleteId(null);
      showToast({
        type: 'info',
        title: 'Посилання видалено',
        message: 'Гостьове посилання назавжди видалено.',
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Не вдалося видалити посилання.');
    } finally {
      setBusyLinkId(null);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3 sm:p-4 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-stone-200 dark:border-zinc-800 w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-emerald-50 via-stone-50 to-amber-50/50 dark:from-emerald-950/40 dark:via-zinc-900 dark:to-zinc-900 border-b border-stone-200 dark:border-zinc-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-800 text-amber-300 flex items-center justify-center shadow-xs shrink-0">
              <Link2 size={20} />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-stone-900 dark:text-zinc-100 leading-tight">
                Гостьові посилання
              </h3>
              <p className="text-xs text-stone-500 dark:text-zinc-400 truncate">
                Створіть та надішліть посилання родичам для перегляду родового дерева
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-stone-400 hover:text-stone-700 dark:text-zinc-500 dark:hover:text-zinc-200 hover:bg-stone-200/60 dark:hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
            aria-label="Закрити"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-5">
          {/* Cloud Readiness Card */}
          {!isCloudAuthenticated ? (
            <div className="p-4 rounded-xl bg-amber-50/90 dark:bg-amber-950/30 border border-amber-300/80 dark:border-amber-800/70 space-y-3">
              <div className="flex items-start gap-2.5">
                <Cloud size={18} className="text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs">
                  <p className="font-bold text-amber-950 dark:text-amber-200">
                    Підключіть Google для публікації гостьового посилання
                  </p>
                  <p className="text-amber-900/85 dark:text-amber-300/85 leading-relaxed">
                    Щоб гості на інших пристроях бачили ваше дерево, полотна та фото мають бути синхронізовані у хмарі Firebase Firestore.
                  </p>
                </div>
              </div>

              <button
                type="button"
                disabled={isSigningIn}
                onClick={() => void handleGoogleSignIn()}
                className="w-full sm:w-auto px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
              >
                {isSigningIn ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Відкриття вікна Google…</span>
                  </>
                ) : (
                  <>
                    <Cloud size={14} />
                    <span>Підключити Google-акаунт</span>
                  </>
                )}
              </button>

              {authError && (
                <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-[11px] text-rose-800 dark:text-rose-200 flex items-start gap-2">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5 text-rose-600" />
                  <span>{authError.message}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="px-3.5 py-2.5 rounded-xl bg-emerald-50/75 dark:bg-emerald-950/25 border border-emerald-200/80 dark:border-emerald-800/60 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <Check size={14} className="text-emerald-700 dark:text-emerald-400 shrink-0" />
                <span className="text-emerald-950 dark:text-emerald-200 font-medium truncate">
                  Хмара активна ({currentUser?.email})
                  {hasUnsyncedFirebaseChanges
                    ? ' • є нові зміни для публікації'
                    : ' • дерево актуальне'}
                </span>
              </div>
              {hasUnsyncedFirebaseChanges && (
                <button
                  type="button"
                  disabled={isPublishing || isFirebaseSyncing}
                  onClick={() => void handleManualPublish()}
                  className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw size={12} className={isPublishing || isFirebaseSyncing ? 'animate-spin' : ''} />
                  <span>{isPublishing || isFirebaseSyncing ? 'Публікація…' : 'Опублікувати зараз'}</span>
                </button>
              )}
            </div>
          )}

          {actionError && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/70 text-xs text-rose-900 dark:text-rose-200 flex items-start gap-2">
              <AlertTriangle size={15} className="text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <span>{actionError}</span>
            </div>
          )}

          {/* Create New Guest Link Form */}
          <form
            onSubmit={handleCreateLink}
            className="p-4 rounded-2xl bg-stone-50/90 dark:bg-zinc-800/50 border border-stone-200/90 dark:border-zinc-800 space-y-3.5"
          >
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-stone-700 dark:text-zinc-300 flex items-center gap-1.5">
                <Plus size={14} className="text-emerald-700 dark:text-emerald-400" />
                <span>Нове гостьове посилання</span>
              </h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-stone-600 dark:text-zinc-400 mb-1">
                  Назва (для вас у списку)
                </label>
                <input
                  type="text"
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  maxLength={150}
                  placeholder={`Напр.: Для родини — ${selectedCanvasMeta?.title || 'Головне дерево'}`}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-stone-900 dark:text-zinc-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-stone-600 dark:text-zinc-400 mb-1">
                  Стартове полотно
                </label>
                <select
                  value={selectedTreeId}
                  onChange={(e) => {
                    setSelectedTreeId(e.target.value);
                    setFocusPersonId('');
                    setPersonSearch('');
                  }}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-stone-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                >
                  {canvases.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title} {c.personCount !== undefined ? `(${c.personCount})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Optional Focus Person */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold text-stone-600 dark:text-zinc-400">
                Відкрити на конкретній картці (необов’язково)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  value={personSearch}
                  onChange={(e) => setPersonSearch(e.target.value)}
                  placeholder="Пошук особи за ім’ям або #ID…"
                  className="w-full px-3 py-1.5 text-xs rounded-xl border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-stone-900 dark:text-zinc-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
                <select
                  value={focusPersonId}
                  onChange={(e) => setFocusPersonId(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-xl border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-stone-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                >
                  <option value="">Загальний огляд полотна</option>
                  {filteredPersons.map((p) => (
                    <option key={p.id} value={p.id}>
                      {[p.firstName, p.lastName].filter(Boolean).join(' ') || 'Без імені'}
                      {p.birthYear ? ` (${p.birthYear})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Scope & Permissions */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-0.5">
              <label className="flex items-start gap-2 p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-stone-200/90 dark:border-zinc-700/80 cursor-pointer hover:border-emerald-400 transition-colors">
                <input
                  type="checkbox"
                  checked={readOnly}
                  onChange={(e) => setReadOnly(e.target.checked)}
                  className="mt-0.5 accent-emerald-700 rounded cursor-pointer"
                />
                <div className="text-[11px] leading-snug">
                  <span className="font-semibold text-stone-800 dark:text-zinc-200 block">
                    Лише перегляд
                  </span>
                  <span className="text-stone-500 dark:text-zinc-400">
                    Без пропозицій та реакцій
                  </span>
                </div>
              </label>

              <label className="flex items-start gap-2 p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-stone-200/90 dark:border-zinc-700/80 cursor-pointer hover:border-emerald-400 transition-colors">
                <input
                  type="checkbox"
                  checked={allowAllCanvases}
                  onChange={(e) => setAllowAllCanvases(e.target.checked)}
                  className="mt-0.5 accent-emerald-700 rounded cursor-pointer"
                />
                <div className="text-[11px] leading-snug">
                  <span className="font-semibold text-stone-800 dark:text-zinc-200 block">
                    Усі полотна
                  </span>
                  <span className="text-stone-500 dark:text-zinc-400">
                    Перехід між вкладками
                  </span>
                </div>
              </label>

              <div className="p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-stone-200/90 dark:border-zinc-700/80">
                <span className="text-[11px] font-semibold text-stone-800 dark:text-zinc-200 block mb-1">
                  Термін дії
                </span>
                <select
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(e.target.value as 'never' | '7' | '30')}
                  className="w-full text-[11px] bg-stone-50 dark:bg-zinc-800 border border-stone-200 dark:border-zinc-700 rounded-lg px-2 py-1 text-stone-800 dark:text-zinc-200 focus:outline-none"
                >
                  <option value="never">Безстроково</option>
                  <option value="7">7 днів</option>
                  <option value="30">30 днів</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              {isDevHost ? (
                <p className="text-[10.5px] text-stone-500 dark:text-zinc-400 max-w-sm leading-snug">
                  Посилання працює на поточній адресі. Для сторонніх гостей надсилайте адресу опублікованої версії застосунку.
                </p>
              ) : (
                <p className="text-[10.5px] text-stone-500 dark:text-zinc-400 leading-snug">
                  Гість побачить дерево в режимі перегляду без доступу до редагування.
                </p>
              )}

              <button
                type="submit"
                disabled={!isCloudAuthenticated || isCreating || isFirebaseSyncing}
                className="px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-2 shadow-xs transition-all cursor-pointer active:scale-95 shrink-0"
              >
                {isCreating ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Створення…</span>
                  </>
                ) : (
                  <>
                    <Link2 size={14} />
                    <span>Створити та скопіювати</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Existing Guest Share Links List */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-zinc-400">
                Створені гостьові посилання ({links.length})
              </span>
              {isCloudAuthenticated && (
                <button
                  type="button"
                  onClick={() => void loadLinks()}
                  disabled={isLoadingLinks}
                  className="text-[11px] font-medium text-stone-500 hover:text-stone-800 dark:text-zinc-400 dark:hover:text-zinc-200 flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw size={11} className={isLoadingLinks ? 'animate-spin' : ''} />
                  <span>Оновити</span>
                </button>
              )}
            </div>

            {!isCloudAuthenticated ? (
              <div className="p-5 rounded-xl border border-dashed border-stone-200 dark:border-zinc-800 text-center text-xs text-stone-500 dark:text-zinc-400">
                Після входу через Google тут з’являться ваші створені гостьові посилання з можливістю керування доступом.
              </div>
            ) : isLoadingLinks && links.length === 0 ? (
              <div className="p-6 text-center text-xs text-stone-500 dark:text-zinc-400 flex items-center justify-center gap-2">
                <Loader2 size={14} className="animate-spin" />
                <span>Завантаження посилань…</span>
              </div>
            ) : links.length === 0 ? (
              <div className="p-5 rounded-xl border border-dashed border-stone-200 dark:border-zinc-800 text-center text-xs text-stone-500 dark:text-zinc-400">
                Ще немає створених гостьових посилань. Заповніть форму вище, щоб сформувати перше посилання.
              </div>
            ) : (
              <div className="space-y-2.5">
                {links.map((link) => {
                  const expired = isShareExpired(link);
                  const isLinkActive = link.isActive && !expired;
                  const url = buildGuestShareUrl(link.id);
                  const isBusy = busyLinkId === link.id;
                  const isCopied = copiedId === link.id;

                  return (
                    <div
                      key={link.id}
                      className={`p-3.5 rounded-xl border transition-all space-y-2.5 ${
                        isLinkActive
                          ? 'bg-white dark:bg-zinc-900 border-stone-200/90 dark:border-zinc-800'
                          : 'bg-stone-50/70 dark:bg-zinc-900/50 border-stone-200/70 dark:border-zinc-800/70 opacity-85'
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-stone-900 dark:text-zinc-100 truncate">
                              {link.title}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                expired
                                  ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300'
                                  : link.isActive
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                  : 'bg-stone-200 text-stone-700 dark:bg-zinc-800 dark:text-zinc-400'
                              }`}
                            >
                              {expired ? 'Термін вичерпано' : link.isActive ? 'Активне' : 'Призупинено'}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-stone-500 dark:text-zinc-400">
                            <span className="inline-flex items-center gap-1">
                              <Eye size={11.5} />
                              <span>{link.readOnly ? 'Лише перегляд' : 'З пропозиціями гостей'}</span>
                            </span>
                            <span>•</span>
                            <span className="inline-flex items-center gap-1">
                              <Layers size={11.5} />
                              <span>
                                {link.allowAllCanvases
                                  ? `Усі полотна (старт: ${link.treeTitle || link.treeId})`
                                  : `Тільки: ${link.treeTitle || link.treeId}`}
                              </span>
                            </span>
                            {link.focusPersonId && (
                              <>
                                <span>•</span>
                                <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                                  <UserCheck size={11.5} />
                                  <span>Фокус на особі</span>
                                </span>
                              </>
                            )}
                            {link.expiresAtIso && (
                              <>
                                <span>•</span>
                                <span className="inline-flex items-center gap-1">
                                  <Clock size={11.5} />
                                  <span>
                                    До {new Date(link.expiresAtIso).toLocaleDateString('uk-UA')}
                                  </span>
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 shrink-0">
                          {confirmDeleteId === link.id ? (
                            <div className="flex items-center gap-1 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-lg px-2 py-1">
                              <span className="text-[10.5px] font-semibold text-rose-800 dark:text-rose-200">
                                Видалити?
                              </span>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleConfirmDelete(link.id)}
                                className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-700 text-white text-[10.5px] font-semibold cursor-pointer"
                              >
                                Так
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-1.5 py-0.5 rounded bg-white dark:bg-zinc-800 text-stone-600 dark:text-zinc-300 text-[10.5px] font-medium cursor-pointer"
                              >
                                Ні
                              </button>
                            </div>
                          ) : (
                            <>
                              <button
                                type="button"
                                disabled={isBusy || expired}
                                onClick={() => void handleToggleActive(link)}
                                className="p-1.5 rounded-lg text-stone-500 hover:text-stone-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-stone-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer disabled:opacity-40"
                                title={link.isActive ? 'Призупинити доступ' : 'Активувати доступ'}
                              >
                                {link.isActive ? <Pause size={14} /> : <Play size={14} />}
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => setConfirmDeleteId(link.id)}
                                className="p-1.5 rounded-lg text-stone-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer"
                                title="Видалити посилання"
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* URL bar */}
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          readOnly
                          value={url}
                          onFocus={(e) => e.currentTarget.select()}
                          className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-stone-50 dark:bg-zinc-800/80 border border-stone-200/80 dark:border-zinc-700/80 text-[11px] font-mono text-stone-700 dark:text-zinc-300 focus:outline-none select-all"
                        />
                        <button
                          type="button"
                          onClick={() => void copyUrl(url, link.id)}
                          className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                            isCopied
                              ? 'bg-emerald-600 text-white'
                              : 'bg-stone-900 hover:bg-stone-800 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-white'
                          }`}
                        >
                          {isCopied ? <Check size={12.5} /> : <Copy size={12.5} />}
                          <span>{isCopied ? 'Скопійовано' : 'Копіювати'}</span>
                        </button>
                        <button
                          type="button"
                          disabled={!isLinkActive}
                          onClick={() => {
                            if (typeof window !== 'undefined') {
                              window.location.assign(url);
                            }
                          }}
                          className="px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-zinc-700 bg-white hover:bg-stone-100 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-stone-700 dark:text-zinc-200 text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-40 shrink-0"
                          title="Відкрити зараз у гостьовому режимі для перевірки"
                        >
                          <ExternalLink size={12} />
                          <span className="hidden sm:inline">Перевірити</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
