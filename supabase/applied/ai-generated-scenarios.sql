-- AI-generated macro scenario cards
-- Populated daily by /api/cron/generate-scenarios via Grok / Groq
-- Public read, write restricted to service role

create table if not exists ai_generated_scenarios (
  id              uuid        primary key default gen_random_uuid(),
  scenario_key    text        unique not null,          -- stable slug for upsert dedup
  title           text        not null,
  thesis          text        not null,
  emoji           text        not null default '📊',
  category        text        not null,
  tags            jsonb       not null default '[]',
  keywords        jsonb       not null default '[]',
  long_plays      jsonb       not null default '[]',    -- [{ticker, name, reason}]
  avoid_plays     jsonb       not null default '[]',    -- [{ticker, name, reason}]
  time_horizon    text        not null default 'weeks', -- days|weeks|months|years
  trigger_context text,                                 -- one-line description of the triggering news
  generated_at    timestamptz not null default now(),
  expires_at      timestamptz not null,
  is_active       boolean     not null default true
);

create index if not exists ai_scenarios_active_idx
  on ai_generated_scenarios (is_active, expires_at);

alter table ai_generated_scenarios enable row level security;

-- Anyone (including anonymous) can read active scenarios
create policy "public read ai scenarios"
  on ai_generated_scenarios
  for select
  using (true);

-- No user-level writes — service role bypasses RLS
