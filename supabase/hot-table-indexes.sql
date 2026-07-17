-- Insurance indexes for the two hottest dashboard-created tables.
-- portfolio_snapshots and cash_ledger were created in the Supabase dashboard
-- (no repo SQL), so their index state is unverifiable — and snapshots is the
-- fastest-growing, most-queried table in the app (every chart read, every
-- sync write). IF NOT EXISTS makes this a free no-op if they already exist.

CREATE INDEX IF NOT EXISTS idx_snapshots_portfolio_date
  ON portfolio_snapshots (portfolio_id, snapshot_date);

CREATE INDEX IF NOT EXISTS idx_cash_ledger_portfolio_date
  ON cash_ledger (portfolio_id, effective_at);
