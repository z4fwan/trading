import type { CrossCheckResult } from './types';
import type { RawFundamentals } from './fundamentalFetcher';
import type { ExternalFundamentalSnap } from './externalSources';
import type { ScreenerHtmlDeep } from './screenerHtmlFundamentals';
import { normalizeDebtEquity, normalizeDivYield, normalizePercentMetric } from './metricNormalize';

const INDIAN_RATIO_KEYS = ['pe', 'pb', 'roe', 'roce', 'debtEquity', 'divYield', 'marketCapCr'] as const;

function pick(
  ...candidates: { value: number | null; source: string; priority: number }[]
): { value: number | null; source: string } {
  const valid = candidates.filter(c => c.value != null && Number.isFinite(c.value));
  valid.sort((a, b) => a.priority - b.priority);
  return valid[0] ?? { value: null, source: '—' };
}

export interface AccuracyMeta {
  metricSources: Record<string, string>;
  screenerAbout: string | null;
  salesCagr3y: number | null;
  salesCagr5y: number | null;
  profitCagr3y: number | null;
  profitCagr5y: number | null;
  sectorPe: number | null;
}

export function mergeIndianFundamentals(
  raw: RawFundamentals,
  extras: ExternalFundamentalSnap[],
  htmlDeep: ScreenerHtmlDeep | null,
  sectorPe: number | null,
): { raw: RawFundamentals; meta: AccuracyMeta } {
  const screenerApi = extras.find(e => e.source === 'Screener.in' && e.ok);
  const screenerPage = htmlDeep?.snap.ok ? htmlDeep.snap : null;
  const nse = extras.find(e => e.source === 'NSE India' && e.ok);

  const metricSources: Record<string, string> = {};

  const pricePick = pick(
    { value: nse?.cmp ?? null, source: 'NSE India', priority: 1 },
    { value: screenerPage?.cmp ?? null, source: 'Screener.in (page)', priority: 2 },
    { value: screenerApi?.cmp ?? null, source: 'Screener.in', priority: 3 },
    { value: raw.cmp, source: 'Yahoo Finance', priority: 4 },
  );
  raw.cmp = pricePick.value;
  metricSources.cmp = pricePick.source;

  const hiPick = pick(
    { value: screenerPage?.high52 ?? null, source: 'Screener.in (page)', priority: 1 },
    { value: screenerApi?.high52 ?? null, source: 'Screener.in', priority: 2 },
    { value: nse?.high52 ?? null, source: 'NSE India', priority: 3 },
    { value: raw.high52, source: 'Yahoo Finance', priority: 4 },
  );
  raw.high52 = hiPick.value;
  raw.low52 = pick(
    { value: screenerPage?.low52 ?? null, source: 'Screener.in (page)', priority: 1 },
    { value: screenerApi?.low52 ?? null, source: 'Screener.in', priority: 2 },
    { value: nse?.low52 ?? null, source: 'NSE India', priority: 3 },
    { value: raw.low52, source: 'Yahoo Finance', priority: 4 },
  ).value;
  metricSources.high52 = hiPick.source;

  for (const key of INDIAN_RATIO_KEYS) {
    const apiVal = screenerApi?.[key] ?? null;
    const pageVal = screenerPage?.[key] ?? null;
    let yahooVal = raw[key as keyof RawFundamentals] as number | null;
    if (key === 'roe' || key === 'roce') yahooVal = normalizePercentMetric(yahooVal, true);
    if (key === 'debtEquity') yahooVal = normalizeDebtEquity(yahooVal);
    if (key === 'divYield') yahooVal = normalizeDivYield(yahooVal);

    const chosen = pick(
      { value: pageVal, source: 'Screener.in (page)', priority: 1 },
      { value: apiVal, source: 'Screener.in', priority: 2 },
      { value: yahooVal, source: 'Yahoo Finance', priority: 3 },
    );
    switch (key) {
      case 'pe': raw.pe = chosen.value; break;
      case 'pb': raw.pb = chosen.value; break;
      case 'roe': raw.roe = chosen.value; break;
      case 'roce': raw.roce = chosen.value; break;
      case 'debtEquity': raw.debtEquity = chosen.value; break;
      case 'divYield': raw.divYield = chosen.value; break;
      case 'marketCapCr': raw.marketCapCr = chosen.value; break;
    }
    metricSources[key] = chosen.source;
  }

  if (htmlDeep?.salesCagr3y != null) {
    raw.revenueGrowth = htmlDeep.salesCagr3y;
    metricSources.revenueGrowth = 'Screener.in (page) — Compounded Sales 3Y';
  }
  if (htmlDeep?.profitCagr3y != null) {
    raw.earningsGrowth = htmlDeep.profitCagr3y;
    metricSources.earningsGrowth = 'Screener.in (page) — Compounded Profit 3Y';
  }

  if (screenerPage?.companyName) raw.companyName = screenerPage.companyName;
  else if (screenerApi?.companyName) raw.companyName = screenerApi.companyName;

  const meta: AccuracyMeta = {
    metricSources,
    screenerAbout: htmlDeep?.about ?? null,
    salesCagr3y: htmlDeep?.salesCagr3y ?? null,
    salesCagr5y: htmlDeep?.salesCagr5y ?? null,
    profitCagr3y: htmlDeep?.profitCagr3y ?? null,
    profitCagr5y: htmlDeep?.profitCagr5y ?? null,
    sectorPe,
  };

  return { raw, meta };
}

export function tightenDataConfidence(
  cross: CrossCheckResult,
  meta: AccuracyMeta,
  sectionsLive: number,
): 'HIGH' | 'MODERATE' | 'LOW' | 'VERY_LOW' {
  const screenerBacked = Object.values(meta.metricSources).filter(s => s.includes('Screener')).length;
  if (cross.overall === 'VERIFIED' && screenerBacked >= 5 && sectionsLive >= 9) return 'HIGH';
  if (cross.overall === 'VERIFIED' && screenerBacked >= 3) return 'HIGH';
  if (cross.overall === 'PARTIAL' && screenerBacked >= 4 && sectionsLive >= 7) return 'MODERATE';
  if (sectionsLive >= 7) return 'MODERATE';
  if (sectionsLive >= 4) return 'LOW';
  return 'VERY_LOW';
}
