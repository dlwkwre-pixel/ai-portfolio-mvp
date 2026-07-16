-- Portfolio Audit / Reconciliation
-- Run this in your Supabase SQL editor.

-- ── 1. Add reconciliation metadata to portfolios ────────────────────────────
ALTER TABLE portfolios
  ADD COLUMN IF NOT EXISTS last_reconciled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_audit_source  TEXT;

-- ── 2. Audit log table ───────────────────────────────────────────────────────
-- previous_holdings_json preserves a full snapshot of holdings before the audit
-- so an "Undo" feature can be added later without any data loss.
CREATE TABLE IF NOT EXISTS portfolio_audits (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id          UUID        NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_type           TEXT        NOT NULL,          -- 'robinhood_csv' | 'manual_paste'
  imported_holdings_json  JSONB     NOT NULL DEFAULT '[]',
  previous_holdings_json  JSONB     NOT NULL DEFAULT '{}',  -- full snapshot before apply
  applied_changes_json    JSONB     NOT NULL DEFAULT '{}',
  changes_count         INT         NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS portfolio_audits_portfolio_id_idx ON portfolio_audits (portfolio_id);
CREATE INDEX IF NOT EXISTS portfolio_audits_created_at_idx   ON portfolio_audits (created_at DESC);

ALTER TABLE portfolio_audits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own audits" ON portfolio_audits;
CREATE POLICY "Users manage own audits"
  ON portfolio_audits FOR ALL
  USING (auth.uid() = user_id);
