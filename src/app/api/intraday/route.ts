import { NextResponse } from 'next/server';
import { NIFTY_50_TICKERS, INDIAN_EQUITY_TICKERS, tickerToYahoo, getTickerName } from '@/lib/marketConfig';
import { buildCandleHistory, calculateIndicators } from '@/lib/technicalAnalysis';
import { analyzeStockWithLLM } from '@/lib/aiStockAnalysis';
import { detectCandlestickPatterns, type CandlestickPattern } from '@/lib/advancedMarketIntelligence';
import type { OHLC } from '@/lib/technicalAnalysis';
import { sendIntradayCandidateAlert } from '@/lib/telegramBot';
import { getAllCachedQuotes, getMarketContext, getLivePrice } from '@/lib/quoteFetcher';
import { getLastScanTime, getScanCursor } from '@/lib/autoIntradayScanner';
import YahooFinance from 'yahoo-finance2';
import {
  getIntradayCalls, setIntradayCalls,
  getIntradayPlan, setIntradayPlan,
  getLastGenerated, setLastGenerated,
  updateCall, resolveCalls,
  type IntradayCall, type IntradayPlan,
} from '@/lib/intradayStore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const yf = new YahooFinance({ validation: { logErrors: false } });


const DEFAULT_CAPITAL = 50000;
const RISK_PER_TRADE_PCT = 5;
const MAX_LOSS_PER_DAY_PCT = 20;

function calcQuantity(capital: number, entry: number, stopLoss: number, riskPct: number): number {
  const riskAmount = capital * (riskPct / 100);
  const shareRisk = Math.abs(entry - stopLoss);
  if (shareRisk === 0) return 1;
  const qty = Math.max(1, Math.floor(riskAmount / shareRisk));
  return Math.min(qty, Math.floor(capital / entry));
}

function calcReturnPct(entry: number, target: number): number {
  return ((target - entry) / entry) * 100;
}

function calcRiskReward(entry: number, target: number, stopLoss: number): number {
  const gain = Math.abs(target - entry);
  const risk = Math.abs(entry - stopLoss);
  return risk === 0 ? 1 : parseFloat((gain / risk).toFixed(2));
}

async function fetchIntradayHistory(ticker: string): Promise<{ close: number; high: number; low: number; volume: number; date?: number }[] | null> {
  try {
    const symbol = tickerToYahoo(ticker);
    const p1 = new Date(); p1.setDate(p1.getDate() - 7);
    const result = await yf.chart(symbol, { period1: p1, period2: new Date(), interval: '15m', return: 'array' });
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

async function fetchDailyHistory(ticker: string): Promise<{ close: number; high: number; low: number; volume: number; date?: number }[] | null> {
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

async function fetchCurrentPrices(tickers: string[]): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};
  try {
    const symbols = tickers.map(t => tickerToYahoo(t));
    const quotes = await yf.quote(symbols);
    for (let i = 0; i < tickers.length; i++) {
      const q = Array.isArray(quotes) ? quotes[i] : quotes;
      if (q?.regularMarketPrice) prices[tickers[i]] = q.regularMarketPrice;
    }
  } catch { /* silent */ }
  return prices;
}

function buildCallObject(
  ticker: string, name: string, direction: 'BULLISH' | 'BEARISH',
  confidence: number, entry: number, target: number, stop: number,
  reasoning: string[], keyFactors: string[], qty: number,
): IntradayCall {
  return {
    id: `intraday-${ticker}-${Date.now()}`,
    ticker, name, direction, confidence,
    entryPrice: entry, currentPrice: entry,
    targetPrice: target, stopLoss: stop,
    quantity: qty,
    predictedReturnPct: parseFloat(calcReturnPct(entry, target).toFixed(2)),
    riskReward: calcRiskReward(entry, target, stop),
    reasoning, keyFactors,
    createdAt: Date.now(),
    status: 'ACTIVE',
  };
}

function calcTA(candles: { close: number; high: number; low: number; volume: number }[], ticker: string) {
  const last = candles[candles.length - 1];
  const prev = candles.length > 1 ? candles[candles.length - 2] : null;
  const price = last.close;
  const changePercent = prev ? ((last.close - prev.close) / prev.close) * 100 : 0;
  const volume = last.volume;

  const ohlc = candles.map((h, i) => ({ ...h, open: i > 0 ? candles[i - 1].close : h.close }));
  const hl = { high: Math.max(...ohlc.map(h => h.high)), low: Math.min(...ohlc.map(h => h.low)) };
  const built = buildCandleHistory(ohlc, price, volume, ohlc[ohlc.length - 1]?.close || price, hl.high, hl.low);
  if (built.length < 50) return null;
  const ta = calculateIndicators(built);
  if (!ta) return null;
  return { ticker, name: ticker.replace('.NS', ''), price, changePercent, volume: volume || 1000000, ta };
}

// GET: return cached calls + plan, refresh live prices, auto-resolve
export async function GET() {
  const calls = getIntradayCalls();
  const activeTickers = [...new Set(calls.filter(c => c.status === 'ACTIVE').map(c => c.ticker))];

  if (activeTickers.length > 0) {
    const prices = await fetchCurrentPrices(activeTickers);
    const { resolved, active } = resolveCalls(prices);
    // Also update currentPrice even if not resolved
    for (const call of calls) {
      if (call.status === 'ACTIVE' && prices[call.ticker]) {
        updateCall(call.id, { currentPrice: prices[call.ticker] });
      }
    }
  }

  return NextResponse.json({
    calls: getIntradayCalls(),
    plan: getIntradayPlan(),
    lastGenerated: getLastGenerated(),
    generatedToday: getLastGenerated() > 0,
    scanner: {
      lastScan: getLastScanTime(),
      cursor: getScanCursor(),
      universe: INDIAN_EQUITY_TICKERS.length,
    },
  });
}

// PATCH: refresh prices + resolve calls without full analysis
export async function PATCH() {
  const calls = getIntradayCalls();
  const activeTickers = [...new Set(calls.filter(c => c.status === 'ACTIVE').map(c => c.ticker))];

  if (activeTickers.length === 0) {
    return NextResponse.json({ calls, resolved: 0, active: 0 });
  }

  const prices = await fetchCurrentPrices(activeTickers);
  const { resolved, active } = resolveCalls(prices);

  for (const call of getIntradayCalls()) {
    if (call.status === 'ACTIVE' && prices[call.ticker]) {
      updateCall(call.id, { currentPrice: prices[call.ticker] });
    }
  }

  return NextResponse.json({
    calls: getIntradayCalls(),
    resolved,
    active,
    prices,
  });
}

// DELETE: clear all intraday calls + plan (used after engine/indicator fixes so
// stale calls generated with outdated logic don't linger on the dashboard)
export async function DELETE() {
  setIntradayCalls([]);
  setIntradayPlan(null);
  setLastGenerated(0);
  return NextResponse.json({ status: 'cleared', calls: 0, plan: null, lastGenerated: 0 });
}

// POST: run full intraday analysis
export async function POST() {
  const candidates: { ticker: string; name: string; price: number; changePercent: number; volume: number; ta: any; candlePatterns?: any[] }[] = [];

  // --- Phase 1: Pre-filter full universe via cached quotes (zero API cost) ---
  const quoteCache = getAllCachedQuotes();
  const scanUniverse = [...INDIAN_EQUITY_TICKERS];
  const preFiltered: { ticker: string; name: string; price: number; changePercent: number; volume: number }[] = [];

  for (const ticker of scanUniverse) {
    const sym = tickerToYahoo(ticker);
    const q = quoteCache[sym];
    if (!q || !q.price || q.price <= 0) continue;
    const changePct = q.changePercent ?? 0;
    const vol = q.volume ?? 0;
    if (Math.abs(changePct) < 1.0 && vol < 100000) continue;
    preFiltered.push({
      ticker, name: getTickerName(ticker) || ticker,
      price: q.price, changePercent: changePct, volume: vol,
    });
  }

  if (preFiltered.length === 0) {
    return NextResponse.json({ status: 'no-data', calls: [], plan: null });
  }

  // Sort by absolute change and take top candidates for deep analysis
  preFiltered.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
  const deepScanTickers = preFiltered.slice(0, 20);

  // --- Phase 2: Fetch charts + TA + candlestick patterns for top candidates ---
  for (const s of deepScanTickers) {
    if (candidates.length >= 8) break;
    try {
      const intraday = await fetchIntradayHistory(s.ticker);
      const daily = intraday || await fetchDailyHistory(s.ticker);
      if (!daily || daily.length < 50) continue;

      // Volume surge check using the pre-filter's day-change (real quote data)
      const volumeAvg = daily.reduce((sum, c) => sum + c.volume, 0) / daily.length;
      const lastVol = daily[daily.length - 1].volume;
      const volSurge = volumeAvg > 0 ? lastVol / volumeAvg : 1;
      if (Math.abs(s.changePercent) < 1.0 && volSurge < 1.5) continue;

      // Detect candlestick patterns before LLM so they can influence the analysis
      const ohlcCandles: OHLC[] = [];
      for (let i = 1; i < daily.length; i++) {
        ohlcCandles.push({
          open: daily[i - 1].close,
          high: daily[i].high,
          low: daily[i].low,
          close: daily[i].close,
          volume: daily[i].volume,
        });
      }
      const candlePatterns = ohlcCandles.length >= 3 ? detectCandlestickPatterns(ohlcCandles) : [];

      const taResult = calcTA(daily, s.ticker);
      if (taResult) candidates.push({ ...taResult, candlePatterns });
    } catch { continue; }
  }

  if (candidates.length === 0) {
    return NextResponse.json({ status: 'no-data', calls: [], plan: null });
  }

  candidates.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));

  let intradayCalls: IntradayCall[] = [];
  const previousSignals: string[] = [];
  const marketCtx = getMarketContext();
  const marketTrend = marketCtx.niftyChangePct;
  const trendDesc = marketTrend < -1 ? 'SHARP DOWNTURN' : marketTrend < -0.5 ? 'DOWN' : marketTrend > 1 ? 'SHARP UPTREND' : marketTrend > 0.5 ? 'UP' : 'NEUTRAL';
  const biasMsg = marketTrend < -1 ? 'The broader market is falling sharply. Strongly favor SELL. Only BUY if there is overwhelming evidence of a reversal (RSI < 30, clear bullish divergence).' :
    marketTrend > 1 ? 'The broader market is rising strongly. Strongly favor BUY. Only SELL if there is overwhelming evidence of a top (RSI > 70, bearish divergence).' :
    '';
  const marketContextStr = `MARKET CONTEXT: Nifty ${marketTrend >= 0 ? '+' : ''}${marketTrend.toFixed(2)}% (${trendDesc}). ${biasMsg}`;

  function buildContext(stock?: typeof candidates[0]): string {
    let ctx = marketContextStr;
    const patterns = stock?.candlePatterns as any[] | undefined;
    if (patterns?.length) {
      ctx += `\nCANDLESTICK PATTERNS: ${patterns.map(p => `${p.name} (${p.signal}, strength ${p.strength}/5)`).join(', ')}. Factor these into your analysis.`;
    }
    if (previousSignals.length > 0) {
      const bullish = previousSignals.filter(s => s === 'BULLISH').length;
      const bearish = previousSignals.filter(s => s === 'BEARISH').length;
      ctx += `\nSo far analyzed ${previousSignals.length} stocks: ${bullish} BULLISH, ${bearish} BEARISH. Diversify from the crowd.`;
    }
    return ctx;
  }

  for (const s of candidates.slice(0, 6)) {
    try {
      const ctx = buildContext(s);
      const r = await analyzeStockWithLLM(
        s.ticker, s.name, s.price, s.changePercent, s.volume, s.ta,
        'INTRADAY', undefined, ctx,
      );
      const dir = r?.direction;
      previousSignals.push(dir || 'NEUTRAL');
      if (r && r.direction !== 'NEUTRAL' && r.confidence >= 40) {
        // Use live quote price instead of candle close for entry
        const livePrice = getLivePrice(s.ticker);
        if (livePrice) r.entryPrice = livePrice;
        const qty = calcQuantity(DEFAULT_CAPITAL, r.entryPrice, r.stopLoss, RISK_PER_TRADE_PCT);
        intradayCalls.push(buildCallObject(
          s.ticker, s.name, r.direction, r.confidence,
          r.entryPrice, r.targetPrice, r.stopLoss,
          r.reasoning, r.keyFactors, qty,
        ));
      }
    } catch { continue; }
    await new Promise(r => setTimeout(r, 600));
  }

  // Safety filter: drop contra-trend calls during strong market moves (falling knife protection)
  const beforeFilter = intradayCalls.length;
  if (marketTrend < -1.2) {
    // Market crashing — drop weak BUY calls (falling knife)
    const removed = intradayCalls.filter(c => c.direction === 'BULLISH' && c.confidence < 60).length;
    intradayCalls = intradayCalls.filter(c => !(c.direction === 'BULLISH' && c.confidence < 60));
    if (removed > 0) console.log(`[IntradaySafety] Market down ${marketTrend.toFixed(1)}%: dropped ${removed} weak BUY calls`);
  } else if (marketTrend > 1.2) {
    // Market rallying — drop weak SELL calls (catching a rising knife)
    const removed = intradayCalls.filter(c => c.direction === 'BEARISH' && c.confidence < 60).length;
    intradayCalls = intradayCalls.filter(c => !(c.direction === 'BEARISH' && c.confidence < 60));
    if (removed > 0) console.log(`[IntradaySafety] Market up ${marketTrend.toFixed(1)}%: dropped ${removed} weak SELL calls`);
  }

  // Post-hoc diversity — only reverse if clear extreme RSI divergence exists
  const bullishCount = intradayCalls.filter(c => c.direction === 'BULLISH').length;
  const bearishCount = intradayCalls.filter(c => c.direction === 'BEARISH').length;
  if (intradayCalls.length >= 3 && (bullishCount === 0 || bearishCount === 0)) {
    const dominantDir = bullishCount > bearishCount ? 'BULLISH' : 'BEARISH';
    const oppositeDir = dominantDir === 'BULLISH' ? 'BEARISH' : 'BULLISH';
    const candidate = candidates
      .filter(c => oppositeDir === 'BULLISH' ? c.ta.rsi < 35 && c.ta.stochRsi < 10 : c.ta.rsi > 65 && c.ta.stochRsi > 90)
      .sort((a, b) => oppositeDir === 'BULLISH' ? a.ta.rsi - b.ta.rsi : b.ta.rsi - a.ta.rsi)[0];

    if (candidate) {
      const ctx = `${marketContextStr}\nAll ${intradayCalls.length} intraday signals were ${dominantDir}. Only give ${oppositeDir} if extreme reversal evidence exists.`;
      const r = await analyzeStockWithLLM(
        candidate.ticker, candidate.name, candidate.price,
        candidate.changePercent, candidate.volume, candidate.ta,
        'INTRADAY', undefined, ctx,
      );
      if (r && r.direction === oppositeDir && r.confidence >= 50) {
        const qty = calcQuantity(DEFAULT_CAPITAL, r.entryPrice, r.stopLoss, RISK_PER_TRADE_PCT);
        intradayCalls.push(buildCallObject(
          candidate.ticker, candidate.name, r.direction, r.confidence,
          r.entryPrice, r.targetPrice, r.stopLoss,
          r.reasoning, r.keyFactors, qty,
        ));
      }
    }
  }

  // Fetch live prices for new calls
  const allTickers = [...new Set(intradayCalls.map(c => c.ticker))];
  const prices = await fetchCurrentPrices(allTickers);
  for (const call of intradayCalls) {
    if (prices[call.ticker]) call.currentPrice = prices[call.ticker];
  }

  // Send Telegram alerts (skip if ticker already has an ACTIVE call from prior runs)
  const existingTickers = new Set(getIntradayCalls().filter(c => c.status === 'ACTIVE').map(c => c.ticker));
  for (const call of intradayCalls) {
    if (existingTickers.has(call.ticker)) continue;
    const s = candidates.find(c => c.ticker === call.ticker);
    if (!s) continue;
    try {
      const patterns = (s as any).candlePatterns || [];
      await sendIntradayCandidateAlert({
        ticker: call.ticker, name: call.name,
        direction: call.direction, confidence: call.confidence,
        entryPrice: call.entryPrice, currentPrice: call.currentPrice,
        targetPrice: call.targetPrice, stopLoss: call.stopLoss,
        predictedReturnPct: call.predictedReturnPct, riskReward: call.riskReward,
        reasoning: call.reasoning, keyFactors: call.keyFactors,
        patterns: patterns.map((p: any) => ({
          name: p.name, signal: p.signal, strength: p.strength, description: p.description,
        })),
        rsi: s.ta?.rsi, changePercent: s.changePercent,
      });
    } catch { /* continue */ }
  }

  const totalTrades = intradayCalls.length;
  const suggestedTrades = Math.min(totalTrades, Math.max(2, Math.min(4, totalTrades)));
  const capitalPerTrade = DEFAULT_CAPITAL / suggestedTrades;
  const maxLossPerTrade = capitalPerTrade * (RISK_PER_TRADE_PCT / 100);
  const maxLossPerDay = DEFAULT_CAPITAL * (MAX_LOSS_PER_DAY_PCT / 100);

  const plan: IntradayPlan = {
    totalCalls: totalTrades,
    suggestedTrades,
    maxTrades: 5,
    capitalPerTrade: Math.round(capitalPerTrade),
    maxLossPerTrade: Math.round(maxLossPerTrade),
    maxLossPerDay: Math.round(maxLossPerDay),
    riskPerTradePercent: RISK_PER_TRADE_PCT,
    minProfitTarget: 1.5,
    positionSizingMethod: 'fixed_percentage',
  };

  setIntradayCalls(intradayCalls);
  setIntradayPlan(plan);
  setLastGenerated(Date.now());

  return NextResponse.json({
    status: 'ok',
    scanned: preFiltered.length,
    totalUniverse: INDIAN_EQUITY_TICKERS.length,
    analyzed: candidates.length,
    calls: intradayCalls,
    plan,
    generatedAt: Date.now(),
  });
}
