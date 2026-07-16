-- Home Planner: owner-mover mode columns
-- Run this in the Supabase SQL editor to enable "I own a home" planning

ALTER TABLE financial_profiles
  ADD COLUMN IF NOT EXISTS is_homeowner           BOOLEAN    NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS owner_home_value        NUMERIC,
  ADD COLUMN IF NOT EXISTS owner_mortgage_balance  NUMERIC,
  ADD COLUMN IF NOT EXISTS owner_monthly_payment   NUMERIC,
  ADD COLUMN IF NOT EXISTS owner_interest_rate     NUMERIC,
  ADD COLUMN IF NOT EXISTS owner_remaining_term    INTEGER,
  ADD COLUMN IF NOT EXISTS owner_agent_commission_pct NUMERIC  DEFAULT 6,
  ADD COLUMN IF NOT EXISTS owner_move_in_costs     NUMERIC    DEFAULT 0,
  ADD COLUMN IF NOT EXISTS owner_expected_sale_price NUMERIC,
  ADD COLUMN IF NOT EXISTS owner_hoa_monthly       NUMERIC    DEFAULT NULL;
