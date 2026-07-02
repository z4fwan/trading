import type { CrossCheckMetric, CrossCheckResult, CrossCheckStatus } from './types';
import type { ExternalFundamentalSnap } from './externalSources';
import type { RawFundamentals } from './fundamentalFetcher';

type MetricKey = keyof Pick<
  ExternalFundamentalSnap,
  'cmp' | 'high52' | 'low52' | 'marketCapCr' | 'pe' | 'pb' | 'roe' | 'roce' | 'debtEquity' | 'divYield' | 'promoterPct' | 'fiiPct' | 'pledgingPct'
>;

const METRIC_DEFS: { key: MetricKey; label: string; unit: string; pctTolerance: number; absTolerance: number }[] = [
  { key: 'cmp', label: 'Current price', unit: '₹', pctTolerance: 1.5, absTolerance: 2 },
  { key: 'high52', label: '52-week high', unit: '₹', pctTolerance: 2, absTolerance: 5 },
  { key: 'low52', label: '52-week low', unit: '₹', pctTolerance: 2, absTolerance: 5 },
  { key: 'pe', label: 'P/E ratio', unit: '×', pctTolerance: 10, absTolerance: 3 },
  { key: 'pb', label: 'P/B ratio', unit: '×', pctTolerance: 12, absTolerance: 0.5 },
  { key: 'roe', label: 'ROE', unit: '%', pctTolerance: 15, absTolerance: 3 },
  { key: 'roce', label: 'ROCE', unit: '%', pctTolerance: 15, absTolerance: 3 },
  { key: 'debtEquity', label: 'Debt / Equity', unit: '×', pctTolerance: 20, absTolerance: 0.25 },
  { key: 'marketCapCr', label: 'Market cap', unit: '₹ Cr', pctTolerance: 8, absTolerance: 500 },
  { key: 'promoterPct', label: 'Promoter holding', unit: '%', pctTolerance: 5, absTolerance: 2 },
  { key: 'fiiPct', label: 'FII holding', unit: '%', pctTolerance: 8, absTolerance: 2 },
  { key: 'pledgingPct', label: 'Promoter pledging', unit: '%', pctTolerance: 15, absTolerance: 3 },
];

function relDiff(a: number, b: number): number {
  const base = Math.max(Math.abs(a), Math.abs(b), 1e-9);
  return (Math.abs(a - b) / base) * 100;
}

function classify(values: number[], pctTol: number, absTol: number): CrossCheckStatus {
  if (values.length === 0) return 'SINGLE_SOURCE';
  if (values.length === 1) return 'SINGLE_SOURCE';
  const max = Math.max(...values);
  const min = Math.min(...values);
  const diff = relDiff(max, min);
  const abs = Math.abs(max - min);
  if (diff <= pctTol || abs <= absTol) return 'AGREE';
  if (diff <= pctTol * 2.5 || abs <= absTol * 2) return 'CLOSE';
  return 'MISMATCH';
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function consensus(values: number[], status: CrossCheckStatus): number {
  if (values.length === 0) return 0;
  if (status === 'MISMATCH' && values.length >= 3) return median(values);
  if (values.length >= 2) {
    const counts = new Map<number, number>();
    for (const v of values) {
      const bucket = Math.round(v * 100) / 100;
      counts.set(bucket, (counts.get(bucket) || 0) + 1);
    }
    let best = values[0];
    let bestN = 0;
    for (const v of values) {
      const bucket = Math.round(v * 100) / 100;
      const n = counts.get(bucket) || 0;
      if (n > bestN) { bestN = n; best = v; }
    }
    return best;
  }
  return values[0];
}

function formatVal(key: MetricKey, v: number): string {
  if (key === 'cmp' || key === 'high52' || key === 'low52') return `₹${v.toFixed(2)}`;
  if (key === 'marketCapCr') return `₹${Math.round(v)} Cr`;
  if (key === 'pe' || key === 'pb' || key === 'debtEquity') return `${v.toFixed(2)}×`;
  return `${v.toFixed(2)}%`;
}

export function runCrossCheck(
  yahoo: RawFundamentals,
  extras: ExternalFundamentalSnap[],
): CrossCheckResult {
  const yahooPrimary: ExternalFundamentalSnap = {
    source: 'Yahoo Finance',
    ok: true,
    cmp: yahoo.cmp,
    high52: yahoo.high52,
    low52: yahoo.low52,
    marketCapCr: yahoo.marketCapCr,
    pe: yahoo.pe,
    pb: yahoo.pb,
    roe: yahoo.roe,
    roce: yahoo.roce,
    debtEquity: yahoo.debtEquity,
    divYield: yahoo.divYield,
    promoterPct: null,
    fiiPct: null,
    pledgingPct: null,
    companyName: yahoo.companyName,
  };

  const allSnaps = [yahooPrimary, ...extras.filter(e => e.ok)];
  const sourcesQueried = ['Yahoo Finance', 'NSE India', 'Screener.in', 'Screener.in (page)', 'Yahoo (quote vs summary)'];
  const sourcesResponded = [...new Set(allSnaps.map(s => s.source))];

  const metrics: CrossCheckMetric[] = [];

  for (const def of METRIC_DEFS) {
    const readings: { source: string; value: number | null; display: string }[] = [];
    for (const snap of allSnaps) {
      const v = snap[def.key];
      if (v != null && Number.isFinite(v)) {
        readings.push({ source: snap.source, value: v, display: formatVal(def.key, v) });
      }
    }
    const nums = readings.map(r => r.value!).filter(v => Number.isFinite(v));
    const status = classify(nums, def.pctTolerance, def.absTolerance);
    const adopted = nums.length > 0 ? consensus(nums, status) : null;

    let note = '';
    if (status === 'AGREE') note = `${nums.length} sources match within tolerance.`;
    else if (status === 'CLOSE') note = 'Sources close — small timing/rounding difference.';
    else if (status === 'MISMATCH') note = '⚠ Sources disagree — verify manually at Screener.in and NSE.';
    else if (readings.length === 1) note = '⚠ Only one source — verify at Screener.in.';
    else note = '⚠ Not found — check Screener.in';

    if (readings.length > 0) {
      metrics.push({
        key: def.key,
        label: def.label,
        unit: def.unit,
        readings,
        status: readings.length === 0 ? 'SINGLE_SOURCE' : status,
        adopted,
        note,
      });
    }
  }

  const verifiedCount = metrics.filter(m => m.status === 'AGREE' || m.status === 'CLOSE').length;
  const mismatchCount = metrics.filter(m => m.status === 'MISMATCH').length;
  const overall: CrossCheckResult['overall'] =
    verifiedCount >= 6 && mismatchCount === 0 ? 'VERIFIED'
      : verifiedCount >= 3 ? 'PARTIAL'
        : 'LOW';

  return {
    ranAt: Date.now(),
    metrics,
    sourcesQueried,
    sourcesResponded,
    verifiedCount,
    mismatchCount,
    overall,
  };
}

/** Apply cross-check consensus values onto raw fundamentals */
export function applyCrossCheckToRaw(raw: RawFundamentals, cross: CrossCheckResult): RawFundamentals {
  const next = { ...raw };
  for (const m of cross.metrics) {
    if (m.adopted == null) continue;
    switch (m.key) {
      case 'cmp': next.cmp = m.adopted; break;
      case 'high52': next.high52 = m.adopted; break;
      case 'low52': next.low52 = m.adopted; break;
      case 'marketCapCr': next.marketCapCr = m.adopted; break;
      case 'pe': next.pe = m.adopted; break;
      case 'pb': next.pb = m.adopted; break;
      case 'roe': next.roe = m.adopted; break;
      case 'roce': next.roce = m.adopted; break;
      case 'debtEquity': next.debtEquity = m.adopted; break;
      case 'divYield': next.divYield = m.adopted; break;
      default: break;
    }
  }
  return next;
}

export function ownershipFromCrossCheck(extras: ExternalFundamentalSnap[]): {
  promoterPct: number | null;
  fiiPct: number | null;
  pledgingPct: number | null;
} {
  const screener = extras.find(e => e.source === 'Screener.in' && e.ok);
  return {
    promoterPct: screener?.promoterPct ?? null,
    fiiPct: screener?.fiiPct ?? null,
    pledgingPct: screener?.pledgingPct ?? null,
  };
}
