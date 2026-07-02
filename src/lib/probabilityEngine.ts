export interface ProbabilityInputs {
  eventType: string;
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  sentimentScore: number;
  urgency: number;
  niftyTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | string;
  sectorStrength: number; // 0-100
  rsi: number;
  relativeVolume: number;
  historicalWinRate: number; // 0-100
  historicalMatchCount: number;
}

export interface ProbabilityResult {
  probability: number; // 0-100
  confidence: 'High' | 'Medium' | 'Low';
  reliability: 'A' | 'B' | 'C';
  signal: 'STRONG_BUY_SETUP' | 'BUY_SETUP' | 'WATCH_BREAKOUT' | 'WATCH_PULLBACK' | 'SELL_SETUP' | 'STRONG_SELL_SETUP' | 'IGNORE';
}

export function calculateEventProbability(inputs: ProbabilityInputs): ProbabilityResult {
  let score = 50; // Baseline

  // 1. Historical Weight (Highest priority)
  if (inputs.historicalMatchCount >= 5) {
    score = (score * 0.3) + (inputs.historicalWinRate * 0.7);
  } else if (inputs.historicalMatchCount > 0) {
    score = (score * 0.5) + (inputs.historicalWinRate * 0.5);
  } else {
    // No historicals, rely heavily on sentiment and technicals
    score = (score * 0.2) + (inputs.sentimentScore * 0.8);
  }

  // 2. Technical Alignments
  if (inputs.sentiment === 'BULLISH') {
    if (inputs.rsi > 0 && inputs.rsi < 40) score += 5; // Oversold + Good News
    if (inputs.rsi > 75) score -= 10; // Overbought + Good News (exhaustion risk)
    if (inputs.niftyTrend === 'BULLISH_TREND' || inputs.niftyTrend === 'STRONG_TREND') score += 5;
    if (inputs.sectorStrength > 70) score += 5;
  } else if (inputs.sentiment === 'BEARISH') {
    if (inputs.rsi > 70) score += 5; // Overbought + Bad News
    if (inputs.rsi > 0 && inputs.rsi < 30) score -= 5; // Oversold + Bad News (might be priced in)
    if (inputs.niftyTrend === 'BEARISH_TREND' || inputs.niftyTrend === 'WEAK_TREND') score += 5;
    if (inputs.sectorStrength < 30) score += 5;
  }

  // 3. Volume and Urgency Multiplier
  if (inputs.relativeVolume > 2.0) score += 5;
  if (inputs.relativeVolume > 5.0) score += 5;
  if (inputs.urgency > 80) score += 5;

  // Cap the probability realistically
  score = Math.max(5, Math.min(95, score));

  // 4. Derive Confidence & Reliability
  let confidence: 'High' | 'Medium' | 'Low' = 'Medium';
  if (inputs.urgency > 85 && inputs.relativeVolume > 3.0) confidence = 'High';
  if (inputs.urgency < 50 && inputs.relativeVolume < 1.0) confidence = 'Low';

  let reliability: 'A' | 'B' | 'C' = 'C';
  if (inputs.historicalMatchCount >= 10) reliability = 'A';
  else if (inputs.historicalMatchCount >= 3) reliability = 'B';

  // 5. Derive the structured signal
  let signal: ProbabilityResult['signal'] = 'IGNORE';
  
  if (inputs.sentiment === 'BULLISH') {
    if (score >= 75) signal = 'STRONG_BUY_SETUP';
    else if (score >= 60) signal = 'BUY_SETUP';
    else if (score >= 45) signal = 'WATCH_PULLBACK';
    else signal = 'IGNORE';
  } else if (inputs.sentiment === 'BEARISH') {
    if (score >= 75) signal = 'STRONG_SELL_SETUP';
    else if (score >= 60) signal = 'SELL_SETUP';
    else if (score >= 45) signal = 'WATCH_BREAKOUT'; // Assuming breakdown watch
    else signal = 'IGNORE';
  }

  // Edge cases for very low conviction
  if (score < 40 && (signal === 'BUY_SETUP' || signal === 'STRONG_BUY_SETUP')) {
    signal = 'WATCH_PULLBACK';
  }

  return {
    probability: Math.round(score),
    confidence,
    reliability,
    signal,
  };
}
