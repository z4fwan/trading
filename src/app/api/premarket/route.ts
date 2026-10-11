import { NextResponse } from 'next/server';
import {
  getPreMarketPredictions,
  getPreMarketStats,
  runPreMarketMomentumScan,
  resolvePreMarketPredictions,
} from '@/lib/preMarketMomentumEngine';
import { restorePreMarketState } from '@/lib/preMarketMomentumEngine';

export const dynamic = 'force-dynamic';

type PreMarketPayload = {
  stats: ReturnType<typeof getPreMarketStats>;
  predictions: ReturnType<typeof getPreMarketPredictions>;
};

/**
 * Under CUSTOM_SERVER the engine runs in a child process, so in-memory
 * predictions made here are always empty. The worker streams its state over
 * IPC into `global.__premarketPayload`; read that first, then fall back to the
 * durable Supabase snapshot (which also survives restarts).
 */
function readSharedState(): PreMarketPayload | null {
  const raw = (globalThis as Record<string, string>).__premarketPayload;
  if (raw) {
    try { return JSON.parse(raw) as PreMarketPayload; } catch { /* fall through */ }
  }
  return null;
}

export async function GET() {
  let shared = readSharedState();
  if (!shared || shared.predictions.length === 0) {
    // Main-process memory may have nothing — try hydrating from Supabase.
    try { await restorePreMarketState(); } catch { /* ignore */ }
    const local: PreMarketPayload = {
      stats: getPreMarketStats(),
      predictions: getPreMarketPredictions(),
    };
    if (!shared || local.predictions.length > shared.predictions.length) {
      shared = local;
    }
  }
  return NextResponse.json({
    stats: shared.stats,
    predictions: shared.predictions.slice(-50),
  });
}

export async function POST(request: Request) {
  let body: { action?: string; window?: 'PRE_OPEN' | 'POST_OPEN' } = {};
  try { body = await request.json(); } catch { /* empty body ok */ }

  // In production the engine lives in the worker process. A direct scan here
  // would write to the API process's memory and be invisible everywhere else,
  // so dispatch the command over IPC and report the streamed result instead.
  const worker = (globalThis as Record<string, any>).__worker;
  const ownOrigin = new URL(request.url).origin;
  if (worker && process.env.CUSTOM_SERVER === 'true') {
    try {
      await fetch(`${ownOrigin}/api/premarket/trigger?action=${encodeURIComponent(body.action ?? 'scan')}&window=${encodeURIComponent(body.window ?? 'POST_OPEN')}`, {
        method: 'GET',
        cache: 'no-store',
      });
      // Give the worker a moment, then return its streamed state.
      await new Promise((r) => setTimeout(r, 1500));
      const shared = readSharedState();
      if (shared) {
        return NextResponse.json({ dispatched: true, window: body.window ?? 'POST_OPEN', stats: shared.stats, predictions: shared.predictions.slice(-10) });
      }
      return NextResponse.json({ dispatched: true, window: body.window ?? 'POST_OPEN' });
    } catch { /* fall through to local execution */ }
  }

  if (body.action === 'resolve') {
    const resolved = await resolvePreMarketPredictions();
    return NextResponse.json({ resolved, stats: getPreMarketStats() });
  }

  const window = body.window ?? 'POST_OPEN';
  const silent = body.action === 'dryrun';
  const picks = await runPreMarketMomentumScan(window, { silent });
  return NextResponse.json({ window, silent, picks, stats: getPreMarketStats() });
}
