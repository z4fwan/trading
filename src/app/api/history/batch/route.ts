import YahooFinance from 'yahoo-finance2';
import { type OHLC } from '@/lib/technicalAnalysis';

const yahooFinance = new YahooFinance();

const cache = new Map<string, { data: unknown; expiry: number }>();
const CACHE_TTL_MS = 300_000;

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbolsParam = searchParams.get('symbols') || '';
  const symbols = symbolsParam.split(',').map(s => s.trim()).filter(Boolean);
  if (symbols.length === 0 || symbols.length > 50) {
    return Response.json({ error: 'Provide 1-50 comma-separated symbols' }, { status: 400 });
  }

  const interval = searchParams.get('interval') || '1d';
  const now = new Date();
  const periodMap: Record<string, number> = { '1d': 2, '1wk': 5, '1mo': 10 };
  const yearsBack = periodMap[interval] || 2;
  const period1 = new Date(now);
  period1.setFullYear(period1.getFullYear() - yearsBack);

  const intervalAliases: Record<string, string> = { '4h': '1h' };
  const normalized = intervalAliases[interval] ?? interval;
  const validIntervals = ['1d', '1wk', '1mo', '1m', '5m', '15m', '1h'];
  const yahooInterval = validIntervals.includes(normalized) ? normalized : '1d';

  const results: Record<string, { candles: OHLC[]; count: number }> = {};

  await Promise.allSettled(symbols.map(async (symbol) => {
    const cacheKey = `${symbol}:${interval}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      results[symbol] = { candles: (cached.data as { candles: OHLC[] }).candles, count: (cached.data as { candles: OHLC[] }).candles.length };
      return;
    }
    try {
      const result = await yahooFinance.chart(symbol, {
        period1, period2: now,
        interval: yahooInterval as '1d' | '1wk' | '1mo' | '1m' | '5m' | '15m' | '1h',
        return: 'array',
      });
      const candles: OHLC[] = [];
      for (const q of result.quotes) {
        if (q.open != null && q.high != null && q.low != null && q.close != null && q.volume != null && q.date != null) {
          candles.push({ date: Math.floor(q.date.getTime() / 1000), open: q.open, high: q.high, low: q.low, close: q.close, volume: q.volume });
        }
      }
      const payload = { symbol, candles, count: candles.length, timestamp: Date.now() };
      cache.set(cacheKey, { data: payload, expiry: Date.now() + CACHE_TTL_MS });
      results[symbol] = { candles, count: candles.length };
    } catch { results[symbol] = { candles: [], count: 0 }; }
  }));

  return Response.json({ results, timestamp: Date.now() });
}
