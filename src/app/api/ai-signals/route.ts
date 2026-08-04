import { NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { getAllPredictions, type StoredPrediction } from '@/lib/predictionStore';

export const dynamic = 'force-dynamic';

function loadPredictions(): StoredPrediction[] {
  const inMemory = getAllPredictions();
  if (inMemory && inMemory.length > 0) return inMemory;
  // Node fallback: predictionStore persists to localStorage (browser-only), so
  // on the server read the worker's periodic snapshot instead.
  try {
    const dbPath = path.join(process.cwd(), '.quantum_db.json');
    if (existsSync(dbPath)) {
      const parsed = JSON.parse(readFileSync(dbPath, 'utf8'));
      if (parsed && Array.isArray(parsed.predictions) && parsed.predictions.length > 0) {
        return parsed.predictions as StoredPrediction[];
      }
    }
  } catch { /* fall through to empty */ }
  return [];
}

export async function GET() {
  try {
    const predictions = loadPredictions();
    const now = Date.now();
    const aiSignals = predictions
      .filter(p => p.source === 'AI_QUANT' && p.direction !== 'NEUTRAL')
      // Never serve expired or ancient predictions — stale signals (especially
      // bearish ones computed from broken indicators) mislead the dashboard.
      .filter(p => {
        if (p.expiryDate) {
          const exp = new Date(p.expiryDate).getTime();
          if (Number.isFinite(exp) && exp < now) return false;
        }
        if (p.createdAt && now - p.createdAt > 24 * 60 * 60 * 1000) return false;
        return true;
      })
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 25);

    const stats = {
      bullish: aiSignals.filter(s => s.direction === 'BULLISH').length,
      bearish: aiSignals.filter(s => s.direction === 'BEARISH').length,
      total: aiSignals.length,
    };

    return NextResponse.json({ signals: aiSignals, stats });
  } catch {
    return NextResponse.json({ signals: [], stats: { bullish: 0, bearish: 0, total: 0 } });
  }
}
