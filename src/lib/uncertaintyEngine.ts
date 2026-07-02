import type { FullMarketIntelligence } from './advancedMarketIntelligence';
import type { TAIndicators } from './technicalAnalysis';
import { getResolvedPredictions, type StoredPrediction } from './predictionStore';
import { loadRecords } from './aiExperienceEngine';

// === Core uncertainty types ===
export interface UncertaintyFactors {
  indicatorConflict: number;
  anomalyProbability: number;
  volatilityRisk: number;
  liquidityRisk: number;
  regimeTransitionRisk: number;
  historicalUncertainty: number;
  newsShockRisk: number;
  manipulationRisk: number;
  trendWeakness: number;
}

export interface UncertaintyAssessment {
  overallUncertainty: number;
  factors: UncertaintyFactors;
  recommendation: string;
  confidenceSuppression: number;
  primaryRisk: string;
  isHighUncertainty: boolean;
}

export interface IndicatorConflict {
  type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  conflictingIndicators: string[];
  description: string;
}

// === 1. Detect conflicting indicator signals ===
export function detectIndicatorConflicts(ta: TAIndicators): IndicatorConflict[] {
  const conflicts: IndicatorConflict[] = [];
  const { rsi, macd, adx, supertrend, bollinger, stochRsi } = ta;

  // RSI vs MACD conflict
  const rsiBullish = rsi > 55;
  const rsiBearish = rsi < 45;
  const macdBullish = macd.histogram > 0 && macd.line > macd.signal;
  const macdBearish = macd.histogram < 0 && macd.line < macd.signal;
  if ((rsiBullish && macdBearish) || (rsiBearish && macdBullish)) {
    conflicts.push({
      type: 'RSI vs MACD',
      severity: 'HIGH',
      conflictingIndicators: ['RSI', 'MACD'],
      description: `RSI (${rsi.toFixed(0)}) suggests ${rsiBullish ? 'bullish' : 'bearish'} momentum but MACD ${macdBullish ? 'bullish' : 'bearish'} signal conflicts`,
    });
  }

  // Supertrend vs RSI conflict
  const stUp = supertrend.direction === 'up';
  const stDown = supertrend.direction === 'down';
  if ((stUp && rsiBearish) || (stDown && rsiBullish)) {
    conflicts.push({
      type: 'Supertrend vs RSI',
      severity: 'MEDIUM',
      conflictingIndicators: ['Supertrend', 'RSI'],
      description: `Supertrend ${stUp ? 'bullish' : 'bearish'} but RSI (${rsi.toFixed(0)}) suggests opposite`,
    });
  }

  // ADX vs Bollinger conflict (weak trend but wide bands)
  if (adx < 20 && bollinger.width > 8) {
    conflicts.push({
      type: 'ADX vs Bollinger',
      severity: 'MEDIUM',
      conflictingIndicators: ['ADX', 'Bollinger'],
      description: `Low trend strength (ADX ${adx.toFixed(0)}) but wide Bollinger bands (${bollinger.width.toFixed(1)})`,
    });
  }

  // StochRSI vs RSI divergence
  if (Math.abs(stochRsi - rsi) > 30) {
    conflicts.push({
      type: 'StochRSI vs RSI',
      severity: 'LOW',
      conflictingIndicators: ['StochRSI', 'RSI'],
      description: `StochRSI (${stochRsi.toFixed(0)}) diverges from RSI (${rsi.toFixed(0)}) by ${Math.abs(stochRsi - rsi).toFixed(0)} pts`,
    });
  }

  return conflicts;
}

// === 2. Assess overall uncertainty from all factors ===
export function assessUncertainty(
  ta: TAIndicators | null,
  marketIntelligence: FullMarketIntelligence | null,
  ticker?: string,
): UncertaintyAssessment {
  const factors: UncertaintyFactors = {
    indicatorConflict: 0,
    anomalyProbability: 0,
    volatilityRisk: 0,
    liquidityRisk: 0,
    regimeTransitionRisk: 0,
    historicalUncertainty: 0,
    newsShockRisk: 0,
    manipulationRisk: 0,
    trendWeakness: 0,
  };

  // 1. Indicator conflicts
  if (ta) {
    const conflicts = detectIndicatorConflicts(ta);
    const highConflicts = conflicts.filter(c => c.severity === 'HIGH').length;
    const medConflicts = conflicts.filter(c => c.severity === 'MEDIUM').length;
    factors.indicatorConflict = Math.min(40, highConflicts * 15 + medConflicts * 8);
  }

  // 2. Market intelligence factors
  if (marketIntelligence) {
    const mi = marketIntelligence;

    // Volatility risk
    if (mi.volatility.regime === 'EXTREME') factors.volatilityRisk = 35;
    else if (mi.volatility.regime === 'HIGH') factors.volatilityRisk = 25;
    else if (mi.volatility.regime === 'EXPANDING') factors.volatilityRisk = 15;
    else if (mi.volatility.regime === 'COMPRESSED') factors.volatilityRisk = 10;

    // Liquidity risk
    if (mi.liquidity.spreadRisk === 'EXTREME') factors.liquidityRisk = 30;
    else if (mi.liquidity.spreadRisk === 'HIGH') factors.liquidityRisk = 20;
    else if (mi.liquidity.spreadRisk === 'MEDIUM') factors.liquidityRisk = 10;

    // Manipulation risk
    factors.manipulationRisk = mi.manipulation.probability;

    // Trend weakness
    if (mi.trendStrength.label === 'NONE') factors.trendWeakness = 30;
    else if (mi.trendStrength.label === 'WEAK') factors.trendWeakness = 20;
    else if (mi.trendStrength.label === 'MODERATE') factors.trendWeakness = 10;

    // Momentum exhaustion
    if (mi.momentumExhaustion?.isExhausted) {
      factors.anomalyProbability += 20;
    }

    // Fake breakout
    if (mi.fakeBreakout?.isFake) {
      factors.anomalyProbability += 15;
      factors.regimeTransitionRisk += 15;
    }
  }

  // 3. Historical uncertainty — check if similar setups had unreliable outcomes
  if (ticker) {
    const records = loadRecords()
      .filter(r => r.ticker === ticker && r.createdAt > Date.now() - 90 * 86400000);
    if (records.length >= 5) {
      const last5 = records.slice(-5);
      const recentErrors = last5.filter(r => r.result === 'WRONG').length;
      if (recentErrors >= 3) factors.historicalUncertainty = 25;
      else if (recentErrors >= 2) factors.historicalUncertainty = 15;
      // High deviation in recent predictions
      const avgDev = last5.reduce((s, r) => s + r.deviationPercent, 0) / last5.length;
      if (avgDev > 5) factors.historicalUncertainty += 10;
    }
  }

  // 4. News shock risk — check if macro events are active
  try {
    const engineRaw = typeof localStorage !== 'undefined'
      ? localStorage.getItem('opencode_engine_state')
      : null;
    if (engineRaw) {
      const engine = JSON.parse(engineRaw) as { macroShockActive?: boolean; macroShockInfo?: string };
      if (engine.macroShockActive) {
        factors.newsShockRisk = 30;
      }
    }
  } catch { /* ignore */ }

  // 5. Regime transition — check if current regime is unstable
  if (marketIntelligence) {
    const patterns = marketIntelligence.patterns;
    const dojis = patterns.filter(p => p.name === 'Doji').length;
    if (dojis > 0) factors.regimeTransitionRisk += 10;
    if (marketIntelligence.volatility.regime === 'COMPRESSED') {
      factors.regimeTransitionRisk += 15; // squeezed = likely to break out
    }
    // Multiple conflicting pattern signals
    const bullish = patterns.filter(p => p.signal === 'BULLISH').length;
    const bearish = patterns.filter(p => p.signal === 'BEARISH').length;
    if (bullish > 0 && bearish > 0) factors.regimeTransitionRisk += 10;
  }

  // Compute overall uncertainty (0-100)
  const overall = Math.min(100, Math.round(
    factors.indicatorConflict * 0.20 +
    factors.anomalyProbability * 0.15 +
    factors.volatilityRisk * 0.15 +
    factors.liquidityRisk * 0.10 +
    factors.regimeTransitionRisk * 0.12 +
    factors.historicalUncertainty * 0.12 +
    factors.newsShockRisk * 0.08 +
    factors.manipulationRisk * 0.05 +
    factors.trendWeakness * 0.03
  ));

  // Confidence suppression: how much to reduce confidence
  const suppression = Math.round(overall * 0.3);

  // Primary risk identification
  const riskContributions: [string, number][] = [
    ['Indicator conflict', factors.indicatorConflict],
    ['Anomaly/momentum exhaustion', factors.anomalyProbability],
    ['High volatility', factors.volatilityRisk],
    ['Low liquidity', factors.liquidityRisk],
    ['Regime transition', factors.regimeTransitionRisk],
    ['Historical unreliability', factors.historicalUncertainty],
    ['News/macro shock', factors.newsShockRisk],
    ['Market manipulation', factors.manipulationRisk],
    ['Weak trend', factors.trendWeakness],
  ];
  riskContributions.sort((a, b) => b[1] - a[1]);
  const primaryRisk = riskContributions[0][1] > 0 ? riskContributions[0][0] : 'None';

  // Recommendation
  let recommendation: string;
  if (overall >= 50) {
    recommendation = `High uncertainty (${overall}%) — confidence suppressed by ${suppression}%. ` +
      `Primary risk: ${primaryRisk}. Consider avoiding directional predictions.`;
  } else if (overall >= 30) {
    recommendation = `Moderate uncertainty (${overall}%) — reduce position sizes. ` +
      `Primary risk: ${primaryRisk}. Apply caution.`;
  } else {
    recommendation = `Low uncertainty (${overall}%) — normal confidence adjustment of ${suppression}%.`;
  }

  return {
    overallUncertainty: overall,
    factors,
    recommendation,
    confidenceSuppression: suppression,
    primaryRisk,
    isHighUncertainty: overall >= 60,
  };
}

// === 3. Detect anomaly conditions ===
export interface AnomalyReport {
  hasAnomaly: boolean;
  anomalyScore: number;
  anomalies: string[];
}

export function detectAnomalies(
  ta: TAIndicators,
  marketIntelligence: FullMarketIntelligence | null,
  recentPredictions?: StoredPrediction[],
): AnomalyReport {
  const anomalies: string[] = [];
  let score = 0;

  // RSI extreme without trend confirmation
  if (ta.rsi > 85 && ta.adx < 25) {
    score += 30;
    anomalies.push(`RSI ${ta.rsi.toFixed(0)} in non-trending market (ADX ${ta.adx.toFixed(0)})`);
  }
  if (ta.rsi < 15 && ta.adx < 25) {
    score += 30;
    anomalies.push(`RSI ${ta.rsi.toFixed(0)} oversold without trend confirmation`);
  }

  // Bollinger squeeze with ADX divergence
  if (ta.bollinger.width < 3 && ta.adx > 30) {
    score += 25;
    anomalies.push(`Tight Bollinger (${ta.bollinger.width.toFixed(1)}) conflicting with strong trend (ADX ${ta.adx.toFixed(0)})`);
  }

  // Massive volume divergence
  if (ta.volumeSma > 0 && marketIntelligence) {
    const vr = marketIntelligence.liquidity.liquidityScore;
    if (vr < 30 && ta.atr / (ta.rsi || 1) > 0.05) {
      score += 20;
      anomalies.push(`Low liquidity (${vr}/100) with significant volatility`);
    }
  }

  // Fake breakout + exhaustion = high anomaly
  if (marketIntelligence) {
    if (marketIntelligence.fakeBreakout?.isFake && marketIntelligence.momentumExhaustion?.isExhausted) {
      score += 25;
      anomalies.push('Fake breakout with momentum exhaustion — high manipulation risk');
    }
  }

  // Recent prediction failures
  if (recentPredictions && recentPredictions.length >= 3) {
    const recent = recentPredictions.slice(-5);
    const failures = recent.filter(p => p.result === 'WRONG').length;
    if (failures >= 3) {
      score += 20;
      anomalies.push(`${failures}/${recent.length} recent predictions failed — possible regime change`);
    }
  }

  return {
    hasAnomaly: score >= 30,
    anomalyScore: Math.min(100, score),
    anomalies,
  };
}

// === 4. Quick uncertainty check for suppression ===
export function shouldSuppressPrediction(
  uncertainty: UncertaintyAssessment,
  baseConfidence: number,
): { suppress: boolean; adjustedConfidence: number; reason: string } {
  if (uncertainty.isHighUncertainty && baseConfidence >= 50) {
    const adjusted = Math.max(5, baseConfidence - uncertainty.confidenceSuppression);
    return {
      suppress: true,
      adjustedConfidence: adjusted,
      reason: `High uncertainty (${uncertainty.overallUncertainty}%) — confidence reduced from ${baseConfidence}% to ${adjusted}%. ${uncertainty.primaryRisk}.`,
    };
  }
  if (uncertainty.overallUncertainty > 35) {
    const adjusted = Math.max(5, baseConfidence - uncertainty.confidenceSuppression);
    return {
      suppress: adjusted < baseConfidence,
      adjustedConfidence: adjusted,
      reason: `Moderate uncertainty (${uncertainty.overallUncertainty}%) — minor reduction ${baseConfidence}% → ${adjusted}%`,
    };
  }
  return {
    suppress: false,
    adjustedConfidence: baseConfidence,
    reason: 'Low uncertainty — no suppression needed',
  };
}
