-- ─────────────────────────────────────────────────────────────────
-- Reddit Social Pulse snapshot cache
-- Safe to run multiple times (all statements are idempotent).
-- Stores aggregated Reddit analysis per ticker.
-- NO usernames, author IDs, or personal data stored.
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reddit_social_snapshots (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker                   TEXT NOT NULL,
  company_name             TEXT,
  time_window              TEXT NOT NULL DEFAULT 'week',   -- week | month

  -- Freshness
  fetched_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at               TIMESTAMPTZ NOT NULL,

  -- Volume (aggregated counts only — no raw post archives)
  post_count               INTEGER NOT NULL DEFAULT 0,
  mention_count            INTEGER NOT NULL DEFAULT 0,

  -- Sentiment percentages (0–100 each)
  bullish_pct              NUMERIC(5,2),
  bearish_pct              NUMERIC(5,2),
  neutral_pct              NUMERIC(5,2),
  sentiment_score          NUMERIC(6,2),   -- -100 to +100

  -- Scores (0–100)
  hype_score               NUMERIC(5,2),
  conviction_score         NUMERIC(5,2),
  reddit_pulse_score       NUMERIC(5,2),

  -- Structured JSON arrays (themes, risks, catalysts, subreddit breakdown)
  top_themes_json          TEXT,
  top_bullish_themes_json  TEXT,
  top_bearish_themes_json  TEXT,
  top_risks_json           TEXT,
  top_catalysts_json       TEXT,
  subreddit_breakdown_json TEXT,

  -- Source links (post title + permalink + score only; no usernames)
  source_post_links_json   TEXT,

  -- AI summary text + metadata
  summary                  TEXT,
  ai_analysis_json         TEXT,   -- { ai_powered, sentiment_label }

  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ──────────────────────────────────────────────────────────────────
-- Unique constraint used by the upsert ON CONFLICT clause
CREATE UNIQUE INDEX IF NOT EXISTS idx_reddit_snapshots_ticker_window
  ON reddit_social_snapshots (ticker, time_window);

-- Used by the fresh-cache query: WHERE ticker = $1 AND time_window = $2 AND expires_at > NOW()
CREATE INDEX IF NOT EXISTS idx_reddit_snapshots_expires_at
  ON reddit_social_snapshots (expires_at);

-- Used by the stale-fallback query: WHERE ticker = $1 ORDER BY fetched_at DESC
CREATE INDEX IF NOT EXISTS idx_reddit_snapshots_fetched_at
  ON reddit_social_snapshots (fetched_at DESC);

-- Covering index for the most common lookup pattern
CREATE INDEX IF NOT EXISTS idx_reddit_snapshots_ticker
  ON reddit_social_snapshots (ticker);

-- ── Row-Level Security ────────────────────────────────────────────────────────
-- ENABLE ROW LEVEL SECURITY is idempotent (safe to run again).
ALTER TABLE reddit_social_snapshots ENABLE ROW LEVEL SECURITY;

-- Drop before re-create so this script is safe to run more than once.
DROP POLICY IF EXISTS "reddit_snapshots_all" ON reddit_social_snapshots;

-- API routes use the server-side Supabase client (service role) and need full access.
-- No end-user can reach this table directly via the client SDK.
CREATE POLICY "reddit_snapshots_all"
  ON reddit_social_snapshots FOR ALL
  USING (true)
  WITH CHECK (true);
