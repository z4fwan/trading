/**
 * CoinGecko API Integration — Real-time crypto market data, trending coins, on-chain events.
 * Free tier: 10-30 calls/min, no API key required.
 */

interface CoinData {
  id: string;
  symbol: string;
  name: string;
  price: number;
  priceChange24h: number;
  priceChangePercent24h: number;
  marketCap: number;
  volume24h: number;
  rank: number;
  sparkline?: number[];
}

interface TrendingCoin {
  id: string;
  symbol: string;
  name: string;
  rank: number;
  priceBtc: number;
  score: number;
}

interface GlobalCryptoData {
  totalMarketCap: number;
  totalVolume24h: number;
  btcDominance: number;
  ethDominance: number;
  activeCryptos: number;
  marketCapChange24h: number;
}

const coinsCache = { data: [] as CoinData[], fetchedAt: 0 };
const trendingCache = { data: [] as TrendingCoin[], fetchedAt: 0 };
const globalCache = { data: null as GlobalCryptoData | null, fetchedAt: 0 };
const CACHE_TTL = 5 * 60 * 1000; // 5 min

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
const HEADERS = { 'User-Agent': 'TradingDashboard/3.0', Accept: 'application/json' };

/**
 * Fetch top N cryptocurrencies by market cap.
 */
export async function fetchTopCryptos(limit = 100): Promise<CoinData[]> {
  const now = Date.now();
  if (coinsCache.data.length > 0 && now - coinsCache.fetchedAt < CACHE_TTL) {
    return coinsCache.data.slice(0, limit);
  }

  try {
    const url = `${COINGECKO_BASE}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${limit}&page=1&sparkline=true&price_change_percentage=24h`;
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(12000) });
    if (!res.ok) return coinsCache.data.slice(0, limit);

    const data = await res.json();
    const coins: CoinData[] = data.map((c: any) => ({
      id: c.id,
      symbol: c.symbol?.toUpperCase(),
      name: c.name,
      price: c.current_price || 0,
      priceChange24h: c.price_change_24h || 0,
      priceChangePercent24h: c.price_change_percentage_24h || 0,
      marketCap: c.market_cap || 0,
      volume24h: c.total_volume || 0,
      rank: c.market_cap_rank || 999,
      sparkline: c.sparkline_in_7d?.price || [],
    }));

    coinsCache.data = coins;
    coinsCache.fetchedAt = now;
    return coins;
  } catch {
    return coinsCache.data.slice(0, limit);
  }
}

/**
 * Fetch trending coins from CoinGecko (coins gaining social traction).
 */
export async function fetchTrendingCryptos(): Promise<TrendingCoin[]> {
  const now = Date.now();
  if (trendingCache.data.length > 0 && now - trendingCache.fetchedAt < CACHE_TTL) {
    return trendingCache.data;
  }

  try {
    const url = `${COINGECKO_BASE}/search/trending`;
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return trendingCache.data;

    const data = await res.json();
    const coins: TrendingCoin[] = (data?.coins || []).map((c: any) => ({
      id: c.item?.id || '',
      symbol: c.item?.symbol || '',
      name: c.item?.name || '',
      rank: c.item?.market_cap_rank || 999,
      priceBtc: c.item?.price_btc || 0,
      score: c.item?.score || 0,
    }));

    trendingCache.data = coins;
    trendingCache.fetchedAt = now;
    return coins;
  } catch {
    return trendingCache.data;
  }
}

/**
 * Fetch global crypto market data (total market cap, BTC dominance, etc.).
 */
export async function fetchGlobalCryptoData(): Promise<GlobalCryptoData | null> {
  const now = Date.now();
  if (globalCache.data && now - globalCache.fetchedAt < CACHE_TTL) {
    return globalCache.data;
  }

  try {
    const url = `${COINGECKO_BASE}/global`;
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return globalCache.data;

    const data = await res.json();
    const g = data?.data;
    if (!g) return null;

    const result: GlobalCryptoData = {
      totalMarketCap: g.total_market_cap?.usd || 0,
      totalVolume24h: g.total_volume?.usd || 0,
      btcDominance: g.market_cap_percentage?.btc || 0,
      ethDominance: g.market_cap_percentage?.eth || 0,
      activeCryptos: g.active_cryptocurrencies || 0,
      marketCapChange24h: g.market_cap_change_percentage_24h_usd || 0,
    };

    globalCache.data = result;
    globalCache.fetchedAt = now;
    return result;
  } catch {
    return globalCache.data;
  }
}

/**
 * Fetch specific coin data (for detailed analysis).
 */
export async function fetchCoinDetails(coinId: string): Promise<CoinData | null> {
  try {
    const url = `${COINGECKO_BASE}/coins/${coinId}?localization=false&tickers=false&community_data=false&developer_data=false`;
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;

    const c = await res.json();
    return {
      id: c.id,
      symbol: c.symbol?.toUpperCase(),
      name: c.name,
      price: c.market_data?.current_price?.usd || 0,
      priceChange24h: c.market_data?.price_change_24h || 0,
      priceChangePercent24h: c.market_data?.price_change_percentage_24h || 0,
      marketCap: c.market_data?.market_cap?.usd || 0,
      volume24h: c.market_data?.total_volume?.usd || 0,
      rank: c.market_cap_rank || 999,
    };
  } catch {
    return null;
  }
}

/**
 * Map Yahoo Finance crypto ticker to CoinGecko ID.
 */
export function yahooToCoinGeckoId(yahooTicker: string): string {
  const map: Record<string, string> = {
    'BTC-USD': 'bitcoin', 'ETH-USD': 'ethereum', 'BNB-USD': 'binancecoin',
    'XRP-USD': 'ripple', 'SOL-USD': 'solana', 'ADA-USD': 'cardano',
    'DOGE-USD': 'dogecoin', 'DOT-USD': 'polkadot', 'AVAX-USD': 'avalanche-2',
    'SHIB-USD': 'shiba-inu', 'LTC-USD': 'litecoin', 'MATIC-USD': 'matic-network',
    'UNI-USD': 'uniswap', 'LINK-USD': 'chainlink', 'ATOM-USD': 'cosmos',
    'FIL-USD': 'filecoin', 'ALGO-USD': 'algorand', 'XLM-USD': 'stellar',
    'NEAR-USD': 'near', 'APT-USD': 'aptos', 'ARB-USD': 'arbitrum',
    'OP-USD': 'optimism', 'SUI-USD': 'sui', 'SEI-USD': 'sei-network',
    'TIA-USD': 'celestia', 'JUP-USD': 'jupiter-exchange-solana',
    'WIF-USD': 'dogwifcoin', 'PEPE-USD': 'pepe', 'FET-USD': 'fetch-ai',
    'RENDER-USD': 'render-token', 'INJ-USD': 'injective-protocol',
    'FANTOM-USD': 'fantom', 'AAVE-USD': 'aave', 'MKR-USD': 'maker',
    'CRV-USD': 'curve-dao-token', 'GRT-USD': 'the-graph',
    'CRO-USD': 'crypto-com-chain', 'SAND-USD': 'the-sandbox',
    'MANA-USD': 'decentraland', 'AXS-USD': 'axie-infinity',
  };
  return map[yahooTicker] || yahooTicker.replace('-USD', '').toLowerCase();
}

export function getCoinGeckoCacheStats(): { coins: number; trending: number; global: boolean } {
  return {
    coins: coinsCache.data.length,
    trending: trendingCache.data.length,
    global: globalCache.data !== null,
  };
}
