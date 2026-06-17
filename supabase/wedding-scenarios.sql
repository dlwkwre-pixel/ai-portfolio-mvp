-- Wedding Planner — one row per saved scenario.
create table if not exists wedding_scenarios (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  name                text not null default 'Our wedding',
  wedding_date        date,
  guest_count         integer not null default 100,
  total_budget        numeric not null default 30000,
  amount_saved        numeric not null default 0,
  monthly_contribution numeric not null default 0,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table wedding_scenarios enable row level security;

create policy "Users manage own wedding scenarios (select)"
  on wedding_scenarios for select using (auth.uid() = user_id);
create policy "Users manage own wedding scenarios (insert)"
  on wedding_scenarios for insert with check (auth.uid() = user_id);
create policy "Users manage own wedding scenarios (update)"
  on wedding_scenarios for update using (auth.uid() = user_id);
create policy "Users manage own wedding scenarios (delete)"
  on wedding_scenarios for delete using (auth.uid() = user_id);
