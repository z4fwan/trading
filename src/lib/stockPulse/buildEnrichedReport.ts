import type { RawFundamentals } from './fundamentalFetcher';
import { buildStockPulseReport } from './scoring';
import { fetchPeerRows } from './peers';
import { enrichReportWithLLM } from './llmNarrative';
import { renderStockPulseHtml } from './renderHtmlReport';
import type { PeerRow, StockPulseReport } from './types';

function buildEpsQuarters(raw: RawFundamentals) {
  const earnings = raw.earningsHistory.slice(-4);
  if (earnings.length < 2) return undefined;
  return earnings.map((e, i) => {
    const prev = i > 0 ? earnings[i - 1] : null;
    const yoy = prev && prev !== 0 ? ((e - prev) / Math.abs(prev)) * 100 : null;
    return {
      quarter: `FY${new Date().getFullYear() - (earnings.length - 1 - i)}`,
      eps: e != null ? e / 1e7 : null,
      yoyPct: yoy,
    };
  });
}

function subjectPeerRow(report: StockPulseReport): PeerRow {
  return {
    ticker: report.ticker,
    name: report.companyName,
    isSubject: true,
    marketCapCr: report.price.marketCapCr,
    pe: report.valuation.rows.find(r => r.label === 'P/E')?.current ?? null,
    pb: report.valuation.rows.find(r => r.label === 'P/B')?.current ?? null,
    roe: report.returns.roe,
    revGrowth: report.growth.revenueCagr3y,
    de: report.health.debtEquity,
    edge: 'This stock',
  };
}

export async function buildEnrichedStockPulseReport(
  raw: RawFundamentals,
  horizonYears: number,
  options?: { useLlm?: boolean },
): Promise<{ report: StockPulseReport; html: string }> {
  let report = buildStockPulseReport(raw, horizonYears);
  report = {
    ...report,
    epsQuarters: buildEpsQuarters(raw),
    businessBlurb: raw.accuracy?.screenerAbout || report.businessBlurb || `${report.companyName} operates in ${report.industry} (${report.sector}).`,
  };

  const peerRows = await fetchPeerRows(raw);
  report = {
    ...report,
    peers: [subjectPeerRow(report), ...peerRows.filter(p => p.ticker !== report.ticker).slice(0, 4)],
  };

  if (options?.useLlm !== false) {
    report = await enrichReportWithLLM(report);
  }

  const html = renderStockPulseHtml(report);
  return { report, html };
}
