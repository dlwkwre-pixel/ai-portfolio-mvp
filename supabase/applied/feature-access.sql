-- Admin-controlled feature allowlist. Until there's a payment tier, the admin
-- decides which users can reach the account-connection features (brokerage via
-- SnapTrade, bank via Plaid). A row here = that user is granted that feature.
-- Writes happen only through the ADMIN_EMAIL-gated server actions using the
-- service-role client; users may read their OWN grants to gate their UI.

create table if not exists public.feature_access (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  feature     text not null,                 -- 'brokerage_connect' | 'bank_connect'
  granted_by  uuid,                           -- admin user id who granted it
  granted_at  timestamptz not null default now(),
  unique (user_id, feature)
);

create index if not exists feature_access_user_idx on public.feature_access (user_id);

alter table public.feature_access enable row level security;

-- Users can see their own grants (to show/hide the connect UI). No user write
-- policies: only the service-role client (admin actions) inserts/deletes.
drop policy if exists "feature_access_select_own" on public.feature_access;
create policy "feature_access_select_own" on public.feature_access
  for select using (auth.uid() = user_id);
