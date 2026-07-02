// Advanced feature engineering — log returns, triple-barrier, volatility-adjusted Z-scores

import type { OHLC } from './technicalAnalysis';

export interface PriceActionFeatures {
  logReturn: number;
  intradaySpread: number;
  candleBody: number;
  upperShadow: number;
  lowerShadow: number;
  bodyToRangeRatio: number;
  isBullishCandle: boolean;
  hammerCandle: boolean;
  engulfing: boolean;
}

export interface VolatilityFeatures {
  currentVolatility: number;
  volatilityZScore: number;
  atrPercent: number;
  highLowRangePercent: number;
}

export interface TripleBarrier {
  profitTake: number;
  stopLoss: number;
  timeLimit: number;
  label: 1 | 0 | -1;
  touched: 'PROFIT_TAKE' | 'STOP_LOSS' | 'TIME_OUT' | null;
}

export interface BollingerZScore {
  zScore: number;
  atBand: boolean;
  squeezed: boolean;
}

export function computeLogReturns(closes: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0) {
      returns.push(Math.log(closes[i] / closes[i - 1]));
    }
  }
  return returns;
}

export function computePriceActionFeatures(candle: OHLC, prevCandle?: OHLC): PriceActionFeatures {
  const body = Math.abs(candle.close - candle.open);
  const range = candle.high - candle.low;
  const isBullish = candle.close >= candle.open;
  const upperShadow = isBullish ? candle.high - candle.close : candle.high - candle.open;
  const lowerShadow = isBullish ? candle.open - candle.low : candle.close - candle.low;

  let engulfing = false;
  if (prevCandle) {
    const prevBullish = prevCandle.close >= prevCandle.open;
    engulfing = isBullish !== prevBullish &&
      candle.open < prevCandle.close && candle.close > prevCandle.open;
  }

  const hammerBody = Math.min(candle.open, candle.close);
  const hammerLower = candle.low;
  const hammerUpper = candle.high;
  const hammerRange = hammerUpper - hammerLower;

  return {
    logReturn: prevCandle && prevCandle.close > 0
      ? Math.log(candle.close / prevCandle.close) : 0,
    intradaySpread: candle.low > 0 ? ((candle.high - candle.low) / candle.low) * 100 : 0,
    candleBody: body,
    upperShadow,
    lowerShadow,
    bodyToRangeRatio: range > 0 ? body / range : 0,
    isBullishCandle: isBullish,
    hammerCandle: range > 0 && hammerBody > 0 && (lowerShadow / hammerBody > 2) && upperShadow < hammerBody * 0.5,
    engulfing,
  };
}

export function computeBollingerZScore(
  close: number, sma: number, std: number,
): BollingerZScore {
  if (!std || std === 0) return { zScore: 0, atBand: false, squeezed: false };
  const zScore = (close - sma) / std;
  return {
    zScore,
    atBand: Math.abs(zScore) >= 2,
    squeezed: std / sma < 0.02,
  };
}

export function computeTripleBarrier(
  entryPrice: number,
  atr: number,
  volatilityMultiplier: number,
  currentBarrier: number,
  highSinceEntry: number,
  lowSinceEntry: number,
): TripleBarrier {
  const barrierDistance = atr * volatilityMultiplier;
  const profitTake = entryPrice + barrierDistance;
  const stopLoss = entryPrice - barrierDistance;

  let label: 1 | 0 | -1 = 0;
  let touched: TripleBarrier['touched'] = null;

  if (currentBarrier >= profitTake) {
    label = 1;
    touched = 'PROFIT_TAKE';
  } else if (currentBarrier <= stopLoss) {
    label = -1;
    touched = 'STOP_LOSS';
  } else {
    touched = 'TIME_OUT';
  }

  return { profitTake, stopLoss, timeLimit: 0, label, touched };
}

export function computeVolatilityFeatures(closes: number[], atr: number, currentClose: number, high?: number, low?: number): VolatilityFeatures {
  const returns = computeLogReturns(closes);
  const recentVol = returns.length > 0
    ? Math.sqrt(returns.reduce((s, r) => s + r * r, 0) / returns.length) * Math.sqrt(252) * 100
    : 0;

  const histReturns = closes.length > 20
    ? computeLogReturns(closes.slice(-20))
    : returns;
  const meanRet = histReturns.length > 0
    ? histReturns.reduce((s, r) => s + r, 0) / histReturns.length
    : 0;
  const varRet = histReturns.length > 1
    ? histReturns.reduce((s, r) => s + (r - meanRet) ** 2, 0) / (histReturns.length - 1)
    : 0;
  const volZScore = Math.sqrt(varRet) > 0
    ? (recentVol - Math.sqrt(varRet) * Math.sqrt(252) * 100) / (Math.sqrt(varRet) * Math.sqrt(252) * 100)
    : 0;

  return {
    currentVolatility: recentVol,
    volatilityZScore: volZScore,
    atrPercent: currentClose > 0 ? (atr / currentClose) * 100 : 0,
    highLowRangePercent: currentClose > 0 && high !== undefined && low !== undefined ? ((high - low) / currentClose) * 100 : 0,
  };
}

export function computeVolumeFeatures(
  volume: number,
  volumeSma20: number,
  close: number,
  vwap: number,
): { volumeRatio: number; vwapDeviation: number } {
  return {
    volumeRatio: volumeSma20 > 0 ? volume / volumeSma20 : 1,
    vwapDeviation: vwap > 0 ? ((close - vwap) / vwap) * 100 : 0,
  };
}

export function computeAccumulationDistribution(candles: OHLC[]): number {
  if (candles.length < 2) return 0;
  let ad = 0;
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const hl = c.high - c.low;
    if (hl === 0) continue;
    const mfv = ((c.close - c.low) - (c.high - c.close)) / hl * c.volume;
    ad += mfv;
  }
  return ad;
}
