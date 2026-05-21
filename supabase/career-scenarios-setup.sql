-- Life Events: Career Change Scenarios
-- Models the financial impact of a career transition vs staying on the current path.

CREATE TABLE IF NOT EXISTS career_scenarios (
  id                     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                   TEXT          NOT NULL DEFAULT 'Career Scenario',

  -- Current path
  current_monthly_income NUMERIC(12,2) NOT NULL DEFAULT 5000,
  current_growth_rate    NUMERIC(6,4)  NOT NULL DEFAULT 0.0300,  -- annual, e.g. 0.03 = 3%

  -- New career
  new_monthly_income     NUMERIC(12,2) NOT NULL DEFAULT 4500,
  new_growth_rate        NUMERIC(6,4)  NOT NULL DEFAULT 0.0500,

  -- Transition details
  gap_months             INT           NOT NULL DEFAULT 0,
  transition_cost        NUMERIC(12,2) NOT NULL DEFAULT 0,       -- retraining, relocation, etc.

  -- Context for calculations
  monthly_expenses       NUMERIC(12,2) NOT NULL DEFAULT 3000,
  liquid_assets          NUMERIC(14,2) NOT NULL DEFAULT 0,       -- emergency fund baseline

  -- Assumptions
  investment_return      NUMERIC(6,4)  NOT NULL DEFAULT 0.0700,
  projection_years       INT           NOT NULL DEFAULT 20,

  is_active              BOOLEAN       NOT NULL DEFAULT true,
  created_at             TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS career_scenarios_user_id_idx
  ON career_scenarios (user_id, created_at DESC);

ALTER TABLE career_scenarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own career scenarios" ON career_scenarios;
CREATE POLICY "Users manage own career scenarios"
  ON career_scenarios FOR ALL
  USING (auth.uid() = user_id);
