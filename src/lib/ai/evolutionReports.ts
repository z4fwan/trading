import type { AIEvolutionReport, AIKnowledgeSnapshot } from './types';
import {
  getAllIndicatorPerformance, getAllRegimeRecords, getAllFailurePatterns,
  getAllCalibrationRecords, getKnowledgeSnapshot,
} from './knowledgeBase';
import { computeCalibrationReport, getConfidenceAccuracyGap } from './confidenceCalibration';

export function generateEvolutionReport(): AIEvolutionReport {
  const snapshot = getKnowledgeSnapshot();
  const indicatorPerf = getAllIndicatorPerformance();
  const regimeRecords = getAllRegimeRecords();
  const failurePatterns = getAllFailurePatterns();
  const calibrationRecords = getAllCalibrationRecords();
  const calibrationReport = computeCalibrationReport();
  const gapInfo = getConfidenceAccuracyGap();

  // Accuracy trend over time (group by periods)
  const accuracyTrend = buildAccuracyTrend();
  const confidenceTrend = buildConfidenceTrend();

  // Indicator ranking
  const indicatorRanking = Object.entries(indicatorPerf)
    .filter(([_, r]) => r.totalOccurrences >= 3)
    .map(([name, r]) => ({ name, accuracy: r.accuracy, usageCount: r.totalOccurrences }))
    .sort((a, b) => b.accuracy - a.accuracy);

  // Regime accuracy
  const regimeAccuracy = Object.entries(regimeRecords)
    .filter(([_, r]) => r.totalPredictions >= 3)
    .map(([regime, r]) => ({ regime, accuracy: r.accuracy, samples: r.totalPredictions }))
    .sort((a, b) => b.accuracy - a.accuracy);

  // Sector accuracy
  const sectorAccuracy = Object.entries(snapshot as unknown as Record<string, unknown>)
    .filter(([k]) => k.startsWith('sector_'))
    .map(([k, v]) => ({ sector: k.replace('sector_', ''), accuracy: Number(v), samples: 0 }))
    .sort((a, b) => b.accuracy - a.accuracy);

  // Failure patterns
  const failurePatternsList = Object.entries(failurePatterns)
    .filter(([_, r]) => r.totalOccurrences >= 2)
    .map(([_, r]) => ({
      pattern: r.patternName,
      occurrences: r.totalOccurrences,
      severity: r.severity,
    }))
    .sort((a, b) => b.occurrences - a.occurrences)
    .slice(0, 10);

  // Top lessons learned
  const topLessons: string[] = [];
  if (indicatorRanking.length > 0) {
    topLessons.push(`Strongest indicator: ${indicatorRanking[0].name} (${indicatorRanking[0].accuracy.toFixed(1)}%)`);
  }
  if (indicatorRanking.length > 1) {
    topLessons.push(`Weakest indicator: ${indicatorRanking[indicatorRanking.length - 1].name} (${indicatorRanking[indicatorRanking.length - 1].accuracy.toFixed(1)}%)`);
  }
  if (regimeAccuracy.length > 0) {
    topLessons.push(`Best regime: ${regimeAccuracy[0].regime} (${regimeAccuracy[0].accuracy.toFixed(1)}%)`);
  }
  if (regimeAccuracy.length > 1) {
    topLessons.push(`Worst regime: ${regimeAccuracy[regimeAccuracy.length - 1].regime} (${regimeAccuracy[regimeAccuracy.length - 1].accuracy.toFixed(1)}%)`);
  }
  topLessons.push(`Confidence calibration: ${calibrationReport.quality} — ${calibrationReport.recommendation}`);

  // Recommendations
  const recommendations: string[] = [];
  if (gapInfo.direction === 'overconfident') {
    recommendations.push(`Reduce confidence by ${Math.round(gapInfo.gap * 0.3)}% to close calibration gap (${gapInfo.gap.toFixed(1)}%)`);
  }
  if (Object.keys(failurePatterns).length > 3) {
    const topPattern = Object.entries(failurePatterns).sort((a, b) => b[1].totalOccurrences - a[1].totalOccurrences)[0];
    if (topPattern) {
      recommendations.push(`Focus on avoiding "${topPattern[1].patternName}" — occurred ${topPattern[1].totalOccurrences} times`);
    }
  }
  if (regimeAccuracy.length > 0 && regimeAccuracy[regimeAccuracy.length - 1].accuracy < 40) {
    recommendations.push(`Avoid predictions in ${regimeAccuracy[regimeAccuracy.length - 1].regime} regime (${regimeAccuracy[regimeAccuracy.length - 1].accuracy.toFixed(0)}% accuracy)`);
  }
  if (snapshot.overallAccuracy < 50 && snapshot.totalResolvedPredictions > 10) {
    recommendations.push('Overall accuracy below 50% — consider more restrictive prediction criteria');
  }
  if (calibrationReport.quality !== 'EXCELLENT') {
    recommendations.push('Apply confidence recalibration before generating new predictions');
  }

  return {
    generatedAt: Date.now(),
    snapshot,
    accuracyTrend,
    confidenceTrend,
    indicatorRanking: indicatorRanking.slice(0, 15),
    regimeAccuracy,
    sectorAccuracy: sectorAccuracy.slice(0, 10),
    failurePatterns: failurePatternsList,
    topLessons,
    recommendations: recommendations.slice(0, 6),
  };
}

function buildAccuracyTrend(): { period: string; accuracy: number; samples: number }[] {
  const records = getAllCalibrationRecords();
  if (records.length === 0) return [];

  return records
    .filter(r => r.totalPredictions >= 2)
    .map(r => ({
      period: r.bucket,
      accuracy: r.accuracy,
      samples: r.totalPredictions,
    }))
    .sort((a, b) => parseInt(a.period) - parseInt(b.period));
}

function buildConfidenceTrend(): { period: string; avgConfidence: number; accuracy: number; gap: number }[] {
  const records = getAllCalibrationRecords();
  if (records.length === 0) return [];

  return records
    .filter(r => r.totalPredictions >= 2)
    .map(r => ({
      period: r.bucket,
      avgConfidence: r.avgConfidence,
      accuracy: r.accuracy,
      gap: r.gap,
    }))
    .sort((a, b) => parseInt(a.period) - parseInt(b.period));
}
