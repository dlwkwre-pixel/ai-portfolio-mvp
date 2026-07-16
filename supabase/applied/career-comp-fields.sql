-- Add comprehensive compensation fields to career_scenarios
-- Captures total comp beyond base salary for accurate career decision modeling

ALTER TABLE career_scenarios
  ADD COLUMN IF NOT EXISTS current_annual_bonus     NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_equity_annual    NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_benefits_monthly NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_401k_match_pct   NUMERIC(6,4)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS new_annual_bonus         NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS new_equity_annual        NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS new_benefits_monthly     NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS new_401k_match_pct       NUMERIC(6,4)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS new_signing_bonus        NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS new_relocation           NUMERIC(12,2) NOT NULL DEFAULT 0;
