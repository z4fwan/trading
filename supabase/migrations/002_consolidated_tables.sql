-- Migration 002: Consolidated tables from supabase-migration.sql
-- Brings in tables required by the codebase that were missing from 001.

-- 1. Predictions (active/unresolved) — extended schema matching code inserts
CREATE TABLE IF NOT EXISTS predictions (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  name TEXT,
  source TEXT DEFAULT 'AI_QUANT',
  prediction_type TEXT DEFAULT 'DAILY',
  direction TEXT NOT NULL DEFAULT 'NEUTRAL',
  bullish_prob REAL DEFAULT 0,
  bearish_prob REAL DEFAULT 0,
  confidence REAL NOT NULL DEFAULT 30,
  entry_price REAL DEFAULT 0,
  target_price REAL,
  stop_loss REAL,
  result TEXT,
  resolved BOOLEAN DEFAULT false,
  resolved_at BIGINT,
  created_at BIGINT NOT NULL,
  accuracy_percent REAL,
  deviation_percent REAL,
  failure_analysis JSONB,
  reasoning JSONB DEFAULT '[]',
  regime TEXT DEFAULT 'UNKNOWN',
  user_id UUID DEFAULT auth.uid()
);
CREATE INDEX IF NOT EXISTS idx_predictions_ticker ON predictions(ticker);
CREATE INDEX IF NOT EXISTS idx_predictions_user ON predictions(user_id);
CREATE INDEX IF NOT EXISTS idx_predictions_resolved ON predictions(resolved);

-- 2. ML model weights (per-ticker logistic regression)
CREATE TABLE IF NOT EXISTS ml_models (
  ticker TEXT PRIMARY KEY,
  weights JSONB NOT NULL,
  mean JSONB NOT NULL,
  std JSONB NOT NULL,
  platt_a REAL NOT NULL DEFAULT 0,
  platt_b REAL NOT NULL DEFAULT 0,
  forward_days INTEGER NOT NULL DEFAULT 5,
  accuracy REAL DEFAULT 0,
  total_samples INTEGER DEFAULT 0,
  trained_at BIGINT NOT NULL,
  user_id UUID DEFAULT auth.uid()
);
CREATE INDEX IF NOT EXISTS idx_ml_models_user ON ml_models(user_id);

-- 3. AI evolution logs (weight snapshots over time)
CREATE TABLE IF NOT EXISTS ai_evolution_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  weights JSONB NOT NULL,
  default_weight REAL NOT NULL DEFAULT 1.0,
  total_samples INTEGER NOT NULL DEFAULT 0,
  overall_accuracy REAL DEFAULT 0,
  avg_deviation REAL DEFAULT 0,
  regime TEXT DEFAULT '',
  recorded_at BIGINT NOT NULL,
  user_id UUID DEFAULT auth.uid()
);
CREATE INDEX IF NOT EXISTS idx_evolution_logs_recorded ON ai_evolution_logs(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_evolution_logs_user ON ai_evolution_logs(user_id);

-- 4. Resolved predictions archive (experience records)
CREATE TABLE IF NOT EXISTS resolved_predictions_archive (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  prediction_id TEXT NOT NULL,
  ticker TEXT NOT NULL,
  direction TEXT NOT NULL,
  result TEXT NOT NULL,
  accuracy_percent REAL,
  deviation_percent REAL,
  confidence REAL NOT NULL,
  regime TEXT DEFAULT '',
  day_of_week INTEGER DEFAULT 0,
  session_label TEXT DEFAULT '',
  rsi REAL DEFAULT 50,
  adx REAL DEFAULT 20,
  macd_histogram REAL DEFAULT 0,
  pct_change REAL DEFAULT 0,
  entry_price REAL DEFAULT 0,
  actual_price REAL DEFAULT 0,
  created_at BIGINT NOT NULL,
  resolved_at BIGINT NOT NULL,
  archived_at BIGINT NOT NULL,
  user_id UUID DEFAULT auth.uid()
);
CREATE INDEX IF NOT EXISTS idx_resolved_archive_ticker ON resolved_predictions_archive(ticker);
CREATE INDEX IF NOT EXISTS idx_resolved_archive_resolved ON resolved_predictions_archive(resolved_at DESC);
CREATE INDEX IF NOT EXISTS idx_resolved_archive_user ON resolved_predictions_archive(user_id);

-- Enable RLS
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_evolution_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE resolved_predictions_archive ENABLE ROW LEVEL SECURITY;

-- Public read policies (frontend hydration, sync API)
CREATE POLICY "Allow public read predictions" ON predictions FOR SELECT USING (true);
CREATE POLICY "Allow public read ml_models" ON ml_models FOR SELECT USING (true);
CREATE POLICY "Allow public read ai_evolution_logs" ON ai_evolution_logs FOR SELECT USING (true);
CREATE POLICY "Allow public read resolved_predictions_archive" ON resolved_predictions_archive FOR SELECT USING (true);

-- Public insert/upsert (background engine, sync API)
CREATE POLICY "Allow public insert predictions" ON predictions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public insert ml_models" ON ml_models FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public insert ai_evolution_logs" ON ai_evolution_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public insert resolved_predictions_archive" ON resolved_predictions_archive FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update predictions" ON predictions FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public update ml_models" ON ml_models FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public upsert ai_evolution_logs" ON ai_evolution_logs FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public upsert resolved_predictions_archive" ON resolved_predictions_archive FOR UPDATE USING (true) WITH CHECK (true);
