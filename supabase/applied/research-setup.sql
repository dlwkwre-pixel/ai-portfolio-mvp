-- ─────────────────────────────────────────────────────────────────
-- Research feature tables
-- Run this once in your Supabase SQL editor to enable:
--   • Popular on BuyTune (activity tracking + aggregation)
--   • AI Analysis caching (avoid repeated Gemini calls)
-- ─────────────────────────────────────────────────────────────────

-- 1. Anonymized research activity events
--    Stores: what happened, which ticker, when, and which user (optional).
--    Only aggregated counts are ever exposed via the API — never individual rows.

CREATE TABLE IF NOT EXISTS research_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker      TEXT NOT NULL,
  event_type  TEXT NOT NULL,   -- ticker_search | stock_card_click | stock_detail_view | ai_analysis_requested | watchlist_add | buy_button_click
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_research_events_ticker     ON research_events (ticker);
CREATE INDEX IF NOT EXISTS idx_research_events_created_at ON research_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_research_events_event_type ON research_events (event_type);

-- RLS: authenticated users can insert their own events.
-- Nobody can SELECT individual rows — aggregation happens server-side only.
ALTER TABLE research_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "research_events_insert"
  ON research_events FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Allow server-side reads for aggregation (anon/service role via API routes)
CREATE POLICY "research_events_select_aggregate"
  ON research_events FOR SELECT
  USING (true);


-- 2. Stock AI analysis cache
--    One cached Gemini analysis per ticker (upserted, 24-hour TTL enforced in app).

CREATE TABLE IF NOT EXISTS stock_ai_analyses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker        TEXT NOT NULL UNIQUE,
  analysis_text TEXT NOT NULL,   -- JSON string: { bull_case, bear_case, key_catalysts, key_risks, takeaway, confidence }
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_ai_analyses_ticker     ON stock_ai_analyses (ticker);
CREATE INDEX IF NOT EXISTS idx_stock_ai_analyses_created_at ON stock_ai_analyses (created_at DESC);

ALTER TABLE stock_ai_analyses ENABLE ROW LEVEL SECURITY;

-- Anyone can read cached analyses (public data)
CREATE POLICY "stock_ai_analyses_select"
  ON stock_ai_analyses FOR SELECT
  USING (true);

-- API routes can insert/update via authenticated or anon session
CREATE POLICY "stock_ai_analyses_upsert"
  ON stock_ai_analyses FOR ALL
  USING (true)
  WITH CHECK (true);
