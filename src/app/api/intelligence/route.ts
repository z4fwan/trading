import { getEngineState } from '@/lib/engineState';
import { ensureBackgroundEngine } from '@/lib/ensureEngine';
import { isLLMConfigured, getLLMCacheStats } from '@/lib/llmIntegration';
import { eliteHandlesCovered, eliteHandlesMissing, ELITE_OFFICIAL_FEEDS } from '@/lib/eliteOfficialFeeds';
import { getServerKnowledgeWeights } from '@/lib/serverAutonomousLearning';
import { getServerStockPulseStatus } from '@/lib/serverStockPulseLearning';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  ensureBackgroundEngine();
  const engine = getEngineState();
  const now = Date.now();

  return Response.json({
    timestamp: now,
    engine: {
      running: engine.running,
      quotesPerMin: engine.cycleCounters.quotes,
      newsPerHour: Math.round(engine.cycleCounters.news * (3600 / 90)),
      mlCycles: engine.cycleCounters.ml,
      aiLearningCycles: engine.cycleCounters.ai,
      modelsTrained: engine.modelsTrained,
      predictionsStored: engine.predictionsStored,
      newsItems: engine.newsItems.length,
      llmNewsItems: engine.newsItems.filter(n => n.llmAnalyzed).length,
    },
    llm: {
      configured: isLLMConfigured(),
      cache: getLLMCacheStats(),
      lastAnalysisAge: engine.lastLLMNewsAnalysis ? `${Math.round((now - engine.lastLLMNewsAnalysis) / 1000)}s` : 'never',
    },
    macro: {
      active: engine.macroShockActive,
      detail: engine.macroShockDetail,
      info: engine.macroShockInfo,
    },
    eliteFeeds: {
      mode: 'free-official-rss-and-google-news',
      paidTwitterApi: false,
      feedCount: ELITE_OFFICIAL_FEEDS.length,
      handlesCovered: eliteHandlesCovered(),
      handlesMissing: eliteHandlesMissing(),
      engineEliteNews: engine.newsItems.filter(n => n.isElite).length,
    },
    autonomous24x7: {
      active: engine.running,
      browserRequired: false,
      newsIntervalSec: 60,
      autonomousIntervalSec: 300,
      aiLearningIntervalSec: 600,
      stockPulseIntervalSec: 720,
      lastLearning: engine.lastAILearning ? `${Math.round((now - engine.lastAILearning) / 1000)}s ago` : 'pending',
      lastLearningResult: engine.aiLearningResult || null,
      serverWeightSamples: getServerKnowledgeWeights().totalSamples,
      lastStockPulse: engine.lastStockPulseCycle ? `${Math.round((now - engine.lastStockPulseCycle) / 1000)}s ago` : 'pending',
      stockPulseResult: engine.stockPulseResult || null,
      stockPulseGemsCached: engine.stockPulseGemsCached,
    },
    stockPulse24x7: getServerStockPulseStatus(),
    selfAwareness: engine.selfAwareness,
    strategy: {
      variants: engine.strategyVariants,
      bestName: engine.strategyBestName,
      bestScore: engine.strategyBestScore,
    },
  });
}
