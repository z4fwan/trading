import { heavyGet, heavySet } from './db';
import type { AIFullSnapshot } from './ai/types';
import { HIGH_CONF_THRESHOLD } from './confidenceConfig';

export interface TASnapshot {
  rsi: number; macd: number; adx: number; bollingerWidth: number;
  atr: number; stochRsi: number; supertrendDirection: string;
}

export interface FailureAnalysis {
  primaryReason: string;
  secondaryReasons: string[];
  volatilitySpike: boolean;
  newsEvent: boolean;
  regimeChange: boolean;
  momentumFailure: boolean;
  resistanceRejection: boolean;
  earningsImpact: boolean;
  institutionalSelling: boolean;
  lowLiquidity: boolean;
  sentimentReversal?: boolean;
  fakeBreakout?: boolean;
  weakTrend?: boolean;
  detail: string;
}

export type ResolutionResult = 'CORRECT' | 'WRONG' | 'PARTIAL';

import { ModelVersionInfo } from './modelRegistry';
import { MarketState } from './marketStateController';

export interface StoredPrediction {
  id: string;
  ticker: string;
  name: string;
  source: 'AI_QUANT' | 'WEEKLY_PREDICTIONS';
  createdAt: number;
  predictionType: 'HOURLY' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'CUSTOM';
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  bullishProb: number;
  bearishProb: number;
  confidence: number;
  entryPrice: number;
  targetPrice: number;
  stopLoss?: number;
  expectedVolatility: number;
  marketCondition: string;
  regime: string;
  taSnapshot: TASnapshot | null;
  sentimentScore: number;
  reasoning: string[];
  
  // -- Evaluation Discipline Updates --
  modelVersion?: ModelVersionInfo;
  marketState?: MarketState;
  expectedReturn?: number;
  expectedDrawdown?: number;
  riskRewardRatio?: number;
  reliability?: 'A' | 'B' | 'C';
  reviewStatus?: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'AUTO';

  dailyDirection?: string;
  dailyConfidence?: number;
  weeklyDirection?: string;
  weeklyConfidence?: number;
  signalQuality?: string;
  targetDate: string;
  expiryDate: string;
  resolved: boolean;
  resolvedAt?: number;
  actualPrice?: number;
  result?: ResolutionResult;
  accuracyPercent?: number;
  deviationPercent?: number;
  failureAnalysis?: FailureAnalysis;
  // Full TA snapshot for AI learning
  fullSnapshot?: AIFullSnapshot;
  // AI learning extended fields (populated after self-analysis)
  selfAnalysis?: { confidenceWasJustified: boolean; indicatorsHelped: string[]; indicatorsFailed: string[]; volatilityUnderestimated: boolean; sentimentReversed: boolean; regimeWasUnstable: boolean; confidenceTooAggressive: boolean; overallAssessment: string; lessonLearned: string };
  strongestIndicators?: string[];
  conflictingIndicators?: string[];
}

export interface TrustMetrics {
  totalPredictions: number;
  successfulPredictions: number;
  failedPredictions: number;
  partialPredictions: number;
  pendingResolutions: number;
  hourlyAccuracy: number;
  dailyAccuracy: number;
  weeklyAccuracy: number;
  monthlyAccuracy: number;
  confidenceReliability: number;
  sectorAccuracy: Record<string, { total: number; correct: number; accuracy: number }>;
  avgAccuracy: number;
  avgDeviation: number;
  trustScore: number;
  avgConfidence: number;
  confidenceAccuracyGap: number;
  bestSectors: string[];
  weakestSectors: string[];
  trend: 'IMPROVING' | 'STABLE' | 'DECLINING';
  avgPnL: number;
}

const STORAGE_KEY = 'opencode_prediction_store';
const MAX_PREDICTIONS = 500;
let cache: StoredPrediction[] | null = null;

function load(): StoredPrediction[] {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      cache = JSON.parse(raw) as StoredPrediction[];
    }
  } catch { /* ignore */ }
  cache = cache || [];
  return cache;
}

function save(predictions: StoredPrediction[]): void {
  const capped = predictions.slice(-MAX_PREDICTIONS);
  cache = capped;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(capped));
  } catch { /* ignore */ }
}

function predictionKey(p: { ticker: string; predictionType: string; direction: string; confidence: number; entryPrice: number }): string {
  return `${p.ticker}|${p.predictionType}|${p.direction}|${p.confidence}|${p.entryPrice.toFixed(2)}`;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getDateKey(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
}

export function getExpiryDate(type: 'HOURLY' | 'DAILY' | 'WEEKLY' | 'MONTHLY'): string {
  const d = new Date();
  if (type === 'HOURLY') d.setMinutes(d.getMinutes() + 15);
  else if (type === 'DAILY') d.setDate(d.getDate() + 1);
  else if (type === 'WEEKLY') d.setDate(d.getDate() + 7);
  else d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

function isDuplicate(existing: StoredPrediction[], input: { ticker: string; predictionType: string; direction: string; confidence: number; entryPrice: number }): boolean {
  const key = predictionKey(input);
  const oneHourAgo = Date.now() - 3600000;
  return existing.some(e => e.createdAt > oneHourAgo && predictionKey(e) === key);
}

export function addPrediction(
  input: Omit<StoredPrediction, 'id' | 'createdAt' | 'resolved' | 'accuracyPercent' | 'deviationPercent'>,
): StoredPrediction | null {
  const predictions = load();
  if (isDuplicate(predictions, input)) return null;
  const record: StoredPrediction = {
    ...input,
    id: generateId(),
    createdAt: Date.now(),
    resolved: false,
  };
  predictions.push(record);
  save(predictions);
  return record;
}

export function addPredictions(
  inputs: Omit<StoredPrediction, 'id' | 'createdAt' | 'resolved' | 'accuracyPercent' | 'deviationPercent'>[],
): StoredPrediction[] {
  const predictions = load();
  const records: StoredPrediction[] = [];
  for (const input of inputs) {
    if (isDuplicate(predictions, input)) continue;
    const record: StoredPrediction = {
      ...input,
      id: generateId(),
      createdAt: Date.now(),
      resolved: false,
    };
    records.push(record);
    predictions.push(record);
  }
  if (records.length > 0) save(predictions);
  return records;
}

export function resolvePending(stockPrices: Record<string, { price: number }>): StoredPrediction[] {
  const predictions = load();
  const now = new Date();
  let changed = false;

  const updated = predictions.map(p => {
    const expiryDate = new Date(p.expiryDate);
    if (p.resolved || expiryDate > now || p.entryPrice <= 0) return p;
    const current = stockPrices[p.ticker];
    if (!current || current.price <= 0) return p;

    const actualPrice = current.price;
    const expectedDir = p.direction;
    const actualDir = actualPrice >= p.entryPrice ? 'BULLISH' : actualPrice <= p.entryPrice ? 'BEARISH' : 'NEUTRAL';
    const directionalCorrect = expectedDir === actualDir || expectedDir === 'NEUTRAL';
    const pctChange = ((actualPrice - p.entryPrice) / p.entryPrice) * 100;
    const expectedPct = p.targetPrice > 0 ? ((p.targetPrice - p.entryPrice) / p.entryPrice) * 100 : 0;
    const deviation = Math.abs(pctChange - expectedPct);

    let result: ResolutionResult;
    if (directionalCorrect && deviation < 1.0) result = 'CORRECT';
    else if (directionalCorrect && deviation < 2.5) result = 'PARTIAL';
    else if (!directionalCorrect) result = 'WRONG';
    else result = deviation < 2.5 ? 'PARTIAL' : 'WRONG';

    const accuracyPct = Math.max(0, 100 - deviation * 10);

    changed = true;
    return {
      ...p,
      resolved: true,
      resolvedAt: Date.now(),
      actualPrice,
      result,
      accuracyPercent: parseFloat(accuracyPct.toFixed(1)),
      deviationPercent: parseFloat(deviation.toFixed(1)),
      failureAnalysis: result !== 'CORRECT' ? generateFailureAnalysis(p, actualPrice) : undefined,
    };
  });

  if (changed) save(updated);
  return updated;
}

export function generateFailureAnalysis(
  pred: StoredPrediction, actualPrice: number,
): FailureAnalysis {
  const pctChange = ((actualPrice - pred.entryPrice) / pred.entryPrice) * 100;
  const reasons: string[] = [];
  let primaryReason = 'Unexpected market movement';
  let volatilitySpike = false, newsEvent = false, regimeChange = false;
  let momentumFailure = false; let resistanceRejection = false;
  let earningsImpact = false; let institutionalSelling = false; let lowLiquidity = false;

  const absMove = Math.abs(pctChange);
  const expectedMove = pred.targetPrice > 0 ? Math.abs((pred.targetPrice - pred.entryPrice) / pred.entryPrice) * 100 : 2;

  if (absMove > expectedMove * 2) {
    volatilitySpike = true;
    primaryReason = 'Unexpected market volatility exceeded predicted range';
    reasons.push(`Actual move (${absMove.toFixed(1)}%) was ${(absMove / expectedMove).toFixed(1)}x the expected range`);
  }

  if (pred.regime === 'RANGING' && absMove > 5) {
    regimeChange = true;
    primaryReason = 'Market regime changed from ranging to trending unexpectedly';
    reasons.push(`Price broke out of ${pred.regime} regime with ${absMove.toFixed(1)}% move`);
  }

  if (pctChange < 0 && pred.direction === 'BULLISH') {
    if (absMove > 3) {
      reasons.push('Bearish momentum overwhelmed the predicted bullish setup');
      momentumFailure = true;
    }
    if (pred.taSnapshot && actualPrice > pred.taSnapshot.atr * 2) {
      reasons.push('Institutional selling pressure detected above key resistance');
      institutionalSelling = true;
    }
  }

  if (pctChange > 0 && pred.direction === 'BEARISH') {
    if (absMove > 3) {
      reasons.push('Bullish momentum invalidated the bearish thesis');
      momentumFailure = true;
    }
  }

  // Check for relevant news events
  try {
    const newsRaw = typeof localStorage !== 'undefined' ? localStorage.getItem('news-store') : null;
    if (newsRaw) {
      const newsEvents: { tickers: string[]; sentiment: string; impactScore: number; timestamp: number }[] = JSON.parse(newsRaw) || [];
      const recentNews = newsEvents.filter(n =>
        n.tickers?.includes(pred.ticker) && n.timestamp > pred.createdAt
      );
      if (recentNews.length > 0) {
        newsEvent = true;
        const avgSentiment = recentNews.reduce((s, n) => {
          return s + (n.sentiment === 'BULLISH' ? n.impactScore : n.sentiment === 'BEARISH' ? -n.impactScore : 0);
        }, 0) / recentNews.length;
        primaryReason = avgSentiment > 20 ? 'News sentiment reversal impacted price action' : 'News events affected market direction';
        reasons.push(`${recentNews.length} news event(s) detected for ${pred.ticker} during prediction period`);
      }
    }
  } catch { /* ignore localStorage errors */ }

  // Resistance rejection: price reversed near known resistance level
  if (pred.fullSnapshot && pred.fullSnapshot.distToResistance < 3 && pred.fullSnapshot.distToResistance > 0) {
    if ((pctChange < 0 && pred.direction === 'BULLISH') || (pctChange > 0 && pred.direction === 'BEARISH')) {
      resistanceRejection = true;
      reasons.push(`Price reversed near resistance (${pred.fullSnapshot.distToResistance.toFixed(1)}% from level)`);
    }
  }

  // Earnings impact: check if prediction period overlaps with earnings season (month-end or quarter-end)
  const predMonth = new Date(pred.createdAt).getMonth();
  const expiryMonth = new Date(pred.expiryDate).getMonth();
  if (predMonth !== expiryMonth || [2, 5, 8, 11].includes(expiryMonth)) {
    earningsImpact = true;
    if (!reasons.some(r => r.includes('earnings'))) {
      reasons.push('Prediction spans earnings season — unexpected earnings-driven move possible');
    }
  }

  // Low liquidity: check volume ratio from full snapshot
  if (pred.fullSnapshot && pred.fullSnapshot.volumeRatio < 0.5) {
    lowLiquidity = true;
    if (!reasons.some(r => r.includes('volume'))) {
      reasons.push('Low relative volume — reduced liquidity may have amplified price move');
    }
  }

  if (reasons.length === 0) {
    if (pctChange > 0) {
      reasons.push('Bullish momentum was stronger than anticipated');
      momentumFailure = true;
    } else {
      reasons.push('Downside pressure exceeded forecast parameters');
      momentumFailure = true;
    }
  }

  const detail = reasons.length > 0
    ? `Predicted ${pred.direction.toLowerCase()} direction with ${pred.confidence}% confidence. Actual move: ${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(2)}%. ${reasons[0]}${reasons.length > 1 ? ' Contributing factors: ' + reasons.slice(1).join(', ') + '.' : ''}`
    : `Actual move of ${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(2)}% did not align with prediction direction.`;

  return {
    primaryReason,
    secondaryReasons: reasons.slice(1),
    volatilitySpike, newsEvent, regimeChange, momentumFailure,
    resistanceRejection, earningsImpact, institutionalSelling, lowLiquidity,
    detail,
  };
}

export function getAllPredictions(): StoredPrediction[] {
  return load();
}

export function getPendingResolutions(): StoredPrediction[] {
  return load().filter(p => !p.resolved);
}

export function getResolvedPredictions(): StoredPrediction[] {
  return load().filter(p => p.resolved);
}

export function getPrediction(id: string): StoredPrediction | undefined {
  return load().find(p => p.id === id);
}

export function getPredictionsByTicker(ticker: string): StoredPrediction[] {
  return load().filter(p => p.ticker === ticker);
}

export function clearAll(): void {
  cache = null;
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

export function computeTrustMetrics(resolved?: StoredPrediction[]): TrustMetrics {
  const all = load();
  const resolvedList = resolved || all.filter(p => p.resolved);
  const pending = all.filter(p => !p.resolved);
  const total = all.length;

  const correct = resolvedList.filter(p => p.result === 'CORRECT');
  const wrong = resolvedList.filter(p => p.result === 'WRONG');
  const partial = resolvedList.filter(p => p.result === 'PARTIAL');

  const resolvedCount = resolvedList.length;
  const avgAccuracy = resolvedCount > 0
    ? resolvedList.reduce((s, p) => s + (p.accuracyPercent || 0), 0) / resolvedCount
    : 0;
  const avgDeviation = resolvedCount > 0
    ? resolvedList.reduce((s, p) => s + (p.deviationPercent || 0), 0) / resolvedCount
    : 0;

  // Per-type accuracy
  const hourlyResolved = resolvedList.filter(p => p.predictionType === 'HOURLY');
  const dailyResolved = resolvedList.filter(p => p.predictionType === 'DAILY');
  const weeklyResolved = resolvedList.filter(p => p.predictionType === 'WEEKLY');
  const monthlyResolved = resolvedList.filter(p => p.predictionType === 'MONTHLY');

  const hourlyAccuracy = hourlyResolved.length > 0
    ? (hourlyResolved.filter(p => p.result === 'CORRECT' || p.result === 'PARTIAL').length / hourlyResolved.length) * 100
    : 0;
  const dailyAccuracy = dailyResolved.length > 0
    ? (dailyResolved.filter(p => p.result === 'CORRECT' || p.result === 'PARTIAL').length / dailyResolved.length) * 100
    : 0;
  const weeklyAccuracy = weeklyResolved.length > 0
    ? (weeklyResolved.filter(p => p.result === 'CORRECT' || p.result === 'PARTIAL').length / weeklyResolved.length) * 100
    : 0;
  const monthlyAccuracy = monthlyResolved.length > 0
    ? (monthlyResolved.filter(p => p.result === 'CORRECT' || p.result === 'PARTIAL').length / monthlyResolved.length) * 100
    : 0;

  // Sector accuracy
  const sectorAccuracy: Record<string, { total: number; correct: number; accuracy: number }> = {};
  for (const p of resolvedList) {
    if (!sectorAccuracy[p.ticker]) sectorAccuracy[p.ticker] = { total: 0, correct: 0, accuracy: 0 };
    sectorAccuracy[p.ticker].total++;
    if (p.result === 'CORRECT' || p.result === 'PARTIAL') sectorAccuracy[p.ticker].correct++;
  }
  for (const [ticker, stats] of Object.entries(sectorAccuracy)) {
    stats.accuracy = stats.total > 0 ? (stats.correct / stats.total) * 100 : 0;
  }

  // Confidence reliability: how often high-confidence predictions succeed
  const highConfPreds = resolvedList.filter(p => p.confidence >= HIGH_CONF_THRESHOLD);
  const highConfCorrect = highConfPreds.filter(p => p.result === 'CORRECT');
  const highConfReliability = highConfPreds.length > 0
    ? (highConfCorrect.length / highConfPreds.length) * 100
    : 0;

  // Overall trust score: weighted composite
  const resolutionRate = total > 0 ? (resolvedCount / total) * 100 : 0;
  const directionalAccuracy = resolvedCount > 0
    ? (correct.length / resolvedCount) * 100
    : 0;
  const trustScore = parseFloat((
    directionalAccuracy * 0.35 +
    highConfReliability * 0.25 +
    avgAccuracy * 0.2 +
    resolutionRate * 0.1 +
    Math.max(0, 100 - avgDeviation) * 0.1
  ).toFixed(1));

  const avgConfidence = resolvedCount > 0
    ? resolvedList.reduce((s, p) => s + p.confidence, 0) / resolvedCount
    : 0;
  const confidenceAccuracyGap = Math.abs(avgConfidence - directionalAccuracy);

  // Best/worst sectors
  const sortedSectors = Object.entries(sectorAccuracy).sort((a, b) => b[1].accuracy - a[1].accuracy);
  const bestSectors = sortedSectors.filter(([_, s]) => s.total >= 2).slice(0, 3).map(([t]) => t);
  const weakestSectors = sortedSectors.filter(([_, s]) => s.total >= 2).reverse().slice(0, 3).map(([t]) => t);

  // Trend: compare recent vs older predictions
  // Require at least 3 older samples to avoid statistical bias from sparse data
  const recent = resolvedList.filter(p => p.createdAt > Date.now() - 7 * 24 * 60 * 60 * 1000);
  const older = resolvedList.filter(p => p.createdAt <= Date.now() - 7 * 24 * 60 * 60 * 1000);
  const olderEnough = older.length >= 3;
  const recentAccuracy = recent.length > 0 ? (recent.filter(p => p.result === 'CORRECT' || p.result === 'PARTIAL').length / recent.length) * 100 : 0;
  const olderAccuracy = olderEnough ? (older.filter(p => p.result === 'CORRECT' || p.result === 'PARTIAL').length / older.length) * 100 : -1;
  const trend: 'IMPROVING' | 'STABLE' | 'DECLINING' = !olderEnough ? 'STABLE' : recentAccuracy > olderAccuracy + 10 ? 'IMPROVING' : recentAccuracy < olderAccuracy - 10 ? 'DECLINING' : 'STABLE';

  // Avg PnL
  const avgPnL = resolvedCount > 0
    ? resolvedList.reduce((s, p) => {
        if (p.actualPrice && p.entryPrice > 0) return s + ((p.actualPrice - p.entryPrice) / p.entryPrice) * 100;
        return s;
      }, 0) / resolvedCount
    : 0;

  return {
    totalPredictions: total,
    successfulPredictions: correct.length,
    failedPredictions: wrong.length,
    partialPredictions: partial.length,
    pendingResolutions: pending.length,
    hourlyAccuracy: parseFloat(hourlyAccuracy.toFixed(1)),
    dailyAccuracy: parseFloat(dailyAccuracy.toFixed(1)),
    weeklyAccuracy: parseFloat(weeklyAccuracy.toFixed(1)),
    monthlyAccuracy: parseFloat(monthlyAccuracy.toFixed(1)),
    confidenceReliability: parseFloat(highConfReliability.toFixed(1)),
    sectorAccuracy,
    avgAccuracy: parseFloat(avgAccuracy.toFixed(1)),
    avgDeviation: parseFloat(avgDeviation.toFixed(1)),
    trustScore: Math.min(100, Math.max(0, trustScore)),
    avgConfidence: parseFloat(avgConfidence.toFixed(1)),
    confidenceAccuracyGap: parseFloat(confidenceAccuracyGap.toFixed(1)),
    bestSectors,
    weakestSectors,
    trend,
    avgPnL: parseFloat(avgPnL.toFixed(2)),
  };
}

const ARCHIVE_KEY = 'resolved_predictions_archive';

export async function archiveOldResolvedPredictions(daysOld = 7): Promise<number> {
  const predictions = load();
  const cutoff = Date.now() - daysOld * 86400000;
  const toArchive = predictions.filter(p => p.resolved && p.resolvedAt && p.resolvedAt < cutoff);
  if (toArchive.length === 0) return 0;
  const existing = await heavyGet<StoredPrediction[]>(ARCHIVE_KEY);
  const merged = [...(existing || []), ...toArchive];
  await heavySet(ARCHIVE_KEY, merged);
  const remaining = predictions.filter(p => !toArchive.includes(p));
  save(remaining);
  return toArchive.length;
}

export async function getArchivedPredictions(): Promise<StoredPrediction[]> {
  return (await heavyGet<StoredPrediction[]>(ARCHIVE_KEY)) || [];
}

export async function getAllPredictionsWithArchive(): Promise<StoredPrediction[]> {
  const active = load();
  const archived = await getArchivedPredictions();
  return [...active, ...archived];
}
