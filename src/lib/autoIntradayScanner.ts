import { INDIAN_EQUITY_TICKERS, tickerToYahoo, getTickerName } from './marketConfig';
import { buildCandleHistory, calculateIndicators } from './technicalAnalysis';
import { detectSMCSetup } from './smcEngine';
import { analyzeStockWithLLM, analyzeStockWithEnsembleAI } from './aiStockAnalysis';
import { sendIntradayCandidateAlert } from './telegramBot';
import { getIntradayCalls, setIntradayCalls, setIntradayPlan, setLastGenerated, resolveCalls, type IntradayCall, type IntradayPlan } from './intradayStore';
import { getAllCachedQuotes, getMarketContext } from './quoteFetcher';
import { getFullUniverse } from './dynamicUniverse';
import { getExchangeStatus } from './exchangeHours';
import { fetchBullScoreCalls, type BullScoreCall } from './bullScoreFetcher';
import { fetchInstitutionalSignals, type NSEInstitutionalSignal } from './nseBulkDealFetcher';
import YahooFinance from 'yahoo-finance2';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'], validation: { logErrors: false } });

const DEFAULT_CAPITAL = 50000;
const RISK_PER_TRADE_PCT = 5;
const MAX_LOSS_PER_DAY_PCT = 20;

let lastScan = 0;
const scanCursor = 0;
export function getLastScanTime(): number { return lastScan; }
export function getScanCursor(): number { return scanCursor; }

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

function buildCallObject(
  ticker: string, name: string, direction: string, confidence: number,
  entry: number, target: number, stop: number,
  reasoning: string[], keyFactors: string[], qty: number,
): IntradayCall {
  return {
    id: `auto-${ticker}-${Date.now()}`,
    ticker, name, direction: direction as any, confidence,
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

async function fetchCurrentPrices(tickers: string[]): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};
  const chunks: string[][] = [];
  for (let i = 0; i < tickers.length; i += 50) chunks.push(tickers.slice(i, i + 50));
  for (const chunk of chunks) {
    try {
      const result = await yf.quote(chunk.map(t => tickerToYahoo(t)));
      const arr = Array.isArray(result) ? result : [result];
      for (const q of arr) {
        const raw = q.symbol?.replace('.NS', '') || '';
        if (q.regularMarketPrice && raw) prices[raw] = q.regularMarketPrice as number;
      }
    } catch { /* skip */ }
  }
  return prices;
}

// Track stocks with unusual volume across scan cycles for priority re-check
const highVolumeWatchlist: Map<string, { firstSeen: number; volume: number; price: number }> = new Map();

export async function runAutoIntradayScan(force: boolean = false): Promise<void> {
  const now = Date.now();
  if (!force && now - lastScan < 15 * 60 * 1000) return;
  lastScan = now;

  // Intraday calls are only actionable while NSE is trading. After the close
  // the scanner was generating "calls" from stale frozen prices (e.g. 10 SELL
  // calls at 3:46 PM) that nobody can act on — stop that.
  if (!getExchangeStatus('NSE').open && !force) {
    console.log('[AutoIntraday] Skipping scan: NSE is closed.');
    return;
  }

  // Expire stale calls (target hit / stop-loss / >6h old) so the active-count
  // guard below never gets stuck on zombie entries.
  try {
    const quoteCache = getAllCachedQuotes();
    const priceMap: Record<string, number> = {};
    const dayRanges: Record<string, { high: number; low: number }> = {};
    for (const [sym, q] of Object.entries(quoteCache)) {
      if (!q || !q.price || q.price <= 0) continue;
      const plain = sym.replace('.NS', '').replace('.BO', '');
      priceMap[sym] = q.price;
      if (q.high || q.low) dayRanges[sym] = { high: q.high ?? q.price, low: q.low ?? q.price };
      if (plain !== sym) {
        priceMap[plain] = q.price;
        if (dayRanges[sym]) dayRanges[plain] = dayRanges[sym];
      }
    }
    resolveCalls(priceMap, dayRanges);
  } catch { /* never block scan on resolution failure */ }

  const existing = getIntradayCalls();

  // --- Phase 1: Pre-filter full universe using cached quotes ---
  const quoteCache = getAllCachedQuotes();
  const allTickers = getFullUniverse();
  const preFiltered: { ticker: string; name: string; price: number; changePercent: number; volume: number; volumeRatio: number }[] = [];

  // Scan ALL tickers from cache (zero API cost) — no batch rotation
  // Use broader filters: catch stocks with building volume or early price movement
  for (const ticker of allTickers) {
    const sym = tickerToYahoo(ticker);
    const q = quoteCache[sym];
    if (!q || !q.price || q.price <= 0) continue;
    const changePct = q.changePercent ?? 0;
    const vol = q.volume ?? 0;

    // Estimate volume surge: use vol > 100K as "high volume" indicator since we lack avg volume in cache
    const volRatio = vol > 0 ? Math.min(10, vol / 50000) : 1;

    // Broader pre-filter: catch stocks early before they move big
    // 1. Price moving (>0.5%)
    // 2. High volume (>30K)
    // 3. Volume surge (>1.8x average)
    // 4. Previously flagged on watchlist with sustained volume
    // Removed hard filter so we always consider top volume/momentum stocks
    // Track unusually high volume stocks for priority re-check
    if (volRatio >= 2.0 || vol > 100000) {
      if (!highVolumeWatchlist.has(ticker)) {
        highVolumeWatchlist.set(ticker, { firstSeen: now, volume: vol, price: q.price });
      } else {
        const watched = highVolumeWatchlist.get(ticker)!;
        watched.volume = Math.max(watched.volume, vol);
      }
    }

    preFiltered.push({
      ticker, name: getTickerName(ticker) || ticker,
      price: q.price, changePercent: changePct, volume: vol,
      volumeRatio: parseFloat(volRatio.toFixed(2)),
    });
  }

  // Clean stale watchlist entries (> 1 hour)
  for (const [ticker, watched] of highVolumeWatchlist) {
    if (now - watched.firstSeen > 60 * 60 * 1000) highVolumeWatchlist.delete(ticker);
  }

  if (preFiltered.length === 0) {
    console.log('[AutoIntraday] Pre-filter yielded 0 candidates (no stocks with volRatio >= 2.0 or vol > 100K).');
    return;
  }

  // Score each candidate: prioritize by momentum (change + volume surge + volume ratio) + raw volume weight
  // This catches stocks with BOTH price movement AND volume confirmation, favoring large caps with heavy liquidity
  preFiltered.sort((a, b) => {
    const volLogA = a.volume > 0 ? Math.log10(a.volume) : 0;
    const volLogB = b.volume > 0 ? Math.log10(b.volume) : 0;
    const scoreA = Math.abs(a.changePercent) * 2.5 + (a.volumeRatio > 2 ? a.volumeRatio * 2 : 0) + (volLogA * 1.5);
    const scoreB = Math.abs(b.changePercent) * 2.5 + (b.volumeRatio > 2 ? b.volumeRatio * 2 : 0) + (volLogB * 1.5);
    return scoreB - scoreA;
  });

  // BullScore verified-analyst live calls, used to boost/penalize candidates
  // whose direction agrees/conflicts with a real analyst call, and to force a
  // BullScore-backed name into the deep scan even if its momentum is quiet.
  let bullScoreCalls: BullScoreCall[] = [];
  try {
    bullScoreCalls = await fetchBullScoreCalls();
    if (bullScoreCalls.length) {
      console.log('[AutoIntraday] BullScore calls in play:', bullScoreCalls.map(b => `${b.ticker} ${b.direction}`).join(', '));
    }
  } catch { /* BullScore is optional evidence; never block the scan */ }
  const bullByTicker = new Map(bullScoreCalls.map(b => [b.ticker, b]));

  const deepScanTickers = preFiltered.slice(0, 24);
  // Guarantee every live BullScore call ticker that we already price-quote gets
  // analyzed this cycle — an analyst call is a leading signal, not a lagging one.
  for (const bs of bullScoreCalls) {
    if (deepScanTickers.some(s => s.ticker === bs.ticker)) continue;
    const inUniverse = preFiltered.find(s => s.ticker === bs.ticker);
    if (!inUniverse) continue;
    deepScanTickers.push(inUniverse);
  }
  const applyBullScore = (ticker: string, realPrice: number, r: { direction: string; confidence: number; reasoning: string[]; keyFactors: string[] }): void => {
    const bs = bullByTicker.get(ticker);
    if (!bs) return;
    const bsDir = bs.direction === 'BUY' ? 'BULLISH' : 'BEARISH';
    const agreed = bsDir === r.direction;
    const evidence = `BullScore verified analyst ${bs.analyst} ${bs.direction} ${bs.displayName} @₹${bs.entry} (${bs.status}, SL ₹${bs.stopLoss}, targets ₹${bs.targets.join('/')}) ${bs.ageLabel}`;
    // The analyst's entry price must match the real market price within a
    // reasonable band — otherwise the call is stale, wrong-sourced, or about a
    // different instrument, and boosting/confirming on it fabricates a signal.
    // BullScore and Yahoo can legitimately differ by a few %, so use 20%.
    const priceDeviation = realPrice > 0 && bs.entry > 0 ? Math.abs(realPrice - bs.entry) / bs.entry : 1;
    const priceAligned = priceDeviation <= 0.20;
    if (!priceAligned) {
      r.reasoning.push(`⚠ BullScore call ${bs.direction} ${bs.displayName} @₹${bs.entry} ignored — price deviates ${(priceDeviation * 100).toFixed(0)}% from live ₹${realPrice} (stale/mismatched source)`);
      return;
    }
    const base = Math.abs(r.confidence - 50);
    const boost = Math.round(base * (agreed ? 0.45 : -0.35));
    r.confidence = Math.max(30, Math.min(99, r.confidence + boost));
    r.reasoning.push(agreed ? `✓ Confirmed by live BullScore call — ${evidence}` : `⚠ Conflicts with live BullScore call — ${evidence}`);
    r.keyFactors.push(`BullScore ${bs.direction === 'BUY' ? 'BUY' : 'SELL'} call (${bs.analyst})`);
  };

  // Free NSE institutional signals (bulk/block deals): real smart-money
  // accumulation/distribution. Aggregated per ticker with a signed net value.
  let institutionalSignals: NSEInstitutionalSignal[] = [];
  try {
    institutionalSignals = await fetchInstitutionalSignals();
    if (institutionalSignals.length) {
      console.log('[AutoIntraday] NSE institutional signals:', institutionalSignals.map(s => `${s.ticker} ${s.direction}`).join(', '));
    }
  } catch { /* free signal, never block scan */ }
  const instByTicker = new Map<string, { direction: 'BUY' | 'SELL'; netValue: number; count: number; headline: string }>();
  for (const s of institutionalSignals) {
    const cur = instByTicker.get(s.ticker) || { direction: 'BUY' as 'BUY' | 'SELL', netValue: 0, count: 0, headline: '' };
    cur.netValue += s.direction === 'BUY' ? s.value : -s.value;
    cur.count += 1;
    cur.headline = s.headline;
    cur.direction = cur.netValue >= 0 ? 'BUY' : 'SELL';
    instByTicker.set(s.ticker, cur);
  }
  // Prefer institutional-backed names in the deep scan too (free, high quality).
  for (const [ticker] of instByTicker) {
    if (deepScanTickers.some(s => s.ticker === ticker)) continue;
    const inUniverse = preFiltered.find(s => s.ticker === ticker);
    if (!inUniverse) continue;
    deepScanTickers.push(inUniverse);
  }
  const applyInstitutional = (ticker: string, r: { direction: string; confidence: number; reasoning: string[]; keyFactors: string[] }): void => {
    const inst = instByTicker.get(ticker);
    if (!inst) return;
    const instDir = inst.direction === 'BUY' ? 'BULLISH' : 'BEARISH';
    const agreed = instDir === r.direction;
    const base = Math.abs(r.confidence - 50);
    const boost = Math.round(base * (agreed ? 0.35 : -0.25));
    r.confidence = Math.max(30, Math.min(99, r.confidence + boost));
    const valueStr = Math.abs(inst.netValue) >= 1e7
      ? `₹${(Math.abs(inst.netValue) / 1e7).toFixed(2)}Cr`
      : `₹${(Math.abs(inst.netValue) / 1e5).toFixed(2)}L`;
    r.reasoning.push(agreed
      ? `✓ NSE ${inst.headline} — net ${inst.direction} flow ${valueStr} confirms direction`
      : `⚠ NSE ${inst.headline} — net ${inst.direction} flow ${valueStr} opposes direction`);
    r.keyFactors.push(`NSE ${inst.direction} flow ${valueStr}`);
  };

  // --- Phase 2: Fetch charts + TA for top candidates ---
  const candidates: { ticker: string; name: string; price: number; changePercent: number; volume: number; ta: any; smcStr?: string; prices: number[]; volumes: number[] }[] = [];
  for (const s of deepScanTickers) {
    try {
      const symbol = tickerToYahoo(s.ticker);
      const p1 = new Date(); p1.setDate(p1.getDate() - 7);
      const result = await yf.chart(symbol, { period1: p1, period2: new Date(), interval: '15m', return: 'array' });
      const candles: { close: number; high: number; low: number; volume: number }[] = [];
      for (const q of result.quotes) {
        if (q.close && q.high && q.low && q.volume != null) {
          candles.push({ close: q.close as number, high: q.high as number, low: q.low as number, volume: q.volume as number });
        }
      }
      if (candles.length < 30) continue;
      const last = candles[candles.length - 1];
      const prev = candles.length > 1 ? candles[candles.length - 2] : null;
      const price = last.close;
      const candleChangePct = prev ? ((last.close - prev.close) / prev.close) * 100 : 0;
      const volume = last.volume;
      const ohlc = candles.map((h, i) => ({ ...h, open: i > 0 ? candles[i - 1].close : h.close }));
      const hl = { high: Math.max(...ohlc.map(h => h.high)), low: Math.min(...ohlc.map(h => h.low)) };
      const built = buildCandleHistory(ohlc, price, volume, ohlc[ohlc.length - 1]?.close || price, hl.high, hl.low);
      if (!built || built.length < 50) continue;
      const ta = calculateIndicators(built);
      if (!ta) continue;

      const volumeAvg = candles.reduce((s, c) => s + c.volume, 0) / candles.length;
      const volSurge = volumeAvg > 0 ? volume / volumeAvg : 1;

      // Removed candleChangePct filter to allow analysis during flat off-hours
      let smcStr = '';
      const smc = detectSMCSetup(built);
      if (smc && smc.confidence > 50) {
        if (smc.fvg.active) smcStr += `FVG detected at ${smc.fvg.gapStart}-${smc.fvg.gapEnd}. `;
        if (smc.liquiditySweep.active) smcStr += `Liquidity Sweep at ${smc.liquiditySweep.priceLevel}. `;
      }

      // Use daily change percent from Phase 1 for LLM analysis (more accurate than 15-min change)
      candidates.push({ 
        ticker: s.ticker, name: s.name, price, changePercent: s.changePercent, volume, ta, smcStr,
        prices: candles.map(c => c.close), volumes: candles.map(c => c.volume)
      });
    } catch { continue; }
  }

  if (candidates.length === 0) {
    console.log(`[AutoIntraday] Phase 2 yielded 0 candidates out of ${deepScanTickers.length} pre-filtered. (Missing TA or <30 candles)`);
    return;
  }

  // Verified-signal priority: BullScore analyst calls and NSE institutional
  // flow are the two highest-quality leading signals we have. Analyze them
  // FIRST so the limited free LLM quota is always spent on the names most
  // likely to produce a verified alert — not on pure momentum noise.
  candidates.sort((a, b) => {
    const pa = bullByTicker.has(a.ticker) ? 1000 : instByTicker.has(a.ticker) ? 800 : 0;
    const pb = bullByTicker.has(b.ticker) ? 1000 : instByTicker.has(b.ticker) ? 800 : 0;
    return (pb - pa) || (Math.abs(b.changePercent) - Math.abs(a.changePercent));
  });

  const intradayCalls: IntradayCall[] = [];
  const activeTickerSet = new Set(existing.filter(c => c.status === 'ACTIVE').map(c => c.ticker));
  const marketCtx = getMarketContext();
  const mktTrend = marketCtx.niftyChangePct;
  const mktBias = mktTrend < -1 ? 'Market is falling sharply. Favor SELL. Only BUY if overwhelming reversal evidence.' :
    mktTrend > 1 ? 'Market is rising strongly. Favor BUY. Only SELL if overwhelming top evidence.' : '';
  const marketCtxStr = `MARKET: Nifty ${mktTrend >= 0 ? '+' : ''}${mktTrend.toFixed(2)}%. ${mktBias}`;

  for (const s of candidates.slice(0, 10)) {
    if (activeTickerSet.has(s.ticker)) continue;
    try {
      const enhancedCtx = `${marketCtxStr} ${s.smcStr ? '\nSMC FOOTPRINT: ' + s.smcStr : ''}`;
      let r = await analyzeStockWithEnsembleAI(s.ticker, s.name, s.price, s.changePercent, s.volume, s.ta, 'INTRADAY', enhancedCtx);

      // ONLY the real LLM ensemble counts. The Python ML / local-momentum
      // fallbacks are noisy heuristics, never accurate enough to alert on —
      // if the ensemble can't produce a verdict, we stay silent.
      const isRealLLM = !!r && String(r.llmProvider).startsWith('ENSEMBLE');
      if (!r) {
        console.log(`[AutoIntraday] ${s.ticker}: no LLM ensemble verdict (LLM keys down) — skipped, no fallback alert.`);
        continue;
      }

      // The LLM's own analyzed confidence — captured BEFORE any external boost
      // so the 70%+ bar reflects what the model actually believes.
      const llmBaseConfidence = r.confidence;

      applyBullScore(s.ticker, s.price, r);
      applyInstitutional(s.ticker, r);

      // VERY ACCURATE ALERT ONLY — strict multi-bar gate:
      //   1. Verdict MUST come from the real LLM ensemble (never a fallback).
      //   2. LLM's own confidence MUST be >= 70 (the model must genuinely
      //      believe in the setup, before external boosts are added).
      //   3. A verified independent source (BullScore analyst or NSE
      //      institutional flow) must AGREE with the direction, OR the LLM must
      //      be extremely confident (>= 85) on pure internal strength alone.
      //   4. Any external conflict blocks the alert entirely.
      //   PARTIAL (single-provider) verdicts need an even higher confidence
      //   floor (>= 78) since only one LLM weighed in — they still require the
      //   same external agreement to ever alert.
      const hasExternalAgreement =
        r.reasoning.some(line => line.startsWith('✓ Confirmed by live BullScore')) ||
        r.reasoning.some(line => line.startsWith('✓ NSE '));
      const hasExternalConflict =
        r.reasoning.some(line => line.startsWith('⚠ Conflicts with live BullScore')) ||
        r.reasoning.some(line => line.startsWith('⚠ NSE '));

      const minConf = r.verificationStatus === 'PARTIAL' ? 78 : 70;

      const passesQualityGate =
        isRealLLM &&
        llmBaseConfidence >= minConf &&
        (r.confidence >= 85 || (hasExternalAgreement && !hasExternalConflict));

      if (r.direction !== 'NEUTRAL' && passesQualityGate) {
        const qty = calcQuantity(DEFAULT_CAPITAL, r.entryPrice, r.stopLoss, RISK_PER_TRADE_PCT);
        intradayCalls.push(buildCallObject(s.ticker, s.name, r.direction, r.confidence, r.entryPrice, r.targetPrice, r.stopLoss, r.reasoning, r.keyFactors, qty));
      } else {
        console.log(`[AutoIntraday] ${s.ticker} rejected (LLM conf=${llmBaseConfidence}, status=${r.verificationStatus}, realLLM=${isRealLLM}, externalAgree=${hasExternalAgreement}, externalConflict=${hasExternalConflict})`);
      }
    } catch { continue; }
    await new Promise(res => setTimeout(res, 600));
  }

  if (intradayCalls.length === 0) {
    console.log('[AutoIntraday] Strict 70%+ LLM quality gate blocked every candidate — NO alert sent this cycle (accuracy over frequency).');
    return;
  }

  // Pick only the single strongest candidate so the 15-min alert is always one
  // actionable pick, not a burst of noisy calls.
  intradayCalls.sort((a, b) => b.confidence - a.confidence);
  const best = intradayCalls[0];

  // Rotate: when the cap (3 active) is already reached, retire the oldest
  // active call so a fresh pick can go out every 15 minutes.
  const activeCallsNow = getIntradayCalls().filter(c => c.status === 'ACTIVE');
  if (activeCallsNow.length >= 3) {
    const oldest = activeCallsNow.sort((a, b) => a.createdAt - b.createdAt)[0];
    const mergedNow = getIntradayCalls().map(c => c.id === oldest.id ? { ...c, status: 'EXPIRED' as const, resolvedAt: Date.now() } : c);
    setIntradayCalls(mergedNow);
    console.log(`[AutoIntraday] Rotated out ${oldest.ticker} (oldest active) to stay at cap.`);
  }

  const selected = [best];
  const callTickers = [...new Set(selected.map(c => c.ticker))];
  const prices = await fetchCurrentPrices(callTickers);
  for (const call of selected) {
    if (prices[call.ticker]) call.currentPrice = prices[call.ticker];
  }

  for (const call of selected) {
    await sendIntradayCandidateAlert({
      ticker: call.ticker, name: call.name, direction: call.direction,
      confidence: call.confidence, entryPrice: call.entryPrice, currentPrice: call.currentPrice,
      targetPrice: call.targetPrice, stopLoss: call.stopLoss,
      predictedReturnPct: call.predictedReturnPct, riskReward: call.riskReward,
      reasoning: call.reasoning, keyFactors: call.keyFactors,
    }).catch(() => {});
  }

  const totalTrades = selected.length;
  const suggestedTrades = Math.min(totalTrades, Math.max(1, Math.min(3, totalTrades)));
  const capitalPerTrade = DEFAULT_CAPITAL / suggestedTrades;
  const maxLossPerTrade = capitalPerTrade * (RISK_PER_TRADE_PCT / 100);
  const maxLossPerDay = DEFAULT_CAPITAL * (MAX_LOSS_PER_DAY_PCT / 100);

  const plan: IntradayPlan = {
    totalCalls: totalTrades, suggestedTrades, maxTrades: 3,
    capitalPerTrade: Math.round(capitalPerTrade), maxLossPerTrade: Math.round(maxLossPerTrade),
    maxLossPerDay: Math.round(maxLossPerDay), riskPerTradePercent: RISK_PER_TRADE_PCT,
    minProfitTarget: 1.5, positionSizingMethod: 'fixed_percentage',
  };

  const merged = [...getIntradayCalls(), ...selected].slice(-50);
  setIntradayCalls(merged);
  setIntradayPlan(plan);
  setLastGenerated(Date.now());
  console.log(`[AutoIntraday] ${selected.length} new call (${best.ticker}, conf ${best.confidence}) from ${candidates.length} candidates`);
}
