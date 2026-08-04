import type { PeerRow } from './types';
import type { RawFundamentals } from './fundamentalFetcher';
import YahooFinance from 'yahoo-finance2';
import { tickerToYahoo } from '@/lib/marketConfig';

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  Accept: 'application/json,text/plain,*/*',
};

let _yf: InstanceType<typeof YahooFinance> | null = null;
function yf() {
  if (!_yf) {
    _yf = new YahooFinance({ suppressNotices: ['yahooSurvey'], validation: { logErrors: false } });
    
  }
  return _yf;
}

/** Sector peer map when Screener compare is unavailable */
const SECTOR_PEERS: Record<string, string[]> = {
  'Financial Services': ['HDFCBANK', 'ICICIBANK', 'KOTAKBANK', 'AXISBANK', 'SBIN'],
  'Technology': ['TCS', 'INFY', 'WIPRO', 'HCLTECH', 'TECHM'],
  'Energy': ['RELIANCE', 'ONGC', 'BPCL', 'IOC', 'GAIL'],
  'Consumer Cyclical': ['TITAN', 'TATAMOTORS', 'MARUTI', 'M&M', 'EICHERMOT'],
  'Healthcare': ['SUNPHARMA', 'DRREDDY', 'CIPLA', 'DIVISLAB', 'APOLLOHOSP'],
  'Industrials': ['LT', 'SIEMENS', 'ABB', 'BEL', 'HAL'],
  'Consumer Defensive': ['HINDUNILVR', 'ITC', 'NESTLEIND', 'BRITANNIA', 'DABUR'],
  'Basic Materials': ['TATASTEEL', 'HINDALCO', 'JSWSTEEL', 'VEDL', 'COALINDIA'],
  'Utilities': ['NTPC', 'POWERGRID', 'ADANIGREEN', 'TATAPOWER', 'TORNTPOWER'],
  'Real Estate': ['DLF', 'GODREJPROP', 'OBEROIRLTY', 'PHOENIXLTD', 'PRESTIGE'],
  'Telecommunication': ['BHARTIARTL', 'IDEA', 'INDUSTOWER', 'TATACOMM', 'MTNL'],
  'Metals & Mining': ['TATASTEEL', 'HINDALCO', 'JSWSTEEL', 'NATIONALUM', 'HINDZINC'],
  'Pharmaceutical': ['SUNPHARMA', 'DRREDDY', 'CIPLA', 'DIVISLAB', 'LUPIN'],
  'IT': ['TCS', 'INFY', 'WIPRO', 'HCLTECH', 'TECHM'],
  'FMCG': ['HINDUNILVR', 'ITC', 'NESTLEIND', 'BRITANNIA', 'DABUR'],
  'Automobile': ['TATAMOTORS', 'MARUTI', 'M&M', 'EICHERMOT', 'BAJAJ-AUTO'],
  'Banking': ['HDFCBANK', 'ICICIBANK', 'KOTAKBANK', 'AXISBANK', 'SBIN'],
  'Oil & Gas': ['RELIANCE', 'ONGC', 'BPCL', 'IOC', 'GAIL'],
};

export async function fetchPeerRows(raw: RawFundamentals): Promise<PeerRow[]> {
  const fromScreener = await fetchScreenerPeers(raw.ticker);
  if (fromScreener.length >= 2) return fromScreener;

  const pool = SECTOR_PEERS[raw.sector] || SECTOR_PEERS[raw.industry] || SECTOR_PEERS['Financial Services'];
  const tickers = pool.filter(t => t !== raw.ticker).slice(0, 5);

  // Fetch live prices for fallback peers
  try {
    const yahooSyms = tickers.map(t => tickerToYahoo(t));
    const quotes = await yf().quote(yahooSyms, {}, { fetchOptions: { signal: AbortSignal.timeout(10000) } });
    const arr = Array.isArray(quotes) ? quotes : [quotes];
    const priceMap = new Map<string, { price: number; pe: number | null }>();
    for (const q of arr) {
      const rawSym = (q.symbol || '').replace('.NS', '');
      priceMap.set(rawSym, {
        price: (q.regularMarketPrice as number) || 0,
        pe: (q.trailingPE as number) || null,
      });
    }
    return tickers.map(t => {
      const p = priceMap.get(t);
      return {
        ticker: t,
        name: t,
        isSubject: false,
        pe: p?.pe ?? null,
        pb: null,
        roe: null,
        revGrowth: null,
        marketCapCr: p?.price ? p.price * 1 : null,
        de: null,
        edge: 'Sector peer',
      };
    });
  } catch {
    return tickers.map(t => ({
      ticker: t,
      name: t,
      isSubject: false,
      pe: null, pb: null, roe: null, revGrowth: null, marketCapCr: null, de: null,
      edge: 'Compare on Screener.in',
    }));
  }
}

async function fetchScreenerPeers(ticker: string): Promise<PeerRow[]> {
  try {
    const searchRes = await fetch(
      `https://www.screener.in/api/company/search/?q=${encodeURIComponent(ticker)}&limit=4`,
      { headers: BROWSER_HEADERS, cache: 'no-store', signal: AbortSignal.timeout(10000) },
    );
    if (!searchRes.ok) return [];
    const searchData = await searchRes.json() as { id?: number; url?: string }[];
    const match = Array.isArray(searchData) ? searchData[0] : null;
    if (!match?.id) return [];

    const coRes = await fetch(
      `https://www.screener.in/api/company/${match.id}/`,
      { headers: BROWSER_HEADERS, cache: 'no-store', signal: AbortSignal.timeout(10000) },
    );
    if (!coRes.ok) return [];

    const data = await coRes.json() as { peers?: { name?: string; url?: string }[] };
    const peers = Array.isArray(data.peers) ? data.peers : [];
    const rows: PeerRow[] = [];

    for (const p of peers.slice(0, 5)) {
      const url = String(p.url || '');
      const sym = url.match(/\/company\/([^/]+)\//)?.[1]?.toUpperCase();
      if (!sym || sym === ticker) continue;
      rows.push({
        ticker: sym,
        name: String(p.name || sym),
        isSubject: false,
        pe: null,
        pb: null,
        roe: null,
        revGrowth: null,
        marketCapCr: null,
        de: null,
        edge: 'Compare on Screener.in',
      });
    }
    return rows;
  } catch {
    return [];
  }
}
