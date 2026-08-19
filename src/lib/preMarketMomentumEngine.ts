/**
 * Pre-Market Momentum Engine (Quantum Alpha V3)
 *
 * Predicts the day's likely high-momentum winners BEFORE the market opens and
 * again right after the open, using the NSE Pre-Open auction order book and the
 * live quote cache. Every pick is persisted and resolved at end of day so the
 * system's accuracy is measured and reported instead of guessed:
 *
 *   - 9:00 AM  → NSE pre-open auction: expected gap-up + buy-queue pressure
 *   - 9:12 AM  → post-open confirmation: open gap + price still holding gains
 *   - 15:45 PM → resolve every pick against the day's high/low/close
 *
 * The Telegram report is suppressed when the tracked win rate proves the
 * strategy is worse than a coin flip (with enough resolved samples), so the
 * bot never spams unprofitable calls.
 */

import fs from 'fs';
import path from 'path';
import { fetchLivePreOpenData, type PreOpenData } from './nsePreOpenFetcher';
import { getAllCachedQuotes } from './quoteFetcher';
import { getDynamicIndianUniverse } from './dynamicUniverse';
import { tickerToYahoo, getTickerName, normalizeTicker } from './marketConfig';
import { sendPreMarketMomentumReport } from './telegramBot';

export type MomentumWindow = 'PRE_OPEN' | 'POST_OPEN' | 'RE_SCAN';
export type PredictionStatus = 'PENDING' | 'HIT_TARGET' | 'STOPPED_OUT' | 'DIRECTION_OK' | 'DIRECTION_WRONG';

export interface MomentumPick {
  ticker: string;
  name: string;
  entry: number;
  target: number;
  stop: number;
  gapPct: number;
  score: number;
  signals: string[];
}

export interface MomentumPrediction extends MomentumPick {
  id: string;
  date: string;
  direction: 'BULLISH';
  source: MomentumWindow;
  status: PredictionStatus;
  dayHigh?: number;
  dayLow?: number;
  dayClose?: number;
  createdAt: number;
  resolvedAt?: number;
}

interface PersistedData {
  predictions: MomentumPrediction[];
  lastScanDate: string;
}

interface AccuracyStats {
  total: number;
  resolved: number;
  pending: number;
  hits: number;
  stops: number;
  ok: number;
  wrong: number;
  hitRate: number;
  winRate: number;
}

const STORE_PATH = path.join(process.cwd(), '.premarket-predictions.json');
const MAX_PICKS = 10;
const MIN_PRICE = 20;
const MIN_GAP_PCT = 0.5;
const MIN_SCORE = 55;
const TARGET_PCT = 1.5;
const STOP_PCT = 1.0;
/** Resolved samples needed before the accuracy gate starts suppressing. */
const GATE_MIN_RESOLVED = 12;
/** Below this win rate (of resolved samples) the report is suppressed. */
const GATE_MIN_WIN_RATE = 0.5;

function loadFromDisk(): PersistedData {
  try {
    if (fs.existsSync(STORE_PATH)) {
      return JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8'));
    }
  } catch { /* corrupt or missing */ }
  return { predictions: [], lastScanDate: '' };
}

const persisted = loadFromDisk();
const predictions: MomentumPrediction[] = persisted.predictions;
let lastScanDate = persisted.lastScanDate;

function persist(): void {
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify({ predictions, lastScanDate }, null, 2), 'utf-8');
  } catch { /* silent */ }
}

export function getPreMarketPredictions(): MomentumPrediction[] {
  return [...predictions];
}

export function getPreMarketStats(): AccuracyStats {
  const resolved = predictions.filter(p => p.status !== 'PENDING');
  const hits = resolved.filter(p => p.status === 'HIT_TARGET').length;
  const stops = resolved.filter(p => p.status === 'STOPPED_OUT').length;
  const ok = resolved.filter(p => p.status === 'DIRECTION_OK').length;
  const wrong = resolved.filter(p => p.status === 'DIRECTION_WRONG').length;
  const hitRate = resolved.length > 0 ? hits / resolved.length : 0;
  const winRate = resolved.length > 0 ? (hits + ok) / resolved.length : 0;
  return {
    total: predictions.length,
    resolved: resolved.length,
    pending: predictions.filter(p => p.status === 'PENDING').length,
    hits, stops, ok, wrong,
    hitRate, winRate,
  };
}

function todayStr(now = new Date()): string {
  return now.toISOString().split('T')[0];
}

function isToday(date: string): boolean {
  return date === todayStr();
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

function scoreGap(gapPct: number): { points: number; label: string } {
  if (gapPct >= 8) return { points: 22, label: `gap ${gapPct.toFixed(1)}% (chase risk)` };
  if (gapPct >= 5) return { points: 30, label: `gap ${gapPct.toFixed(1)}%` };
  if (gapPct >= 3) return { points: 25, label: `gap ${gapPct.toFixed(1)}%` };
  if (gapPct >= 1.5) return { points: 18, label: `gap ${gapPct.toFixed(1)}%` };
  if (gapPct >= MIN_GAP_PCT) return { points: 10, label: `gap ${gapPct.toFixed(1)}%` };
  return { points: 0, label: '' };
}

function scoreBuyQueue(buyRatio: number): { points: number; label: string } {
  if (buyRatio >= 4) return { points: 30, label: `buy queue ${buyRatio.toFixed(1)}x sellers` };
  if (buyRatio >= 2.5) return { points: 25, label: `buy queue ${buyRatio.toFixed(1)}x sellers` };
  if (buyRatio >= 1.75) return { points: 18, label: `buy queue ${buyRatio.toFixed(1)}x sellers` };
  if (buyRatio >= 1.2) return { points: 10, label: `buy queue ${buyRatio.toFixed(1)}x sellers` };
  return { points: 0, label: '' };
}

function scoreLiquidity(price: number, volume: number): { points: number; label: string } {
  const signals: string[] = [];
  let points = 0;
  if (volume >= 200_000) { points += 20; signals.push(`pre-open volume ${(volume / 1000).toFixed(0)}K`); }
  else if (volume >= 50_000) { points += 12; signals.push(`volume ${(volume / 1000).toFixed(0)}K`); }
  else { points += 5; }
  if (price >= 500) { points += 10; signals.push('high-priced'); }
  else if (price >= 100) { points += 7; }
  else { points += 4; }
  return { points, label: signals.join(', ') };
}

/**
 * Pre-open pass: rank the NSE pre-open auction order book. The auction shows
 * where the market intends to open (gap) and whether buyers outnumber sellers.
 */
async function scanPreOpen(now: Date): Promise<MomentumPick[]> {
  const preOpen: PreOpenData[] = await fetchLivePreOpenData();
  if (preOpen.length === 0) {
    console.log('[PreMarketMomentum] Pre-open auction data unavailable (outside 9:00-9:08 window or NSE block).');
    return [];
  }

  const universe = new Set(getDynamicIndianUniverse());
  const picks: MomentumPick[] = [];

  for (const item of preOpen) {
    const ticker = normalizeTicker(item.symbol);
    if (!universe.has(ticker)) continue;
    const price = item.finalPrice;
    const gapPct = item.pChange;
    if (!price || price < MIN_PRICE || !isFinite(gapPct) || gapPct < MIN_GAP_PCT) continue;
    if (!item.totalBuyQuantity || item.totalBuyQuantity <= 0) continue;

    const buyRatio = item.totalBuyQuantity / (item.totalSellQuantity || 1);
    const gap = scoreGap(gapPct);
    const queue = scoreBuyQueue(buyRatio);
    const liq = scoreLiquidity(price, item.totalTradedVolume);
    if (queue.points === 0) continue; // no buyer pressure → auction is not confirming

    const score = Math.min(90, gap.points + queue.points + liq.points);
    if (score < MIN_SCORE) continue;

    const signals = [gap.label, queue.label, liq.label].filter(Boolean);
    picks.push({
      ticker,
      name: getTickerName(ticker),
      entry: price,
      target: +(price * (1 + TARGET_PCT / 100)).toFixed(2),
      stop: +(price * (1 - STOP_PCT / 100)).toFixed(2),
      gapPct,
      score,
      signals,
    });
  }

  return picks.sort((a, b) => b.score - a.score).slice(0, MAX_PICKS);
}

/**
 * Post-open pass: confirm candidates from the live quote cache. A gap that
 * fades in the first minutes is not a momentum pick — the stock must still be
 * trading above its open. Also avoids chasing huge gaps (mean-reversion risk).
 */
async function scanPostOpen(now: Date, window: MomentumWindow): Promise<MomentumPick[]> {
  const quotes = getAllCachedQuotes();
  const today = todayStr(now);
  const already = new Set(predictions.filter(p => p.date === today).map(p => p.ticker));
  const picks: MomentumPick[] = [];

  for (const [sym, q] of Object.entries(quotes)) {
    const ticker = normalizeTicker(sym);
    if (already.has(ticker)) continue;
    if (!q || !q.price || q.price <= 0) continue;
    const prevClose = q.prevClose ?? 0;
    const open = q.open ?? 0;
    if (!prevClose || !open || !isFinite(prevClose) || !isFinite(open)) continue;

    // RE_SCAN alerts must be actionable at send time: only include stocks with
    // a fresh live quote (cache rotates every ~2s, so anything older is stale).
    if (window === 'RE_SCAN' && Date.now() - (q.timestamp ?? 0) > 3 * 60 * 1000) continue;

    const openGap = (open - prevClose) / prevClose * 100;
    if (openGap < MIN_GAP_PCT || openGap >= 8) continue; // chase risk above 8%
    // Must still be holding gains above the open (gap not fading).
    const holdsGain = q.price >= open && (q.changePercent ?? 0) > 0;
    if (!holdsGain) continue;
    const price = q.price;
    if (price < MIN_PRICE) continue;

    const gap = scoreGap(openGap);
    const queue = scoreBuyQueue(openGap > 0 ? 1.3 : 1); // post-open proxy: real buy queue unavailable
    const liq = scoreLiquidity(price, q.volume ?? 0);
    const score = Math.min(90, gap.points + queue.points + liq.points);
    if (score < MIN_SCORE) continue;

    const signals = [gap.label, 'holding above open', liq.label].filter(Boolean);
    // Entry basis: the 9:12 POST_OPEN pick is "buy the open" (price ≈ open
    // right after the auction), but a 9:30+ RE_SCAN must quote the LIVE price
    // — quoting yesterday's open there makes the alert look stale/wrong.
    const base = window === 'RE_SCAN' ? price : open;
    picks.push({
      ticker,
      name: getTickerName(ticker),
      entry: base,
      target: +(base * (1 + TARGET_PCT / 100)).toFixed(2),
      stop: +(base * (1 - STOP_PCT / 100)).toFixed(2),
      gapPct: openGap,
      score,
      signals,
    });
  }

  return picks.sort((a, b) => b.score - a.score).slice(0, MAX_PICKS);
}

// ─── Main entry ──────────────────────────────────────────────────────────────

export async function runPreMarketMomentumScan(window: MomentumWindow, opts?: { silent?: boolean }): Promise<MomentumPick[]> {
  const now = new Date();
  const today = todayStr(now);

  // One scan per window per day (silent/dry runs still consume the slot).
  const windowKey = `${today}:${window}`;
  if (lastScanDate === windowKey) return [];
  lastScanDate = windowKey;
  persist();

  let picks: MomentumPick[] = [];
  try {
    picks = window === 'PRE_OPEN' ? await scanPreOpen(now) : await scanPostOpen(now, window);
  } catch (e) {
    console.error(`[PreMarketMomentum] ${window} scan failed:`, e);
    return [];
  }

  if (picks.length === 0) {
    console.log(`[PreMarketMomentum] ${window} yielded 0 qualifying momentum picks.`);
    return [];
  }

  const stats = getPreMarketStats();

  // Accuracy gate: if enough picks have been resolved and the strategy is
  // worse than a coin flip, hold the report back instead of spamming.
  const gateActive = stats.resolved >= GATE_MIN_RESOLVED && stats.winRate < GATE_MIN_WIN_RATE;
  if (gateActive) {
    console.log(`[PreMarketMomentum] Suppressed report — win rate ${(stats.winRate * 100).toFixed(0)}% (${stats.hits + stats.ok}/${stats.resolved}) below gate. ${picks.length} picks held back.`);
    return [];
  }

  if (opts?.silent) {
    console.log(`[PreMarketMomentum] ${window} dry-run: ${picks.length} qualifying picks (${picks.map(p => p.ticker).join(', ')})`);
    return picks;
  }

  for (const pick of picks) {
    predictions.push({
      ...pick,
      id: `pm-${pick.ticker}-${now.getTime()}`,
      date: today,
      direction: 'BULLISH',
      source: window,
      status: 'PENDING',
      createdAt: now.getTime(),
    });
  }
  persist();

  try {
    await sendPreMarketMomentumReport(picks, window, stats);
    console.log(`[PreMarketMomentum] ${window}: reported ${picks.length} picks (${picks.map(p => p.ticker).join(', ')})`);
  } catch (e) {
    console.error(`[PreMarketMomentum] Telegram report failed:`, e);
  }
  return picks;
}

/**
 * End-of-day resolution: mark every PENDING pick as HIT_TARGET / STOPPED_OUT /
 * DIRECTION_OK / DIRECTION_WRONG using the day's cached high/low/close. Runs
 * after the close so the accuracy ledger is fresh each morning.
 */
export function resolvePreMarketPredictions(now = new Date()): number {
  const quotes = getAllCachedQuotes();
  let resolved = 0;

  for (const p of predictions) {
    if (p.status !== 'PENDING' || !isToday(p.date)) continue;
    const q = quotes[tickerToYahoo(p.ticker)];
    if (!q) continue;
    const high = q.high ?? 0;
    const low = q.low ?? 0;
    const close = q.price ?? 0;
    if (!high || !low || !close) continue;

    if (p.direction === 'BULLISH') {
      if (high >= p.target) p.status = 'HIT_TARGET';
      else if (low <= p.stop) p.status = 'STOPPED_OUT';
      else p.status = close > p.entry ? 'DIRECTION_OK' : 'DIRECTION_WRONG';
    }
    p.dayHigh = high;
    p.dayLow = low;
    p.dayClose = close;
    p.resolvedAt = now.getTime();
    resolved++;
  }

  if (resolved > 0) {
    persist();
    const s = getPreMarketStats();
    console.log(`[PreMarketMomentum] Resolved ${resolved} picks → hits=${s.hits} stops=${s.stops} ok=${s.ok} wrong=${s.wrong} (win ${(s.winRate * 100).toFixed(0)}%)`);
  }
  return resolved;
}
