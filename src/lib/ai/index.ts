import type { AIMemoryPrediction, AIFullSnapshot, AIExplanation, SelfAnalysisReport } from './types';
import type { StoredPrediction } from '@/lib/predictionStore';
import { learnFromResult, getAdaptiveConfidence, type LearningResult } from './adaptiveLearning';
import { generateSelfAnalysis, generateFailureAnalysisReport } from './selfAnalysis';
import { generateExplanation } from './explanationEngine';
import { classifyMarketRegime, type MarketRegimeClass, type RegimeClassification } from './marketRegime';
import { generateEvolutionReport } from './evolutionReports';
import { computeCalibratedConfidence, computeCalibrationReport } from './confidenceCalibration';
import { getCurrentWeights, getKnowledgeSnapshot, getAllIndicatorPerformance, getAllFailurePatterns } from './knowledgeBase';
import type { AIEvolutionReport, AIKnowledgeSnapshot, IndicatorWeightSet, IndicatorPerformanceRecord, FailurePatternRecord } from './types';

export type {
  AIMemoryPrediction, AIFullSnapshot, AIExplanation, SelfAnalysisReport,
  LearningResult, AIEvolutionReport, AIKnowledgeSnapshot,
  IndicatorWeightSet, IndicatorPerformanceRecord, FailurePatternRecord,
  MarketRegimeClass, RegimeClassification,
};

export function enhancePredictionMemory(
  pred: StoredPrediction,
  fullSnapshot?: AIFullSnapshot | null,
): AIMemoryPrediction {
  return {
    id: pred.id,
    ticker: pred.ticker,
    name: pred.name,
    source: pred.source,
    createdAt: pred.createdAt,
    predictionType: pred.predictionType,
    direction: pred.direction,
    bullishProb: pred.bullishProb,
    bearishProb: pred.bearishProb,
    confidence: pred.confidence,
    entryPrice: pred.entryPrice,
    targetPrice: pred.targetPrice,
    stopLoss: pred.stopLoss,
    expectedVolatility: pred.expectedVolatility,
    marketCondition: pred.marketCondition,
    regime: pred.regime,
    fullSnapshot: fullSnapshot || null,
    sentimentScore: pred.sentimentScore,
    reasoning: pred.reasoning,
    dailyDirection: pred.dailyDirection,
    dailyConfidence: pred.dailyConfidence,
    weeklyDirection: pred.weeklyDirection,
    weeklyConfidence: pred.weeklyConfidence,
    signalQuality: pred.signalQuality,
    targetDate: pred.targetDate,
    expiryDate: pred.expiryDate,
    resolved: pred.resolved,
    resolvedAt: pred.resolvedAt,
    actualPrice: pred.actualPrice,
    result: pred.result,
    accuracyPercent: pred.accuracyPercent,
    deviationPercent: pred.deviationPercent,
    failureAnalysis: pred.failureAnalysis ? {
      primaryReason: pred.failureAnalysis.primaryReason,
      secondaryReasons: pred.failureAnalysis.secondaryReasons,
      volatilitySpike: pred.failureAnalysis.volatilitySpike,
      newsEvent: pred.failureAnalysis.newsEvent,
      regimeChange: pred.failureAnalysis.regimeChange,
      momentumFailure: pred.failureAnalysis.momentumFailure,
      resistanceRejection: pred.failureAnalysis.resistanceRejection,
      earningsImpact: pred.failureAnalysis.earningsImpact,
      institutionalSelling: pred.failureAnalysis.institutionalSelling,
      lowLiquidity: pred.failureAnalysis.lowLiquidity,
      sentimentReversal: pred.failureAnalysis.sentimentReversal ?? false,
      fakeBreakout: pred.failureAnalysis.fakeBreakout ?? false,
      weakTrend: pred.failureAnalysis.weakTrend ?? false,
      detail: pred.failureAnalysis.detail,
    } : undefined,
    selfAnalysis: pred.selfAnalysis as SelfAnalysisReport | undefined,
    strongestIndicators: pred.strongestIndicators || [],
    conflictingIndicators: pred.conflictingIndicators || [],
  };
}

export function buildAISnapshot(
  rsi: number, macdLine: number, macdSignal: number, macdHistogram: number,
  adx: number, bollingerWidth: number, bollingerPosition: number,
  atr: number, atrRatio: number, supertrendDir: string,
  stochRsi: number, ema20: number, ema50: number,
  volumeRatio: number, priceVsVwap: number,
  distToSupport: number, distToResistance: number,
  volatilityState: string,
): AIFullSnapshot {
  return {
    rsi, macdLine, macdSignal, macdHistogram, adx, bollingerWidth,
    bollingerPosition, atr, atrRatio, supertrendDirection: supertrendDir,
    stochRsi, ema20, ema50, volumeRatio, priceVsVwap,
    distToSupport, distToResistance, volatilityState,
  };
}

export function analyzeAndLearn(
  pred: AIMemoryPrediction,
  actualPrice: number,
  currentRegime?: string,
  currentSentiment?: number,
): { selfAnalysis: SelfAnalysisReport; learningResult: LearningResult } {
  const selfAnalysis = generateSelfAnalysis(pred, actualPrice, currentRegime, currentSentiment);
  const failureAnalysis = generateFailureAnalysisReport(pred, actualPrice);
  const learningResult = learnFromResult(pred, selfAnalysis, pred.result !== 'CORRECT' ? failureAnalysis : undefined);
  return { selfAnalysis, learningResult };
}

export {
  learnFromResult,
  getAdaptiveConfidence,
  generateSelfAnalysis,
  generateFailureAnalysisReport,
  generateExplanation,
  classifyMarketRegime,
  generateEvolutionReport,
  computeCalibratedConfidence,
  computeCalibrationReport,
  getCurrentWeights,
  getKnowledgeSnapshot,
  getAllIndicatorPerformance,
  getAllFailurePatterns,
};
