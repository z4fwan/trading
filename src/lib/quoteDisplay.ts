import { INDIAN_EQUITY_TICKERS, INTERNATIONAL_TICKERS, isIndianTicker, yahooToTicker } from '@/lib/marketConfig';
import type { QuoteData } from '@/lib/MarketDataContext';

export type StockMarket = 'INDIAN' | 'INTERNATIONAL';

export function classifyTicker(rawKey: string): { ticker: string; market: StockMarket } | null {
  const ticker = yahooToTicker(rawKey);
  if (isIndianTicker(ticker)) return { ticker, market: 'INDIAN' };
  if (INTERNATIONAL_TICKERS.includes(ticker)) return { ticker, market: 'INTERNATIONAL' };
  return null;
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
    const ticker = classifyTicker(key)?.ticker ?? yahooToTicker(key);
    const existing = out[ticker];
    const price = quoteDisplayPrice(data);
    const existingPrice = quoteDisplayPrice(existing);
    if (!existing || price > existingPrice) {
      out[ticker] = price > 0 && data.price <= 0 ? { ...data, price } : data;
    }
  }
  return out;
}

export const ALL_LISTED_TICKERS: { ticker: string; market: StockMarket }[] = [
  ...INDIAN_EQUITY_TICKERS.map(ticker => ({ ticker, market: 'INDIAN' as const })),
  ...INTERNATIONAL_TICKERS.map(ticker => ({ ticker, market: 'INTERNATIONAL' as const })),
];

export function countPricedStocks(stocks: Record<string, QuoteData>): number {
  const norm = normalizeStocksMap(stocks);
  return Object.values(norm).filter(hasQuoteData).length;
}
