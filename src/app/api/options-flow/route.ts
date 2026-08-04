import { NextRequest } from 'next/server';
import { analyzeOptionsFlow, scanUnusualOptionsActivity, getOptionsFlowStats } from '@/lib/optionsFlowAnalysis';
import { INDIAN_EQUITY_TICKERS } from '@/lib/marketConfig';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

let lastScanResults: { tickers: string[]; results: Map<string, any[]>; scannedAt: number } | null = null;
const SCAN_TTL = 30 * 60 * 1000;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker');
  const action = searchParams.get('action');

  if (action === 'stats') {
    return Response.json({ cache: getOptionsFlowStats(), lastScan: lastScanResults ? {
      tickers: lastScanResults.tickers.length,
      scannedAt: lastScanResults.scannedAt,
      alertsFound: [...lastScanResults.results.values()].reduce((s, a) => s + a.length, 0),
    } : null });
  }

  if (ticker) {
    try {
      const activities = await analyzeOptionsFlow(ticker.toUpperCase());
      return Response.json({ ticker: ticker.toUpperCase(), activities, cache: getOptionsFlowStats() });
    } catch (e) {
      return Response.json({ ticker: ticker.toUpperCase(), activities: [], error: String(e) });
    }
  }

  // Return cached scan or run a fresh one on top tickers
  if (lastScanResults && Date.now() - lastScanResults.scannedAt < SCAN_TTL) {
    const serializable = Object.fromEntries(lastScanResults.results);
    return Response.json({ tickers: lastScanResults.tickers, results: serializable, scannedAt: lastScanResults.scannedAt, cached: true });
  }

  try {
    const tickers = INDIAN_EQUITY_TICKERS.slice(0, 50);
    const results = await scanUnusualOptionsActivity(tickers, 5);
    lastScanResults = { tickers, results, scannedAt: Date.now() };
    const serializable = Object.fromEntries(results);
    const totalAlerts = [...results.values()].reduce((s, a) => s + a.length, 0);
    return Response.json({ tickers, results: serializable, scannedAt: Date.now(), cached: false, totalAlerts });
  } catch (e) {
    return Response.json({ tickers: [], results: {}, error: String(e) });
  }
}
