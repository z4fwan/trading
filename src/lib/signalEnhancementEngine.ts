/**
 * Signal Enhancement Engine - Institutional Grade
 * 
 * Enhances signals with:
 * - Current price at signal time
 * - Pre-calculated target prices
 * - Hold signals for momentum continuation
 * - Profit-taking recommendations
 */

import { riskEngine, RiskInputs, TradeRecommendation } from './riskEngine';
import { advancedTechnicalEngine, OHLCV, TechnicalIndicators } from './advancedTechnicalEngine';
import { MarketRegime, marketRegimeEngine } from './marketRegimeEngine';

export interface EnhancedSignal {
  // Basic Signal Info
  ticker: string;
  signal: 'BUY' | 'SELL' | 'HOLD' | 'NO_TRADE';
  eventType: string;
  headline: string;
  source: string;
  timestamp: number;
  
  // Price Information
  currentPrice: number;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  
  // Expected Returns
  expectedReturn: number; // %
  expectedValue: number; // EV after costs
  riskRewardRatio: number;
  
  // Position Sizing
  positionSize: number; // % of portfolio
  maxLoss: number; // Max loss if stop hit
  maxGain: number; // Max gain if target hit
  
  // Confidence & Quality
  probability: number;
  confidence: 'High' | 'Medium' | 'Low';
  signalQuality: 'A+' | 'A' | 'A-' | 'B+' | 'B' | 'B-' | 'C';
  
  // Holding Recommendation
  holdingPeriod: 'INTRADAY' | 'SWING_2_5_DAYS' | 'SWING_1_2_WEEKS' | 'LONG_TERM';
  profitTakingLevels: number[];
  trailingStopSuggestion: number;
  
  // Technical Context
  technicalScore: number;
  momentumStatus: 'STRONG_POSITIVE' | 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'STRONG_NEGATIVE';
  shouldHold: boolean;
  holdReasoning: string;
  
  // Market Context
  marketRegime: MarketRegime;
  sectorStrength: number;
  
  // Reasoning
  drivers: string[];
  risks: string[];
  reasoning: string[];
}

export interface SignalEnhancementInputs {
  ticker: string;
  eventType: string;
  headline: string;
  source: string;
  timestamp: number;
  sentiment: 'BULLISH' | 'BEARISH';
  probability: number;
  confidence: 'High' | 'Medium' | 'Low';
  
  // Price Data
  currentPrice: number;
  priceHistory: OHLCV[];
  sectorIndexHistory?: OHLCV[];
  benchmarkIndexHistory?: OHLCV[];
  
  // Market Data
  volatility: number;
  liquidity: number; // Avg daily volume
  marketCap: number;
  marketRegime: MarketRegime;
  
  // Additional Info
  drivers?: string[];
  risks?: string[];
}

/**
 * Signal Enhancement Engine
 */
export class SignalEnhancementEngine {
  
  /**
   * Enhance a basic signal with full institutional context
   */
  enhanceSignal(inputs: SignalEnhancementInputs): EnhancedSignal {
    const {
      ticker, eventType, headline, source, timestamp,
      sentiment, probability, confidence,
      currentPrice, priceHistory, sectorIndexHistory, benchmarkIndexHistory,
      volatility, liquidity, marketCap, marketRegime,
      drivers = [], risks = []
    } = inputs;
    
    // === 1. Calculate Technical Indicators ===
    const technicalIndicators = advancedTechnicalEngine.calculateIndicators(
      priceHistory,
      sectorIndexHistory,
      benchmarkIndexHistory
    );
    
    // === 2. Calculate Risk Metrics & Target ===
    const riskInputs: RiskInputs = {
      ticker,
      currentPrice,
      probability,
      sentiment,
      volatility,
      liquidity,
      marketCap
    };
    
    const tradeRec = riskEngine.calculateRecommendation(riskInputs);
    
    // === 3. Determine Signal ===
    let signal: 'BUY' | 'SELL' | 'HOLD' | 'NO_TRADE' = tradeRec.signal;
    
    // Check for HOLD signal (strong momentum continuation)
    const shouldHold = this.checkHoldSignal(technicalIndicators, sentiment, probability);
    if (shouldHold && signal === 'NO_TRADE') {
      signal = 'HOLD';
    }
    
    // === 4. Calculate Expected Returns ===
    const expectedReturn = sentiment === 'BULLISH'
      ? ((tradeRec.target - currentPrice) / currentPrice) * 100
      : ((currentPrice - tradeRec.stopLoss) / currentPrice) * 100;
    
    // === 5. Determine Holding Period ===
    const holdingPeriod = this.determineHoldingPeriod(eventType, marketRegime, technicalIndicators);
    
    // === 6. Calculate Profit Taking Levels ===
    const profitTakingLevels = this.calculateProfitTakingLevels(currentPrice, tradeRec.target, technicalIndicators);
    
    // === 7. Calculate Trailing Stop ===
    const trailingStopSuggestion = this.calculateTrailingStop(currentPrice, volatility, technicalIndicators);
    
    // === 8. Determine Momentum Status ===
    const momentumStatus = this.determineMomentumStatus(technicalIndicators);
    
    // === 9. Calculate Signal Quality ===
    const signalQuality = this.calculateSignalQuality(probability, confidence, tradeRec.expectedValue, technicalIndicators.overallTechnicalScore);
    
    // === 10. Generate Hold Reasoning ===
    const holdReasoning = this.generateHoldReasoning(shouldHold, technicalIndicators, sentiment);
    
    // === 11. Enhance Reasoning ===
    const enhancedReasoning = this.enhanceReasoning({
      signal,
      probability,
      expectedReturn,
      technicalScore: technicalIndicators.overallTechnicalScore,
      momentumStatus,
      marketRegime,
      drivers,
      risks
    });
    
    return {
      ticker,
      signal,
      eventType,
      headline,
      source,
      timestamp,
      currentPrice,
      entryPrice: currentPrice,
      targetPrice: tradeRec.target,
      stopLoss: tradeRec.stopLoss,
      expectedReturn: Math.round(expectedReturn * 100) / 100,
      expectedValue: tradeRec.expectedValue,
      riskRewardRatio: tradeRec.riskRewardRatio,
      positionSize: tradeRec.positionSize,
      maxLoss: tradeRec.maxLoss,
      maxGain: tradeRec.maxGain,
      probability,
      confidence,
      signalQuality,
      holdingPeriod,
      profitTakingLevels,
      trailingStopSuggestion,
      technicalScore: technicalIndicators.overallTechnicalScore,
      momentumStatus,
      shouldHold,
      holdReasoning,
      marketRegime,
      sectorStrength: technicalIndicators.relativeStrength,
      drivers,
      risks,
      reasoning: enhancedReasoning
    };
  }
  
  private checkHoldSignal(tech: TechnicalIndicators, sentiment: 'BULLISH' | 'BEARISH', probability: number): boolean {
    // HOLD signal when:
    // 1. Strong momentum in direction of existing position
    // 2. Technical score is high
    // 3. Probability is moderate (not high enough for new entry but good for holding)
    
    const strongMomentum = tech.momentumScore >= 70;
    const strongTrend = tech.trendScore >= 65;
    const moderateProbability = probability >= 55 && probability < 70;
    
    if (sentiment === 'BULLISH') {
      return strongMomentum && strongTrend && moderateProbability;
    } else {
      return strongMomentum && strongTrend && moderateProbability;
    }
  }
  
  private determineHoldingPeriod(
    eventType: string,
    marketRegime: MarketRegime,
    tech: TechnicalIndicators
  ): 'INTRADAY' | 'SWING_2_5_DAYS' | 'SWING_1_2_WEEKS' | 'LONG_TERM' {
    // Base holding period on event type
    const eventHoldingPeriods: Record<string, 'INTRADAY' | 'SWING_2_5_DAYS' | 'SWING_1_2_WEEKS' | 'LONG_TERM'> = {
      'ORDER_WIN': 'INTRADAY',
      'FDA_APPROVAL': 'INTRADAY',
      'EARNINGS_BEAT': 'SWING_2_5_DAYS',
      'PROFIT_SURGE': 'SWING_2_5_DAYS',
      'CORPORATE_ACTION': 'SWING_2_5_DAYS',
      'ACQUISITION': 'SWING_1_2_WEEKS',
      'MERGER': 'SWING_1_2_WEEKS',
      'TURNAROUND': 'SWING_1_2_WEEKS',
      'DEBT_REDUCTION': 'LONG_TERM',
      'PROMOTER_BUYING': 'LONG_TERM'
    };
    
    let holdingPeriod = eventHoldingPeriods[eventType] || 'SWING_2_5_DAYS';
    
    // Adjust for market regime
    if (marketRegime === 'HIGH_VOLATILITY' && holdingPeriod === 'LONG_TERM') {
      holdingPeriod = 'SWING_1_2_WEEKS'; // Reduce holding in high vol
    }
    
    // Adjust for technical signals
    if (tech.supertrend.direction === 'DOWN' && holdingPeriod === 'SWING_2_5_DAYS') {
      holdingPeriod = 'INTRADAY'; // Shorter in downtrend
    }
    
    return holdingPeriod;
  }
  
  private calculateProfitTakingLevels(
    currentPrice: number,
    target: number,
    tech: TechnicalIndicators
  ): number[] {
    const levels: number[] = [];
    const resistanceLevels = tech.supportResistance.resistance;
    
    // Add resistance levels as profit taking points
    for (const res of resistanceLevels) {
      if (res > currentPrice && res <= target * 1.05) {
        levels.push(Math.round(res * 100) / 100);
      }
    }
    
    // Add target as final level
    if (!levels.includes(target)) {
      levels.push(Math.round(target * 100) / 100);
    }
    
    // Add partial profit levels (50% at first resistance, 30% at second, 20% at target)
    return levels.sort((a, b) => a - b);
  }
  
  private calculateTrailingStop(
    currentPrice: number,
    volatility: number,
    tech: TechnicalIndicators
  ): number {
    // Trailing stop based on ATR
    const atr = tech.atr;
    const atrMultiplier = 2.0;
    
    const trailingStopPercent = (atr * atrMultiplier / currentPrice) * 100;
    return Math.round(trailingStopPercent * 100) / 100;
  }
  
  private determineMomentumStatus(tech: TechnicalIndicators): 'STRONG_POSITIVE' | 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'STRONG_NEGATIVE' {
    const score = tech.momentumScore;
    
    if (score >= 80) return 'STRONG_POSITIVE';
    if (score >= 60) return 'POSITIVE';
    if (score >= 40) return 'NEUTRAL';
    if (score >= 20) return 'NEGATIVE';
    return 'STRONG_NEGATIVE';
  }
  
  private calculateSignalQuality(
    probability: number,
    confidence: 'High' | 'Medium' | 'Low',
    expectedValue: number,
    technicalScore: number
  ): 'A+' | 'A' | 'A-' | 'B+' | 'B' | 'B-' | 'C' {
    // Combined quality score
    const qualityScore = (
      probability * 0.3 +
      (confidence === 'High' ? 100 : confidence === 'Medium' ? 60 : 30) * 0.3 +
      Math.max(0, expectedValue * 10) * 0.2 +
      technicalScore * 0.2
    );
    
    if (qualityScore >= 90) return 'A+';
    if (qualityScore >= 80) return 'A';
    if (qualityScore >= 70) return 'A-';
    if (qualityScore >= 60) return 'B+';
    if (qualityScore >= 50) return 'B';
    if (qualityScore >= 40) return 'B-';
    return 'C';
  }
  
  private generateHoldReasoning(
    shouldHold: boolean,
    tech: TechnicalIndicators,
    sentiment: 'BULLISH' | 'BEARISH'
  ): string {
    if (!shouldHold) {
      return 'No strong momentum continuation signal detected';
    }
    
    const reasons: string[] = [];
    
    if (tech.momentumScore >= 70) {
      reasons.push('Strong momentum score');
    }
    
    if (tech.trendScore >= 65) {
      reasons.push('Strong trend alignment');
    }
    
    if (tech.supertrend.direction === 'UP' && sentiment === 'BULLISH') {
      reasons.push('Supertrend confirming uptrend');
    }
    
    if (tech.macd.histogram > 0) {
      reasons.push('MACD positive momentum');
    }
    
    return reasons.join('. ') || 'Momentum continuation detected';
  }
  
  private enhanceReasoning(params: {
    signal: string;
    probability: number;
    expectedReturn: number;
    technicalScore: number;
    momentumStatus: string;
    marketRegime: MarketRegime;
    drivers: string[];
    risks: string[];
  }): string[] {
    const reasoning: string[] = [];
    
    // Signal summary
    reasoning.push(`${params.signal} signal with ${params.probability}% probability`);
    
    // Expected return
    reasoning.push(`Expected return: ${params.expectedReturn.toFixed(1)}%`);
    
    // Technical context
    if (params.technicalScore >= 70) {
      reasoning.push('Strong technical setup');
    } else if (params.technicalScore >= 50) {
      reasoning.push('Moderate technical support');
    }
    
    // Momentum
    if (params.momentumStatus === 'STRONG_POSITIVE') {
      reasoning.push('Strong positive momentum');
    } else if (params.momentumStatus === 'STRONG_NEGATIVE') {
      reasoning.push('Strong negative momentum');
    }
    
    // Market regime
    reasoning.push(`Market regime: ${params.marketRegime.replace('_', ' ')}`);
    
    // Drivers
    if (params.drivers.length > 0) {
      reasoning.push(`Key drivers: ${params.drivers.slice(0, 2).join(', ')}`);
    }
    
    // Risks
    if (params.risks.length > 0) {
      reasoning.push(`Key risks: ${params.risks.slice(0, 2).join(', ')}`);
    }
    
    return reasoning;
  }
  
  /**
   * Format signal for Telegram notification
   */
  formatForTelegram(signal: EnhancedSignal): string {
    const signalIcon = signal.signal === 'BUY' ? '🟢' : signal.signal === 'SELL' ? '🔴' : signal.signal === 'HOLD' ? '🟡' : '⚪';
    const qualityIcon = signal.signalQuality.startsWith('A') ? '⭐' : signal.signalQuality.startsWith('B') ? '👍' : '📊';
    
    let msg = `${signalIcon} ${signal.signal} | ${signal.ticker} | ${qualityIcon} ${signal.signalQuality}\n\n`;
    
    // Price info
    msg += `💰 Current: ₹${signal.currentPrice.toFixed(2)}\n`;
    msg += `🎯 Target: ₹${signal.targetPrice.toFixed(2)} (+${signal.expectedReturn.toFixed(1)}%)\n`;
    msg += `🛑 Stop Loss: ₹${signal.stopLoss.toFixed(2)}\n`;
    msg += `📊 Risk/Reward: ${signal.riskRewardRatio.toFixed(1)}:1\n\n`;
    
    // Expected value
    msg += `💎 Expected Value: ${signal.expectedValue.toFixed(2)}%\n`;
    msg += `📈 Probability: ${signal.probability}%\n`;
    msg += `🎯 Position Size: ${signal.positionSize.toFixed(1)}%\n\n`;
    
    // Holding info
    msg += `⏱️ Holding: ${signal.holdingPeriod.replace('_', ' ')}\n`;
    
    if (signal.profitTakingLevels.length > 0) {
      msg += `📊 Profit Targets: ${signal.profitTakingLevels.map(l => `₹${l.toFixed(2)}`).join(', ')}\n`;
    }
    
    msg += `🔄 Trailing Stop: ${signal.trailingStopSuggestion.toFixed(1)}%\n\n`;
    
    // Hold signal
    if (signal.shouldHold) {
      msg += `🟡 HOLD SIGNAL: ${signal.holdReasoning}\n\n`;
    }
    
    // Momentum
    msg += `📈 Momentum: ${signal.momentumStatus.replace('_', ' ')}\n`;
    msg += `🏆 Technical Score: ${signal.technicalScore}/100\n\n`;
    
    // Event info
    msg += `📰 Event: ${signal.eventType}\n`;
    msg += `📝 ${signal.headline}\n\n`;
    
    // Reasoning
    if (signal.reasoning.length > 0) {
      msg += `🔍 Analysis:\n${signal.reasoning.map(r => `  • ${r}`).join('\n')}\n\n`;
    }
    
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `_Quantum Alpha AI | Institutional Grade_`;
    
    return msg;
  }
}

export const signalEnhancementEngine = new SignalEnhancementEngine();