/**
 * Realtime Watchdog — event-driven anomaly detection + instant ML prediction.
 *
 * Runs on EVERY quote cycle (sub-second) instead of waiting for the slow 5-min
 * ML cycle. Detects fast price spikes, momentum bursts, volume surges and day
 * breakouts across the Indian universe, then immediately asks the Python ML
 * engine for a prediction. Strong predictions are pushed to Telegram and the
 * live WebSocket (via IPC ALERT_PAYLOAD) in milliseconds.
 */
import YahooFinance from 'yahoo-finance2';
import { isIndianTicker, tickerToYahoo, normalizeTicker, getTickerName } from './marketConfig';
import { getAllCachedQuotes, type QuoteEntry } from './quoteFetcher';
import { getPythonMLPrediction } from './pythonBridge';
import { sendRealtimePredictionAlert } from './telegramBot';
import { buildCandleHistory, calculateIndicators, generatePrediction } from './technicalAnalysis';
import type { OHLC } from './technicalAnalysis';
import { getExchangeStatus } from './exchangeHours';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'], validation: { logErrors: false } });

export type RealtimeTriggerType = 'TICK_SPIKE' | 'MOMENTUM_BURST' | 'VOLUME_SURGE' | 'DAY_BREAKOUT' | 'NEWS';

export interface RealtimeAlert {
  id: string;
  type: 'REALTIME';
  source: 'LIVE_WATCHDOG' | 'NEWS_TRIGGER';
  ticker: string;
  name: string;
  direction: 'BULLISH' | 'BEARISH';
  probability: number;
  confidence: number;
  price: number;
  changePercent: number;
  trigger: RealtimeTriggerType;
  detail: string;
  ts: number;
  model?: string;
}

// --- Thresholds (ms-level reaction tuning) ---
const TICK_MOVE_PCT = 0.6;          // |move| within one quote tick
const MOMENTUM_WINDOW_MS = 180_000; // 3 minute burst window
const MOMENTUM_MOVE_PCT = 1.8;      // cumulative move over the window
const VOLUME_SURGE_RATIO = 2.5;     // volume vs rolling average
const MIN_VOLUME = 30_000;          // minimum liquidity to avoid penny noise
const DAY_MOVE_PCT = 3.0;           // intraday cumulative move
const COOLDOWN_MS = 15 * 60_000;    // per-ticker alert cooldown
const NEWS_COOLDOWN_MS = 10 * 60_000;
const MIN_PROB_DELTA = 18;           // |ML prob - 50| >= 18 (68% / 32%) to alert — accuracy floor
const MIN_ALERT_CONFIDENCE = 50;     // derived confidence below this never reaches Telegram
const MAX_CONCURRENT = 2;           // parallel /predict calls
const MAX_QUEUE = 20;
const MAX_ALERTS = 50;
const WINDOW_SIZE = 30;

/**
 * High-momentum names deserve a first look — tighter trigger thresholds and
 * front-of-queue prediction so the day's biggest movers always get a realtime
 * read instead of being starved by the 20-slot queue.
 */
const HIGH_MOMENTUM_WATCHLIST = new Set([
  'QUESS', 'BAJFINANCE', 'BALKRISIND', 'BAJAJFINSV', 'MAHSCOOTER', 'THOMASCOOK',
  'ASHOKLEY', 'HFCL', 'GAIL', 'TORNTPHARM', 'INOXWIND', 'KEI', 'MMTC', 'CHOLAFIN',
  'RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'SBIN', 'ICICIBANK', 'BAJAJHLDNG',
  'BEL', 'HAL', 'BHEL', 'TRENT', 'DMART', 'JIOFIN', 'SWIGGY', 'ZOMATO',
]);

/**
 * Lightweight headline sentiment for news-triggered alerts. The catalyst, not
 * the ML probability, decides the direction of a news alert — a broker "Buy"
 * note or an order-win headline must never produce a SELL alert.
 */
const POSITIVE_NEWS = ['buy', 'target', 'upgrade', 'order', 'win', 'wins', 'profit', 'rise', 'rises', 'record', 'beat', 'approve', 'approval', 'growth', 'strong', 'rally', 'surge', 'jump', 'positive', 'gain', 'recommend', 'recommendation', 'outperform', 'overweight', 'buyback', 'dividend', 'bonus', 'stake', 'investment', 'award', 'partnership', 'expansion', 'breakout', 'granted'];
const NEGATIVE_NEWS = ['sell', 'downgrade', 'loss', 'falls', 'fall', 'decline', 'default', 'probe', 'investigation', 'fraud', 'penalty', 'slump', 'crash', 'plunge', 'underperform', 'reduce', 'cancel', 'cancellation', 'delay', 'debt', 'litigation', 'suspension', 'negative', 'weak', 'warning', 'probe', 'survey', 'disappoint'];

function classifyNewsSentiment(headline: string): 'BULLISH' | 'BEARISH' | 'NEUTRAL' {
  const h = headline.toLowerCase();
  let score = 0;
  for (const w of POSITIVE_NEWS) if (h.includes(w)) score++;
  for (const w of NEGATIVE_NEWS) if (h.includes(w)) score--;
  return score > 0 ? 'BULLISH' : score < 0 ? 'BEARISH' : 'NEUTRAL';
}

interface TickerState {
  price: number;
  prevPrice: number | null;
  ts: number;
  window: { ts: number; price: number }[];
  volWindow: number[];
  lastAlertAt: number;
}

const tickerStates = new Map<string, TickerState>();
const newsLocks = new Map<string, number>();
let inFlight = 0;
const queue: { ticker: string; trigger: RealtimeTriggerType; detail: string; newsSentiment?: 'BULLISH' | 'BEARISH' | 'NEUTRAL' }[] = [];
let recentAlerts: RealtimeAlert[] = [];
let evaluating = false;

export function getRealtimeAlerts(): RealtimeAlert[] {
  return [...recentAlerts];
}

function getState(ticker: string, price: number, now: number): TickerState {
  let st = tickerStates.get(ticker);
  if (!st) {
    st = { price, prevPrice: null, ts: now, window: [], volWindow: [], lastAlertAt: 0 };
    tickerStates.set(ticker, st);
  }
  return st;
}

function describeTrigger(triggers: RealtimeTriggerType[], q: QuoteEntry, tickMove: number, windowMove: number, volRatio: number): string {
  const parts: string[] = [];
  if (triggers.includes('TICK_SPIKE')) parts.push(`${tickMove.toFixed(2)}% move in one tick`);
  if (triggers.includes('MOMENTUM_BURST')) parts.push(`${windowMove.toFixed(2)}% burst in 3m`);
  if (triggers.includes('VOLUME_SURGE')) parts.push(`volume ${volRatio.toFixed(1)}x avg`);
  if (triggers.includes('DAY_BREAKOUT')) parts.push(`day move ${Math.abs(q.changePercent ?? 0).toFixed(2)}%`);
  return parts.join(', ');
}

function enqueue(ticker: string, trigger: RealtimeTriggerType, detail: string, newsSentiment?: 'BULLISH' | 'BEARISH' | 'NEUTRAL'): void {
  const job = { ticker, trigger, detail, newsSentiment };
  if (queue.length >= MAX_QUEUE) queue.shift();
  // High-momentum names jump the queue so they always get a prediction.
  if (HIGH_MOMENTUM_WATCHLIST.has(ticker)) queue.unshift(job);
  else queue.push(job);
  void drain();
}

async function drain(): Promise<void> {
  while (inFlight < MAX_CONCURRENT && queue.length > 0) {
    const job = queue.shift()!;
    inFlight++;
    void runPrediction(job).finally(() => { inFlight--; });
  }
}

async function runPrediction(job: { ticker: string; trigger: RealtimeTriggerType; detail: string; newsSentiment?: 'BULLISH' | 'BEARISH' | 'NEUTRAL' }): Promise<void> {
  try {
    const symbol = tickerToYahoo(job.ticker);
    if (!symbol) return;

    const prices: number[] = [];
    const volumes: number[] = [];
    try {
      const p1 = new Date(); p1.setDate(p1.getDate() - 7);
      const result = await yf.chart(symbol, { period1: p1, period2: new Date(), interval: '15m', return: 'array' });
      for (const q of result.quotes) {
        if (q.close && q.close > 0) { prices.push(q.close as number); volumes.push((q.volume as number) || 0); }
      }
    } catch { /* fall back to daily */ }
    if (prices.length < 30) {
      try {
        const p1 = new Date(); p1.setFullYear(p1.getFullYear() - 1);
        const result = await yf.chart(symbol, { period1: p1, period2: new Date(), interval: '1d', return: 'array' });
        prices.length = 0; volumes.length = 0;
        for (const q of result.quotes) {
          if (q.close && q.close > 0) { prices.push(q.close as number); volumes.push((q.volume as number) || 0); }
        }
      } catch { /* ignore */ }
    }
    if (prices.length < 30) return;

    const last = prices[prices.length - 1];

    // Build TA on the same candles the ML sees. The (now fixed) Supertrend acts
    // as a trust gate so a single biased model can't spam one-directional
    // alerts — e.g. the ensemble flagging every +5% winner as a 77% SELL.
    let taDir: 'BULLISH' | 'BEARISH' | null = null;
    try {
      const ohlc: OHLC[] = [];
      for (let i = 1; i < prices.length; i++) {
        ohlc.push({
          open: prices[i - 1],
          high: Math.max(prices[i - 1], prices[i]),
          low: Math.min(prices[i - 1], prices[i]),
          close: prices[i],
          volume: volumes[i] || 1000,
        });
      }
      const prev = prices.length > 1 ? prices[prices.length - 2] : last;
      const built = buildCandleHistory(
        ohlc, last, volumes[volumes.length - 1] || 1000, prev,
        Math.max(...prices.slice(-20)), Math.min(...prices.slice(-20)),
      );
      if (built.length >= 50) {
        const ta = calculateIndicators(built);
        if (ta) {
          const pred = generatePrediction(job.ticker, last, ta);
          if (pred && pred.direction !== 'NEUTRAL') taDir = pred.direction;
        }
      }
    } catch { /* TA unavailable — fall back to ML alone */ }

    const ml = await getPythonMLPrediction({
      symbol: job.ticker,
      prices,
      volumes,
      event: { headline: `${job.trigger} realtime event for ${job.ticker}` },
    });

    const prob = ml.probability;
    if (Math.abs(prob - 50) < MIN_PROB_DELTA) return;

    const mlDir: 'BULLISH' | 'BEARISH' = prob > 50 ? 'BULLISH' : 'BEARISH';

    // Direction decision:
    // 1. News-triggered jobs → trust the news sentiment (the catalyst). Cap the
    //    confidence when the ML disagrees with the headline direction.
    // 2. Live-triggered jobs → only alert when ML and the fixed TA agree.
    //    Disagreement means the signal is not trustworthy; suppress it instead
    //    of flooding Telegram with one-directional calls.
    let direction = mlDir;
    let capped = false;
    if (job.newsSentiment && job.newsSentiment !== 'NEUTRAL') {
      direction = job.newsSentiment;
      if (direction !== mlDir) capped = true;
    } else if (taDir && taDir !== mlDir) {
      console.log(`[RealtimeWatchdog] suppressed ${job.ticker} — ML ${mlDir}(${prob.toFixed(1)}%) vs TA ${taDir} (${job.trigger})`);
      return;
    }

    const q = getAllCachedQuotes()[tickerToYahoo(job.ticker)];

    const confidence = Math.min(Math.round(Math.abs(prob - 50) * 2), capped ? 55 : 80);
    // Accuracy floor: a 17-40% confidence call is noise, not a signal. Suppress
    // it before it reaches Telegram (news-triggered caps stay at 55 by design).
    if (!capped && confidence < MIN_ALERT_CONFIDENCE) {
      console.log(`[RealtimeWatchdog] suppressed ${job.ticker} — confidence ${confidence}% below floor (prob ${prob.toFixed(1)}%)`);
      return;
    }

    const alert: RealtimeAlert = {
      id: `realtime-${job.ticker}-${Date.now()}`,
      type: 'REALTIME',
      source: job.trigger === 'NEWS' ? 'NEWS_TRIGGER' : 'LIVE_WATCHDOG',
      ticker: job.ticker,
      name: getTickerName(job.ticker) || job.ticker,
      direction,
      probability: Math.round(prob * 10) / 10,
      confidence,
      price: q?.price || last,
      changePercent: q?.changePercent ?? 0,
      trigger: job.trigger,
      detail: job.detail,
      ts: Date.now(),
      model: ml.model_version,
    };

    recentAlerts.unshift(alert);
    if (recentAlerts.length > MAX_ALERTS) recentAlerts.length = MAX_ALERTS;

    // Push to the live WebSocket via IPC (server.js broadcasts on /ws).
    if (typeof process !== 'undefined' && typeof process.send === 'function') {
      try { process.send({ type: 'ALERT_PAYLOAD', data: JSON.stringify(alert) }); } catch { /* worker detached */ }
    }

    try { await sendRealtimePredictionAlert(alert); } catch (e) { console.warn('[RealtimeWatchdog] Telegram send failed:', e); }
    console.log(`[RealtimeWatchdog] ${alert.trigger} ${job.ticker} ${direction} prob=${prob}% conf=${alert.confidence}`);
  } catch (e) {
    console.warn(`[RealtimeWatchdog] prediction failed for ${job.ticker}: ${String(e).slice(0, 140)}`);
  }
}

/**
 * Called on EVERY quote cycle. Scans the full Indian universe for anomalies and
 * enqueues instant ML predictions. Returns how many triggers were enqueued.
 */
export async function evaluateRealtimeMarket(): Promise<number> {
  if (evaluating) return 0;
  // Price/volume alerts are only meaningful while NSE is actually trading.
  // After 3:30 PM the "moves" are frozen-price noise — never alert then.
  if (!getExchangeStatus('NSE').open) return 0;
  evaluating = true;
  try {
    // Bound the per-ticker state map so a growing universe can't leak memory.
    if (tickerStates.size > 3000) {
      const stale = [...tickerStates.entries()].sort((a, b) => a[1].ts - b[1].ts);
      for (let i = 0; i < stale.length - 2000; i++) tickerStates.delete(stale[i][0]);
    }

    const quotes = getAllCachedQuotes();
    const now = Date.now();
    let triggered = 0;

    // Scan only symbols that actually have live prices in cache — iterating the
    // full (up to 1800+) dynamic universe every tick is pure waste and delays
    // real alerts. Frozen/zero-price entries are skipped automatically.
    for (const [symbol, q] of Object.entries(quotes)) {
      if (!q || !q.price || q.price <= 0 || q.frozen) continue;
      const ticker = normalizeTicker(symbol);
      if (!isIndianTicker(ticker)) continue;

      const st = getState(ticker, q.price, now);
      st.price = q.price;
      st.ts = now;
      if (st.prevPrice == null || st.prevPrice <= 0) { st.prevPrice = q.price; continue; }

      st.window.push({ ts: now, price: q.price });
      while (st.window.length && now - st.window[0].ts > MOMENTUM_WINDOW_MS) st.window.shift();

      const vol = q.volume ?? 0;
      if (vol > 0) { st.volWindow.push(vol); if (st.volWindow.length > WINDOW_SIZE) st.volWindow.shift(); }

      const tickMove = Math.abs(q.price - st.prevPrice) / st.prevPrice * 100;
      st.prevPrice = q.price;

      const windowStart = st.window[0];
      const windowMove = windowStart ? Math.abs(q.price - windowStart.price) / windowStart.price * 100 : 0;
      const volWindow = st.volWindow;
      const volAvg = volWindow.length > 1 ? volWindow.slice(0, -1).reduce((a, b) => a + b, 0) / (volWindow.length - 1) : 0;
      const volRatio = volAvg > 0 ? vol / volAvg : 0;
      const dayMove = Math.abs(q.changePercent ?? 0);

      // High-momentum names get tighter thresholds so the biggest movers of the
      // day are always caught and predicted.
      const prio = HIGH_MOMENTUM_WATCHLIST.has(ticker);
      const tickThresh = prio ? 0.35 : TICK_MOVE_PCT;
      const momThresh = prio ? 1.0 : MOMENTUM_MOVE_PCT;
      const dayThresh = prio ? 1.2 : DAY_MOVE_PCT;

      const triggers: RealtimeTriggerType[] = [];
      if (tickMove >= tickThresh) triggers.push('TICK_SPIKE');
      if (windowMove >= momThresh) triggers.push('MOMENTUM_BURST');
      if (volRatio >= VOLUME_SURGE_RATIO && vol >= MIN_VOLUME) triggers.push('VOLUME_SURGE');
      if (dayMove >= dayThresh && (tickMove >= 0.3 || volRatio >= 2)) triggers.push('DAY_BREAKOUT');

      if (triggers.length === 0) continue;
      if (now - st.lastAlertAt < COOLDOWN_MS) continue;

      st.lastAlertAt = now; // reserve cooldown slot to prevent spam
      enqueue(ticker, triggers[0], describeTrigger(triggers, q, tickMove, windowMove, volRatio));
      triggered++;
    }
    return triggered;
  } finally {
    evaluating = false;
  }
}

/**
 * News-driven hook: called whenever the news cycle lands NEW items with tickers.
 * Predicts the affected stocks immediately instead of waiting for the next cycle.
 */
export function queueNewsTrigger(ticker: string, headline: string): void {
  if (!isIndianTicker(ticker)) return;
  // News-based trade alerts only make sense when the market is open or about
  // to open. After-hours news is still analysed and shown on the dashboard,
  // but we stop shouting BUY/SELL when nobody can trade.
  const nse = getExchangeStatus('NSE');
  if (nse.session !== 'OPEN' && nse.session !== 'PRE') {
    console.log(`[RealtimeWatchdog] news suppressed for ${ticker} — market ${nse.session} (${nse.label})`);
    return;
  }
  const now = Date.now();
  const last = newsLocks.get(ticker) || 0;
  if (now - last < NEWS_COOLDOWN_MS) return;
  newsLocks.set(ticker, now);
  enqueue(ticker, 'NEWS', headline.slice(0, 140), classifyNewsSentiment(headline));
}
