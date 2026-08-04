import { callLLM } from './llmProvider';
import type { PillarData } from './alternativeData';

export interface BrainDecision {
  decision: 'EXECUTE' | 'HOLD' | 'REJECT';
  confidence: number;
  reasoning: string;
}

/**
 * The Master Quant Brain.
 * Synthesizes 6-Pillar Intelligence to make a definitive trading decision.
 */
export async function evaluateTradeWithHumanBrain(ticker: string, data: PillarData): Promise<BrainDecision> {
  const systemPrompt = `You are the Lead Quantitative Portfolio Manager at a Tier-1 Hedge Fund.
Your job is to make a definitive execution decision based on a strict 6-Pillar Intelligence framework.

You will receive data across 6 dimensions:
1. Social/Alternative Sentiment (Reddit, Twitter, Analyst calls)
2. Smart Money/Order Flow (Volume Surges, Order Blocks)
3. Options Intelligence (PCR, Max Pain, IV)
4. Macro/Sector Breadth (VIX, Sector Momentum)
5. Technicals (RSI, MACD, VWAP)
6. V7 ML Probability (Deep Sequence Prediction)

RULES FOR EXECUTION:
- You must seek absolute confluence. If the V7 ML Probability is high, but the options flow is bearish (high PCR, institutional selling) or Macro is terrible (VIX spiking > 20), you must HOLD or REJECT.
- If social sentiment is roaring but there is no volume surge (Smart Money), it is a retail trap. HOLD.
- If all 6 pillars align perfectly (e.g., V7 Prob > 65%, Vol Surge > 1.5, RSI > 50, MACD positive, Options bullish), output EXECUTE.

Return ONLY valid JSON in this exact format:
{
  "decision": "EXECUTE" | "HOLD" | "REJECT",
  "confidence": <number 0-100>,
  "reasoning": "<A strict, 2-sentence explanation of why the 6 pillars align or fail to align>"
}`;

  const userPrompt = `Evaluate this setup for ${ticker}:
- V7 ML Probability: ${data.mlProbability}%
- Social Sentiment: Reddit ${data.socialSentiment.redditScore}/100, Twitter ${data.socialSentiment.twitterScore}/100. Analyst Call: ${data.socialSentiment.bullScoreMatch}
- Smart Money: Vol Surge ${data.smartMoney.volumeSurge}x, Promoter: ${data.smartMoney.promoterActivity}, Blocks: ${data.smartMoney.orderBlocks}
- Options: PCR ${data.optionsIntelligence.putCallRatio}, IV ${data.optionsIntelligence.impliedVolatility}
- Macro: VIX ${data.macroSector.vixLevel}, Sector ${data.macroSector.sectorMomentum}
- Technicals: RSI ${data.technicals?.rsi ?? 'N/A'}, MACD ${data.technicals?.macd.histogram ?? 'N/A'}`;

  const { content, error } = await callLLM(systemPrompt, userPrompt, 200, 0.1, 'groq');
  
  if (!content) {
    console.warn(`[EnsembleBrain] LLM failure for ${ticker}: ${error}`);
    return { decision: 'HOLD', confidence: 0, reasoning: 'LLM synthesis failed.' };
  }

  try {
    const parsed = JSON.parse(content);
    return {
      decision: ['EXECUTE', 'HOLD', 'REJECT'].includes(parsed.decision) ? parsed.decision : 'HOLD',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 50,
      reasoning: parsed.reasoning || 'No reasoning provided.'
    };
  } catch (e) {
    console.warn(`[EnsembleBrain] Parse failure for ${ticker}: ${content}`);
    return { decision: 'HOLD', confidence: 0, reasoning: 'Failed to parse AI output.' };
  }
}
