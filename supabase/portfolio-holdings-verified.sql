-- Reconcile ritual: track when the user last confirmed their (manually entered)
-- holdings are still accurate. Powers the "Holdings confirmed N days ago · Looks
-- right" freshness chip on the portfolio overview, and lets us nudge when stale.
-- Read path degrades gracefully if this hasn't run yet (column simply absent →
-- treated as never verified); the write path (reconcilePortfolio) needs it.

alter table public.portfolios
  add column if not exists holdings_verified_at timestamptz;

-- No RLS change needed: portfolios already restrict to auth.uid() = user_id, and
-- this column is written only through the ownership-checked reconcilePortfolio action.
