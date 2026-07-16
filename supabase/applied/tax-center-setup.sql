-- Tax Center — portfolio_transactions acquired_at column
-- Run this in your Supabase SQL editor.

-- Tracks the date shares were originally acquired, used for STCG vs LTCG classification.
-- Optional: NULL means classification is unknown. Only relevant for sell transactions.

ALTER TABLE portfolio_transactions
  ADD COLUMN IF NOT EXISTS acquired_at DATE DEFAULT NULL;
