'use client';
import React, { useState, useEffect, useRef, useMemo, useCallback, useTransition } from 'react';
import dynamic from 'next/dynamic';
import { useMarketData, type QuoteData } from '@/lib/MarketDataContext';
import { calculateIndicators, generateMLPrediction, ensureMLModel, detectSmartMoney, detectRegime, computeDailyWeeklyPrediction, computeHourlyPrediction, assessMarketCondition, buildCandleHistory, type OHLC, type TAIndicators, type PredictionScore, type DailyWeeklyPrediction, type MarketCondition } from '@/lib/technicalAnalysis';
import { classifyTradingStyle, generateAction, generateHoldPeriod, generateCatalyst, type StrategyRecommendation, type TradingStyle } from '@/lib/tradingStrategies';
import { type MLModel } from '@/lib/mlEngine';
import { addPredictions, getExpiryDate, getDateKey, computeTrustMetrics, resolvePending, getResolvedPredictions, archiveOldResolvedPredictions } from '@/lib/predictionStore';
import { runAILearningOnResolved, getAILearningReport, getAIIndicatorWeights, getAIIndicatorPerformance, getAIFailurePatterns, getAICalibrationReport, getAILearningSnapshot } from '@/lib/aiLearningIntegration';
import { getAdaptiveConfidence, buildAISnapshot } from '@/lib/ai';
import { getCurrentShock } from '@/lib/macroInterruptHandler';
import { applyServerMacroShock } from '@/lib/macroSync';
import { getFeedStatusDisplay } from '@/lib/feedStatus';
import { AI_MODULE_TABS, TerminalIcon, type AIModuleKey } from '@/components/icons/TerminalIcons';
import { ModulePanel } from '@/components/ai/ModulePanel';
import LiveTickerPrice, { tickerCurrency } from '@/components/LiveTickerPrice';
import SmoothPrice from '@/components/SmoothPrice';
import type { MultibaggerPick } from '@/lib/stockPulse/types';
import { useThrottledValue } from '@/lib/useThrottledValue';
import { SentimentHeatmap } from './SentimentHeatmap';

const StockPulsePanel = dynamic(() => import('@/components/StockPulse/StockPulsePanel'), {
  ssr: false,
  loading: () => (
    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-6 text-center text-[10px] text-slate-500 font-mono">
      Loading Stock Pulse…
    </div>
  ),
});

interface NewsItem { id: string; timestamp: string; source: string; region: string; headline: string; sentiment: string; impactScore: number; }


import { INTERNATIONAL_TICKERS, ALL_TICKERS, NIFTY_50_TICKERS, INDIAN_EQUITY_TICKERS, INDIAN_UNIVERSE_LABEL, getTickerName } from '@/lib/marketConfig';
import { addNewsEvents, getNewsFeed, getAggregatedSentiment } from '@/lib/newsStore';
import { getMarketSession, getSessionTradingSignal, getDayOfWeekSignal } from '@/lib/marketSession';
import { classifyRegime, getRegimeRecommendation } from '@/lib/regimeClassifier';
import { recordExperience, getDailyRecommendations, getTickerStats, getAllTickerStats, getOverallStats, type DailyRecommendation, type TickerStats } from '@/lib/aiExperienceEngine';
import { useAIWorker, type WorkerResult } from '@/lib/useAIWorker';
import { useModelWorker, type ModelWorkerResult } from '@/lib/useModelWorker';
import { getModel, loadModels, saveModels } from '@/lib/mlEngine';

const INTERNATIONAL_PREDICT = INTERNATIONAL_TICKERS.slice(0, 15);
const PREDICT_ROTATE_BATCH = 48;

function buildPredictionTickerMeta(ticker: string) {
  return {
    ticker,
    name: getTickerName(ticker),
    timeframe: INTERNATIONAL_TICKERS.includes(ticker) ? '3-6 months' : '6-12 months',
  };
}

/** Nifty 50 + US core — always analyzed each cycle. */
const PREDICTION_CORE_TICKERS = [
  ...NIFTY_50_TICKERS,
  ...INTERNATIONAL_PREDICT,
].map(buildPredictionTickerMeta);

const ALL_SCAN_TICKERS = ALL_TICKERS;

function getPrice(stocks: Record<string, QuoteData>, ticker: string, fallback: number): number {
  const s = stocks[ticker];
  return s?.price && s.price > 0 ? s.price : fallback;
}

function RegimeBadge({ regime }: { regime: string }) {
  const colors: Record<string, string> = {
    STRONG_TREND: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    WEAK_TREND: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
    RANGING: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    HIGH_VOLATILITY: 'bg-red-500/20 text-red-400 border-red-500/30',
    PANIC: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    BREAKOUT: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  };
  return (
    <span className={`text-[7px] font-mono font-bold px-1 py-0.5 rounded border ${colors[regime] || ''}`}>
      {regime.replace('_', ' ')}
    </span>
  );
}

function ConfidenceBar({ value, label, color }: { value: number; label: string; color?: string }) {
  const barColor = color || (value > 70 ? '#22c55e' : value > 45 ? '#eab308' : '#ef4444');
  return (
    <div className="flex items-center gap-2 text-[8px] font-mono">
      <span className="text-slate-500 w-12 shrink-0">{label}</span>
      <div className="flex-1 bg-slate-800 rounded-full h-1.5">
        <div className="h-1.5 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: barColor }} />
      </div>
      <span className="text-white font-bold w-7 text-right">{value.toFixed(0)}</span>
    </div>
  );
}

interface TrackPrediction {
  id: string; ticker: string; direction: string;
  targetPrice: number; targetDate: string; entryPrice: number;
  createdAt: number; resolved?: boolean; correct?: boolean; actualPrice?: number;
}

function computeGemScore(ta: TAIndicators | null, sm: { accumulation: number; distribution: number } | null): number {
  if (!ta) return 50;
  let score = 50;
  if (ta.rsi > 50 && ta.rsi < 70) score += 15;
  if (ta.adx > 25) score += 20;
  if (sm?.accumulation && sm.accumulation > 60) score += 20;
  if (ta.bollinger.width < 8) score += 10;
  if (ta.ema[20] && ta.ema[50] && ta.ema[20] > ta.ema[50]) score += 15;
  if (ta.stochRsi < 80) score += 10;
  if (sm?.distribution && sm.distribution > 60) score -= 15;
  return Math.min(95, Math.max(10, score));
}

function computeSignalConfidence(ta: TAIndicators | null, baseConf: number): number {
  if (!ta) return baseConf;
  let adj = baseConf;
  if (ta.adx > 30) adj += 8;
  else if (ta.adx < 20) adj -= 10;
  if (ta.rsi > 50 && ta.rsi < 70) adj += 6;
  else if (ta.rsi > 75 || ta.rsi < 25) adj -= 10;
  if (ta.macd.histogram > 0) adj += 6;
  else adj -= 6;
  if (ta.bollinger.width > 8) adj -= 8;
  if (ta.supertrend.direction === 'up') adj += 5;
  return Math.min(85, Math.max(15, adj));
}

const PREDICTION_INTERVAL = 60000;
const STOCKS_THROTTLE_MS = 4000;
const DAILY_SCAN_TICKERS = [...NIFTY_50_TICKERS, ...INTERNATIONAL_PREDICT];

/** Tabs that need live prediction / TA cycles — skip heavy work on NEWS, LEARNING, etc. */
const PREDICTION_TABS = new Set<AIModuleKey>(['PREDICTIONS', 'SIGNALS', 'GEMS', 'STRATEGIES', 'DAILY', 'SESSION']);

function getMaxMonths(timeframe: string): number {
  const match = timeframe.match(/(\d+)/g);
  if (match && match.length >= 2) return parseInt(match[match.length - 1]);
  return parseInt(timeframe) || 3;
}

function isShortHorizon(timeframe: string): boolean {
  return getMaxMonths(timeframe) <= 6;
}

export default function AIAnalyticsHub({
  marketMode,
  isActive = true,
}: {
  marketMode: 'INDIAN' | 'INTERNATIONAL';
  /** When false (dashboard on another view), pause heavy TA/news work but keep state warm. */
  isActive?: boolean;
}) {
  const { stocks, indices, connectionStatus, pricesStreaming, market, getHistory, getSessionHL, historyLoading } = useMarketData();
  const throttledStocks = useThrottledValue(stocks, STOCKS_THROTTLE_MS);
  const feed = getFeedStatusDisplay(connectionStatus, pricesStreaming, market.phase);
  const [activeModule, setActiveModule] = useState<AIModuleKey>('PREDICTIONS');
  const [isTabPending, startTabTransition] = useTransition();

  const selectModule = useCallback((key: AIModuleKey) => {
    startTabTransition(() => setActiveModule(key));
  }, []);
  const [horizonFilter, setHorizonFilter] = useState<'SHORT' | 'LONG'>('SHORT');
  const [newsFeed, setNewsFeed] = useState<NewsItem[]>([]);
  const [predictions, setPredictions] = useState<(PredictionScore & { name: string; timeframe: string; probability: number })[]>([]);
  const [hiddenGems, setHiddenGems] = useState<{ ticker: string; name: string; currentPrice: number; score: number; ta: TAIndicators | null; hasRealData: boolean }[]>([]);
  const [multibaggerPicks, setMultibaggerPicks] = useState<MultibaggerPick[]>([]);
  const [multibaggerLoading, setMultibaggerLoading] = useState(false);
  const [multibaggerError, setMultibaggerError] = useState<string | null>(null);
  const [pulseServerBrief, setPulseServerBrief] = useState<string | null>(null);
  const [pulseServerLearning, setPulseServerLearning] = useState(false);
  const multibaggerFetchedRef = useRef(0);
  const [backtestStats, setBacktestStats] = useState({ accuracy: 0, total: 0 });
  const [taData, setTaData] = useState<Record<string, TAIndicators>>({});
  const [dailyWeeklyMap, setDailyWeeklyMap] = useState<Record<string, DailyWeeklyPrediction>>({});
  const [marketCondition, setMarketCondition] = useState<MarketCondition | null>(null);
  const marketConditionRef = useRef(marketCondition);
  useEffect(() => { marketConditionRef.current = marketCondition; }, [marketCondition]);
  const [signalPrices, setSignalPrices] = useState<({ ticker: string; name: string; riskIndex: 'LOW' | 'MEDIUM' | 'HIGH'; reasoning: string; confidence: number; timeframe: string; price: number })[]>([]);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState('');
  const [accuracyHistory, setAccuracyHistory] = useState<TrackPrediction[]>([]);
  const [learningCounter, setLearningCounter] = useState(0);
  const [sessionTick, setSessionTick] = useState(0);
  const sessionState = useMemo(() => getMarketSession(), [sessionTick]);
  const sessionSignal = useMemo(() => getSessionTradingSignal(sessionState), [sessionState]);
  const newsFeedRef = useRef(newsFeed);
  const getHistoryRef = useRef(getHistory);
  getHistoryRef.current = getHistory;

  useEffect(() => {
    const id = setInterval(() => setSessionTick(t => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  const lastPredictTimeRef = useRef(0);
  const lastRecordHashRef = useRef('');
  const predictRotateRef = useRef(0);

  const workerTaRef = useRef<Record<string, TAIndicators>>({});
  const workerSmRef = useRef<Record<string, { accumulation: number; distribution: number }>>({});
  const [modelTrainTick, setModelTrainTick] = useState(0);
  const modelTrainingSentRef = useRef<Set<string>>(new Set());

  const handleWorkerResult = useCallback((result: WorkerResult) => {
    workerTaRef.current = { ...workerTaRef.current, ...result.indicators };
    workerSmRef.current = { ...workerSmRef.current, ...result.smartMoney };
  }, []);

  const computeInWorker = useAIWorker(handleWorkerResult);

  const handleModelResult = useCallback((result: ModelWorkerResult) => {
    if (result.model) {
      const models = loadModels();
      models[result.ticker] = result.model as MLModel;
      saveModels(models);
    }
    modelTrainingSentRef.current.delete(result.ticker);
    setModelTrainTick(t => t + 1);
  }, []);

  const { train: trainInWorker, supported: workerSupported } = useModelWorker(handleModelResult);

  useEffect(() => { newsFeedRef.current = newsFeed; }, [newsFeed]);

  // Auto-learning loop — runs every 30 seconds when dashboard overview is visible
  useEffect(() => {
    if (!isActive) return;
    const timer = setInterval(() => {
      const { recorded, analyzedViaAI } = recordExperience();
      if (recorded > 0 || analyzedViaAI > 0) {
        setLearningCounter(c => c + 1);
      }
    }, 30000);
    return () => clearInterval(timer);
  }, [isActive]);

  // Derived: daily recommendations + experience stats
  const dailyRecs = useMemo(() => {
    if (activeModule !== 'DAILY') return [];
    void learningCounter;
    const priceMap: Record<string, { price: number; name: string }> = {};
    for (const ticker of DAILY_SCAN_TICKERS) {
      const s = stocks[ticker];
      if (s?.price && s.price > 0) priceMap[ticker] = { price: s.price, name: s.name || ticker };
    }
    const recs = getDailyRecommendations(DAILY_SCAN_TICKERS, priceMap, taData, {
      sessionLabel: sessionState.sessionLabel,
      dayOfWeek: sessionState.dayOfWeek,
    });
    return recs.slice(0, 10);
  }, [activeModule, stocks, taData, sessionState, learningCounter]);

  // Derived: experience stats
  const experienceStats = useMemo(() => {
    void learningCounter;
    const overall = getOverallStats();
    const tickerStats = getAllTickerStats();
    return { totalPreds: overall.totalPredictions, overallAcc: overall.overallAccuracy, tickerStats } as const;
  }, [learningCounter]);
  const mlModels = useMemo(() => {
    void modelTrainTick;
    const models: Record<string, MLModel> = {};
    for (const t of PREDICTION_CORE_TICKERS) {
      const model = getModel(t.ticker);
      if (model) models[t.ticker] = model;
    }
    return models;
  }, [modelTrainTick]);

  // Fire off model training requests to worker for tickers that need it
  useEffect(() => {
    if (!isActive || !PREDICTION_TABS.has(activeModule)) return;
    const now = Date.now();
    const oneDay = 86400000;
    const toTrain: { ticker: string; hist: OHLC[] }[] = [];
    const trainCursor = predictRotateRef.current % Math.max(1, INDIAN_EQUITY_TICKERS.length);
    const trainBatch = [
      ...NIFTY_50_TICKERS,
      ...INDIAN_EQUITY_TICKERS.slice(trainCursor, trainCursor + 12),
      ...INTERNATIONAL_PREDICT.slice(0, 4),
    ];
    for (const ticker of trainBatch) {
      if (modelTrainingSentRef.current.has(ticker)) continue;
      const existing = getModel(ticker);
      if (existing && existing.trainedAt > now - oneDay) continue;
      const hist = getHistoryRef.current(ticker);
      if (hist && hist.length >= 80) toTrain.push({ ticker, hist });
    }
    for (const { ticker, hist } of toTrain) {
      modelTrainingSentRef.current.add(ticker);
      if (workerSupported) {
        trainInWorker(ticker, hist);
      } else {
        // Fallback: train synchronously on main thread
        ensureMLModel(ticker, hist);
        modelTrainingSentRef.current.delete(ticker);
      }
    }
    if (toTrain.length > 0) {
      queueMicrotask(() => setModelTrainTick(t => t + 1));
    }
  }, [historyLoading, trainInWorker, workerSupported, isActive, activeModule]);

  // Build AIFullSnapshot from TA indicators for AI learning
  function buildSnapshotFromTA(ta: TAIndicators, price: number, volume: number) {
    return buildAISnapshot(
      ta.rsi,
      ta.macd.line, ta.macd.signal, ta.macd.histogram,
      ta.adx,
      ta.bollinger.width,
      ta.bollinger.upper > ta.bollinger.lower ? ((price - ta.bollinger.lower) / (ta.bollinger.upper - ta.bollinger.lower)) * 100 : 50,
      ta.atr,
      price > 0 ? (ta.atr / price) * 100 : 0,
      ta.supertrend.direction,
      ta.stochRsi,
      ta.ema[20] || price,
      ta.ema[50] || price,
      ta.volumeSma > 0 ? volume / ta.volumeSma : 1,
      ta.vwap > 0 ? ((price - ta.vwap) / ta.vwap) * 100 : 0,
      ta.support > 0 ? ((price - ta.support) / price) * 100 : 0,
      ta.resistance > 0 ? ((ta.resistance - price) / price) * 100 : 0,
      ta.bollinger.width > 8 ? 'HIGH' : ta.bollinger.width > 5 ? 'MEDIUM' : 'LOW',
    );
  }

  // Compute predictions on throttle (every 60s) + marketMode/horizonFilter change
  useEffect(() => {
    if (!isActive || !PREDICTION_TABS.has(activeModule)) return;
    const now = Date.now();
    const priceMap = throttledStocks as Record<string, QuoteData>;
    const hasRealPrices =
      NIFTY_50_TICKERS.some(t => (stocks[t]?.price ?? 0) > 0)
      || Object.values(indices).some(s => s?.price > 0);
    if (!hasRealPrices) return; // wait for real data before setting timer
    if (now - lastPredictTimeRef.current < PREDICTION_INTERVAL) return;
    lastPredictTimeRef.current = now;

    const newTaMap: Record<string, TAIndicators> = {};

    const coreSet = new Set(PREDICTION_CORE_TICKERS.map(p => p.ticker));
    const restIndian = INDIAN_EQUITY_TICKERS.filter(t => !coreSet.has(t));
    const rotStart = predictRotateRef.current % Math.max(1, restIndian.length);
    predictRotateRef.current = (rotStart + PREDICT_ROTATE_BATCH) % Math.max(1, restIndian.length);
    const rotating = [...restIndian.slice(rotStart), ...restIndian.slice(0, rotStart)].slice(0, PREDICT_ROTATE_BATCH);
    const cycleTickers = [
      ...PREDICTION_CORE_TICKERS,
      ...rotating.map(buildPredictionTickerMeta),
    ];

    const newPredictions = cycleTickers.map(p => {
      const hist = getHistory(p.ticker);
      const current = priceMap[p.ticker];
      if (!hist || hist.length < 50 || !current || current.price <= 0) {
        return {
          ticker: p.ticker, name: p.name, timeframe: p.timeframe,
          direction: 'NEUTRAL' as const,
          bullishProb: 50, bearishProb: 50,
          confidence: 30, riskLevel: 'MEDIUM' as const,
          trendStrength: 0, momentumScore: 0, volatilityRisk: 0,
          reasoning: [historyLoading ? 'Loading historical data...' : 'Insufficient historical data — accumulating real OHLC data for analysis'],
          regime: 'RANGING' as const, probability: 50,
          targetPrice: 0, targetDate: '', entryPrice: 0,
        };
      }
      const hl = getSessionHL(p.ticker);
      const candles = buildCandleHistory(hist, current.price, current.volume, current.prevClose, hl?.high, hl?.low);
      if (candles.length < 50) {
        return {
          ticker: p.ticker, name: p.name, timeframe: p.timeframe,
          direction: 'NEUTRAL' as const,
          bullishProb: 50, bearishProb: 50,
          confidence: 30, riskLevel: 'MEDIUM' as const,
          trendStrength: 0, momentumScore: 0, volatilityRisk: 0,
          reasoning: ['Insufficient data — accumulating price history for analysis'],
          regime: 'RANGING' as const, probability: 50,
          targetPrice: 0, targetDate: '', entryPrice: 0,
        };
      }
      const ta = calculateIndicators(candles);
      if (!ta) {
        return {
          ticker: p.ticker, name: p.name, timeframe: p.timeframe,
          direction: 'NEUTRAL' as const,
          bullishProb: 50, bearishProb: 50,
          confidence: 35, riskLevel: 'MEDIUM' as const,
          trendStrength: 0, momentumScore: 0, volatilityRisk: 0,
          reasoning: ['Awaiting sufficient price data for technical analysis'],
          regime: 'RANGING' as const, probability: 50,
          targetPrice: 0, targetDate: '', entryPrice: 0,
        };
      }
      newTaMap[p.ticker] = ta;
      const price = candles[candles.length - 1].close;
      const pred = generateMLPrediction(p.ticker, price, ta, candles, p.timeframe, mlModels[p.ticker] || null);
      // Apply adaptive confidence from AI learning
      const adaptive = getAdaptiveConfidence(pred.confidence, pred.regime, Math.abs(pred.trendStrength));
      const adjustedPred = { ...pred, confidence: adaptive.confidence };
      if (adaptive.adjustments.length > 0) {
        adjustedPred.reasoning = [
          ...pred.reasoning,
          `🧠 AI Learned: confidence adjusted by ${adaptive.adjustments.map(a => `${a.name} ${a.delta >= 0 ? '+' : ''}${a.delta}`).join(', ')}`,
        ];
      }
      return { ...adjustedPred, name: p.name, timeframe: p.timeframe, probability: pred.bullishProb };
    });

    // Macro shock override: if a Tier-1 event is active, force regime & veto index signals
    const shock = getCurrentShock();
    if (shock?.active) {
      const vetoSet = new Set(shock.vetoedTickers);
      const bullishSet = new Set(shock.bullishTickers);
      for (let i = 0; i < newPredictions.length; i++) {
        const p = newPredictions[i];
        const tickerKey = p.ticker.replace('.NS', '');
        if (vetoSet.has(tickerKey) || vetoSet.has(p.ticker) || shock.vetoedTickers.some(v => p.ticker.includes(v) || tickerKey.includes(v))) {
          // Veto: force bearish for broad indices during macro shock
          newPredictions[i] = {
            ...p,
            regime: shock.forcedRegime,
            direction: 'NEUTRAL',
            confidence: Math.min(p.confidence, 25),
            reasoning: [...p.reasoning, `🚨 MACRO SHOCK: ${shock.forcedRegime} — index BUY signals suspended (${shock.source})`],
          };
        } else if (bullishSet.has(tickerKey) || bullishSet.has(p.ticker)) {
          // Boost safe havens and defense tickers
          newPredictions[i] = {
            ...p,
            regime: shock.forcedRegime,
            bullishProb: Math.max(p.bullishProb, 70),
            confidence: Math.min(75, p.confidence + 15),
            reasoning: [...p.reasoning, `🚨 MACRO SHOCK: ${shock.source} — sector tailwind for ${p.ticker}`],
          };
        } else {
          // General caution: reduce confidence across the board
          newPredictions[i] = {
            ...p,
            regime: shock.forcedRegime,
            confidence: Math.min(p.confidence, Math.max(15, p.confidence - 10)),
            reasoning: [...p.reasoning, `⚠️ Macro shock active (${shock.forcedRegime}) — confidence adjusted`],
          };
        }
      }
    }

    // Build gems: scan ALL stocks, compute TA, score, rank, show top 6
    // Uses Web Worker cache when available; falls back to main-thread computation
    const gemResults: { ticker: string; name: string; currentPrice: number; score: number; ta: TAIndicators | null; hasRealData: boolean }[] = [];
    const workerHistories: Record<string, OHLC[]> = {};
    const workerPrices: Record<string, { price: number; volume: number; prevClose: number }> = {};
    const workerSessionHighs: Record<string, { high: number; low: number }> = {};
    const scanTickers = PREDICTION_CORE_TICKERS.map(p => p.ticker);
    for (const ticker of scanTickers) {
      const price = getPrice(priceMap, ticker, 0);
      if (price <= 0) continue;
      const hist = getHistory(ticker);
      const current = priceMap[ticker];
      let ta: TAIndicators | null = null;
      const cachedTa = workerTaRef.current[ticker];
      if (cachedTa) {
        ta = cachedTa;
        newTaMap[ticker] = ta;
        const sm = workerSmRef.current[ticker] || { accumulation: 50, distribution: 50 };
        const score = computeGemScore(ta, sm);
        if (score >= 55) {
          gemResults.push({
            ticker, name: current?.name || ticker,
            currentPrice: price, score, ta, hasRealData: price > 0,
          });
        }
      } else if (hist && hist.length >= 50 && current && current.price > 0) {
        const hl = getSessionHL(ticker);
        const candles = buildCandleHistory(hist, current.price, current.volume, current.prevClose, hl?.high, hl?.low);
        ta = calculateIndicators(candles);
        if (ta) {
          newTaMap[ticker] = ta;
          const sm = detectSmartMoney(candles, ta);
          const score = computeGemScore(ta, sm);
          if (score >= 55) {
            gemResults.push({
              ticker, name: current?.name || ticker,
              currentPrice: price, score, ta, hasRealData: price > 0,
            });
          }
        }
      }
      // Collect data for worker (even if already cached — refreshes cache)
      if (hist && current?.price > 0) {
        workerHistories[ticker] = hist;
        workerPrices[ticker] = { price: current.price, volume: current.volume, prevClose: current.prevClose };
        const hl = getSessionHL(ticker);
        if (hl) workerSessionHighs[ticker] = hl;
      }
    }

    // Fire-and-forget: send data to Web Worker to warm cache for next cycle
    const workerTickers = Object.keys(workerHistories);
    if (workerTickers.length > 0) {
      computeInWorker(workerTickers, workerHistories, workerPrices, workerSessionHighs);
    }

    // Dynamic signals: scan predictions and TA to find best setups
    const dynamicSignals: { ticker: string; name: string; riskIndex: 'LOW' | 'MEDIUM' | 'HIGH'; reasoning: string; confidence: number; timeframe: string; price: number }[] = [];
    for (const p of newPredictions) {
      if (p.direction === 'NEUTRAL' || p.confidence < 40) continue;
      const ta = newTaMap[p.ticker];
      if (!ta) continue;
      const riskIndex: 'LOW' | 'MEDIUM' | 'HIGH' = ta.bollinger.width > 8 ? 'HIGH' : ta.bollinger.width > 5 ? 'MEDIUM' : 'LOW';
      const months = parseInt(p.timeframe) || 6;
      const timeframe = months <= 3 ? '1-4 weeks' : months <= 6 ? '3-6 months' : '6-18 months';
      const isNearSupport = ta.support > 0 && Math.abs(p.entryPrice - ta.support) / ta.support < 0.03;
      const trendDesc = ta.adx > 30 ? 'strong trend' : ta.adx > 20 ? 'moderate trend' : 'building momentum';
      const rsiNote = ta.rsi > 50 ? 'bullish RSI momentum' : 'RSI recovering from oversold';
      const macdNote = ta.macd.histogram > 0 ? 'MACD positive' : 'MACD turning';
      const reasoning = `${p.ticker} — ${p.direction} setup with ${trendDesc}. ${rsiNote}, ${macdNote}. ${isNearSupport ? 'Near key support level — favorable risk/reward. ' : ''}Confidence ${p.confidence}% from multi-factor TA analysis.`;
      dynamicSignals.push({
        ticker: p.ticker, name: p.name,
        riskIndex, reasoning,
        confidence: computeSignalConfidence(ta, p.confidence), timeframe,
        price: p.entryPrice,
      });
    }
    const sortedSignals = dynamicSignals.sort((a, b) => b.confidence - a.confidence);

    // Defer setState + impure operations to microtask (lint: no sync setState in effect)
    queueMicrotask(() => {
      setPredictions(prev => {
        const byTicker = new Map(prev.map(p => [p.ticker, p]));
        for (const p of newPredictions) byTicker.set(p.ticker, p);
        return Array.from(byTicker.values()).sort((a, b) => b.confidence - a.confidence);
      });
      resolvePending(priceMap as Record<string, { price: number }>);
      archiveOldResolvedPredictions();
      runAILearningOnResolved();
      const stored = getResolvedPredictions();

      if (stored.length > 0) {
        setAccuracyHistory(stored.map(p => ({
          id: p.id, ticker: p.ticker, direction: p.direction,
          targetPrice: p.targetPrice, targetDate: p.targetDate, entryPrice: p.entryPrice,
          createdAt: p.createdAt, resolved: p.resolved,
          correct: p.result === 'CORRECT', actualPrice: p.actualPrice,
        })));
      } else {
        setAccuracyHistory(prev => {
          const newRecords = newPredictions
            .filter(p => p.targetPrice > 0 && p.entryPrice > 0)
            .map(p => ({
              id: `${p.ticker}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              ticker: p.ticker, direction: p.direction,
              targetPrice: p.targetPrice, targetDate: p.targetDate, entryPrice: p.entryPrice,
              createdAt: Date.now(),
            }));
          return [...prev, ...newRecords].slice(-200);
        });
      }

      setHiddenGems(gemResults.sort((a, b) => b.score - a.score).slice(0, 6));
      setSignalPrices(sortedSignals.slice(0, 5));
    });

    queueMicrotask(() => {
    setTaData(newTaMap);

    const tm = computeTrustMetrics();
    setBacktestStats({ accuracy: tm.trustScore, total: tm.totalPredictions });

    // Compute daily + weekly outlook for each ticker with TA
    const newDailyWeekly: Record<string, DailyWeeklyPrediction> = {};
    for (const [ticker, ta] of Object.entries(newTaMap)) {
      const price = priceMap[ticker]?.price;
      if (price && price > 0) {
        newDailyWeekly[ticker] = computeDailyWeeklyPrediction(ticker, price, ta, {
          isClosingHalfHour: sessionState.isClosingHalfHour,
          minutesToClose: sessionState.minutesToClose,
          dayOfWeek: sessionState.dayOfWeek,
          sessionLabel: sessionState.sessionLabel,
        });
      }
    }
    setDailyWeeklyMap(newDailyWeekly);

    // Assess overall market condition from all stocks with TA
    const allWithTa = scanTickers.filter(t => newTaMap[t]).map(t => ({ ta: newTaMap[t]! }));
    if (allWithTa.length > 0) setMarketCondition(assessMarketCondition(allWithTa));

    setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

    // Record predictions to central trust store — hash-deduped
    let recordHash = '';
    const storeRecords: Parameters<typeof addPredictions>[0] = [];
    const { overall: overallSentiment, byTicker: sentimentByTicker } = getAggregatedSentiment(48);
    for (const p of newPredictions) {
      if (p.targetPrice <= 0 || p.entryPrice <= 0) continue;
      const dw = newDailyWeekly[p.ticker];
      const ta = newTaMap[p.ticker];
      const isShort = parseInt(p.timeframe) <= 6;
      storeRecords.push({
        ticker: p.ticker, name: p.name, source: 'AI_QUANT',
        predictionType: isShort ? ('WEEKLY' as const) : ('MONTHLY' as const),
        direction: p.direction, bullishProb: p.bullishProb, bearishProb: p.bearishProb,
        confidence: p.confidence, entryPrice: p.entryPrice, targetPrice: p.targetPrice,
        expectedVolatility: p.volatilityRisk, marketCondition: marketConditionRef.current?.description || '',
        regime: p.regime, sentimentScore: sentimentByTicker[p.ticker] ?? overallSentiment ?? 50,
        taSnapshot: ta ? {
          rsi: ta.rsi, macd: ta.macd.line, adx: ta.adx,
          bollingerWidth: ta.bollinger.width, atr: ta.atr,
          stochRsi: ta.stochRsi, supertrendDirection: ta.supertrend.direction,
        } : null,
        fullSnapshot: ta ? buildSnapshotFromTA(ta, p.entryPrice, priceMap[p.ticker]?.volume || 0) : undefined,
        reasoning: p.reasoning,
        dailyDirection: dw?.daily.direction, dailyConfidence: dw?.daily.confidence,
        weeklyDirection: dw?.weekly.direction, weeklyConfidence: dw?.weekly.confidence,
        signalQuality: dw?.signalQuality,
        targetDate: p.targetDate,
        expiryDate: getExpiryDate(isShort ? 'WEEKLY' : 'MONTHLY'),
      });
    }
    // Also record daily/weekly outlooks for tickers not in PREDICTION_TICKERS
    for (const [ticker, dw] of Object.entries(newDailyWeekly)) {
      if (storeRecords.some(r => r.ticker === ticker)) continue;
      const price = priceMap[ticker]?.price;
      if (!price || price <= 0) continue;
      const ta = newTaMap[ticker];
      storeRecords.push({
        ticker, name: priceMap[ticker]?.name || ticker, source: 'AI_QUANT',
        predictionType: 'DAILY',
        direction: dw.daily.direction, bullishProb: dw.daily.direction === 'BULLISH' ? 65 : 35,
        bearishProb: dw.daily.direction === 'BEARISH' ? 65 : 35,
        confidence: dw.daily.confidence, entryPrice: price, targetPrice: dw.daily.targetPrice,
        expectedVolatility: 30, marketCondition: marketConditionRef.current?.description || '',
        regime: '', sentimentScore: sentimentByTicker[ticker] ?? overallSentiment ?? 50,
        taSnapshot: ta ? {
          rsi: ta.rsi, macd: ta.macd.line, adx: ta.adx,
          bollingerWidth: ta.bollinger.width, atr: ta.atr,
          stochRsi: ta.stochRsi, supertrendDirection: ta.supertrend.direction,
        } : null,
        fullSnapshot: ta ? buildSnapshotFromTA(ta, price, priceMap[ticker]?.volume || 0) : undefined,
        reasoning: dw.daily.reasoning,
        dailyDirection: dw.daily.direction, dailyConfidence: dw.daily.confidence,
        weeklyDirection: dw.weekly.direction, weeklyConfidence: dw.weekly.confidence,
        signalQuality: dw.signalQuality,
        targetDate: getDateKey(1),
        expiryDate: getExpiryDate('DAILY'),
      });
    }
    // Also record hourly outlooks for all tickers with TA data
    for (const [ticker, ta] of Object.entries(newTaMap)) {
      const price = priceMap[ticker]?.price;
      if (!price || price <= 0 || storeRecords.some(r => r.ticker === ticker && r.predictionType === 'HOURLY')) continue;
      const hp = computeHourlyPrediction(ticker, price, ta, {
        isOpeningHalfHour: sessionState.isOpeningHalfHour,
        isClosingHalfHour: sessionState.isClosingHalfHour,
        minutesToClose: sessionState.minutesToClose,
        dayOfWeek: sessionState.dayOfWeek,
      });
      storeRecords.push({
        ticker, name: priceMap[ticker]?.name || ticker, source: 'AI_QUANT',
        predictionType: 'HOURLY',
        direction: hp.direction, bullishProb: hp.direction === 'BULLISH' ? 60 : 35,
        bearishProb: hp.direction === 'BEARISH' ? 60 : 35,
        confidence: hp.confidence, entryPrice: price, targetPrice: hp.targetPrice,
        expectedVolatility: 25, marketCondition: marketConditionRef.current?.description || '',
        regime: '', sentimentScore: sentimentByTicker[ticker] ?? overallSentiment ?? 50,
        taSnapshot: ta ? {
          rsi: ta.rsi, macd: ta.macd.line, adx: ta.adx,
          bollingerWidth: ta.bollinger.width, atr: ta.atr,
          stochRsi: ta.stochRsi, supertrendDirection: ta.supertrend.direction,
        } : null,
        fullSnapshot: ta ? buildSnapshotFromTA(ta, price, priceMap[ticker]?.volume || 0) : undefined,
        reasoning: hp.reasoning,
        targetDate: getDateKey(0),
        expiryDate: getExpiryDate('HOURLY'),
      });
    }
    if (storeRecords.length > 0) {
      for (const r of storeRecords) recordHash += `${r.ticker}|${r.predictionType}|${r.entryPrice.toFixed(2)}|${r.targetPrice.toFixed(2)},`;
      if (recordHash !== lastRecordHashRef.current) {
        lastRecordHashRef.current = recordHash;
        addPredictions(storeRecords);
      }
    }
    });
    // Intentionally throttled deps — full deps retrigger prediction storm on every tick
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [throttledStocks, stocks, indices, marketMode, horizonFilter, isActive, activeModule]);

  // AI Learning: analyze resolved predictions on interval
  useEffect(() => {
    if (!isActive) return;
    const doLearning = () => {
      try { runAILearningOnResolved(); } catch { /* */ }
    };
    doLearning();
    const timer = setInterval(doLearning, 120000); // every 2 min
    return () => clearInterval(timer);
  }, [isActive]);

  useEffect(() => {
    if (!isActive || (activeModule !== 'GEMS' && activeModule !== 'STOCK_PULSE')) return;
    const syncServerPulse = () => {
      fetch('/api/stock-pulse?action=status', { cache: 'no-store' })
        .then(r => r.json())
        .then(d => {
          setPulseServerLearning(!!d.active);
          if (d.marketBrief) setPulseServerBrief(d.marketBrief);
          if (Array.isArray(d.gems) && d.gems.length > 0) {
            setMultibaggerPicks(d.gems);
            multibaggerFetchedRef.current = Date.now();
          }
        })
        .catch(() => {});
    };
    syncServerPulse();
    const id = setInterval(syncServerPulse, 90_000);
    return () => clearInterval(id);
  }, [isActive, activeModule]);

  useEffect(() => {
    if (!isActive || activeModule !== 'GEMS') return;
    const now = Date.now();
    if (now - multibaggerFetchedRef.current < 120_000 && multibaggerPicks.length > 0) return;
    multibaggerFetchedRef.current = now;
    setMultibaggerLoading(true);
    setMultibaggerError(null);
    fetch('/api/stock-pulse?action=multibagger&limit=8&batch=28', { cache: 'no-store' })
      .then(async r => {
        const d = await r.json();
        if (!r.ok) {
          setMultibaggerError(typeof d.error === 'string' ? d.error : 'Multibagger scan failed');
          return;
        }
        if (d.picks?.length) setMultibaggerPicks(d.picks);
        else if (d.error) setMultibaggerError(String(d.error));
      })
      .catch(() => setMultibaggerError('Could not reach Stock Pulse API'))
      .finally(() => setMultibaggerLoading(false));
  }, [isActive, activeModule, multibaggerPicks.length]);

  // Generate dynamic news from real price movements
  const movers = useMemo(() => {
    if (activeModule !== 'NEWS') return [];
    const list: { ticker: string; pct: number; price: number; name: string }[] = [];
    for (const [ticker, s] of Object.entries(throttledStocks)) {
      if (s.changePercent && Math.abs(s.changePercent) >= 1.0) {
        list.push({ ticker, pct: s.changePercent, price: s.price, name: s.name });
      }
    }
    return list.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
  }, [activeModule, throttledStocks]);

  // Per-ticker news sentiment (computed from all stored news)
  const newsSentimentByTicker = useMemo(() => {
    void (newsFeed.length > 0 ? newsFeed[0]?.id : '');
    return getAggregatedSentiment(24).byTicker;
  }, [newsFeed]);

  // Real news polling every 10 seconds — streaming feed
  const newsFetchingRef = useRef(false);
  const [newsError, setNewsError] = useState(false);
  useEffect(() => {
    if (!isActive || activeModule !== 'NEWS') return;
    let active = true;
    const doFetch = async () => {
      if (newsFetchingRef.current) return;
      newsFetchingRef.current = true;
      setNewsError(false);
      try {
        const res = await fetch(`/api/news?_=${Date.now()}`, { cache: 'no-store' });
        if (!active) return;
        if (res.ok) {
          const data = await res.json();
          if (data.news && data.news.length > 0) {
            addNewsEvents(data.news.map((n: {
              id: string; timestamp: number; source: string; region: string;
              headline: string; summary: string; sentiment: string; impactScore: number;
              tickers: string[]; url?: string; isElite?: boolean; macroEventId?: string;
              llmAnalyzed?: boolean; llmReasoning?: string; llmUrgency?: number;
            }) => ({
              id: n.id,
              timestamp: n.timestamp,
              source: n.source,
              region: n.region as 'INDIAN' | 'INTERNATIONAL',
              headline: n.headline,
              summary: n.llmReasoning || n.summary || n.headline,
              sentiment: n.sentiment as 'BULLISH' | 'BEARISH' | 'NEUTRAL',
              impactScore: n.impactScore,
              tickers: n.tickers || [],
              url: n.url,
              isElite: n.isElite,
              macroEventId: n.macroEventId,
              llmAnalyzed: n.llmAnalyzed,
              llmReasoning: n.llmReasoning,
              llmUrgency: n.llmUrgency,
            })));
            const stored = getNewsFeed(30).map(n => ({
              ...n,
              timestamp: new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            }));
            if (stored.length > 0) {
              setNewsFeed(stored);
              newsFeedRef.current = stored;
            }
          }
          if (data.macro) {
            applyServerMacroShock({ active: !!data.macro.active, detail: data.macro.detail, info: data.macro.info });
          }
        } else {
          setNewsError(true);
        }
      } catch {
        if (active) setNewsError(true);
      }
      if (active) newsFetchingRef.current = false;
    };
    doFetch();
    const timer = setInterval(doFetch, 30000);
    return () => { active = false; clearInterval(timer); };
  }, [isActive, activeModule]);

  const macShock = getCurrentShock();

  return (
    <>
      <div className={`terminal-panel p-4 sm:p-5 lg:p-6 space-y-5 hover:border-slate-700/60 transition-all duration-500 min-w-0 ${macShock?.active ? 'ring-2 ring-red-500/30' : ''}`}>
      {pulseServerLearning && (
        <div className="rounded-xl border border-orange-900/40 bg-orange-950/20 px-3 py-2 text-[9px] font-mono text-orange-200/90 leading-relaxed">
          <span className="font-bold text-orange-300">24/7 server learning active</span>
          <span className="text-slate-500"> — no browser needed on Render. Stock Pulse + gems + macro/news run in background.</span>
          {pulseServerBrief && <p className="mt-1.5 text-slate-400 line-clamp-2">{pulseServerBrief}</p>}
        </div>
      )}

      <div className="flex flex-col border-b border-slate-800/80 pb-4 gap-4">
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <div className={`h-2.5 w-2.5 rounded-full shrink-0 mt-1 sm:mt-0 ${feed.dotClass} ${pricesStreaming ? 'animate-pulse-glow' : ''}`} />
          <h2 className="text-sm sm:text-base font-bold text-white tracking-tight font-mono flex flex-wrap items-center gap-2 min-w-0">
            <span className="flex items-center gap-1.5">
              <TerminalIcon name="cpu" size={18} className="text-emerald-400 shrink-0" />
              AI_QUANT_ENGINE
            </span>
            <span className="text-[8px] font-mono text-emerald-500 bg-emerald-950/30 border border-emerald-900/40 px-1.5 py-0.5 rounded">TA v3.0</span>
            <span className="text-[7px] font-mono text-orange-400/90 bg-orange-950/30 border border-orange-900/40 px-1.5 py-0.5 rounded hidden sm:inline">{INDIAN_UNIVERSE_LABEL}</span>
            {backtestStats.total > 0 && (
              <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded border ${backtestStats.accuracy > 60 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'}`}>
                {backtestStats.accuracy.toFixed(0)}% live
              </span>
            )}
            {lastUpdated && <span className="text-[7px] text-slate-600 font-mono">↻ {lastUpdated}</span>}
          </h2>
        </div>
        <div
          className="tab-scroll scrollbar-none w-full bg-slate-950/80 p-2 border border-slate-800 rounded-xl lg:grid lg:grid-cols-5 xl:grid-cols-10 lg:gap-1.5 lg:overflow-visible"
          role="tablist"
          aria-label="AI Analytics modules"
        >
          {AI_MODULE_TABS.map(tab => {
            const active = activeModule === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => selectModule(tab.key)}
                className={`flex flex-col items-center justify-center gap-1 min-w-18 sm:min-w-0 min-h-13 px-2 py-2 rounded-lg transition-colors duration-150 font-mono ${
                  active
                    ? `bg-slate-800 text-emerald-400 border border-emerald-500/40 shadow-lg shadow-emerald-950/30${isTabPending ? ' opacity-80' : ''}`
                    : 'text-slate-500 border border-transparent hover:text-slate-200 hover:bg-slate-800/40'
                }`}
                role="tab"
                aria-selected={active}
                aria-controls={`panel-${tab.key}`}
              >
                <TerminalIcon name={tab.icon} size={18} className={active ? 'text-emerald-400' : 'text-slate-500'} />
                <span className="text-[8px] sm:text-[9px] font-bold leading-tight text-center whitespace-nowrap">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* DAILY MARKET PREDICTION */}
      <ModulePanel moduleKey="DAILY" activeModule={activeModule}>
        <DailyPredictionTab dailyRecs={dailyRecs} experienceStats={experienceStats} stocks={stocks} sessionState={sessionState} learningCounter={learningCounter} />
      </ModulePanel>

      {/* SESSION SIGNALS */}
      <ModulePanel moduleKey="SESSION" activeModule={activeModule}>
        <SessionSignalsTab
          stocks={stocks}
          taData={taData}
          historyCache={getHistory}
          sessionState={sessionState}
          sessionSignal={sessionSignal}
        />
      </ModulePanel>

      {/* NEWS DESK */}
      <ModulePanel moduleKey="NEWS" activeModule={activeModule}>
        <div className="space-y-3">
          <div className="flex justify-between items-center px-1">
            <span className="text-[9px] uppercase font-bold text-slate-500 tracking-widest font-mono">
              📡 AI Market Feed — AI-Generated News Analysis
            </span>
            <span className={`flex items-center gap-1.5 text-[9px] font-mono px-2 py-0.5 border rounded-full ${feed.badgeClass}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${feed.dotClass}`} />
              {feed.label}
            </span>
          </div>
          {newsError && (
            <div className="rounded-lg border border-red-500/30 bg-red-950/30 px-3 py-2 text-[9px] font-mono text-red-300">
              News API unavailable — retrying automatically…
            </div>
          )}
          
          {/* Top-Tier: Live Market Sentiment Heatmap */}
          <div className="mb-4">
            <SentimentHeatmap sentimentByTicker={newsSentimentByTicker} />
          </div>
          {movers.length > 0 && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
              <div className="text-[8px] uppercase font-bold text-slate-500 tracking-widest font-mono mb-2">Top price movers (live)</div>
              <div className="flex flex-wrap gap-2">
                {movers.slice(0, 10).map(m => (
                  <span
                    key={m.ticker}
                    className={`text-[8px] font-mono px-2 py-1 rounded border ${m.pct >= 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}
                  >
                    {m.ticker} {m.pct >= 0 ? '+' : ''}{m.pct.toFixed(1)}%
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1 custom-scrollbar">
            {newsFeed.map((item) => (
              <div key={item.id} className="p-3.5 border border-slate-800/80 bg-slate-950/40 rounded-xl transition-all duration-300 hover:bg-slate-950/70 hover:border-slate-700/60 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[9px] font-mono text-slate-500 bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded">{item.timestamp}</span>
                    <span className={`text-[9px] font-bold font-mono px-1.5 py-0.5 rounded-full ${item.region === 'INDIAN' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'}`}>{item.region}</span>
                    <span className="text-[9px] font-semibold text-slate-500 font-mono">{item.source}</span>
                    <span className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded ${item.sentiment === 'BULLISH' ? 'bg-emerald-500/10 text-emerald-400' : item.sentiment === 'BEARISH' ? 'bg-red-500/10 text-red-400' : 'bg-slate-500/10 text-slate-400'}`}>{item.sentiment}</span>
                  </div>
                  <p className="text-xs font-medium text-slate-200 leading-relaxed">{item.headline}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0 self-end md:self-center">
                  <div className="text-right">
                    <div className="text-[8px] font-mono uppercase text-slate-600 font-bold">Impact</div>
                    <div className="text-xs font-mono font-bold text-white">{Math.min(100, Math.max(0, item.impactScore))}/100</div>
                    <div className="w-full bg-slate-800 rounded-full h-1 mt-0.5">
                      <div className={`h-1 rounded-full transition-all duration-700 ${item.impactScore > 75 ? 'bg-emerald-500' : item.impactScore > 50 ? 'bg-yellow-500' : 'bg-slate-500'}`} style={{ width: `${item.impactScore}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </ModulePanel>

      {/* PREDICTIONS */}
      <ModulePanel moduleKey="PREDICTIONS" activeModule={activeModule}>
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-[9px] uppercase font-bold text-slate-500 tracking-widest font-mono">
              🔮 Multi-Factor AI Predictions — Real TA
            </span>
            {marketCondition && (
              <span className={`text-[7px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                marketCondition.regime === 'STRONG_BULLISH' || marketCondition.regime === 'BULLISH' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-900/40' :
                marketCondition.regime === 'STRONG_BEARISH' || marketCondition.regime === 'BEARISH' ? 'bg-red-500/15 text-red-400 border-red-900/40' :
                marketCondition.regime === 'HIGH_VOLATILITY' ? 'bg-purple-500/15 text-purple-400 border-purple-900/40' :
                'bg-slate-500/15 text-slate-400 border-slate-700'
              }`}>
                Market: {marketCondition.regime.replace('_', ' ')} · {marketCondition.trendQuality} trend
              </span>
            )}
            <div className="flex bg-slate-950/60 p-0.5 border border-slate-800 rounded-lg">
              <button onClick={() => setHorizonFilter('SHORT')} className={`px-3 py-1 text-[9px] font-bold rounded-lg transition-all ${horizonFilter === 'SHORT' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-500 hover:text-white'}`}>⚡ Short</button>
              <button onClick={() => setHorizonFilter('LONG')} className={`px-3 py-1 text-[9px] font-bold rounded-lg transition-all ${horizonFilter === 'LONG' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-500 hover:text-white'}`}>🏛️ Long</button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {predictions
              .filter(p => horizonFilter === 'SHORT' ? isShortHorizon(p.timeframe) : !isShortHorizon(p.timeframe))
              .slice(0, 6).map((pred, i) => {
              const ta = taData[pred.ticker];
              const sm = ta ? detectSmartMoney([], ta) : null;
              return (
              <div key={i} className={`p-4 rounded-xl border transition-all duration-300 hover:shadow-lg cursor-pointer ${pred.direction === 'BULLISH' ? 'border-emerald-900/40 bg-emerald-950/10 hover:border-emerald-700/60' : pred.direction === 'BEARISH' ? 'border-red-900/40 bg-red-950/10 hover:border-red-700/60' : 'border-slate-700/40 bg-slate-950/20 hover:border-slate-600/60'}`}
                onClick={() => setSelectedTicker(selectedTicker === pred.ticker ? null : pred.ticker)}>
                <div className="flex items-start justify-between flex-wrap gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold font-mono text-white">{pred.ticker}</span>
                    <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${pred.direction === 'BULLISH' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : pred.direction === 'BEARISH' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-slate-500/20 text-slate-400 border border-slate-500/30'}`}>
                      {pred.direction === 'BULLISH' ? '📈 BULLISH' : pred.direction === 'BEARISH' ? '📉 BEARISH' : '⚖️ NEUTRAL'}
                    </span>
                    {stocks[pred.ticker]?.price > 0 && <span className="text-[7px] text-emerald-500 font-mono bg-emerald-950/30 px-1 rounded border border-emerald-900/50">LIVE</span>}
                    <RegimeBadge regime={pred.regime} />
                    <span className="text-[8px] text-slate-500 font-mono">{pred.timeframe}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between bg-slate-950/40 rounded-lg px-3 py-2 mb-2 border border-slate-800/50">
                  <div>
                    <div className="text-[7px] text-slate-500 font-mono uppercase">Live price</div>
                    <LiveTickerPrice ticker={pred.ticker} stocks={stocks} fallback={pred.entryPrice} decimals={2} className="text-sm font-bold text-white" showChange />
                  </div>
                  <div className="text-right text-[8px] font-mono text-slate-500">
                    <div>Model entry</div>
                    <div className="text-slate-400">{tickerCurrency(pred.ticker)}{pred.entryPrice > 0 ? pred.entryPrice.toFixed(2) : '—'}</div>
                  </div>
                </div>

                {/* Probability bars */}
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <div className="flex items-center justify-between text-[8px] mb-1">
                      <span className="text-emerald-400 font-mono">Bullish {pred.bullishProb.toFixed(0)}%</span>
                      <span className="text-red-400 font-mono">Bearish {pred.bearishProb.toFixed(0)}%</span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-2 flex overflow-hidden">
                      <div className="h-full rounded-l-full bg-emerald-500 transition-all duration-500" style={{ width: `${pred.bullishProb}%` }} />
                      <div className="h-full rounded-r-full bg-red-500 transition-all duration-500" style={{ width: `${pred.bearishProb}%` }} />
                    </div>
                  </div>
                  <div className="text-right">
                    <ConfidenceBar value={pred.confidence} label="Confidence" />
                    <ConfidenceBar value={pred.trendStrength} label="Trend" color="#3b82f6" />
                  </div>
                </div>

                {/* Expected % change — prominent */}
                {pred.targetPrice > 0 && pred.entryPrice > 0 && (() => {
                  const pctChange = ((pred.targetPrice - pred.entryPrice) / pred.entryPrice * 100);
                  const dir = pctChange >= 0 ? '▲' : '▼';
                  const color = pctChange > 0 ? 'text-emerald-400' : pctChange < 0 ? 'text-red-400' : 'text-slate-300';
                  return (
                    <div className="flex items-center justify-between bg-slate-950/30 rounded-lg p-2.5 mb-2 border border-slate-800/50">
                      <div className="flex items-center gap-3">
                        <span className={`text-xl font-bold font-mono ${color}`}>{dir} {Math.abs(pctChange).toFixed(1)}%</span>
                        <div className="text-[9px] font-mono leading-tight">
                          <div className="text-slate-500">Target <span className={color}>{tickerCurrency(pred.ticker)}{pred.targetPrice.toFixed(2)}</span></div>
                          <div className="text-slate-600">by {pred.targetDate}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right text-[8px] font-mono">
                          <div className="text-slate-500">Entry</div>
                          <div className="text-white font-bold">{tickerCurrency(pred.ticker)}{pred.entryPrice.toFixed(2)}</div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Signal strength bar */}
                {pred.targetPrice > 0 && (() => {
                  const signalScore = (pred.confidence * 0.5 + pred.trendStrength * 0.3 + Math.abs(pred.bullishProb - 50) * 0.2);
                  const clamped = Math.min(100, Math.max(0, signalScore));
                  return (
                    <div className="flex items-center gap-2 text-[8px] font-mono mb-2 px-1">
                      <span className="text-slate-500 w-10 shrink-0">Signal</span>
                      <div className="flex-1 bg-slate-800 rounded-full h-1.5">
                        <div className="h-1.5 rounded-full transition-all duration-500" style={{
                          width: `${clamped}%`,
                          background: clamped > 70 ? '#22c55e' : clamped > 45 ? '#eab308' : '#ef4444',
                        }} />
                      </div>
                      <span className={`font-bold w-7 text-right ${clamped > 70 ? 'text-emerald-400' : clamped > 45 ? 'text-yellow-400' : 'text-red-400'}`}>{clamped.toFixed(0)}</span>
                    </div>
                  );
                })()}

                {/* Daily + Weekly outlook badges */}
                {ta && dailyWeeklyMap[pred.ticker] && (() => {
                  const dw = dailyWeeklyMap[pred.ticker];
                  return (
                    <div className="flex items-center gap-2 mb-2 px-1 flex-wrap">
                      <span className={`text-[7px] font-mono font-bold px-1.5 py-0.5 rounded-full border ${
                        dw.daily.direction === 'BULLISH' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-900/40' :
                        dw.daily.direction === 'BEARISH' ? 'bg-red-500/20 text-red-400 border-red-900/40' :
                        'bg-slate-500/20 text-slate-400 border-slate-700'
                      }`}>
                        Daily {dw.daily.direction === 'BULLISH' ? '▲' : dw.daily.direction === 'BEARISH' ? '▼' : '◆'} {dw.daily.confidence}%
                      </span>
                      <span className={`text-[7px] font-mono font-bold px-1.5 py-0.5 rounded-full border ${
                        dw.weekly.direction === 'BULLISH' ? 'bg-blue-500/20 text-blue-400 border-blue-900/40' :
                        dw.weekly.direction === 'BEARISH' ? 'bg-orange-500/20 text-orange-400 border-orange-900/40' :
                        'bg-slate-500/20 text-slate-400 border-slate-700'
                      }`}>
                        Weekly {dw.weekly.direction === 'BULLISH' ? '▲' : dw.weekly.direction === 'BEARISH' ? '▼' : '◆'} {dw.weekly.confidence}%
                      </span>
                      <span className={`text-[7px] font-mono font-bold px-1.5 py-0.5 rounded-full border ${
                        dw.signalQuality === 'EXCELLENT' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-900/40' :
                        dw.signalQuality === 'GOOD' ? 'bg-blue-500/20 text-blue-400 border-blue-900/40' :
                        dw.signalQuality === 'FAIR' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-900/40' :
                        'bg-slate-500/20 text-slate-400 border-slate-700'
                      }`}>
                        {dw.signalQuality === 'EXCELLENT' ? '🟢' : dw.signalQuality === 'GOOD' ? '🔵' : dw.signalQuality === 'FAIR' ? '🟡' : '⚪'} {dw.signalQuality}
                      </span>
                      {dw.recommendation !== 'HOLD' && (
                        <span className={`text-[7px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                          dw.recommendation === 'STRONG_BUY' ? 'bg-emerald-500/25 text-emerald-300 border-emerald-500/50' :
                          dw.recommendation === 'BUY' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-900/40' :
                          dw.recommendation === 'AVOID' ? 'bg-red-500/15 text-red-400 border-red-900/40' :
                          'bg-red-500/25 text-red-300 border-red-500/50'
                        }`}>
                          {dw.recommendation === 'STRONG_BUY' ? '⚡' : dw.recommendation === 'BUY' ? '📈' : dw.recommendation === 'AVOID' ? '⚠️' : '🚫'} {dw.recommendation.replace('_', ' ')}
                        </span>
                      )}
                    </div>
                  );
                })()}

                {/* Factor badges */}
                {ta && (() => {
                  const factors: { label: string; active: boolean; bull: boolean }[] = [
                    { label: 'RSI', active: ta.rsi > 50, bull: ta.rsi > 50 },
                    { label: 'MACD', active: ta.macd.histogram > 0, bull: ta.macd.histogram > 0 },
                    { label: 'ADX', active: ta.adx > 25, bull: ta.supertrend.direction === 'up' },
                    { label: 'Vol', active: ta.bollinger.width > 4, bull: false },
                    { label: 'EMA', active: true, bull: pred.direction === 'BULLISH' },
                  ];
                  return (
                    <div className="flex items-center gap-1.5 mb-2 px-1 flex-wrap">
                      <span className="text-[7px] text-slate-600 font-mono uppercase mr-0.5">Factors:</span>
                      {factors.map(f => (
                        <span key={f.label} className={`text-[7px] font-mono font-bold px-1 py-0.5 rounded border ${
                          f.active
                            ? f.bull ? 'bg-emerald-500/15 text-emerald-400 border-emerald-900/40' : 'bg-red-500/15 text-red-400 border-red-900/40'
                            : 'bg-slate-800/30 text-slate-600 border-slate-800'
                        }`}>
                          {f.label}{f.active ? f.bull ? '▲' : '▼' : '–'}
                        </span>
                      ))}
                      <span className={`text-[7px] font-mono font-bold px-1 py-0.5 rounded border ${
                        sm?.accumulation && sm.accumulation > 55
                          ? 'bg-purple-500/15 text-purple-400 border-purple-900/40'
                          : sm?.distribution && sm.distribution > 55
                          ? 'bg-orange-500/15 text-orange-400 border-orange-900/40'
                          : 'bg-slate-800/30 text-slate-600 border-slate-800'
                      }`}>
                        {sm?.accumulation && sm.accumulation > 55 ? 'Smart$▲' : sm?.distribution && sm.distribution > 55 ? 'Smart$▼' : 'Smart$–'}
                      </span>
                    </div>
                  );
                })()}

                {/* Reasoning */}
                <div className="bg-slate-950/40 rounded-lg p-3">
                  <p className="text-[10px] text-slate-300 leading-relaxed">
                    <span className="text-emerald-400 font-bold font-mono text-[8px] block uppercase mb-1">🧠 Multi-Factor Analysis:</span>
                    {pred.reasoning.slice(0, 3).join(' · ')}
                  </p>
                </div>

                {/* TA Detail panel (expanded) */}
                {selectedTicker === pred.ticker && ta && (
                  <div className="mt-3 p-3 bg-slate-950/60 rounded-lg border border-slate-700/50 space-y-2">
                    <div className="text-[8px] font-bold text-emerald-400 font-mono uppercase mb-2">📊 Technical Analysis Detail</div>
                    <div className="grid grid-cols-3 gap-2 text-[8px] font-mono">
                      <div className="bg-slate-950 rounded p-2"><span className="text-slate-500">RSI </span><span className="text-white">{ta.rsi.toFixed(1)}</span></div>
                      <div className="bg-slate-950 rounded p-2"><span className="text-slate-500">MACD </span><span className="text-white">{ta.macd.line.toFixed(2)}</span></div>
                      <div className="bg-slate-950 rounded p-2"><span className="text-slate-500">ADX </span><span className="text-white">{ta.adx.toFixed(1)}</span></div>
                      <div className="bg-slate-950 rounded p-2"><span className="text-slate-500">BB Width </span><span className="text-white">{ta.bollinger.width.toFixed(1)}%</span></div>
                      <div className="bg-slate-950 rounded p-2"><span className="text-slate-500">ATR </span><span className="text-white">{ta.atr.toFixed(2)}</span></div>
                      <div className="bg-slate-950 rounded p-2"><span className="text-slate-500">StochRSI </span><span className="text-white">{ta.stochRsi.toFixed(1)}</span></div>
                    </div>
                    <div className="flex items-center gap-2 mt-2 text-[8px] font-mono">
                      <span className="text-slate-500">Support: </span><span className="text-emerald-400 font-bold">${ta.support.toFixed(2)}</span>
                      <span className="text-slate-500 ml-2">Resistance: </span><span className="text-red-400 font-bold">${ta.resistance.toFixed(2)}</span>
                      <span className="text-slate-500 ml-2">VWAP: </span><span className="text-white">${ta.vwap.toFixed(2)}</span>
                    </div>
                    {sm && (
                      <div className="mt-1 text-[8px] font-mono">
                        <span className="text-slate-500">Smart Money: </span>
                        <span className={sm.accumulation > 60 ? 'text-emerald-400' : sm.distribution > 60 ? 'text-red-400' : 'text-slate-400'}>
                          {sm.institutionalActivity}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )})}
          </div>
        </div>
      </ModulePanel>

      {/* TRACK RECORD */}
      <ModulePanel moduleKey="TRACK" activeModule={activeModule}>
        <div className="space-y-4">
          <div className="flex justify-between items-center px-1">
            <span className="text-[9px] uppercase font-bold text-slate-500 tracking-widest font-mono">📊 AI Track Record — Historical Validation</span>
            {lastUpdated && <span className="text-[7px] text-slate-600 font-mono">Updated {lastUpdated}</span>}
          </div>

          {/* Market condition overview */}
          {marketCondition && (
            <div className="grid grid-cols-4 gap-2 text-[8px] font-mono">
              <div className="bg-slate-950/50 rounded-lg p-3 border border-slate-800/50 text-center">
                <span className="text-slate-500 block mb-0.5">Market Regime</span>
                <span className={`font-bold ${
                  marketCondition.regime === 'STRONG_BULLISH' || marketCondition.regime === 'BULLISH' ? 'text-emerald-400' :
                  marketCondition.regime === 'STRONG_BEARISH' || marketCondition.regime === 'BEARISH' ? 'text-red-400' :
                  marketCondition.regime === 'HIGH_VOLATILITY' ? 'text-purple-400' : 'text-yellow-400'
                }`}>{marketCondition.regime.replace('_', ' ')}</span>
              </div>
              <div className="bg-slate-950/50 rounded-lg p-3 border border-slate-800/50 text-center">
                <span className="text-slate-500 block mb-0.5">Volatility</span>
                <span className={`font-bold ${marketCondition.volatility === 'HIGH' ? 'text-red-400' : marketCondition.volatility === 'MEDIUM' ? 'text-yellow-400' : 'text-emerald-400'}`}>{marketCondition.volatility}</span>
              </div>
              <div className="bg-slate-950/50 rounded-lg p-3 border border-slate-800/50 text-center">
                <span className="text-slate-500 block mb-0.5">Momentum</span>
                <span className="font-bold text-white">{marketCondition.momentum}</span>
              </div>
              <div className="bg-slate-950/50 rounded-lg p-3 border border-slate-800/50 text-center">
                <span className="text-slate-500 block mb-0.5">Trend Quality</span>
                <span className={`font-bold ${marketCondition.trendQuality === 'EXCELLENT' ? 'text-emerald-400' : marketCondition.trendQuality === 'GOOD' ? 'text-blue-400' : marketCondition.trendQuality === 'FAIR' ? 'text-yellow-400' : 'text-red-400'}`}>{marketCondition.trendQuality}</span>
              </div>
            </div>
          )}

          {/* Accuracy summary */}
          <div className="grid grid-cols-4 gap-3 text-[8px] font-mono">
            <div className="bg-slate-950/50 rounded-xl p-4 border border-slate-800/50 text-center">
              <div className="text-slate-500 uppercase mb-1">Total Pred.</div>
              <div className="text-lg font-bold text-white">{accuracyHistory.length}</div>
            </div>
            <div className="bg-slate-950/50 rounded-xl p-4 border border-slate-800/50 text-center">
              <div className="text-slate-500 uppercase mb-1">Resolved</div>
              <div className="text-lg font-bold text-white">{accuracyHistory.filter(r => r.resolved).length}</div>
            </div>
            <div className="bg-slate-950/50 rounded-xl p-4 border border-slate-800/50 text-center">
              <div className="text-slate-500 uppercase mb-1">Correct</div>
              <div className={`text-lg font-bold ${(() => {
                const res = accuracyHistory.filter(r => r.resolved);
                const corr = res.filter(r => r.correct).length;
                const rate = res.length ? (corr / res.length * 100) : 0;
                return rate > 60 ? 'text-emerald-400' : rate > 40 ? 'text-yellow-400' : 'text-red-400';
              })()}`}>{accuracyHistory.filter(r => r.correct).length}</div>
            </div>
            <div className="bg-slate-950/50 rounded-xl p-4 border border-slate-800/50 text-center">
              <div className="text-slate-500 uppercase mb-1">Win Rate</div>
              <div className={`text-lg font-bold ${(() => {
                const res = accuracyHistory.filter(r => r.resolved);
                const corr = res.filter(r => r.correct).length;
                const rate = res.length ? (corr / res.length * 100) : 0;
                return rate > 60 ? 'text-emerald-400' : rate > 40 ? 'text-yellow-400' : 'text-red-400';
              })()}`}>{(() => {
                const res = accuracyHistory.filter(r => r.resolved);
                const corr = res.filter(r => r.correct).length;
                return res.length ? (corr / res.length * 100).toFixed(0) + '%' : '—';
              })()}</div>
            </div>
          </div>

          {/* Resolved predictions list */}
          {accuracyHistory.filter(r => r.resolved).length > 0 && (
            <div>
              <div className="text-[8px] font-bold text-slate-500 uppercase tracking-widest font-mono mb-2">Recent Results</div>
              <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
                {accuracyHistory.filter(r => r.resolved).reverse().slice(0, 20).map(r => (
                  <div key={r.id} className="flex items-center justify-between bg-slate-950/30 border border-slate-800/50 rounded-lg px-3 py-2 text-[8px] font-mono">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-bold">{r.ticker}</span>
                      <span className={`${r.direction === 'BULLISH' ? 'text-emerald-400' : r.direction === 'BEARISH' ? 'text-red-400' : 'text-slate-400'}`}>{r.direction}</span>
                      <span className="text-slate-600">→</span>
                      <span className={r.correct ? 'text-emerald-400' : 'text-red-400'}>{r.correct ? '✅ Correct' : '❌ Wrong'}</span>
                    </div>
                    <div className="flex items-center gap-3 text-slate-500">
                      <span>Entry ${r.entryPrice.toFixed(2)}</span>
                      <span>Target ${r.targetPrice.toFixed(2)}</span>
                      {r.actualPrice && <span>Actual ${r.actualPrice.toFixed(2)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {accuracyHistory.filter(r => !r.resolved).length > 0 && (
            <div>
              <div className="text-[8px] font-bold text-slate-500 uppercase tracking-widest font-mono mb-2">Active Predictions (awaiting resolution)</div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                {accuracyHistory.filter(r => !r.resolved).reverse().slice(0, 10).map(r => (
                  <div key={r.id} className="flex items-center justify-between bg-slate-950/30 border border-slate-800/50 rounded-lg px-3 py-2 text-[8px] font-mono">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-bold">{r.ticker}</span>
                      <span className={`${r.direction === 'BULLISH' ? 'text-emerald-400' : r.direction === 'BEARISH' ? 'text-red-400' : 'text-slate-400'}`}>{r.direction}</span>
                    </div>
                    <div className="flex items-center gap-3 text-slate-500">
                      <span>Entry ${r.entryPrice.toFixed(2)}</span>
                      <span>Target ${r.targetPrice.toFixed(2)}</span>
                      <span className="text-yellow-400">Resolves {r.targetDate}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {accuracyHistory.length === 0 && (
            <div className="text-center py-10">
              <div className="text-3xl mb-2">📊</div>
              <p className="text-[10px] text-slate-500 font-mono">No prediction history yet. Predictions will appear here once they reach their target date and can be verified against actual market prices.</p>
            </div>
          )}
        </div>
      </ModulePanel>

      {/* GEMS */}
      <ModulePanel moduleKey="GEMS" activeModule={activeModule}>
        <div className="space-y-3">
          <div className="flex justify-between items-center px-1 flex-wrap gap-2">
            <span className="text-[9px] uppercase font-bold text-slate-500 tracking-widest font-mono">💎 Gems + Multibagger hunt</span>
            <span className="text-[9px] text-orange-400 font-mono bg-orange-950/30 px-2 py-0.5 border border-orange-900/50 rounded-full">
              {multibaggerLoading ? 'Scanning…' : `${multibaggerPicks.length} multibagger watch`}
            </span>
          </div>

          <div className="border border-orange-900/40 bg-orange-950/10 rounded-xl p-3 space-y-2">
            <div className="text-[9px] font-bold text-orange-300 font-mono uppercase tracking-wider">
              🚀 Undervalued growth watch (multibagger / tenbagger style)
            </div>
            <p className="text-[9px] text-slate-500 font-mono leading-relaxed">
              Scans Nifty + curated mid/small caps (semis, industrials — e.g. Moschip-style names) with Yahoo + NSE + Screener cross-check.
              Top picks get <strong className="text-orange-300">DeepSeek/Groq</strong> deep analysis when API key is set. Open <strong className="text-orange-300">Stock Pulse</strong> for full HTML report.
            </p>
            {multibaggerLoading && multibaggerPicks.length === 0 ? (
              <div className="text-[10px] text-slate-500 font-mono animate-pulse py-4 text-center">Scanning Nifty universe for fundamental multibagger signals…</div>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {multibaggerPicks.map(pick => (
                  <div key={pick.ticker} className="p-3 border border-orange-800/50 bg-slate-950/40 rounded-lg">
                    <div className="flex justify-between items-start gap-2 flex-wrap">
                      <div>
                        <span className="text-sm font-bold text-white font-mono">{pick.ticker}</span>
                        <span className={`ml-2 text-[7px] font-bold px-1.5 py-0.5 rounded border ${
                          pick.tier === 'SPECULATIVE' ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                            : pick.tier === 'CANDIDATE' ? 'bg-orange-500/20 text-orange-300 border-orange-500/40'
                            : pick.gemArchetype === 'UNDERRATED_GEM' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : 'bg-slate-500/20 text-slate-400 border-slate-600'
                        }`}>{pick.tag}</span>
                        {pick.llmEnriched && (
                          <span className="ml-1 text-[7px] text-cyan-400/90">AI deep</span>
                        )}
                        <div className="text-[9px] text-slate-500 mt-0.5">{pick.name}</div>
                      </div>
                      <div className="text-right">
                        <LiveTickerPrice ticker={pick.ticker} stocks={stocks} fallback={pick.price} decimals={2} className="text-base font-bold text-white" />
                        <div className="text-[8px] text-orange-400 font-mono">Score {pick.score}/100</div>
                      </div>
                    </div>
                    <p className="text-[9px] text-slate-400 mt-2 leading-relaxed">
                      {pick.deepAnalysis || pick.growthThesis}
                    </p>
                    {pick.sectorTheme && (
                      <p className="text-[8px] text-cyan-500/80 mt-1">◎ {pick.sectorTheme}</p>
                    )}
                    {pick.expectedCagrBand && (
                      <p className="text-[8px] text-slate-500 mt-0.5">Growth band (illustrative): {pick.expectedCagrBand}</p>
                    )}
                    {pick.undervaluationNote && (
                      <p className="text-[8px] text-emerald-500/70 mt-1 italic">{pick.undervaluationNote}</p>
                    )}
                    <ul className="mt-2 text-[8px] text-emerald-400/90 space-y-0.5">
                      {(pick.reasons ?? []).slice(0, 4).map(r => <li key={r}>+ {r}</li>)}
                    </ul>
                    {(pick.risks ?? []).slice(0, 2).map(r => (
                      <p key={r} className="text-[8px] text-amber-500/80 mt-0.5">⚠ {r}</p>
                    ))}
                    <button
                      type="button"
                      onClick={() => selectModule('STOCK_PULSE')}
                      className="mt-2 text-[8px] text-orange-400 font-mono underline hover:text-orange-300"
                    >
                      Open full Stock Pulse report →
                    </button>
                  </div>
                ))}
                {!multibaggerLoading && multibaggerPicks.length === 0 && (
                  <p className={`text-[9px] font-mono text-center py-2 ${multibaggerError ? 'text-amber-500/90' : 'text-slate-600'}`}>
                    {multibaggerError ?? 'No candidates in this scan batch — try again in ~2 min.'}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-between items-center px-1">
            <span className="text-[9px] uppercase font-bold text-slate-500 tracking-widest font-mono">TA-screened gems</span>
            <span className="text-[9px] text-emerald-400 font-mono bg-emerald-950/30 px-2 py-0.5 border border-emerald-900/50 rounded-full">{hiddenGems.length} · live TA</span>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {hiddenGems.map((gem, _i) => {
              const ta = gem.ta;
              const sm = ta ? detectSmartMoney([], ta) : null;
              const riskLabel = ta && ta.bollinger.width > 8 ? 'HIGH' : ta && ta.bollinger.width > 5 ? 'MEDIUM' : 'LOW';
              const catalystText = ta ? (
                ta.adx > 30 ? 'Strong trend momentum — ADX confirms directional strength' :
                ta.rsi < 30 ? 'Oversold bounce setup — RSI mean reversion opportunity' :
                ta.rsi > 70 ? 'Momentum continuation — riding strong uptrend' :
                ta.stochRsi < 20 ? 'StochRSI oversold — potential reversal zone' :
                ta.bollinger.width < 4 ? 'Bollinger squeeze — breakout imminent' :
                'Favorable TA setup with balanced risk/reward'
              ) : 'Awaiting technical data';
              return (
              <div key={_i} className="p-4 border border-slate-800 bg-slate-950/30 rounded-xl hover:border-emerald-700/50 transition-all duration-300 hover:shadow-lg hover:shadow-emerald-500/5">
                <div className="flex items-start justify-between flex-wrap gap-2 mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold font-mono text-white">{gem.ticker}</span>
                      {gem.hasRealData && <span className="text-[8px] text-emerald-500 font-mono bg-emerald-950/30 px-1 rounded border border-emerald-900/50">REAL</span>}
                      <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${riskLabel === 'LOW' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : riskLabel === 'MEDIUM' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>{riskLabel} RISK</span>
                      {ta && <RegimeBadge regime={detectRegime(ta)} />}
                    </div>
                    <div className="text-[10px] text-slate-400">{gem.name}</div>
                  </div>
                  <div className="text-right">
                    <LiveTickerPrice ticker={gem.ticker} stocks={stocks} fallback={gem.currentPrice} decimals={2} className="text-lg font-bold text-white" showChange />
                    <div className="text-[9px] font-mono text-slate-500">Market Price</div>
                  </div>
                </div>

                <div className="bg-slate-950/60 rounded-lg p-3 mb-3 border-l-2 border-emerald-500/50">
                  <p className="text-[10px] text-slate-300 leading-relaxed mb-2">{gem.ta ? aiGemReasoning(gem.ta, gem.ticker) : 'Loading technical analysis data — AI scanning in progress...'}</p>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[8px] text-yellow-400 font-mono">⚡ Signal:</span>
                    <span className="text-[9px] text-slate-400">{catalystText}</span>
                  </div>
                </div>

                {ta && (
                  <div className="grid grid-cols-3 gap-2 mb-3 text-[8px] font-mono">
                    <div className="bg-slate-950 rounded-lg p-2 text-center">
                      <span className="text-slate-500 block">RSI</span>
                      <span className="text-white font-bold text-[10px]">{ta.rsi.toFixed(1)}</span>
                    </div>
                    <div className="bg-slate-950 rounded-lg p-2 text-center">
                      <span className="text-slate-500 block">ADX</span>
                      <span className="text-white font-bold text-[10px]">{ta.adx.toFixed(1)}</span>
                    </div>
                    <div className="bg-slate-950 rounded-lg p-2 text-center">
                      <span className="text-slate-500 block">Volatility</span>
                      <span className={ta.bollinger.width > 6 ? 'text-red-400 font-bold text-[10px]' : 'text-white font-bold text-[10px]'}>{ta.bollinger.width.toFixed(1)}%</span>
                    </div>
                    {sm && (
                      <>
                        <div className="bg-slate-950 rounded-lg p-2 text-center col-span-2">
                          <span className="text-slate-500 block">Smart Money</span>
                          <span className={sm.accumulation > 60 ? 'text-emerald-400 font-bold text-[10px]' : 'text-slate-400 font-bold text-[10px]'}>
                            {sm.institutionalActivity}
                          </span>
                        </div>
                        <div className="bg-slate-950 rounded-lg p-2 text-center">
                          <span className="text-slate-500 block">Accumulation</span>
                          <span className="text-emerald-400 font-bold text-[10px]">{sm.accumulation.toFixed(0)}%</span>
                        </div>
                      </>
                    )}
                  </div>
                )}

                <ConfidenceBar value={gem.score} label="AI Score" color="#22c55e" />
              </div>
            )})}
          </div>

          <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-[10px] text-amber-300 leading-relaxed">
            ⚡ <b>AI Insight:</b> Gems screened via multi-factor analysis (RSI, ADX, volume accumulation, institutional activity, valuation gap). Diversify across 4-6 positions with proper position sizing.
          </div>
        </div>
      </ModulePanel>

      {/* STOCK PULSE — fundamental deep dive */}
      <ModulePanel moduleKey="STOCK_PULSE" activeModule={activeModule}>
        <div className="space-y-3">
          <div className="px-1">
            <span className="text-[9px] uppercase font-bold text-orange-400 tracking-widest font-mono">📡 Stock Pulse — Deep Fundamental Analyser</span>
            <p className="text-[8px] text-slate-600 font-mono mt-1">Auto cross-check: Yahoo + NSE + Screener.in · learns each run · no buy/sell</p>
          </div>
          <StockPulsePanel />
        </div>
      </ModulePanel>

      {/* SIGNALS */}
      <ModulePanel moduleKey="SIGNALS" activeModule={activeModule}>
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-[9px] uppercase font-bold text-slate-500 tracking-widest font-mono">🎯 AI Buy Signals — TA-Validated</span>
            <div className="flex bg-slate-950/60 p-0.5 border border-slate-800 rounded-lg">
              <button onClick={() => setHorizonFilter('SHORT')} className={`px-3 py-1 text-[9px] font-bold rounded-lg transition-all ${horizonFilter === 'SHORT' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-500 hover:text-white'}`}>⚡ Short</button>
              <button onClick={() => setHorizonFilter('LONG')} className={`px-3 py-1 text-[9px] font-bold rounded-lg transition-all ${horizonFilter === 'LONG' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-500 hover:text-white'}`}>🏛️ Long</button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {signalPrices.filter(sig => {
              const months = parseInt(sig.timeframe) || 3;
              return horizonFilter === 'SHORT' ? months <= 6 : months > 3;
            }).map((sig, idx) => {
              const ta = taData[sig.ticker];
              return (
              <div key={idx} className="border border-slate-800 bg-slate-950/30 rounded-xl p-4 hover:border-slate-700/80 transition-all duration-300 hover:shadow-lg">
                <div className="flex items-start justify-between flex-wrap gap-2 mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold font-mono text-white">{sig.ticker}</span>
                      <span className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded uppercase ${sig.riskIndex === 'LOW' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : sig.riskIndex === 'MEDIUM' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>{sig.riskIndex} RISK</span>
                      {ta && <RegimeBadge regime={detectRegime(ta)} />}
                      <span className="text-[8px] text-slate-500 font-mono">{sig.timeframe}</span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{sig.name}</div>
                  </div>
                  <div className="text-right font-mono">
                    <div className="text-[8px] text-slate-500 uppercase font-bold">Price</div>
                    <LiveTickerPrice ticker={sig.ticker} stocks={stocks} fallback={sig.price} decimals={2} className="text-xs font-bold text-emerald-400" showChange />
                  </div>
                </div>

                {ta && (
                  <div className="grid grid-cols-4 gap-2 mb-3 text-[8px] font-mono">
                    <div className="bg-slate-950 rounded-lg p-2 text-center">
                      <span className="text-slate-500 block">RSI</span>
                      <span className="text-white font-bold">{ta.rsi.toFixed(1)}</span>
                    </div>
                    <div className="bg-slate-950 rounded-lg p-2 text-center">
                      <span className="text-slate-500 block">ADX</span>
                      <span className="text-white font-bold">{ta.adx.toFixed(1)}</span>
                    </div>
                    <div className="bg-slate-950 rounded-lg p-2 text-center">
                      <span className="text-slate-500 block">Momentum</span>
                      <span className={ta.macd.histogram > 0 ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                        {ta.macd.histogram > 0 ? '▲' : '▼'} {Math.abs(ta.macd.histogram).toFixed(2)}
                      </span>
                    </div>
                    <div className="bg-slate-950 rounded-lg p-2 text-center">
                      <span className="text-slate-500 block">MACD</span>
                      <span className={`font-bold ${ta.macd.line > ta.macd.signal ? 'text-emerald-400' : 'text-red-400'}`}>
                        {ta.macd.line > ta.macd.signal ? 'Bull' : 'Bear'}
                      </span>
                    </div>
                  </div>
                )}

                <div className="mb-3">
                  <ConfidenceBar value={sig.confidence} label="AI Confidence" />
                </div>

                <div className="bg-slate-950 p-3 border border-slate-800/80 rounded-lg text-[10px] leading-relaxed text-slate-300">
                  <span className="text-emerald-400 font-bold font-mono text-[8px] block uppercase mb-1">🤖 AI Context Reasoning:</span>
                  {sig.reasoning}
                </div>
              </div>
            )})}
          </div>
        </div>
      </ModulePanel>

      {/* LEARNING TAB */}
      <ModulePanel moduleKey="LEARNING" activeModule={activeModule}>
        <LearningTab />
      </ModulePanel>

      {/* STRATEGIES — trading style recommendations */}
      <ModulePanel moduleKey="STRATEGIES" activeModule={activeModule}>
        <StrategiesTab
          predictions={predictions}
          taData={taData}
          priceMap={stocks as Record<string, QuoteData>}
          newsSentimentByTicker={newsSentimentByTicker}
        />
      </ModulePanel>

    </div>
    </>
  );
}

function LearningTab() {
  const [refreshKey, setRefreshKey] = React.useState(0);
  React.useEffect(() => {
    const timer = setInterval(() => setRefreshKey(k => k + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  const report = getAILearningReport();
  const snapshot = getAILearningSnapshot();
  const weights = getAIIndicatorWeights();
  const calibration = getAICalibrationReport();
  const indicatorPerf = getAIIndicatorPerformance();
  const failurePatterns = getAIFailurePatterns();
  const weightMap = weights?.weights ?? {};
  const calQuality = calibration?.quality ?? 'CALIBRATING';
  const calOver = calibration?.overconfidenceLevel ?? 'LOW';
  const calUnder = calibration?.underconfidenceLevel ?? 'LOW';
  const calRec = calibration?.recommendation ?? 'Collecting resolved predictions to calibrate confidence.';

  const perfEntries = Object.entries(indicatorPerf)
    .filter(([, r]) => r.totalOccurrences >= 2)
    .sort((a, b) => b[1].accuracy - a[1].accuracy);

  const failEntries = Object.entries(failurePatterns)
    .sort((a, b) => b[1].totalOccurrences - a[1].totalOccurrences)
    .slice(0, 8);

  return (
    <div key={refreshKey} className="space-y-4 animate-fade-in">
      {snapshot.totalResolvedPredictions > 0 && (
        <div className="border border-slate-800 bg-slate-900/20 rounded-2xl p-5">
          <div className="text-[9px] uppercase font-bold text-slate-500 tracking-widest font-mono mb-4">🧠 AI Self-Learning — Knowledge Snapshot</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[8px] font-mono">
            <div className="bg-slate-950/40 rounded-lg p-2.5 border border-slate-800/40 text-center">
              <span className="text-slate-500 block">Predictions Analyzed</span>
              <span className="text-white font-bold text-xs">{snapshot.totalPredictionsAnalyzed}</span>
            </div>
            <div className="bg-slate-950/40 rounded-lg p-2.5 border border-slate-800/40 text-center">
              <span className="text-slate-500 block">Resolved</span>
              <span className="text-white font-bold text-xs">{snapshot.totalResolvedPredictions}</span>
            </div>
            <div className="bg-slate-950/40 rounded-lg p-2.5 border border-slate-800/40 text-center">
              <span className="text-slate-500 block">Calibration</span>
              <span className={`font-bold text-xs ${snapshot.calibrationQuality === 'EXCELLENT' ? 'text-emerald-400' : snapshot.calibrationQuality === 'GOOD' ? 'text-green-400' : snapshot.calibrationQuality === 'FAIR' ? 'text-yellow-400' : 'text-red-400'}`}>{snapshot.calibrationQuality}</span>
            </div>
            <div className="bg-slate-950/40 rounded-lg p-2.5 border border-slate-800/40 text-center">
              <span className="text-slate-500 block">Days Active</span>
              <span className="text-white font-bold text-xs">{snapshot.daysActive}</span>
            </div>
          </div>
        </div>
      )}

      {perfEntries.length > 0 && (
        <div className="border border-slate-800 bg-slate-900/20 rounded-2xl p-5">
          <div className="text-[9px] uppercase font-bold text-slate-500 tracking-widest font-mono mb-4">📊 Indicator Performance Ranking (Learned)</div>
          <div className="space-y-1.5">
            {perfEntries.map(([name, r]) => {
              const barColor = r.accuracy >= 70 ? '#22c55e' : r.accuracy >= 50 ? '#eab308' : '#ef4444';
              return (
                <div key={name} className="flex items-center gap-2 text-[8px] font-mono">
                  <span className="text-slate-400 w-16 shrink-0">{name}</span>
                  <div className="flex-1 bg-slate-800 rounded-full h-2 overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${r.accuracy}%`, background: barColor }} />
                  </div>
                  <span className="text-white font-bold w-8 text-right">{r.accuracy.toFixed(0)}%</span>
                  <span className="text-slate-600 w-12 text-right">({r.totalOccurrences}x)</span>
                  {r.bestRegime && <span className="text-emerald-500/60 w-20 truncate">best: {r.bestRegime}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border border-slate-800 bg-slate-900/20 rounded-2xl p-5">
          <div className="text-[9px] uppercase font-bold text-slate-500 tracking-widest font-mono mb-4">⚖️ Adaptive Indicator Weights</div>
          <div className="grid grid-cols-2 gap-2 text-[8px] font-mono">
            {Object.entries(weightMap).map(([ind, w]) => {
              const isHigh = w > 1.1;
              const isLow = w < 0.9;
              return (
                <div key={ind} className="bg-slate-950/40 rounded-lg p-2 border border-slate-800/40 flex justify-between items-center">
                  <span className="text-slate-400">{ind.charAt(0).toUpperCase() + ind.slice(1)}</span>
                  <span className={`font-bold ${isHigh ? 'text-emerald-400' : isLow ? 'text-red-400' : 'text-white'}`}>{w.toFixed(2)}x</span>
                </div>
              );
            })}
          </div>
          <div className="mt-2 text-[7px] text-slate-600 font-mono">Total samples: {weights?.totalSamples ?? 0}</div>
        </div>

        <div className="border border-slate-800 bg-slate-900/20 rounded-2xl p-5">
          <div className="text-[9px] uppercase font-bold text-slate-500 tracking-widest font-mono mb-4">📐 Confidence Calibration</div>
          <div className="space-y-2 text-[8px] font-mono">
            <div className="flex justify-between bg-slate-950/40 rounded-lg p-2.5 border border-slate-800/40">
              <span className="text-slate-400">Quality</span>
              <span className={`font-bold ${calQuality === 'EXCELLENT' ? 'text-emerald-400' : calQuality === 'GOOD' ? 'text-green-400' : calQuality === 'FAIR' ? 'text-yellow-400' : 'text-red-400'}`}>{calQuality}</span>
            </div>
            <div className="flex justify-between bg-slate-950/40 rounded-lg p-2.5 border border-slate-800/40">
              <span className="text-slate-400">Overconfidence</span>
              <span className={`font-bold ${calOver === 'LOW' ? 'text-emerald-400' : calOver === 'MODERATE' ? 'text-yellow-400' : 'text-red-400'}`}>{calOver}</span>
            </div>
            <div className="flex justify-between bg-slate-950/40 rounded-lg p-2.5 border border-slate-800/40">
              <span className="text-slate-400">Underconfidence</span>
              <span className={`font-bold ${calUnder === 'LOW' ? 'text-emerald-400' : calUnder === 'MODERATE' ? 'text-yellow-400' : 'text-red-400'}`}>{calUnder}</span>
            </div>
            <div className="mt-2 p-2 bg-slate-950/60 rounded-lg border border-slate-800/50 text-[7px] text-slate-400 leading-relaxed">
              {calRec}
            </div>
          </div>
        </div>
      </div>

      {failEntries.length > 0 && (
        <div className="border border-slate-800 bg-slate-900/20 rounded-2xl p-5">
          <div className="text-[9px] uppercase font-bold text-slate-500 tracking-widest font-mono mb-4">⚠️ Failure Pattern Analysis</div>
          <div className="space-y-1.5">
            {failEntries.map(([, fp], i) => (
              <div key={i} className="bg-slate-950/40 rounded-lg p-2.5 border border-slate-800/40 text-[8px] font-mono">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-slate-300 font-bold truncate max-w-[250px]">{fp.patternName}</span>
                  <span className={`text-[7px] font-bold px-1.5 py-0.5 rounded ${fp.severity === 'CRITICAL' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : fp.severity === 'HIGH' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : fp.severity === 'MEDIUM' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' : 'bg-slate-500/20 text-slate-400 border border-slate-500/30'}`}>{fp.severity}</span>
                </div>
                <div className="flex gap-4 text-[7px] text-slate-500">
                  <span>Occurrences: {fp.totalOccurrences}</span>
                  <span>Repeat rate: {fp.repeatRate.toFixed(0)}%</span>
                  <span>Avg confidence: {fp.avgConfidenceAtFailure.toFixed(0)}%</span>
                </div>
                <div className="flex gap-2 mt-1">
                  {fp.commonRegimes.map(reg => (
                    <span key={reg} className="text-[6px] px-1 py-0.5 rounded bg-slate-800 text-slate-500">{reg}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {report && report.topLessons.length > 0 && (
        <div className="border border-slate-800 bg-slate-900/20 rounded-2xl p-5">
          <div className="text-[9px] uppercase font-bold text-slate-500 tracking-widest font-mono mb-4">📈 AI Evolution — Lessons Learned</div>
          <div className="space-y-2">
            {report.topLessons.map((lesson, i) => (
              <div key={i} className="flex items-start gap-2 text-[8px] font-mono">
                <span className="text-emerald-500 mt-0.5">▸</span>
                <span className="text-slate-300">{lesson}</span>
              </div>
            ))}
          </div>
          {report.recommendations.length > 0 && (
            <div className="mt-4 p-3 bg-slate-950/60 rounded-lg border border-slate-800/50">
              <div className="text-[7px] uppercase font-bold text-slate-500 tracking-widest font-mono mb-2">🔄 Recommendations</div>
              <div className="space-y-1">
                {report.recommendations.map((rec, i) => (
                  <div key={i} className="flex items-start gap-2 text-[8px] font-mono">
                    <span className="text-amber-500 mt-0.5">→</span>
                    <span className="text-slate-400">{rec}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {snapshot.totalResolvedPredictions === 0 && (
        <div className="border border-slate-800 bg-slate-900/20 rounded-2xl p-8 text-center">
          <div className="text-3xl mb-2">🧠</div>
          <div className="text-[10px] font-mono text-slate-500">AI learning engine is waiting for resolved predictions.</div>
          <div className="text-[8px] font-mono text-slate-600 mt-1">As predictions expire and get resolved, the AI will analyze results and build statistical knowledge automatically.</div>
        </div>
      )}
    </div>
  );
}

function DailyPredictionTab({
  dailyRecs, experienceStats, stocks, sessionState, learningCounter,
}: {
  dailyRecs: DailyRecommendation[]; experienceStats: { totalPreds: number; overallAcc: number; tickerStats: TickerStats[] };
  stocks: Record<string, QuoteData>;
  sessionState: ReturnType<typeof getMarketSession>;
  learningCounter: number;
}) {
  const dirColors: Record<string, string> = {
    BULLISH: 'text-emerald-400 border-emerald-900/40 bg-emerald-950/20',
    BEARISH: 'text-red-400 border-red-900/40 bg-red-950/20',
    NEUTRAL: 'text-yellow-400 border-yellow-900/40 bg-yellow-950/20',
  };
  const recColors: Record<string, string> = {
    BUY: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    SELL: 'bg-red-500/20 text-red-400 border-red-500/30',
    HOLD: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  };
  const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][sessionState.dayOfWeek];
  const trackRows = experienceStats.tickerStats
    .filter(s => s.total >= 1)
    .sort((a, b) => b.total - a.total || b.accuracy - a.accuracy)
    .slice(0, 20);
  const multiSample = trackRows.filter(s => s.total >= 2).length;

  return (
    <div className="space-y-3 animate-fade-in">
      {/* AI Experience Summary */}
      <div className="border border-slate-800 bg-slate-900/20 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[9px] uppercase font-bold text-slate-500 tracking-widest font-mono">AI Experience Engine</span>
          <span className="text-[7px] font-mono text-slate-600 bg-slate-950 px-2 py-0.5 rounded-full border border-slate-800">
            Auto-learning {learningCounter > 0 ? `· ${learningCounter} cycles` : '—'}
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[8px] font-mono">
          <div className="bg-slate-950/40 rounded-lg p-2.5 border border-slate-800/40 text-center">
            <span className="text-slate-500 block">Predictions Stored</span>
            <span className="text-white font-bold text-xs block mt-1">{experienceStats.totalPreds}</span>
          </div>
          <div className="bg-slate-950/40 rounded-lg p-2.5 border border-slate-800/40 text-center">
            <span className="text-slate-500 block">Overall Accuracy</span>
            <span className={`font-bold text-xs block mt-1 ${experienceStats.overallAcc > 55 ? 'text-emerald-400' : experienceStats.overallAcc > 40 ? 'text-yellow-400' : 'text-red-400'}`}>
              {experienceStats.overallAcc.toFixed(1)}%
            </span>
          </div>
          <div className="bg-slate-950/40 rounded-lg p-2.5 border border-slate-800/40 text-center">
            <span className="text-slate-500 block">Tickers Tracked</span>
            <span className="text-white font-bold text-xs block mt-1">{experienceStats.tickerStats.length}</span>
          </div>
          <div className="bg-slate-950/40 rounded-lg p-2.5 border border-slate-800/40 text-center">
            <span className="text-slate-500 block">Today</span>
            <span className="text-white font-bold text-xs block mt-1">{dayName}</span>
          </div>
        </div>
      </div>

      {/* Top ticker stats */}
      <div className="border border-slate-800 bg-slate-900/20 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[9px] uppercase font-bold text-slate-500 tracking-widest font-mono">AI Track Record by Ticker</span>
          {trackRows.length > 0 && (
            <span className="text-[7px] font-mono text-slate-600">{trackRows.length} tickers</span>
          )}
        </div>
        {trackRows.length === 0 ? (
          <p className="text-[8px] font-mono text-slate-500 text-center py-4">
            No resolved predictions yet. Track record fills as the AI closes and scores past calls.
          </p>
        ) : (
          <>
            {multiSample === 0 && (
              <p className="text-[7px] font-mono text-slate-500 mb-2">
                One prediction per ticker so far — accuracy bars become more reliable after 2+ resolved calls per symbol.
              </p>
            )}
            <div className="space-y-1 max-h-[220px] overflow-y-auto pr-1 custom-scrollbar">
              {trackRows.map(s => (
                <div key={s.ticker} className="flex items-center gap-2 text-[7px] font-mono bg-slate-950/30 rounded-lg p-2 border border-slate-800/30">
                  <span className="text-white font-bold w-14">{s.ticker}</span>
                  <div className="flex-1 bg-slate-800 rounded-full h-1.5">
                    <div className={`h-full rounded-full ${s.accuracy > 60 ? 'bg-emerald-500' : s.accuracy > 40 ? 'bg-yellow-500' : 'bg-red-500'}`}
                      style={{ width: `${Math.max(s.accuracy, s.total >= 2 ? 0 : 8)}%` }} />
                  </div>
                  <span className={`w-10 text-right font-bold ${s.accuracy > 60 ? 'text-emerald-400' : s.accuracy > 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {s.total >= 2 ? `${s.accuracy.toFixed(0)}%` : '—'}
                  </span>
                  <span className="text-slate-600 w-16">({s.total}x)</span>
                  <span className={`text-[6px] px-1 py-0.5 rounded ${s.trend === 'IMPROVING' ? 'bg-emerald-950/30 text-emerald-500' : s.trend === 'DECLINING' ? 'bg-red-950/30 text-red-500' : 'bg-slate-950/30 text-slate-500'}`}>{s.trend}</span>
                  <span className="text-slate-600 hidden sm:inline">best: {s.bestRegime}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Daily Recommendations */}
      <div className="border border-slate-800 bg-slate-900/20 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[9px] uppercase font-bold text-slate-500 tracking-widest font-mono">AI Daily Market Prediction</span>
          <span className="text-[7px] font-mono text-slate-600">{dailyRecs.length} stocks analyzed</span>
        </div>

        {dailyRecs.length === 0 ? (
          <div className="p-4 bg-slate-950/40 rounded-lg border border-slate-800/40 text-center">
            <div className="text-2xl mb-1">📡</div>
            <div className="text-[9px] font-mono text-slate-500">Waiting for market data...</div>
          </div>
        ) : (
          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1 custom-scrollbar">
            {dailyRecs.map(rec => {
              const stock = stocks[rec.ticker];
              const dirColor = dirColors[rec.direction] || 'text-slate-400';
              const recType = rec.direction === 'BULLISH' ? 'BUY' : rec.direction === 'BEARISH' ? 'SELL' : 'HOLD';
              const recColor = recColors[recType];
              const pctUpside = rec.targetPrice > 0 && rec.entryPrice > 0
                ? ((rec.targetPrice - rec.entryPrice) / rec.entryPrice * 100) : 0;

              return (
                <div key={rec.ticker} className="p-3 border border-slate-800/80 bg-slate-950/30 rounded-xl hover:bg-slate-950/50 transition-all">
                  <div className="flex items-start justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold font-mono text-white">{rec.ticker}</span>
                      <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${recColor}`}>{recType}</span>
                      <span className={`text-[8px] px-1.5 py-0.5 rounded-full border ${dirColor}`}>{rec.direction}</span>
                      {stock?.price > 0 && (
                        <LiveTickerPrice ticker={rec.ticker} stocks={stocks} decimals={2} className="text-[8px] text-slate-300" showChange />
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[8px] font-mono">
                      <span className="text-slate-500">Target:</span>
                      <span className="font-bold text-white">${rec.targetPrice.toFixed(2)}</span>
                      <span className={`font-bold ${pctUpside > 0 ? 'text-emerald-400' : pctUpside < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                        {pctUpside > 0 ? '+' : ''}{pctUpside.toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  {/* Confidence with experience boost */}
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex-1">
                      <div className="flex justify-between text-[7px] font-mono mb-0.5">
                        <span className="text-emerald-400">Confidence {rec.confidence}%</span>
                        {rec.experienceBoost > 0 && <span className="text-blue-400">+{rec.experienceBoost}% from experience</span>}
                        {rec.experienceBoost < 0 && <span className="text-red-400">{rec.experienceBoost}% from experience</span>}
                      </div>
                      <div className="bg-slate-800 rounded-full h-1.5 flex">
                        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.max(0, Math.min(100, rec.confidence))}%` }} />
                      </div>
                    </div>
                    <span className="text-[7px] text-slate-500 font-mono">{rec.regime.replace(/_/g, ' ')}</span>
                    <span className="text-[7px] text-slate-500 font-mono">{rec.totalPatternMatches} patterns</span>
                  </div>

                  {/* Reasoning */}
                  <div className="mt-1.5 text-[7px] font-mono text-slate-400 leading-relaxed">
                    {rec.reasoning.map((r, i) => <span key={i}>{i > 0 && ' · '}{r}</span>)}
                  </div>

                  {/* Stop loss */}
                  <div className="mt-1 text-[7px] font-mono text-slate-600">
                    SL: ${rec.stopLoss.toFixed(2)} · Risk: {rec.entryPrice > 0 ? (Math.abs(rec.stopLoss - rec.entryPrice) / rec.entryPrice * 100).toFixed(1) : '0'}%
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pattern highlights */}
      {dailyRecs.length > 0 && (
        <div className="border border-slate-800 bg-slate-900/20 rounded-2xl p-5">
          <div className="text-[9px] uppercase font-bold text-slate-500 tracking-widest font-mono mb-3">🔍 AI Pattern Discoveries</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[7px] font-mono">
            {dailyRecs.slice(0, 6).map(rec => {
              const stats = getTickerStats(rec.ticker);
              if (stats.total < 2) return null;
              return (
                <div key={rec.ticker} className="bg-slate-950/40 rounded-lg p-2.5 border border-slate-800/40">
                  <span className="text-white font-bold">{rec.ticker}</span>
                  <div className="text-slate-400 mt-1">
                    {stats.bestRegime && <span>Best regime: {stats.bestRegime} · </span>}
                    {stats.bestSession && <span>Best session: {stats.bestSession} · </span>}
                    {stats.bestDay && <span>Best day: {stats.bestDay}</span>}
                  </div>
                  <div className="text-slate-500 mt-0.5">
                    {stats.total} predictions · {stats.accuracy}% acc · trend {stats.trend}
                    {stats.avgReturn > 0 ? ` · avg +${stats.avgReturn}%` : stats.avgReturn < 0 ? ` · avg ${stats.avgReturn}%` : ''}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function aiGemReasoning(ta: TAIndicators, ticker: string): string {
  const parts: string[] = [];
  if (ta.rsi > 50 && ta.rsi < 70) parts.push(`RSI at ${ta.rsi.toFixed(0)} in bullish sweet spot`);
  else if (ta.rsi < 35) parts.push(`RSI at ${ta.rsi.toFixed(0)} — oversold bounce candidate`);
  else if (ta.rsi > 70) parts.push(`RSI at ${ta.rsi.toFixed(0)} — strong momentum but approaching overbought`);
  if (ta.adx > 30) parts.push(`strong trend (ADX ${ta.adx.toFixed(0)})`);
  else if (ta.adx > 20) parts.push(`trend developing (ADX ${ta.adx.toFixed(0)})`);
  else parts.push(`no clear trend (ADX ${ta.adx.toFixed(0)})`);
  if (ta.macd.histogram > 0) parts.push('MACD positive');
  else parts.push('MACD negative');
  if (ta.supertrend.direction === 'up') parts.push('supertrend bullish');
  else parts.push('supertrend bearish');
  const volNote = ta.volumeSma > 0 ? `volume ${ta.volumeSma.toFixed(0)}` : '';
  if (volNote) parts.push(volNote);
  return `${ticker}: ${parts.join(' · ')}. Score ${computeGemScore(ta, { accumulation: 50, distribution: 50 })}/95 — AI-selected from ${ALL_SCAN_TICKERS.length} scanned stocks.`;
}

function SessionSignalsTab({
  stocks, taData, historyCache, sessionState, sessionSignal,
}: {
  stocks: Record<string, QuoteData>; taData: Record<string, TAIndicators>;
  historyCache: (t: string) => OHLC[] | undefined;
  sessionState: ReturnType<typeof getMarketSession>;
  sessionSignal: ReturnType<typeof getSessionTradingSignal>;
}) {
  const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][sessionState.dayOfWeek];
  const daySignal = getDayOfWeekSignal(sessionState.dayOfWeek);
  const sessionColors: Record<string, string> = {
    PRE_MARKET: 'text-blue-400 bg-blue-950/30 border-blue-900/40',
    OPENING: 'text-yellow-400 bg-yellow-950/30 border-yellow-900/40',
    MIDDAY: 'text-emerald-400 bg-emerald-950/30 border-emerald-900/40',
    CLOSING: 'text-red-400 bg-red-950/30 border-red-900/40',
    POST_MARKET: 'text-slate-400 bg-slate-950/30 border-slate-900/40',
  };
  const signalColors: Record<string, string> = {
    BUY: 'text-emerald-400 border-emerald-900/40 bg-emerald-950/20',
    SELL: 'text-red-400 border-red-900/40 bg-red-950/20',
    HOLD: 'text-yellow-400 border-yellow-900/40 bg-yellow-950/20',
  };

  const isMarketOpen = sessionState.session !== 'PRE_MARKET' && sessionState.session !== 'POST_MARKET';

  return (
    <div className="space-y-3 animate-fade-in">
      {/* Current session status */}
      <div className="border border-slate-800 bg-slate-900/20 rounded-2xl p-5">
        <div className="text-[9px] uppercase font-bold text-slate-500 tracking-widest font-mono mb-4">⏰ Live Market Session</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[8px] font-mono">
          <div className="bg-slate-950/40 rounded-lg p-2.5 border border-slate-800/40 text-center">
            <span className="text-slate-500 block">Session</span>
            <span className={`inline-block mt-1 text-[9px] font-bold px-2 py-0.5 rounded-full border ${sessionColors[sessionState.session] || 'text-slate-400'}`}>{sessionState.session.replace('_', ' ')}</span>
          </div>
          <div className="bg-slate-950/40 rounded-lg p-2.5 border border-slate-800/40 text-center">
            <span className="text-slate-500 block">Day</span>
            <span className="text-white font-bold text-xs block mt-1">{dayName}</span>
          </div>
          <div className="bg-slate-950/40 rounded-lg p-2.5 border border-slate-800/40 text-center">
            <span className="text-slate-500 block">Min Since Open</span>
            <span className="text-white font-bold text-xs block mt-1">{sessionState.minutesSinceOpen}</span>
          </div>
          <div className="bg-slate-950/40 rounded-lg p-2.5 border border-slate-800/40 text-center">
            <span className="text-slate-500 block">Min To Close</span>
            <span className="text-white font-bold text-xs block mt-1">{isMarketOpen ? sessionState.minutesToClose : '—'}</span>
          </div>
        </div>
        {sessionState.isOpeningHalfHour && (
          <div className="mt-3 p-2 bg-yellow-950/20 border border-yellow-900/30 rounded-lg text-[8px] font-mono text-yellow-400">⚡ Opening half-hour — high volatility, wait for first 30-min candle to confirm direction</div>
        )}
        {sessionState.isClosingHalfHour && (
          <div className="mt-3 p-2 bg-red-950/20 border border-red-900/30 rounded-lg text-[8px] font-mono text-red-400">⚠️ Closing half-hour — institutional squaring, avoid new entries, tighten stops</div>
        )}
        {!isMarketOpen && (
          <div className="mt-3 p-2 bg-blue-950/20 border border-blue-900/30 rounded-lg text-[8px] font-mono text-blue-400">🔒 Market closed — all predictions anchored to last closing price</div>
        )}
      </div>

      {/* Session-based trading signal */}
      <div className="border border-slate-800 bg-slate-900/20 rounded-2xl p-5">
        <div className="text-[9px] uppercase font-bold text-slate-500 tracking-widest font-mono mb-4">🎯 Session Trading Signal</div>
        <div className="flex items-center gap-4 mb-3">
          <span className={`text-lg font-bold font-mono px-3 py-1 rounded-lg border ${signalColors[sessionSignal.type] || 'text-slate-400 border-slate-800'}`}>
            {sessionSignal.type === 'BUY' ? '📈' : sessionSignal.type === 'SELL' ? '📉' : '⏸️'} {sessionSignal.type}
          </span>
          <div className="flex-1">
            <div className="text-[9px] font-mono text-slate-400">{sessionSignal.reason}</div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[8px] text-slate-500">Confidence</span>
              <div className="flex-1 bg-slate-800 rounded-full h-1.5 max-w-[120px]">
                <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${sessionSignal.confidence}%` }} />
              </div>
              <span className="text-[9px] text-white font-bold">{sessionSignal.confidence}%</span>
            </div>
          </div>
        </div>
        {daySignal && (
          <div className="flex items-center gap-2 text-[8px] font-mono text-slate-400 bg-slate-950/40 p-2 rounded-lg border border-slate-800/40">
            <span className="text-slate-500">{dayName}:</span>
            <span>{daySignal.reason}</span>
          </div>
        )}
      </div>

      {/* Market regime overview from active tickers */}
      {Object.keys(taData).length > 0 && (
        <div className="border border-slate-800 bg-slate-900/20 rounded-2xl p-5">
          <div className="text-[9px] uppercase font-bold text-slate-500 tracking-widest font-mono mb-4">🌡️ Live Regime Map</div>
          <div className="space-y-1.5 max-h-[240px] overflow-y-auto pr-1 custom-scrollbar">
            {Object.entries(taData).slice(0, 20).map(([ticker, ta]) => {
              const regime = classifyRegime(ta, historyCache(ticker) || [], sessionState.session);
              const regimeColors: Record<string, string> = {
                STRONG_TREND: 'text-emerald-400', WEAK_TREND: 'text-green-400',
                HIGH_VOLATILITY: 'text-orange-400',
                RANGING: 'text-yellow-400', BREAKOUT: 'text-purple-400', PANIC: 'text-pink-400',
              };
              const stock = stocks[ticker];
              return (
                <div key={ticker} className="flex items-center gap-2 text-[8px] font-mono bg-slate-950/30 rounded-lg p-2 border border-slate-800/30">
                  <span className="text-white font-bold w-16">{ticker}</span>
                  <span className={`font-bold ${regimeColors[regime.regime] || 'text-slate-400'}`}>{regime.regime.replace(/_/g, ' ')}</span>
                  <span className="text-slate-500">{regime.volatilityLevel} vol</span>
                  <span className="text-slate-600 flex-1 truncate">{regime.description}</span>
                  <span className={`text-[7px] px-1.5 py-0.5 rounded border ${regime.regimeConfidence > 60 ? 'text-emerald-500 border-emerald-900/30 bg-emerald-950/20' : 'text-yellow-500 border-yellow-900/30 bg-yellow-950/20'}`}>{regime.regimeConfidence}%</span>
                  {stock?.price && <span className="text-slate-400"><SmoothPrice value={stock.price} decimals={2} prefix={tickerCurrency(ticker)} /></span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Day-of-week stats & recommendations */}
      <div className="border border-slate-800 bg-slate-900/20 rounded-2xl p-5">
        <div className="text-[9px] uppercase font-bold text-slate-500 tracking-widest font-mono mb-4">📅 Weekly Session Guide</div>
        <div className="grid grid-cols-5 gap-2 text-[7px] font-mono">
          {['Mon','Tue','Wed','Thu','Fri'].map((d, i) => {
            const isToday = sessionState.dayOfWeek === i + 1;
            const sig = getDayOfWeekSignal(i + 1);
            return (
              <div key={d} className={`rounded-lg p-2 border text-center ${isToday ? 'bg-emerald-950/20 border-emerald-900/40' : 'bg-slate-950/30 border-slate-800/30'}`}>
                <div className={`font-bold ${isToday ? 'text-emerald-400' : 'text-slate-500'}`}>{d}</div>
                {sig && (
                  <>
                    <div className={`mt-1 font-bold ${sig.type === 'BUY' ? 'text-emerald-500' : sig.type === 'SELL' ? 'text-red-500' : 'text-yellow-500'}`}>{sig.type}</div>
                    <div className="text-slate-600 mt-0.5">{sig.confidence}%</div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Regime recommendations */}
      <div className="border border-slate-800 bg-slate-900/20 rounded-2xl p-5">
        <div className="text-[9px] uppercase font-bold text-slate-500 tracking-widest font-mono mb-4">📋 Regime Playbook</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[7px] font-mono">
          {(['STRONG_TREND','WEAK_TREND','RANGING','BREAKOUT','PANIC','HIGH_VOLATILITY'] as const).map(r => (
            <div key={r} className="bg-slate-950/30 rounded-lg p-2 border border-slate-800/30 flex justify-between items-center">
              <span className="text-slate-400">{r.replace(/_/g, ' ')}</span>
              <span className="text-slate-500">{getRegimeRecommendation(r)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StrategiesTab({
  predictions, taData, priceMap, newsSentimentByTicker = {},
}: {
  predictions: (PredictionScore & { name: string; timeframe: string; probability: number })[];
  taData: Record<string, TAIndicators>;
  priceMap: Record<string, QuoteData>;
  newsSentimentByTicker?: Record<string, number>;
}) {
  const strategies = useMemo((): StrategyRecommendation[] => {
    const out: StrategyRecommendation[] = [];
    const seen = new Set<string>();
    for (const p of predictions) {
      if (p.direction === 'NEUTRAL' || p.targetPrice <= 0 || seen.has(p.ticker)) continue;
      seen.add(p.ticker);
      const ta = taData[p.ticker];
      if (!ta) continue;
      const live = priceMap[p.ticker];
      const price = live?.price && live.price > 0 ? live.price : p.entryPrice;
      const atrPct = price > 0 ? (ta.atr / price) * 100 : 0;
      const months = parseInt(p.timeframe) || 3;
      const style = classifyTradingStyle(ta.atr, price, ta.adx, ta.rsi, ta.bollinger.width, p.confidence, months);
      const nearSupport = ta.support > 0 && Math.abs(price - ta.support) / price < 0.02;
      const nearResistance = ta.resistance > 0 && Math.abs(price - ta.resistance) / price < 0.02;
      const tickerSentiment = newsSentimentByTicker[p.ticker] ?? 0;
      const { action, vetoed, vetoReason } = generateAction(p.direction, p.confidence, ta.rsi, nearSupport, nearResistance, tickerSentiment);
      const stopLoss = p.direction === 'BULLISH'
        ? parseFloat((price * (1 - atrPct * 0.015)).toFixed(2))
        : parseFloat((price * (1 + atrPct * 0.015)).toFixed(2));
      const catalyst = generateCatalyst({
        rsi: ta.rsi, adx: ta.adx, macdHistogram: ta.macd.histogram,
        supertrendDirection: ta.supertrend.direction, bollingerWidth: ta.bollinger.width,
        atrPct, isNearSupport: nearSupport, isNearResistance: nearResistance, patternSignal: null,
      });
      const finalCatalyst = vetoed
        ? `${catalyst} · ${vetoReason}`
        : catalyst;
      const s = priceMap[p.ticker];
      out.push({
        ticker: p.ticker, name: p.name, style, action,
        entryPrice: price, targetPrice: p.targetPrice, stopLoss,
        confidence: p.confidence,
        riskLevel: ta.bollinger.width > 8 ? 'HIGH' : ta.bollinger.width > 5 ? 'MEDIUM' : 'LOW',
        holdPeriod: generateHoldPeriod(style),
        reasoning: p.reasoning.slice(0, 3),
        catalyst: finalCatalyst,
        price: s?.price || price,
        changePercent: s?.changePercent || 0,
        vetoed,
        vetoReason,
        newsSentiment: tickerSentiment,
      });
    }
    return out.sort((a, b) => b.confidence - a.confidence);
  }, [predictions, taData, priceMap, newsSentimentByTicker]);

  const grouped = useMemo(() => {
    const map: Record<TradingStyle, StrategyRecommendation[]> = { SCALPING: [], DAY_TRADING: [], SWING: [], POSITION: [] };
    for (const r of strategies) map[r.style].push(r);
    return map;
  }, [strategies]);

  const styleMeta: Record<TradingStyle, { label: string; description: string; color: string }> = {
    SCALPING: { label: '⚡ Scalping', description: 'Seconds to minutes; hundreds of daily micro-trades', color: 'border-yellow-600/40 bg-yellow-950/10' },
    DAY_TRADING: { label: '☀️ Day Trading', description: 'Hours; positions closed before market bell', color: 'border-orange-600/40 bg-orange-950/10' },
    SWING: { label: '🌊 Swing Trading', description: 'Days to weeks; catching medium-term trend waves', color: 'border-blue-600/40 bg-blue-950/10' },
    POSITION: { label: '🏛️ Position Trading', description: 'Months to years; long-term macro trend following', color: 'border-emerald-600/40 bg-emerald-950/10' },
  };

  const actionColors: Record<string, string> = {
    STRONG_BUY: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    BUY: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
    HOLD: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    SELL: 'bg-red-500/10 text-red-300 border-red-500/20',
    STRONG_SELL: 'bg-red-500/20 text-red-400 border-red-500/30',
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="text-[9px] uppercase font-bold text-slate-500 tracking-widest font-mono mb-3">⚡ AI Strategy Engine</div>
      {(['SCALPING', 'DAY_TRADING', 'SWING', 'POSITION'] as const).map(style => {
        const items = grouped[style];
        const meta = styleMeta[style];
        if (items.length === 0) return null;
        return (
          <div key={style} className={`border ${meta.color} rounded-2xl p-5`}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="text-sm font-bold font-mono text-white">{meta.label}</span>
                <span className="text-[8px] text-slate-500 font-mono ml-2">{meta.description}</span>
              </div>
              <span className="text-[9px] text-slate-500 font-mono">{items.length} picks</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {items.slice(0, 6).map(r => (
                <div key={r.ticker} className="bg-slate-950/40 border border-slate-800/60 rounded-xl p-3 hover:border-slate-700/80 transition-all">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <span className="text-xs font-bold font-mono text-white">{r.ticker}</span>
                      <span className="text-[7px] text-slate-500 font-mono ml-1">{r.name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border ${actionColors[r.action]}`}>{r.action.replace('_', ' ')}</span>
                      {r.vetoed && <span className="text-[6px] font-mono text-red-400 bg-red-950/30 border border-red-800/40 px-1 py-0.5 rounded">VETOED</span>}
                    </div>
                  </div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[7px] text-slate-500 font-mono uppercase">Live</span>
                    <LiveTickerPrice ticker={r.ticker} stocks={priceMap} fallback={r.price} decimals={2} className="text-sm font-bold text-white" showChange />
                  </div>
                  <div className="grid grid-cols-3 gap-1 mb-2 text-[8px] font-mono">
                    <div className="bg-slate-950 rounded p-1 text-center">
                      <span className="text-slate-600 block">Entry</span>
                      <span className="text-white font-bold">{tickerCurrency(r.ticker)}{r.entryPrice.toFixed(2)}</span>
                    </div>
                    <div className="bg-slate-950 rounded p-1 text-center">
                      <span className="text-slate-600 block">Target</span>
                      <span className="text-emerald-400 font-bold">{tickerCurrency(r.ticker)}{r.targetPrice.toFixed(2)}</span>
                    </div>
                    <div className="bg-slate-950 rounded p-1 text-center">
                      <span className="text-slate-600 block">Stop</span>
                      <span className="text-red-400 font-bold">{tickerCurrency(r.ticker)}{r.stopLoss.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[7px] font-mono">
                    <span className={`px-1.5 py-0.5 rounded border ${
                      r.riskLevel === 'LOW' ? 'border-emerald-900/40 text-emerald-500' :
                      r.riskLevel === 'HIGH' ? 'border-red-900/40 text-red-500' :
                      'border-yellow-900/40 text-yellow-500'
                    }`}>{r.riskLevel} RISK</span>
                    <span className="text-slate-500">{r.confidence}% conf</span>
                    <span className="text-slate-600">{r.holdPeriod}</span>
                  </div>
                  <div className="mt-2 text-[7px] text-slate-500 font-mono leading-tight bg-slate-950/30 rounded p-1.5 border border-slate-800/30">
                    {r.catalyst}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {strategies.length === 0 && (
        <div className="text-center py-10 text-slate-600 font-mono text-[10px]">
          No strategy recommendations available — waiting for predictions with sufficient data.
        </div>
      )}
    </div>
  );
}
