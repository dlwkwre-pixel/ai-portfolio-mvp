-- P6 Estate Readiness: Account Access Planning + Family Instructions
-- Run in Supabase SQL editor.

ALTER TABLE estate_profiles
  ADD COLUMN IF NOT EXISTS estate_accounts      JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS family_instructions  TEXT;
