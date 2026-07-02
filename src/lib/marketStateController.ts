export type MarketState = 'NORMAL' | 'HIGH_VOLATILITY' | 'MACRO_EVENT' | 'RISK_ON' | 'RISK_OFF' | 'NEWS_DOMINATED';

export interface MarketStateInputs {
  activeKeywords: string[]; // e.g., ['RBI', 'Budget', 'Fed', 'Election']
  indiaVix: number;
  niftyTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  advanceDeclineRatio: number; // e.g. 1.5 (bullish) or 0.5 (bearish)
}

export function determineMarketState(inputs: MarketStateInputs): MarketState {
  // 1. MACRO_EVENT Check (Overrides normal technicals, but doesn't halt trading)
  const macroKeywords = ['RBI', 'SEBI', 'BUDGET', 'ELECTION', 'WAR', 'FED', 'BOJ', 'ECB'];
  const hasMacro = inputs.activeKeywords.some(kw => macroKeywords.includes(kw.toUpperCase()));
  
  if (hasMacro) {
    // If VIX is extremely high during a macro event, it's RISK_OFF
    if (inputs.indiaVix > 25) return 'RISK_OFF';
    return 'MACRO_EVENT'; // Market is waiting or reacting to policy
  }

  // 2. VOLATILITY Check
  if (inputs.indiaVix > 22) {
    if (inputs.niftyTrend === 'BEARISH' && inputs.advanceDeclineRatio < 0.5) {
      return 'RISK_OFF';
    }
    return 'HIGH_VOLATILITY';
  }

  // 3. RISK_ON Check
  if (inputs.niftyTrend === 'BULLISH' && inputs.indiaVix < 15 && inputs.advanceDeclineRatio > 1.2) {
    return 'RISK_ON';
  }

  // 4. NEWS_DOMINATED Check (e.g. Earnings season with flat index)
  if (inputs.niftyTrend === 'NEUTRAL' && inputs.indiaVix < 18) {
    return 'NEWS_DOMINATED';
  }

  return 'NORMAL';
}

/**
 * Returns a weight multiplier for how much we should trust Technicals vs News
 * based on the current market state.
 */
export function getEnsembleWeights(state: MarketState): { technical: number; news: number; historical: number } {
  switch (state) {
    case 'RISK_ON':
      return { technical: 0.4, news: 0.3, historical: 0.3 };
    case 'RISK_OFF':
      return { technical: 0.2, news: 0.5, historical: 0.3 }; // News dominates crashes
    case 'MACRO_EVENT':
      return { technical: 0.1, news: 0.7, historical: 0.2 }; // Ignore tech, listen to the policy
    case 'HIGH_VOLATILITY':
      return { technical: 0.3, news: 0.4, historical: 0.3 };
    case 'NEWS_DOMINATED':
      return { technical: 0.2, news: 0.6, historical: 0.2 };
    case 'NORMAL':
    default:
      return { technical: 0.33, news: 0.34, historical: 0.33 };
  }
}
