import { getEngineState, markNewsCycle, markMacroShock, type ClassifiedNewsItem } from '@/lib/engineState';
import { fetchClassifiedNews } from '@/lib/newsFetcher';
import { processNewsPipeline, isMacroShockFresh } from '@/lib/llmNewsPipeline';
import { ensureBackgroundEngine } from '@/lib/ensureEngine';
import { isLLMConfigured } from '@/lib/llmIntegration';
import { addNewsEvents } from '@/lib/newsStore';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const runtime = 'nodejs';

const STALE_NEWS_MS = 90_000;
let inflightNews: Promise<ClassifiedNewsItem[]> | null = null;

function macroPayload(engine: ReturnType<typeof getEngineState>) {
  const fresh = engine.macroShockActive && isMacroShockFresh(engine.macroShockDetail);
  if (!fresh) {
    if (engine.macroShockActive) markMacroShock(false, '', null);
    return { active: false, info: null, detail: null };
  }
  return {
    active: true,
    info: engine.macroShockInfo || null,
    detail: engine.macroShockDetail,
  };
}

function newsResponse(engine: ReturnType<typeof getEngineState>, news: ClassifiedNewsItem[], cached: boolean, generated: boolean) {
  const age = engine.lastNewsCycle ? Date.now() - engine.lastNewsCycle : 0;
  return Response.json({
    news,
    generated,
    count: news.length,
    cached,
    age: age > 0 ? `${Math.round(age / 1000)}s` : '0s',
    llmConfigured: isLLMConfigured(),
    llmEnhancedCount: news.filter(n => n.llmAnalyzed).length,
    macro: macroPayload(engine),
  });
}

export async function GET() {
  ensureBackgroundEngine();
  const engine = getEngineState();
  const age = engine.lastNewsCycle ? Date.now() - engine.lastNewsCycle : Infinity;

  if (engine.newsItems.length > 0 && age < STALE_NEWS_MS) {
    return newsResponse(engine, engine.newsItems, true, false);
  }

  try {
    if (!inflightNews) {
      inflightNews = (async () => {
        const raw = await fetchClassifiedNews();
        const { items, macro, llmEnhanced } = await processNewsPipeline(raw);
        if (macro) markMacroShock(true, `${macro.source}: ${macro.headline.slice(0, 120)}`, macro);
        else markMacroShock(false, '', null);
        if (items.length > 0) {
          markNewsCycle(items);
          addNewsEvents(items as any);
        }
        console.log(`[News API] pipeline: ${items.length} items, LLM ${llmEnhanced}`);
        return items;
      })().finally(() => { inflightNews = null; });
    }
    const fresh = await inflightNews;
    const updated = getEngineState();
    if (fresh.length > 0) return newsResponse(updated, fresh, false, true);
  } catch (e) {
    console.warn('[News API]', e);
  }

  if (engine.newsItems.length > 0) {
    return newsResponse(engine, engine.newsItems, true, false);
  }

  return Response.json({ news: [], generated: false, count: 0, cached: false, llmConfigured: isLLMConfigured(), macro: { active: false, info: null, detail: null } });
}
