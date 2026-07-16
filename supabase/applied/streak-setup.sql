-- Daily activity streaks on user_profiles
-- Tracks consecutive days a user has visited the app.
-- Run this in the Supabase SQL editor.

alter table user_profiles
  add column if not exists login_streak    int not null default 0,
  add column if not exists longest_streak  int not null default 0,
  add column if not exists last_active_date date;
