-- Market Regime Snapshots
-- Stores one row per day; upserted by the /api/market/regime route via admin client.
-- Used to display a 30-day regime trend timeline in the MarketRegimeCard.

CREATE TABLE IF NOT EXISTS market_regime_snapshots (
  id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  date           date         NOT NULL UNIQUE,
  level          text         NOT NULL, -- risk-on | constructive | cautious | defensive | risk-off
  score          integer      NOT NULL,
  label          text         NOT NULL,
  dimensions     jsonb        NOT NULL DEFAULT '{}',
  narrative      text,
  data_quality   text,
  calculated_at  timestamptz  NOT NULL DEFAULT now()
);

-- Index for efficient history lookups
CREATE INDEX IF NOT EXISTS idx_market_regime_snapshots_date
  ON market_regime_snapshots (date DESC);

ALTER TABLE market_regime_snapshots ENABLE ROW LEVEL SECURITY;

-- Market data is public — allow all authenticated and anonymous reads
CREATE POLICY "Public read market regime snapshots"
  ON market_regime_snapshots FOR SELECT
  USING (true);

-- Only service role can write (no user-facing writes needed)
-- Inserts/upserts go through createAdminClient() in the API route
