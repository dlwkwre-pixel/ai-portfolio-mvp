-- Migration: add vacation mode fields to sabbatical_scenarios
-- Run this in your Supabase SQL editor after the initial sabbatical-scenarios-setup.sql

ALTER TABLE sabbatical_scenarios
  ADD COLUMN IF NOT EXISTS break_type             TEXT        NOT NULL DEFAULT 'sabbatical',
  ADD COLUMN IF NOT EXISTS vacation_duration_days INT         NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS vacation_daily_budget  NUMERIC(10,2) NOT NULL DEFAULT 200,
  ADD COLUMN IF NOT EXISTS vacation_travel_costs  NUMERIC(10,2) NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS vacation_target_date   TEXT;

COMMENT ON COLUMN sabbatical_scenarios.break_type IS 'vacation | sabbatical';
