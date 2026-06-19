-- Feedback responses from the "Are you enjoying BuyTune?" prompt.
-- Users submit a 1–5 star rating plus an optional free-text note.
-- The admin reads all rows through the service-role client on /admin/feedback.

create table if not exists public.feedback_responses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  rating      smallint not null check (rating between 1 and 5),
  feedback    text,
  created_at  timestamptz not null default now()
);

create index if not exists feedback_responses_created_at_idx
  on public.feedback_responses (created_at desc);

alter table public.feedback_responses enable row level security;

-- Users may insert their own response. RLS is the safety net; the API route
-- also verifies ownership before inserting.
drop policy if exists "feedback_insert_own" on public.feedback_responses;
create policy "feedback_insert_own"
  on public.feedback_responses
  for insert
  with check (auth.uid() = user_id);

-- Users may read their own responses (e.g. to avoid re-prompting). No policy
-- grants cross-user reads — the admin dashboard uses the service-role key,
-- which bypasses RLS, so only the ADMIN_EMAIL-gated page can list everyone.
drop policy if exists "feedback_select_own" on public.feedback_responses;
create policy "feedback_select_own"
  on public.feedback_responses
  for select
  using (auth.uid() = user_id);
