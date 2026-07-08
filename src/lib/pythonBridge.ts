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

export async function getPythonMLPrediction(eventData: PythonEventData): Promise<PythonPrediction> {
  try {
    const res = await fetch('http://127.0.0.1:8000/predict', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-Service-Key': process.env.SUPABASE_SERVICE_KEY || 'dev-key'
      },
      body: JSON.stringify({ raw_data: eventData })
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
