-- Add send time + timezone to email digest preferences
-- Run this after email-digest-setup.sql

alter table portfolio_digest_preferences
  add column if not exists send_hour integer not null default 16
    check (send_hour >= 0 and send_hour <= 23),
  add column if not exists timezone text not null default 'America/Chicago';
