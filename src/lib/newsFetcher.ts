import { NIFTY_50_TICKERS, INDIAN_EQUITY_TICKERS, tickerToYahoo } from './marketConfig';
import { addDynamicTicker, getDynamicIndianUniverse, getFullUniverse } from './dynamicUniverse';
import { classifySentiment } from './newsStore';
import { isEliteSource, isIndianEliteSource } from './eliteSources';
import { ELITE_OFFICIAL_FEEDS, INDIAN_MACRO_RSS_FEEDS } from './eliteOfficialFeeds';
import { fetchLiveNSEAnnouncements } from './nseCorporateFetcher';
import { detectNewsRegion } from './indianMacro';
import type { ClassifiedNewsItem } from './engineState';

const seenHeadlines = new Set<string>();

function isDuplicate(headline: string): boolean {
  const key = headline.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (seenHeadlines.has(key)) return true;
  seenHeadlines.add(key);
  if (seenHeadlines.size > 500) seenHeadlines.clear();
  return false;
}

function sanitizeHeadline(text: string): string {
  return text.replace(/<[^>]*>/g, '').replace(/[<>"'&]/g, c => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '&': '&amp;' }[c] || c));
}

/** Match tickers with word boundaries — avoids false hits like V, MA, BA in prose. */
export function findTickersInText(text: string): string[] {
  const upper = text.toUpperCase();
  const found: string[] = [];
  const fullUniverse = getFullUniverse();
  for (const t of fullUniverse) {
    const re = new RegExp(`(?:^|[^A-Z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[^A-Z0-9]|$)`);
    if (re.test(upper)) found.push(t);
  }
  return found;
}

async function fetchYahooNewsForSymbols(
  tickers: string[],
  region: 'US' | 'IN',
): Promise<{ headline: string; source: string; tickers: string[]; url?: string }[] | null> {
  try {
    const sampleTickers = tickers.map(t => tickerToYahoo(t)).join(',');
    const lang = region === 'IN' ? 'en-IN' : 'en-US';
    const url = `https://query1.finance.yahoo.com/v1/finance/news?symbols=${sampleTickers}&region=${region}&lang=${lang}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const rawItems: Record<string, unknown>[] | undefined =
      (Array.isArray(data?.main) ? data.main : undefined) ??
      (Array.isArray(data?.items) ? data.items : undefined) ??
      (Array.isArray(data?.data) ? data.data : undefined) ??
      (Array.isArray(data) ? data : undefined) ?? null;
    if (!rawItems) return null;
    return rawItems.slice(0, 30).map((item: Record<string, unknown>) => {
      const related = (Array.isArray(item.relatedTickers) ? item.relatedTickers : [])
        .map((t: unknown) => String(t).replace('.NS', ''));
      related.forEach(addDynamicTicker);
      return {
        headline: typeof item.title === 'string' ? item.title : typeof item.headline === 'string' ? item.headline : '',
        source: typeof item.publisher === 'string' ? item.publisher : 'Yahoo Finance',
        tickers: related.filter((t: string) => getFullUniverse().includes(t) || getDynamicIndianUniverse().includes(t)),
        url: typeof item.link === 'string' ? item.link : typeof item.url === 'string' ? item.url : undefined,
      };
    }).filter((item: { headline: string }) => item.headline.length > 10 && !isDuplicate(item.headline));
  } catch {
    return null;
  }
}

async function fetchYahooFinanceNews(): Promise<{ headline: string; source: string; tickers: string[]; url?: string }[] | null> {
  const india = await fetchYahooNewsForSymbols([...NIFTY_50_TICKERS.slice(0, 15), ...INDIAN_EQUITY_TICKERS.slice(0, 15)], 'IN');
  return india || null;
}

async function fetchRssNews(feedUrl: string, source: string, skipTitlePrefixes: string[]): Promise<{ headline: string; source: string; tickers: string[]; url?: string }[] | null> {
  try {
    const res = await fetch(feedUrl, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const text = await res.text();
    const items: { headline: string; source: string; tickers: string[]; url?: string }[] = [];
    const titleRegex = /<title[^>]*>([^<]+)<\/title>/gi;
    const linkRegex = /<link[^>]*>([^<]+)<\/link>/gi;
    const titles: string[] = [];
    const links: string[] = [];
    let m;
    while ((m = titleRegex.exec(text)) !== null) {
      const t = m[1].trim();
      if (!skipTitlePrefixes.some(p => t.startsWith(p))) titles.push(t);
    }
    while ((m = linkRegex.exec(text)) !== null) {
      const l = m[1].trim();
      if (l.startsWith('http')) links.push(l);
    }
    for (let i = 0; i < Math.min(titles.length, links.length, 20); i++) {
      if (isDuplicate(titles[i])) continue;
      items.push({
        headline: titles[i],
        source,
        tickers: findTickersInText(titles[i]),
        url: links[i],
      });
    }
    return items.length > 0 ? items : null;
  } catch {
    return null;
  }
}

function calculateRelevanceScore(headline: string, tickers: string[], source: string): number {
  let score = 50; // Base score
  
  // Source credibility (0-30 points)
  if (isEliteSource(source)) score += 30;
  else if (isIndianEliteSource(source)) score += 25;
  else if (source.includes('Reuters') || source.includes('Bloomberg')) score += 20;
  else if (source.includes('NSE') || source.includes('BSE')) score += 28;
  
  // Ticker specificity (0-20 points)
  if (tickers.length === 1) score += 20; // Highly specific
  else if (tickers.length === 2) score += 15;
  else if (tickers.length >= 3) score += 8; // Too generic
  
  // Headline quality (0-15 points)
  const upper = headline.toUpperCase();
  if (tickers.some(t => upper.includes(t))) score += 15; // Ticker mentioned
  if (headline.length > 50 && headline.length < 200) score += 10; // Good length
  if (headline.includes(':') || headline.includes('-')) score += 5; // Structured
  
  // Keyword analysis (0-10 points)
  const highImpactKeywords = ['acquisition', 'merger', 'result', 'profit', 'loss', 'order', 'contract', 'approval', 'launch'];
  const lowImpactKeywords = ['analyst', 'meet', 'call', 'presentation', 'conference'];
  
  const lower = headline.toLowerCase();
  if (highImpactKeywords.some(k => lower.includes(k))) score += 10;
  if (lowImpactKeywords.some(k => lower.includes(k))) score -= 5;
  
  return Math.min(100, Math.max(0, score));
}

function classifyAndFormat(rawItems: { headline: string; source: string; tickers: string[]; url?: string }[]): ClassifiedNewsItem[] {
  const classifiedNews = rawItems.map((item, idx) => {
    const sentiment = classifySentiment(item.headline);
    const region = detectNewsRegion(item.headline, item.tickers);
    const wordCount = item.headline.split(' ').length;
    
    // Calculate relevance score first
    const relevanceScore = calculateRelevanceScore(item.headline, item.tickers, item.source);
    
    // Skip low-relevance items (below 40)
    if (relevanceScore < 40) {
      return null; // Will be filtered out
    }
    
    // Base impact calculation
    const impactBase = sentiment === 'BULLISH' ? 55 : sentiment === 'BEARISH' ? 55 : 30;
    const tickerBonus = Math.min(25, item.tickers.length * 8);
    const lengthBonus = Math.min(10, wordCount * 1.5);
    const indiaBonus = region === 'INDIAN' ? 8 : 0;
    const eliteBonus = (isEliteSource(item.source) || isIndianEliteSource(item.source)) ? 10 : 0;
    const relevanceBonus = Math.floor((relevanceScore - 40) * 0.4); // 0-24 points from relevance
    
    const impactScore = Math.min(98, impactBase + tickerBonus + lengthBonus + indiaBonus + eliteBonus + relevanceBonus);
    const cleanHeadline = item.headline.replace(/[^a-zA-Z0-9]/g, '').slice(0, 50);
    const cleanSource = item.source.replace(/[^a-zA-Z0-9]/g, '');
    const id = `news-${cleanSource}-${cleanHeadline}-${Date.now()}-${idx}`;
    
    return {
      id,
      timestamp: Date.now(),
      source: item.source,
      region,
      headline: item.headline,
      summary: item.headline,
      sentiment,
      impactScore,
      tickers: item.tickers,
      url: item.url,
      isElite: isEliteSource(item.source) || isIndianEliteSource(item.source),
      relevanceScore, // Add relevance score for transparency
    };
  });
  return classifiedNews.filter((item): item is NonNullable<typeof item> => item !== null && item.headline.length > 10);
}

const RSS_FEEDS: { url: string; source: string; skip: string[] }[] = [
  ...INDIAN_MACRO_RSS_FEEDS,
];

/** Free elite intake: official RSS + Google News per @handle (no paid Twitter API). */
async function fetchEliteOfficialNews(): Promise<{ headline: string; source: string; tickers: string[]; url?: string }[]> {
  const batches = await Promise.all(
    ELITE_OFFICIAL_FEEDS.map(async entry => {
      const batch = await fetchRssNews(entry.url, entry.handle, entry.skipTitles);
      if (!batch) return [];
      return batch.slice(0, 8).map(item => ({
        ...item,
        source: entry.handle,
        tickers: [...new Set([...item.tickers, ...findTickersInText(item.headline)])],
      }));
    }),
  );
  return batches.flat();
}

export async function fetchClassifiedNews(): Promise<ClassifiedNewsItem[]> {
  const [yahooNews, eliteNews, nseNews, ...rssResults] = await Promise.all([
    fetchYahooFinanceNews(),
    fetchEliteOfficialNews(),
    fetchLiveNSEAnnouncements(),
    ...RSS_FEEDS.map(f => fetchRssNews(f.url, f.source, f.skip)),
  ]);
  const rawItems: { headline: string; source: string; tickers: string[]; url?: string }[] = [];
  if (yahooNews) {
    for (const item of yahooNews) rawItems.push({ ...item, headline: sanitizeHeadline(item.headline) });
  }
  if (nseNews) {
    for (const item of nseNews) rawItems.push({ ...item, headline: sanitizeHeadline(item.headline) });
  }
  for (const item of eliteNews) {
    rawItems.push({ ...item, headline: sanitizeHeadline(item.headline) });
  }
  for (const batch of rssResults) {
    if (!batch) continue;
    for (const item of batch) rawItems.push({ ...item, headline: sanitizeHeadline(item.headline) });
  }
  return classifyAndFormat(rawItems);
}
