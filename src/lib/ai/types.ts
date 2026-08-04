export interface AIFullSnapshot {
  rsi: number;
  macdLine: number;
  macdSignal: number;
  macdHistogram: number;
  adx: number;
  bollingerWidth: number;
  bollingerPosition: number;
  atr: number;
  atrRatio: number;
  supertrendDirection: string;
  stochRsi: number;
  ema20: number;
  ema50: number;
  volumeRatio: number;
  priceVsVwap: number;
  distToSupport: number;
  distToResistance: number;
  volatilityState: string;
}

export interface AIMemoryPrediction {
  id: string;
  ticker: string;
  name: string;
  source: 'AI_QUANT' | 'AI_QUANT_V4' | 'WEEKLY_PREDICTIONS';
  createdAt: number;
  predictionType: 'HOURLY' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'CUSTOM';
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  bullishProb: number;
  bearishProb: number;
  confidence: number;
  entryPrice: number;
  targetPrice: number;
  stopLoss?: number;
  expectedVolatility: number;
  marketCondition: string;
  regime: string;
  fullSnapshot: AIFullSnapshot | null;
  sentimentScore: number;
  reasoning: string[];
  dailyDirection?: string;
  dailyConfidence?: number;
  weeklyDirection?: string;
  weeklyConfidence?: number;
  signalQuality?: string;
  targetDate: string;
  expiryDate: string;
  resolved: boolean;
  resolvedAt?: number;
  actualPrice?: number;
  result?: 'CORRECT' | 'WRONG' | 'PARTIAL';
  accuracyPercent?: number;
  deviationPercent?: number;
  failureAnalysis?: FailureAnalysisReport;
  selfAnalysis?: SelfAnalysisReport;
  strongestIndicators: string[];
  conflictingIndicators: string[];
}

export interface FailureAnalysisReport {
  primaryReason: string;
  secondaryReasons: string[];
  volatilitySpike: boolean;
  newsEvent: boolean;
  regimeChange: boolean;
  momentumFailure: boolean;
  resistanceRejection: boolean;
  earningsImpact: boolean;
  institutionalSelling: boolean;
  lowLiquidity: boolean;
  sentimentReversal: boolean;
  fakeBreakout: boolean;
  weakTrend: boolean;
  detail: string;
}

export interface SelfAnalysisReport {
  confidenceWasJustified: boolean;
  indicatorsHelped: string[];
  indicatorsFailed: string[];
  volatilityUnderestimated: boolean;
  sentimentReversed: boolean;
  regimeWasUnstable: boolean;
  confidenceTooAggressive: boolean;
  newsInvalidatedSetup: boolean;
  trendStrengthWasWeak: boolean;
  overallAssessment: string;
  lessonLearned: string;
}

export interface IndicatorPerformanceRecord {
  indicatorName: string;
  totalOccurrences: number;
  correctPredictions: number;
  wrongPredictions: number;
  accuracy: number;
  avgConfidenceWhenPresent: number;
  bestRegime: string;
  worstRegime: string;
  regimeAccuracy: Record<string, { total: number; correct: number; accuracy: number }>;
  lastUpdated: number;
}

export interface ConfidenceCalibrationRecord {
  bucket: string;
  bucketStart: number;
  bucketEnd: number;
  totalPredictions: number;
  correctPredictions: number;
  accuracy: number;
  avgConfidence: number;
  gap: number;
  lastUpdated: number;
}

export interface MarketRegimeRecord {
  regime: string;
  totalPredictions: number;
  correctPredictions: number;
  accuracy: number;
  avgConfidence: number;
  avgDeviation: number;
  bestIndicators: string[];
  worstIndicators: string[];
  volatilityAvg: number;
  sentimentAvg: number;
  lastUpdated: number;
}

export interface SentimentImpactRecord {
  eventType: string;
  totalEvents: number;
  predictionQualityBefore: number;
  predictionQualityAfter: number;
  volatilityImpact: number;
  directionalShift: number;
  lastUpdated: number;
}

export interface FailurePatternRecord {
  patternName: string;
  totalOccurrences: number;
  repeatRate: number;
  avgConfidenceAtFailure: number;
  avgDeviationAtFailure: number;
  commonIndicators: string[];
  commonRegimes: string[];
  commonSectors: string[];
  lastUpdated: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface IndicatorWeightSet {
  weights: Record<string, number>;
  defaultWeight: number;
  lastUpdated: number;
  totalSamples: number;
}

export interface AIKnowledgeSnapshot {
  totalPredictionsAnalyzed: number;
  totalResolvedPredictions: number;
  overallAccuracy: number;
  avgConfidence: number;
  confidenceAccuracyGap: number;
  calibrationQuality: string;
  strongestIndicator: string;
  weakestIndicator: string;
  bestRegime: string;
  worstRegime: string;
  mostReliableSector: string;
  leastReliableSector: string;
  mostCommonFailurePattern: string;
  learningProgress: string;
  daysActive: number;
  lastReportGenerated: number;
}

export interface AIEvolutionReport {
  generatedAt: number;
  snapshot: AIKnowledgeSnapshot;
  accuracyTrend: { period: string; accuracy: number; samples: number }[];
  confidenceTrend: { period: string; avgConfidence: number; accuracy: number; gap: number }[];
  indicatorRanking: { name: string; accuracy: number; usageCount: number }[];
  regimeAccuracy: { regime: string; accuracy: number; samples: number }[];
  sectorAccuracy: { sector: string; accuracy: number; samples: number }[];
  failurePatterns: { pattern: string; occurrences: number; severity: string }[];
  topLessons: string[];
  recommendations: string[];
}

export interface AIExplanation {
  ticker: string;
  direction: string;
  confidence: number;
  strongestBullishFactors: string[];
  strongestBearishFactors: string[];
  confidenceReasoning: string;
  marketRegimeReasoning: string;
  volatilityReasoning: string;
  sentimentReasoning: string;
  indicatorContribution: { name: string; contribution: number; signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' }[];
  overallNarrative: string;
}
