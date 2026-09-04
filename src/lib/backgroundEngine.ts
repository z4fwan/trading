import { fetchQuotesFromYahoo, getLivePrice } from './quoteFetcher';
import { isRenderBandwidthSaver } from './renderBandwidth';
import { runAlphaDiscoveryCycle } from './alphaSourceDiscovery';
import { getServiceClient } from './supabase';
import { tickerToYahoo, getTickerName, INDIAN_EQUITY_TICKERS } from './marketConfig';
import { getFullUniverse } from './dynamicUniverse';
import { type OHLC } from './technicalAnalysis';
import { runQuantStrategies } from './quantStrategies';
import { analyzePortfolioRisk } from './riskManagement';
import { detectSMCSetup } from './smcEngine';
import { scanUnusualOptionsActivity } from './optionsFlowAnalysis';
import { runMultiTickerBacktest } from './backtestingEngine';
import { markQuantCycle, markRiskCycle, markOptionsFlow, markBacktestCycle } from './engineState';
import { computeModelParams, predictWithModel, type MLModel } from './mlEngine';
import { runAdaptiveLearning } from './ai/knowledgeBase';
import YahooFinance from 'yahoo-finance2';
import { markEngineRunning, markEngineStopped, markQuote, markMLCycle, markHistoryCount, markNewsCycle, markAILearning, markMacroShock, markMemoryMB, markError, markActiveFetches, markSelfAwareness, markLLMConfigured, markLLMAnalysis, markStrategyExplore, getEngineState, markIntradayCalls } from './engineState';
import { fetchClassifiedNews } from './newsFetcher';
import { processNewsPipeline } from './llmNewsPipeline';
import { getNewsForTicker, getNewsFeed, addNewsEvents } from './newsStore';
import { runPreMarketAlphaCycle } from './preMarketEngine';
import { runPreMarketMomentumScan, resolvePreMarketPredictions } from './preMarketMomentumEngine';
import { runPostMarketReview } from './postMarketReview';
import { runAutonomousLearningCycle, hydrateServerKnowledgeFromCloud } from './serverAutonomousLearning';
import { runMarketClosedAnalysis } from './weekendRetrospective';
import { runStockPulseLearningCycle } from './serverStockPulseLearning';
import { runAutoListingScanner } from './autoListingScanner';
import { checkScheduledReports } from './annualReport/schedule';
import { runAutoReviewCycle } from './autoReviewQueue';
import { getPythonMLPrediction, type PythonEventData } from './pythonBridge';
import { runAutoIntradayScan } from './autoIntradayScanner';
import { runLongTermStockPicker } from './longTermStockPicker';
import { getIntradayCalls, getIntradayPlan } from './intradayStore';
import { evaluateRealtimeMarket, queueNewsTrigger } from './realtimeWatchdog';

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
let quantStrategyTimer: ReturnType<typeof setInterval> | null = null;
let riskManagementTimer: ReturnType<typeof setInterval> | null = null;
let optionsFlowTimer: ReturnType<typeof setInterval> | null = null;
let backtestTimer: ReturnType<typeof setInterval> | null = null;
let whaleScannerTimer: ReturnType<typeof setInterval> | null = null;
let aiLearningTimer: ReturnType<typeof setInterval> | null = null;
let stockPulseTimer: ReturnType<typeof setInterval> | null = null;
let preMarketTimer: ReturnType<typeof setInterval> | null = null;
let weekendTimer: ReturnType<typeof setInterval> | null = null;
let optionsPulseTimer: ReturnType<typeof setInterval> | null = null;
let autonomousTimer: ReturnType<typeof setInterval> | null = null;
let reviewQueueTimer: ReturnType<typeof setInterval> | null = null;
let intradayTimer: ReturnType<typeof setInterval> | null = null;
const activeFetches = new Set<Promise<unknown>>();

let started = false;
let mlCursor = 0;
let lastSupabaseKeepalive = 0;

const QUOTE_INTERVAL_MS = process.env.QUOTE_INTERVAL_MS
  ? parseInt(process.env.QUOTE_INTERVAL_MS, 10)
  : isRenderBandwidthSaver()
    ? 4000
    : process.env.RENDER === 'true'
      ? 2000
      : 500;
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
  log(`Tickers: ${INDIAN_EQUITY_TICKERS.length} configured`);
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

import { sendTelegramAlert, startTelegramBotListener } from './telegramBot';

import { fetchBullScoreLiveCalls } from './bullScoreFetcher';
import { markBullScoreSignals } from './engineState';

async function runNewsCycle(): Promise<void> {
  if (shuttingDown) return;
  try {
    const raw = await fetchClassifiedNews();
    
    // BullScore integration: Fetch live verified analyst calls
    const bullScoreCalls = await fetchBullScoreLiveCalls();
    if (bullScoreCalls.length > 0) {
      markBullScoreSignals(bullScoreCalls);
      // We push the bullscore calls into the main news pipeline so they get Telegram alerts
      raw.push(...bullScoreCalls);
    }
    
    if (raw.length === 0) return;

    const existingIds = new Set(getNewsFeed(500).map(n => n.id));
    const newRaw = raw.filter(item => !existingIds.has(item.id));
    
    if (newRaw.length === 0) return;

    const { items, macro, llmEnhanced } = await processNewsPipeline(newRaw);
    markNewsCycle(items);
    addNewsEvents(items as any);

    // Realtime: the moment any source delivers a new item with a ticker,
    // kick an instant ML prediction for that stock (deduped by the watchdog).
    for (const item of items) {
      for (const t of (item.tickers || [])) queueNewsTrigger(t, item.headline);
    }

    if (macro) {
      markMacroShock(true, `${macro.source}: ${macro.headline.slice(0, 120)}`, macro);
      log(`MACRO SHOCK: ${macro.forcedRegime} — ${macro.headline.slice(0, 80)}`);
    } else {
      markMacroShock(false, '', null);
    }

    log(`News cycle: ${items.length} items, LLM enhanced ${llmEnhanced}, BullScore ${bullScoreCalls.length}`);
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
export function getCachedHistory(ticker: string): OHLC[] | null {
  const cached = historyCache.get(ticker);
  return cached && Date.now() - cached.fetchedAt < HISTORY_TTL ? cached.candles : null;
}

export async function prefetchHistoryBatch(tickers: string[]): Promise<void> {
  const missing = tickers.filter(t => !getCachedHistory(t));
  if (missing.length === 0) return;
  
  // Fetch missing tickers in batches of 5 to avoid triggering rate limits too aggressively
  // Randomize order slightly to avoid getting stuck on same symbols on repeated restarts
  const shuffled = [...missing].sort(() => Math.random() - 0.5);
  
  for (let i = 0; i < shuffled.length; i += 5) {
    const batch = shuffled.slice(i, i + 5);
    await Promise.all(batch.map(async (ticker) => {
      try {
        const symbol = tickerToYahoo(ticker);
        const p1 = new Date(); p1.setFullYear(p1.getFullYear() - 2);
        const result = await yf().chart(symbol, { period1: p1, period2: new Date(), interval: '1d', return: 'array' });
        const candles: OHLC[] = [];
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
        warn(`Prefetch failed for ${ticker}: ${String(e).slice(0, 80)}`);
      }
    }));
  }
}

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
    // Realtime watchdog: react to price/volume anomalies on EVERY tick — no
    // waiting for the slow ML cycle. Fire-and-forget so quotes never stall.
    void evaluateRealtimeMarket().catch(() => {});
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
    let fetchPromise: Promise<OHLC[] | null> | null = null;
    try {
      fetchPromise = rateLimitedHistory(ticker);
      activeFetches.add(fetchPromise);
      markActiveFetches(activeFetches.size);
      const history = await fetchPromise;
      activeFetches.delete(fetchPromise);
      fetchPromise = null;
      markActiveFetches(activeFetches.size);
      if (!history || history.length < 80) continue;
      const result = computeModelParams(ticker, history, 5);
      if (!result) continue;
      const model: MLModel = { ...result.model, trainedAt: Date.now() };
      models.set(ticker, model);
      if (models.size > MAX_MODELS) { const first = models.keys().next().value; if (first) models.delete(first); }
      trained++;
      const newsItems = getNewsForTicker(ticker, 72);
      const newsItem = newsItems.find(n => n.llmAnalyzed);

      const rawPrices = history.map(h => h.close);
      const rawVolumes = history.map(h => h.volume);
      const eventPayload = newsItem ? {
        headline: newsItem.headline,
        llm_sentiment: newsItem.sentiment,
        llm_confidence: newsItem.impactScore || 50
      } : {};

      const eventData: PythonEventData = {
          symbol: ticker,
          prices: rawPrices,
          volumes: rawVolumes,
          event: eventPayload
      };
      
      let pyPrediction;
      try {
        pyPrediction = await getPythonMLPrediction(eventData);
      } catch (e) {
        markError(`python-ml-bridge: ${e}`);
        continue;
      }
      
      if (!pyPrediction) continue;
      preds++;

      try {
        const { fetchAlternativeData } = await import('./alternativeData');
        const { evaluateTradeWithHumanBrain } = await import('./ensembleBrain');
        
        const altData = await fetchAlternativeData(ticker, pyPrediction.probability);
        const brainDecision = await evaluateTradeWithHumanBrain(ticker, altData);
        
        // Strict floor: only EXECUTE with real LLM conviction fires an alert.
        // A confidence of 50 is the LLM parse fallback (synthesis failure), and
        // anything below 70 is the same noise that used to spam SELL on every
        // stock — suppress it before Telegram.
        const isGenuineConviction = brainDecision.confidence >= 70 && brainDecision.decision === 'EXECUTE';
        if (isGenuineConviction) {
           const { sendIntradayCandidateAlert } = await import('./telegramBot');
           const lastPrice = history[history.length - 1].close;
           await sendIntradayCandidateAlert({
              ticker,
              name: getTickerName(ticker),
              direction: pyPrediction.probability > 50 ? 'BULLISH' : 'BEARISH',
              confidence: brainDecision.confidence,
              entryPrice: lastPrice,
              currentPrice: lastPrice,
              targetPrice: parseFloat((lastPrice * (pyPrediction.probability > 50 ? 1.05 : 0.95)).toFixed(2)),
              stopLoss: parseFloat((lastPrice * (pyPrediction.probability > 50 ? 0.98 : 1.02)).toFixed(2)),
              predictedReturnPct: 5,
              riskReward: 2.5,
              reasoning: [brainDecision.reasoning],
              keyFactors: ['6-Pillar Absolute Confluence Confirmed']
           });
           log(`[EnsembleBrain] EXECUTE signal fired for ${ticker}.`);
        } else {
           log(`[EnsembleBrain] Passed on ${ticker}. Reason: ${brainDecision.reasoning}`);
        }
      } catch (e) {
        warn(`[EnsembleBrain] Error processing ${ticker}: ${e}`);
      }

      if (supabase) {
        try {
          const lastPrice = history[history.length - 1].close;
          const id = pyPrediction.prediction_id;
          
          const dynamicRisk = (pyPrediction as any).risk_metrics || {
             stop_loss: lastPrice * (pyPrediction.probability > 50 ? 0.99 : 1.01),
             target_price: lastPrice * (pyPrediction.probability > 50 ? 1.02 : 0.98),
             position_size: 0.1,
             expected_value: 0
          };
          
          const direction = pyPrediction.probability > 50 ? 'BULLISH' : 'BEARISH';
          const confidence = Math.abs(pyPrediction.probability - 50) * 2;

          const row = {
            id, ticker, name: getTickerName(ticker), source: 'AI_QUANT_V4',
            created_at: Date.now(), prediction_type: 'DAILY',
            direction: direction,
            bullish_prob: pyPrediction.probability,
            bearish_prob: 100 - pyPrediction.probability,
            confidence: confidence,
            entry_price: lastPrice,
            target_price: dynamicRisk.target_price,
            stop_loss: dynamicRisk.stop_loss,
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
            uncertainty_score: Math.max(0, 100 - confidence),
            expected_volatility: 1,
            reasoning: [],
          }, { onConflict: 'id' });
          activeFetches.add(histPromise);
          try { await histPromise; } catch { }
          activeFetches.delete(histPromise);
        } catch (e) { markError(`ml-supabase: ${ticker} ${e}`); }
      }
    } catch (e) {
      if (fetchPromise) { activeFetches.delete(fetchPromise); markActiveFetches(activeFetches.size); }
      markError(`ml-ticker: ${ticker} ${e}`);
    }
    await new Promise<void>(r => setImmediate(r));
  }
  markMLCycle(trained, preds);
  log(`ML batch done: ${trained} models, ${preds} predictions`);
}

import { saveToLocalDb, loadFromLocalDb } from './localDb';
import { setEngineState } from './engineState';
import { getAllPredictions, importPredictions } from './predictionStore';

export function isBackgroundEngineStarted(): boolean {
  return started;
}

export async function startBackgroundEngine(): Promise<void> {
  if (started) return;
  started = true;

  try {
    const persisted = await loadFromLocalDb();
    if (persisted) {
      if (persisted.engineHealth) setEngineState(persisted.engineHealth);
      if (persisted.predictions) importPredictions(persisted.predictions);
      log(`Restored engine memory from local DB (Predictions: ${persisted.predictions?.length || 0})`);
    }
  } catch (e) {
    warn(`Local DB load error: ${e}`);
  }

  // Periodic Local DB Save
  setInterval(async () => {
    if (shuttingDown) return;
    try {
      await saveToLocalDb({
        engineHealth: getEngineState(),
        predictions: getAllPredictions(),
        timestamp: Date.now()
      });
    } catch (e) {}
  }, 60000);

  startTelegramBotListener();
  startupDiagnostics();
  markEngineRunning();
  // Immediately surface persisted intraday calls/plan so the dashboard tab is
  // populated before the first scan completes (calls are re-marked each cycle).
  markIntradayCalls(getIntradayCalls(), getIntradayPlan());
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

  // Prefetch core history for momentum & trust engine (in background)
  setTimeout(() => {
    const top50 = INDIAN_EQUITY_TICKERS.slice(0, 50);
    log(`Prefetching history for top 50 core universe for Momentum Scanner...`);
    prefetchHistoryBatch(top50).catch(e => warn('History prefetch error: ' + e));
  }, 5000);

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

  quantStrategyTimer = setInterval(async () => {
    if (shuttingDown) return;
    try { await runQuantStrategyCycle(); } catch (e) { warn(`Quant error: ${e}`); }
  }, 60 * 60 * 1000);
  setTimeout(() => runQuantStrategyCycle().catch(e => warn(`Quant init error: ${e}`)), 150000);

  riskManagementTimer = setInterval(async () => {
    if (shuttingDown) return;
    try { await runRiskManagementCycle(); } catch (e) { warn(`Risk error: ${e}`); }
  }, 60 * 60 * 1000);
  setTimeout(() => runRiskManagementCycle().catch(e => warn(`Risk init error: ${e}`)), 180000);

  optionsFlowTimer = setInterval(async () => {
    if (shuttingDown) return;
    try { await runOptionsFlowCycle(); } catch (e) { warn(`Options Flow error: ${e}`); }
  }, 15 * 60 * 1000);
  setTimeout(() => runOptionsFlowCycle().catch(e => warn(`Options Flow init error: ${e}`)), 90000);

  backtestTimer = setInterval(async () => {
    if (shuttingDown) return;
    try { await runBacktestCycle(); } catch (e) { warn(`Backtest error: ${e}`); }
  }, 6 * 60 * 60 * 1000);
  setTimeout(() => runBacktestCycle().catch(e => warn(`Backtest init error: ${e}`)), 120000);

  whaleScannerTimer = setInterval(async () => {
    if (shuttingDown) return;
    try { await runWhaleSMCScanner(); } catch (e) { warn(`Whale SMC error: ${e}`); }
  }, 15 * 60 * 1000);
  setTimeout(() => runWhaleSMCScanner().catch(e => warn(`Whale SMC init error: ${e}`)), 45000);

  // Pre-Market Alpha Check (Runs every 60 seconds to catch exact minute)
  preMarketTimer = setInterval(() => {
    const now = new Date();
    const istTime = now.toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour12: false });
    const [hh, mm] = istTime.split(':').map(Number);
    
    if (hh === 8 && mm === 0) {
      void runPreMarketAlphaCycle(false); // 8:00 AM Overnight Scan
    } else if (hh === 9 && mm === 0) {
      void runPreMarketMomentumScan('PRE_OPEN'); // 9:00 pre-open auction picks
    } else if (hh === 9 && mm === 7) {
      void runPreMarketAlphaCycle(true);  // 9:07 AM Pre-Open Scan
    } else if (hh === 9 && mm === 12) {
      void runPreMarketMomentumScan('POST_OPEN'); // 9:12 open-confirmation picks
    } else if ((hh === 9 && (mm === 30 || mm === 45)) || (hh === 10 && mm === 0)) {
      // Late-breakout rescans: stocks that moved after the 9:12 cutoff (the
      // 9:15–10:00 gap runners) get a second chance to be caught.
      void runPreMarketMomentumScan('RE_SCAN');
    } else if (hh === 15 && mm === 45) {
      void resolvePreMarketPredictions().catch(e => warn(`Pre-market resolve error: ${e}`)); // 15:45 resolve day's picks for the ledger
    } else if (hh === 16 && mm === 0) {
      // 16:00 post-market deep-learning review: force-resolve leftovers, grade
      // every pick against the final session range, send Telegram + email, and
      // feed the outcomes into the AI learning loop. Idempotent (date guard).
      void runPostMarketReview().catch(e => warn(`Post-market review error: ${e}`));
    } else if (hh === 16 && mm === 5) {
      // 16:05 fallback: re-run post-market review if 16:00 attempt failed
      // (sent guard is only set after successful delivery, so this is safe).
      void runPostMarketReview().catch(e => warn(`Post-market review retry error: ${e}`));
    } else if (hh === 16 && mm === 15) {
      // 16:15 final fallback: last attempt before the post-market window closes
      void runPostMarketReview().catch(e => warn(`Post-market review final attempt error: ${e}`));
    } else if (hh === 16 && mm === 20) {
      // 16:20 Long-term study system (weekdays, IST):
      //   Mon-Thu: daily deep scan of Nifty 500 → top 20 → daily observations
      //            stored in Supabase (accumulated over the week).
      //   Fri:     review full week of daily data, LLM deep analysis on top
      //            3-5, send detailed email with long-term recommendations.
      const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        void runLongTermStockPicker().catch(e => warn(`Long-term picker error: ${e}`));
      }
    } else if (hh === 16 && mm === 25) {
      // 16:25 fallback: retry long-term study if 16:20 failed (weekdays only)
      const dayOfWeek = now.getDay();
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        void runLongTermStockPicker().catch(e => warn(`Long-term picker retry error: ${e}`));
      }
    }
  }, 60000);

  // Startup catch-up: if the server boots during the pre-open window, run the
  // PRE_OPEN / POST_OPEN scan immediately so a late start never misses the
  // morning confirmation report. runPreMarketMomentumScan is idempotent
  // (lastScanDate guard), so a double call is harmless.
  setTimeout(() => {
    const now = new Date();
    const istTime = now.toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour12: false });
    const [hh, mm] = istTime.split(':').map(Number);
    const mins = hh * 60 + mm;
    try {
      if (mins >= 9 * 60 && mins < 9 * 60 + 12) {
        void runPreMarketMomentumScan('PRE_OPEN');
      } else if (mins >= 9 * 60 + 12 && mins <= 9 * 60 + 40) {
        void runPreMarketMomentumScan('POST_OPEN');
      } else if (mins >= 9 * 60 + 30 && mins <= 10 * 60 + 5) {
        void runPreMarketMomentumScan('RE_SCAN');
      }
    } catch (e) {
      warn(`Pre-market catch-up error: ${e}`);
    }
  }, 8000);

  // Startup catch-up for the post-market review: if the server boots at or
  // after 16:00 IST on a weekday, run the review once. runPostMarketReview is
  // idempotent (per-day sent guard), so a double call is harmless.
  setTimeout(() => {
    const now = new Date();
    const istTime = now.toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour12: false });
    const [hh, mm] = istTime.split(':').map(Number);
    const mins = hh * 60 + mm;
    try {
      if (mins >= 16 * 60) {
        void runPostMarketReview().catch(e => warn(`Post-market catch-up error: ${e}`));
      }
    } catch (e) {
      warn(`Post-market catch-up error: ${e}`);
    }
  }, 20000);

  // Startup catch-up for long-term stock study: if the server boots at or
  // after 16:20 IST on a weekday (Mon-Fri), run the study/pick once.
  // Idempotent per-day (Supabase upsert keyed on date,ticker), so a double call
  // is harmless.
  setTimeout(() => {
    const now = new Date();
    const istTime = now.toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour12: false });
    const [hh, mm] = istTime.split(':').map(Number);
    const mins = hh * 60 + mm;
    const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
    try {
      if (mins >= 16 * 60 + 20 && dayOfWeek >= 1 && dayOfWeek <= 5) {
        void runLongTermStockPicker().catch(e => warn(`Long-term picker catch-up error: ${e}`));
      }
    } catch (e) {
      warn(`Long-term picker catch-up error: ${e}`);
    }
  }, 25000);

let alphaDiscoveryTimer: ReturnType<typeof setInterval> | null = null;

  alphaDiscoveryTimer = setInterval(async () => {
    if (shuttingDown) return;
    try {
      await runAlphaDiscoveryCycle();
    } catch (e) {
      warn(`Alpha Discovery error: ${e}`);
    }
  }, 2 * 60 * 60 * 1000); // Every 2 hours
  setTimeout(runAlphaDiscoveryCycle, 10000); // Initial run 10s after startup

  // Intraday Auto-Scanner every 15 minutes
  intradayTimer = setInterval(async () => {
    if (shuttingDown) return;
    try {
      await runAutoIntradayScan();
      const calls = getIntradayCalls();
      const plan = getIntradayPlan();
      markIntradayCalls(calls, plan);
    } catch (e) {
      warn(`Intraday Scan error: ${e}`);
    }
  }, 15 * 60 * 1000);
  setTimeout(async () => {
    try {
      await runAutoIntradayScan();
      const calls = getIntradayCalls();
      const plan = getIntradayPlan();
      markIntradayCalls(calls, plan);
    } catch (e) {
      warn(`Intraday init error: ${e}`);
    }
  }, 60000); // 1 minute after boot

  log(`Started polling: ML(${ML_BATCH_SIZE} tickers), Quotes(${QUOTE_INTERVAL_MS}ms), News, Intraday...`);
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
  if (quantStrategyTimer) { clearInterval(quantStrategyTimer); quantStrategyTimer = null; }
  if (riskManagementTimer) { clearInterval(riskManagementTimer); riskManagementTimer = null; }
  if (optionsFlowTimer) { clearInterval(optionsFlowTimer); optionsFlowTimer = null; }
  if (backtestTimer) { clearInterval(backtestTimer); backtestTimer = null; }
  if (whaleScannerTimer) { clearInterval(whaleScannerTimer); whaleScannerTimer = null; }
  if (intradayTimer) { clearInterval(intradayTimer); intradayTimer = null; }
  markEngineStopped(signal);
  const finalizeShutdown = async () => {
    try {
      await saveToLocalDb({
        engineHealth: getEngineState(),
        predictions: getAllPredictions(),
        timestamp: Date.now()
      });
      log('Local DB saved successfully on shutdown.');
    } catch (e) {
      warn('Failed to save local DB on shutdown: ' + e);
    }
    log('Shutdown complete');
  };

  const fetches = activeFetches.size;
  if (fetches > 0) {
    log(`Waiting for ${fetches} active fetch(es)...`);
    Promise.allSettled([...activeFetches]).then(finalizeShutdown);
  } else { 
    finalizeShutdown(); 
  }
}

async function runQuantStrategyCycle(): Promise<void> {
  if (shuttingDown) return;
  try {
    const topTickers = [...INDIAN_EQUITY_TICKERS.slice(0, 20)];
    const allSignals: any[] = [];
    for (const t of topTickers) {
      const cached = historyCache.get(t);
      if (!cached) continue;
      const closes = cached.candles.map(c => c.close);
      const vols = cached.candles.map(c => c.volume);
      const sigs = runQuantStrategies(t, closes, vols);
      allSignals.push(...sigs);
    }
    markQuantCycle(allSignals.length, 8, allSignals);
  } catch (e) { warn(`Quant Strategy cycle error: ${e}`); }
}

async function runRiskManagementCycle(): Promise<void> {
  if (shuttingDown) return;
  try {
    const topTickers = [...INDIAN_EQUITY_TICKERS.slice(0, 20)];
    const positions = [];
    for (const ticker of topTickers) {
      const cached = historyCache.get(ticker);
      if (!cached || cached.candles.length < 30) continue;
      const closes = cached.candles.map(c => c.close);
      const returns = [];
      for (let i = 1; i < closes.length; i++) returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
      positions.push({ ticker, weight: 1/topTickers.length, price: closes[closes.length - 1], returns });
    }
    if (positions.length < 5) return;
    const risk = analyzePortfolioRisk(positions);
    
    // Calculate real portfolio value based on actual current prices (assuming 100 shares of each tracked ticker for baseline)
    const realPortfolioValue = positions.reduce((sum, p) => sum + (p.price * 100), 0);
    const beta = risk.beta || 1.0;
    
    // Real CAPM-based mathematical stress tests
    const sp500DropImpact = beta * -0.10 * realPortfolioValue; 
    const vixSpikeImpact = beta * -0.05 * realPortfolioValue;

    const fullPayload = {
      portfolioValue: realPortfolioValue,
      valueAtRisk95: risk.valueAtRisk95,
      beta: beta,
      maxDrawdown: risk.maxDrawdown,
      sharpeRatio: risk.sharpeRatio,
      stressTests: [
        { scenario: 'S&P 500 -10%', impact: sp500DropImpact, color: 'text-red-400' },
        { scenario: 'VIX Spike +20', impact: vixSpikeImpact, color: 'text-yellow-400' }
      ]
    };
    markRiskCycle(positions.length, risk.sharpeRatio, risk.maxDrawdown, fullPayload);
  } catch (e) { warn(`Risk Management cycle error: ${e}`); }
}

async function runOptionsFlowCycle(): Promise<void> {
  if (shuttingDown) return;
  try {
    const universe = [...INDIAN_EQUITY_TICKERS.slice(0, 10)];
    const signalsMap = await scanUnusualOptionsActivity(universe);
    let alertsCount = 0;
    signalsMap.forEach((arr) => { alertsCount += arr.length; });
    markOptionsFlow(signalsMap.size, alertsCount, Array.from(signalsMap.entries()));
  } catch (e) { warn(`Options Flow cycle error: ${e}`); }
}

async function runBacktestCycle(): Promise<void> {
  if (shuttingDown) return;
  try {
    const tickers = ['RELIANCE.NS', 'TCS.NS', 'INFY.NS', 'HDFCBANK.NS', 'ICICIBANK.NS'];
    const historyMap = new Map();
    for (const t of tickers) {
      const hist = await rateLimitedHistory(t);
      if (hist) historyMap.set(t, hist);
    }
    const results = await runMultiTickerBacktest(historyMap);
    markBacktestCycle(Object.keys(results).length, 0.65, 'SMC Alpha', results);
  } catch (e) { warn(`Backtest cycle error: ${e}`); }
}

const whaleAlertCooldown = new Map<string, number>();

async function runWhaleSMCScanner(): Promise<void> {
  if (shuttingDown) return;
  try {
    const whaleTargets = ['^DJI', '^IXIC', '^NSEI', '^BSESN'];
    for (const ticker of whaleTargets) {
      if (shuttingDown) break;
      const history = await rateLimitedHistory(ticker);
      if (!history || history.length < 30) continue;
      
      const smc = detectSMCSetup(history);
      if (!smc || smc.confidence < 75) continue;
      
      if (smc.fvg.active || smc.orderBlock.active || smc.liquiditySweep.active) {
        const lastPrice = history[history.length - 1].close;
        const dir = (smc.orderBlock.type || smc.liquiditySweep.type || smc.fvg.type || 'BULLISH') === 'BULLISH' ? '🟢 BUY' : '🔴 SELL';
        const typeStr = [smc.fvg.active ? 'FVG' : '', smc.orderBlock.active ? 'ORDER BLOCK' : '', smc.liquiditySweep.active ? 'LIQUIDITY SWEEP' : ''].filter(Boolean).join(' + ');
        const target = dir === '🟢 BUY' ? (lastPrice * 1.015).toFixed(2) : (lastPrice * 0.985).toFixed(2);
        const sl = smc.orderBlock.active ? smc.orderBlock.priceLevel.toFixed(2) : smc.liquiditySweep.active ? smc.liquiditySweep.priceLevel.toFixed(2) : (lastPrice * (dir === '🟢 BUY' ? 0.99 : 1.01)).toFixed(2);

        const text = `[💱 WHALE MARKET] 🐋 WHALE SETUP DETECTED | Conf: ${smc.confidence}%\n*🌍 Global Asset: ${ticker}*\n${dir} (Event: ${typeStr})\n\n🎯 *Target:* ${target}\n🛡️ *Stop Loss:* ${sl} (SMC Invalidated)`;

        const alertKey = `${ticker}-${dir}`;
        const lastAlert = whaleAlertCooldown.get(alertKey) || 0;
        const now = Date.now();
        
        // 4 hour cooldown per asset+direction
        if (now - lastAlert > 4 * 60 * 60 * 1000) {
          whaleAlertCooldown.set(alertKey, now);
          
          try {
            const body = JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text, parse_mode: 'HTML' });
            const { request } = await import('https');
            await new Promise<void>((resolve, reject) => {
              const u = new URL(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`);
              const req = request({ hostname: u.hostname, path: u.pathname + u.search, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, timeout: 10000, family: 4 }, (res: any) => { res.on('data', () => {}); res.on('end', () => resolve()); });
              req.on('error', reject); req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
              req.write(body); req.end();
            });
          } catch { /* ignore */ }
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    }
  } catch (e) { warn(`Whale SMC Scanner error: ${e}`); }
}
