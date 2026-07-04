/**
 * Dynamic Market Regime Engine - Institutional Grade
 * 
 * Classifies market sessions into multiple regime types using
 * multi-factor analysis of technical, macro, and flow indicators.
 * 
 * Regimes: Strong Bull, Bull, Sideways, Weak Bear, Strong Bear,
 *           High Volatility, Low Volatility, Event Driven, Risk-On, Risk-Off
 */

export interface MarketRegimeInput {
  // Index Data
  niftyPrice: number;
  niftyChange: number;
  niftyTrend: 'UPTREND' | 'DOWNTREND' | 'SIDEWAYS';
  bankniftyPrice: number;
  bankniftyChange: number;
  bankniftyTrend: 'UPTREND' | 'DOWNTREND' | 'SIDEWAYS';
  
  // Volatility
  indiaVIX: number;
  vixChange: number;
  niftyATR: number;
  niftyAveATR: number;
  
  // Market Breadth
  advanceDeclineRatio: number; // Advances / Declines
  sectorBreadth: number; // % of sectors above 20DMA
  
  // Global Markets
  giftNiftyChange: number;
  usMarketsChange: number;
  asianMarketsChange: number;
  
  // Macro
  usdinr: number;
  usdinrChange: number;
  crudeOil: number;
  crudeOilChange: number;
  bondYield10Y: number;
  bondYieldChange: number;
  
  // Flows
  fiiFlow: number; // Net buy/sell in Cr
  diiFlow: number; // Net buy/sell in Cr
}

export interface MarketRegimeResult {
  primaryRegime: MarketRegime;
  secondaryRegimes: MarketRegime[];
  confidence: number; // 0-100
  regimeScore: number; // -100 to +100 (bearish to bullish)
  volatilityScore: number; // 0-100
  riskScore: number; // 0-100 (low to high risk)
  factors: {
    trendScore: number;
    volatilityScore: number;
    breadthScore: number;
    macroScore: number;
    flowScore: number;
    globalScore: number;
  };
  reasoning: string[];
}

export type MarketRegime = 
  | 'STRONG_BULL'
  | 'BULL'
  | 'SIDEWAYS'
  | 'WEAK_BEAR'
  | 'STRONG_BEAR'
  | 'HIGH_VOLATILITY'
  | 'LOW_VOLATILITY'
  | 'EVENT_DRIVEN'
  | 'RISK_ON'
  | 'RISK_OFF';

/**
 * Market Regime Classification Engine
 */
export class MarketRegimeEngine {
  
  /**
   * Calculate comprehensive market regime
   */
  calculateRegime(inputs: MarketRegimeInput): MarketRegimeResult {
    // === 1. TREND SCORE (-100 to +100) ===
    const trendScore = this.calculateTrendScore(inputs);
    
    // === 2. VOLATILITY SCORE (0-100) ===
    const volatilityScore = this.calculateVolatilityScore(inputs);
    
    // === 3. MARKET BREADTH SCORE (-100 to +100) ===
    const breadthScore = this.calculateBreadthScore(inputs);
    
    // === 4. MACRO SCORE (-100 to +100) ===
    const macroScore = this.calculateMacroScore(inputs);
    
    // === 5. FLOW SCORE (-100 to +100) ===
    const flowScore = this.calculateFlowScore(inputs);
    
    // === 6. GLOBAL SCORE (-100 to +100) ===
    const globalScore = this.calculateGlobalScore(inputs);
    
    // === COMBINE SCORES ===
    const weights = {
      trend: 0.30,
      volatility: 0.15,
      breadth: 0.20,
      macro: 0.15,
      flow: 0.10,
      global: 0.10
    };
    
    const regimeScore = Math.round(
      trendScore * weights.trend +
      breadthScore * weights.breadth +
      macroScore * weights.macro +
      flowScore * weights.flow +
      globalScore * weights.global
    );
    
    // Volatility is independent
    const finalVolatilityScore = volatilityScore;
    
    // Risk score combines volatility and negative regime
    const riskScore = Math.round(
      volatilityScore * 0.4 +
      Math.max(0, -regimeScore) * 0.6
    );
    
    // === DETERMINE PRIMARY REGIME ===
    const primaryRegime = this.determinePrimaryRegime(regimeScore, volatilityScore, inputs);
    
    // === DETERMINE SECONDARY REGIMES ===
    const secondaryRegimes = this.determineSecondaryRegimes(regimeScore, volatilityScore, inputs);
    
    // === CALCULATE CONFIDENCE ===
    const confidence = this.calculateConfidence(regimeScore, volatilityScore, inputs);
    
    // === GENERATE REASONING ===
    const reasoning = this.generateReasoning(primaryRegime, regimeScore, volatilityScore, inputs);
    
    return {
      primaryRegime,
      secondaryRegimes,
      confidence,
      regimeScore,
      volatilityScore: finalVolatilityScore,
      riskScore,
      factors: {
        trendScore,
        volatilityScore,
        breadthScore,
        macroScore,
        flowScore,
        globalScore
      },
      reasoning
    };
  }
  
  private calculateTrendScore(inputs: MarketRegimeInput): number {
    let score = 0;
    
    // Nifty trend
    if (inputs.niftyTrend === 'UPTREND') score += 30;
    else if (inputs.niftyTrend === 'DOWNTREND') score -= 30;
    
    // Banknifty trend
    if (inputs.bankniftyTrend === 'UPTREND') score += 25;
    else if (inputs.bankniftyTrend === 'DOWNTREND') score -= 25;
    
    // Nifty price change
    if (inputs.niftyChange > 2) score += 20;
    else if (inputs.niftyChange > 1) score += 10;
    else if (inputs.niftyChange < -2) score -= 20;
    else if (inputs.niftyChange < -1) score -= 10;
    
    // Banknifty price change
    if (inputs.bankniftyChange > 2) score += 15;
    else if (inputs.bankniftyChange > 1) score += 8;
    else if (inputs.bankniftyChange < -2) score -= 15;
    else if (inputs.bankniftyChange < -1) score -= 8;
    
    return Math.min(100, Math.max(-100, score));
  }
  
  private calculateVolatilityScore(inputs: MarketRegimeInput): number {
    let score = 50; // Neutral
    
    // India VIX level
    if (inputs.indiaVIX > 25) score += 30; // High volatility
    else if (inputs.indiaVIX > 20) score += 15;
    else if (inputs.indiaVIX < 12) score -= 25; // Low volatility
    else if (inputs.indiaVIX < 15) score -= 15;
    
    // VIX change
    if (inputs.vixChange > 10) score += 20;
    else if (inputs.vixChange > 5) score += 10;
    else if (inputs.vixChange < -10) score -= 15;
    else if (inputs.vixChange < -5) score -= 10;
    
    // ATR expansion
    const atrRatio = inputs.niftyATR / inputs.niftyAveATR;
    if (atrRatio > 2) score += 25;
    else if (atrRatio > 1.5) score += 15;
    else if (atrRatio < 0.5) score -= 20;
    else if (atrRatio < 0.75) score -= 10;
    
    return Math.min(100, Math.max(0, score));
  }
  
  private calculateBreadthScore(inputs: MarketRegimeInput): number {
    let score = 0;
    
    // Advance/Decline ratio
    if (inputs.advanceDeclineRatio > 3) score += 30;
    else if (inputs.advanceDeclineRatio > 2) score += 20;
    else if (inputs.advanceDeclineRatio > 1.5) score += 10;
    else if (inputs.advanceDeclineRatio < 0.33) score -= 30;
    else if (inputs.advanceDeclineRatio < 0.5) score -= 20;
    else if (inputs.advanceDeclineRatio < 0.67) score -= 10;
    
    // Sector breadth
    if (inputs.sectorBreadth > 80) score += 25;
    else if (inputs.sectorBreadth > 60) score += 15;
    else if (inputs.sectorBreadth > 40) score += 5;
    else if (inputs.sectorBreadth < 20) score -= 25;
    else if (inputs.sectorBreadth < 40) score -= 15;
    else if (inputs.sectorBreadth < 60) score -= 5;
    
    return Math.min(100, Math.max(-100, score));
  }
  
  private calculateMacroScore(inputs: MarketRegimeInput): number {
    let score = 0;
    
    // USDINR (rupee strength)
    if (inputs.usdinrChange < -0.5) score += 15; // Rupee strengthening
    else if (inputs.usdinrChange > 0.5) score -= 15; // Rupee weakening
    
    // Crude oil (impact on India)
    if (inputs.crudeOilChange < -3) score += 10; // Oil down good for India
    else if (inputs.crudeOilChange > 3) score -= 10; // Oil up bad for India
    
    // Bond yields
    if (inputs.bondYieldChange < -0.1) score += 10; // Yields down
    else if (inputs.bondYieldChange > 0.1) score -= 10; // Yields up
    
    return Math.min(100, Math.max(-100, score));
  }
  
  private calculateFlowScore(inputs: MarketRegimeInput): number {
    let score = 0;
    
    // FII Flow
    if (inputs.fiiFlow > 5000) score += 25; // Strong buying
    else if (inputs.fiiFlow > 2000) score += 15;
    else if (inputs.fiiFlow < -5000) score -= 25; // Strong selling
    else if (inputs.fiiFlow < -2000) score -= 15;
    
    // DII Flow
    if (inputs.diiFlow > 3000) score += 15;
    else if (inputs.diiFlow < -3000) score -= 15;
    
    // FII+DII combined
    const combinedFlow = inputs.fiiFlow + inputs.diiFlow;
    if (combinedFlow > 8000) score += 10;
    else if (combinedFlow < -8000) score -= 10;
    
    return Math.min(100, Math.max(-100, score));
  }
  
  private calculateGlobalScore(inputs: MarketRegimeInput): number {
    let score = 0;
    
    // Gift Nifty
    if (inputs.giftNiftyChange > 1) score += 20;
    else if (inputs.giftNiftyChange > 0.5) score += 10;
    else if (inputs.giftNiftyChange < -1) score -= 20;
    else if (inputs.giftNiftyChange < -0.5) score -= 10;
    
    // US Markets
    if (inputs.usMarketsChange > 1) score += 15;
    else if (inputs.usMarketsChange < -1) score -= 15;
    
    // Asian Markets
    if (inputs.asianMarketsChange > 1) score += 10;
    else if (inputs.asianMarketsChange < -1) score -= 10;
    
    return Math.min(100, Math.max(-100, score));
  }
  
  private determinePrimaryRegime(
    regimeScore: number,
    volatilityScore: number,
    inputs: MarketRegimeInput
  ): MarketRegime {
    // High volatility overrides
    if (volatilityScore >= 75) return 'HIGH_VOLATILITY';
    if (volatilityScore <= 25) return 'LOW_VOLATILITY';
    
    // Event driven (check for major news/events)
    if (Math.abs(inputs.niftyChange) > 3 || Math.abs(inputs.vixChange) > 15) {
      return 'EVENT_DRIVEN';
    }
    
    // Trend-based regimes
    if (regimeScore >= 60) return 'STRONG_BULL';
    if (regimeScore >= 25) return 'BULL';
    if (regimeScore >= -25) return 'SIDEWAYS';
    if (regimeScore >= -60) return 'WEAK_BEAR';
    if (regimeScore < -60) return 'STRONG_BEAR';
    
    return 'SIDEWAYS';
  }
  
  private determineSecondaryRegimes(
    regimeScore: number,
    volatilityScore: number,
    inputs: MarketRegimeInput
  ): MarketRegime[] {
    const secondary: MarketRegime[] = [];
    
    // Risk-On/Risk-Off
    if (regimeScore >= 30 && volatilityScore <= 50) {
      secondary.push('RISK_ON');
    } else if (regimeScore <= -30 || volatilityScore >= 60) {
      secondary.push('RISK_OFF');
    }
    
    return secondary;
  }
  
  private calculateConfidence(
    regimeScore: number,
    volatilityScore: number,
    inputs: MarketRegimeInput
  ): number {
    let confidence = 50;
    
    // Higher confidence when scores are extreme
    if (Math.abs(regimeScore) >= 60) confidence += 20;
    else if (Math.abs(regimeScore) >= 40) confidence += 10;
    
    // Lower confidence in high volatility
    if (volatilityScore >= 70) confidence -= 15;
    
    // Higher confidence when factors agree
    const trendBreadthAgree = Math.sign(this.calculateTrendScore(inputs)) === 
                               Math.sign(this.calculateBreadthScore(inputs));
    if (trendBreadthAgree) confidence += 10;
    
    // Higher confidence with strong flows
    if (Math.abs(inputs.fiiFlow) > 3000) confidence += 10;
    
    return Math.min(95, Math.max(20, confidence));
  }
  
  private generateReasoning(
    primaryRegime: MarketRegime,
    regimeScore: number,
    volatilityScore: number,
    inputs: MarketRegimeInput
  ): string[] {
    const reasoning: string[] = [];
    
    // Trend reasoning
    if (inputs.niftyTrend === 'UPTREND' && inputs.bankniftyTrend === 'UPTREND') {
      reasoning.push('Both Nifty and Banknifty in uptrend');
    } else if (inputs.niftyTrend === 'DOWNTREND' && inputs.bankniftyTrend === 'DOWNTREND') {
      reasoning.push('Both Nifty and Banknifty in downtrend');
    }
    
    // Volatility reasoning
    if (volatilityScore >= 70) {
      reasoning.push(`High volatility (VIX: ${inputs.indiaVIX.toFixed(1)}, +${inputs.vixChange.toFixed(1)}%)`);
    } else if (volatilityScore <= 30) {
      reasoning.push(`Low volatility environment (VIX: ${inputs.indiaVIX.toFixed(1)})`);
    }
    
    // Flow reasoning
    if (inputs.fiiFlow > 3000) {
      reasoning.push(`Strong FII buying (₹${(inputs.fiiFlow/100).toFixed(1)} Cr)`);
    } else if (inputs.fiiFlow < -3000) {
      reasoning.push(`Strong FII selling (₹${(Math.abs(inputs.fiiFlow)/100).toFixed(1)} Cr)`);
    }
    
    // Breadth reasoning
    if (inputs.advanceDeclineRatio > 2) {
      reasoning.push(`Positive market breadth (A/D: ${inputs.advanceDeclineRatio.toFixed(1)})`);
    } else if (inputs.advanceDeclineRatio < 0.5) {
      reasoning.push(`Negative market breadth (A/D: ${inputs.advanceDeclineRatio.toFixed(1)})`);
    }
    
    return reasoning;
  }
  
  /**
   * Get regime adjustment factors for downstream modules
   */
  getRegimeAdjustments(regime: MarketRegime): {
    newsWeightAdjustment: number;
    technicalWeightAdjustment: number;
    macroWeightAdjustment: number;
    probabilityThreshold: number;
    confidenceMultiplier: number;
  } {
    const adjustments: Record<MarketRegime, any> = {
      STRONG_BULL: {
        newsWeightAdjustment: -0.1,
        technicalWeightAdjustment: +0.15,
        macroWeightAdjustment: 0,
        probabilityThreshold: 60,
        confidenceMultiplier: 1.1
      },
      BULL: {
        newsWeightAdjustment: 0,
        technicalWeightAdjustment: +0.05,
        macroWeightAdjustment: 0,
        probabilityThreshold: 65,
        confidenceMultiplier: 1.0
      },
      SIDEWAYS: {
        newsWeightAdjustment: +0.1,
        technicalWeightAdjustment: -0.1,
        macroWeightAdjustment: 0,
        probabilityThreshold: 70,
        confidenceMultiplier: 0.9
      },
      WEAK_BEAR: {
        newsWeightAdjustment: +0.05,
        technicalWeightAdjustment: -0.05,
        macroWeightAdjustment: +0.05,
        probabilityThreshold: 70,
        confidenceMultiplier: 0.9
      },
      STRONG_BEAR: {
        newsWeightAdjustment: 0,
        technicalWeightAdjustment: -0.15,
        macroWeightAdjustment: +0.1,
        probabilityThreshold: 75,
        confidenceMultiplier: 0.8
      },
      HIGH_VOLATILITY: {
        newsWeightAdjustment: +0.15,
        technicalWeightAdjustment: -0.2,
        macroWeightAdjustment: +0.1,
        probabilityThreshold: 75,
        confidenceMultiplier: 0.85
      },
      LOW_VOLATILITY: {
        newsWeightAdjustment: -0.05,
        technicalWeightAdjustment: +0.1,
        macroWeightAdjustment: 0,
        probabilityThreshold: 60,
        confidenceMultiplier: 1.05
      },
      EVENT_DRIVEN: {
        newsWeightAdjustment: +0.2,
        technicalWeightAdjustment: -0.1,
        macroWeightAdjustment: +0.05,
        probabilityThreshold: 70,
        confidenceMultiplier: 0.9
      },
      RISK_ON: {
        newsWeightAdjustment: -0.05,
        technicalWeightAdjustment: +0.1,
        macroWeightAdjustment: 0,
        probabilityThreshold: 60,
        confidenceMultiplier: 1.1
      },
      RISK_OFF: {
        newsWeightAdjustment: +0.1,
        technicalWeightAdjustment: -0.1,
        macroWeightAdjustment: +0.1,
        probabilityThreshold: 75,
        confidenceMultiplier: 0.85
      }
    };
    
    return adjustments[regime] || adjustments.SIDEWAYS;
  }
}

export const marketRegimeEngine = new MarketRegimeEngine();