-- Run this in Supabase SQL editor to add all missing financial_profiles columns
ALTER TABLE financial_profiles
  ADD COLUMN IF NOT EXISTS gross_monthly_income NUMERIC,
  ADD COLUMN IF NOT EXISTS filing_status TEXT DEFAULT 'single',
  ADD COLUMN IF NOT EXISTS state_code TEXT,
  ADD COLUMN IF NOT EXISTS income_type TEXT DEFAULT 'w2',
  ADD COLUMN IF NOT EXISTS kids_json JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Migrate existing monthly_income data to gross_monthly_income
UPDATE financial_profiles
SET gross_monthly_income = monthly_income
WHERE monthly_income IS NOT NULL AND gross_monthly_income IS NULL;
