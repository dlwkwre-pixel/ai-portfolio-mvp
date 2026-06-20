-- Recurring life events: lets the plan model ongoing changes (a raise, a
-- cost-of-living shift, freed-up debt payments) as a per-year stream, not just
-- a one-time hit. Both columns are nullable; existing one-time events are
-- unaffected (amount_impact still applies at event_year).
alter table public.planning_future_events
  add column if not exists recurring_annual numeric,   -- signed $/yr applied event_year..end_year
  add column if not exists end_year integer;           -- last year the stream applies (null = forecast horizon)
