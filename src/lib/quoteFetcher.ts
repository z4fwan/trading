import YahooFinance from 'yahoo-finance2';
import { INDIAN_EQUITY_TICKERS, INTERNATIONAL_TICKERS, INDEX_SYMBOLS, tickerToYahoo } from '@/lib/marketConfig';
import { getMarketSummary, isSymbolFrozen, exchangeStatusForSymbol, type MarketSummary } from '@/lib/exchangeHours';
import { isRenderBandwidthSaver } from '@/lib/renderBandwidth';
import { getDynamicTickersOnly } from '@/lib/dynamicUniverse';

const INDIAN_SYMBOLS = INDIAN_EQUITY_TICKERS.map(t => tickerToYahoo(t));
const INTL_SYMBOLS = INTERNATIONAL_TICKERS.map(t => tickerToYahoo(t));

/** Returns all dynamic symbols not in hardcoded sets */
function getDynamicSymbols() {
  return getDynamicTickersOnly().map(t => tickerToYahoo(t));
}

let STOCK_SYMBOLS = [...INDIAN_SYMBOLS, ...INTL_SYMBOLS];
let ALL_SYMBOLS = [...STOCK_SYMBOLS, ...INDEX_SYMBOLS];

/** Symbols refreshed each quote cycle (fetched in small Yahoo chunks). */
const ROTATE_BATCH = isRenderBandwidthSaver() ? 32 : process.env.RENDER === 'true' ? 48 : 36;
/** Yahoo quote() rejects large batches from cloud IPs — keep chunks small. */
const YAHOO_QUOTE_CHUNK = 12;
let ROTATE_POOL = ALL_SYMBOLS.filter(s => !INDEX_SYMBOLS.includes(s));
/** Ignore sub-penny noise when market is closed (stops flicker). */
const FROZEN_EPS_RATIO = 0.00005;
const LIVE_EPS_RATIO = 0.00012;

let _yh: InstanceType<typeof YahooFinance> | null = null;
function yf() {
  if (!_yh) _yh = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
  return _yh!;
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

const cache: { stocks: Record<string, QuoteEntry>; indices: Record<string, QuoteEntry> } = {
  stocks: {},
  indices: {},
};
let rotateOffset = 0;
let fullSnapshotAt = 0;
const FULL_SNAPSHOT_INTERVAL = 120_000;
const FULL_SNAPSHOT_MIN_COVERAGE = 0.65;
let fullSnapshotPromise: Promise<void> | null = null;
let warmBootDone = false;

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
  const isIndex = INDEX_SYMBOLS.includes(sym);
  const existing = isIndex ? cache.indices[sym] : cache.stocks[sym];
  if (!existing || existing.price <= 0) return true;
  if (!isSymbolFrozen(sym, market)) {
    const rel = Math.abs(next.price - existing.price) / existing.price;
    if (rel <= LIVE_EPS_RATIO) return false;
    return true;
  }

  const rel = Math.abs(next.price - existing.price) / existing.price;
  if (rel <= FROZEN_EPS_RATIO) return false;
  return true;
}

function commitEntry(sym: string, entry: QuoteEntry) {
  if (INDEX_SYMBOLS.includes(sym)) cache.indices[sym] = entry;
  else cache.stocks[sym] = entry;
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

let yahooRateLimitUntil = 0;

async function fetchSymbolBatch(symbols: string[], market: MarketSummary): Promise<number> {
  if (symbols.length === 0) return 0;
  if (Date.now() < yahooRateLimitUntil) {
    return 0; // Gracefully skip fetching while rate limited
  }
  let merged = 0;
  for (let i = 0; i < symbols.length; i += YAHOO_QUOTE_CHUNK) {
    const chunk = symbols.slice(i, i + YAHOO_QUOTE_CHUNK);
    let ok = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await yf().quote(chunk);
        const arr = Array.isArray(result) ? result : [result];
        mergeQuotes(arr as Record<string, unknown>[], market);
        merged += arr.length;
        ok = true;
        break;
      } catch (e) {
        if (!isYahooRateLimitError(e)) throw e;
        if (attempt === 2) {
            console.warn('[quoteFetcher] Yahoo Rate Limit hit (429). Backing off for 60s.');
            yahooRateLimitUntil = Date.now() + 60000; // Lock for 60 seconds
            return merged; // Exit early but gracefully
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
  const indianCached = INDIAN_SYMBOLS.filter(s => cache.stocks[s]?.price && cache.stocks[s].price > 0).length;
  const needFull = indianCached < INDIAN_SYMBOLS.length * FULL_SNAPSHOT_MIN_COVERAGE
    || Date.now() - fullSnapshotAt > FULL_SNAPSHOT_INTERVAL;
  if (!needFull) return;

  for (let i = 0; i < ALL_SYMBOLS.length; i += YAHOO_QUOTE_CHUNK) {
    await fetchSymbolBatch(ALL_SYMBOLS.slice(i, i + YAHOO_QUOTE_CHUNK), market);
    await new Promise(r => setTimeout(r, 100));
  }
  fullSnapshotAt = Date.now();
}

async function warmBootSnapshot(market: MarketSummary): Promise<void> {
  if (warmBootDone) return;
  warmBootDone = true;
  // Only fetch the symbols visible on screen — rest via rotation
  await fetchSymbolBatch(INDEX_SYMBOLS, market);
  await fetchSymbolBatch(INTL_SYMBOLS, market);
  // Top 48 Indian stocks fit in a single rotation batch for fast first paint
  await fetchSymbolBatch(INDIAN_SYMBOLS.slice(0, 48), market);
}

export async function fetchQuotesFromYahoo(): Promise<QuotesResult> {
  const t0 = Date.now();

  // Dynamically inject newly discovered tickers
  const dynamic = getDynamicSymbols();
  if (dynamic.length > 0) {
    STOCK_SYMBOLS = [...INDIAN_SYMBOLS, ...INTL_SYMBOLS, ...dynamic];
    ALL_SYMBOLS = [...STOCK_SYMBOLS, ...INDEX_SYMBOLS];
    ROTATE_POOL = ALL_SYMBOLS.filter(s => !INDEX_SYMBOLS.includes(s));
  }

  const market = getMarketSummary();

  // Fast first paint: warm boot popular symbols once.
  if (!warmBootDone) {
    await warmBootSnapshot(market);
  }
  // Never block request path on full snapshot; run in background.
  if (!fullSnapshotPromise) {
    const indianCached = INDIAN_SYMBOLS.filter(s => cache.stocks[s]?.price && cache.stocks[s].price > 0).length;
    const needFull = indianCached < INDIAN_SYMBOLS.length * FULL_SNAPSHOT_MIN_COVERAGE
      || Date.now() - fullSnapshotAt > FULL_SNAPSHOT_INTERVAL;
    if (needFull) {
      fullSnapshotPromise = ensureFullSnapshot(market).finally(() => {
        fullSnapshotPromise = null;
      });
    }
  }

  const batch: string[] = [...INDEX_SYMBOLS];
  const poolLen = Math.max(1, ROTATE_POOL.length);
  for (let i = 0; batch.length < INDEX_SYMBOLS.length + ROTATE_BATCH; i++) {
    const sym = ROTATE_POOL[(rotateOffset + i) % poolLen];
    if (!batch.includes(sym)) batch.push(sym);
  }
  rotateOffset = (rotateOffset + ROTATE_BATCH) % poolLen;

  if (batch.length > 0) {
    try {
      await fetchSymbolBatch(batch, market);
    } catch (e) {
      if (!isYahooRateLimitError(e)) throw e;
      // Rate-limited: skip this rotate tick; cache still serves last good prices.
    }
  }

  // Prices come only from Yahoo quote() — same fields Google Finance uses (no 1m chart overlay).

  const now = Date.now();
  const allStocks: Record<string, QuoteEntry> = { ...cache.stocks };
  for (const sym of STOCK_SYMBOLS) {
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
  const allIndices: Record<string, QuoteEntry> = { ...cache.indices };
  for (const sym of INDEX_SYMBOLS) {
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
    symbolCount: Object.keys(cache.stocks).length + Object.keys(cache.indices).length,
  };
}

export function getQuoteCacheStats() {
  const pricedStocks = Object.values(cache.stocks).filter(s => s.price != null && s.price > 0).length;
  const indianPriced = INDIAN_SYMBOLS.filter(s => (cache.stocks[s]?.price ?? 0) > 0).length;
  return {
    pricedStocks,
    indianPriced,
    totalIndian: INDIAN_SYMBOLS.length,
    lastFullSnapshotAt: fullSnapshotAt,
  };
}

export function getLivePrice(ticker: string): number | null {
  const clean = ticker.trim().toUpperCase();
  if (!clean) return null;
  const sym = clean.includes('.') || clean.includes('^') || clean.includes('=') ? clean : tickerToYahoo(clean);
  const entry = cache.stocks[sym] || cache.indices[sym];
  return entry?.price || null;
}
