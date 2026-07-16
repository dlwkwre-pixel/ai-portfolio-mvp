-- Gamification Phase 1 — XP & Levels. Run once in the Supabase SQL editor.
--
-- user_xp: one row per user with their running XP + level.
-- xp_events: an append-only ledger. The (user_id, dedup_key) unique constraint makes awards
--   idempotent — e.g., dedup_key "profile_complete" (once ever), "analysis_run:2026-06-27"
--   (once/day), "holding_added:<id>" (once per holding). Retries/refreshes can't double-credit.

CREATE TABLE IF NOT EXISTS user_xp (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  xp         integer NOT NULL DEFAULT 0,
  level      integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS xp_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind       text NOT NULL,
  xp         integer NOT NULL DEFAULT 0,
  dedup_key  text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, dedup_key)
);

CREATE INDEX IF NOT EXISTS idx_xp_events_user ON xp_events(user_id, created_at DESC);

ALTER TABLE user_xp ENABLE ROW LEVEL SECURITY;
ALTER TABLE xp_events ENABLE ROW LEVEL SECURITY;

-- XP is public (it powers badges/levels shown on profiles); writes go through the server
-- (service-role) via awardXp, so no client write policy is needed.
DROP POLICY IF EXISTS "user_xp_select_public" ON user_xp;
CREATE POLICY "user_xp_select_public" ON user_xp FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS "xp_events_select_own" ON xp_events;
CREATE POLICY "xp_events_select_own" ON xp_events FOR SELECT TO authenticated USING (user_id = auth.uid());
