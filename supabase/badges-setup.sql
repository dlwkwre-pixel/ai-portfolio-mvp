-- User achievement badges
-- badge_id is a string key from the badge catalog defined in lib/badges/definitions.ts
-- Run this in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS user_badges (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_id   text NOT NULL,
  earned_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, badge_id)
);

CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(user_id);
CREATE INDEX IF NOT EXISTS idx_user_badges_badge ON user_badges(badge_id);

ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;

-- Anyone can read earned badges (they are public achievements)
DROP POLICY IF EXISTS "user_badges_select_public" ON user_badges;
CREATE POLICY "user_badges_select_public"
  ON user_badges FOR SELECT
  TO authenticated, anon
  USING (true);

-- Only the server (service role via admin client) inserts badges;
-- authenticated inserts allowed here for the server action which uses the user's session
DROP POLICY IF EXISTS "user_badges_insert_own" ON user_badges;
CREATE POLICY "user_badges_insert_own"
  ON user_badges FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());
