import YahooFinance from 'yahoo-finance2';
import { getTickerName, isIndianTicker, tickerToYahoo } from '@/lib/marketConfig';
import { applyCrossCheckToRaw, runCrossCheck } from './crossCheck';
import {
  fetchNseSnapshot,
  fetchScreenerSnapshot,
  yahooQuoteSummarySnap,
  yahooSummarySnap,
  type ExternalFundamentalSnap,
} from './externalSources';
import { mergeIndianFundamentals, type AccuracyMeta } from './indianAccuracyMerge';
import { normalizeDebtEquity, normalizeDivYield, normalizePercentMetric } from './metricNormalize';
import { fetchScreenerHtmlDeep } from './screenerHtmlFundamentals';
import type { CrossCheckResult } from './types';

const NIFTY_PE_PROXY = 22;

let _yf: InstanceType<typeof YahooFinance> | null = null;
function yf() {
  if (!_yf) _yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
  return _yf;
}

export interface RawFundamentals {
  ticker: string;
  yahooSym: string;
  companyName: string;
  sector: string;
  industry: string;
  sources: { name: string; url: string }[];
  usedTrainingData: boolean;

  cmp: number | null;
  high52: number | null;
  low52: number | null;
  marketCapCr: number | null;
  bookValue: number | null;

  pe: number | null;
  pb: number | null;
  peg: number | null;
  evEbitda: number | null;
  divYield: number | null;

  roe: number | null;
  roce: number | null;
  debtEquity: number | null;
  currentRatio: number | null;
  revenueGrowth: number | null;
  earningsGrowth: number | null;
  profitMargins: number | null;
  operatingMargins: number | null;
  freeCashflow: number | null;
  totalCash: number | null;
  totalDebt: number | null;
  ebitda: number | null;

  revenueHistory: number[];
  earningsHistory: number[];

  crossCheck: CrossCheckResult;
  externalSnaps: ExternalFundamentalSnap[];
  accuracy?: AccuracyMeta;
  sectorPe: number | null;
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function cagr(values: number[]): number | null {
  const clean = values.filter(v => v > 0);
  if (clean.length < 2) return null;
  const start = clean[0];
  const end = clean[clean.length - 1];
  const years = clean.length - 1;
  if (start <= 0 || years <= 0) return null;
  return (Math.pow(end / start, 1 / years) - 1) * 100;
}

export function normalizeTicker(input: string): string {
  const t = input.trim().toUpperCase().replace(/\.NS$|\.BO$/i, '');
  return t;
}

export async function fetchRawFundamentals(inputTicker: string): Promise<RawFundamentals | null> {
  const ticker = normalizeTicker(inputTicker);
  if (!ticker) return null;
  const yahooSym = ticker.includes('^') ? ticker : tickerToYahoo(ticker);
  const indian = isIndianTicker(ticker);

  const sources: { name: string; url: string }[] = [
    { name: 'Yahoo Finance', url: `https://finance.yahoo.com/quote/${yahooSym}` },
    { name: 'NSE India', url: `https://www.nseindia.com/get-quotes/equity?symbol=${ticker}` },
    { name: 'Screener.in', url: `https://www.screener.in/company/${ticker}/` },
  ];

  try {
    const [quote, summary] = await Promise.all([
      yf().quote(yahooSym),
      yf().quoteSummary(yahooSym, {
        modules: [
          'summaryDetail',
          'financialData',
          'defaultKeyStatistics',
          'price',
        ],
      }).catch(() => null),
    ]);

    const sd = summary?.summaryDetail as Record<string, unknown> | undefined;
    const fd = summary?.financialData as Record<string, unknown> | undefined;
    const ks = summary?.defaultKeyStatistics as Record<string, unknown> | undefined;
    const price = summary?.price as Record<string, unknown> | undefined;

    const cmp = num(quote?.regularMarketPrice) ?? num(price?.regularMarketPrice);
    const high52 = num(sd?.fiftyTwoWeekHigh) ?? num(quote?.fiftyTwoWeekHigh);
    const low52 = num(sd?.fiftyTwoWeekLow) ?? num(quote?.fiftyTwoWeekLow);
    const mcap = num(sd?.marketCap) ?? num(quote?.marketCap);
    const marketCapCr = mcap != null ? mcap / 1e7 : null;

    const income = (summary?.incomeStatementHistory as { incomeStatementHistory?: { totalRevenue?: { raw?: number }; netIncome?: { raw?: number } }[] })?.incomeStatementHistory || [];
    const revenues = income.map(r => num(r.totalRevenue?.raw) ?? 0).filter(v => v > 0).reverse();
    const earnings = income.map(r => num(r.netIncome?.raw) ?? 0).filter(v => v !== 0).reverse();

    const summaryPrice = num(price?.regularMarketPrice);
    const yahooRaw: RawFundamentals = {
      ticker,
      yahooSym,
      companyName: String(quote?.longName || quote?.shortName || getTickerName(ticker) || ticker),
      sector: String(quote?.sector || fd?.sector || '—'),
      industry: String(quote?.industry || '—'),
      sources,
      usedTrainingData: false,

      cmp,
      high52,
      low52,
      marketCapCr,
      bookValue: num(sd?.bookValue) ?? num(ks?.bookValue),

      pe: num(sd?.trailingPE) ?? num(quote?.trailingPE),
      pb: num(sd?.priceToBook) ?? num(ks?.priceToBook),
      peg: num(ks?.pegRatio),
      evEbitda: num(ks?.enterpriseToEbitda),
      divYield: normalizeDivYield(num(sd?.dividendYield) != null ? num(sd?.dividendYield)! * 100 : num(sd?.dividendYield)),

      roe: normalizePercentMetric(num(fd?.returnOnEquity) != null ? num(fd?.returnOnEquity)! * 100 : null, true),
      roce: null,
      debtEquity: normalizeDebtEquity(num(fd?.debtToEquity)),
      currentRatio: num(fd?.currentRatio),
      revenueGrowth: normalizePercentMetric(num(fd?.revenueGrowth) != null ? num(fd?.revenueGrowth)! * 100 : null, true),
      earningsGrowth: normalizePercentMetric(num(fd?.earningsGrowth) != null ? num(fd?.earningsGrowth)! * 100 : null, true),
      profitMargins: normalizePercentMetric(num(fd?.profitMargins) != null ? num(fd?.profitMargins)! * 100 : null, true),
      operatingMargins: normalizePercentMetric(num(fd?.operatingMargins) != null ? num(fd?.operatingMargins)! * 100 : null, true),
      freeCashflow: num(fd?.freeCashflow),
      totalCash: num(fd?.totalCash),
      totalDebt: num(fd?.totalDebt),
      ebitda: num(fd?.ebitda),

      revenueHistory: revenues,
      earningsHistory: earnings,

      crossCheck: emptyCrossCheck(),
      externalSnaps: [],
      sectorPe: null,
    };

    return await finalizeWithCrossCheck(yahooRaw, indian, summaryPrice);
  } catch {
    if (!indian) return null;
    return {
      ticker,
      yahooSym,
      companyName: getTickerName(ticker) || ticker,
      sector: '—',
      industry: '—',
      sources,
      usedTrainingData: true,
      cmp: null,
      high52: null,
      low52: null,
      marketCapCr: null,
      bookValue: null,
      pe: null,
      pb: null,
      peg: null,
      evEbitda: null,
      divYield: null,
      roe: null,
      roce: null,
      debtEquity: null,
      currentRatio: null,
      revenueGrowth: null,
      earningsGrowth: null,
      profitMargins: null,
      operatingMargins: null,
      freeCashflow: null,
      totalCash: null,
      totalDebt: null,
      ebitda: null,
      revenueHistory: [],
      earningsHistory: [],
      crossCheck: emptyCrossCheck(),
      externalSnaps: [],
      sectorPe: null,
    };
  }
}

function emptyCrossCheck(): CrossCheckResult {
  return {
    ranAt: Date.now(),
    metrics: [],
    sourcesQueried: ['Yahoo Finance', 'NSE India', 'Screener.in'],
    sourcesResponded: [],
    verifiedCount: 0,
    mismatchCount: 0,
    overall: 'LOW',
  };
}

async function finalizeWithCrossCheck(
  yahooRaw: RawFundamentals,
  indian: boolean,
  summaryPrice: number | null,
): Promise<RawFundamentals> {
  const extras: ExternalFundamentalSnap[] = [
    yahooQuoteSummarySnap(yahooRaw.cmp, summaryPrice),
    yahooSummarySnap(summaryPrice),
  ];

  let sectorPe: number | null = null;
  let htmlDeep = null;

  if (indian) {
    const [screener, nse, html] = await Promise.all([
      fetchScreenerSnapshot(yahooRaw.ticker),
      fetchNseSnapshot(yahooRaw.ticker),
      fetchScreenerHtmlDeep(yahooRaw.ticker),
    ]);
    extras.push(screener, nse);
    htmlDeep = html;
    if (html?.snap.ok) extras.push(html.snap);
    sectorPe = nse.sectorPe ?? null;
  }

  const crossCheck = runCrossCheck(yahooRaw, extras);
  let merged = applyCrossCheckToRaw({ ...yahooRaw, sectorPe }, crossCheck);

  if (indian) {
    const { raw, meta } = mergeIndianFundamentals(merged, extras, htmlDeep, sectorPe);
    merged = raw;
    merged.accuracy = meta;
    if (meta.screenerAbout) merged.industry = merged.industry || '—';
  }

  const responded = extras.filter(e => e.ok).map(e => e.source);
  merged.sources = [
    { name: 'Yahoo Finance', url: `https://finance.yahoo.com/quote/${yahooRaw.yahooSym}` },
    ...(extras.find(e => e.source === 'NSE India' && e.ok)
      ? [{ name: 'NSE India', url: `https://www.nseindia.com/get-quotes/equity?symbol=${yahooRaw.ticker}` }]
      : []),
    ...(extras.some(e => e.source.includes('Screener') && e.ok)
      ? [{ name: 'Screener.in', url: `https://www.screener.in/company/${yahooRaw.ticker}/` }]
      : []),
  ];
  merged.crossCheck = crossCheck;
  merged.externalSnaps = extras;
  merged.usedTrainingData = responded.filter(s => s.includes('Screener') || s.includes('NSE')).length < 1;

  return merged;
}


export function getNiftyPeProxy(): number {
  return NIFTY_PE_PROXY;
}

export { cagr };
