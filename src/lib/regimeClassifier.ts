// Market regime classification — real volatility & trend detection
// Uses the unified detectRegime() from technicalAnalysis as the base,
// then enriches with directional and volatility metadata.

import type { OHLC, TAIndicators, MarketRegime } from './technicalAnalysis';
import { detectRegime } from './technicalAnalysis';
import type { MarketSession } from './marketSession';

export type RegimeType = MarketRegime;

export interface RegimeResult {
  regime: RegimeType;
  volatilityLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  trendDirection: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  trendStrength: number;
  score: number;
  description: string;
  regimeConfidence: number;
}

export function classifyRegime(ta: TAIndicators, candles: OHLC[], session?: MarketSession): RegimeResult {
  const baseRegime = detectRegime(ta);

  const isBullish = ta.rsi > 50 && ta.supertrend.direction === 'up' && ta.macd.histogram > 0;
  const isBearish = ta.rsi < 50 && ta.supertrend.direction === 'down' && ta.macd.histogram < 0;
  const trendDirection: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = isBullish ? 'BULLISH' : isBearish ? 'BEARISH' : 'NEUTRAL';

  const atrPct = ta.atr && candles.length > 0 && candles[candles.length - 1]?.close > 0
    ? (ta.atr / candles[candles.length - 1].close) * 100 : 0;

  const volatilityLevel: 'HIGH' | 'MEDIUM' | 'LOW' = atrPct > 2.5 ? 'HIGH' : atrPct > 1.0 ? 'MEDIUM' : 'LOW';

  const descriptionMap: Record<MarketRegime, string> = {
    STRONG_TREND: 'Strong trending market — directional conviction high',
    WEAK_TREND: 'Moderate trend — some directional bias present',
    RANGING: 'Price consolidating in a range — no clear direction',
    HIGH_VOLATILITY: 'Elevated volatility — wider stops needed',
    PANIC: 'Extreme momentum — panic-level move detected',
    BREAKOUT: 'Potential breakout — expanding volatility with strong trend',
  };
  const confidenceMap: Record<MarketRegime, number> = {
    STRONG_TREND: 75,
    WEAK_TREND: 65,
    RANGING: 55,
    HIGH_VOLATILITY: 60,
    PANIC: 80,
    BREAKOUT: 65,
  };

  let description = descriptionMap[baseRegime] || 'Mixed signals — market undecided';
  let regimeConfidence = confidenceMap[baseRegime] || 40;

  // Apply session modifier
  if (session) {
    if (session === 'OPENING' && (baseRegime === 'HIGH_VOLATILITY' || baseRegime === 'BREAKOUT')) {
      regimeConfidence = Math.min(95, regimeConfidence - 15);
      description += ' (session: opening volatile, confirm with first 30-min close)';
    }
    if (session === 'CLOSING') {
      regimeConfidence = Math.min(95, regimeConfidence + 10);
      description += ' (session: closing — institutional positioning)';
    }
  }

  return {
    regime: baseRegime,
    volatilityLevel,
    trendDirection,
    trendStrength: ta.adx || 0,
    score: baseRegime === 'PANIC' ? 10 : baseRegime === 'STRONG_TREND' ? 85 : baseRegime === 'WEAK_TREND' ? 65 : 50,
    description,
    regimeConfidence,
  };
}

export function getRegimeWeight(regime: RegimeType): number {
  const weights: Record<RegimeType, number> = {
    STRONG_TREND: 1.2,
    WEAK_TREND: 1.0,
    RANGING: 0.8,
    HIGH_VOLATILITY: 0.7,
    PANIC: 0.5,
    BREAKOUT: 1.4,
  };
  return weights[regime] || 1.0;
}

export function getRegimeRecommendation(regime: RegimeType): string {
  const recs: Record<RegimeType, string> = {
    STRONG_TREND: 'Ride the trend, use trailing stop loss',
    WEAK_TREND: 'Selective entries, confirm with volume',
    RANGING: 'Sell OTM strangles, avoid directional bets',
    HIGH_VOLATILITY: 'Reduce position size, widen stops',
    PANIC: 'Wait for volume exhaustion before re-entry',
    BREAKOUT: 'Pyramid on confirmation with tight SL',
  };
  return recs[regime] || 'No recommendation';
}
