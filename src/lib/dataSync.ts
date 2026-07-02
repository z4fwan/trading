import { logInfo, logWarn, logError } from '@/lib/errorTracker';

export type StorageBackend = 'localStorage' | 'supabase';

function detectBackend(): StorageBackend {
  if (typeof window === 'undefined') return 'supabase';
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && url.startsWith('http') && key && key.length > 20) {
    return 'supabase';
  }
  return 'localStorage';
}

const backend: StorageBackend = detectBackend();
let _initialized = false;
let _initPromise: Promise<void> | null = null;
let _cloudUnreachableUntil = 0;

/** After a failed cloud fetch, skip retries for a few minutes (avoids console spam). */
export function markCloudUnreachable(ms = 5 * 60 * 1000): void {
  _cloudUnreachableUntil = Date.now() + ms;
}

export function isCloudReachable(): boolean {
  return Date.now() >= _cloudUnreachableUntil;
}

export function isSupabaseActive(): boolean {
  return backend === 'supabase';
}

export interface StorageAdapter {
  get<T>(key: string): T | null;
  set<T>(key: string, value: T): void;
  remove(key: string): void;
  clear(): void;
}

const serverMemoryStore = new Map<string, string>();

const serverMemoryAdapter: StorageAdapter = {
  get<T>(key: string): T | null {
    try {
      const raw = serverMemoryStore.get(key);
      if (raw === undefined) return null;
      return JSON.parse(raw) as T;
    } catch { return null; }
  },
  set<T>(key: string, value: T): void {
    try { serverMemoryStore.set(key, JSON.stringify(value)); }
    catch (e) { logError('Storage', `Failed to save ${key}`, e); }
  },
  remove(key: string): void { serverMemoryStore.delete(key); },
  clear(): void { serverMemoryStore.clear(); },
};

const localStorageAdapter: StorageAdapter = {
  get<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return null;
      return JSON.parse(raw) as T;
    } catch { return null; }
  },
  set<T>(key: string, value: T): void {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch (e) { logError('Storage', `Failed to save ${key}`, e); }
  },
  remove(key: string): void {
    try { localStorage.removeItem(key); } catch { }
  },
  clear(): void {
    try { localStorage.clear(); } catch { }
  },
};

// Client-side storage: localStorage only.
// Server-side Supabase persistence is handled by the background engine (backgroundEngine.ts).
const supabaseAdapter: StorageAdapter = {
  get<T>(key: string): T | null { return localStorageAdapter.get<T>(key); },
  set<T>(key: string, value: T): void { localStorageAdapter.set(key, value); },
  remove(key: string): void { localStorageAdapter.remove(key); },
  clear(): void { localStorageAdapter.clear(); },
};

function getAdapter(): StorageAdapter {
  if (typeof window === 'undefined') return serverMemoryAdapter;
  if (backend === 'supabase') return supabaseAdapter;
  return localStorageAdapter;
}

export const storage = getAdapter();

// === Migration from localStorage to Supabase ===
export async function initializeDatabase(): Promise<void> {
  if (_initialized) return;
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    if (backend !== 'supabase') {
      logInfo('Storage', 'Supabase not configured, using localStorage');
      _initialized = true;
      return;
    }
    logInfo('Storage', 'Client uses localStorage; cloud sync runs via /api/sync on the server');
    _initialized = true;
  })();
  return _initPromise;
}

export function syncPredictionStore(): void {
  try {
    const localData = localStorage.getItem('opencode_prediction_store');
    if (localData) {
      const parsed = JSON.parse(localData);
      logInfo('Sync', `Prediction store: ${parsed.length} records in localStorage`);
    }
  } catch { }
}

export function syncMLModels(): void {
  try {
    const localData = localStorage.getItem('opencode_ml_models');
    if (localData) {
      const models = JSON.parse(localData);
      logInfo('Sync', `ML models: ${Object.keys(models).length} cached`);
    }
  } catch { }
}

export interface DataExport {
  exportedAt: string;
  predictions: unknown[];
  mlModels: Record<string, unknown>;
  errorLog: unknown[];
  calibrationData: unknown[];
}

export function exportAllData(): DataExport {
  return {
    exportedAt: new Date().toISOString(),
    predictions: localStorageAdapter.get<unknown[]>('opencode_prediction_store') || [],
    mlModels: localStorageAdapter.get<Record<string, unknown>>('opencode_ml_models') || {},
    errorLog: localStorageAdapter.get<unknown[]>('opencode_error_log') || [],
    calibrationData: [],
  };
}

export function importAllData(data: DataExport): void {
  if (data.predictions?.length) {
    localStorageAdapter.set('opencode_prediction_store', data.predictions);
    logInfo('Sync', `Imported ${data.predictions.length} prediction records`);
  }
  if (data.mlModels && Object.keys(data.mlModels).length > 0) {
    localStorageAdapter.set('opencode_ml_models', data.mlModels);
    logInfo('Sync', `Imported ${Object.keys(data.mlModels).length} ML models`);
  }
}
