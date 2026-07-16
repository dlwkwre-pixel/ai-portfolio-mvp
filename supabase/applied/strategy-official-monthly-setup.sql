-- BuyTune Official strategies + monthly challenge
-- is_official: set manually in Supabase dashboard for BuyTune-curated strategies
-- monthly_return_pct: rolling 30-day return, synced by daily cron

ALTER TABLE strategies
  ADD COLUMN IF NOT EXISTS is_official BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS monthly_return_pct NUMERIC;

CREATE INDEX IF NOT EXISTS strategies_official_idx
  ON strategies (is_official) WHERE is_official = true;

CREATE INDEX IF NOT EXISTS strategies_monthly_return_idx
  ON strategies (monthly_return_pct DESC NULLS LAST)
  WHERE is_public = true AND is_active = true;
