import { callLLMJson, isLLMConfigured, resolveLLMConfig } from '@/lib/llmProvider';
import type { RawFundamentals } from './fundamentalFetcher';
import type { GemArchetype, MultibaggerPick } from './types';

interface GemLlmPatch {
  deepAnalysis: string;
  undervaluationNote: string;
  growthOutlook: string;
  sectorTheme: string;
  expectedCagrBand: string;
  gemArchetype: GemArchetype;
  attentionScore: number;
  moschipScore: number;
  catalysts: string[];
  dealbreakers: string[];
  extraReasons: string[];
  extraRisks: string[];
}

/**
 * Gemini-optimised system prompt for underrated gem / multibagger detection.
 * "Moschip score" = probability-like signal that a company is Moschip-style underappreciated.
 */
const SYSTEM = `You are a senior Indian equity fundamental analyst specialising in finding undervalued compounders and Moschip-style underappreciated mid/small caps.

CONTEXT:
- Moschip Semiconductor is the canonical Indian example: ignored for years, fundamentals turned, then 10–20× rerating over time.
- You are looking for that pattern: small/mid cap, structural sector tailwind, improving numbers, not at 52w high, under-followed.

ABSOLUTE RULES:
1. Use ONLY the numbers in the facts JSON. Never invent revenue, profit, or ratio figures.
2. No buy / sell / hold.
3. Be brutally honest — if the data is thin or the thesis is weak, say so clearly.
4. Reference the PLI scheme, defence capex, semis/chip design, EMS, renewables, CDMO where sector-relevant.
5. attentionScore: 0 (well-known mega-cap) → 100 (totally ignored micro/small cap gem).
6. moschipScore: 0 → 100 likelihood this company follows a Moschip-style rerating path.

Return ONLY valid JSON:
{
  "deepAnalysis": "6-8 sentences: business model, earnings driver, why the market may be undervaluing it, what structural change could trigger rerating, what must go right, honest risks",
  "undervaluationNote": "3 sentences: current P/E vs sector, margin of safety or lack thereof, whether the valuation is justified by growth rate",
  "growthOutlook": "3 sentences: compounded sales/profit trajectory from available data, key drivers, what could accelerate or disappoint",
  "sectorTheme": "2 sentences: sector structural tailwind or headwind, government policy angle (PLI, defence, semis, EMS, etc.)",
  "expectedCagrBand": "Illustrative revenue CAGR band if execution holds — e.g. '15–22% over 3–5 years based on reported growth' — label it ILLUSTRATIVE",
  "gemArchetype": "UNDERRATED_GEM" | "MULTIBAGGER_CANDIDATE" | "TENBAGGER_WATCH" | "GROWTH_COMPOUNDER",
  "attentionScore": 0-100,
  "moschipScore": 0-100,
  "catalysts": ["catalyst1","catalyst2","catalyst3"],
  "dealbreakers": ["dealbreaker1","dealbreaker2"],
  "extraReasons": ["reason1","reason2"],
  "extraRisks": ["risk1","risk2"]
}`;

function maxTokens(): number {
  const cfg = resolveLLMConfig();
  if (cfg?.provider === 'gemini') return 1800;
  if (cfg?.provider === 'deepseek') return 1500;
  return 1200;
}

export async function enrichMultibaggerWithLLM(
  pick: MultibaggerPick,
  raw: RawFundamentals,
): Promise<MultibaggerPick> {
  if (!isLLMConfigured()) return pick;

  const facts = {
    ticker: pick.ticker,
    name: pick.name,
    sector: raw.sector,
    industry: raw.industry,
    price: pick.price,
    mcapCr: pick.marketCapCr,
    high52: raw.high52,
    low52: raw.low52,
    rangePosition: raw.high52 && raw.low52 && raw.cmp
      ? raw.cmp > raw.high52 * 0.9 ? 'NEAR_TOP' : raw.cmp < raw.low52 * 1.1 ? 'NEAR_BOTTOM' : 'MID'
      : 'UNKNOWN',
    pe: pick.pe,
    pb: raw.pb,
    evEbitda: raw.evEbitda,
    peg: raw.peg,
    roe: raw.roe,
    roce: raw.roce,
    revenueGrowth3y: raw.accuracy?.salesCagr3y ?? raw.revenueGrowth,
    revenueGrowth5y: raw.accuracy?.salesCagr5y,
    profitGrowth3y: raw.accuracy?.profitCagr3y ?? raw.earningsGrowth,
    profitGrowth5y: raw.accuracy?.profitCagr5y,
    debtEquity: raw.debtEquity,
    currentRatio: raw.currentRatio,
    operatingMargins: raw.operatingMargins,
    profitMargins: raw.profitMargins,
    freeCashflow: raw.freeCashflow,
    divYield: raw.divYield,
    promoterPct: raw.accuracy?.metricSources ? null : null,
    score: pick.score,
    tier: pick.tier,
    gemArchetype: pick.gemArchetype,
    existingReasons: pick.reasons,
    existingRisks: pick.risks,
    crossCheckQuality: raw.crossCheck.overall,
    screenerBacked: Object.values(raw.accuracy?.metricSources || {}).filter(s => String(s).includes('Screener')).length,
    sources: raw.sources.map(s => s.name),
  };

  const { data, error } = await callLLMJson<GemLlmPatch>(
    SYSTEM,
    `Analyze this Indian stock for underrated gem / multibagger research potential:\n${JSON.stringify(facts, null, 2)}`,
    maxTokens(),
    'deepseek'
  );

  if (!data || error) return pick;

  const VALID_ARCHETYPES = ['UNDERRATED_GEM', 'MULTIBAGGER_CANDIDATE', 'TENBAGGER_WATCH', 'GROWTH_COMPOUNDER'];
  const archetype = VALID_ARCHETYPES.includes(data.gemArchetype)
    ? data.gemArchetype
    : pick.gemArchetype;

  // Merge LLM tag with existing score-based tag
  let updatedTag = pick.tag;
  if (data.moschipScore >= 70) updatedTag = 'Moschip-style gem 🔬';
  else if (archetype === 'UNDERRATED_GEM') updatedTag = 'Underrated gem';
  else if (archetype === 'TENBAGGER_WATCH') updatedTag = 'Tenbagger watch (high risk)';
  else if (archetype === 'MULTIBAGGER_CANDIDATE') updatedTag = 'Multibagger candidate';

  return {
    ...pick,
    tag: updatedTag,
    gemArchetype: archetype || pick.gemArchetype,
    deepAnalysis: data.deepAnalysis || pick.deepAnalysis,
    undervaluationNote: data.undervaluationNote || pick.undervaluationNote,
    growthOutlook: data.growthOutlook || pick.growthOutlook,
    sectorTheme: data.sectorTheme || pick.sectorTheme,
    expectedCagrBand: data.expectedCagrBand || pick.expectedCagrBand,
    attentionScore: Math.min(100, Math.max(0, Number(data.attentionScore) || pick.attentionScore || 50)),
    growthThesis: data.deepAnalysis?.slice(0, 320) || pick.growthThesis,
    reasons: [
      ...pick.reasons,
      ...(Array.isArray(data.extraReasons) ? data.extraReasons.slice(0, 3) : []),
      ...(Array.isArray(data.catalysts) ? data.catalysts.slice(0, 2).map(c => `Catalyst: ${c}`) : []),
    ].filter((v, i, a) => a.indexOf(v) === i).slice(0, 7),
    risks: [
      ...pick.risks,
      ...(Array.isArray(data.extraRisks) ? data.extraRisks.slice(0, 2) : []),
      ...(Array.isArray(data.dealbreakers) ? data.dealbreakers.slice(0, 1).map(d => `⛔ ${d}`) : []),
    ].filter((v, i, a) => a.indexOf(v) === i).slice(0, 6),
    llmEnriched: true,
  };
}

export async function enrichTopMultibaggers(
  picks: MultibaggerPick[],
  rawByTicker: Map<string, RawFundamentals>,
  maxEnrich = 5,
): Promise<MultibaggerPick[]> {
  if (!isLLMConfigured() || picks.length === 0) return picks;

  // With Gemini's free tier we can afford to enrich more picks
  const cfg = resolveLLMConfig();
  const n = cfg?.provider === 'gemini' ? Math.min(picks.length, maxEnrich) : Math.min(picks.length, 3);

  const top = picks.slice(0, n);
  const rest = picks.slice(n);

  const enriched: MultibaggerPick[] = [];
  for (const pick of top) {
    const raw = rawByTicker.get(pick.ticker);
    if (!raw) {
      enriched.push(pick);
      continue;
    }
    try {
      const res = await enrichMultibaggerWithLLM(pick, raw);
      enriched.push(res);
      await new Promise(r => setTimeout(r, 1200));
    } catch {
      enriched.push(pick);
    }
  }

  return [...enriched, ...rest];
}
