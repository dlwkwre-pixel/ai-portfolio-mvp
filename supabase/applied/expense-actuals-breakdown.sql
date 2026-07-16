-- Add merchant breakdown to expense_actuals
-- Stores the individual transaction list that makes up a category total
-- Format: [{"label": "Whole Foods", "amount": 87.50}, ...]
ALTER TABLE expense_actuals
  ADD COLUMN IF NOT EXISTS breakdown jsonb DEFAULT '[]'::jsonb;
