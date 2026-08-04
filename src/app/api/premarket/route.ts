import { NextResponse } from 'next/server';
import {
  getPreMarketPredictions,
  getPreMarketStats,
  runPreMarketMomentumScan,
  resolvePreMarketPredictions,
} from '@/lib/preMarketMomentumEngine';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    stats: getPreMarketStats(),
    predictions: getPreMarketPredictions().slice(-50),
  });
}

export async function POST(request: Request) {
  let body: { action?: string; window?: 'PRE_OPEN' | 'POST_OPEN' } = {};
  try { body = await request.json(); } catch { /* empty body ok */ }

  if (body.action === 'resolve') {
    const resolved = resolvePreMarketPredictions();
    return NextResponse.json({ resolved, stats: getPreMarketStats() });
  }

  const window = body.window ?? 'POST_OPEN';
  const silent = body.action === 'dryrun';
  const picks = await runPreMarketMomentumScan(window, { silent });
  return NextResponse.json({ window, silent, picks, stats: getPreMarketStats() });
}
