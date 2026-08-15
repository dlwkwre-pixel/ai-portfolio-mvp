-- Audit trail for an AI agent's trading reasoning (e.g. a scheduled Claude
-- Cowork run deciding what to do with a linked Robinhood account). Written
-- only via the MCP log_trading_decision tool (service-role client) — this is
-- a record of what an agent decided and why, not something a user edits by
-- hand. Surfaces in the next daily email digest under "AI Trading Activity"
-- (see lib/email/build-digest-sections.ts).
--
-- portfolio_id is nullable: a decision tied to a specific BuyTune portfolio
-- (the common case) only shows in that portfolio's digest; a null
-- portfolio_id (general commentary not tied to one account) shows in all of
-- the user's portfolio digests for that day.

create table if not exists public.trading_decision_log (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  portfolio_id uuid references public.portfolios (id) on delete set null,
  ticker       text,
  action       text not null,
  reasoning    text not null,
  source       text not null default 'agent',
  created_at   timestamptz not null default now()
);

create index if not exists trading_decision_log_user_created_idx on public.trading_decision_log (user_id, created_at desc);

alter table public.trading_decision_log enable row level security;

-- Users can read their own log (a future review page could use this
-- directly with a user-session client) but never write to it themselves —
-- no insert/update/delete policy. Every write goes through the MCP tool's
-- service-role client after its own ownership check.
drop policy if exists "trading_decision_log_select_own" on public.trading_decision_log;
create policy "trading_decision_log_select_own" on public.trading_decision_log
  for select using (auth.uid() = user_id);
