-- Recommendation Outcome Tracking
-- Captures entry price + timestamp when a recommendation is executed.
-- Used by the Recommendation Outcome Intelligence layer to compute returns
-- and feed back into the AI as probabilistic quality signals.
-- Run this in the Supabase SQL editor.

alter table recommendation_items
  add column if not exists executed_at    timestamptz,
  add column if not exists executed_price numeric(12, 4);

-- Index for quickly querying executed items that have a price but no outcome yet
create index if not exists recommendation_items_executed_outcome
  on recommendation_items (portfolio_id, executed_at)
  where executed_at is not null;
