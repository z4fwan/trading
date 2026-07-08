import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

let lastCues: string | null = null;
let lastFetch = 0;
const CACHE_TTL = 30_000;

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
      usClose: spChange != null ? parseFloat(spChange.toFixed(2)) : 0.5,
      asianMarkets: nikkei != null ? parseFloat(nikkei.toFixed(2)) : 0.3,
      giftNifty: (giftNifty != null && nifty != null) ? parseFloat((((giftNifty - nifty) / nifty) * 100).toFixed(2)) : 0.2,
      vix: vix ?? 15,
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
      usClose: 0.5, asianMarkets: 0.3, giftNifty: 0.2, vix: 15,
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
