import type { OHLC } from './technicalAnalysis';

export interface CandlestickPattern {
  name: string;
  signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  strength: number;
  reliability: number;
  description: string;
  confirmationNeeded: string[];
}

export function detectCandlestickPatterns(candles: OHLC[]): CandlestickPattern[] {
  if (candles.length < 3) return [];
  const patterns: CandlestickPattern[] = [];
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const prev2 = candles.length > 2 ? candles[candles.length - 3] : null;
  const body = Math.abs(last.close - last.open);
  const upperWick = last.high - Math.max(last.close, last.open);
  const lowerWick = Math.min(last.close, last.open) - last.low;
  const totalRange = last.high - last.low;
  const isBullish = last.close > last.open;
  const isBearish = last.close < last.open;

  if (totalRange > 0 && body / totalRange < 0.1) patterns.push({
    name: 'Doji', signal: 'NEUTRAL', strength: 3, reliability: 60,
    description: 'Indecision — possible reversal', confirmationNeeded: ['Next candle direction'],
  });
  if (isBullish && lowerWick > body * 2 && upperWick < body * 0.3) patterns.push({
    name: 'Hammer', signal: 'BULLISH', strength: lowerWick / body > 3 ? 5 : 3, reliability: 70,
    description: 'Bullish reversal — rejection of lows', confirmationNeeded: ['Bullish follow-through'],
  });
  if (isBearish && upperWick > body * 2 && lowerWick < body * 0.3) patterns.push({
    name: 'Shooting Star', signal: 'BEARISH', strength: upperWick / body > 3 ? 5 : 3, reliability: 65,
    description: 'Bearish reversal — rejection at highs', confirmationNeeded: ['Bearish follow-through'],
  });
  if (prev && isBullish && prev.close > prev.open && last.open < prev.close && last.close > prev.open) patterns.push({
    name: 'Bullish Engulfing', signal: 'BULLISH', strength: 4, reliability: 75,
    description: 'Strong buying absorbed all selling', confirmationNeeded: ['Volume confirmation'],
  });
  if (prev && isBearish && prev.close < prev.open && last.open > prev.close && last.close < prev.open) patterns.push({
    name: 'Bearish Engulfing', signal: 'BEARISH', strength: 4, reliability: 75,
    description: 'Strong selling overwhelmed buyers', confirmationNeeded: ['Volume confirmation'],
  });
  if (prev && prev2 && isBullish && prev2.close > prev2.open && prev.close < prev.open && body < totalRange * 0.3 && last.close > prev.open) patterns.push({
    name: 'Morning Star', signal: 'BULLISH', strength: 5, reliability: 80,
    description: 'Three-candle bullish reversal', confirmationNeeded: [],
  });
  if (prev && prev2 && isBearish && prev2.close > prev2.open && prev.close < prev.open && body < totalRange * 0.3 && last.close < prev.open) patterns.push({
    name: 'Evening Star', signal: 'BEARISH', strength: 5, reliability: 80,
    description: 'Three-candle bearish reversal', confirmationNeeded: [],
  });
  if (totalRange > 0 && upperWick / totalRange < 0.05 && lowerWick / totalRange < 0.05) patterns.push({
    name: isBullish ? 'Bullish Marubozu' : 'Bearish Marubozu',
    signal: isBullish ? 'BULLISH' : 'BEARISH', strength: 4, reliability: 70,
    description: isBullish ? 'Strong buying with no resistance' : 'Strong selling with no support',
    confirmationNeeded: [],
  });
  if (candles.length >= 3) {
    const last3 = candles.slice(-3);
    if (last3.every(c => c.close > c.open) && last3[1].close > last3[0].close && last3[2].close > last3[1].close) patterns.push({
      name: 'Three White Soldiers', signal: 'BULLISH', strength: 5, reliability: 85,
      description: 'Sustained buying — strong momentum', confirmationNeeded: ['Volume should expand'],
    });
    if (last3.every(c => c.close < c.open) && last3[1].close < last3[0].close && last3[2].close < last3[1].close) patterns.push({
      name: 'Three Black Crows', signal: 'BEARISH', strength: 5, reliability: 85,
      description: 'Sustained selling — strong bearish momentum', confirmationNeeded: ['Volume should expand'],
    });
  }
  return patterns;
}

export interface FakeBreakoutSignal {
  isFake: boolean;
  probability: number;
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  reasons: string[];
  keyLevel: number;
}

export function detectFakeBreakout(candles: OHLC[], lookbackPeriods = 20): FakeBreakoutSignal {
  if (candles.length < lookbackPeriods + 5) {
    return { isFake: false, probability: 0, direction: 'NEUTRAL', reasons: [], keyLevel: 0 };
  }
  const recent = candles.slice(-lookbackPeriods);
  const last = candles[candles.length - 1];
  const highs = recent.map(c => c.high);
  const lows = recent.map(c => c.low);
  const resistance = Math.max(...highs);
  const support = Math.min(...lows);
  const range = resistance - support;
  if (range <= 0) return { isFake: false, probability: 0, direction: 'NEUTRAL', reasons: [], keyLevel: 0 };

  const reasons: string[] = [];
  let prob = 0;
  let direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  const prev = candles[candles.length - 2];
  const lastBody = Math.abs(last.close - last.open);
  const prevBody = Math.abs(prev.close - prev.open);

  if (last.close > resistance && last.high > resistance) {
    direction = 'BULLISH';
    const volRatio = getVolumeRatio(candles);
    if (volRatio < 1.0) { prob += 35; reasons.push(`Low volume breakout (${volRatio.toFixed(1)}x avg)`); }
    if (lastBody < prevBody * 0.7) { prob += 25; reasons.push('Small body — weak conviction at resistance'); }
    const upperWick = last.high - Math.max(last.close, last.open);
    if (upperWick > lastBody) { prob += 25; reasons.push('Long upper wick — rejection at resistance'); }
    if (!reasons.length) prob += 15;
  }

  if (last.close < support && last.low < support) {
    direction = 'BEARISH';
    const volRatio = getVolumeRatio(candles);
    if (volRatio < 1.0) { prob += 35; reasons.push(`Low volume breakdown (${volRatio.toFixed(1)}x avg)`); }
    if (lastBody < prevBody * 0.7) { prob += 25; reasons.push('Small body — weak conviction at support'); }
    const lowerWick = Math.min(last.close, last.open) - last.low;
    if (lowerWick > lastBody) { prob += 25; reasons.push('Long lower wick — support bounce'); }
    if (!reasons.length) prob += 15;
  }

  return { isFake: prob > 50, probability: Math.min(95, prob), direction, reasons, keyLevel: direction === 'BULLISH' ? resistance : support };
}

function getVolumeRatio(candles: OHLC[]): number {
  if (candles.length < 5) return 1;
  const vols = candles.slice(-20).map(c => c.volume).filter(v => v > 0);
  if (vols.length < 3) return 1;
  const avg = vols.reduce((a, b) => a + b, 0) / vols.length;
  const last = vols[vols.length - 1];
  return avg > 0 ? last / avg : 1;
}

export interface MomentumExhaustion {
  isExhausted: boolean;
  exhaustionScore: number;
  reason: string;
}

export function detectMomentumExhaustion(candles: OHLC[]): MomentumExhaustion {
  if (candles.length < 14) return { isExhausted: false, exhaustionScore: 0, reason: 'Insufficient data' };
  const recent = candles.slice(-14);
  let score = 0;
  const reasons: string[] = [];
  let bullCount = 0, bearCount = 0, avgBullBody = 0, avgBearBody = 0;
  for (let i = recent.length - 1; i >= Math.max(0, recent.length - 5); i--) {
    const c = recent[i];
    if (c.close > c.open) { bullCount++; avgBullBody += c.close - c.open; }
    else { bearCount++; avgBearBody += c.open - c.close; }
  }
  if (bullCount > 0) avgBullBody /= bullCount;
  if (bearCount > 0) avgBearBody /= bearCount;

  if (bullCount >= 3 && avgBullBody > 0) {
    const lastBody = recent[recent.length - 1].close - recent[recent.length - 1].open;
    if (lastBody > 0 && lastBody < avgBullBody * 0.5) { score += 30; reasons.push('Weakening bullish momentum'); }
  }
  if (bearCount >= 3 && avgBearBody > 0) {
    const lastBody = recent[recent.length - 1].open - recent[recent.length - 1].close;
    if (lastBody > 0 && lastBody < avgBearBody * 0.5) { score += 30; reasons.push('Weakening bearish momentum'); }
  }
  for (let i = recent.length - 3; i < recent.length; i++) {
    const c = recent[i];
    const b = Math.abs(c.close - c.open);
    if (b <= 0) continue;
    if (c.close > c.open && (c.high - c.close) > b * 1.5) { score += 15; reasons.push('Long upper wick — buying fading'); break; }
    if (c.close < c.open && (c.open - c.low) > b * 1.5) { score += 15; reasons.push('Long lower wick — selling fading'); break; }
  }
  const vr = getVolumeRatio(candles);
  if ((bullCount > bearCount) && vr < 0.8) { score += 20; reasons.push('Bullish without volume'); }
  if ((bearCount > bullCount) && vr < 0.8) { score += 20; reasons.push('Bearish without volume'); }
  return { isExhausted: score > 40, exhaustionScore: Math.min(100, score), reason: reasons.length > 0 ? reasons.join('; ') : 'No exhaustion detected' };
}

export interface TrendStrengthScore {
  score: number;
  label: 'NONE' | 'WEAK' | 'MODERATE' | 'STRONG' | 'VERY_STRONG';
  adxContribution: number;
  emaContribution: number;
  momentumContribution: number;
  volumeContribution: number;
  description: string;
}

export function computeTrendStrength(candles: OHLC[], adx: number, ema20: number, ema50: number, volumeRatio: number): TrendStrengthScore {
  if (candles.length < 50) return { score: 0, label: 'NONE', adxContribution: 0, emaContribution: 0, momentumContribution: 0, volumeContribution: 0, description: 'Insufficient data' };
  let score = 0;
  const adxContrib = adx >= 40 ? 35 : adx >= 30 ? 25 : adx >= 20 ? 15 : 5;
  score += adxContrib;
  const emaSlope = ema20 - ema50;
  const emaRatio = ema50 > 0 ? emaSlope / ema50 * 100 : 0;
  const emaContrib = Math.abs(emaRatio) > 2 ? 25 : Math.abs(emaRatio) > 1 ? 15 : 5;
  score += emaContrib;
  const last5 = candles.slice(-5);
  const momentum = last5.length >= 2 ? (last5[last5.length - 1].close - last5[0].close) / last5[0].close * 100 : 0;
  const momentumContrib = Math.abs(momentum) > 3 ? 25 : Math.abs(momentum) > 1.5 ? 15 : Math.abs(momentum) > 0.5 ? 8 : 3;
  score += momentumContrib;
  const volContrib = volumeRatio > 2 ? 15 : volumeRatio > 1.5 ? 10 : volumeRatio > 1 ? 5 : 0;
  score += volContrib;
  const label = score >= 85 ? 'VERY_STRONG' : score >= 65 ? 'STRONG' : score >= 45 ? 'MODERATE' : score >= 20 ? 'WEAK' : 'NONE';
  const desc: Record<string, string> = { VERY_STRONG: 'Exceptionally strong — broad confirmation', STRONG: 'Strong — good alignment', MODERATE: 'Moderate — some confirmation', WEAK: 'Weak — low conviction', NONE: 'No trend — ranging' };
  return { score, label, adxContribution: adxContrib, emaContribution: emaContrib, momentumContribution: momentumContrib, volumeContribution: volContrib, description: desc[label] };
}

export interface SRLines {
  supports: number[];
  resistances: number[];
  keyLevels: { price: number; type: 'SUPPORT' | 'RESISTANCE'; strength: number }[];
  nearestSupport: number;
  nearestResistance: number;
}

export function findSupportResistance(candles: OHLC[], lookback = 100): SRLines {
  if (candles.length < 20) return { supports: [], resistances: [], keyLevels: [], nearestSupport: 0, nearestResistance: 0 };
  const window = candles.slice(-Math.min(lookback, candles.length));
  const allPoints: number[] = [];
  for (const c of window) { allPoints.push(c.low, c.high); }
  const clusters = clusterPrices(allPoints, 0.015);
  const sorted = Object.entries(clusters).sort((a, b) => b[1].count - a[1].count).slice(0, 10);
  const supports: number[] = [];
  const resistances: number[] = [];
  const keyLevels: { price: number; type: 'SUPPORT' | 'RESISTANCE'; strength: number }[] = [];
  const currentPrice = window[window.length - 1].close;
  for (const [ps, info] of sorted) {
    const price = parseFloat(ps);
    if (info.count < 3) continue;
    if (price < currentPrice) supports.push(price);
    else if (price > currentPrice) resistances.push(price);
    keyLevels.push({ price, type: price < currentPrice ? 'SUPPORT' : 'RESISTANCE', strength: Math.min(10, info.count) });
  }
  supports.sort((a, b) => b - a);
  resistances.sort((a, b) => a - b);
  return { supports: supports.slice(0, 5), resistances: resistances.slice(0, 5), keyLevels: keyLevels.sort((a, b) => b.strength - a.strength), nearestSupport: supports[0] || currentPrice * 0.95, nearestResistance: resistances[0] || currentPrice * 1.05 };
}

function clusterPrices(prices: number[], thresholdPct: number): Record<string, { count: number }> {
  const clusters: Record<string, { count: number }> = {};
  const sorted = [...new Set(prices)].sort((a, b) => a - b);
  let current = sorted[0], count = 0;
  for (const p of sorted) {
    if (Math.abs(p - current) / Math.max(current, 1) < thresholdPct) { count++; }
    else {
      if (count > 0) { const key = (current).toFixed(2); if (!clusters[key]) clusters[key] = { count: 0 }; clusters[key].count += count; }
      current = p; count = 1;
    }
  }
  if (count > 0) { const key = (current).toFixed(2); if (!clusters[key]) clusters[key] = { count: 0 }; clusters[key].count += count; }
  return clusters;
}

export type VolatilityRegime = 'COMPRESSED' | 'NORMAL' | 'EXPANDING' | 'HIGH' | 'EXTREME';

export interface VolatilityAnalysis {
  regime: VolatilityRegime;
  atrPercent: number;
  bollingerWidth: number;
  description: string;
}

export function analyzeVolatility(atr: number, price: number, bollingerWidth: number): VolatilityAnalysis {
  const atrPercent = price > 0 ? (atr / price) * 100 : 0;
  const regime: VolatilityRegime = bollingerWidth < 3 && atrPercent < 0.5 ? 'COMPRESSED' : bollingerWidth > 10 || atrPercent > 3 ? 'EXTREME' : bollingerWidth > 7 || atrPercent > 2 ? 'HIGH' : bollingerWidth > 5 || atrPercent > 1 ? 'EXPANDING' : 'NORMAL';
  const desc: Record<VolatilityRegime, string> = { COMPRESSED: 'Compression — breakout likely soon', NORMAL: 'Normal conditions', EXPANDING: 'Expanding — increasing risk', HIGH: 'High — reduce position size', EXTREME: 'Extreme — avoid directional trades' };
  return { regime, atrPercent: parseFloat(atrPercent.toFixed(2)), bollingerWidth, description: desc[regime] };
}

export interface LiquiditySignal { isLowLiquidity: boolean; liquidityScore: number; spreadRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME'; reason: string; }

export function analyzeLiquidity(volumeRatio: number, atrPercent: number, bollingerWidth: number): LiquiditySignal {
  let score = 100;
  const reasons: string[] = [];
  if (volumeRatio < 0.5) { score -= 35; reasons.push('Very low volume'); }
  else if (volumeRatio < 0.8) { score -= 15; reasons.push('Below normal volume'); }
  if (atrPercent > 3) { score -= 25; reasons.push('Extreme ATR — wide spreads'); }
  else if (atrPercent > 2) score -= 10;
  if (bollingerWidth > 12) { score -= 20; reasons.push('Extreme Bollinger — gaps possible'); }
  const spreadRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME' = score >= 70 ? 'LOW' : score >= 50 ? 'MEDIUM' : score >= 30 ? 'HIGH' : 'EXTREME';
  return { isLowLiquidity: score < 50, liquidityScore: Math.max(0, score), spreadRisk, reason: reasons.length > 0 ? reasons.join('; ') : 'Normal liquidity' };
}

export interface TFConsensus { timeframe: string; trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL'; strength: number; patterns: CandlestickPattern[]; fakeBreakout: FakeBreakoutSignal | null; momentumExhaustion: MomentumExhaustion | null; }

export function analyzeTimeframe(candles: OHLC[], timeframe: string): TFConsensus {
  const patterns = detectCandlestickPatterns(candles);
  const fakeBreakout = candles.length >= 25 ? detectFakeBreakout(candles) : null;
  const momentumExhaustion = candles.length >= 14 ? detectMomentumExhaustion(candles) : null;
  const bullScore = patterns.filter(p => p.signal === 'BULLISH').reduce((s, p) => s + p.strength, 0);
  const bearScore = patterns.filter(p => p.signal === 'BEARISH').reduce((s, p) => s + p.strength, 0);
  return { timeframe, trend: bullScore > bearScore ? 'BULLISH' : bearScore > bullScore ? 'BEARISH' : 'NEUTRAL', strength: Math.max(bullScore, bearScore), patterns, fakeBreakout, momentumExhaustion };
}

export interface MultiTFConsensus { overallTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL'; consensusStrength: number; timeframes: TFConsensus[]; conflictingTimeframes: string[]; recommendation: string; }

export function computeMultiTimeframeConsensus(candlesByTF: Record<string, OHLC[]>): MultiTFConsensus {
  const timeframes = Object.entries(candlesByTF).map(([tf, c]) => analyzeTimeframe(c, tf));
  if (!timeframes.length) return { overallTrend: 'NEUTRAL', consensusStrength: 0, timeframes: [], conflictingTimeframes: [], recommendation: 'Insufficient data' };
  const bull = timeframes.filter(t => t.trend === 'BULLISH').length;
  const bear = timeframes.filter(t => t.trend === 'BEARISH').length;
  const neutral = timeframes.filter(t => t.trend === 'NEUTRAL').length;
  const total = timeframes.length;
  const overallTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = bull > bear && bull > neutral ? 'BULLISH' : bear > bull && bear > neutral ? 'BEARISH' : 'NEUTRAL';
  const agreement = Math.max(bull, bear, neutral) / total * 100;
  const conflicting = timeframes.filter(t => t.trend !== overallTrend && t.trend !== 'NEUTRAL').map(t => t.timeframe);
  const recommendation = agreement >= 80 ? `Strong ${overallTrend.toLowerCase()} consensus (${Math.round(agreement)}%)` : agreement >= 60 ? `Moderate ${overallTrend.toLowerCase()} bias — conflicts: ${conflicting.join(', ')}` : 'Mixed signals — wait for alignment';
  return { overallTrend, consensusStrength: Math.round(agreement), timeframes, conflictingTimeframes: conflicting, recommendation };
}

export interface ManipulationProbability { probability: number; score: number; signals: string[]; }

export function detectMarketManipulation(candles: OHLC[], volumeRatio: number, bollingerWidth: number, atrPercent: number): ManipulationProbability {
  if (candles.length < 10) return { probability: 0, score: 0, signals: [] };
  let score = 0;
  const signals: string[] = [];
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const body = Math.abs(last.close - last.open);
  const range = last.high - last.low;
  if (range > 0 && body / range < 0.05 && range > atrPercent * 0.5) { score += 25; signals.push('Tiny body vs range — possible quote stuffing'); }
  if (atrPercent > 3 && volumeRatio < 0.8) { score += 30; signals.push('Large move without volume — possible manipulation'); }
  if (prev && Math.abs(prev.close - prev.open) > prev.open * 0.05) {
    if ((prev.close > prev.open ? 'UP' : 'DOWN') !== (last.close > last.open ? 'UP' : 'DOWN') && Math.abs(body) > Math.abs(prev.close - prev.open) * 0.8) { score += 20; signals.push('Sharp reversal from large move'); }
  }
  if (bollingerWidth < 3 && volumeRatio < 0.7) { score += 25; signals.push('Squeeze breakout without volume — potential false move'); }
  return { probability: Math.min(90, score), score, signals };
}

export interface FullMarketIntelligence {
  ticker: string;
  patterns: CandlestickPattern[];
  fakeBreakout: FakeBreakoutSignal | null;
  momentumExhaustion: MomentumExhaustion | null;
  trendStrength: TrendStrengthScore;
  supportResistance: SRLines;
  volatility: VolatilityAnalysis;
  liquidity: LiquiditySignal;
  manipulation: ManipulationProbability;
  timeframeConsensus: MultiTFConsensus | null;
}

export function computeFullIntelligence(ticker: string, candles: OHLC[], candlesByTF: Record<string, OHLC[]>, adx: number, ema20: number, ema50: number, atr: number, price: number, bollingerWidth: number, volumeRatio: number): FullMarketIntelligence {
  return {
    ticker, patterns: detectCandlestickPatterns(candles), fakeBreakout: detectFakeBreakout(candles),
    momentumExhaustion: detectMomentumExhaustion(candles), trendStrength: computeTrendStrength(candles, adx, ema20, ema50, volumeRatio),
    supportResistance: findSupportResistance(candles), volatility: analyzeVolatility(atr, price, bollingerWidth),
    liquidity: analyzeLiquidity(volumeRatio, (price > 0 ? atr / price * 100 : 0), bollingerWidth),
    manipulation: detectMarketManipulation(candles, volumeRatio, bollingerWidth, (price > 0 ? atr / price * 100 : 0)),
    timeframeConsensus: Object.keys(candlesByTF).length > 0 ? computeMultiTimeframeConsensus(candlesByTF) : null,
  };
}
