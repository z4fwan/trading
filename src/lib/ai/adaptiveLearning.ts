import type { AIMemoryPrediction, SelfAnalysisReport, FailureAnalysisReport } from './types';
import {
  updateIndicatorPerformance, updateCalibration, updateRegimeRecord,
  updateFailurePattern, updateIndicatorWeight,
  getKnowledgeSnapshot, saveKnowledgeSnapshot,
  getAllIndicatorPerformance, getAllRegimeRecords, getAllFailurePatterns,
  getCurrentWeights,
} from './knowledgeBase';
import { computeCalibratedConfidence, getConfidenceAccuracyGap, computeCalibrationReport } from './confidenceCalibration';
import { clampConfidence } from '../confidenceConfig';

export interface LearningResult {
  lessonLearned: string;
  indicatorsToTrust: string[];
  indicatorsToQuestion: string[];
  confidenceAdjustment: number;
  regimeReliability: number;
}

export function learnFromResult(
  pred: AIMemoryPrediction,
  selfAnalysis: SelfAnalysisReport,
  failureAnalysis?: FailureAnalysisReport,
): LearningResult {
  const wasCorrect = pred.result === 'CORRECT' || pred.result === 'PARTIAL';
  const indicatorsToTrust: string[] = [];
  const indicatorsToQuestion: string[] = [];
  let confidenceAdjustment = 0;

  // Learn from indicator performance
  const allIndicators = [
    { name: 'RSI', signal: selfAnalysis.indicatorsHelped.includes('RSI') },
    { name: 'MACD', signal: selfAnalysis.indicatorsHelped.includes('MACD') },
    { name: 'ADX', signal: selfAnalysis.indicatorsHelped.includes('ADX') },
    { name: 'Bollinger', signal: selfAnalysis.indicatorsHelped.includes('Bollinger') },
    { name: 'Supertrend', signal: selfAnalysis.indicatorsHelped.includes('Supertrend') },
    { name: 'Volume', signal: selfAnalysis.indicatorsHelped.includes('Volume') },
    { name: 'VWAP', signal: selfAnalysis.indicatorsHelped.includes('VWAP') },
  ];

  for (const ind of allIndicators) {
    if (!ind.signal && selfAnalysis.indicatorsFailed.some(f => f.includes(ind.name))) {
      updateIndicatorPerformance(ind.name, false, pred.confidence, pred.regime);
      updateIndicatorWeight(ind.name.toLowerCase(), -1);
      indicatorsToQuestion.push(ind.name);
    } else if (ind.signal) {
      updateIndicatorPerformance(ind.name, true, pred.confidence, pred.regime);
      updateIndicatorWeight(ind.name.toLowerCase(), 1);
      indicatorsToTrust.push(ind.name);
    }
  }

  // Learn from confidence accuracy
  updateCalibration(pred.confidence, wasCorrect);

  // Compute calibrated confidence adjustment
  const calibrated = computeCalibratedConfidence(pred.confidence);
  confidenceAdjustment = calibrated.confidenceAdjustment;

  // Learn from regime outcome
  updateRegimeRecord(
    pred.regime, wasCorrect, pred.confidence, pred.deviationPercent ?? 0,
    selfAnalysis.indicatorsHelped, pred.expectedVolatility, pred.sentimentScore,
  );

  // Learn from failure patterns
  if (!wasCorrect && failureAnalysis) {
    updateFailurePattern(
      {
        primaryReason: failureAnalysis.primaryReason,
        indicators: [...selfAnalysis.indicatorsFailed, ...selfAnalysis.indicatorsHelped],
        regime: pred.regime,
        ticker: pred.ticker,
      },
      pred.confidence,
      pred.deviationPercent ?? 50,
    );
  }

  // Update knowledge snapshot
  updateKnowledgeSnapshotStatic(pred, wasCorrect);

  const lessonLearned = wasCorrect
    ? `Setup succeeded in ${pred.regime} regime. ${selfAnalysis.indicatorsHelped.slice(0, 2).join(' and ')} confirmed reliability.`
    : `Setup failed. ${selfAnalysis.indicatorsFailed.slice(0, 2).join(' and ')} were misleading. ${failureAnalysis?.primaryReason || 'Unexpected conditions'}.`;

  return {
    lessonLearned,
    indicatorsToTrust,
    indicatorsToQuestion,
    confidenceAdjustment,
    regimeReliability: wasCorrect ? 1 : 0,
  };
}

function updateKnowledgeSnapshotStatic(pred: AIMemoryPrediction, wasCorrect: boolean): void {
  const snapshot = getKnowledgeSnapshot();
  snapshot.totalPredictionsAnalyzed++;
  if (pred.resolved) snapshot.totalResolvedPredictions++;

  const ip = getAllIndicatorPerformance();
  let bestAcc = 0, worstAcc = 100;
  let bestInd = '', worstInd = '';
  for (const [name, record] of Object.entries(ip)) {
    if (record.totalOccurrences >= 3) {
      if (record.accuracy > bestAcc) { bestAcc = record.accuracy; bestInd = name; }
      if (record.accuracy < worstAcc) { worstAcc = record.accuracy; worstInd = name; }
    }
  }
  snapshot.strongestIndicator = bestInd;
  snapshot.weakestIndicator = worstInd;

  const rr = getAllRegimeRecords();
  let bestRegAcc = 0, worstRegAcc = 100;
  let bestReg = '', worstReg = '';
  for (const [name, record] of Object.entries(rr)) {
    if (record.totalPredictions >= 3) {
      if (record.accuracy > bestRegAcc) { bestRegAcc = record.accuracy; bestReg = name; }
      if (record.accuracy < worstRegAcc) { worstRegAcc = record.accuracy; worstReg = name; }
    }
  }
  snapshot.bestRegime = bestReg;
  snapshot.worstRegime = worstReg;

  const fp = getAllFailurePatterns();
  let mostCommonPattern = '';
  let maxOccurrences = 0;
  for (const [name, record] of Object.entries(fp)) {
    if (record.totalOccurrences > maxOccurrences) {
      maxOccurrences = record.totalOccurrences;
      mostCommonPattern = name;
    }
  }
  snapshot.mostCommonFailurePattern = mostCommonPattern;

  const gap = getConfidenceAccuracyGap();
  snapshot.confidenceAccuracyGap = gap.gap;

  const report = computeCalibrationReport();
  snapshot.calibrationQuality = report.quality;
  snapshot.overallAccuracy = pred.accuracyPercent ?? 0;
  const prevReport = snapshot.lastReportGenerated || Date.now();
  snapshot.lastReportGenerated = Date.now();
  snapshot.daysActive = Math.max(1, Math.ceil((Date.now() - prevReport) / 86400000));

  saveKnowledgeSnapshot(snapshot);
}

export function getAdaptiveConfidence(
  baseConfidence: number,
  regime: string,
  indicatorConfidence: number,
): { confidence: number; adjustments: { name: string; delta: number }[] } {
  const adjustments: { name: string; delta: number }[] = [];
  let adjusted = baseConfidence;

  // Apply calibration
  const calibrated = computeCalibratedConfidence(baseConfidence);
  const calDelta = calibrated.calibratedConfidence - baseConfidence;
  if (Math.abs(calDelta) > 1) {
    adjustments.push({ name: 'Calibration', delta: Math.round(calDelta) });
    adjusted = calibrated.calibratedConfidence;
  }

  // Apply regime adjustment
  const rr = getAllRegimeRecords();
  const regimeRecord = rr[regime];
  if (regimeRecord && regimeRecord.totalPredictions >= 5) {
    const regimeDelta = -(regimeRecord.avgConfidence - regimeRecord.accuracy) * 0.3;
    if (Math.abs(regimeDelta) > 1) {
      adjustments.push({ name: `Regime (${regime})`, delta: Math.round(regimeDelta) });
      adjusted += regimeDelta;
    }
  }

  // Apply indicator weight confidence
  const ws = getCurrentWeights();
  if (indicatorConfidence > 60) {
    const weightBonus = (indicatorConfidence - 60) * 0.1;
    adjustments.push({ name: 'Indicator consensus', delta: Math.round(weightBonus) });
    adjusted += weightBonus;
  } else if (indicatorConfidence < 40) {
    const weightPenalty = (40 - indicatorConfidence) * 0.15;
    adjustments.push({ name: 'Indicator divergence', delta: -Math.round(weightPenalty) });
    adjusted -= weightPenalty;
  }

  return {
    confidence: clampConfidence(Math.round(adjusted)),
    adjustments: adjustments.slice(0, 4),
  };
}
