-- Per-user weekly portfolio recap cache
-- Keyed by user_id + week_start so each user gets their own personalized recap.

create table if not exists portfolio_weekly_recaps (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  narrative text not null,
  week_return_pct numeric,
  best_ticker text,
  worst_ticker text,
  generated_at timestamptz not null default now(),
  unique(user_id, week_start)
);

alter table portfolio_weekly_recaps enable row level security;

create policy "Users can read own recaps"
  on portfolio_weekly_recaps for select
  using (auth.uid() = user_id);

create policy "Users can insert own recaps"
  on portfolio_weekly_recaps for insert
  with check (auth.uid() = user_id);

create policy "Users can update own recaps"
  on portfolio_weekly_recaps for update
  using (auth.uid() = user_id);
