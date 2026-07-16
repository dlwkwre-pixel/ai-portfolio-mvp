-- Brokerage connections (SnapTrade). One row per user. Holds the SnapTrade
-- per-user secret (sensitive) and points at the read-only portfolio we mirror
-- their positions into. Writes/reads happen only through the service-role client
-- in gated API routes, never the browser, so no user RLS policies are granted.

create table if not exists public.brokerage_connections (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users (id) on delete cascade,
  provider              text not null default 'snaptrade',
  snaptrade_user_id     text,               -- the id we registered with SnapTrade (= our user id)
  snaptrade_user_secret text,               -- SENSITIVE — service-role only
  connected             boolean not null default false,
  portfolio_id          uuid,               -- the synced read-only portfolio
  last_synced_at        timestamptz,
  last_error            text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (user_id, provider)
);

create index if not exists brokerage_connections_user_idx on public.brokerage_connections (user_id);

alter table public.brokerage_connections enable row level security;
-- No user policies: only the service-role client (in ADMIN/feature-gated routes) touches this.
