-- Lets a user see (but not directly write) their own active OAuth connector
-- grants for Settings > Connected AI Agents, and revoke one without touching
-- anything else. Revocation still goes through lib/oauth/tokens.ts's
-- revokeGrantFamily (admin client + explicit ownership check) rather than a
-- direct RLS write policy — oauth_tokens' rotation/family bookkeeping is
-- easy to corrupt with a partial client-side update, so writes stay
-- centralized; only reads are opened up here.
--
-- Also adds last_used_at/ip/user_agent, bumped best-effort on every verified
-- MCP call (mirrors api_tokens.last_used_at) — a lightweight, self-serve way
-- for a user to notice "that's not a place/device I use" on their own,
-- without BuyTune needing to build any real breach-detection infrastructure.

alter table public.oauth_tokens add column if not exists last_used_at timestamptz;
alter table public.oauth_tokens add column if not exists last_used_ip text;
alter table public.oauth_tokens add column if not exists last_used_user_agent text;

drop policy if exists "oauth_tokens_select_own" on public.oauth_tokens;
create policy "oauth_tokens_select_own" on public.oauth_tokens
  for select using (auth.uid() = user_id);
