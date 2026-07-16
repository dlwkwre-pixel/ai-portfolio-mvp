-- Strategy verified returns
-- Stores denormalized return_pct from the linked public portfolio
-- Updated daily by the cron job alongside public_portfolio_performance

ALTER TABLE strategies
  ADD COLUMN IF NOT EXISTS return_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS return_since DATE;

-- Index for sorting by return in community page
CREATE INDEX IF NOT EXISTS strategies_return_pct_idx
  ON strategies (return_pct DESC NULLS LAST)
  WHERE is_public = true AND is_active = true;
