-- Admin-controlled page denylist — the inverse of feature_access.
-- Every account starts with access to every page; a row here REVOKES one
-- section for one user (e.g. block a specific account from Planning + Tax).
-- Writes happen only through the ADMIN_EMAIL-gated server actions using the
-- service-role client; users may read their OWN blocks so the section layouts
-- can enforce them server-side.

create table if not exists public.page_blocks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  page        text not null,                 -- 'planning' | 'tax' | 'research' | ...
  blocked_by  uuid,                          -- admin user id who revoked it
  blocked_at  timestamptz not null default now(),
  unique (user_id, page)
);

create index if not exists page_blocks_user_idx on public.page_blocks (user_id);

alter table public.page_blocks enable row level security;

-- Users can see their own blocks (so layouts can redirect). No user write
-- policies: only the service-role client (admin actions) inserts/deletes.
drop policy if exists "page_blocks_select_own" on public.page_blocks;
create policy "page_blocks_select_own" on public.page_blocks
  for select using (auth.uid() = user_id);
