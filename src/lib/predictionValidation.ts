import { getSupabase, getServiceClient } from './supabase';
import { logInfo, logError } from './errorTracker';
import type { StoredPrediction } from './predictionStore';

/** Server-only Supabase client for validation queries (avoids browser CORS). */
function getValidationClient() {
  if (typeof window !== 'undefined') return null;
  return getServiceClient() || getSupabase();
}

// === Persistent prediction validation engine ===
// Stores every prediction to Supabase, validates on resolution,
// computes rolling statistics, and preserves experience across restarts.

export interface ValidationRecord {
  id: string;
  ticker: string;
  name?: string;
  source: string;
  predictionType: string;
  direction: string;
  bullishProb: number;
  bearishProb: number;
  confidence: number;
  trustScore: number;
  uncertaintyScore: number;
  entryPrice: number;
  targetPrice?: number;
  stopLoss?: number;
  expectedVolatility: number;
  marketCondition: string;
  regime: string;
  sentimentScore: number;
  macroEventContext?: string;
  taSnapshot?: unknown;
  createdAt: number;
  expiryDate?: number;
  resolved: boolean;
  resolvedAt?: number;
  actualPrice?: number;
  result?: string;
  accuracyPercent?: number;
  deviationPercent?: number;
  timeToValidation?: number;
  simulatedPnl?: number;
}

export interface RollingStats {
  totalPredictions: number;
  resolvedPredictions: number;
  winRate: number;
  avgConfidence: number;
  avgAccuracy: number;
  sharpeRatio: number;
  maxDrawdown: number;
  profitFactor: number;
  precision: number;
  recall: number;
  f1Score: number;
  avgPnl: number;
  totalPnl: number;
}

let _initialized = false;

export async function ensureTables(): Promise<boolean> {
  if (typeof window !== 'undefined') return false;
  if (_initialized) return true;
  const supabase = getSupabase();
  if (!supabase) return false;
  try {
    const { error } = await (supabase as any).from('prediction_history').select('id').limit(1);
    if (error && (error.code === '42P01' || error.message?.includes('Could not find the table'))) {
      logInfo('Validation', 'Tables not found — run supabase migration SQL');
      return false;
    }
    _initialized = true;
    return true;
  } catch {
    return false;
  }
}

export async function storePrediction(pred: StoredPrediction): Promise<boolean> {
  if (!(await ensureTables())) return false;
  const supabase = getSupabase();
  if (!supabase) return false;
  try {
    const simulatedPnl = pred.actualPrice && pred.entryPrice
      ? ((pred.actualPrice - pred.entryPrice) / pred.entryPrice) * 100
      : undefined;
    const timeToValidation = pred.resolvedAt && pred.createdAt
      ? pred.resolvedAt - pred.createdAt
      : undefined;
    const record: Record<string, unknown> = {
      id: pred.id,
      ticker: pred.ticker,
      name: pred.name,
      source: pred.source,
      prediction_type: pred.predictionType,
      direction: pred.direction,
      bullish_prob: pred.bullishProb,
      bearish_prob: pred.bearishProb,
      confidence: pred.confidence,
      trust_score: 50,
      uncertainty_score: Math.max(0, 100 - pred.confidence),
      entry_price: pred.entryPrice,
      target_price: pred.targetPrice,
      stop_loss: pred.stopLoss,
      expected_volatility: pred.expectedVolatility,
      market_condition: pred.marketCondition,
      regime: pred.regime,
      sentiment_score: pred.sentimentScore,
      ta_snapshot: pred.fullSnapshot || undefined,
      created_at: pred.createdAt,
      expiry_date: pred.expiryDate ? new Date(pred.expiryDate).getTime() : undefined,
      resolved: pred.resolved,
      resolved_at: pred.resolvedAt,
      actual_price: pred.actualPrice,
      result: pred.result,
      accuracy_percent: pred.accuracyPercent,
      deviation_percent: pred.deviationPercent,
      simulated_pnl: simulatedPnl,
      time_to_validation: timeToValidation,
      reasoning: JSON.stringify(pred.reasoning || []),
    };

    const { error } = await (supabase as any).from('prediction_history').upsert(record, { onConflict: 'id' });
    if (error) {
      logError('Validation', 'Failed to store prediction', error);
      return false;
    }
    return true;
  } catch (e) {
    logError('Validation', 'Store error', e);
    return false;
  }
}

export async function storePredictions(preds: StoredPrediction[]): Promise<number> {
  if (!preds.length || !(await ensureTables())) return 0;
  let stored = 0;
  for (const p of preds) {
    if (await storePrediction(p)) stored++;
  }
  return stored;
}

export async function resolvePrediction(
  predId: string,
  actualPrice: number,
  result: string,
  accuracyPercent: number,
  deviationPercent: number,
  simulatedPnl: number,
): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  try {
    const { error } = await (supabase as any)
      .from('prediction_history')
      .update({
        resolved: true,
        resolved_at: Date.now(),
        actual_price: actualPrice,
        result,
        accuracy_percent: accuracyPercent,
        deviation_percent: deviationPercent,
        simulated_pnl: simulatedPnl,
        time_to_validation: Date.now() - (await getPredictionCreatedAt(predId)),
      } as Record<string, unknown>)
      .eq('id', predId);
    if (error) {
      logError('Validation', 'Resolve error', error);
      return false;
    }
    return true;
  } catch (e) {
    logError('Validation', 'Resolve exception', e);
    return false;
  }
}

async function getPredictionCreatedAt(predId: string): Promise<number> {
  const supabase = getSupabase();
  if (!supabase) return Date.now();
  try {
    const { data } = await supabase
      .from('prediction_history')
      .select('created_at')
      .eq('id', predId)
      .single();
    return (data as { created_at: number } | null)?.created_at ?? Date.now();
  } catch {
    return Date.now();
  }
}

// === Rolling Statistics ===
export async function getRollingStats(ticker?: string, days = 90): Promise<RollingStats> {
  const supabase = getValidationClient();
  if (!supabase) {
    return {
      totalPredictions: 0, resolvedPredictions: 0, winRate: 0,
      avgConfidence: 0, avgAccuracy: 0, sharpeRatio: 0, maxDrawdown: 0,
      profitFactor: 0, precision: 0, recall: 0, f1Score: 0, avgPnl: 0, totalPnl: 0,
    };
  }

  try {
    const cutoff = Date.now() - days * 86400000;
    let query = (supabase as any)
      .from('prediction_history')
      .select('*')
      .gte('created_at', cutoff)
      .order('created_at', { ascending: true });

    if (ticker) query = query.eq('ticker', ticker);
    const { data } = await query;
    if (!data || !data.length) return emptyStats();

    const records = data as unknown as ValidationRecord[];
    const resolved = records.filter(r => r.resolved && r.result);
    const total = records.length;
    const resolvedCount = resolved.length;

    if (!resolvedCount) return emptyStats();

    const correct = resolved.filter(r => r.result === 'CORRECT');
    const wrong = resolved.filter(r => r.result === 'WRONG');
    const partial = resolved.filter(r => r.result === 'PARTIAL');

    // Win rate (correct + partial as wins)
    const winRate = ((correct.length + partial.length) / resolvedCount) * 100;

    // Confidence & accuracy
    const avgConfidence = resolved.reduce((s, r) => s + r.confidence, 0) / resolvedCount;
    const avgAccuracy = resolved.reduce((s, r) => s + (r.accuracyPercent || 0), 0) / resolvedCount;

    // PnL
    const totalPnl = resolved.reduce((s, r) => s + (r.simulatedPnl || 0), 0);
    const avgPnl = totalPnl / resolvedCount;

    // Sharpe ratio (from individual PnLs)
    const pnlReturns = resolved.map(r => r.simulatedPnl || 0);
    const meanReturn = pnlReturns.reduce((s, v) => s + v, 0) / pnlReturns.length;
    const stdReturn = pnlReturns.length > 1
      ? Math.sqrt(pnlReturns.reduce((s, v) => s + (v - meanReturn) ** 2, 0) / (pnlReturns.length - 1))
      : 1;
    const sharpeRatio = stdReturn > 0 ? (meanReturn / stdReturn) * Math.sqrt(252) : 0;

    // Max drawdown (from cumulative PnL)
    let cumPnl = 0;
    let peak = 0;
    let maxDrawdown = 0;
    for (const r of resolved) {
      cumPnl += r.simulatedPnl || 0;
      if (cumPnl > peak) peak = cumPnl;
      const dd = peak > 0 ? (peak - cumPnl) / peak : 0;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }

    // Profit factor
    const grossProfit = resolved.filter(r => (r.simulatedPnl || 0) > 0).reduce((s, r) => s + (r.simulatedPnl || 0), 0);
    const grossLoss = Math.abs(resolved.filter(r => (r.simulatedPnl || 0) < 0).reduce((s, r) => s + (r.simulatedPnl || 0), 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;

    // Precision/Recall/F1
    const truePositives = correct.filter(r => r.direction === 'BULLISH').length;
    const falsePositives = wrong.filter(r => r.direction === 'BULLISH').length;
    const falseNegatives = wrong.filter(r => r.direction === 'BEARISH').length;
    const precision = (truePositives + falsePositives) > 0
      ? truePositives / (truePositives + falsePositives) * 100 : 0;
    const recall = (truePositives + falseNegatives) > 0
      ? truePositives / (truePositives + falseNegatives) * 100 : 0;
    const f1Score = (precision + recall) > 0
      ? 2 * (precision * recall) / (precision + recall) : 0;

    return {
      totalPredictions: total,
      resolvedPredictions: resolvedCount,
      winRate: parseFloat(winRate.toFixed(1)),
      avgConfidence: parseFloat(avgConfidence.toFixed(1)),
      avgAccuracy: parseFloat(avgAccuracy.toFixed(1)),
      sharpeRatio: parseFloat(sharpeRatio.toFixed(2)),
      maxDrawdown: parseFloat((maxDrawdown * 100).toFixed(2)),
      profitFactor: parseFloat(profitFactor.toFixed(2)),
      precision: parseFloat(precision.toFixed(1)),
      recall: parseFloat(recall.toFixed(1)),
      f1Score: parseFloat(f1Score.toFixed(1)),
      avgPnl: parseFloat(avgPnl.toFixed(2)),
      totalPnl: parseFloat(totalPnl.toFixed(2)),
    };
  } catch {
    return emptyStats();
  }
}

function emptyStats(): RollingStats {
  return {
    totalPredictions: 0, resolvedPredictions: 0, winRate: 0,
    avgConfidence: 0, avgAccuracy: 0, sharpeRatio: 0, maxDrawdown: 0,
    profitFactor: 0, precision: 0, recall: 0, f1Score: 0, avgPnl: 0, totalPnl: 0,
  };
}

// === Regime-specific accuracy ===
export async function getRegimeAccuracy(days = 90): Promise<Record<string, { total: number; correct: number; accuracy: number }>> {
  const supabase = getValidationClient();
  if (!supabase) return {};
  try {
    const cutoff = Date.now() - days * 86400000;
    const { data } = await (supabase as any)
      .from('prediction_history')
      .select('regime, result')
      .gte('created_at', cutoff)
      .not('result', 'is', null);
    if (!data) return {};

    const records = data as unknown as { regime: string; result: string }[];
    const acc: Record<string, { total: number; correct: number; accuracy: number }> = {};
    for (const r of records) {
      if (!r.regime) continue;
      if (!acc[r.regime]) acc[r.regime] = { total: 0, correct: 0, accuracy: 0 };
      acc[r.regime].total++;
      if (r.result === 'CORRECT') acc[r.regime].correct++;
    }
    for (const [k, v] of Object.entries(acc)) {
      v.accuracy = v.total > 0 ? parseFloat(((v.correct / v.total) * 100).toFixed(1)) : 0;
    }
    return acc;
  } catch {
    return {};
  }
}

// === Strategy performance ===
export async function getStrategyPerformance(
  ticker: string,
): Promise<{ accuracy: number; avgReturn: number; sharpe: number; drawdown: number; trend: string }> {
  const supabase = getSupabase();
  if (!supabase) return { accuracy: 0, avgReturn: 0, sharpe: 0, drawdown: 0, trend: 'STABLE' };
  try {
    const { data } = await (supabase as any)
      .from('strategy_performance')
      .select('*')
      .eq('ticker', ticker)
      .single();
    if (!data) return { accuracy: 0, avgReturn: 0, sharpe: 0, drawdown: 0, trend: 'STABLE' };
    const r = data as { accuracy: number; avg_return: number; sharpe_ratio: number; max_drawdown: number; trend: string };
    return {
      accuracy: r.accuracy || 0,
      avgReturn: r.avg_return || 0,
      sharpe: r.sharpe_ratio || 0,
      drawdown: r.max_drawdown || 0,
      trend: r.trend || 'STABLE',
    };
  } catch {
    return { accuracy: 0, avgReturn: 0, sharpe: 0, drawdown: 0, trend: 'STABLE' };
  }
}

// === Fetch all resolved predictions for experience replay ===
export async function getResolvedPredictionsFromDB(days = 365): Promise<ValidationRecord[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  try {
    const cutoff = Date.now() - days * 86400000;
    const { data } = await (supabase as any)
      .from('prediction_history')
      .select('*')
      .eq('resolved', true)
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(1000);
    return (data as unknown as ValidationRecord[]) || [];
  } catch {
    return [];
  }
}

// === Log engine health event ===
export async function logEngineHealth(
  eventType: string,
  eventData: Record<string, unknown> = {},
  memoryMb?: number,
  uptimeSeconds?: number,
): Promise<void> {
  const supabase = getServiceClient() || getSupabase();
  if (!supabase) return;
  try {
    await (supabase as any).from('engine_health_log').insert({
      event_type: eventType,
      event_data: eventData,
      memory_mb: memoryMb ?? null,
      uptime_seconds: uptimeSeconds ?? null,
    });
  } catch { /* non-critical */ }
}
