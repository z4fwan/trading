// === Calibration Engine ===
// Reliability diagrams, Brier score, Expected Calibration Error (ECE)

export interface CalibrationBin {
  binStart: number;
  binEnd: number;
  count: number;
  avgConfidence: number;
  accuracy: number;
  gap: number;
}

export interface CalibrationMetrics {
  brierScore: number;
  ece: number;
  mce: number;
  bins: CalibrationBin[];
  overconfidence: number;
  underconfidence: number;
  avgConfidence: number;
  avgAccuracy: number;
  calibrationQuality: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
}

export function computeCalibration(
  confidences: number[],
  correct: boolean[],
  nBins = 10,
): CalibrationMetrics {
  if (confidences.length === 0 || confidences.length !== correct.length) {
    return {
      brierScore: 0, ece: 0, mce: 0, bins: [],
      overconfidence: 0, underconfidence: 0,
      avgConfidence: 0, avgAccuracy: 0,
      calibrationQuality: 'POOR',
    };
  }

  // Create pairs and sort by confidence
  const pairs = confidences.map((c, i) => ({ conf: c, correct: correct[i] }));
  pairs.sort((a, b) => a.conf - b.conf);

  const binSize = Math.ceil(pairs.length / nBins);
  const bins: CalibrationBin[] = [];
  let totalConf = 0, totalCorrect = 0;
  let brierScoreSum = 0;
  let eceSum = 0;
  let mce = 0;
  let overconfSum = 0, underconfSum = 0;

  for (let b = 0; b < nBins; b++) {
    const start = b * binSize;
    const end = Math.min(start + binSize, pairs.length);
    if (start >= pairs.length) break;

    const binData = pairs.slice(start, end);
    const count = binData.length;
    const avgConf = binData.reduce((s, p) => s + p.conf, 0) / count;
    const accuracy = binData.filter(p => p.correct).length / count;
    const gap = avgConf - accuracy;

    bins.push({
      binStart: b / nBins * 100,
      binEnd: (b + 1) / nBins * 100,
      count,
      avgConfidence: parseFloat((avgConf * 100).toFixed(1)),
      accuracy: parseFloat((accuracy * 100).toFixed(1)),
      gap: parseFloat((gap * 100).toFixed(1)),
    });

    totalConf += avgConf * count;
    totalCorrect += binData.filter(p => p.correct).length;
    eceSum += count * Math.abs(gap);
    mce = Math.max(mce, Math.abs(gap));

    // Brier score: sum of (pred - actual)^2
    for (const p of binData) {
      brierScoreSum += (p.conf - (p.correct ? 1 : 0)) ** 2;
    }

    if (gap > 0) overconfSum += gap * count;
    else underconfSum += Math.abs(gap) * count;
  }

  const n = pairs.length;
  const brierScore = brierScoreSum / n;
  const ece = eceSum / n;
  const avgConfidence = totalConf / n;
  const avgAccuracy = totalCorrect / n;
  const overconfidence = overconfSum / n;
  const underconfidence = underconfSum / n;

  let calibrationQuality: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' = 'POOR';
  if (ece < 0.05 && brierScore < 0.10) calibrationQuality = 'EXCELLENT';
  else if (ece < 0.10 && brierScore < 0.15) calibrationQuality = 'GOOD';
  else if (ece < 0.15 && brierScore < 0.20) calibrationQuality = 'FAIR';

  return {
    brierScore: parseFloat(brierScore.toFixed(4)),
    ece: parseFloat((ece * 100).toFixed(1)),
    mce: parseFloat((mce * 100).toFixed(1)),
    bins,
    overconfidence: parseFloat((overconfidence * 100).toFixed(1)),
    underconfidence: parseFloat((underconfidence * 100).toFixed(1)),
    avgConfidence: parseFloat((avgConfidence * 100).toFixed(1)),
    avgAccuracy: parseFloat((avgAccuracy * 100).toFixed(1)),
    calibrationQuality,
  };
}

// === A/B Test Framework ===
export interface ABTestResult {
  methodA: string;
  methodB: string;
  aWins: number;
  bWins: number;
  ties: number;
  totalTrials: number;
  aWinRate: number;
  bWinRate: number;
  significance: number;
  winner: 'A' | 'B' | 'TIE' | null;
}

export function computeABTest(
  resultsA: { confidence: number; correct: boolean }[],
  resultsB: { confidence: number; correct: boolean }[],
): ABTestResult {
  const n = Math.min(resultsA.length, resultsB.length);
  let aWins = 0, bWins = 0, ties = 0;

  for (let i = 0; i < n; i++) {
    if (resultsA[i].correct && !resultsB[i].correct) aWins++;
    else if (!resultsA[i].correct && resultsB[i].correct) bWins++;
    else ties++;
  }

  const aWinRate = n > 0 ? (aWins / n) * 100 : 0;
  const bWinRate = n > 0 ? (bWins / n) * 100 : 0;

  // Simple binomial significance (p-value approximation)
  const total = aWins + bWins;
  const p = total > 0 ? aWins / total : 0.5;
  const expected = total * 0.5;
  const z = total > 0 ? Math.abs(aWins - expected) / Math.sqrt(total * 0.5 * 0.5) : 0;
  const significance = Math.min(99.9, (0.5 * (1 + erf(z / Math.sqrt(2)))) * 100);

  let winner: 'A' | 'B' | 'TIE' | null = null;
  if (significance > 95 && aWins > bWins) winner = 'A';
  else if (significance > 95 && bWins > aWins) winner = 'B';
  else if (aWins === bWins) winner = 'TIE';

  return {
    methodA: 'ML Model',
    methodB: 'Rule-Based',
    aWins, bWins, ties,
    totalTrials: n,
    aWinRate: parseFloat(aWinRate.toFixed(1)),
    bWinRate: parseFloat(bWinRate.toFixed(1)),
    significance: parseFloat(significance.toFixed(1)),
    winner,
  };
}

function erf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

export interface CategoryCalibration {
  category: string;
  metrics: CalibrationMetrics;
}

export function computeCategoryCalibration(
  predictions: any[]
): CategoryCalibration[] {
  const grouped: Record<string, any[]> = {};
  
  for (const p of predictions) {
    // Assuming event type is stored in reasoning or marketCondition
    const category = p.marketCondition || 'GENERAL';
    if (!grouped[category]) grouped[category] = [];
    grouped[category].push(p);
  }

  const results: CategoryCalibration[] = [];
  for (const [category, preds] of Object.entries(grouped)) {
    const confidences = preds.map(p => (p.bullishProb > p.bearishProb ? p.bullishProb : p.bearishProb) / 100);
    const correct = preds.map(p => p.accuracyPercent && p.accuracyPercent > 0);
    results.push({
      category,
      metrics: computeCalibration(confidences, correct, 5) // Use 5 bins for smaller category sets
    });
  }

  return results;
}

