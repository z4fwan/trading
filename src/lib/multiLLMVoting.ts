/**
 * Multi-LLM Voting System - Institutional Grade Consensus
 * 
 * Uses multiple LLM providers to vote on sentiment and event classification.
 * Only sends signals when there is strong consensus (≥2/3 LLMs agree).
 * This significantly reduces false positives and improves accuracy.
 */

import { callLLM } from './llmProvider';

export interface LLMVote {
  provider: string;
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  sentimentScore: number;
  eventType: string;
  confidence: number;
  reasoning: string;
}

export interface ConsensusResult {
  hasConsensus: boolean;
  consensusSentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  consensusEventType: string;
  avgSentimentScore: number;
  voteCount: number;
  totalVotes: number;
  consensusStrength: 'STRONG' | 'MODERATE' | 'WEAK' | 'NONE';
  votes: LLMVote[];
}

/**
 * Available LLM providers for voting
 */
const LLM_PROVIDERS = ['groq', 'gemini', 'deepseek'];

/**
 * Get sentiment analysis from a specific LLM provider
 */
async function getLLMVote(
  provider: string,
  headline: string,
  source: string
): Promise<LLMVote | null> {
  const systemPrompt = `You are an elite quantitative analyst for NSE/BSE markets.
Analyze this corporate news headline and provide a structured assessment.

Return ONLY valid JSON:
{
  "sentiment": "BULLISH" | "BEARISH" | "NEUTRAL",
  "sentimentScore": 0-100,
  "eventType": "ORDER_WIN" | "CORPORATE_ACTION" | "TURNAROUND" | "EARNINGS_BEAT" | "PROFIT_SURGE" | "ACQUISITION" | "MERGER" | "FDA_APPROVAL" | "DEBT_REDUCTION" | "PROMOTER_BUYING" | "PROMOTER_SELLING" | "MACRO" | "GENERAL",
  "confidence": 0-100,
  "reasoning": "Brief 1-sentence explanation"
}`;

  const userPrompt = `Source: ${source}
Headline: ${headline}

Provide your professional assessment.`;

  try {
    const { content } = await callLLM(systemPrompt, userPrompt, 300, 0.2, provider);
    if (!content) return null;

    const parsed = JSON.parse(content);
    return {
      provider,
      sentiment: ['BULLISH', 'BEARISH', 'NEUTRAL'].includes(parsed.sentiment) 
        ? parsed.sentiment 
        : 'NEUTRAL',
      sentimentScore: Math.min(100, Math.max(0, parsed.sentimentScore || 50)),
      eventType: parsed.eventType || 'GENERAL',
      confidence: Math.min(100, Math.max(0, parsed.confidence || 50)),
      reasoning: parsed.reasoning || '',
    };
  } catch {
    return null;
  }
}

/**
 * Get consensus from multiple LLM providers
 * Only returns a result if there is strong consensus (≥2/3 agree)
 */
export async function getMultiLLMConsensus(
  headline: string,
  source: string
): Promise<ConsensusResult> {
  // Get votes from all available providers concurrently
  const votePromises = LLM_PROVIDERS.map(provider => getLLMVote(provider, headline, source));
  const votes = (await Promise.all(votePromises)).filter((v): v is LLMVote => v !== null);

  if (votes.length === 0) {
    return {
      hasConsensus: false,
      consensusSentiment: 'NEUTRAL',
      consensusEventType: 'GENERAL',
      avgSentimentScore: 50,
      voteCount: 0,
      totalVotes: votes.length,
      consensusStrength: 'NONE',
      votes: [],
    };
  }

  // Count sentiment votes
  const sentimentCounts = {
    BULLISH: votes.filter(v => v.sentiment === 'BULLISH').length,
    BEARISH: votes.filter(v => v.sentiment === 'BEARISH').length,
    NEUTRAL: votes.filter(v => v.sentiment === 'NEUTRAL').length,
  };

  // Find dominant sentiment
  const dominantSentiment = Object.entries(sentimentCounts).sort((a, b) => b[1] - a[1])[0];
  const [consensusSentiment, maxCount] = dominantSentiment;

  // Count eventType votes
  const eventTypeCounts: Record<string, number> = {};
  votes.forEach(v => {
    eventTypeCounts[v.eventType] = (eventTypeCounts[v.eventType] || 0) + 1;
  });
  const consensusEventType = Object.entries(eventTypeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'GENERAL';

  // Calculate average sentiment score
  const avgSentimentScore = Math.round(
    votes.reduce((sum, v) => sum + v.sentimentScore, 0) / votes.length
  );

  // Determine consensus strength
  const consensusRatio = maxCount / votes.length;
  let consensusStrength: ConsensusResult['consensusStrength'] = 'NONE';
  if (consensusRatio >= 0.9) consensusStrength = 'STRONG';
  else if (consensusRatio >= 0.67) consensusStrength = 'MODERATE';
  else if (consensusRatio >= 0.5) consensusStrength = 'WEAK';

  // Has consensus if ≥2/3 LLMs agree
  const hasConsensus = consensusRatio >= 0.67 && sentimentCounts[consensusSentiment as keyof typeof sentimentCounts] >= 2;

  return {
    hasConsensus,
    consensusSentiment: consensusSentiment as 'BULLISH' | 'BEARISH' | 'NEUTRAL',
    consensusEventType,
    avgSentimentScore,
    voteCount: maxCount,
    totalVotes: votes.length,
    consensusStrength,
    votes,
  };
}

/**
 * Quick consensus check - only uses 2 fastest providers for speed
 */
export async function getQuickConsensus(
  headline: string,
  source: string
): Promise<ConsensusResult> {
  // Use only the 2 fastest providers for quick decisions
  const quickProviders = ['groq', 'gemini'];
  
  const votePromises = quickProviders.map(provider => getLLMVote(provider, headline, source));
  const votes = (await Promise.all(votePromises)).filter((v): v is LLMVote => v !== null);

  if (votes.length < 2) {
    return {
      hasConsensus: false,
      consensusSentiment: 'NEUTRAL',
      consensusEventType: 'GENERAL',
      avgSentimentScore: 50,
      voteCount: 0,
      totalVotes: votes.length,
      consensusStrength: 'NONE',
      votes: [],
    };
  }

  // Both must agree for quick consensus
  const bothBullish = votes.every(v => v.sentiment === 'BULLISH');
  const bothBearish = votes.every(v => v.sentiment === 'BEARISH');
  
  if (!bothBullish && !bothBearish) {
    return {
      hasConsensus: false,
      consensusSentiment: 'NEUTRAL',
      consensusEventType: votes[0].eventType,
      avgSentimentScore: votes.reduce((s, v) => s + v.sentimentScore, 0) / votes.length,
      voteCount: 1,
      totalVotes: votes.length,
      consensusStrength: 'WEAK',
      votes,
    };
  }

  return {
    hasConsensus: true,
    consensusSentiment: bothBullish ? 'BULLISH' : 'BEARISH',
    consensusEventType: votes[0].eventType,
    avgSentimentScore: Math.round(votes.reduce((s, v) => s + v.sentimentScore, 0) / votes.length),
    voteCount: votes.length,
    totalVotes: votes.length,
    consensusStrength: 'STRONG',
    votes,
  };
}

export default {
  getMultiLLMConsensus,
  getQuickConsensus,
};