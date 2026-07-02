import { type OHLC, type TAIndicators } from './technicalAnalysis';
import { predictWithModel, predictGBDT, extractFeatures, type MLModel, type GBDTModel } from './mlEngine';
import { getSimilarityAdjustedConfidence } from './historicalSimilarityEngine';
import { computeReliableConfidence } from './confidenceConfig';

export interface ModelVote {
  modelName: string;
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number;
  weight: number;
  accuracy: number;
  samples: number;
}

export interface EnsembleResult {
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number;
  votes: ModelVote[];
  agreementLevel: number;
  weightedConfidence: number;
  consensusStrength: 'STRONG' | 'MODERATE' | 'WEAK' | 'CONFLICTING';
  isReliable: boolean;
}

export interface EnsembleModel {
  name: string;
  weight: number;
  recentAccuracy: number;
  totalPredictions: number;
}

const modelRegistry: EnsembleModel[] = [
  { name: 'ML_Quant', weight: 1.0, recentAccuracy: 0, totalPredictions: 0 },
  { name: 'GBDT_Boost', weight: 0.9, recentAccuracy: 0, totalPredictions: 0 },
  { name: 'HistoricalSimilarity', weight: 0.8, recentAccuracy: 0, totalPredictions: 0 },
  { name: 'TechnicalTrend', weight: 0.6, recentAccuracy: 0, totalPredictions: 0 },
];

function computeTrendVote(ta: TAIndicators | null): { direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL'; confidence: number } {
  if (!ta) return { direction: 'NEUTRAL', confidence: 0 };

  let bullishScore = 0;
  let bearishScore = 0;
  let totalFactors = 0;

  if (ta.rsi < 30) { bullishScore += 8; bearishScore += 1; }
  else if (ta.rsi > 70) { bullishScore += 1; bearishScore += 8; }
  else if (ta.rsi > 40 && ta.rsi < 60) { bullishScore += 4; bearishScore += 4; }
  else if (ta.rsi < 40) { bullishScore += 6; bearishScore += 3; }
  else { bullishScore += 3; bearishScore += 6; }
  totalFactors += 8;

  if (ta.macd.histogram > 0) { bullishScore += 7; bearishScore += 2; }
  else { bullishScore += 2; bearishScore += 7; }
  totalFactors += 7;

  if (ta.adx > 25) {
    const ema20 = ta.ema[20] || 0;
    const ema50 = ta.ema[50] || 0;
    if (ema20 > ema50) { bullishScore += 6; bearishScore += 2; }
    else { bullishScore += 2; bearishScore += 6; }
  } else {
    bullishScore += 3; bearishScore += 3;
  }
  totalFactors += 6;

  if (ta.supertrend.direction === 'up') { bullishScore += 5; bearishScore += 2; }
  else { bullishScore += 2; bearishScore += 5; }
  totalFactors += 5;

  const total = totalFactors * 10;
  const bullPct = (bullishScore / total) * 100;
  const bearPct = (bearishScore / total) * 100;
  const confidence = Math.round(Math.max(bullPct, bearPct));

  if (confidence < 45) return { direction: 'NEUTRAL', confidence };

  return {
    direction: bullPct > bearPct ? 'BULLISH' : 'BEARISH',
    confidence: Math.min(95, confidence),
  };
}

export function predictEnsemble(
  ticker: string,
  history: OHLC[],
  mlModel: MLModel | null,
  ta: TAIndicators | null,
  regime: string,
  sessionLabel: string,
  dayOfWeek: number,
  sentimentScore?: number,
  gbdtModel?: GBDTModel | null,
): EnsembleResult {
  const atrPercent = ta ? (ta.atr / (history.length > 0 ? history[history.length - 1]?.close || 1 : 1)) * 100 : 2;
  const votes: ModelVote[] = [];

  // Model 1: ML Quant (Logistic Regression)
  if (mlModel && ta) {
    try {
      const prediction = predictWithModel(mlModel, history);
      if (prediction) {
        const mlAccuracy = modelRegistry.find(m => m.name === 'ML_Quant')?.recentAccuracy || 50;
        votes.push({
          modelName: 'ML_Quant',
          direction: prediction.direction,
          confidence: prediction.confidence,
          weight: modelRegistry[0].weight,
          accuracy: mlAccuracy,
          samples: prediction.modelSamples || 0,
        });
      }
    } catch { /* skip */ }
  }

  // Model 2: GBDT Boost (Gradient Boosted Decision Trees)
  if (gbdtModel && ta) {
    try {
      const features = extractFeatures(history);
      if (features.length > 0) {
        const lastFeatures = features[features.length - 1];
        const gbdtProb = predictGBDT(gbdtModel, lastFeatures);
        const gbdtDirection = gbdtProb > 0.55 ? 'BULLISH' : gbdtProb < 0.45 ? 'BEARISH' : 'NEUTRAL';
        const gbdtConfidence = gbdtDirection !== 'NEUTRAL'
          ? Math.round(Math.max(gbdtProb, 1 - gbdtProb) * 80)
          : 25;
        const gbdtAccuracy = modelRegistry.find(m => m.name === 'GBDT_Boost')?.recentAccuracy || 50;
        votes.push({
          modelName: 'GBDT_Boost',
          direction: gbdtDirection,
          confidence: gbdtConfidence,
          weight: modelRegistry[1].weight,
          accuracy: gbdtAccuracy,
          samples: features.length,
        });
      }
    } catch { /* skip */ }
  }

  // Model 3: Historical Similarity
  if (ta) {
    try {
      const simResult = getSimilarityAdjustedConfidence(
        50, ta.rsi, ta.macd.histogram, ta.adx,
        ta.bollinger.width, ta.atr,
        ta.rsi * 100 || 100, 1, sentimentScore || 0,
        regime, sessionLabel, dayOfWeek, ticker,
      );
      const simAccuracy = modelRegistry.find(m => m.name === 'HistoricalSimilarity')?.recentAccuracy || 50;
      const simConfidence = simResult.adjustedConfidence;
      if (simConfidence > 35 && simResult.similarityResult.matchCount > 0) {
        const simDir = simConfidence > 55 ? 'BULLISH' : simConfidence < 45 ? 'BEARISH' : 'NEUTRAL';
        votes.push({
          modelName: 'HistoricalSimilarity',
          direction: simDir,
          confidence: simConfidence,
          weight: modelRegistry[1].weight,
          accuracy: simAccuracy,
          samples: simResult.similarityResult.matchCount,
        });
      }
    } catch { /* skip */ }
  }

  // Model 3: Technical Trend
  if (ta) {
    try {
      const trendVote = computeTrendVote(ta);
      if (trendVote.direction !== 'NEUTRAL') {
        const trendAccuracy = modelRegistry.find(m => m.name === 'TechnicalTrend')?.recentAccuracy || 50;
        votes.push({
          modelName: 'TechnicalTrend',
          direction: trendVote.direction,
          confidence: trendVote.confidence,
          weight: modelRegistry[2].weight,
          accuracy: trendAccuracy,
          samples: 0,
        });
      }
    } catch { /* skip */ }
  }

  if (votes.length === 0) {
    return {
      direction: 'NEUTRAL',
      confidence: 0,
      votes: [],
      agreementLevel: 0,
      weightedConfidence: 0,
      consensusStrength: 'WEAK',
      isReliable: false,
    };
  }

  const totalWeight = votes.reduce((s, v) => s + v.weight * (v.accuracy / 100), 0);
  let weightedBullish = 0;
  let weightedBearish = 0;
  let totalConfidence = 0;

  for (const vote of votes) {
    const effectiveWeight = vote.weight * (vote.accuracy / 100);
    const weightedConf = vote.confidence * effectiveWeight;
    if (vote.direction === 'BULLISH') weightedBullish += weightedConf;
    else if (vote.direction === 'BEARISH') weightedBearish += weightedConf;
    totalConfidence += weightedConf;
  }

  const bullPct = totalWeight > 0 ? (weightedBullish / totalWeight) : 0;
  const bearPct = totalWeight > 0 ? (weightedBearish / totalWeight) : 0;
  const direction = bullPct > bearPct ? 'BULLISH' : bearPct > bullPct ? 'BEARISH' : 'NEUTRAL';
  const rawWeightedConfidence = Math.round(Math.max(bullPct, bearPct));

  const maxPossible = votes.length * 100;
  const rawAgreement = maxPossible > 0 ? Math.round((totalConfidence / (totalWeight > 0 ? totalWeight : 1)) * 100) : 0;

  const allBullish = votes.every(v => v.direction === 'BULLISH');
  const allBearish = votes.every(v => v.direction === 'BEARISH');
  const hasConflict = votes.some(v => v.direction === 'BULLISH') && votes.some(v => v.direction === 'BEARISH');

  // Agreement: what fraction of models agree with the final direction
  const agreeingVotes = votes.filter(v => v.direction === direction).length;
  const agreementPct = votes.length > 0 ? (agreeingVotes / votes.length) * 100 : 0;

  let consensusStrength: 'STRONG' | 'MODERATE' | 'WEAK' | 'CONFLICTING';
  if ((allBullish || allBearish) && votes.length >= 2 && rawAgreement > 70) consensusStrength = 'STRONG';
  else if (hasConflict) consensusStrength = 'CONFLICTING';
  else if (agreementPct >= 60) consensusStrength = 'MODERATE';
  else consensusStrength = 'WEAK';

  const weightedConfidence = computeReliableConfidence(rawWeightedConfidence, atrPercent, agreementPct);
  const isReliable = consensusStrength !== 'CONFLICTING' && weightedConfidence > 30 && votes.length >= 1;

  let finalDirection: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = isReliable ? direction : 'NEUTRAL';
  let finalConfidence = weightedConfidence;
  let finalStrength = consensusStrength;

  // CATALYST OVERRIDE: Inject Real-time Corporate Feed
  if (typeof window === 'undefined') {
    try {
      const { getNewsForTicker } = require('./newsStore');
      const recentNews = getNewsForTicker(ticker, 24);
      if (recentNews.length > 0) {
        // Find highest impact catalyst
        const topNews = recentNews.reduce((prev: any, current: any) => 
          (prev.impactScore > current.impactScore) ? prev : current
        , recentNews[0]);
        
        if (topNews && topNews.impactScore >= 75) {
          if (topNews.llmTradingSignal === 'BUY' || topNews.llmTradingSignal === 'STRONG_BUY' || topNews.llmEventType === 'ORDER_WIN' || topNews.llmEventType === 'TURNAROUND') {
            finalDirection = 'BULLISH';
            finalConfidence = Math.max(finalConfidence, Math.min(95, topNews.impactScore + 10));
            finalStrength = 'STRONG';
          } else if (topNews.llmTradingSignal === 'SELL' || topNews.llmTradingSignal === 'STRONG_SELL') {
            finalDirection = 'BEARISH';
            finalConfidence = Math.max(finalConfidence, Math.min(95, topNews.impactScore + 10));
            finalStrength = 'STRONG';
          }
        }
      }
    } catch { /* ignore if not on server */ }
  }

  return {
    direction: finalDirection,
    confidence: finalConfidence,
    votes,
    agreementLevel: rawAgreement,
    weightedConfidence,
    consensusStrength: finalStrength,
    isReliable: finalStrength === 'STRONG' || isReliable,
  };
}

export function updateEnsembleModelAccuracy(modelName: string, wasCorrect: boolean): void {
  const model = modelRegistry.find(m => m.name === modelName);
  if (!model) return;
  model.totalPredictions++;
  const window = Math.min(model.totalPredictions, 50);
  model.recentAccuracy = ((model.recentAccuracy * (window - 1)) + (wasCorrect ? 100 : 0)) / window;
}

export function getEnsembleModelWeights(): EnsembleModel[] {
  return [...modelRegistry];
}

export function getEnsembleConsensusDescription(result: EnsembleResult): string {
  if (result.votes.length === 0) return 'No models able to produce prediction';
  const modelNames = result.votes.map(v => `${v.modelName} (${v.direction}, ${v.confidence}%)`).join(', ');
  return `${result.votes.length} model(s): ${modelNames}. Consensus: ${result.consensusStrength}. Final: ${result.direction} @ ${result.confidence}%`;
}
