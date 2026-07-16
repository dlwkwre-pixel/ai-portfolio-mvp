-- Financial Planning System — Phase 1
-- Run this in your Supabase SQL editor.

-- ── 1. Financial profiles ────────────────────────────────────────────────────
-- One row per user. Stores demographic + goal inputs.

CREATE TABLE IF NOT EXISTS financial_profiles (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  current_age           INT,
  target_retirement_age INT         DEFAULT 65,
  risk_tolerance        TEXT        DEFAULT 'moderate',   -- conservative | moderate | aggressive
  monthly_income        NUMERIC(14,2) DEFAULT 0,
  monthly_expenses      NUMERIC(14,2) DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS financial_profiles_user_id_idx ON financial_profiles (user_id);

ALTER TABLE financial_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own financial profile" ON financial_profiles;
CREATE POLICY "Users manage own financial profile"
  ON financial_profiles FOR ALL
  USING (auth.uid() = user_id);

-- ── 2. Balance sheet items ───────────────────────────────────────────────────
-- Assets and liabilities. is_liability=true means it reduces net worth.

CREATE TABLE IF NOT EXISTS balance_sheet_items (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label        TEXT        NOT NULL,
  category     TEXT        NOT NULL DEFAULT 'other_asset',
  -- asset categories: cash | investment | real_asset | other_asset
  -- liability categories: liability
  value        NUMERIC(14,2) NOT NULL DEFAULT 0,
  is_liability BOOLEAN     NOT NULL DEFAULT false,
  sort_order   INT         NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS balance_sheet_items_user_id_idx ON balance_sheet_items (user_id);

ALTER TABLE balance_sheet_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own balance sheet" ON balance_sheet_items;
CREATE POLICY "Users manage own balance sheet"
  ON balance_sheet_items FOR ALL
  USING (auth.uid() = user_id);

-- ── 3. Cash flow items ───────────────────────────────────────────────────────
-- Recurring income and expense lines. amount is always positive; type determines direction.

CREATE TABLE IF NOT EXISTS cash_flow_items (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label      TEXT        NOT NULL,
  type       TEXT        NOT NULL DEFAULT 'expense',   -- income | expense
  frequency  TEXT        NOT NULL DEFAULT 'monthly',  -- monthly | annual
  amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
  sort_order INT         NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cash_flow_items_user_id_idx ON cash_flow_items (user_id);

ALTER TABLE cash_flow_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own cash flow" ON cash_flow_items;
CREATE POLICY "Users manage own cash flow"
  ON cash_flow_items FOR ALL
  USING (auth.uid() = user_id);

-- ── 4. Net worth history ─────────────────────────────────────────────────────
-- Time-series snapshots. One auto-saved per day when user visits /planning.

CREATE TABLE IF NOT EXISTS net_worth_history (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot_date       DATE        NOT NULL DEFAULT CURRENT_DATE,
  total_assets        NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_liabilities   NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_worth           NUMERIC(14,2) NOT NULL DEFAULT 0,
  portfolio_value     NUMERIC(14,2),  -- from portfolios table at snapshot time
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS net_worth_history_user_id_date_idx ON net_worth_history (user_id, snapshot_date DESC);

ALTER TABLE net_worth_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own net worth history" ON net_worth_history;
CREATE POLICY "Users manage own net worth history"
  ON net_worth_history FOR ALL
  USING (auth.uid() = user_id);
