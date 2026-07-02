import { getResolvedPredictions, type StoredPrediction } from './predictionStore';
import { loadRecords, type ExperienceRecord } from './aiExperienceEngine';

// === Multi-dimensional feature vector for similarity comparison ===
export interface MarketFeatureVector {
  rsi: number;
  macdHistogram: number;
  adx: number;
  bollingerWidth: number;
  atrPercent: number;
  volumeRatio: number;
  sentimentScore: number;
  regimeCode: number;
  sessionCode: number;
  dayOfWeek: number;
  stochasticRsi?: number;
  priceVsVwap?: number;
  distanceToSupport?: number;
  distanceToResistance?: number;
  momentumScore?: number;
  trendStrengthScore?: number;
}

export interface SimilarHistoricalMatch {
  predictionId: string;
  ticker: string;
  direction: string;
  result: string;
  confidence: number;
  accuracyPercent: number;
  deviationPercent: number;
  pctChange: number;
  regime: string;
  sessionLabel: string;
  similarityScore: number;
  featureContributions: { feature: string; contribution: number }[];
}

export interface SimilarityResult {
  matches: SimilarHistoricalMatch[];
  overallWinRate: number;
  avgAccuracy: number;
  avgDeviation: number;
  avgReturn: number;
  matchCount: number;
  confidence: number;
}

// === Feature weights: which dimensions matter most for similarity ===
const FEATURE_WEIGHTS: Record<string, number> = {
  rsi: 0.18,
  macdHistogram: 0.12,
  adx: 0.15,
  bollingerWidth: 0.10,
  atrPercent: 0.08,
  volumeRatio: 0.08,
  sentimentScore: 0.07,
  regimeCode: 0.10,
  sessionCode: 0.04,
  dayOfWeek: 0.03,
  stochasticRsi: 0.05,
};

export function buildFeatureVector(
  rsi: number,
  macdHistogram: number,
  adx: number,
  bollingerWidth: number,
  atr: number,
  price: number,
  volumeRatio: number,
  sentimentScore: number,
  regime: string,
  sessionLabel: string,
  dayOfWeek: number,
  stochasticRsi?: number,
  priceVsVwap?: number,
  distToSupport?: number,
  distToResistance?: number,
): MarketFeatureVector {
  return {
    rsi: rsi / 100,
    macdHistogram: clamp(macdHistogram / 10, -1, 1),
    adx: adx / 100,
    bollingerWidth: clamp(bollingerWidth / 20, 0, 1),
    atrPercent: price > 0 ? clamp(((atr / price) * 100) / 5, 0, 1) : 0,
    volumeRatio: clamp(volumeRatio / 5, 0, 1),
    sentimentScore: clamp((sentimentScore + 100) / 200, 0, 1),
    regimeCode: regimeToCode(regime),
    sessionCode: sessionToCode(sessionLabel),
    dayOfWeek: dayOfWeek / 6,
    stochasticRsi: stochasticRsi != null ? clamp(stochasticRsi / 100, 0, 1) : undefined,
    priceVsVwap: priceVsVwap != null ? clamp(priceVsVwap / 0.1, -1, 1) : undefined,
    distanceToSupport: distToSupport != null ? clamp(distToSupport / 0.1, 0, 1) : undefined,
    distanceToResistance: distToResistance != null ? clamp(distToResistance / 0.1, 0, 1) : undefined,
  };
}

function regimeToCode(regime: string): number {
  const map: Record<string, number> = {
    BULLISH_TREND: 0.9, BEARISH_TREND: 0.1, RANGING: 0.5,
    PANIC_VOLATILITY: 0.0, BREAKOUT_EXPANSION: 0.8,
    ACCUMULATION: 0.7, DISTRIBUTION: 0.2,
    LOW_LIQUIDITY: 0.3, HIGH_MOMENTUM: 0.85,
    STRONG_TREND: 0.85, WEAK_TREND: 0.35,
    HIGH_VOLATILITY: 0.15, PANIC: 0.0,
  };
  return map[regime] ?? 0.5;
}

function sessionToCode(session: string): number {
  const map: Record<string, number> = {
    OPENING: 0.8, MIDDAY: 0.5, CLOSING: 0.7,
    PRE_MARKET: 0.2, POST_MARKET: 0.3,
  };
  return map[session] ?? 0.5;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// === Compute cosine similarity with weighted dimensions ===
function computeWeightedSimilarity(
  a: MarketFeatureVector,
  b: MarketFeatureVector,
): { similarity: number; contributions: { feature: string; contribution: number }[] } {
  const features = Object.keys(FEATURE_WEIGHTS) as (keyof MarketFeatureVector)[];
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  const contributions: { feature: string; contribution: number }[] = [];

  for (const feature of features) {
    const w = FEATURE_WEIGHTS[feature];
    const va = a[feature] ?? 0.5;
    const vb = b[feature] ?? 0.5;
    const weightedA = va * w;
    const weightedB = vb * w;
    dotProduct += weightedA * weightedB;
    normA += weightedA * weightedA;
    normB += weightedB * weightedB;

    const diff = Math.abs(va - vb);
    const contribution = (1 - diff) * w * 100;
    contributions.push({ feature, contribution });
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  const similarity = denom > 0 ? dotProduct / denom : 0;
  contributions.sort((a, b) => b.contribution - a.contribution);

  return { similarity: Math.round(similarity * 100), contributions };
}

// === Build feature vector from an experience record ===
function vectorFromExperience(r: ExperienceRecord): MarketFeatureVector {
  return {
    rsi: (r.rsi || 50) / 100,
    macdHistogram: clamp((r.macdHistogram || 0) / 10, -1, 1),
    adx: (r.adx || 20) / 100,
    bollingerWidth: 0.5,
    atrPercent: 0.5,
    volumeRatio: 0.5,
    sentimentScore: 0.5,
    regimeCode: regimeToCode(r.regime),
    sessionCode: sessionToCode(r.sessionLabel),
    dayOfWeek: r.dayOfWeek / 6,
  };
}

// === Build feature vector from a stored prediction ===
function vectorFromPrediction(p: StoredPrediction): MarketFeatureVector {
  const ts = p.taSnapshot;
  return {
    rsi: ts ? ts.rsi / 100 : 0.5,
    macdHistogram: ts ? clamp(ts.macd / 10, -1, 1) : 0.5,
    adx: ts ? ts.adx / 100 : 0.5,
    bollingerWidth: ts ? clamp(ts.bollingerWidth / 20, 0, 1) : 0.5,
    atrPercent: 0.5,
    volumeRatio: 0.5,
    sentimentScore: clamp((p.sentimentScore + 100) / 200, 0, 1),
    regimeCode: regimeToCode(p.regime),
    sessionCode: 0.5,
    dayOfWeek: new Date(p.createdAt).getDay() / 6,
  };
}

// === Main similarity search — find top-N historical matches ===
export function findHistoricalMatches(
  currentVector: MarketFeatureVector,
  ticker?: string,
  lookbackDays = 365,
  maxResults = 20,
  minSimilarity = 40,
): SimilarityResult {
  const cutoff = Date.now() - lookbackDays * 86400000;

  // Collect both experience records and resolved predictions
  const candidates: { vector: MarketFeatureVector; match: SimilarHistoricalMatch }[] = [];

  // From experience records
  const experiences = loadRecords().filter(r => r.createdAt > cutoff);
  for (const r of experiences) {
    if (ticker && r.ticker !== ticker) continue;
    const vec = vectorFromExperience(r);
    candidates.push({
      vector: vec,
      match: {
        predictionId: r.predictionId,
        ticker: r.ticker,
        direction: r.direction,
        result: r.result,
        confidence: r.confidence,
        accuracyPercent: r.accuracyPercent,
        deviationPercent: r.deviationPercent,
        pctChange: r.pctChange,
        regime: r.regime,
        sessionLabel: r.sessionLabel,
        similarityScore: 0,
        featureContributions: [],
      },
    });
  }

  // From resolved predictions
  const predictions = getResolvedPredictions().filter(p => p.createdAt > cutoff);
  for (const p of predictions) {
    if (ticker && p.ticker !== ticker) continue;
    const vec = vectorFromPrediction(p);
    const pnl = p.actualPrice && p.entryPrice
      ? ((p.actualPrice - p.entryPrice) / p.entryPrice) * 100 : 0;
    candidates.push({
      vector: vec,
      match: {
        predictionId: p.id,
        ticker: p.ticker,
        direction: p.direction,
        result: p.result || 'UNKNOWN',
        confidence: p.confidence,
        accuracyPercent: p.accuracyPercent || 0,
        deviationPercent: p.deviationPercent || 0,
        pctChange: pnl,
        regime: p.regime,
        sessionLabel: 'MIDDAY',
        similarityScore: 0,
        featureContributions: [],
      },
    });
  }

  if (candidates.length === 0) {
    return { matches: [], overallWinRate: 0, avgAccuracy: 0, avgDeviation: 0, avgReturn: 0, matchCount: 0, confidence: 0 };
  }

  // Score all candidates
  const scored = candidates.map(c => {
    const { similarity, contributions } = computeWeightedSimilarity(currentVector, c.vector);
    return { ...c.match, similarityScore: similarity, featureContributions: contributions };
  });

  const matches = scored
    .filter(m => m.similarityScore >= minSimilarity)
    .sort((a, b) => b.similarityScore - a.similarityScore)
    .slice(0, maxResults);

  if (matches.length === 0) {
    return { matches: [], overallWinRate: 0, avgAccuracy: 0, avgDeviation: 0, avgReturn: 0, matchCount: 0, confidence: 0 };
  }

  const corrected = matches.filter(m => m.result === 'CORRECT');
  const partiallyCorrect = matches.filter(m => m.result === 'PARTIAL');
  const winRate = (corrected.length + partiallyCorrect.length * 0.5) / matches.length * 100;
  const avgAccuracy = matches.reduce((s, m) => s + m.accuracyPercent, 0) / matches.length;
  const avgDeviation = matches.reduce((s, m) => s + m.deviationPercent, 0) / matches.length;
  const avgReturn = matches.reduce((s, m) => s + m.pctChange, 0) / matches.length;
  const avgSimilarity = matches.reduce((s, m) => s + m.similarityScore, 0) / matches.length;

  // Confidence: weighted by similarity, number of matches, and win rate
  const sizeFactor = Math.min(1, matches.length / 10);
  const confidence = Math.round(winRate * 0.5 + avgSimilarity * 0.3 + sizeFactor * 100 * 0.2);

  return {
    matches,
    overallWinRate: Math.round(winRate),
    avgAccuracy: Math.round(avgAccuracy),
    avgDeviation: Math.round(avgDeviation),
    avgReturn: parseFloat(avgReturn.toFixed(2)),
    matchCount: matches.length,
    confidence: Math.min(95, Math.max(5, confidence)),
  };
}

// === Get similarity-adjusted confidence ===
export function getSimilarityAdjustedConfidence(
  baseConfidence: number,
  rsi: number,
  macdHistogram: number,
  adx: number,
  bollingerWidth: number,
  atr: number,
  price: number,
  volumeRatio: number,
  sentimentScore: number,
  regime: string,
  sessionLabel: string,
  dayOfWeek: number,
  ticker?: string,
  maxMatches = 15,
): {
  adjustedConfidence: number;
  similarityResult: SimilarityResult;
  similarityBoost: number;
  suppressionActive: boolean;
} {
  const currentVector = buildFeatureVector(
    rsi, macdHistogram, adx, bollingerWidth, atr, price,
    volumeRatio, sentimentScore, regime, sessionLabel, dayOfWeek,
  );

  const result = findHistoricalMatches(currentVector, ticker, 365, maxMatches);

  if (result.matchCount < 2) {
    // Insufficient historical data — no adjustment
    return {
      adjustedConfidence: baseConfidence,
      similarityResult: result,
      similarityBoost: 0,
      suppressionActive: false,
    };
  }

  // Compute adjustment
  let adjustment = 0;

  // Win rate adjustment (±15%)
  if (result.overallWinRate > 65) adjustment += Math.min(12, (result.overallWinRate - 65) * 0.5);
  else if (result.overallWinRate < 40) adjustment -= Math.min(15, (40 - result.overallWinRate) * 0.5);

  // Match count confidence — few matches = less reliable
  if (result.matchCount < 5) adjustment -= 5;
  else if (result.matchCount > 15) adjustment += 3;

  // Average similarity — high similarity = more reliable adjustment
  const avgSim = result.matches.reduce((s, m) => s + m.similarityScore, 0) / result.matches.length;
  if (avgSim > 75) adjustment += 5;
  else if (avgSim < 50) adjustment -= 5;

  // Suppression: if historical win rate is very low, suppress confidence
  const suppressionActive = result.overallWinRate < 35 && result.matchCount >= 3;
  if (suppressionActive) adjustment -= 10;

  adjustment = Math.max(-20, Math.min(20, Math.round(adjustment)));
  const adjustedConfidence = Math.max(5, Math.min(95, baseConfidence + adjustment));

  return { adjustedConfidence, similarityResult: result, similarityBoost: adjustment, suppressionActive };
}

// === Find most similar historical periods (for market context) ===
export function findSimilarMarketPeriods(
  currentVector: MarketFeatureVector,
  topN = 5,
): SimilarHistoricalMatch[] {
  const result = findHistoricalMatches(currentVector, undefined, 365, topN);
  return result.matches.slice(0, topN);
}

// === Build a text summary of similarity analysis ===
export function formatSimilaritySummary(result: SimilarityResult): string[] {
  if (result.matchCount === 0) return ['No similar historical setups found'];

  const lines: string[] = [];
  lines.push(`Found ${result.matchCount} similar historical setups`);
  lines.push(`Historical win rate: ${result.overallWinRate}%`);
  lines.push(`Average accuracy: ${result.avgAccuracy}%`);
  lines.push(`Average return: ${result.avgReturn > 0 ? '+' : ''}${result.avgReturn}%`);
  lines.push(`Average deviation: ${result.avgDeviation}%`);

  if (result.matches.length > 0) {
    const top = result.matches[0];
    lines.push(`Best match: ${top.ticker} ${top.direction} (${top.similarityScore}% sim) → ${top.result}`);
  }

  return lines;
}
