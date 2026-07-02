import { getResolvedPredictions, getAllPredictions } from './predictionStore';
import { storePredictions, storePrediction, resolvePrediction } from './predictionValidation';
import { logInfo, logError } from './errorTracker';
import { getSupabase } from './supabase';

// Runs periodically in the background engine or on the client
// Syncs local prediction store to Supabase for permanent persistence

let _running = false;
let _lastSync = 0;
const SYNC_INTERVAL = 120000; // 2min

export async function syncPredictionsToCloud(): Promise<{ stored: number; resolved: number }> {
  if (typeof window !== 'undefined') return { stored: 0, resolved: 0 };
  if (_running) return { stored: 0, resolved: 0 };
  _running = true;
  try {
    const predictions = getAllPredictions();
    if (!predictions.length) return { stored: 0, resolved: 0 };

    const supabase = getSupabase();
    if (!supabase) return { stored: 0, resolved: 0 };

    // Check which predictions already exist in cloud
    let stored = 0, resolved = 0;

    // Batch predict: optimize with a single fetch
    const { data: existing } = await supabase
      .from('prediction_history')
      .select('id, resolved')
      .in('id', predictions.map(p => p.id).slice(0, 100));

    const existingMap = new Map<string, boolean>();
    if (existing) {
      for (const row of existing as unknown as { id: string; resolved: boolean }[]) {
        existingMap.set(row.id, row.resolved);
      }
    }

    // Store missing predictions
    const toStore = predictions.filter(p => !existingMap.has(p.id));
    if (toStore.length > 0) {
      stored = await storePredictions(toStore);
    }

    // Resolve predictions that are resolved locally but not in cloud
    const toResolve = predictions.filter(p =>
      p.resolved && existingMap.has(p.id) && !existingMap.get(p.id) &&
      p.actualPrice != null && p.result,
    );
    for (const p of toResolve) {
      const pnl = p.actualPrice && p.entryPrice
        ? ((p.actualPrice - p.entryPrice) / p.entryPrice) * 100 : 0;
      const ok = await resolvePrediction(
        p.id, p.actualPrice!, p.result!, p.accuracyPercent || 0, p.deviationPercent || 0, pnl,
      );
      if (ok) resolved++;
    }

    _lastSync = Date.now();
    if (stored > 0 || resolved > 0) {
      logInfo('Validation', `Synced ${stored} new, ${resolved} resolved predictions`);
    }
    return { stored, resolved };
  } catch (e) {
    logError('Validation', 'Sync failed', e);
    return { stored: 0, resolved: 0 };
  } finally {
    _running = false;
  }
}

// Validate local predictions against current market prices
export function validateLocalPredictions(
  stockPrices: Record<string, { price: number }>,
): number {
  const resolved = getResolvedPredictions();
  let count = 0;

  for (const pred of resolved) {
    if (pred.resolved && !pred.result) continue;
    if (!pred.actualPrice) continue;

    // Sync to cloud if not already synced (server-side only; browser uses /api/sync)
    if (typeof window === 'undefined') {
      storePrediction(pred).then(ok => { if (ok) count++; }).catch(() => {});
    }
  }

  return count;
}

export function getLastSyncTime(): number { return _lastSync; }
export function isSyncRunning(): boolean { return _running; }
