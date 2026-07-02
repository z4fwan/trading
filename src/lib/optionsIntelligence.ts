export interface OptionsChainData {
  timestamp: number;
  ticker: string;
  spotPrice: number;
  maxPainStrike: number;
  pcr: number; // Put-Call Ratio
  impliedVolatility: number;
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  reversalLevels: { support: number; resistance: number };
}

// In a real environment, this would connect to NSE's Option Chain APIs (e.g. via an unofficial wrapper or broker API).
// Since NSE data is complex to stream for free, we simulate the F&O intelligence generation here for now.
export async function analyzeOptionsChain(ticker: string, spotPrice: number): Promise<OptionsChainData | null> {
  if (ticker !== 'NIFTY' && ticker !== 'BANKNIFTY') return null; // We focus primarily on indices for options

  // Simulated Option Chain Analysis
  const randomPcrOffset = (Math.random() * 0.8) - 0.4; // between -0.4 and +0.4
  const basePcr = 1.0;
  const pcr = Number((basePcr + randomPcrOffset).toFixed(2));
  
  let sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  if (pcr > 1.2) sentiment = 'BULLISH';
  else if (pcr < 0.8) sentiment = 'BEARISH';

  // Find nearest strike (assuming 50 for Nifty, 100 for BankNifty)
  const strikeInterval = ticker === 'NIFTY' ? 50 : 100;
  const atmStrike = Math.round(spotPrice / strikeInterval) * strikeInterval;
  
  // Max pain is usually near ATM in a stable market, or shifted in a trending market.
  const maxPainOffset = sentiment === 'BULLISH' ? strikeInterval * 2 : sentiment === 'BEARISH' ? -strikeInterval * 2 : 0;
  const maxPainStrike = atmStrike + maxPainOffset;

  return {
    timestamp: Date.now(),
    ticker,
    spotPrice,
    maxPainStrike,
    pcr,
    impliedVolatility: 12 + Math.random() * 8, // VIX equivalent approx 12-20
    sentiment,
    reversalLevels: {
      support: maxPainStrike - (strikeInterval * 3),
      resistance: maxPainStrike + (strikeInterval * 3),
    }
  };
}
