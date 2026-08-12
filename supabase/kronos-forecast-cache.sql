-- Shared cache for Kronos AI price forecasts (Watchlist "AI price forecast"
-- panel). Unlike watchlist/holdings, a ticker's forecast is identical for
-- every user, so this is keyed by ticker rather than user_id — no per-row
-- ownership to enforce. Reads happen through the normal RLS-gated client;
-- writes happen only through the service-role client in
-- app/api/forecast/[ticker]/route.ts (no user-writable columns).

create table if not exists public.kronos_forecasts (
  ticker        text primary key,
  forecast      jsonb not null,               -- KronosForecastPoint[]
  pred_len      int not null,
  generated_at  timestamptz not null default now()
);

alter table public.kronos_forecasts enable row level security;

-- Any authenticated user may read the shared cache; there is no PII here.
drop policy if exists "kronos_forecasts_select_authenticated" on public.kronos_forecasts;
create policy "kronos_forecasts_select_authenticated" on public.kronos_forecasts
  for select using (auth.role() = 'authenticated');
