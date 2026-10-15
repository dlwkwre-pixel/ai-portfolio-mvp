-- Error monitoring: browser errors (window.onerror / unhandled rejections / error
-- boundaries, reported via /api/client-errors) and server errors (instrumentation.ts
-- onRequestError). Viewed at /admin/errors. Written and read only with the service-role
-- client, so RLS is on with no policies — no user can read or write rows directly.

create table if not exists public.app_errors (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source text not null check (source in ('client', 'server')),
  message text not null,
  stack text,
  path text,
  digest text,
  fingerprint text not null,          -- groups repeats of the same error on the same route
  user_id uuid references auth.users (id) on delete set null,
  user_agent text,
  context jsonb
);

create index if not exists app_errors_created_idx on public.app_errors (created_at desc);
create index if not exists app_errors_fingerprint_idx on public.app_errors (fingerprint, created_at desc);

alter table public.app_errors enable row level security;
