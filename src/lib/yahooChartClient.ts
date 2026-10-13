/**
 * Minimal Yahoo v8 chart API client.
 *
 * The v8 chart endpoint is the one source that works reliably from Render's
 * datacenter IPs (v7 quote is 401, yahoo-finance2 is 429/crumb-blocked). All
 * history / intraday fetches that previously used yahoo-finance2 should route
 * through these helpers so the engine can actually build models and backtests
 * in production.
 */

export interface OHLCBar {
  date: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const HOST = 'https://query1.finance.yahoo.com/v8/finance/chart/';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

interface ChartResponse {
  chart?: {
    result?: Array<{
      meta?: Record<string, unknown>;
      timestamp?: Array<number | null>;
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
    }>;
    error?: { code?: string; description?: string };
  };
}

/** Fetch OHLC for `range`/`interval`. Returns bars oldest→newest, null on failure. */
export async function fetchChartBars(
  symbol: string,
  range: string,
  interval: string,
  timeoutMs = 12000,
): Promise<OHLCBar[] | null> {
  const url = `${HOST}${encodeURIComponent(symbol)}?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  let j: ChartResponse;
  try {
    j = await res.json();
  } catch {
    return null;
  }
  const result = j?.chart?.result?.[0];
  if (!result || j?.chart?.error) return null;
  const ts = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0];
  if (!quote) return null;
  const opens = quote.open ?? [];
  const highs = quote.high ?? [];
  const lows = quote.low ?? [];
  const closes = quote.close ?? [];
  const volumes = quote.volume ?? [];

  const bars: OHLCBar[] = [];
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i];
    const o = opens[i];
    const h = highs[i];
    const l = lows[i];
    const c = closes[i];
    const v = volumes[i];
    if (t == null || o == null || h == null || l == null || c == null || v == null) continue;
    if (!Number.isFinite(o) || !Number.isFinite(h) || !Number.isFinite(l) || !Number.isFinite(c) || !Number.isFinite(v)) continue;
    bars.push({ date: t, open: o, high: h, low: l, close: c, volume: v });
  }
  return bars.length > 0 ? bars : null;
}

/** ~2 years of daily candles (enough for indicator windows + model training). */
export function fetchDailyHistory(symbol: string): Promise<OHLCBar[] | null> {
  return fetchChartBars(symbol, '2y', '1d');
}

/** 1 day of 15-minute candles (intraday scanning / watchdog). */
export function fetchIntraday15m(symbol: string): Promise<OHLCBar[] | null> {
  return fetchChartBars(symbol, '1d', '15m');
}

const SPARK_HOST = 'https://query1.finance.yahoo.com/v7/finance/spark';
const SPARK_CHUNK = 120;

/**
 * One-request bulk price lookup via the spark feed (same host as v8 chart, so
 * it works from Render). Returns a map of the given symbols → current price.
 */
export async function fetchSparkPrices(symbols: string[]): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};
  const unique = [...new Set(symbols.filter(Boolean))];
  for (let i = 0; i < unique.length; i += SPARK_CHUNK) {
    const chunk = unique.slice(i, i + SPARK_CHUNK);
    try {
      const url = `${SPARK_HOST}?symbols=${encodeURIComponent(chunk.join(','))}&range=1d&interval=1d`;
      const res = await fetch(url, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(9000),
        cache: 'no-store',
      });
      if (!res.ok) continue;
      const j = await res.json();
      const rows = j?.spark?.result ?? [];
      for (const row of rows) {
        const sym = row?.symbol;
        const meta = row?.response?.[0]?.meta;
        if (!sym || !meta) continue;
        const price = meta.regularMarketPrice ?? meta.chartPreviousClose;
        if (typeof price === 'number' && price > 0) prices[sym] = price;
      }
    } catch {
      /* skip chunk */
    }
    if (i + SPARK_CHUNK < unique.length) await new Promise(r => setTimeout(r, 100));
  }
  return prices;
}