-- Household mode: add partner fields to financial_profiles
-- Run this in your Supabase SQL editor.

ALTER TABLE financial_profiles
  ADD COLUMN IF NOT EXISTS partner_name               TEXT,
  ADD COLUMN IF NOT EXISTS partner_age                INT,
  ADD COLUMN IF NOT EXISTS partner_target_retirement_age INT;
