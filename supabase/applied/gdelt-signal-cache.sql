-- Shared cache for GDELT-derived scenario signal counts (Research > Scenarios
-- panel, geopolitical category). A scenario's real-world news volume is
-- identical for every user, so this is keyed by scenario_key rather than
-- user_id — same pattern as kronos_forecasts. GDELT's public DOC API asks
-- callers to keep to roughly one request per 5 seconds, so this cache is the
-- actual rate-limit defense, not an optimization — see lib/market-data/gdelt.ts.

create table if not exists public.gdelt_signal_cache (
  scenario_key   text primary key,
  article_count  integer not null,
  checked_at     timestamptz not null default now()
);

alter table public.gdelt_signal_cache enable row level security;

-- Any authenticated user may read the shared cache; there is no PII here.
drop policy if exists "gdelt_signal_cache_select_authenticated" on public.gdelt_signal_cache;
create policy "gdelt_signal_cache_select_authenticated" on public.gdelt_signal_cache
  for select using (auth.role() = 'authenticated');
