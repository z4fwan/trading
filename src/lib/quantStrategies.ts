/**
 * Quantitative Strategies — Pairs trading, mean reversion, stat arb.
 * Each strategy generates signals with confidence scores.
 */

interface QuantSignal {
  strategy: string;
  ticker: string;
  pairTicker?: string;
  signal: 'BUY' | 'SELL' | 'CLOSE' | 'HOLD';
  confidence: number;
  expectedReturn: number;
  holdingPeriod: string;
  reasoning: string;
  entryPrice?: number;
  targetPrice?: number;
  stopLoss?: number;
  timestamp: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Strategy 1: Pairs Trading (Cointegration-based)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const CORRELATED_PAIRS: [string, string][] = [
  ['AAPL', 'MSFT'], ['GOOGL', 'META'], ['JPM', 'GS'], ['XOM', 'CVX'],
  ['KO', 'PEP'], ['WMT', 'COST'], ['HD', 'LOW'], ['DIS', 'NFLX'],
  ['PFE', 'JNJ'], ['BA', 'CAT'], ['RELIANCE', 'TCS'], ['HDFCBANK', 'ICICIBANK'],
  ['INFY', 'WIPRO'], ['SBIN', 'BAJFINANCE'], ['BTC-USD', 'ETH-USD'],
];

function calculateSpread(pricesA: number[], pricesB: number[]): number[] {
  const n = Math.min(pricesA.length, pricesB.length);
  const spread: number[] = [];
  for (let i = 0; i < n; i++) {
    // Normalize to percentage change
    const normA = pricesA[pricesA.length - n + i] / pricesA[pricesA.length - n];
    const normB = pricesB[pricesB.length - n + i] / pricesB[pricesB.length - n];
    spread.push(normA - normB);
  }
  return spread;
}

function zScore(spread: number[], lookback = 20): number[] {
  const result: number[] = [];
  for (let i = 0; i < spread.length; i++) {
    if (i < lookback - 1) { result.push(0); continue; }
    const window = spread.slice(i - lookback + 1, i + 1);
    const mean = window.reduce((s, v) => s + v, 0) / lookback;
    const variance = window.reduce((s, v) => s + (v - mean) ** 2, 0) / lookback;
    const std = Math.sqrt(variance);
    result.push(std > 0 ? (spread[i] - mean) / std : 0);
  }
  return result;
}

export function pairsTradingSignal(
  pricesA: number[],
  pricesB: number[],
  tickerA: string,
  tickerB: string,
): QuantSignal | null {
  if (pricesA.length < 30 || pricesB.length < 30) return null;

  const spread = calculateSpread(pricesA, pricesB);
  const zScores = zScore(spread, 20);
  const currentZ = zScores[zScores.length - 1];

  const currentPriceA = pricesA[pricesA.length - 1];

  // Entry signals
  if (currentZ > 2.0) {
    // Spread is wide: A is expensive, B is cheap → Short A, Long B
    return {
      strategy: 'PAIRS_TRADING',
      ticker: tickerA,
      pairTicker: tickerB,
      signal: 'SELL',
      confidence: Math.min(85, 50 + Math.abs(currentZ) * 10),
      expectedReturn: Math.abs(currentZ) * 0.5, // Mean reversion expectation
      holdingPeriod: '5-15 days',
      reasoning: `Z-score ${currentZ.toFixed(2)} > 2.0 — spread widened, expect mean reversion`,
      entryPrice: currentPriceA,
      targetPrice: currentPriceA * 0.98,
      stopLoss: currentPriceA * 1.03,
      timestamp: Date.now(),
    };
  }

  if (currentZ < -2.0) {
    // Spread is narrow/negative: A is cheap, B is expensive → Long A, Short B
    return {
      strategy: 'PAIRS_TRADING',
      ticker: tickerA,
      pairTicker: tickerB,
      signal: 'BUY',
      confidence: Math.min(85, 50 + Math.abs(currentZ) * 10),
      expectedReturn: Math.abs(currentZ) * 0.5,
      holdingPeriod: '5-15 days',
      reasoning: `Z-score ${currentZ.toFixed(2)} < -2.0 — spread compressed, expect mean reversion`,
      entryPrice: currentPriceA,
      targetPrice: currentPriceA * 1.02,
      stopLoss: currentPriceA * 0.97,
      timestamp: Date.now(),
    };
  }

  // Exit signal
  if (Math.abs(currentZ) < 0.5) {
    return {
      strategy: 'PAIRS_TRADING',
      ticker: tickerA,
      pairTicker: tickerB,
      signal: 'CLOSE',
      confidence: 60,
      expectedReturn: 0,
      holdingPeriod: 'Close now',
      reasoning: `Z-score ${currentZ.toFixed(2)} — spread normalized, close position`,
      timestamp: Date.now(),
    };
  }

  return null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Strategy 2: Mean Reversion (Bollinger Band + RSI)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function smaLocal(data: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { result.push(NaN); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += data[j];
    result.push(sum / period);
  }
  return result;
}

function rsiLocal(data: number[], period = 14): number[] {
  const result: number[] = [];
  let avgGain = 0, avgLoss = 0;
  for (let i = 0; i < data.length; i++) {
    if (i === 0) { result.push(50); continue; }
    const change = data[i] - data[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    if (i < period) { avgGain += gain; avgLoss += loss; result.push(50); continue; }
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const rs = avgLoss > 0 ? avgGain / avgLoss : 100;
    result.push(100 - 100 / (1 + rs));
  }
  return result;
}

export function meanReversionSignal(
  prices: number[],
  ticker: string,
): QuantSignal | null {
  if (prices.length < 30) return null;

  const sma20 = smaLocal(prices, 20);
  const rsi14 = rsiLocal(prices, 14);
  const currentPrice = prices[prices.length - 1];
  const currentSMA = sma20[sma20.length - 1];
  const currentRSI = rsi14[rsi14.length - 1];

  // Bollinger Bands
  const lookback = 20;
  const window = prices.slice(-lookback);
  const mean = window.reduce((s, v) => s + v, 0) / lookback;
  const variance = window.reduce((s, v) => s + (v - mean) ** 2, 0) / lookback;
  const std = Math.sqrt(variance);
  const upperBB = mean + 2 * std;
  const lowerBB = mean - 2 * std;

  // Buy: price below lower BB + RSI < 30
  if (currentPrice < lowerBB && currentRSI < 30) {
    return {
      strategy: 'MEAN_REVERSION',
      ticker,
      signal: 'BUY',
      confidence: Math.min(80, 50 + (30 - currentRSI) * 2 + ((lowerBB - currentPrice) / lowerBB) * 100),
      expectedReturn: ((currentSMA - currentPrice) / currentPrice) * 100,
      holdingPeriod: '3-7 days',
      reasoning: `Price ${currentPrice.toFixed(2)} below BB lower ${lowerBB.toFixed(2)}, RSI ${currentRSI.toFixed(0)} oversold`,
      entryPrice: currentPrice,
      targetPrice: currentSMA,
      stopLoss: currentPrice * 0.95,
      timestamp: Date.now(),
    };
  }

  // Sell: price above upper BB + RSI > 70
  if (currentPrice > upperBB && currentRSI > 70) {
    return {
      strategy: 'MEAN_REVERSION',
      ticker,
      signal: 'SELL',
      confidence: Math.min(80, 50 + (currentRSI - 70) * 2 + ((currentPrice - upperBB) / upperBB) * 100),
      expectedReturn: ((currentSMA - currentPrice) / currentPrice) * 100,
      holdingPeriod: '3-7 days',
      reasoning: `Price ${currentPrice.toFixed(2)} above BB upper ${upperBB.toFixed(2)}, RSI ${currentRSI.toFixed(0)} overbought`,
      entryPrice: currentPrice,
      targetPrice: currentSMA,
      stopLoss: currentPrice * 1.05,
      timestamp: Date.now(),
    };
  }

  return null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Strategy 3: Statistical Arbitrage (Z-Score Mean Reversion on single stock)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export function statArbSignal(
  prices: number[],
  volumes: number[],
  ticker: string,
): QuantSignal | null {
  if (prices.length < 60) return null;

  // Calculate z-score of price relative to 60-day mean
  const lookback = 60;
  const window = prices.slice(-lookback);
  const mean = window.reduce((s, v) => s + v, 0) / lookback;
  const variance = window.reduce((s, v) => s + (v - mean) ** 2, 0) / lookback;
  const std = Math.sqrt(variance);
  const zScorePrice = std > 0 ? (prices[prices.length - 1] - mean) / std : 0;

  // Volume z-score (confirm with volume)
  const volWindow = volumes.slice(-lookback);
  const volMean = volWindow.reduce((s, v) => s + v, 0) / lookback;
  const volStd = Math.sqrt(volWindow.reduce((s, v) => s + (v - volMean) ** 2, 0) / lookback);
  const zScoreVol = volStd > 0 ? (volumes[volumes.length - 1] - volMean) / volStd : 0;

  const currentPrice = prices[prices.length - 1];

  // Buy: price z-score < -2 + volume surge confirming
  if (zScorePrice < -2 && zScoreVol > 1) {
    return {
      strategy: 'STAT_ARB',
      ticker,
      signal: 'BUY',
      confidence: Math.min(85, 50 + Math.abs(zScorePrice) * 10 + zScoreVol * 5),
      expectedReturn: Math.abs(zScorePrice) * 0.3,
      holdingPeriod: '5-20 days',
      reasoning: `Price z-score ${zScorePrice.toFixed(2)}, volume z-score ${zScoreVol.toFixed(1)} — oversold with volume confirmation`,
      entryPrice: currentPrice,
      targetPrice: mean,
      stopLoss: currentPrice * 0.93,
      timestamp: Date.now(),
    };
  }

  // Sell: price z-score > 2.5 + volume surge
  if (zScorePrice > 2.5 && zScoreVol > 1.5) {
    return {
      strategy: 'STAT_ARB',
      ticker,
      signal: 'SELL',
      confidence: Math.min(85, 50 + Math.abs(zScorePrice) * 8 + zScoreVol * 5),
      expectedReturn: -Math.abs(zScorePrice) * 0.3,
      holdingPeriod: '5-20 days',
      reasoning: `Price z-score ${zScorePrice.toFixed(2)} extreme + volume ${zScoreVol.toFixed(1)}σ — overextended`,
      entryPrice: currentPrice,
      targetPrice: mean,
      stopLoss: currentPrice * 1.07,
      timestamp: Date.now(),
    };
  }

  return null;
}

/**
 * Run all quant strategies on a ticker.
 */
export function runQuantStrategies(
  ticker: string,
  prices: number[],
  volumes: number[],
  correlatedPrices?: Record<string, number[]>,
): QuantSignal[] {
  const signals: QuantSignal[] = [];

  // Mean reversion
  const mr = meanReversionSignal(prices, ticker);
  if (mr) signals.push(mr);

  // Stat arb
  const sa = statArbSignal(prices, volumes, ticker);
  if (sa) signals.push(sa);

  // Pairs trading (if correlated prices provided)
  if (correlatedPrices) {
    for (const [pairA, pairB] of CORRELATED_PAIRS) {
      if (pairA === ticker && correlatedPrices[pairB]) {
        const pt = pairsTradingSignal(prices, correlatedPrices[pairB], pairA, pairB);
        if (pt) signals.push(pt);
      }
      if (pairB === ticker && correlatedPrices[pairA]) {
        const pt = pairsTradingSignal(correlatedPrices[pairA], prices, pairB, pairA);
        if (pt) signals.push(pt);
      }
    }
  }

  return signals.sort((a, b) => b.confidence - a.confidence);
}

export const STRATEGY_DESCRIPTIONS: Record<string, string> = {
  PAIRS_TRADING: 'Cointegration-based pairs trading — exploits temporary price divergence between correlated assets',
  MEAN_REVERSION: 'Bollinger Band + RSI mean reversion — buys oversold, sells overbought',
  STAT_ARB: 'Statistical arbitrage — z-score mean reversion with volume confirmation',
};
