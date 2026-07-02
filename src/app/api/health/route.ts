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
  const supabasePing = await pingSupabase();
  const yahooErrors = engine.errors.filter(e => e.startsWith('quote-fetch')).length;
  const healthy = engine.running && quoteAge < 10000 && envHealthy()
    && quotes.pricedStocks >= 50;

  return Response.json({
    status: healthy ? 'healthy' : 'degraded',
    version: '2.0.0',
    platform: process.env.RENDER ? 'render' : process.env.VERCEL ? 'vercel' : 'unknown',
    uptime,
    uptimeHuman: `${Math.floor(uptime / 86400)}d ${Math.floor((uptime % 86400) / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
    timestamp: now,
    env: { valid: envHealthy() },
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
      }
    },
  });
}
