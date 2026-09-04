CREATE TABLE IF NOT EXISTS long_term_study (
  date TEXT NOT NULL,            -- YYYY-MM-DD IST date
  ticker TEXT NOT NULL,          -- NSE ticker symbol
  study_data JSONB NOT NULL,     -- daily observation + fundamental data
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (date, ticker)
);

CREATE INDEX IF NOT EXISTS idx_long_term_study_ticker ON long_term_study(ticker);
CREATE INDEX IF NOT EXISTS idx_long_term_study_date ON long_term_study(date DESC);
