import type { AIFullSnapshot } from './types';

export type MarketRegimeClass =
  | 'BULLISH_TREND' | 'BEARISH_TREND' | 'RANGING'
  | 'PANIC_VOLATILITY' | 'BREAKOUT_EXPANSION'
  | 'ACCUMULATION' | 'DISTRIBUTION'
  | 'LOW_LIQUIDITY' | 'HIGH_MOMENTUM';

export interface RegimeClassification {
  regime: MarketRegimeClass;
  confidence: number;
  indicators: { name: string; signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' }[];
  description: string;
}

export function classifyMarketRegime(snapshot: AIFullSnapshot): RegimeClassification {
  const indicators: { name: string; signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' }[] = [];
  let bullishScore = 0;
  let bearishScore = 0;
  const totalWeight = 10;

  // Trend strength (ADX)
  const trendStrong = snapshot.adx > 30;
  const trendModerate = snapshot.adx > 20 && snapshot.adx <= 30;
  const trendWeak = snapshot.adx <= 20;

  // RSI
  if (snapshot.rsi > 60) { bullishScore += 2; indicators.push({ name: 'RSI', signal: 'BULLISH' }); }
  else if (snapshot.rsi < 40) { bearishScore += 2; indicators.push({ name: 'RSI', signal: 'BEARISH' }); }
  else indicators.push({ name: 'RSI', signal: 'NEUTRAL' });

  // MACD
  if (snapshot.macdHistogram > 0 && snapshot.macdLine > snapshot.macdSignal) {
    bullishScore += 2; indicators.push({ name: 'MACD', signal: 'BULLISH' });
  } else if (snapshot.macdHistogram < 0 && snapshot.macdLine < snapshot.macdSignal) {
    bearishScore += 2; indicators.push({ name: 'MACD', signal: 'BEARISH' });
  } else indicators.push({ name: 'MACD', signal: 'NEUTRAL' });

  // EMA alignment
  if (snapshot.ema20 > snapshot.ema50) { bullishScore += 1.5; indicators.push({ name: 'EMA', signal: 'BULLISH' }); }
  else if (snapshot.ema20 < snapshot.ema50) { bearishScore += 1.5; indicators.push({ name: 'EMA', signal: 'BEARISH' }); }
  else indicators.push({ name: 'EMA', signal: 'NEUTRAL' });

  // Supertrend
  if (snapshot.supertrendDirection === 'up') { bullishScore += 1.5; indicators.push({ name: 'Supertrend', signal: 'BULLISH' }); }
  else { bearishScore += 1.5; indicators.push({ name: 'Supertrend', signal: 'BEARISH' }); }

  // Volume
  if (snapshot.volumeRatio > 1.5) {
    if (bullishScore > bearishScore) indicators.push({ name: 'Volume', signal: 'BULLISH' });
    else indicators.push({ name: 'Volume', signal: 'BEARISH' });
  } else indicators.push({ name: 'Volume', signal: 'NEUTRAL' });

  // StochRSI
  if (snapshot.stochRsi > 80) { bullishScore += 1; indicators.push({ name: 'StochRSI', signal: 'BULLISH' }); }
  else if (snapshot.stochRsi < 20) { bearishScore += 1; indicators.push({ name: 'StochRSI', signal: 'BEARISH' }); }
  else indicators.push({ name: 'StochRSI', signal: 'NEUTRAL' });

  // Bollinger width for volatility
  const highVol = snapshot.bollingerWidth > 10;
  const lowVol = snapshot.bollingerWidth < 4;

  // Price vs VWAP
  if (snapshot.priceVsVwap > 0.02) { bullishScore += 1; indicators.push({ name: 'VWAP', signal: 'BULLISH' }); }
  else if (snapshot.priceVsVwap < -0.02) { bearishScore += 1; indicators.push({ name: 'VWAP', signal: 'BEARISH' }); }
  else indicators.push({ name: 'VWAP', signal: 'NEUTRAL' });

  const netScore = bullishScore - bearishScore;
  const netConfidence = Math.abs(netScore) / totalWeight * 100;

  let regime: MarketRegimeClass;
  let description: string;

  if (highVol && trendStrong && Math.abs(netScore) > 3) {
    regime = Math.abs(netScore) > 5 ? 'PANIC_VOLATILITY' : 'HIGH_MOMENTUM';
    description = regime === 'PANIC_VOLATILITY'
      ? 'Panic-driven volatility with extreme price swings'
      : 'High momentum with strong directional bias';
  } else if (lowVol && trendWeak) {
    regime = 'RANGING';
    description = 'Low volatility ranging market with no clear direction';
  } else if (trendStrong && netScore > 3) {
    regime = snapshot.volumeRatio > 1.3 ? 'BREAKOUT_EXPANSION' : 'BULLISH_TREND';
    description = regime === 'BREAKOUT_EXPANSION'
      ? 'Bullish breakout with expanding volume and volatility'
      : 'Steady bullish trend with consistent upward momentum';
  } else if (trendStrong && netScore < -3) {
    regime = snapshot.volumeRatio > 1.3 ? 'DISTRIBUTION' : 'BEARISH_TREND';
    description = regime === 'DISTRIBUTION'
      ? 'Distribution phase with institutional selling pressure'
      : 'Steady bearish trend with consistent downward momentum';
  } else if (netScore > 1 && lowVol) {
    regime = 'ACCUMULATION';
    description = 'Quiet accumulation phase with institutional buying';
  } else if (netScore < -1 && lowVol) {
    regime = 'DISTRIBUTION';
    description = 'Silent distribution phase with gradual institutional selling';
  } else if (snapshot.distToSupport < 0.02 && netScore < 0) {
    regime = 'RANGING';
    description = 'Near support level in a ranging market';
  } else if (snapshot.distToResistance < 0.02 && netScore > 0) {
    regime = 'BREAKOUT_EXPANSION';
    description = 'Approaching resistance with breakout potential';
  } else {
    regime = netScore > 1 ? 'BULLISH_TREND' : netScore < -1 ? 'BEARISH_TREND' : 'RANGING';
    description = regime === 'RANGING'
      ? 'Mixed signals with no dominant directional bias'
      : `${regime === 'BULLISH_TREND' ? 'Moderate bullish' : 'Moderate bearish'} bias`;
  }

  return { regime, confidence: Math.min(85, netConfidence), indicators, description };
}

export function getRegimePredictionAdvice(
  regime: MarketRegimeClass,
  snapshot: AIFullSnapshot,
): { recommendedApproach: string; confidenceModifier: number; riskWarning: string } {
  switch (regime) {
    case 'BULLISH_TREND':
      return {
        recommendedApproach: 'Trend-following strategies preferred. Momentum indicators more reliable.',
        confidenceModifier: 5,
        riskWarning: 'Watch for exhaustion signals near resistance levels.',
      };
    case 'BEARISH_TREND':
      return {
        recommendedApproach: 'Bearish bias with put protection. Counter-trend setups dangerous.',
        confidenceModifier: 3,
        riskWarning: 'Bear markets amplify downside. Tight stops essential.',
      };
    case 'RANGING':
      return {
        recommendedApproach: 'Mean reversion strategies. Bollinger bands more reliable.',
        confidenceModifier: -8,
        riskWarning: 'Fake breakouts common. Wait for confirmation above range.',
      };
    case 'PANIC_VOLATILITY':
      return {
        recommendedApproach: 'Avoid directional trades. Volatility strategies only.',
        confidenceModifier: -25,
        riskWarning: 'Extreme conditions. Liquidity can disappear. Reduce position size 50%.',
      };
    case 'BREAKOUT_EXPANSION':
      return {
        recommendedApproach: 'Breakout confirmation with momentum filters.',
        confidenceModifier: -5,
        riskWarning: 'Fake breakouts in 30% of cases. Require volume confirmation.',
      };
    case 'ACCUMULATION':
      return {
        recommendedApproach: 'Gradual accumulation with wide stops.',
        confidenceModifier: 2,
        riskWarning: 'Accumulation can take weeks. Patience required.',
      };
    case 'DISTRIBUTION':
      return {
        recommendedApproach: 'Reduce longs. Consider hedges.',
        confidenceModifier: -5,
        riskWarning: 'Distribution often precedes larger drops.',
      };
    case 'LOW_LIQUIDITY':
      return {
        recommendedApproach: 'Avoid trading. Wide spreads increase costs.',
        confidenceModifier: -20,
        riskWarning: 'Slippage risk extreme. Wait for volume return.',
      };
    case 'HIGH_MOMENTUM':
      return {
        recommendedApproach: 'Momentum strategies with trailing stops.',
        confidenceModifier: 8,
        riskWarning: 'Momentum can reverse violently. Use profit targets.',
      };
  }
}
