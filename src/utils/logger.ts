export type LogLevel = 'info' | 'warn' | 'error' | 'success';
export type LogCategory = 'server' | 'database' | 'auth' | 'tree' | 'system' | 'user';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  category: LogCategory;
  message: string;
  details?: any;
}

const STORAGE_KEY = 'rodovid_system_logs';
const MAX_LOGS = 1000;

let memoryLogs: LogEntry[] = [];
const listeners = new Set<(logs: LogEntry[]) => void>();

// Load logs from localStorage on initial load
try {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      memoryLogs = parsed.slice(0, MAX_LOGS);
    }
  }
} catch {
  memoryLogs = [];
}

function persistLogs() {
  const tryLimits = [MAX_LOGS, 500, 200, 50];
  for (const limit of tryLimits) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(memoryLogs.slice(0, limit)));
      return;
    } catch {
      /* retry with fewer entries on quota exceeded */
    }
  }
}

function notifyListeners() {
  listeners.forEach((listener) => listener([...memoryLogs]));
}

/**
  Main function to append a log entry
 */
export function addLog(
  level: LogLevel,
  category: LogCategory,
  message: string,
  details?: any
): LogEntry {
  const entry: LogEntry = {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    level,
    category,
    message,
    details: details !== undefined ? details : undefined,
  };

  memoryLogs.unshift(entry);
  if (memoryLogs.length > MAX_LOGS) {
    memoryLogs = memoryLogs.slice(0, MAX_LOGS);
  }

  persistLogs();
  notifyListeners();
  return entry;
}

export function getLogs(): LogEntry[] {
  return [...memoryLogs];
}

export function clearLogs(): void {
  memoryLogs = [];
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
  notifyListeners();
}

export function subscribeLogs(listener: (logs: LogEntry[]) => void): () => void {
  listeners.add(listener);
  listener([...memoryLogs]);
  return () => {
    listeners.delete(listener);
  };
}

// Shortcut helpers
export function logServer(message: string, details?: any, level: LogLevel = 'info') {
  return addLog(level, 'server', message, details);
}

export function logDatabase(message: string, details?: any, level: LogLevel = 'info') {
  return addLog(level, 'database', message, details);
}

export function logAuth(message: string, details?: any, level: LogLevel = 'info') {
  return addLog(level, 'auth', message, details);
}

export function logTree(message: string, details?: any, level: LogLevel = 'info') {
  return addLog(level, 'tree', message, details);
}

export function logUser(message: string, details?: any, level: LogLevel = 'info') {
  return addLog(level, 'user', message, details);
}

export function logSystem(message: string, details?: any, level: LogLevel = 'info') {
  return addLog(level, 'system', message, details);
}

export function logError(category: LogCategory, message: string, details?: any) {
  return addLog('error', category, message, details);
}

// Global window error & connectivity listener setup
if (typeof window !== 'undefined') {
  logSystem('Запуск сесії вебзастосунку «Родовід»', {
    online: typeof navigator !== 'undefined' ? navigator.onLine : true,
  });

  window.addEventListener('online', () => {
    logSystem('Зʼєднання з мережею відновлено', undefined, 'success');
  });

  window.addEventListener('offline', () => {
    logSystem('Втрачено зʼєднання з мережею (офлайн-режим)', undefined, 'warn');
  });

  window.addEventListener('error', (event) => {
    logError('system', `Глобальна помилка скрипта: ${event.message || 'Unknown error'}`, {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error?.stack || String(event.error),
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    logError('system', `Необроблений проміс (Promise Rejection): ${event.reason?.message || String(event.reason)}`, {
      reason: event.reason?.stack || event.reason,
    });
  });
}
