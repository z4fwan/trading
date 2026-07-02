import type { PeerRow } from './types';
import type { RawFundamentals } from './fundamentalFetcher';

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  Accept: 'application/json,text/plain,*/*',
};

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
};

export async function fetchPeerRows(raw: RawFundamentals): Promise<PeerRow[]> {
  const fromScreener = await fetchScreenerPeers(raw.ticker);
  if (fromScreener.length >= 2) return fromScreener;

  const pool = SECTOR_PEERS[raw.sector] || SECTOR_PEERS['Financial Services'];
  const peers = pool.filter(t => t !== raw.ticker).slice(0, 4);
  return peers.map(t => ({
    ticker: t,
    name: t,
    isSubject: false,
    pe: null,
    pb: null,
    roe: null,
    revGrowth: null,
    marketCapCr: null,
    de: null,
    edge: 'Compare on Screener.in',
  }));
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
