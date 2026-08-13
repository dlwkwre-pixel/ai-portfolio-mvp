-- Personal access tokens — lets a user's own AI agent (Claude, ChatGPT, etc.)
-- authenticate to BuyTune's MCP server as them, without their browser session
-- cookie. Read-only by design for now (see `scopes`): this is a data source
-- for a user's own agent, not a write/trading surface — BuyTune never holds
-- brokerage credentials itself.
--
-- The raw token is shown to the user exactly once at creation time and never
-- stored — only a SHA-256 hash, so a DB leak doesn't hand out usable tokens.

create table if not exists public.api_tokens (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  name          text not null,                          -- user-facing label, e.g. "Claude Desktop"
  token_hash    text not null unique,                    -- sha256(raw token), hex
  token_prefix  text not null,                           -- first chars of the raw token, for UI identification only
  scopes        text[] not null default array['read'],   -- 'read' only for now; no write/trade scope exists yet
  last_used_at  timestamptz,
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz
);

create index if not exists api_tokens_user_idx on public.api_tokens (user_id);

alter table public.api_tokens enable row level security;

-- Users manage their own tokens directly (create/revoke from Settings).
-- Verification at request time goes through the service-role client instead
-- (see lib/auth/api-tokens.ts) since an incoming Bearer token has no Supabase
-- auth session to check auth.uid() against yet — that's the whole point of it.
drop policy if exists "api_tokens_own" on public.api_tokens;
create policy "api_tokens_own" on public.api_tokens
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
