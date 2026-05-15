-- FINN Investor Profile table
-- Stores FINN's evolving understanding of each user's investor identity

create table if not exists finn_profiles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  archetype   text not null,
  traits      text[] not null default '{}',
  updated_at  timestamptz not null default now(),
  constraint finn_profiles_user_id_unique unique (user_id)
);

alter table finn_profiles enable row level security;

create policy "Users can read own finn profile"
  on finn_profiles for select
  using (auth.uid() = user_id);

create policy "Users can insert own finn profile"
  on finn_profiles for insert
  with check (auth.uid() = user_id);

create policy "Users can update own finn profile"
  on finn_profiles for update
  using (auth.uid() = user_id);
