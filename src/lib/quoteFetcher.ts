import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');

import YahooFinance from 'yahoo-finance2';
import { INDIAN_EQUITY_TICKERS, tickerToYahoo, INDEX_TICKERS_ARRAY } from '@/lib/marketConfig';
import { getMarketSummary, isSymbolFrozen, exchangeStatusForSymbol, type MarketSummary } from '@/lib/exchangeHours';
import { isRenderBandwidthSaver } from '@/lib/renderBandwidth';
import { getDynamicTickersOnly } from '@/lib/dynamicUniverse';

const INDIAN_SYMBOLS = INDIAN_EQUITY_TICKERS.map(t => tickerToYahoo(t));

/** Returns all dynamic symbols not in hardcoded sets */
function getDynamicSymbols() {
  return getDynamicTickersOnly().map(t => tickerToYahoo(t));
}

/**
 * Cap the actively-polled dynamic universe to a rotating window. The dynamic
 * universe can grow to 1000+ penny/small-cap listings; polling all of them in
 * the same cycle blows up memory and rate-limits Yahoo, which starves the core
 * Nifty 500 names and freezes every stock price at 0. A rotating window keeps
 * full coverage over time at a fraction of the load.
 */
const MAX_DYNAMIC_ACTIVE = 150;
function getActiveDynamicSymbols(): string[] {
  const dyn = getDynamicSymbols();
  if (dyn.length <= MAX_DYNAMIC_ACTIVE) return dyn;
  const offset = (getState().rotateOffset) % dyn.length;
  const window = dyn.slice(offset, offset + MAX_DYNAMIC_ACTIVE);
  if (window.length < MAX_DYNAMIC_ACTIVE) {
    window.push(...dyn.slice(0, MAX_DYNAMIC_ACTIVE - window.length));
  }
  return window;
}

const ROTATE_BATCH = isRenderBandwidthSaver() ? 32 : process.env.RENDER === 'true' ? 100 : 200;
const YAHOO_QUOTE_CHUNK = 100;
/** Ignore sub-penny noise when market is closed (stops flicker). */
const FROZEN_EPS_RATIO = 0.00005;
const LIVE_EPS_RATIO = 0.000001; // Dramatically lowered to allow every single tick to pass (ultra real-time feel)

let _yh: any = null;
function yf() {
  if (!_yh) {
    _yh = new (YahooFinance as any)({ suppressNotices: ['yahooSurvey'], validation: { logErrors: false } });
    
  }
  return _yh;
}

export interface QuoteEntry {
  price: number; change: number | null; changePercent: number | null;
  high: number | null; low: number | null; open: number | null;
  prevClose: number | null; volume: number | null; bid: number | null;
  ask: number | null; marketCap: number | null; pe: number | null;
  dividendYield: number | null; name: string; timestamp: number;
  priceSource?: string;
  marketState?: string;
  /** When true, price is last close — not streaming */
  frozen?: boolean;
}

export interface QuotesResult {
  stocks: Record<string, QuoteEntry>;
  indices: Record<string, QuoteEntry>;
  timestamp: number;
  market: MarketSummary;
  symbolCount: number;
  serverTime: number;
}

const QF_KEY = '__quoteFetcher';
function getState(): {
  cache: { stocks: Record<string, QuoteEntry>; indices: Record<string, QuoteEntry> };
  rotateOffset: number;
  fullSnapshotAt: number;
  fullSnapshotPromise: Promise<void> | null;
  warmBootDone: boolean;
  yahooRateLimitUntil: number;
  STOCK_SYMBOLS: string[];
  ALL_SYMBOLS: string[];
  ROTATE_POOL: string[];
  tier2Cycle: number;
  tier3Cycle: number;
} {
  const g = globalThis as unknown as Record<string, any>;
  if (!g[QF_KEY]) {
    // All stock symbols: Indian + US + International + Crypto + Forex
    const allStocks = [...INDIAN_SYMBOLS];
    g[QF_KEY] = {
      cache: { stocks: {}, indices: {} },
      rotateOffset: 0,
      fullSnapshotAt: 0,
      fullSnapshotPromise: null,
      warmBootDone: false,
      yahooRateLimitUntil: 0,
      STOCK_SYMBOLS: allStocks,
      ALL_SYMBOLS: [...allStocks],
      ROTATE_POOL: allStocks,
      tier2Cycle: 0,
      tier3Cycle: 0,
    };
  }
  return g[QF_KEY];
}

const FULL_SNAPSHOT_INTERVAL = 180_000;
const FULL_SNAPSHOT_MIN_COVERAGE = 0.50;

function resolvePrice(
  q: Record<string, unknown>,
  frozen: boolean,
  sym: string,
  market: MarketSummary,
): {
  price: number; source: string; state: string;
  change: number | null; changePercent: number | null;
} {
  const state = String(q.marketState || q.market || 'UNKNOWN').toUpperCase();
  const regular = Number(q.regularMarketPrice) || 0;
  const post = Number(q.postMarketPrice) || 0;
  const pre = Number(q.preMarketPrice) || 0;
  const bid = Number(q.bid) || 0;
  const ask = Number(q.ask) || 0;
  const prevClose = Number(q.regularMarketPreviousClose) || regular || 0;
  const exStatus = exchangeStatusForSymbol(sym, market);

  const pick = (
    price: number,
    source: string,
    change: unknown,
    changePercent: unknown,
  ) => ({
    price,
    source,
    state,
    change: change != null ? Number(change) : (prevClose > 0 ? price - prevClose : null),
    changePercent: changePercent != null ? Number(changePercent) : (prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : null),
  });

  // Closed session: single official close — never flip post/pre/bid (causes fake flicker)
  if (frozen) {
    if (regular > 0) {
      return pick(regular, 'regularClose', q.regularMarketChange, q.regularMarketChangePercent);
    }
    if (prevClose > 0) {
      return pick(prevClose, 'prevClose', q.regularMarketChange, q.regularMarketChangePercent);
    }
    return { price: 0, source: 'none', state, change: null, changePercent: null };
  }

  // Use our exchange calendar first (Yahoo marketState often lags on NSE pre-open / indices)
  if (exStatus.session === 'PRE') {
    if (pre > 0) {
      return pick(pre, 'preMarket', q.preMarketChange ?? q.regularMarketChange, q.preMarketChangePercent ?? q.regularMarketChangePercent);
    }
    if (regular > 0) {
      return pick(regular, 'preIndicative', q.regularMarketChange, q.regularMarketChangePercent);
    }
  }
  if (exStatus.session === 'POST') {
    if (post > 0) {
      return pick(post, 'postMarket', q.postMarketChange ?? q.regularMarketChange, q.postMarketChangePercent ?? q.regularMarketChangePercent);
    }
    if (regular > 0) {
      return pick(regular, 'regular', q.regularMarketChange, q.regularMarketChangePercent);
    }
  }
  if (exStatus.open && regular > 0) {
    return pick(regular, 'regular', q.regularMarketChange, q.regularMarketChangePercent);
  }

  if (state.includes('PRE') && pre > 0) {
    return pick(pre, 'preMarket', q.preMarketChange ?? q.regularMarketChange, q.preMarketChangePercent ?? q.regularMarketChangePercent);
  }
  if (state.includes('POST') && post > 0) {
    return pick(post, 'postMarket', q.postMarketChange ?? q.regularMarketChange, q.postMarketChangePercent ?? q.regularMarketChangePercent);
  }
  if (regular > 0) {
    return pick(regular, 'regular', q.regularMarketChange, q.regularMarketChangePercent);
  }
  if (post > 0) {
    return pick(post, 'postMarket', q.postMarketChange ?? q.regularMarketChange, q.postMarketChangePercent ?? q.regularMarketChangePercent);
  }
  if (pre > 0) {
    return pick(pre, 'preMarket', q.preMarketChange ?? q.regularMarketChange, q.preMarketChangePercent ?? q.regularMarketChangePercent);
  }
  if (bid > 0 && ask > 0) {
    const mid = (bid + ask) / 2;
    return pick(mid, 'mid', null, null);
  }
  if (bid > 0) return pick(bid, 'bid', null, null);
  if (ask > 0) return pick(ask, 'ask', null, null);
  return { price: 0, source: 'none', state, change: null, changePercent: null };
}

function mapQuote(raw: Record<string, unknown>, market: MarketSummary): QuoteEntry | null {
  const sym = String(raw.symbol || '');
  if (!sym) return null;
  const frozen = isSymbolFrozen(sym, market);
  const { price, source, state, change, changePercent } = resolvePrice(raw, frozen, sym, market);
  const prevClose = raw.regularMarketPreviousClose != null ? Number(raw.regularMarketPreviousClose) : null;
  const effectivePrice = price > 0 ? price : (prevClose && prevClose > 0 ? prevClose : 0);
  const bid = raw.bid != null && Number(raw.bid) > 0 ? Number(raw.bid) : null;
  const ask = raw.ask != null && Number(raw.ask) > 0 ? Number(raw.ask) : null;
  return {
    price: effectivePrice,
    change: change ?? (prevClose && effectivePrice > 0 ? effectivePrice - prevClose : null),
    changePercent: changePercent ?? null,
    high: raw.regularMarketDayHigh != null ? Number(raw.regularMarketDayHigh) : null,
    low: raw.regularMarketDayLow != null ? Number(raw.regularMarketDayLow) : null,
    open: raw.regularMarketOpen != null ? Number(raw.regularMarketOpen) : null,
    prevClose,
    volume: raw.regularMarketVolume != null ? Number(raw.regularMarketVolume) : null,
    bid,
    ask,
    marketCap: raw.marketCap != null ? Number(raw.marketCap) : null,
    pe: raw.trailingPE != null ? Number(raw.trailingPE) : null,
    dividendYield: raw.dividendYield != null ? Number(raw.dividendYield) : null,
    name: String(raw.longName || raw.shortName || sym),
    timestamp: Date.now(),
    priceSource: frozen ? (source === 'regular' ? 'lastClose' : source) : (price > 0 ? source : 'prevClose'),
    marketState: state,
    frozen,
  };
}

function shouldCommit(sym: string, next: QuoteEntry, market: MarketSummary): boolean {
  const existing = getState().cache.stocks[sym] || getState().cache.indices[sym];
  if (!existing || existing.price <= 0) return true;
  
  // Prevent delayed TradingView scanner from overwriting real-time Yahoo data
  if (next.priceSource === 'tv-scanner' && existing.priceSource !== 'tv-scanner' && existing.priceSource !== 'none') {
    if (Date.now() - existing.timestamp < 5 * 60 * 1000) {
      return false;
    }
  }

  return next.price !== existing.price || next.change !== existing.change;
}

function commitEntry(sym: string, entry: QuoteEntry) {
  if (INDEX_TICKERS_ARRAY.includes(sym)) {
    getState().cache.indices[sym] = entry;
    return;
  }
  getState().cache.stocks[sym] = entry;
}

function mergeQuotes(quotes: Record<string, unknown>[], market: MarketSummary) {
  for (const raw of quotes) {
    const entry = mapQuote(raw, market);
    if (!entry) continue;
    const sym = String(raw.symbol || '');
    if (!shouldCommit(sym, entry, market)) continue;
    commitEntry(sym, entry);
  }
}

function isYahooRateLimitError(err: unknown): boolean {
  const msg = String(err);
  return msg.includes('400') || msg.includes('429') || msg.includes('Too Many') || msg.includes('Bad Request');
}

async function fetchSymbolBatch(symbols: string[], market: MarketSummary): Promise<number> {
  if (symbols.length === 0) return 0;
  if (Date.now() < getState().yahooRateLimitUntil) {
    return 0; // Gracefully skip fetching while rate limited
  }
  let merged = 0;
  for (let i = 0; i < symbols.length; i += YAHOO_QUOTE_CHUNK) {
    const chunk = symbols.slice(i, i + YAHOO_QUOTE_CHUNK);
    let ok = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const origWarn = console.warn;
        const origError = console.error;
        const origLog = console.log;
        console.warn = () => {};
        console.error = () => {};
        console.log = () => {};
        
        let result;
        try {
          result = await yf().quote(chunk);
        } finally {
          console.warn = origWarn;
          console.error = origError;
          console.log = origLog;
        }
        
        const arr = Array.isArray(result) ? result : [result];
        mergeQuotes(arr as Record<string, unknown>[], market);
        merged += arr.length;
        ok = true;
        break;
      } catch (e: any) {
        const msg = String(e);
        if (msg.includes('FailedYahooValidationError') || e.name === 'FailedYahooValidationError') {
          // In v4, FailedYahooValidationError contains the partial result that DID parse
          if (e.result) {
             const arr = Array.isArray(e.result) ? e.result : [e.result];
             mergeQuotes(arr as Record<string, unknown>[], market);
             merged += arr.length;
          }
          ok = true;
          break;
        }
        if (!isYahooRateLimitError(e)) throw e;
        if (attempt === 2) {
            console.warn('[quoteFetcher] Yahoo Rate Limit hit (429). Backing off for 10s.');
            getState().yahooRateLimitUntil = Date.now() + 10000;
            return merged;
        }
        await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
      }
    }
    if (ok && i + YAHOO_QUOTE_CHUNK < symbols.length) {
      await new Promise(r => setTimeout(r, 80));
    }
  }
  return merged;
}

async function ensureFullSnapshot(market: MarketSummary): Promise<void> {
  const indianCached = INDIAN_SYMBOLS.filter(s => getState().cache.stocks[s]?.price && getState().cache.stocks[s].price > 0).length;
  const needFull = indianCached < INDIAN_SYMBOLS.length * FULL_SNAPSHOT_MIN_COVERAGE
    || Date.now() - getState().fullSnapshotAt > FULL_SNAPSHOT_INTERVAL;
  if (!needFull) return;

  // Fetch all universes in order: core Indian → active dynamic window
  const batches = [
    INDIAN_SYMBOLS,
    getActiveDynamicSymbols().filter(s => !INDIAN_SYMBOLS.includes(s)),
  ];
  for (const syms of batches) {
    for (let i = 0; i < syms.length; i += YAHOO_QUOTE_CHUNK) {
      await fetchSymbolBatch(syms.slice(i, i + YAHOO_QUOTE_CHUNK), market);
      await new Promise(r => setTimeout(r, 100));
    }
  }
  getState().fullSnapshotAt = Date.now();
}

async function warmBootSnapshot(market: MarketSummary): Promise<void> {
  if (getState().warmBootDone) return;
  getState().warmBootDone = true;
  // Priority order: indices → crypto → forex → top US → top international
  await fetchSymbolBatch(INDIAN_SYMBOLS.slice(0, 50), market);
}

export async function fetchTradingViewIndia(market: MarketSummary) {
  try {
    const res = await fetch(`https://scanner.tradingview.com/india/scan?_=${Date.now()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        columns: ['name', 'close', 'change', 'change_abs', 'high', 'low', 'open', 'volume'],
        range: [0, 3000],
        sort: { sortBy: 'volume', sortOrder: 'desc' }
      }),
      signal: AbortSignal.timeout(3000),
      cache: 'no-store'
    });
    if (!res.ok) return;
    const { data } = await res.json();
    const tracked = new Set([...INDIAN_SYMBOLS, ...getActiveDynamicSymbols()]);
    for (const item of data) {
      const tvName = item.d[0];
      const ticker = tvName + '.NS';
      if (!tracked.has(ticker)) continue;
      const price = item.d[1];
      const changePercent = item.d[2];
      const change = item.d[3];
      const high = item.d[4];
      const low = item.d[5];
      const open = item.d[6];
      const volume = item.d[7];
      
      const frozen = isSymbolFrozen(ticker, market);
      const prevClose = price - change;
      
      const existing = getState().cache.stocks[ticker] || null;
      
      const entry: QuoteEntry = {
        price, change, changePercent, high, low, open, prevClose, volume,
        bid: existing ? existing.bid : null, 
        ask: existing ? existing.ask : null, 
        marketCap: existing ? existing.marketCap : null, 
        pe: existing ? existing.pe : null, 
        dividendYield: existing ? existing.dividendYield : null,
        name: existing && existing.name && existing.name !== ticker ? existing.name : tvName, 
        timestamp: Date.now(),
        priceSource: 'tv-scanner', marketState: frozen ? 'CLOSED' : 'REGULAR', frozen
      };
      
      if (shouldCommit(ticker, entry, market)) {
        commitEntry(ticker, entry);
      }
    }
  } catch (e) {
    console.warn('[quoteFetcher] TradingView TV scan failed:', String(e));
  }
}

export async function fetchQuotesFromYahoo(): Promise<QuotesResult> {
  const t0 = Date.now();

  // Dynamically inject newly discovered tickers (capped to a rotating window so
  // a runaway dynamic universe can't starve the core Nifty 500 of bandwidth).
  const activeDynamic = getActiveDynamicSymbols();
  if (activeDynamic.length > 0) {
    const s = getState();
    const safeTickers = [...INDIAN_EQUITY_TICKERS].filter((t: string) => t);
    const priority = [...INDIAN_EQUITY_TICKERS.slice(0, 20)].filter((t: string) => t);
    const core = [...INDIAN_EQUITY_TICKERS.slice(20, 150)].filter((t: string) => t);
    const extra = safeTickers.filter((t: string) => !priority.includes(t) && !core.includes(t));
    s.STOCK_SYMBOLS = [...INDIAN_SYMBOLS, ...activeDynamic];
    s.ALL_SYMBOLS = [...s.STOCK_SYMBOLS];
    s.ROTATE_POOL = s.ALL_SYMBOLS;
  }

  const market = getMarketSummary();

  // Fast first paint: warm boot popular symbols once.
  if (!getState().warmBootDone) {
    await warmBootSnapshot(market);
  }
  // Never block request path on full snapshot; run in background.
  if (!getState().fullSnapshotPromise) {
    const indianCached = INDIAN_SYMBOLS.filter(s => getState().cache.stocks[s]?.price && getState().cache.stocks[s].price > 0).length;
    const needFull = indianCached < INDIAN_SYMBOLS.length * FULL_SNAPSHOT_MIN_COVERAGE
      || Date.now() - getState().fullSnapshotAt > FULL_SNAPSHOT_INTERVAL;
    if (needFull) {
      getState().fullSnapshotPromise = ensureFullSnapshot(market)
        .catch(err => console.warn('[quoteFetcher] Background snapshot failed:', String(err)))
        .finally(() => {
          getState().fullSnapshotPromise = null;
        });
    }
  }

  // Tier 1: Always fetch
  const batch: string[] = [...INDIAN_SYMBOLS.slice(0, 20), ...INDEX_TICKERS_ARRAY];

  // Tier 2: Top Indian
  getState().tier2Cycle = (getState().tier2Cycle + 1) % 2;
  if (getState().tier2Cycle === 0) {
    for (const sym of INDIAN_SYMBOLS.slice(20, 100)) {
      if (!batch.includes(sym)) batch.push(sym);
    }
  }

  // Tier 3: Rotating pool of remaining tickers — fills remaining capacity
  const poolLen = Math.max(1, getState().ROTATE_POOL.length);
  const tier3Budget = Math.max(0, ROTATE_BATCH * 2 - batch.length);
  for (let i = 0; batch.length < ROTATE_BATCH * 2 && i < tier3Budget; i++) {
    const sym = getState().ROTATE_POOL[(getState().rotateOffset + i) % poolLen];
    if (!batch.includes(sym)) batch.push(sym);
  }
  getState().rotateOffset = (getState().rotateOffset + tier3Budget) % poolLen;

  if (batch.length > 0) {
    try {
      // Allow Indian symbols in the active batch to be fetched via Yahoo Finance for real-time prices
      await Promise.all([
        fetchSymbolBatch(batch, market),
        fetchTradingViewIndia(market)
      ]);
    } catch (e) {
      if (!isYahooRateLimitError(e)) throw e;
      // Rate-limited: skip this rotate tick; cache still serves last good prices.
    }
  }

  const now = Date.now();
  const allStocks: Record<string, QuoteEntry> = { ...getState().cache.stocks };
  for (const sym of getState().STOCK_SYMBOLS) {
    if (!allStocks[sym]) {
      allStocks[sym] = {
        price: 0, change: null, changePercent: null,
        high: null, low: null, open: null, prevClose: null,
        volume: null, bid: null, ask: null,
        marketCap: null, pe: null, dividendYield: null,
        name: sym.replace('.NS', ''), timestamp: now,
        priceSource: 'none', marketState: 'UNKNOWN', frozen: true,
      };
    }
  }
  const allIndices: Record<string, QuoteEntry> = { ...getState().cache.indices };
  for (const sym of INDEX_TICKERS_ARRAY) {
    if (!allIndices[sym]) {
      allIndices[sym] = {
        price: 0, change: null, changePercent: null,
        high: null, low: null, open: null, prevClose: null,
        volume: null, bid: null, ask: null,
        marketCap: null, pe: null, dividendYield: null,
        name: sym, timestamp: now,
        priceSource: 'none', marketState: 'UNKNOWN', frozen: true,
      };
    }
  }

  return {
    stocks: allStocks,
    indices: allIndices,
    timestamp: now,
    serverTime: now,
    market,
    symbolCount: Object.keys(getState().cache.stocks).length + Object.keys(getState().cache.indices).length,
  };
}

export function getQuoteCacheStats() {
  const pricedStocks = Object.values(getState().cache.stocks).filter(s => s.price != null && s.price > 0).length;
  const indianPriced = INDIAN_SYMBOLS.filter(s => (getState().cache.stocks[s]?.price ?? 0) > 0).length;
  return {
    pricedStocks,
    indianPriced,
    totalIndian: INDIAN_SYMBOLS.length,
    totalUS: 0,
    totalCrypto: 0,
    totalForex: 0,
    totalForeign: 0,
    lastFullSnapshotAt: getState().fullSnapshotAt,
  };
}

export function getAllCachedQuotes(): Record<string, QuoteEntry> {
  return { ...getState().cache.stocks };
}

export function getMarketContext(): { niftyChangePct: number; sensexChangePct: number; marketPhase: string } {
  const indices = getState().cache.indices;
  const nifty = indices['^NSEI'];
  const sensex = indices['^BSESN'];
  return {
    niftyChangePct: nifty?.changePercent ?? 0,
    sensexChangePct: sensex?.changePercent ?? 0,
    marketPhase: nifty?.marketState || sensex?.marketState || 'UNKNOWN',
  };
}

export function getLivePrice(ticker: string): number | null {
  const clean = ticker.trim().toUpperCase();
  if (!clean) return null;
  const sym = clean.includes('.') || clean.includes('^') || clean.includes('=') || clean.includes('-') ? clean : tickerToYahoo(clean);
  const entry = getState().cache.stocks[sym] || getState().cache.indices[sym];
  return entry?.price || null;
}
