import React, { useState, useEffect } from 'react';
import {
  X,
  FolderTree,
  Trash2,
  Users,
  Check,
  ArrowRight,
  Share2,
  Copy,
  Crown,
  Search,
  RotateCcw,
  Pencil,
  Check as CheckIcon,
} from 'lucide-react';
import { TreeMetaItem } from '../utils/firestoreTreeService';
import {
  fetchServerTrees,
  deleteTreeFromServerOrStorage,
  TREES_CHANGED_EVENT,
} from '../utils/fileStorage';
import { getDeletedTreesForFirebase } from '../utils/localTreeStorage';
import { FamilyTreeData } from '../types/tree';
import { ConfirmDialog } from './ConfirmDialog';
import { buildDirectGuestUrl } from '../utils/guestShareService';

interface MyTreesModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTreeId: string;
  currentTree: FamilyTreeData;
  onSelectTree: (treeId: string) => void;
  onCreateNewTree: (title: string) => void;
  onCloneTree?: (treeId: string) => void;
  isAdmin?: boolean;
  onRenameTree?: (treeId: string, newTitle: string) => Promise<boolean>;
  onDeleteTree?: (treeId: string, title?: string) => Promise<boolean>;
  onOpenGuestShare?: (treeId: string) => void;
}

export const MyTreesModal: React.FC<MyTreesModalProps> = ({
  isOpen,
  onClose,
  currentTreeId,
  currentTree,
  onSelectTree,
  onCreateNewTree,
  onCloneTree,
  isAdmin = false,
  onRenameTree,
  onDeleteTree,
  onOpenGuestShare,
}) => {
  const [trees, setTrees] = useState<TreeMetaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedTreeId, setCopiedTreeId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [showMainProtectedAlert, setShowMainProtectedAlert] = useState(false);
  const [editingTreeId, setEditingTreeId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const isMainTreeActive =
    !currentTreeId ||
    currentTreeId === 'my-family-tree' ||
    currentTreeId === 'main-tree' ||
    currentTreeId === 'default-tree';

  const handleShareLink = async (t: TreeMetaItem) => {
    if (isAdmin && onOpenGuestShare) {
      onClose();
      onOpenGuestShare(t.id);
      return;
    }
    const url = buildDirectGuestUrl(t.id);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        throw new Error('Clipboard API unavailable');
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
        /* ignore copy failure */
      }
    }
    setCopiedTreeId(t.id);
    setTimeout(() => setCopiedTreeId(null), 2500);
  };

  const fetchTrees = async () => {
    setLoading(true);
    const mergedMap = new Map<string, TreeMetaItem>();

    // 1. Fetch server & Firebase cloud trees when modal is opened
    try {
      const serverTrees = await fetchServerTrees({ includeCloud: true });
      serverTrees.forEach((t) => {
        const isMain = t.id === 'my-family-tree' || t.id === 'main-tree' || t.id === 'default-tree';
        mergedMap.set(isMain ? 'my-family-tree' : t.id, {
          id: isMain ? 'my-family-tree' : t.id,
          ownerId: 'server',
          title: t.title || (isMain ? 'Головне родове дерево' : 'Родове полотно'),
          personCount: t.personCount || 0,
          createdAt: t.updatedAt || new Date().toISOString(),
          updatedAt: t.updatedAt || new Date().toISOString(),
          isMain,
        });
      });
    } catch (err) {
      console.warn('Error fetching server trees:', err);
    }

    const deletedSet = new Set(getDeletedTreesForFirebase());

    // 2. Merge local index from browser localStorage
    try {
      const storedIdx = localStorage.getItem('rodovid_local_trees_index');
      const localList: TreeMetaItem[] = storedIdx ? JSON.parse(storedIdx) : [];
      localList.forEach((t) => {
        const isMain = t.id === 'my-family-tree' || t.id === 'main-tree' || t.id === 'default-tree';
        const targetId = isMain ? 'my-family-tree' : t.id;
        if (deletedSet.has(targetId)) return;
        if (!mergedMap.has(targetId)) {
          mergedMap.set(targetId, {
            ...t,
            id: targetId,
            isMain,
          });
        }
      });
    } catch {}

    // 3. Ensure current active tree is in map (unless it was just deleted)
    if (currentTree && currentTree.id) {
      const isMain =
        currentTree.id === 'my-family-tree' ||
        currentTree.id === 'main-tree' ||
        currentTree.id === 'default-tree';
      const targetId = isMain ? 'my-family-tree' : currentTree.id;
      if (!deletedSet.has(targetId) && !mergedMap.has(targetId)) {
        mergedMap.set(targetId, {
          id: targetId,
          ownerId: 'local',
          title: currentTree.title || (isMain ? 'Головне родове дерево' : 'Родове полотно'),
          personCount: Object.keys(currentTree.persons || {}).length,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isMain,
        });
      }
    }

    // Sort: Main tree first, then by updatedAt descending
    const all = Array.from(mergedMap.values()).sort((a, b) => {
      if (a.isMain || a.id === 'my-family-tree') return -1;
      if (b.isMain || b.id === 'my-family-tree') return 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    setTrees(all);
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      fetchTrees();
    }
  }, [isOpen, currentTreeId]);

  useEffect(() => {
    if (!isOpen) return;
    const onChanged = () => {
      void fetchTrees();
    };
    window.addEventListener(TREES_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(TREES_CHANGED_EVENT, onChanged);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDelete = (treeId: string, title: string) => {
    if (treeId === 'my-family-tree' || treeId === 'main-tree' || treeId === 'default-tree') {
      setShowMainProtectedAlert(true);
      return;
    }
    setDeleteTarget({ id: treeId, title });
  };

  const confirmDelete = async () => {
    const target = deleteTarget;
    if (!target) return;
    try {
      if (onDeleteTree) {
        await onDeleteTree(target.id, target.title);
      } else {
        await deleteTreeFromServerOrStorage(target.id);
      }
      await fetchTrees();
    } catch (err) {
      console.error(err);
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleSaveInlineRename = async (treeId: string) => {
    const trimmed = editingTitle.trim();
    if (trimmed && onRenameTree) {
      await onRenameTree(treeId, trimmed);
      await fetchTrees();
    }
    setEditingTreeId(null);
  };

  const filteredTrees = trees.filter((t) =>
    (t.title || '').toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3 sm:p-4 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-stone-200 w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-emerald-50 via-stone-50 to-amber-50/50 border-b border-stone-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-800 text-amber-300 flex items-center justify-center shadow-xs shrink-0">
              <FolderTree size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-stone-900 leading-tight">
                Родові полотна та гілки
              </h3>
              <p className="text-xs text-stone-500">
                Створюйте окремі полотна, перемикайтеся між гілками та переносьте осіб
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {/* Quick Return to Main Tree Banner if currently on a sub-branch */}
          {!isMainTreeActive && (
            <div className="p-3.5 bg-gradient-to-r from-amber-50 to-emerald-50 border border-amber-300/80 rounded-xl flex items-center justify-between gap-3 text-xs shadow-2xs">
              <div className="flex items-center gap-2 text-stone-800 font-medium">
                <Crown size={18} className="text-amber-600 shrink-0" />
                <div>
                  <span className="font-bold text-amber-950 block">Зараз відкрито другорядне полотно</span>
                  <span className="text-stone-600 text-[11px]">Ваше Головне дерево збережено й доступне у 1 клік.</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  onSelectTree('my-family-tree');
                  onClose();
                }}
                className="px-3 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl shrink-0 cursor-pointer shadow-xs transition-transform active:scale-95 flex items-center gap-1.5"
              >
                <RotateCcw size={14} />
                <span>До Головного дерева</span>
              </button>
            </div>
          )}

          {/* Search Box if list is long */}
          {trees.length > 2 && (
            <div className="relative">
              <Search size={14} className="absolute left-3 top-2.5 text-stone-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Пошук полотна за назвою..."
                className="w-full text-xs pl-8 pr-3 py-2 rounded-xl border border-stone-200 bg-stone-50/80 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
          )}

          {/* Tree List */}
          <div className="space-y-2.5">
            <div className="text-[11px] font-bold text-stone-500 uppercase tracking-wider px-1 flex items-center justify-between">
              <span>Доступні полотна ({filteredTrees.length})</span>
            </div>

            {loading ? (
              <div className="p-8 text-center text-xs text-stone-500">Завантаження...</div>
            ) : filteredTrees.length === 0 ? (
              <div className="p-6 text-center bg-stone-50 rounded-xl border border-dashed border-stone-300 space-y-2">
                <p className="text-xs text-stone-600 font-medium">Полотен за цим запитом не знайдено.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {filteredTrees.map((t) => {
                  const isMain = t.isMain || t.id === 'my-family-tree' || t.id === 'main-tree' || t.id === 'default-tree';
                  const isCurrent = isMain ? isMainTreeActive : t.id === currentTreeId;

                  return (
                    <div
                      key={t.id}
                      className={`p-3.5 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                        isMain
                          ? isCurrent
                            ? 'bg-gradient-to-r from-emerald-50 via-amber-50/30 to-emerald-50/80 border-emerald-500 ring-2 ring-emerald-500/30 shadow-xs'
                            : 'bg-gradient-to-r from-stone-50 to-amber-50/20 border-amber-300/80 hover:border-emerald-500'
                          : isCurrent
                          ? 'bg-emerald-50/90 border-emerald-500 ring-2 ring-emerald-500/20 shadow-2xs'
                          : 'bg-white hover:bg-stone-50 border-stone-200'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {isMain ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-amber-900 bg-amber-100 border border-amber-300/80 px-2 py-0.5 rounded-md shrink-0">
                                <Crown size={12} className="text-amber-600 fill-amber-400" />
                                <span>Головне дерево</span>
                              </span>
                            ) : null}

                            <span className="text-xs font-bold text-stone-900 truncate">
                              {t.title}
                            </span>

                            {isCurrent && (
                              <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100/90 border border-emerald-300 px-1.5 py-0.5 rounded-md shrink-0 flex items-center gap-1">
                                <Check size={11} className="text-emerald-700" />
                                <span>Відкрите зараз</span>
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-stone-500 mt-1.5">
                            <span className="flex items-center gap-1 font-semibold text-stone-700">
                              <Users size={12} className="text-stone-500" />
                              <span>{t.personCount ?? 0} осіб</span>
                            </span>
                            <span>•</span>
                            <span>
                              Оновлено: {new Date(t.updatedAt || Date.now()).toLocaleDateString('uk-UA')}
                            </span>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                          {/* Share button */}
                          <button
                            type="button"
                            onClick={() => handleShareLink(t)}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-all cursor-pointer border ${
                              copiedTreeId === t.id
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : 'bg-stone-100 hover:bg-stone-200 text-stone-700 border-stone-200'
                            }`}
                            title="Скопіювати посилання для перегляду"
                          >
                            {copiedTreeId === t.id ? (
                              <>
                                <Check size={12} />
                                <span>Скопійовано</span>
                              </>
                            ) : (
                              <>
                                <Share2 size={12} />
                                <span className="hidden md:inline">Поділитись</span>
                              </>
                            )}
                          </button>

                          {/* Clone Tree button */}
                          {onCloneTree && (
                            <button
                              type="button"
                              onClick={() => onCloneTree(t.id)}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-200 flex items-center gap-1 transition-colors cursor-pointer"
                              title="Здублювати це полотно як нове"
                            >
                              <Copy size={12} />
                              <span className="hidden md:inline">Копія</span>
                            </button>
                          )}

                          {!isCurrent && (
                            <button
                              type="button"
                              onClick={() => {
                                onSelectTree(t.id);
                                onClose();
                              }}
                              className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition-transform active:scale-95 cursor-pointer shadow-2xs"
                            >
                              <span>Відкрити</span>
                              <ArrowRight size={12} />
                            </button>
                          )}

                          {!isMain && isAdmin && (
                            <>
                              {editingTreeId === t.id ? (
                                <form
                                  onSubmit={(e) => {
                                    e.preventDefault();
                                    void handleSaveInlineRename(t.id);
                                  }}
                                  className="flex items-center gap-1"
                                >
                                  <input
                                    type="text"
                                    autoFocus
                                    value={editingTitle}
                                    onChange={(e) => setEditingTitle(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Escape') setEditingTreeId(null);
                                    }}
                                    className="h-7 w-28 px-2 text-xs rounded-lg border border-emerald-500 bg-white focus:outline-none"
                                  />
                                  <button
                                    type="submit"
                                    className="p-1.5 text-emerald-700 hover:bg-emerald-50 rounded-lg cursor-pointer"
                                    title="Зберегти назву"
                                  >
                                    <CheckIcon size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingTreeId(null)}
                                    className="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg cursor-pointer"
                                    title="Скасувати"
                                  >
                                    <X size={14} />
                                  </button>
                                </form>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingTreeId(t.id);
                                    setEditingTitle(t.title);
                                  }}
                                  className="p-1.5 text-stone-400 hover:text-stone-800 rounded-lg hover:bg-stone-100 transition-colors cursor-pointer"
                                  title="Змінити назву цього полотна"
                                >
                                  <Pencil size={14} />
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => handleDelete(t.id, t.title)}
                                className="p-1.5 text-stone-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                                title="Видалити це другорядне полотно"
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        variant="danger"
        title="Видалити полотно?"
        description={`Ви впевнені, що хочете видалити полотно «${deleteTarget?.title || ''}»? Цю дію неможливо скасувати.`}
        confirmLabel="Видалити"
        onConfirm={() => {
          void confirmDelete();
        }}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        isOpen={showMainProtectedAlert}
        variant="warning"
        title="Захищене полотно"
        description="Головне родове дерево є основним полотном і не може бути видалене."
        confirmLabel="Зрозуміло"
        hideCancel
        onConfirm={() => setShowMainProtectedAlert(false)}
        onCancel={() => setShowMainProtectedAlert(false)}
      />
    </div>
  );
};
