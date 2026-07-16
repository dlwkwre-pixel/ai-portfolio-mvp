-- Car Purchase Planner: car_scenarios table
-- Run in Supabase SQL editor

CREATE TABLE IF NOT EXISTS car_scenarios (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                     text NOT NULL DEFAULT 'Car Scenario',

  -- Current vehicle
  current_make             text,
  current_model            text,
  current_year             int,
  current_car_value        numeric(12,2) NOT NULL DEFAULT 0,
  current_loan_balance     numeric(12,2) NOT NULL DEFAULT 0,
  current_monthly_payment  numeric(10,2) NOT NULL DEFAULT 0,
  current_interest_rate    numeric(6,4)  NOT NULL DEFAULT 0,
  current_mpg              numeric(5,1)  NOT NULL DEFAULT 25,
  current_monthly_insurance numeric(10,2) NOT NULL DEFAULT 150,

  -- New vehicle
  new_make                 text,
  new_model                text,
  new_year                 int,
  new_car_price            numeric(12,2) NOT NULL DEFAULT 30000,
  new_down_payment         numeric(12,2) NOT NULL DEFAULT 5000,
  new_loan_term_months     int           NOT NULL DEFAULT 60,
  new_interest_rate        numeric(6,4)  NOT NULL DEFAULT 0.065,
  new_mpg                  numeric(5,1)  NOT NULL DEFAULT 30,
  new_monthly_insurance    numeric(10,2) NOT NULL DEFAULT 175,

  -- Shared assumptions
  purchase_type            text NOT NULL DEFAULT 'finance',  -- 'cash' | 'finance'
  gas_price_per_gallon     numeric(5,2)  NOT NULL DEFAULT 3.50,
  miles_per_month          int           NOT NULL DEFAULT 1200,
  notes                    text,

  created_at               timestamptz   NOT NULL DEFAULT now(),
  updated_at               timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE car_scenarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own car scenarios"
  ON car_scenarios FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
