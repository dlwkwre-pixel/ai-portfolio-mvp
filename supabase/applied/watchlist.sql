-- Watchlist: tickers a user is tracking but doesn't own, with an optional price
-- target. A daily cron (watchlist-monitor) checks quotes and alerts when a target
-- is hit; an on-demand AI scan reads recent news for thesis-changing events.

CREATE TABLE IF NOT EXISTS watchlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker text NOT NULL,
  company_name text,
  target_price numeric,                                  -- optional price target
  alert_direction text NOT NULL DEFAULT 'below'          -- 'below' = waiting to buy a dip; 'above' = breakout/take-profit
    CHECK (alert_direction IN ('below', 'above')),
  note text,                                             -- why you're watching it
  last_alerted_at timestamptz,                           -- de-dupes target-hit alerts
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, ticker)
);

CREATE INDEX IF NOT EXISTS idx_watchlist_user ON watchlist(user_id);

ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own watchlist"
  ON watchlist FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
