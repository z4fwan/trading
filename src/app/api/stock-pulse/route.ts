import { NextResponse } from 'next/server';
import { ensureBackgroundEngine } from '@/lib/ensureEngine';
import { fetchRawFundamentals, normalizeTicker } from '@/lib/stockPulse/fundamentalFetcher';
import { buildEnrichedStockPulseReport } from '@/lib/stockPulse/buildEnrichedReport';
import { scanMultibaggerCandidates } from '@/lib/stockPulse/multibaggerScanner';
import {
  getServerGemCache,
  getServerStockPulseStatus,
  getServerPulseSummary,
} from '@/lib/serverStockPulseLearning';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CACHE_TTL = 10 * 60 * 1000; // 10 min
const reportCache = new Map<string, { report: any; html: string; ts: number }>();

export async function GET(req: Request) {
  ensureBackgroundEngine();
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');

  if (action === 'status') {
    return NextResponse.json({ ...getServerStockPulseStatus(), timestamp: Date.now() });
  }

  if (action === 'summary') {
    const ticker = normalizeTicker(searchParams.get('ticker') || '');
    return NextResponse.json({
      ticker,
      summary: ticker ? getServerPulseSummary(ticker) : null,
      timestamp: Date.now(),
    });
  }

  if (action === 'multibagger') {
    const limit = Math.min(12, Math.max(3, parseInt(searchParams.get('limit') || '8', 10)));
    const batch = Math.min(40, Math.max(12, parseInt(searchParams.get('batch') || '24', 10)));
    const force = searchParams.get('force') === '1';
    try {
      const cached = !force ? getServerGemCache() : null;
      if (cached && cached.length > 0) {
        return NextResponse.json({
          picks: cached.slice(0, limit),
          timestamp: Date.now(),
          source: 'server_cache_24x7',
        });
      }
      const picks = await scanMultibaggerCandidates(batch, limit);
      return NextResponse.json({ picks, timestamp: Date.now(), source: 'live_scan' });
    } catch (e) {
      return NextResponse.json({ error: String(e), picks: [] }, { status: 500 });
    }
  }
  return NextResponse.json({ error: 'Use ?action=status|multibagger|summary or POST ticker' }, { status: 400 });
}

export async function POST(req: Request) {
  let body: { ticker?: string; horizonYears?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const ticker = normalizeTicker(body.ticker || '');
  const horizonYears = Math.min(15, Math.max(3, body.horizonYears || 5));
  if (!ticker) {
    return NextResponse.json({ error: 'ticker required' }, { status: 400 });
  }

  // Check cache first
  const cacheKey = `${ticker}-${horizonYears}`;
  const cached = reportCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json({ ...cached, cached: true, timestamp: Date.now() });
  }

  try {
    // Parallel fetch Fundamentals and V7 DalalAI Intelligence
    const pythonApiUrl = `http://127.0.0.1:8000/api/dalalai/pulse/${ticker}`;
    const [raw, dalalaiRes] = await Promise.all([
      fetchRawFundamentals(ticker),
      fetch(pythonApiUrl).catch(() => null)
    ]);
    
    if (!raw) {
      const indian = ticker.length <= 3 || ticker === ticker.toUpperCase();
      return NextResponse.json({
        error: indian
          ? `Could not fetch fundamentals for ${ticker}. Check the ticker on screener.in — NSE/BSE symbols only (e.g. RELIANCE, HDFCBANK, TCS).`
          : `Could not find market data for "${ticker}". Try an Indian NSE/BSE ticker.`,
      }, { status: 404 });
    }
    
    let dalalaiData = null;
    if (dalalaiRes && dalalaiRes.ok) {
      const parsed = await dalalaiRes.json().catch(() => null);
      if (parsed && parsed.status === 'success') {
        dalalaiData = parsed.data;
      }
    }

    const { report, html } = await buildEnrichedStockPulseReport(raw, horizonYears);
    
    // Inject DalalAI V7 Data into report
    if (dalalaiData) {
      report.dalalaiIntelligence = dalalaiData;
    }
    
    reportCache.set(cacheKey, { report, html, ts: Date.now() });
    return NextResponse.json({ report, html, cached: false, timestamp: Date.now() });
  } catch (e: any) {
    const msg = String(e?.message || e);
    const userMsg = msg.includes('timed out') || msg.includes('AbortError') || msg.includes('Timeout')
      ? `${ticker}: Yahoo Finance data fetch timed out — market data may be limited for this symbol. Try again or use a different ticker.`
      : msg.includes('404') || msg.includes('not found')
        ? `${ticker}: Symbol not found on Yahoo Finance. Check spelling or try an NSE/BSE ticker.`
        : `${ticker}: Analysis failed — ${msg.slice(0, 200)}`;
    return NextResponse.json({ error: userMsg }, { status: 500 });
  }
}
