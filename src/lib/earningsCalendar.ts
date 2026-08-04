/**
 * US Earnings Calendar Fetcher — tracks upcoming earnings dates for S&P 500 / major US stocks.
 * Uses Yahoo Finance API (free, no key required).
 */

interface EarningsEvent {
  ticker: string;
  earningsDate: number; // Unix timestamp (seconds)
  earningsDateStr: string; // YYYY-MM-DD
  daysUntil: number;
  isThisWeek: boolean;
  estimatedEPS?: number;
  actualEPS?: number;
  surprise?: number;
}

const earningsCache = new Map<string, { events: EarningsEvent[]; fetchedAt: number }>();
const EARNINGS_TTL = 4 * 60 * 60 * 1000; // 4 hours

export async function fetchEarningsCalendar(tickers: string[]): Promise<EarningsEvent[]> {
  const now = Date.now();
  const results: EarningsEvent[] = [];
  const uncachedTickers: string[] = [];

  // Check cache first
  for (const ticker of tickers) {
    const cached = earningsCache.get(ticker);
    if (cached && now - cached.fetchedAt < EARNINGS_TTL) {
      results.push(...cached.events);
    } else {
      uncachedTickers.push(ticker);
    }
  }

  if (uncachedTickers.length === 0) return results;

  // Batch fetch earnings from Yahoo Finance
  // Yahoo returns earnings data via the quoteSummary endpoint
  for (let i = 0; i < uncachedTickers.length; i += 20) {
    const batch = uncachedTickers.slice(i, i + 20);
    const symbols = batch.join(',');

    try {
      const url = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${symbols}&fields=earningsTimestamp,earningsTimestampStart,earningsTimestampForward,epsForward,earningsPerShare`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;

      const data = await res.json();
      const quotes = data?.quoteResponse?.result || [];

      for (const q of quotes) {
        const ticker = q.symbol;
        const earningsTs = q.earningsTimestamp || q.earningsTimestampStart;
        if (!earningsTs) continue;

        const earningsDate = new Date(earningsTs * 1000);
        const daysUntil = Math.round((earningsDate.getTime() - now) / (1000 * 60 * 60 * 24));
        const isThisWeek = daysUntil >= 0 && daysUntil <= 7;

        const event: EarningsEvent = {
          ticker,
          earningsDate: earningsTs,
          earningsDateStr: earningsDate.toISOString().split('T')[0],
          daysUntil,
          isThisWeek,
          estimatedEPS: q.epsForward || undefined,
        };

        results.push(event);

        // Cache individually
        const existing = earningsCache.get(ticker);
        const events = existing ? [...existing.events.filter(e => e.earningsDate !== earningsTs), event] : [event];
        earningsCache.set(ticker, { events, fetchedAt: now });
      }
    } catch {
      // Non-fatal
    }

    if (i + 20 < uncachedTickers.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  return results;
}

/**
 * Get upcoming earnings events within N days.
 */
export async function getUpcomingEarnings(tickers: string[], withinDays = 14): Promise<EarningsEvent[]> {
  const all = await fetchEarningsCalendar(tickers);
  return all
    .filter(e => e.daysUntil >= 0 && e.daysUntil <= withinDays)
    .sort((a, b) => a.daysUntil - b.daysUntil);
}

/**
 * Get earnings events happening this week.
 */
export async function getThisWeekEarnings(tickers: string[]): Promise<EarningsEvent[]> {
  return getUpcomingEarnings(tickers, 7);
}

/**
 * Check if a specific ticker has earnings coming up soon.
 */
export async function hasEarningsSoon(ticker: string, withinDays = 5): Promise<boolean> {
  const events = await getUpcomingEarnings([ticker], withinDays);
  return events.length > 0;
}

export function getEarningsCacheStats(): { cachedTickers: number; totalEvents: number } {
  let total = 0;
  for (const { events } of earningsCache.values()) total += events.length;
  return { cachedTickers: earningsCache.size, totalEvents: total };
}
