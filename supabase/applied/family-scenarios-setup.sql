-- Life Events: Family Planning / Cost of Children Scenarios

CREATE TABLE IF NOT EXISTS family_scenarios (
  id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                    TEXT          NOT NULL DEFAULT 'Family Scenario',

  -- Child info
  child_name              TEXT,
  child_current_age       INT           NOT NULL DEFAULT 0,       -- 0 = newborn / planning

  -- Monthly costs by age bracket (user adjusts for their location/lifestyle)
  monthly_infant_cost     NUMERIC(10,2) NOT NULL DEFAULT 2000,    -- 0–2 yrs (daycare + basics)
  monthly_child_cost      NUMERIC(10,2) NOT NULL DEFAULT 1200,    -- 3–12 yrs
  monthly_teen_cost       NUMERIC(10,2) NOT NULL DEFAULT 1000,    -- 13–17 yrs

  -- Household context
  monthly_expenses_now    NUMERIC(12,2) NOT NULL DEFAULT 3000,    -- current baseline expenses
  investment_return       NUMERIC(6,4)  NOT NULL DEFAULT 0.0700,

  is_active               BOOLEAN       NOT NULL DEFAULT true,
  created_at              TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS family_scenarios_user_id_idx
  ON family_scenarios (user_id, created_at DESC);

ALTER TABLE family_scenarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own family scenarios" ON family_scenarios;
CREATE POLICY "Users manage own family scenarios"
  ON family_scenarios FOR ALL
  USING (auth.uid() = user_id);
