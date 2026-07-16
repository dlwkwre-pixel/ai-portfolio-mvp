-- Daily AI market commentary cache
CREATE TABLE IF NOT EXISTS market_pulse (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date text NOT NULL UNIQUE,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE market_pulse ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read market pulse"
  ON market_pulse FOR SELECT USING (true);

CREATE POLICY "Authenticated insert market pulse"
  ON market_pulse FOR INSERT TO authenticated WITH CHECK (true);
