-- Email digest preferences: per-portfolio, per-user settings
create table if not exists portfolio_digest_preferences (
  id                   uuid        primary key default gen_random_uuid(),
  portfolio_id         uuid        not null references portfolios(id) on delete cascade,
  user_id              uuid        not null references auth.users(id) on delete cascade,

  -- Toggle & schedule
  enabled              boolean     not null default false,
  -- 'daily_close' = weekdays at market close
  -- 'weekly_monday' / 'weekly_friday' = that weekday only
  -- 'monthly_first' = 1st of each month
  frequency            text        not null default 'weekly_friday'
                                   check (frequency in ('daily_close','weekly_monday','weekly_friday','monthly_first')),

  -- Content toggles
  include_performance  boolean     not null default true,
  include_holdings     boolean     not null default true,
  include_earnings     boolean     not null default true,
  include_ai_score     boolean     not null default false,

  -- Optional override email (defaults to auth email)
  email_override       text,

  last_sent_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  unique(portfolio_id, user_id)
);

alter table portfolio_digest_preferences enable row level security;

create policy "Users can view own digest prefs"
  on portfolio_digest_preferences for select
  using (auth.uid() = user_id);

create policy "Users can insert own digest prefs"
  on portfolio_digest_preferences for insert
  with check (auth.uid() = user_id);

create policy "Users can update own digest prefs"
  on portfolio_digest_preferences for update
  using (auth.uid() = user_id);

create policy "Users can delete own digest prefs"
  on portfolio_digest_preferences for delete
  using (auth.uid() = user_id);
