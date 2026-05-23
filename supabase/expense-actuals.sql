-- Actual vs forecasted expense tracking for the Planning area
-- Run in Supabase SQL editor

CREATE TABLE IF NOT EXISTS expense_actuals (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  cash_flow_item_id UUID        REFERENCES cash_flow_items(id) ON DELETE SET NULL,
  label             TEXT        NOT NULL,
  period_year       INT         NOT NULL,
  period_month      INT         NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  actual_amount     NUMERIC(12, 2) NOT NULL DEFAULT 0,
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, cash_flow_item_id, period_year, period_month)
);

ALTER TABLE expense_actuals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own expense actuals"
  ON expense_actuals FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
