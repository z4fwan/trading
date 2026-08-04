import { clampConfidence } from './confidenceConfig';

export interface OHLC { date?: number; open: number; high: number; low: number; close: number; volume: number; }

export interface TAIndicators {
  rsi: number;
  macd: { line: number; signal: number; histogram: number };
  ema: Record<number, number>;
  sma: Record<number, number>;
  bollinger: { upper: number; middle: number; lower: number; width: number };
  atr: number;
  vwap: number;
  supertrend: { value: number; direction: 'up' | 'down' };
  adx: number;
  stochRsi: number;
  volumeSma: number;
  support: number;
  resistance: number;
}

function sum(arr: number[]): number { return arr.reduce((a, b) => a + b, 0); }

function avg(arr: number[]): number { return arr.length ? sum(arr) / arr.length : 0; }

function stdDev(arr: number[], mean: number): number {
  return Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length);
}

function emaCalc(values: number[], period: number): number[] {
  if (values.length < period) return [];
  const k = 2 / (period + 1);
  const result: number[] = [];
  let ema = avg(values.slice(0, period));
  result.push(ema);
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    result.push(ema);
  }
  return result;
}

function smaCalc(values: number[], period: number): number[] {
  if (values.length < period) return [];
  const result: number[] = [];
  for (let i = period - 1; i < values.length; i++) {
    result.push(avg(values.slice(i - period + 1, i + 1)));
  }
  return result;
}

function tr(candles: OHLC[]): number[] {
  const result: number[] = [candles[0].high - candles[0].low];
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1].close;
    result.push(Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - prev),
      Math.abs(candles[i].low - prev)
    ));
  }
  return result;
}


export function calculateIndicators(candles: OHLC[]): TAIndicators | null {
  if (candles.length < 50) return null;

  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);
  const len = candles.length;

  // RSI (14)
  const rsiPeriod = 14;
  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    gains.push(Math.max(0, diff));
    losses.push(Math.max(0, -diff));
  }
  const avgGain = avg(gains.slice(0, rsiPeriod));
  const avgLoss = avg(losses.slice(0, rsiPeriod));
  let currentAvgGain = avgGain;
  let currentAvgLoss = avgLoss;
  let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  for (let i = rsiPeriod; i < gains.length; i++) {
    currentAvgGain = (currentAvgGain * (rsiPeriod - 1) + gains[i]) / rsiPeriod;
    currentAvgLoss = (currentAvgLoss * (rsiPeriod - 1) + losses[i]) / rsiPeriod;
    rs = currentAvgLoss === 0 ? 100 : currentAvgGain / currentAvgLoss;
  }
  const rsi = 100 - 100 / (1 + rs);

  // MACD (12, 26, 9)
  const ema12 = emaCalc(closes, 12);
  const ema26 = emaCalc(closes, 26);
  const macdLine = ema12[ema12.length - 1] - ema26[ema26.length - 1];
  const macdValues: number[] = [];
  for (let i = 0; i < ema26.length; i++) {
    macdValues.push(ema12[i] - ema26[i]);
  }
  const macdSignal = emaCalc(macdValues, 9);
  const signal = macdSignal[macdSignal.length - 1];
  const macdHistogram = macdLine - signal;

  const lastClose = closes[closes.length - 1];

  // EMA periods
  const ema20 = emaCalc(closes, 20);
  const ema50 = emaCalc(closes, 50);
  const ema200 = emaCalc(closes, 200);

  // SMA periods
  const sma20 = smaCalc(closes, 20);
  const sma50 = smaCalc(closes, 50);

  // Bollinger Bands (20, 2)
  const bbPeriod = 20;
  const bbSma = smaCalc(closes, bbPeriod);
  const bbMean = bbSma[bbSma.length - 1];
  const bbSlice = closes.slice(-bbPeriod);
  const bbStd = stdDev(bbSlice, bbMean);
  const bbUpper = bbMean + 2 * bbStd;
  const bbLower = bbMean - 2 * bbStd;

  // ATR (14)
  const trueRanges = tr(candles);
  const atrPeriod = 14;
  const atrSlice = trueRanges.slice(-atrPeriod);
  const atr = avg(atrSlice);

  // VWAP
  let volSum = 0;
  let pvSum = 0;
  for (let i = Math.max(0, len - 20); i < len; i++) {
    const typ = (candles[i].high + candles[i].low + candles[i].close) / 3;
    pvSum += typ * candles[i].volume;
    volSum += candles[i].volume;
  }
  const vwap = volSum ? pvSum / volSum : lastClose;

  // Supertrend (ATR multiplier 3, period 10) — standard carry-forward bands.
  // Previous code only built the UPPER band (hlAvg + 3*ATR) and called every
  // price below it "down", which is true ~always — a systematic bearish bias
  // that infected every prediction downstream.
  const stPeriod = 10;
  const stMult = 3;
  let stUpper = 0;
  let stLower = 0;
  let stDir: 'up' | 'down' = 'up';
  for (let i = stPeriod; i < len; i++) {
    const atrI = avg(trueRanges.slice(i - stPeriod, i));
    const hl = (highs[i] + lows[i]) / 2;
    const upper = hl + stMult * atrI;
    const lower = hl - stMult * atrI;
    const close = closes[i];
    if (i === stPeriod) {
      stUpper = upper;
      stLower = lower;
      stDir = close > lower ? 'up' : 'down';
    } else {
      stUpper = (stUpper === upper || close > stUpper) ? upper : stUpper;
      stLower = (stLower === lower || close < stLower) ? lower : stLower;
      if (close > stLower) stDir = 'up';
      else if (close < stUpper) stDir = 'down';
    }
  }
  const superVal = stDir === 'up' ? stLower : stUpper;
  const supertrend = {
    value: parseFloat(superVal.toFixed(2)),
    direction: stDir as 'up' | 'down',
  };

  // ADX (14)
  const adxPeriod = 14;
  const upMove: number[] = [];
  const downMove: number[] = [];
  for (let i = 1; i < len; i++) {
    upMove.push(highs[i] - highs[i - 1]);
    downMove.push(lows[i - 1] - lows[i]);
  }
  const dx: number[] = [];
  for (let i = 0; i < upMove.length; i++) {
    const plusDM = upMove[i] > downMove[i] && upMove[i] > 0 ? upMove[i] : 0;
    const minusDM = downMove[i] > upMove[i] && downMove[i] > 0 ? downMove[i] : 0;
    const tr14 = avg(trueRanges.slice(Math.max(0, i - adxPeriod + 1), i + 2));
    if (tr14 === 0) continue;
    const plusDI = 100 * (plusDM / tr14);
    const minusDI = 100 * (minusDM / tr14);
    const dxVal = 100 * Math.abs(plusDI - minusDI) / (plusDI + minusDI + 0.001);
    dx.push(dxVal);
  }
  const adxRaw = dx.length >= adxPeriod ? avg(dx.slice(-adxPeriod)) : 25;

  // Stochastic RSI
  const stochPeriod = 14;
  const stochSlice = closes.slice(-stochPeriod * 2);
  const rsiValues: number[] = [];
  for (let i = stochPeriod; i < stochSlice.length; i++) {
    const window = stochSlice.slice(i - stochPeriod, i + 1);
    const g: number[] = [];
    const l: number[] = [];
    for (let j = 1; j < window.length; j++) {
      const d = window[j] - window[j - 1];
      g.push(Math.max(0, d));
      l.push(Math.max(0, -d));
    }
    const ag = avg(g);
    const al = avg(l);
    const r = al === 0 ? 100 : ag / al;
    rsiValues.push(100 - 100 / (1 + r));
  }
  const recentRsi = rsiValues.slice(-stochPeriod);
  const minRsi = recentRsi.length > 0 ? Math.min(...recentRsi) : 30;
  const maxRsi = recentRsi.length > 0 ? Math.max(...recentRsi) : 70;
  const stochRsi = recentRsi.length < 2 || maxRsi === minRsi ? 50 : ((rsiValues[rsiValues.length - 1] - minRsi) / (maxRsi - minRsi)) * 100;

  // Volume SMA
  const volSma = avg(volumes.slice(-20));

  // Support / Resistance
  const lookback = 30;
  const recentCloses = closes.slice(-lookback);
  const recentHighs = highs.slice(-lookback);
  const recentLows = lows.slice(-lookback);
  const sortedCloses = [...recentCloses].sort((a, b) => a - b);
  const support = sortedCloses[Math.floor(sortedCloses.length * 0.1)] || recentLows[0];
  const resistance = sortedCloses[Math.floor(sortedCloses.length * 0.9)] || recentHighs[0];

  return {
    rsi: parseFloat(rsi.toFixed(2)),
    macd: {
      line: parseFloat(macdLine.toFixed(4)),
      signal: parseFloat(signal.toFixed(4)),
      histogram: parseFloat(macdHistogram.toFixed(4)),
    },
    ema: {
      20: parseFloat((ema20[ema20.length - 1] || lastClose).toFixed(2)),
      50: parseFloat((ema50[ema50.length - 1] || lastClose).toFixed(2)),
      200: parseFloat((ema200[ema200.length - 1] || lastClose).toFixed(2)),
    } as Record<number, number>,
    sma: {
      20: parseFloat((sma20[sma20.length - 1] || lastClose).toFixed(2)),
      50: parseFloat((sma50[sma50.length - 1] || lastClose).toFixed(2)),
    } as Record<number, number>,
    bollinger: {
      upper: parseFloat(bbUpper.toFixed(2)),
      middle: parseFloat(bbMean.toFixed(2)),
      lower: parseFloat(bbLower.toFixed(2)),
      width: parseFloat(((bbUpper - bbLower) / bbMean * 100).toFixed(2)),
    },
    atr: parseFloat(atr.toFixed(2)),
    vwap: parseFloat(vwap.toFixed(2)),
    supertrend,
    adx: parseFloat(adxRaw.toFixed(2)),
    stochRsi: parseFloat(stochRsi.toFixed(2)),
    volumeSma: parseFloat(volSma.toFixed(0)),
    support: parseFloat(support.toFixed(2)),
    resistance: parseFloat(resistance.toFixed(2)),
  };
}

// --- Market Regime Detection (unified scoring matrix) ---
export type MarketRegime = 'STRONG_TREND' | 'WEAK_TREND' | 'RANGING' | 'HIGH_VOLATILITY' | 'PANIC' | 'BREAKOUT';

export function detectRegime(ta: TAIndicators): MarketRegime {
  const { adx, rsi, bollinger } = ta;

  // Non-exclusive scoring matrix: each dimension scores 0.0-1.0 independently
  const trendScore = Math.min(adx / 50, 1);
  const volScore = Math.min(bollinger.width / 12, 1);
  const extremeScore = Math.min(Math.abs(rsi - 50) / 30, 1);

  // PANIC override: extreme RSI + high volatility (catches crashes before trend does)
  if (extremeScore > 0.8 && volScore > 0.5) return 'PANIC';
  if (extremeScore > 0.9) return 'PANIC';

  // STRONG_TREND
  if (trendScore > 0.7) return 'STRONG_TREND';

  // BREAKOUT: moderate trend + expanding volatility (checked before WEAK_TREND)
  if (trendScore > 0.5 && volScore > 0.4) return 'BREAKOUT';

  // WEAK_TREND
  if (trendScore > 0.5) return 'WEAK_TREND';

  // HIGH_VOLATILITY
  if (volScore > 0.6) return 'HIGH_VOLATILITY';

  // RANGING
  if (trendScore < 0.4 && volScore < 0.3 && extremeScore < 0.3) return 'RANGING';

  return 'RANGING';
}

// --- ML-Enhanced Prediction (wraps mlEngine) ---
import { getModel, trainModel, predictWithRegimeAdaptation, type MLModel } from '@/lib/mlEngine';

export function ensureMLModel(ticker: string, candles: OHLC[]): MLModel | null {
  const existing = getModel(ticker);
  if (existing && existing.trainedAt > Date.now() - 86400000) return existing; // Reuse if < 1 day old
  return trainModel(ticker, candles);
}

export function generateMLPrediction(
  ticker: string,
  price: number,
  ta: TAIndicators,
  candles: OHLC[],
  timeframe?: string,
  mlModel?: MLModel | null,
): PredictionScore {
  // If we have an ML model, use it with regime adaptation
  if (mlModel) {
    const regime = detectRegime(ta);
    const mlResult = predictWithRegimeAdaptation(mlModel, candles, regime);
    if (mlResult && mlResult.direction !== 'NEUTRAL') {
      const months = timeframe ? parseTimeframeMonths(timeframe) : 3;
      const atrMultiplier = months * 0.8;
      const dirMultiplier = mlResult.direction === 'BULLISH' ? 1 : -1;
      const targetPrice = parseFloat(Math.max(0.01, price + ta.atr * atrMultiplier * dirMultiplier).toFixed(2));
      const targetDateObj = new Date();
      targetDateObj.setMonth(targetDateObj.getMonth() + months);
      const targetDate = targetDateObj.toISOString().split('T')[0];

      return {
        ticker,
        direction: mlResult.direction,
        bullishProb: mlResult.direction === 'BULLISH' ? mlResult.probability : 100 - mlResult.probability,
        bearishProb: mlResult.direction === 'BEARISH' ? mlResult.probability : 100 - mlResult.probability,
        confidence: mlResult.confidence,
        riskLevel: ta.bollinger.width > 8 ? 'HIGH' : ta.bollinger.width > 5 ? 'MEDIUM' : 'LOW',
        trendStrength: parseFloat(ta.adx.toFixed(1)),
        momentumScore: parseFloat((Math.abs(ta.rsi - 50) * 1.5).toFixed(1)),
        volatilityRisk: parseFloat((price > 0 ? Math.min(100, (ta.atr / price) * 100 * 5) : 0).toFixed(1)),
        reasoning: [
          `ML model (${mlResult.modelAccuracy?.toFixed(0) ?? '?'}% historical accuracy on ${mlResult.modelSamples ?? '?'} samples)`,
          `Regime-adaptive confidence: ${mlResult.confidence}%`,
          `Calibrated probability: ${(mlResult.probability ?? 50).toFixed(1)}%`,
          ta.adx > 25 ? `Trend strength confirmed (ADX ${ta.adx.toFixed(0)})` : `Weak trend (ADX ${ta.adx.toFixed(0)})`,
        ],
        regime: regime.replace('_', ' ') as PredictionScore['regime'],
        targetPrice,
        targetDate,
        entryPrice: price,
      };
    }
  }

  // Fall back to rule-based
  return generatePrediction(ticker, price, ta, timeframe);
}

// --- Multi-factor Prediction ---
export interface PredictionScore {
  ticker: string;
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  bullishProb: number;
  bearishProb: number;
  confidence: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  trendStrength: number;
  momentumScore: number;
  volatilityRisk: number;
  reasoning: string[];
  regime: MarketRegime;
  targetPrice: number;
  targetDate: string;
  entryPrice: number;
}

function parseTimeframeMonths(timeframe: string): number {
  const match = timeframe.match(/(\d+)\s*-\s*(\d+)\s*months?/);
  if (match) return parseInt(match[2]);
  const single = timeframe.match(/(\d+)\s*months?/);
  if (single) return parseInt(single[1]);
  const weekMatch = timeframe.match(/(\d+)\s*-\s*(\d+)\s*weeks?/);
  if (weekMatch) return Math.ceil(parseInt(weekMatch[2]) / 4);
  return 3;
}

export function generatePrediction(
  ticker: string,
  price: number,
  ta: TAIndicators,
  timeframe?: string,
): PredictionScore {
  const { rsi, macd, ema, bollinger, atr, adx, stochRsi, supertrend, support, resistance } = ta;
  const isBullishRsi = rsi > 50 && rsi < 75;
  const isBearishRsi = rsi < 50 && rsi > 25;
  const isOverbought = rsi > 75;
  const isOversold = rsi < 25;

  const macdBullish = macd.histogram > 0 && macd.line > macd.signal;
  const macdBearish = macd.histogram < 0 && macd.line < macd.signal;

  const priceAboveEma20 = price > ema[20];
  const priceAboveEma50 = price > ema[50];
  const emaBullish = ema[20] > ema[50];
  const emaBearish = ema[20] < ema[50];

  const nearResistance = Math.abs(price - resistance) / price < 0.02;
  const nearSupport = Math.abs(price - support) / price < 0.02;

  const bollingerSqueeze = bollinger.width < 4;
  const bollingerBreakout = price > bollinger.upper || price < bollinger.lower;

  const trendUp = supertrend.direction === 'up';
  const adxStrong = adx > 25;

  let bullishScore = 0;
  let bearishScore = 0;
  const reasoning: string[] = [];

  // RSI analysis
  if (isBullishRsi) { bullishScore += 15; reasoning.push(`RSI at ${rsi} — bullish momentum zone`); }
  else if (isBearishRsi) { bearishScore += 15; reasoning.push(`RSI at ${rsi} — bearish momentum`); }
  if (isOverbought) { bearishScore += 20; reasoning.push(`RSI overbought (${rsi}) — exhaustion risk`); }
  if (isOversold) { bullishScore += 20; reasoning.push(`RSI oversold (${rsi}) — bounce potential`); }

  // MACD
  if (macdBullish) { bullishScore += 20; reasoning.push(`MACD bullish crossover — positive momentum`); }
  if (macdBearish) { bearishScore += 20; reasoning.push(`MACD bearish crossover — negative momentum`); }

  // EMA structure
  if (priceAboveEma20 && priceAboveEma50) { bullishScore += 15; reasoning.push(`Price above key EMAs — uptrend structure`); }
  else if (!priceAboveEma20 && !priceAboveEma50) { bearishScore += 15; reasoning.push(`Price below key EMAs — downtrend structure`); }
  if (emaBullish) { bullishScore += 10; reasoning.push(`EMA bullish alignment (${ema[20]} > ${ema[50]})`); }
  if (emaBearish) { bearishScore += 10; reasoning.push(`EMA bearish alignment (${ema[20]} < ${ema[50]})`); }

  // Supertrend
  if (trendUp) { bullishScore += 15; reasoning.push(`Supertrend bullish — trend intact`); }
  else { bearishScore += 15; reasoning.push(`Supertrend bearish — trend reversed`); }

  // ADX trend strength
  if (adxStrong) {
    if (trendUp) { bullishScore += 10; reasoning.push(`Strong uptrend (ADX ${adx})`); }
    else { bearishScore += 10; reasoning.push(`Strong downtrend (ADX ${adx})`); }
  } else { reasoning.push(`ADX ${adx} — trend strength weak`); }

  // Bollinger
  if (bollingerSqueeze) { reasoning.push(`Bollinger squeeze — breakout imminent`); }
  if (bollingerBreakout) {
    if (price > bollinger.upper) { bearishScore += 5; reasoning.push(`Price above upper Bollinger — extended`); }
    else { bullishScore += 5; reasoning.push(`Price below lower Bollinger — oversold`); }
  }

  // Support/Resistance
  if (nearResistance) { bearishScore += 10; reasoning.push(`Near resistance at ${resistance} — rejection risk`); }
  if (nearSupport) { bullishScore += 10; reasoning.push(`Near support at ${support} — bounce zone`); }

  // StochRSI
  if (stochRsi > 80) { bearishScore += 8; reasoning.push(`StochRSI overbought (${stochRsi.toFixed(0)})`); }
  if (stochRsi < 20) { bullishScore += 8; reasoning.push(`StochRSI oversold (${stochRsi.toFixed(0)})`); }

  // ATR volatility
  const volatilityRisk = price > 0 ? Math.min(100, (atr / price) * 100 * 5) : 0;
  if (volatilityRisk > 30) { reasoning.push(`High volatility (ATR ${atr.toFixed(2)}) — wider stops recommended`); }

  // Normalize scores
  const total = bullishScore + bearishScore || 1;
  const bullishProb = parseFloat(((bullishScore / total) * 100).toFixed(1));
  const bearishProb = parseFloat(((bearishScore / total) * 100).toFixed(1));

  // Conflict penalty: when both sides have significant signals, reduce confidence
  const minSignal = Math.min(bullishScore, bearishScore);
  const conflictPenalty = minSignal > 25 ? minSignal * 0.08 : 0;

  // Confidence = dominant signal strength minus conflict, lightly discounted
  // when the trend is too weak to trust. (Previously this was multiplied by the
  // dominance ratio AND capped by ADX tier, double-squashing every result into
  // the 40-60 band regardless of how clean the signal actually was.)
  const rawConfidence = Math.max(bullishScore, bearishScore) - conflictPenalty;
  const adxFactor = adx < 15 ? 0.75 : adx < 20 ? 0.85 : 1;
  const clampedConfidence = clampConfidence(Math.round(rawConfidence * adxFactor));

  const trendStrength = adxStrong ? parseFloat(Math.min(adx, 80).toFixed(1)) : parseFloat((adx * 0.6).toFixed(1));
  const momentumScore = parseFloat((Math.abs(rsi - 50) * 1.5).toFixed(1));

  let direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL' =
    bullishProb > 65 ? 'BULLISH' : bearishProb > 65 ? 'BEARISH' : 'NEUTRAL';

  // Strict Confluence Filter for High Accuracy
  if (direction === 'BULLISH') {
    if (!(price > ema[20] && macd.histogram > 0 && rsi > 50)) {
      direction = 'NEUTRAL';
      reasoning.push('Confluence failed: requires Price > EMA20, MACD > 0, and RSI > 50 for strict accuracy.');
    }
  } else if (direction === 'BEARISH') {
    if (!(price < ema[20] && macd.histogram < 0 && rsi < 50)) {
      direction = 'NEUTRAL';
      reasoning.push('Confluence failed: requires Price < EMA20, MACD < 0, and RSI < 50 for strict accuracy.');
    }
  }

  let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME' = 'MEDIUM';
  if (volatilityRisk > 35 || adx > 50) riskLevel = 'EXTREME';
  else if (volatilityRisk > 20 || adx > 35) riskLevel = 'HIGH';
  else if (volatilityRisk < 10 && adx < 20) riskLevel = 'LOW';

  const regime = detectRegime(ta);

  const months = timeframe ? parseTimeframeMonths(timeframe) : 3;
  const volRiskFactor = volatilityRisk > 20 ? 0.6 : volatilityRisk > 10 ? 0.8 : 1.0;
  const regimeMultiplier = regime === 'STRONG_TREND' ? 1.2 : regime === 'BREAKOUT' ? 0.7 : 1.0;
  const atrMultiplier = months * 0.8 * volRiskFactor * regimeMultiplier;
  const dirMultiplier = direction === 'BULLISH' ? 1 : direction === 'BEARISH' ? -1 : 0;
  const expectedMove = atr * atrMultiplier * dirMultiplier;
  const targetPrice = parseFloat(Math.max(0.01, price + expectedMove).toFixed(2));
  const targetDateObj = new Date();
  targetDateObj.setMonth(targetDateObj.getMonth() + months);
  const targetDate = targetDateObj.toISOString().split('T')[0];

  return {
    ticker,
    direction,
    bullishProb,
    bearishProb,
    confidence: clampedConfidence,
    riskLevel,
    trendStrength,
    momentumScore,
    volatilityRisk,
    reasoning,
    regime,
    targetPrice,
    targetDate,
    entryPrice: price,
  };
}

// --- Smart Money Detection ---
export interface SmartMoneySignal {
  accumulation: number;
  distribution: number;
  unusualVolume: boolean;
  institutionalActivity: string;
}

export function detectSmartMoney(candles: OHLC[], ta: TAIndicators): SmartMoneySignal {
  const closes = candles.length > 5 ? candles.map(c => c.close) : [ta.support, ta.resistance];
  const volumes = candles.length > 5 ? candles.map(c => c.volume) : [1000000];
  const len = closes.length;
  const recentVol = volumes.slice(-5);
  const avgVol = avg(recentVol);
  const prevVol = volumes.length > 10 ? avg(volumes.slice(-10, -5)) : avgVol;
  const volRatio = prevVol ? avgVol / prevVol : 1;

  const priceChange = len >= 6 ? (closes[len - 1] - closes[len - 6]) / closes[len - 6] * 100 : ta.macd.histogram * 10;
  const priceRise = priceChange > 0;

  // Accumulation: price rising on increasing volume
  let accumulation = 50;
  if (priceRise && volRatio > 1.2) accumulation += 25;
  if (priceRise && ta.rsi > 50 && ta.rsi < 70) accumulation += 15;
  if (ta.adx > 25 && ta.supertrend.direction === 'up') accumulation += 10;

  // Distribution: price falling on increasing volume
  let distribution = 50;
  if (!priceRise && volRatio > 1.2) distribution += 25;
  if (!priceRise && ta.rsi < 50 && ta.rsi > 30) distribution += 15;
  if (ta.adx > 25 && ta.supertrend.direction === 'down') distribution += 10;

  accumulation = Math.min(100, accumulation);
  distribution = Math.min(100, distribution);

  const unusualVolume = volRatio > 1.8;

  let institutionalActivity = 'Neutral';
  if (accumulation > 70) institutionalActivity = 'Strong Accumulation — Smart Money Buying';
  else if (accumulation > 60) institutionalActivity = 'Moderate Accumulation — Institutional Interest';
  else if (distribution > 70) institutionalActivity = 'Strong Distribution — Smart Money Selling';
  else if (distribution > 60) institutionalActivity = 'Moderate Distribution — Profit Booking';

  return { accumulation, distribution, unusualVolume, institutionalActivity };
}

// --- Market Condition Engine ---
export type MarketRegimeLabel = 'STRONG_BULLISH' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'STRONG_BEARISH' | 'HIGH_VOLATILITY' | 'RANGING';

export interface MarketCondition {
  regime: MarketRegimeLabel;
  volatility: 'LOW' | 'MEDIUM' | 'HIGH';
  momentum: 'WEAK' | 'MODERATE' | 'STRONG';
  trendQuality: 'POOR' | 'FAIR' | 'GOOD' | 'EXCELLENT';
  avgAdx: number;
  avgRsi: number;
  breadthScore: number;
  description: string;
}

export function assessMarketCondition(tickers: { ta: TAIndicators | null }[]): MarketCondition {
  const validTas = tickers.filter(t => t.ta).map(t => t.ta!);
  if (validTas.length < 3) return {
    regime: 'NEUTRAL', volatility: 'MEDIUM', momentum: 'WEAK',
    trendQuality: 'POOR', avgAdx: 20, avgRsi: 50, breadthScore: 50,
    description: 'Insufficient data for market assessment',
  };

  const avgAdx = avg(validTas.map(t => t.adx));
  const avgRsi = avg(validTas.map(t => t.rsi));
  const bullCount = validTas.filter(t => t.supertrend.direction === 'up' && t.rsi > 50).length;
  const bearCount = validTas.filter(t => t.supertrend.direction === 'down' && t.rsi < 50).length;
  const breadthScore = (bullCount / validTas.length) * 100;

  let regime: MarketRegimeLabel = 'NEUTRAL';
  if (avgAdx > 30 && avgRsi > 60 && breadthScore > 65) regime = 'STRONG_BULLISH';
  else if (avgAdx > 25 && avgRsi > 55) regime = 'BULLISH';
  else if (avgAdx > 30 && avgRsi < 40 && breadthScore < 35) regime = 'STRONG_BEARISH';
  else if (avgAdx > 25 && avgRsi < 45) regime = 'BEARISH';
  else if (avgAdx < 20) regime = 'RANGING';
  else if (avgAdx > 35) regime = 'HIGH_VOLATILITY';

  const avgBollWidth = avg(validTas.map(t => t.bollinger.width));
  const volatility: 'LOW' | 'MEDIUM' | 'HIGH' = avgBollWidth > 8 ? 'HIGH' : avgBollWidth > 5 ? 'MEDIUM' : 'LOW';
  const momentum: 'WEAK' | 'MODERATE' | 'STRONG' = avgAdx > 30 ? 'STRONG' : avgAdx > 20 ? 'MODERATE' : 'WEAK';
  const trendQuality: 'POOR' | 'FAIR' | 'GOOD' | 'EXCELLENT' = avgAdx > 35 ? 'EXCELLENT' : avgAdx > 28 ? 'GOOD' : avgAdx > 20 ? 'FAIR' : 'POOR';

  return {
    regime, volatility, momentum, trendQuality, avgAdx: parseFloat(avgAdx.toFixed(1)),
    avgRsi: parseFloat(avgRsi.toFixed(1)), breadthScore: parseFloat(breadthScore.toFixed(0)),
    description: `${regime.replace('_', ' ')} — ADX ${avgAdx.toFixed(0)}, RSI ${avgRsi.toFixed(0)}, Breadth ${breadthScore.toFixed(0)}%`,
  };
}

// --- Daily + Weekly Outlook ---
export interface DailyOutlook {
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number;
  targetPrice: number;
  keySupport: number;
  keyResistance: number;
  reasoning: string[];
}

export interface WeeklyOutlook {
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number;
  targetPrice: number;
  trendQuality: 'WEAK' | 'MODERATE' | 'STRONG';
  reasoning: string[];
}

export interface DailyWeeklyPrediction {
  ticker: string;
  daily: DailyOutlook;
  weekly: WeeklyOutlook;
  signalQuality: 'POOR' | 'FAIR' | 'GOOD' | 'EXCELLENT';
  volatilityAdjustedCertainty: number;
  recommendation: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'AVOID' | 'STRONG_SELL';
}

export function computeDailyWeeklyPrediction(
  ticker: string,
  price: number,
  ta: TAIndicators,
  session?: { isClosingHalfHour: boolean; minutesToClose: number; dayOfWeek: number; sessionLabel: string },
): DailyWeeklyPrediction {
  // Daily: short-term momentum from RSI, MACD, Supertrend
  const rsiShort = ta.rsi;
  const macdBullish = ta.macd.histogram > 0 && ta.macd.line > ta.macd.signal;
  const supertrendUp = ta.supertrend.direction === 'up';
  const priceAboveEma20 = price > ta.ema[20];

  let dailyBullScore = 0, dailyBearScore = 0;
  const dailyReasoning: string[] = [];

  if (rsiShort > 50 && rsiShort < 75) { dailyBullScore += 20; dailyReasoning.push(`Daily RSI ${rsiShort.toFixed(0)} — bullish momentum`); }
  if (rsiShort > 75) { dailyBearScore += 25; dailyReasoning.push(`Daily RSI ${rsiShort.toFixed(0)} — overbought, pullback risk`); }
  if (rsiShort < 30) { dailyBullScore += 25; dailyReasoning.push(`Daily RSI ${rsiShort.toFixed(0)} — oversold bounce potential`); }
  if (macdBullish) { dailyBullScore += 20; dailyReasoning.push('Daily MACD bullish — positive momentum'); }
  else if (ta.macd.histogram < 0) { dailyBearScore += 20; dailyReasoning.push('Daily MACD bearish — negative momentum'); }
  if (supertrendUp) { dailyBullScore += 20; dailyReasoning.push('Supertrend bullish — short-term trend up'); }
  else { dailyBearScore += 20; dailyReasoning.push('Supertrend bearish — short-term trend down'); }
  if (priceAboveEma20) { dailyBullScore += 15; }
  else { dailyBearScore += 15; }

  const dailyTotal = dailyBullScore + dailyBearScore || 1;
  const dailyBullProb = (dailyBullScore / dailyTotal) * 100;
  const dailyBearProb = (dailyBearScore / dailyTotal) * 100;
  const dailyDominance = Math.max(dailyBullScore, dailyBearScore) / dailyTotal;
  const dailyConflictPenalty = Math.min(dailyBullScore, dailyBearScore) > 20 ? 8 : 0;
  const dailyRawConf = Math.max(dailyBullScore, dailyBearScore) * dailyDominance - dailyConflictPenalty;
  const dailyConfidence = parseFloat(clampConfidence(Math.min(72, Math.max(20, Math.round(dailyRawConf)))).toFixed(0));
  const dailyDirection: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = dailyBullProb > 60 ? 'BULLISH' : dailyBearProb > 60 ? 'BEARISH' : 'NEUTRAL';

  const atrDailyMultiple = ta.atr * 1.5;
  const dailyTarget = dailyDirection === 'BULLISH' ? price + atrDailyMultiple : dailyDirection === 'BEARISH' ? price - atrDailyMultiple : price;

  // Weekly: medium-term from ADX, EMA structure, Bollinger, volume
  let weeklyBullScore = 0, weeklyBearScore = 0;
  const weeklyReasoning: string[] = [];

  const emaBull = ta.ema[20] > ta.ema[50];
  const priceAboveEma50 = price > ta.ema[50];
  const bollingerSqueeze = ta.bollinger.width < 5;

  if (ta.adx > 25) {
    if (supertrendUp) { weeklyBullScore += 25; weeklyReasoning.push(`Weekly ADX ${ta.adx.toFixed(0)} — strong trend`); }
    else { weeklyBearScore += 25; weeklyReasoning.push(`Weekly ADX ${ta.adx.toFixed(0)} — strong downtrend`); }
  } else { weeklyReasoning.push(`Weekly ADX ${ta.adx.toFixed(0)} — trend weak`); }
  if (emaBull) { weeklyBullScore += 15; weeklyReasoning.push('EMA bullish alignment (20 > 50)'); }
  else { weeklyBearScore += 15; weeklyReasoning.push('EMA bearish alignment (20 < 50)'); }
  if (priceAboveEma50) { weeklyBullScore += 15; }
  else { weeklyBearScore += 15; }
  if (bollingerSqueeze) weeklyReasoning.push('Bollinger squeeze — expansion expected');
  if (ta.stochRsi > 80) { weeklyBearScore += 10; weeklyReasoning.push('StochRSI overbought — caution'); }
  if (ta.stochRsi < 20) { weeklyBullScore += 10; weeklyReasoning.push('StochRSI oversold — bounce zone'); }

  const weeklyTotal = weeklyBullScore + weeklyBearScore || 1;
  const weeklyDominance = Math.max(weeklyBullScore, weeklyBearScore) / weeklyTotal;
  const weeklyConflictPenalty = Math.min(weeklyBullScore, weeklyBearScore) > 20 ? 10 : 0;
  const weeklyRawConf = Math.max(weeklyBullScore, weeklyBearScore) * weeklyDominance - weeklyConflictPenalty;
  const weeklyConfidence = parseFloat(clampConfidence(Math.min(72, Math.max(20, Math.round(weeklyRawConf)))).toFixed(0));
  const weeklyDirection: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = weeklyBullScore > weeklyBearScore + 15 ? 'BULLISH' : weeklyBearScore > weeklyBullScore + 15 ? 'BEARISH' : 'NEUTRAL';

  const atrWeeklyMultiple = ta.atr * 4;
  const weeklyTarget = weeklyDirection === 'BULLISH' ? price + atrWeeklyMultiple : weeklyDirection === 'BEARISH' ? price - atrWeeklyMultiple : price;

  const trendQuality: 'WEAK' | 'MODERATE' | 'STRONG' = ta.adx > 30 ? 'STRONG' : ta.adx > 20 ? 'MODERATE' : 'WEAK';

  // Session-aware adjustments (real-time, no fake data)
  let sessionPenalty = 0;
  if (session) {
    if (session.isClosingHalfHour) {
      sessionPenalty = 8;
      weeklyReasoning.push('Closing half-hour — daily prediction adjusted for session end');
    }
    if (session.dayOfWeek === 5 && weeklyDirection === 'BULLISH') {
      sessionPenalty = 5;
      weeklyReasoning.push('Friday — bullish conviction reduced for weekend risk');
    }
    if (session.sessionLabel === 'POST_MARKET') {
      sessionPenalty = 0;
      weeklyReasoning.push('Market closed — prediction based on closing price');
    }
  }

  // Signal quality — deflated, more demanding
  const dailyWeeklyAlign = dailyDirection === weeklyDirection;
  const alignmentBonus = dailyWeeklyAlign ? 8 : (dailyDirection === 'NEUTRAL' || weeklyDirection === 'NEUTRAL' ? 2 : -5);
  const signalScore = Math.round(dailyConfidence * 0.35 + weeklyConfidence * 0.35 + alignmentBonus + Math.min(Math.max(ta.adx - 15, 0), 20) - sessionPenalty);
  const signalQuality: 'POOR' | 'FAIR' | 'GOOD' | 'EXCELLENT' = signalScore > 80 ? 'EXCELLENT' : signalScore > 60 ? 'GOOD' : signalScore > 40 ? 'FAIR' : 'POOR';

  const volatilityPenalty = ta.bollinger.width > 8 ? 12 : ta.bollinger.width > 6 ? 6 : 0;
  const volatilityAdjustedCertainty = parseFloat(Math.min(100, Math.max(5, signalScore - volatilityPenalty)).toFixed(0));

  let recommendation: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'AVOID' | 'STRONG_SELL' = 'HOLD';
  if (signalQuality === 'EXCELLENT' && dailyDirection === 'BULLISH' && weeklyDirection === 'BULLISH') recommendation = 'STRONG_BUY';
  else if ((signalQuality === 'EXCELLENT' || signalQuality === 'GOOD') && dailyDirection === 'BULLISH' && weeklyDirection !== 'BEARISH') recommendation = 'BUY';
  else if (signalQuality === 'EXCELLENT' && dailyDirection === 'BEARISH' && weeklyDirection === 'BEARISH') recommendation = 'STRONG_SELL';
  else if ((signalQuality === 'EXCELLENT' || signalQuality === 'GOOD') && dailyDirection === 'BEARISH' && weeklyDirection !== 'BULLISH') recommendation = 'AVOID';
  else if (signalQuality === 'POOR') recommendation = 'HOLD';

  return {
    ticker,
    daily: { direction: dailyDirection, confidence: dailyConfidence, targetPrice: parseFloat(dailyTarget.toFixed(2)), keySupport: ta.support, keyResistance: ta.resistance, reasoning: dailyReasoning },
    weekly: { direction: weeklyDirection, confidence: weeklyConfidence, targetPrice: parseFloat(weeklyTarget.toFixed(2)), trendQuality, reasoning: weeklyReasoning },
    signalQuality,
    volatilityAdjustedCertainty,
    recommendation,
  };
}

// --- Hourly Prediction ---
export interface HourlyPrediction {
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number;
  targetPrice: number;
  reasoning: string[];
}

export function computeHourlyPrediction(
  ticker: string,
  price: number,
  ta: TAIndicators,
  session?: { isOpeningHalfHour: boolean; isClosingHalfHour: boolean; minutesToClose: number; dayOfWeek: number },
): HourlyPrediction {
  let bullScore = 0, bearScore = 0;
  const reasoning: string[] = [];

  if (ta.rsi > 50 && ta.rsi < 70) { bullScore += 25; reasoning.push(`RSI ${ta.rsi.toFixed(0)} — bullish`); }
  else if (ta.rsi > 70) { bearScore += 20; reasoning.push(`RSI ${ta.rsi.toFixed(0)} — overbought`); }
  else if (ta.rsi < 35) { bullScore += 20; reasoning.push(`RSI ${ta.rsi.toFixed(0)} — oversold bounce`); }

  if (ta.macd.histogram > 0) { bullScore += 20; reasoning.push('MACD histogram positive — upward momentum'); }
  else { bearScore += 20; reasoning.push('MACD histogram negative — downward pressure'); }

  if (ta.supertrend.direction === 'up') { bullScore += 20; reasoning.push('Supertrend bullish'); }
  else { bearScore += 20; reasoning.push('Supertrend bearish'); }

  const priceVsEma = price > ta.ema[20] ? 15 : -15;
  if (priceVsEma > 0) bullScore += priceVsEma; else bearScore += Math.abs(priceVsEma);

  // Session-aware adjustments (real-time, no fake data)
  if (session) {
    if (session.isOpeningHalfHour) {
      reasoning.push('Opening half-hour — high volatility, waiting for confirmation');
    }
    if (session.isClosingHalfHour) {
      reasoning.push('Closing half-hour — institutional squaring, expect mean reversion');
      if (bullScore > bearScore) bearScore += 10;
      else bullScore += 10;
    }
    if (session.dayOfWeek === 1) {
      reasoning.push('Monday — gap-fill day, trend often reverses from Friday close');
      bearScore += 5;
    }
    if (session.dayOfWeek === 5) {
      reasoning.push('Friday — profit booking before weekend');
      if (bullScore > bearScore) bearScore += 8;
    }
  }

  const total = bullScore + bearScore || 1;
  const dominance = Math.max(bullScore, bearScore) / total;
  const rawConf = Math.max(bullScore, bearScore) * dominance;
  const confidence = clampConfidence(Math.round(rawConf));

  const direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = bullScore > bearScore + 10 ? 'BULLISH' : bearScore > bullScore + 10 ? 'BEARISH' : 'NEUTRAL';
  const atrHourly = ta.atr * 0.3;
  const targetPrice = direction === 'BULLISH' ? price + atrHourly : direction === 'BEARISH' ? price - atrHourly : price;

  return { direction, confidence, targetPrice: parseFloat(targetPrice.toFixed(2)), reasoning };
}

// --- Historical Accuracy Tracker ---
export interface PredictionRecord {
  ticker: string;
  timestamp: number;
  predictedDirection: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  actualOutcome: 'CORRECT' | 'WRONG' | 'PENDING';
  confidence: number;
  entryPrice: number;
  exitPrice?: number;
  pnlPercent?: number;
}

export function createAccuracyTracker() {
  const history: PredictionRecord[] = [];

  return {
    addPrediction(record: PredictionRecord) { history.push(record); },
    getStats() {
      const resolved = history.filter(h => h.actualOutcome !== 'PENDING');
      const correct = resolved.filter(h => h.actualOutcome === 'CORRECT');
      const accuracy = resolved.length ? (correct.length / resolved.length) * 100 : 0;
      const avgConfidence = history.length ? avg(history.map(h => h.confidence)) : 0;
      const winRate = resolved.length ? (correct.length / resolved.length) * 100 : 0;
      const avgPnl = resolved.filter(h => h.pnlPercent != null).length
        ? avg(resolved.filter(h => h.pnlPercent != null).map(h => h.pnlPercent!))
        : 0;
      return {
        total: history.length,
        resolved: resolved.length,
        correct: correct.length,
        accuracy: parseFloat(accuracy.toFixed(1)),
        winRate: parseFloat(winRate.toFixed(1)),
        avgConfidence: parseFloat(avgConfidence.toFixed(1)),
        avgPnl: parseFloat(avgPnl.toFixed(2)),
      };
    },
    getHistory() { return history; },
  };
}

// --- Backtesting ---
export interface BacktestResult {
  totalTrades: number;
  winRate: number;
  totalReturn: number;
  maxDrawdown: number;
  sharpeRatio: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
}

// --- Build Candle History (shared between AIAnalyticsHub and WeeklyPredictions) ---
export function buildCandleHistory(
  history: OHLC[],
  currentPrice: number,
  currentVolume: number,
  prevClose: number,
  sessionHigh?: number,
  sessionLow?: number,
): OHLC[] {
  if (history.length === 0) return [];

  // Use real historical candles; append current price as today's candle
  const candles = history.slice(-500);
  const lastCandle = candles[candles.length - 1];
  const todayOpen = lastCandle.close;
  // Use persisted session high/low if available — captures true intraday range
  const todayHigh = sessionHigh !== undefined
    ? Math.max(todayOpen, sessionHigh, currentPrice)
    : Math.max(todayOpen, currentPrice);
  const todayLow = sessionLow !== undefined
    ? Math.min(todayOpen, sessionLow, currentPrice)
    : Math.min(todayOpen, currentPrice);
  candles.push({
    open: todayOpen,
    high: todayHigh,
    low: todayLow,
    close: currentPrice,
    volume: currentVolume || lastCandle.volume,
  });
  return candles;
}

export function runBacktest(candles: OHLC[], strategy: 'RSI_MEAN_REVERSION' | 'TREND_FOLLOWING' | 'BREAKOUT'): BacktestResult {
  const results: number[] = [];
  let peak = 0;
  let maxDrawdown = 0;
  let wins = 0;
  let losses = 0;
  let totalWin = 0;
  let totalLoss = 0;

  for (let i = 50; i < candles.length - 1; i++) {
    const window = candles.slice(0, i + 1);
    const ta = calculateIndicators(window);
    if (!ta) continue;

    let signal: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    const nextClose = candles[i + 1].close;
    const entry = candles[i].close;

    if (strategy === 'RSI_MEAN_REVERSION') {
      if (ta.rsi < 30) signal = 'BUY';
      else if (ta.rsi > 70) signal = 'SELL';
    } else if (strategy === 'TREND_FOLLOWING') {
      if (ta.macd.histogram > 0 && ta.rsi > 50 && ta.rsi < 70) signal = 'BUY';
      else if (ta.macd.histogram < 0 && ta.rsi < 50 && ta.rsi > 30) signal = 'SELL';
    } else if (strategy === 'BREAKOUT') {
      if (ta.bollinger.upper && entry > ta.bollinger.upper * 0.99) signal = 'BUY';
      else if (ta.bollinger.lower && entry < ta.bollinger.lower * 1.01) signal = 'SELL';
    }

    if (signal !== 'HOLD') {
      const pnl = signal === 'BUY' ? (nextClose - entry) / entry : (entry - nextClose) / entry;
      results.push(pnl);
      if (pnl > 0) { wins++; totalWin += pnl; }
      else { losses++; totalLoss += Math.abs(pnl); }
      if (results.length > 1) {
        const cumReturn = results.reduce((a, b) => a * (1 + b), 1);
        if (cumReturn > peak) peak = cumReturn;
        const dd = (peak - cumReturn) / peak * 100;
        if (dd > maxDrawdown) maxDrawdown = dd;
      }
    }
  }

  const totalTrades = results.length;
  if (totalTrades < 2) return { totalTrades: 0, winRate: 0, totalReturn: 0, maxDrawdown: 0, sharpeRatio: 0, profitFactor: 0, avgWin: 0, avgLoss: 0 };

  const winRate = (wins / totalTrades) * 100;
  const totalReturn = (results.reduce((a, b) => a * (1 + b), 1) - 1) * 100;
  const profitFactor = totalLoss > 0 ? totalWin / totalLoss : totalWin > 0 ? 99 : 0;
  const avgWin = wins > 0 ? totalWin / wins * 100 : 0;
  const avgLoss = losses > 0 ? totalLoss / losses * 100 : 0;
  const meanReturn = avg(results);
  const stdReturn = stdDev(results, meanReturn);
  const sharpeRatio = stdReturn > 0 ? (meanReturn / stdReturn) * Math.sqrt(252) : 0;

  return {
    totalTrades,
    winRate: parseFloat(winRate.toFixed(1)),
    totalReturn: parseFloat(totalReturn.toFixed(2)),
    maxDrawdown: parseFloat(maxDrawdown.toFixed(2)),
    sharpeRatio: parseFloat(sharpeRatio.toFixed(2)),
    profitFactor: parseFloat(profitFactor.toFixed(2)),
    avgWin: parseFloat(avgWin.toFixed(2)),
    avgLoss: parseFloat(avgLoss.toFixed(2)),
  };
}
