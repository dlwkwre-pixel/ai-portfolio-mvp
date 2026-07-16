-- Remembers which BuyTune portfolio each linked brokerage account defaults to,
-- so re-syncs are one click. Per-position overrides are derived at reconcile time
-- (a ticker updates in whatever portfolio it already lives in), so only the
-- account-level default needs persisting here. Service-role only.

create table if not exists public.brokerage_account_links (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users (id) on delete cascade,
  provider             text not null default 'snaptrade',
  snaptrade_account_id text not null,
  default_portfolio_id uuid,
  account_label        text,
  updated_at           timestamptz not null default now(),
  unique (user_id, provider, snaptrade_account_id)
);

create index if not exists brokerage_account_links_user_idx on public.brokerage_account_links (user_id);

alter table public.brokerage_account_links enable row level security;
-- No user policies: only the service-role client (gated routes) reads/writes.
