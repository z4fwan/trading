export interface Database {
  public: {
    Tables: {
      predictions: { Row: PredictionRow; Insert: PredictionInsert; Update: Partial<PredictionInsert> };
      prediction_results: { Row: PredictionResultRow; Insert: PredictionResultInsert; Update: Partial<PredictionResultInsert> };
      indicator_snapshots: { Row: IndicatorSnapshotRow; Insert: IndicatorSnapshotInsert; Update: Partial<IndicatorSnapshotInsert> };
      market_regimes: { Row: MarketRegimeRow; Insert: MarketRegimeInsert; Update: Partial<MarketRegimeInsert> };
      ai_decision_logs: { Row: AIDecisionLogRow; Insert: AIDecisionLogInsert; Update: Partial<AIDecisionLogInsert> };
      indicator_performance: { Row: IndicatorPerformanceRow; Insert: IndicatorPerformanceInsert; Update: Partial<IndicatorPerformanceInsert> };
      confidence_history: { Row: ConfidenceHistoryRow; Insert: ConfidenceHistoryInsert; Update: Partial<ConfidenceHistoryInsert> };
      ai_learning_reports: { Row: AILearningReportRow; Insert: AILearningReportInsert; Update: Partial<AILearningReportInsert> };
      trust_metrics: { Row: TrustMetricRow; Insert: TrustMetricInsert; Update: Partial<TrustMetricInsert> };
      volatility_events: { Row: VolatilityEventRow; Insert: VolatilityEventInsert; Update: Partial<VolatilityEventInsert> };
      sector_performance: { Row: SectorPerformanceRow; Insert: SectorPerformanceInsert; Update: Partial<SectorPerformanceInsert> };
      ai_weight_history: { Row: AIWeightHistoryRow; Insert: AIWeightHistoryInsert; Update: Partial<AIWeightHistoryInsert> };
      ai_failure_patterns: { Row: AIFailurePatternRow; Insert: AIFailurePatternInsert; Update: Partial<AIFailurePatternInsert> };
      ai_knowledge: { Row: AIKnowledgeRow; Insert: AIKnowledgeInsert; Update: Partial<AIKnowledgeInsert> };
      ai_evolution_reports: { Row: AIEvolutionReportRow; Insert: AIEvolutionReportInsert; Update: Partial<AIEvolutionReportInsert> };
      ai_evolution_logs: { Row: AIEvolutionLogRow; Insert: AIEvolutionLogInsert; Update: Partial<AIEvolutionLogInsert> };
      resolved_predictions_archive: { Row: ResolvedPredictionArchiveRow; Insert: ResolvedPredictionArchiveInsert; Update: Partial<ResolvedPredictionArchiveInsert> };
    };
  };
}

export interface PredictionRow {
  id: string; ticker: string; name: string; source: string;
  created_at: number; prediction_type: string; direction: string;
  bullish_prob: number; bearish_prob: number; confidence: number;
  entry_price: number; target_price: number; stop_loss: number | null;
  expected_volatility: number; market_condition: string; regime: string;
  sentiment_score: number; reasoning: string[];
  daily_direction: string | null; daily_confidence: number | null;
  weekly_direction: string | null; weekly_confidence: number | null;
  signal_quality: string | null;
  target_date: string; expiry_date: string;
  resolved: boolean; resolved_at: number | null;
  actual_price: number | null; result: string | null;
  accuracy_percent: number | null; deviation_percent: number | null;
  failure_analysis: unknown | null;
  self_analysis: unknown | null;
  strongest_indicators: string[];
  conflicting_indicators: string[];
  user_id: string;
}
export type PredictionInsert = Omit<PredictionRow, 'user_id'> & { user_id?: string };

export interface PredictionResultRow {
  id: string; prediction_id: string; ticker: string;
  expected_direction: string; actual_direction: string;
  expected_price: number; actual_price: number;
  confidence: number; accuracy_percent: number;
  deviation_percent: number; result: string;
  volatility_adjusted_score: number;
  created_at: number; user_id: string;
}
export type PredictionResultInsert = Omit<PredictionResultRow, 'user_id'> & { user_id?: string };

export interface IndicatorSnapshotRow {
  id: string; prediction_id: string; ticker: string;
  rsi: number; macd_line: number; macd_signal: number; macd_histogram: number;
  adx: number; bollinger_width: number; bollinger_position: number;
  atr: number; atr_ratio: number; supertrend_direction: string;
  stoch_rsi: number; ema20: number; ema50: number;
  volume_ratio: number; price_vs_vwap: number;
  dist_to_support: number; dist_to_resistance: number;
  volatility_state: string;
  created_at: number; user_id: string;
}
export type IndicatorSnapshotInsert = Omit<IndicatorSnapshotRow, 'user_id'> & { user_id?: string };

export interface MarketRegimeRow {
  id: string; ticker: string; regime: string;
  confidence: number; indicators: unknown;
  description: string; snapshot: unknown;
  created_at: number; user_id: string;
}
export type MarketRegimeInsert = Omit<MarketRegimeRow, 'user_id'> & { user_id?: string };

export interface AIDecisionLogRow {
  id: string; ticker: string; decision_type: string;
  input_data: unknown; output_data: unknown;
  confidence: number; was_correct: boolean | null;
  latency_ms: number;
  created_at: number; user_id: string;
}
export type AIDecisionLogInsert = Omit<AIDecisionLogRow, 'user_id'> & { user_id?: string };

export interface IndicatorPerformanceRow {
  id: string; indicator_name: string;
  total_occurrences: number; correct_predictions: number;
  wrong_predictions: number; accuracy: number;
  avg_confidence_when_present: number;
  best_regime: string; worst_regime: string;
  regime_accuracy: unknown;
  last_updated: number; user_id: string;
}
export type IndicatorPerformanceInsert = Omit<IndicatorPerformanceRow, 'user_id'> & { user_id?: string };

export interface ConfidenceHistoryRow {
  id: string; bucket_label: string;
  bucket_start: number; bucket_end: number;
  total_predictions: number; correct_predictions: number;
  accuracy: number; avg_confidence: number; gap: number;
  last_updated: number; user_id: string;
}
export type ConfidenceHistoryInsert = Omit<ConfidenceHistoryRow, 'user_id'> & { user_id?: string };

export interface AILearningReportRow {
  id: string; report_type: string;
  snapshot: unknown; accuracy_trend: unknown;
  confidence_trend: unknown; indicator_ranking: unknown;
  regime_accuracy: unknown; sector_accuracy: unknown;
  failure_patterns: unknown; top_lessons: string[];
  recommendations: string[];
  generated_at: number; user_id: string;
}
export type AILearningReportInsert = Omit<AILearningReportRow, 'user_id'> & { user_id?: string };

export interface TrustMetricRow {
  id: string; total_predictions: number;
  successful_predictions: number; failed_predictions: number;
  partial_predictions: number; pending_resolutions: number;
  daily_accuracy: number; weekly_accuracy: number; monthly_accuracy: number;
  confidence_reliability: number; sector_accuracy: unknown;
  avg_accuracy: number; avg_deviation: number; trust_score: number;
  avg_confidence: number; confidence_accuracy_gap: number;
  best_sectors: string[]; weakest_sectors: string[];
  trend: string; avg_pnl: number;
  computed_at: number; user_id: string;
}
export type TrustMetricInsert = Omit<TrustMetricRow, 'user_id'> & { user_id?: string };

export interface VolatilityEventRow {
  id: string; ticker: string; event_type: string;
  severity: string; atr_spike: number;
  price_change_pct: number; volume_spike: number;
  snapshot: unknown; created_at: number; user_id: string;
}
export type VolatilityEventInsert = Omit<VolatilityEventRow, 'user_id'> & { user_id?: string };

export interface SectorPerformanceRow {
  id: string; sector: string; ticker: string;
  total_predictions: number; correct_predictions: number;
  accuracy: number; avg_confidence: number; avg_deviation: number;
  last_updated: number; user_id: string;
}
export type SectorPerformanceInsert = Omit<SectorPerformanceRow, 'user_id'> & { user_id?: string };

export interface AIWeightHistoryRow {
  id: string; indicator_name: string;
  weight: number; default_weight: number;
  total_samples: number; reason: string;
  recorded_at: number; user_id: string;
}
export type AIWeightHistoryInsert = Omit<AIWeightHistoryRow, 'user_id'> & { user_id?: string };

export interface AIFailurePatternRow {
  id: string; pattern_name: string;
  total_occurrences: number; repeat_rate: number;
  avg_confidence_at_failure: number; avg_deviation_at_failure: number;
  common_indicators: string[]; common_regimes: string[];
  common_sectors: string[]; severity: string;
  last_updated: number; user_id: string;
}
export type AIFailurePatternInsert = Omit<AIFailurePatternRow, 'user_id'> & { user_id?: string };

export interface AIKnowledgeRow {
  id: string; total_predictions_analyzed: number;
  total_resolved_predictions: number; overall_accuracy: number;
  avg_confidence: number; confidence_accuracy_gap: number;
  calibration_quality: string; strongest_indicator: string;
  weakest_indicator: string; best_regime: string; worst_regime: string;
  most_reliable_sector: string; least_reliable_sector: string;
  most_common_failure_pattern: string;
  learning_progress: string; days_active: number;
  last_report_generated: number;
  last_updated: number; user_id: string;
}
export type AIKnowledgeInsert = Omit<AIKnowledgeRow, 'user_id'> & { user_id?: string };

export interface AIEvolutionReportRow {
  id: string; generated_at: number;
  snapshot: unknown; accuracy_trend: unknown;
  confidence_trend: unknown; indicator_ranking: unknown;
  regime_accuracy: unknown; sector_accuracy: unknown;
  failure_patterns: unknown; top_lessons: string[];
  recommendations: string[];
  user_id: string;
}
export type AIEvolutionReportInsert = Omit<AIEvolutionReportRow, 'user_id'> & { user_id?: string };

export interface AIEvolutionLogRow {
  id: string;
  weights: unknown;
  default_weight: number;
  total_samples: number;
  overall_accuracy: number;
  avg_deviation: number;
  regime: string;
  recorded_at: number;
  user_id: string;
}
export type AIEvolutionLogInsert = Omit<AIEvolutionLogRow, 'user_id'> & { user_id?: string };

export interface ResolvedPredictionArchiveRow {
  id: string;
  prediction_id: string;
  ticker: string;
  direction: string;
  result: string;
  accuracy_percent: number | null;
  deviation_percent: number | null;
  confidence: number;
  regime: string;
  day_of_week: number;
  session_label: string;
  rsi: number;
  adx: number;
  macd_histogram: number;
  pct_change: number;
  entry_price: number;
  actual_price: number;
  created_at: number;
  resolved_at: number;
  archived_at: number;
  user_id: string;
}
export type ResolvedPredictionArchiveInsert = Omit<ResolvedPredictionArchiveRow, 'user_id'> & { user_id?: string };
