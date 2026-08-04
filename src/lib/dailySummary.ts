import { getEngineState } from './engineState';
import { getServiceClient } from './supabase';
import { getTickerName } from './marketConfig';
import { getIstDateParts } from './adminAuthServer';
import { getServerKnowledgeWeights } from './serverAutonomousLearning';
import { getServerStockPulseStatus } from './serverStockPulseLearning';
import { sendEmailSmtp } from './annualReport/sendEmail';

const DAILY_SENT_KEY = '__dailySummarySent';

function isWeekday(): boolean {
  const d = new Date();
  const day = d.getUTCDay();
  return day >= 1 && day <= 5;
}

function todayLabel(): string {
  const { year, month, day } = getIstDateParts();
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}

function todayStartMs(): number {
  const { year, month, day } = getIstDateParts();
  return new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
}

function getSentDate(): string | null {
  const g = globalThis as unknown as Record<string, string | undefined>;
  return g[DAILY_SENT_KEY] || null;
}

function markSent(): void {
  const d = getIstDateParts();
  (globalThis as unknown as Record<string, string>)[DAILY_SENT_KEY] = `${d.year}-${d.month}-${d.day}`;
}

function renderDailyHtml(ctx: {
  date: string;
  accuracy: number;
  resolved: number;
  correct: number;
  wrong: number;
  totalPreds: number;
  topTickers: string;
  mlCycles: number;
  newsCycles: number;
  aiCycles: number;
  llmAnalyses: number;
  gemsCached: number;
  studiedTickers: number;
  selfAwarenessScore: number;
  trend: string;
  quoteCycles: number;
  uptimeDays: number;
  patterns: string[];
  efficiency: string[];
  indicatorAccuracy: string;
  macroActive: boolean;
  macroBrief: string;
  headlineSamples: string;
  weightSamples: number;
  playbook: string | null;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/>
<title>Quantum Alpha — Daily Summary ${ctx.date}</title>
<style>
  body{margin:0;padding:0;background:#0b1220;color:#e2e8f0;font-family:'Segoe UI',system-ui,sans-serif;font-size:14px;line-height:1.55}
  .wrap{max-width:680px;margin:0 auto;padding:24px 20px 40px}
  h1{font-size:20px;color:#fff;margin:0 0 4px}
  .sub{color:#94a3b8;font-size:12px;margin:0 0 20px}
  h2{font-size:14px;color:#E8621A;margin:24px 0 10px;text-transform:uppercase;letter-spacing:0.06em}
  .card{background:#111827;border:1px solid #1e293b;border-radius:10px;padding:14px 16px;margin:10px 0}
  .row{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #1e293b}
  .row:last-child{border:none}
  .label{color:#94a3b8}
  .val{color:#fff;font-weight:600}
  .green{color:#22c55e}
  .red{color:#ef4444}
  .amber{color:#eab308}
  .badge{display:inline-block;background:#E8621A22;color:#fb923c;border:1px solid #E8621A55;padding:2px 8px;border-radius:999px;font-size:11px;margin:2px}
  .muted{color:#64748b;font-size:12px}
  .playbook{background:#1a2332;border-left:3px solid #fb923c;padding:12px 14px;border-radius:6px;margin:10px 0;white-space:pre-wrap;font-size:13px;line-height:1.5}
</style></head>
<body><div class="wrap">
  <h1>📊 Daily Close — ${ctx.date}</h1>
  <p class="sub">AI Self-Learning Engine &bull; Generated automatically after market close</p>

  <h2>🎯 Prediction Accuracy</h2>
  <div class="card">
    <div class="row"><span class="label">Overall Accuracy</span><span class="val ${ctx.accuracy >= 55 ? 'green' : ctx.accuracy >= 40 ? 'amber' : 'red'}">${ctx.accuracy.toFixed(1)}%</span></div>
    <div class="row"><span class="label">Resolved Today</span><span class="val">${ctx.resolved}</span></div>
    ${ctx.resolved > 0 ? `<div class="row"><span class="label">Correct / Wrong</span><span class="val"><span class="green">${ctx.correct}</span> / <span class="red">${ctx.wrong}</span></span></div>` : ''}
    <div class="row"><span class="label">Total Predictions</span><span class="val">${ctx.totalPreds}</span></div>
  </div>

  <h2>🤖 AI Learning Today</h2>
  <div class="card">
    <div class="row"><span class="label">Self-Awareness Score</span><span class="val">${ctx.selfAwarenessScore.toFixed(1)}%</span></div>
    <div class="row"><span class="label">Learning Trend</span><span class="val">${ctx.trend}</span></div>
    <div class="row"><span class="label">Weight Samples</span><span class="val">${ctx.weightSamples}</span></div>
    <div class="row"><span class="label">Indicator Emphasis</span><span class="val muted">${ctx.indicatorAccuracy}</span></div>
  </div>

  <h2>⚙️ Engine Activity</h2>
  <div class="card">
    <div class="row"><span class="label">Quote Cycles</span><span class="val">${ctx.quoteCycles}</span></div>
    <div class="row"><span class="label">ML Cycles</span><span class="val">${ctx.mlCycles}</span></div>
    <div class="row"><span class="label">News Cycles</span><span class="val">${ctx.newsCycles}</span></div>
    <div class="row"><span class="label">AI Learning Cycles</span><span class="val">${ctx.aiCycles}</span></div>
    <div class="row"><span class="label">LLM Analyses</span><span class="val">${ctx.llmAnalyses}</span></div>
    <div class="row"><span class="label">Stock Pulse Gems</span><span class="val">${ctx.gemsCached}</span></div>
    <div class="row"><span class="label">Tickers Studied</span><span class="val">${ctx.studiedTickers}</span></div>
    <div class="row"><span class="label">Uptime</span><span class="val">${ctx.uptimeDays}d</span></div>
  </div>

  <h2>📈 Patterns Learned</h2>
  <div class="card">${ctx.patterns.map(p => `<div class="badge">${p}</div>`).join('')}</div>

  <h2>🔧 Efficiency Improvements</h2>
  <div class="card">${ctx.efficiency.join('<br/>')}</div>

  <h2>🌍 Market Context</h2>
  <div class="card">
    <div class="row"><span class="label">Macro Active</span><span class="val ${ctx.macroActive ? 'amber' : 'muted'}">${ctx.macroActive ? 'YES' : 'No'}</span></div>
    <div class="row"><span class="label">Key Headlines</span><span class="val muted" style="font-size:12px">${ctx.headlineSamples}</span></div>
  </div>
  ${ctx.macroActive ? `<div class="playbook">${ctx.macroBrief}</div>` : ''}

  ${ctx.playbook ? `<h2>📋 Post-Market Playbook</h2><div class="playbook">${ctx.playbook}</div>` : ''}

  <p class="muted" style="text-align:center;margin-top:30px;font-size:11px">Quantum Alpha Terminal &bull; Fully autonomous AI trading engine &bull; Generated ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
</div></body></html>`;
}

export async function runDailySummary(): Promise<string | null> {
  const engine = getEngineState();
  const sentDate = getSentDate();
  const { year, month, day } = getIstDateParts();
  const todayKey = `${year}-${month}-${day}`;

  if (sentDate === todayKey) return null;
  if (!isWeekday() && !engine.macroShockActive) return null;

  const todayStart = todayStartMs();
  const pulse = getServerStockPulseStatus();
  const weights = getServerKnowledgeWeights();
  const svc = getServiceClient();

  let predictions: { resolved: boolean; result: string; ticker: string; accuracy_percent?: number }[] = [];
  if (svc) {
    try {
      const { data } = await svc.from('prediction_history')
        .select('ticker, resolved, result, accuracy_percent')
        .gte('created_at', todayStart)
        .limit(200);
      predictions = data || [];
    } catch { /* ignore */ }
  }

  const resolved = predictions.filter(p => p.resolved);
  const correct = resolved.filter(p => p.result === 'CORRECT').length;
  const wrong = resolved.filter(p => p.result === 'WRONG').length;
  const accuracy = resolved.length ? (correct / resolved.length) * 100 : engine.selfAwareness.overallAccuracy;

  const topTickers = resolved
    .filter(p => p.result === 'CORRECT')
    .slice(0, 5).map(p => p.ticker).join(', ') || 'N/A';

  const indicatorAccuracy = Object.entries(weights.weights || {})
    .map(([name, w]) => `${name.toUpperCase()} ${(40 + w * 25).toFixed(0)}%`)
    .join(', ') || 'N/A';

  const headlines = engine.newsItems.slice(0, 5).map(n => n.headline).join(' • ') || 'N/A';

  const playbook = engine.marketOfflinePlaybook;

  const patterns: string[] = [];
  if (pulse.topMemory?.length) patterns.push(`Repeated studies: ${pulse.topMemory.slice(0, 3).map(t => t.ticker).join(', ')}`);
  patterns.push('Regime-aware weighting — ADX/RSI/MACD evolve from outcomes');
  patterns.push('Macro veto layer blocks bullish calls during panic');
  if (engine.stockPulseGemsCached > 0) patterns.push('Stock Pulse fundamental memory — Nifty 500 + gem scoring');
  if (engine.cycleCounters.ml > 0) patterns.push(`Batched ML — ${engine.cycleCounters.ml} cycles without blocking quotes`);

  const efficiency: string[] = [];
  efficiency.push(`ML: ${engine.cycleCounters.ml} cycles, ${engine.modelsTrained} models trained, ${engine.predictionsStored} predictions stored`);
  efficiency.push(`News: LLM enriched ${engine.llmAnalysisCount} items, ${engine.newsItems.length} in cache`);
  efficiency.push(`Autonomous resolution: every 5 min, weights evolved from ${weights.totalSamples} samples`);
  efficiency.push(`Stock Pulse: ${pulse.gems?.length || 0} gems cached across ${pulse.studiedTickers?.length || 0} tickers`);

  const html = renderDailyHtml({
    date: todayLabel(),
    accuracy,
    resolved: resolved.length,
    correct,
    wrong,
    totalPreds: predictions.length,
    topTickers,
    mlCycles: engine.cycleCounters.ml,
    newsCycles: engine.cycleCounters.news,
    aiCycles: engine.cycleCounters.ai,
    llmAnalyses: engine.llmAnalysisCount,
    gemsCached: engine.stockPulseGemsCached,
    studiedTickers: pulse.studiedTickers?.length || 0,
    selfAwarenessScore: engine.selfAwareness.selfAwarenessScore,
    trend: engine.selfAwareness.trend,
    quoteCycles: engine.cycleCounters.quotes,
    uptimeDays: engine.startedAt ? Math.max(1, Math.floor((Date.now() - engine.startedAt) / 86400000)) : 0,
    patterns,
    efficiency,
    indicatorAccuracy,
    macroActive: engine.macroShockActive,
    macroBrief: engine.macroShockInfo || '',
    headlineSamples: headlines,
    weightSamples: weights.totalSamples || 0,
    playbook,
  });

  const to = process.env.ANNUAL_REPORT_EMAIL || process.env.ADMIN_EMAIL || 'zn4.editz@gmail.com';
  const result = await sendEmailSmtp(to, `Quantum Alpha — Daily Summary ${todayLabel()}`, html);

  if (result.ok) {
    markSent();
    return `Daily summary sent → ${to}`;
  }
  return `Daily summary failed: ${result.error}`;
}
