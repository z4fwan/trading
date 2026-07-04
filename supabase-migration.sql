-- Migration: Full schema for Quantum Alpha Terminal cloud persistence
-- SUPERSEDED by supabase/migrations/002_consolidated_tables.sql (CLI-managed)
-- Kept for reference only. Use `supabase db push` to apply all migrations.

-- Table 1: Main predictions table (active + resolved)
CREATE TABLE IF NOT EXISTS predictions (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'NEUTRAL',
  confidence NUMERIC NOT NULL DEFAULT 30,
  entry_price NUMERIC DEFAULT 0,
  target_price NUMERIC DEFAULT 0,
  stop_loss NUMERIC,
  result TEXT,
  resolved BOOLEAN DEFAULT false,
  resolved_at BIGINT,
  created_at BIGINT NOT NULL,
  accuracy_percent NUMERIC,
  deviation_percent NUMERIC,
  failure_analysis JSONB,
  reasoning JSONB DEFAULT '[]',
  user_id UUID DEFAULT auth.uid()
);
CREATE INDEX IF NOT EXISTS idx_predictions_ticker ON predictions(ticker);
CREATE INDEX IF NOT EXISTS idx_predictions_user ON predictions(user_id);

-- Table 2: ML models (trained logistic regression weights)
CREATE TABLE IF NOT EXISTS ml_models (
  ticker TEXT PRIMARY KEY,
  weights JSONB NOT NULL,
  mean JSONB NOT NULL,
  std JSONB NOT NULL,
  platt_a NUMERIC NOT NULL DEFAULT 0,
  platt_b NUMERIC NOT NULL DEFAULT 0,
  forward_days INTEGER NOT NULL DEFAULT 5,
  accuracy NUMERIC DEFAULT 0,
  total_samples INTEGER DEFAULT 0,
  trained_at BIGINT NOT NULL,
  user_id UUID DEFAULT auth.uid()
);
CREATE INDEX IF NOT EXISTS idx_ml_models_user ON ml_models(user_id);

-- Table 3: Stores indicator weight snapshots over time (AI evolution tracking)
CREATE TABLE IF NOT EXISTS ai_evolution_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  weights JSONB NOT NULL,
  default_weight NUMERIC NOT NULL DEFAULT 1.0,
  total_samples INTEGER NOT NULL DEFAULT 0,
  overall_accuracy NUMERIC DEFAULT 0,
  avg_deviation NUMERIC DEFAULT 0,
  regime TEXT DEFAULT '',
  recorded_at BIGINT NOT NULL,
  user_id UUID DEFAULT auth.uid()
);

-- Table 2: Archive for resolved predictions (persistent experience records)
CREATE TABLE IF NOT EXISTS resolved_predictions_archive (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  prediction_id TEXT NOT NULL,
  ticker TEXT NOT NULL,
  direction TEXT NOT NULL,
  result TEXT NOT NULL,
  accuracy_percent NUMERIC,
  deviation_percent NUMERIC,
  confidence NUMERIC NOT NULL,
  regime TEXT DEFAULT '',
  day_of_week INTEGER DEFAULT 0,
  session_label TEXT DEFAULT '',
  rsi NUMERIC DEFAULT 50,
  adx NUMERIC DEFAULT 20,
  macd_histogram NUMERIC DEFAULT 0,
  pct_change NUMERIC DEFAULT 0,
  entry_price NUMERIC DEFAULT 0,
  actual_price NUMERIC DEFAULT 0,
  created_at BIGINT NOT NULL,
  resolved_at BIGINT NOT NULL,
  archived_at BIGINT NOT NULL,
  user_id UUID DEFAULT auth.uid()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_evolution_logs_recorded ON ai_evolution_logs(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_evolution_logs_user ON ai_evolution_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_resolved_archive_ticker ON resolved_predictions_archive(ticker);
CREATE INDEX IF NOT EXISTS idx_resolved_archive_resolved ON resolved_predictions_archive(resolved_at DESC);
CREATE INDEX IF NOT EXISTS idx_resolved_archive_user ON resolved_predictions_archive(user_id);

-- Enable RLS
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_evolution_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE resolved_predictions_archive ENABLE ROW LEVEL SECURITY;

-- Policies: allow individual users to manage their own data
CREATE POLICY "Users can manage their own predictions"
  ON predictions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage their own ml_models"
  ON ml_models FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can insert their own evolution logs"
  ON ai_evolution_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read their own evolution logs"
  ON ai_evolution_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own resolved predictions"
  ON resolved_predictions_archive FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read their own resolved predictions"
  ON resolved_predictions_archive FOR SELECT
  USING (auth.uid() = user_id);

-- Table 5: Automated Paper Trades
CREATE TABLE IF NOT EXISTS paper_trades (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'BUY',
  entry_price NUMERIC NOT NULL,
  target_price NUMERIC,
  stop_loss NUMERIC,
  status TEXT NOT NULL DEFAULT 'OPEN',
  confidence NUMERIC NOT NULL,
  reasoning TEXT,
  created_at BIGINT NOT NULL,
  closed_at BIGINT,
  exit_price NUMERIC,
  pnl_percent NUMERIC,
  user_id UUID DEFAULT auth.uid()
);
CREATE INDEX IF NOT EXISTS idx_paper_trades_ticker ON paper_trades(ticker);
CREATE INDEX IF NOT EXISTS idx_paper_trades_status ON paper_trades(status);

ALTER TABLE paper_trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own paper_trades"
  ON paper_trades FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Migration 003: System Config for API Keys
CREATE TABLE IF NOT EXISTS system_config (
  key_name TEXT PRIMARY KEY,
  key_value TEXT NOT NULL,
  updated_at BIGINT
);

