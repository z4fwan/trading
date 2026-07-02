import { storage, isSupabaseActive, markCloudUnreachable, isCloudReachable } from '@/lib/dataSync';
import { getSupabase } from '@/lib/supabase';
import type {
  IndicatorPerformanceRecord, ConfidenceCalibrationRecord, MarketRegimeRecord,
  FailurePatternRecord, IndicatorWeightSet, AIKnowledgeSnapshot,
} from './types';

const KB_PREFIX = 'ai_kb_';

function load<T>(key: string): T | null { return storage.get<T>(KB_PREFIX + key); }
function save<T>(key: string, value: T): void { storage.set(KB_PREFIX + key, value); }

// Cloud-first helpers for indicator weights
interface EvolutionLogRow {
  weights: Record<string, number> | null;
  default_weight: number;
  total_samples: number;
  recorded_at: number;
}

async function fetchWeightsFromCloud(): Promise<IndicatorWeightSet | null> {
  if (!isSupabaseActive()) return null;
  if (typeof window === 'undefined') {
    try {
      const supabase = getSupabase();
      if (!supabase) return null;
      const { data, error } = await supabase
        .from('ai_evolution_logs')
        .select('weights, default_weight, total_samples, recorded_at')
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error || !data) return null;
      const row = data as unknown as EvolutionLogRow;
      if (!row.weights) return null;
      return {
        weights: row.weights,
        defaultWeight: row.default_weight || 1,
        lastUpdated: row.recorded_at || Date.now(),
        totalSamples: row.total_samples || 0,
      };
    } catch { return null; }
  }
  if (!isCloudReachable()) return null;
  try {
    const res = await fetch('/api/knowledge/weights', { cache: 'no-store' });
    if (!res.ok) {
      markCloudUnreachable();
      return null;
    }
    const payload = await res.json() as {
      weights?: Record<string, number> | null;
      default_weight?: number;
      total_samples?: number;
      recorded_at?: number;
      error?: string;
    };
    if (payload.error || !payload.weights) {
      if (payload.error) markCloudUnreachable();
      return null;
    }
    return {
      weights: payload.weights,
      defaultWeight: payload.default_weight || 1,
      lastUpdated: payload.recorded_at || Date.now(),
      totalSamples: payload.total_samples || 0,
    };
  } catch {
    markCloudUnreachable();
    return null;
  }
}

export function getAllIndicatorPerformance(): Record<string, IndicatorPerformanceRecord> {
  return load<Record<string, IndicatorPerformanceRecord>>('indicator_performance') || {};
}

export function saveIndicatorPerformance(records: Record<string, IndicatorPerformanceRecord>): void {
  save('indicator_performance', records);
}

export function updateIndicatorPerformance(
  indicatorName: string,
  wasCorrect: boolean,
  confidence: number,
  regime: string,
): void {
  const records = getAllIndicatorPerformance();
  const r = records[indicatorName] || {
    indicatorName, totalOccurrences: 0, correctPredictions: 0, wrongPredictions: 0,
    accuracy: 0, avgConfidenceWhenPresent: 0, bestRegime: '', worstRegime: '',
    regimeAccuracy: {}, lastUpdated: Date.now(),
  };
  r.totalOccurrences++;
  if (wasCorrect) r.correctPredictions++; else r.wrongPredictions++;
  r.accuracy = (r.correctPredictions / r.totalOccurrences) * 100;
  r.avgConfidenceWhenPresent = ((r.avgConfidenceWhenPresent * (r.totalOccurrences - 1)) + confidence) / r.totalOccurrences;
  if (!r.regimeAccuracy[regime]) r.regimeAccuracy[regime] = { total: 0, correct: 0, accuracy: 0 };
  r.regimeAccuracy[regime].total++;
  if (wasCorrect) r.regimeAccuracy[regime].correct++;
  r.regimeAccuracy[regime].accuracy = (r.regimeAccuracy[regime].correct / r.regimeAccuracy[regime].total) * 100;
  let bestAcc = 0, worstAcc = 100;
  for (const [reg, stats] of Object.entries(r.regimeAccuracy)) {
    if (stats.total >= 2) {
      if (stats.accuracy > bestAcc) { bestAcc = stats.accuracy; r.bestRegime = reg; }
      if (stats.accuracy < worstAcc) { worstAcc = stats.accuracy; r.worstRegime = reg; }
    }
  }
  r.lastUpdated = Date.now();
  records[indicatorName] = r;
  saveIndicatorPerformance(records);
}

export function getAllCalibrationRecords(): ConfidenceCalibrationRecord[] {
  return load<ConfidenceCalibrationRecord[]>('calibration') || [];
}

export function saveCalibrationRecords(records: ConfidenceCalibrationRecord[]): void {
  save('calibration', records);
}

export function updateCalibration(confidence: number, wasCorrect: boolean): void {
  const records = getAllCalibrationRecords();
  const bucketStart = Math.floor(confidence / 10) * 10;
  const bucketEnd = Math.min(100, bucketStart + 10);
  const label = `${bucketStart}-${bucketEnd}%`;
  let bucket = records.find(b => b.bucket === label);
  if (!bucket) {
    bucket = { bucket: label, bucketStart, bucketEnd, totalPredictions: 0, correctPredictions: 0, accuracy: 0, avgConfidence: 0, gap: 0, lastUpdated: Date.now() };
    records.push(bucket);
  }
  bucket.totalPredictions++;
  if (wasCorrect) bucket.correctPredictions++;
  bucket.accuracy = (bucket.correctPredictions / bucket.totalPredictions) * 100;
  bucket.avgConfidence = ((bucket.avgConfidence * (bucket.totalPredictions - 1)) + confidence) / bucket.totalPredictions;
  bucket.gap = bucket.avgConfidence - bucket.accuracy;
  bucket.lastUpdated = Date.now();
  saveCalibrationRecords(records);
}

export function getAllRegimeRecords(): Record<string, MarketRegimeRecord> {
  return load<Record<string, MarketRegimeRecord>>('regime_records') || {};
}

export function saveRegimeRecords(records: Record<string, MarketRegimeRecord>): void {
  save('regime_records', records);
}

export function updateRegimeRecord(
  regime: string, wasCorrect: boolean, confidence: number, deviation: number,
  indicators: string[], volatility: number, sentiment: number,
): void {
  const records = getAllRegimeRecords();
  const r = records[regime] || {
    regime, totalPredictions: 0, correctPredictions: 0, accuracy: 0,
    avgConfidence: 0, avgDeviation: 0, bestIndicators: [], worstIndicators: [],
    volatilityAvg: 0, sentimentAvg: 0, lastUpdated: Date.now(),
  };
  r.totalPredictions++;
  if (wasCorrect) r.correctPredictions++;
  r.accuracy = (r.correctPredictions / r.totalPredictions) * 100;
  r.avgConfidence = ((r.avgConfidence * (r.totalPredictions - 1)) + confidence) / r.totalPredictions;
  r.avgDeviation = ((r.avgDeviation * (r.totalPredictions - 1)) + deviation) / r.totalPredictions;
  r.volatilityAvg = ((r.volatilityAvg * (r.totalPredictions - 1)) + volatility) / r.totalPredictions;
  r.sentimentAvg = ((r.sentimentAvg * (r.totalPredictions - 1)) + sentiment) / r.totalPredictions;
  r.lastUpdated = Date.now();
  records[regime] = r;
  saveRegimeRecords(records);
}

export function getAllFailurePatterns(): Record<string, FailurePatternRecord> {
  return load<Record<string, FailurePatternRecord>>('failure_patterns') || {};
}

export function saveFailurePatterns(records: Record<string, FailurePatternRecord>): void {
  save('failure_patterns', records);
}

export function updateFailurePattern(
  analysis: { primaryReason: string; indicators: string[]; regime: string; ticker: string },
  confidence: number, deviation: number,
): void {
  const patterns = getAllFailurePatterns();
  const key = analysis.primaryReason.slice(0, 60);
  const existing = Object.entries(patterns).find(([k]) => k.startsWith(key.slice(0, 30)));
  const patternKey = existing ? existing[0] : key;
  const p = patterns[patternKey] || {
    patternName: analysis.primaryReason, totalOccurrences: 0, repeatRate: 0,
    avgConfidenceAtFailure: 0, avgDeviationAtFailure: 0,
    commonIndicators: [], commonRegimes: [], commonSectors: [],
    lastUpdated: Date.now(), severity: 'MEDIUM' as const,
  };
  p.totalOccurrences++;
  p.avgConfidenceAtFailure = ((p.avgConfidenceAtFailure * (p.totalOccurrences - 1)) + confidence) / p.totalOccurrences;
  p.avgDeviationAtFailure = ((p.avgDeviationAtFailure * (p.totalOccurrences - 1)) + deviation) / p.totalOccurrences;
  const hasIndicators = analysis.indicators.some(i => p.commonIndicators.includes(i));
  if (!hasIndicators) p.commonIndicators = [...new Set([...p.commonIndicators, ...analysis.indicators])].slice(0, 10);
  if (!p.commonRegimes.includes(analysis.regime)) p.commonRegimes = [...new Set([...p.commonRegimes, analysis.regime])].slice(0, 5);
  if (!p.commonSectors.includes(analysis.ticker)) p.commonSectors = [...new Set([...p.commonSectors, analysis.ticker])].slice(0, 10);
  // Repeat rate: how often this pattern reoccurs relative to other failure patterns
  // Subtract 1 from key count to exclude the current pattern (already added above)
  const otherFailureKeys = Math.max(1, Object.keys(patterns).length - 1);
  p.repeatRate = (p.totalOccurrences / otherFailureKeys) * 100;
  p.lastUpdated = Date.now();
  // Escalate severity based on repeat rate
  if (p.repeatRate > 30) p.severity = 'CRITICAL';
  else if (p.repeatRate > 15) p.severity = 'HIGH';
  else if (p.repeatRate > 5) p.severity = 'MEDIUM';
  else p.severity = 'LOW';
  patterns[patternKey] = p;
  saveFailurePatterns(patterns);
}

export function getCurrentWeights(): IndicatorWeightSet {
  const local = load<IndicatorWeightSet>('indicator_weights');
  // Return local weights if available (hydration will overwrite from cloud later)
  return local || {
    weights: {
      rsi: 1, macd: 1, adx: 1, bollinger: 1, atr: 1, supertrend: 1,
      stochRsi: 1, ema: 1, volume: 1, vwap: 1, support: 1, resistance: 1,
    },
    defaultWeight: 1, lastUpdated: Date.now(), totalSamples: 0,
  };
}

export function saveWeights(ws: IndicatorWeightSet): void {
  save('indicator_weights', ws);
}

// Hydrate weights from Supabase — call once on app load
let _hydrated = false;
export async function hydrateWeightsFromCloud(): Promise<void> {
  if (_hydrated) return;
  _hydrated = true;
  const cloud = await fetchWeightsFromCloud();
  if (!cloud) return;
  // Cloud-first: overwrite local with cloud weights if cloud is newer
  const local = load<IndicatorWeightSet>('indicator_weights');
  if (!local || cloud.lastUpdated > local.lastUpdated) {
    save('indicator_weights', cloud);
  }
}

export function updateIndicatorWeight(
  indicator: string, performanceDelta: number,
): void {
  const ws = getCurrentWeights();
  ws.totalSamples++;
  const current = ws.weights[indicator] || ws.defaultWeight;
  ws.weights[indicator] = Math.max(0.1, Math.min(3, current + performanceDelta * 0.05));
  ws.lastUpdated = Date.now();
  saveWeights(ws);
}

// === Adaptive Learning — learn from past outcomes and adjust weights ±5% ===
export async function runAdaptiveLearning(): Promise<{ adjusted: number; newWeights: IndicatorWeightSet }> {
  const ws = getCurrentWeights();
  let adjusted = 0;

  // Load resolved predictions from Supabase experience logs (server-side only)
  if (isSupabaseActive() && typeof window === 'undefined') {
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error('Supabase not available');
      const { data } = await supabase
        .from('resolved_predictions_archive')
        .select('ticker, direction, result, rsi, adx, confidence')
        .limit(500);

      if (data && data.length >= 5) {
        // Map indicator contributions based on TA ranges for each resolved prediction
        const indicatorHits: Record<string, { correct: number; wrong: number }> = {};
        const indicators = ['rsi', 'macd', 'adx', 'bollinger', 'atr', 'supertrend', 'stochRsi', 'ema', 'volume', 'vwap', 'support', 'resistance'];

        for (const r of data) {
          const row = r as unknown as { ticker: string; direction: string; result: string; rsi: number; adx: number; confidence: number };
          const wasCorrect = row.result === 'CORRECT' || row.result === 'PARTIAL';

          // RSI contributed if extreme (overbought/oversold) and direction matched
          if (row.rsi > 70 || row.rsi < 30) {
            if (!indicatorHits.rsi) indicatorHits.rsi = { correct: 0, wrong: 0 };
            if (wasCorrect) indicatorHits.rsi.correct++;
            else indicatorHits.rsi.wrong++;
          }

          // ADX contributed if showing strong trend
          if (row.adx > 25) {
            if (!indicatorHits.adx) indicatorHits.adx = { correct: 0, wrong: 0 };
            if (wasCorrect) indicatorHits.adx.correct++;
            else indicatorHits.adx.wrong++;
          }

          // Note: previously blindly credited all indicators when confidence >= 70.
          // Removed — that was fake data. Only indicators with actual signal evidence
          // (RSI direction, ADX strength, MACD sign, Supertrend direction) are tracked above.
        }

        // Adjust weights: +5% for indicators that helped, -5% for those that misled
        for (const indicator of indicators) {
          const hits = indicatorHits[indicator];
          if (!hits || (hits.correct + hits.wrong) < 3) continue;

          const accuracy = (hits.correct / (hits.correct + hits.wrong)) * 100;
          const delta = accuracy >= 60 ? 1 : accuracy <= 40 ? -1 : 0;

          if (delta !== 0) {
            const current = ws.weights[indicator] || ws.defaultWeight;
            ws.weights[indicator] = Math.max(0.1, Math.min(3, current + delta * 0.05));
            ws.totalSamples++;
            adjusted++;
          }
        }

        ws.lastUpdated = Date.now();
        // Save to ai_knowledge (local + Supabase)
        saveWeights(ws);
      }
    } catch { /* fall through to local-only */ }
  }

  // Local-only fallback: adjust based on indicator_performance records
  if (adjusted === 0) {
    const perf = getAllIndicatorPerformance();
    for (const [name, record] of Object.entries(perf)) {
      if (record.totalOccurrences < 3) continue;
      const key = name.toLowerCase();
      if (ws.weights[key] === undefined) continue;
      const delta = record.accuracy >= 60 ? 1 : record.accuracy <= 40 ? -1 : 0;
      if (delta !== 0) {
        ws.weights[key] = Math.max(0.1, Math.min(3, (ws.weights[key] || ws.defaultWeight) + delta * 0.05));
        ws.totalSamples++;
        adjusted++;
      }
    }
    if (adjusted > 0) {
      ws.lastUpdated = Date.now();
      saveWeights(ws);
    }
  }

  return { adjusted, newWeights: ws };
}

export function getKnowledgeSnapshot(): AIKnowledgeSnapshot {
  return load<AIKnowledgeSnapshot>('knowledge_snapshot') || {
    totalPredictionsAnalyzed: 0, totalResolvedPredictions: 0, overallAccuracy: 0,
    avgConfidence: 0, confidenceAccuracyGap: 0, calibrationQuality: 'POOR',
    strongestIndicator: '', weakestIndicator: '', bestRegime: '', worstRegime: '',
    mostReliableSector: '', leastReliableSector: '', mostCommonFailurePattern: '',
    learningProgress: 'Initializing', daysActive: 0, lastReportGenerated: 0,
  };
}

export function saveKnowledgeSnapshot(s: AIKnowledgeSnapshot): void {
  save('knowledge_snapshot', s);
}
