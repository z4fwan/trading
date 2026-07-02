/**
 * Free elite “Twitter-equivalent” intake — no paid X/Twitter API.
 *
 * Paid / gated options we do NOT use: X API, RSS.app paid, OpenRSS whitelist, xcancel whitelist.
 *
 * Instead, each @handle in ELITE_TWITTER_HANDLES is mapped to:
 * - Official .gov / institution RSS where available
 * - Google News RSS scoped to that org’s domain (free, no key)
 *
 * Items are tagged with the handle as `source` (e.g. `@FederalReserve`) so macro / elite rules apply.
 */

import { ELITE_TWITTER_HANDLES, INDIAN_ELITE_HANDLES } from './eliteSources';
import { googleNewsIndiaRss } from './indianMacro';

export type EliteFeedEntry = {
  handle: string;
  url: string;
  skipTitles: string[];
};

const GN = (q: string) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;

/** Direct RSS + Google News proxies per elite handle. */
export const ELITE_OFFICIAL_FEEDS: EliteFeedEntry[] = [
  // India tier-1 macro authorities (Google News + official domains)
  { handle: '@RBI', url: googleNewsIndiaRss('site:rbi.org.in when:3d'), skipTitles: ['Google News'] },
  { handle: '@SEBI_India', url: googleNewsIndiaRss('site:sebi.gov.in when:3d'), skipTitles: ['Google News'] },
  { handle: '@PIB_India', url: googleNewsIndiaRss('site:pib.gov.in economy OR stock market when:3d'), skipTitles: ['Google News'] },
];

/** Indian macro desk feeds (not @handles — tagged as source name for elite rules). */
export const INDIAN_MACRO_RSS_FEEDS: { url: string; source: string; skip: string[] }[] = [
  // Real-time NSE/BSE corporate announcements are now fetched directly via native API scraper
  // Trendlyne Google News feed removed to prevent delayed corporate announcements polluting the live API feed
  { url: googleNewsIndiaRss('RBI OR SEBI OR Nifty OR Sensex OR FII OR rupee when:4h'), source: 'Google News India', skip: ['Google News'] },
  { url: 'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms', source: 'Economic Times', skip: ['Economic Times'] },
  { url: 'https://www.moneycontrol.com/rss/MCtopnews.xml', source: 'Moneycontrol', skip: ['Moneycontrol'] },
];

/** Handles covered by ELITE_OFFICIAL_FEEDS (for docs / health). */
export function eliteHandlesCovered(): string[] {
  return [...new Set(ELITE_OFFICIAL_FEEDS.map(f => f.handle))];
}

export function eliteHandlesMissing(): string[] {
  const covered = new Set(eliteHandlesCovered());
  return [...ELITE_TWITTER_HANDLES, ...INDIAN_ELITE_HANDLES].filter(h => !covered.has(h));
}
