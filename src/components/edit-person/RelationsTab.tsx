import React, { useState } from 'react';
import { BranchLink, ConnectionMeta, Person } from '../../types/tree';
import { EditPersonDraft } from './types';
import { BranchLinkStyleEditor } from './BranchLinkStyleEditor';
import { getBranchLineShapeLabel, normalizeBranchLineShape } from '../../utils/branchLinkGeometry';
import { CrossCanvasSearchTree } from '../../utils/fileStorage';
import { getPersonCrossCanvasLinks, isSameCanvasId } from '../../utils/crossCanvasLinks';
import { formatCardId } from '../../utils/cardIdUtils';
import {
  UserCheck,
  Heart,
  HeartCrack,
  Users,
  UserMinus,
  CheckCircle2,
  HelpCircle,
  Info,
  ArrowUpRight,
  ExternalLink,
  Trash2,
  SlidersHorizontal,
} from 'lucide-react';

interface RelationsTabProps {
  personId: string;
  draft: EditPersonDraft;
  allPersons: Record<string, Person>;
  currentTreeId?: string;
  crossCanvasTrees?: CrossCanvasSearchTree[];
  connectionOverrides?: Record<string, ConnectionMeta>;
  onToggleRelationVerification: (relativeId: string) => void;
  onUnlinkRelative: (type: 'parent' | 'spouse' | 'child' | 'sibling', id: string) => void;
  onUpdateBranchLink?: (linkId: string, patch: Partial<BranchLink>) => void;
  onRemoveBranchLink?: (linkId: string) => void;
  onRemoveCrossCanvasLink?: (linkId: string) => void;
}

export const RelationsTab: React.FC<RelationsTabProps> = ({
  personId,
  draft,
  allPersons,
  currentTreeId,
  crossCanvasTrees = [],
  connectionOverrides,
  onToggleRelationVerification,
  onUnlinkRelative,
  onUpdateBranchLink,
  onRemoveBranchLink,
  onRemoveCrossCanvasLink,
}) => {
  const [editingBranchLinkId, setEditingBranchLinkId] = useState<string | null>(null);
  const renderRelativeRow = (
    id: string,
    type: 'parent' | 'spouse' | 'child' | 'sibling',
    extraBadge?: React.ReactNode
  ) => {
    const rel = allPersons[id];
    const isUnverified = draft.unverifiedRelations.includes(id);
    const fullName = rel ? `${rel.firstName} ${rel.lastName}`.trim() || 'Без імені' : 'Невідома особа';
    const initial = (rel?.firstName?.[0] || rel?.lastName?.[0] || '?').toUpperCase();
    const dotBg =
      rel?.gender === 'female'
        ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
        : 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300';

    return (
      <div
        key={id}
        className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5 py-2.5 px-3 rounded-lg border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80"
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${dotBg}`}
          >
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-semibold text-stone-900 dark:text-zinc-100 truncate">
                {fullName}
              </span>
              {rel?.maidenName && (
                <span className="text-[11px] text-stone-500 dark:text-zinc-400">
                  ({rel.maidenName})
                </span>
              )}
              {extraBadge}
            </div>
            {rel?.yearsDisplay && (
              <div className="text-[11px] font-mono tabular-nums text-stone-500 dark:text-zinc-400">
                {rel.yearsDisplay}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => onToggleRelationVerification(id)}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors cursor-pointer ${
              isUnverified
                ? 'bg-stone-100 dark:bg-zinc-800 text-stone-600 dark:text-zinc-300 border-stone-300 dark:border-zinc-700 hover:bg-stone-200 dark:hover:bg-zinc-700'
                : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/50'
            }`}
            title="Перемкнути статус достовірності зв’язку"
          >
            {isUnverified ? (
              <>
                <HelpCircle size={12} />
                <span>Неперевірений</span>
              </>
            ) : (
              <>
                <CheckCircle2 size={12} />
                <span>Достовірний</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => onUnlinkRelative(type, id)}
            className="p-1.5 rounded-md text-stone-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
            title="Від'єднати зв'язок"
          >
            <UserMinus size={14} />
          </button>
        </div>
      </div>
    );
  };

  const uniqueParents = Array.from(new Set(draft.parents));
  const uniqueSpouses = Array.from(new Set(draft.spouses));
  const uniqueSiblings = Array.from(new Set(draft.siblings));
  const uniqueChildren = Array.from(new Set(draft.children));

  return (
    <div className="space-y-5 animate-in fade-in-50 duration-150">
      <div className="flex items-start gap-2.5 text-xs text-stone-600 dark:text-zinc-400 pb-3 border-b border-stone-200 dark:border-zinc-800">
        <Info size={15} className="text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
        <span>
          Прямі родинні зв&apos;язки особи. Ви можете позначати зв&apos;язок як достовірний чи гіпотетичний, або від&apos;єднати його без видалення картки.
        </span>
      </div>

      {/* Parents */}
      <section className="space-y-2">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold text-stone-700 dark:text-zinc-300">
          <UserCheck size={14} className="text-emerald-700 dark:text-emerald-400" />
          <span>Батьки</span>
          <span className="font-mono tabular-nums text-stone-400 dark:text-zinc-500">
            · {uniqueParents.length}
          </span>
        </h4>
        {uniqueParents.length === 0 ? (
          <p className="text-xs text-stone-400 dark:text-zinc-500 italic py-1">
            Батьків не вказано
          </p>
        ) : (
          <div className="space-y-2">
            {uniqueParents.map((pId) => renderRelativeRow(pId, 'parent'))}
          </div>
        )}
      </section>

      {/* Spouses */}
      <section className="pt-4 border-t border-stone-200 dark:border-zinc-800 space-y-2">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold text-stone-700 dark:text-zinc-300">
          <Heart size={14} className="text-rose-600 dark:text-rose-400" />
          <span>Подружжя</span>
          <span className="font-mono tabular-nums text-stone-400 dark:text-zinc-500">
            · {uniqueSpouses.length}
          </span>
        </h4>
        {uniqueSpouses.length === 0 ? (
          <p className="text-xs text-stone-400 dark:text-zinc-500 italic py-1">
            Подружжя не вказано
          </p>
        ) : (
          <div className="space-y-2">
            {uniqueSpouses.map((sId) => {
              const mKey = [personId, sId].sort().join('::');
              const override = connectionOverrides?.[`marriage:${mKey}`];
              const isDivorced = override?.eventType === 'divorce';
              const isCohabitation = override?.eventType === 'cohabitation';

              const badge = isDivorced ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60">
                  <HeartCrack size={10} />
                  Розлучені{override?.eventDate ? ` (${override.eventDate})` : ''}
                </span>
              ) : isCohabitation ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
                  Без шлюбу
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60">
                  <Heart size={10} />
                  Шлюб{override?.eventDate ? ` (${override.eventDate})` : ''}
                </span>
              );

              return renderRelativeRow(sId, 'spouse', badge);
            })}
          </div>
        )}
      </section>

      {/* Siblings */}
      <section className="pt-4 border-t border-stone-200 dark:border-zinc-800 space-y-2">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold text-stone-700 dark:text-zinc-300">
          <Users size={14} className="text-sky-700 dark:text-sky-400" />
          <span>Брати та сестри</span>
          <span className="font-mono tabular-nums text-stone-400 dark:text-zinc-500">
            · {uniqueSiblings.length}
          </span>
        </h4>
        {uniqueSiblings.length === 0 ? (
          <p className="text-xs text-stone-400 dark:text-zinc-500 italic py-1">
            Братів та сестер не вказано
          </p>
        ) : (
          <div className="space-y-2">
            {uniqueSiblings.map((sId) => renderRelativeRow(sId, 'sibling'))}
          </div>
        )}
      </section>

      {/* Children */}
      <section className="pt-4 border-t border-stone-200 dark:border-zinc-800 space-y-2">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold text-stone-700 dark:text-zinc-300">
          <Users size={14} className="text-sky-700 dark:text-sky-400" />
          <span>Діти</span>
          <span className="font-mono tabular-nums text-stone-400 dark:text-zinc-500">
            · {uniqueChildren.length}
          </span>
        </h4>
        {uniqueChildren.length === 0 ? (
          <p className="text-xs text-stone-400 dark:text-zinc-500 italic py-1">
            Дітей не вказано
          </p>
        ) : (
          <div className="space-y-2">
            {uniqueChildren.map((cId) => renderRelativeRow(cId, 'child'))}
          </div>
        )}
      </section>

      {/* Cross-Canvas Links (Between Different Canvases) */}
      {(() => {
        const incomingCross: Array<{
          treeId: string;
          treeTitle: string;
          sourcePerson: Person;
          label?: string;
          color?: string;
        }> = [];
        crossCanvasTrees.forEach((t) => {
          if (currentTreeId && isSameCanvasId(t.treeId, currentTreeId)) return;
          t.persons.forEach((src) => {
            const links = getPersonCrossCanvasLinks(src);
            const match = links.find(
              (l) =>
                (!currentTreeId || isSameCanvasId(l.targetCanvasId, currentTreeId)) &&
                l.targetPersonId === personId
            );
            if (match) {
              incomingCross.push({
                treeId: t.treeId,
                treeTitle: t.treeTitle,
                sourcePerson: src,
                label: match.label,
                color: match.color,
              });
            }
          });
        });

        return (
          <section className="pt-4 border-t border-stone-200 dark:border-zinc-800 space-y-2">
            <h4 className="flex items-center gap-1.5 text-xs font-semibold text-stone-700 dark:text-zinc-300">
              <ExternalLink size={14} className="text-emerald-600 dark:text-emerald-400" />
              <span>Міжгілкові зв&apos;язки (між полотнами)</span>
              <span className="font-mono tabular-nums text-stone-400 dark:text-zinc-500">
                · {draft.crossCanvasLinks.length + incomingCross.length}
              </span>
            </h4>
            {draft.crossCanvasLinks.length === 0 && incomingCross.length === 0 ? (
              <p className="text-xs text-stone-400 dark:text-zinc-500 italic py-1">
                Зв&apos;язків з іншими полотнами поки немає (налаштовується у вкладці «Основне»)
              </p>
            ) : (
              <div className="space-y-2">
                {draft.crossCanvasLinks.map((ccl) => (
                  <div
                    key={ccl.id}
                    className="flex items-center justify-between gap-2.5 py-2 px-3 rounded-lg border border-emerald-200/80 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: ccl.color || '#047857' }}
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-stone-900 dark:text-zinc-100 truncate flex items-center gap-1.5">
                          <span className="px-1.5 py-0.2 rounded bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200 text-[10px] font-bold shrink-0">
                            {ccl.targetCanvasTitle || 'Полотно'}
                          </span>
                          {ccl.targetCardId && (
                            <span className="font-mono text-[10px] text-stone-600 dark:text-zinc-300 shrink-0">
                              {ccl.targetCardId}
                            </span>
                          )}
                          {ccl.targetPersonName && (
                            <span className="truncate">→ {ccl.targetPersonName}</span>
                          )}
                        </div>
                        {ccl.label && (
                          <div className="text-[10.5px] text-emerald-700 dark:text-emerald-300 truncate">
                            {ccl.label}
                          </div>
                        )}
                      </div>
                    </div>
                    {onRemoveCrossCanvasLink && (
                      <button
                        type="button"
                        onClick={() => onRemoveCrossCanvasLink(ccl.id)}
                        className="p-1.5 rounded-md text-stone-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer shrink-0"
                        title="Прибрати посилання на інше полотно"
                      >
                        <Trash2 size={13.5} />
                      </button>
                    )}
                  </div>
                ))}
                {incomingCross.map((inc) => {
                  const sName =
                    [inc.sourcePerson.firstName, inc.sourcePerson.lastName].filter(Boolean).join(' ') ||
                    'Без імені';
                  return (
                    <div
                      key={`inc-cross-${inc.treeId}-${inc.sourcePerson.id}`}
                      className="flex items-center justify-between gap-2.5 py-2 px-3 rounded-lg border border-stone-200 dark:border-zinc-800 bg-stone-50/70 dark:bg-zinc-900/60"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: inc.color || '#047857' }}
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-stone-800 dark:text-zinc-200 truncate flex items-center gap-1.5">
                            <span className="px-1.5 py-0.2 rounded bg-stone-200/80 dark:bg-zinc-800 text-stone-700 dark:text-zinc-300 text-[10px] font-bold shrink-0">
                              {inc.treeTitle}
                            </span>
                            <span className="font-mono text-[10px] text-stone-500 shrink-0">
                              {formatCardId(inc.sourcePerson)}
                            </span>
                            <span className="truncate">← {sName}</span>
                          </div>
                          {inc.label && (
                            <div className="text-[10.5px] text-stone-500 dark:text-zinc-400 truncate">
                              {inc.label}
                            </div>
                          )}
                        </div>
                      </div>
                      <span className="text-[10px] text-stone-400 shrink-0">З іншого полотна</span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })()}

      {/* Same-Canvas Branch/Godparent Links */}
      {(() => {
        const incoming = Object.values(allPersons).filter(
          (other) =>
            other.id !== personId &&
            other.branchLinks?.some((bl) => bl.targetPersonId === personId)
        );
        return (
          <section className="pt-4 border-t border-stone-200 dark:border-zinc-800 space-y-2">
            <h4 className="flex items-center gap-1.5 text-xs font-semibold text-stone-700 dark:text-zinc-300">
              <ArrowUpRight size={14} className="text-indigo-600 dark:text-indigo-400" />
              <span>Стрілки на поточному полотні (хресні / посилання)</span>
              <span className="font-mono tabular-nums text-stone-400 dark:text-zinc-500">
                · {draft.branchLinks.length + incoming.length}
              </span>
            </h4>
            {draft.branchLinks.length === 0 && incoming.length === 0 ? (
              <p className="text-xs text-stone-400 dark:text-zinc-500 italic py-1">
                Стрілок у межах цього полотна поки немає (налаштовується у вкладці «Основне»)
              </p>
            ) : (
              <div className="space-y-2">
                {draft.branchLinks.map((bl) => {
                  const target = allPersons[bl.targetPersonId];
                  const tName = target
                    ? `${target.firstName} ${target.lastName}`.trim() || 'Без імені'
                    : 'Невідома картка';
                  const isEditingThis = editingBranchLinkId === bl.id;
                  const shapeText = getBranchLineShapeLabel(bl.lineShape);
                  const widthVal = bl.strokeWidth ?? 2;
                  return (
                    <div
                      key={bl.id}
                      className="rounded-lg border border-indigo-200/80 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/20 overflow-hidden"
                    >
                      <div className="flex items-center justify-between gap-2.5 py-2 px-3">
                        <div className="flex items-center gap-2 min-w-0">
                          {bl.linkKind === 'godparent' ? (
                            <span
                              className="text-xs leading-none shrink-0 font-bold"
                              style={{ color: bl.color || '#d97706' }}
                            >
                              ✝
                            </span>
                          ) : (
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: bl.color || '#4f46e5' }}
                            />
                          )}
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-stone-900 dark:text-zinc-100 truncate">
                              → {tName}
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {bl.probableRelation && (
                                <span className="px-1.5 py-0.2 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300/70 dark:border-amber-800 text-[10px] font-bold">
                                  {bl.probableRelation}
                                </span>
                              )}
                              {bl.label && (
                                <span className="text-[10.5px] text-indigo-700 dark:text-indigo-300 truncate">
                                  {bl.label}
                                </span>
                              )}
                              <span className="text-[9.5px] font-mono text-stone-500 dark:text-zinc-400">
                                {shapeText} · {widthVal}px
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {onUpdateBranchLink && (
                            <button
                              type="button"
                              onClick={() =>
                                setEditingBranchLinkId((prev) => (prev === bl.id ? null : bl.id))
                              }
                              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                                isEditingThis
                                  ? 'bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300'
                                  : 'text-stone-400 hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-indigo-100/70 dark:hover:bg-indigo-950/40'
                              }`}
                              title="Налаштувати стиль (колір, товщина, форма лінії)"
                            >
                              <SlidersHorizontal size={13.5} />
                            </button>
                          )}
                          {onRemoveBranchLink && (
                            <button
                              type="button"
                              onClick={() => {
                                if (editingBranchLinkId === bl.id) setEditingBranchLinkId(null);
                                onRemoveBranchLink(bl.id);
                              }}
                              className="p-1.5 rounded-md text-stone-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                              title="Прибрати міжгілкове посилання"
                            >
                              <Trash2 size={13.5} />
                            </button>
                          )}
                        </div>
                      </div>

                      {isEditingThis && onUpdateBranchLink && (
                        <div className="px-3 pb-3 border-t border-indigo-200/70 dark:border-indigo-900/50 bg-white/85 dark:bg-zinc-900/80">
                          <BranchLinkStyleEditor
                            label={bl.label || ''}
                            onChangeLabel={(val) =>
                              onUpdateBranchLink(bl.id, { label: val || undefined })
                            }
                            {...((draft.isGhost || draft.isBlankScreenshot || target?.isGhost || target?.isBlankScreenshot)
                              ? {
                                  probableRelation: bl.probableRelation || '',
                                  onChangeProbableRelation: (val: string) =>
                                    onUpdateBranchLink(bl.id, {
                                      probableRelation: val.trim() || undefined,
                                    }),
                                }
                              : {})}
                            color={bl.color || (bl.linkKind === 'godparent' ? '#d97706' : '#4f46e5')}
                            onChangeColor={(c) => onUpdateBranchLink(bl.id, { color: c })}
                            strokeWidth={bl.strokeWidth ?? 2}
                            onChangeStrokeWidth={(w) =>
                              onUpdateBranchLink(bl.id, { strokeWidth: w })
                            }
                            lineShape={normalizeBranchLineShape(bl.lineShape)}
                            onChangeLineShape={(shape) =>
                              onUpdateBranchLink(bl.id, { lineShape: shape })
                            }
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
                {incoming.map((src) => {
                  const sLink = src.branchLinks?.find((bl) => bl.targetPersonId === personId);
                  const sName = `${src.firstName} ${src.lastName}`.trim() || 'Без імені';
                  return (
                    <div
                      key={`in-${src.id}`}
                      className="flex items-center justify-between gap-2.5 py-2 px-3 rounded-lg border border-stone-200 dark:border-zinc-800 bg-stone-50/70 dark:bg-zinc-900/60"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: sLink?.color || '#4f46e5' }}
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-stone-800 dark:text-zinc-200 truncate">
                            ← Посилання від: {sName}
                          </div>
                          {(sLink?.probableRelation || sLink?.label) && (
                            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                              {sLink?.probableRelation && (
                                <span className="px-1.5 py-0.2 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300/70 dark:border-amber-800 text-[10px] font-bold">
                                  {sLink.probableRelation}
                                </span>
                              )}
                              {sLink?.label && (
                                <span className="text-[10.5px] text-stone-500 dark:text-zinc-400 truncate">
                                  {sLink.label}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      <span className="text-[10px] text-stone-400 shrink-0">Вхідне</span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })()}
    </div>
  );
};
