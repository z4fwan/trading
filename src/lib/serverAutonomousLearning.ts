/**
 * 24/7 autonomous learning — runs inside the background engine (no browser).
 * Validates predictions, builds experience in Supabase, evolves weights, logs health.
 */

import { getServiceClient } from './supabase';
import { getEngineState, markSelfAwareness } from './engineState';
import { fetchQuotesFromYahoo } from './quoteFetcher';
import { logEngineHealth } from './predictionValidation';
import type { IndicatorWeightSet } from './ai/types';

const SERVER_WEIGHTS_KEY = '__quantumServerIndicatorWeights';
/** Time before a DAILY prediction is judged on expiry (target/stop can resolve sooner). */
const DAILY_HOLD_MS = 24 * 60 * 60 * 1000;
const MAX_RESOLVE_BATCH = 40;

type OpenPrediction = {
  id: string;
  ticker: string;
  direction: string;
  confidence: number;
  entry_price: number;
  target_price: number | null;
  stop_loss: number | null;
  created_at: number;
  regime: string | null;
};

export interface AutonomousCycleResult {
  resolved: number;
  experienceAdded: number;
  weightsAdjusted: number;
  overallAccuracy: number;
  totalExperience: number;
}

function getServerWeights(): IndicatorWeightSet {
  const g = globalThis as Record<string, unknown>;
  if (!g[SERVER_WEIGHTS_KEY]) {
    g[SERVER_WEIGHTS_KEY] = {
      weights: {
        rsi: 1, macd: 1, adx: 1, bollinger: 1, atr: 1, supertrend: 1,
        stochRsi: 1, ema: 1, volume: 1, vwap: 1, support: 1, resistance: 1,
      },
      defaultWeight: 1,
      lastUpdated: Date.now(),
      totalSamples: 0,
    } satisfies IndicatorWeightSet;
  }
  return g[SERVER_WEIGHTS_KEY] as IndicatorWeightSet;
}

function setServerWeights(ws: IndicatorWeightSet): void {
  (globalThis as Record<string, unknown>)[SERVER_WEIGHTS_KEY] = ws;
}

export async function hydrateServerKnowledgeFromCloud(): Promise<void> {
  const svc = getServiceClient();
  if (!svc) return;
  try {
    const { data } = await (svc as any)
      .from('indicator_weights')
      .select('weights, default_weight, total_samples, updated_at')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data?.weights) return;
    setServerWeights({
      weights: data.weights as Record<string, number>,
      defaultWeight: data.default_weight ?? 1,
      totalSamples: data.total_samples ?? 0,
      lastUpdated: data.updated_at ?? Date.now(),
    });
  } catch { /* cloud optional */ }
}

async function persistServerWeights(ws: IndicatorWeightSet): Promise<void> {
  const svc = getServiceClient();
  if (!svc) return;
  const row = {
    weights: ws.weights,
    default_weight: ws.defaultWeight,
    total_samples: ws.totalSamples,
    updated_at: ws.lastUpdated,
  };
  try {
    await (svc as any).from('indicator_weights').insert(row);
    await (svc as any).from('ai_evolution_logs').insert({
      weights: ws.weights,
      default_weight: ws.defaultWeight,
      total_samples: ws.totalSamples,
      recorded_at: ws.lastUpdated,
    });
  } catch { /* tables may not exist */ }
}

function parsePricesFromEngine(): Record<string, number> {
  const prices: Record<string, number> = {};
  const raw = getEngineState().quotesPayload;
  if (raw) {
    try {
      const data = JSON.parse(raw) as { stocks?: Record<string, { price?: number }>; indices?: Record<string, { price?: number }> };
      for (const [sym, q] of Object.entries(data.stocks || {})) {
        if (q?.price && q.price > 0) prices[sym] = q.price;
      }
      for (const [sym, q] of Object.entries(data.indices || {})) {
        if (q?.price && q.price > 0) prices[sym] = q.price;
      }
    } catch { /* ignore */ }
  }
  return prices;
}

function judgeOutcome(
  pred: OpenPrediction,
  price: number,
): { result: 'CORRECT' | 'WRONG' | 'PARTIAL'; accuracy: number; deviation: number; pnl: number } | null {
  if (!pred.entry_price || pred.entry_price <= 0) return null;
  const pnl = ((price - pred.entry_price) / pred.entry_price) * 100;
  const deviation = Math.abs(pnl);
  const target = pred.target_price;
  const stop = pred.stop_loss;
  const dir = pred.direction;

  if (target && stop) {
    if (dir === 'BULLISH') {
      if (price >= target) return { result: 'CORRECT', accuracy: 85, deviation, pnl };
      if (price <= stop) return { result: 'WRONG', accuracy: 15, deviation, pnl };
    } else if (dir === 'BEARISH') {
      if (price <= target) return { result: 'CORRECT', accuracy: 85, deviation, pnl };
      if (price >= stop) return { result: 'WRONG', accuracy: 15, deviation, pnl };
    }
  }

  const expired = Date.now() - pred.created_at >= DAILY_HOLD_MS;
  if (!expired) return null;

  if (dir === 'BULLISH') {
    if (pnl > 0.5) return { result: 'CORRECT', accuracy: 70, deviation, pnl };
    if (pnl < -0.5) return { result: 'WRONG', accuracy: 25, deviation, pnl };
    return { result: 'PARTIAL', accuracy: 50, deviation, pnl };
  }
  if (dir === 'BEARISH') {
    if (pnl < -0.5) return { result: 'CORRECT', accuracy: 70, deviation, pnl };
    if (pnl > 0.5) return { result: 'WRONG', accuracy: 25, deviation, pnl };
    return { result: 'PARTIAL', accuracy: 50, deviation, pnl };
  }
  if (Math.abs(pnl) < 0.3) return { result: 'PARTIAL', accuracy: 50, deviation, pnl };
  return { result: 'WRONG', accuracy: 30, deviation, pnl };
}

async function fetchOpenPredictions(svc: ReturnType<typeof getServiceClient>): Promise<OpenPrediction[]> {
  if (!svc) return [];
  const cols = 'id, ticker, direction, confidence, entry_price, target_price, stop_loss, created_at, regime';
  const { data: hist } = await (svc as any)
    .from('prediction_history')
    .select(cols)
    .eq('resolved', false)
    .order('created_at', { ascending: true })
    .limit(MAX_RESOLVE_BATCH);
  if (hist?.length) return hist as OpenPrediction[];
  const { data: legacy } = await (svc as any)
    .from('predictions')
    .select(cols)
    .eq('resolved', false)
    .order('created_at', { ascending: true })
    .limit(MAX_RESOLVE_BATCH);
  return (legacy || []) as OpenPrediction[];
}

async function resolveOpenPredictions(prices: Record<string, number>): Promise<number> {
  const svc = getServiceClient();
  if (!svc) return 0;

  const data = await fetchOpenPredictions(svc);
  if (!data.length) return 0;

  let resolved = 0;
  for (const row of data) {
    const price = prices[row.ticker];
    if (!price || price <= 0) continue;
    const outcome = judgeOutcome(row, price);
    if (!outcome) continue;

    const patch = {
      resolved: true,
      resolved_at: Date.now(),
      actual_price: price,
      result: outcome.result,
      accuracy_percent: outcome.accuracy,
      deviation_percent: outcome.deviation,
      simulated_pnl: outcome.pnl,
      time_to_validation: Date.now() - row.created_at,
    };

    let ok = false;
    const { error: e1 } = await (svc as any).from('prediction_history').update(patch).eq('id', row.id);
    if (!e1) ok = true;
    else {
      const { error: e2 } = await (svc as any).from('predictions').update(patch).eq('id', row.id);
      if (!e2) ok = true;
    }
    if (ok) resolved++;
  }
  return resolved;
}

async function ingestExperienceRecords(): Promise<number> {
  const svc = getServiceClient();
  if (!svc) return 0;

  const { data: resolved } = await (svc as any)
    .from('prediction_history')
    .select('id, ticker, direction, result, accuracy_percent, deviation_percent, confidence, regime, entry_price, actual_price, created_at, resolved_at')
    .eq('resolved', true)
    .order('resolved_at', { ascending: false })
    .limit(80);

  if (!resolved?.length) return 0;

  const ids = resolved.map((r: { id: string }) => r.id);
  const { data: existing } = await (svc as any)
    .from('experience_history')
    .select('prediction_id')
    .in('prediction_id', ids);

  const seen = new Set((existing || []).map((e: { prediction_id: string }) => e.prediction_id));
  const toInsert: Record<string, unknown>[] = [];

  for (const r of resolved) {
    if (seen.has(r.id)) continue;
    const entry = r.entry_price || 0;
    const actual = r.actual_price || entry;
    const pctChange = entry > 0 ? ((actual - entry) / entry) * 100 : 0;
    toInsert.push({
      prediction_id: r.id,
      ticker: r.ticker,
      direction: r.direction,
      result: r.result,
      accuracy_percent: r.accuracy_percent,
      deviation_percent: r.deviation_percent,
      confidence: r.confidence,
      regime: r.regime || 'UNKNOWN',
      day_of_week: new Date(r.created_at).getDay(),
      session_label: 'SERVER',
      pct_change: pctChange,
      created_at: r.created_at,
      resolved_at: r.resolved_at || Date.now(),
    });
  }

  if (!toInsert.length) return 0;
  const { error } = await (svc as any).from('experience_history').insert(toInsert);
  return error ? 0 : toInsert.length;
}

async function updateStrategyPerformance(): Promise<void> {
  const svc = getServiceClient();
  if (!svc) return;

  const { data } = await (svc as any)
    .from('experience_history')
    .select('ticker, result, accuracy_percent, confidence, pct_change, regime')
    .order('resolved_at', { ascending: false })
    .limit(500);

  if (!data?.length) return;

  const byTicker: Record<string, { total: number; correct: number; partial: number; wrong: number; conf: number; ret: number }> = {};
  for (const row of data) {
    const t = row.ticker as string;
    if (!byTicker[t]) byTicker[t] = { total: 0, correct: 0, partial: 0, wrong: 0, conf: 0, ret: 0 };
    const b = byTicker[t];
    b.total++;
    b.conf += row.confidence || 0;
    b.ret += row.pct_change || 0;
    if (row.result === 'CORRECT') b.correct++;
    else if (row.result === 'PARTIAL') b.partial++;
    else b.wrong++;
  }

  const rows = Object.entries(byTicker).map(([ticker, s]) => ({
    ticker,
    total_predictions: s.total,
    correct: s.correct,
    partial: s.partial,
    wrong: s.wrong,
    accuracy: ((s.correct + s.partial * 0.5) / s.total) * 100,
    avg_return: s.ret / s.total,
    avg_confidence: s.conf / s.total,
    updated_at: Date.now(),
  }));

  await (svc as any).from('strategy_performance').upsert(rows, { onConflict: 'ticker' });
}

async function evolveWeightsFromDb(): Promise<number> {
  const svc = getServiceClient();
  if (!svc) return 0;

  const { data } = await (svc as any)
    .from('experience_history')
    .select('result, rsi, adx, confidence')
    .order('resolved_at', { ascending: false })
    .limit(300);

  if (!data || data.length < 5) return 0;

  const ws = getServerWeights();
  let adjusted = 0;
  const indicatorHits: Record<string, { correct: number; wrong: number }> = {};

  for (const row of data) {
    const ok = row.result === 'CORRECT' || row.result === 'PARTIAL';
    const rsi = row.rsi as number | null;
    const adx = row.adx as number | null;
    if (rsi != null && (rsi > 70 || rsi < 30)) {
      if (!indicatorHits.rsi) indicatorHits.rsi = { correct: 0, wrong: 0 };
      if (ok) indicatorHits.rsi.correct++;
      else indicatorHits.rsi.wrong++;
    }
    if (adx != null && adx > 25) {
      if (!indicatorHits.adx) indicatorHits.adx = { correct: 0, wrong: 0 };
      if (ok) indicatorHits.adx.correct++;
      else indicatorHits.adx.wrong++;
    }
  }

  for (const [ind, hits] of Object.entries(indicatorHits)) {
    if (hits.correct + hits.wrong < 3) continue;
    const acc = (hits.correct / (hits.correct + hits.wrong)) * 100;
    const delta = acc >= 60 ? 1 : acc <= 40 ? -1 : 0;
    if (delta !== 0) {
      const cur = ws.weights[ind] ?? ws.defaultWeight;
      ws.weights[ind] = Math.max(0.1, Math.min(3, cur + delta * 0.05));
      ws.totalSamples++;
      adjusted++;
    }
  }

  if (adjusted > 0) {
    ws.lastUpdated = Date.now();
    setServerWeights(ws);
    await persistServerWeights(ws);
  }
  return adjusted;
}

async function saveKnowledgeSnapshot(overallAccuracy: number, totalExp: number): Promise<void> {
  const svc = getServiceClient();
  if (!svc) return;
  const ws = getServerWeights();
  const engine = getEngineState();
  const daysActive = engine.startedAt
    ? Math.max(1, Math.floor((Date.now() - engine.startedAt) / 86400000))
    : 1;

  try {
    await (svc as any).from('ai_knowledge_snapshots').insert({
      total_predictions_analyzed: totalExp,
      total_resolved_predictions: totalExp,
      overall_accuracy: overallAccuracy,
      learning_progress: overallAccuracy >= 55 ? 'IMPROVING' : 'ACCUMULATING',
      days_active: daysActive,
      snapshot_data: {
        weights: ws.weights,
        totalSamples: ws.totalSamples,
        newsCycles: engine.cycleCounters.news,
        mlCycles: engine.cycleCounters.ml,
        aiCycles: engine.cycleCounters.ai,
        macroActive: engine.macroShockActive,
      },
    });
  } catch { /* optional table */ }
}

async function computeSelfAwarenessFromDb(): Promise<{ accuracy: number; score: number; meta: number }> {
  const svc = getServiceClient();
  if (!svc) return { accuracy: 0, score: 0, meta: 0 };

  const { data } = await (svc as any)
    .from('experience_history')
    .select('result, confidence')
    .limit(500);

  if (!data?.length) return { accuracy: 0, score: 0, meta: 0 };

  const correct = data.filter((r: { result: string }) => r.result === 'CORRECT' || r.result === 'PARTIAL').length;
  const accuracy = (correct / data.length) * 100;
  const avgConf = data.reduce((s: number, r: { confidence: number }) => s + (r.confidence || 0), 0) / data.length;
  const gap = Math.abs(avgConf - accuracy);
  const score = Math.max(0, Math.min(100, accuracy - gap * 0.3));
  const meta = Math.max(0, Math.min(100, 100 - gap));

  return { accuracy, score, meta };
}

/** Full autonomous cycle — call from background engine on a timer. */
export async function runAutonomousLearningCycle(): Promise<AutonomousCycleResult> {
  await hydrateServerKnowledgeFromCloud();

  const prices = parsePricesFromEngine();
  if (Object.keys(prices).length < 10) {
    try {
      const q = await fetchQuotesFromYahoo();
      for (const [sym, row] of Object.entries(q.stocks)) {
        if (row.price > 0) prices[sym] = row.price;
      }
    } catch { /* use partial prices */ }
  }

  const resolved = await resolveOpenPredictions(prices);
  const experienceAdded = await ingestExperienceRecords();
  await updateStrategyPerformance();
  const weightsAdjusted = await evolveWeightsFromDb();

  const { accuracy, score, meta } = await computeSelfAwarenessFromDb();
  const svc = getServiceClient();
  let totalExperience = 0;
  if (svc) {
    const { count } = await (svc as any).from('experience_history').select('*', { count: 'exact', head: true });
    totalExperience = count ?? 0;
  }

  markSelfAwareness(accuracy, score, meta, 0, 0, accuracy >= 55 ? 'IMPROVING' : 'STABLE');

  const uptime = Math.round(process.uptime());
  await logEngineHealth('autonomous_cycle', {
    resolved,
    experienceAdded,
    weightsAdjusted,
    overallAccuracy: accuracy,
    totalExperience,
  }, getEngineState().memoryMB, uptime);

  await saveKnowledgeSnapshot(accuracy, totalExperience);

  return {
    resolved,
    experienceAdded,
    weightsAdjusted,
    overallAccuracy: accuracy,
    totalExperience,
  };
}

export function getServerKnowledgeWeights(): IndicatorWeightSet {
  return getServerWeights();
}
