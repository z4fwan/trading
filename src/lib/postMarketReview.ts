/**
 * Post-Market Deep-Learning Review (Quantum Alpha V3)
 *
 * Runs at ~16:00 IST after the close and closes the daily feedback loop:
 *
 *   1. Force-resolves any PENDING pre-market momentum picks and ACTIVE
 *      intraday calls against the final session high / low / close.
 *   2. Builds per-pick verdicts: HIT_TARGET / STOPPED_OUT / DIRECTION_OK /
 *      DIRECTION_WRONG, plus the max gain actually achieved vs. the target.
 *   3. Asks the LLM to analyze what went right / wrong and extract lessons.
 *   4. Sends the review to Telegram AND email automatically.
 *   5. Feeds every resolved outcome into the AI learning loop (Supabase
 *      prediction_history → experience_history → weight evolution), so the
 *      next day's picks inherit what today taught.
 */

import { getPreMarketPredictions, resolvePreMarketPredictions, getPreMarketStats } from './preMarketMomentumEngine';
import { getIntradayCalls, resolveCallsEndOfDay, type IntradayCall } from './intradayStore';
import { getAllCachedQuotes, getMarketContext } from './quoteFetcher';
import { getIstDateParts } from './adminAuthServer';
import { callLLM } from './llmProvider';
import { sendPostMarketReview } from './telegramBot';
import { sendEmailSmtp } from './annualReport/sendEmail';
import { getServiceClient } from './supabase';

const SENT_KEY = '__postMarketReviewSent';

/** Post-market review only ever runs at/after 16:00 IST unless forced. */
const POST_MARKET_IST_MINUTES = 16 * 60;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function istTodayKey(): string {
  const { year, month, day } = getIstDateParts();
  return `${year}-${month}-${day}`;
}

function istMinutes(): number {
  const t = new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour12: false });
  const [hh, mm] = t.split(':').map(Number);
  return hh * 60 + (mm || 0);
}

function isIstWeekday(): boolean {
  const { year, month, day } = getIstDateParts();
  const dow = new Date(year, month - 1, day).getUTCDay();
  return dow >= 1 && dow <= 5;
}

function getSentState(): { date: string; mins: number } | null {
  const g = globalThis as unknown as Record<string, string | undefined>;
  const raw = g[SENT_KEY];
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { date: string; mins: number };
    if (parsed && parsed.date) return parsed;
  } catch {
    /* legacy bare-date guard → treat as set outside the post-market window */
  }
  return { date: raw, mins: -1 };
}

function markSent(): void {
  (globalThis as unknown as Record<string, string>)[SENT_KEY] = JSON.stringify({
    date: istTodayKey(),
    mins: istMinutes(),
  });
}

function todayLabel(): string {
  const { year, month, day } = getIstDateParts();
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}

function statusEmoji(status: string): string {
  switch (status) {
    case 'HIT_TARGET': return '🎯';
    case 'STOPPED_OUT': return '⛔';
    case 'DIRECTION_OK': return '✅';
    case 'DIRECTION_WRONG': return '❌';
    default: return '⏳';
  }
}

function statusResult(status: string): 'CORRECT' | 'WRONG' | 'PARTIAL' {
  switch (status) {
    case 'HIT_TARGET': return 'CORRECT';
    case 'STOPPED_OUT': return 'WRONG';
    case 'DIRECTION_OK': return 'PARTIAL';
    case 'DIRECTION_WRONG': return 'WRONG';
    default: return 'PARTIAL';
  }
}

function statusAccuracy(status: string): number {
  switch (status) {
    case 'HIT_TARGET': return 85;
    case 'STOPPED_OUT': return 15;
    case 'DIRECTION_OK': return 55;
    case 'DIRECTION_WRONG': return 20;
    default: return 40;
  }
}

interface PickOutcome {
  ticker: string;
  name: string;
  source: 'PRE_MARKET' | 'INTRADAY';
  direction: 'BULLISH' | 'BEARISH';
  entry: number;
  target: number;
  stop: number;
  confidence: number;
  status: string;
  dayHigh: number;
  dayLow: number;
  dayClose: number;
  /** Best gain actually achieved from entry this session (BULLISH: high, BEARISH: low). */
  maxGainPct: number;
  /** Close-to-entry change, signed (negative means direction went wrong). */
  closePct: number;
  /** How far the max move fell short of (negative) or overshot (positive) the target %. */
  targetDeltaPct: number;
}

// ─── Data gathering ──────────────────────────────────────────────────────────

function buildPriceMap(): { prices: Record<string, number>; ranges: Record<string, { high: number; low: number }> } {
  const quoteCache = getAllCachedQuotes();
  const prices: Record<string, number> = {};
  const ranges: Record<string, { high: number; low: number }> = {};
  for (const [sym, q] of Object.entries(quoteCache)) {
    if (!q || !q.price || q.price <= 0) continue;
    const plain = sym.replace('.NS', '').replace('.BO', '');
    prices[sym] = q.price;
    if (q.high || q.low) ranges[sym] = { high: q.high ?? q.price, low: q.low ?? q.price };
    if (plain !== sym) {
      prices[plain] = q.price;
      if (ranges[sym]) ranges[plain] = ranges[sym];
    }
  }
  return { prices, ranges };
}

function pickOutcomes(): PickOutcome[] {
  const { prices, ranges } = buildPriceMap();
  const outcomes: PickOutcome[] = [];

  // Pre-market predictions carry a UTC date string (same format the resolver
  // uses via isToday). Only today's resolved picks belong in today's review.
  const todayUtc = new Date().toISOString().split('T')[0];
  const { year, month, day } = getIstDateParts();
  const todayStartMs = new Date(year, month - 1, day, 0, 0, 0, 0).getTime();

  for (const p of getPreMarketPredictions()) {
    if (p.status === 'PENDING' || p.date !== todayUtc) continue;
    const range = ranges[p.ticker] ?? ranges[`${p.ticker}.NS`] ?? ranges[`${p.ticker}.BO`];
    const high = range?.high ?? p.dayHigh ?? 0;
    const low = range?.low ?? p.dayLow ?? 0;
    const close = prices[p.ticker] ?? prices[`${p.ticker}.NS`] ?? prices[`${p.ticker}.BO`] ?? p.dayClose ?? 0;
    if (!high || !low || !close) continue;
    const maxGainPct = ((high - p.entry) / p.entry) * 100;
    const closePct = ((close - p.entry) / p.entry) * 100;
    const targetPct = ((p.target - p.entry) / p.entry) * 100;
    outcomes.push({
      ticker: p.ticker,
      name: p.name,
      source: 'PRE_MARKET',
      direction: p.direction,
      entry: p.entry,
      target: p.target,
      stop: p.stop,
      confidence: p.score,
      status: p.status,
      dayHigh: high,
      dayLow: low,
      dayClose: close,
      maxGainPct,
      closePct,
      targetDeltaPct: maxGainPct - targetPct,
    });
  }

  for (const c of getIntradayCalls()) {
    if (c.status === 'ACTIVE' || c.createdAt < todayStartMs) continue;
    const range = ranges[c.ticker] ?? ranges[`${c.ticker}.NS`] ?? ranges[`${c.ticker}.BO`];
    const high = range?.high ?? c.currentPrice;
    const low = range?.low ?? c.currentPrice;
    const close = c.currentPrice;
    const maxGainPct = c.direction === 'BULLISH'
      ? ((high - c.entryPrice) / c.entryPrice) * 100
      : ((c.entryPrice - low) / c.entryPrice) * 100;
    const closePct = ((close - c.entryPrice) / c.entryPrice) * 100;
    const targetPct = Math.abs((c.targetPrice - c.entryPrice) / c.entryPrice) * 100;
    outcomes.push({
      ticker: c.ticker,
      name: c.name,
      source: 'INTRADAY',
      direction: c.direction,
      entry: c.entryPrice,
      target: c.targetPrice,
      stop: c.stopLoss,
      confidence: c.confidence,
      status: c.status,
      dayHigh: high,
      dayLow: low,
      dayClose: close,
      maxGainPct,
      closePct,
      targetDeltaPct: maxGainPct - targetPct,
    });
  }

  return outcomes;
}

// ─── LLM deep-dive ───────────────────────────────────────────────────────────

async function llmDeepDive(outcomes: PickOutcome[]): Promise<string | null> {
  const mkt = getMarketContext();
  const lines = outcomes.map(o => {
    const dir = o.direction === 'BULLISH' ? 'BUY' : 'SELL';
    return `${o.ticker} (${o.source} ${dir} conf ${o.confidence}): entry ₹${o.entry} → target ₹${o.target} | stop ₹${o.stop} ⇒ ${o.status} (day high ${o.dayHigh}, low ${o.dayLow}, close ${o.dayClose}, max gain ${o.maxGainPct.toFixed(2)}%, close ${o.closePct.toFixed(2)}%)`;
  }).join('\n');

  const wins = outcomes.filter(o => o.status === 'HIT_TARGET' || o.status === 'DIRECTION_OK').length;
  const winRate = outcomes.length ? (wins / outcomes.length) * 100 : 0;

  const prompt = `You are the learning core of an autonomous intraday trading AI. Review today's resolved calls and extract lessons.

MARKET: Nifty ${mkt.niftyChangePct >= 0 ? '+' : ''}${mkt.niftyChangePct.toFixed(2)}% (${mkt.marketPhase}).
TODAY: ${wins}/${outcomes.length} wins (${winRate.toFixed(1)}%).

CALLS:
${lines}

CRITICAL INSTRUCTIONS:
Analyze strictly what the data shows:
1. Which calls won and which lost, and the most likely reason (gap chase, weak entry, missed target by X%, stop too tight, direction wrong).
2. One concrete pattern in today's outcomes (e.g. "gap-up entries >3% faded after 10:30").
3. One specific adjustment to tomorrow's selection (threshold, filter, or timing).
4. Rate today 1-10 as a signal day.

Keep it tight and data-driven, 5-8 sentences, no filler.`;

  try {
    const { content } = await callLLM('System', prompt, 800);
    return content;
  } catch {
    return null;
  }
}

// ─── Persist to learning loop ────────────────────────────────────────────────

async function feedLearningLoop(outcomes: PickOutcome[]): Promise<number> {
  const svc = getServiceClient();
  if (!svc) {
    console.warn('[PostMarketReview] No Supabase service client — outcomes not persisted to learning loop.');
    return 0;
  }

  const key = istTodayKey();
  const now = Date.now();
  const marketPhase = getMarketContext().marketPhase;
  let stored = 0;

  for (const o of outcomes) {
    const pnl = ((o.dayClose - o.entry) / o.entry) * 100;
    const row = {
      id: `pmr-${key}-${o.source}-${o.ticker}-${o.entry}`,
      ticker: o.ticker,
      name: o.name,
      source: o.source === 'PRE_MARKET' ? 'PRE_MARKET_MOMENTUM' : 'INTRADAY_AUTO',
      prediction_type: 'DAILY',
      direction: o.direction,
      bullish_prob: o.direction === 'BULLISH' ? o.confidence : 100 - o.confidence,
      bearish_prob: o.direction === 'BEARISH' ? o.confidence : 100 - o.confidence,
      confidence: o.confidence,
      entry_price: o.entry,
      target_price: o.target,
      stop_loss: o.stop,
      expected_volatility: Math.abs(((o.target - o.entry) / o.entry) * 100),
      market_condition: marketPhase,
      regime: o.source === 'PRE_MARKET' ? 'PRE_MARKET_MOMENTUM' : 'INTRADAY',
      sentiment_score: 0,
      ta_snapshot: null,
      reasoning: '[]',
      created_at: now,
      resolved: true,
      resolved_at: now,
      actual_price: o.dayClose,
      result: statusResult(o.status),
      accuracy_percent: statusAccuracy(o.status),
      deviation_percent: Math.abs(o.closePct),
      simulated_pnl: pnl,
      time_to_validation: 0,
    };
    try {
      const { error } = await (svc as any).from('prediction_history').upsert(row, { onConflict: 'id' });
      if (!error) stored++;
    } catch { /* row-level failure shouldn't stop the rest */ }
  }

  console.log(`[PostMarketReview] Learning loop fed ${stored}/${outcomes.length} outcomes (key ${key})`);
  return stored;
}

// ─── Rendering ───────────────────────────────────────────────────────────────

function renderReviewHtml(ctx: {
  date: string;
  outcomes: PickOutcome[];
  wins: number;
  winRate: number;
  hits: number;
  stops: number;
  ok: number;
  wrong: number;
  preMarketCount: number;
  intradayCount: number;
  nifty: number;
  lessons: string | null;
}): string {
  const rows = ctx.outcomes.map(o => {
    const dir = o.direction === 'BULLISH' ? 'BUY' : 'SELL';
    return `<tr>
      <td><b>${o.ticker}</b></td>
      <td>${o.source === 'PRE_MARKET' ? 'Pre-Market' : 'Intraday'}</td>
      <td>${dir} (${o.confidence}%)</td>
      <td>₹${o.entry}</td>
      <td>₹${o.target}</td>
      <td>₹${o.stop}</td>
      <td>${statusEmoji(o.status)} ${o.status}</td>
      <td>${o.maxGainPct.toFixed(2)}%</td>
      <td class="${o.targetDeltaPct >= 0 ? 'green' : 'red'}">${o.targetDeltaPct.toFixed(2)}%</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/>
<title>Quantum Alpha — Post-Market Review ${ctx.date}</title>
<style>
  body{margin:0;padding:0;background:#0b1220;color:#e2e8f0;font-family:'Segoe UI',system-ui,sans-serif;font-size:14px;line-height:1.55}
  .wrap{max-width:760px;margin:0 auto;padding:24px 20px 40px}
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
  table{width:100%;border-collapse:collapse;font-size:12px;margin:8px 0}
  th{color:#94a3b8;text-align:left;padding:6px 8px;border-bottom:1px solid #1e293b;text-transform:uppercase;font-size:10px;letter-spacing:0.05em}
  td{padding:6px 8px;border-bottom:1px solid #1e293b}
  tr:hover{background:#131c2e}
  .lessons{background:#1a2332;border-left:3px solid #3b82f6;padding:12px 14px;border-radius:6px;margin:10px 0;white-space:pre-wrap;font-size:13px;line-height:1.5}
  hr{border:none;border-top:1px solid #1e293b;margin:20px 0}
  .muted{color:#64748b;font-size:12px}
  .center{text-align:center}
</style></head>
<body><div class="wrap">
  <h1>📊 Post-Market AI Review — ${ctx.date}</h1>
  <p class="sub">Today's calls graded against final session high/low/close &bull; Nifty ${ctx.nifty >= 0 ? '+' : ''}${ctx.nifty.toFixed(2)}%</p>

  <h2>🎯 Today's Scorecard</h2>
  <div class="card">
    <div class="row"><span class="label">Wins / Total</span><span class="val green">${ctx.wins}</span><span class="val">/ ${ctx.outcomes.length}</span></div>
    <div class="row"><span class="label">Win Rate</span><span class="val ${ctx.winRate >= 55 ? 'green' : ctx.winRate >= 40 ? 'amber' : 'red'}">${ctx.winRate.toFixed(1)}%</span></div>
    <div class="row"><span class="label">Targets Hit / Stops</span><span class="val"><span class="green">${ctx.hits}</span> / <span class="red">${ctx.stops}</span></span></div>
    <div class="row"><span class="label">Direction OK / Wrong</span><span class="val"><span class="green">${ctx.ok}</span> / <span class="red">${ctx.wrong}</span></span></div>
    <div class="row"><span class="label">Pre-Market Picks</span><span class="val">${ctx.preMarketCount}</span></div>
    <div class="row"><span class="label">Intraday Calls</span><span class="val">${ctx.intradayCount}</span></div>
  </div>

  <h2>📋 Per-Pick Verdicts</h2>
  <div class="card">
    <table>
      <tr><th>Ticker</th><th>Source</th><th>Call</th><th>Entry</th><th>Target</th><th>Stop</th><th>Result</th><th>Max Gain</th><th>vs Target</th></tr>
      ${rows}
    </table>
    <p class="muted">"Max Gain" = best move from entry this session. "vs Target" = how far the max move overshot (+) or fell short (−) of the planned target.</p>
  </div>

  ${ctx.lessons ? `<h2>🧠 AI Self-Learning</h2><div class="lessons">${ctx.lessons}</div>` : ''}

  <hr/>
  <p class="muted center" style="font-size:11px">Quantum Alpha Terminal &bull; Fully autonomous AI &bull; Outcomes fed to learning loop &bull; Generated ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
</div></body></html>`;
}

// ─── Main entry ──────────────────────────────────────────────────────────────

export async function runPostMarketReview(force = false): Promise<string | null> {
  if (!force) {
    const sent = getSentState();
    if (sent && sent.date === istTodayKey() && sent.mins >= POST_MARKET_IST_MINUTES) return null;
    if (!isIstWeekday()) return null;
    // Never run the "post-market" review mid-session: quotes are still moving
    // and resolving now would freeze a premature verdict for the day.
    if (istMinutes() < POST_MARKET_IST_MINUTES) return null;
  }

  // 1. Force-resolve any leftovers against the final session range.
  const { prices, ranges } = buildPriceMap();
  try {
    resolvePreMarketPredictions();
    const intraday = resolveCallsEndOfDay(prices, ranges);
    if (intraday.resolved > 0) {
      console.log(`[PostMarketReview] End-of-day resolved ${intraday.resolved} intraday calls (${intraday.active} left active)`);
    }
  } catch (e) {
    console.warn(`[PostMarketReview] Resolution step failed:`, e);
  }

  // 2. Collect the day's outcomes.
  const outcomes = pickOutcomes();
  if (outcomes.length === 0) {
    console.log(`[PostMarketReview] No resolved calls today — nothing to review.`);
    markSent();
    return null;
  }

  const wins = outcomes.filter(o => o.status === 'HIT_TARGET' || o.status === 'DIRECTION_OK').length;
  const winRate = (wins / outcomes.length) * 100;
  const hits = outcomes.filter(o => o.status === 'HIT_TARGET').length;
  const stops = outcomes.filter(o => o.status === 'STOPPED_OUT').length;
  const ok = outcomes.filter(o => o.status === 'DIRECTION_OK').length;
  const wrong = outcomes.filter(o => o.status === 'DIRECTION_WRONG').length;

  // 3. LLM deep-dive (best-effort; never blocks delivery).
  let lessons: string | null = null;
  try {
    lessons = await llmDeepDive(outcomes);
  } catch { /* optional */ }

  // 4. Telegram.
  const stats = `🎯 ${wins}/${outcomes.length} wins (${winRate.toFixed(0)}%) — 🎯${hits} targets • ⛔${stops} stops • ✅${ok} ok • ❌${wrong} wrong`;
  const pickLines = outcomes.map((o, i) => {
    const dir = o.direction === 'BULLISH' ? '🟢' : '🔴';
    return `${i + 1}. ${statusEmoji(o.status)} <b>${o.ticker}</b> ${dir} ${o.source} | conf ${o.confidence}%\n     Entry <code>₹${o.entry}</code> → Target <code>₹${o.target}</code> | Max <code>${o.maxGainPct >= 0 ? '+' : ''}${o.maxGainPct.toFixed(2)}%</code> (vs target ${o.targetDeltaPct >= 0 ? '+' : ''}${o.targetDeltaPct.toFixed(2)}%)`;
  });
  await sendPostMarketReview({
    headline: `📊 <b>POST-MARKET AI REVIEW — ${todayLabel()}</b>`,
    stats,
    pickLines: pickLines.slice(0, 18),
    llmLessons: lessons,
  });

  // 5. Email.
  const html = renderReviewHtml({
    date: todayLabel(),
    outcomes,
    wins,
    winRate,
    hits,
    stops,
    ok,
    wrong,
    preMarketCount: outcomes.filter(o => o.source === 'PRE_MARKET').length,
    intradayCount: outcomes.filter(o => o.source === 'INTRADAY').length,
    nifty: getMarketContext().niftyChangePct,
    lessons,
  });
  const to = process.env.ANNUAL_REPORT_EMAIL || process.env.ADMIN_EMAIL || 'zn4.editz@gmail.com';
  const email = await sendEmailSmtp(to, `Quantum Alpha — Post-Market Review ${todayLabel()}`, html);

  // 6. Feed learning loop.
  const fed = await feedLearningLoop(outcomes);

  markSent();

  const pmStats = getPreMarketStats();
  const msg = `Post-market review sent → Telegram + ${email.ok ? to : `email failed (${email.error})`}. ${fed} outcomes fed to learning loop. All-time pre-market: ${pmStats.resolved} resolved, ${(pmStats.winRate * 100).toFixed(0)}% win.`;
  console.log(`[PostMarketReview] ${msg}`);
  return msg;
}
