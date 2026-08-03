-- Per-item history for manually-entered balance sheet items, so the Balance Sheet
-- page can show a small "vs. 1 month ago" delta next to each value. Linked BuyTune
-- portfolios (Roth IRA, brokerage, etc.) already have real daily history in
-- portfolio_snapshots via the existing daily-snapshot cron — this table only covers
-- items with no such history: a row is written on creation (baseline) and whenever
-- a manual edit actually changes the value.

CREATE TABLE IF NOT EXISTS balance_sheet_item_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES balance_sheet_items(id) ON DELETE CASCADE,
  value numeric NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bsih_item_date ON balance_sheet_item_history(item_id, recorded_at);

ALTER TABLE balance_sheet_item_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own balance sheet item history"
  ON balance_sheet_item_history FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
