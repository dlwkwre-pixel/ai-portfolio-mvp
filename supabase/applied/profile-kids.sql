-- Add kids_json to financial_profiles for cross-planner dependant linking
ALTER TABLE financial_profiles
  ADD COLUMN IF NOT EXISTS kids_json JSONB NOT NULL DEFAULT '[]'::jsonb;
