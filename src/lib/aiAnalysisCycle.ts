import { getFullUniverse } from './dynamicUniverse';
import { calculateIndicators, buildCandleHistory } from './technicalAnalysis';
import { analyzeStockWithLLM, type AIStockAnalysisResult } from './aiStockAnalysis';
import { sendAICandidateAlert } from './telegramBot';

let lastAnalysisTime = 0;
const ANALYSIS_COOLDOWN_MS = 30 * 60 * 1000;

export async function runAIAnalysisCycle(
  getHistory: (ticker: string) => { close: number; high: number; low: number; volume: number; date?: number }[] | null,
  getStockPrice: (ticker: string) => { price: number; changePercent: number; volume: number } | null,
  force = false,
): Promise<AIStockAnalysisResult[]> {
  const now = Date.now();
  if (!force && now - lastAnalysisTime < ANALYSIS_COOLDOWN_MS) return [];
  lastAnalysisTime = now;

  const universe = getFullUniverse();
  const candidates: { ticker: string; name: string; price: number; changePercent: number; volume: number; ta: any }[] = [];

  let scanned = 0, priceOk = 0, histOk = 0, candlesOk = 0, taOk = 0;
  // Scan entire universe for tickers with available price + history
  for (const ticker of universe) {
    try {
      scanned++;
      const stock = getStockPrice(ticker);
      if (!stock || stock.price <= 0) continue;
      priceOk++;
      const hist = getHistory(ticker);
      if (!hist || hist.length < 50) continue;
      histOk++;
      const ohlc = hist.map((h, i) => ({ ...h, open: i > 0 ? hist[i - 1].close : h.close }));
      const hl = { high: Math.max(...ohlc.map(h => h.high)), low: Math.min(...ohlc.map(h => h.low)) };
      const candles = buildCandleHistory(ohlc, stock.price, stock.volume, ohlc[ohlc.length - 1]?.close || stock.price, hl.high, hl.low);
      if (candles.length < 50) continue;
      candlesOk++;
      const ta = calculateIndicators(candles);
      if (!ta) continue;
      taOk++;

      candidates.push({
        ticker, name: ticker.replace('.NS', ''),
        price: stock.price, changePercent: stock.changePercent,
        volume: stock.volume, ta,
      });

      if (candidates.length >= 10) break;
    } catch { continue; }
  }

  if (candidates.length === 0) {
    console.warn(`[AIAnalysis] No candidates: scanned=${scanned} universe=${universe.length} price=${priceOk} hist50=${histOk} candles50=${candlesOk} ta=${taOk}`);
    return [];
  }
  console.log(`[AIAnalysis] ${candidates.length} candidates found: scanned=${scanned} price=${priceOk} hist=${histOk} candles=${candlesOk} ta=${taOk}`);

  candidates.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));

  const results: AIStockAnalysisResult[] = [];

  async function analyzeBatch(batch: typeof candidates, type: 'INTRADAY' | 'SHORT_TERM' | 'LONG_TERM') {
    for (const s of batch) {
      try {
        const r = await analyzeStockWithLLM(s.ticker, s.name, s.price, s.changePercent, s.volume, s.ta, type);
        if (r && r.direction !== 'NEUTRAL') {
          results.push(r);
          sendAICandidateAlert(r).catch(() => {});
        }
      } catch { /* individual stock analysis failure is non-fatal */ }
      await new Promise(r => setTimeout(r, 600));
    }
  }

  await analyzeBatch(candidates.slice(0, 3), 'INTRADAY');
  await analyzeBatch(candidates.slice(3, 6), 'SHORT_TERM');
  await analyzeBatch(candidates.slice(6, 10), 'LONG_TERM');

  return results;
}
