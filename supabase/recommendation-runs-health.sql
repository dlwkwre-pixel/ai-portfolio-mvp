-- Persist the Gemini portfolio health report on each AI run so the latest one
-- can be shown on the AI Analysis tab (with a "last updated" timestamp),
-- instead of only appearing transiently right after a run.
alter table public.recommendation_runs
  add column if not exists health_report jsonb;
