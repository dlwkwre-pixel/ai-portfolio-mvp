-- Durable, shared cache for the Research page's AI Digest (company overview,
-- news digest, earnings/financial snapshot). The digest route itself already
-- has a 30-minute in-memory cache for fast repeated hits on the same
-- serverless instance; this table is the persistent backstop so a cold
-- instance (or a completely separate consumer, like the MCP get_research
-- tool) can still read a recent digest instead of finding nothing. Same
-- ticker-keyed, no-ownership pattern as stock_ai_analyses and
-- kronos_forecasts — a digest is identical for every user.

create table if not exists public.research_digests (
  ticker        text primary key,
  data          jsonb not null,
  generated_at  timestamptz not null default now()
);

alter table public.research_digests enable row level security;

drop policy if exists "research_digests_select_authenticated" on public.research_digests;
create policy "research_digests_select_authenticated" on public.research_digests
  for select using (auth.role() = 'authenticated');
