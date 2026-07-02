import { callLLM, resolveLLMConfig } from '@/lib/llmProvider';
import type { LLMExplanation } from '@/lib/llmIntegration';
import type { StockPulseReport } from './types';

export interface StockPulseNarrativePatch {
  businessDescription?: string;
  simpleWords?: Partial<Record<string, string>>;
  pulseOneLiner?: string;
  horizonTakeaway?: string;
  investFraming?: string;
  strengths?: string[];
  risks?: string[];
  trackQuarterly?: string;
}

/**
 * Gemini-optimised system prompt.
 * Gemini 2.0 Flash has a 1M-token context and strong analytical reasoning —
 * we push it further here compared to the generic OpenAI/Groq prompt.
 */
const GROUND_RULES = `You are Stock Pulse, an elite Deep Neural Fundamental Analyser for Indian equities.
You utilize multi-layered reasoning (DeepSeek/Groq architecture) to uncover hidden value, detect accounting red flags, and synthesize macroeconomic context.

ABSOLUTE RULES (never break):
1. Use ONLY the numbers supplied in the facts JSON + metricSources. Never fabricate, round differently, or guess.
2. If a metric is null, say "not available in our feed — verify at Screener.in". Never substitute a made-up value.
3. No buy / sell / hold recommendation. No price targets.
4. Plain language first, jargon explained in parentheses on first use.
5. Compounded sales/profit growth (Screener.in HTML) = highest accuracy source — cite it explicitly.
6. ROCE from Screener.in is more reliable than Yahoo's returnOnEquity for Indian cos — prefer it.
7. What-if scenarios are illustrative extrapolations, not forecasts.
8. Be honest about weak data: if dataConfidence is LOW/VERY_LOW, lead with "Limited data — treat as outline only".
9. Horizon-aware: a 3Y view vs 10Y view should produce meaningfully different outlooks.

OUTPUT: Return ONLY valid JSON (no markdown, no commentary outside JSON):
{
  "businessDescription": "5-6 sentences: core business model, revenue streams, competitive context, one honest strength, one honest risk — grounded in facts",
  "simpleWords": {
    "overview": "2-3 sentences for a beginner: what the company does, current price context, data confidence",
    "business": "2 sentences: how it actually earns money, what would make earnings grow or shrink",
    "valuation": "2 sentences: P/E vs sector reference, cheap/fair/expensive verdict with number — cite sector PE if available",
    "growth": "2 sentences: cite exact Screener compounded sales/profit % if present; otherwise use revenueGrowth; classify honestly",
    "health": "2 sentences: D/E level, FCF sign, current ratio — is the balance sheet safe or stretched?",
    "returns": "2 sentences: ROE/ROCE numbers, what they mean, dividend note",
    "moat": "2 sentences: honest moat assessment — wide/narrow/none and why from the data",
    "peers": "2 sentences: how this company compares vs sector average; note if comparison data is missing",
    "owners": "2 sentences: promoter %, FII trend, pledging flag if any",
    "pulse": "3 concise sentences: Deep neural synthesis — business quality, financial posture, hidden patterns, horizon fit."
  },
  "pulseOneLiner": "1 crisp honest sentence — high-conviction deep reasoning summary",
  "horizonTakeaway": "2-3 sentences for the specific investment horizon — what matters most over this period",
  "investFraming": "3 bullet points (one per line starting with •): what to like, what to watch, what to track quarterly — no buy/sell",
  "strengths": ["3-4 short strength bullets grounded in data"],
  "risks": ["3-4 short risk bullets grounded in data"],
  "trackQuarterly": "2 sentences: exact metrics to watch each quarter to know if the thesis is working"
}`;

function factsPayload(report: StockPulseReport): string {
  return JSON.stringify({
    ticker: report.ticker,
    company: report.companyName,
    sector: report.sector,
    industry: report.industry,
    horizonYears: report.horizonYears,
    dataConfidence: report.dataConfidence,
    sectionsLive: report.sectionsLive,
    crossCheckOverall: report.crossCheck.overall,
    verifiedMetrics: report.crossCheck.verifiedCount,
    sources: report.sources.map(s => s.name),
    metricSources: report.metricSources || {},
    price: report.price,
    valuation: { verdict: report.valuation.verdict, rows: report.valuation.rows },
    growth: report.growth,
    health: report.health,
    returns: report.returns,
    moat: report.moat,
    ownership: report.ownership,
    peers: report.peers,
    pulse: {
      score: report.pulse.score,
      quality: report.pulse.quality,
      breakdown: report.pulse.breakdown,
    },
    flags: report.flags,
    scenarios: report.scenarios,
  }, null, 2);
}

function maxTokensForProvider(): number {
  const cfg = resolveLLMConfig();
  if (!cfg) return 1500;
  // Gemini 2.0 Flash: up to ~8192 output tokens, use generously
  if (cfg.provider === 'gemini') return 3000;
  // DeepSeek: decent context
  if (cfg.provider === 'deepseek') return 2500;
  return 2000;
}

export async function enrichReportWithLLM(report: StockPulseReport): Promise<StockPulseReport> {
  try {
    const { content } = await callLLM(
      GROUND_RULES,
      `Facts JSON for ${report.companyName} (${report.ticker}), ${report.horizonYears}-year horizon:\n\n${factsPayload(report)}\n\nWrite the full narrative analysis.`,
      maxTokensForProvider(),
      0.3,
      'deepseek'
    );
    if (!content) return report;

    let patch: StockPulseNarrativePatch;
    try {
      patch = JSON.parse(content) as StockPulseNarrativePatch;
    } catch {
      // Gemini sometimes includes a thin wrapper — try stripping
      const stripped = content.replace(/^[^{]*/, '').replace(/[^}]*$/, '');
      patch = JSON.parse(stripped) as StockPulseNarrativePatch;
    }

    const mergedWords = { ...report.simpleWords };
    if (patch.simpleWords) {
      for (const [k, v] of Object.entries(patch.simpleWords)) {
        if (typeof v === 'string' && v.trim()) mergedWords[k] = v;
      }
    }

    // Parse investFraming bullets into array
    const opportunityList = patch.investFraming
      ? patch.investFraming
          .split('\n')
          .map(l => l.replace(/^[•\-*]\s*/, '').trim())
          .filter(Boolean)
          .slice(0, 3)
      : report.pulse.opportunities;

    return {
      ...report,
      businessBlurb: patch.businessDescription || report.businessBlurb,
      simpleWords: mergedWords,
      pulse: {
        ...report.pulse,
        oneLiner: patch.pulseOneLiner || report.pulse.oneLiner,
        strengths: patch.strengths?.length
          ? patch.strengths.slice(0, 4)
          : report.pulse.strengths,
        risks: patch.risks?.length
          ? patch.risks.slice(0, 4)
          : report.pulse.risks,
        trackQuarterly: patch.trackQuarterly || patch.horizonTakeaway || report.pulse.trackQuarterly,
        opportunities: opportunityList,
        monitorRisks: patch.risks?.length ? patch.risks : report.pulse.monitorRisks,
        breakdown: report.pulse.breakdown,
        score: report.pulse.score,
        quality: report.pulse.quality,
      },
    };
  } catch {
    return report;
  }
}

export type { LLMExplanation };
