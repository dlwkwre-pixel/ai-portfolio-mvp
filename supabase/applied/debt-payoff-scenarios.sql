-- Debt Payoff Planner — one row per named scenario. Debts are stored as a JSON
-- array so a scenario captures a full debt picture; the client computes the
-- avalanche/snowball amortization and payoff projections.

create table if not exists debt_payoff_scenarios (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null default 'My debts',
  -- [{ name, balance, apr, min_payment }]
  debts         jsonb not null default '[]'::jsonb,
  strategy      text  not null default 'avalanche',  -- 'avalanche' | 'snowball'
  extra_payment numeric not null default 0,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table debt_payoff_scenarios enable row level security;

create policy "Users manage own debt scenarios (select)"
  on debt_payoff_scenarios for select using (auth.uid() = user_id);
create policy "Users manage own debt scenarios (insert)"
  on debt_payoff_scenarios for insert with check (auth.uid() = user_id);
create policy "Users manage own debt scenarios (update)"
  on debt_payoff_scenarios for update using (auth.uid() = user_id);
create policy "Users manage own debt scenarios (delete)"
  on debt_payoff_scenarios for delete using (auth.uid() = user_id);
