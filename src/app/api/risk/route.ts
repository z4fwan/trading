import { NextRequest } from 'next/server';
import { analyzePortfolioRisk, calculatePositionSize, riskGateCheck } from '@/lib/riskManagement';
import { getCachedHistory } from '@/lib/backgroundEngine';
import { INDIAN_EQUITY_TICKERS } from '@/lib/marketConfig';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

let lastRiskResult: any = null;
let lastComputedAt = 0;
const RISK_TTL = 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  if (lastRiskResult && Date.now() - lastComputedAt < RISK_TTL && !action) {
    return Response.json({ ...lastRiskResult, cached: true });
  }

  const topTickers = INDIAN_EQUITY_TICKERS.slice(0, 20);
  const positions: Array<{ ticker: string; weight: number; price: number; returns: number[] }> = [];
  const equalWeight = 1 / topTickers.length;

  for (const t of topTickers) {
    const hist = getCachedHistory(t);
    if (!hist || hist.length < 30) continue;
    const closes = hist.map(c => c.close);
    const returns: number[] = [];
    for (let i = 1; i < closes.length; i++) {
      returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
    }
    positions.push({ ticker: t, weight: equalWeight, price: closes[closes.length - 1], returns });
  }

  if (positions.length < 5) {
    return Response.json({ error: 'Insufficient positions (need 5+ with cached history)', available: positions.length });
  }

  try {
    const risk = analyzePortfolioRisk(positions);
    const riskGate = riskGateCheck(risk.maxDrawdown, risk.volatility, 0.25);
    const positionSizes = positions.map(p => {
      const wins = p.returns.filter(r => r > 0);
      const losses = p.returns.filter(r => r < 0);
      const winRate = wins.length / Math.max(1, p.returns.length);
      const avgWin = wins.length > 0 ? wins.reduce((s, r) => s + r, 0) / wins.length : 0;
      const avgLoss = losses.length > 0 ? losses.reduce((s, r) => s + r, 0) / losses.length : -0.01;
      const sizing = calculatePositionSize(winRate, avgWin, avgLoss);
      return { ticker: p.ticker, kelly: sizing.kellyFraction, positionSize: sizing.positionSize, riskAmount: sizing.riskAmount };
    });

    const result = {
      positions: positions.map(p => ({ ticker: p.ticker, weight: p.weight, price: p.price })),
      risk: {
        valueAtRisk95: risk.valueAtRisk95,
        valueAtRisk99: risk.valueAtRisk99,
        conditionalVaR: risk.conditionalVaR,
        sharpeRatio: risk.sharpeRatio,
        sortinoRatio: risk.sortinoRatio,
        maxDrawdown: risk.maxDrawdown,
        volatility: risk.volatility,
        beta: risk.beta,
        kellyOptimal: risk.kellyOptimal,
        halfKelly: risk.halfKelly,
        diversificationRatio: risk.diversificationRatio,
      },
      riskGate,
      positionSizes,
      computedAt: Date.now(),
    };

    lastRiskResult = result;
    lastComputedAt = Date.now();
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: String(e) });
  }
}
