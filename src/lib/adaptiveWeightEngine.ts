/**
 * Adaptive Weight Engine - Institutional Grade
 * 
 * Dynamically adjusts scoring weights based on:
 * - Market regime
 * - Event type
 * - Historical performance
 * - Earnings season
 * - Volatility environment
 * 
 * Replaces static weights with adaptive, data-driven weights.
 */

import { MarketRegime, marketRegimeEngine } from './marketRegimeEngine';

export interface WeightContext {
  marketRegime: MarketRegime;
  eventType: string;
  isEarningsSeason: boolean;
  volatilityLevel: 'HIGH' | 'NORMAL' | 'LOW';
  historicalAccuracy?: {
    newsAccuracy: number;
    technicalAccuracy: number;
    macroAccuracy: number;
    historicalAccuracy: number;
  };
}

export interface AdaptiveWeights {
  news: number;
  technical: number;
  historical: number;
  volume: number;
  options: number;
  fundamental: number;
  macro: number;
}

/**
 * Adaptive Weight Engine
 */
export class AdaptiveWeightEngine {
  
  // Base weights (starting point)
  private baseWeights: AdaptiveWeights = {
    news: 0.22,
    technical: 0.20,
    historical: 0.18,
    volume: 0.15,
    options: 0.12,
    fundamental: 0.08,
    macro: 0.05
  };
  
  /**
   * Calculate adaptive weights based on context
   */
  calculateWeights(context: WeightContext): AdaptiveWeights {
    let weights = { ...this.baseWeights };
    
    // === 1. Market Regime Adjustments ===
    weights = this.applyRegimeAdjustments(weights, context.marketRegime);
    
    // === 2. Event Type Adjustments ===
    weights = this.applyEventTypeAdjustments(weights, context.eventType);
    
    // === 3. Earnings Season Adjustments ===
    if (context.isEarningsSeason) {
      weights = this.applyEarningsSeasonAdjustments(weights);
    }
    
    // === 4. Volatility Adjustments ===
    weights = this.applyVolatilityAdjustments(weights, context.volatilityLevel);
    
    // === 5. Historical Performance Adjustments ===
    if (context.historicalAccuracy) {
      weights = this.applyHistoricalPerformanceAdjustments(weights, context.historicalAccuracy);
    }
    
    // === 6. Normalize weights to sum to 1.0 ===
    weights = this.normalizeWeights(weights);
    
    return weights;
  }
  
  private applyRegimeAdjustments(
    weights: AdaptiveWeights,
    regime: MarketRegime
  ): AdaptiveWeights {
    const adjustments: Record<MarketRegime, Partial<AdaptiveWeights>> = {
      STRONG_BULL: {
        news: -0.05,
        technical: +0.10,
        macro: -0.03,
        historical: -0.02
      },
      BULL: {
        news: 0,
        technical: +0.05,
        macro: 0,
        historical: -0.02
      },
      SIDEWAYS: {
        news: +0.08,
        technical: -0.08,
        macro: 0,
        historical: +0.02
      },
      WEAK_BEAR: {
        news: +0.05,
        technical: -0.05,
        macro: +0.03,
        historical: 0
      },
      STRONG_BEAR: {
        news: 0,
        technical: -0.10,
        macro: +0.08,
        historical: +0.02
      },
      HIGH_VOLATILITY: {
        news: +0.10,
        technical: -0.10,
        macro: +0.05,
        volume: +0.03,
        historical: -0.05
      },
      LOW_VOLATILITY: {
        news: -0.05,
        technical: +0.08,
        macro: 0,
        historical: 0
      },
      EVENT_DRIVEN: {
        news: +0.15,
        technical: -0.05,
        macro: +0.03,
        historical: -0.08,
        volume: +0.03
      },
      RISK_ON: {
        news: -0.03,
        technical: +0.08,
        macro: -0.02,
        fundamental: +0.02
      },
      RISK_OFF: {
        news: +0.08,
        technical: -0.05,
        macro: +0.05,
        historical: +0.02
      }
    };
    
    const regimeAdj = adjustments[regime] || {};
    
    return {
      ...weights,
      ...regimeAdj
    };
  }
  
  private applyEventTypeAdjustments(
    weights: AdaptiveWeights,
    eventType: string
  ): AdaptiveWeights {
    // Event-specific adjustments
    const eventAdjustments: Record<string, Partial<AdaptiveWeights>> = {
      // News-dominant events
      'ORDER_WIN': { news: +0.10, fundamental: +0.05, historical: -0.05, technical: -0.05 },
      'FDA_APPROVAL': { news: +0.12, historical: -0.08, technical: -0.04 },
      'ACQUISITION': { news: +0.08, fundamental: +0.05, historical: -0.05, technical: -0.03 },
      'MERGER': { news: +0.08, fundamental: +0.05, historical: -0.05, technical: -0.03 },
      
      // Earnings events
      'EARNINGS_BEAT': { news: +0.08, fundamental: +0.05, technical: +0.02, historical: -0.05 },
      'EARNINGS_MISS': { news: +0.08, fundamental: +0.05, technical: +0.02, historical: -0.05 },
      'PROFIT_SURGE': { news: +0.05, fundamental: +0.08, technical: +0.02, historical: -0.05 },
      
      // Corporate actions
      'CORPORATE_ACTION': { news: +0.05, technical: +0.03, fundamental: +0.02 },
      'DEBT_REDUCTION': { news: +0.03, fundamental: +0.08, historical: -0.03 },
      'PROMOTER_BUYING': { news: +0.05, fundamental: +0.05, technical: +0.03 },
      'PROMOTER_SELLING': { news: +0.05, fundamental: +0.05, technical: +0.03 },
      
      // Turnaround events
      'TURNAROUND': { news: +0.05, fundamental: +0.05, historical: +0.03, technical: -0.03 },
      
      // Macro events
      'MACRO': { macro: +0.10, news: +0.05, technical: -0.05, historical: -0.05 }
    };
    
    const eventAdj = eventAdjustments[eventType] || {};
    
    return {
      ...weights,
      ...eventAdj
    };
  }
  
  private applyEarningsSeasonAdjustments(weights: AdaptiveWeights): AdaptiveWeights {
    // During earnings season, fundamental and news become more important
    return {
      ...weights,
      news: weights.news + 0.05,
      fundamental: weights.fundamental + 0.05,
      technical: weights.technical - 0.05,
      historical: weights.historical - 0.03,
      macro: weights.macro - 0.02
    };
  }
  
  private applyVolatilityAdjustments(
    weights: AdaptiveWeights,
    volatilityLevel: 'HIGH' | 'NORMAL' | 'LOW'
  ): AdaptiveWeights {
    const adjustments: Record<string, Partial<AdaptiveWeights>> = {
      HIGH: {
        news: +0.08,
        technical: -0.08,
        volume: +0.05,
        macro: +0.03,
        historical: -0.05
      },
      NORMAL: {
        // No adjustment for normal volatility
      },
      LOW: {
        news: -0.05,
        technical: +0.08,
        volume: -0.03,
        historical: +0.02
      }
    };
    
    const volAdj = adjustments[volatilityLevel] || {};
    
    return {
      ...weights,
      ...volAdj
    };
  }
  
  private applyHistoricalPerformanceAdjustments(
    weights: AdaptiveWeights,
    accuracy: {
      newsAccuracy: number;
      technicalAccuracy: number;
      macroAccuracy: number;
      historicalAccuracy: number;
    }
  ): AdaptiveWeights {
    // Adjust weights based on recent historical performance
    // If a factor has been more accurate recently, increase its weight
    
    const avgAccuracy = (accuracy.newsAccuracy + accuracy.technicalAccuracy + 
                         accuracy.macroAccuracy + accuracy.historicalAccuracy) / 4;
    
    const adjustments: Partial<AdaptiveWeights> = {};
    
    // News adjustment
    if (accuracy.newsAccuracy > avgAccuracy + 10) {
      adjustments.news = weights.news + 0.03;
    } else if (accuracy.newsAccuracy < avgAccuracy - 10) {
      adjustments.news = weights.news - 0.03;
    }
    
    // Technical adjustment
    if (accuracy.technicalAccuracy > avgAccuracy + 10) {
      adjustments.technical = weights.technical + 0.03;
    } else if (accuracy.technicalAccuracy < avgAccuracy - 10) {
      adjustments.technical = weights.technical - 0.03;
    }
    
    // Macro adjustment
    if (accuracy.macroAccuracy > avgAccuracy + 10) {
      adjustments.macro = weights.macro + 0.02;
    } else if (accuracy.macroAccuracy < avgAccuracy - 10) {
      adjustments.macro = weights.macro - 0.02;
    }
    
    // Historical adjustment
    if (accuracy.historicalAccuracy > avgAccuracy + 10) {
      adjustments.historical = weights.historical + 0.02;
    } else if (accuracy.historicalAccuracy < avgAccuracy - 10) {
      adjustments.historical = weights.historical - 0.02;
    }
    
    return {
      ...weights,
      ...adjustments
    };
  }
  
  private normalizeWeights(weights: AdaptiveWeights): AdaptiveWeights {
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    
    if (Math.abs(sum - 1.0) < 0.001) {
      return weights; // Already normalized
    }
    
    // Scale all weights proportionally
    const normalized: AdaptiveWeights = {
      news: weights.news / sum,
      technical: weights.technical / sum,
      historical: weights.historical / sum,
      volume: weights.volume / sum,
      options: weights.options / sum,
      fundamental: weights.fundamental / sum,
      macro: weights.macro / sum
    };
    
    return normalized;
  }
  
  /**
   * Get weight explanation for transparency
   */
  explainWeights(context: WeightContext, weights: AdaptiveWeights): string[] {
    const explanations: string[] = [];
    
    // Market regime explanation
    const regimeExplanations: Record<MarketRegime, string> = {
      STRONG_BULL: 'Bull market: Increased technical weight, reduced news weight',
      BULL: 'Bull market: Slightly increased technical weight',
      SIDEWAYS: 'Sideways market: Increased news weight, reduced technical weight',
      WEAK_BEAR: 'Weak bear market: Increased news and macro weights',
      STRONG_BEAR: 'Bear market: Reduced technical weight, increased macro weight',
      HIGH_VOLATILITY: 'High volatility: Increased news and volume weights, reduced technical weight',
      LOW_VOLATILITY: 'Low volatility: Increased technical weight',
      EVENT_DRIVEN: 'Event-driven: Significantly increased news weight',
      RISK_ON: 'Risk-on environment: Increased technical weight',
      RISK_OFF: 'Risk-off environment: Increased news and macro weights'
    };
    
    explanations.push(regimeExplanations[context.marketRegime] || 'Base weights applied');
    
    // Event type explanation
    if (['ORDER_WIN', 'FDA_APPROVAL', 'EARNINGS_BEAT', 'ACQUISITION'].includes(context.eventType)) {
      explanations.push(`Event type '${context.eventType}': Increased news/fundamental weight`);
    }
    
    // Earnings season explanation
    if (context.isEarningsSeason) {
      explanations.push('Earnings season: Increased news and fundamental weights');
    }
    
    // Volatility explanation
    if (context.volatilityLevel === 'HIGH') {
      explanations.push('High volatility: Increased news/volume, reduced technical');
    } else if (context.volatilityLevel === 'LOW') {
      explanations.push('Low volatility: Increased technical weight');
    }
    
    // Historical performance explanation
    if (context.historicalAccuracy) {
      const { newsAccuracy, technicalAccuracy } = context.historicalAccuracy;
      if (newsAccuracy > 70) {
        explanations.push(`News accuracy high (${newsAccuracy}%): Weight increased`);
      }
      if (technicalAccuracy > 70) {
        explanations.push(`Technical accuracy high (${technicalAccuracy}%): Weight increased`);
      }
    }
    
    // Final weights summary
    explanations.push(
      `Final weights: News ${Math.round(weights.news * 100)}%, ` +
      `Technical ${Math.round(weights.technical * 100)}%, ` +
      `Historical ${Math.round(weights.historical * 100)}%, ` +
      `Volume ${Math.round(weights.volume * 100)}%, ` +
      `Options ${Math.round(weights.options * 100)}%, ` +
      `Fundamental ${Math.round(weights.fundamental * 100)}%, ` +
      `Macro ${Math.round(weights.macro * 100)}%`
    );
    
    return explanations;
  }
}

export const adaptiveWeightEngine = new AdaptiveWeightEngine();