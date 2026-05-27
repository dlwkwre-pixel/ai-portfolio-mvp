-- Recommendation Framework V2: probabilistic targets + catalyst tracking
ALTER TABLE recommendation_items
  ADD COLUMN IF NOT EXISTS bear_price    numeric,
  ADD COLUMN IF NOT EXISTS bull_price    numeric,
  ADD COLUMN IF NOT EXISTS base_return_pct  numeric,
  ADD COLUMN IF NOT EXISTS bear_return_pct  numeric,
  ADD COLUMN IF NOT EXISTS bull_return_pct  numeric,
  ADD COLUMN IF NOT EXISTS catalysts         text[],
  ADD COLUMN IF NOT EXISTS target_change_reason text;
