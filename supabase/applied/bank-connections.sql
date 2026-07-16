-- Plaid bank connections (balances-first, read-only).
-- bank_connections holds the access token → SERVICE ROLE ONLY, no user-facing policies.
-- bank_accounts holds balances → users may read their own rows.
--
-- Safe to run more than once.

create table if not exists public.bank_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null default 'plaid',
  item_id text not null unique,
  access_token text not null,
  institution_name text,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bank_connections enable row level security;
-- No user policies on purpose: the access token must only be reachable via the
-- service role (API routes). RLS-on with no policies = deny all to users.

create index if not exists bank_connections_user_idx on public.bank_connections (user_id);

create table if not exists public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id text not null,
  account_id text not null unique,
  name text not null,
  official_name text,
  mask text,
  type text not null default 'depository',
  subtype text,
  balance_current numeric,
  balance_available numeric,
  iso_currency text default 'USD',
  updated_at timestamptz not null default now()
);

alter table public.bank_accounts enable row level security;

drop policy if exists "bank_accounts_select_own" on public.bank_accounts;
create policy "bank_accounts_select_own" on public.bank_accounts
  for select using (auth.uid() = user_id);

create index if not exists bank_accounts_user_idx on public.bank_accounts (user_id);
create index if not exists bank_accounts_item_idx on public.bank_accounts (item_id);
