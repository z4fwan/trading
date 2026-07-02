import { getAllCalibrationRecords, saveCalibrationRecords } from './knowledgeBase';
import type { ConfidenceCalibrationRecord } from './types';
import { clampConfidence } from '../confidenceConfig';

export interface CalibratedConfidence {
  rawConfidence: number;
  calibratedConfidence: number;
  calibrationBias: number;
  confidenceAdjustment: number;
}

export function computeCalibratedConfidence(rawConfidence: number): CalibratedConfidence {
  const records = getAllCalibrationRecords();
  if (records.length === 0) {
    return { rawConfidence, calibratedConfidence: rawConfidence, calibrationBias: 0, confidenceAdjustment: 0 };
  }

  // Find the relevant bucket
  const bucketStart = Math.floor(rawConfidence / 10) * 10;
  const bucketEnd = Math.min(100, bucketStart + 10);
  const bucket = records.find(
    r => r.bucketStart === bucketStart && r.bucketEnd === bucketEnd,
  );

  if (!bucket || bucket.totalPredictions < 5) {
    // Insufficient data for this bucket, use the nearest reliable bucket
    const reliable = records.filter(r => r.totalPredictions >= 5);
    if (reliable.length === 0) {
      return { rawConfidence, calibratedConfidence: rawConfidence, calibrationBias: 0, confidenceAdjustment: 0 };
    }
    // Use the overall average bias
    const avgBias = reliable.reduce((s, r) => s + (r.avgConfidence - r.accuracy), 0) / reliable.length;
    const adjustment = -avgBias * (rawConfidence / 100) * 0.5;
    return {
      rawConfidence,
      calibratedConfidence: clampConfidence(rawConfidence + adjustment),
      calibrationBias: avgBias,
      confidenceAdjustment: adjustment,
    };
  }

  // Compute bias: positive = overconfidence, negative = underconfidence
  const bias = bucket.avgConfidence - bucket.accuracy;
  const adjustment = -bias * (rawConfidence / 100) * 0.5;
  const calibrated = clampConfidence(rawConfidence + adjustment);

  return {
    rawConfidence,
    calibratedConfidence: calibrated,
    calibrationBias: bias,
    confidenceAdjustment: adjustment,
  };
}

export function computeCalibrationReport(): {
  quality: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
  overconfidenceLevel: string;
  underconfidenceLevel: string;
  recommendation: string;
} {
  const records = getAllCalibrationRecords();
  if (records.length < 3) {
    return {
      quality: 'POOR',
      overconfidenceLevel: 'Insufficient data',
      underconfidenceLevel: 'Insufficient data',
      recommendation: 'Continue accumulating prediction results for calibration analysis',
    };
  }

  const reliableRecords = records.filter(r => r.totalPredictions >= 3);

  if (reliableRecords.length === 0) {
    return {
      quality: 'FAIR', overconfidenceLevel: 'Building data',
      underconfidenceLevel: 'Building data',
      recommendation: 'More data needed for reliable calibration',
    };
  }

  let totalGap = 0;
  let maxGap = 0;
  let overconfidentBuckets = 0;
  let underconfidentBuckets = 0;
  const totalReliable = reliableRecords.length;

  for (const r of reliableRecords) {
    const gap = r.avgConfidence - r.accuracy;
    totalGap += gap;
    if (Math.abs(gap) > Math.abs(maxGap)) maxGap = gap;
    if (gap > 5) overconfidentBuckets++;
    else if (gap < -5) underconfidentBuckets++;
  }

  const avgGap = totalGap / totalReliable;
  const absAvgGap = Math.abs(avgGap);

  let quality: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
  if (absAvgGap < 5 && maxGap < 10) quality = 'EXCELLENT';
  else if (absAvgGap < 10 && maxGap < 20) quality = 'GOOD';
  else if (absAvgGap < 15) quality = 'FAIR';
  else quality = 'POOR';

  const overPct = (overconfidentBuckets / totalReliable) * 100;
  const underPct = (underconfidentBuckets / totalReliable) * 100;

  const recommendation = avgGap > 0
    ? `Systematic overconfidence detected (avg +${avgGap.toFixed(1)}%). Recommend reducing confidence expression by ${Math.min(20, Math.round(avgGap * 0.5))}% across all predictions.`
    : avgGap < 0
      ? `Systematic underconfidence detected (avg ${avgGap.toFixed(1)}%). AI is underestimating its accuracy — confidence can be increased.`
      : 'Confidence is well-calibrated. No adjustments needed.';

  return {
    quality,
    overconfidenceLevel: overPct > 60 ? 'HIGH' : overPct > 30 ? 'MODERATE' : 'LOW',
    underconfidenceLevel: underPct > 60 ? 'HIGH' : underPct > 30 ? 'MODERATE' : 'LOW',
    recommendation,
  };
}

export function getConfidenceAccuracyGap(): { gap: number; direction: 'overconfident' | 'underconfident' | 'calibrated' } {
  const records = getAllCalibrationRecords();
  const reliable = records.filter(r => r.totalPredictions >= 3);
  if (reliable.length === 0) return { gap: 0, direction: 'calibrated' };

  const weightedGap = reliable.reduce((s, r) => s + (r.gap * r.totalPredictions), 0);
  const totalWeight = reliable.reduce((s, r) => s + r.totalPredictions, 0);
  const avgGap = totalWeight > 0 ? weightedGap / totalWeight : 0;

  return {
    gap: Math.abs(avgGap),
    direction: avgGap > 3 ? 'overconfident' : avgGap < -3 ? 'underconfident' : 'calibrated',
  };
}
