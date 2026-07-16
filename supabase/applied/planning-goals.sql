-- Goal-based buckets: named savings goals (house, travel, fund, etc.) with a target, a date,
-- and how much is set aside — so each goal shows a funded % and the monthly pace to hit it.
-- RLS: each user sees only their own goals.

create table if not exists public.planning_goals (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  name            text not null,
  category        text not null default 'other',  -- house|car|travel|education|retirement|emergency|wedding|fund|other
  target_amount   numeric not null,
  current_amount  numeric not null default 0,
  target_year     int,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists planning_goals_user_idx on public.planning_goals (user_id, sort_order);

alter table public.planning_goals enable row level security;

drop policy if exists "planning_goals_select_own" on public.planning_goals;
create policy "planning_goals_select_own" on public.planning_goals for select using (auth.uid() = user_id);
drop policy if exists "planning_goals_insert_own" on public.planning_goals;
create policy "planning_goals_insert_own" on public.planning_goals for insert with check (auth.uid() = user_id);
drop policy if exists "planning_goals_update_own" on public.planning_goals;
create policy "planning_goals_update_own" on public.planning_goals for update using (auth.uid() = user_id);
drop policy if exists "planning_goals_delete_own" on public.planning_goals;
create policy "planning_goals_delete_own" on public.planning_goals for delete using (auth.uid() = user_id);
