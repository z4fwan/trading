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

  try {
    const raw = await fetchRawFundamentals(ticker);
    if (!raw) {
      return NextResponse.json({ error: 'Could not fetch fundamentals for this symbol' }, { status: 404 });
    }
    const { report, html } = await buildEnrichedStockPulseReport(raw, horizonYears);
    return NextResponse.json({ report, html, timestamp: Date.now() });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
