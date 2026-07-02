import { loadRecords, getTickerStats, type TickerStats } from './aiExperienceEngine';
import { getResolvedPredictions, type StoredPrediction } from './predictionStore';
import { getDriftAdjustedConfidence, type DriftSignal } from './conceptDriftDetector';
import { assessUncertainty, type UncertaintyAssessment } from './uncertaintyEngine';

// === Dynamic strategy weighting system ===
// Strategies earn or lose influence based on real performance.

export interface StrategyWeight {
  ticker: string;
  baseWeight: number;
  recentPerformance: number;
  regimeWeight: number;
  volatilityWeight: number;
  driftPenalty: number;
  uncertaintyPenalty: number;
  finalWeight: number;
  confidenceAdjustment: number;
  lastUpdated: number;
}

export interface StrategyRanking {
  ticker: string;
  score: number;
  accuracy: number;
  trend: string;
  weight: number;
  isPromoted: boolean;
  isDemoted: boolean;
}

// === Compute strategy weight for a ticker ===
export function computeStrategyWeight(
  ticker: string,
  regime: string,
  volatilityRegime: string,
  uncertainty: UncertaintyAssessment,
  drift: DriftSignal,
): StrategyWeight {
  const stats = getTickerStats(ticker);
  const baseWeight = calculateBaseWeight(stats);
  const recentPerf = calculateRecentPerformance(ticker);
  const regimeW = getRegimeWeight(regime, ticker);
  const volatilityW = getVolatilityWeight(volatilityRegime);

  // Drift penalty (0-50%)
  const driftPenalty = drift.hasDrift ? drift.driftScore / 100 : 0;

  // Uncertainty penalty (0-50%)
  const uncertaintyPenalty = uncertainty.overallUncertainty / 100;

  // Final weight with all adjustments
  let finalWeight = baseWeight * recentPerf * regimeW * volatilityW;
  finalWeight *= (1 - driftPenalty * 0.5);
  finalWeight *= (1 - uncertaintyPenalty * 0.3);

  // Confidence adjustment: how much to modify confidence for this strategy
  const confidenceAdj = Math.round((1 - finalWeight) * -10);

  return {
    ticker,
    baseWeight: Math.round(baseWeight * 100),
    recentPerformance: Math.round(recentPerf * 100),
    regimeWeight: Math.round(regimeW * 100),
    volatilityWeight: Math.round(volatilityW * 100),
    driftPenalty: Math.round(driftPenalty * 100),
    uncertaintyPenalty: Math.round(uncertaintyPenalty * 100),
    finalWeight: Math.round(finalWeight * 100),
    confidenceAdjustment: confidenceAdj,
    lastUpdated: Date.now(),
  };
}

function calculateBaseWeight(stats: TickerStats): number {
  if (stats.total < 2) return 0.5; // not enough data
  let weight = 0.5;
  const accuracyWeight = (stats.accuracy / 100) * 0.5;
  weight += accuracyWeight * 0.4;
  if (stats.trend === 'IMPROVING') weight += 0.15;
  else if (stats.trend === 'DECLINING') weight -= 0.15;
  if (stats.total >= 20) weight += 0.1;
  if (stats.total >= 50) weight += 0.1;
  return Math.max(0.1, Math.min(1, weight));
}

function calculateRecentPerformance(ticker: string): number {
  const records = loadRecords()
    .filter(r => r.ticker === ticker && r.createdAt > Date.now() - 30 * 86400000);
  if (records.length < 3) return 1;
  const correct = records.filter(r => r.result === 'CORRECT').length;
  const partial = records.filter(r => r.result === 'PARTIAL').length;
  const rate = (correct + partial * 0.5) / records.length;
  return 0.5 + rate; // 0.5 - 1.5
}

function getRegimeWeight(regime: string, ticker: string): number {
  const records = loadRecords().filter(r => r.ticker === ticker && r.regime === regime);
  if (records.length < 3) return 1;
  const correct = records.filter(r => r.result === 'CORRECT').length;
  const rate = correct / records.length;
  return 0.5 + rate; // 0.5 - 1.5
}

function getVolatilityWeight(volRegime: string): number {
  switch (volRegime) {
    case 'COMPRESSED': return 1.2;
    case 'NORMAL': return 1.1;
    case 'EXPANDING': return 0.9;
    case 'HIGH': return 0.7;
    case 'EXTREME': return 0.4;
    default: return 1;
  }
}

// === Rank all tickers by strategy score ===
export function rankStrategies(tickers: string[]): StrategyRanking[] {
  const rankings: StrategyRanking[] = [];
  for (const ticker of tickers) {
    const stats = getTickerStats(ticker);
    if (stats.total < 2) continue;
    const weight = calculateBaseWeight(stats);
    const recentPerf = calculateRecentPerformance(ticker);
    const score = Math.round(weight * 100 * recentPerf);
    rankings.push({
      ticker,
      score,
      accuracy: stats.accuracy,
      trend: stats.trend,
      weight: Math.round(weight * 100),
      isPromoted: stats.trend === 'IMPROVING' && weight > 0.6 && stats.accuracy > 55,
      isDemoted: stats.trend === 'DECLINING' || stats.accuracy < 35,
    });
  }

  return rankings.sort((a, b) => b.score - a.score);
}

// === Composite confidence adjustment from all intelligence layers ===
export function computeCompositeConfidence(
  ticker: string,
  baseConfidence: number,
  regime: string,
  volatilityRegime: string,
  uncertainty: UncertaintyAssessment,
  drift: DriftSignal,
): {
  finalConfidence: number;
  adjustments: { layer: string; delta: number }[];
  strategyWeight: StrategyWeight;
} {
  const adjustments: { layer: string; delta: number }[] = [];

  let conf = baseConfidence;

  // 1. Strategy weight adjustment
  const weight = computeStrategyWeight(ticker, regime, volatilityRegime, uncertainty, drift);
  const weightDelta = weight.confidenceAdjustment;
  if (weightDelta !== 0) {
    conf += weightDelta;
    adjustments.push({ layer: 'Strategy Weight', delta: weightDelta });
  }

  // 2. Uncertainty suppression
  const uncertaintyDelta = -uncertainty.confidenceSuppression;
  if (uncertaintyDelta !== 0) {
    conf += uncertaintyDelta;
    adjustments.push({ layer: 'Uncertainty', delta: uncertaintyDelta });
  }

  // 3. Drift penalty
  if (drift.hasDrift) {
    let driftDelta = 0;
    if (drift.severity === 'CRITICAL') driftDelta = -25;
    else if (drift.severity === 'HIGH') driftDelta = -15;
    else if (drift.severity === 'MODERATE') driftDelta = -8;
    else if (drift.severity === 'LOW') driftDelta = -3;
    if (driftDelta !== 0) {
      conf += driftDelta;
      adjustments.push({ layer: 'Concept Drift', delta: driftDelta });
    }
  }

  // 4. Regime-specific adjustment
  const regimeStats = getTickerStats(ticker);
  if (regimeStats.bestRegime === regime) {
    conf += 5;
    adjustments.push({ layer: 'Regime Alignment', delta: 5 });
  } else if (regimeStats.bestRegime !== '—' && regimeStats.bestRegime !== regime && regimeStats.total >= 10) {
    conf -= 3;
    adjustments.push({ layer: 'Regime Mismatch', delta: -3 });
  }

  // Clamp
  conf = Math.max(5, Math.min(95, Math.round(conf)));

  return { finalConfidence: conf, adjustments, strategyWeight: weight };
}
