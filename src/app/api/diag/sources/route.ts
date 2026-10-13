import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

async function testFetch(url: string, init?: RequestInit): Promise<{ url: string; status: number | string; ok: boolean; ms: number; snippet: string }> {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { ...init, cache: 'no-store' });
    const text = await res.text();
    return { url, status: res.status, ok: res.ok, ms: Date.now() - t0, snippet: text.slice(0, 300) };
  } catch (e) {
    return { url, status: 'ERR', ok: false, ms: Date.now() - t0, snippet: String(e).slice(0, 300) };
  }
}

export async function GET() {
  const results: Record<string, unknown> = {};

  // 1) TradingView scanner (the primary server-side source)
  results.tradingview = await testFetch('https://scanner.tradingview.com/india/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      columns: ['name', 'close', 'change', 'change_abs', 'high', 'low', 'open', 'volume'],
      range: [0, 5],
      sort: { sortBy: 'volume', sortOrder: 'desc' },
    }),
    signal: AbortSignal.timeout(8000),
  });

  // 2) Yahoo chart API (raw)
  results.yahooChart = await testFetch('https://query1.finance.yahoo.com/v8/finance/chart/RELIANCE.NS?interval=1d&range=1d', {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(8000),
  });

  // 3) Yahoo quote API (raw)
  results.yahooQuote = await testFetch('https://query1.finance.yahoo.com/v7/finance/quote?symbols=RELIANCE.NS', {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(8000),
  });

  // 4) yahoo-finance2 library
  try {
    const YahooFinance = (await import('yahoo-finance2')).default as any;
    const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'], validation: { logErrors: false } });
    const t0 = Date.now();
    const r = await yf.quote('RELIANCE.NS');
    results.yahooFinance2 = { ok: true, ms: Date.now() - t0, price: r?.regularMarketPrice, sample: JSON.stringify(r).slice(0, 300) };
  } catch (e: any) {
    results.yahooFinance2 = { ok: false, error: String(e).slice(0, 400), name: e?.name };
  }

  return NextResponse.json({ ts: new Date().toISOString(), env: { RENDER: process.env.RENDER ?? null, node: process.version }, results });
}
