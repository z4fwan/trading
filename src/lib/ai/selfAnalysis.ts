import type { AIMemoryPrediction, SelfAnalysisReport, FailureAnalysisReport } from './types';

function getNewsSentimentForTicker(ticker: string, hoursBack = 72): number {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('news-store') : null;
    if (!raw) return 0;
    const events: { tickers: string[]; sentiment: string; impactScore: number; timestamp: number }[] = JSON.parse(raw) || [];
    const cutoff = Date.now() - hoursBack * 60 * 60 * 1000;
    const relevant = events.filter(e => e.timestamp >= cutoff && e.tickers?.includes(ticker));
    if (relevant.length === 0) return 0;
    let score = 0;
    for (const e of relevant) {
      if (e.sentiment === 'BULLISH') score += e.impactScore;
      else if (e.sentiment === 'BEARISH') score -= e.impactScore;
    }
    return score / relevant.length;
  } catch { return 0; }
}

export function generateSelfAnalysis(
  pred: AIMemoryPrediction,
  actualPrice: number,
  currentRegime?: string,
  currentSentiment?: number,
): SelfAnalysisReport {
  const pctChange = pred.entryPrice > 0 ? ((actualPrice - pred.entryPrice) / pred.entryPrice) * 100 : 0;
  const expectedDirection = pred.direction;
  const actualDirection = pctChange > 0 ? 'BULLISH' : pctChange < 0 ? 'BEARISH' : 'NEUTRAL';
  const directionalCorrect = expectedDirection === actualDirection || expectedDirection === 'NEUTRAL';
  const expectedMove = pred.targetPrice > 0 ? Math.abs((pred.targetPrice - pred.entryPrice) / pred.entryPrice) * 100 : 2;
  const absMove = Math.abs(pctChange);

  const indicatorsHelped: string[] = [];
  const indicatorsFailed: string[] = [];
  let volatilityUnderestimated = false;
  let sentimentReversed = false;
  let regimeWasUnstable = false;
  let confidenceTooAggressive = false;
  let newsInvalidatedSetup = false;
  let trendStrengthWasWeak = false;

  // Analyze indicator performance
  if (pred.fullSnapshot) {
    const s = pred.fullSnapshot;
    // RSI analysis
    if (s.rsi > 50 && s.rsi < 70 && directionalCorrect) indicatorsHelped.push('RSI');
    else if ((s.rsi > 70 || s.rsi < 30) && !directionalCorrect) indicatorsFailed.push('RSI');
    else if (s.rsi > 50 && s.rsi < 70 && !directionalCorrect) indicatorsFailed.push('RSI (neutral — gave no edge)');

    // MACD analysis
    if (s.macdHistogram > 0 && directionalCorrect) indicatorsHelped.push('MACD');
    else if (s.macdHistogram > 0 && !directionalCorrect) indicatorsFailed.push('MACD (false positive)');

    // ADX analysis
    if (s.adx > 25 && directionalCorrect) indicatorsHelped.push('ADX');
    else if (s.adx > 25 && !directionalCorrect) indicatorsFailed.push('ADX (strong trend but wrong direction)');
    else if (s.adx < 20) trendStrengthWasWeak = true;

    // Bollinger analysis
    if (s.bollingerWidth > 8 && absMove > expectedMove) volatilityUnderestimated = true;
    if (s.bollingerWidth < 4 && absMove > expectedMove) indicatorsFailed.push('Bollinger (squeeze failed)');

    // Supertrend
    if ((s.supertrendDirection === 'up' && directionalCorrect && pctChange > 0) ||
        (s.supertrendDirection === 'down' && directionalCorrect && pctChange < 0)) {
      indicatorsHelped.push('Supertrend');
    } else if ((s.supertrendDirection === 'up' && pctChange < 0) ||
               (s.supertrendDirection === 'down' && pctChange > 0)) {
      indicatorsFailed.push('Supertrend (wrong direction)');
    } else if (!directionalCorrect) {
      indicatorsFailed.push('Supertrend (prediction failed despite alignment)');
    }

    // Volume
    if (s.volumeRatio > 1.5 && !directionalCorrect) indicatorsFailed.push('Volume (high volume contradicted)');

    // Price vs VWAP
    if (s.priceVsVwap > 0 && directionalCorrect) indicatorsHelped.push('VWAP');
    else if (s.priceVsVwap > 0 && !directionalCorrect) indicatorsFailed.push('VWAP (above but reversed)');
  }

  // Confidence analysis
  if (pred.confidence >= 60 && !directionalCorrect) confidenceTooAggressive = true;

  // Volatility analysis
  if (absMove > expectedMove * 1.5) volatilityUnderestimated = true;

  // Regime stability
  if (currentRegime && pred.regime !== currentRegime) regimeWasUnstable = true;

  // Sentiment analysis
  if (currentSentiment !== undefined && pred.sentimentScore !== 0) {
    const sentimentShift = Math.abs(currentSentiment - pred.sentimentScore);
    if (sentimentShift > 20) sentimentReversed = true;
  }

  // News impact analysis
  const newsSentiment = getNewsSentimentForTicker(pred.ticker);
  if (Math.abs(newsSentiment) > 15) {
    newsInvalidatedSetup = !directionalCorrect && (pred.sentimentScore > 0 !== newsSentiment > 0);
    if (newsInvalidatedSetup) {
      indicatorsFailed.push('News (sentiment reversed)');
    }
  }

  // Generate assessment
  const correctFactors: string[] = [];
  const wrongFactors: string[] = [];

  if (directionalCorrect) correctFactors.push('direction was correct');
  else wrongFactors.push('direction was incorrect');

  if (!volatilityUnderestimated) correctFactors.push('volatility was within expected range');
  else wrongFactors.push('volatility was underestimated');

  if (!regimeWasUnstable) correctFactors.push('market regime remained stable');
  else wrongFactors.push('market regime shifted unexpectedly');

  if (!sentimentReversed) correctFactors.push('sentiment alignment held');
  else wrongFactors.push('sentiment reversed during prediction timeframe');

  if (!confidenceTooAggressive) correctFactors.push('confidence level was justified');
  else wrongFactors.push('confidence was too aggressive relative to outcome');

  const overallAssessment = directionalCorrect
    ? `Prediction was correct. ${correctFactors.join('. ')}.`
    : `Prediction was incorrect. ${wrongFactors.join('. ')}.`;

  const lessonLearned = directionalCorrect
    ? `The ${indicatorsHelped.slice(0, 2).join(' and ') || 'overall analysis'} proved reliable in this ${pred.regime} regime. Continue trusting similar setups.`
    : `Key lesson: ${indicatorsFailed.slice(0, 2).join(' and ') || 'the market structure'} failed to confirm the thesis. In ${pred.regime} conditions, ${volatilityUnderestimated ? 'volatility management' : 'confidence calibration'} needs improvement.`;

  return {
    confidenceWasJustified: !confidenceTooAggressive,
    indicatorsHelped,
    indicatorsFailed,
    volatilityUnderestimated,
    sentimentReversed,
    regimeWasUnstable,
    confidenceTooAggressive,
    newsInvalidatedSetup,
    trendStrengthWasWeak,
    overallAssessment,
    lessonLearned,
  };
}

export function generateFailureAnalysisReport(
  pred: AIMemoryPrediction,
  actualPrice: number,
): FailureAnalysisReport {
  const pctChange = pred.entryPrice > 0 ? ((actualPrice - pred.entryPrice) / pred.entryPrice) * 100 : 0;
  const absMove = Math.abs(pctChange);
  const expectedMove = pred.targetPrice > 0 && pred.entryPrice > 0 ? Math.abs((pred.targetPrice - pred.entryPrice) / pred.entryPrice) * 100 : 2;
  const reasons: string[] = [];
  let primaryReason = 'Unexpected market movement';
  let volatilitySpike = false, newsEvent = false, regimeChange = false;
  let momentumFailure = false; const resistanceRejection = false;
  const earningsImpact = false; let institutionalSelling = false; const lowLiquidity = false;
  let sentimentReversal = false, fakeBreakout = false, weakTrend = false;

  if (absMove > expectedMove * 2) {
    volatilitySpike = true;
    primaryReason = 'Volatility spike exceeded predicted range';
    reasons.push(`Actual move (${absMove.toFixed(1)}%) was ${(absMove / expectedMove).toFixed(1)}x expected`);
  }

  if (pred.regime === 'RANGING' && absMove > 5) {
    regimeChange = true;
    primaryReason = 'Market regime breakout from ranging';
    reasons.push(`Price broke out of ${pred.regime} regime`);
  }

  if (pctChange < 0 && pred.direction === 'BULLISH') {
    if (absMove > 2) {
      momentumFailure = true;
      reasons.push('Bullish momentum failed to sustain');
    }
    if (pred.fullSnapshot && absMove > pred.fullSnapshot.atr * 2) {
      institutionalSelling = true;
      reasons.push('Institutional selling detected');
    }
  }

  if (pctChange > 0 && pred.direction === 'BEARISH') {
    if (absMove > 2) {
      momentumFailure = true;
      reasons.push('Bearish momentum invalidated');
    }
  }

  if (pred.fullSnapshot) {
    if (pred.fullSnapshot.bollingerWidth < 3 && absMove > expectedMove) {
      fakeBreakout = true;
      reasons.push('Bollinger squeeze resulted in false breakout');
    }
    if (pred.fullSnapshot.adx < 20) {
      weakTrend = true;
      reasons.push('Trend strength was insufficient (ADX < 20)');
    }
  }

  // News event detection
  const newsSentiment = getNewsSentimentForTicker(pred.ticker);
  if (Math.abs(newsSentiment) > 20) {
    newsEvent = true;
    sentimentReversal = true;
    reasons.push(`News sentiment (${newsSentiment > 0 ? 'BULLISH' : 'BEARISH'} ${Math.abs(newsSentiment).toFixed(0)}) influenced price action`);
  }

  // If no specific reason found, classify generically
  if (reasons.length === 0) {
    if (pctChange > 0) {
      reasons.push('Downside thesis invalidated by upward momentum');
      momentumFailure = true;
    } else {
      reasons.push('Upside thesis invalidated by downward pressure');
      momentumFailure = true;
    }
  }

  const detail = `Predicted ${pred.direction.toLowerCase()} at ${pred.confidence}% confidence. ` +
    `Actual: ${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(2)}%. ` +
    reasons.join('. ') + '.';

  return {
    primaryReason,
    secondaryReasons: reasons.slice(1),
    volatilitySpike, newsEvent, regimeChange, momentumFailure,
    resistanceRejection, earningsImpact, institutionalSelling, lowLiquidity,
    sentimentReversal, fakeBreakout, weakTrend, detail,
  };
}
