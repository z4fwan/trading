// === Single source of truth for all market tickers ===

import nifty500Symbols from './nifty500Tickers.json';

/** Nifty 50 benchmark names (priority quotes + history + dashboard index card). */
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
export const NIFTY_TICKERS = INDIAN_EQUITY_TICKERS;

const INDIAN_TICKER_SET = new Set(INDIAN_EQUITY_TICKERS);

export function isIndianTicker(ticker: string): boolean {
  return INDIAN_TICKER_SET.has(ticker);
}

export const INDIAN_UNIVERSE_SIZE = INDIAN_EQUITY_TICKERS.length;
export const INDIAN_UNIVERSE_LABEL = `Nifty 500 (NSE) · ${INDIAN_UNIVERSE_SIZE} stocks`;

// International/US stocks
export const INTERNATIONAL_TICKERS = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'JPM', 'V', 'JNJ',
  'WMT', 'PG', 'MA', 'UNH', 'HD', 'AMD', 'PLTR', 'AVGO', 'ORCL', 'CRM',
  'NFLX', 'ADBE', 'INTC', 'IBM', 'CSCO', 'QCOM', 'TXN', 'AMAT', 'MU', 'DIS',
  'NKE', 'COST', 'ABNB', 'UBER', 'NOW', 'PYPL', 'SAP', 'ADP', 'LMT', 'BA',
  'XOM', 'CVX', 'KO', 'PEP', 'MCD', 'GS', 'MS', 'BLK', 'SCHW', 'AXP',
];

// Index symbols (NSE + BSE + US + Macro)
export const INDEX_SYMBOLS = ['^NSEI', '^NSEBANK', '^BSESN', '^GSPC', '^IXIC', 'GC=F', 'CL=F', '^INDIAVIX', 'INR=X'];
export const INDEX_NAMES: Record<string, string> = {
  '^NSEI': 'NIFTY 50',
  '^NSEBANK': 'NIFTY BANK',
  '^BSESN': 'SENSEX',
  '^GSPC': 'S&P 500',
  '^IXIC': 'NASDAQ',
  'GC=F': 'GOLD',
  'CL=F': 'CRUDE OIL',
  '^INDIAVIX': 'INDIA VIX',
  'INR=X': 'USD/INR',
};

// Yahoo Finance symbol mapping (Indian stocks get .NS suffix on NSE)
export function tickerToYahoo(ticker: string): string {
  if (INTERNATIONAL_TICKERS.includes(ticker)) return ticker;
  return `${ticker}.NS`;
}

const _yahooToTickerMap: Record<string, string> = {};
for (const t of INDIAN_EQUITY_TICKERS) _yahooToTickerMap[`${t}.NS`] = t;
for (const t of INTERNATIONAL_TICKERS) _yahooToTickerMap[t] = t;

export function yahooToTicker(yahooSym: string): string {
  return _yahooToTickerMap[yahooSym] || yahooSym.replace('.NS', '');
}

// All tickers combined (Indian Nifty 500 universe + US watchlist)
export const ALL_TICKERS = [...INDIAN_EQUITY_TICKERS, ...INTERNATIONAL_TICKERS];

// Names for display (Nifty 50 + common names; others fall back to symbol)
export const TICKER_NAMES: Record<string, string> = {
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
  DIVISLAB: 'Divi\'s Laboratories Ltd',
  DRREDDY: 'Dr. Reddy\'s Laboratories',
  CIPLA: 'Cipla Ltd',
  APOLLOHOSP: 'Apollo Hospitals Enterprise',
  SHRIRAMFIN: 'Shriram Finance Ltd',
  AAPL: 'Apple Inc',
  MSFT: 'Microsoft Corporation',
  GOOGL: 'Alphabet Inc',
  AMZN: 'Amazon.com Inc',
  NVDA: 'NVIDIA Corporation',
  META: 'Meta Platforms Inc',
  TSLA: 'Tesla Inc',
  JPM: 'JPMorgan Chase & Co',
  V: 'Visa Inc',
  JNJ: 'Johnson & Johnson',
  WMT: 'Walmart Inc',
  PG: 'Procter & Gamble Co',
  MA: 'Mastercard Inc',
  UNH: 'UnitedHealth Group Inc',
  HD: 'The Home Depot Inc',
  AMD: 'Advanced Micro Devices',
  PLTR: 'Palantir Technologies Inc',
  AVGO: 'Broadcom Inc',
  ORCL: 'Oracle Corporation',
  CRM: 'Salesforce Inc',
  NFLX: 'Netflix Inc',
  ADBE: 'Adobe Inc',
  INTC: 'Intel Corporation',
  IBM: 'International Business Machines',
  CSCO: 'Cisco Systems Inc',
  QCOM: 'Qualcomm Inc',
  TXN: 'Texas Instruments Inc',
  AMAT: 'Applied Materials Inc',
  MU: 'Micron Technology Inc',
  DIS: 'The Walt Disney Company',
  NKE: 'Nike Inc',
  COST: 'Costco Wholesale Corp',
  ABNB: 'Airbnb Inc',
  UBER: 'Uber Technologies Inc',
  NOW: 'ServiceNow Inc',
  PYPL: 'PayPal Holdings Inc',
  SAP: 'SAP SE',
  ADP: 'Automatic Data Processing',
  LMT: 'Lockheed Martin Corp',
  BA: 'The Boeing Company',
  XOM: 'Exxon Mobil Corporation',
  CVX: 'Chevron Corporation',
  KO: 'The Coca-Cola Company',
  PEP: 'PepsiCo Inc',
  MCD: 'McDonald\'s Corporation',
  GS: 'Goldman Sachs Group Inc',
  MS: 'Morgan Stanley',
  BLK: 'BlackRock Inc',
  SCHW: 'Charles Schwab Corp',
  AXP: 'American Express Company',
};

export function getTickerName(ticker: string): string {
  return TICKER_NAMES[ticker] || ticker;
}
