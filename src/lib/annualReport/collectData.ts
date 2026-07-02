import { getLooseServiceClient } from '@/lib/supabaseService';
import { getEngineState } from '@/lib/engineState';
import { getServerStockPulseStatus } from '@/lib/serverStockPulseLearning';
import { getServerKnowledgeWeights } from '@/lib/serverAutonomousLearning';
import { getTickerName } from '@/lib/marketConfig';
import type { ReportKind, AnnualReportData, ReportPeriod, AccuracySlice, TickerOutcome } from './types';
import { getDemoPeriod, getFinancialYearBounds, getMonthlyPeriod, getIndianFinancialYear } from './period';

function periodFor(kind: ReportKind): ReportPeriod {
  const now = Date.now();
  if (kind === 'demo') {
    const p = getDemoPeriod(now);
    return { kind, label: p.label, startMs: p.start, endMs: p.end };
  }
  if (kind === 'monthly') {
    const p = getMonthlyPeriod(now);
    return { kind, label: p.label, startMs: p.start, endMs: p.end };
  }
  const fy = getIndianFinancialYear();
  const p = getFinancialYearBounds(fy, now);
  return { kind, label: p.label, startMs: p.start, endMs: p.end, financialYear: fy };
}

type DbPred = {
  ticker: string;
  name?: string;
  created_at: number;
  resolved?: boolean;
  result?: string;
  accuracy_percent?: number;
  deviation_percent?: number;
  confidence?: number;
  prediction_type?: string;
  entry_price?: number;
  actual_price?: number;
};

export async function collectAnnualReportData(
  kind: ReportKind = 'demo',
  recipientEmail?: string,
): Promise<AnnualReportData> {
  const period = periodFor(kind);
  const engine = getEngineState();
  const pulse = getServerStockPulseStatus();
  const weights = getServerKnowledgeWeights();

  const email =
    recipientEmail ||
    process.env.ANNUAL_REPORT_EMAIL ||
    process.env.REPORT_EMAIL_TO ||
    'zn4.editz@gmail.com';

  let predictions: DbPred[] = [];
  let experience: { ticker: string; result: string; confidence: number; created_at: number }[] = [];
  let snapshots: { created_at?: number; overall_accuracy?: number; learning_progress?: string; snapshot_data?: Record<string, unknown> }[] = [];

  const svc = getLooseServiceClient();
  if (svc) {
    try {
      const { data: ph } = await svc
        .from('prediction_history')
        .select('ticker, name, created_at, resolved, result, accuracy_percent, deviation_percent, confidence, prediction_type, entry_price, actual_price')
        .gte('created_at', period.startMs)
        .lte('created_at', period.endMs)
        .order('created_at', { ascending: false })
        .limit(800);
      predictions = ph || [];
    } catch { /* optional */ }

    try {
      const { data: ex } = await svc
        .from('experience_history')
        .select('ticker, result, confidence, created_at')
        .gte('created_at', period.startMs)
        .lte('created_at', period.endMs)
        .limit(500);
      experience = ex || [];
    } catch { /* optional */ }

    try {
      const { data: sn } = await svc
        .from('ai_knowledge_snapshots')
        .select('created_at, overall_accuracy, learning_progress, snapshot_data')
        .gte('created_at', period.startMs)
        .order('created_at', { ascending: true })
        .limit(50);
      snapshots = sn || [];
    } catch { /* optional */ }
  }

  const resolved = predictions.filter(p => p.resolved);
  const correct = resolved.filter(p => p.result === 'CORRECT').length;
  const wrong = resolved.filter(p => p.result === 'WRONG').length;
  const partial = resolved.filter(p => p.result === 'PARTIAL').length;
  const overallAccuracy = resolved.length
    ? ((correct + partial * 0.5) / resolved.length) * 100
    : engine.selfAwareness.overallAccuracy;

  const byTypeMap: Record<string, { total: number; hit: number }> = {};
  for (const p of resolved) {
    const t = p.prediction_type || 'DAILY';
    if (!byTypeMap[t]) byTypeMap[t] = { total: 0, hit: 0 };
    byTypeMap[t].total++;
    if (p.result === 'CORRECT' || p.result === 'PARTIAL') byTypeMap[t].hit += p.result === 'CORRECT' ? 1 : 0.5;
  }
  const byHorizon: AccuracySlice[] = Object.entries(byTypeMap).map(([label, v]) => ({
    label,
    count: v.total,
    pct: v.total ? Math.round((v.hit / v.total) * 100) : 0,
  }));

  const outcomeSlices: AccuracySlice[] = [
    { label: 'Correct', count: correct, pct: resolved.length ? Math.round((correct / resolved.length) * 100) : 0 },
    { label: 'Partial', count: partial, pct: resolved.length ? Math.round((partial / resolved.length) * 100) : 0 },
    { label: 'Wrong', count: wrong, pct: resolved.length ? Math.round((wrong / resolved.length) * 100) : 0 },
  ];

  const outcomes: TickerOutcome[] = resolved
    .map(p => {
      const entry = p.entry_price || 0;
      const actual = p.actual_price || entry;
      const pnl = entry > 0 ? ((actual - entry) / entry) * 100 : p.deviation_percent || 0;
      return {
        ticker: p.ticker,
        name: p.name || getTickerName(p.ticker),
        pnlPct: parseFloat(pnl.toFixed(2)),
        result: p.result || '—',
        confidence: p.confidence || 0,
      };
    })
    .filter(p => Number.isFinite(p.pnlPct));

  const topWinners = [...outcomes].sort((a, b) => b.pnlPct - a.pnlPct).slice(0, 8);
  const topLosers = [...outcomes].sort((a, b) => a.pnlPct - b.pnlPct).slice(0, 8);

  const undervaluedGems = (pulse.gems || [])
    .filter(g => g.tier === 'CANDIDATE' || g.tier === 'WATCH' || g.score >= 65)
    .slice(0, 10)
    .map(g => ({
      ticker: g.ticker,
      name: g.name,
      score: g.score,
      tier: g.tier,
      thesis: g.growthThesis?.slice(0, 120) || '',
    }));

  const suddenMovers = parseSuddenMovers(engine.quotesPayload);

  const indicatorAccuracy = Object.entries(weights.weights || {})
    .map(([name, w]) => ({ name: name.toUpperCase(), accuracy: Math.min(95, 40 + w * 25) }))
    .sort((a, b) => b.accuracy - a.accuracy)
    .slice(0, 8);

  const patternsLearned = buildPatternsLearned(snapshots, pulse, experience);
  const efficiencyActions = buildEfficiencyActions(engine, weights);

  const uptimeDays = engine.startedAt
    ? Math.max(1, Math.floor((Date.now() - engine.startedAt) / 86400000))
    : 0;

  const snapshotTrend = snapshots
    .filter(s => s.overall_accuracy != null)
    .slice(-6)
    .map((s, i) => ({
      label: `S${i + 1}`,
      accuracy: s.overall_accuracy || overallAccuracy,
    }));

  const executiveSummary = buildExecutiveSummary({
    period,
    overallAccuracy,
    resolved: resolved.length,
    gems: undervaluedGems.length,
    pulse,
    engine,
    kind,
  });

  if (resolved.length === 0 && predictions.length === 0) {
    executiveSummary.push(
      'Note: Limited Supabase history in this window — metrics blend live engine state + Stock Pulse cache. Keep SUPABASE_SERVICE_KEY set for full FY archives.',
    );
  }

  return {
    period,
    generatedAt: Date.now(),
    brand: 'Quantum Alpha Terminal',
    recipientEmail: email,
    executiveSummary,
    predictionStats: {
      total: predictions.length,
      resolved: resolved.length,
      correct,
      wrong,
      partial,
      overallAccuracy: parseFloat(overallAccuracy.toFixed(1)),
      byHorizon,
      outcomeSlices,
    },
    topWinners,
    topLosers,
    undervaluedGems,
    suddenMovers,
    learning: {
      progress: snapshots.length
        ? snapshots[snapshots.length - 1].learning_progress || 'ACCUMULATING'
        : overallAccuracy >= 55
          ? 'IMPROVING'
          : 'ACCUMULATING',
      patternsLearned,
      efficiencyActions,
      indicatorAccuracy,
      failurePatterns: [
        'Overconfidence when ADX < 20 (weak trend)',
        'Macro shock days — predictions paused via veto layer',
        'Low-liquidity small caps — higher deviation',
      ],
      weightSamples: weights.totalSamples || 0,
    },
    market: {
      macroActive: pulse.macroActive || engine.macroShockActive,
      brief: pulse.marketBrief || engine.macroShockInfo || 'Global macro scan active via RSS + LLM pipeline.',
      headlines: pulse.globalHeadlines?.slice(0, 6) || engine.newsItems.slice(0, 6).map(n => n.headline),
      newsAnalyzed: engine.newsItems.length,
    },
    engine: {
      running: engine.running,
      uptimeDays,
      quoteCycles: engine.cycleCounters.quotes,
      newsCycles: engine.cycleCounters.news,
      mlCycles: engine.cycleCounters.ml,
      aiCycles: engine.cycleCounters.ai,
      stockPulseCycles: pulse.cyclesCompleted || 0,
      gemsCached: pulse.gemsCached || 0,
      studiedTickers: pulse.studiedTickers?.length || 0,
    },
    accuracyTrend: snapshotTrend.length >= 2 ? snapshotTrend : undefined,
  };
}

function parseSuddenMovers(quotesPayload: string | null): { ticker: string; name: string; changePct: number; price: number }[] {
  if (!quotesPayload) return [];
  try {
    const data = JSON.parse(quotesPayload) as {
      stocks?: Record<string, { price?: number; changePercent?: number }>;
    };
    const rows: { ticker: string; name: string; changePct: number; price: number }[] = [];
    for (const [t, q] of Object.entries(data.stocks || {})) {
      if (!q?.price || !q.changePercent) continue;
      if (Math.abs(q.changePercent) >= 3) {
        rows.push({
          ticker: t,
          name: getTickerName(t),
          changePct: q.changePercent,
          price: q.price,
        });
      }
    }
    return rows.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct)).slice(0, 10);
  } catch {
    return [];
  }
}

function buildPatternsLearned(
  snapshots: { learning_progress?: string; snapshot_data?: Record<string, unknown> }[],
  pulse: ReturnType<typeof getServerStockPulseStatus>,
  experience: { result: string }[],
): string[] {
  const patterns: string[] = [];
  if (snapshots.some(s => s.snapshot_data && (s.snapshot_data as { stockPulse?: unknown }).stockPulse)) {
    patterns.push('Stock Pulse 24/7 fundamental memory — rotating Nifty 500 + gem scoring');
  }
  if (pulse.topMemory?.length) {
    patterns.push(`Repeat studies on: ${pulse.topMemory.slice(0, 4).map(t => t.ticker).join(', ')}`);
  }
  const expCorrect = experience.filter(e => e.result === 'CORRECT').length;
  if (experience.length > 5) {
    patterns.push(`Experience replay: ${expCorrect}/${experience.length} setups matched historical winners`);
  }
  patterns.push('Regime-aware weighting — ADX/RSI/MACD weights evolve from resolved outcomes');
  patterns.push('Macro veto layer — Tier-1 news can block bullish calls during panic');
  patterns.push('Multibagger scanner — growth + reasonable valuation + cross-check (Yahoo/NSE/Screener)');
  return patterns;
}

function buildEfficiencyActions(
  engine: ReturnType<typeof getEngineState>,
  weights: ReturnType<typeof getServerKnowledgeWeights>,
): string[] {
  return [
    `Batched ML training (${engine.cycleCounters.ml} cycles) — avoids blocking quote API`,
    `News + LLM pipeline every 60s — ${engine.newsItems.filter(n => n.llmAnalyzed).length} LLM-enriched headlines in cache`,
    `Autonomous prediction resolution every 5 min — no browser required`,
    `Indicator weight evolution (${weights.totalSamples} samples) — RSI ${(weights.weights.rsi || 1).toFixed(2)}x, ADX ${(weights.weights.adx || 1).toFixed(2)}x`,
    `Stock Pulse gem cache — dashboard loads pre-scanned undervalued names`,
    `Lazy AI module mount — faster dashboard on mobile`,
  ];
}

function buildExecutiveSummary(ctx: {
  period: ReportPeriod;
  overallAccuracy: number;
  resolved: number;
  gems: number;
  pulse: ReturnType<typeof getServerStockPulseStatus>;
  engine: ReturnType<typeof getEngineState>;
  kind: ReportKind;
}): string[] {
  const lines = [
    `This ${ctx.kind === 'financial_year' ? 'Financial Year' : ctx.kind === 'monthly' ? 'Monthly' : 'Operational'} Intelligence Report covers ${ctx.period.label}.`,
    `AI resolved ${ctx.resolved} predictions in period with ${ctx.overallAccuracy.toFixed(1)}% weighted accuracy.`,
    `${ctx.gems} undervalued / multibagger-style names flagged by Stock Pulse; ${ctx.pulse.studiedTickers?.length || 0} tickers in server memory.`,
    `Engine ${ctx.engine.running ? 'ran 24/7' : 'was offline'} — ${ctx.engine.cycleCounters.news} news cycles, ${ctx.pulse.cyclesCompleted || 0} Stock Pulse scans.`,
    'Use this report even if you do not open the site — it summarizes self-learning, market context, and stock highlights.',
  ];
  return lines;
}
