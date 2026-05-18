-- Run this in your Supabase SQL editor to add terms acceptance tracking

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS terms_version      TEXT        DEFAULT NULL;

COMMENT ON COLUMN user_profiles.terms_accepted_at IS 'When the user accepted the current Terms of Service. NULL means not yet accepted.';
COMMENT ON COLUMN user_profiles.terms_version IS 'Which version of the Terms the user accepted (e.g. "2026-05-18").';
