/**
 * Probability Engine - Institutional Grade Mathematical Scoring
 * 
 * Calculates trading probability using weighted evidence scoring
 * instead of LLM-generated numbers. All probabilities are mathematically
 * derived from objective data points.
 */

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
  // New inputs for V2
  relevanceScore?: number; // 0-100 news relevance
  verificationScore?: number; // 0-100 source verification
  technicalScore?: number; // 0-100 technical confirmation
  optionsFlow?: number; // 0-100 options sentiment
  institutionalFlow?: number; // 0-100 FII/DII flow
  marketRegime?: 'BULL' | 'BEAR' | 'SIDEWAYS' | 'VOLATILE';
}

export interface ProbabilityResult {
  probability: number; // 0-100 (mathematically calculated)
  confidence: 'High' | 'Medium' | 'Low';
  reliability: 'A' | 'B' | 'C';
  signal: 'STRONG_BUY_SETUP' | 'BUY_SETUP' | 'WATCH_BREAKOUT' | 'WATCH_PULLBACK' | 'SELL_SETUP' | 'STRONG_SELL_SETUP' | 'IGNORE';
  // V2: Detailed scoring breakdown
  scoreBreakdown?: {
    newsScore: number;
    technicalScore: number;
    fundamentalScore: number;
    historicalScore: number;
    optionsScore: number;
    volumeScore: number;
    macroScore: number;
  };
  evidenceScore?: number; // 0-100 overall evidence quality
  tradeQuality?: 'A+' | 'A' | 'A-' | 'B+' | 'B' | 'B-' | 'C';
  suggestedHolding?: 'INTRADAY' | 'SWING_2_5_DAYS' | 'SWING_1_2_WEEKS' | 'LONG_TERM';
}

/**
 * Event type impact weights - based on historical analysis
 * Different events have different typical market impacts
 */
const EVENT_TYPE_WEIGHTS: Record<string, { bullish: number; bearish: number }> = {
  'ACQUISITION': { bullish: 75, bearish: 25 },
  'MERGER': { bullish: 70, bearish: 30 },
  'ORDER_WIN': { bullish: 80, bearish: 20 },
  'EARNINGS_BEAT': { bullish: 85, bearish: 15 },
  'EARNINGS_MISS': { bullish: 15, bearish: 85 },
  'PROFIT_SURGE': { bullish: 80, bearish: 20 },
  'LOSS_WIDEN': { bullish: 20, bearish: 80 },
  'DEBT_REDUCTION': { bullish: 70, bearish: 30 },
  'FDA_APPROVAL': { bullish: 90, bearish: 10 },
  'BLOCK_DEAL': { bullish: 65, bearish: 35 },
  'BULK_DEAL': { bullish: 60, bearish: 40 },
  'PROMOTER_BUYING': { bullish: 85, bearish: 15 },
  'PROMOTER_SELLING': { bullish: 15, bearish: 85 },
  'DIVIDEND': { bullish: 60, bearish: 40 },
  'BONUS': { bullish: 70, bearish: 30 },
  'RESIGNATION': { bullish: 25, bearish: 75 },
  'APPOINTMENT': { bullish: 65, bearish: 35 },
  'GENERAL': { bullish: 50, bearish: 50 },
};

/**
 * Market regime adjustment factors
 * Probability should be adjusted based on overall market direction
 */
const MARKET_REGIME_ADJUSTMENTS = {
  'BULL': { bullishBoost: 15, bearishPenalty: -10 },
  'BEAR': { bullishBoost: -10, bearishPenalty: 15 },
  'SIDEWAYS': { bullishBoost: 0, bearishPenalty: 0 },
  'VOLATILE': { bullishBoost: -5, bearishPenalty: -5 },
};

/**
 * Calculate comprehensive probability score using weighted evidence
 * 
 * Scoring breakdown:
 * - News/Event Score: 22% weight
 * - Technical Confirmation: 20% weight  
 * - Historical Performance: 18% weight
 * - Volume & Liquidity: 15% weight
 * - Options Flow: 12% weight
 * - Fundamental Score: 8% weight
 * - Macro/Market Regime: 5% weight
 */
export function calculateEventProbability(inputs: ProbabilityInputs): ProbabilityResult {
  // === 1. NEWS/EVENT SCORE (22% weight) ===
  const eventTypeWeight = EVENT_TYPE_WEIGHTS[inputs.eventType] || EVENT_TYPE_WEIGHTS['GENERAL'];
  const baseEventScore = inputs.sentiment === 'BULLISH' ? eventTypeWeight.bullish : 
                         inputs.sentiment === 'BEARISH' ? eventTypeWeight.bearish : 50;
  
  // Adjust by sentiment score and urgency
  const sentimentAdjustment = (inputs.sentimentScore - 50) * 0.3;
  const urgencyAdjustment = (inputs.urgency - 50) * 0.15;
  
  // Relevance adjustment (V2)
  const relevanceAdjustment = inputs.relevanceScore ? (inputs.relevanceScore - 50) * 0.2 : 0;
  
  // Verification adjustment (V2)
  const verificationAdjustment = inputs.verificationScore ? (inputs.verificationScore - 50) * 0.15 : 0;
  
  const newsScore = Math.min(100, Math.max(0, 
    baseEventScore + sentimentAdjustment + urgencyAdjustment + relevanceAdjustment + verificationAdjustment
  ));
  
  // === 2. TECHNICAL SCORE (20% weight) ===
  let technicalScore = 50; // Baseline
  
  // RSI analysis
  if (inputs.rsi > 0 && inputs.rsi < 30) {
    technicalScore += inputs.sentiment === 'BULLISH' ? 15 : -5; // Oversold + bullish = good
  } else if (inputs.rsi > 70) {
    technicalScore += inputs.sentiment === 'BEARISH' ? 15 : -10; // Overbought + bearish = good
  } else if (inputs.rsi > 50 && inputs.rsi < 70) {
    technicalScore += inputs.sentiment === 'BULLISH' ? 8 : -5; // Momentum zone
  }
  
  // Custom technical score override (V2)
  if (inputs.technicalScore !== undefined) {
    technicalScore = inputs.technicalScore;
  }
  
  // Sector strength
  if (inputs.sectorStrength > 70) technicalScore += 5;
  else if (inputs.sectorStrength < 30) technicalScore -= 5;
  
  // === 3. HISTORICAL SCORE (18% weight) ===
  let historicalScore = 50;
  
  if (inputs.historicalMatchCount >= 10) {
    // High confidence historical data
    historicalScore = inputs.historicalWinRate;
  } else if (inputs.historicalMatchCount >= 5) {
    // Medium confidence
    historicalScore = (50 * 0.4) + (inputs.historicalWinRate * 0.6);
  } else if (inputs.historicalMatchCount > 0) {
    // Low confidence
    historicalScore = (50 * 0.6) + (inputs.historicalWinRate * 0.4);
  }
  
  // === 4. VOLUME SCORE (15% weight) ===
  let volumeScore = 50;
  
  if (inputs.relativeVolume > 5.0) {
    volumeScore = 85; // Exceptional volume
  } else if (inputs.relativeVolume > 3.0) {
    volumeScore = 75; // Strong volume
  } else if (inputs.relativeVolume > 2.0) {
    volumeScore = 65; // Good volume
  } else if (inputs.relativeVolume > 1.5) {
    volumeScore = 55; // Above average
  } else if (inputs.relativeVolume < 0.5) {
    volumeScore = 25; // Very low volume (suspicious)
  }
  
  // === 5. OPTIONS SCORE (12% weight) ===
  let optionsScore = 50;
  if (inputs.optionsFlow !== undefined) {
    optionsScore = inputs.optionsFlow;
  }
  
  // === 6. FUNDAMENTAL SCORE (8% weight) ===
  let fundamentalScore = 50;
  if (inputs.institutionalFlow !== undefined) {
    fundamentalScore = inputs.institutionalFlow;
  }
  
  // === 7. MACRO/MARKET REGIME SCORE (5% weight) ===
  let macroScore = 50;
  const regimeAdj = MARKET_REGIME_ADJUSTMENTS[inputs.marketRegime || 'SIDEWAYS'];
  
  if (inputs.sentiment === 'BULLISH') {
    macroScore += regimeAdj.bullishBoost;
  } else if (inputs.sentiment === 'BEARISH') {
    macroScore += regimeAdj.bearishPenalty;
  }
  
  // === COMBINE ALL SCORES WITH WEIGHTS ===
  const weights = {
    news: 0.22,
    technical: 0.20,
    historical: 0.18,
    volume: 0.15,
    options: 0.12,
    fundamental: 0.08,
    macro: 0.05
  };
  
  const finalProbability = Math.round(
    newsScore * weights.news +
    technicalScore * weights.technical +
    historicalScore * weights.historical +
    volumeScore * weights.volume +
    optionsScore * weights.options +
    fundamentalScore * weights.fundamental +
    macroScore * weights.macro
  );
  
  // Cap probability between 5 and 95 (never 0 or 100)
  const cappedProbability = Math.min(95, Math.max(5, finalProbability));
  
  // === CALCULATE CONFIDENCE ===
  let confidence: 'High' | 'Medium' | 'Low' = 'Medium';
  
  const evidenceFactors = [
    inputs.historicalMatchCount >= 10 ? 1 : 0,
    inputs.verificationScore && inputs.verificationScore >= 80 ? 1 : 0,
    inputs.relativeVolume > 2.0 ? 1 : 0,
    inputs.urgency > 75 ? 1 : 0,
    inputs.technicalScore && inputs.technicalScore >= 70 ? 1 : 0,
  ];
  
  const evidenceCount = evidenceFactors.reduce((a, b) => a + b, 0);
  
  if (evidenceCount >= 4) confidence = 'High';
  else if (evidenceCount <= 1) confidence = 'Low';
  
  // === CALCULATE RELIABILITY ===
  let reliability: 'A' | 'B' | 'C' = 'C';
  if (inputs.historicalMatchCount >= 10 && inputs.verificationScore && inputs.verificationScore >= 80) {
    reliability = 'A';
  } else if (inputs.historicalMatchCount >= 3 || (inputs.verificationScore && inputs.verificationScore >= 70)) {
    reliability = 'B';
  }
  
  // === DETERMINE SIGNAL ===
  let signal: ProbabilityResult['signal'] = 'IGNORE';
  
  if (inputs.sentiment === 'BULLISH') {
    if (cappedProbability >= 78) signal = 'STRONG_BUY_SETUP';
    else if (cappedProbability >= 65) signal = 'BUY_SETUP';
    else if (cappedProbability >= 50) signal = 'WATCH_PULLBACK';
    else signal = 'IGNORE';
  } else if (inputs.sentiment === 'BEARISH') {
    if (cappedProbability >= 78) signal = 'STRONG_SELL_SETUP';
    else if (cappedProbability >= 65) signal = 'SELL_SETUP';
    else if (cappedProbability >= 50) signal = 'WATCH_BREAKOUT';
    else signal = 'IGNORE';
  }
  
  // === DETERMINE TRADE QUALITY ===
  let tradeQuality: ProbabilityResult['tradeQuality'] = 'C';
  if (cappedProbability >= 85 && confidence === 'High') tradeQuality = 'A+';
  else if (cappedProbability >= 80 && confidence === 'High') tradeQuality = 'A';
  else if (cappedProbability >= 75) tradeQuality = 'A-';
  else if (cappedProbability >= 70) tradeQuality = 'B+';
  else if (cappedProbability >= 65) tradeQuality = 'B';
  else if (cappedProbability >= 55) tradeQuality = 'B-';
  
  // === DETERMINE SUGGESTED HOLDING PERIOD ===
  let suggestedHolding: ProbabilityResult['suggestedHolding'] = 'SWING_2_5_DAYS';
  
  if (inputs.eventType === 'EARNINGS_BEAT' || inputs.eventType === 'PROFIT_SURGE') {
    suggestedHolding = 'SWING_2_5_DAYS';
  } else if (inputs.eventType === 'ACQUISITION' || inputs.eventType === 'MERGER') {
    suggestedHolding = 'SWING_1_2_WEEKS';
  } else if (inputs.eventType === 'ORDER_WIN' || inputs.eventType === 'FDA_APPROVAL') {
    suggestedHolding = 'INTRADAY';
  } else if (inputs.eventType === 'PROMOTER_BUYING' || inputs.eventType === 'DEBT_REDUCTION') {
    suggestedHolding = 'LONG_TERM';
  }
  
  // === CALCULATE EVIDENCE SCORE ===
  const evidenceScore = Math.round(
    (Math.min(100, newsScore + 10) / 100) * 25 +
    (Math.min(100, technicalScore + 10) / 100) * 20 +
    (Math.min(100, historicalScore + 10) / 100) * 20 +
    (Math.min(100, volumeScore + 10) / 100) * 15 +
    (confidence === 'High' ? 20 : confidence === 'Medium' ? 10 : 0)
  );
  
  return {
    probability: cappedProbability,
    confidence,
    reliability,
    signal,
    scoreBreakdown: {
      newsScore: Math.round(newsScore),
      technicalScore: Math.round(technicalScore),
      fundamentalScore: Math.round(fundamentalScore),
      historicalScore: Math.round(historicalScore),
      optionsScore: Math.round(optionsScore),
      volumeScore: Math.round(volumeScore),
      macroScore: Math.round(macroScore),
    },
    evidenceScore,
    tradeQuality,
    suggestedHolding,
  };
}