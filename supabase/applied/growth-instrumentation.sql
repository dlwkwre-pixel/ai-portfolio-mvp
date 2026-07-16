-- Growth instrumentation: retention activity log, AI cost metering, pricing survey.
-- Backs /admin/metrics, lib/ai/usage.ts, and the dashboard willingness-to-pay card.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Daily activity per user (one row per user per day — tiny, retention-friendly)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_activity_daily (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day date NOT NULL,
  modules text[] NOT NULL DEFAULT '{}',
  events integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day)
);

ALTER TABLE user_activity_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activity_upsert_own" ON user_activity_daily;
CREATE POLICY "activity_upsert_own"
  ON user_activity_daily FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "activity_update_own" ON user_activity_daily;
CREATE POLICY "activity_update_own"
  ON user_activity_daily FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "activity_select_own" ON user_activity_daily;
CREATE POLICY "activity_select_own"
  ON user_activity_daily FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_activity_day ON user_activity_daily(day);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. AI usage metering (service-role only — RLS enabled with no user policies)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  provider text NOT NULL,           -- 'grok' | 'gemini' | 'groq'
  model text,
  route text NOT NULL DEFAULT 'untagged',  -- feature tag, e.g. 'recommendations'
  prompt_tokens integer,
  completion_tokens integer,
  search_count integer,             -- grok live-search sources (the real cost driver)
  est_cost_usd numeric(10,5) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
-- no policies on purpose: only the service role reads/writes this table

CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user ON ai_usage(user_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Willingness-to-pay survey (one response per user)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pricing_survey_responses (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  features text[] NOT NULL DEFAULT '{}',
  price text,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pricing_survey_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "survey_insert_own" ON pricing_survey_responses;
CREATE POLICY "survey_insert_own"
  ON pricing_survey_responses FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "survey_select_own" ON pricing_survey_responses;
CREATE POLICY "survey_select_own"
  ON pricing_survey_responses FOR SELECT TO authenticated
  USING (user_id = auth.uid());
