/**
 * 24/7 Stock Pulse + undervalued gem learning — runs in background engine (no browser).
 * Rotates Nifty/US fundamentals scan, caches gems for the dashboard, ties in macro/news context.
 */

import { getEngineState, markStockPulseCycle, type ClassifiedNewsItem } from './engineState';
import { getServiceClient } from './supabase';
import { scanMultibaggerCandidates } from './stockPulse/multibaggerScanner';
import { fetchRawFundamentals } from './stockPulse/fundamentalFetcher';
import { buildStockPulseReport } from './stockPulse/scoring';
import type { MultibaggerPick, StockPulseReport } from './stockPulse/types';
import { sendStockPulseGemAlert } from './telegramBot';

const GLOBAL_CACHE_KEY = '__quantumServerStockPulseCache';
const GLOBAL_MEMORY_KEY = '__quantumServerPulseMemory';
const GEM_CACHE_TTL_MS = 20 * 60 * 1000;

export interface ServerPulseMemoryEntry {
  ticker: string;
  name: string;
  pulseScore: number;
  verdict: string;
  growth: string;
  gemScore: number | null;
  gemTier: string | null;
  studiedAt: number;
  studyCount: number;
}

export interface ServerStockPulseCache {
  updatedAt: number;
  gems: MultibaggerPick[];
  marketBrief: string;
  globalHeadlines: string[];
  macroActive: boolean;
  studiedTickers: string[];
  totalStudies: number;
  lastDeepScanTicker: string | null;
  cyclesCompleted: number;
}

export interface StockPulseCycleResult {
  gemsFound: number;
  tickersStudied: number;
  deepScanTicker: string | null;
  marketBrief: string;
}

function getCache(): ServerStockPulseCache {
  const g = globalThis as unknown as Record<string, unknown>;
  if (!g[GLOBAL_CACHE_KEY]) {
    g[GLOBAL_CACHE_KEY] = {
      updatedAt: 0,
      gems: [],
      marketBrief: 'Server learning initializing…',
      globalHeadlines: [],
      macroActive: false,
      studiedTickers: [],
      totalStudies: 0,
      lastDeepScanTicker: null,
      cyclesCompleted: 0,
    } satisfies ServerStockPulseCache;
  }
  return g[GLOBAL_CACHE_KEY] as ServerStockPulseCache;
}

function getMemory(): Record<string, ServerPulseMemoryEntry> {
  const g = globalThis as unknown as Record<string, unknown>;
  if (!g[GLOBAL_MEMORY_KEY]) g[GLOBAL_MEMORY_KEY] = {};
  return g[GLOBAL_MEMORY_KEY] as Record<string, ServerPulseMemoryEntry>;
}

function buildMarketBrief(news: ClassifiedNewsItem[], macroActive: boolean, macroInfo: string): { brief: string; headlines: string[] } {
  const headlines = news
    .slice(0, 6)
    .map(n => `[${n.region}] ${n.headline.slice(0, 100)}`)
    .filter(Boolean);

  const llm = news.filter(n => n.llmAnalyzed).slice(0, 2);
  const sentiment = news.length
    ? news.filter(n => n.sentiment === 'BULLISH').length - news.filter(n => n.sentiment === 'BEARISH').length
    : 0;
  const mood = sentiment > 2 ? 'risk-on' : sentiment < -2 ? 'cautious' : 'mixed';

  const macroLine = macroActive
    ? `Macro alert active: ${macroInfo.slice(0, 120)}`
    : 'No Tier-1 macro shock flagged — normal regime.';

  const brief = [
    `Market scan (${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST): news mood ${mood}, ${news.length} headlines in engine.`,
    macroLine,
    llm.length > 0 ? `AI read: ${llm.map(n => n.headline.slice(0, 80)).join(' · ')}` : 'LLM news pass pending.',
    'Stock Pulse rotates Nifty 500 + gems; fundamentals cross-checked when you open reports.',
  ].join(' ');

  return { brief, headlines };
}

function recordStudy(pick: MultibaggerPick): void {
  const mem = getMemory();
  const t = pick.ticker.toUpperCase();
  const prev = mem[t];
  mem[t] = {
    ticker: t,
    name: pick.name,
    pulseScore: prev?.pulseScore ?? pick.score,
    verdict: prev?.verdict ?? 'UNDERVALUED',
    growth: prev?.growth ?? 'STEADY',
    gemScore: pick.score,
    gemTier: pick.tier,
    studiedAt: Date.now(),
    studyCount: (prev?.studyCount || 0) + 1,
  };
}

function recordDeepReport(report: StockPulseReport): void {
  const mem = getMemory();
  const t = report.ticker.toUpperCase();
  const prev = mem[t];
  mem[t] = {
    ticker: t,
    name: report.companyName,
    pulseScore: report.pulse.score,
    verdict: report.valuation.verdict,
    growth: report.growth.class,
    gemScore: prev?.gemScore ?? null,
    gemTier: prev?.gemTier ?? null,
    studiedAt: Date.now(),
    studyCount: (prev?.studyCount || 0) + 1,
  };
}

async function persistSnapshot(cache: ServerStockPulseCache): Promise<void> {
  const svc = getServiceClient();
  if (!svc) return;
  const engine = getEngineState();
  try {
    await (svc as any).from('ai_knowledge_snapshots').insert({
      total_predictions_analyzed: cache.totalStudies,
      total_resolved_predictions: cache.totalStudies,
      overall_accuracy: engine.selfAwareness.overallAccuracy,
      learning_progress: 'STOCK_PULSE_24X7',
      days_active: engine.startedAt ? Math.max(1, Math.floor((Date.now() - engine.startedAt) / 86400000)) : 1,
      snapshot_data: {
        stockPulse: {
          gems: cache.gems.slice(0, 8).map(g => ({ ticker: g.ticker, score: g.score, tier: g.tier })),
          marketBrief: cache.marketBrief,
          studiedTickers: cache.studiedTickers.slice(0, 20),
          macroActive: cache.macroActive,
          cycles: cache.cyclesCompleted,
        },
        macroActive: engine.macroShockActive,
        newsCycles: engine.cycleCounters.news,
      },
    });
  } catch { /* optional */ }
}

let deepScanCounter = 0;

/** Background cycle — gem scan + memory + optional deep report on top pick. */
export async function runStockPulseLearningCycle(): Promise<StockPulseCycleResult> {
  const engine = getEngineState();
  const cache = getCache();
  const { brief, headlines } = buildMarketBrief(
    engine.newsItems,
    engine.macroShockActive,
    engine.macroShockInfo,
  );

  const gems = await scanMultibaggerCandidates(28, 10);
  for (const g of gems) {
    recordStudy(g);
    if (g.tier === 'CANDIDATE') {
      await sendStockPulseGemAlert(g);
    }
  }

  deepScanCounter += 1;
  let deepScanTicker: string | null = null;
  const top = gems[0];
  if (top && deepScanCounter % 3 === 0) {
    try {
      const raw = await fetchRawFundamentals(top.ticker);
      if (raw) {
        const report = buildStockPulseReport(raw, 5);
        recordDeepReport(report);
        deepScanTicker = top.ticker;
      }
    } catch { /* rate limit / network */ }
  }

  const mem = getMemory();
  const studiedTickers = Object.keys(mem).sort(
    (a, b) => (mem[b].studiedAt || 0) - (mem[a].studiedAt || 0),
  );
  const totalStudies = Object.values(mem).reduce((s, e) => s + e.studyCount, 0);

  cache.updatedAt = Date.now();
  cache.gems = gems;
  cache.marketBrief = brief;
  cache.globalHeadlines = headlines;
  cache.macroActive = engine.macroShockActive;
  cache.studiedTickers = studiedTickers;
  cache.totalStudies = totalStudies;
  cache.lastDeepScanTicker = deepScanTicker;
  cache.cyclesCompleted += 1;

  markStockPulseCycle(
    `gems ${gems.length}, studied ${studiedTickers.length}, deep ${deepScanTicker || '—'}`,
    gems.length,
  );

  await persistSnapshot(cache);

  return {
    gemsFound: gems.length,
    tickersStudied: studiedTickers.length,
    deepScanTicker,
    marketBrief: brief,
  };
}

export function getServerGemCache(maxAgeMs = GEM_CACHE_TTL_MS): MultibaggerPick[] | null {
  const c = getCache();
  if (!c.updatedAt || Date.now() - c.updatedAt > maxAgeMs) return null;
  return c.gems;
}

export function getServerStockPulseStatus() {
  const c = getCache();
  const mem = getMemory();
  return {
    active: getEngineState().running,
    browserRequired: false,
    lastScanAt: c.updatedAt || null,
    lastScanAgeSec: c.updatedAt ? Math.round((Date.now() - c.updatedAt) / 1000) : null,
    gemsCached: c.gems.length,
    gems: c.gems,
    marketBrief: c.marketBrief,
    globalHeadlines: c.globalHeadlines,
    macroActive: c.macroActive,
    studiedTickers: c.studiedTickers.slice(0, 15),
    totalStudies: c.totalStudies,
    lastDeepScanTicker: c.lastDeepScanTicker,
    cyclesCompleted: c.cyclesCompleted,
    topMemory: Object.values(mem)
      .sort((a, b) => b.studyCount - a.studyCount)
      .slice(0, 8)
      .map(e => ({
        ticker: e.ticker,
        name: e.name,
        pulseScore: e.pulseScore,
        studyCount: e.studyCount,
        gemTier: e.gemTier,
      })),
  };
}

export function getServerPulseSummary(ticker: string): string | null {
  const e = getMemory()[ticker.toUpperCase()];
  if (!e || e.studyCount < 1) return null;
  return `Server studied ${e.ticker} ${e.studyCount}× (24/7). Last pulse ${e.pulseScore}/10 · ${e.verdict} · growth ${e.growth}${e.gemTier ? ` · gem tier ${e.gemTier}` : ''}.`;
}
