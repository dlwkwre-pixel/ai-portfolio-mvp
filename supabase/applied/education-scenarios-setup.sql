-- Life Events: Education / 529 College Savings Scenarios

CREATE TABLE IF NOT EXISTS education_scenarios (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                  TEXT          NOT NULL DEFAULT 'College Savings',

  -- Child info
  child_name            TEXT,
  child_current_age     INT           NOT NULL DEFAULT 0,        -- 0 = newborn
  years_in_college      INT           NOT NULL DEFAULT 4,

  -- Cost assumptions
  annual_cost_today     NUMERIC(12,2) NOT NULL DEFAULT 30000,    -- per year in today's $
  cost_inflation_rate   NUMERIC(6,4)  NOT NULL DEFAULT 0.0500,   -- tuition inflation ~5%/yr

  -- Savings
  current_529_balance   NUMERIC(14,2) NOT NULL DEFAULT 0,
  monthly_contribution  NUMERIC(10,2) NOT NULL DEFAULT 0,
  investment_return     NUMERIC(6,4)  NOT NULL DEFAULT 0.0700,

  is_active             BOOLEAN       NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS education_scenarios_user_id_idx
  ON education_scenarios (user_id, created_at DESC);

ALTER TABLE education_scenarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own education scenarios" ON education_scenarios;
CREATE POLICY "Users manage own education scenarios"
  ON education_scenarios FOR ALL
  USING (auth.uid() = user_id);
