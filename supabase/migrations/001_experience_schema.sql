-- AI Trading Intelligence — Persistent Experience & Validation Schema
-- Run this in Supabase dashboard SQL editor

-- 1. Every prediction ever made
CREATE TABLE IF NOT EXISTS prediction_history (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  name TEXT,
  source TEXT NOT NULL DEFAULT 'AI_QUANT',
  prediction_type TEXT NOT NULL DEFAULT 'DAILY',
  direction TEXT NOT NULL CHECK (direction IN ('BULLISH','BEARISH','NEUTRAL')),
  bullish_prob REAL DEFAULT 0,
  bearish_prob REAL DEFAULT 0,
  confidence REAL NOT NULL,
  trust_score REAL DEFAULT 50,
  uncertainty_score REAL DEFAULT 0,
  entry_price REAL NOT NULL,
  target_price REAL,
  stop_loss REAL,
  expected_volatility REAL DEFAULT 0,
  market_condition TEXT,
  regime TEXT,
  sentiment_score REAL DEFAULT 0,
  macro_event_context TEXT,
  reasoning JSONB DEFAULT '[]',
  ta_snapshot JSONB,
  created_at BIGINT NOT NULL,
  expiry_date BIGINT,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at BIGINT,
  actual_price REAL,
  result TEXT CHECK (result IN ('CORRECT','WRONG','PARTIAL')),
  accuracy_percent REAL,
  deviation_percent REAL,
  time_to_validation BIGINT,
  simulated_pnl REAL,
  failure_analysis JSONB,
  failure_reasons JSONB DEFAULT '[]',
  created_at_iso TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_prediction_ticker ON prediction_history(ticker);
CREATE INDEX IF NOT EXISTS idx_prediction_created ON prediction_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prediction_resolved ON prediction_history(resolved);

-- 2. Experience memory — every resolved prediction becomes a learning record
CREATE TABLE IF NOT EXISTS experience_history (
  id BIGSERIAL PRIMARY KEY,
  prediction_id TEXT REFERENCES prediction_history(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  direction TEXT NOT NULL,
  result TEXT NOT NULL,
  accuracy_percent REAL,
  deviation_percent REAL,
  confidence REAL,
  trust_score REAL,
  regime TEXT,
  day_of_week INTEGER,
  session_label TEXT,
  rsi REAL,
  adx REAL,
  macd_histogram REAL,
  sentiment_score REAL,
  pct_change REAL,
  created_at BIGINT NOT NULL,
  resolved_at BIGINT,
  created_at_iso TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_experience_ticker ON experience_history(ticker);
CREATE INDEX IF NOT EXISTS idx_experience_regime ON experience_history(regime);
CREATE INDEX IF NOT EXISTS idx_experience_result ON experience_history(result);

-- 3. Rolling strategy performance per ticker
CREATE TABLE IF NOT EXISTS strategy_performance (
  id BIGSERIAL PRIMARY KEY,
  ticker TEXT NOT NULL,
  total_predictions INTEGER DEFAULT 0,
  correct INTEGER DEFAULT 0,
  partial INTEGER DEFAULT 0,
  wrong INTEGER DEFAULT 0,
  accuracy REAL DEFAULT 0,
  avg_return REAL DEFAULT 0,
  avg_confidence REAL DEFAULT 0,
  avg_trust_score REAL DEFAULT 50,
  confidence_accuracy_gap REAL DEFAULT 0,
  best_regime TEXT,
  worst_regime TEXT,
  best_session TEXT,
  best_day TEXT,
  recent_accuracy REAL DEFAULT 0,
  trend TEXT DEFAULT 'STABLE',
  sharpe_ratio REAL DEFAULT 0,
  max_drawdown REAL DEFAULT 0,
  profit_factor REAL DEFAULT 0,
  win_rate REAL DEFAULT 0,
  updated_at BIGINT NOT NULL,
  updated_at_iso TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(ticker)
);

-- 4. Regime-specific statistics
CREATE TABLE IF NOT EXISTS regime_statistics (
  id BIGSERIAL PRIMARY KEY,
  regime TEXT NOT NULL,
  total_predictions INTEGER DEFAULT 0,
  correct_predictions INTEGER DEFAULT 0,
  accuracy REAL DEFAULT 0,
  avg_confidence REAL DEFAULT 0,
  avg_deviation REAL DEFAULT 0,
  avg_volatility REAL DEFAULT 0,
  avg_sentiment REAL DEFAULT 0,
  best_indicators JSONB DEFAULT '[]',
  worst_indicators JSONB DEFAULT '[]',
  updated_at BIGINT NOT NULL,
  updated_at_iso TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(regime)
);

-- 5. Confidence calibration buckets
CREATE TABLE IF NOT EXISTS trust_calibration (
  id BIGSERIAL PRIMARY KEY,
  bucket TEXT NOT NULL,
  bucket_start REAL NOT NULL,
  bucket_end REAL NOT NULL,
  total_predictions INTEGER DEFAULT 0,
  correct_predictions INTEGER DEFAULT 0,
  accuracy REAL DEFAULT 0,
  avg_confidence REAL DEFAULT 0,
  gap REAL DEFAULT 0,
  updated_at BIGINT NOT NULL,
  updated_at_iso TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(bucket)
);

-- 6. Indicator performance tracking
CREATE TABLE IF NOT EXISTS indicator_performance (
  id BIGSERIAL PRIMARY KEY,
  indicator_name TEXT NOT NULL,
  total_occurrences INTEGER DEFAULT 0,
  correct_predictions INTEGER DEFAULT 0,
  wrong_predictions INTEGER DEFAULT 0,
  accuracy REAL DEFAULT 0,
  avg_confidence_when_present REAL DEFAULT 0,
  best_regime TEXT,
  worst_regime TEXT,
  regime_accuracy JSONB DEFAULT '{}',
  updated_at BIGINT NOT NULL,
  updated_at_iso TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(indicator_name)
);

-- 7. Failure pattern tracking
CREATE TABLE IF NOT EXISTS failure_patterns (
  id BIGSERIAL PRIMARY KEY,
  pattern_name TEXT NOT NULL,
  total_occurrences INTEGER DEFAULT 0,
  repeat_rate REAL DEFAULT 0,
  avg_confidence_at_failure REAL DEFAULT 0,
  avg_deviation_at_failure REAL DEFAULT 0,
  common_indicators JSONB DEFAULT '[]',
  common_regimes JSONB DEFAULT '[]',
  common_tickers JSONB DEFAULT '[]',
  severity TEXT DEFAULT 'MEDIUM',
  updated_at BIGINT NOT NULL,
  updated_at_iso TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(pattern_name)
);

-- 8. AI indicator weights (evolved over time)
CREATE TABLE IF NOT EXISTS indicator_weights (
  id BIGSERIAL PRIMARY KEY,
  weights JSONB NOT NULL DEFAULT '{}',
  default_weight REAL DEFAULT 1,
  total_samples INTEGER DEFAULT 0,
  updated_at BIGINT NOT NULL,
  updated_at_iso TIMESTAMPTZ DEFAULT NOW()
);

-- 9. AI knowledge snapshots (periodic evolution reports)
CREATE TABLE IF NOT EXISTS ai_knowledge_snapshots (
  id BIGSERIAL PRIMARY KEY,
  total_predictions_analyzed INTEGER DEFAULT 0,
  total_resolved_predictions INTEGER DEFAULT 0,
  overall_accuracy REAL DEFAULT 0,
  avg_confidence REAL DEFAULT 0,
  confidence_accuracy_gap REAL DEFAULT 0,
  calibration_quality TEXT DEFAULT 'POOR',
  strongest_indicator TEXT,
  weakest_indicator TEXT,
  best_regime TEXT,
  worst_regime TEXT,
  most_common_failure_pattern TEXT,
  learning_progress TEXT,
  days_active INTEGER DEFAULT 0,
  snapshot_data JSONB,
  created_at_iso TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Engine lifecycle & health events
CREATE TABLE IF NOT EXISTS engine_health_log (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  event_data JSONB DEFAULT '{}',
  memory_mb REAL,
  uptime_seconds BIGINT,
  created_at_iso TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_health_type ON engine_health_log(event_type);
CREATE INDEX IF NOT EXISTS idx_health_created ON engine_health_log(created_at_iso DESC);

-- Enable Row Level Security
ALTER TABLE prediction_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE experience_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategy_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE regime_statistics ENABLE ROW LEVEL SECURITY;
ALTER TABLE trust_calibration ENABLE ROW LEVEL SECURITY;
ALTER TABLE indicator_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE failure_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE indicator_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_knowledge_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE engine_health_log ENABLE ROW LEVEL SECURITY;

-- Allow public read access (frontend needs to read)
CREATE POLICY "Allow public read prediction_history" ON prediction_history FOR SELECT USING (true);
CREATE POLICY "Allow public read experience_history" ON experience_history FOR SELECT USING (true);
CREATE POLICY "Allow public read strategy_performance" ON strategy_performance FOR SELECT USING (true);
CREATE POLICY "Allow public read regime_statistics" ON regime_statistics FOR SELECT USING (true);
CREATE POLICY "Allow public read trust_calibration" ON trust_calibration FOR SELECT USING (true);
CREATE POLICY "Allow public read indicator_performance" ON indicator_performance FOR SELECT USING (true);
CREATE POLICY "Allow public read failure_patterns" ON failure_patterns FOR SELECT USING (true);
CREATE POLICY "Allow public read indicator_weights" ON indicator_weights FOR SELECT USING (true);
CREATE POLICY "Allow public read ai_knowledge_snapshots" ON ai_knowledge_snapshots FOR SELECT USING (true);
CREATE POLICY "Allow public read engine_health_log" ON engine_health_log FOR SELECT USING (true);

-- Allow public insert (background engine uses service key, but for simplicity)
CREATE POLICY "Allow public insert prediction_history" ON prediction_history FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public insert experience_history" ON experience_history FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public insert strategy_performance" ON strategy_performance FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public insert regime_statistics" ON regime_statistics FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public insert trust_calibration" ON trust_calibration FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public insert indicator_performance" ON indicator_performance FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public insert failure_patterns" ON failure_patterns FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public insert indicator_weights" ON indicator_weights FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public insert ai_knowledge_snapshots" ON ai_knowledge_snapshots FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public insert engine_health_log" ON engine_health_log FOR INSERT WITH CHECK (true);

-- Allow public upsert (for strategy_performance, regime_statistics, etc.)
CREATE POLICY "Allow public upsert strategy_performance" ON strategy_performance FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public upsert regime_statistics" ON regime_statistics FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public upsert trust_calibration" ON trust_calibration FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public upsert indicator_performance" ON indicator_performance FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public upsert failure_patterns" ON failure_patterns FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public upsert indicator_weights" ON indicator_weights FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public upsert ai_knowledge_snapshots" ON ai_knowledge_snapshots FOR UPDATE USING (true) WITH CHECK (true);
