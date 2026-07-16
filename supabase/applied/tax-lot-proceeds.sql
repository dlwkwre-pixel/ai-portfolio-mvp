-- Per-lot proceeds overrides entered on the tax page.
ALTER TABLE financial_profiles
  ADD COLUMN IF NOT EXISTS lot_proceeds jsonb DEFAULT '{}'::jsonb;
