/**
 * Expected Value Calculator - Institutional Grade
 * 
 * Calculates Expected Value (EV) to determine if a trade is profitable
 * after accounting for all costs (brokerage, taxes, slippage).
 * 
 * If EV is negative, the system returns NO TRADE regardless of probability.
 */

export interface TradeParameters {
  winProbability: number; // 0-100
  averageWin: number; // Expected gain if win (in %)
  averageLoss: number; // Expected loss if lose (in %)
  investmentAmount: number; // Amount to invest (in ₹)
  
  // Costs
  brokerageRate?: number; // Brokerage % (default 0.05%)
  sttRate?: number; // STT % (default 0.025%)
  exchangeTxnCharge?: number; // Exchange txn charge % (default 0.00325%)
  sebiTurnoverFee?: number; // SEBI turnover fee % (default 0.0001%)
  gstRate?: number; // GST % (default 18% on brokerage)
  slippagePercent?: number; // Expected slippage % (default 0.1%)
  stampDuty?: number; // Stamp duty % (default 0.015% for buy side)
}

export interface ExpectedValueResult {
  ev: number; // Expected Value in ₹
  evPercent: number; // Expected Value as % of investment
  isProfitable: boolean; // Whether EV > 0
  minWinRate: number; // Minimum win rate needed for positive EV
  breakEvenWin: number; // Break-even win amount needed
  totalCosts: number; // Total trading costs in ₹
  costBreakdown: {
    brokerage: number;
    stt: number;
    exchangeTxn: number;
    sebiFee: number;
    gst: number;
    slippage: number;
    stampDuty: number;
  };
  recommendation: 'BUY' | 'SELL' | 'NO_TRADE';
  confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
}

/**
 * Expected Value Calculator
 */
export class ExpectedValueCalculator {
  
  /**
   * Calculate Expected Value for a trade
   */
  calculateEV(params: TradeParameters): ExpectedValueResult {
    const {
      winProbability,
      averageWin,
      averageLoss,
      investmentAmount,
      brokerageRate = 0.05,
      sttRate = 0.025,
      exchangeTxnCharge = 0.00325,
      sebiTurnoverFee = 0.0001,
      gstRate = 18,
      slippagePercent = 0.1,
      stampDuty = 0.015
    } = params;
    
    // === 1. Calculate Total Costs ===
    const brokerage = (investmentAmount * brokerageRate) / 100;
    const stt = (investmentAmount * sttRate) / 100;
    const exchangeTxn = (investmentAmount * exchangeTxnCharge) / 100;
    const sebiFee = (investmentAmount * sebiTurnoverFee) / 100;
    const gst = (brokerage * gstRate) / 100;
    const slippage = (investmentAmount * slippagePercent) / 100;
    const stampDutyAmount = (investmentAmount * stampDuty) / 100;
    
    const totalCosts = brokerage + stt + exchangeTxn + sebiFee + gst + slippage + stampDutyAmount;
    
    // === 2. Calculate Expected Gross Return ===
    const winAmount = (investmentAmount * averageWin) / 100;
    const lossAmount = (investmentAmount * Math.abs(averageLoss)) / 100;
    
    const expectedGrossReturn = (winProbability / 100 * winAmount) - 
                                 ((100 - winProbability) / 100 * lossAmount);
    
    // === 3. Calculate Expected Value (EV) ===
    const ev = expectedGrossReturn - totalCosts;
    const evPercent = (ev / investmentAmount) * 100;
    
    // === 4. Determine if Profitable ===
    const isProfitable = ev > 0;
    
    // === 5. Calculate Minimum Win Rate for Positive EV ===
    // EV = 0 when: p * win - (1-p) * loss = costs
    // p * win - loss + p * loss = costs
    // p * (win + loss) = costs + loss
    // p = (costs + loss) / (win + loss)
    const totalLoss = lossAmount + totalCosts;
    const totalWin = winAmount + lossAmount;
    const minWinRate = totalWin > 0 ? (totalLoss / totalWin) * 100 : 100;
    
    // === 6. Calculate Break-Even Win Amount ===
    const breakEvenWin = totalCosts / (winProbability / 100);
    
    // === 7. Determine Recommendation ===
    let recommendation: 'BUY' | 'SELL' | 'NO_TRADE' = 'NO_TRADE';
    
    if (isProfitable && evPercent >= 2) {
      // Only recommend if EV is significantly positive (>2%)
      recommendation = winAmount > lossAmount ? 'BUY' : 'SELL';
    } else if (isProfitable && evPercent > 0 && evPercent < 2) {
      // Marginal - could go either way
      recommendation = winAmount > lossAmount ? 'BUY' : 'NO_TRADE';
    }
    
    // === 8. Determine Confidence Level ===
    let confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
    
    if (evPercent >= 5 && winProbability >= 70) {
      confidenceLevel = 'HIGH';
    } else if (evPercent >= 3 && winProbability >= 60) {
      confidenceLevel = 'MEDIUM';
    }
    
    return {
      ev: Math.round(ev * 100) / 100,
      evPercent: Math.round(evPercent * 100) / 100,
      isProfitable,
      minWinRate: Math.round(minWinRate * 100) / 100,
      breakEvenWin: Math.round(breakEvenWin * 100) / 100,
      totalCosts: Math.round(totalCosts * 100) / 100,
      costBreakdown: {
        brokerage: Math.round(brokerage * 100) / 100,
        stt: Math.round(stt * 100) / 100,
        exchangeTxn: Math.round(exchangeTxn * 100) / 100,
        sebiFee: Math.round(sebiFee * 100) / 100,
        gst: Math.round(gst * 100) / 100,
        slippage: Math.round(slippage * 100) / 100,
        stampDuty: Math.round(stampDutyAmount * 100) / 100
      },
      recommendation,
      confidenceLevel
    };
  }
  
  /**
   * Quick EV check - returns true if trade is worth taking
   */
  shouldTrade(params: TradeParameters): boolean {
    const result = this.calculateEV(params);
    return result.isProfitable && result.evPercent >= 1; // At least 1% positive EV
  }
  
  /**
   * Calculate required win rate for a given profit target
   */
  requiredWinRate(
    targetProfit: number, // Target profit in ₹
    investmentAmount: number,
    averageLoss: number, // Average loss in ₹
    totalCosts: number
  ): number {
    // targetProfit = p * win - (1-p) * loss - costs
    // targetProfit + costs = p * win - loss + p * loss
    // targetProfit + costs + loss = p * (win + loss)
    // p = (targetProfit + costs + loss) / (win + loss)
    
    const win = targetProfit + averageLoss + totalCosts;
    const denominator = targetProfit + averageLoss;
    
    if (denominator <= 0) return 100;
    
    return Math.round((win / denominator) * 100 * 100) / 100;
  }
  
  /**
   * Calculate optimal position size based on Kelly Criterion
   */
  kellyCriterion(
    winProbability: number,
    winLossRatio: number // Average win / Average loss
  ): number {
    // Kelly % = W - [(1-W) / R]
    // W = Win probability
    // R = Win/Loss ratio
    
    const kelly = (winProbability / 100) - ((1 - winProbability / 100) / winLossRatio);
    
    // Cap at reasonable levels and use half-Kelly for safety
    const halfKelly = Math.max(0, Math.min(0.25, kelly / 2));
    
    return Math.round(halfKelly * 10000) / 100; // Return as % with 2 decimal places
  }
  
  /**
   * Generate detailed trade recommendation
   */
  generateTradeRecommendation(
    params: TradeParameters,
    signal: 'BUY' | 'SELL',
    ticker: string,
    currentPrice: number
  ): {
    action: 'BUY' | 'SELL' | 'NO_TRADE';
    ticker: string;
    currentPrice: number;
    targetPrice?: number;
    stopLoss?: number;
    positionSize?: number; // % of portfolio
    expectedReturn?: number;
    riskRewardRatio?: number;
    reasoning: string[];
    evAnalysis: ExpectedValueResult;
  } {
    const evResult = this.calculateEV(params);
    
    const recommendation = {
      action: (evResult.recommendation === 'NO_TRADE' ? 'NO_TRADE' : signal) as 'BUY' | 'SELL' | 'NO_TRADE',
      ticker,
      currentPrice,
      targetPrice: evResult.isProfitable ? currentPrice * (1 + params.averageWin / 100) : undefined,
      stopLoss: currentPrice * (1 - Math.abs(params.averageLoss) / 100),
      positionSize: this.kellyCriterion(params.winProbability, Math.abs(params.averageWin / params.averageLoss)),
      expectedReturn: evResult.evPercent,
      riskRewardRatio: Math.abs(params.averageWin / params.averageLoss),
      evAnalysis: evResult,
      reasoning: [] as string[]
    };
    return recommendation;
  }
}
