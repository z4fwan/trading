export interface DataSourceVerification {
  source: string;
  status: 'fresh' | 'stale' | 'error';
  lastUpdated: number;
  age: number;
  reliability: number;
  entriesCount: number;
}

export interface PriceVerificationResult {
  ticker: string;
  price: number;
  previousPrice: number;
  changePercent: number;
  isAnomalous: boolean;
  anomalyReason: string[];
  sourceReliability: number;
  dataAge: number;
  isFrozen: boolean;
}

export interface GlobalCuesData {
  usClose: number | null;
  asianMarkets: number | null;
  giftNifty: number | null;
  vix: number | null;
  timestamp: number;
  usMarketStatus: string;
  asianMarketStatus: string;
  isLive: boolean;
}

const PRICE_ANOMALY_THRESHOLD = 0.15; // 15% change in single tick = anomaly
const STALE_DATA_THRESHOLD_MS = 120_000; // 2 minutes without update = stale

let lastGlobalCues: GlobalCuesData | null = null;
let lastCuesFetch = 0;
const CUES_CACHE_TTL = 30_000; // 30 seconds

export function verifyPriceData(
  ticker: string,
  price: number,
  previousPrice: number,
  sourceReliability: number,
  dataTimestamp: number,
  isFrozen: boolean,
): PriceVerificationResult {
  const reasons: string[] = [];
  const changePercent = previousPrice > 0 ? Math.abs(price - previousPrice) / previousPrice : 0;
  let isAnomalous = false;

  if (isFrozen) {
    reasons.push('Price frozen (market closed)');
  }

  if (changePercent > PRICE_ANOMALY_THRESHOLD && !isFrozen) {
    isAnomalous = true;
    reasons.push(`Price moved ${(changePercent * 100).toFixed(1)}% in single tick (threshold: ${PRICE_ANOMALY_THRESHOLD * 100}%)`);
  }

  if (price <= 0) {
    isAnomalous = true;
    reasons.push('Zero or negative price');
  }

  const dataAge = Date.now() - dataTimestamp;

  return {
    ticker,
    price,
    previousPrice,
    changePercent: parseFloat((changePercent * 100).toFixed(2)),
    isAnomalous,
    anomalyReason: reasons,
    sourceReliability,
    dataAge,
    isFrozen,
  };
}

export function checkDataFreshness(
  sources: { name: string; lastUpdate: number }[],
): DataSourceVerification[] {
  const now = Date.now();
  return sources.map(s => {
    const age = now - s.lastUpdate;
    let status: 'fresh' | 'stale' | 'error';
    let reliability: number;

    if (age < STALE_DATA_THRESHOLD_MS) {
      status = 'fresh';
      reliability = 100 - Math.floor(age / 1000);
    } else if (age < STALE_DATA_THRESHOLD_MS * 3) {
      status = 'stale';
      reliability = Math.max(20, 50 - Math.floor(age / 60000));
    } else {
      status = 'error';
      reliability = 0;
    }

    return {
      source: s.name,
      status,
      lastUpdated: s.lastUpdate,
      age,
      reliability,
      entriesCount: 0,
    };
  });
}

export function getDataQualityScore(verifications: DataSourceVerification[]): number {
  if (verifications.length === 0) return 0;
  const avgReliability = verifications.reduce((s, v) => s + v.reliability, 0) / verifications.length;
  const freshCount = verifications.filter(v => v.status === 'fresh').length;
  const freshnessRatio = freshCount / verifications.length;
  return Math.round(avgReliability * 0.6 + freshnessRatio * 100 * 0.4);
}

export function getDataQualityLabel(score: number): { label: string; color: string } {
  if (score >= 90) return { label: 'EXCELLENT', color: 'text-emerald-400' };
  if (score >= 70) return { label: 'GOOD', color: 'text-blue-400' };
  if (score >= 50) return { label: 'FAIR', color: 'text-yellow-400' };
  if (score >= 30) return { label: 'POOR', color: 'text-orange-400' };
  return { label: 'CRITICAL', color: 'text-red-400' };
}

export function getStaleSourceCount(verifications: DataSourceVerification[]): number {
  return verifications.filter(v => v.status !== 'fresh').length;
}

export async function fetchRealGlobalCues(): Promise<GlobalCuesData> {
  const now = Date.now();
  if (lastGlobalCues && now - lastCuesFetch < CUES_CACHE_TTL) {
    return lastGlobalCues;
  }

  try {
    const res = await fetch('/api/global-cues', { cache: 'no-store' });
    if (!res.ok) throw new Error(`API returned ${res.status}`);
    const data = await res.json();

    const cues: GlobalCuesData = {
      usClose: data.usClose ?? null,
      asianMarkets: data.asianMarkets ?? null,
      giftNifty: data.giftNifty ?? null,
      vix: data.vix ?? null,
      timestamp: now,
      usMarketStatus: data.usMarketStatus ?? 'UNKNOWN',
      asianMarketStatus: data.asianMarketStatus ?? 'UNKNOWN',
      isLive: data._live === true,
    };

    lastGlobalCues = cues;
    lastCuesFetch = now;
    return cues;
  } catch {
    const fallback: GlobalCuesData = {
      usClose: null,
      asianMarkets: null,
      giftNifty: null,
      vix: null,
      timestamp: now,
      usMarketStatus: 'UNKNOWN',
      asianMarketStatus: 'UNKNOWN',
      isLive: false,
    };
    lastGlobalCues = fallback;
    lastCuesFetch = now;
    return fallback;
  }
}

export function getLastGlobalCues(): GlobalCuesData | null {
  return lastGlobalCues;
}
