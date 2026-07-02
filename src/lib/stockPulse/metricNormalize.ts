/** Normalize Yahoo vs Screener unit inconsistencies */

export function normalizePercentMetric(v: number | null, likelyAlreadyPercent = false): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  if (likelyAlreadyPercent) return v;
  if (Math.abs(v) <= 1.5 && Math.abs(v) > 0) return v * 100;
  return v;
}

export function normalizeDebtEquity(v: number | null): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  if (v > 8) return v / 100;
  return v;
}

export function normalizeDivYield(v: number | null): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  if (v > 0 && v < 0.2) return v * 100;
  return v;
}
