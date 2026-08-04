import { getEngineState } from '@/lib/engineState';
import { fetchQuotesFromYahoo } from '@/lib/quoteFetcher';
import { ensureBackgroundEngine } from '@/lib/ensureEngine';

type SlimQuote = {
  price?: number;
  change?: number | null;
  changePercent?: number | null;
  name?: string;
  prevClose?: number | null;
  priceSource?: string;
  volume?: number | null;
  pe?: number | null;
  bid?: number | null;
  ask?: number | null;
  high?: number;
  low?: number;
  open?: number;
};

function slimQuotesJson(body: string): string {
  try {
    const data = JSON.parse(body) as {
      stocks?: Record<string, Record<string, unknown>>;
      indices?: Record<string, Record<string, unknown>>;
      timestamp?: number;
      serverTime?: number;
      market?: unknown;
      symbolCount?: number;
    };
    const pick = (e: Record<string, unknown>): SlimQuote => ({
      price: e.price as number | undefined,
      change: e.change as number | null | undefined,
      changePercent: e.changePercent as number | null | undefined,
      name: e.name as string | undefined,
      prevClose: e.prevClose as number | null | undefined,
      priceSource: e.priceSource as string | undefined,
      volume: e.volume as number | null | undefined,
      pe: e.pe as number | null | undefined,
      bid: e.bid as number | null | undefined,
      ask: e.ask as number | null | undefined,
      high: e.high as number | undefined,
      low: e.low as number | undefined,
      open: e.open as number | undefined,
    });
    const stocks: Record<string, SlimQuote> = {};
    for (const [k, v] of Object.entries(data.stocks || {})) stocks[k] = pick(v);
    const indices: Record<string, SlimQuote> = {};
    for (const [k, v] of Object.entries(data.indices || {})) indices[k] = pick(v);
    return JSON.stringify({
      stocks,
      indices,
      timestamp: data.timestamp,
      serverTime: data.serverTime,
      market: data.market,
      symbolCount: data.symbolCount,
      lite: true,
    });
  } catch {
    return body;
  }
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type QuoteEntry = {
  price?: number;
  priceSource?: string;
};

type QuotesPayload = {
  stocks?: Record<string, QuoteEntry>;
  indices?: Record<string, QuoteEntry>;
  timestamp?: number;
};

// Module-level cache — always has the last successful response
let lastGoodResponse: string | null = null;
const lastGoodPrices: Record<string, number> = {};
let inflightFetch: Promise<string> | null = null;

function mergeLastGood(body: string): string {
  try {
    const data = JSON.parse(body) as QuotesPayload;
    if (!data.stocks) return body;
    const now = Date.now();
    const needMerge = Object.values(data.stocks).every(s => !s.price || s.price <= 0);
    if (needMerge && Object.keys(lastGoodPrices).length > 0) {
      for (const [sym, entry] of Object.entries(data.stocks)) {
        const lastPrice = lastGoodPrices[sym];
        if (lastPrice && (!entry.price || entry.price <= 0)) {
          entry.price = lastPrice;
          entry.priceSource = 'sticky-cache';
        }
      }
      data.timestamp = now;
      return JSON.stringify(data);
    }
    for (const [sym, entry] of Object.entries(data.stocks)) {
      if (entry.price && entry.price > 0) lastGoodPrices[sym] = entry.price;
    }
    for (const [sym, entry] of Object.entries(data.indices || {})) {
      if (entry?.price && entry.price > 0) lastGoodPrices[sym] = entry.price;
    }
    return body;
  } catch {
    return body;
  }
}

export async function GET(req: Request) {
  ensureBackgroundEngine();
  const lite = new URL(req.url).searchParams.get('lite') === '1';
  const engine = getEngineState();

  if (engine.quotesPayload) {
    const merged = mergeLastGood(engine.quotesPayload);
    lastGoodResponse = merged;
    const body = lite ? slimQuotesJson(merged) : merged;
    return new Response(body, {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'x-source': 'engine',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  }

  try {
    if (!inflightFetch) {
      inflightFetch = (async () => {
        const data = await fetchQuotesFromYahoo();
        const body = JSON.stringify({ ...data, timestamp: Date.now() });
        return mergeLastGood(body);
      })().finally(() => {
        inflightFetch = null;
      });
    }
    const body = await inflightFetch;
    lastGoodResponse = body;
    const out = lite ? slimQuotesJson(body) : body;
    return new Response(out, {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'x-source': 'direct',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (error) {
    if (lastGoodResponse) {
      const stale = lite ? slimQuotesJson(lastGoodResponse) : lastGoodResponse;
      return new Response(stale, {
        status: 200,
        headers: { 'content-type': 'application/json', 'x-source': 'stale-cache' },
      });
    }
    // If we have no cache and fetch fails (e.g. Render IP block), return an empty valid payload instead of 500
    const emptyPayload = {
      stocks: {},
      indices: {},
      timestamp: Date.now(),
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    return new Response(JSON.stringify(emptyPayload), { 
      status: 200, 
      headers: { 'content-type': 'application/json', 'x-source': 'error-fallback' } 
    });
  }
}
