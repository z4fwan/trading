CREATE TABLE IF NOT EXISTS guest_codes (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS guest_sessions (
  code TEXT PRIMARY KEY REFERENCES guest_codes(code) ON DELETE CASCADE,
  label TEXT NOT NULL,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_seconds BIGINT NOT NULL DEFAULT 0,
  online BOOLEAN NOT NULL DEFAULT FALSE
);

ALTER TABLE guest_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access to guest_codes" ON guest_codes
  FOR ALL USING (auth.role() = 'authenticated' OR auth.role() = 'anon');

CREATE POLICY "Admin full access to guest_sessions" ON guest_sessions
  FOR ALL USING (auth.role() = 'authenticated' OR auth.role() = 'anon');
