-- Add target_horizon to recommendation_items
-- Free-text field for the AI's specific timeframe for target_price_1
-- e.g. "6–12 months", "18–24 months", "3+ years"
ALTER TABLE recommendation_items
  ADD COLUMN IF NOT EXISTS target_horizon text;
