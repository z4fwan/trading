import { getResolvedPredictions, type StoredPrediction } from './predictionStore';
import { getEngineState } from './engineState';

export interface SelfAwarenessProfile {
  overallAccuracy: number;
  totalPredictions: number;
  regimeAccuracy: Record<string, { total: number; correct: number; accuracy: number }>;
  volatilityAccuracy: Record<string, { total: number; correct: number; accuracy: number }>;
  directionAccuracy: Record<string, { total: number; correct: number; accuracy: number }>;
  confidenceBuckets: Record<string, { total: number; correct: number; accuracy: number }>;
  dayAccuracy: Record<string, { total: number; correct: number; accuracy: number }>;
  tickerAccuracy: Record<string, { total: number; correct: number; accuracy: number }>;
  strengths: string[];
  weaknesses: string[];
  blindspots: string[];
  selfAwarenessScore: number;
  confidenceCalibrationGap: number;
  metaConfidence: number;
  selfDiagnosis: string;
  lastAnalyzed: number;
  trend: 'IMPROVING' | 'STABLE' | 'DECLINING';
  advice: string[];
}

let cachedProfile: SelfAwarenessProfile | null = null;
let lastAnalysis = 0;
const ANALYSIS_COOLDOWN = 300000;

function bucket(v: number, thresholds: number[]): string {
  for (const t of thresholds) if (v <= t) return `≤${t}`;
  return `>${thresholds[thresholds.length - 1]}`;
}

function classifyRegime(pred: StoredPrediction): string {
  return pred.regime || 'UNKNOWN';
}

function classifyVolatility(pred: StoredPrediction): string {
  const v = pred.expectedVolatility || 0;
  if (v <= 1) return 'LOW';
  if (v <= 2) return 'MODERATE';
  if (v <= 3.5) return 'HIGH';
  return 'EXTREME';
}

function classifyConfidenceBucket(conf: number): string {
  if (conf < 30) return '0-29';
  if (conf < 50) return '30-49';
  if (conf < 65) return '50-64';
  if (conf < 80) return '65-79';
  if (conf < 90) return '80-89';
  return '90-100';
}

function dayName(ts: number): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[new Date(ts).getDay()];
}

function isCorrect(pred: StoredPrediction): boolean {
  return pred.result === 'CORRECT' || pred.result === 'PARTIAL';
}

export function analyzeSelf(predictions?: StoredPrediction[]): SelfAwarenessProfile {
  const now = Date.now();
  if (cachedProfile && now - lastAnalysis < ANALYSIS_COOLDOWN) return cachedProfile;

  const resolved = predictions || getResolvedPredictions();
  const total = resolved.length;

  if (total === 0) {
    cachedProfile = {
      overallAccuracy: 0, totalPredictions: 0,
      regimeAccuracy: {}, volatilityAccuracy: {}, directionAccuracy: {},
      confidenceBuckets: {}, dayAccuracy: {}, tickerAccuracy: {},
      strengths: [], weaknesses: [], blindspots: ['Insufficient prediction data'],
      selfAwarenessScore: 0, confidenceCalibrationGap: 0,
      metaConfidence: 0, selfDiagnosis: 'Not enough data for self-assessment.',
      lastAnalyzed: now, trend: 'STABLE', advice: ['Continue accumulating prediction data.'],
    };
    return cachedProfile;
  }

  const regimeAccuracy: Record<string, { total: number; correct: number }> = {};
  const volatilityAccuracy: Record<string, { total: number; correct: number }> = {};
  const directionAccuracy: Record<string, { total: number; correct: number }> = {};
  const confidenceBuckets: Record<string, { total: number; correct: number }> = {};
  const dayAccuracy: Record<string, { total: number; correct: number }> = {};
  const tickerAccuracy: Record<string, { total: number; correct: number }> = {};

  let correctCount = 0;
  let totalConfidence = 0;
  let totalCorrectConfidence = 0;

  for (const pred of resolved) {
    const correct = isCorrect(pred);
    if (correct) correctCount++;
    totalConfidence += pred.confidence;
    if (correct) totalCorrectConfidence += pred.confidence;

    const regime = classifyRegime(pred);
    if (!regimeAccuracy[regime]) regimeAccuracy[regime] = { total: 0, correct: 0 };
    regimeAccuracy[regime].total++;
    if (correct) regimeAccuracy[regime].correct++;

    const vol = classifyVolatility(pred);
    if (!volatilityAccuracy[vol]) volatilityAccuracy[vol] = { total: 0, correct: 0 };
    volatilityAccuracy[vol].total++;
    if (correct) volatilityAccuracy[vol].correct++;

    const dir = pred.direction;
    if (!directionAccuracy[dir]) directionAccuracy[dir] = { total: 0, correct: 0 };
    directionAccuracy[dir].total++;
    if (correct) directionAccuracy[dir].correct++;

    const cb = classifyConfidenceBucket(pred.confidence);
    if (!confidenceBuckets[cb]) confidenceBuckets[cb] = { total: 0, correct: 0 };
    confidenceBuckets[cb].total++;
    if (correct) confidenceBuckets[cb].correct++;

    const day = dayName(pred.createdAt);
    if (!dayAccuracy[day]) dayAccuracy[day] = { total: 0, correct: 0 };
    dayAccuracy[day].total++;
    if (correct) dayAccuracy[day].correct++;

    if (!tickerAccuracy[pred.ticker]) tickerAccuracy[pred.ticker] = { total: 0, correct: 0 };
    tickerAccuracy[pred.ticker].total++;
    if (correct) tickerAccuracy[pred.ticker].correct++;
  }

  const overallAccuracy = total > 0 ? (correctCount / total) * 100 : 0;
  const avgConfidence = total > 0 ? totalConfidence / total : 0;
  const avgCorrectConfidence = correctCount > 0 ? totalCorrectConfidence / correctCount : 0;
  const confidenceCalibrationGap = Math.abs(avgConfidence - overallAccuracy);

  const toPercent = (v: { total: number; correct: number }): number => v.total > 0 ? (v.correct / v.total) * 100 : 0;
  const computeSegments = (map: Record<string, { total: number; correct: number }>, minSamples: number) => {
    const result: Record<string, { total: number; correct: number; accuracy: number }> = {};
    for (const [k, v] of Object.entries(map)) result[k] = { ...v, accuracy: parseFloat(toPercent(v).toFixed(1)) };
    return result;
  };

  const regimePct = computeSegments(regimeAccuracy, 3);
  const volPct = computeSegments(volatilityAccuracy, 3);
  const dirPct = computeSegments(directionAccuracy, 3);
  const cbPct = computeSegments(confidenceBuckets, 3);
  const dayPct = computeSegments(dayAccuracy, 3);
  const tickerPct = computeSegments(tickerAccuracy, 3);

  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const blindspots: string[] = [];

  for (const [regime, stats] of Object.entries(regimePct)) {
    if (stats.total < 3) { blindspots.push(`Regime "${regime}" (${stats.total} samples)`); continue; }
    if (stats.accuracy >= 65) strengths.push(`${stats.accuracy}% accuracy in ${regime} regimes`);
    else if (stats.accuracy < 40) weaknesses.push(`Only ${stats.accuracy}% in ${regime} regimes`);
  }

  for (const [vol, stats] of Object.entries(volPct)) {
    if (stats.total < 3) continue;
    if (stats.accuracy >= 65) strengths.push(`Strong in ${vol} volatility (${stats.accuracy}%)`);
    else if (stats.accuracy < 40) weaknesses.push(`Weak in ${vol} volatility (${stats.accuracy}%)`);
  }

  for (const [dir, stats] of Object.entries(dirPct)) {
    if (stats.total < 3) continue;
    if (stats.accuracy >= 65) strengths.push(`Best at ${dir} predictions (${stats.accuracy}%)`);
    else if (stats.accuracy < 40) weaknesses.push(`Poor ${dir} predictions (${stats.accuracy}%)`);
  }

  for (const [cb, stats] of Object.entries(cbPct)) {
    if (stats.total < 3) continue;
    if (stats.accuracy >= 70) strengths.push(`Reliable at ${cb}% confidence (${stats.accuracy}%)`);
    else if (stats.accuracy < 35) weaknesses.push(`Unreliable at ${cb}% confidence (${stats.accuracy}%)`);
  }

  for (const [day, stats] of Object.entries(dayPct)) {
    if (stats.total < 3) continue;
    if (stats.accuracy >= 65) strengths.push(`Strong on ${day}s (${stats.accuracy}%)`);
    else if (stats.accuracy < 40) weaknesses.push(`Weak on ${day}s (${stats.accuracy}%)`);
  }

  const tickerEntries = Object.entries(tickerPct).filter(([_, s]) => s.total >= 5);
  for (const [ticker, stats] of tickerEntries) {
    if (stats.accuracy >= 70) strengths.push(`High accuracy on ${ticker} (${stats.accuracy}%, ${stats.total} preds)`);
    else if (stats.accuracy < 35) weaknesses.push(`Poor on ${ticker} (${stats.accuracy}%, ${stats.total} preds)`);
  }

  const recent = resolved.filter(p => p.createdAt > Date.now() - 7 * 86400000);
  const older = resolved.filter(p => p.createdAt <= Date.now() - 7 * 86400000);
  const recentAcc = recent.length >= 3 ? (recent.filter(p => isCorrect(p)).length / recent.length) * 100 : -1;
  const olderAcc = older.length >= 3 ? (older.filter(p => isCorrect(p)).length / older.length) * 100 : -1;
  const trend: 'IMPROVING' | 'STABLE' | 'DECLINING' =
    recentAcc < 0 || olderAcc < 0 ? 'STABLE' :
    recentAcc > olderAcc + 10 ? 'IMPROVING' :
    recentAcc < olderAcc - 10 ? 'DECLINING' : 'STABLE';

  const selfAwarenessScore = parseFloat((
    (confidenceCalibrationGap < 20 ? 30 : 10) +
    (trend === 'IMPROVING' ? 25 : trend === 'STABLE' ? 15 : 5) +
    (overallAccuracy > 55 ? 25 : 10) +
    (strengths.length * 5) +
    (total > 50 ? 20 : total > 20 ? 10 : 5)
  ).toFixed(1));

  const metaConfidence = parseFloat((
    overallAccuracy * 0.5 +
    (100 - confidenceCalibrationGap) * 0.2 +
    (trend === 'IMPROVING' ? 15 : trend === 'STABLE' ? 10 : 0) +
    (total > 20 ? 5 : 0)
  ).toFixed(1));

  const selfDiagnosisParts: string[] = [];
  selfDiagnosisParts.push(`${overallAccuracy.toFixed(1)}% overall accuracy across ${total} predictions`);
  if (confidenceCalibrationGap > 30) selfDiagnosisParts.push(`confidence is poorly calibrated (gap: ${confidenceCalibrationGap.toFixed(1)}%)`);
  else if (confidenceCalibrationGap > 15) selfDiagnosisParts.push(`confidence needs calibration (gap: ${confidenceCalibrationGap.toFixed(1)}%)`);
  else selfDiagnosisParts.push(`well-calibrated confidence (gap: ${confidenceCalibrationGap.toFixed(1)}%)`);

  if (trend === 'IMPROVING') selfDiagnosisParts.push('currently on an improving trend');
  else if (trend === 'DECLINING') selfDiagnosisParts.push('performance is declining — consider regime change');
  else selfDiagnosisParts.push('performance is stable');

  if (strengths.length > 0) selfDiagnosisParts.push(`strengths: ${strengths.slice(0, 3).join(', ')}`);
  if (weaknesses.length > 0) selfDiagnosisParts.push(`weaknesses: ${weaknesses.slice(0, 3).join(', ')}`);

  const advice: string[] = [];
  if (trend === 'DECLINING') advice.push('Performance declining — consider reducing position sizes and reviewing strategy');
  if (confidenceCalibrationGap > 25) advice.push('Large confidence-accuracy gap — reduce confidence until calibration improves');
  if (weaknesses.length > 0) advice.push(`Address weaknesses: ${weaknesses.slice(0, 2).join(', ')}`);
  if (total < 30) advice.push('Continue accumulating predictions for more reliable self-assessment');
  if (strengths.length > 0) advice.push(`Leverage strengths: ${strengths[0]}`);
  if (Object.keys(blindspots).length > 0) advice.push(`${Object.keys(blindspots).length} regime types need more data for assessment`);
  if (overallAccuracy < 50) advice.push('Current accuracy below 50% — predictions should carry higher uncertainty');
  advice.push('Self-assessment updates every 5 minutes based on new resolved predictions');

  cachedProfile = {
    overallAccuracy: parseFloat(overallAccuracy.toFixed(1)),
    totalPredictions: total,
    regimeAccuracy: regimePct,
    volatilityAccuracy: volPct,
    directionAccuracy: dirPct,
    confidenceBuckets: cbPct,
    dayAccuracy: dayPct,
    tickerAccuracy: tickerPct,
    strengths: strengths.slice(0, 5),
    weaknesses: weaknesses.slice(0, 5),
    blindspots: blindspots.slice(0, 5),
    selfAwarenessScore,
    confidenceCalibrationGap: parseFloat(confidenceCalibrationGap.toFixed(1)),
    metaConfidence,
    selfDiagnosis: selfDiagnosisParts.join('. '),
    lastAnalyzed: now,
    trend,
    advice,
  };

  return cachedProfile;
}

export function getSelfAwareAdjustedConfidence(
  baseConfidence: number,
  regime: string,
  volatilityRegime: string,
  direction: string,
  ticker: string,
  day?: number,
): { adjustedConfidence: number; adjustments: { layer: string; delta: number; details: string }[] } {
  const profile = analyzeSelf();
  const adjustments: { layer: string; delta: number; details: string }[] = [];

  if (profile.totalPredictions < 5) {
    return { adjustedConfidence: baseConfidence, adjustments: [] };
  }

  let conf = baseConfidence;
  let totalDelta = 0;

  const regimeKey = regime || 'UNKNOWN';
  const regimeStats = profile.regimeAccuracy[regimeKey];
  if (regimeStats && regimeStats.total >= 3) {
    if (regimeStats.accuracy < 40 && regimeStats.accuracy > 0) {
      const penalty = Math.min(30, (40 - regimeStats.accuracy) * 0.5);
      conf -= penalty;
      totalDelta -= penalty;
      adjustments.push({ layer: 'SelfAware-Regime', delta: -penalty, details: `Only ${regimeStats.accuracy}% accuracy in ${regimeKey} regimes` });
    } else if (regimeStats.accuracy > 65) {
      const boost = Math.min(15, (regimeStats.accuracy - 65) * 0.3);
      conf += boost;
      totalDelta += boost;
      adjustments.push({ layer: 'SelfAware-Regime', delta: boost, details: `Strong ${regimeStats.accuracy}% accuracy in ${regimeKey} regimes` });
    }
  }

  const volKey = volatilityRegime || 'MODERATE';
  const volStats = profile.volatilityAccuracy[volKey];
  if (volStats && volStats.total >= 3) {
    if (volStats.accuracy < 40) {
      const penalty = Math.min(25, (40 - volStats.accuracy) * 0.4);
      conf -= penalty;
      totalDelta -= penalty;
      adjustments.push({ layer: 'SelfAware-Volatility', delta: -penalty, details: `Poor ${volStats.accuracy}% accuracy in ${volKey} volatility` });
    } else if (volStats.accuracy > 65) {
      const boost = Math.min(12, (volStats.accuracy - 65) * 0.25);
      conf += boost;
      totalDelta += boost;
      adjustments.push({ layer: 'SelfAware-Volatility', delta: boost, details: `Strong in ${volKey} volatility (${volStats.accuracy}%)` });
    }
  }

  const dirStats = profile.directionAccuracy[direction];
  if (dirStats && dirStats.total >= 3) {
    if (dirStats.accuracy < 40) {
      const penalty = Math.min(20, (40 - dirStats.accuracy) * 0.3);
      conf -= penalty;
      totalDelta -= penalty;
      adjustments.push({ layer: 'SelfAware-Direction', delta: -penalty, details: `Weaker on ${direction} predictions (${dirStats.accuracy}%)` });
    }
  }

  const tickerStats = profile.tickerAccuracy[ticker];
  if (tickerStats && tickerStats.total >= 5) {
    if (tickerStats.accuracy > 70) {
      const boost = Math.min(15, (tickerStats.accuracy - 70) * 0.3);
      conf += boost;
      totalDelta += boost;
      adjustments.push({ layer: 'SelfAware-Ticker', delta: boost, details: `${ticker} accuracy: ${tickerStats.accuracy}% (${tickerStats.total} preds)` });
    } else if (tickerStats.accuracy < 35 && tickerStats.accuracy > 0) {
      const penalty = Math.min(20, (35 - tickerStats.accuracy) * 0.3);
      conf -= penalty;
      totalDelta -= penalty;
      adjustments.push({ layer: 'SelfAware-Ticker', delta: -penalty, details: `Poor on ${ticker}: ${tickerStats.accuracy}%` });
    }
  }

  if (profile.confidenceCalibrationGap > 30) {
    const penalty = Math.min(25, profile.confidenceCalibrationGap * 0.3);
    conf -= penalty;
    totalDelta -= penalty;
    adjustments.push({ layer: 'SelfAware-Calibration', delta: -penalty, details: `Large confidence gap (${profile.confidenceCalibrationGap}%) — reducing confidence` });
  }

  if (profile.trend === 'DECLINING') {
    const penalty = 10;
    conf -= penalty;
    totalDelta -= penalty;
    adjustments.push({ layer: 'SelfAware-Trend', delta: -penalty, details: 'Performance declining — increasing caution' });
  } else if (profile.trend === 'IMPROVING') {
    const boost = 5;
    conf += boost;
    totalDelta += boost;
    adjustments.push({ layer: 'SelfAware-Trend', delta: boost, details: 'Performance improving — slight confidence uplift' });
  }

  return {
    adjustedConfidence: Math.min(99, Math.max(1, Math.round(conf))),
    adjustments,
  };
}

export function shouldSelfSuppress(
  baseConfidence: number,
  regime: string,
  volatilityRegime: string,
  direction: string,
  ticker: string,
): { suppress: boolean; reason: string; confidenceOverride: number | null } {
  const profile = analyzeSelf();
  if (profile.totalPredictions < 10) return { suppress: false, reason: '', confidenceOverride: null };

  const tickerStats = profile.tickerAccuracy[ticker];
  if (tickerStats && tickerStats.total >= 10 && tickerStats.accuracy < 25) {
    return { suppress: true, reason: `Self-awareness: only ${tickerStats.accuracy}% accuracy on ${ticker} (${tickerStats.total} predictions)`, confidenceOverride: 20 };
  }

  const regimeKey = regime || 'UNKNOWN';
  const regimeStats = profile.regimeAccuracy[regimeKey];
  if (regimeStats && regimeStats.total >= 5 && regimeStats.accuracy < 20) {
    return { suppress: true, reason: `Self-awareness: only ${regimeStats.accuracy}% accuracy in ${regimeKey} regimes`, confidenceOverride: 20 };
  }

  const volatilityAdverse = profile.volatilityAccuracy['EXTREME'];
  if (volatilityRegime === 'EXTREME' && volatilityAdverse && volatilityAdverse.total >= 3 && volatilityAdverse.accuracy < 20) {
    return { suppress: true, reason: 'Self-awareness: historically poor in extreme volatility', confidenceOverride: 20 };
  }

  if (profile.trend === 'DECLINING' && profile.overallAccuracy < 35 && profile.totalPredictions >= 20) {
    return { suppress: true, reason: `Self-awareness: declining trend with ${profile.overallAccuracy}% overall accuracy`, confidenceOverride: null };
  }

  return { suppress: false, reason: '', confidenceOverride: null };
}

export function getSelfAwarenessProfile(): SelfAwarenessProfile {
  return analyzeSelf();
}

export function generateSelfReport(): string {
  const profile = analyzeSelf();
  const lines: string[] = [];
  lines.push(`=== AI Self-Awareness Report ===`);
  lines.push(`Self-Awareness Score: ${profile.selfAwarenessScore}/100`);
  lines.push(`Meta-Confidence: ${profile.metaConfidence}%`);
  lines.push(`Overall Accuracy: ${profile.overallAccuracy}% (${profile.totalPredictions} predictions)`);
  lines.push(`Calibration Gap: ${profile.confidenceCalibrationGap}% (smaller = better)`);
  lines.push(`Trend: ${profile.trend}`);
  lines.push('');
  lines.push('Diagnosis:');
  lines.push(`  ${profile.selfDiagnosis}`);
  if (profile.strengths.length > 0) {
    lines.push('');
    lines.push('Strengths:');
    for (const s of profile.strengths) lines.push(`  + ${s}`);
  }
  if (profile.weaknesses.length > 0) {
    lines.push('');
    lines.push('Weaknesses to monitor:');
    for (const w of profile.weaknesses) lines.push(`  - ${w}`);
  }
  if (profile.advice.length > 0) {
    lines.push('');
    lines.push('Advice:');
    for (const a of profile.advice) lines.push(`  * ${a}`);
  }
  return lines.join('\n');
}

export function clearSelfAwarenessCache(): void {
  cachedProfile = null;
  lastAnalysis = 0;
}
