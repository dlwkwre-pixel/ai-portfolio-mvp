-- Adds a structured numeric-screening-bounds field to strategy_versions.
-- Lets a strategy carry real numbers (liquidity floor, move cap, optional
-- market cap floor) alongside its qualitative prompt_text, so agentic/automated
-- trading tools can read exact values via get_strategies() instead of an
-- agent having to invent or interpret them from prose each run.

alter table public.strategy_versions
  add column if not exists scanner_bounds_json jsonb;

comment on column public.strategy_versions.scanner_bounds_json is
  'Optional structured numeric screening bounds for automated scanning, e.g. {"min_avg_dollar_volume": 4000000, "max_daily_move_pct": 50, "market_cap_floor": null, "notes": "..."}. Null when the strategy has no numeric bounds defined (most strategies).';
