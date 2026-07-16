-- Onboarding progress tracking on user_profiles
-- Run this in your Supabase SQL editor if users are stuck in the tutorial.

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS onboarding_status      TEXT        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS onboarding_step        INT         DEFAULT 1,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS onboarding_skipped_at   TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN user_profiles.onboarding_status IS 'null = not started, in_progress, completed, skipped';
COMMENT ON COLUMN user_profiles.onboarding_step   IS 'Last step the user reached (1–7)';
