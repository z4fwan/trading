/**
 * Python Backend Bridge (Quantum Alpha V3)
 * 
 * Connects the Next.js Worker Thread to the local Python Microservice.
 * Allows the system to offload heavy XGBoost/LightGBM ML inference and 
 * statistical validation to Python, falling back to TypeScript if offline.
 */

export interface PythonEventData {
  symbol: string;
  prices: number[];
  volumes: number[];
  event: Record<string, any>;
}

export interface PythonPrediction {
  probability: number;
  explanation: Record<string, number>;
  prediction_id: string;
  request_id: string;
  model_version: string;
  dataset_version: string;
  feature_version: string;
  created_at: string;
  features_used: number[];
}

const PREDICT_TIMEOUT_MS = 15_000;

/**
 * Sanitize a numeric series before it reaches numpy. Yahoo/our scanners can
 * return 0, NaN or Infinity (frozen listings, paused scrips) and the Python
 * feature engine hard-crashes with "Input X contains infinity or a value too
 * large for dtype('float64')" on such input. Filter to finite positives and
 * repair zero volumes with the median so the model always gets a valid vector.
 */
function sanitizeSeries(series: number[]): number[] {
  const finite = series.filter(v => Number.isFinite(v) && v > 0);
  if (finite.length === 0) return [];
  return finite;
}

function sanitizeVolumes(volumes: number[]): number[] {
  const finite = volumes.filter(v => Number.isFinite(v));
  const positive = finite.filter(v => v > 0);
  const median = positive.length > 0
    ? positive.slice().sort((a, b) => a - b)[Math.floor(positive.length / 2)]
    : 0;
  // Replace 0 / negative / NaN volumes with the median so division-by-zero in
  // feature engineering can never produce Infinity.
  return finite.map(v => (v > 0 ? v : median));
}

export async function getPythonMLPrediction(eventData: PythonEventData): Promise<PythonPrediction> {
  const prices = sanitizeSeries(eventData.prices);
  const volumes = sanitizeVolumes(eventData.volumes);
  if (prices.length < 10) {
    throw new Error('Python ML Engine rejected: insufficient finite price data');
  }
  const safeEvent: PythonEventData = {
    symbol: eventData.symbol,
    prices,
    volumes,
    event: eventData.event,
  };
  try {
    const res = await fetch('http://127.0.0.1:8080/predict', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Key': process.env.SUPABASE_SERVICE_KEY || 'dev-key'
      },
      body: JSON.stringify({ raw_data: safeEvent }),
      signal: AbortSignal.timeout(PREDICT_TIMEOUT_MS),
    });
    
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown API error' }));
      throw new Error(`Python ML Engine Error [${res.status}]: ${JSON.stringify(err)}`);
    }
    
    const data = await res.json();
    return data as PythonPrediction;
  } catch (e) {
    // NO SILENT FAILURES. The ML Pipeline is strictly Python now.
    console.error('[ML Pipeline] Critical failure in Python Bridge:', e);
    throw e;
  }
}
