// LLM Integration Layer
// Uses OpenAI-compatible API for news analysis, prediction explanations, and market context.
// Gracefully degrades when no API key is configured — system works fully without it.

export interface LLMNewsAnalysis {
  headline: string;
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  sentimentScore: number; // 0-100
  affectedTickers: string[];
  impactLevel: 'HIGH' | 'MODERATE' | 'LOW';
  reasoning: string; // Brief explanation
  keyEntities: string[];
  urgency: number; // 0-100
  eventType: 'ORDER_WIN' | 'CORPORATE_ACTION' | 'TURNAROUND' | 'MACRO' | 'GENERAL';
  confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  drivers: string[]; // e.g. ["Government contract (+18)", "Margin expansion (+10)"]
  risks: string[];
  affectedSegment: string;
  keyNumbers: string;
  novelty: number; // 0-100 (How surprising is this?)
}

export interface LLMExplanation {
  summary: string;
  keyFactors: string[];
  risks: string[];
  confidenceAssessment: string;
  marketContext: string;
  alternativeScenario: string;
}

const CACHE_TTL = 43200000; // 12 hours (prevents 429 quota exhaustion from repeated news cycles)
const analysisCache = new Map<string, { result: LLMNewsAnalysis; cachedAt: number }>();
const explanationCache = new Map<string, { result: LLMExplanation; cachedAt: number }>();

import { callLLM, getApiConfig, getLLMProviderInfo, isLLMConfigured as providerConfigured } from './llmProvider';

export { getApiConfig, getLLMProviderInfo };

export async function analyzeNewsWithLLM(
  headline: string,
  source: string,
  tickers: string[],
  marketFocus: 'INDIAN' | 'INTERNATIONAL' | 'BOTH' = 'BOTH',
  marketContext: string = 'No context provided',
): Promise<LLMNewsAnalysis | null> {
  const cacheKey = `${marketFocus}|${source}|${headline.slice(0, 60)}`;
  const cached = analysisCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL) return cached.result;

  const indiaFirst = marketFocus === 'INDIAN'
    ? `PRIMARY focus: Indian markets (NSE Nifty 50, Bank Nifty, NSE stocks). Cover RBI/SEBI/MPC, rupee (INR), FII/FPI flows, Union Budget, Nifty/Sensex moves, sector impact on banking (HDFCBANK, ICICIBANK, SBIN), IT (TCS, INFY), energy (RELIANCE, ONGC), and ADR spillover only if relevant.`
    : marketFocus === 'INTERNATIONAL'
      ? 'PRIMARY focus: US/global equities; mention India only if directly affected.'
      : 'Analyze BOTH Indian (NSE: Nifty, Bank Nifty, large caps) and US equities with equal rigor.';

  const systemPrompt = `You are an elite quantitative analyst and intelligent parser for NSE/BSE and global markets.
${indiaFirst}
Your objective is to deeply analyze corporate filings and news to extract structured qualitative features.
DO NOT generate trading signals or probabilities. Act strictly as a classification engine.
Classify the event into ONE of these types ("eventType"):
1. "ORDER_WIN", 2. "CORPORATE_ACTION", 3. "TURNAROUND", 4. "MACRO", 5. "ANALYST_UPGRADE", 6. "GENERAL".

Provide a confidence level (HIGH/MEDIUM/LOW) based strictly on the clarity and explicitness of the news text.
Extract drivers with an estimated qualitative weight (e.g., "Government contract (+18)", "Debt reduction (+12)").
Score the novelty (0-100) based on how surprising or unprecedented the event is.

Return ONLY valid JSON:
{
  "sentiment": "BULLISH" | "BEARISH" | "NEUTRAL",
  "sentimentScore": 0-100,
  "affectedTickers": ["RELIANCE","HDFCBANK"],
  "impactLevel": "HIGH" | "MODERATE" | "LOW",
  "reasoning": "1 sentence summary.",
  "keyEntities": ["entities"],
  "urgency": 0-100,
  "eventType": "ORDER_WIN" | "CORPORATE_ACTION" | "TURNAROUND" | "MACRO" | "ANALYST_UPGRADE" | "GENERAL",
  "confidenceLevel": "HIGH" | "MEDIUM" | "LOW",
  "drivers": ["Government contract (+18)", "Margin expansion (+10)"],
  "risks": ["Earnings tomorrow (-15)", "Stock already ran up (-10)"],
  "affectedSegment": "Infrastructure",
  "keyNumbers": "Order value ₹1200Cr",
  "novelty": 85
}`;

  const userPrompt = `Market focus: ${marketFocus}\nNews source: ${source}\nHeadline: ${headline}\nKnown related tickers: ${tickers.join(', ') || 'none'}`;

  const { content, error } = await callLLM(systemPrompt, userPrompt, 400, 0.35, 'groq');
  if (!content) {
    if (error) console.warn(`[LLM] News analysis failed: ${error}`);
    return null;
  }

  try {
    const parsed = JSON.parse(content) as any;
    const validSentiments = ['BULLISH', 'BEARISH', 'NEUTRAL'];
    const validEvents = ['ORDER_WIN', 'CORPORATE_ACTION', 'TURNAROUND', 'MACRO', 'ANALYST_UPGRADE', 'GENERAL'];
    const validConfidence = ['HIGH', 'MEDIUM', 'LOW'];
    
    const result: LLMNewsAnalysis = {
      headline,
      sentiment: validSentiments.includes(parsed.sentiment) ? parsed.sentiment : 'NEUTRAL',
      sentimentScore: Math.min(100, Math.max(0, parsed.sentimentScore || 50)),
      affectedTickers: Array.isArray(parsed.affectedTickers) ? parsed.affectedTickers : [],
      impactLevel: ['HIGH', 'MODERATE', 'LOW'].includes(parsed.impactLevel) ? parsed.impactLevel : 'MODERATE',
      reasoning: parsed.reasoning || '',
      keyEntities: Array.isArray(parsed.keyEntities) ? parsed.keyEntities : [],
      urgency: Math.min(100, Math.max(0, parsed.urgency || 50)),
      eventType: validEvents.includes(parsed.eventType) ? parsed.eventType : 'GENERAL',
      confidenceLevel: validConfidence.includes(parsed.confidenceLevel) ? parsed.confidenceLevel : 'MEDIUM',
      drivers: Array.isArray(parsed.drivers) ? parsed.drivers : [],
      risks: Array.isArray(parsed.risks) ? parsed.risks : [],
      affectedSegment: parsed.affectedSegment || 'N/A',
      keyNumbers: parsed.keyNumbers || 'N/A',
      novelty: Math.min(100, Math.max(0, parsed.novelty || 50)),
    };
    analysisCache.set(cacheKey, { result, cachedAt: Date.now() });
    if (analysisCache.size > 1000) {
      const first = analysisCache.keys().next().value;
      if (first) analysisCache.delete(first);
    }
    return result;
  } catch {
    return null;
  }
}

export async function generateLLMExplanation(
  ticker: string,
  direction: string,
  confidence: number,
  rsi: number,
  macdHistogram: number,
  adx: number,
  regime: string,
  volatilityRegime: string,
  recentNews: string[],
): Promise<LLMExplanation | null> {
  const cacheKey = `${ticker}|${direction}|${Math.round(confidence / 5)}|${Math.round(rsi / 10)}`;
  const cached = explanationCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL) return cached.result;

  const systemPrompt = `You are a trading AI that explains its predictions. Return ONLY valid JSON:
{
  "summary": "1-2 sentence prediction summary",
  "keyFactors": ["factor1", "factor2", "factor3"],
  "risks": ["risk1", "risk2"],
  "confidenceAssessment": "brief confidence explanation",
  "marketContext": "current market context observation",
  "alternativeScenario": "what could invalidate this prediction"
}`;

  const newsContext = recentNews.length > 0 ? `\nRecent news: ${recentNews.join(' | ')}` : '';
  const userPrompt = `Ticker: ${ticker}
Direction: ${direction}
Confidence: ${confidence}%
Technical: RSI=${rsi}, MACD=${macdHistogram > 0 ? '+' : ''}${macdHistogram.toFixed(2)}, ADX=${adx}
Market: ${regime} regime, ${volatilityRegime} volatility${newsContext}`;

  const { content, error } = await callLLM(systemPrompt, userPrompt, 350, 0.35, 'groq');
  if (!content) {
    if (error) console.warn(`[LLM] Explanation failed: ${error}`);
    return null;
  }

  try {
    const parsed = JSON.parse(content) as LLMExplanation;
    const result: LLMExplanation = {
      summary: parsed.summary || `Prediction for ${ticker}: ${direction.toLowerCase()} with ${confidence}% confidence`,
      keyFactors: Array.isArray(parsed.keyFactors) ? parsed.keyFactors.slice(0, 5) : [],
      risks: Array.isArray(parsed.risks) ? parsed.risks.slice(0, 3) : [],
      confidenceAssessment: parsed.confidenceAssessment || '',
      marketContext: parsed.marketContext || '',
      alternativeScenario: parsed.alternativeScenario || '',
    };
    explanationCache.set(cacheKey, { result, cachedAt: Date.now() });
    if (explanationCache.size > 1000) {
      const first = explanationCache.keys().next().value;
      if (first) explanationCache.delete(first);
    }
    return result;
  } catch {
    return null;
  }
}

export function isLLMConfigured(): boolean {
  return providerConfigured();
}

export function getLLMCacheStats(): { analysisCached: number; explanationsCached: number } {
  return { analysisCached: analysisCache.size, explanationsCached: explanationCache.size };
}

export interface DeepVerifyResult {
  action: 'APPROVE' | 'REJECT';
  reasoning: string;
}

export async function deepVerifyEvent(headline: string, source: string): Promise<DeepVerifyResult> {
  // 1. Fetch live context via Google News RSS Search
  let searchContext = '';
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(headline)}&hl=en-IN&gl=IN&ceid=IN:en`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 300 } });
    if (res.ok) {
      const xml = await res.text();
      // Extremely simple regex extraction of titles
      const titles = [...xml.matchAll(/<title>(.*?)<\/title>/g)].slice(1, 6).map(m => m[1]);
      searchContext = titles.join(' | ').replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1');
    }
  } catch (e) {
    // silently continue
  }

  // 2. Feed into LLM
  const systemPrompt = `You are an elite automated risk manager for a quantitative trading desk.
An event headline has been flagged for human review, but the human analyst did not respond. You must now perform a definitive Deep Study to VERIFY or DEBUNK the event.

Given the original headline, the source, and a list of current top news search results, decide if this event is:
1. CREDIBLE / CONFIRMED: Widespread reporting, official sources, and recent. -> APPROVE
2. FAKE / STALE / UNCONFIRMED: Lack of reporting, known rumor, or old news recycled. -> REJECT

Return ONLY valid JSON:
{
  "action": "APPROVE" | "REJECT",
  "reasoning": "Detailed 2-3 sentence explanation citing the search findings (or lack thereof) and why you made this definitive decision."
}`;

  const userPrompt = `Headline under review: ${headline}
Stated Source: ${source}
Live Search Results Context: ${searchContext || 'NO RECENT ARTICLES FOUND'}`;

  const { content, error } = await callLLM(systemPrompt, userPrompt, 500, 0.2, 'groq');
  if (!content) {
    return { action: 'REJECT', reasoning: `Deep study failed due to LLM error: ${error || 'Unknown'}` };
  }

  try {
    const parsed = JSON.parse(content);
    return {
      action: parsed.action === 'APPROVE' ? 'APPROVE' : 'REJECT',
      reasoning: parsed.reasoning || 'No specific reasoning provided by LLM.'
    };
  } catch {
    return { action: 'REJECT', reasoning: 'Failed to parse AI deep study output.' };
  }
}
