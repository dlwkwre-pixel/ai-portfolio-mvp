-- 401(k) / workplace retirement plan fields for financial_profiles.
-- Run once in the Supabase SQL editor.
--
-- Models the three things every 401(k) participant needs to reason about:
--   1. How much THEY put in           -> k401_contribution_pct (% of gross pay)
--   2. Pre-tax (Traditional) vs Roth   -> k401_is_roth
--   3. What the EMPLOYER adds (match)  -> k401_employer_match_pct (the match rate, e.g. 100
--                                         means $1 per $1) up to k401_employer_match_limit_pct
--                                         of salary (e.g. 3 = matched on the first 3% you defer)
--
-- The Traditional employee contribution is fed into the existing pre-tax-deduction pipeline
-- (estimator.ts), so it automatically lowers taxable income / take-home everywhere. FICA is
-- still owed on the full wage — pre-tax 401(k) does not reduce payroll tax.

ALTER TABLE financial_profiles
  ADD COLUMN IF NOT EXISTS has_401k                      BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS k401_contribution_pct         NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS k401_is_roth                  BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS k401_employer_match_pct       NUMERIC DEFAULT 100,
  ADD COLUMN IF NOT EXISTS k401_employer_match_limit_pct NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS k401_current_balance          NUMERIC;

COMMENT ON COLUMN financial_profiles.has_401k IS 'Whether the user participates in a workplace 401(k)/403(b)/TSP.';
COMMENT ON COLUMN financial_profiles.k401_contribution_pct IS 'Employee elective deferral as a percent of gross pay.';
COMMENT ON COLUMN financial_profiles.k401_is_roth IS 'true = Roth (after-tax) 401(k); false = Traditional (pre-tax).';
COMMENT ON COLUMN financial_profiles.k401_employer_match_pct IS 'Employer match rate (100 = dollar-for-dollar, 50 = 50 cents per dollar).';
COMMENT ON COLUMN financial_profiles.k401_employer_match_limit_pct IS 'Employer matches contributions up to this percent of salary.';
COMMENT ON COLUMN financial_profiles.k401_current_balance IS 'Optional current 401(k) balance, for projections.';
