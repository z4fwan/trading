import { NextResponse } from 'next/server';
import { getFullUniverse } from '@/lib/dynamicUniverse';
import { calculateIndicators, buildCandleHistory } from '@/lib/technicalAnalysis';
import { analyzeStockWithLLM, type AIStockAnalysisResult } from '@/lib/aiStockAnalysis';
import { sendAICandidateAlert } from '@/lib/telegramBot';
import { tickerToYahoo } from '@/lib/marketConfig';
import YahooFinance from 'yahoo-finance2';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const yf = new YahooFinance({ validation: { logErrors: false } });


async function fetchHistory(ticker: string): Promise<{ close: number; high: number; low: number; volume: number; date?: number }[] | null> {
  try {
    const symbol = tickerToYahoo(ticker);
    const p1 = new Date(); p1.setFullYear(p1.getFullYear() - 1);
    const result = await yf.chart(symbol, { period1: p1, period2: new Date(), interval: '1d', return: 'array' });
    const candles: { close: number; high: number; low: number; volume: number; date?: number }[] = [];
    for (const q of result.quotes) {
      if (q.open != null && q.high != null && q.low != null && q.close != null && q.volume != null) {
        candles.push({
          date: q.date ? Math.floor(q.date.getTime() / 1000) : undefined,
          close: q.close, high: q.high, low: q.low, volume: q.volume,
        });
      }
    }
    return candles.length > 30 ? candles : null;
  } catch { return null; }
}

export async function POST() {
  const universe = getFullUniverse();
  const candidates: { ticker: string; name: string; price: number; changePercent: number; volume: number; ta: any }[] = [];

  const priority = ['RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS', 'INFY.NS', 'ICICIBANK.NS',
    'HINDUNILVR.NS', 'ITC.NS', 'SBIN.NS', 'BHARTIARTL.NS', 'KOTAKBANK.NS',
    'LT.NS', 'WIPRO.NS', 'AXISBANK.NS', 'BAJFINANCE.NS', 'MARUTI.NS',
    'TITAN.NS', 'ASIANPAINT.NS', 'SUNPHARMA.NS', 'NTPC.NS', 'ONGC.NS',
    'POWERGRID.NS', 'ULTRACEMCO.NS', 'HCLTECH.NS', 'BAJAJFINSV.NS', 'ADANIPORTS.NS',
    'JSWSTEEL.NS', 'TECHM.NS', 'NESTLEIND.NS', 'GRASIM.NS', 'INDUSINDBK.NS',
    'DRREDDY.NS', 'BRITANNIA.NS', 'APOLLOHOSP.NS', 'CIPLA.NS', 'DIVISLAB.NS',
    'HDFCLIFE.NS', 'SBILIFE.NS', 'EICHERMOT.NS', 'COALINDIA.NS', 'BPCL.NS',
    'HINDALCO.NS', 'IOC.NS', 'TATASTEEL.NS', 'HEROMOTOCO.NS', 'BAJAJ-AUTO.NS',
    'TATACONSUM.NS', 'SHREECEM.NS', 'M&M.NS', 'ADANIENT.NS', 'TRENT.NS'];

  for (const ticker of [...priority, ...universe.filter(t => !priority.includes(t)).slice(0, 50)]) {
    if (candidates.length >= 10) break;
    try {
      const hist = await fetchHistory(ticker);
      if (!hist || hist.length < 50) continue;
      const last = hist[hist.length - 1];
      const prev = hist.length > 1 ? hist[hist.length - 2] : null;
      const price = last.close;
      const changePercent = prev ? ((last.close - prev.close) / prev.close) * 100 : 0;
      const volume = last.volume;

      const ohlc = hist.map((h, i) => ({ ...h, open: i > 0 ? hist[i - 1].close : h.close }));
      const hl = { high: Math.max(...ohlc.map(h => h.high)), low: Math.min(...ohlc.map(h => h.low)) };
      const candles = buildCandleHistory(ohlc, price, volume, ohlc[ohlc.length - 1]?.close || price, hl.high, hl.low);
      if (candles.length < 50) continue;
      const ta = calculateIndicators(candles);
      if (!ta) continue;

      candidates.push({
        ticker, name: ticker.replace('.NS', ''),
        price, changePercent, volume: volume || 1000000, ta,
      });
    } catch { continue; }
  }

  if (candidates.length === 0) {
    return NextResponse.json({ analyzed: 0, candidates: 0, status: 'no-candidates' });
  }

  candidates.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));

  type AnalysisDetail = { ticker: string; type: string; direction: string; confidence: number; reasoning: string; error?: string };
  const analysisDetails: AnalysisDetail[] = [];
  const results: AIStockAnalysisResult[] = [];
  const previousSignals: string[] = [];

  function buildContext(): string {
    if (previousSignals.length === 0) return '';
    const bullish = previousSignals.filter(s => s === 'BULLISH').length;
    const bearish = previousSignals.filter(s => s === 'BEARISH').length;
    const neutral = previousSignals.filter(s => s === 'NEUTRAL').length;
    return `So far analyzed ${previousSignals.length} stocks: ${bullish} BULLISH, ${bearish} BEARISH, ${neutral} NEUTRAL.`;
  }

  async function analyzeBatch(batch: typeof candidates, type: 'INTRADAY' | 'SHORT_TERM' | 'LONG_TERM') {
    for (const s of batch) {
      try {
        const ctx = buildContext();
        const r = await analyzeStockWithLLM(s.ticker, s.name, s.price, s.changePercent, s.volume, s.ta, type, undefined, ctx);
        const dir = r?.direction || 'ERROR';
        previousSignals.push(dir);
        analysisDetails.push({
          ticker: s.ticker, type,
          direction: dir,
          confidence: r?.confidence || 0,
          reasoning: (r?.reasoning || [''])[0],
          error: r ? undefined : 'LLM returned null',
        });
        if (r && r.direction !== 'NEUTRAL') {
          results.push(r);
          sendAICandidateAlert(r).catch(() => {});
        }
      } catch (e) {
        previousSignals.push('ERROR');
        analysisDetails.push({ ticker: s.ticker, type, direction: 'ERROR', confidence: 0, reasoning: '', error: String(e) });
      }
      await new Promise(r => setTimeout(r, 600));
    }
  }

  await analyzeBatch(candidates.slice(0, 3), 'INTRADAY');
  await analyzeBatch(candidates.slice(3, 6), 'SHORT_TERM');
  await analyzeBatch(candidates.slice(6, 10), 'LONG_TERM');

  // Post-hoc diversity rebalancer: if >80% of non-ERROR signals are the same direction,
  // re-analyze the strongest counter-signal candidate
  const nonError = results.filter(r => r.direction === 'BULLISH' || r.direction === 'BEARISH');
  const bullishCount = nonError.filter(r => r.direction === 'BULLISH').length;
  const bearishCount = nonError.filter(r => r.direction === 'BEARISH').length;
  const total = nonError.length;

  if (total >= 3 && (bullishCount === 0 || bearishCount === 0)) {
    const dominantDir = bullishCount > bearishCount ? 'BULLISH' : 'BEARISH';
    const oppositeDir = dominantDir === 'BULLISH' ? 'BEARISH' : 'BULLISH';

    // Find the candidate with the strongest counter-signal TA setup
    const candidate = candidates
      .filter(c => {
        const ta = c.ta;
        if (oppositeDir === 'BULLISH') return ta.rsi < 40 && ta.stochRsi < 20;
        return ta.rsi > 60 && ta.stochRsi > 80;
      })
      .sort((a, b) => oppositeDir === 'BULLISH'
        ? a.ta.rsi - b.ta.rsi
        : b.ta.rsi - a.ta.rsi)
      [0];

    if (candidate) {
      const ctx = `All ${total} previous signals were ${dominantDir}. The market may be one-sided. Actively search for a ${oppositeDir} case here.`;
      const r = await analyzeStockWithLLM(candidate.ticker, candidate.name, candidate.price,
        candidate.changePercent, candidate.volume, candidate.ta, 'SHORT_TERM', undefined, ctx);
      if (r && r.direction === oppositeDir) {
        results.push(r);
        sendAICandidateAlert(r).catch(() => {});
        analysisDetails.push({
          ticker: candidate.ticker, type: 'DIVERSITY',
          direction: r.direction,
          confidence: r.confidence,
          reasoning: (r.reasoning || [''])[0],
          error: undefined,
        });
      }
    }
  }

  return NextResponse.json({
    analyzed: results.length,
    candidates: candidates.length,
    status: 'ok',
    tickers: candidates.map(c => c.ticker),
    signals: results.map(r => ({ ticker: r.ticker, direction: r.direction, confidence: r.confidence })),
    details: analysisDetails,
  });
}
