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

    const engine = getEngineState();

    // Under CUSTOM_SERVER the engine runs in the child worker; the real
    // self-awareness is computed from the DB there and streamed via IPC.
    let engineSelfAwareness = engine.selfAwareness;
    const childPayload = (globalThis as Record<string, string>).__enginePayload;
    if (childPayload && typeof childPayload === 'string') {
      try {
        const parsed = JSON.parse(childPayload);
        if (parsed?.selfAwareness) engineSelfAwareness = parsed.selfAwareness;
      } catch { /* ignore */ }
    }
    const self = engineSelfAwareness && Number(engineSelfAwareness.overallAccuracy) > 0
      ? engineSelfAwareness
      : analyzeSelf();

    return NextResponse.json({
      ok: true,
      ticker: ticker || null,
      days,
      rolling,
      regimeAccuracy: regimeAcc,
      selfAwareness: self,
      engineSelfAwareness,
      supabaseReachable: supabasePing.reachable,
      supabase: supabasePing,
      timestamp: Date.now(),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e), timestamp: Date.now() }, { status: 500 });
  }
}

