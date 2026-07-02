import type { AIFullSnapshot, AIExplanation } from './types';
import type { MarketRegimeClass } from './marketRegime';
import { classifyMarketRegime } from './marketRegime';

export function generateExplanation(
  ticker: string,
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL',
  confidence: number,
  bullishProb: number,
  bearishProb: number,
  snapshot: AIFullSnapshot | null,
  regime?: string,
  sentiment?: number,
  reasoning?: string[],
): AIExplanation {
  const bullishFactors: string[] = [];
  const bearishFactors: string[] = [];
  const contributions: { name: string; contribution: number; signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' }[] = [];
  let regimeNarrative = '';
  let volatilityReasoning = '';
  let sentimentReasoning = '';

  if (snapshot) {
    const s = snapshot;

    // RSI contribution
    if (s.rsi > 60) {
      bullishFactors.push(`RSI at ${s.rsi.toFixed(0)} — strong bullish momentum, not yet overbought`);
      contributions.push({ name: 'RSI', contribution: Math.min(20, (s.rsi - 50) * 1.5), signal: 'BULLISH' });
    } else if (s.rsi < 40) {
      bearishFactors.push(`RSI at ${s.rsi.toFixed(0)} — bearish momentum with room to fall`);
      contributions.push({ name: 'RSI', contribution: Math.min(20, (50 - s.rsi) * 1.5), signal: 'BEARISH' });
    } else {
      contributions.push({ name: 'RSI', contribution: 5, signal: 'NEUTRAL' });
    }

    // MACD contribution
    if (s.macdHistogram > 0 && s.macdLine > s.macdSignal) {
      bullishFactors.push(`MACD positive with rising histogram — momentum accelerating`);
      contributions.push({ name: 'MACD', contribution: 18, signal: 'BULLISH' });
    } else if (s.macdHistogram < 0 && s.macdLine < s.macdSignal) {
      bearishFactors.push(`MACD negative with falling histogram — momentum declining`);
      contributions.push({ name: 'MACD', contribution: 18, signal: 'BEARISH' });
    } else {
      contributions.push({ name: 'MACD', contribution: 5, signal: 'NEUTRAL' });
    }

    // EMA alignment
    if (s.ema20 > s.ema50) {
      bullishFactors.push(`EMA20 (${s.ema20.toFixed(0)}) above EMA50 (${s.ema50.toFixed(0)}) — bullish alignment`);
      contributions.push({ name: 'EMA Trend', contribution: 12, signal: 'BULLISH' });
    } else {
      bearishFactors.push(`EMA20 (${s.ema20.toFixed(0)}) below EMA50 (${s.ema50.toFixed(0)}) — bearish alignment`);
      contributions.push({ name: 'EMA Trend', contribution: 12, signal: 'BEARISH' });
    }

    // ADX (trend strength)
    if (s.adx > 30) {
      const trendNote = direction === 'BULLISH' ? 'confirming trend strength' : 'confirming downtrend strength';
      if (direction === 'BULLISH') bullishFactors.push(`ADX at ${s.adx.toFixed(0)} — strong trend, ${trendNote}`);
      else bearishFactors.push(`ADX at ${s.adx.toFixed(0)} — strong trend, ${trendNote}`);
      contributions.push({ name: 'ADX', contribution: s.adx > 35 ? 10 : 7, signal: direction === 'BULLISH' ? 'BULLISH' : 'BEARISH' });
    } else if (s.adx < 20) {
      bearishFactors.push(`ADX at ${s.adx.toFixed(0)} — weak trend, ranging conditions`);
      contributions.push({ name: 'ADX', contribution: 3, signal: 'NEUTRAL' });
    } else {
      contributions.push({ name: 'ADX', contribution: 5, signal: 'NEUTRAL' });
    }

    // Bollinger
    if (s.bollingerWidth < 4) {
      const bbNote = direction === 'BULLISH' ? 'squeeze may resolve upward' : 'squeeze may resolve downward';
      contributions.push({ name: 'Bollinger', contribution: 7, signal: direction === 'BULLISH' ? 'BULLISH' : 'BEARISH' });
      if (direction === 'BULLISH') bullishFactors.push(`Bollinger squeeze (width ${s.bollingerWidth.toFixed(1)}) — ${bbNote}`);
      else bearishFactors.push(`Bollinger squeeze (width ${s.bollingerWidth.toFixed(1)}) — ${bbNote}`);
    }

    // Supertrend
    if (s.supertrendDirection === 'up') {
      bullishFactors.push('Supertrend bullish — trend following signal active');
      contributions.push({ name: 'Supertrend', contribution: 10, signal: 'BULLISH' });
    } else {
      bearishFactors.push('Supertrend bearish — trend following signal active');
      contributions.push({ name: 'Supertrend', contribution: 10, signal: 'BEARISH' });
    }

    // Volume
    if (s.volumeRatio > 1.5) {
      const volNote = direction === 'BULLISH' ? 'high volume confirms accumulation' : 'high volume but price not following';
      bullishFactors.push(`Volume ${s.volumeRatio.toFixed(1)}x average — ${volNote}`);
      contributions.push({ name: 'Volume', contribution: 8, signal: 'BULLISH' });
    } else if (s.volumeRatio < 0.7) {
      bearishFactors.push(`Volume ${s.volumeRatio.toFixed(1)}x average — low participation, unreliable moves`);
      contributions.push({ name: 'Volume', contribution: 4, signal: 'BEARISH' });
    } else {
      contributions.push({ name: 'Volume', contribution: 5, signal: 'NEUTRAL' });
    }

    // StochRSI
    if (s.stochRsi > 80) {
      bullishFactors.push(`StochRSI at ${s.stochRsi.toFixed(0)} — strong momentum`);
      contributions.push({ name: 'StochRSI', contribution: 7, signal: 'BULLISH' });
    } else if (s.stochRsi < 20) {
      bearishFactors.push(`StochRSI at ${s.stochRsi.toFixed(0)} — oversold but momentum weak`);
      contributions.push({ name: 'StochRSI', contribution: 7, signal: 'BEARISH' });
    } else {
      contributions.push({ name: 'StochRSI', contribution: 4, signal: 'NEUTRAL' });
    }

    // ATR volatility
    if (s.atrRatio > 0.03) {
      volatilityReasoning = `High volatility (ATR ${(s.atrRatio * 100).toFixed(1)}% of price) — wider stops recommended`;
    } else if (s.atrRatio < 0.01) {
      volatilityReasoning = `Low volatility (ATR ${(s.atrRatio * 100).toFixed(2)}% of price) — tight stops possible`;
    } else {
      volatilityReasoning = `Moderate volatility (ATR ${(s.atrRatio * 100).toFixed(2)}% of price) — normal conditions`;
    }
  }

  // Regime reasoning
  if (regime) {
    regimeNarrative = `Market regime classified as ${regime.replace(/_/g, ' ').toLowerCase()}. ${
      regime.includes('TREND') ? 'Trend-following strategies preferred.' :
      regime === 'RANGING' ? 'Mean reversion strategies may work better.' :
      regime.includes('VOLATILITY') ? 'High volatility regime — reduce position sizes.' :
      'Standard market conditions.'
    }`;
  }

  // Sentiment reasoning
  if (sentiment !== undefined) {
    sentimentReasoning = sentiment > 60
      ? `Positive sentiment (${sentiment.toFixed(0)}/100) supports bullish thesis`
      : sentiment < 40
        ? `Negative sentiment (${sentiment.toFixed(0)}/100) supports bearish thesis`
        : `Neutral sentiment (${sentiment.toFixed(0)}/100) — sentiment not a strong factor`;
  }

  // Build overall narrative
  const totalBullishContrib = contributions.filter(c => c.signal === 'BULLISH').reduce((s, c) => s + c.contribution, 0);
  const totalBearishContrib = contributions.filter(c => c.signal === 'BEARISH').reduce((s, c) => s + c.contribution, 0);
  const netSignal = totalBullishContrib - totalBearishContrib;

  const overallNarrative = `${ticker}: ${direction} prediction at ${confidence}% confidence. ` +
    `Bullish probability ${bullishProb.toFixed(0)}% vs bearish ${bearishProb.toFixed(0)}%. ` +
    `Net indicator signal: ${netSignal > 0 ? 'bullish' : netSignal < 0 ? 'bearish' : 'neutral'} ` +
    `(${netSignal > 0 ? '+' : ''}${netSignal.toFixed(0)}). ` +
    `${regimeNarrative} ${volatilityReasoning}`;

  return {
    ticker,
    direction,
    confidence,
    strongestBullishFactors: bullishFactors.slice(0, 4),
    strongestBearishFactors: bearishFactors.slice(0, 4),
    confidenceReasoning: `Confidence ${confidence}% based on ${bullishFactors.length} bullish + ${bearishFactors.length} bearish factors. ${confidence >= 60 ? 'High conviction setup with strong multi-indicator confirmation.' : confidence >= 40 ? 'Moderate conviction with mixed indicator signals.' : 'Low conviction — many indicators are neutral or conflicting.'}`,
    marketRegimeReasoning: regimeNarrative,
    volatilityReasoning,
    sentimentReasoning,
    indicatorContribution: contributions,
    overallNarrative,
  };
}
