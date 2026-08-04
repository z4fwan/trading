/**
 * Social Sentiment Engine — Reddit, StockTwits, Twitter/X
 * Fetches social media sentiment for stocks in real-time.
 * Free APIs only — no paid keys required.
 */

export interface SocialSentiment {
  ticker: string;
  source: string;
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  score: number; // -100 to 100
  volume: number; // mentions
  trending: boolean;
  timestamp: number;
  headlines: string[];
}

const sentimentCache = new Map<string, SocialSentiment>();
const SENTIMENT_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch Reddit sentiment for a ticker using public JSON API.
 * r/wallstreetbets, r/stocks, r/investing
 */
async function fetchRedditSentiment(ticker: string): Promise<SocialSentiment | null> {
  try {
    const subreddits = ['wallstreetbets', 'stocks', 'investing', 'options'];
    let totalScore = 0;
    let mentionCount = 0;
    const headlines: string[] = [];
    let bullishCount = 0;
    let bearishCount = 0;

    for (const sub of subreddits.slice(0, 2)) { // Limit to avoid rate limits
      try {
        const url = `https://www.reddit.com/r/${sub}/search.json?q=${ticker}&sort=new&limit=25&t=day`;
        const res = await fetch(url, {
          headers: { 'User-Agent': 'TradingDashboard/3.0' },
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) continue;
        const data = await res.json();
        const posts = data?.data?.children || [];

        for (const post of posts) {
          const p = post.data;
          if (!p || !p.title) continue;
          const title = p.title.toUpperCase();
          if (title.includes(ticker.toUpperCase()) || title.includes(ticker)) {
            mentionCount++;
            const lower = p.title.toLowerCase();
            // Simple keyword sentiment
            const bullishWords = ['moon', 'buy', 'bull', 'calls', 'long', 'rocket', 'to the moon', '🚀', 'hodl', 'undervalued', 'breakout', 'squeeze', 'yolo', 'diamond'];
            const bearishWords = ['sell', 'bear', 'puts', 'short', 'crash', 'dump', 'overvalued', 'baghold', 'rekt', 'dead', 'avoid', 'bubble', 'downgrade'];
            const bScore = bullishWords.filter(w => lower.includes(w)).length;
            const sScore = bearishWords.filter(w => lower.includes(w)).length;
            if (bScore > sScore) bullishCount++;
            else if (sScore > bScore) bearishCount++;
            totalScore += (bScore - sScore) * 10;
            if (headlines.length < 5) headlines.push(p.title.slice(0, 120));
          }
        }
      } catch { continue; }
    }

    if (mentionCount === 0) return null;

    const avgScore = Math.max(-100, Math.min(100, totalScore / Math.max(1, mentionCount)));
    const sentiment = bullishCount > bearishCount * 1.3 ? 'BULLISH'
      : bearishCount > bullishCount * 1.3 ? 'BEARISH' : 'NEUTRAL';
    const trending = mentionCount >= 5;

    return {
      ticker,
      source: 'Reddit',
      sentiment,
      score: Math.round(avgScore),
      volume: mentionCount,
      trending,
      timestamp: Date.now(),
      headlines,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch StockTwits sentiment for a ticker (free public API).
 */
async function fetchStockTwitsSentiment(ticker: string): Promise<SocialSentiment | null> {
  try {
    const url = `https://api.stocktwits.com/api/2/streams/symbol/${ticker}.json`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'TradingDashboard/3.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const messages = data?.data || [];
    if (messages.length === 0) return null;

    let bullishCount = 0;
    let bearishCount = 0;
    const headlines: string[] = [];

    for (const msg of messages.slice(0, 30)) {
      if (msg.entities?.sentiment?.basic === 'Bullish') bullishCount++;
      else if (msg.entities?.sentiment?.basic === 'Bearish') bearishCount++;
      if (headlines.length < 5 && msg.body) {
        headlines.push(msg.body.replace(/<[^>]*>/g, '').slice(0, 120));
      }
    }

    const total = bullishCount + bearishCount;
    if (total === 0) return null;

    const score = Math.round(((bullishCount - bearishCount) / total) * 100);
    const sentiment = bullishCount > bearishCount * 1.2 ? 'BULLISH'
      : bearishCount > bullishCount * 1.2 ? 'BEARISH' : 'NEUTRAL';

    return {
      ticker,
      source: 'StockTwits',
      sentiment,
      score,
      volume: messages.length,
      trending: messages.length >= 10,
      timestamp: Date.now(),
      headlines,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch Yahoo Finance trending/social data (free, no key).
 */
async function fetchYahooTrendingSentiment(ticker: string): Promise<SocialSentiment | null> {
  try {
    // Yahoo trending searches
    const url = `https://query2.finance.yahoo.com/v1/finance/trending/US?count=20`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const quotes = data?.finance?.result?.[0]?.quotes || [];
    const isTrending = quotes.some((q: { symbol: string }) => q.symbol === ticker);

    return {
      ticker,
      source: 'YahooTrending',
      sentiment: 'NEUTRAL',
      score: isTrending ? 30 : 0,
      volume: isTrending ? 1 : 0,
      trending: isTrending,
      timestamp: Date.now(),
      headlines: [],
    };
  } catch {
    return null;
  }
}

/**
 * Combined social sentiment for a ticker from all sources.
 */
export async function getSocialSentiment(ticker: string): Promise<SocialSentiment> {
  const cached = sentimentCache.get(ticker);
  if (cached && Date.now() - cached.timestamp < SENTIMENT_TTL) return cached;

  const [reddit, stocktwits, yahoo] = await Promise.all([
    fetchRedditSentiment(ticker),
    fetchStockTwitsSentiment(ticker),
    fetchYahooTrendingSentiment(ticker),
  ]);

  // Merge results — weighted average
  const sources = [reddit, stocktwits, yahoo].filter(Boolean) as SocialSentiment[];
  if (sources.length === 0) {
    const empty: SocialSentiment = {
      ticker, source: 'none', sentiment: 'NEUTRAL', score: 0,
      volume: 0, trending: false, timestamp: Date.now(), headlines: [],
    };
    sentimentCache.set(ticker, empty);
    return empty;
  }

  const totalVolume = sources.reduce((s, x) => s + x.volume, 0);
  const weightedScore = sources.reduce((s, x) => s + x.score * x.volume, 0) / Math.max(1, totalVolume);
  const allHeadlines = sources.flatMap(x => x.headlines).slice(0, 10);
  const trending = sources.some(x => x.trending);

  const sentiment = weightedScore > 20 ? 'BULLISH' : weightedScore < -20 ? 'BEARISH' : 'NEUTRAL';

  const merged: SocialSentiment = {
    ticker,
    source: sources.map(s => s.source).join('+'),
    sentiment,
    score: Math.round(weightedScore),
    volume: totalVolume,
    trending,
    timestamp: Date.now(),
    headlines: allHeadlines,
  };

  sentimentCache.set(ticker, merged);
  return merged;
}

/**
 * Batch fetch social sentiment for multiple tickers.
 * Rate-limited to avoid Reddit/StockTwits blocks.
 */
export async function batchSocialSentiment(
  tickers: string[],
  maxConcurrent = 3,
): Promise<Map<string, SocialSentiment>> {
  const results = new Map<string, SocialSentiment>();

  for (let i = 0; i < tickers.length; i += maxConcurrent) {
    const batch = tickers.slice(i, i + maxConcurrent);
    const batchResults = await Promise.allSettled(
      batch.map(t => getSocialSentiment(t))
    );
    batchResults.forEach((r, idx) => {
      if (r.status === 'fulfilled' && r.value) {
        results.set(batch[idx], r.value);
      }
    });
    if (i + maxConcurrent < tickers.length) {
      await new Promise(r => setTimeout(r, 1000)); // 1s delay between batches
    }
  }

  return results;
}

/**
 * Get trending tickers from social media.
 */
export async function getTrendingTickers(): Promise<string[]> {
  const trending = new Set<string>();

  // Reddit WSB trending
  try {
    const res = await fetch('https://www.reddit.com/r/wallstreetbets/hot.json?limit=25', {
      headers: { 'User-Agent': 'TradingDashboard/3.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = await res.json();
      const posts = data?.data?.children || [];
      for (const post of posts) {
        const title = (post.data?.title || '').toUpperCase();
        // Extract $TICKER patterns
        const matches = title.match(/\$([A-Z]{1,5})/g);
        if (matches) {
          for (const m of matches) {
            const ticker = m.replace('$', '');
            if (ticker.length >= 2 && ticker.length <= 5) trending.add(ticker);
          }
        }
      }
    }
  } catch { /* ignore */ }

  return [...trending].slice(0, 20);
}

/**
 * Get social sentiment cache stats.
 */
export function getSentimentCacheStats(): { cached: number; sources: string[] } {
  return {
    cached: sentimentCache.size,
    sources: ['Reddit', 'StockTwits', 'YahooTrending'],
  };
}
