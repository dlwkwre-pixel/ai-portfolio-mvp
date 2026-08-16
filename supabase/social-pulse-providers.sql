-- ─────────────────────────────────────────────────────────────────
-- Social Pulse: Tradestie + StockGeist provider caches
-- Safe to run multiple times (all statements are idempotent).
-- Replaces ApeWisdom as the primary WSB/sentiment sources — see
-- lib/market-data/tradestie.ts and lib/market-data/stockgeist.ts.
-- ─────────────────────────────────────────────────────────────────

-- Tradestie: free, no-key, top-50 WSB mentions + sentiment.
-- Single global row, refreshed every ~15 min — same shape as apewisdom_cache.
CREATE TABLE IF NOT EXISTS tradestie_cache (
  id            TEXT PRIMARY KEY DEFAULT 'global',
  snapshot_json TEXT NOT NULL,          -- JSON array of top-50 tickers from Tradestie
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE tradestie_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tradestie_cache_all" ON tradestie_cache;

CREATE POLICY "tradestie_cache_all"
  ON tradestie_cache FOR ALL
  USING (true)
  WITH CHECK (true);

-- StockGeist: per-ticker sentiment (~2,200 tickers, social + news).
-- Requires STOCKGEIST_API_KEY — dormant until that's configured.
CREATE TABLE IF NOT EXISTS stockgeist_sentiment_cache (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker             TEXT NOT NULL,
  timeframe          TEXT NOT NULL DEFAULT '1d',   -- 5m | 1h | 1d

  fetched_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at         TIMESTAMPTZ NOT NULL,

  total_count        INTEGER,
  positive_count      INTEGER,
  negative_count      INTEGER,
  pos_index          NUMERIC(6,3),    -- StockGeist's headline sentiment score
  raw_json           TEXT NOT NULL,   -- full provider response, for forward compatibility

  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_stockgeist_cache_ticker_timeframe
  ON stockgeist_sentiment_cache (ticker, timeframe);

CREATE INDEX IF NOT EXISTS idx_stockgeist_cache_expires_at
  ON stockgeist_sentiment_cache (expires_at);

ALTER TABLE stockgeist_sentiment_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stockgeist_cache_all" ON stockgeist_sentiment_cache;

CREATE POLICY "stockgeist_cache_all"
  ON stockgeist_sentiment_cache FOR ALL
  USING (true)
  WITH CHECK (true);
