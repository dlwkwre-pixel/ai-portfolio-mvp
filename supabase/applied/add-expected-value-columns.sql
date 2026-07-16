-- Expected Value Framework: add probability + EV columns to recommendation_items
-- Run once against your Supabase project via the SQL editor.

ALTER TABLE recommendation_items
  ADD COLUMN IF NOT EXISTS probability_bear    NUMERIC(5,2)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS probability_base    NUMERIC(5,2)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS probability_bull    NUMERIC(5,2)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS expected_value      NUMERIC(12,4) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS expected_return_pct NUMERIC(8,4)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS low_conviction_flag BOOLEAN       DEFAULT FALSE;

COMMENT ON COLUMN recommendation_items.probability_bear    IS 'AI-assigned bear scenario probability (0-100), must sum to 100 with base/bull';
COMMENT ON COLUMN recommendation_items.probability_base    IS 'AI-assigned base scenario probability (0-100)';
COMMENT ON COLUMN recommendation_items.probability_bull    IS 'AI-assigned bull scenario probability (0-100)';
COMMENT ON COLUMN recommendation_items.expected_value      IS 'EV = prob_bear*bear_price + prob_base*base_price + prob_bull*bull_price (computed post-normalize)';
COMMENT ON COLUMN recommendation_items.expected_return_pct IS 'Probability-weighted expected return % vs current price (computed post-normalize)';
COMMENT ON COLUMN recommendation_items.low_conviction_flag IS 'True when |base_price - current_price| < 5% of current_price — price anchoring signal';
