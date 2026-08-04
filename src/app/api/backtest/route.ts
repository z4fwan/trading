import { NextRequest } from 'next/server';
import { runBacktest, runMultiTickerBacktest } from '@/lib/backtestingEngine';
import { getCachedHistory, prefetchHistoryBatch } from '@/lib/backgroundEngine';
import { INDIAN_EQUITY_TICKERS } from '@/lib/marketConfig';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface BacktestBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function ohlcToBar(candles: ReturnType<typeof getCachedHistory> extends infer T ? NonNullable<T> : never): BacktestBar[] {
  return candles
    .filter(c => c.date)
    .map(c => ({
      date: new Date((c.date as number) * 1000).toISOString().split('T')[0],
      open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume,
    }));
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker');
  const strategy = searchParams.get('strategy') as 'SMA_CROSSOVER' | 'RSI_REVERSION' | 'MOMENTUM' | 'ALL' | null;

  if (ticker) {
    const hist = getCachedHistory(ticker.toUpperCase());
    if (!hist || hist.length < 60) {
      return Response.json({ ticker: ticker.toUpperCase(), error: 'Insufficient cached history (need 60+ candles)', candlesAvailable: hist?.length || 0 });
    }
    try {
      const bars = ohlcToBar(hist as any);
      const results = runBacktest(ticker.toUpperCase(), bars, strategy || 'ALL');
      return Response.json({ ticker: ticker.toUpperCase(), results, candlesUsed: bars.length });
    } catch (e) {
      return Response.json({ ticker: ticker.toUpperCase(), error: String(e) });
    }
  }

  // Bulk backtest on top tickers
  const topTickers = INDIAN_EQUITY_TICKERS.slice(0, 20);
  await prefetchHistoryBatch(topTickers);
  
  const tickerBarsMap = new Map<string, BacktestBar[]>();
  for (const t of topTickers) {
    const hist = getCachedHistory(t);
    if (hist && hist.length > 60) {
      tickerBarsMap.set(t, ohlcToBar(hist as any));
    }
  }

  if (tickerBarsMap.size === 0) {
    return Response.json({ error: 'No cached history available', tickersChecked: topTickers.length });
  }

  try {
    const results = runMultiTickerBacktest(tickerBarsMap, strategy || 'ALL');
    const byStrategy = new Map<string, { winRate: number; totalTrades: number; avgReturn: number; sharpe: number; bestTicker: string }>();
    for (const r of results) {
      const existing = byStrategy.get(r.strategy) || { winRate: 0, totalTrades: 0, avgReturn: 0, sharpe: 0, bestTicker: '' };
      existing.totalTrades += r.totalTrades;
      existing.winRate = (existing.winRate * (existing.totalTrades - r.totalTrades) + r.winRate * r.totalTrades) / existing.totalTrades;
      existing.avgReturn = (existing.avgReturn * (existing.totalTrades - r.totalTrades) + r.avgReturn * r.totalTrades) / existing.totalTrades;
      existing.sharpe = Math.max(existing.sharpe, r.sharpeRatio);
      if (r.winRate > (byStrategy.get(r.strategy)?.winRate || 0)) existing.bestTicker = r.ticker;
      byStrategy.set(r.strategy, existing);
    }
    return Response.json({ strategies: Object.fromEntries(byStrategy), tickersBacktested: tickerBarsMap.size, totalResults: results.length });
  } catch (e) {
    return Response.json({ error: String(e) });
  }
}
