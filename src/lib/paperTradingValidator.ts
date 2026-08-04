import { getResolvedPredictions, type StoredPrediction } from './predictionStore';
import { loadRecords, type ExperienceRecord } from './aiExperienceEngine';

// === Paper Trading Validation ===
// Simulates real trading conditions to measure actual trading usefulness.
// Not just prediction accuracy: includes slippage, position sizing, holding periods.

export interface PaperTrade {
  id: string;
  predictionId: string;
  ticker: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  entryDate: number;
  exitDate: number;
  holdingPeriodMs: number;
  grossPnl: number;
  grossPnlPercent: number;
  slippagePaid: number;
  netPnl: number;
  netPnlPercent: number;
  regime: string;
  sessionLabel: string;
  result: string;
  accuracyPercent: number;
  reason: string;
}

export interface PaperTradingStats {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalGrossPnl: number;
  totalNetPnl: number;
  totalSlippage: number;
  avgReturnPerTrade: number;
  sharpeRatio: number;
  maxDrawdown: number;
  profitFactor: number;
  avgHoldingPeriod: number;
  regimeBreakdown: Record<string, { trades: number; wins: number; pnl: number }>;
  monthlyReturns: number[];
}

const POSITION_SIZE = 10000; // $10k per trade (virtual)
const DEFAULT_SLIPPAGE = 0.001; // 0.1% slippage
const MAX_CONCURRENT = 5; // max 5 concurrent positions

// === Simulate a paper trade from a resolved prediction ===
function simulateTrade(
  pred: StoredPrediction,
  index: number,
): PaperTrade | null {
  if (!pred.actualPrice || !pred.entryPrice || pred.entryPrice <= 0) return null;

  const isLong = pred.direction === 'BULLISH';
  const priceChange = (pred.actualPrice - pred.entryPrice) / pred.entryPrice;
  const grossPnlPct = isLong ? priceChange * 100 : -priceChange * 100;
  const slippage = DEFAULT_SLIPPAGE * 2; // entry + exit slippage
  const netPnlPct = grossPnlPct - slippage * 100;
  const quantity = POSITION_SIZE / pred.entryPrice;
  const grossPnl = quantity * (pred.actualPrice - pred.entryPrice) * (isLong ? 1 : -1);
  const netPnl = grossPnl * (1 - DEFAULT_SLIPPAGE * 2);

  const holdingPeriod = pred.resolvedAt
    ? pred.resolvedAt - pred.createdAt
    : 86400000; // default 1 day

  const sessionH = new Date(pred.createdAt).getHours();
  let sessionLabel = 'MIDDAY';
  if (sessionH >= 15) sessionLabel = 'CLOSING';
  else if (sessionH >= 9 && sessionH < 10) sessionLabel = 'OPENING';
  else if (sessionH >= 16) sessionLabel = 'POST_MARKET';
  else if (sessionH < 9) sessionLabel = 'PRE_MARKET';

  return {
    id: `pt-${pred.id}-${index}`,
    predictionId: pred.id,
    ticker: pred.ticker,
    direction: isLong ? 'LONG' : 'SHORT',
    entryPrice: pred.entryPrice,
    exitPrice: pred.actualPrice,
    quantity: Math.round(quantity),
    entryDate: pred.createdAt,
    exitDate: pred.resolvedAt || pred.createdAt + 86400000,
    holdingPeriodMs: holdingPeriod,
    grossPnl: Math.round(grossPnl * 100) / 100,
    grossPnlPercent: parseFloat(grossPnlPct.toFixed(2)),
    slippagePaid: Math.round(grossPnl * DEFAULT_SLIPPAGE * 2 * 100) / 100,
    netPnl: Math.round(netPnl * 100) / 100,
    netPnlPercent: parseFloat(netPnlPct.toFixed(2)),
    regime: pred.regime || 'UNKNOWN',
    sessionLabel,
    result: pred.result || 'UNKNOWN',
    accuracyPercent: pred.accuracyPercent || 0,
    reason: pred.direction === 'BULLISH'
      ? `Long ${pred.ticker} @ $${pred.entryPrice.toFixed(2)} → $${pred.actualPrice.toFixed(2)}`
      : `Short ${pred.ticker} @ $${pred.entryPrice.toFixed(2)} → $${pred.actualPrice.toFixed(2)}`,
  };
}

export function getPaperTrades(predictions?: StoredPrediction[]): PaperTrade[] {
  const resolved = (predictions || getResolvedPredictions())
    .filter(p => p.resolved && p.actualPrice != null && p.entryPrice > 0);
  const trades: PaperTrade[] = [];
  for (let i = 0; i < resolved.length; i++) {
    const trade = simulateTrade(resolved[i], i);
    if (trade) trades.push(trade);
  }
  return trades;
}

// === Compute full paper trading stats ===
export function computePaperTradingStats(predictions?: StoredPrediction[]): PaperTradingStats {
  const resolved = (predictions || getResolvedPredictions())
    .filter(p => p.resolved && p.actualPrice != null && p.entryPrice > 0);

  if (resolved.length === 0) {
    return {
      totalTrades: 0, winningTrades: 0, losingTrades: 0, winRate: 0,
      totalGrossPnl: 0, totalNetPnl: 0, totalSlippage: 0,
      avgReturnPerTrade: 0, sharpeRatio: 0, maxDrawdown: 0,
      profitFactor: 0, avgHoldingPeriod: 0,
      regimeBreakdown: {}, monthlyReturns: [],
    };
  }

  const trades: PaperTrade[] = [];
  for (let i = 0; i < resolved.length; i++) {
    const trade = simulateTrade(resolved[i], i);
    if (trade) trades.push(trade);
  }

  if (trades.length === 0) return emptyStats();

  const winners = trades.filter(t => t.netPnl > 0);
  const losers = trades.filter(t => t.netPnl <= 0);
  const winRate = (winners.length / trades.length) * 100;

  const totalGrossPnl = trades.reduce((s, t) => s + t.grossPnl, 0);
  const totalNetPnl = trades.reduce((s, t) => s + t.netPnl, 0);
  const totalSlippage = trades.reduce((s, t) => s + t.slippagePaid, 0);
  const avgReturnPerTrade = trades.reduce((s, t) => s + t.netPnlPercent, 0) / trades.length;

  // Sharpe ratio (from trade returns)
  const returns = trades.map(t => t.netPnlPercent);
  const meanR = returns.reduce((s, v) => s + v, 0) / returns.length;
  const stdR = returns.length > 1
    ? Math.sqrt(returns.reduce((s, v) => s + (v - meanR) ** 2, 0) / (returns.length - 1))
    : 1;
  const sharpeRatio = stdR > 0 ? (meanR / stdR) * Math.sqrt(252) : 0;

  // Max drawdown (cumulative PnL)
  let cumPnl = 0, peak = 0, maxDd = 0;
  for (const t of trades) {
    cumPnl += t.netPnl;
    if (cumPnl > peak) peak = cumPnl;
    const dd = peak > 0 ? (peak - cumPnl) / peak * 100 : 0;
    if (dd > maxDd) maxDd = dd;
  }

  // Profit factor
  const grossProfit = winners.reduce((s, t) => s + t.netPnl, 0);
  const grossLoss = Math.abs(losers.reduce((s, t) => s + t.netPnl, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;

  // Avg holding period
  const avgHolding = trades.reduce((s, t) => s + t.holdingPeriodMs, 0) / trades.length;

  // Regime breakdown
  const regimeBreakdown: Record<string, { trades: number; wins: number; pnl: number }> = {};
  for (const t of trades) {
    if (!regimeBreakdown[t.regime]) regimeBreakdown[t.regime] = { trades: 0, wins: 0, pnl: 0 };
    regimeBreakdown[t.regime].trades++;
    if (t.netPnl > 0) regimeBreakdown[t.regime].wins++;
    regimeBreakdown[t.regime].pnl += t.netPnl;
  }

  // Monthly returns
  const monthlyMap: Record<string, number> = {};
  for (const t of trades) {
    const d = new Date(t.entryDate);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthlyMap[key] = (monthlyMap[key] || 0) + t.netPnlPercent;
  }
  const monthlyReturns = Object.values(monthlyMap);

  return {
    totalTrades: trades.length,
    winningTrades: winners.length,
    losingTrades: losers.length,
    winRate: parseFloat(winRate.toFixed(1)),
    totalGrossPnl: parseFloat(totalGrossPnl.toFixed(2)),
    totalNetPnl: parseFloat(totalNetPnl.toFixed(2)),
    totalSlippage: parseFloat(totalSlippage.toFixed(2)),
    avgReturnPerTrade: parseFloat(avgReturnPerTrade.toFixed(2)),
    sharpeRatio: parseFloat(sharpeRatio.toFixed(2)),
    maxDrawdown: parseFloat(maxDd.toFixed(2)),
    profitFactor: parseFloat(profitFactor.toFixed(2)),
    avgHoldingPeriod: parseFloat((avgHolding / 3600000).toFixed(1)),
    regimeBreakdown,
    monthlyReturns: monthlyReturns.map(r => parseFloat(r.toFixed(2))),
  };
}

function emptyStats(): PaperTradingStats {
  return {
    totalTrades: 0, winningTrades: 0, losingTrades: 0, winRate: 0,
    totalGrossPnl: 0, totalNetPnl: 0, totalSlippage: 0,
    avgReturnPerTrade: 0, sharpeRatio: 0, maxDrawdown: 0,
    profitFactor: 0, avgHoldingPeriod: 0,
    regimeBreakdown: {}, monthlyReturns: [],
  };
}

// === Simulate trade quality ===
export function assessTradeQuality(trade: PaperTrade): {
  qualityScore: number;
  rating: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
  reasons: string[];
} {
  const reasons: string[] = [];
  let score = 50;

  // PnL contribution
  if (trade.netPnlPercent > 5) { score += 25; reasons.push(`+${trade.netPnlPercent}% return`); }
  else if (trade.netPnlPercent > 2) { score += 15; reasons.push(`+${trade.netPnlPercent}% moderate gain`); }
  else if (trade.netPnlPercent < -5) { score -= 25; reasons.push(`${trade.netPnlPercent}% loss`); }
  else if (trade.netPnlPercent < -2) { score -= 15; reasons.push(`${trade.netPnlPercent}% loss`); }

  // Direction accuracy
  if (trade.result === 'CORRECT') score += 15;
  else if (trade.result === 'PARTIAL') score += 5;
  else score -= 15;

  // Risk-adjusted (shorter holding = better)
  const holdingDays = trade.holdingPeriodMs / 86400000;
  if (holdingDays < 1 && trade.netPnlPercent > 0) score += 10;
  else if (holdingDays > 30) score -= 5;

  // Slippage efficiency
  if (trade.slippagePaid / Math.abs(trade.grossPnl) < 0.01) score += 5;

  const rating = score >= 80 ? 'EXCELLENT' : score >= 60 ? 'GOOD' : score >= 40 ? 'FAIR' : 'POOR';

  return { qualityScore: Math.min(100, Math.max(0, score)), rating, reasons };
}

// === Find most profitable regimes ===
export function getBestPerformingRegimes(stats: PaperTradingStats): string[] {
  return Object.entries(stats.regimeBreakdown)
    .filter(([_, r]) => r.trades >= 3)
    .sort((a, b) => b[1].pnl - a[1].pnl)
    .slice(0, 5)
    .map(([regime]) => regime);
}

export function getWorstPerformingRegimes(stats: PaperTradingStats): string[] {
  return Object.entries(stats.regimeBreakdown)
    .filter(([_, r]) => r.trades >= 3)
    .sort((a, b) => a[1].pnl - b[1].pnl)
    .slice(0, 5)
    .map(([regime]) => regime);
}
