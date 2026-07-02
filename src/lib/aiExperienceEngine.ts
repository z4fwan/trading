// Auto-learning experience engine — learns from every prediction outcome
// No fake data: all experience comes from real resolved predictions

import { heavyGet, heavySet } from './db';
import { getResolvedPredictions, getAllPredictions, addPrediction, type StoredPrediction } from './predictionStore';
import { runAILearningOnResolved } from './aiLearningIntegration';
import type { TAIndicators } from './technicalAnalysis';
import { classifyRegime } from './regimeClassifier';
import type { MarketSession } from './marketSession';

export interface ExperienceRecord {
  ticker: string;
  predictionId: string;
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  result: 'CORRECT' | 'WRONG' | 'PARTIAL';
  accuracyPercent: number;
  deviationPercent: number;
  confidence: number;
  regime: string;
  dayOfWeek: number;
  sessionLabel: string;
  rsi: number;
  adx: number;
  macdHistogram: number;
  createdAt: number;
  resolvedAt: number;
  pctChange: number;
}

export interface TickerStats {
  ticker: string;
  total: number;
  correct: number;
  partial: number;
  wrong: number;
  accuracy: number;
  avgReturn: number;
  avgConfidence: number;
  confidenceGap: number;
  bestRegime: string;
  bestSession: string;
  bestDay: string;
  recentAccuracy: number;
  trend: 'IMPROVING' | 'STABLE' | 'DECLINING';
}

export interface PatternMatch {
  pattern: string;
  similarity: number;
  pastOutcomes: { result: string; count: number; accuracy: number }[];
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  sampleSize: number;
}

export interface DailyRecommendation {
  ticker: string;
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number;
  experienceBoost: number;
  totalPatternMatches: number;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  reasoning: string[];
  regime: string;
}

const STORAGE_KEY = 'ai-experience-engine';
const MAX_RECORDS = 2000;

export function loadRecords(): ExperienceRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveRecords(records: ExperienceRecord[]) {
  try {
    const sliced = records.slice(-MAX_RECORDS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sliced));
    heavySet(STORAGE_KEY, sliced).catch(() => {});
  } catch { /* ignore */ }
}

export async function hydrateExperienceFromDB(): Promise<void> {
  try {
    const stored = await heavyGet<ExperienceRecord[]>(STORAGE_KEY);
    if (stored && stored.length > 0) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(stored)); } catch { /* ignore */ }
    }
  } catch { /* fallback to localStorage */ }
}

export function recordExperience(): { recorded: number; analyzedViaAI: number } {
  const predictions = getResolvedPredictions();
  const existing = loadRecords();
  const existingIds = new Set(existing.map(e => e.predictionId));
  let recorded = 0;

  const newRecords: ExperienceRecord[] = [];

  for (const pred of predictions) {
    if (existingIds.has(pred.id)) continue;
    if (!pred.actualPrice || pred.entryPrice <= 0) continue;

    const pctChange = ((pred.actualPrice - pred.entryPrice) / pred.entryPrice) * 100;

    newRecords.push({
      ticker: pred.ticker,
      predictionId: pred.id,
      direction: pred.direction,
      result: pred.result || 'WRONG',
      accuracyPercent: pred.accuracyPercent || 0,
      deviationPercent: pred.deviationPercent || 0,
      confidence: pred.confidence,
      regime: pred.regime || 'UNKNOWN',
      dayOfWeek: new Date(pred.createdAt).getDay(),
      sessionLabel: getSessionLabel(pred.createdAt),
      rsi: pred.taSnapshot?.rsi || 50,
      adx: pred.taSnapshot?.adx || 20,
      macdHistogram: pred.taSnapshot?.macd || 0,
      createdAt: pred.createdAt,
      resolvedAt: pred.resolvedAt || Date.now(),
      pctChange,
    });
    recorded++;
  }

  if (newRecords.length > 0) {
    saveRecords([...existing, ...newRecords]);
  }

  // Also trigger AI learning analysis
  const { analyzed, skipped } = runAILearningOnResolved();

  return { recorded, analyzedViaAI: analyzed };
}

function getSessionLabel(timestamp: number): string {
  const h = new Date(timestamp).getHours();
  if (h >= 15 && h < 16) return 'CLOSING';
  if (h >= 9 && h < 10) return 'OPENING';
  if (h >= 10 && h < 15) return 'MIDDAY';
  if (h >= 16) return 'POST_MARKET';
  return 'PRE_MARKET';
}

export function getTickerStats(ticker: string, lookbackDays = 90): TickerStats {
  const records = loadRecords()
    .filter(r => r.ticker === ticker && r.createdAt > Date.now() - lookbackDays * 86400000);

  if (records.length === 0) return createEmptyStats(ticker);

  const correct = records.filter(r => r.result === 'CORRECT');
  const partial = records.filter(r => r.result === 'PARTIAL');
  const wrong = records.filter(r => r.result === 'WRONG');
  const accuracy = records.length > 0
    ? (correct.length + partial.length * 0.5) / records.length * 100 : 0;
  const avgReturn = records.reduce((s, r) => s + r.pctChange, 0) / records.length;
  const avgConfidence = records.reduce((s, r) => s + r.confidence, 0) / records.length;

  // Per-regime accuracy
  const regimeAcc: Record<string, { total: number; correct: number }> = {};
  for (const r of records) {
    if (!regimeAcc[r.regime]) regimeAcc[r.regime] = { total: 0, correct: 0 };
    regimeAcc[r.regime].total++;
    if (r.result === 'CORRECT') regimeAcc[r.regime].correct++;
  }
  const bestRegime = Object.entries(regimeAcc)
    .filter(([_, v]) => v.total >= 2)
    .sort((a, b) => (b[1].correct / b[1].total) - (a[1].correct / a[1].total))
    .map(([k]) => k)[0] || '—';

  // Per-session accuracy
  const sessionAcc: Record<string, { total: number; correct: number }> = {};
  for (const r of records) {
    if (!sessionAcc[r.sessionLabel]) sessionAcc[r.sessionLabel] = { total: 0, correct: 0 };
    sessionAcc[r.sessionLabel].total++;
    if (r.result === 'CORRECT') sessionAcc[r.sessionLabel].correct++;
  }
  const bestSession = Object.entries(sessionAcc)
    .filter(([_, v]) => v.total >= 2)
    .sort((a, b) => (b[1].correct / b[1].total) - (a[1].correct / a[1].total))
    .map(([k]) => k)[0] || '—';

  // Per-day accuracy
  const dayAcc: Record<number, { total: number; correct: number }> = {};
  for (const r of records) {
    if (!dayAcc[r.dayOfWeek]) dayAcc[r.dayOfWeek] = { total: 0, correct: 0 };
    dayAcc[r.dayOfWeek].total++;
    if (r.result === 'CORRECT') dayAcc[r.dayOfWeek].correct++;
  }
  const bestDay = Object.entries(dayAcc)
    .filter(([_, v]) => v.total >= 2)
    .sort((a, b) => (b[1].correct / b[1].total) - (a[1].correct / a[1].total))
    .map(([k]) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][Number(k)])[0] || '—';

  // Trend
  const half = Math.floor(records.length / 2);
  const recentHalf = records.slice(-half);
  const olderHalf = records.slice(0, half);
  const recentAcc = recentHalf.length > 0
    ? recentHalf.filter(r => r.result === 'CORRECT').length / recentHalf.length * 100 : 0;
  const olderAcc = olderHalf.length > 0
    ? olderHalf.filter(r => r.result === 'CORRECT').length / olderHalf.length * 100 : 0;
  const trend: 'IMPROVING' | 'STABLE' | 'DECLINING' =
    recentAcc > olderAcc + 15 ? 'IMPROVING' : recentAcc < olderAcc - 15 ? 'DECLINING' : 'STABLE';

  const confidenceGap = Math.abs(avgConfidence - accuracy);
  const recentAccuracy = records.length >= 10
    ? records.slice(-10).filter(r => r.result === 'CORRECT').length / 10 * 100
    : accuracy;

  return {
    ticker,
    total: records.length,
    correct: correct.length,
    partial: partial.length,
    wrong: wrong.length,
    accuracy: parseFloat(accuracy.toFixed(1)),
    avgReturn: parseFloat(avgReturn.toFixed(2)),
    avgConfidence: parseFloat(avgConfidence.toFixed(1)),
    confidenceGap: parseFloat(confidenceGap.toFixed(1)),
    bestRegime,
    bestSession,
    bestDay,
    recentAccuracy: parseFloat(recentAccuracy.toFixed(1)),
    trend,
  };
}

function createEmptyStats(ticker: string): TickerStats {
  return {
    ticker, total: 0, correct: 0, partial: 0, wrong: 0,
    accuracy: 0, avgReturn: 0, avgConfidence: 0, confidenceGap: 0,
    bestRegime: '—', bestSession: '—', bestDay: '—',
    recentAccuracy: 0, trend: 'STABLE',
  };
}

export function findSimilarSetups(
  ticker: string,
  currentRsi: number,
  currentAdx: number,
  currentMacdHist: number,
  currentRegime: string,
  currentSession: string,
  currentDayOfWeek: number,
  currentDirection?: 'BULLISH' | 'BEARISH' | 'NEUTRAL',
): PatternMatch[] {
  const records = loadRecords().filter(r => r.ticker === ticker);

  if (records.length < 3) return [];

  const matches: PatternMatch[] = [];

  // Helper: match records by direction
  const dirFilter = currentDirection
    ? (r: ExperienceRecord) => r.direction === currentDirection
    : (_r: ExperienceRecord) => true;

  // Pattern 1: Similar RSI range + same regime + same direction
  const rsiRange = records.filter(r =>
    Math.abs(r.rsi - currentRsi) <= 10 &&
    r.regime === currentRegime &&
    dirFilter(r)
  );
  if (rsiRange.length >= 2) {
    const correct = rsiRange.filter(r => r.result === 'CORRECT');
    const accuracy = (correct.length / rsiRange.length) * 100;
    matches.push({
      pattern: `RSI ${currentRsi.toFixed(0)} in ${currentRegime} (${currentDirection || 'any'})`,
      similarity: 85,
      pastOutcomes: [
        { result: 'Correct', count: correct.length, accuracy },
        { result: 'Wrong', count: rsiRange.length - correct.length, accuracy: 100 - accuracy },
      ],
      recommendation: accuracy >= 60 ? 'BUY' : accuracy <= 40 ? 'SELL' : 'HOLD',
      confidence: accuracy,
      sampleSize: rsiRange.length,
    });
  }

  // Pattern 2: Same day-of-week + same direction
  const dayRecords = records.filter(r =>
    r.dayOfWeek === currentDayOfWeek &&
    dirFilter(r)
  );
  if (dayRecords.length >= 2) {
    const correct = dayRecords.filter(r => r.result === 'CORRECT');
    const accuracy = (correct.length / dayRecords.length) * 100;
    matches.push({
      pattern: `${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][currentDayOfWeek]} history (${currentDirection || 'any'})`,
      similarity: 70,
      pastOutcomes: [
        { result: 'Correct', count: correct.length, accuracy },
        { result: 'Wrong', count: dayRecords.length - correct.length, accuracy: 100 - accuracy },
      ],
      recommendation: accuracy >= 60 ? 'BUY' : accuracy <= 40 ? 'SELL' : 'HOLD',
      confidence: accuracy,
      sampleSize: dayRecords.length,
    });
  }

  // Pattern 3: Same session + same direction
  const sessionRecords = records.filter(r =>
    r.sessionLabel === currentSession &&
    dirFilter(r)
  );
  if (sessionRecords.length >= 2) {
    const correct = sessionRecords.filter(r => r.result === 'CORRECT');
    const accuracy = (correct.length / sessionRecords.length) * 100;
    matches.push({
      pattern: `${currentSession} session (${currentDirection || 'any'})`,
      similarity: 65,
      pastOutcomes: [
        { result: 'Correct', count: correct.length, accuracy },
        { result: 'Wrong', count: sessionRecords.length - correct.length, accuracy: 100 - accuracy },
      ],
      recommendation: accuracy >= 60 ? 'BUY' : accuracy <= 40 ? 'SELL' : 'HOLD',
      confidence: accuracy,
      sampleSize: sessionRecords.length,
    });
  }

  // Pattern 4: Similar ADX range + same direction
  const adxRecords = records.filter(r =>
    Math.abs(r.adx - currentAdx) <= 10 &&
    r.direction === (currentDirection || (currentMacdHist > 0 ? 'BULLISH' : 'BEARISH'))
  );
  if (adxRecords.length >= 2) {
    const correct = adxRecords.filter(r => r.result === 'CORRECT');
    const accuracy = (correct.length / adxRecords.length) * 100;
    matches.push({
      pattern: `ADX ${currentAdx.toFixed(0)} (${currentDirection || 'any'})`,
      similarity: 75,
      pastOutcomes: [
        { result: 'Correct', count: correct.length, accuracy },
        { result: 'Wrong', count: adxRecords.length - correct.length, accuracy: 100 - accuracy },
      ],
      recommendation: accuracy >= 60 ? 'BUY' : accuracy <= 40 ? 'SELL' : 'HOLD',
      confidence: accuracy,
      sampleSize: adxRecords.length,
    });
  }

  return matches.sort((a, b) => b.similarity - a.similarity).slice(0, 4);
}

export function getExperienceAdjustedConfidence(
  ticker: string,
  baseConfidence: number,
  ta: TAIndicators,
  session: { sessionLabel: string; dayOfWeek: number },
): { adjustedConfidence: number; boost: number; patterns: PatternMatch[] } {
  const stats = getTickerStats(ticker);

  // Determine current direction from TA
  const isBullish = ta.rsi > 50 && ta.supertrend.direction === 'up' && ta.macd.histogram > 0;
  const isBearish = ta.rsi < 50 && ta.supertrend.direction === 'down' && ta.macd.histogram < 0;
  const currentDirection: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = isBullish ? 'BULLISH' : isBearish ? 'BEARISH' : 'NEUTRAL';

  const patterns = findSimilarSetups(
    ticker, ta.rsi, ta.adx, ta.macd.histogram,
    classifyRegime(ta, []).regime,
    session.sessionLabel,
    session.dayOfWeek,
    currentDirection,
  );

  let boost = 0;

  // Boost/penalty based on historical accuracy
  if (stats.total >= 3) {
    if (stats.accuracy > 65) boost += 8;
    else if (stats.accuracy < 35) boost -= 10;
    if (stats.trend === 'IMPROVING') boost += 5;
    else if (stats.trend === 'DECLINING') boost -= 5;
  }

  // Boost from matching patterns — direction-aware
  for (const p of patterns) {
    const patternDirection = p.pattern.includes('BULLISH') ? 'BULLISH' : p.pattern.includes('BEARISH') ? 'BEARISH' : null;
    if (patternDirection && patternDirection !== currentDirection) continue; // skip if direction mismatch in pattern label
    if (p.confidence >= 60 && p.recommendation !== 'HOLD') boost += 3;
    else if (p.confidence <= 35 && p.recommendation !== 'HOLD') boost -= 3;
  }

  // Cap adjustment
  boost = Math.max(-20, Math.min(20, boost));
  const adjustedConfidence = Math.max(5, Math.min(95, baseConfidence + boost));

  return { adjustedConfidence: Math.round(adjustedConfidence), boost, patterns };
}

export function getDailyRecommendations(
  tickers: string[],
  prices: Record<string, { price: number; name: string }>,
  taData: Record<string, TAIndicators>,
  session: { sessionLabel: string; dayOfWeek: number },
): DailyRecommendation[] {
  const results: DailyRecommendation[] = [];

  for (const ticker of tickers) {
    const ta = taData[ticker];
    const priceData = prices[ticker];
    if (!ta || !priceData || priceData.price <= 0) continue;

    const price = priceData.price;
    const regime = classifyRegime(ta, []);
    const { adjustedConfidence, boost, patterns } = getExperienceAdjustedConfidence(
      ticker, 50, ta, session,
    );

    const isBullish = ta.rsi > 50 && ta.supertrend.direction === 'up' && ta.macd.histogram > 0;
    const isBearish = ta.rsi < 50 && ta.supertrend.direction === 'down' && ta.macd.histogram < 0;
    const direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = isBullish ? 'BULLISH' : isBearish ? 'BEARISH' : 'NEUTRAL';

    const atrMultiple = ta.atr * 1.5;
    const targetPrice = direction === 'BULLISH' ? price + atrMultiple : direction === 'BEARISH' ? price - atrMultiple : price;
    const stopLoss = direction === 'BULLISH' ? price - ta.atr : direction === 'BEARISH' ? price + ta.atr : price;

    const reasoning: string[] = [];
    if (ta.rsi > 50 && ta.rsi < 70) reasoning.push(`RSI ${ta.rsi.toFixed(0)} — bullish momentum`);
    else if (ta.rsi < 35) reasoning.push(`RSI ${ta.rsi.toFixed(0)} — oversold bounce zone`);
    else if (ta.rsi > 70) reasoning.push(`RSI ${ta.rsi.toFixed(0)} — overbought, caution`);

    if (ta.adx > 25) reasoning.push(`ADX ${ta.adx.toFixed(0)} — trending market`);
    else reasoning.push(`ADX ${ta.adx.toFixed(0)} — ranging, expect consolidation`);

    if (ta.supertrend.direction === 'up') reasoning.push('Supertrend bullish — uptrend intact');
    else reasoning.push('Supertrend bearish — downtrend in play');

    if (patterns.length > 0) {
      const best = patterns[0];
      reasoning.push(`Experience: ${best.sampleSize} similar setups → ${best.confidence.toFixed(0)}% accuracy (${best.pattern})`);
    }

    // Add experience-based reasoning
    const stats = getTickerStats(ticker);
    if (stats.total >= 3) {
      reasoning.push(`AI track record: ${stats.accuracy}% accuracy (${stats.total} predictions, trend ${stats.trend})`);
    }

    results.push({
      ticker,
      direction,
      confidence: adjustedConfidence,
      experienceBoost: boost,
      totalPatternMatches: patterns.length,
      entryPrice: price,
      targetPrice: parseFloat(targetPrice.toFixed(2)),
      stopLoss: parseFloat(stopLoss.toFixed(2)),
      reasoning,
      regime: regime.regime,
    });
  }

  return results.sort((a, b) => {
    // Sort by confidence descending, but prefer BUY/SELL over NEUTRAL
    const dirScore = (d: string) => d === 'BULLISH' ? 2 : d === 'BEARISH' ? 2 : 1;
    return (b.confidence * dirScore(b.direction)) - (a.confidence * dirScore(a.direction));
  });
}

export function getTotalRecords(): number {
  return loadRecords().length;
}

export function getAllTickerStats(): TickerStats[] {
  const records = loadRecords();
  const tickers = [...new Set(records.map(r => r.ticker))];
  return tickers.map(t => getTickerStats(t)).sort((a, b) => b.total - a.total);
}

export function getOverallStats(): {
  totalPredictions: number;
  overallAccuracy: number;
  totalTickers: number;
  avgReturnPerTrade: number;
  bestPerformingTicker: string;
} {
  const records = loadRecords();
  if (records.length === 0) return { totalPredictions: 0, overallAccuracy: 0, totalTickers: 0, avgReturnPerTrade: 0, bestPerformingTicker: '—' };

  const correct = records.filter(r => r.result === 'CORRECT');
  const overallAccuracy = (correct.length / records.length) * 100;
  const tickers = [...new Set(records.map(r => r.ticker))];
  const avgReturn = records.reduce((s, r) => s + r.pctChange, 0) / records.length;

  const tickerAcc = tickers.map(t => {
    const tRecs = records.filter(r => r.ticker === t);
    return { ticker: t, acc: tRecs.filter(r => r.result === 'CORRECT').length / tRecs.length * 100 };
  }).sort((a, b) => b.acc - a.acc);

  return {
    totalPredictions: records.length,
    overallAccuracy: parseFloat(overallAccuracy.toFixed(1)),
    totalTickers: tickers.length,
    avgReturnPerTrade: parseFloat(avgReturn.toFixed(2)),
    bestPerformingTicker: tickerAcc.length > 0 ? tickerAcc[0].ticker : '—',
  };
}
