import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

let lastCues: string | null = null;
let lastFetch = 0;
const CACHE_TTL = 15_000;

export async function GET() {
  const now = Date.now();
  if (lastCues && now - lastFetch < CACHE_TTL) {
    return new Response(lastCues, {
      status: 200,
      headers: { 'content-type': 'application/json', 'x-source': 'cache' },
    });
  }

  try {
    const [sp500, nifty, giftNifty, spChange, nikkei, vix] = await Promise.all([
      fetch('https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?range=1d&interval=1m', {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      }).then(r => r.json()).then(d => d?.chart?.result?.[0]?.meta?.regularMarketPrice ?? null).catch(() => null),
      fetch('https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI?range=1d&interval=1m', {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      }).then(r => r.json()).then(d => d?.chart?.result?.[0]?.meta?.previousClose ?? null).catch(() => null),
      fetch('https://query1.finance.yahoo.com/v8/finance/chart/NIFTY%3DH?range=1d&interval=1m', {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      }).then(r => r.json()).then(d => d?.chart?.result?.[0]?.meta?.regularMarketPrice ?? null).catch(() => null),
      fetch('https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?range=5d&interval=1d', {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      }).then(r => r.json()).then(d => {
        const prices = d?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
        if (prices?.length >= 2) return ((prices[prices.length - 1] - prices[prices.length - 2]) / prices[prices.length - 2]) * 100;
        return null;
      }).catch(() => null),
      fetch('https://query1.finance.yahoo.com/v8/finance/chart/%5EN225?range=5d&interval=1d', {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      }).then(r => r.json()).then(d => {
        const prices = d?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
        if (prices?.length >= 2) return ((prices[prices.length - 1] - prices[prices.length - 2]) / prices[prices.length - 2]) * 100;
        return null;
      }).catch(() => null),
      fetch('https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?range=1d&interval=1m', {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      }).then(r => r.json()).then(d => d?.chart?.result?.[0]?.meta?.regularMarketPrice ?? null).catch(() => null),
    ]);

    const payload = JSON.stringify({
      usClose: spChange != null ? parseFloat(spChange.toFixed(2)) : null,
      asianMarkets: nikkei != null ? parseFloat(nikkei.toFixed(2)) : null,
      giftNifty: (giftNifty != null && nifty != null) ? parseFloat((((giftNifty - nifty) / nifty) * 100).toFixed(2)) : null,
      vix: vix ?? null,
      timestamp: Date.now(),
      usMarketStatus: sp500 ? 'CLOSED' : 'UNKNOWN',
      asianMarketStatus: nikkei ? 'OPEN' : 'UNKNOWN',
      _live: sp500 != null || nifty != null,
    });

    lastCues = payload;
    lastFetch = Date.now();
    return new Response(payload, {
      status: 200,
      headers: { 'content-type': 'application/json', 'x-source': 'live' },
    });
  } catch {
    const fallback = JSON.stringify({
      usClose: null, asianMarkets: null, giftNifty: null, vix: null,
      timestamp: Date.now(), usMarketStatus: 'UNKNOWN', asianMarketStatus: 'UNKNOWN', _live: false,
    });
    lastCues = fallback;
    lastFetch = Date.now();
    return new Response(fallback, {
      status: 200,
      headers: { 'content-type': 'application/json', 'x-source': 'fallback' },
    });
  }
}
