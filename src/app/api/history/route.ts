import YahooFinance from 'yahoo-finance2';
import { type OHLC } from '@/lib/technicalAnalysis';

const yahooFinance = new YahooFinance();

const cache = new Map<string, { data: unknown; expiry: number }>();
const CACHE_TTL_MS = 300_000; // 5 minutes

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol') || '';
  if (!symbol) {
    return Response.json({ error: 'symbol parameter is required' }, { status: 400 });
  }
  const interval = searchParams.get('interval') || '1d';
  const cacheKey = `${symbol}:${interval}`;

  const cached = cache.get(cacheKey);
  if (cached && cached.expiry > Date.now()) {
    return Response.json(cached.data);
  }

  try {
    const now = new Date();
    const periodMap: Record<string, number> = { '1m': 0.02, '5m': 0.05, '15m': 0.1, '1h': 0.5, '4h': 1, '1d': 2, '1wk': 5, '1mo': 10 };
    const yearsBack = periodMap[interval] || 2;
    const period1 = new Date(now);
    period1.setFullYear(period1.getFullYear() - yearsBack);

    const intervalAliases: Record<string, string> = { '4h': '1h' };
    const normalized = intervalAliases[interval] ?? interval;
    const validIntervals = ['1d', '1wk', '1mo', '1m', '5m', '15m', '1h'];
    const yahooInterval = validIntervals.includes(normalized) ? normalized : '1d';

    const result = await yahooFinance.chart(symbol, {
      period1,
      period2: now,
      interval: yahooInterval as "1m" | "2m" | "5m" | "15m" | "30m" | "60m" | "90m" | "1h" | "1d" | "5d" | "1wk" | "1mo" | "3mo",
      return: 'array',
    });

    const candles: OHLC[] = [];
    for (const q of result.quotes) {
      if (q.open != null && q.high != null && q.low != null && q.close != null && q.volume != null && q.date != null) {
        candles.push({
          date: Math.floor(q.date.getTime() / 1000),
          open: q.open,
          high: q.high,
          low: q.low,
          close: q.close,
          volume: q.volume,
        });
      }
    }

    const payload = { symbol, candles, count: candles.length, timestamp: Date.now() };
    cache.set(cacheKey, { data: payload, expiry: Date.now() + CACHE_TTL_MS });
    return Response.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.warn('[history]', symbol, message);
    const payload = { symbol, candles: [] as OHLC[], count: 0, timestamp: Date.now(), warning: message };
    cache.set(cacheKey, { data: payload, expiry: Date.now() + CACHE_TTL_MS });
    return Response.json(payload);
  }
}
