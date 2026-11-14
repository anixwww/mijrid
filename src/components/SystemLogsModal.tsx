import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  FileText,
  Trash2,
  Download,
  Copy,
  Search,
  Filter,
  Server,
  Database,
  ShieldCheck,
  FolderTree,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Info,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Terminal,
  User,
} from 'lucide-react';
import {
  LogEntry,
  LogLevel,
  LogCategory,
  getLogs,
  clearLogs,
  subscribeLogs,
} from '../utils/logger';
import { ConfirmDialog } from './ConfirmDialog';

interface SystemLogsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SystemLogsModal: React.FC<SystemLogsModalProps> = ({ isOpen, onClose }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedLevel, setSelectedLevel] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedLogIds, setExpandedLogIds] = useState<Set<string>>(new Set());
  const [copiedSuccess, setCopiedSuccess] = useState<boolean>(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;
    const unsubscribe = subscribeLogs((updatedLogs) => {
      setLogs(updatedLogs);
    });
    return () => unsubscribe();
  }, [isOpen]);

  const toggleExpand = (id: string) => {
    setExpandedLogIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (selectedCategory !== 'all' && log.category !== selectedCategory) return false;
      if (selectedLevel !== 'all' && log.level !== selectedLevel) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const msgMatch = log.message.toLowerCase().includes(query);
        const catMatch = log.category.toLowerCase().includes(query);
        const detailsMatch = log.details ? JSON.stringify(log.details).toLowerCase().includes(query) : false;
        if (!msgMatch && !catMatch && !detailsMatch) return false;
      }
      return true;
    });
  }, [logs, selectedCategory, selectedLevel, searchQuery]);

  const handleCopyLogs = () => {
    try {
      navigator.clipboard.writeText(JSON.stringify(filteredLogs, null, 2));
      setCopiedSuccess(true);
      setTimeout(() => setCopiedSuccess(false), 2000);
    } catch (e) {
      console.error('Failed to copy logs:', e);
    }
  };

  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(filteredLogs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `system_logs_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '_')}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleClearAll = () => {
    setConfirmClearOpen(true);
  };

  if (!isOpen) return null;

  const getCategoryBadge = (category: LogCategory) => {
    switch (category) {
      case 'server':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-100 text-sky-800 border border-sky-200 text-[10.5px] font-bold">
            <Server size={11} />
            <span>Локал-сервер</span>
          </span>
        );
      case 'database':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 border border-purple-200 text-[10.5px] font-bold">
            <Database size={11} />
            <span>База даних (Firestore)</span>
          </span>
        );
      case 'auth':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-200 text-[10.5px] font-bold">
            <ShieldCheck size={11} />
            <span>Авторизація</span>
          </span>
        );
      case 'tree':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-900 border border-emerald-200 text-[10.5px] font-bold">
            <FolderTree size={11} />
            <span>Родовід</span>
          </span>
        );
      case 'user':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-900 border border-indigo-200 text-[10.5px] font-bold">
            <User size={11} />
            <span>Дії користувача</span>
          </span>
        );
      case 'system':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-stone-200 text-stone-700 border border-stone-300 text-[10.5px] font-bold">
            <Terminal size={11} />
            <span>Система</span>
          </span>
        );
    }
  };

  const getLevelBadge = (level: LogLevel) => {
    switch (level) {
      case 'error':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-600 text-white text-[10px] font-extrabold uppercase tracking-wider">
            <AlertCircle size={11} />
            <span>Помилка</span>
          </span>
        );
      case 'warn':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500 text-stone-950 text-[10px] font-extrabold uppercase tracking-wider">
            <AlertTriangle size={11} />
            <span>Увага</span>
          </span>
        );
      case 'success':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-extrabold uppercase tracking-wider">
            <CheckCircle2 size={11} />
            <span>Успіх</span>
          </span>
        );
      case 'info':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-stone-700 text-stone-100 text-[10px] font-extrabold uppercase tracking-wider">
            <Info size={11} />
            <span>Інфо</span>
          </span>
        );
    }
  };

  const formatTimestamp = (iso: string) => {
    try {
      const d = new Date(iso);
      const datePart = d.toLocaleDateString('uk-UA', {
        day: '2-digit',
        month: '2-digit',
      });
      const timePart = d.toLocaleTimeString('uk-UA', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      return `${datePart} ${timePart}.${String(d.getMilliseconds()).padStart(3, '0')}`;
    } catch {
      return iso;
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-2 sm:p-4 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-stone-900 text-stone-100 rounded-2xl shadow-2xl border border-stone-800 w-full max-w-5xl h-[88vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="px-4 sm:px-6 py-4 bg-stone-950 border-b border-stone-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-stone-800 text-emerald-400 border border-stone-700 flex items-center justify-center shrink-0 shadow-inner">
              <Terminal size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-tight">
                  Системні логи та події
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800/80 text-[11px] font-mono font-bold">
                  {filteredLogs.length} записів
                </span>
              </div>
              <p className="text-xs text-stone-400 mt-0.5">
                Моніторинг локального сховища, бази даних (Firestore) та системних подій
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-stone-400 hover:text-white hover:bg-stone-800 transition-colors cursor-pointer"
            title="Закрити"
          >
            <X size={18} />
          </button>
        </div>

        {/* Filter Controls Toolbar */}
        <div className="p-3 sm:p-4 bg-stone-900 border-b border-stone-800 space-y-3 shrink-0">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            {/* Search Bar */}
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Пошук у логах (повідомлення, параметри, детальні дані)..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-stone-950 border border-stone-800 rounded-xl text-stone-200 placeholder-stone-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 font-mono"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-300"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Quick Action Buttons */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleCopyLogs}
                className="px-3 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border border-stone-700 active:scale-95"
                title="Скопіювати відфільтровані логи в буфер обміну"
              >
                <Copy size={13} className={copiedSuccess ? 'text-emerald-400' : 'text-stone-400'} />
                <span>{copiedSuccess ? 'Скопійовано!' : 'Копіювати'}</span>
              </button>

              <button
                type="button"
                onClick={handleExportJson}
                className="px-3 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border border-stone-700 active:scale-95"
                title="Завантажити логи у форматі JSON"
              >
                <Download size={13} className="text-stone-400" />
                <span>Експорт JSON</span>
              </button>

              <button
                type="button"
                onClick={handleClearAll}
                className="px-3 py-1.5 rounded-xl bg-rose-950/60 hover:bg-rose-900 text-rose-300 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border border-rose-800/80 active:scale-95"
                title="Очистити всі збережені логи"
              >
                <Trash2 size={13} />
                <span>Очистити</span>
              </button>
            </div>
          </div>

          {/* Category & Level Filter Pills */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-stone-800/80">
            {/* Category Filter Pills */}
            <div className="flex flex-wrap items-center gap-1 text-xs">
              <span className="text-[11px] font-bold text-stone-500 mr-1 flex items-center gap-1">
                <Filter size={11} /> Категорія:
              </span>
              {[
                { id: 'all', label: 'Усі' },
                { id: 'user', label: 'Дії користувача' },
                { id: 'tree', label: 'Родовід' },
                { id: 'database', label: 'База даних (Firestore)' },
                { id: 'auth', label: 'Авторизація' },
                { id: 'system', label: 'Система' },
              ].map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                    selectedCategory === cat.id
                      ? 'bg-emerald-600 text-white shadow-xs font-bold'
                      : 'bg-stone-800/80 text-stone-400 hover:bg-stone-800 hover:text-stone-200'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Level Filter Pills */}
            <div className="flex items-center gap-1 text-xs">
              <span className="text-[11px] font-bold text-stone-500 mr-1">Рівень:</span>
              {[
                { id: 'all', label: 'Всі' },
                { id: 'error', label: 'Помилки' },
                { id: 'warn', label: 'Увага' },
                { id: 'success', label: 'Успіх' },
                { id: 'info', label: 'Інфо' },
              ].map((lvl) => (
                <button
                  key={lvl.id}
                  type="button"
                  onClick={() => setSelectedLevel(lvl.id)}
                  className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                    selectedLevel === lvl.id
                      ? lvl.id === 'error'
                        ? 'bg-rose-600 text-white font-bold'
                        : lvl.id === 'warn'
                        ? 'bg-amber-500 text-stone-950 font-bold'
                        : lvl.id === 'success'
                        ? 'bg-emerald-600 text-white font-bold'
                        : 'bg-stone-700 text-white font-bold'
                      : 'bg-stone-800/80 text-stone-400 hover:bg-stone-800 hover:text-stone-200'
                  }`}
                >
                  {lvl.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Logs List Table / List Container */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2 font-mono text-xs no-scrollbar bg-stone-950/60">
          {filteredLogs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 text-stone-500 space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-stone-900 border border-stone-800 flex items-center justify-center text-stone-600">
                <FileText size={28} />
              </div>
              <div>
                <p className="text-sm font-bold text-stone-400">Логів за вказаними фільтрами не знайдено</p>
                <p className="text-xs text-stone-600 mt-1">
                  Усі нові дії, локальні збереження та операції з Firestore будуть з'являтися тут автоматично.
                </p>
              </div>
            </div>
          ) : (
            filteredLogs.map((log) => {
              const isExpanded = expandedLogIds.has(log.id);
              const hasDetails = log.details !== undefined && log.details !== null;

              return (
                <div
                  key={log.id}
                  className={`rounded-xl border transition-all ${
                    log.level === 'error'
                      ? 'bg-rose-950/20 border-rose-900/60 text-rose-100'
                      : log.level === 'warn'
                      ? 'bg-amber-950/20 border-amber-900/60 text-amber-100'
                      : log.level === 'success'
                      ? 'bg-emerald-950/20 border-emerald-900/50 text-emerald-100'
                      : 'bg-stone-900/80 border-stone-800/80 text-stone-200 hover:border-stone-700'
                  }`}
                >
                  <div
                    onClick={() => hasDetails && toggleExpand(log.id)}
                    className={`p-3 flex items-start gap-2.5 sm:gap-3 ${
                      hasDetails ? 'cursor-pointer hover:bg-white/5' : ''
                    }`}
                  >
                    {/* Expand Arrow if details present */}
                    {hasDetails ? (
                      <button
                        type="button"
                        className="text-stone-400 mt-0.5 shrink-0 hover:text-white"
                      >
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                    ) : (
                      <div className="w-3.5 shrink-0" />
                    )}

                    {/* Timestamp */}
                    <span className="text-[11px] text-stone-400 font-mono shrink-0 select-all pt-0.5">
                      [{formatTimestamp(log.timestamp)}]
                    </span>

                    {/* Level Badge */}
                    <div className="shrink-0">{getLevelBadge(log.level)}</div>

                    {/* Category Badge */}
                    <div className="shrink-0 hidden sm:block">{getCategoryBadge(log.category)}</div>

                    {/* Main Log Message */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-sans font-semibold leading-relaxed break-words">
                        {log.message}
                      </p>
                    </div>

                    {/* Details indicator pill */}
                    {hasDetails && (
                      <span className="text-[10px] text-stone-400 font-mono bg-stone-800 px-1.5 py-0.5 rounded shrink-0">
                        {isExpanded ? 'Сховати деталі' : 'Деталі...'}
                      </span>
                    )}
                  </div>

                  {/* Expanded JSON / Object Details View */}
                  {isExpanded && hasDetails && (
                    <div className="px-4 pb-3 pt-1 border-t border-stone-800/60 bg-stone-950/80 rounded-b-xl animate-in fade-in duration-100">
                      <div className="flex items-center justify-between mb-1.5 pt-1">
                        <span className="text-[10.5px] font-bold uppercase tracking-wider text-stone-400">
                          Детальні дані події (JSON / Context):
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(
                              typeof log.details === 'string' ? log.details : JSON.stringify(log.details, null, 2)
                            );
                          }}
                          className="text-[10.5px] text-emerald-400 hover:underline font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Copy size={11} /> Скопіювати деталі
                        </button>
                      </div>

                      <pre className="text-[11px] font-mono text-emerald-300 bg-stone-900 p-3 rounded-lg border border-stone-800 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed select-all">
                        {typeof log.details === 'string'
                          ? log.details
                          : JSON.stringify(log.details, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer Info */}
        <div className="px-4 py-2.5 bg-stone-950 border-t border-stone-800 flex items-center justify-between text-[11px] text-stone-400 shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Система моніторингу активна</span>
          </div>
          <span>Логи автоматично зберігаються в LocalStorage (до 1000 записів)</span>
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmClearOpen}
        variant="danger"
        title="Очистити журнал?"
        description="Ви дійсно бажаєте видалити всі записи системного журналу?"
        confirmLabel="Очистити"
        onConfirm={() => {
          clearLogs();
          setConfirmClearOpen(false);
        }}
        onCancel={() => setConfirmClearOpen(false)}
      />
    </div>
  );
};
