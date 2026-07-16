-- Soft-delete archive for cash_ledger entries.
-- When a user "deletes" a cash activity, it moves here and can be restored.

CREATE TABLE IF NOT EXISTS cash_ledger_archive (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_id uuid NOT NULL,
  portfolio_id uuid NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  amount      numeric(18,2) NOT NULL,
  direction   text CHECK (direction IN ('IN', 'OUT')),
  reason      text NOT NULL,
  effective_at timestamptz NOT NULL,
  deleted_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cash_ledger_archive ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own archived cash activity"
  ON cash_ledger_archive FOR ALL
  USING (
    portfolio_id IN (
      SELECT id FROM portfolios WHERE user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS cash_ledger_archive_portfolio_idx ON cash_ledger_archive(portfolio_id);
