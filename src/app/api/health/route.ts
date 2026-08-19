import { envHealthy } from '@/lib/env';
import { getEngineState } from '@/lib/engineState';
import { ensureBackgroundEngine } from '@/lib/ensureEngine';
import { getQuoteCacheStats } from '@/lib/quoteFetcher';
import { getServiceClient } from '@/lib/supabase';
import { isRenderBandwidthSaver } from '@/lib/renderBandwidth';

async function pingSupabase() {
  const svc = getServiceClient();
  if (!svc) return { configured: false, reachable: false, error: 'SUPABASE_SERVICE_KEY missing' };
  try {
    const { error } = await svc.from('predictions').select('id', { count: 'exact', head: true });
    if (error) return { configured: true, reachable: false, error: error.message };
    return { configured: true, reachable: true, error: null };
  } catch (e) {
    return { configured: true, reachable: false, error: String(e) };
  }
}

async function pingPythonBackend() {
  const baseUrl = process.env.PYTHON_BACKEND_URL || 'http://127.0.0.1:8080';
  try {
    const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { reachable: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    return { reachable: true, ...data };
  } catch (e) {
    return { reachable: false, error: String(e).slice(0, 100) };
  }
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  ensureBackgroundEngine();
  const now = Date.now();
  const engine = getEngineState();
  const uptime = process.uptime();
  const quoteAge = engine.lastQuote ? now - engine.lastQuote : -1;
  const mlAge = engine.lastMLCycle ? now - engine.lastMLCycle : -1;
  const newsAge = engine.lastNewsCycle ? now - engine.lastNewsCycle : -1;
  const aiAge = engine.lastAILearning ? now - engine.lastAILearning : -1;
  const engineUptime = engine.startedAt ? now - engine.startedAt : 0;
  const quotes = getQuoteCacheStats();
  const [supabasePing, pythonPing] = await Promise.all([pingSupabase(), pingPythonBackend()]);
  const yahooErrors = engine.errors.filter(e => e.startsWith('quote-fetch')).length;
  const healthy = engine.running && quoteAge < 10000 && envHealthy()
    && quotes.pricedStocks >= 50;

  return Response.json({
    status: healthy ? 'healthy' : 'degraded',
    version: '3.0.0',
    platform: process.env.RENDER ? 'render' : process.env.VERCEL ? 'vercel' : 'unknown',
    uptime,
    uptimeHuman: `${Math.floor(uptime / 86400)}d ${Math.floor((uptime % 86400) / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
    timestamp: now,
    env: {
      valid: envHealthy(),
      supabase: !!process.env.SUPABASE_SERVICE_KEY,
      telegram: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
      ollama: !!process.env.OLLAMA_BASE_URL,
    },
    engine: {
      running: engine.running,
      engineUptime: engineUptime > 0 ? `${Math.round(engineUptime / 1000)}s` : 'n/a',
      startedAt: engine.startedAt || null,
      cycleCounters: engine.cycleCounters,
      lastQuoteAge: quoteAge > 0 ? `${Math.round(quoteAge / 1000)}s ago` : 'never',
      lastMLCycleAge: mlAge > 0 ? `${Math.round(mlAge / 60 / 1000)}min ago` : 'never',
      lastNewsCycleAge: newsAge > 0 ? `${Math.round(newsAge / 1000)}s ago` : 'never',
      lastAILearningAge: aiAge > 0 ? `${Math.round(aiAge / 60 / 1000)}min ago` : 'never',
      modelsTrained: engine.modelsTrained,
      predictionsStored: engine.predictionsStored,
      historyEntries: engine.historyEntries,
      newsItems: engine.newsItems.length,
      sseClients: engine.sseClients,
      memoryMB: engine.memoryMB,
      activeFetches: engine.activeFetches,
      lastMemoryCheck: engine.lastMemoryCheck ? `${Math.round((now - engine.lastMemoryCheck) / 1000)}s ago` : 'never',
      recentErrors: engine.errors.slice(-5),
      quotes: {
        pricedStocks: quotes.pricedStocks,
        indianPriced: `${quotes.indianPriced}/${quotes.totalIndian}`,
        lastFullSnapshot: quotes.lastFullSnapshotAt
          ? `${Math.round((now - quotes.lastFullSnapshotAt) / 60000)}min ago`
          : 'never',
      },
      supabase: supabasePing,
      pythonBackend: {
        reachable: pythonPing.reachable,
        version: pythonPing.version || null,
        modelsLoaded: pythonPing.ml?.models_loaded || 0,
        champion: pythonPing.ml?.champion || null,
        trainingCache: pythonPing.training_cache?.cached_tickers || 0,
        error: pythonPing.error || null,
      },
      yahooErrorCount: yahooErrors,
      macroShock: engine.macroShockActive ? engine.macroShockInfo : null,
      aiLearningResult: engine.aiLearningResult || null,
      selfAwareness: engine.selfAwareness,
      llm: {
        configured: engine.llmConfigured,
        analysisCount: engine.llmAnalysisCount,
        cacheEntries: engine.llmCacheEntries,
        lastAnalysisAge: engine.lastLLMNewsAnalysis ? `${Math.round((now - engine.lastLLMNewsAnalysis) / 1000)}s ago` : 'never',
      },
      strategy: {
        variants: engine.strategyVariants,
        activeVariants: engine.strategyActiveVariants,
        bestScore: engine.strategyBestScore,
        bestName: engine.strategyBestName,
        lastExploreAge: engine.lastStrategyExplore ? `${Math.round((now - engine.lastStrategyExplore) / 60000)}min ago` : 'never',
      },
      autonomous24x7: {
        browserRequired: false,
        newsEverySec: 60,
        learningEverySec: 300,
        fullAiEverySec: 600,
        lastResult: engine.aiLearningResult || null,
        bandwidthSaver: isRenderBandwidthSaver(),
        quoteIntervalMs: isRenderBandwidthSaver() ? 6000 : process.env.RENDER === 'true' ? 3000 : 1000,
      },
      offline: {
        playbook: engine.marketOfflinePlaybook || null,
        lastAnalysisAge: engine.lastMarketOfflineAnalysis ? `${Math.round((now - engine.lastMarketOfflineAnalysis) / 60000)}min ago` : 'never',
      },
      socialSentiment: {
        tickersTracked: engine.socialSentimentTickers,
        trendingCount: engine.socialSentimentTrending,
        lastCycleAge: engine.lastSocialSentimentCycle ? `${Math.round((now - engine.lastSocialSentimentCycle) / 60000)}min ago` : 'never',
        result: engine.socialSentimentResult || null,
      },
      globalEvents: {
        sec: {
          filings: engine.secFilingsCount,
          lastScanAge: engine.lastSECCycle ? `${Math.round((now - engine.lastSECCycle) / 60000)}min ago` : 'never',
        },
        earnings: {
          upcoming14d: engine.earningsUpcoming,
          lastScanAge: engine.lastEarningsCycle ? `${Math.round((now - engine.lastEarningsCycle) / 60000)}min ago` : 'never',
        },
        economicCalendar: {
          imminentHighImpact: engine.econEventsImminent,
          lastScanAge: engine.lastEconCalendarCycle ? `${Math.round((now - engine.lastEconCalendarCycle) / 60000)}min ago` : 'never',
        },
        crypto: {
          marketCap: engine.cryptoMarketCap,
          btCDominance: engine.cryptoBTCDominance,
          lastScanAge: engine.lastCoinGeckoCycle ? `${Math.round((now - engine.lastCoinGeckoCycle) / 60000)}min ago` : 'never',
        },
        optionsFlow: {
          tickersScanned: engine.optionsFlowTickers,
          alertsFound: engine.optionsFlowAlerts,
          lastScanAge: engine.lastOptionsFlowCycle ? `${Math.round((now - engine.lastOptionsFlowCycle) / 60000)}min ago` : 'never',
        },
        backtesting: {
          strategies: engine.backtestStrategies,
          bestWinRate: engine.backtestBestWinRate,
          bestStrategy: engine.backtestBestStrategy,
          lastCycleAge: engine.lastBacktestCycle ? `${Math.round((now - engine.lastBacktestCycle) / 60000)}min ago` : 'never',
        },
        quantStrategies: {
          signalsGenerated: engine.quantSignalsGenerated,
          activeStrategies: engine.quantActiveStrategies,
          lastCycleAge: engine.lastQuantCycle ? `${Math.round((now - engine.lastQuantCycle) / 60000)}min ago` : 'never',
        },
        riskManagement: {
          positions: engine.riskPositions,
          sharpeRatio: engine.riskSharpe,
          maxDrawdown: engine.riskMaxDrawdown,
          lastCycleAge: engine.lastRiskCycle ? `${Math.round((now - engine.lastRiskCycle) / 60000)}min ago` : 'never',
        },
      },
    },
  });
}
