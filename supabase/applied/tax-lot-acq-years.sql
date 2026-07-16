-- Add lot acquisition year overrides to financial_profiles.
-- This stores user-supplied purchase years for sell lots that have no acquired_at date.
ALTER TABLE financial_profiles
  ADD COLUMN IF NOT EXISTS lot_acq_years jsonb DEFAULT '{}'::jsonb;
