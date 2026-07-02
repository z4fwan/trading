import { NextResponse } from 'next/server';
import { ensureBackgroundEngine } from '@/lib/ensureEngine';
import { getServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function pingSupabase() {
  const svc = getServiceClient();
  if (!svc) return { configured: false, reachable: false, error: 'SUPABASE_SERVICE_KEY missing' };
  try {
    const { error } = await svc.from('prediction_history').select('id', { count: 'exact', head: true });
    if (error) return { configured: true, reachable: false, error: error.message };
    return { configured: true, reachable: true, error: null };
  } catch (e) {
    return { configured: true, reachable: false, error: String(e) };
  }
}

export async function GET(req: Request) {
  ensureBackgroundEngine();
  const { searchParams } = new URL(req.url);
  const days = Math.min(365, Math.max(7, parseInt(searchParams.get('days') || '90', 10)));
  const ticker = (searchParams.get('ticker') || '').trim().toUpperCase() || undefined;

  try {
    const { getRollingStats, getRegimeAccuracy } = await import('@/lib/predictionValidation');
    const { analyzeSelf } = await import('@/lib/selfAwarenessEngine');
    const { getEngineState } = await import('@/lib/engineState');

    const [rolling, regimeAcc, supabasePing] = await Promise.all([
      getRollingStats(ticker, days),
      getRegimeAccuracy(days),
      pingSupabase(),
    ]);

    // Self-awareness is computed from client-side localStorage store,
    // but it still gives a useful in-memory snapshot when available.
    const self = analyzeSelf();
    const engine = getEngineState();

    return NextResponse.json({
      ok: true,
      ticker: ticker || null,
      days,
      rolling,
      regimeAccuracy: regimeAcc,
      selfAwareness: self,
      engineSelfAwareness: engine.selfAwareness,
      supabaseReachable: supabasePing.reachable,
      supabase: supabasePing,
      timestamp: Date.now(),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e), timestamp: Date.now() }, { status: 500 });
  }
}

