/**
 * Advanced Technical Engine - Institutional Grade
 * 
 * Comprehensive technical analysis with professional indicators:
 * VWAP, Anchored VWAP, Supertrend, EMA Ribbon, ADX, ATR, MACD,
 * Bollinger Bands, Relative Strength, Volume Profile, etc.
 */

export interface OHLCV {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TechnicalIndicators {
  // Trend
  vwap: number;
  anchoredVWAP: Record<string, number>;
  emaRibbon: { ema9: number; ema21: number; ema50: number; ema200: number };
  supertrend: { value: number; direction: 'UP' | 'DOWN' };
  
  // Momentum
  rsi: number;
  macd: { macd: number; signal: number; histogram: number };
  momentum: number;
  roc: number; // Rate of Change
  
  // Volatility
  atr: number;
  bollingerBands: { upper: number; middle: number; lower: number; width: number };
  keltnerChannel: { upper: number; middle: number; lower: number };
  
  // Volume
  volumeProfile: { poc: number; vah: number; val: number };
  obv: number; // On-Balance Volume
  volumeWeightedMomentum: number;
  
  // Strength
  adx: { adx: number; plusDI: number; minusDI: number };
  relativeStrength: number; // vs sector/index
  trendSlope: number;
  
  // Support/Resistance
  supportResistance: { support: number[]; resistance: number[] };
  pivotPoints: { pivot: number; r1: number; r2: number; r3: number; s1: number; s2: number; s3: number };
  
  // Gap Analysis
  gapAnalysis: { hasGap: boolean; gapPercent: number; gapType: 'NONE' | 'COMMON' | 'BREAKAWAY' | 'RUNWAY' | 'EXHAUSTION' };
  
  // Breakout Confirmation
  breakoutConfirmation: { isBreakout: boolean; breakoutLevel: number; volumeConfirmation: boolean };
  
  // Composite Scores
  trendScore: number; // 0-100
  momentumScore: number; // 0-100
  volumeScore: number; // 0-100
  volatilityScore: number; // 0-100
  liquidityScore: number; // 0-100
  overallTechnicalScore: number; // 0-100
}

/**
 * Advanced Technical Engine
 */
export class AdvancedTechnicalEngine {
  
  /**
   * Calculate all technical indicators
   */
  calculateIndicators(data: OHLCV[], sectorIndex?: OHLCV[], benchmarkIndex?: OHLCV[]): TechnicalIndicators {
    const closes = data.map(d => d.close);
    const highs = data.map(d => d.high);
    const lows = data.map(d => d.low);
    const volumes = data.map(d => d.volume);
    
    // === TREND INDICATORS ===
    const vwap = this.calculateVWAP(data);
    const anchoredVWAP = this.calculateAnchoredVWAP(data);
    const emaRibbon = this.calculateEMARibbon(closes);
    const supertrend = this.calculateSupertrend(highs, lows, closes);
    
    // === MOMENTUM INDICATORS ===
    const rsi = this.calculateRSI(closes);
    const macd = this.calculateMACD(closes);
    const momentum = this.calculateMomentum(closes, 10);
    const roc = this.calculateROC(closes, 10);
    
    // === VOLATILITY INDICATORS ===
    const atr = this.calculateATR(highs, lows, closes);
    const bollingerBands = this.calculateBollingerBands(closes);
    const keltnerChannel = this.calculateKeltnerChannel(highs, lows, closes, atr);
    
    // === VOLUME INDICATORS ===
    const volumeProfile = this.calculateVolumeProfile(data);
    const obv = this.calculateOBV(closes, volumes);
    const volumeWeightedMomentum = this.calculateVolumeWeightedMomentum(closes, volumes);
    
    // === STRENGTH INDICATORS ===
    const adx = this.calculateADX(highs, lows, closes);
    const relativeStrength = sectorIndex ? this.calculateRelativeStrength(closes, sectorIndex.map(d => d.close)) : 50;
    const trendSlope = this.calculateTrendSlope(closes);
    
    // === SUPPORT/RESISTANCE ===
    const supportResistance = this.calculateSupportResistance(closes, highs, lows);
    const pivotPoints = this.calculatePivotPoints(data);
    
    // === GAP ANALYSIS ===
    const gapAnalysis = this.calculateGapAnalysis(data);
    
    // === BREAKOUT CONFIRMATION ===
    const breakoutConfirmation = this.calculateBreakoutConfirmation(data, supportResistance);
    
    // === COMPOSITE SCORES ===
    const trendScore = this.calculateTrendScore(emaRibbon, supertrend, adx);
    const momentumScore = this.calculateMomentumScore(rsi, macd, momentum);
    const volumeScore = this.calculateVolumeScore(volumes, volumeWeightedMomentum);
    const volatilityScore = this.calculateVolatilityScore(atr, bollingerBands);
    const liquidityScore = this.calculateLiquidityScore(volumes);
    
    const overallTechnicalScore = Math.round(
      trendScore * 0.30 +
      momentumScore * 0.25 +
      volumeScore * 0.20 +
      volatilityScore * 0.15 +
      liquidityScore * 0.10
    );
    
    return {
      vwap,
      anchoredVWAP,
      emaRibbon,
      supertrend,
      rsi,
      macd,
      momentum,
      roc,
      atr,
      bollingerBands,
      keltnerChannel,
      volumeProfile,
      obv,
      volumeWeightedMomentum,
      adx,
      relativeStrength,
      trendSlope,
      supportResistance,
      pivotPoints,
      gapAnalysis,
      breakoutConfirmation,
      trendScore,
      momentumScore,
      volumeScore,
      volatilityScore,
      liquidityScore,
      overallTechnicalScore
    };
  }
  
  // === TREND INDICATORS ===
  
  private calculateVWAP(data: OHLCV[]): number {
    if (data.length === 0) return 0;
    let totalVolume = 0;
    let totalPV = 0;
    for (const candle of data) {
      const typicalPrice = (candle.high + candle.low + candle.close) / 3;
      totalPV += typicalPrice * candle.volume;
      totalVolume += candle.volume;
    }
    return totalVolume > 0 ? totalPV / totalVolume : data[data.length - 1].close;
  }
  
  private calculateAnchoredVWAP(data: OHLCV[]): Record<string, number> {
    const anchors = ['1D', '5D', '10D', '20D'];
    const results: Record<string, number> = {};
    
    for (const period of anchors) {
      const lookback = parseInt(period);
      const slice = data.slice(-lookback);
      results[period] = this.calculateVWAP(slice);
    }
    
    return results;
  }
  
  private calculateEMARibbon(closes: number[]): { ema9: number; ema21: number; ema50: number; ema200: number } {
    return {
      ema9: this.EMA(closes, 9),
      ema21: this.EMA(closes, 21),
      ema50: this.EMA(closes, 50),
      ema200: this.EMA(closes, 200)
    };
  }
  
  private calculateSupertrend(highs: number[], lows: number[], closes: number[]): { value: number; direction: 'UP' | 'DOWN' } {
    const period = 10;
    const multiplier = 3;
    const len = Math.min(highs.length, lows.length, closes.length);
    if (len < period + 1) return { value: closes[len - 1] || 0, direction: 'UP' };

    const trAt = (i: number): number => Math.max(
      highs[i] - lows[i],
      i > 0 ? Math.abs(highs[i] - closes[i - 1]) : 0,
      i > 0 ? Math.abs(lows[i] - closes[i - 1]) : 0,
    );
    const avg = (arr: number[]): number => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

    // Standard carry-forward Supertrend bands. The previous single-tick check
    // (close > upper ? UP : close < lower ? DOWN : UP) defaulted everything to
    // 'UP' and never tracked the trend — it was direction-blind on real data.
    let stUpper = 0;
    let stLower = 0;
    let direction: 'UP' | 'DOWN' = 'UP';
    for (let i = period; i < len; i++) {
      const trs: number[] = [];
      for (let j = i - period; j < i; j++) trs.push(trAt(j));
      const atrI = avg(trs);
      const hl = (highs[i] + lows[i]) / 2;
      const upper = hl + multiplier * atrI;
      const lower = hl - multiplier * atrI;
      const close = closes[i];
      if (i === period) {
        stUpper = upper;
        stLower = lower;
        direction = close > lower ? 'UP' : 'DOWN';
      } else {
        stUpper = (stUpper === upper || close > stUpper) ? upper : stUpper;
        stLower = (stLower === lower || close < stLower) ? lower : stLower;
        if (close > stLower) direction = 'UP';
        else if (close < stUpper) direction = 'DOWN';
      }
    }

    return {
      value: direction === 'UP' ? stLower : stUpper,
      direction
    };
  }
  
  // === MOMENTUM INDICATORS ===
  
  private calculateRSI(closes: number[], period: number = 14): number {
    if (closes.length < period + 1) return 50;
    
    let gains = 0;
    let losses = 0;
    
    for (let i = closes.length - period; i < closes.length; i++) {
      const change = closes[i] - closes[i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }
    
    const avgGain = gains / period;
    const avgLoss = losses / period;
    
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }
  
  private calculateMACD(closes: number[]): { macd: number; signal: number; histogram: number } {
    const ema12 = this.EMA(closes, 12);
    const ema26 = this.EMA(closes, 26);
    const macdLine = ema12 - ema26;
    
    // Signal line (9-period EMA of MACD)
    const macdValues = [];
    for (let i = 25; i < closes.length; i++) {
      const e12 = this.EMA(closes.slice(0, i + 1), 12);
      const e26 = this.EMA(closes.slice(0, i + 1), 26);
      macdValues.push(e12 - e26);
    }
    
    const signalLine = macdValues.length > 9 ? this.EMA(macdValues, 9) : macdLine;
    const histogram = macdLine - signalLine;
    
    return { macd: macdLine, signal: signalLine, histogram };
  }
  
  private calculateMomentum(closes: number[], period: number = 10): number {
    if (closes.length < period) return 0;
    return ((closes[closes.length - 1] - closes[closes.length - period - 1]) / closes[closes.length - period - 1]) * 100;
  }
  
  private calculateROC(closes: number[], period: number = 10): number {
    if (closes.length < period) return 0;
    return ((closes[closes.length - 1] / closes[closes.length - period - 1]) - 1) * 100;
  }
  
  // === VOLATILITY INDICATORS ===
  
  private calculateATR(highs: number[], lows: number[], closes: number[], period: number = 14): number {
    if (highs.length < period + 1) return 0;
    
    let trSum = 0;
    for (let i = highs.length - period; i < highs.length; i++) {
      const tr = Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      );
      trSum += tr;
    }
    
    return trSum / period;
  }
  
  private calculateBollingerBands(closes: number[], period: number = 20, stdDev: number = 2): { upper: number; middle: number; lower: number; width: number } {
    const slice = closes.slice(-period);
    const middle = slice.reduce((a, b) => a + b, 0) / period;
    
    const variance = slice.reduce((sum, val) => sum + Math.pow(val - middle, 2), 0) / period;
    const std = Math.sqrt(variance);
    
    const upper = middle + (stdDev * std);
    const lower = middle - (stdDev * std);
    const width = ((upper - lower) / middle) * 100;
    
    return { upper, middle, lower, width };
  }
  
  private calculateKeltnerChannel(highs: number[], lows: number[], closes: number[], atr: number, period: number = 20): { upper: number; middle: number; lower: number } {
    const slice = closes.slice(-period);
    const middle = slice.reduce((a, b) => a + b, 0) / period;
    const multiplier = 2;
    
    return {
      upper: middle + (multiplier * atr),
      middle,
      lower: middle - (multiplier * atr)
    };
  }
  
  // === VOLUME INDICATORS ===
  
  private calculateVolumeProfile(data: OHLCV[]): { poc: number; vah: number; val: number } {
    // Simplified volume profile calculation
    const priceVolumes: Record<number, number> = {};
    
    for (const candle of data) {
      const price = Math.round(candle.close);
      priceVolumes[price] = (priceVolumes[price] || 0) + candle.volume;
    }
    
    const sortedPrices = Object.entries(priceVolumes).sort((a, b) => b[1] - a[1]);
    const poc = parseInt(sortedPrices[0][0]); // Point of Control
    
    const totalVolume = Object.values(priceVolumes).reduce((a, b) => a + b, 0);
    let cumulativeVolume = 0;
    let vah = poc;
    const val = poc;
    
    for (const [price, volume] of sortedPrices) {
      cumulativeVolume += volume;
      if (cumulativeVolume / totalVolume <= 0.35) {
        if (parseInt(price) > vah) vah = parseInt(price);
      }
    }
    
    return { poc, vah, val };
  }
  
  private calculateOBV(closes: number[], volumes: number[]): number {
    let obv = volumes[0] || 0;
    for (let i = 1; i < closes.length; i++) {
      if (closes[i] > closes[i - 1]) obv += volumes[i];
      else if (closes[i] < closes[i - 1]) obv -= volumes[i];
    }
    return obv;
  }
  
  private calculateVolumeWeightedMomentum(closes: number[], volumes: number[]): number {
    if (closes.length < 10) return 0;
    
    const recentClose = closes[closes.length - 1];
    const oldClose = closes[closes.length - 10];
    const priceChange = ((recentClose - oldClose) / oldClose) * 100;
    
    const recentVol = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const oldVol = volumes.slice(-15, -10).reduce((a, b) => a + b, 0) / 5;
    const volRatio = recentVol / (oldVol || 1);
    
    return priceChange * volRatio;
  }
  
  // === STRENGTH INDICATORS ===
  
  private calculateADX(highs: number[], lows: number[], closes: number[], period: number = 14): { adx: number; plusDI: number; minusDI: number } {
    // Simplified ADX calculation
    const tr = this.calculateATR(highs, lows, closes, period);
    const plusDM = Math.max(0, highs[highs.length - 1] - highs[highs.length - 2]);
    const minusDM = Math.max(0, lows[lows.length - 2] - lows[lows.length - 1]);
    
    const plusDI = tr > 0 ? (plusDM / tr) * 100 : 0;
    const minusDI = tr > 0 ? (minusDM / tr) * 100 : 0;
    
    const dx = plusDI + minusDI > 0 ? (Math.abs(plusDI - minusDI) / (plusDI + minusDI)) * 100 : 0;
    
    // Smooth DX to get ADX (simplified)
    const adx = dx * 0.8; // Simplified smoothing
    
    return { adx: Math.min(100, adx), plusDI: Math.min(100, plusDI), minusDI: Math.min(100, minusDI) };
  }
  
  private calculateRelativeStrength(stockCloses: number[], indexCloses: number[]): number {
    if (stockCloses.length < 20 || indexCloses.length < 20) return 50;
    
    const stockReturn = ((stockCloses[stockCloses.length - 1] / stockCloses[stockCloses.length - 20]) - 1) * 100;
    const indexReturn = ((indexCloses[indexCloses.length - 1] / indexCloses[indexCloses.length - 20]) - 1) * 100;
    
    const relativeStrength = stockReturn - indexReturn;
    return Math.min(100, Math.max(0, 50 + relativeStrength));
  }
  
  private calculateTrendSlope(closes: number[], period: number = 20): number {
    if (closes.length < period) return 0;
    const slice = closes.slice(-period);
    const start = slice[0];
    const end = slice[slice.length - 1];
    return ((end - start) / start) * 100;
  }
  
  // === SUPPORT/RESISTANCE ===
  
  private calculateSupportResistance(closes: number[], highs: number[], lows: number[]): { support: number[]; resistance: number[] } {
    // Find local highs and lows
    const support: number[] = [];
    const resistance: number[] = [];
    
    for (let i = 2; i < closes.length - 2; i++) {
      if (lows[i] < lows[i - 1] && lows[i] < lows[i + 1] && lows[i] < lows[i - 2] && lows[i] < lows[i + 2]) {
        support.push(lows[i]);
      }
      if (highs[i] > highs[i - 1] && highs[i] > highs[i + 1] && highs[i] > highs[i - 2] && highs[i] > highs[i + 2]) {
        resistance.push(highs[i]);
      }
    }
    
    return {
      support: support.slice(-3),
      resistance: resistance.slice(-3)
    };
  }
  
  private calculatePivotPoints(data: OHLCV[]): { pivot: number; r1: number; r2: number; r3: number; s1: number; s2: number; s3: number } {
    const H = data[data.length - 2].high;
    const L = data[data.length - 2].low;
    const C = data[data.length - 2].close;
    
    const pivot = (H + L + C) / 3;
    const r1 = (2 * pivot) - L;
    const s1 = (2 * pivot) - H;
    const r2 = pivot + (H - L);
    const s2 = pivot - (H - L);
    const r3 = H + 2 * (pivot - L);
    const s3 = L - 2 * (H - pivot);
    
    return { pivot, r1, r2, r3, s1, s2, s3 };
  }
  
  // === GAP ANALYSIS ===
  
  private calculateGapAnalysis(data: OHLCV[]): { hasGap: boolean; gapPercent: number; gapType: 'NONE' | 'COMMON' | 'BREAKAWAY' | 'RUNWAY' | 'EXHAUSTION' } {
    if (data.length < 2) return { hasGap: false, gapPercent: 0, gapType: 'NONE' };
    
    const prevClose = data[data.length - 2].close;
    const open = data[data.length - 1].open;
    
    const gapPercent = ((open - prevClose) / prevClose) * 100;
    const hasGap = Math.abs(gapPercent) > 0.5;
    
    if (!hasGap) return { hasGap: false, gapPercent: 0, gapType: 'NONE' };
    
    // Classify gap type based on context (simplified)
    const volume = data[data.length - 1].volume;
    const avgVolume = data.slice(-20).reduce((s, d) => s + d.volume, 0) / 20;
    const volumeRatio = volume / (avgVolume || 1);
    
    if (Math.abs(gapPercent) > 3 && volumeRatio > 2) return { hasGap: true, gapPercent, gapType: 'BREAKAWAY' };
    if (Math.abs(gapPercent) > 2 && volumeRatio > 1.5) return { hasGap: true, gapPercent, gapType: 'RUNWAY' };
    if (Math.abs(gapPercent) > 1 && volumeRatio < 0.8) return { hasGap: true, gapPercent, gapType: 'EXHAUSTION' };
    
    return { hasGap: true, gapPercent, gapType: 'COMMON' };
  }
  
  // === BREAKOUT CONFIRMATION ===
  
  private calculateBreakoutConfirmation(data: OHLCV[], supportResistance: { support: number[]; resistance: number[] }): { isBreakout: boolean; breakoutLevel: number; volumeConfirmation: boolean } {
    const currentPrice = data[data.length - 1].close;
    const currentVolume = data[data.length - 1].volume;
    const avgVolume = data.slice(-20).reduce((s, d) => s + d.volume, 0) / 20;
    
    // Check resistance breakout
    for (const res of supportResistance.resistance) {
      if (currentPrice > res * 1.01) {
        return {
          isBreakout: true,
          breakoutLevel: res,
          volumeConfirmation: currentVolume > avgVolume * 1.5
        };
      }
    }
    
    // Check support breakdown
    for (const sup of supportResistance.support) {
      if (currentPrice < sup * 0.99) {
        return {
          isBreakout: true,
          breakoutLevel: sup,
          volumeConfirmation: currentVolume > avgVolume * 1.5
        };
      }
    }
    
    return { isBreakout: false, breakoutLevel: 0, volumeConfirmation: false };
  }
  
  // === COMPOSITE SCORES ===
  
  private calculateTrendScore(emaRibbon: { ema9: number; ema21: number; ema50: number; ema200: number }, supertrend: { value: number; direction: 'UP' | 'DOWN' }, adx: { adx: number; plusDI: number; minusDI: number }): number {
    let score = 50;
    
    // EMA alignment
    if (emaRibbon.ema9 > emaRibbon.ema21 && emaRibbon.ema21 > emaRibbon.ema50) score += 15;
    else if (emaRibbon.ema9 < emaRibbon.ema21 && emaRibbon.ema21 < emaRibbon.ema50) score -= 15;
    
    // Supertrend
    if (supertrend.direction === 'UP') score += 10;
    else score -= 10;
    
    // ADX trend strength
    if (adx.adx > 25) score += 10;
    else if (adx.adx > 20) score += 5;
    
    // DI crossover
    if (adx.plusDI > adx.minusDI) score += 10;
    else score -= 10;
    
    return Math.min(100, Math.max(0, score));
  }
  
  private calculateMomentumScore(rsi: number, macd: { macd: number; signal: number; histogram: number }, momentum: number): number {
    let score = 50;
    
    // RSI
    if (rsi > 60) score += 15;
    else if (rsi > 50) score += 5;
    else if (rsi < 40) score -= 15;
    else if (rsi < 50) score -= 5;
    
    // MACD
    if (macd.histogram > 0) score += 10;
    else score -= 10;
    
    // Momentum
    if (momentum > 5) score += 10;
    else if (momentum > 2) score += 5;
    else if (momentum < -5) score -= 10;
    else if (momentum < -2) score -= 5;
    
    return Math.min(100, Math.max(0, score));
  }
  
  private calculateVolumeScore(volumes: number[], volumeWeightedMomentum: number): number {
    let score = 50;
    
    // Volume trend
    const recentAvg = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const olderAvg = volumes.slice(-20, -5).reduce((a, b) => a + b, 0) / 15;
    
    if (recentAvg > olderAvg * 1.3) score += 15;
    else if (recentAvg > olderAvg) score += 5;
    else if (recentAvg < olderAvg * 0.7) score -= 15;
    else if (recentAvg < olderAvg) score -= 5;
    
    // Volume-weighted momentum
    if (volumeWeightedMomentum > 3) score += 10;
    else if (volumeWeightedMomentum < -3) score -= 10;
    
    return Math.min(100, Math.max(0, score));
  }
  
  private calculateVolatilityScore(atr: number, bollingerBands: { upper: number; middle: number; lower: number; width: number }): number {
    // Optimal volatility is moderate - not too high, not too low
    let score = 50;
    
    if (bollingerBands.width > 15) score -= 15; // Too volatile
    else if (bollingerBands.width > 10) score -= 5;
    else if (bollingerBands.width < 5) score -= 10; // Too quiet
    else if (bollingerBands.width < 8) score -= 5;
    else score += 10; // Just right
    
    return Math.min(100, Math.max(0, score));
  }
  
  private calculateLiquidityScore(volumes: number[]): number {
    const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    
    if (avgVolume > 1000000) return 100; // Very liquid
    if (avgVolume > 500000) return 85;
    if (avgVolume > 100000) return 70;
    if (avgVolume > 50000) return 50;
    if (avgVolume > 10000) return 30;
    return 10; // Illiquid
  }
  
  // === HELPER FUNCTIONS ===
  
  private EMA(data: number[], period: number): number {
    if (data.length < period) return data[data.length - 1] || 0;
    
    const multiplier = 2 / (period + 1);
    let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
    
    for (let i = period; i < data.length; i++) {
      ema = (data[i] - ema) * multiplier + ema;
    }
    
    return ema;
  }
}

export const advancedTechnicalEngine = new AdvancedTechnicalEngine();