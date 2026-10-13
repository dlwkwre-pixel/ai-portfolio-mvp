-- Cash Flow: "saved" transactions + monthly close-out.
--
-- 1) direction 'save' — money the user moved into their own savings or investment
--    account (a transfer to savings, a Robinhood deposit). Before, these were skipped as
--    plain transfers, so the page could say what was LEFT OVER but never what was actually
--    SAVED. 'save' rows count as neither spending nor income.
ALTER TABLE cash_flow_transactions DROP CONSTRAINT IF EXISTS cash_flow_transactions_direction_check;
ALTER TABLE cash_flow_transactions
  ADD CONSTRAINT cash_flow_transactions_direction_check CHECK (direction IN ('in', 'out', 'save'));

-- 2) One row per month the user has closed out (checklist done, leftover decided).
--    The totals are a snapshot of what the month looked like when it was closed.
CREATE TABLE IF NOT EXISTS cash_flow_month_closes (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  period_year   INT         NOT NULL,
  period_month  INT         NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  income        NUMERIC(12, 2) NOT NULL DEFAULT 0,
  spending      NUMERIC(12, 2) NOT NULL DEFAULT 0,
  saved         NUMERIC(12, 2) NOT NULL DEFAULT 0,
  closed_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, period_year, period_month)
);

ALTER TABLE cash_flow_month_closes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own month closes"
  ON cash_flow_month_closes FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
