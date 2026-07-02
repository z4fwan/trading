// === Structured Error Tracking ===

export type ErrorSeverity = 'info' | 'warn' | 'error' | 'critical';

export interface LogEntry {
  id: string;
  timestamp: number;
  severity: ErrorSeverity;
  source: string;
  message: string;
  data?: unknown;
  stack?: string;
  url?: string;
}

const MAX_LOG_ENTRIES = 200;
const LOG_KEY = 'opencode_error_log';

function loadLog(): LogEntry[] {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

function saveLog(entries: LogEntry[]): void {
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(entries.slice(-MAX_LOG_ENTRIES)));
  } catch { /* ignore */ }
}

let logCache: LogEntry[] | null = null;

function getLog(): LogEntry[] {
  if (logCache) return logCache;
  logCache = loadLog();
  return logCache;
}

function addEntry(entry: LogEntry): void {
  const log = getLog();
  log.push(entry);
  logCache = log;
  saveLog(log);

  if (entry.severity === 'error' || entry.severity === 'critical') {
    console.error(`[${entry.source}] ${entry.message}`, entry.data || '');
  } else if (entry.severity === 'warn') {
    console.warn(`[${entry.source}] ${entry.message}`, entry.data || '');
  }
}

let idCounter = 0;
function nextId(): string {
  return `log-${Date.now()}-${++idCounter}-${Math.random().toString(36).slice(2, 6)}`;
}

export function logInfo(source: string, message: string, data?: unknown): void {
  addEntry({ id: nextId(), timestamp: Date.now(), severity: 'info', source, message, data });
}

export function logWarn(source: string, message: string, data?: unknown): void {
  addEntry({ id: nextId(), timestamp: Date.now(), severity: 'warn', source, message, data });
}

export function logError(source: string, message: string, error?: unknown): void {
  const stack = error instanceof Error ? error.stack : undefined;
  addEntry({
    id: nextId(), timestamp: Date.now(), severity: 'error', source, message,
    data: error instanceof Error ? { name: error.name, message: error.message } : error,
    stack, url: typeof window !== 'undefined' ? window.location.href : undefined,
  });
}

export function logCritical(source: string, message: string, error?: unknown): void {
  const stack = error instanceof Error ? error.stack : undefined;
  addEntry({
    id: nextId(), timestamp: Date.now(), severity: 'critical', source, message,
    data: error instanceof Error ? { name: error.name, message: error.message } : error,
    stack, url: typeof window !== 'undefined' ? window.location.href : undefined,
  });
}

export function getErrorLog(): LogEntry[] {
  return getLog();
}

export function getErrorsBySeverity(severity: ErrorSeverity): LogEntry[] {
  return getLog().filter(e => e.severity === severity);
}

export function getRecentErrors(count = 20): LogEntry[] {
  return getLog().slice(-count).reverse();
}

export function clearErrorLog(): void {
  logCache = null;
  try { localStorage.removeItem(LOG_KEY); } catch { /* ignore */ }
}

// === Performance Monitor ===
export class PerfMonitor {
  private marks: Record<string, number> = {};

  start(label: string): void {
    this.marks[label] = performance.now();
  }

  end(label: string): number {
    const start = this.marks[label];
    if (!start) return 0;
    const duration = performance.now() - start;
    delete this.marks[label];
    if (duration > 100) {
      logWarn('PerfMonitor', `Slow operation: ${label} took ${duration.toFixed(0)}ms`);
    }
    return duration;
  }

  trace<T>(label: string, fn: () => T): T {
    this.start(label);
    try { return fn(); } finally { this.end(label); }
  }

  async traceAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
    this.start(label);
    try { return await fn(); } finally { this.end(label); }
  }
}

export const perfMonitor = new PerfMonitor();

// === Global error handler (call once at app root, returns cleanup) ===
export function setupGlobalErrorHandling(): () => void {
  if (typeof window === 'undefined') return () => {};

  const onError = (event: ErrorEvent) => {
    logCritical('window.onerror', event.message || 'Unhandled error', event.error);
  };
  const onReject = (event: PromiseRejectionEvent) => {
    logError('unhandledRejection', 'Unhandled promise rejection', event.reason);
  };

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onReject);

  logInfo('errorTracker', 'Global error handling initialized');

  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onReject);
  };
}
