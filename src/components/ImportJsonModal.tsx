import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  FileJson,
  Cloud,
  Server,
  HardDrive,
  CheckCircle2,
  AlertCircle,
  X,
  Loader2,
  Users,
  Layers,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { FamilyTreeData } from '../types/tree';
import { parseTreeJsonFile } from '../utils/fileStorage';

interface ImportJsonModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportTree: (importedTree: FamilyTreeData, mode: 'replace' | 'new-canvas', canvasTitle?: string) => Promise<void>;
  currentTreeTitle: string;
  initialFile?: File | null;
}

export const ImportJsonModal: React.FC<ImportJsonModalProps> = ({
  isOpen,
  onClose,
  onImportTree,
  currentTreeTitle,
  initialFile = null,
}) => {
  const [file, setFile] = useState<File | null>(initialFile);
  const [parsedData, setParsedData] = useState<FamilyTreeData | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [importMode, setImportMode] = useState<'replace' | 'new-canvas'>('replace');
  const [newCanvasName, setNewCanvasName] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Parse file whenever selected
  useEffect(() => {
    if (!isOpen) {
      setFile(null);
      setParsedData(null);
      setParseError(null);
      setIsSyncing(false);
      return;
    }

    if (initialFile) {
      handleProcessFile(initialFile);
    }
  }, [isOpen, initialFile]);

  const handleProcessFile = async (selectedFile: File) => {
    setFile(selectedFile);
    setParseError(null);
    setIsParsing(true);
    setParsedData(null);

    try {
      const data = await parseTreeJsonFile(selectedFile);
      if (!data || !data.persons || typeof data.persons !== 'object') {
        throw new Error('Файл не містить валідних даних родового дерева (відсутнє поле "persons").');
      }

      const personCount = Object.keys(data.persons).length;
      if (personCount === 0) {
        throw new Error('Файл не містить жодної особи для імпорту.');
      }

      setParsedData(data);
      const suggestedName = data.title?.trim() || selectedFile.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' ') || 'Нове родове полотно';
      setNewCanvasName(suggestedName);
    } catch (err) {
      setParseError((err as Error).message || 'Помилка розбору JSON-файлу.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      handleProcessFile(selected);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) {
      handleProcessFile(dropped);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleConfirmImport = async () => {
    if (!parsedData) return;
    setIsSyncing(true);
    try {
      await onImportTree(
        parsedData,
        importMode,
        importMode === 'new-canvas' ? newCanvasName.trim() || parsedData.title || 'Нове полотно' : undefined
      );
      onClose();
    } catch (err) {
      setParseError(`Помилка під час синхронізації: ${(err as Error).message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  if (!isOpen) return null;

  const personCount = parsedData ? Object.keys(parsedData.persons).length : 0;
  const connectionsCount = parsedData?.connectionOverrides ? Object.keys(parsedData.connectionOverrides).length : 0;

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-stone-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-emerald-50 via-stone-50 to-emerald-50/40 border-b border-stone-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <Upload size={18} />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-bold text-stone-900">
                  Імпорт JSON родового дерева
                </h3>
                <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-100/90 px-1.5 py-0.2 rounded-full border border-emerald-200/60">
                  <ShieldCheck size={11} />
                  Адміністратор
                </span>
              </div>
              <p className="text-[11px] text-stone-500">
                Миттєва синхронізація з базою даних, сервером та локальним сховищем
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSyncing}
            className="p-1 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-200/50 transition-colors disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleFileChange}
            className="hidden"
          />

          {/* Dropzone */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => !isSyncing && fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
              isDragOver
                ? 'border-emerald-500 bg-emerald-50/60 scale-[1.01]'
                : file
                ? 'border-emerald-300 bg-emerald-50/20 hover:bg-emerald-50/40'
                : 'border-stone-200 hover:border-emerald-400 hover:bg-stone-50/80'
            }`}
          >
            <div className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-2xs">
                {isParsing ? (
                  <Loader2 size={24} className="animate-spin text-emerald-600" />
                ) : file ? (
                  <FileJson size={24} className="text-emerald-700" />
                ) : (
                  <Upload size={24} className="text-emerald-700" />
                )}
              </div>

              {file ? (
                <div>
                  <div className="text-xs font-bold text-stone-900 truncate max-w-xs mx-auto">
                    {file.name}
                  </div>
                  <div className="text-[11px] text-stone-500 mt-0.5">
                    {(file.size / 1024).toFixed(1)} КБ • Натисніть, щоб обрати інший файл
                  </div>
                </div>
              ) : (
                <div>
                  <div className="text-xs font-bold text-stone-800">
                    Перетягніть сюди файл .json або натисніть для вибору
                  </div>
                  <div className="text-[11px] text-stone-500 mt-0.5">
                    Підтримуються файли проекту Родовід (.json)
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Parse Error */}
          {parseError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200/80 flex items-start gap-2.5 text-xs text-rose-800">
              <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
              <div className="leading-relaxed">{parseError}</div>
            </div>
          )}

          {/* Parsed Summary Card */}
          {parsedData && (
            <div className="p-4 rounded-xl bg-stone-50 border border-stone-200/90 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-stone-900">
                  <CheckCircle2 size={16} className="text-emerald-600" />
                  <span>Файл валідний та готовий до імпорту</span>
                </div>
                <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded-md">
                  {personCount} осіб
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-white p-2.5 rounded-lg border border-stone-200/70">
                  <span className="text-[10px] uppercase font-bold text-stone-400 block">
                    Назва у файлі
                  </span>
                  <span className="font-semibold text-stone-800 truncate block mt-0.5">
                    {parsedData.title || 'Моє родове дерево'}
                  </span>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-stone-200/70">
                  <span className="text-[10px] uppercase font-bold text-stone-400 block">
                    Зв'язки та шлюби
                  </span>
                  <span className="font-semibold text-stone-800 block mt-0.5">
                    {connectionsCount > 0 ? `${connectionsCount} налаштованих ліній` : 'Стандартні звʼязки'}
                  </span>
                </div>
              </div>

              {/* Target Canvas Mode Selection */}
              <div className="space-y-2 pt-1">
                <div className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
                  Куди імпортувати:
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setImportMode('replace')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      importMode === 'replace'
                        ? 'border-emerald-600 bg-emerald-50/60 ring-2 ring-emerald-500/20'
                        : 'border-stone-200 hover:border-stone-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold text-stone-900">
                      <Layers size={14} className={importMode === 'replace' ? 'text-emerald-700' : 'text-stone-500'} />
                      <span>Поточне полотно</span>
                    </div>
                    <p className="text-[10.5px] text-stone-500 mt-1 line-clamp-1">
                      Оновити "{currentTreeTitle}"
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setImportMode('new-canvas')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      importMode === 'new-canvas'
                        ? 'border-emerald-600 bg-emerald-50/60 ring-2 ring-emerald-500/20'
                        : 'border-stone-200 hover:border-stone-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold text-stone-900">
                      <Users size={14} className={importMode === 'new-canvas' ? 'text-emerald-700' : 'text-stone-500'} />
                      <span>Нове полотно</span>
                    </div>
                    <p className="text-[10.5px] text-stone-500 mt-1 line-clamp-1">
                      Створити окрему вкладку
                    </p>
                  </button>
                </div>

                {importMode === 'new-canvas' && (
                  <div className="pt-1">
                    <label className="block text-[11px] font-semibold text-stone-700 mb-1">
                      Назва нової вкладки:
                    </label>
                    <input
                      type="text"
                      value={newCanvasName}
                      onChange={(e) => setNewCanvasName(e.target.value)}
                      placeholder="Введіть назву для полотна..."
                      className="w-full px-3 py-1.5 text-xs rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                  </div>
                )}
              </div>

              {/* Immediate Sync Guarantee Info Box */}
              <div className="p-3 rounded-xl bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-sky-500/10 border border-emerald-500/20 space-y-1.5">
                <div className="text-[11px] font-bold text-emerald-900 flex items-center gap-1.5">
                  <Cloud size={13} className="text-emerald-700" />
                  <span>Миттєва потрійна синхронізація:</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 text-[10px] text-stone-600">
                  <div className="flex items-center gap-1 bg-white/70 px-2 py-1 rounded-md border border-stone-200/50">
                    <Cloud size={11} className="text-indigo-600 shrink-0" />
                    <span className="truncate">Хмара Firestore</span>
                  </div>
                  <div className="flex items-center gap-1 bg-white/70 px-2 py-1 rounded-md border border-stone-200/50">
                    <Server size={11} className="text-emerald-600 shrink-0" />
                    <span className="truncate">Node.js Сервер</span>
                  </div>
                  <div className="flex items-center gap-1 bg-white/70 px-2 py-1 rounded-md border border-stone-200/50">
                    <HardDrive size={11} className="text-stone-600 shrink-0" />
                    <span className="truncate">LocalStorage</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-stone-50 border-t border-stone-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            disabled={isSyncing}
            className="px-4 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-200/60 rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
          >
            Скасувати
          </button>

          <button
            type="button"
            onClick={handleConfirmImport}
            disabled={!parsedData || isSyncing || isParsing}
            className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 rounded-xl shadow-xs transition-all flex items-center gap-2 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
          >
            {isSyncing ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>Синхронізація з БД та сервером...</span>
              </>
            ) : (
              <>
                <span>Імпортувати та синхронізувати</span>
                <ArrowRight size={14} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
