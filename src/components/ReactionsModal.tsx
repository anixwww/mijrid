import React, { useState, useMemo } from 'react';
import { Heart, Trash2, Search, Filter, UserCheck, MessageSquare, Clock, AlertCircle, X, ShieldAlert } from 'lucide-react';
import { FamilyTreeData, PersonReaction, ReactionEmoji } from '../types/tree';

interface ReactionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  tree: FamilyTreeData;
  isAdmin: boolean; // Owner / Admin access
  onDeleteReaction: (personId: string, reactionIdOrIdx: string | number) => void;
  onClearAllReactions?: () => void;
  onSelectPerson?: (personId: string) => void;
}

interface ExpandedReactionItem {
  personId: string;
  personName: string;
  personAvatar?: string;
  reaction: PersonReaction;
  originalIndex: number;
}

export const ReactionsModal: React.FC<ReactionsModalProps> = ({
  isOpen,
  onClose,
  tree,
  isAdmin,
  onDeleteReaction,
  onClearAllReactions,
  onSelectPerson,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEmojiFilter, setSelectedEmojiFilter] = useState<string>('all');
  const [selectedPersonIdFilter, setSelectedPersonIdFilter] = useState<string>('all');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);

  // Flatten all reactions across all persons in the tree
  const allReactions = useMemo(() => {
    const list: ExpandedReactionItem[] = [];
    if (!tree?.persons) return list;

    Object.values(tree.persons).forEach((person) => {
      if (person.reactions && person.reactions.length > 0) {
        const personFullName = `${person.firstName || (person as any).name || ''} ${person.lastName || (person as any).surname || ''}`.trim() || 'Без імені';
        person.reactions.forEach((reaction, idx) => {
          list.push({
            personId: person.id,
            personName: personFullName,
            personAvatar: person.avatarUrl,
            reaction,
            originalIndex: idx,
          });
        });
      }
    });
    return list;
  }, [tree]);

  // Statistics calculation
  const stats = useMemo(() => {
    const emojiCounts: Record<string, number> = {};
    const uniqueUsers = new Set<string>();
    const personsWithReactions = new Set<string>();

    allReactions.forEach(({ personId, reaction }) => {
      emojiCounts[reaction.emoji] = (emojiCounts[reaction.emoji] || 0) + 1;
      if (reaction.userId) uniqueUsers.add(reaction.userId);
      personsWithReactions.add(personId);
    });

    return {
      total: allReactions.length,
      emojiCounts,
      uniqueUsersCount: uniqueUsers.size,
      personsCount: personsWithReactions.size,
    };
  }, [allReactions]);

  // Filtered reactions list
  const filteredReactions = useMemo(() => {
    return allReactions.filter(({ personId, personName, reaction }) => {
      // Search filter
      const search = searchTerm.toLowerCase().trim();
      if (search) {
        const matchPerson = personName.toLowerCase().includes(search);
        const matchUser = (reaction.userName || '').toLowerCase().includes(search);
        const matchEmail = (reaction.userEmail || '').toLowerCase().includes(search);
        const matchEmoji = reaction.emoji.includes(search);
        if (!matchPerson && !matchUser && !matchEmail && !matchEmoji) {
          return false;
        }
      }

      // Emoji filter
      if (selectedEmojiFilter !== 'all' && reaction.emoji !== selectedEmojiFilter) {
        return false;
      }

      // Person filter
      if (selectedPersonIdFilter !== 'all' && personId !== selectedPersonIdFilter) {
        return false;
      }

      return true;
    });
  }, [allReactions, searchTerm, selectedEmojiFilter, selectedPersonIdFilter]);

  if (!isOpen) return null;

  const handleDeleteItem = (personId: string, reaction: PersonReaction, index: number) => {
    onDeleteReaction(personId, reaction.id || index);
    setDeleteConfirmId(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-stone-200 w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-rose-700 via-rose-800 to-amber-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-xl backdrop-blur-md">
              <Heart className="w-6 h-6 text-rose-200 fill-rose-200" />
            </div>
            <div>
              <h3 className="text-lg font-bold tracking-tight">Реакції та відгуки користувачів</h3>
              <p className="text-xs text-rose-100/90">
                {isAdmin
                  ? 'Управління реакціями відвідувачів та власника родового дерева'
                  : 'Перегляд залишених емодзі-вподобань'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Stats bar */}
        <div className="px-6 py-3.5 bg-rose-50/60 border-b border-rose-100 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1.5 font-medium text-stone-700">
              <MessageSquare size={15} className="text-rose-600" />
              <span>Усього реакцій: <strong className="text-stone-900">{stats.total}</strong></span>
            </div>
            <div className="flex items-center gap-1.5 font-medium text-stone-700">
              <UserCheck size={15} className="text-rose-600" />
              <span>Реагували користувачів: <strong className="text-stone-900">{stats.uniqueUsersCount}</strong></span>
            </div>
          </div>

          {/* Emoji summary pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {Object.entries(stats.emojiCounts).map(([em, count]) => (
              <span
                key={em}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-rose-200 text-stone-800 font-mono text-[11px] shadow-2xs"
              >
                <span>{em}</span>
                <span className="font-bold text-rose-800">{count}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Filters & Search Toolbar */}
        <div className="px-6 py-3 bg-stone-50 border-b border-stone-200 flex flex-wrap items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={15} />
            <input
              type="text"
              placeholder="Пошук за ім'ям, email або карткою..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-stone-300 bg-white focus:outline-none focus:ring-2 focus:ring-rose-500 text-stone-800"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Emoji Filter Buttons */}
          <div className="flex items-center gap-1 overflow-x-auto py-0.5">
            <button
              onClick={() => setSelectedEmojiFilter('all')}
              className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors cursor-pointer ${
                selectedEmojiFilter === 'all'
                  ? 'bg-rose-700 text-white'
                  : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-100'
              }`}
            >
              Усі
            </button>
            {['❤️', '👍', '😮', '😢', '👎'].map((emoji) => (
              <button
                key={emoji}
                onClick={() => setSelectedEmojiFilter(emoji)}
                className={`px-2 py-1 text-xs rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                  selectedEmojiFilter === emoji
                    ? 'bg-rose-700 text-white'
                    : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-100'
                }`}
              >
                <span>{emoji}</span>
                {stats.emojiCounts[emoji] ? (
                  <span className="text-[10px] opacity-80 font-mono">({stats.emojiCounts[emoji]})</span>
                ) : null}
              </button>
            ))}
          </div>

          {/* Clear All Button for Owner */}
          {isAdmin && allReactions.length > 0 && onClearAllReactions && (
            <button
              onClick={() => setShowClearAllConfirm(true)}
              className="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Очистити всі реакції родового дерева"
            >
              <Trash2 size={13} />
              <span>Видалити всі ({allReactions.length})</span>
            </button>
          )}
        </div>

        {/* Reactions List */}
        <div className="p-6 max-h-[440px] overflow-y-auto space-y-3">
          {filteredReactions.length === 0 ? (
            <div className="py-12 text-center text-stone-500 space-y-2">
              <Heart className="w-10 h-10 mx-auto text-stone-300 stroke-1" />
              <p className="text-sm font-medium">Реакцій не знайдено</p>
              <p className="text-xs text-stone-400">
                {allReactions.length === 0
                  ? 'Відвідувачі родового дерева ще не залишали вподобань.'
                  : 'Спробуйте змінити параметри пошуку або фільтри.'}
              </p>
            </div>
          ) : (
            filteredReactions.map(({ personId, personName, personAvatar, reaction, originalIndex }) => {
              const itemKey = `${personId}_${reaction.id || originalIndex}_${reaction.emoji}`;
              const isDeletingThis = deleteConfirmId === itemKey;

              return (
                <div
                  key={itemKey}
                  className="p-3.5 rounded-xl border border-stone-200 bg-stone-50/50 hover:bg-white hover:border-rose-200 transition-all shadow-2xs flex items-center justify-between gap-4"
                >
                  {/* Left: Person & Reaction detail */}
                  <div className="flex items-center gap-3.5 flex-1 min-w-0">
                    {/* Emoji Badge */}
                    <div className="w-10 h-10 rounded-2xl bg-rose-100/80 border border-rose-200 flex items-center justify-center text-xl shrink-0 shadow-2xs">
                      {reaction.emoji}
                    </div>

                    <div className="min-w-0 flex-1">
                      {/* Person Card Reference */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            if (onSelectPerson) {
                              onSelectPerson(personId);
                              onClose();
                            }
                          }}
                          className="font-bold text-sm text-stone-900 hover:text-rose-700 truncate text-left transition-colors cursor-pointer"
                          title="Відкрити картку особи"
                        >
                          {personName}
                        </button>
                      </div>

                      {/* Author & Timestamp info */}
                      <div className="flex items-center gap-2 flex-wrap text-xs text-stone-500 mt-0.5">
                        <span className="font-medium text-stone-700 flex items-center gap-1">
                          👤 {reaction.userName || 'Гість'}
                          {reaction.userEmail && (
                            <span className="text-stone-400 text-[11px] font-normal">({reaction.userEmail})</span>
                          )}
                        </span>

                        {reaction.createdAt && (
                          <span className="flex items-center gap-1 text-stone-400 text-[11px]">
                            <Clock size={11} />
                            {reaction.createdAt}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {onSelectPerson && (
                      <button
                        onClick={() => {
                          onSelectPerson(personId);
                          onClose();
                        }}
                        className="px-2.5 py-1 rounded-lg text-xs font-medium text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition-colors"
                      >
                        Переглянути
                      </button>
                    )}

                    {/* Delete Reaction Button (For Tree Owner) */}
                    {isAdmin && (
                      isDeletingThis ? (
                        <div className="flex items-center gap-1 animate-in fade-in duration-150">
                          <button
                            onClick={() => handleDeleteItem(personId, reaction, originalIndex)}
                            className="px-2 py-1 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 shadow-2xs transition-colors cursor-pointer"
                          >
                            Підтвердити ✕
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(null)}
                            className="px-2 py-1 rounded-lg bg-stone-200 text-stone-700 text-xs hover:bg-stone-300 transition-colors cursor-pointer"
                          >
                            Скасувати
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirmId(itemKey)}
                          className="p-1.5 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-all cursor-pointer"
                          title="Видалити цієї реакцію (тільки власник)"
                        >
                          <Trash2 size={16} />
                        </button>
                      )
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-stone-100 border-t border-stone-200 flex items-center justify-between">
          <div className="text-xs text-stone-500 flex items-center gap-1.5">
            <ShieldAlert size={14} className="text-amber-600" />
            <span>Видалити реакції має право лише власник або адміністратор дерева.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-stone-800 hover:bg-stone-900 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
          >
            Закрити
          </button>
        </div>
      </div>

      {/* Confirm Clear All Modal */}
      {showClearAllConfirm && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-stone-950/70 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4 text-center shadow-2xl border border-stone-200 animate-in zoom-in-95">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 mx-auto flex items-center justify-center">
              <AlertCircle size={28} />
            </div>
            <div className="space-y-1">
              <h4 className="font-bold text-stone-900 text-base">Видалити всі реакції?</h4>
              <p className="text-xs text-stone-600 leading-relaxed">
                Ви дійсно бажаєте видалити усе вподобання ({allReactions.length} реакцій) з цього дерева? Цю дію неможливо скасувати.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => {
                  if (onClearAllReactions) onClearAllReactions();
                  setShowClearAllConfirm(false);
                }}
                className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs transition-colors cursor-pointer"
              >
                Так, видалити все
              </button>
              <button
                onClick={() => setShowClearAllConfirm(false)}
                className="flex-1 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold text-xs transition-colors cursor-pointer"
              >
                Скасувати
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
