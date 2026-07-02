import { NextResponse } from 'next/server';
import { requireServiceClient, type LooseServiceClient } from '@/lib/supabaseService';

type JsonRecord = Record<string, unknown>;

export async function POST(req: Request) {
  let serviceClient: LooseServiceClient;
  try {
    serviceClient = requireServiceClient();
  } catch {
    return NextResponse.json({ error: 'Missing SUPABASE_SERVICE_KEY' }, { status: 500 });
  }

  if (req.headers.get('content-type') !== 'application/json') {
    return NextResponse.json({ error: 'Content-Type must be application/json' }, { status: 415 });
  }

  let body: { predictions?: unknown[]; ml_models?: unknown; experience?: unknown[] };
  try {
    body = await req.json();
    if (!body || typeof body !== 'object') throw new Error('Invalid body');
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const errors: string[] = [];
  const MAX_PREDICTIONS = 500;
  const MAX_MODELS = 200;
  const MAX_EXPERIENCE = 1000;

  if (Array.isArray(body.predictions) && body.predictions.length > 0) {
      const batch = body.predictions.slice(0, MAX_PREDICTIONS) as JsonRecord[];
    const { error } = await serviceClient.from('predictions').upsert(
      batch.map((p: JsonRecord) => ({
        id: String(p.id ?? ''),
        ticker: p.ticker as string,
        direction: p.direction as string,
        confidence: (p.confidence as number) || 30,
        entry_price: (p.entryPrice as number) || 0,
        target_price: (p.targetPrice as number) || 0,
        stop_loss: (p.stopLoss as number) || null,
        result: (p.result as string) || null,
        resolved: (p.resolved as boolean) || false,
        resolved_at: (p.resolvedAt as number) || null,
        created_at: (p.createdAt as number) || Date.now(),
        accuracy_percent: (p.accuracyPercent as number) || null,
        deviation_percent: (p.deviationPercent as number) || null,
        failure_analysis: p.failureAnalysis ? JSON.stringify(p.failureAnalysis) : null,
        reasoning: Array.isArray(p.reasoning) ? p.reasoning : [],
      })),
      { onConflict: 'id', ignoreDuplicates: false },
    );
    if (error) errors.push(`predictions: ${error.message}`);
  }

  if (body.ml_models && typeof body.ml_models === 'object' && !Array.isArray(body.ml_models)) {
    const entries = Object.entries(body.ml_models as JsonRecord).slice(0, MAX_MODELS);
    if (entries.length > 0) {
      const { error } = await serviceClient.from('ml_models').upsert(
        entries.map(([ticker, model]) => {
          const m = model as JsonRecord;
          return {
            ticker,
            weights: JSON.stringify(m.weights),
            mean: JSON.stringify(m.mean),
            std: JSON.stringify(m.std),
            platt_a: (m.plattA as number) || 0,
            platt_b: (m.plattB as number) || 0,
            forward_days: (m.forwardDays as number) || 5,
            accuracy: (m.accuracy as number) || 0,
            total_samples: (m.totalSamples as number) || 0,
            trained_at: (m.trainedAt as number) || Date.now(),
          };
        }),
        { onConflict: 'ticker', ignoreDuplicates: false },
      );
      if (error) errors.push(`ml_models: ${error.message}`);
    }
  }

  if (Array.isArray(body.experience) && body.experience.length > 0) {
    const batch = body.experience.slice(0, MAX_EXPERIENCE) as JsonRecord[];
    const { error } = await serviceClient.from('resolved_predictions_archive').insert(
      batch.map((r: JsonRecord, i: number) => ({
        prediction_id: `exp-${r.ticker as string}-${(r.createdAt as number) || Date.now()}-${i}`,
        ticker: (r.ticker as string) || '',
        direction: (r.direction as string) || 'NEUTRAL',
        result: (r.result as string) || 'UNKNOWN',
        accuracy_percent: (r.accuracyPercent as number) || null,
        deviation_percent: (r.deviationPercent as number) || null,
        confidence: (r.confidence as number) || 30,
        regime: (r.regime as string) || '',
        entry_price: (r.entryPrice as number) || 0,
        actual_price: (r.actualPrice as number) || 0,
        created_at: (r.createdAt as number) || Date.now(),
        resolved_at: (r.resolvedAt as number) || Date.now(),
        archived_at: Date.now(),
      })),
    );
    if (error) errors.push(`experience: ${error.message}`);
  }

  if (errors.length > 0) {
    return NextResponse.json({ status: 'partial', errors }, { status: 200 });
  }
  return NextResponse.json({ status: 'ok' }, { status: 200 });
}

export async function GET(req: Request) {
  let serviceClient: LooseServiceClient;
  try {
    serviceClient = requireServiceClient();
  } catch {
    return NextResponse.json({ error: 'Missing SUPABASE_SERVICE_KEY' }, { status: 500 });
  }

  const url = new URL(req.url);
  const sectionParam = url.searchParams.get('section') || 'all';
  const sections = sectionParam.split(',').map(s => s.trim());
  const wantAll = sections.includes('all');
  const result: Record<string, unknown> = {};

  if (wantAll || sections.includes('predictions')) {
    const { data, error } = await serviceClient.from('predictions').select('*').limit(500);
    if (error) result.predictionsError = error.message;
    else result.predictions = data;
  }
  if (wantAll || sections.includes('ml_models')) {
    const { data, error } = await serviceClient.from('ml_models').select('*').limit(200);
    if (error) result.mlModelsError = error.message;
    else result.ml_models = data;
  }
  if (wantAll || sections.includes('experience')) {
    const { data, error } = await serviceClient
      .from('resolved_predictions_archive')
      .select('*')
      .order('archived_at', { ascending: false })
      .limit(500);
    if (error) result.experienceError = error.message;
    else result.experience = data;
  }

  if (sections.includes('evolution_weights')) {
    const { data, error } = await serviceClient
      .from('ai_evolution_logs')
      .select('weights, default_weight, total_samples, recorded_at')
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) result.evolution_weightsError = error.message;
    else result.evolution_weights = data;
  }

  if (sections.includes('ping')) {
    try {
      const { error } = await serviceClient.from('predictions').select('id', { count: 'exact', head: true });
      result.ping = { ok: !error, error: error?.message ?? null };
    } catch (e) {
      result.ping = { ok: false, error: String(e) };
    }
  }

  return NextResponse.json(result, { status: 200 });
}
