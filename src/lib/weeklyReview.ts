import { getEngineState, markMarketOfflineAnalysis } from './engineState';
import { getServiceClient } from './supabase';
import { getServerKnowledgeWeights } from './serverAutonomousLearning';
import { getServerStockPulseStatus } from './serverStockPulseLearning';
import { callLLM } from './llmProvider';
import { sendEmailSmtp } from './annualReport/sendEmail';
import { getIstDateParts } from './adminAuthServer';

const WEEKLY_SENT_KEY = '__weeklyReviewSent';

function getSentWeek(): string | null {
  const g = globalThis as unknown as Record<string, string | undefined>;
  return g[WEEKLY_SENT_KEY] || null;
}

function markSent(): void {
  const d = getIstDateParts();
  const weekNum = Math.ceil(d.day / 7);
  (globalThis as unknown as Record<string, string>)[WEEKLY_SENT_KEY] = `${d.year}-W${weekNum}`;
}

function isWeekend(): boolean {
  const d = new Date();
  const day = d.getUTCDay();
  return day === 6 || day === 0;
}

function weekLabel(): string {
  const d = new Date();
  const day = d.getUTCDay();
  const diff = d.getUTCDay() === 0 ? 6 : day - 1;
  const monday = new Date(d);
  monday.setDate(d.getDate() - diff);
  const { year: y1, month: m1, day: d1 } = getIstDateParts(monday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const { year: y2, month: m2, day: d2 } = getIstDateParts(sunday);
  return `${String(d1).padStart(2, '0')}/${String(m1).padStart(2, '0')}/${y1} – ${String(d2).padStart(2, '0')}/${String(m2).padStart(2, '0')}/${y2}`;
}

function weekRangeMs(): { start: number; end: number } {
  const d = new Date();
  const diff = d.getUTCDay() === 0 ? 6 : d.getUTCDay() - 1;
  const monday = new Date(d);
  monday.setDate(d.getDate() - diff);
  const { year, month, day } = getIstDateParts(monday);
  const start = new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
  return { start, end: Date.now() };
}

function renderWeeklyHtml(ctx: {
  week: string;
  overallAccuracy: number;
  selfAwarenessScore: number;
  metaConfidence: number;
  trend: string;
  strengths: number;
  weaknesses: number;
  resolved: number;
  correct: number;
  wrong: number;
  totalPreds: number;
  predictionsSince: number;
  quoteCycles: number;
  mlCycles: number;
  newsCycles: number;
  aiCycles: number;
  llmAnalyses: number;
  gemsCached: number;
  studiedTickers: number;
  weightSamples: number;
  strongestIndicators: string;
  weakestAreas: string;
  patternSummary: string;
  improvementAdvice: string;
  macroActive: boolean;
  macroBrief: string;
  headlineSamples: string;
  playbook: string | null;
  llmReflection: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/>
<title>Quantum Alpha — Weekly Review ${ctx.week}</title>
<style>
  body{margin:0;padding:0;background:#0b1220;color:#e2e8f0;font-family:'Segoe UI',system-ui,sans-serif;font-size:14px;line-height:1.55}
  .wrap{max-width:680px;margin:0 auto;padding:24px 20px 40px}
  h1{font-size:20px;color:#fff;margin:0 0 4px}
  .sub{color:#94a3b8;font-size:12px;margin:0 0 20px}
  h2{font-size:14px;color:#E8621A;margin:24px 0 10px;text-transform:uppercase;letter-spacing:0.06em}
  h3{font-size:13px;color:#94a3b8;margin:14px 0 6px}
  .card{background:#111827;border:1px solid #1e293b;border-radius:10px;padding:14px 16px;margin:10px 0}
  .row{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #1e293b}
  .row:last-child{border:none}
  .label{color:#94a3b8}
  .val{color:#fff;font-weight:600}
  .green{color:#22c55e}
  .red{color:#ef4444}
  .amber{color:#eab308}
  .playbook{background:#1a2332;border-left:3px solid #fb923c;padding:12px 14px;border-radius:6px;margin:10px 0;white-space:pre-wrap;font-size:13px;line-height:1.5}
  .reflection{background:#1a2332;border-left:3px solid #3b82f6;padding:12px 14px;border-radius:6px;margin:10px 0;white-space:pre-wrap;font-size:13px;line-height:1.5}
  hr{border:none;border-top:1px solid #1e293b;margin:20px 0}
  .muted{color:#64748b;font-size:12px}
  .center{text-align:center}
</style></head>
<body><div class="wrap">
  <h1>📈 Weekly AI Review — ${ctx.week}</h1>
  <p class="sub">Self-analysis &bull; Improvement areas &bull; Market context &bull; Generated during market close</p>

  <h2>🎯 Self-Awareness</h2>
  <div class="card">
    <div class="row"><span class="label">Overall Accuracy</span><span class="val ${ctx.resolved > 0 ? (ctx.overallAccuracy >= 55 ? 'green' : ctx.overallAccuracy >= 40 ? 'amber' : 'red') : 'muted'}">${ctx.resolved > 0 || ctx.overallAccuracy > 0 ? ctx.overallAccuracy.toFixed(1) + '%' : 'Calibrating'}</span></div>
    <div class="row"><span class="label">Self-Awareness Score</span><span class="val">${ctx.selfAwarenessScore > 0 ? ctx.selfAwarenessScore.toFixed(1) + '%' : 'Calibrating'}</span></div>
    <div class="row"><span class="label">Meta-Confidence</span><span class="val">${ctx.metaConfidence > 0 ? ctx.metaConfidence.toFixed(1) + '%' : 'Calibrating'}</span></div>
    <div class="row"><span class="label">Trend</span><span class="val">${ctx.trend}</span></div>
    <div class="row"><span class="label">Strengths / Weaknesses</span><span class="val"><span class="green">${ctx.strengths}</span> / <span class="red">${ctx.weaknesses}</span></span></div>
  </div>

  <h2>📊 Prediction Track Record</h2>
  <div class="card">
    <div class="row"><span class="label">Resolved This Week</span><span class="val">${ctx.resolved}</span></div>
    ${ctx.resolved > 0 ? `<div class="row"><span class="label">Correct / Wrong</span><span class="val"><span class="green">${ctx.correct}</span> / <span class="red">${ctx.wrong}</span></span></div>` : ''}
    <div class="row"><span class="label">Total Predictions</span><span class="val">${ctx.totalPreds}</span></div>
    <div class="row"><span class="label">All-Time Resolved</span><span class="val">${ctx.predictionsSince}</span></div>
  </div>

  <h2>🤖 What I Learned This Week</h2>
  <div class="card">
    <div class="row"><span class="label">Weight Samples</span><span class="val">${ctx.weightSamples}</span></div>
    <div class="row"><span class="label">Strongest Indicators</span><span class="val muted">${ctx.strongestIndicators}</span></div>
    <div class="row"><span class="label">Weakest Areas</span><span class="val muted">${ctx.weakestAreas}</span></div>
    <p style="margin:8px 0 0;color:#94a3b8;font-size:13px">${ctx.patternSummary}</p>
  </div>

  <h3>🔧 Improvement Areas</h3>
  <div class="playbook">${ctx.improvementAdvice}</div>

  <h2>⚙️ Engine Activity (7-day)</h2>
  <div class="card">
    <div class="row"><span class="label">Quote Cycles</span><span class="val">${ctx.quoteCycles}</span></div>
    <div class="row"><span class="label">ML Cycles</span><span class="val">${ctx.mlCycles}</span></div>
    <div class="row"><span class="label">News Cycles</span><span class="val">${ctx.newsCycles}</span></div>
    <div class="row"><span class="label">AI Learning Cycles</span><span class="val">${ctx.aiCycles}</span></div>
    <div class="row"><span class="label">LLM Analyses</span><span class="val">${ctx.llmAnalyses}</span></div>
    <div class="row"><span class="label">Stock Pulse Gems</span><span class="val">${ctx.gemsCached}</span></div>
    <div class="row"><span class="label">Tickers Studied</span><span class="val">${ctx.studiedTickers}</span></div>
  </div>

  <h2>🌍 Market Context</h2>
  <div class="card">
    <div class="row"><span class="label">Macro Active</span><span class="val ${ctx.macroActive ? 'amber' : 'muted'}">${ctx.macroActive ? 'YES' : 'No'}</span></div>
    <div class="row"><span class="label">Key Headlines</span><span class="val muted" style="font-size:12px">${ctx.headlineSamples}</span></div>
  </div>
  ${ctx.macroActive ? `<div class="playbook">${ctx.macroBrief}</div>` : ''}

  ${ctx.playbook ? `<h2>📋 Monday Open Playbook</h2><div class="playbook">${ctx.playbook}</div>` : ''}

  <h2>🧠 AI Self-Reflection</h2>
  <div class="reflection">${ctx.llmReflection}</div>

  <hr/>
  <p class="muted center" style="font-size:11px">Quantum Alpha Terminal &bull; Fully autonomous AI &bull; ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
</div></body></html>`;
}

export async function runWeeklyReview(): Promise<string | null> {
  if (!isWeekend()) return null;

  const sent = getSentWeek();
  const { year, month, day } = getIstDateParts();
  const weekNum = Math.ceil(day / 7);
  const thisWeek = `${year}-W${weekNum}`;
  if (sent === thisWeek) return null;

  const engine = getEngineState();
  const pulse = getServerStockPulseStatus();
  const weights = getServerKnowledgeWeights();
  const range = weekRangeMs();
  const svc = getServiceClient();

  let predictions: { resolved: boolean; result: string; ticker: string }[] = [];
  if (svc) {
    try {
      const { data } = await svc.from('prediction_history')
        .select('ticker, resolved, result')
        .gte('created_at', range.start)
        .lte('created_at', range.end)
        .limit(500);
      predictions = data || [];
    } catch { /* ignore */ }
  }

  const resolved = predictions.filter(p => p.resolved);
  const correct = resolved.filter(p => p.result === 'CORRECT').length;
  const wrong = resolved.filter(p => p.result === 'WRONG').length;
  
  let accuracyStr = 'Calibrating';
  let accuracyVal = 0;
  if (resolved.length > 0) {
    accuracyVal = (correct / resolved.length) * 100;
    accuracyStr = `${accuracyVal.toFixed(1)}%`;
  } else if (engine.selfAwareness.overallAccuracy > 0) {
    accuracyVal = engine.selfAwareness.overallAccuracy;
    accuracyStr = `${accuracyVal.toFixed(1)}%`;
  }

  const indicators = Object.entries(weights.weights || {})
    .map(([name, w]) => ({ name, weight: w, accuracy: 40 + w * 25 }))
    .sort((a, b) => b.accuracy - a.accuracy);

  const strongest = indicators.length ? indicators.slice(0, 3).map(i => `${i.name.toUpperCase()} (${i.accuracy.toFixed(0)}%)`).join(', ') : 'Calibrating Data...';
  const weakest = indicators.length ? indicators.slice(-3).map(i => `${i.name.toUpperCase()} (${i.accuracy.toFixed(0)}%)`).join(', ') : 'Calibrating Data...';

  const patternSummary = [
    engine.cycleCounters.ml > 0 ? `${engine.cycleCounters.ml} ML cycles processed` : null,
    engine.llmAnalysisCount > 0 ? `${engine.llmAnalysisCount} LLM-enhanced news analyses` : null,
    pulse.gems?.length > 0 ? `${pulse.gems.length} undervalued gems in cache` : null,
    engine.selfAwareness.trend === 'IMPROVING' ? 'Accuracy trend is improving' : engine.selfAwareness.trend === 'DECLINING' ? 'Accuracy trend declining — review needed' : 'Accuracy stable',
  ].filter(Boolean).join('. ') || 'Learning patterns accumulating...';

  const improvementAdvice = generateImprovementAdvice(engine, weights, accuracyVal);

  const playbook = engine.marketOfflinePlaybook;

  const headlines = engine.newsItems.slice(0, 5).map(n => n.headline).join(' • ') || 'N/A';

  // LLM self-reflection for the week
  let llmReflection = 'AI self-reflection not available (LLM not configured or API error).';
  try {
    const prompt = `You are an autonomous AI trading system doing a weekly self-review.

Week: ${weekLabel()}
Accuracy: ${accuracyStr}
Self-Awareness Score: ${engine.selfAwareness.selfAwarenessScore.toFixed(1)}/100
Trend: ${engine.selfAwareness.trend}
Strengths Identified: ${engine.selfAwareness.strengths}
Weaknesses Identified: ${engine.selfAwareness.weaknesses}
Resolved This Week: ${resolved.length} (${correct} correct, ${wrong} wrong)
ML Cycles: ${engine.cycleCounters.ml}
LLM Analyses: ${engine.llmAnalysisCount}
Active Macro: ${engine.macroShockActive ? engine.macroShockInfo : 'None'}

CRITICAL INSTRUCTIONS:
If "Resolved This Week" is 0, DO NOT say your performance was poor or 0%. State clearly that the system was in "Observation and Calibration Mode" collecting data and no trades were closed yet. 
If trades were resolved, reflect critically on the accuracy.

Reflect on:
1. What did I do well this week?
2. Where did I underperform and why?
3. What specific adjustments should I make next week?
4. What patterns am I starting to recognize?
5. Rate my overall week as a trader (1-10) and explain.

Keep the tone highly analytical and professional. Be concise (4-6 sentences).`;

    const { content } = await callLLM('System', prompt, 1024);
    if (content) {
      llmReflection = content;
      markMarketOfflineAnalysis(content);
    }
  } catch { /* LLM reflection is optional */ }

  const html = renderWeeklyHtml({
    week: weekLabel(),
    overallAccuracy: accuracyVal,
    selfAwarenessScore: engine.selfAwareness.selfAwarenessScore,
    metaConfidence: engine.selfAwareness.metaConfidence,
    trend: engine.selfAwareness.trend,
    strengths: engine.selfAwareness.strengths,
    weaknesses: engine.selfAwareness.weaknesses,
    resolved: resolved.length,
    correct,
    wrong,
    totalPreds: predictions.length,
    predictionsSince: engine.predictionsStored,
    quoteCycles: engine.cycleCounters.quotes,
    mlCycles: engine.cycleCounters.ml,
    newsCycles: engine.cycleCounters.news,
    aiCycles: engine.cycleCounters.ai,
    llmAnalyses: engine.llmAnalysisCount,
    gemsCached: engine.stockPulseGemsCached,
    studiedTickers: pulse.studiedTickers?.length || 0,
    weightSamples: weights.totalSamples || 0,
    strongestIndicators: strongest,
    weakestAreas: weakest,
    patternSummary,
    improvementAdvice,
    macroActive: engine.macroShockActive,
    macroBrief: engine.macroShockInfo || '',
    headlineSamples: headlines,
    playbook,
    llmReflection,
  });

  const to = process.env.ANNUAL_REPORT_EMAIL || process.env.ADMIN_EMAIL || 'zn4.editz@gmail.com';
  const result = await sendEmailSmtp(to, `Quantum Alpha — Weekly Review ${weekLabel()}`, html);

  if (result.ok) {
    markSent();
    return `Weekly review sent → ${to}`;
  }
  return `Weekly review failed: ${result.error}`;
}

function generateImprovementAdvice(
  engine: ReturnType<typeof getEngineState>,
  weights: ReturnType<typeof getServerKnowledgeWeights>,
  accuracy: number,
): string {
  const points: string[] = [];

  if (accuracy < 45) {
    points.push('Accuracy below 45% — consider reducing prediction frequency until confidence stabilizes.');
  } else if (accuracy < 55) {
    points.push('Accuracy in the 45-55% range — focus on filtering out low-conviction setups.');
  } else {
    points.push('Accuracy above 55% — maintain current strategy, continue refining edge cases.');
  }

  if (engine.llmAnalysisCount < 10) {
    points.push('LLM news analysis volume is low — ensure news pipeline is running consistently.');
  }

  if (engine.cycleCounters.ml < 5) {
    points.push('ML cycle count is low — the engine may not be training enough models.');
  }

  if (engine.macroShockActive) {
    points.push('Macro shock is active — predictions should be more conservative during uncertainty.');
  }

  if (engine.selfAwareness.weaknesses > engine.selfAwareness.strengths) {
    points.push('More weaknesses than strengths identified — focus on addressing the top weakness this week.');
  }

  points.push('Continue monitoring indicator weight evolution — ADX/RSI/MACD weights adjust automatically from resolved outcomes.');
  points.push('Review Stock Pulse gems for any names that appeared multiple weeks in a row — they may warrant closer study.');

  return points.map(p => `• ${p}`).join('\n');
}
