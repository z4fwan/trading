import type { ClassifiedNewsItem, EngineMacroShock } from './engineState';
import { isEliteSource, isIndianEliteSource, isTier1MacroSource } from './eliteSources';
import { matchAllMacroEvents, getMacroShockSeverity } from './geoPoliticalMap';
import { headlineSuggestsIndia } from './indianMacro';
import { analyzeNewsWithLLM, isLLMConfigured } from './llmIntegration';
import { sendTelegramMessage, editTelegramMessage } from './telegramBot';
import { getFullUniverse } from './dynamicUniverse';
import { getEngineState } from './engineState';
import { getAssetClass } from './marketConfig';
import { getPredictionsByTicker, addPrediction } from './predictionStore';
import { calculateEventProbability } from './probabilityEngine';
import { verifySource } from './sourceVerificationEngine';
import { getQuickConsensus } from './multiLLMVoting';

const BREAKING_KEYWORDS = [
  'breaking:', 'breaking news', 'urgent:', 'just in:', 'developing:', 'state of emergency',
  'declares war', 'military strike', 'nuclear', 'invasion', 'market crash', 'circuit breaker',
  'bank run', 'sovereign default', 'missile strike',
];

const notifiedNewsIds = new Set<string>();

function normalizeTickers(raw: string[]): string[] {
  const valid = new Set(getFullUniverse());
  return [...new Set(raw.map(t => t.toUpperCase().replace('.NS', '')).filter(t => valid.has(t)))];
}

function isBreakingHeadline(headline: string): boolean {
  const lower = headline.toLowerCase();
  return BREAKING_KEYWORDS.some(k => lower.includes(k));
}

function priorityScore(item: ClassifiedNewsItem): number {
  let score = item.impactScore;
  if (isEliteSource(item.source)) score += 25;
  if (isIndianEliteSource(item.source)) score += 22;
  if (item.region === 'INDIAN') score += 12;
  if (isBreakingHeadline(item.headline)) score += 20;
  if (item.llmUrgency) score += item.llmUrgency * 0.3;
  return score;
}

function isTier1MacroItem(item: ClassifiedNewsItem): boolean {
  if (isTier1MacroSource(item.source)) return true;
  if (item.region === 'INDIAN' && (item.llmUrgency ?? 0) >= 72) return true;
  if ((item.llmUrgency ?? 0) >= 85) return true;
  return false;
}

const INDIA_SHOCK_PHRASES = [
  'nifty crash', 'sensex crash', 'circuit breaker', 'rbi emergency', 'fii outflow',
  'fpi outflow', 'rupee record low', 'sebi ban', 'market halt',
];

export async function enrichNewsWithLLM(items: ClassifiedNewsItem[]): Promise<ClassifiedNewsItem[]> {
  if (!isLLMConfigured() || items.length === 0) return items;

  const now = Date.now();
  const STRICT_LIVE_AGE_MS = 4 * 60 * 60 * 1000; // max 4 hours old for real-time analysis

  const freshIndianItems = items.filter(i => 
    i.region === 'INDIAN' && 
    i.timestamp && 
    (now - i.timestamp <= STRICT_LIVE_AGE_MS)
  );

  const sorted = [...freshIndianItems].sort((a, b) => priorityScore(b) - priorityScore(a));
  const toAnalyze = sorted.slice(0, 12);

  const engine = getEngineState();
  const globalTrend = engine.macroShockDetail?.active 
    ? `SHOCK: ${engine.macroShockDetail.headline}` 
    : engine.macroShockInfo || 'Normal';

  // Process sequentially to protect free-tier LLM API rate limits (TPM)
  for (const item of toAnalyze) {
    if (notifiedNewsIds.has(item.id)) continue;
    
    try {
      // === LAYER 0: Source Verification Gate ===
      const verification = verifySource(
        item.headline,
        item.source,
        item.timestamp,
        item.region
      );
      if (verification.status === 'REJECTED') {
        console.log(`[SourceVerify] REJECTED (${verification.score}): ${item.headline.slice(0, 60)}`);
        continue; // Never reaches LLM, Telegram, or UI
      }
      if (verification.status === 'UNVERIFIED') {
        console.log(`[SourceVerify] UNVERIFIED (${verification.score}): ${item.headline.slice(0, 60)}`);
        continue; // Audit log only
      }
      // VERIFIED — proceed to LLM analysis
      (item as any).verificationScore = verification.score;
      (item as any).verificationSources = verification.sources;

      // Build rapid context
      const contexts = item.tickers.slice(0, 3).map(t => {
        const preds = getPredictionsByTicker(t);
        const last = preds[preds.length - 1];
        if (!last || !last.taSnapshot) return `${t}: No tech data`;
        return `${t}: Trend=${last.regime}, RSI=${last.taSnapshot.rsi.toFixed(0)}`;
      });
      const marketContext = `Global: ${globalTrend} | Tech: ${contexts.join(', ')}`;

      const analysis = await analyzeNewsWithLLM(
        item.headline,
        item.source,
        item.tickers,
        item.region === 'INDIAN' ? 'INDIAN' : 'INTERNATIONAL'
      );
      if (!analysis) continue;
      
      // Calculate Phase 1 Probability (Fast)
      const primaryTicker = item.tickers[0] || 'NIFTY';
      const preds = getPredictionsByTicker(primaryTicker);
      const last = preds[preds.length - 1];
      const rsi = last?.taSnapshot?.rsi || 50;
      
      const probInputs = {
        eventType: analysis.eventType,
        sentiment: analysis.sentiment,
        sentimentScore: analysis.sentimentScore,
        urgency: analysis.urgency,
        niftyTrend: globalTrend,
        sectorStrength: 50, // Default Phase 1
        rsi: rsi,
        relativeVolume: 1.0, // Default Phase 1
        historicalWinRate: 50,
        historicalMatchCount: 0,
      };

      const probResult = calculateEventProbability(probInputs);
      
      item.llmAnalyzed = true;
      item.llmReasoning = analysis.reasoning;
      item.llmUrgency = analysis.urgency;
      item.llmImpactLevel = analysis.impactLevel;
      item.llmEventType = analysis.eventType;
      item.llmTradingSignal = probResult.signal as any;
      item.sentiment = analysis.sentiment;
      item.impactScore = Math.round(item.impactScore * 0.35 + analysis.sentimentScore * 0.45 + analysis.urgency * 0.2);
      
      const merged = normalizeTickers([...item.tickers, ...analysis.affectedTickers]);
      if (merged.length > 0) item.tickers = merged;
      item.summary = analysis.reasoning.slice(0, 280) || item.headline;

      // Multi-LLM Consensus Check (Phase 4: Voting System)
      // For ultra-high confidence signals, get quick consensus from multiple LLMs
      let multiLLMConsensus = null;
      let hasMultiLLMConsensus = false;
      
      // Only run multi-LLM voting for high-impact events (to save API calls)
      if (probResult.probability >= 75 && probResult.signal !== 'IGNORE') {
        try {
          multiLLMConsensus = await getQuickConsensus(item.headline, item.source);
          hasMultiLLMConsensus = multiLLMConsensus?.hasConsensus || false;
          (item as any).multiLLMConsensus = multiLLMConsensus;
        } catch {
          // Silent fail - don't block signal on voting error
        }
      }

      // Probability Engine Signal Alert - Send for HIGH IMPACT events.
      // Strict floor: a news headline alone is a weak signal, so it must clear
      // a HIGH bar (80%+) and have a live price — otherwise the alert is noise
      // (e.g. "72% MEDIUM" calls that fire on every press release).
      const verificationScore = (item as any).verificationScore as number | undefined;
      const { getLivePrice } = require('./quoteFetcher') as { getLivePrice: (t: string) => number | null };
      const hasLivePrice = item.tickers.length > 0 && !!getLivePrice(item.tickers[0]);
      const isHighImpact = probResult.signal !== 'IGNORE' && probResult.probability >= 80 && hasLivePrice;
      const isVerifiedHighConfidence = verificationScore && verificationScore >= 80 && probResult.confidence === 'High' && hasLivePrice;
      const isCorporateAction = ['ORDER_WIN', 'CORPORATE_ACTION', 'TURNAROUND', 'EARNINGS_BEAT', 'PROFIT_SURGE', 'ACQUISITION', 'MERGER', 'FDA_APPROVAL', 'DEBT_REDUCTION', 'PROMOTER_BUYING'].includes(analysis.eventType);
      
      // Send signal only when: high probability (>=80) OR verified high
      // confidence (>=80) OR a corporate action with a strong impact score.
      // A bare 65-79% headline NEVER reaches Telegram anymore.
      const shouldSendSignal = isHighImpact || isVerifiedHighConfidence || (isCorporateAction && item.impactScore >= 85 && hasLivePrice);
      
      if (shouldSendSignal) {
        const signalIcon = probResult.signal.includes('BUY') ? '🟢 ' + probResult.signal : probResult.signal.includes('SELL') ? '🔴 ' + probResult.signal : '🚨 ' + probResult.signal;
        
        const driversList = analysis.drivers?.map(d => `✓ ${d}`).join('\n') || 'None';
        const risksList = analysis.risks?.map(r => `✗ ${r}`).join('\n') || 'None';
        
        // Determine holding period based on event type
        const getHoldingPeriod = (eventType: string) => {
          const map: Record<string, string> = {
            'ORDER_WIN': '⚡ INTRADAY',
            'FDA_APPROVAL': '⚡ INTRADAY',
            'EARNINGS_BEAT': '📅 SWING (2-5 Days)',
            'PROFIT_SURGE': '📅 SWING (2-5 Days)',
            'ACQUISITION': '📅 SWING (1-2 Weeks)',
            'MERGER': '📅 SWING (1-2 Weeks)',
            'CORPORATE_ACTION': '📅 SWING (2-5 Days)',
            'DEBT_REDUCTION': '📈 LONG TERM',
            'PROMOTER_BUYING': '📈 LONG TERM',
            'TURNAROUND': '📅 SWING (1-2 Weeks)',
          };
          return map[eventType] || '📅 SWING (2-5 Days)';
        };
        
        const holdingPeriod = getHoldingPeriod(analysis.eventType);
        
        // Multi-LLM consensus badge
        const consensusBadge = hasMultiLLMConsensus 
          ? `🤖 *Multi-LLM Consensus: ${multiLLMConsensus?.consensusStrength || 'UNKNOWN'}* (${multiLLMConsensus?.voteCount || 0}/${multiLLMConsensus?.totalVotes || 0} LLMs agree)\n` 
          : '';

        const badgeStr = item.region ? `[${item.region === 'INDIAN' ? '🇮🇳 IN' : item.region === 'US' ? '🇺🇸 US' : '🌍 GLOBAL'} MARKET] ` : '';
        const assetClass = item.region || getAssetClass(item.tickers[0] || '');
        const assetLabel = assetClass === 'INDIAN' ? '🇮🇳 Indian Stock' : assetClass === 'US' ? '🇺🇸 US Stock' : assetClass === 'CRYPTO' ? '₿ Crypto' : '🌍 Asset';
        
        const { getLivePrice } = require('./quoteFetcher');
        const livePriceStr = item.tickers.length > 0 && getLivePrice(item.tickers[0]) ? ` (Live: ₹${getLivePrice(item.tickers[0]).toFixed(2)})` : '';

        const buildMsg = (pRes: typeof probResult) => 
          `${badgeStr}${signalIcon} | Prob: ${pRes.probability}% | Conf: ${pRes.confidence}\n\n` +
          `*${assetLabel}: ${item.tickers.join(', ')}*${livePriceStr}\n` +
          `${item.sentiment} (Event: ${analysis.eventType})\n\n` +
          `${consensusBadge}🎯 *Holding Period: ${holdingPeriod}*\n\n` +
          `Headline: ${item.headline}\n\n` +
          `*Drivers:*\n${driversList}\n\n` +
          `*Risks:*\n${risksList}`;

        const sentMsg = await sendTelegramMessage(buildMsg(probResult));

        // Phase 2: Async Deep Calculation
        if (sentMsg) {
          setTimeout(async () => {
            // Fetch real historical performance from predictionStore
            const { getPredictionsByTicker } = require('./predictionStore');
            const pastPreds = getPredictionsByTicker(primaryTicker) || [];
            const resolvedPreds = pastPreds.filter((p: any) => p.resolved);
            
            probInputs.historicalMatchCount = resolvedPreds.length;
            if (resolvedPreds.length > 0) {
              const wins = resolvedPreds.filter((p: any) => p.result === 'CORRECT').length;
              probInputs.historicalWinRate = (wins / resolvedPreds.length) * 100;
            } else {
              probInputs.historicalWinRate = 0;
            }
            
            // Relative volume could be fetched from liveData, but for now we default to 1.0 
            // if live data isn't immediately available to avoid random dummy data
            probInputs.relativeVolume = 1.0;
            
            const p2Result = calculateEventProbability(probInputs);
            const p2Msg = `[UPDATED]\n` + buildMsg(p2Result) + `\n\n*Historical Context:*\nMatches: ${probInputs.historicalMatchCount} | Win-Rate: ${probInputs.historicalWinRate.toFixed(1)}%`;
            
            await editTelegramMessage(sentMsg.chat_id, sentMsg.message_id, p2Msg);
          }, 3500);
        }

        // Layer 11: Performance Tracking
        if (probResult.signal !== 'IGNORE') {
           addPrediction({
             ticker: primaryTicker,
             name: primaryTicker,
             source: 'AI_QUANT',
             predictionType: 'HOURLY',
             direction: probResult.signal === 'BUY_SETUP' || probResult.signal === 'STRONG_BUY_SETUP' || probResult.signal === 'WATCH_PULLBACK' ? 'BULLISH' : 'BEARISH',
             confidence: parseInt(String(probResult.confidence).replace(/[^0-9]/g, ''), 10) || 75,
             reasoning: [analysis.reasoning],
             riskRewardRatio: 1.5,
             entryPrice: -1,
             stopLoss: -1,
             targetPrice: -1,
             bullishProb: 0.5,
             bearishProb: 0.5,
             expectedVolatility: 0.1,
             marketCondition: 'NEUTRAL',
             regime: 'NEUTRAL',
             taSnapshot: null,
             sentimentScore: 0,
             targetDate: new Date(Date.now() + 3600000).toISOString(),
             expiryDate: new Date(Date.now() + 3600000).toISOString()
           });
        }
        
        // Mark as processed
        notifiedNewsIds.add(item.id);
        if (notifiedNewsIds.size > 1000) {
          const first = notifiedNewsIds.values().next().value;
          if (first != null) notifiedNewsIds.delete(first as string);
        }
      }

      // Small delay between calls to respect rate limits
      await new Promise(r => setTimeout(r, 1200));
    } catch { /* skip item */ }
  }

  return items;
}

/** Only treat news this fresh as a live macro shock (not days-old RSS). */
export const MACRO_NEWS_MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8 hours

function isFreshNewsItem(item: ClassifiedNewsItem, now = Date.now()): boolean {
  if (!item.timestamp || item.timestamp <= 0) return false;
  return now - item.timestamp <= MACRO_NEWS_MAX_AGE_MS;
}

export function isMacroShockFresh(macro: EngineMacroShock | null | undefined, now = Date.now()): boolean {
  if (!macro?.active || !macro.headline) return false;
  const ts = macro.newsTimestamp;
  if (!ts || ts <= 0) return false;
  return now - ts <= MACRO_NEWS_MAX_AGE_MS;
}

export function detectMacroFromNews(items: ClassifiedNewsItem[]): EngineMacroShock | null {
  const now = Date.now();
  const sorted = [...items].sort((a, b) => b.timestamp - a.timestamp);

  for (const item of sorted) {
    if (!isFreshNewsItem(item, now)) continue;
    const impacts = matchAllMacroEvents(item.headline, item.summary);
    const tier1 = isTier1MacroItem(item);
    const breakingElite = isTier1MacroSource(item.source) && isBreakingHeadline(item.headline);
    const indiaMacro = item.region === 'INDIAN' && impacts.some(i => i.id.startsWith('india-'));
    if (impacts.length > 0 && (tier1 || breakingElite || indiaMacro)) {
      const regime = getMacroShockSeverity(impacts);
      item.macroEventId = impacts[0].id;
      const region = item.region === 'INDIAN' || impacts.some(i => i.id.startsWith('india-'))
        ? 'INDIAN' as const
        : 'INTERNATIONAL' as const;
      return {
        active: true,
        source: item.source,
        headline: item.headline,
        forcedRegime: regime,
        detectedAt: now,
        newsTimestamp: item.timestamp,
        impactIds: impacts.map(i => i.id),
        region,
      };
    }
  }

  for (const item of sorted) {
    if (!isFreshNewsItem(item, now)) continue;
    if (!isTier1MacroItem(item)) continue;
    const lower = item.headline.toLowerCase();
    const shockWords = ['war', 'invasion', 'nuclear', 'emergency', 'default', 'sanctions', 'crash', 'collapse'];
    const indiaShock = item.region === 'INDIAN' && INDIA_SHOCK_PHRASES.some(p => lower.includes(p));
    if (shockWords.some(w => lower.includes(w)) || indiaShock) {
      return {
        active: true,
        source: item.source,
        headline: item.headline,
        forcedRegime: 'HIGH_VOLATILITY',
        detectedAt: now,
        newsTimestamp: item.timestamp,
        impactIds: [indiaShock ? 'india-emergency' : 'llm-emergency'],
        region: item.region === 'INDIAN' || headlineSuggestsIndia(item.headline, item.summary)
          ? 'INDIAN' as const
          : 'INTERNATIONAL' as const,
      };
    }
  }

  return null;
}

export async function processNewsPipeline(raw: ClassifiedNewsItem[]): Promise<{
  items: ClassifiedNewsItem[];
  macro: EngineMacroShock | null;
  llmEnhanced: number;
}> {
  for (const item of raw) {
    item.isElite = isEliteSource(item.source) || isIndianEliteSource(item.source);
  }

  const items = await enrichNewsWithLLM(raw);
  // The same announcement is often ingested twice in one cycle (Yahoo-IN news
  // search + NSE corporate fetcher) with an identical `news-source-headline`
  // id. Dedup here so engine.newsItems / /api/news never emit duplicate keys.
  const dedup = new Map<string, ClassifiedNewsItem>();
  for (const it of items) {
    if (!it.id) { dedup.set(`anon-${dedup.size}`, it); continue; }
    if (!dedup.has(it.id)) dedup.set(it.id, it);
  }
  const uniqueItems = [...dedup.values()];
  const llmEnhanced = uniqueItems.filter(i => i.llmAnalyzed).length;
  const macro = detectMacroFromNews(uniqueItems);

  return { items: uniqueItems, macro, llmEnhanced };
}
