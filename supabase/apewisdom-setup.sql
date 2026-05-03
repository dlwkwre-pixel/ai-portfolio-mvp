-- ─────────────────────────────────────────────────────────────────
-- ApeWisdom global snapshot cache
-- Single-row table — id is always 'global'.
-- Safe to run multiple times (all statements are idempotent).
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS apewisdom_cache (
  id          TEXT PRIMARY KEY DEFAULT 'global',
  snapshot_json TEXT NOT NULL,          -- JSON array of all tickers from ApeWisdom
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Row-Level Security ────────────────────────────────────────────────────────
ALTER TABLE apewisdom_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "apewisdom_cache_all" ON apewisdom_cache;

CREATE POLICY "apewisdom_cache_all"
  ON apewisdom_cache FOR ALL
  USING (true)
  WITH CHECK (true);
