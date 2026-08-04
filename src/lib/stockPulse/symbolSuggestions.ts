import {
  INDEX_TICKERS_ARRAY,
  INDIAN_EQUITY_TICKERS,
  getTickerName,
  isIndianTicker,
} from '@/lib/marketConfig';
import { getFullUniverse } from '@/lib/dynamicUniverse';

export type SymbolMarket = 'NSE' | 'US' | 'INDEX';

export interface SymbolSuggestion {
  ticker: string;
  label: string;
  market: SymbolMarket;
}

/** Common names → NSE ticker (search aliases). */
const NAME_ALIASES: Record<string, string> = {
  ZOMATO: 'ETERNAL',
  INFOSYS: 'INFY',
  TCS: 'TCS',
  'COAL INDIA': 'COALINDIA',
  COALINDIA: 'COALINDIA',
  HDFC: 'HDFCBANK',
  HDFCBANK: 'HDFCBANK',
  SBI: 'SBIN',
  ICICI: 'ICICIBANK',
  WIPRO: 'WIPRO',
  RELIANCE: 'RELIANCE',
  TATA: 'TATASTEEL',
  'TATA STEEL': 'TATASTEEL',
  MARUTI: 'MARUTI',
  ITC: 'ITC',
  BHARTI: 'BHARTIARTL',
  AIRTEL: 'BHARTIARTL',
  HUL: 'HINDUNILVR',
  NESTLE: 'NESTLEIND',
  APPLE: 'AAPL',
  MICROSOFT: 'MSFT',
  GOOGLE: 'GOOGL',
  ALPHABET: 'GOOGL',
  AMAZON: 'AMZN',
  NVIDIA: 'NVDA',
  TESLA: 'TSLA',
  META: 'META',
  FACEBOOK: 'META',
};

interface SearchEntry extends SymbolSuggestion {
  tokens: string;
}

let _entries: SearchEntry[] | null = null;

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function buildEntries(): SearchEntry[] {
  const list: SearchEntry[] = [];
  const seen = new Set<string>();

  const add = (ticker: string, label: string, market: SymbolMarket, extra = '') => {
    if (seen.has(ticker)) return;
    seen.add(ticker);
    list.push({
      ticker,
      label,
      market,
      tokens: norm(`${ticker} ${label} ${extra}`),
    });
  };

  const fullUniverse = getFullUniverse();
  for (const t of fullUniverse) {
    const market: SymbolMarket = isIndianTicker(t) ? 'NSE' : 'US';
    add(t, getTickerName(t), market);
  }
  for (const [alias, ticker] of Object.entries(NAME_ALIASES)) {
    const base = list.find(e => e.ticker === ticker);
    if (base) base.tokens += ' ' + norm(alias);
  }

  return list;
}

function entries(): SearchEntry[] {
  if (!_entries) _entries = buildEntries();
  return _entries;
}

const POPULAR_TICKERS = [
  'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'SBIN', 'ITC', 'BHARTIARTL',
  'MARUTI', 'COALINDIA', 'ETERNAL', 'WIPRO', 'AAPL', 'MSFT', 'NVDA', 'GOOGL',
];

export function getPopularSuggestions(): SymbolSuggestion[] {
  const map = new Map(entries().map(e => [e.ticker, e]));
  return POPULAR_TICKERS.map(t => map.get(t)).filter(Boolean) as SymbolSuggestion[];
}

function scoreEntry(e: SearchEntry, qNorm: string, qUpper: string): number {
  if (!qNorm) return 0;
  if (e.ticker === qUpper) return 1000;
  if (e.ticker.startsWith(qUpper)) return 900 - (e.ticker.length - qUpper.length);
  if (norm(e.label).startsWith(qNorm)) return 800;
  if (e.tokens.includes(qNorm)) return 700 - e.ticker.length * 0.01;
  const words = qNorm.match(/.{2,}/g) || [];
  if (words.some(w => e.tokens.includes(w))) return 500;
  return 0;
}

export function searchSymbolSuggestions(query: string, limit = 14): SymbolSuggestion[] {
  const q = query.trim();
  if (!q) return getPopularSuggestions().slice(0, limit);

  const qNorm = norm(q);
  const qUpper = q.toUpperCase().replace(/\.NS$|\.BO$/i, '');

  const ranked = entries()
    .map(e => ({ e, s: scoreEntry(e, qNorm, qUpper) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s || a.e.ticker.localeCompare(b.e.ticker));

  const out: SymbolSuggestion[] = [];
  for (const { e } of ranked) {
    if (out.length >= limit) break;
    out.push({ ticker: e.ticker, label: e.label, market: e.market });
  }

  if (out.length === 0 && qUpper.length >= 2 && /^[A-Z0-9.&-]+$/.test(qUpper)) {
    out.push({
      ticker: qUpper,
      label: `Use ticker "${qUpper}"`,
      market: 'NSE',
    });
  }

  return out;
}

export interface HorizonOption {
  label: string;
  years: number;
}

export const HORIZON_OPTIONS: HorizonOption[] = [
  { label: '3 years', years: 3 },
  { label: '5 years', years: 5 },
  { label: '7 years', years: 7 },
  { label: '10 years', years: 10 },
  { label: '12 years', years: 12 },
  { label: '15 years', years: 15 },
];

export function searchHorizonSuggestions(query: string): HorizonOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return HORIZON_OPTIONS;

  const digits = query.replace(/\D/g, '');
  const filtered = HORIZON_OPTIONS.filter(
    o =>
      o.label.includes(q) ||
      String(o.years) === digits ||
      o.label.startsWith(digits),
  );

  if (filtered.length > 0) return filtered;

  const n = parseInt(digits, 10);
  if (n >= 1 && n <= 20) {
    return [{ label: `${n} years`, years: n }];
  }

  return HORIZON_OPTIONS;
}

export function parseHorizonYears(input: string): number {
  const n = parseInt(input.replace(/\D/g, ''), 10);
  if (!Number.isFinite(n) || n < 1) return 5;
  return Math.min(15, Math.max(3, n));
}
