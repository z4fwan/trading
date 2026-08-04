import { getPredictionsByTicker, getAllPredictions } from './predictionStore';
import { getAggregatedSentiment } from './newsStore';

export interface AIPredictionMarker {
  time: number;
  position: 'belowBar' | 'aboveBar';
  color: string;
  shape: 'arrowUp' | 'arrowDown' | 'circle';
  text: string;
  size: number;
}

export interface AIPredictionInfo {
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number;
  entryPrice: number;
  targetPrice: number;
  stopLoss?: number;
  source: string;
  type: string;
  reasoning: string[];
}

export function getPredictionMarkers(ticker: string): AIPredictionMarker[] {
  const predictions = getPredictionsByTicker(ticker);
  const now = Date.now();
  const markers: AIPredictionMarker[] = [];

  for (const p of predictions) {
    if (p.direction === 'NEUTRAL') continue;
    const age = now - p.createdAt;
    if (age > 7 * 24 * 60 * 60 * 1000) continue;

    markers.push({
      time: p.createdAt,
      position: p.direction === 'BULLISH' ? 'belowBar' : 'aboveBar',
      color: p.direction === 'BULLISH' ? '#22c55e' : p.direction === 'BEARISH' ? '#ef4444' : '#eab308',
      shape: p.direction === 'BULLISH' ? 'arrowUp' : 'arrowDown',
      text: `${p.confidence}% ${p.source === 'AI_QUANT' ? 'AI' : 'TA'} ${p.predictionType}`,
      size: 2,
    });
  }

  return markers;
}

export function getLatestPrediction(ticker: string): AIPredictionInfo | null {
  const predictions = getPredictionsByTicker(ticker);
  if (predictions.length === 0) return null;

  const latest = predictions.reduce((a, b) => a.createdAt > b.createdAt ? a : b);
  if (latest.direction === 'NEUTRAL') return null;

  return {
    direction: latest.direction,
    confidence: latest.confidence,
    entryPrice: latest.entryPrice,
    targetPrice: latest.targetPrice,
    stopLoss: latest.stopLoss,
    source: latest.source,
    type: latest.predictionType,
    reasoning: latest.reasoning,
  };
}

export interface MarketMomentum {
  overallBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  avgConfidence: number;
  sentimentScore: number;
}

export function getMarketMomentum(): MarketMomentum {
  const all = getAllPredictions();
  const now = Date.now();
  const recent = all.filter(p => (now - p.createdAt) < 24 * 60 * 60 * 1000);

  let bullish = 0, bearish = 0, neutral = 0;
  let totalConf = 0;

  for (const p of recent) {
    if (p.direction === 'BULLISH') { bullish++; totalConf += p.confidence; }
    else if (p.direction === 'BEARISH') { bearish++; totalConf += p.confidence; }
    else neutral++;
  }

  const total = bullish + bearish + neutral;
  const avgConfidence = total > 0 ? Math.round(totalConf / total) : 0;
  let overallBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  if (bullish > bearish && bullish > neutral) overallBias = 'BULLISH';
  else if (bearish > bullish && bearish > neutral) overallBias = 'BEARISH';

  const sentiment = getAggregatedSentiment(24);

  return {
    overallBias,
    bullishCount: bullish,
    bearishCount: bearish,
    neutralCount: neutral,
    avgConfidence,
    sentimentScore: sentiment.overall,
  };
}
