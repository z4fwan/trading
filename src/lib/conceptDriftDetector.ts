import { getResolvedPredictions, computeTrustMetrics, type StoredPrediction } from './predictionStore';
import { loadRecords, type ExperienceRecord, type TickerStats } from './aiExperienceEngine';
import { getAllCalibrationRecords } from './ai/knowledgeBase';
import type { ConfidenceCalibrationRecord } from './ai/types';

// === Concept Drift Detection ===
// Detects when the statistical relationship between predictions and outcomes changes.
// When drift is detected, the system should:
//   - Reduce trust in indicator weights
//   - Lower confidence in predictions
//   - Flag outdated learning
//   - Trigger re-calibration

export interface DriftSignal {
  hasDrift: boolean;
  driftScore: number;
  severity: 'NONE' | 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  signals: string[];
  recommendation: string;
}

export interface DriftBreakdown {
  winRateDrift: number;
  calibrationDrift: number;
  regimeStabilityDrift: number;
  confidenceAccuracyDrift: number;
  volatilityRegimeShift: number;
}

// === 1. Rolling win rate degradation ===
function detectWinRateDrift(ticker?: string, windowDays = 30): { drift: number; olderRate: number; recentRate: number } {
  const records = loadRecords();
  const filtered = ticker
    ? records.filter(r => r.ticker === ticker)
    : records;

  if (filtered.length < 10) return { drift: 0, olderRate: 0, recentRate: 0 };

  const now = Date.now();
  const recent = filtered.filter(r => r.createdAt > now - windowDays * 86400000);
  const older = filtered.filter(r => r.createdAt <= now - windowDays * 86400000 &&
    r.createdAt > now - windowDays * 2 * 86400000);

  if (recent.length < 3 || older.length < 3) return { drift: 0, olderRate: 0, recentRate: 0 };

  const recentWin = recent.filter(r => r.result === 'CORRECT' || r.result === 'PARTIAL').length;
  const olderWin = older.filter(r => r.result === 'CORRECT' || r.result === 'PARTIAL').length;
  const recentRate = (recentWin / recent.length) * 100;
  const olderRate = (olderWin / older.length) * 100;
  const drift = olderRate - recentRate; // positive = degradation

  return { drift: Math.round(drift), olderRate: Math.round(olderRate), recentRate: Math.round(recentRate) };
}

// === 2. Calibration drift — are confidence buckets still accurate? ===
function detectCalibrationDrift(): { drift: number; details: string[] } {
  const records = getAllCalibrationRecords();
  const recent = records.filter(r => r.totalPredictions >= 3);
  if (recent.length < 3) return { drift: 0, details: [] };

  let totalGapChange = 0;
  let count = 0;
  const details: string[] = [];

  for (const r of recent) {
    const gap = Math.abs(r.gap);
    if (gap > 15) {
      totalGapChange += gap;
      count++;
      details.push(`Bucket ${r.bucket}: gap ${r.gap.toFixed(1)}% (confidence ${r.avgConfidence.toFixed(0)}% vs accuracy ${r.accuracy.toFixed(0)}%)`);
    }
  }

  const drift = count > 0 ? Math.round(totalGapChange / count) : 0;
  return { drift, details };
}

// === 3. Regime stability — has the market regime shifted unexpectedly? ===
function detectRegimeShift(): { drift: number; hasShifted: boolean } {
  const records = loadRecords();
  const recent = records.filter(r => r.createdAt > Date.now() - 14 * 86400000);
  const older = records.filter(r => r.createdAt > Date.now() - 28 * 86400000 &&
    r.createdAt <= Date.now() - 14 * 86400000);

  if (recent.length < 3 || older.length < 3) return { drift: 0, hasShifted: false };

  const recentRegimes = new Set(recent.map(r => r.regime));
  const olderRegimes = new Set(older.map(r => r.regime));

  // Check if dominant regime changed
  const recentDominant = getDominantRegime(recent);
  const olderDominant = getDominantRegime(older);

  const hasShifted = recentDominant !== olderDominant;
  return {
    drift: hasShifted ? 30 : 0,
    hasShifted,
  };
}

function getDominantRegime(records: ExperienceRecord[]): string {
  const counts: Record<string, number> = {};
  for (const r of records) {
    counts[r.regime] = (counts[r.regime] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'UNKNOWN';
}

// === 4. Confidence-accuracy gap widening ===
function detectConfidenceAccuracyDrift(): { drift: number; gap: number } {
  const metrics = computeTrustMetrics();
  const gap = metrics.confidenceAccuracyGap;
  return {
    drift: gap > 20 ? 25 : gap > 15 ? 15 : gap > 10 ? 8 : 0,
    gap: Math.round(gap),
  };
}

// === 5. Full drift assessment ===
export function assessDrift(ticker?: string): DriftSignal {
  const signals: string[] = [];
  let totalDrift = 0;

  // Win rate drift
  const wd = detectWinRateDrift(ticker);
  if (wd.drift > 20) {
    totalDrift += 30;
    signals.push(`Sharp win rate decline: ${wd.olderRate}% → ${wd.recentRate}%`);
  } else if (wd.drift > 10) {
    totalDrift += 15;
    signals.push(`Moderate win rate decline: ${wd.olderRate}% → ${wd.recentRate}%`);
  }

  // Calibration drift
  const cd = detectCalibrationDrift();
  if (cd.drift > 20) {
    totalDrift += 25;
    signals.push(`Calibration gap widening: ${cd.drift}% average gap`);
    for (const d of cd.details.slice(0, 2)) signals.push(d);
  } else if (cd.drift > 10) {
    totalDrift += 12;
    signals.push(`Calibration gap: ${cd.drift}%`);
  }

  // Regime shift
  const rs = detectRegimeShift();
  if (rs.hasShifted) {
    totalDrift += rs.drift;
    signals.push('Market regime shift detected — historical patterns may be less reliable');
  }

  // Confidence-accuracy gap
  const cad = detectConfidenceAccuracyDrift();
  totalDrift += cad.drift;
  if (cad.gap > 15) {
    signals.push(`Confidence-accuracy gap widening (${cad.gap}%) — overconfidence risk`);
  }

  // Determine severity
  let severity: 'NONE' | 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' = 'NONE';
  if (totalDrift >= 60) severity = 'CRITICAL';
  else if (totalDrift >= 40) severity = 'HIGH';
  else if (totalDrift >= 20) severity = 'MODERATE';
  else if (totalDrift >= 10) severity = 'LOW';

  let recommendation: string;
  switch (severity) {
    case 'CRITICAL':
      recommendation = 'CRITICAL concept drift — stop relying on historical patterns. Trigger full model recalibration and reduce all prediction confidence by 50%.';
      break;
    case 'HIGH':
      recommendation = 'Significant drift detected — reduce confidence by 30%. Consider re-calibrating indicator weights and validating recent predictions.';
      break;
    case 'MODERATE':
      recommendation = 'Moderate drift — increase validation frequency. Monitor next 10 predictions closely.';
      break;
    case 'LOW':
      recommendation = 'Minor drift — no immediate action needed. Continue monitoring.';
      break;
    default:
      recommendation = 'No significant drift — current strategy is stable.';
  }

  return {
    hasDrift: severity !== 'NONE',
    driftScore: totalDrift,
    severity,
    signals: signals.slice(0, 5),
    recommendation,
  };
}

// === Quick drift-adjusted confidence ===
export function getDriftAdjustedConfidence(baseConfidence: number, ticker?: string): {
  adjustedConfidence: number;
  drift: DriftSignal;
  suppressionPct: number;
} {
  const drift = assessDrift(ticker);
  if (!drift.hasDrift) {
    return { adjustedConfidence: baseConfidence, drift, suppressionPct: 0 };
  }

  let suppression: number;
  switch (drift.severity) {
    case 'CRITICAL': suppression = 50; break;
    case 'HIGH': suppression = 30; break;
    case 'MODERATE': suppression = 15; break;
    case 'LOW': suppression = 5; break;
    default: suppression = 0;
  }

  const adjustedConfidence = Math.max(5, Math.round(baseConfidence * (1 - suppression / 100)));
  return { adjustedConfidence, drift, suppressionPct: suppression };
}
