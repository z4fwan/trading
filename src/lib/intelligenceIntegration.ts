// === Central integration point for all intelligence layers ===
// Coordinates: similarity engine, uncertainty, concept drift, strategy evolution,
// paper trading, self-awareness, ensemble prediction
//
// v2.0 — Self-Aware Intelligence Layer

import { getSimilarityAdjustedConfidence, type SimilarityResult } from './historicalSimilarityEngine';
import { assessUncertainty, shouldSuppressPrediction, detectAnomalies, type UncertaintyAssessment } from './uncertaintyEngine';
import { assessDrift, getDriftAdjustedConfidence, type DriftSignal } from './conceptDriftDetector';
import { computeCompositeConfidence, type StrategyWeight } from './adaptiveStrategyEngine';
import { computePaperTradingStats, type PaperTradingStats, type PaperTrade } from './paperTradingValidator';
import { analyzeSelf, getSelfAwareAdjustedConfidence, shouldSelfSuppress, getSelfAwarenessProfile, type SelfAwarenessProfile } from './selfAwarenessEngine';
import { predictEnsemble, getEnsembleConsensusDescription, type EnsembleResult } from './ensemblePredictor';
import type { TAIndicators } from './technicalAnalysis';
import type { FullMarketIntelligence } from './advancedMarketIntelligence';
import { PREDICTION_BLOCK_THRESHOLD } from './confidenceConfig';
import { getResolvedPredictions } from './predictionStore';

// === Composite intelligence result for a single prediction ===
export interface CompositeIntelligence {
  ticker: string;
  baseConfidence: number;
  finalConfidence: number;
  adjustments: {
    layer: string;
    delta: number;
    details: string;
  }[];
  uncertainty: UncertaintyAssessment;
  drift: DriftSignal;
  strategyWeight: StrategyWeight;
  similarityResult: SimilarityResult;
  suppressionActive: boolean;
  suppressionReason: string;
  paperTradingStats: PaperTradingStats | null;
  recommendation: string;
  selfAwareness: SelfAwarenessProfile | null;
  ensembleResult: EnsembleResult | null;
}

// === Assess full intelligence for a ticker ===
export function assessFullIntelligence(
  ticker: string,
  baseConfidence: number,
  ta: TAIndicators | null,
  regime: string,
  volatilityRegime: string,
  sessionLabel: string,
  dayOfWeek: number,
  marketIntelligence: FullMarketIntelligence | null,
  sentimentScore?: number,
): CompositeIntelligence {
  const adjustments: CompositeIntelligence['adjustments'] = [];

  // 0. Self-awareness check — runs first to potentially block early
  let selfSuppress = { suppress: false, reason: '', confidenceOverride: null as number | null };
  try {
    selfSuppress = shouldSelfSuppress(baseConfidence, regime, volatilityRegime, 'NEUTRAL', ticker);
  } catch { /* self-awareness unavailable */ }
  if (selfSuppress.suppress) {
    const floor = selfSuppress.confidenceOverride ?? Math.max(PREDICTION_BLOCK_THRESHOLD, Math.round(baseConfidence * 0.45));
    return {
      ticker, baseConfidence, finalConfidence: floor, adjustments: [],
      uncertainty: assessUncertainty(ta, marketIntelligence, ticker),
      drift: assessDrift(ticker),
      strategyWeight: { ticker, baseWeight: 0, recentPerformance: 0, regimeWeight: 0, volatilityWeight: 0, driftPenalty: 0, uncertaintyPenalty: 0, finalWeight: 0, confidenceAdjustment: 0, lastUpdated: Date.now() },
      similarityResult: { matches: [], overallWinRate: 0, avgAccuracy: 0, avgDeviation: 0, avgReturn: 0, matchCount: 0, confidence: 0 },
      suppressionActive: true, suppressionReason: selfSuppress.reason,
      paperTradingStats: computePaperTradingStats(),
      recommendation: `SELF-AWARE CAUTION: ${selfSuppress.reason}`,
      selfAwareness: null, ensembleResult: null,
    };
  }

  // 1. Similarity engine
  let conf = baseConfidence;
  const simResult = ta
    ? getSimilarityAdjustedConfidence(
        baseConfidence,
        ta.rsi, ta.macd.histogram, ta.adx,
        ta.bollinger.width, ta.atr,
        marketIntelligence?.supportResistance.nearestResistance || ta.rsi * 100 || 100,
        1, sentimentScore || 0,
        regime, sessionLabel, dayOfWeek,
        ticker,
      )
    : { adjustedConfidence: baseConfidence, similarityResult: { matches: [], overallWinRate: 0, avgAccuracy: 0, avgDeviation: 0, avgReturn: 0, matchCount: 0, confidence: 0 }, similarityBoost: 0, suppressionActive: false };

  if (simResult.similarityBoost !== 0) {
    conf = simResult.adjustedConfidence;
    adjustments.push({
      layer: 'Historical Similarity',
      delta: simResult.similarityBoost,
      details: `Similarity boost: ${simResult.similarityBoost > 0 ? '+' : ''}${simResult.similarityBoost}% (${simResult.similarityResult.matchCount} matches, ${simResult.similarityResult.overallWinRate}% win rate)`,
    });
  }

  // 2. Uncertainty engine
  const uncertainty = assessUncertainty(ta, marketIntelligence, ticker);
  const uncertaintyCheck = shouldSuppressPrediction(uncertainty, conf);
  if (uncertaintyCheck.suppress) {
    conf = uncertaintyCheck.adjustedConfidence;
    adjustments.push({
      layer: 'Uncertainty',
      delta: -(uncertainty.confidenceSuppression),
      details: `Uncertainty ${uncertainty.overallUncertainty}% — ${uncertainty.primaryRisk}. ${uncertaintyCheck.reason}`,
    });
  }

  // 3. Concept drift
  const drift = assessDrift(ticker);
  const driftAdj = getDriftAdjustedConfidence(conf, ticker);
  if (driftAdj.suppressionPct > 0) {
    conf = driftAdj.adjustedConfidence;
    adjustments.push({
      layer: 'Concept Drift',
      delta: -(drift.driftScore),
      details: `Drift score: ${drift.driftScore} (${drift.severity}). ${drift.recommendation}`,
    });
  }

  // 4. Adaptive strategy weighting
  const composite = computeCompositeConfidence(ticker, conf, regime, volatilityRegime, uncertainty, drift);
  conf = composite.finalConfidence;
  for (const adj of composite.adjustments) {
    adjustments.push({
      layer: adj.layer,
      delta: adj.delta,
      details: `${adj.layer}: ${adj.delta > 0 ? '+' : ''}${adj.delta}%`,
    });
  }

  // 5. Self-awareness adjustment (meta-cognitive layer)
  let selfProfile: SelfAwarenessProfile | null = null;
  try {
    selfProfile = getSelfAwarenessProfile();
    const selfAdj = getSelfAwareAdjustedConfidence(conf, regime, volatilityRegime, 'NEUTRAL', ticker, dayOfWeek);
    conf = selfAdj.adjustedConfidence;
    adjustments.push(...selfAdj.adjustments);
  } catch { /* self-awareness unavailable */ }

  // 6. Anomaly check
  let anomalyNote = '';
  if (ta) {
    const anomaly = detectAnomalies(ta, marketIntelligence);
    if (anomaly.hasAnomaly) {
      adjustments.push({
        layer: 'Anomaly Detection',
        delta: 0,
        details: `Anomalies: ${anomaly.anomalies.join('; ')}`,
      });
      anomalyNote = anomaly.anomalies[0];
    }
  }

  // 7. Paper trading stats
  const paperStats = computePaperTradingStats();

  // 8. Ensemble result (informational — doesn't override confidence)
  let ensembleResult: EnsembleResult | null = null;
  try {
    ensembleResult = {
      direction: conf >= 50 ? 'BULLISH' : 'BEARISH',
      confidence: conf,
      votes: [],
      agreementLevel: 0,
      weightedConfidence: conf,
      consensusStrength: 'WEAK',
      isReliable: false,
    };
  } catch { /* skip */ }

  // Build self-awareness enriched recommendation
  const hasSelfAwareness = selfProfile !== null && selfProfile.totalPredictions >= 5;
  const selfAdvice = hasSelfAwareness && selfProfile!.advice.length > 0
    ? ` Self-awareness: ${selfProfile!.advice.slice(0, 2).join('. ')}.`
    : '';

  const recommendation = selfSuppress.suppress
    ? `SELF-BLOCKED: ${selfSuppress.reason}`
    : uncertainty.isHighUncertainty
      ? `HIGH UNCERTAINTY — suppress prediction. ${anomalyNote || uncertainty.primaryRisk}. Confidence reduced from ${baseConfidence}% → ${conf}%${selfAdvice}`
      : drift.hasDrift
        ? `DRIFT DETECTED — ${drift.recommendation} Final confidence: ${conf}%${selfAdvice}`
        : `Normal conditions.${hasSelfAwareness ? ` Self: ${selfProfile!.overallAccuracy}% lifetime accuracy (${selfProfile!.totalPredictions} preds, ${selfProfile!.trend}).` : ''} ${paperStats.totalTrades > 0 ? `Paper: ${paperStats.winRate}% win rate (${paperStats.totalTrades} trades, Sharpe ${paperStats.sharpeRatio}).` : ''} Confidence: ${baseConfidence}% → ${conf}%`;

  return {
    ticker,
    baseConfidence,
    finalConfidence: Math.min(99, Math.max(0, Math.round(conf))),
    adjustments,
    uncertainty,
    drift,
    strategyWeight: composite.strategyWeight,
    similarityResult: simResult.similarityResult,
    suppressionActive: uncertaintyCheck.suppress || selfSuppress.suppress,
    suppressionReason: selfSuppress.suppress ? selfSuppress.reason : uncertaintyCheck.reason,
    paperTradingStats: paperStats.totalTrades > 0 ? paperStats : null,
    recommendation,
    selfAwareness: selfProfile,
    ensembleResult,
  };
}

// === Get intelligence summary for dashboard ===
export function getIntelligenceDashboardSummary(): {
  totalPredictionsEver: number;
  currentDrift: DriftSignal;
  paperTradingStats: PaperTradingStats;
  activeAnomalies: number;
  selfAwareness: SelfAwarenessProfile | null;
} {
  const resolved = getResolvedPredictions();
  const drift = assessDrift();
  const paperStats = computePaperTradingStats();
  let selfProfile: SelfAwarenessProfile | null = null;
  try { selfProfile = getSelfAwarenessProfile(); } catch { /* ignore */ }

  let anomalies = 0;
  try {
    const engineRaw = localStorage.getItem('opencode_engine_state');
    if (engineRaw) {
      const engine = JSON.parse(engineRaw);
      if (engine.macroShockActive) anomalies++;
    }
  } catch { /* ignore */ }

  return {
    totalPredictionsEver: resolved.length,
    currentDrift: drift,
    paperTradingStats: paperStats,
    activeAnomalies: anomalies,
    selfAwareness: selfProfile,
  };
}

// === Validate if prediction should be made ===
export function shouldMakePrediction(
  baseConfidence: number,
  intelligence: CompositeIntelligence,
): { allowed: boolean; confidence: number; reason: string } {
  // Self-awareness block takes highest priority
  if (intelligence.suppressionActive && intelligence.suppressionReason.startsWith('SELF-AWARE BLOCK')) {
    return { allowed: false, confidence: 0, reason: intelligence.suppressionReason };
  }
  if (intelligence.uncertainty.isHighUncertainty && baseConfidence < 60) {
    return { allowed: false, confidence: 0, reason: `Blocked by uncertainty (${intelligence.uncertainty.overallUncertainty}%). ${intelligence.uncertainty.primaryRisk}.` };
  }
  if (intelligence.drift.severity === 'CRITICAL') {
    return { allowed: false, confidence: 0, reason: `Blocked by critical concept drift. Re-calibration needed.` };
  }
  if (intelligence.suppressionActive && intelligence.finalConfidence < 20) {
    return { allowed: false, confidence: intelligence.finalConfidence, reason: `Confidence suppressed below threshold. ${intelligence.suppressionReason}` };
  }
  if (intelligence.finalConfidence < PREDICTION_BLOCK_THRESHOLD) {
    return { allowed: false, confidence: intelligence.finalConfidence, reason: `Confidence too low (${intelligence.finalConfidence}%) for reliable prediction.` };
  }
  return { allowed: true, confidence: intelligence.finalConfidence, reason: 'Prediction allowed through all intelligence checks.' };
}
