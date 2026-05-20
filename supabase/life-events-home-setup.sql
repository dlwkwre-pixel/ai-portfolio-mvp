-- Life Events: Home Planning Scenarios
-- Each row is a named scenario the user can create, compare, and save.
-- Calculations are always done client-side — only inputs are persisted.

CREATE TABLE IF NOT EXISTS home_planning_scenarios (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                  TEXT          NOT NULL DEFAULT 'Home Scenario',

  -- Property
  purchase_price        NUMERIC(14,2) NOT NULL DEFAULT 500000,
  down_payment          NUMERIC(14,2) NOT NULL DEFAULT 100000,

  -- Financing
  mortgage_rate         NUMERIC(6,4)  NOT NULL DEFAULT 0.0675,  -- e.g. 0.0675 = 6.75%
  loan_term_years       INT           NOT NULL DEFAULT 30,

  -- Monthly carrying costs
  property_tax_monthly  NUMERIC(10,2) NOT NULL DEFAULT 500,
  insurance_monthly     NUMERIC(10,2) NOT NULL DEFAULT 150,
  hoa_monthly           NUMERIC(10,2) NOT NULL DEFAULT 0,
  maintenance_pct       NUMERIC(6,4)  NOT NULL DEFAULT 0.0100,  -- annual % of home value

  -- Rent comparison
  monthly_rent          NUMERIC(10,2) NOT NULL DEFAULT 2500,
  rent_growth_rate      NUMERIC(6,4)  NOT NULL DEFAULT 0.0300,  -- annual

  -- Long-term assumptions
  expected_appreciation NUMERIC(6,4)  NOT NULL DEFAULT 0.0350,  -- annual
  investment_return     NUMERIC(6,4)  NOT NULL DEFAULT 0.0700,  -- opportunity cost rate
  hold_years            INT           NOT NULL DEFAULT 7,
  closing_cost_pct      NUMERIC(6,4)  NOT NULL DEFAULT 0.0300,

  is_active             BOOLEAN       NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS home_planning_scenarios_user_id_idx
  ON home_planning_scenarios (user_id, created_at DESC);

ALTER TABLE home_planning_scenarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own home scenarios" ON home_planning_scenarios;
CREATE POLICY "Users manage own home scenarios"
  ON home_planning_scenarios FOR ALL
  USING (auth.uid() = user_id);
