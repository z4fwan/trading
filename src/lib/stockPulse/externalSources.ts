/** Secondary sources for automatic cross-check (server-side fetch). */

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json,text/plain,*/*',
  'Accept-Language': 'en-IN,en;q=0.9',
};

export interface ExternalFundamentalSnap {
  source: string;
  ok: boolean;
  error?: string;
  cmp: number | null;
  high52: number | null;
  low52: number | null;
  marketCapCr: number | null;
  pe: number | null;
  pb: number | null;
  roe: number | null;
  roce: number | null;
  debtEquity: number | null;
  divYield: number | null;
  promoterPct: number | null;
  fiiPct: number | null;
  pledgingPct: number | null;
  companyName: string | null;
  /** NSE sector P/E reference */
  sectorPe?: number | null;
}

function parseNum(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = String(v).replace(/,/g, '').replace(/%/g, '').trim();
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function parseCr(v: unknown): number | null {
  const n = parseNum(v);
  if (n == null) return null;
  const s = String(v).toLowerCase();
  if (s.includes('lac') || s.includes('lakh')) return n / 100;
  if (s.includes('cr') || n < 100000) return n;
  return n / 1e7;
}

export async function fetchScreenerSnapshot(ticker: string): Promise<ExternalFundamentalSnap> {
  const base: ExternalFundamentalSnap = {
    source: 'Screener.in',
    ok: false,
    cmp: null, high52: null, low52: null, marketCapCr: null,
    pe: null, pb: null, roe: null, roce: null, debtEquity: null, divYield: null,
    promoterPct: null, fiiPct: null, pledgingPct: null, companyName: null,
  };

  try {
    const searchRes = await fetch(
      `https://www.screener.in/api/company/search/?q=${encodeURIComponent(ticker)}&limit=6`,
      { headers: BROWSER_HEADERS, cache: 'no-store', signal: AbortSignal.timeout(12000) },
    );
    if (!searchRes.ok) return { ...base, error: `search HTTP ${searchRes.status}` };

    const searchData = await searchRes.json() as { id?: number; name?: string; url?: string }[];
    const match = Array.isArray(searchData)
      ? searchData.find(r => {
          const url = String(r.url || '').toUpperCase();
          return url.includes(`/company/${ticker}/`) || url.endsWith(`/${ticker}/`);
        }) ?? searchData[0]
      : null;
    if (!match?.id) return { ...base, error: 'symbol not found on Screener' };

    const coRes = await fetch(
      `https://www.screener.in/api/company/${match.id}/`,
      { headers: BROWSER_HEADERS, cache: 'no-store', signal: AbortSignal.timeout(12000) },
    );
    if (!coRes.ok) return { ...base, error: `company HTTP ${coRes.status}` };

    const data = await coRes.json() as Record<string, unknown>;
    const company = (data.company || data) as Record<string, unknown>;
    const ratios = (data.ratios || company.ratios || {}) as Record<string, unknown>;

    const price = parseNum(company.current_price ?? company.currentPrice ?? ratios.current_price);
    const mcap = parseCr(company.market_capitalization ?? ratios.market_capitalization);

    return {
      source: 'Screener.in',
      ok: true,
      companyName: String(company.name || match.name || ''),
      cmp: price,
      high52: parseNum(company.high_price ?? ratios.high_price),
      low52: parseNum(company.low_price ?? ratios.low_price),
      marketCapCr: mcap,
      pe: parseNum(ratios.price_to_earning ?? ratios.pe ?? company.pe_ratio),
      pb: parseNum(ratios.price_to_book_value ?? ratios.pb),
      roe: parseNum(ratios.return_on_equity ?? ratios.roe),
      roce: parseNum(ratios.return_on_capital_employed ?? ratios.roce),
      debtEquity: parseNum(ratios.debt_to_equity ?? ratios.debt_to_equity_ratio),
      divYield: parseNum(ratios.dividend_yield ?? ratios.div_yield),
      promoterPct: parseNum(ratios.promoter_holding ?? ratios.promoter),
      fiiPct: parseNum(ratios.fii_holding ?? ratios.fii),
      pledgingPct: parseNum(ratios.pledged_percentage ?? ratios.promoter_pledge),
    };
  } catch (e) {
    return { ...base, error: String(e) };
  }
}

let nseCookieCache: string | null = null;
let nseCookieAt = 0;

async function nseCookies(): Promise<string | null> {
  if (nseCookieCache && Date.now() - nseCookieAt < 300_000) return nseCookieCache;
  try {
    const res = await fetch('https://www.nseindia.com', {
      headers: BROWSER_HEADERS,
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    const set = res.headers.getSetCookie?.() ?? [];
    const raw = res.headers.get('set-cookie');
    const joined = set.length > 0
      ? set.map(c => c.split(';')[0]).join('; ')
      : raw || '';
    if (joined) {
      nseCookieCache = joined;
      nseCookieAt = Date.now();
    }
    return nseCookieCache;
  } catch {
    return null;
  }
}

export async function fetchNseSnapshot(ticker: string): Promise<ExternalFundamentalSnap> {
  const base: ExternalFundamentalSnap = {
    source: 'NSE India',
    ok: false,
    cmp: null, high52: null, low52: null, marketCapCr: null,
    pe: null, pb: null, roe: null, roce: null, debtEquity: null, divYield: null,
    promoterPct: null, fiiPct: null, pledgingPct: null, companyName: null,
  };

  try {
    const cookie = await nseCookies();
    const headers: Record<string, string> = {
      ...BROWSER_HEADERS,
      Referer: 'https://www.nseindia.com/get-quotes/equity',
    };
    if (cookie) headers.Cookie = cookie;

    const res = await fetch(
      `https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(ticker)}`,
      { headers, cache: 'no-store', signal: AbortSignal.timeout(12000) },
    );
    if (!res.ok) return { ...base, error: `HTTP ${res.status}` };

    const data = await res.json() as {
      info?: { companyName?: string; industry?: string };
      priceInfo?: { lastPrice?: number; weekHighLow?: { max?: number; min?: number } };
      metadata?: { pdSymbolPe?: number; pdSectorPe?: number; pdSectorInd?: string };
    };

    const priceInfo = data.priceInfo || {};
    const wh = priceInfo.weekHighLow || {};

    return {
      source: 'NSE India',
      ok: true,
      companyName: data.info?.companyName || null,
      cmp: parseNum(priceInfo.lastPrice),
      high52: parseNum(wh.max),
      low52: parseNum(wh.min),
      marketCapCr: null,
      pe: parseNum(data.metadata?.pdSymbolPe),
      sectorPe: parseNum(data.metadata?.pdSectorPe),
      pb: null,
      roe: null,
      roce: null,
      debtEquity: null,
      divYield: null,
      promoterPct: null,
      fiiPct: null,
      pledgingPct: null,
    };
  } catch (e) {
    return { ...base, error: String(e) };
  }
}

/** Yahoo quote vs summary — internal consistency check */
export function yahooQuoteSummarySnap(
  quotePrice: number | null,
  summaryPrice: number | null,
): ExternalFundamentalSnap {
  return {
    source: 'Yahoo (quote)',
    ok: quotePrice != null,
    cmp: quotePrice,
    high52: null, low52: null, marketCapCr: null,
    pe: null, pb: null, roe: null, roce: null, debtEquity: null, divYield: null,
    promoterPct: null, fiiPct: null, pledgingPct: null, companyName: null,
  };
}

export function yahooSummarySnap(
  summaryPrice: number | null,
): ExternalFundamentalSnap {
  return {
    source: 'Yahoo (summary)',
    ok: summaryPrice != null,
    cmp: summaryPrice,
    high52: null, low52: null, marketCapCr: null,
    pe: null, pb: null, roe: null, roce: null, debtEquity: null, divYield: null,
    promoterPct: null, fiiPct: null, pledgingPct: null, companyName: null,
  };
}
