export type TradingStyle = 'SCALPING' | 'DAY_TRADING' | 'SWING' | 'POSITION';
export type RecommendationAction = 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';

export interface StrategyRecommendation {
  ticker: string;
  name: string;
  style: TradingStyle;
  action: RecommendationAction;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  confidence: number;
  riskLevel: RiskLevel;
  holdPeriod: string;
  reasoning: string[];
  catalyst: string;
  price: number;
  changePercent: number;
  vetoed?: boolean;
  vetoReason?: string;
  newsSentiment?: number;
}

export interface StrategySummary {
  style: TradingStyle;
  label: string;
  description: string;
  timeHorizon: string;
  recommendations: StrategyRecommendation[];
}

export function classifyTradingStyle(
  atr: number,
  price: number,
  adx: number,
  rsi: number,
  bollingerWidth: number,
  predictionConfidence: number,
  timeframeMonths: number,
): TradingStyle {
  const atrPct = price > 0 ? (atr / price) * 100 : 0;
  if (timeframeMonths <= 0.5 && atrPct > 0.5 && bollingerWidth > 5) return 'SCALPING';
  if (timeframeMonths <= 1 && atrPct > 0.3 && adx > 20) return 'DAY_TRADING';
  if (timeframeMonths <= 3 && adx > 25) return 'SWING';
  return 'POSITION';
}

export function generateAction(
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL',
  confidence: number,
  rsi: number,
  isNearSupport: boolean,
  isNearResistance: boolean,
  newsSentiment?: number,
): { action: RecommendationAction; vetoed: boolean; vetoReason: string } {
  let action: RecommendationAction = 'HOLD';

  if (direction === 'BULLISH') {
    if (confidence >= 75 && !isNearResistance) action = 'STRONG_BUY';
    else if (confidence >= 55 && !isNearResistance) action = 'BUY';
    else if (rsi > 70) action = 'HOLD';
    else action = 'HOLD';
  } else if (direction === 'BEARISH') {
    if (confidence >= 75 && !isNearSupport) action = 'STRONG_SELL';
    else if (confidence >= 55 && !isNearSupport) action = 'SELL';
    else if (rsi < 30) action = 'HOLD';
    else action = 'HOLD';
  }

  // News Veto: suppress BUY when news is negative, suppress SELL when news is positive
  let vetoed = false;
  let vetoReason = '';
  if (newsSentiment !== undefined) {
    if (newsSentiment < -50 && (action === 'STRONG_BUY' || action === 'BUY')) {
      action = 'HOLD';
      vetoed = true;
      vetoReason = 'Technical indicators are bullish, but negative news sentiment has triggered a safety veto.';
    } else if (newsSentiment > 50 && (action === 'STRONG_SELL' || action === 'SELL')) {
      action = 'HOLD';
      vetoed = true;
      vetoReason = 'Technical indicators are bearish, but positive news sentiment has triggered a safety veto.';
    }
  }

  return { action, vetoed, vetoReason };
}

export function generateHoldPeriod(style: TradingStyle): string {
  switch (style) {
    case 'SCALPING': return 'Seconds to minutes';
    case 'DAY_TRADING': return 'Hours (close before bell)';
    case 'SWING': return 'Days to weeks';
    case 'POSITION': return 'Months to years';
  }
}

export function generateCatalyst(ta: {
  rsi: number; adx: number; macdHistogram: number; supertrendDirection: string;
  bollingerWidth: number; atrPct: number; isNearSupport: boolean; isNearResistance: boolean;
  patternSignal: string | null;
}, ticker?: string): string {
  const parts: string[] = [];

  // CATALYST OVERRIDE: Check Live Corporate Feed
  if (typeof window === 'undefined' && ticker) {
    try {
      const { getNewsForTicker } = require('./newsStore');
      const recentNews = getNewsForTicker(ticker, 72);
      if (recentNews.length > 0) {
        const topNews = recentNews.sort((a: any, b: any) => b.impactScore - a.impactScore)[0];
        if (topNews && topNews.impactScore >= 70) {
          parts.push(`LIVE EVENT: ${topNews.llmEventType} (${topNews.llmTradingSignal})`);
        }
      }
    } catch { /* skip */ }
  }

  if (ta.supertrendDirection === 'up' && ta.adx > 25) parts.push('Trend-following setup');
  if (ta.isNearSupport) parts.push('Bounce from key support');
  if (ta.isNearResistance) parts.push('Test of key resistance');
  if (ta.rsi > 70) parts.push('Overbought — potential reversal');
  if (ta.rsi < 30) parts.push('Oversold — potential bounce');
  if (ta.bollingerWidth > 8) parts.push('High volatility breakout');
  if (ta.atrPct > 2) parts.push('Wide ATR — large moves expected');
  if (ta.patternSignal) parts.push(ta.patternSignal);
  return parts.length > 0 ? parts.join(' · ') : 'No clear catalyst';
}
