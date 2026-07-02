import { getLooseServiceClient } from '@/lib/supabaseService';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Public read-only endpoint — indicator weights are not secret; avoids auth-gated /api/sync for hydration. */
export async function GET() {
  const svc = getLooseServiceClient();
  if (!svc) {
    return Response.json({ error: 'SUPABASE_SERVICE_KEY not configured' }, { status: 503 });
  }

  try {
    const { data, error } = await svc
      .from('ai_evolution_logs')
      .select('weights, default_weight, total_samples, recorded_at')
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return Response.json({ error: error.message }, { status: 502 });
    }
    if (!data?.weights) {
      return Response.json({ weights: null }, { status: 200 });
    }

    return Response.json({
      weights: data.weights,
      default_weight: data.default_weight,
      total_samples: data.total_samples,
      recorded_at: data.recorded_at,
    });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 502 });
  }
}
