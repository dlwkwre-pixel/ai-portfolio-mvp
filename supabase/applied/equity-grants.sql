-- Equity compensation planner (RSUs / ISO / NSO / ESPP). One row per grant.
-- Powers /planning/equity: live value at the public price, vested-vs-unvested,
-- a vesting timeline, a rough tax-at-vest estimate, and single-stock concentration.
-- Free to run: value comes from Finnhub quotes for public tickers, or a manual
-- price the user enters for a private company.

create table if not exists public.equity_grants (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  label               text,                              -- optional friendly name
  ticker              text,                              -- public ticker for live price (null = private co)
  company_name        text,
  grant_type          text not null default 'rsu',       -- rsu | iso | nso | espp
  total_shares        numeric not null default 0,
  strike_price        numeric,                           -- options: exercise price; espp: purchase price
  current_price_manual numeric,                          -- fallback price when no live ticker
  grant_date          date,
  vest_start_date     date,
  vest_months         integer not null default 48,       -- total vesting duration
  cliff_months        integer not null default 12,       -- shares vest only after the cliff
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists equity_grants_user_idx on public.equity_grants (user_id, created_at desc);

alter table public.equity_grants enable row level security;

drop policy if exists "equity_grants_select_own" on public.equity_grants;
create policy "equity_grants_select_own" on public.equity_grants
  for select using (auth.uid() = user_id);

drop policy if exists "equity_grants_insert_own" on public.equity_grants;
create policy "equity_grants_insert_own" on public.equity_grants
  for insert with check (auth.uid() = user_id);

drop policy if exists "equity_grants_update_own" on public.equity_grants;
create policy "equity_grants_update_own" on public.equity_grants
  for update using (auth.uid() = user_id);

drop policy if exists "equity_grants_delete_own" on public.equity_grants;
create policy "equity_grants_delete_own" on public.equity_grants
  for delete using (auth.uid() = user_id);
