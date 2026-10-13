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

const PREDICT_TIMEOUT_MS = 30_000; // Free-tier cold starts can take 30-60s

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

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://127.0.0.1:8080';

let _backendDown = false;
let _backendDownUntil = 0;
const BACKOFF_MS = 5 * 60 * 1000; // 5 min backoff when backend unreachable

export async function getPythonMLPrediction(eventData: PythonEventData): Promise<PythonPrediction> {
  if (_backendDown && Date.now() < _backendDownUntil) {
    throw new Error('Python ML Backend offline (backoff)');
  }
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
    const res = await fetch(`${PYTHON_BACKEND_URL}/predict`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Key': process.env.SUPABASE_SERVICE_KEY || 'dev-key'
      },
      body: JSON.stringify({ raw_data: safeEvent }),
      signal: AbortSignal.timeout(PREDICT_TIMEOUT_MS),
    });
    
    // Backend is reachable — reset backoff
    _backendDown = false;
    
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown API error' }));
      throw new Error(`Python ML Engine Error [${res.status}]: ${JSON.stringify(err)}`);
    }
    
    const data = await res.json();
    return data as PythonPrediction;
  } catch (e: any) {
    // If backend is unreachable (connection refused, DNS, timeout, transport),
    // back off instead of spamming every cycle. HTTP status errors (4xx/5xx)
    // are NOT treated as unreachable — the backend is up, just rejecting.
    const msg = `${e?.message || ''} ${e?.cause?.code || ''}`;
    const isNetworkError = /ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|ECONNRESET|fetch failed/i.test(msg)
      || e?.name === 'AbortError' || e?.name === 'TimeoutError' || e?.name === 'TypeError';
    if (isNetworkError) {
      if (!_backendDown) {
        console.warn('[ML Pipeline] Python Backend offline — backing off for 5 min');
      }
      _backendDown = true;
      _backendDownUntil = Date.now() + BACKOFF_MS;
    }
    throw e;
  }
}

let _lastWarmAt = 0;

/**
 * Light keep-alive ping so the free-tier Python service doesn't spin down
 * between ML cycles. Only attempts every 4 minutes and never while a backoff
 * is active; failures do not extend the backoff or spam errors.
 */
export async function warmPythonBackend(): Promise<void> {
  const now = Date.now();
  if (_backendDown && now < _backendDownUntil) return;
  if (now - _lastWarmAt < 4 * 60 * 1000) return;
  _lastWarmAt = now;
  try {
    await fetch(`${PYTHON_BACKEND_URL}/health`, { signal: AbortSignal.timeout(8000), cache: 'no-store' });
    if (_backendDown) {
      _backendDown = false;
      _backendDownUntil = 0;
      console.log('[ML Pipeline] Python Backend reachable again');
    }
  } catch {
    // best-effort keep-alive; ignore failures silently
  }
}
