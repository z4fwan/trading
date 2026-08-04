import { heavyGet, heavySet } from './db';

export interface NewsEvent {
  id: string;
  timestamp: number;
  source: string;
  region: 'INDIAN' | 'INTERNATIONAL';
  headline: string;
  summary: string;
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  impactScore: number;
  tickers: string[];
  url?: string;
  isElite?: boolean;
  macroEventId?: string;
  llmAnalyzed?: boolean;
  llmReasoning?: string;
  llmUrgency?: number;
  llmImpactLevel?: string;
}

const STORAGE_KEY = 'news-store';
const MAX_NEWS = 500;
const NEWS_TTL_MS = 72 * 60 * 60 * 1000; // 72 hours
let newsCache: NewsEvent[] | undefined;

function dedupById(list: NewsEvent[]): NewsEvent[] {
  const seen = new Set<string>();
  const out: NewsEvent[] = [];
  for (const n of list) {
    if (!n || typeof n.id !== 'string' || !n.id) continue;
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    out.push(n);
  }
  return out;
}

function loadNews(): NewsEvent[] {
  if (newsCache) return newsCache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: NewsEvent[] = raw ? (JSON.parse(raw) || []) : [];
    // Purge legacy duplicates that were ingested before id-dedup existed —
    // otherwise React renders duplicate keys forever from the persisted store.
    newsCache = dedupById(parsed);
    if (newsCache.length !== parsed.length) saveNews();
  } catch {
    newsCache = [];
  }
  return newsCache!;
}

function saveNews() {
  try {
    const pruned = (newsCache || []).slice(0, MAX_NEWS)
      .filter(n => Date.now() - n.timestamp < NEWS_TTL_MS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
    heavySet(STORAGE_KEY, pruned).catch(() => {});
  } catch { /* localStorage full */ }
}

export async function hydrateNewsFromDB(): Promise<void> {
  try {
    const stored = await heavyGet<NewsEvent[]>(STORAGE_KEY);
    if (stored && stored.length > 0) {
      newsCache = dedupById(stored);
    }
  } catch { /* fallback to localStorage */ }
}

export function addNewsEvents(events: NewsEvent[]) {
  const list = loadNews();
  const existingIds = new Set(list.map(e => e.id));
  const now = Date.now();
  const added: NewsEvent[] = [];
  for (const event of events) {
    if (!existingIds.has(event.id) && now - event.timestamp < NEWS_TTL_MS) {
      added.push(event);
      existingIds.add(event.id);
    }
  }
  if (added.length === 0) return;
  for (let i = added.length - 1; i >= 0; i--) list.unshift(added[i]);
  newsCache = list.slice(0, MAX_NEWS);
  saveNews();
}

export function getNewsFeed(limit = 20): NewsEvent[] {
  return loadNews().slice(0, limit);
}

export function getNewsForTicker(ticker: string, hoursBack = 72): NewsEvent[] {
  const cutoff = Date.now() - hoursBack * 60 * 60 * 1000;
  return loadNews().filter(n => n.timestamp >= cutoff && n.tickers.includes(ticker));
}

export function getNewsSentiment(ticker: string, hoursBack = 72): number {
  const events = getNewsForTicker(ticker, hoursBack);
  if (events.length === 0) return 0;
  let score = 0;
  for (const e of events) {
    if (e.sentiment === 'BULLISH') score += e.impactScore;
    else if (e.sentiment === 'BEARISH') score -= e.impactScore;
  }
  return Math.max(-100, Math.min(100, score / events.length));
}

export function getAggregatedSentiment(hoursBack = 24): { overall: number; byTicker: Record<string, number> } {
  const cutoff = Date.now() - hoursBack * 60 * 60 * 1000;
  const recent = loadNews().filter(n => n.timestamp >= cutoff);
  const byTicker: Record<string, { score: number; count: number }> = {};
  let totalScore = 0;
  let totalCount = 0;

  for (const e of recent) {
    const val = e.sentiment === 'BULLISH' ? e.impactScore : e.sentiment === 'BEARISH' ? -e.impactScore : 0;
    totalScore += val;
    totalCount++;
    for (const t of e.tickers) {
      if (!byTicker[t]) byTicker[t] = { score: 0, count: 0 };
      byTicker[t].score += val;
      byTicker[t].count++;
    }
  }

  const result: Record<string, number> = {};
  for (const [t, v] of Object.entries(byTicker)) {
    result[t] = Math.max(-100, Math.min(100, v.score / v.count));
  }

  return {
    overall: totalCount > 0 ? Math.max(-100, Math.min(100, totalScore / totalCount)) : 0,
    byTicker: result,
  };
}

function wordMatch(text: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(text);
}

export function classifySentiment(headline: string, summary?: string): 'BULLISH' | 'BEARISH' | 'NEUTRAL' {
  const text = `${headline} ${summary || ''}`;
  const bullishPhrases = ['all-time high', 'record high', 'beat estimates', 'better than expected', 'raised guidance', 'strong buy', 'outperform rating', 'positive outlook', 'earnings beat'];
  const bearishPhrases = ['missed estimates', 'worse than expected', 'lowered guidance', 'sell-off', 'profit warning', 'downgrade', 'credit rating cut', 'layoff', 'restructuring', 'class action'];
  let bullishScore = 0, bearishScore = 0;
  for (const p of bullishPhrases) { if (text.toLowerCase().includes(p)) bullishScore += 3; }
  for (const p of bearishPhrases) { if (text.toLowerCase().includes(p)) bearishScore += 3; }
  const bullishWords = ['surge', 'rally', 'gain', 'breakout', 'bullish', 'upgrade', 'positive', 'growth', 'profit', 'rise', 'higher', 'beat', 'strong', 'bull', 'outperform', 'buy', 'overweight', 'upbeat', 'recovery', 'expansion', 'boom', 'opportunity', 'green', 'record', 'high', 'soar', 'jump', 'climb', 'advance', 'momentum', 'upside', 'rebound', 'boost', 'accelerate', 'flourish'];
  const bearishWords = ['drop', 'slide', 'decline', 'sell', 'bearish', 'downgrade', 'negative', 'loss', 'fall', 'lower', 'miss', 'weak', 'bear', 'underperform', 'reduce', 'sell-off', 'crash', 'plunge', 'tumble', 'slump', 'downturn', 'recession', 'slowdown', 'red', 'cut', 'warning', 'risk', 'volatile', 'uncertainty', 'plummet', 'nosedive', 'wipe', 'worst', 'debt', 'default', 'bankrupt', 'fraud', 'scandal'];
  for (const w of bullishWords) { if (wordMatch(text, w)) bullishScore++; }
  for (const w of bearishWords) { if (wordMatch(text, w)) bearishScore++; }
  const diff = bullishScore - bearishScore;
  if (diff >= 2) return 'BULLISH';
  if (diff <= -2) return 'BEARISH';
  return 'NEUTRAL';
}
