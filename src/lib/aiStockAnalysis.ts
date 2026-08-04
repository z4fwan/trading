import { callLLMJson } from './llmProvider';
import type { LLMProviderName } from './llmProvider';
import { getEngineForLLM } from './aiEnginePreference';
import type { TAIndicators } from './technicalAnalysis';
import { getAggregatedSentiment } from './newsStore';
import { addPrediction, getExpiryDate } from './predictionStore';

export interface AIStockAnalysisResult {
  ticker: string;
  name: string;
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  predictionType: 'INTRADAY' | 'SHORT_TERM' | 'LONG_TERM';
  regime: string;
  reasoning: string[];
  keyFactors: string[];
  risks: string[];
  catalysts: string[];
  llmProvider: string;
  verificationStatus: 'PASSED' | 'FAILED' | 'PARTIAL';
}

interface LLMStockAnalysis {
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number;
  targetPrice: number;
  stopLoss: number;
  reasoning: string;
  keyFactors: string[];
  risks: string[];
  catalysts: string[];
  regimeAssessment: string;
  technicalVerdict: string;
  newsVerdict: string;
}

function buildStockAnalysisPrompt(
  ticker: string,
  name: string,
  price: number,
  changePercent: number,
  volume: number,
  ta: TAIndicators,
  overallSentiment: number,
  predictionType: 'INTRADAY' | 'SHORT_TERM' | 'LONG_TERM',
  context?: string,
): { system: string; user: string } {
  const horizonDesc = predictionType === 'INTRADAY'
    ? 'next 1-4 hours (intraday)'
    : predictionType === 'SHORT_TERM'
      ? 'next 1-7 days'
      : 'next 1-6 months';

  // Detect market regime from context
  const ctx = context || '';
  const mktMatch = ctx.match(/Nifty\s*([+-]?\d+\.?\d*)%/);
  const mktChange = mktMatch ? parseFloat(mktMatch[1]) : 0;
  const isStrongBullMarket = mktChange > 1.0;
  const isStrongBearMarket = mktChange < -1.0;

  const reversalFlags: string[] = [];
  if (ta.rsi < 35 && ta.stochRsi < 10) {
    if (isStrongBearMarket) {
      reversalFlags.push('⚠️ OVERSOLD — but market is falling sharply. Oversold in a falling market can persist. Wait for confirmation before going long.');
    } else {
      reversalFlags.push('⚠️ OVERSOLD REVERSAL SETUP: RSI is deeply oversold with StochRSI confirming — high-probability bullish reversal signal.');
    }
  } else if (ta.rsi < 40 && ta.stochRsi < 15) {
    reversalFlags.push('⚠️ NEAR-OVERSOLD: RSI and StochRSI approaching oversold levels. Watch for reversal.');
  }
  if (ta.rsi > 65 && ta.stochRsi > 90) {
    if (isStrongBullMarket) {
      reversalFlags.push('⚠️ OVERBOUGHT — but market is rising strongly. In strong bull markets, overbought means STRONG MOMENTUM continuation, NOT reversal. Do NOT short overbought stocks in a bull trend.');
    } else {
      reversalFlags.push('⚠️ OVERBOUGHT REVERSAL SETUP: RSI deeply overbought with StochRSI confirming — high-probability bearish reversal signal.');
    }
  } else if (ta.rsi > 60 && ta.stochRsi > 85) {
    if (isStrongBullMarket) {
      reversalFlags.push('⚠️ RSI elevated — in a strong bull market this confirms momentum. Do not treat as bearish.');
    } else {
      reversalFlags.push('⚠️ NEAR-OVERBOUGHT: RSI and StochRSI approaching overbought levels. Watch for reversal.');
    }
  }

  const flagsSection = reversalFlags.length > 0 ? `\n${reversalFlags.join('\n')}\n` : '';
  const contextSection = context ? `\nCONTEXT FROM PREVIOUS ANALYSES (for diversity):\n${context}\nTry to diversify — if most previous signals were BEARISH, look harder for BULLISH setups (and vice versa).\n` : '';

  const system = `You are a professional stock market analyst specializing in Indian equities (NSE/BSE).
Your task is to analyze a stock and provide a decisive structured recommendation.${contextSection}
MARKET REGIME: ${isStrongBullMarket ? '📈 STRONG BULLISH MARKET — Nifty is up >1%. Overbought RSI means STRONG MOMENTUM, NOT reversal. Favor BULLISH calls.' : isStrongBearMarket ? '📉 STRONG BEARISH MARKET — Nifty is down >1%. Oversold RSI means STRONG SELLING, NOT reversal. Favor BEARISH calls.' : '➡️ NEUTRAL MARKET — No strong directional bias.'}
GOLDEN RULES:
1. You MUST pick a direction. BULLISH and BEARISH are valid choices. Only NEUTRAL if there is ZERO evidence for either side.
2. In strong trends (ADX > 25), PREFER the trend direction UNLESS clear reversal evidence exists.
${isStrongBullMarket ? `3. ⚠️ BULL MARKET RULE: RSI > 65 is NOT bearish reversal evidence. Overbought in a bull trend = continuation. Only consider BEARISH if there is MACD bearish divergence + ADX < 25 + negative news.
4. ⚠️ BULL MARKET RULE: RSI oversold (< 35) IS valid bullish reversal evidence. Oversold in a bull trend = dip to buy.` : isStrongBearMarket ? `3. ⚠️ BEAR MARKET RULE: RSI < 35 is NOT bullish reversal evidence. Oversold in a bear trend = continuation. Only consider BULLISH if there is MACD bullish divergence + ADX < 25 + positive news.
4. ⚠️ BEAR MARKET RULE: RSI overbought (> 65) IS valid bearish reversal evidence. Overbought in a bear trend = rally to sell.` : `3. CLEAR REVERSAL EVIDENCE for BULLISH: RSI < 35 (oversold) AND StochRSI < 10. This OVERRIDES a downtrend for a BULLISH call.
4. CLEAR REVERSAL EVIDENCE for BEARISH: RSI > 65 (overbought) AND StochRSI > 90. This OVERRIDES an uptrend for a BEARISH call.`}
5. BULLISH signals: RSI < 35 + StochRSI < 10; Bullish MACD divergence; Support holding with above-average volume; Positive news catalysts.
6. BEARISH signals: RSI > 65 + StochRSI > 90; Bearish MACD divergence; Resistance holding with heavy selling; Negative news catalysts.
7. Confidence reflects evidence strength: 15-30 = weak, 31-55 = moderate, 56-80 = strong.
8. targetPrice and stopLoss must be realistic for ${horizonDesc}. Base them on support/resistance and ATR.

Return ONLY valid JSON with these fields:
{
  "direction": "BULLISH" | "BEARISH" | "NEUTRAL",
  "confidence": 15-80,
  "targetPrice": number,
  "stopLoss": number,
  "reasoning": "2-3 sentence analysis",
  "keyFactors": ["factor1", "factor2", "factor3"],
  "risks": ["risk1", "risk2"],
  "catalysts": ["catalyst1", "catalyst2"],
  "regimeAssessment": "ranging | trending | volatile | breakout",
  "technicalVerdict": "brief technical summary",
  "newsVerdict": "brief news sentiment summary"
}`;

  const user = `Analyze ${ticker} (${name}) for ${horizonDesc}:${flagsSection}
CURRENT DATA:
- Price: ${price}
- Change: ${changePercent.toFixed(2)}%
- Volume: ${volume.toLocaleString()} (SMA: ${ta.volumeSma.toLocaleString()})

TECHNICAL INDICATORS:
- RSI(14): ${ta.rsi.toFixed(2)}
- MACD: line=${ta.macd.line.toFixed(4)}, signal=${ta.macd.signal.toFixed(4)}, histogram=${ta.macd.histogram.toFixed(4)}
- ADX(14): ${ta.adx.toFixed(2)} (${ta.adx > 25 ? 'Trending' : 'Weak'})
- Supertrend: ${ta.supertrend.direction}
- Bollinger Width: ${ta.bollinger.width.toFixed(2)}% (${ta.bollinger.width < 4 ? 'Squeeze' : ta.bollinger.width > 8 ? 'Wide' : 'Normal'})
- ATR(14): ${ta.atr.toFixed(2)} (${(ta.atr / price * 100).toFixed(2)}% of price)
- EMA20: ${ta.ema[20]?.toFixed(2) ?? 'N/A'}
- EMA50: ${ta.ema[50]?.toFixed(2) ?? 'N/A'}
- VWAP: ${ta.vwap.toFixed(2)}
- StochRSI: ${ta.stochRsi.toFixed(2)}
- Support: ${ta.support.toFixed(2)} (${((price - ta.support) / price * 100).toFixed(1)}% below)
- Resistance: ${ta.resistance.toFixed(2)} (${((ta.resistance - price) / price * 100).toFixed(1)}% above)

NEWS SENTIMENT (72h):
- Overall score: ${overallSentiment.toFixed(0)}/100 (higher = more bullish news coverage)

MARKET REGIME: ${ta.adx > 25 ? 'Trending' : ta.bollinger.width < 4 ? 'Squeeze' : ta.bollinger.width > 8 ? 'High Volatility' : 'Ranging'}
VOLATILITY RISK: ${Math.min(100, (ta.atr / price) * 100 * 5).toFixed(1)}%`;

  return { system, user };
}

async function verifyWithSecondLLM(
  ticker: string,
  price: number,
  ta: TAIndicators,
  firstResult: AIStockAnalysisResult,
  provider?: LLMProviderName,
): Promise<boolean> {
  if (firstResult.direction === 'NEUTRAL') return true;

  const verifyPrompt = `You are an independent verification AI. A primary analyst issued a ${firstResult.direction} recommendation for ${ticker} at ${price}. Perform your own quick assessment:

RSI: ${ta.rsi.toFixed(1)}, ADX: ${ta.adx.toFixed(1)}, MACD Histogram: ${ta.macd.histogram.toFixed(4)}
Supertrend: ${ta.supertrend.direction}, Support: ${ta.support}, Resistance: ${ta.resistance}

Primary analyst's reasoning: ${firstResult.reasoning.join('. ')}

Based ONLY on the data above, would you agree with this direction? Be fair — a BULLISH call is valid if RSI < 40 with reversal signs or positive divergence, a BEARISH call is valid if RSI > 60 with bearish divergence or breakdown.

Reply ONLY with valid JSON: { "verdict": "AGREE" | "DISAGREE" | "UNCERTAIN", "reason": "brief explanation" }`;

  const { data: verification, error } = await callLLMJson<{ verdict: string; reason: string }>(
    'You are a fair stock analysis verifier. AGREE if the analysis is technically reasonable based on the data. Do not automatically reject bullish calls.',
    verifyPrompt,
    200,
    provider,
  );

  if (error || !verification) return true;
  return verification.verdict !== 'DISAGREE';
}

export async function analyzeStockWithLLM(
  ticker: string,
  name: string,
  price: number,
  changePercent: number,
  volume: number,
  ta: TAIndicators,
  predictionType: 'INTRADAY' | 'SHORT_TERM' | 'LONG_TERM',
  preferredProvider?: LLMProviderName,
  context?: string,
): Promise<AIStockAnalysisResult | null> {
  const newsSentiment = getAggregatedSentiment(72);

  const { system, user } = buildStockAnalysisPrompt(
    ticker, name, price, changePercent, volume, ta,
    newsSentiment.overall ?? 50,
    predictionType,
    context,
  );

  const provider = preferredProvider || getEngineForLLM() || 'groq';
  const { data, error } = await callLLMJson<LLMStockAnalysis>(
    system, user, 800, provider,
  );

  if (!data || error) {
    console.warn(`[AIStockAnalysis] LLM analysis failed for ${ticker}: ${error}`);
    return null;
  }

  const direction = ['BULLISH', 'BEARISH', 'NEUTRAL'].includes(data.direction) ? data.direction : 'NEUTRAL';
  const confidence = Math.max(15, Math.min(80, data.confidence || 35));
  const targetPrice = data.targetPrice > 0 ? data.targetPrice : direction === 'BULLISH' ? price * 1.02 : direction === 'BEARISH' ? price * 0.98 : price;
  const stopLoss = data.stopLoss > 0 ? data.stopLoss : direction === 'BULLISH' ? price * 0.98 : direction === 'BEARISH' ? price * 1.02 : price;

  const result: AIStockAnalysisResult = {
    ticker, name, direction, confidence, entryPrice: price,
    targetPrice: parseFloat(targetPrice.toFixed(2)),
    stopLoss: parseFloat(stopLoss.toFixed(2)),
    predictionType, regime: data.regimeAssessment || 'unknown',
    reasoning: [data.reasoning || '', `Technical: ${data.technicalVerdict || ''}`, `News: ${data.newsVerdict || ''}`].filter(Boolean),
    keyFactors: data.keyFactors || [],
    risks: data.risks || [],
    catalysts: data.catalysts || [],
    llmProvider: provider,
    verificationStatus: 'PASSED',
  };

  if (direction !== 'NEUTRAL') {
    const verified = await verifyWithSecondLLM(ticker, price, ta, result, provider);
    result.verificationStatus = verified ? 'PASSED' : 'FAILED';
    if (!verified) {
      result.direction = 'NEUTRAL';
      result.confidence = Math.min(result.confidence, 30);
      result.reasoning.push('Verification failed — reduced to NEUTRAL');
    }
  }

  const expiryType = predictionType === 'INTRADAY' ? 'HOURLY' : predictionType === 'SHORT_TERM' ? 'DAILY' : 'WEEKLY';
  addPrediction({
    ticker, name, source: 'AI_QUANT',
    predictionType: expiryType,
    direction: result.direction,
    bullishProb: result.direction === 'BULLISH' ? 50 + result.confidence * 0.3 : 50,
    bearishProb: result.direction === 'BEARISH' ? 50 + result.confidence * 0.3 : 50,
    confidence: result.confidence,
    entryPrice: result.entryPrice,
    targetPrice: result.targetPrice,
    stopLoss: result.stopLoss,
    expectedVolatility: (ta.atr / price) * 100,
    marketCondition: data.regimeAssessment || '',
    regime: data.regimeAssessment || '',
    taSnapshot: {
      rsi: ta.rsi, macd: ta.macd.histogram, adx: ta.adx,
      bollingerWidth: ta.bollinger.width, atr: ta.atr,
      stochRsi: ta.stochRsi, supertrendDirection: ta.supertrend.direction,
    },
    sentimentScore: newsSentiment.overall ?? 50,
    reasoning: result.reasoning,
    targetDate: getExpiryDate(expiryType),
    expiryDate: getExpiryDate(expiryType),
    llmProvider: provider,
  });

  return result;
}

export async function analyzeMultipleStocks(
  stocks: Array<{
    ticker: string; name: string; price: number; changePercent: number;
    volume: number; ta: TAIndicators;
  }>,
  predictionType: 'INTRADAY' | 'SHORT_TERM' | 'LONG_TERM',
  maxToAnalyze = 5,
): Promise<AIStockAnalysisResult[]> {
  const results: AIStockAnalysisResult[] = [];
  const sorted = [...stocks].sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
  const batch = sorted.slice(0, maxToAnalyze);

  for (const stock of batch) {
    const result = await analyzeStockWithLLM(
      stock.ticker, stock.name, stock.price,
      stock.changePercent, stock.volume, stock.ta, predictionType,
    );
    if (result && result.direction !== 'NEUTRAL') results.push(result);
    await new Promise(r => setTimeout(r, 500));
  }

  return results;
}

// ─── Ensemble verdict cache ──────────────────────────────────────────────────
// The 15-min scanner re-analyzes the same tickers every cycle. Caching each
// ticker's last real ensemble verdict (30 min TTL) stops us from burning the
// free LLM quotas re-querying names that were already rejected moments ago.
// Only a fresh cache miss triggers real LLM calls.
const VERDICT_CACHE_TTL_MS = 30 * 60 * 1000;
const verdictCache = new Map<string, { at: number; result: AIStockAnalysisResult }>();
export function getCachedEnsembleVerdict(ticker: string): AIStockAnalysisResult | null {
  const hit = verdictCache.get(ticker);
  if (!hit) return null;
  if (Date.now() - hit.at > VERDICT_CACHE_TTL_MS) {
    verdictCache.delete(ticker);
    return null;
  }
  // Return a deep-enough copy: callers (scanner boosts) mutate confidence and
  // push to reasoning/keyFactors — never let that corrupt the shared cache.
  return {
    ...hit.result,
    reasoning: [...hit.result.reasoning],
    keyFactors: [...hit.result.keyFactors],
    risks: [...hit.result.risks],
    catalysts: [...hit.result.catalysts],
  };
}
export function clearEnsembleVerdictCache(): void {
  verdictCache.clear();
}

// ─── Provider health window ──────────────────────────────────────────────────
// When a free provider rate-limits (429), remember it briefly so the NEXT
// ensemble call skips it instead of hammering it again — the retry budget then
// goes to providers that are actually responding. Auto-expires on a timer.
const PROVIDER_QUIET_MS = 90 * 1000;
const providerQuietUntil = new Map<LLMProviderName, number>();
export function markProviderQuiet(p: LLMProviderName): void {
  providerQuietUntil.set(p, Date.now() + PROVIDER_QUIET_MS);
}
export function isProviderQuiet(p: LLMProviderName): boolean {
  const until = providerQuietUntil.get(p);
  if (!until) return false;
  if (Date.now() > until) {
    providerQuietUntil.delete(p);
    return false;
  }
  return true;
}
setInterval(() => {
  const now = Date.now();
  for (const [p, until] of providerQuietUntil) {
    if (now > until) providerQuietUntil.delete(p);
  }
}, 30000).unref?.();

export async function analyzeStockWithEnsembleAI(
  ticker: string,
  name: string,
  price: number,
  changePercent: number,
  volume: number,
  ta: TAIndicators,
  predictionType: 'INTRADAY' | 'SHORT_TERM' | 'LONG_TERM',
  marketContext?: string,
): Promise<AIStockAnalysisResult | null> {
  // Serve a fresh cached verdict when available — zero LLM cost. The scanner
  // rejects most candidates anyway; re-analyzing them every 15 min is what
  // exhausts the free quotas. The cache is only 30 min, so alerts never go
  // stale enough to be dangerous.
  const cached = getCachedEnsembleVerdict(ticker);
  if (cached) return cached;

  const { system, user } = buildStockAnalysisPrompt(
    ticker, name, price, changePercent, volume, ta, 50, predictionType, marketContext
  );

  // Query providers SEQUENTIALLY (not all at once) so a rate-limited provider
  // doesn't consume the whole 429 budget in a parallel blast, and so each call
  // is gently paced — free tiers survive a full 15-min scan cycle.
  const providers: LLMProviderName[] = ['groq', 'gemini', 'deepseek'];
  const results: ({ data: LLMStockAnalysis | null; error: string | null } | null)[] = new Array(providers.length).fill(null);
  for (let i = 0; i < providers.length; i++) {
    const p = providers[i];
    if (isProviderQuiet(p)) continue;
    const res = await callLLMJson<LLMStockAnalysis>(system, user, 1200, p).catch(() => null);
    if (!res || (res.error && !res.data)) {
      // 429 / network failure — mark quiet so the rest of the cycle stops
      // wasting calls on this provider.
      if (res && res.error && /429|rate limit|quota|exceeded/i.test(res.error)) {
        markProviderQuiet(p);
      }
      results[i] = res;
      continue;
    }
    results[i] = res;
    await new Promise(r => setTimeout(r, 700));
  }

  const validVotes: { provider: LLMProviderName; data: LLMStockAnalysis }[] = [];
  for (let i = 0; i < results.length; i++) {
    const res = results[i];
    if (res && res.data && res.data.direction && (res.data.direction === 'BULLISH' || res.data.direction === 'BEARISH')) {
      validVotes.push({ provider: providers[i], data: res.data });
    }
  }

  // STRICT single-provider fallback: with 2+ votes this is a real consensus.
  // With exactly 1 vote we only proceed if the scanner's external verification
  // (BullScore/NSE) confirms — the gate in autoIntradayScanner enforces that
  // agreement requirement, so a lone LLM never fires an unverified alert.
  if (validVotes.length === 0) return null; // No provider responded
  if (validVotes.length === 1) {
    const solo = validVotes[0];
    const finalResult: AIStockAnalysisResult = {
      ticker, name,
      direction: solo.data.direction,
      confidence: Math.round(solo.data.confidence),
      entryPrice: price,
      targetPrice: Number(solo.data.targetPrice.toFixed(2)),
      stopLoss: Number(solo.data.stopLoss.toFixed(2)),
      predictionType,
      regime: solo.data.regimeAssessment,
      reasoning: [`[${solo.provider.toUpperCase()}] ${solo.data.reasoning}`],
      keyFactors: solo.data.keyFactors,
      risks: solo.data.risks,
      catalysts: solo.data.catalysts,
      llmProvider: `ENSEMBLE (${solo.provider})`,
      verificationStatus: 'PARTIAL',
    };
    verdictCache.set(ticker, { at: Date.now(), result: finalResult });
    return finalResult;
  }

  let bulls = 0;
  let bears = 0;
  validVotes.forEach(v => {
    if (v.data.direction === 'BULLISH') bulls++;
    if (v.data.direction === 'BEARISH') bears++;
  });

  const consensusDirection = bulls >= 2 ? 'BULLISH' : bears >= 2 ? 'BEARISH' : 'NEUTRAL';
  if (consensusDirection === 'NEUTRAL') return null; // No consensus

  const agreeingVotes = validVotes.filter(v => v.data.direction === consensusDirection);
  
  const avgConfidence = agreeingVotes.reduce((sum, v) => sum + v.data.confidence, 0) / agreeingVotes.length;
  const avgTarget = agreeingVotes.reduce((sum, v) => sum + v.data.targetPrice, 0) / agreeingVotes.length;
  const avgStop = agreeingVotes.reduce((sum, v) => sum + v.data.stopLoss, 0) / agreeingVotes.length;

  const reasoning = agreeingVotes.map(v => `[${v.provider.toUpperCase()}]: ${v.data.reasoning}`);
  const keyFactors = Array.from(new Set(agreeingVotes.flatMap(v => v.data.keyFactors))).slice(0, 5);
  const risks = Array.from(new Set(agreeingVotes.flatMap(v => v.data.risks))).slice(0, 3);
  const catalysts = Array.from(new Set(agreeingVotes.flatMap(v => v.data.catalysts))).slice(0, 3);

  const finalResult: AIStockAnalysisResult = {
    ticker,
    name,
    direction: consensusDirection,
    confidence: Math.round(avgConfidence),
    entryPrice: price,
    targetPrice: Number(avgTarget.toFixed(2)),
    stopLoss: Number(avgStop.toFixed(2)),
    predictionType,
    regime: agreeingVotes[0].data.regimeAssessment,
    reasoning,
    keyFactors,
    risks,
    catalysts,
    llmProvider: `ENSEMBLE (${agreeingVotes.map(v => v.provider).join(', ')})`,
    verificationStatus: 'PASSED',
  };

  const expiryType = predictionType === 'INTRADAY' ? 'HOURLY' : predictionType === 'SHORT_TERM' ? 'DAILY' : 'WEEKLY';
  addPrediction({
    ticker, name, source: 'AI_QUANT',
    predictionType: expiryType,
    direction: consensusDirection,
    bullishProb: consensusDirection === 'BULLISH' ? 50 + avgConfidence * 0.3 : 50,
    bearishProb: consensusDirection === 'BEARISH' ? 50 + avgConfidence * 0.3 : 50,
    confidence: Math.round(avgConfidence),
    entryPrice: price, targetPrice: avgTarget, stopLoss: avgStop,
    expectedVolatility: (ta.atr / price) * 100,
    marketCondition: finalResult.regime,
    regime: finalResult.regime,
    taSnapshot: {
      rsi: ta.rsi, macd: ta.macd.histogram, adx: ta.adx,
      bollingerWidth: ta.bollinger.width, atr: ta.atr,
      stochRsi: ta.stochRsi, supertrendDirection: ta.supertrend.direction,
    },
    sentimentScore: 50,
    reasoning,
    targetDate: getExpiryDate(expiryType),
    expiryDate: getExpiryDate(expiryType),
    llmProvider: finalResult.llmProvider,
  } as any);

  verdictCache.set(ticker, { at: Date.now(), result: finalResult });
  return finalResult;
}
