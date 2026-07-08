import { logInfo, logError } from './errorTracker';
import { markCloudUnreachable } from './dataSync';
import { getSessionCookie } from './sessionManager';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

let _syncStatus: SyncStatus = 'idle';
let _listeners: ((s: SyncStatus) => void)[] = [];
let _lastSyncTime = 0;

export function getSyncStatus(): SyncStatus { return _syncStatus; }
export function getLastSyncTime(): number { return _lastSyncTime; }

export function onSyncStatusChange(fn: (s: SyncStatus) => void): () => void {
  _listeners.push(fn);
  return () => { _listeners = _listeners.filter(l => l !== fn); };
}

function setStatus(s: SyncStatus) {
  _syncStatus = s;
  _listeners.forEach(fn => fn(s));
}

function canSync(): boolean {
  if (typeof window === 'undefined') return false;
  const session = getSessionCookie();
  if (!session?.email || session.expiresAt <= Date.now()) return false;
  return session.role === 'admin';
}

// Push all local data stores to Supabase via server API
export async function pushAllToSupabase(): Promise<void> {
  if (typeof window === 'undefined' || !canSync()) return;
  setStatus('syncing');
  try {
    const body: Record<string, unknown> = {};

    const predRaw = localStorage.getItem('opencode_prediction_store');
    if (predRaw) {
      const predictions = JSON.parse(predRaw);
      if (Array.isArray(predictions) && predictions.length > 0) {
        body.predictions = predictions;
      }
    }

    const modelsRaw = localStorage.getItem('opencode_ml_models');
    if (modelsRaw) {
      const models = JSON.parse(modelsRaw);
      const entries = Object.entries(models as Record<string, unknown>);
      if (entries.length > 0) {
        body.ml_models = models;
      }
    }

    const expRaw = localStorage.getItem('ai-experience-engine');
    if (expRaw) {
      const records = JSON.parse(expRaw);
      if (Array.isArray(records) && records.length > 0) {
        body.experience = records;
      }
    }

    if (!body.predictions && !body.ml_models && !body.experience) {
      _lastSyncTime = Date.now();
      setStatus('synced');
      return;
    }

    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      if (res.status === 401) {
        setStatus('idle');
        return;
      }
      const errBody = await res.json().catch(() => ({}));
      if (res.status === 500) {
        markCloudUnreachable();
        logError('Sync', 'Supabase not configured or unreachable on server');
      } else {
        logError('Sync', `Supabase push failed (${res.status})`, errBody);
      }
      setStatus('error');
      return;
    }

    const result = await res.json();
    if (result.status === 'partial' && Array.isArray(result.errors)) {
      const msg = result.errors.join('; ');
      if (/fetch failed|ECONNREFUSED|ENOTFOUND|Invalid API key/i.test(msg)) {
        markCloudUnreachable();
        // Silently use localStorage if API key is invalid or unreachable
      } else {
        logError('Sync', 'Supabase push completed with errors', msg);
      }
      setStatus('error');
    } else {
      logInfo('Sync', 'Supabase push completed successfully');
      _lastSyncTime = Date.now();
      setStatus('synced');
    }
  } catch (e) {
    logError('Sync', 'Supabase push failed', e);
    setStatus('error');
  }
}

// Pull data from Supabase into localStorage (for fresh devices)
export async function pullFromSupabase(): Promise<void> {
  if (typeof window === 'undefined' || !canSync()) return;
  setStatus('syncing');
  try {
    const existingPreds = localStorage.getItem('opencode_prediction_store');
    const existingModels = localStorage.getItem('opencode_ml_models');
    const existingExp = localStorage.getItem('ai-experience-engine');

    const sections: string[] = [];
    if (!existingPreds || JSON.parse(existingPreds).length === 0) sections.push('predictions');
    const parsedExisting = JSON.parse(existingModels || '{}');
    if (!existingModels || Object.keys(parsedExisting).length === 0) sections.push('ml_models');
    if (!existingExp || JSON.parse(existingExp).length === 0) sections.push('experience');

    if (sections.length === 0) {
      _lastSyncTime = Date.now();
      setStatus('synced');
      return;
    }

    const res = await fetch(`/api/sync?section=${sections.join(',')}`, { credentials: 'include' });
    if (!res.ok) {
      if (res.status === 401) {
        setStatus('idle');
        return;
      }
      if (res.status === 500) {
        logError('Sync', 'Supabase not configured (missing SUPABASE_SERVICE_KEY)');
      } else {
        logError('Sync', `Supabase pull failed (${res.status})`);
      }
      setStatus('error');
      return;
    }

    const result = await res.json();

    if (result.predictions && Array.isArray(result.predictions)) {
      const mapped = result.predictions.map((r: Record<string, unknown>) => ({
        id: r.id as string,
        ticker: r.ticker as string,
        direction: r.direction as string,
        confidence: (r.confidence as number) || 30,
        entryPrice: (r.entry_price as number) || 0,
        targetPrice: (r.target_price as number) || 0,
        stopLoss: (r.stop_loss as number) || null,
        result: (r.result as string) || null,
        resolved: (r.resolved as boolean) || false,
        resolvedAt: (r.resolved_at as number) || null,
        createdAt: (r.created_at as number) || Date.now(),
        accuracyPercent: (r.accuracy_percent as number) || null,
        deviationPercent: (r.deviation_percent as number) || null,
        failureAnalysis: r.failure_analysis ? JSON.parse(r.failure_analysis as string) : null,
        reasoning: Array.isArray(r.reasoning) ? r.reasoning : [],
      }));
      localStorage.setItem('opencode_prediction_store', JSON.stringify(mapped));
      logInfo('Sync', `Pulled ${mapped.length} predictions from Supabase`);
    }

    if (result.ml_models && Array.isArray(result.ml_models)) {
      const models: Record<string, unknown> = {};
      for (const row of result.ml_models) {
        models[row.ticker as string] = {
          ticker: row.ticker,
          weights: JSON.parse(row.weights as string),
          mean: JSON.parse(row.mean as string),
          std: JSON.parse(row.std as string),
          plattA: row.platt_a,
          plattB: row.platt_b,
          forwardDays: row.forward_days,
          accuracy: row.accuracy,
          totalSamples: row.total_samples,
          trainedAt: row.trained_at,
        };
      }
      localStorage.setItem('opencode_ml_models', JSON.stringify(models));
      logInfo('Sync', `Pulled ${result.ml_models.length} ML models from Supabase`);
    }

    if (result.experience && Array.isArray(result.experience)) {
      const mapped = result.experience.map((r: Record<string, unknown>) => {
        const resultStr = String(r.result ?? 'UNKNOWN');
        const acc = (r.accuracy_percent as number) ?? 0;
        return {
          ticker: String(r.ticker ?? ''),
          predictionId: String(r.prediction_id ?? r.id ?? ''),
          direction: (r.direction as 'BULLISH' | 'BEARISH' | 'NEUTRAL') || 'NEUTRAL',
          result: (resultStr === 'CORRECT' || resultStr === 'WRONG' || resultStr === 'PARTIAL'
            ? resultStr
            : acc >= 60 ? 'CORRECT' : acc >= 35 ? 'PARTIAL' : 'WRONG') as 'CORRECT' | 'WRONG' | 'PARTIAL',
          accuracyPercent: acc,
          deviationPercent: (r.deviation_percent as number) ?? 0,
          confidence: (r.confidence as number) ?? 30,
          regime: String(r.regime ?? ''),
          dayOfWeek: new Date((r.resolved_at as number) || Date.now()).getDay(),
          sessionLabel: 'SYNCED',
          rsi: 50,
          adx: 20,
          macdHistogram: 0,
          createdAt: (r.created_at as number) || Date.now(),
          resolvedAt: (r.resolved_at as number) || Date.now(),
          pctChange: (r.deviation_percent as number) ?? 0,
        };
      });
      if (mapped.length > 0) {
        localStorage.setItem('ai-experience-engine', JSON.stringify(mapped));
        logInfo('Sync', `Pulled ${mapped.length} experience records from Supabase`);
      }
    }

    _lastSyncTime = Date.now();
    setStatus('synced');
  } catch (e) {
    logError('Sync', 'Supabase pull failed', e);
    setStatus('error');
  }
}

// Full sync: push first, then pull if local is empty
export async function fullSync(): Promise<void> {
  if (typeof window === 'undefined') return;
  setStatus('syncing');
  await pushAllToSupabase();
  await pullFromSupabase();
  _lastSyncTime = Date.now();
  setStatus('synced');
}
