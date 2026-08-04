// Indian market macro detection — NSE / RBI / SEBI / rupee / FII context

import { isIndianTicker, getAssetClass } from './marketConfig';

export const INDIAN_NEWS_KEYWORDS = [
  'nifty', 'sensex', 'bank nifty', 'nse ', 'bse ', 'nse india', 'bse india',
  'rbi ', 'reserve bank of india', 'sebi', 'mpc meeting', 'repo rate', 'reverse repo',
  'rupee', 'inr ', 'fii', 'dii', 'mumbai', 'dalal street',
  'india stock', 'indian market', 'indian equity', 'indian shares',
  'union budget', 'finance minister india', 'gst council',
  'adani', 'hindenburg', 'fpi', 'foreign portfolio',
  'circuit breaker', 'upper circuit', 'lower circuit',
  'lic ', 'sbi ', 'hdfc bank', 'reliance industries',
];

export function headlineSuggestsIndia(headline: string, summary?: string): boolean {
  const text = `${headline} ${summary || ''}`.toLowerCase();
  return INDIAN_NEWS_KEYWORDS.some(k => text.includes(k));
}

export function detectNewsRegion(
  headline: string,
  tickers: string[],
  summary?: string,
): 'INDIAN' | 'US' | 'CRYPTO' | 'FOREX' | 'FOREIGN' | 'INTERNATIONAL' {
  if (tickers.some(t => isIndianTicker(t))) return 'INDIAN';
  if (headlineSuggestsIndia(headline, summary)) return 'INDIAN';
  for (const t of tickers) {
    const cls = getAssetClass(t);
    if (cls !== 'INDEX' && cls !== 'INDIAN') return cls;
  }
  return 'INTERNATIONAL';
}

/** Google News RSS tuned for India macro desk. */
export function googleNewsIndiaRss(query: string): string {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;
}
