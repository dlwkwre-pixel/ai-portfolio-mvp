-- Dedup ledger for brokerage activity import. Each SnapTrade activity (buy, sell,
-- dividend, deposit, withdrawal, fee) is imported once into portfolio_transactions
-- / cash_ledger; its id is recorded here so re-syncing never double-counts. If this
-- table is absent the import is skipped entirely (never imported un-deduped).
-- Service-role only.

create table if not exists public.brokerage_synced_activities (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  provider    text not null default 'snaptrade',
  activity_id text not null,
  created_at  timestamptz not null default now(),
  unique (user_id, provider, activity_id)
);

create index if not exists brokerage_synced_activities_user_idx on public.brokerage_synced_activities (user_id);

alter table public.brokerage_synced_activities enable row level security;
-- No user policies: only the service-role client (gated import route) reads/writes.
