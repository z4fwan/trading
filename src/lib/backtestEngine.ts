import { type OHLC } from '@/lib/technicalAnalysis';
import { extractFeatures, computeStats, standardize, fitLogisticRegression, sigmoid } from '@/lib/mlEngine';

// === Trade Simulation ===
export interface Trade {
  entryDate: number;
  exitDate: number;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  size: number;
  pnl: number;
  pnlPercent: number;
  holdingPeriod: number;
  reason: string;
}

export interface BacktestConfig {
  transactionCost: number;
  initialCapital: number;
  positionSizePct: number;
  stopLossPct: number;
  takeProfitPct: number;
}

const DEFAULT_CONFIG: BacktestConfig = {
  transactionCost: 0.001,
  initialCapital: 100000,
  positionSizePct: 0.25,
  stopLossPct: 0.05,
  takeProfitPct: 0.10,
};

export interface BacktestMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalReturn: number;
  totalReturnPct: number;
  maxDrawdown: number;
  sharpeRatio: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  avgHoldingPeriod: number;
  expectancy: number;
  trades: Trade[];
  equityCurve: number[];
  monthlyReturns: number[];
}

export function runWalkForwardBacktest(
  candles: OHLC[],
  config: Partial<BacktestConfig> = {},
): BacktestMetrics {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const trades: Trade[] = [];
  const equityCurve: number[] = [cfg.initialCapital];
  let capital = cfg.initialCapital;
  let peak = capital;
  let maxDrawdown = 0;
  const monthlyReturns: number[] = [];
  let lastMonth = -1;

  if (candles.length < 120) return emptyMetrics();

  // Walk-forward windows
  const nWindows = 4;
  const windowSize = Math.floor((candles.length - 100) / nWindows);

  for (let w = 0; w < nWindows; w++) {
    const trainStart = 60;
    const trainEnd = 60 + windowSize * (w + 1);
    const testStart = trainEnd;
    const testEnd = Math.min(candles.length - 5, testStart + Math.floor(windowSize * 0.4));

    if (trainEnd - trainStart < 60 || testEnd - testStart < 10) continue;

    // Train model on training window
    const trainCandles = candles.slice(0, trainEnd);
    const trainFeatures = extractFeatures(trainCandles);
    if (trainFeatures.length < 40) continue;

    const labels: number[] = [];
    for (let i = 60; i < trainCandles.length - 5; i++) {
      labels.push(trainCandles[i + 5].close > trainCandles[i].close ? 1 : 0);
    }
    const n = Math.min(trainFeatures.length, labels.length);
    const trainX = trainFeatures.slice(0, n);
    const trainY = labels.slice(0, n);

    const { mean, std } = computeStats(trainX);
    const trainXStd = standardize(trainX, mean, std);
    const weights = fitLogisticRegression(trainXStd, trainY);

    // Test on out-of-sample window
    for (let i = testStart; i < testEnd; i++) {
      const testFeatures = extractFeatures(candles.slice(0, i + 1));
      if (testFeatures.length === 0) continue;
      const f = testFeatures[testFeatures.length - 1];
      const fStd = f.map((v, j) => (v - mean[j]) / std[j]);
      const z = fStd.reduce((s, v, j) => s + v * weights[j], 0);
      const prob = sigmoid(z);

      if (prob < 0.35 || prob > 0.65) {
        const direction = prob > 0.5 ? 'LONG' : 'SHORT';
        const entryPrice = candles[i].close;
        const posSize = capital * cfg.positionSizePct;

        // Simulate exit after 5 bars or at stop/target
        let exitIdx = -1;
        let exitPrice = entryPrice;
        let exitReason = 'time_exit';

        for (let j = i + 1; j < Math.min(i + 10, candles.length); j++) {
          const bar = candles[j];
          if (direction === 'LONG') {
            const highPct = (bar.high - entryPrice) / entryPrice;
            const lowPct = (entryPrice - bar.low) / entryPrice;
            if (lowPct >= cfg.stopLossPct) {
              exitPrice = entryPrice * (1 - cfg.stopLossPct);
              exitIdx = j;
              exitReason = 'stop_loss';
              break;
            }
            if (highPct >= cfg.takeProfitPct) {
              exitPrice = entryPrice * (1 + cfg.takeProfitPct);
              exitIdx = j;
              exitReason = 'take_profit';
              break;
            }
          } else {
            const lowPct = (entryPrice - bar.low) / entryPrice;
            const highPct = (bar.high - entryPrice) / entryPrice;
            if (lowPct >= cfg.takeProfitPct) {
              exitPrice = entryPrice * (1 - cfg.takeProfitPct);
              exitIdx = j;
              exitReason = 'take_profit';
              break;
            }
            if (highPct >= cfg.stopLossPct) {
              exitPrice = entryPrice * (1 + cfg.stopLossPct);
              exitIdx = j;
              exitReason = 'stop_loss';
              break;
            }
          }
        }

        if (exitIdx === -1) {
          exitIdx = Math.min(i + 5, candles.length - 1);
          exitPrice = candles[exitIdx].close;
          exitReason = 'time_exit';
        }

        const rawReturn = direction === 'LONG'
          ? (exitPrice - entryPrice) / entryPrice
          : (entryPrice - exitPrice) / entryPrice;
        const cost = cfg.transactionCost * 2;
        const netReturn = rawReturn - cost;
        const pnl = posSize * netReturn;
        const pnlPct = netReturn * 100;

        capital += pnl;

        const trade: Trade = {
          entryDate: i,
          exitDate: exitIdx,
          direction,
          entryPrice,
          exitPrice,
          size: posSize,
          pnl,
          pnlPercent: parseFloat(pnlPct.toFixed(2)),
          holdingPeriod: exitIdx - i,
          reason: exitReason,
        };
        trades.push(trade);
        equityCurve.push(capital);

        if (capital > peak) peak = capital;
        const dd = (peak - capital) / peak * 100;
        if (dd > maxDrawdown) maxDrawdown = dd;

        // Track monthly
        const month = Math.floor(i / 21);
        if (month !== lastMonth) {
          lastMonth = month;
          monthlyReturns.push(0);
        }
        if (monthlyReturns.length > 0) monthlyReturns[monthlyReturns.length - 1] += pnlPct;

        // Skip forward to avoid overlapping trades
        i = exitIdx;
      }
    }
  }

  return computeMetrics(trades, equityCurve, monthlyReturns, cfg.initialCapital, maxDrawdown, capital);
}

function computeMetrics(
  trades: Trade[],
  equityCurve: number[],
  monthlyReturns: number[],
  initialCapital: number,
  maxDrawdown: number,
  finalCapital?: number,
): BacktestMetrics {
  const totalTrades = trades.length;
  if (totalTrades === 0) return emptyMetrics();

  const winning = trades.filter(t => t.pnl > 0);
  const losing = trades.filter(t => t.pnl <= 0);
  const winRate = (winning.length / totalTrades) * 100;

  const endCapital = finalCapital ?? equityCurve[equityCurve.length - 1] ?? initialCapital;
  const totalReturn = endCapital - initialCapital;
  const totalReturnPct = ((endCapital / initialCapital) - 1) * 100;

  const avgWin = winning.length > 0
    ? winning.reduce((s, t) => s + t.pnlPercent, 0) / winning.length
    : 0;
  const avgLoss = losing.length > 0
    ? losing.reduce((s, t) => s + t.pnlPercent, 0) / losing.length
    : 0;
  const avgHoldingPeriod = trades.reduce((s, t) => s + t.holdingPeriod, 0) / totalTrades;

  // Profit factor
  const grossProfit = winning.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losing.reduce((s, t) => s + t.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;

  // Sharpe ratio (from monthly returns)
  const avgMonthly = monthlyReturns.length > 0
    ? monthlyReturns.reduce((s, v) => s + v, 0) / monthlyReturns.length
    : 0;
  const stdMonthly = monthlyReturns.length > 1
    ? Math.sqrt(monthlyReturns.reduce((s, v) => s + (v - avgMonthly) ** 2, 0) / (monthlyReturns.length - 1))
    : 1;
  const sharpeRatio = stdMonthly > 0 ? (avgMonthly / stdMonthly) * Math.sqrt(12) : 0;

  // Expectancy
  const expectancy = totalTrades > 0
    ? trades.reduce((s, t) => s + t.pnlPercent, 0) / totalTrades
    : 0;

  return {
    totalTrades,
    winningTrades: winning.length,
    losingTrades: losing.length,
    winRate: parseFloat(winRate.toFixed(1)),
    totalReturn: parseFloat(totalReturn.toFixed(2)),
    totalReturnPct: parseFloat(totalReturnPct.toFixed(2)),
    maxDrawdown: parseFloat(maxDrawdown.toFixed(2)),
    sharpeRatio: parseFloat(sharpeRatio.toFixed(2)),
    profitFactor: parseFloat(profitFactor.toFixed(2)),
    avgWin: parseFloat(avgWin.toFixed(2)),
    avgLoss: parseFloat(avgLoss.toFixed(2)),
    avgHoldingPeriod: parseFloat(avgHoldingPeriod.toFixed(1)),
    expectancy: parseFloat(expectancy.toFixed(2)),
    trades,
    equityCurve,
    monthlyReturns,
  };
}

function emptyMetrics(): BacktestMetrics {
  return {
    totalTrades: 0, winningTrades: 0, losingTrades: 0, winRate: 0,
    totalReturn: 0, totalReturnPct: 0, maxDrawdown: 0, sharpeRatio: 0,
    profitFactor: 0, avgWin: 0, avgLoss: 0, avgHoldingPeriod: 0, expectancy: 0,
    trades: [], equityCurve: [], monthlyReturns: [],
  };
}

// === A/B Comparison ===
export interface ABTestResult {
  mlPerformance: BacktestMetrics;
  ruleBasedPerformance: BacktestMetrics;
  mlBetter: boolean;
  mlWinRateDiff: number;
  mlReturnDiff: number;
  significance: number;
}

export function compareMLvsRuleBased(candles: OHLC[]): ABTestResult | null {
  if (candles.length < 120) return null;

  // ML backtest (already done above with walk-forward)
  const mlResult = runWalkForwardBacktest(candles);

  // Rule-based backtest: simple RSI + MACD strategy
  const ruleTrades = runRuleBasedBacktest(candles);
  const ruleFinalCapital = 100000 + ruleTrades.reduce((s, t) => s + t.pnl, 0);
  const ruleResult = computeMetrics(ruleTrades, [], [], 100000, 0, ruleFinalCapital);

  const mlBetter = mlResult.totalReturnPct > ruleResult.totalReturnPct;
  const mlWinRateDiff = parseFloat((mlResult.winRate - ruleResult.winRate).toFixed(1));
  const mlReturnDiff = parseFloat((mlResult.totalReturnPct - ruleResult.totalReturnPct).toFixed(2));

  // Proportion test: compare win rates using normal approximation
  const n1 = mlResult.totalTrades, n2 = ruleResult.totalTrades;
  let significance = 50;
  if (n1 > 0 && n2 > 0) {
    const p1 = mlResult.winRate / 100, p2 = ruleResult.winRate / 100;
    const pPool = (p1 * n1 + p2 * n2) / (n1 + n2);
    const se = Math.sqrt(pPool * (1 - pPool) * (1 / n1 + 1 / n2));
    const z = se > 0 ? (p1 - p2) / se : 0;
    // Two-tailed z-test p-value approximation
    const pVal = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI) * 2;
    significance = (1 - Math.min(1, pVal)) * 100;
  }

  return {
    mlPerformance: mlResult,
    ruleBasedPerformance: ruleResult,
    mlBetter,
    mlWinRateDiff,
    mlReturnDiff,
    significance: parseFloat(significance.toFixed(1)),
  };
}

function runRuleBasedBacktest(candles: OHLC[]): Trade[] {
  const trades: Trade[] = [];
  const capital = 100000;
  const posSize = capital * 0.25;
  const closes = candles.map(c => c.close);

  for (let i = 60; i < candles.length - 5; i++) {
    const window = candles.slice(i - 14, i + 1);
    const gains: number[] = [];
    const losses: number[] = [];
    for (let j = 1; j < window.length; j++) {
      const diff = window[j].close - window[j - 1].close;
      gains.push(Math.max(0, diff));
      losses.push(Math.max(0, -diff));
    }
    const avgGain = gains.reduce((a, b) => a + b, 0) / gains.length;
    const avgLoss = losses.reduce((a, b) => a + b, 0) / losses.length;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsi = 100 - 100 / (1 + rs);

    // Simple strategy: RSI < 30 = buy, RSI > 70 = sell
    if (rsi < 30) {
      const entryPrice = candles[i].close;
      const exitPrice = candles[Math.min(i + 5, candles.length - 1)].close;
      const pnl = posSize * ((exitPrice - entryPrice) / entryPrice - 0.002);
      trades.push({
        entryDate: i, exitDate: Math.min(i + 5, candles.length - 1),
        direction: 'LONG', entryPrice, exitPrice,
        size: posSize, pnl, pnlPercent: parseFloat((pnl / posSize * 100).toFixed(2)),
        holdingPeriod: 5, reason: 'rsi_oversold',
      });
    }
  }
  return trades;
}
