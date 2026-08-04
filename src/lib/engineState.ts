export interface ClassifiedNewsItem {
  id: string; timestamp: number; source: string; region: string;
  headline: string; summary: string; sentiment: string;
  impactScore: number; tickers: string[]; url?: string;
  isElite?: boolean;
  llmAnalyzed?: boolean;
  llmReasoning?: string;
  llmUrgency?: number;
  llmImpactLevel?: 'HIGH' | 'MODERATE' | 'LOW';
  llmEventType?: string;
  llmTradingSignal?: 'BUY' | 'SELL' | 'HOLD' | 'IGNORE';

  llmExpectedMovementPct?: string;
  llmHoldingPeriod?: string;
  macroEventId?: string;
}


export interface EngineMacroShock {
  active: boolean;
  source: string;
  headline: string;
  forcedRegime: 'PANIC' | 'HIGH_VOLATILITY';
  detectedAt: number;
  /** Original article publish time (for freshness checks). */
  newsTimestamp?: number;
  impactIds: string[];
  /** Primary market context for this shock. */
  region?: 'INDIAN' | 'INTERNATIONAL';
}

export interface EngineHealth {
  running: boolean;
  startedAt: number;
  lastQuote: number;
  lastMLCycle: number;
  modelsTrained: number;
  predictionsStored: number;
  historyEntries: number;
  lastNewsCycle: number;
  newsItems: ClassifiedNewsItem[];
  lastAILearning: number;
  aiLearningResult: string;
  macroShockActive: boolean;
  macroShockInfo: string;
  macroShockDetail: EngineMacroShock | null;
  quotesPayload: string | null;
  sseClients: number;
  memoryMB: number;
  activeFetches: number;
  lastMemoryCheck: number;
  lastShutdownSignal: string;
  cycleCounters: {
    quotes: number;
    ml: number;
    news: number;
    ai: number;
  };
  errors: string[];
  selfAwareness: {
    overallAccuracy: number;
    selfAwarenessScore: number;
    metaConfidence: number;
    strengths: number;
    weaknesses: number;
    trend: string;
  };
  llmConfigured: boolean;
  llmAnalysisCount: number;
  llmCacheEntries: number;
  strategyVariants: number;
  strategyActiveVariants: number;
  strategyBestScore: number;
  strategyBestName: string;
  lastStrategyExplore: number;
  lastLLMNewsAnalysis: number;
  lastStockPulseCycle: number;
  stockPulseResult: string;
  stockPulseGemsCached: number;
  marketOfflinePlaybook: string | null;
  lastMarketOfflineAnalysis: number;

  lastSocialSentimentCycle: number;
  socialSentimentTickers: number;
  socialSentimentTrending: number;
  socialSentimentResult: string;
  lastSECCycle: number;
  secFilingsCount: number;
  lastEarningsCycle: number;
  earningsUpcoming: number;
  lastEconCalendarCycle: number;
  econEventsImminent: number;
  lastCoinGeckoCycle: number;
  cryptoMarketCap: number;
  cryptoBTCDominance: number;
  lastOptionsFlowCycle: number;
  optionsFlowTickers: number;
  optionsFlowAlerts: number;
  lastBacktestCycle: number;
  backtestStrategies: number;
  backtestBestWinRate: number;
  backtestBestStrategy: string;
  lastQuantCycle: number;
  quantSignalsGenerated: number;
  quantActiveStrategies: number;
  lastRiskCycle: number;
  riskPositions: number;
  riskSharpe: number;
  riskMaxDrawdown: number;

  liveQuantSignals?: unknown[];
  liveOptionsFlow?: unknown[];
  liveIntradayCalls?: unknown[];
  liveIntradayPlan?: unknown;
  liveRiskData?: unknown;
  liveBacktestData?: unknown;
  livePaperTrades?: unknown[];
  bullScoreSignals?: unknown[];
}


// Global singleton state — shared across all module instances
const GLOBAL_KEY = '__quantumEngineState';

function getState(): EngineHealth {
  const g = globalThis as unknown as Record<string, EngineHealth | undefined>;
  if (g[GLOBAL_KEY]) return g[GLOBAL_KEY]!;
  const s: EngineHealth = {
    running: false, startedAt: 0, lastQuote: 0, lastMLCycle: 0,
    modelsTrained: 0, predictionsStored: 0, historyEntries: 0,
    lastNewsCycle: 0, newsItems: [],
    lastAILearning: 0, aiLearningResult: '',
    macroShockActive: false, macroShockInfo: '', macroShockDetail: null,
    quotesPayload: null,
    sseClients: 0,
    memoryMB: 0,
    activeFetches: 0,
    lastMemoryCheck: 0,
    lastShutdownSignal: '',
    cycleCounters: { quotes: 0, ml: 0, news: 0, ai: 0 },
    errors: [],
    selfAwareness: { overallAccuracy: 0, selfAwarenessScore: 0, metaConfidence: 0, strengths: 0, weaknesses: 0, trend: 'STABLE' },
    llmConfigured: false,
    llmAnalysisCount: 0,
    llmCacheEntries: 0,
    strategyVariants: 0,
    strategyActiveVariants: 0,
    strategyBestScore: 0,
    strategyBestName: '',
    lastStrategyExplore: 0,
    lastLLMNewsAnalysis: 0,
    lastStockPulseCycle: 0,
    stockPulseResult: '',
    stockPulseGemsCached: 0,
    marketOfflinePlaybook: null,
    lastMarketOfflineAnalysis: 0,

    lastSocialSentimentCycle: 0, socialSentimentTickers: 0, socialSentimentTrending: 0, socialSentimentResult: '',
    lastSECCycle: 0, secFilingsCount: 0, lastEarningsCycle: 0, earningsUpcoming: 0, lastEconCalendarCycle: 0, econEventsImminent: 0,
    lastCoinGeckoCycle: 0, cryptoMarketCap: 0, cryptoBTCDominance: 0, lastOptionsFlowCycle: 0, optionsFlowTickers: 0, optionsFlowAlerts: 0,
    lastBacktestCycle: 0, backtestStrategies: 0, backtestBestWinRate: 0, backtestBestStrategy: '',
    lastQuantCycle: 0, quantSignalsGenerated: 0, quantActiveStrategies: 0, lastRiskCycle: 0, riskPositions: 0, riskSharpe: 0, riskMaxDrawdown: 0,
    liveQuantSignals: [], liveOptionsFlow: [], liveIntradayCalls: [], liveIntradayPlan: null, liveRiskData: {}, liveBacktestData: {}, livePaperTrades: [], bullScoreSignals: [],
  };

  g[GLOBAL_KEY] = s;
  return s;
}

export function getEngineState(): EngineHealth { return getState(); }

const MAX_NEWS_ITEMS = 50;

export function markEngineRunning() {
  const state = getState();
  state.running = true;
  state.startedAt = Date.now();
}

export function markEngineStopped(signal?: string) {
  const state = getState();
  state.running = false;
  if (signal) state.lastShutdownSignal = signal;
}
export function markQuote(payload?: string) { const s = getState(); s.lastQuote = Date.now(); if (payload) s.quotesPayload = payload; s.cycleCounters.quotes++; }
export function markMLCycle(trained: number, stored: number) {
  const s = getState();
  s.lastMLCycle = Date.now();
  s.modelsTrained = trained;
  s.predictionsStored = stored;
  s.cycleCounters.ml++;
}
export function markHistoryCount(n: number) { getState().historyEntries = n; }
export function markNewsCycle(items: ClassifiedNewsItem[]) {
  const s = getState();
  s.lastNewsCycle = Date.now();
  s.newsItems = items.slice(0, MAX_NEWS_ITEMS);
  s.cycleCounters.news++;
}
export function markAILearning(result: string) {
  const s = getState();
  s.lastAILearning = Date.now();
  s.aiLearningResult = result;
  s.cycleCounters.ai++;
}
export function markMacroShock(active: boolean, info: string, detail: EngineMacroShock | null = null) {
  const s = getState();
  s.macroShockActive = active;
  s.macroShockInfo = info;
  s.macroShockDetail = detail;
}
export function markMemoryMB(mb: number) { const s = getState(); s.memoryMB = mb; s.lastMemoryCheck = Date.now(); }
export function markSSEClients(n: number) { getState().sseClients = n; }
export function markActiveFetches(n: number) { getState().activeFetches = n; }
export function markError(msg: string) {
  const s = getState();
  const short = msg.length > 220 ? `${msg.slice(0, 220)}…` : msg;
  s.errors.push(short);
  if (s.errors.length > 100) s.errors.splice(0, s.errors.length - 100);
}
export function markSelfAwareness(accuracy: number, score: number, metaConf: number, strengths: number, weaknesses: number, trend: string) {
  const s = getState();
  s.selfAwareness = { overallAccuracy: accuracy, selfAwarenessScore: score, metaConfidence: metaConf, strengths, weaknesses, trend };
}
export function markLLMConfigured(configured: boolean) { getState().llmConfigured = configured; }
export function markLLMAnalysis(count: number, cache: number) { const s = getState(); s.llmAnalysisCount = count; s.llmCacheEntries = cache; s.lastLLMNewsAnalysis = Date.now(); }
export function markStrategyExplore(active: number, total: number, bestScore: number, bestName: string) { const s = getState(); s.strategyVariants = total; s.strategyActiveVariants = active; s.strategyBestScore = bestScore; s.strategyBestName = bestName; s.lastStrategyExplore = Date.now(); }
export function markStockPulseCycle(result: string, gemsCached: number) {
  const s = getState();
  s.lastStockPulseCycle = Date.now();
  s.stockPulseResult = result;
  s.stockPulseGemsCached = gemsCached;
}

export function markMarketOfflineAnalysis(playbook: string) {
  const s = getState();
  s.lastMarketOfflineAnalysis = Date.now();
  s.marketOfflinePlaybook = playbook;
}


export function markBullScoreSignals(data: unknown[]) {
  getState().bullScoreSignals = data as any[];
}

export function markIntradayCalls(data: any[], plan: any) {
  const s = getState();
  s.liveIntradayCalls = data;
  s.liveIntradayPlan = plan;
}

export function markOptionsFlow(tickers: number, alerts: number, data: any[]) {
  const s = getState();
  s.lastOptionsFlowCycle = Date.now();
  s.optionsFlowTickers = tickers;
  s.optionsFlowAlerts = alerts;
  s.liveOptionsFlow = data;
}

export function markBacktestCycle(strategies: number, winRate: number, bestStrategy: string, data: any) {
  const s = getState();
  s.lastBacktestCycle = Date.now();
  s.backtestStrategies = strategies;
  s.backtestBestWinRate = winRate;
  s.backtestBestStrategy = bestStrategy;
  s.liveBacktestData = data;
}

export function markQuantCycle(strategies: number, signals: number, data: any[]) {
  const s = getState();
  s.lastQuantCycle = Date.now();
  s.quantSignalsGenerated = signals;
  s.quantActiveStrategies = strategies;
  s.liveQuantSignals = data;
}

export function markRiskCycle(positions: number, sharpe: number, drawdown: number, data: any) {
  const s = getState();
  s.lastRiskCycle = Date.now();
  s.riskPositions = positions;
  s.riskSharpe = sharpe;
  s.riskMaxDrawdown = drawdown;
  s.liveRiskData = data;
}

export function setEngineState(loadedState: Partial<EngineHealth>): void {
  const current = getState();
  Object.assign(current, loadedState);
}
