-- Transaction-level cash flow tracking.
--
-- Before this, statement imports were summed per merchant and stored as ONE total per
-- budget item per month (expense_actuals, upserted) — so a second import for the same
-- month silently replaced the first, duplicates couldn't be detected (no dates / no
-- individual charges), and income had no per-month actuals at all.
--
-- Now every imported line is its own row. A month's actual for a budget item is the SUM
-- of its 'out' transactions; expense_actuals stays as the legacy/manual fallback for
-- item-months that have no transactions (see app/planning/page.tsx).

CREATE TABLE IF NOT EXISTS cash_flow_transactions (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  txn_date          DATE        NOT NULL,
  period_year       INT         NOT NULL,
  period_month      INT         NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  description       TEXT        NOT NULL,             -- raw line text as it appeared on the statement
  merchant          TEXT        NOT NULL,             -- cleaned display name
  -- 'out' rows: positive = spending, negative = refund/credit back (nets against its bucket).
  -- 'in' rows: always positive (income).
  amount            NUMERIC(12, 2) NOT NULL CHECK (amount <> 0),
  direction         TEXT        NOT NULL CHECK (direction IN ('in', 'out')),
  cash_flow_item_id UUID        REFERENCES cash_flow_items(id) ON DELETE SET NULL, -- the bucket; NULL = unsorted
  source            TEXT        NOT NULL DEFAULT 'statement' CHECK (source IN ('statement', 'manual', 'plaid')),
  import_batch_id   UUID,                             -- groups rows saved by one import, for undo
  note              TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  CHECK (direction = 'out' OR amount > 0)
);

CREATE INDEX IF NOT EXISTS cash_flow_transactions_user_period_idx
  ON cash_flow_transactions (user_id, period_year, period_month);
CREATE INDEX IF NOT EXISTS cash_flow_transactions_user_date_idx
  ON cash_flow_transactions (user_id, txn_date);

ALTER TABLE cash_flow_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own cash flow transactions"
  ON cash_flow_transactions FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- "Always put Costco in Groceries" — remembered when the user re-buckets a merchant,
-- applied automatically on every future import.
CREATE TABLE IF NOT EXISTS cash_flow_merchant_rules (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  merchant_key      TEXT        NOT NULL,             -- normalized merchant (lib/planning/transactions.ts merchantKey)
  cash_flow_item_id UUID        REFERENCES cash_flow_items(id) ON DELETE CASCADE NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, merchant_key)
);

ALTER TABLE cash_flow_merchant_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own merchant rules"
  ON cash_flow_merchant_rules FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
