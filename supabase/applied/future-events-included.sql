-- "Considering vs Committed" state for life-plan events.
-- included = true  → Committed: counts in the retirement forecast (existing behavior)
-- included = false → Considering: saved & visible, but excluded from the forecast
-- Existing rows default to true so no one's current forecast changes. New events
-- added via "Add to plan" are inserted as false (draft) by the app.

ALTER TABLE public.planning_future_events
  ADD COLUMN IF NOT EXISTS included boolean NOT NULL DEFAULT true;
