/** Shared confidence bounds — keep trust metrics and engines aligned. */
export const MAX_CONFIDENCE = 80;
export const MIN_CONFIDENCE = 10;
/** Trust / reliability bucket for "high confidence" predictions. */
export const HIGH_CONF_THRESHOLD = 60;
/** Block new predictions below this after intelligence adjustments. */
export const PREDICTION_BLOCK_THRESHOLD = 12;

export function clampConfidence(value: number): number {
  return Math.min(MAX_CONFIDENCE, Math.max(MIN_CONFIDENCE, Math.round(value)));
}

/** Reduce confidence based on volatility relative to historical average.
 *  atr is a percentage of price. Returns multiplier [0.5, 1.0]. */
export function volatilityConfidenceMultiplier(atrPercent: number): number {
  if (atrPercent <= 0) return 1.0;
  // atrPercent > 4% is very high vol — cut confidence by up to 50%
  // atrPercent < 1% is low vol — full confidence
  return Math.max(0.5, Math.min(1.0, 1.0 - (atrPercent - 1.0) * 0.15));
}

/** Reduce confidence when ensemble models disagree.
 *  agreement = % of models voting the same direction. */
export function agreementConfidenceMultiplier(agreement: number): number {
  if (agreement >= 80) return 1.0;
  if (agreement >= 60) return 0.85;
  if (agreement >= 40) return 0.65;
  return 0.5;
}

/** Compute a reliable confidence value incorporating volatility and agreement. */
export function computeReliableConfidence(
  rawConfidence: number,
  atrPercent: number,
  agreementLevel: number,
): number {
  const volMult = volatilityConfidenceMultiplier(atrPercent);
  const agreeMult = agreementConfidenceMultiplier(agreementLevel);
  return clampConfidence(rawConfidence * volMult * agreeMult);
}
