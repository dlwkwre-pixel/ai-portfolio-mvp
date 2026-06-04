-- Tax-aware income fields for financial_profiles
-- Renames monthly_income -> gross_monthly_income and adds tax profile fields
-- Run once in Supabase SQL editor

ALTER TABLE financial_profiles
  ADD COLUMN IF NOT EXISTS gross_monthly_income NUMERIC,
  ADD COLUMN IF NOT EXISTS filing_status TEXT DEFAULT 'single',
  ADD COLUMN IF NOT EXISTS state_code TEXT,
  ADD COLUMN IF NOT EXISTS income_type TEXT DEFAULT 'w2';

-- Migrate existing monthly_income data to gross_monthly_income
UPDATE financial_profiles
SET gross_monthly_income = monthly_income
WHERE monthly_income IS NOT NULL AND gross_monthly_income IS NULL;

-- monthly_income is kept for backward compat; new code reads gross_monthly_income only
