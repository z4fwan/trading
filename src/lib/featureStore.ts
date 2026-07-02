export interface FeatureValue<T> {
  value: T;
  timestamp: number; // Date.now()
  quality: number; // 0-100 (e.g., 99 for precise tick data, 50 for estimated options flow)
  source: string; // 'YAHOO', 'NSE_DIRECT', 'BSE_DIRECT', 'COMPUTED'
  latency_ms?: number;
  cache_hit?: boolean;
  schema_version?: string;
}

export interface TechnicalState {
  rsi: FeatureValue<number>;
  vwapDistancePct: FeatureValue<number>;
  relativeVolume: FeatureValue<number>;
  macdSignal: FeatureValue<'BULLISH' | 'BEARISH' | 'NEUTRAL'>;
}

const store = new Map<string, TechnicalState>();

export function updateFeature<T>(
  ticker: string, 
  featureName: keyof TechnicalState, 
  value: FeatureValue<any>
) {
  let state = store.get(ticker);
  if (!state) {
    state = {} as TechnicalState;
  }
  (state as any)[featureName] = value;
  store.set(ticker, state);
}

export function getFeature<T>(ticker: string, featureName: keyof TechnicalState): FeatureValue<T> | null {
  const state = store.get(ticker);
  if (!state || !state[featureName]) return null;
  
  const feat = state[featureName] as unknown as FeatureValue<T>;
  
  // Calculate freshness (Age in ms)
  const ageMs = Date.now() - feat.timestamp;
  
  // If age is over 15 minutes (900_000ms), degrade quality by 50%
  let adjustedQuality = feat.quality;
  if (ageMs > 900_000) {
    adjustedQuality = Math.max(0, adjustedQuality - 50);
  } else if (ageMs > 60_000) {
    // Over 1 minute, degrade slightly
    adjustedQuality = Math.max(0, adjustedQuality - 10);
  }

  return {
    ...feat,
    quality: adjustedQuality
  };
}

export function getAllFeatures(ticker: string): TechnicalState | null {
  const state = store.get(ticker);
  if (!state) return null;
  
  // Return with degraded qualities
  const keys = Object.keys(state) as Array<keyof TechnicalState>;
  const result = {} as TechnicalState;
  for (const k of keys) {
    result[k] = getFeature(ticker, k) as any;
  }
  return result;
}
