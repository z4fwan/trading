import { getResolvedPredictions, getAllPredictions } from './predictionStore';
import {
  enhancePredictionMemory, analyzeAndLearn, generateEvolutionReport,
  getKnowledgeSnapshot, getCurrentWeights, getAllIndicatorPerformance,
  getAllFailurePatterns, computeCalibrationReport,
  type AIEvolutionReport, type AIKnowledgeSnapshot,
  type IndicatorWeightSet, type IndicatorPerformanceRecord, type FailurePatternRecord,
} from './ai';

// Track which prediction IDs have been analyzed (prevents re-analysis)
// Capped at 1000 entries to prevent memory leak
const analyzedIds = new Set<string>();
const MAX_ANALYZED_IDS = 1000;

export function runAILearningOnResolved(): {
  analyzed: number;
  skipped: number;
  report: AIEvolutionReport | null;
} {
  const predictions = getResolvedPredictions();
  let analyzed = 0;
  let skipped = 0;

  for (const pred of predictions) {
    if (analyzedIds.has(pred.id)) {
      skipped++;
      continue;
    }

    const aiPred = enhancePredictionMemory(pred, pred.fullSnapshot);
    if (aiPred.actualPrice && aiPred.actualPrice > 0) {
      const { selfAnalysis, learningResult } = analyzeAndLearn(
        aiPred, aiPred.actualPrice, aiPred.regime, aiPred.sentimentScore,
      );

      // Mark as analyzed; evict oldest when cap reached
      if (analyzedIds.size >= MAX_ANALYZED_IDS) {
        const first = analyzedIds.values().next().value;
        if (first !== undefined) analyzedIds.delete(first);
      }
      analyzedIds.add(pred.id);
      analyzed++;
    }
  }

  const report = getResolvedPredictions().length >= 5 ? generateEvolutionReport() : null;

  return { analyzed, skipped, report };
}

export function getAILearningSnapshot(): AIKnowledgeSnapshot {
  return getKnowledgeSnapshot();
}

export function getAIIndicatorWeights(): IndicatorWeightSet {
  return getCurrentWeights();
}

export function getAIIndicatorPerformance(): Record<string, IndicatorPerformanceRecord> {
  return getAllIndicatorPerformance();
}

export function getAIFailurePatterns(): Record<string, FailurePatternRecord> {
  return getAllFailurePatterns();
}

export function getAICalibrationReport(): ReturnType<typeof computeCalibrationReport> {
  return computeCalibrationReport();
}

export function getAILearningReport(): AIEvolutionReport | null {
  if (getResolvedPredictions().length < 5) return null;
  return generateEvolutionReport();
}

export function getSeenTickers(): string[] {
  const preds = getAllPredictions();
  const tickers = new Set(preds.map(p => p.ticker));
  return Array.from(tickers);
}

export function getTotalAIAnalyzed(): number {
  return analyzedIds.size;
}

export function clearAnalysisCache(): void {
  analyzedIds.clear();
}
