-- Linked-bank (Plaid) transactions flow into Cash Flow automatically.
-- external_id = Plaid's transaction_id, so each sync updates the same row instead of
-- inserting a duplicate, and transactions Plaid later removes can be found and deleted.
ALTER TABLE cash_flow_transactions ADD COLUMN IF NOT EXISTS external_id TEXT;

-- Plain (not partial) unique index: the sync's upsert needs ON CONFLICT (user_id, external_id),
-- which Postgres can't match to a partial index. NULLs never conflict, so statement and
-- manual rows (external_id NULL) are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS cash_flow_transactions_user_external_idx
  ON cash_flow_transactions (user_id, external_id);
