import dotenv from 'dotenv';
dotenv.config({ path: 'C:/Users/z4fwa/OneDrive/Pictures/Documents/trading-dashboard/.env.local', override: true });

const t0 = Date.now();
// stderr is unbuffered on Windows pipes — guarantees progress is visible even
// if the process is killed before stdout flushes.
const log = (m: string) => console.error(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
  Promise.race([
    p,
    new Promise<T>((_, rej) => {
      const t = setTimeout(() => rej(new Error(`timeout after ${ms}ms`)), ms);
      t.unref();
    }),
  ]);

// Hard watchdog: whatever happens, force-exit so this runner can never hang a
// CI/terminal run forever (network calls to Yahoo have no own timeout).
const watchdog = setTimeout(() => {
  log('WATCHDOG: forcing exit after 420s');
  process.exit(1);
}, 420_000);
watchdog.unref();

async function main() {
  log('starting runner');
  const q = await import('./src/lib/quoteFetcher');
  const { getMarketSummary } = await import('./src/lib/exchangeHours');
  log('imported quoteFetcher; warming quote cache via TradingView scanner...');
  // TradingView scanner populates the cache directly and matches Yahoo prices
  // (verified: RELIANCE 1308, HDFCBANK 751, KIOCL 398.8). Resilient + fast.
  try {
    await withTimeout(q.fetchTradingViewIndia(getMarketSummary()), 30_000);
    log('TradingView scanner warmup done');
  } catch (e) {
    log('TradingView warmup failed: ' + String((e as Error).message).slice(0, 80));
  }
  const result = q.getAllCachedQuotes();
  const priced = Object.values(result).filter((s) => (s.price ?? 0) > 0).length;
  log(`warmup done: ${priced}/${Object.keys(result).length} priced`);
  log('running scan...');
  const { runAutoIntradayScan } = await import('./src/lib/autoIntradayScanner');
  await withTimeout(runAutoIntradayScan(true), 240_000);
  log('=== LIVE SCAN COMPLETE ===');
  // Let the process exit naturally so buffered stdout is flushed to the log.
  setTimeout(() => {}, 2000);
}

main().catch((e) => {
  console.error('LIVE SCAN ERROR:', e);
  process.exit(1);
});
