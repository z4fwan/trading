/**
 * Risk Engine - Institutional Grade
 * 
 * Calculates expected value (EV), risk metrics, and position sizing.
 * Only recommends trades with positive expected value after costs.
 * 
 * EV = (Win Probability × Average Win) - (Loss Probability × Average Loss) - Trading Costs
 */

export interface RiskInputs {
  ticker: string;
  currentPrice: number;
  probability: number; // Win probability (0-100)
  sentiment: 'BULLISH' | 'BEARISH';
  volatility: number; // ATR or historical volatility
  liquidity: number; // Average daily volume
  marketCap: number; // Market capitalization
  sectorRisk?: number; // Sector-specific risk factor
}

export interface TradeRecommendation {
  signal: 'BUY' | 'SELL' | 'NO_TRADE';
  entry: number;
  stopLoss: number;
  target: number;
  riskRewardRatio: number;
  expectedValue: number; // Expected value in %
  positionSize: number; // Recommended position size (% of portfolio)
  maxLoss: number; // Maximum loss if stop loss hit
  maxGain: number; // Maximum gain if target hit
  confidence: number; // 0-100
  reasoning: string[];
}

export interface TradingCosts {
  brokerage: number; // Brokerage per trade (as %)
  stt: number; // Securities Transaction Tax
  stampDuty: number; // Stamp duty
  sebiCharges: number; // SEBI turnover fees
  gst: number; // GST on brokerage
  slippage: number; // Estimated slippage
}

/**
 * Default trading costs for Indian markets
 */
const DEFAULT_TRADING_COSTS: TradingCosts = {
  brokerage: 0.05, // 0.05% per trade
  stt: 0.025, // 0.025% on sell side (equity delivery)
  stampDuty: 0.015, // 0.015% on buy side
  sebiCharges: 0.0002, // 0.0002% turnover
  gst: 0.018, // 18% GST on brokerage
  slippage: 0.10 // 0.10% estimated slippage
};

/**
 * Calculate total trading costs
 */
function calculateTotalCosts(costs: TradingCosts = DEFAULT_TRADING_COSTS): number {
  const brokerageWithGst = costs.brokerage * (1 + costs.gst);
  return brokerageWithGst + costs.stt + costs.stampDuty + costs.sebiCharges + costs.slippage;
}

/**
 * Risk Engine Class
 */
export class RiskEngine {
  
  /**
   * Calculate trade recommendation with expected value
   */
  calculateRecommendation(inputs: RiskInputs): TradeRecommendation {
    const { ticker, currentPrice, probability, sentiment, volatility, liquidity, marketCap } = inputs;
    
    // Calculate trading costs
    const totalCosts = calculateTotalCosts();
    
    // Calculate expected move based on volatility
    const expectedMove = this.calculateExpectedMove(volatility, probability, sentiment);
    
    // Calculate stop loss and target
    const { stopLoss, target } = this.calculateLevels(currentPrice, volatility, sentiment, expectedMove);
    
    // Calculate potential win and loss
    const potentialWin = sentiment === 'BULLISH' 
      ? ((target - currentPrice) / currentPrice) * 100
      : ((currentPrice - stopLoss) / currentPrice) * 100;
    
    const potentialLoss = sentiment === 'BULLISH'
      ? ((currentPrice - stopLoss) / currentPrice) * 100
      : ((stopLoss - currentPrice) / currentPrice) * 100;
    
    // Calculate Expected Value (EV)
    const winProbability = probability / 100;
    const lossProbability = 1 - winProbability;
    
    const ev = (winProbability * potentialWin) - (lossProbability * potentialLoss) - (totalCosts * 2);
    
    // Calculate risk-reward ratio
    const riskRewardRatio = potentialWin / potentialLoss;
    
    // Determine signal based on EV
    let signal: 'BUY' | 'SELL' | 'NO_TRADE' = 'NO_TRADE';
    const reasoning: string[] = [];
    
    if (ev > 0.5) { // Only trade if EV > 0.5% (after costs)
      signal = sentiment === 'BULLISH' ? 'BUY' : 'SELL';
      reasoning.push(`Positive EV: ${ev.toFixed(2)}%`);
      reasoning.push(`Risk-Reward: ${riskRewardRatio.toFixed(2)}:1`);
    } else if (ev > 0) {
      signal = 'NO_TRADE';
      reasoning.push(`Low EV: ${ev.toFixed(2)}% (below threshold)`);
    } else {
      signal = 'NO_TRADE';
      reasoning.push(`Negative EV: ${ev.toFixed(2)}%`);
    }
    
    // Additional checks
    if (liquidity < 100000) {
      reasoning.push('Low liquidity - position size reduced');
    }
    
    if (volatility > 50) {
      reasoning.push('High volatility - wider stops required');
    }
    
    // Calculate position size based on risk
    const positionSize = this.calculatePositionSize(probability, volatility, liquidity, marketCap, ev);
    
    // Calculate max loss and gain
    const maxLoss = (potentialLoss / 100) * (positionSize / 100) * 100; // % of portfolio
    const maxGain = (potentialWin / 100) * (positionSize / 100) * 100; // % of portfolio
    
    // Calculate confidence
    const confidence = this.calculateConfidence(probability, ev, riskRewardRatio, liquidity, volatility);
    
    return {
      signal,
      entry: currentPrice,
      stopLoss: Math.round(stopLoss * 100) / 100,
      target: Math.round(target * 100) / 100,
      riskRewardRatio: Math.round(riskRewardRatio * 100) / 100,
      expectedValue: Math.round(ev * 100) / 100,
      positionSize: Math.round(positionSize * 100) / 100,
      maxLoss: Math.round(maxLoss * 100) / 100,
      maxGain: Math.round(maxGain * 100) / 100,
      confidence: Math.round(confidence),
      reasoning
    };
  }
  
  private calculateExpectedMove(volatility: number, probability: number, sentiment: 'BULLISH' | 'BEARISH'): number {
    // Base expected move on volatility and probability
    const baseMove = volatility * (probability / 100);
    
    // Adjust for sentiment direction
    return sentiment === 'BULLISH' ? baseMove : -baseMove;
  }
  
  private calculateLevels(
    currentPrice: number,
    volatility: number,
    sentiment: 'BULLISH' | 'BEARISH',
    expectedMove: number
  ): { stopLoss: number; target: number } {
    // Use ATR-based levels
    const atrMultiplier = 1.5; // Stop loss at 1.5x ATR
    const targetMultiplier = 3.0; // Target at 3x ATR (2:1 risk-reward minimum)
    
    const atr = currentPrice * (volatility / 100);
    
    if (sentiment === 'BULLISH') {
      const stopLoss = currentPrice - (atr * atrMultiplier);
      const target = currentPrice + (atr * targetMultiplier);
      return { stopLoss, target };
    } else {
      const stopLoss = currentPrice + (atr * atrMultiplier);
      const target = currentPrice - (atr * targetMultiplier);
      return { stopLoss, target };
    }
  }
  
  private calculatePositionSize(
    probability: number,
    volatility: number,
    liquidity: number,
    marketCap: number,
    ev: number
  ): number {
    // Base position size (Kelly Criterion inspired)
    const kellyFraction = Math.max(0, (probability / 100) - ((100 - probability) / 100) / 2) * 100;
    
    // Cap at reasonable levels
    let positionSize = Math.min(kellyFraction, 10); // Max 10% per position
    
    // Reduce for high volatility
    if (volatility > 40) {
      positionSize *= 0.7;
    } else if (volatility > 30) {
      positionSize *= 0.85;
    }
    
    // Reduce for low liquidity
    if (liquidity < 500000) {
      positionSize *= 0.5;
    } else if (liquidity < 1000000) {
      positionSize *= 0.75;
    }
    
    // Reduce for small market cap (higher risk)
    if (marketCap < 1000) { // < 1000 Cr
      positionSize *= 0.6;
    } else if (marketCap < 5000) { // < 5000 Cr
      positionSize *= 0.8;
    }
    
    // Reduce if EV is marginal
    if (ev < 1) {
      positionSize *= 0.5;
    } else if (ev < 2) {
      positionSize *= 0.75;
    }
    
    return Math.max(0.5, Math.round(positionSize * 100) / 100); // Min 0.5%
  }
  
  private calculateConfidence(
    probability: number,
    ev: number,
    riskRewardRatio: number,
    liquidity: number,
    volatility: number
  ): number {
    let confidence = probability; // Start with base probability
    
    // Boost for high EV
    if (ev > 3) confidence += 10;
    else if (ev > 2) confidence += 5;
    else if (ev < 1) confidence -= 10;
    
    // Boost for good risk-reward
    if (riskRewardRatio > 3) confidence += 5;
    else if (riskRewardRatio < 1.5) confidence -= 10;
    
    // Reduce for low liquidity
    if (liquidity < 500000) confidence -= 10;
    
    // Reduce for high volatility
    if (volatility > 50) confidence -= 5;
    
    return Math.min(95, Math.max(5, confidence));
  }
  
  /**
   * Calculate portfolio-level risk metrics
   */
  calculatePortfolioRisk(positions: Array<{ ticker: string; size: number; beta: number; sector: string }>): {
    totalExposure: number;
    sectorExposure: Record<string, number>;
    betaWeightedExposure: number;
    correlationRisk: 'LOW' | 'MEDIUM' | 'HIGH';
    concentrationRisk: number;
  } {
    const totalExposure = positions.reduce((sum, p) => sum + p.size, 0);
    
    // Sector exposure
    const sectorExposure: Record<string, number> = {};
    positions.forEach(p => {
      sectorExposure[p.sector] = (sectorExposure[p.sector] || 0) + p.size;
    });
    
    // Beta-weighted exposure (market sensitivity)
    const betaWeightedExposure = positions.reduce((sum, p) => sum + (p.size * p.beta), 0);
    
    // Concentration risk (Herfindahl Index)
    const weights = positions.map(p => p.size / totalExposure);
    const concentrationRisk = weights.reduce((sum, w) => sum + w * w, 0) * 100;
    
    // Correlation risk (simplified)
    const maxSectorWeight = Math.max(...Object.values(sectorExposure)) / totalExposure;
    let correlationRisk: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
    if (maxSectorWeight > 0.5) correlationRisk = 'HIGH';
    else if (maxSectorWeight > 0.3) correlationRisk = 'MEDIUM';
    
    return {
      totalExposure: Math.round(totalExposure * 100) / 100,
      sectorExposure,
      betaWeightedExposure: Math.round(betaWeightedExposure * 100) / 100,
      correlationRisk,
      concentrationRisk: Math.round(concentrationRisk * 100) / 100
    };
  }
}

export const riskEngine = new RiskEngine();