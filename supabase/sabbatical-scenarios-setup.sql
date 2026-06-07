-- Life Events: Sabbatical / Career Break Scenarios
-- Models the financial impact of taking time off work: runway, depletion, and recovery.

CREATE TABLE IF NOT EXISTS sabbatical_scenarios (
  id                          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                        TEXT          NOT NULL DEFAULT 'Sabbatical',

  -- Sabbatical parameters
  sabbatical_months           INT           NOT NULL DEFAULT 12,         -- how long the break lasts
  monthly_expenses_during     NUMERIC(12,2) NOT NULL DEFAULT 3000,       -- spending while off
  monthly_stipend             NUMERIC(12,2) NOT NULL DEFAULT 0,          -- freelance/part-time income during

  -- Financial starting point (defaults from financial profile, user can override)
  liquid_assets_available     NUMERIC(14,2) NOT NULL DEFAULT 0,          -- cash / emergency fund available
  current_monthly_income      NUMERIC(12,2) NOT NULL DEFAULT 5000,       -- income before sabbatical

  -- Return path
  monthly_income_after_return NUMERIC(12,2) NOT NULL DEFAULT 5000,       -- income after returning (same or different)

  -- Assumptions
  investment_return_rate      NUMERIC(6,4)  NOT NULL DEFAULT 0.0700,     -- for FI projection

  notes                       TEXT,

  created_at                  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sabbatical_scenarios_user_id_idx
  ON sabbatical_scenarios (user_id, created_at DESC);

ALTER TABLE sabbatical_scenarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own sabbatical scenarios" ON sabbatical_scenarios;
CREATE POLICY "Users manage own sabbatical scenarios"
  ON sabbatical_scenarios FOR ALL
  USING (auth.uid() = user_id);
