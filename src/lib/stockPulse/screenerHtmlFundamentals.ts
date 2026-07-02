/**
 * Parses Screener.in consolidated company HTML — primary accuracy source for Indian stocks.
 * Works when the JSON API is blocked; metrics match what users see on Screener.
 */

import type { ExternalFundamentalSnap } from './externalSources';

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-IN,en;q=0.9',
};

export interface ScreenerHtmlDeep {
  snap: ExternalFundamentalSnap;
  salesCagr3y: number | null;
  salesCagr5y: number | null;
  salesCagr10y: number | null;
  profitCagr3y: number | null;
  profitCagr5y: number | null;
  profitCagr10y: number | null;
  roeCagr10y: number | null;
  about: string | null;
  warehouseId: number | null;
}

function parseNum(s: string): number | null {
  const cleaned = s.replace(/,/g, '').replace(/%/g, '').replace(/₹/g, '').trim();
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Top-ratio line: "P/E </span> ... <span class="number">15.7" */
function ratioNumber(html: string, label: string): number | null {
  const re = new RegExp(
    `${escapeRe(label)}\\s*</span>\\s*<span[^>]*>\\s*(?:₹\\s*)?(?:<span class="number">)?([\\d,./]+)`,
    'i',
  );
  const m = html.match(re);
  return m ? parseNum(m[1]) : null;
}

function compoundedPct(html: string, sectionTitle: string, period: string): number | null {
  const idx = html.indexOf(sectionTitle);
  if (idx < 0) return null;
  const chunk = html.slice(idx, idx + 800);
  const re = new RegExp(`${escapeRe(period)}:</td>\\s*<td>([\\d.]+)%`, 'i');
  const m = chunk.match(re);
  return m ? parseNum(m[1]) : null;
}

function parseHighLow(html: string): { high: number | null; low: number | null } {
  const re = /High\s*\/\s*Low\s*<\/span>\s*<span[^>]*>₹\s*<span class="number">([\d,]+)<\/span>\s*\/\s*<span class="number">([\d,]+)/i;
  const m = html.match(re);
  if (!m) return { high: null, low: null };
  return { high: parseNum(m[1]), low: parseNum(m[2]) };
}

function parseMarketCapCr(html: string): number | null {
  const re = /Market Cap\s*<\/span>\s*<span[^>]*>\s*₹\s*<span class="number">([\d,]+)<\/span>/i;
  const m = html.match(re);
  if (!m) return null;
  const n = parseNum(m[1]);
  if (n == null) return null;
  return n;
}

function parseAbout(html: string): string | null {
  const m = html.match(/class="about"[^>]*>([\s\S]*?)<\/div>/i)
    || html.match(/id="company-info"[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i);
  if (!m) return null;
  return m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1200) || null;
}

export async function fetchScreenerHtmlDeep(ticker: string): Promise<ScreenerHtmlDeep | null> {
  const baseSnap: ExternalFundamentalSnap = {
    source: 'Screener.in (page)',
    ok: false,
    cmp: null, high52: null, low52: null, marketCapCr: null,
    pe: null, pb: null, roe: null, roce: null, debtEquity: null, divYield: null,
    promoterPct: null, fiiPct: null, pledgingPct: null, companyName: null,
  };

  try {
    const url = `https://www.screener.in/company/${encodeURIComponent(ticker)}/consolidated/`;
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;

    const html = await res.text();
    const titleM = html.match(/<title>([^<]+)<\/title>/i);
    const companyName = titleM
      ? titleM[1].split('|')[0].replace(/share price/i, '').trim()
      : null;

    const whM = html.match(/data-warehouse-id="(\d+)"/);
    const { high, low } = parseHighLow(html);

    const snap: ExternalFundamentalSnap = {
      source: 'Screener.in (page)',
      ok: true,
      companyName,
      cmp: ratioNumber(html, 'Current Price'),
      high52: high,
      low52: low,
      marketCapCr: parseMarketCapCr(html),
      pe: ratioNumber(html, 'P/E') ?? ratioNumber(html, 'Stock P/E'),
      pb: ratioNumber(html, 'P/B') ?? ratioNumber(html, 'Book Value'),
      roe: ratioNumber(html, 'ROE'),
      roce: ratioNumber(html, 'ROCE'),
      debtEquity: ratioNumber(html, 'Debt to equity') ?? ratioNumber(html, 'Debt / equity'),
      divYield: ratioNumber(html, 'Dividend Yield'),
      promoterPct: null,
      fiiPct: null,
      pledgingPct: null,
    };

    return {
      snap,
      salesCagr3y: compoundedPct(html, 'Compounded Sales Growth', '3 Years'),
      salesCagr5y: compoundedPct(html, 'Compounded Sales Growth', '5 Years'),
      salesCagr10y: compoundedPct(html, 'Compounded Sales Growth', '10 Years'),
      profitCagr3y: compoundedPct(html, 'Compounded Profit Growth', '3 Years'),
      profitCagr5y: compoundedPct(html, 'Compounded Profit Growth', '5 Years'),
      profitCagr10y: compoundedPct(html, 'Compounded Profit Growth', '10 Years'),
      roeCagr10y: compoundedPct(html, 'Return on Equity', '10 Years'),
      about: parseAbout(html),
      warehouseId: whM ? parseInt(whM[1], 10) : null,
    };
  } catch {
    return null;
  }
}
