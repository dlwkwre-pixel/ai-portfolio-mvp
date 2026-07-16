-- Relocation / Cost-of-Living Planner — one row per saved scenario.
create table if not exists relocation_scenarios (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references auth.users(id) on delete cascade,
  name                     text not null default 'New city',
  current_city             text,
  new_city                 text,
  is_remote                boolean not null default false,
  current_income_monthly   numeric not null default 0,
  new_income_monthly       numeric not null default 0,
  current_expenses_monthly numeric not null default 0,
  col_delta_pct            numeric not null default 0,  -- new city cost of living vs current, %
  moving_cost              numeric not null default 0,
  notes                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

alter table relocation_scenarios enable row level security;

create policy "Users manage own relocation scenarios (select)"
  on relocation_scenarios for select using (auth.uid() = user_id);
create policy "Users manage own relocation scenarios (insert)"
  on relocation_scenarios for insert with check (auth.uid() = user_id);
create policy "Users manage own relocation scenarios (update)"
  on relocation_scenarios for update using (auth.uid() = user_id);
create policy "Users manage own relocation scenarios (delete)"
  on relocation_scenarios for delete using (auth.uid() = user_id);
