/**
 * Backtesting Engine — Validates trading strategies against historical data.
 * Supports multiple strategies: SMA crossover, RSI mean reversion, momentum.
 */

export interface BacktestTrade {
  ticker: string;
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  direction: 'LONG' | 'SHORT';
  returnPct: number;
  holdingDays: number;
  signal: string;
}

export interface BacktestResult {
  strategy: string;
  ticker: string;
  period: string;
  totalTrades: number;
  winRate: number;
  avgReturn: number;
  totalReturn: number;
  maxDrawdown: number;
  sharpeRatio: number;
  profitFactor: number;
  avgHoldingDays: number;
  trades: BacktestTrade[];
}

interface OHLCBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function sma(data: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { result.push(NaN); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += data[j];
    result.push(sum / period);
  }
  return result;
}

function ema(data: number[], period: number): number[] {
  const result: number[] = [];
  const k = 2 / (period + 1);
  for (let i = 0; i < data.length; i++) {
    if (i === 0) { result.push(data[0]); continue; }
    result.push(data[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

function rsi(data: number[], period = 14): number[] {
  const result: number[] = [];
  let avgGain = 0, avgLoss = 0;
  for (let i = 0; i < data.length; i++) {
    if (i === 0) { result.push(50); continue; }
    const change = data[i] - data[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    if (i < period) {
      avgGain += gain;
      avgLoss += loss;
      result.push(50);
      continue;
    }
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const rs = avgLoss > 0 ? avgGain / avgLoss : 100;
    result.push(100 - 100 / (1 + rs));
  }
  return result;
}

function atr(bars: OHLCBar[], period = 14): number[] {
  const result: number[] = [];
  const trs: number[] = [];
  for (let i = 0; i < bars.length; i++) {
    if (i === 0) { result.push(0); continue; }
    const tr = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low - bars[i - 1].close)
    );
    trs.push(tr);
    if (trs.length < period) { result.push(0); continue; }
    const avg = trs.slice(-period).reduce((s, v) => s + v, 0) / period;
    result.push(avg);
  }
  return result;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Strategy: SMA Crossover (20/50)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function strategySMACrossover(bars: OHLCBar[]): BacktestTrade[] {
  const closes = bars.map(b => b.close);
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const trades: BacktestTrade[] = [];
  let inPosition = false;
  let entryPrice = 0;
  let entryDate = '';

  for (let i = 51; i < bars.length; i++) {
    if (!inPosition && sma20[i] > sma50[i] && sma20[i - 1] <= sma50[i - 1]) {
      inPosition = true;
      entryPrice = bars[i].close;
      entryDate = bars[i].date;
    } else if (inPosition && sma20[i] < sma50[i] && sma20[i - 1] >= sma50[i - 1]) {
      const returnPct = (bars[i].close - entryPrice) / entryPrice;
      const holdingDays = Math.round((new Date(bars[i].date).getTime() - new Date(entryDate).getTime()) / 86400000);
      trades.push({
        ticker: '', entryDate, exitDate: bars[i].date,
        entryPrice, exitPrice: bars[i].close,
        direction: 'LONG', returnPct, holdingDays,
        signal: 'SMA_20_50_CROSS',
      });
      inPosition = false;
    }
  }
  return trades;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Strategy: RSI Mean Reversion (buy <30, sell >70)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function strategyRSIMeanReversion(bars: OHLCBar[]): BacktestTrade[] {
  const closes = bars.map(b => b.close);
  const rsiValues = rsi(closes, 14);
  const trades: BacktestTrade[] = [];
  let inPosition = false;
  let entryPrice = 0;
  let entryDate = '';

  for (let i = 15; i < bars.length; i++) {
    if (!inPosition && rsiValues[i] < 30) {
      inPosition = true;
      entryPrice = bars[i].close;
      entryDate = bars[i].date;
    } else if (inPosition && rsiValues[i] > 70) {
      const returnPct = (bars[i].close - entryPrice) / entryPrice;
      const holdingDays = Math.round((new Date(bars[i].date).getTime() - new Date(entryDate).getTime()) / 86400000);
      trades.push({
        ticker: '', entryDate, exitDate: bars[i].date,
        entryPrice, exitPrice: bars[i].close,
        direction: 'LONG', returnPct, holdingDays,
        signal: 'RSI_MEAN_REVERSION',
      });
      inPosition = false;
    }
  }
  return trades;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Strategy: Momentum Breakout (price > 20-day high + volume surge)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function strategyMomentumBreakout(bars: OHLCBar[]): BacktestTrade[] {
  const closes = bars.map(b => b.close);
  const volumes = bars.map(b => b.volume);
  const atrValues = atr(bars, 14);
  const trades: BacktestTrade[] = [];
  let inPosition = false;
  let entryPrice = 0;
  let entryDate = '';

  for (let i = 21; i < bars.length; i++) {
    const high20 = Math.max(...bars.slice(i - 20, i).map(b => b.high));
    const avgVol = volumes.slice(i - 20, i).reduce((s, v) => s + v, 0) / 20;
    const volSurge = avgVol > 0 ? volumes[i] / avgVol : 1;

    if (!inPosition && bars[i].close > high20 && volSurge > 1.5 && atrValues[i] > 0) {
      inPosition = true;
      entryPrice = bars[i].close;
      entryDate = bars[i].date;
    } else if (inPosition) {
      // Exit on trailing stop (2x ATR) or after 10 days
      const stopLoss = entryPrice - 2 * atrValues[i];
      const daysIn = Math.round((new Date(bars[i].date).getTime() - new Date(entryDate).getTime()) / 86400000);
      if (bars[i].close < stopLoss || daysIn >= 10) {
        const returnPct = (bars[i].close - entryPrice) / entryPrice;
        trades.push({
          ticker: '', entryDate, exitDate: bars[i].date,
          entryPrice, exitPrice: bars[i].close,
          direction: 'LONG', returnPct,
          holdingDays: daysIn,
          signal: 'MOMENTUM_BREAKOUT',
        });
        inPosition = false;
      }
    }
  }
  return trades;
}

function calculateMetrics(trades: BacktestTrade[], allBars: OHLCBar[]): Omit<BacktestResult, 'strategy' | 'ticker' | 'period' | 'trades'> {
  if (trades.length === 0) {
    return { totalTrades: 0, winRate: 0, avgReturn: 0, totalReturn: 0, maxDrawdown: 0, sharpeRatio: 0, profitFactor: 0, avgHoldingDays: 0 };
  }

  const wins = trades.filter(t => t.returnPct > 0);
  const losses = trades.filter(t => t.returnPct <= 0);
  const avgReturn = trades.reduce((s, t) => s + t.returnPct, 0) / trades.length;
  const totalReturn = trades.reduce((s, t) => s + t.returnPct, 0);

  // Max drawdown from equity curve
  let equity = 1;
  let peak = 1;
  let maxDrawdown = 0;
  for (const t of trades) {
    equity *= (1 + t.returnPct);
    peak = Math.max(peak, equity);
    const dd = (peak - equity) / peak;
    maxDrawdown = Math.max(maxDrawdown, dd);
  }

  // Sharpe ratio (annualized)
  const returns = trades.map(t => t.returnPct);
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
  const std = Math.sqrt(variance);
  const sharpeRatio = std > 0 ? (mean / std) * Math.sqrt(252 / Math.max(1, trades.reduce((s, t) => s + t.holdingDays, 0) / trades.length)) : 0;

  // Profit factor
  const grossProfit = wins.reduce((s, t) => s + t.returnPct, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.returnPct, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

  return {
    totalTrades: trades.length,
    winRate: wins.length / trades.length,
    avgReturn,
    totalReturn,
    maxDrawdown,
    sharpeRatio,
    profitFactor,
    avgHoldingDays: trades.reduce((s, t) => s + t.holdingDays, 0) / trades.length,
  };
}

/**
 * Run backtest for a single ticker across all strategies.
 */
export function runBacktest(
  ticker: string,
  bars: OHLCBar[],
  strategy?: 'SMA_CROSSOVER' | 'RSI_REVERSION' | 'MOMENTUM' | 'ALL',
): BacktestResult[] {
  const results: BacktestResult[] = [];
  const strategies = strategy === 'ALL' || !strategy
    ? ['SMA_CROSSOVER', 'RSI_REVERSION', 'MOMENTUM']
    : [strategy];

  for (const strat of strategies) {
    let trades: BacktestTrade[];
    switch (strat) {
      case 'SMA_CROSSOVER': trades = strategySMACrossover(bars); break;
      case 'RSI_REVERSION': trades = strategyRSIMeanReversion(bars); break;
      case 'MOMENTUM': trades = strategyMomentumBreakout(bars); break;
      default: continue;
    }

    trades.forEach(t => { t.ticker = ticker; });
    const metrics = calculateMetrics(trades, bars);
    const period = bars.length > 0 ? `${bars[0].date} to ${bars[bars.length - 1].date}` : '';

    results.push({
      strategy: strat,
      ticker,
      period,
      trades,
      ...metrics,
    });
  }

  return results;
}

/**
 * Run backtest across multiple tickers.
 */
export function runMultiTickerBacktest(
  tickerBarsMap: Map<string, OHLCBar[]>,
  strategy?: 'SMA_CROSSOVER' | 'RSI_REVERSION' | 'MOMENTUM' | 'ALL',
): BacktestResult[] {
  const allResults: BacktestResult[] = [];
  for (const [ticker, bars] of tickerBarsMap) {
    allResults.push(...runBacktest(ticker, bars, strategy));
  }
  return allResults;
}
