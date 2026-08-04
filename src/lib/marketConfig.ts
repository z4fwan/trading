// === Single source of truth for all market tickers — Global Edition ===

import nifty500Symbols from './nifty500Tickers.json';
import {
  ALL_US_EQUITIES, ALL_INTERNATIONAL, ALL_CRYPTO, ALL_FOREX,
  GLOBAL_INDEX_SYMBOLS, GLOBAL_INDEX_NAMES,
  CRYPTO_TICKERS, FOREX_TICKERS,
  SP500_TICKERS, NASDAQ_POPULAR, INTERNATIONAL_EQUITY_TICKERS,
  SP_MIDCAP400, SP_SMALLCAP600, POPULAR_EXTRA,
} from './globalUniverse';

// ─── Nifty 50 benchmark (Indian) ─────────────────────────────────────────────
export const NIFTY_50_TICKERS = [
  'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'SBIN', 'BHARTIARTL', 'ITC',
  'KOTAKBANK', 'LT', 'WIPRO', 'AXISBANK', 'BAJFINANCE', 'MARUTI', 'TITAN', 'ASIANPAINT',
  'NTPC', 'POWERGRID', 'ONGC', 'ADANIENT', 'TATASTEEL', 'ETERNAL', 'IRFC', 'CDSL',
  'HCLTECH', 'SUNPHARMA', 'ULTRACEMCO', 'BAJAJFINSV', 'TRENT', 'ADANIPORTS',
  'COALINDIA', 'IOC', 'BPCL', 'EICHERMOT', 'HEROMOTOCO', 'GRASIM',
  'JSWSTEEL', 'HINDALCO', 'TATAMOTORS', 'M&M', 'TATACONSUM', 'HINDUNILVR',
  'NESTLEIND', 'BRITANNIA', 'DIVISLAB', 'DRREDDY', 'CIPLA', 'APOLLOHOSP', 'SHRIRAMFIN',
] as const;

/** Full Nifty 500 NSE equity universe (~92% of NSE market cap). */
export const NIFTY_500_TICKERS: string[] = nifty500Symbols as string[];

/** All Indian equities we track (Nifty 500 + any Nifty 50 names not in the CSV). */
export const INDIAN_EQUITY_TICKERS: string[] = [
  ...new Set([...NIFTY_50_TICKERS, ...NIFTY_500_TICKERS]),
];

/** @deprecated Use INDIAN_EQUITY_TICKERS — kept for backward compatibility. */
export const ALL_INDIAN_EQUITIES = [
  ...INDIAN_EQUITY_TICKERS
];

export const INDIAN_UNIVERSE_SIZE = INDIAN_EQUITY_TICKERS.length;
export const INDIAN_UNIVERSE_LABEL = `NSE/BSE · ${INDIAN_UNIVERSE_SIZE} Tickers`;

/** @deprecated Use INDIAN_EQUITY_TICKERS — kept for backward compatibility. */
export const NIFTY_TICKERS = INDIAN_EQUITY_TICKERS;

const INDIAN_SET = new Set(INDIAN_EQUITY_TICKERS);

// ─── Asset Classification ────────────────────────────────────────────────────────

export function isIndianTicker(ticker: string): boolean {
  return INDIAN_SET.has(ticker) || ticker.endsWith('.NS') || ticker.endsWith('.BO');
}

export function getAssetClass(ticker: string): 'INDIAN' | 'INDEX' {
  if (ticker.startsWith('^')) return 'INDEX';
  return 'INDIAN';
}

/** Returns a short market badge string for Telegram alerts (e.g. "🇮🇳 IN"). */
export function getMarketBadge(ticker: string): string {
  const assetClass = getAssetClass(ticker);
  const badges: Record<string, string> = {
    INDIAN: '🇮🇳 IN',
    INDEX: '📊 IDX'
  };
  return badges[assetClass] || '🇮🇳 IN';
}

/** Returns the market badge for a ticker using its asset class. */
export function getMarketBadgePlain(assetClass: 'INDIAN' | 'INDEX'): string {
  if (assetClass === 'INDIAN') return 'IN';
  return 'IDX';
}

// ─── Ticker Normalization ──────────────────────────────────────────────────────
const _yahooToTickerMap: Record<string, string> = {};

for (const t of INDIAN_EQUITY_TICKERS) {
  // If it already has .NS or .BO, leave it. Otherwise append .NS
  const yahoo = (t.endsWith('.NS') || t.endsWith('.BO')) ? t : `${t}.NS`;
  _yahooToTickerMap[yahoo] = t;
}

export function normalizeTicker(yahooTicker: string): string {
  return _yahooToTickerMap[yahooTicker] || yahooTicker.replace('.NS', '').replace('.BO', '');
}

export function tickerToYahoo(ticker: string): string {
  if (ticker.startsWith('^')) return ticker;
  if (ticker.endsWith('.NS') || ticker.endsWith('.BO')) return ticker;
  return `${ticker}.NS`;
}

// ─── Index Mappings ────────────────────────────────────────────────────────────
export const INDEX_TICKERS: Record<string, string> = {
  '^NSEI': 'NIFTY 50',
  '^NSEBANK': 'NIFTY BANK',
  '^BSESN': 'BSE SENSEX',
};
export const INDEX_TICKERS_ARRAY = Object.keys(INDEX_TICKERS);

// ─── Display Names ────────────────────────────────────────────────────────────
export const TICKER_NAMES: Record<string, string> = {
  // === Indian Nifty 50 ===
  RELIANCE: 'Reliance Industries Ltd',
  TCS: 'Tata Consultancy Services',
  HDFCBANK: 'HDFC Bank Ltd',
  INFY: 'Infosys Ltd',
  ICICIBANK: 'ICICI Bank Ltd',
  SBIN: 'State Bank of India',
  BHARTIARTL: 'Bharti Airtel Ltd',
  ITC: 'ITC Ltd',
  KOTAKBANK: 'Kotak Mahindra Bank',
  LT: 'Larsen & Toubro Ltd',
  WIPRO: 'Wipro Ltd',
  AXISBANK: 'Axis Bank Ltd',
  BAJFINANCE: 'Bajaj Finance Ltd',
  MARUTI: 'Maruti Suzuki India Ltd',
  TITAN: 'Titan Company Ltd',
  ASIANPAINT: 'Asian Paints Ltd',
  NTPC: 'NTPC Ltd',
  POWERGRID: 'Power Grid Corporation',
  ONGC: 'Oil & Natural Gas Corp',
  ADANIENT: 'Adani Enterprises Ltd',
  TATASTEEL: 'Tata Steel Ltd',
  ETERNAL: 'Eternal Ltd (Zomato)',
  IRFC: 'Indian Railway Finance Corp',
  CDSL: 'Central Depository Services',
  HCLTECH: 'HCL Technologies Ltd',
  SUNPHARMA: 'Sun Pharmaceutical Industries',
  ULTRACEMCO: 'UltraTech Cement Ltd',
  BAJAJFINSV: 'Bajaj Finserv Ltd',
  TRENT: 'Trent Ltd',
  ADANIPORTS: 'Adani Ports & SEZ',
  COALINDIA: 'Coal India Ltd',
  IOC: 'Indian Oil Corporation',
  BPCL: 'Bharat Petroleum Corp',
  EICHERMOT: 'Eicher Motors Ltd',
  HEROMOTOCO: 'Hero MotoCorp Ltd',
  GRASIM: 'Grasim Industries Ltd',
  JSWSTEEL: 'JSW Steel Ltd',
  HINDALCO: 'Hindalco Industries Ltd',
  TATAMOTORS: 'Tata Motors Ltd',
  'M&M': 'Mahindra & Mahindra Ltd',
  TATACONSUM: 'Tata Consumer Products',
  HINDUNILVR: 'Hindustan Unilever Ltd',
  NESTLEIND: 'Nestlé India Ltd',
  BRITANNIA: 'Britannia Industries Ltd',
  DIVISLAB: "Divi's Laboratories Ltd",
  DRREDDY: "Dr. Reddy's Laboratories",
  CIPLA: 'Cipla Ltd',
  APOLLOHOSP: 'Apollo Hospitals Enterprise',
  SHRIRAMFIN: 'Shriram Finance Ltd',
  ...INDEX_TICKERS,
};

export function getTickerName(ticker: string): string {
  return TICKER_NAMES[ticker] || ticker;
}
