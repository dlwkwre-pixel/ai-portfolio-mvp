-- ─────────────────────────────────────────────────────────────────────────────
-- Public Portfolios: community sharing feature
-- Run this in the Supabase SQL editor (idempotent — safe to re-run)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. public_portfolios
-- The published snapshot metadata for a shared portfolio.
-- NOTE: baseline_total_value is stored here for server-side cron use only.
-- It is never selected by client-facing queries — only used to compute return_pct.
CREATE TABLE IF NOT EXISTS public_portfolios (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_portfolio_id  uuid REFERENCES portfolios(id) ON DELETE CASCADE,
  owner_user_id        uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  public_name          text NOT NULL,
  public_description   text,
  risk_level           text,
  style                text,
  linked_strategy_id   uuid REFERENCES strategies(id) ON DELETE SET NULL,
  is_public            boolean NOT NULL DEFAULT true,
  follower_count       integer NOT NULL DEFAULT 0,
  copy_count           integer NOT NULL DEFAULT 0,
  baseline_total_value numeric(20,4),
  last_synced_at       timestamptz NOT NULL DEFAULT now(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- Index for community browsing queries
CREATE INDEX IF NOT EXISTS idx_public_portfolios_is_public ON public_portfolios(is_public);
CREATE INDEX IF NOT EXISTS idx_public_portfolios_owner ON public_portfolios(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_public_portfolios_source ON public_portfolios(source_portfolio_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_public_portfolios_source_unique ON public_portfolios(source_portfolio_id) WHERE is_public = true;

-- 2. public_portfolio_holdings
-- Percentage-only allocation snapshot. No shares, no dollar values.
CREATE TABLE IF NOT EXISTS public_portfolio_holdings (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_portfolio_id  uuid NOT NULL REFERENCES public_portfolios(id) ON DELETE CASCADE,
  ticker               text NOT NULL,
  company_name         text,
  allocation_pct       numeric(7,4) NOT NULL CHECK (allocation_pct >= 0 AND allocation_pct <= 100),
  is_cash              boolean NOT NULL DEFAULT false,
  display_order        integer NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pub_holdings_portfolio ON public_portfolio_holdings(public_portfolio_id);

-- 3. portfolio_followers
-- A user following a public portfolio (NOT the same as user_follows).
CREATE TABLE IF NOT EXISTS portfolio_followers (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_portfolio_id  uuid NOT NULL REFERENCES public_portfolios(id) ON DELETE CASCADE,
  follower_user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE(public_portfolio_id, follower_user_id)
);

CREATE INDEX IF NOT EXISTS idx_portfolio_followers_portfolio ON portfolio_followers(public_portfolio_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_followers_user ON portfolio_followers(follower_user_id);

-- 4. portfolio_copies
-- Tracks when a user copies a public portfolio allocation.
CREATE TABLE IF NOT EXISTS portfolio_copies (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_portfolio_id  uuid NOT NULL REFERENCES public_portfolios(id) ON DELETE CASCADE,
  copied_by_user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  new_portfolio_id     uuid REFERENCES portfolios(id) ON DELETE SET NULL,
  copied_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portfolio_copies_public ON portfolio_copies(public_portfolio_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_copies_user ON portfolio_copies(copied_by_user_id);

-- 5. public_portfolio_performance
-- Daily indexed % return since publication. NO dollar values stored here.
-- Computed server-side by cron and syncPublicAllocation action.
CREATE TABLE IF NOT EXISTS public_portfolio_performance (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_portfolio_id  uuid NOT NULL REFERENCES public_portfolios(id) ON DELETE CASCADE,
  snapshot_date        date NOT NULL,
  return_pct           numeric(10,4) NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE(public_portfolio_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_pub_perf_portfolio ON public_portfolio_performance(public_portfolio_id);
CREATE INDEX IF NOT EXISTS idx_pub_perf_date ON public_portfolio_performance(snapshot_date);

-- 6. notifications
-- Minimal notification foundation for portfolio follow alerts and social events.
CREATE TABLE IF NOT EXISTS notifications (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type                 text NOT NULL,
  title                text NOT NULL,
  message              text NOT NULL,
  related_entity_type  text,
  related_entity_id    uuid,
  read_at              timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, read_at) WHERE read_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Enable Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public_portfolios           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public_portfolio_holdings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_followers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_copies            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public_portfolio_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications               ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS Policies: public_portfolios
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "public_portfolios_select_public" ON public_portfolios;
CREATE POLICY "public_portfolios_select_public"
  ON public_portfolios FOR SELECT
  TO authenticated
  USING (is_public = true);

DROP POLICY IF EXISTS "public_portfolios_select_own" ON public_portfolios;
CREATE POLICY "public_portfolios_select_own"
  ON public_portfolios FOR SELECT
  TO authenticated
  USING (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "public_portfolios_insert_own" ON public_portfolios;
CREATE POLICY "public_portfolios_insert_own"
  ON public_portfolios FOR INSERT
  TO authenticated
  WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "public_portfolios_update_own" ON public_portfolios;
CREATE POLICY "public_portfolios_update_own"
  ON public_portfolios FOR UPDATE
  TO authenticated
  USING (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "public_portfolios_delete_own" ON public_portfolios;
CREATE POLICY "public_portfolios_delete_own"
  ON public_portfolios FOR DELETE
  TO authenticated
  USING (owner_user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS Policies: public_portfolio_holdings
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "pub_holdings_select_public" ON public_portfolio_holdings;
CREATE POLICY "pub_holdings_select_public"
  ON public_portfolio_holdings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public_portfolios pp
      WHERE pp.id = public_portfolio_id AND pp.is_public = true
    )
  );

DROP POLICY IF EXISTS "pub_holdings_select_own" ON public_portfolio_holdings;
CREATE POLICY "pub_holdings_select_own"
  ON public_portfolio_holdings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public_portfolios pp
      WHERE pp.id = public_portfolio_id AND pp.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "pub_holdings_insert_own" ON public_portfolio_holdings;
CREATE POLICY "pub_holdings_insert_own"
  ON public_portfolio_holdings FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public_portfolios pp
      WHERE pp.id = public_portfolio_id AND pp.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "pub_holdings_update_own" ON public_portfolio_holdings;
CREATE POLICY "pub_holdings_update_own"
  ON public_portfolio_holdings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public_portfolios pp
      WHERE pp.id = public_portfolio_id AND pp.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "pub_holdings_delete_own" ON public_portfolio_holdings;
CREATE POLICY "pub_holdings_delete_own"
  ON public_portfolio_holdings FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public_portfolios pp
      WHERE pp.id = public_portfolio_id AND pp.owner_user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS Policies: portfolio_followers
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "portfolio_followers_select" ON portfolio_followers;
CREATE POLICY "portfolio_followers_select"
  ON portfolio_followers FOR SELECT
  TO authenticated
  USING (
    follower_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public_portfolios pp
      WHERE pp.id = public_portfolio_id AND pp.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "portfolio_followers_insert" ON portfolio_followers;
CREATE POLICY "portfolio_followers_insert"
  ON portfolio_followers FOR INSERT
  TO authenticated
  WITH CHECK (
    follower_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public_portfolios pp
      WHERE pp.id = public_portfolio_id AND pp.is_public = true
    )
  );

DROP POLICY IF EXISTS "portfolio_followers_delete" ON portfolio_followers;
CREATE POLICY "portfolio_followers_delete"
  ON portfolio_followers FOR DELETE
  TO authenticated
  USING (follower_user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS Policies: portfolio_copies
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "portfolio_copies_select" ON portfolio_copies;
CREATE POLICY "portfolio_copies_select"
  ON portfolio_copies FOR SELECT
  TO authenticated
  USING (
    copied_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public_portfolios pp
      WHERE pp.id = public_portfolio_id AND pp.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "portfolio_copies_insert" ON portfolio_copies;
CREATE POLICY "portfolio_copies_insert"
  ON portfolio_copies FOR INSERT
  TO authenticated
  WITH CHECK (copied_by_user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS Policies: public_portfolio_performance
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "pub_perf_select_public" ON public_portfolio_performance;
CREATE POLICY "pub_perf_select_public"
  ON public_portfolio_performance FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public_portfolios pp
      WHERE pp.id = public_portfolio_id AND pp.is_public = true
    )
  );

DROP POLICY IF EXISTS "pub_perf_select_own" ON public_portfolio_performance;
CREATE POLICY "pub_perf_select_own"
  ON public_portfolio_performance FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public_portfolios pp
      WHERE pp.id = public_portfolio_id AND pp.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "pub_perf_insert_own" ON public_portfolio_performance;
CREATE POLICY "pub_perf_insert_own"
  ON public_portfolio_performance FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public_portfolios pp
      WHERE pp.id = public_portfolio_id AND pp.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "pub_perf_update_own" ON public_portfolio_performance;
CREATE POLICY "pub_perf_update_own"
  ON public_portfolio_performance FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public_portfolios pp
      WHERE pp.id = public_portfolio_id AND pp.owner_user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS Policies: notifications
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "notifications_select_own" ON notifications;
CREATE POLICY "notifications_select_own"
  ON notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notifications_insert" ON notifications;
CREATE POLICY "notifications_insert"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "notifications_update_own" ON notifications;
CREATE POLICY "notifications_update_own"
  ON notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notifications_delete_own" ON notifications;
CREATE POLICY "notifications_delete_own"
  ON notifications FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
