import { NextRequest } from 'next/server';
import { runQuantStrategies } from '@/lib/quantStrategies';
import { getCachedHistory, prefetchHistoryBatch } from '@/lib/backgroundEngine';
import { INDIAN_EQUITY_TICKERS } from '@/lib/marketConfig';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

let lastScanResults: { signals: any[]; tickersScanned: number; scannedAt: number } | null = null;
const SCAN_TTL = 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker');

  if (ticker) {
    const hist = getCachedHistory(ticker.toUpperCase());
    if (!hist || hist.length < 60) {
      return Response.json({ ticker: ticker.toUpperCase(), error: 'Insufficient cached history (need 60+ candles)', candlesAvailable: hist?.length || 0 });
    }
    try {
      const prices = hist.map(c => c.close);
      const volumes = hist.map(c => c.volume);
      const signals = runQuantStrategies(ticker.toUpperCase(), prices, volumes);
      return Response.json({ ticker: ticker.toUpperCase(), signals, candlesUsed: hist.length });
    } catch (e) {
      return Response.json({ ticker: ticker.toUpperCase(), signals: [], error: String(e) });
    }
  }

  // Bulk scan
  if (lastScanResults && Date.now() - lastScanResults.scannedAt < SCAN_TTL) {
    return Response.json({ ...lastScanResults, cached: true });
  }

  const topTickers = INDIAN_EQUITY_TICKERS.slice(0, 30);
  await prefetchHistoryBatch(topTickers);
  const allSignals: any[] = [];
  let tickersScanned = 0;

  for (const t of topTickers) {
    const hist = getCachedHistory(t);
    if (!hist || hist.length < 60) continue;
    try {
      const prices = hist.map(c => c.close);
      const volumes = hist.map(c => c.volume);
      const signals = runQuantStrategies(t, prices, volumes);
      allSignals.push(...signals);
      tickersScanned++;
    } catch { /* skip */ }
  }

  lastScanResults = { signals: allSignals, tickersScanned, scannedAt: Date.now() };
  return Response.json({ signals: allSignals, tickersScanned, scannedAt: Date.now(), cached: false });
}
