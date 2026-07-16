-- Replace current_age (INT) with date_of_birth (DATE) in financial_profiles.
-- Age is now always computed at read time, so it auto-updates every year.
-- Run once via the Supabase SQL editor.

ALTER TABLE financial_profiles
  ADD COLUMN IF NOT EXISTS date_of_birth DATE;

-- Estimate DOB for existing rows (uses Jan 1 of birth year as approximation).
UPDATE financial_profiles
SET date_of_birth = (
  DATE_TRUNC('year', CURRENT_DATE) - (current_age * INTERVAL '1 year')
)::DATE
WHERE current_age IS NOT NULL
  AND date_of_birth IS NULL;

-- Drop the old column — age is now derived in application code.
ALTER TABLE financial_profiles
  DROP COLUMN IF EXISTS current_age;
