-- Decision Journal: capture WHY behind each buy/sell decision (thesis + conviction + emotion),
-- snapshot the price at decision time, and review later to score the reasoning vs the outcome.
-- One row per logged decision. RLS: each user sees only their own entries.

create table if not exists public.decision_journal (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  portfolio_id       uuid references public.portfolios (id) on delete set null,
  ticker             text not null,
  action             text not null,        -- buy | add | sell | trim | hold | watch
  thesis             text not null,        -- the user's reasoning at decision time
  conviction         text,                 -- low | medium | high
  emotion            text,                 -- confident | cautious | fearful | fomo | neutral
  price_at_decision  numeric,              -- snapshot price when logged (for outcome scoring)
  created_at         timestamptz not null default now(),
  reviewed_at        timestamptz,          -- when the user reflected on the outcome
  outcome_note       text                  -- the user's later reflection
);

create index if not exists decision_journal_user_idx on public.decision_journal (user_id, created_at desc);
create index if not exists decision_journal_ticker_idx on public.decision_journal (user_id, ticker);

alter table public.decision_journal enable row level security;

drop policy if exists "decision_journal_select_own" on public.decision_journal;
create policy "decision_journal_select_own" on public.decision_journal
  for select using (auth.uid() = user_id);

drop policy if exists "decision_journal_insert_own" on public.decision_journal;
create policy "decision_journal_insert_own" on public.decision_journal
  for insert with check (auth.uid() = user_id);

drop policy if exists "decision_journal_update_own" on public.decision_journal;
create policy "decision_journal_update_own" on public.decision_journal
  for update using (auth.uid() = user_id);

drop policy if exists "decision_journal_delete_own" on public.decision_journal;
create policy "decision_journal_delete_own" on public.decision_journal
  for delete using (auth.uid() = user_id);
