/**
 * Risk Management Engine — VaR, correlation analysis, Kelly criterion, drawdown protection.
 * Institutional-grade risk analytics for portfolio construction.
 */

interface Position {
  ticker: string;
  weight: number; // 0-1 portfolio weight
  price: number;
  returns: number[]; // historical daily returns
}

interface PortfolioRiskMetrics {
  valueAtRisk95: number; // 95% VaR (1-day)
  valueAtRisk99: number; // 99% VaR (1-day)
  conditionalVaR: number; // Expected Shortfall (CVaR)
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  volatility: number;
  beta: number; // vs market
  correlationMatrix: Record<string, Record<string, number>>;
  kellyOptimal: number; // Kelly criterion optimal fraction
  halfKelly: number; // Half-Kelly (conservative)
  diversificationRatio: number;
  trackingError?: number;
}

const riskCache = new Map<string, { metrics: PortfolioRiskMetrics; computedAt: number }>();
const RISK_TTL = 30 * 60 * 1000; // 30 min

function calculateVaR(returns: number[], confidence: number): number {
  const sorted = [...returns].sort((a, b) => a - b);
  const idx = Math.floor((1 - confidence) * sorted.length);
  return -sorted[Math.max(0, idx)];
}

function calculateCVaR(returns: number[], confidence: number): number {
  const sorted = [...returns].sort((a, b) => a - b);
  const cutoff = Math.floor((1 - confidence) * sorted.length);
  const tail = sorted.slice(0, Math.max(1, cutoff));
  return -tail.reduce((s, r) => s + r, 0) / tail.length;
}

function calculateSharpe(returns: number[], riskFreeRate = 0.05 / 252): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
  const std = Math.sqrt(variance);
  return std > 0 ? (mean - riskFreeRate) / std * Math.sqrt(252) : 0;
}

function calculateSortino(returns: number[], riskFreeRate = 0.05 / 252): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const downsideReturns = returns.filter(r => r < riskFreeRate);
  if (downsideReturns.length === 0) return 10;
  const downsideVariance = downsideReturns.reduce((s, r) => s + (r - riskFreeRate) ** 2, 0) / downsideReturns.length;
  const downsideStd = Math.sqrt(downsideVariance);
  return downsideStd > 0 ? (mean - riskFreeRate) / downsideStd * Math.sqrt(252) : 0;
}

function calculateMaxDrawdown(returns: number[]): number {
  let equity = 1;
  let peak = 1;
  let maxDD = 0;
  for (const r of returns) {
    equity *= (1 + r);
    peak = Math.max(peak, equity);
    const dd = (peak - equity) / peak;
    maxDD = Math.max(maxDD, dd);
  }
  return maxDD;
}

function calculateCorrelation(returnsA: number[], returnsB: number[]): number {
  const n = Math.min(returnsA.length, returnsB.length);
  if (n < 10) return 0;
  const a = returnsA.slice(-n);
  const b = returnsB.slice(-n);
  const meanA = a.reduce((s, r) => s + r, 0) / n;
  const meanB = b.reduce((s, r) => s + r, 0) / n;
  let cov = 0, varA = 0, varB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    cov += da * db;
    varA += da * da;
    varB += db * db;
  }
  const denom = Math.sqrt(varA * varB);
  return denom > 0 ? cov / denom : 0;
}

function calculateBeta(returns: number[], marketReturns: number[]): number {
  const n = Math.min(returns.length, marketReturns.length);
  if (n < 30) return 1;
  const r = returns.slice(-n);
  const m = marketReturns.slice(-n);
  const meanR = r.reduce((s, v) => s + v, 0) / n;
  const meanM = m.reduce((s, v) => s + v, 0) / n;
  let cov = 0, varM = 0;
  for (let i = 0; i < n; i++) {
    cov += (r[i] - meanR) * (m[i] - meanM);
    varM += (m[i] - meanM) ** 2;
  }
  return varM > 0 ? cov / varM : 1;
}

/**
 * Kelly Criterion: optimal fraction of bankroll to bet.
 * f* = (bp - q) / b where b=odds, p=win prob, q=1-p
 */
function calculateKelly(winRate: number, avgWin: number, avgLoss: number): number {
  if (avgLoss === 0 || winRate === 0 || winRate === 1) return 0;
  const b = avgWin / Math.abs(avgLoss);
  const p = winRate;
  const q = 1 - p;
  const kelly = (b * p - q) / b;
  return Math.max(0, Math.min(0.5, kelly)); // Cap at 50%
}

/**
 * Full portfolio risk analysis.
 */
export function analyzePortfolioRisk(
  positions: Position[],
  marketReturns?: number[],
): PortfolioRiskMetrics {
  // Portfolio returns (weighted sum)
  const maxLen = Math.max(...positions.map(p => p.returns.length), 1);
  const portfolioReturns: number[] = [];
  for (let i = 0; i < maxLen; i++) {
    let portReturn = 0;
    for (const pos of positions) {
      const r = pos.returns[pos.returns.length - 1 - (maxLen - 1 - i)] || 0;
      portReturn += pos.weight * r;
    }
    portfolioReturns.push(portReturn);
  }

  // Correlation matrix
  const correlationMatrix: Record<string, Record<string, number>> = {};
  for (const posA of positions) {
    correlationMatrix[posA.ticker] = {};
    for (const posB of positions) {
      correlationMatrix[posA.ticker][posB.ticker] = calculateCorrelation(posA.returns, posB.returns);
    }
  }

  // Volatility
  const mean = portfolioReturns.reduce((s, r) => s + r, 0) / portfolioReturns.length;
  const variance = portfolioReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / portfolioReturns.length;
  const volatility = Math.sqrt(variance) * Math.sqrt(252);

  // Diversification ratio
  const individualVols = positions.map(p => {
    const m = p.returns.reduce((s, r) => s + r, 0) / p.returns.length;
    const v = p.returns.reduce((s, r) => s + (r - m) ** 2, 0) / p.returns.length;
    return Math.sqrt(v) * Math.sqrt(252);
  });
  const weightedAvgVol = positions.reduce((s, p, i) => s + p.weight * individualVols[i], 0);
  const diversificationRatio = volatility > 0 ? weightedAvgVol / volatility : 1;

  // Kelly
  const wins = portfolioReturns.filter(r => r > 0);
  const losses = portfolioReturns.filter(r => r < 0);
  const winRate = wins.length / Math.max(1, portfolioReturns.length);
  const avgWin = wins.length > 0 ? wins.reduce((s, r) => s + r, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((s, r) => s + r, 0) / losses.length : -0.01;
  const kellyOptimal = calculateKelly(winRate, avgWin, avgLoss);

  // Beta
  const beta = marketReturns ? calculateBeta(portfolioReturns, marketReturns) : 1;

  return {
    valueAtRisk95: calculateVaR(portfolioReturns, 0.95),
    valueAtRisk99: calculateVaR(portfolioReturns, 0.99),
    conditionalVaR: calculateCVaR(portfolioReturns, 0.95),
    sharpeRatio: calculateSharpe(portfolioReturns),
    sortinoRatio: calculateSortino(portfolioReturns),
    maxDrawdown: calculateMaxDrawdown(portfolioReturns),
    volatility,
    beta,
    correlationMatrix,
    kellyOptimal,
    halfKelly: kellyOptimal / 2,
    diversificationRatio,
  };
}

/**
 * Calculate optimal position size using Kelly + risk constraints.
 */
export function calculatePositionSize(
  winRate: number,
  avgWin: number,
  avgLoss: number,
  maxRiskPct = 0.02, // 2% max risk per trade
  bankroll = 100000,
): { kellyFraction: number; positionSize: number; riskAmount: number } {
  const kelly = calculateKelly(winRate, avgWin, avgLoss);
  const halfKelly = kelly / 2; // Conservative
  const riskAmount = bankroll * maxRiskPct;
  const positionSize = bankroll * halfKelly;

  return {
    kellyFraction: kelly,
    positionSize: Math.min(positionSize, riskAmount / Math.abs(avgLoss || 0.01)),
    riskAmount,
  };
}

/**
 * Quick risk check — should we take this trade?
 */
export function riskGateCheck(
  currentDrawdown: number,
  portfolioVolatility: number,
  newTradeVolatility: number,
  maxDrawdownLimit = 0.15,
  maxVolLimit = 0.30,
): { approved: boolean; reason: string } {
  if (currentDrawdown > maxDrawdownLimit) {
    return { approved: false, reason: `Drawdown ${currentDrawdown.toFixed(1)}% exceeds limit ${maxDrawdownLimit.toFixed(1)}%` };
  }
  if (portfolioVolatility > maxVolLimit) {
    return { approved: false, reason: `Portfolio vol ${portfolioVolatility.toFixed(1)}% exceeds limit ${maxVolLimit.toFixed(1)}%` };
  }
  if (newTradeVolatility > 0.5) {
    return { approved: false, reason: `Trade vol ${newTradeVolatility.toFixed(1)}% too high` };
  }
  return { approved: true, reason: 'OK' };
}
