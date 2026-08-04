import {
  INDIAN_EQUITY_TICKERS, isIndianTicker, normalizeTicker,
} from '@/lib/marketConfig';
import type { QuoteData } from '@/lib/MarketDataContext';

export type StockMarket = 'INDIAN' | 'US' | 'FOREIGN' | 'CRYPTO' | 'FOREX';

export function classifyTicker(rawKey: string): { ticker: string; market: StockMarket } | null {
  const ticker = normalizeTicker(rawKey);
  if (isIndianTicker(ticker)) return { ticker, market: 'INDIAN' };
  return { ticker, market: 'INDIAN' };
}

/** Effective display price (last close when market is closed). */
export function quoteDisplayPrice(q: QuoteData | undefined): number {
  if (!q) return 0;
  if (q.price > 0) return q.price;
  if (q.prevClose > 0) return q.prevClose;
  return 0;
}

export function hasQuoteData(q: QuoteData | undefined): boolean {
  return quoteDisplayPrice(q) > 0;
}

/** Merge duplicate Yahoo/plain keys into one normalized map. */
export function normalizeStocksMap(stocks: Record<string, QuoteData>): Record<string, QuoteData> {
  const out: Record<string, QuoteData> = {};
  for (const [key, data] of Object.entries(stocks)) {
    const ticker = classifyTicker(key)?.ticker ?? normalizeTicker(key);
    const existing = out[ticker];
    const price = quoteDisplayPrice(data);
    const existingPrice = quoteDisplayPrice(existing);
    if (!existing || price > existingPrice) {
      out[ticker] = price > 0 && data.price <= 0 ? { ...data, price } : data;
    }
  }
  return out;
}

const _listedTickerMap = new Map<string, { ticker: string; market: StockMarket }>();
for (const t of INDIAN_EQUITY_TICKERS) _listedTickerMap.set(t, { ticker: t, market: 'INDIAN' });
export const ALL_LISTED_TICKERS = [..._listedTickerMap.values()];

export function countPricedStocks(stocks: Record<string, QuoteData>): number {
  const norm = normalizeStocksMap(stocks);
  return Object.values(norm).filter(hasQuoteData).length;
}
