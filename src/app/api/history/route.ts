import YahooFinance from 'yahoo-finance2';
import { type OHLC } from '@/lib/technicalAnalysis';

const yahooFinance = new YahooFinance({ validation: { logErrors: false } });


const cache = new Map<string, { data: unknown; expiry: number }>();
const CACHE_TTL_MS = 60_000; // 1 minute

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol') || '';
  if (!symbol) {
    return Response.json({ error: 'symbol parameter is required' }, { status: 400 });
  }
  const interval = searchParams.get('interval') || '1d';
  const range = searchParams.get('range');
  const cacheKey = `${symbol}:${interval}:${range || 'default'}`;

  const cached = cache.get(cacheKey);
  if (cached && cached.expiry > Date.now()) {
    return Response.json(cached.data);
  }

  try {
    const intervalAliases: Record<string, string> = { '4h': '1h' };
    const normalized = intervalAliases[interval] ?? interval;
    const validIntervals = ['1d', '1wk', '1mo', '1m', '5m', '15m', '1h'];
    const yahooInterval = validIntervals.includes(normalized) ? normalized : '1d';

    const now = new Date();
    const periodDays: Record<string, number> = { '1m': 7, '5m': 18, '15m': 36, '1h': 182, '4h': 365, '1d': 730, '1wk': 1825, '1mo': 3650 };
    const rangeDays: Record<string, number> = { '1d': 1, '5d': 5, '1mo': 30, '3mo': 90, '6mo': 180, '1y': 365, '2y': 730, '5y': 1825, '10y': 3650, 'max': 7300 };
    const minDaysBack = periodDays[interval] ?? 730;
    const daysBack = Math.max(range ? (rangeDays[range] ?? minDaysBack) : minDaysBack, minDaysBack);

    const queryOptions: any = {
      interval: yahooInterval as "1m" | "2m" | "5m" | "15m" | "30m" | "60m" | "90m" | "1h" | "1d" | "5d" | "1wk" | "1mo" | "3mo",
      return: 'array',
      period1: new Date(now.getTime() - daysBack * 86_400_000),
      period2: now,
    };

    const result: any = await yahooFinance.chart(symbol, queryOptions);

    const candles: OHLC[] = [];
    for (const q of result.quotes ?? []) {
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
    // Don't cache errors — let the next retry hit Yahoo fresh
    return Response.json(payload);
  }
}
