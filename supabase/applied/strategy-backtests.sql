-- Persists each backtest run so results can be compared over time (before
-- vs. after tuning a stop-loss, etc.) instead of being lost the moment the
-- panel closes. Written directly by the user's own session client from
-- app/api/strategies/backtest/route.ts — not an admin-only audit table like
-- trading_decision_log, so users get full CRUD on their own rows.

create table if not exists public.strategy_backtests (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  strategy_id     uuid not null references public.strategies (id) on delete cascade,
  strategy_name   text not null,
  lookback        text not null,
  params_json     jsonb not null,
  stats_json      jsonb not null,
  equity_curve_json jsonb not null,
  created_at      timestamptz not null default now()
);

create index if not exists strategy_backtests_strategy_created_idx
  on public.strategy_backtests (strategy_id, created_at desc);
create index if not exists strategy_backtests_user_created_idx
  on public.strategy_backtests (user_id, created_at desc);

alter table public.strategy_backtests enable row level security;

drop policy if exists "strategy_backtests_select_own" on public.strategy_backtests;
create policy "strategy_backtests_select_own" on public.strategy_backtests
  for select using (auth.uid() = user_id);

drop policy if exists "strategy_backtests_insert_own" on public.strategy_backtests;
create policy "strategy_backtests_insert_own" on public.strategy_backtests
  for insert with check (auth.uid() = user_id);

drop policy if exists "strategy_backtests_delete_own" on public.strategy_backtests;
create policy "strategy_backtests_delete_own" on public.strategy_backtests
  for delete using (auth.uid() = user_id);
