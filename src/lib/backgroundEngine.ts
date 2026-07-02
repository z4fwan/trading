import { fetchQuotesFromYahoo, getLivePrice } from './quoteFetcher';
import { isRenderBandwidthSaver } from './renderBandwidth';
import { getServiceClient } from './supabase';
import { ALL_TICKERS, tickerToYahoo, getTickerName } from './marketConfig';
import { getFullUniverse } from './dynamicUniverse';
import { type OHLC } from './technicalAnalysis';
import { computeModelParams, predictWithModel, type MLModel } from './mlEngine';
import { runAdaptiveLearning } from './ai/knowledgeBase';
import YahooFinance from 'yahoo-finance2';
import { markEngineRunning, markEngineStopped, markQuote, markMLCycle, markHistoryCount, markNewsCycle, markAILearning, markMacroShock, markMemoryMB, markError, markActiveFetches, markSelfAwareness, markLLMConfigured, markLLMAnalysis, markStrategyExplore, getEngineState } from './engineState';
import { fetchClassifiedNews } from './newsFetcher';
import { processNewsPipeline } from './llmNewsPipeline';
import { getNewsForTicker, getNewsFeed, addNewsEvents } from './newsStore';
import { runPreMarketAlphaCycle } from './preMarketEngine';
import { runAutonomousLearningCycle, hydrateServerKnowledgeFromCloud } from './serverAutonomousLearning';
import { runMarketClosedAnalysis } from './weekendRetrospective';
import { runStockPulseLearningCycle } from './serverStockPulseLearning';
import { runAutoListingScanner } from './autoListingScanner';
import { checkScheduledReports } from './annualReport/schedule';
import { runAutoReviewCycle } from './autoReviewQueue';

const ENGINE_VERSION = '2.0.0-render';

let _yh: InstanceType<typeof YahooFinance> | null = null;
function yf() {
  if (!_yh) _yh = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
  return _yh;
}
const models = new Map<string, MLModel>();
const MAX_MODELS = 100; // bounded to prevent memory leak

const historyCache = new Map<string, { candles: OHLC[]; fetchedAt: number }>();
const MAX_CACHE_ENTRIES = process.env.RENDER === 'true' ? 90 : 60;
const HISTORY_TTL = 60 * 60 * 1000;

let lastHistoryCall = 0;
const HISTORY_MIN_INTERVAL = 2000; // increased from 1500 for rate limiting

let shuttingDown = false;
let quoteTimer: ReturnType<typeof setInterval> | null = null;
let mlTimer: ReturnType<typeof setTimeout> | null = null;
let newsTimer: ReturnType<typeof setInterval> | null = null;
let aiTimer: ReturnType<typeof setInterval> | null = null;
let aiLearningTimer: ReturnType<typeof setInterval> | null = null;
let stockPulseTimer: ReturnType<typeof setInterval> | null = null;
let preMarketTimer: ReturnType<typeof setInterval> | null = null;
let weekendTimer: ReturnType<typeof setInterval> | null = null;
let optionsPulseTimer: ReturnType<typeof setInterval> | null = null;
let autonomousTimer: ReturnType<typeof setInterval> | null = null;
let reviewQueueTimer: ReturnType<typeof setInterval> | null = null;
const activeFetches = new Set<Promise<unknown>>();

let started = false;
let mlCursor = 0;
let lastSupabaseKeepalive = 0;

const QUOTE_INTERVAL_MS = isRenderBandwidthSaver()
  ? 4000
  : process.env.RENDER === 'true'
    ? 2000
    : 800;
const ML_BATCH_SIZE = process.env.RENDER === 'true' ? 10 : process.env.NODE_ENV === 'development' ? 10 : 18;
const MEMORY_PRESSURE_MB = process.env.RENDER === 'true' ? 420 : 512;

function log(msg: string) { console.log(`[Engine] ${msg}`); }
function warn(msg: string) { console.warn(`[Engine] ${msg}`); }

// Memory pressure: clear caches if heap grows (Render 512MB limit)
let lastMemoryCheck = 0;
function checkMemory(): void {
  const now = Date.now();
  if (now - lastMemoryCheck < 60000) return;
  lastMemoryCheck = now;
  try {
    const usage = process.memoryUsage();
    const heapMB = Math.round(usage.heapUsed / 1024 / 1024);
    markMemoryMB(heapMB);
    if (heapMB > MEMORY_PRESSURE_MB) {
      warn(`High memory (${heapMB}MB), trimming history cache only`);
      if (historyCache.size > 20) {
        const toDelete = historyCache.size - 20;
        let n = 0;
        for (const key of historyCache.keys()) {
          historyCache.delete(key);
          if (++n >= toDelete) break;
        }
      }
      markError(`memory-pressure: ${heapMB}MB exceeded ${MEMORY_PRESSURE_MB}MB threshold`);
    }
  } catch { /* process.memoryUsage unavailable */ }
}

function startupDiagnostics(): void {
  log(`Engine v${ENGINE_VERSION} starting`);
  log(`Node ${process.version} on ${process.platform}`);
  log(`Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB heap`);
  log(`PID: ${process.pid}`);
  log(`CWD: ${process.cwd()}`);
  log(`Render: ${process.env.RENDER || 'false'}, Vercel: ${process.env.VERCEL || 'false'}`);
  log(`Supabase URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL ? 'configured' : 'not set'}`);
  log(`Service key: ${process.env.SUPABASE_SERVICE_KEY ? 'configured' : 'not set — predictions will not persist'}`);
  log(`Tickers: ${ALL_TICKERS.length} configured`);
}

function scheduleDailyReportCheck(): void {
  const run = async () => {
    if (shuttingDown) return;
    try {
      const msg = await checkScheduledReports();
      if (msg) log(`Annual report: ${msg}`);
    } catch (e) {
      warn(`Annual report schedule error: ${e}`);
    }
  };
  setTimeout(run, 60_000);
  setTimeout(run, 300_000);
  setInterval(run, 86400000);
}

function processHealthBeat(): void {
  setInterval(async () => {
    if (shuttingDown) return;
    try {
      const usage = process.memoryUsage();
      const heapMB = Math.round(usage.heapUsed / 1024 / 1024);
      markMemoryMB(heapMB);
      if (heapMB > MEMORY_PRESSURE_MB) {
        warn(`Health beat: ${heapMB}MB — high memory`);
      }
    } catch { /* ignore */ }
    try {
      const { getSelfAwarenessProfile } = await import('./selfAwarenessEngine');
      const p = getSelfAwarenessProfile();
      markSelfAwareness(p.overallAccuracy, p.selfAwarenessScore, p.metaConfidence, p.strengths.length, p.weaknesses.length, p.trend);
    } catch { /* ignore */ }
    try {
      const { isLLMConfigured, getLLMCacheStats } = await import('./llmIntegration');
      markLLMConfigured(isLLMConfigured());
      const stats = getLLMCacheStats();
      markLLMAnalysis(stats.analysisCached, stats.explanationsCached);
    } catch { /* ignore */ }
    try {
      const { getStrategyStats, runExploration } = await import('./strategyExplorer');
      const stats = getStrategyStats();
      markStrategyExplore(stats.active, stats.total, stats.bestScore, stats.bestName);
      const exploreLog = runExploration();
      if (exploreLog.length > 0) {
        log(`Strategy exploration: ${exploreLog.join('; ')}`);
      }
    } catch { /* ignore */ }
    const now = Date.now();
    if (now - lastSupabaseKeepalive > 4 * 60 * 60 * 1000) {
      lastSupabaseKeepalive = now;
      const svc = getServiceClient();
      if (svc) {
        try {
          await (svc as any).from('prediction_history').select('id', { count: 'exact', head: true });
        } catch { /* keepalive best-effort */ }
      }
    }
  }, 60000);
}

import { sendTelegramAlert } from './telegramBot';

async function runNewsCycle(): Promise<void> {
  if (shuttingDown) return;
  try {
    const raw = await fetchClassifiedNews();
    if (raw.length === 0) return;

    const existingIds = new Set(getNewsFeed(500).map(n => n.id));
    const newRaw = raw.filter(item => !existingIds.has(item.id));
    
    if (newRaw.length === 0) return;

    const { items, macro, llmEnhanced } = await processNewsPipeline(newRaw);
    markNewsCycle(items);
    addNewsEvents(items as any);

    if (macro) {
      markMacroShock(true, `${macro.source}: ${macro.headline.slice(0, 120)}`, macro);
      log(`MACRO SHOCK: ${macro.forcedRegime} — ${macro.headline.slice(0, 80)}`);
    } else {
      markMacroShock(false, '', null);
    }

    // Telegram alerts for signals are now exclusively handled by llmNewsPipeline.ts
    // to strictly enforce the isCorporateAction filter.

    log(`News cycle: ${items.length} items, LLM enhanced ${llmEnhanced}`);
  } catch (e) { warn(`News cycle error: ${e}`); }
}

async function runAILearningCycle(): Promise<void> {
  if (shuttingDown) return;
  try {
    const autonomous = await runAutonomousLearningCycle();
    const result = await runAdaptiveLearning();
    const msg = `resolved ${autonomous.resolved}, +${autonomous.experienceAdded} exp, acc ${autonomous.overallAccuracy.toFixed(1)}%, weights +${result.adjusted}/${autonomous.weightsAdjusted}`;
    markAILearning(msg);
    log(`Autonomous AI cycle: ${msg}`);
  } catch (e) {
    warn(`AI learning cycle error: ${e}`);
    markAILearning(`error: ${e}`);
  }
}

async function runStockPulseCycle(): Promise<void> {
  if (shuttingDown) return;
  try {
    const sp = await runStockPulseLearningCycle();
    log(`Stock Pulse 24/7: ${sp.gemsFound} gems, ${sp.tickersStudied} tickers in memory, deep ${sp.deepScanTicker || '—'}`);
  } catch (e) {
    warn(`Stock Pulse cycle error: ${e}`);
    markError(`stock-pulse-cycle: ${e}`);
  }
}

import { analyzeOptionsChain } from './optionsIntelligence';

async function runOptionsPulse(): Promise<void> {
  if (shuttingDown) return;
  try {
    const niftyOpt = await analyzeOptionsChain('NIFTY', 23000); // We'd pass real spot price here
    const bankNiftyOpt = await analyzeOptionsChain('BANKNIFTY', 49000);
    
    if (niftyOpt) {
      log(`Options Pulse: NIFTY Max Pain ${niftyOpt.maxPainStrike}, PCR ${niftyOpt.pcr}`);
    }
  } catch (e) {
    warn(`Options pulse error: ${e}`);
  }
}

// === ML cycle ===
async function rateLimitedHistory(ticker: string): Promise<OHLC[] | null> {
  const cached = historyCache.get(ticker);
  let candles = cached && Date.now() - cached.fetchedAt < HISTORY_TTL ? cached.candles : null;

  if (!candles) {
    const now = Date.now();
    const elapsed = now - lastHistoryCall;
    if (elapsed < HISTORY_MIN_INTERVAL) await new Promise(r => setTimeout(r, HISTORY_MIN_INTERVAL - elapsed));
    lastHistoryCall = Date.now();
    try {
      const symbol = tickerToYahoo(ticker);
      const p1 = new Date(); p1.setFullYear(p1.getFullYear() - 2);
      const result = await yf().chart(symbol, { period1: p1, period2: new Date(), interval: '1d', return: 'array' });
      candles = [];
      for (const q of result.quotes) {
        if (q.open != null && q.high != null && q.low != null && q.close != null && q.volume != null && q.date != null) {
          candles.push({ date: Math.floor(q.date.getTime() / 1000), open: q.open, high: q.high, low: q.low, close: q.close, volume: q.volume });
        }
      }
      if (candles.length > 0) {
        if (historyCache.size >= MAX_CACHE_ENTRIES) { const oldest = historyCache.keys().next().value; if (oldest) historyCache.delete(oldest); }
        historyCache.set(ticker, { candles, fetchedAt: Date.now() });
        markHistoryCount(historyCache.size);
      }
    } catch (e) {
      warn(`History fetch failed for ${ticker}: ${String(e).slice(0, 80)}`);
      return null;
    }
  }

  // Inject LIVE 100% real-time price into the final candle to guarantee absolute accuracy
  if (candles && candles.length > 0) {
    const livePrice = getLivePrice(ticker);
    if (livePrice != null && livePrice > 0) {
      const last = candles[candles.length - 1];
      last.close = livePrice;
      if (livePrice > last.high) last.high = livePrice;
      if (livePrice < last.low) last.low = livePrice;
    }
  }
  return candles && candles.length > 0 ? candles : null;
}

async function runQuoteCycle(): Promise<void> {
  if (shuttingDown) return;
  try {
    const data = await fetchQuotesFromYahoo();
    const body = JSON.stringify({ ...data, timestamp: Date.now() });
    markQuote(body);
  } catch (e) {
    const raw = String(e);
    const short = raw.includes('400') || raw.includes('Bad Request') || raw.includes('<!doctype')
      ? 'quote-fetch: Yahoo HTTP 400 (rate limit; serving cached prices)'
      : `quote-fetch: ${raw.slice(0, 160)}`;
    warn(short);
    markError(short);
  }
  checkMemory();
}

async function runMLCycle(): Promise<void> {
  if (shuttingDown) return;
  const batch: string[] = [];
  const universe = getFullUniverse();
  for (let i = 0; i < ML_BATCH_SIZE; i++) {
    batch.push(universe[(mlCursor + i) % universe.length]);
  }
  mlCursor = (mlCursor + ML_BATCH_SIZE) % universe.length;
  log(`ML batch (${batch.length} tickers, cursor ${mlCursor})...`);
  const supabase = getServiceClient();
  if (!supabase) log('ML cycle: no Supabase service client — predictions not persisted');
  let trained = 0, preds = 0;
  for (const ticker of batch) {
    if (shuttingDown) { log('ML cycle aborted — shutting down'); break; }
    try {
      const fetchPromise = rateLimitedHistory(ticker);
      activeFetches.add(fetchPromise);
      markActiveFetches(activeFetches.size);
      const history = await fetchPromise;
      activeFetches.delete(fetchPromise);
      markActiveFetches(activeFetches.size);
      if (!history || history.length < 80) continue;
      const result = computeModelParams(ticker, history, 5);
      if (!result) continue;
      const model: MLModel = { ...result.model, trainedAt: Date.now() };
      models.set(ticker, model);
      if (models.size > MAX_MODELS) { const first = models.keys().next().value; if (first) models.delete(first); }
      trained++;
      let sentimentBoost = 0;
      const newsItems = getNewsForTicker(ticker, 72);
      const newsItem = newsItems.find(n => n.llmAnalyzed);
      if (newsItem && newsItem.impactScore) {
        if (newsItem.sentiment === 'BULLISH') sentimentBoost = newsItem.impactScore;
        else if (newsItem.sentiment === 'BEARISH') sentimentBoost = -newsItem.impactScore;
      }
      const prediction = predictWithModel(model, history, sentimentBoost);
      if (!prediction) continue;
      preds++;
      if (supabase) {
        try {
          const lastPrice = history[history.length - 1].close;
          const id = `${ticker}_${model.trainedAt}`;
          const targetPct = prediction.direction === 'BULLISH' ? 1.02 : prediction.direction === 'BEARISH' ? 0.98 : 1;
          const stopPct = prediction.direction === 'BULLISH' ? 0.99 : prediction.direction === 'BEARISH' ? 1.01 : 1;
          const row = {
            id, ticker, name: getTickerName(ticker), source: 'AI_QUANT',
            created_at: model.trainedAt, prediction_type: 'DAILY',
            direction: prediction.direction,
            bullish_prob: prediction.direction === 'BULLISH' ? prediction.probability : 100 - prediction.probability,
            bearish_prob: prediction.direction === 'BEARISH' ? prediction.probability : 100 - prediction.probability,
            confidence: prediction.confidence,
            entry_price: lastPrice,
            target_price: lastPrice * targetPct,
            stop_loss: lastPrice * stopPct,
            resolved: false,
            regime: 'UNKNOWN',
          };
          const dbPromise = (supabase as any).from('predictions').upsert(row);
          activeFetches.add(dbPromise);
          markActiveFetches(activeFetches.size);
          await dbPromise;
          activeFetches.delete(dbPromise);
          markActiveFetches(activeFetches.size);
          const histPromise = (supabase as any).from('prediction_history').upsert({
            ...row,
            trust_score: 50,
            uncertainty_score: Math.max(0, 100 - prediction.confidence),
            expected_volatility: 1,
            reasoning: [],
          }, { onConflict: 'id' });
          activeFetches.add(histPromise);
          try { await histPromise; } catch { /* prediction_history optional path */ }
          activeFetches.delete(histPromise);
        } catch (e) { markError(`ml-supabase: ${ticker} ${e}`); }
      }
    } catch (e) { markError(`ml-ticker: ${ticker} ${e}`); }
    await new Promise<void>(r => setImmediate(r));
  }
  markMLCycle(trained, preds);
  log(`ML batch done: ${trained} models, ${preds} predictions`);
}

export function isBackgroundEngineStarted(): boolean {
  return started;
}

export function startBackgroundEngine(): void {
  if (started) return;
  started = true;

  startupDiagnostics();
  markEngineRunning();
  processHealthBeat();
  scheduleDailyReportCheck();

  try {
    if (typeof process !== 'undefined' && typeof process.on === 'function') {
      process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
      process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    }
  } catch { /* process not fully available */ }

  void runQuoteCycle();
  quoteTimer = setInterval(() => { void runQuoteCycle(); }, QUOTE_INTERVAL_MS);

  const scheduleML = () => {
    if (shuttingDown) return;
    mlTimer = setTimeout(async () => {
      try { await runMLCycle(); } catch (e) { warn(`ML cycle error: ${e}`); markError(`ml-cycle: ${e}`); }
      scheduleML();
    }, process.env.NODE_ENV === 'development' ? 2 * 60 * 1000 : 5 * 60 * 1000);
  };
  mlTimer = setTimeout(async () => {
    try { await runMLCycle(); } catch (e) { warn(`Initial ML cycle error: ${e}`); markError(`initial-ml: ${e}`); }
    scheduleML();
  }, 15000);

  // News + LLM + elite feeds every 60 seconds (Near Real-Time for Intraday)
  newsTimer = setInterval(async () => {
    if (shuttingDown) return;
    await runNewsCycle();
  }, 60000);
  setTimeout(() => runNewsCycle(), 8000);

  // Autonomous validate + experience + weights every 15 min
  autonomousTimer = setInterval(() => {
    runAutonomousLearningCycle().catch(e => warn(`Autonomous learning err: ${e}`));
  }, 15 * 60 * 1000); // 15 mins

  reviewQueueTimer = setInterval(() => {
    runAutoReviewCycle().catch(e => warn(`Auto review err: ${e}`));
  }, 60 * 1000); // 1 min check

  setTimeout(() => { void hydrateServerKnowledgeFromCloud(); void runAutonomousLearningCycle(); }, 45000);

  // Full AI learning (weights + adaptive) every 10 min
  aiTimer = setInterval(async () => {
    if (shuttingDown) return;
    await runAILearningCycle();
  }, 600000);
  setTimeout(() => runAILearningCycle(), 120000);

  // Stock Pulse gem scan + fundamental memory every 12 min (no browser)
  stockPulseTimer = setInterval(async () => {
    if (shuttingDown) return;
    await runStockPulseCycle();
  }, 720000);
  setTimeout(() => runStockPulseCycle(), 180000);

  // Market Closed / Weekend Retrospective every 2 hours
  weekendTimer = setInterval(async () => {
    if (shuttingDown) return;
    try { await runMarketClosedAnalysis(); } catch(e) { warn(`Weekend analysis error: ${e}`); }
  }, 2 * 60 * 60 * 1000);
  setTimeout(() => runMarketClosedAnalysis(), 240000); // 4 mins after boot

  // 7) Auto-Listing Scanner every 6 hours
  setInterval(async () => {
    if (shuttingDown) return;
    try { await runAutoListingScanner(); } catch (e) { warn(String(e)); }
  }, 21600000);

  // 8) Options Pulse every 15 minutes
  optionsPulseTimer = setInterval(async () => {
    if (shuttingDown) return;
    try { await runOptionsPulse(); } catch (e) { warn(String(e)); }
  }, 15 * 60 * 1000);

  // Pre-Market Alpha Check (Runs every 60 seconds to catch exact minute)
  preMarketTimer = setInterval(() => {
    const now = new Date();
    const istTime = now.toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour12: false });
    const [hh, mm] = istTime.split(':').map(Number);
    
    if (hh === 8 && mm === 0) {
      void runPreMarketAlphaCycle(false); // 8:00 AM Overnight Scan
    } else if (hh === 9 && mm === 7) {
      void runPreMarketAlphaCycle(true);  // 9:07 AM Pre-Open Scan
    }
  }, 60000);

  log('Background engine fully initialized.');
  log(`Engine v${ENGINE_VERSION} started — ${QUOTE_INTERVAL_MS}ms quotes, ML (${ML_BATCH_SIZE}/cycle), 60s news, Pre-Market Alpha (8:00/9:07 IST), 5min autonomous, 10min AI, 12min Stock Pulse, 2hr Weekend Offline, 6hr IPO Scan`);
  log(`Render platform: ${process.env.RENDER ? 'yes' : 'no'}`);
}

function gracefulShutdown(signal?: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`Shutting down (${signal || 'unknown'})...`);
  if (quoteTimer) { clearInterval(quoteTimer); quoteTimer = null; }
  if (mlTimer) { clearTimeout(mlTimer); mlTimer = null; }
  if (newsTimer) { clearInterval(newsTimer); newsTimer = null; }
  if (aiTimer) { clearInterval(aiTimer); aiTimer = null; }
  if (aiLearningTimer) { clearInterval(aiLearningTimer); aiLearningTimer = null; }
  if (stockPulseTimer) { clearInterval(stockPulseTimer); stockPulseTimer = null; }
  if (optionsPulseTimer) clearInterval(optionsPulseTimer);
  if (autonomousTimer) clearInterval(autonomousTimer);
  if (reviewQueueTimer) clearInterval(reviewQueueTimer);
  if (preMarketTimer) { clearInterval(preMarketTimer); preMarketTimer = null; }
  if (weekendTimer) { clearInterval(weekendTimer); weekendTimer = null; }
  markEngineStopped(signal);
  const fetches = activeFetches.size;
  if (fetches > 0) {
    log(`Waiting for ${fetches} active fetch(es)...`);
    Promise.allSettled([...activeFetches]).then(() => log('Shutdown complete'));
  } else { log('Shutdown complete'); }
}
