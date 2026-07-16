-- Per-lot cost basis overrides entered on the tax page.
-- Keyed by portfolio_transaction.id, value is the user-supplied cost basis in dollars.
ALTER TABLE financial_profiles
  ADD COLUMN IF NOT EXISTS lot_cost_basis jsonb DEFAULT '{}'::jsonb;
