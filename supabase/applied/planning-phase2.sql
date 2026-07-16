-- Financial Planning System — Phase 2
-- Run this in your Supabase SQL editor after planning-setup.sql.

-- ── 1. Planning Assumptions ──────────────────────────────────────────────────
-- User-editable forecast assumptions. One row per user.

CREATE TABLE IF NOT EXISTS planning_assumptions (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  return_rate         NUMERIC(5,4)  NOT NULL DEFAULT 0.0700,  -- annual, e.g. 0.07 = 7%
  inflation_rate      NUMERIC(5,4)  NOT NULL DEFAULT 0.0300,
  salary_growth_rate  NUMERIC(5,4)  NOT NULL DEFAULT 0.0200,
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS planning_assumptions_user_id_idx ON planning_assumptions (user_id);

ALTER TABLE planning_assumptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own planning assumptions" ON planning_assumptions;
CREATE POLICY "Users manage own planning assumptions"
  ON planning_assumptions FOR ALL
  USING (auth.uid() = user_id);

-- ── 2. Future Events ─────────────────────────────────────────────────────────
-- One-time financial events incorporated into the forecast.
-- amount_impact: positive = gain (inheritance, home sale), negative = expense (home purchase).

CREATE TABLE IF NOT EXISTS planning_future_events (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label         TEXT          NOT NULL,
  event_year    INT           NOT NULL,
  amount_impact NUMERIC(14,2) NOT NULL DEFAULT 0,
  category      TEXT          NOT NULL DEFAULT 'other',
  -- home_purchase | home_sale | education | inheritance | other
  sort_order    INT           NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS planning_future_events_user_id_idx ON planning_future_events (user_id);

ALTER TABLE planning_future_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own future events" ON planning_future_events;
CREATE POLICY "Users manage own future events"
  ON planning_future_events FOR ALL
  USING (auth.uid() = user_id);
