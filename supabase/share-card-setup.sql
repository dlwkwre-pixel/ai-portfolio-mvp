-- Share card: store performance stats on public_portfolios for the share page
-- Run this in your Supabase SQL editor.

ALTER TABLE public_portfolios
  ADD COLUMN IF NOT EXISTS return_pct_alltime      NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS benchmark_symbol        TEXT,
  ADD COLUMN IF NOT EXISTS benchmark_return_pct    NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS stats_updated_at        TIMESTAMPTZ;

-- Email digest opt-in on user_profiles
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS email_digest_opt_in     BOOLEAN NOT NULL DEFAULT false;
