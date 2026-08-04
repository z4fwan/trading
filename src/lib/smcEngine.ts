import { OHLC } from './technicalAnalysis';

export interface SMCSignals {
  fvg: { active: boolean; type: 'BULLISH' | 'BEARISH' | null; gapStart: number; gapEnd: number };
  orderBlock: { active: boolean; type: 'BULLISH' | 'BEARISH' | null; priceLevel: number };
  liquiditySweep: { active: boolean; type: 'BULLISH' | 'BEARISH' | null; priceLevel: number };
  bos: { active: boolean; type: 'BULLISH' | 'BEARISH' | null; priceLevel: number };
  confidence: number;
}

/**
 * Detects Smart Money Concepts footprints from naked candlesticks.
 */
export function detectSMCSetup(candles: OHLC[]): SMCSignals | null {
  if (candles.length < 20) return null;

  const result: SMCSignals = {
    fvg: { active: false, type: null, gapStart: 0, gapEnd: 0 },
    orderBlock: { active: false, type: null, priceLevel: 0 },
    liquiditySweep: { active: false, type: null, priceLevel: 0 },
    bos: { active: false, type: null, priceLevel: 0 },
    confidence: 0
  };

  const len = candles.length;
  let confidenceScore = 0;

  // 1. Detect Fair Value Gap (FVG) - Looks at the last 3 candles
  // Bullish FVG: Candle 1 High is lower than Candle 3 Low
  // Bearish FVG: Candle 1 Low is higher than Candle 3 High
  const c1 = candles[len - 3];
  const c3 = candles[len - 1];

  if (c1 && c3) {
    if (c1.high < c3.low) {
      result.fvg = { active: true, type: 'BULLISH', gapStart: c1.high, gapEnd: c3.low };
      confidenceScore += 30;
    } else if (c1.low > c3.high) {
      result.fvg = { active: true, type: 'BEARISH', gapStart: c3.high, gapEnd: c1.low };
      confidenceScore += 30;
    }
  }

  // 2. Detect Liquidity Sweep (Lookback last 15 candles for a wick that sweeps a previous low/high and rejects)
  // A sweep is when price goes below a significant low, but closes above it (leaving a long tail).
  const lowestLow = Math.min(...candles.slice(len - 15, len - 2).map(c => c.low));
  const highestHigh = Math.max(...candles.slice(len - 15, len - 2).map(c => c.high));
  
  const current = candles[len - 1];
  
  if (current.low < lowestLow && current.close > lowestLow) {
    // Swept sell-side liquidity, bullish reversal
    result.liquiditySweep = { active: true, type: 'BULLISH', priceLevel: lowestLow };
    confidenceScore += 40;
  } else if (current.high > highestHigh && current.close < highestHigh) {
    // Swept buy-side liquidity, bearish reversal
    result.liquiditySweep = { active: true, type: 'BEARISH', priceLevel: highestHigh };
    confidenceScore += 40;
  }

  // 3. Detect Order Block (OB)
  if (result.fvg.active) {
    if (result.fvg.type === 'BULLISH') {
      for (let i = len - 2; i >= Math.max(0, len - 10); i--) {
        if (candles[i].close < candles[i].open) { 
          result.orderBlock = { active: true, type: 'BULLISH', priceLevel: candles[i].low };
          confidenceScore += 30;
          break;
        }
      }
    } else {
      for (let i = len - 2; i >= Math.max(0, len - 10); i--) {
        if (candles[i].close > candles[i].open) { 
          result.orderBlock = { active: true, type: 'BEARISH', priceLevel: candles[i].high };
          confidenceScore += 30;
          break;
        }
      }
    }
  }

  // Cap confidence
  result.confidence = Math.min(99, confidenceScore);

  return result;
}
