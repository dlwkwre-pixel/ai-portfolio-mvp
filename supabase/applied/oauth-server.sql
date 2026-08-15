-- OAuth 2.1 authorization server for BuyTune's MCP integration (RFC 7591
-- Dynamic Client Registration, RFC 8414 Authorization Server Metadata, RFC
-- 9728 Protected Resource Metadata, PKCE S256). Lets a hosted agent platform
-- (e.g. claude.ai Connectors) register itself, take a user through a login +
-- consent screen, and receive short-lived tokens scoped to that one user —
-- without the user ever handling a static bearer token. The existing
-- api_tokens PAT flow (Claude Desktop / manual config) stays untouched and
-- keeps working alongside this.
--
-- All three tables are service-role-only (RLS enabled, zero policies): every
-- row here is either pre-auth (an authorization code, sensitive until
-- exchanged) or a live credential, so no authenticated user should ever be
-- able to SELECT another row — even their own — directly via PostgREST.
-- All reads/writes go through lib/oauth/*.ts using the admin client, exactly
-- like lib/auth/api-tokens.ts already does for the PAT table.

-- Public OAuth clients registered via POST /api/oauth/register. No client
-- secret is ever issued or stored — these are public clients per RFC 8252
-- (native/SPA-style apps can't keep a secret), security instead comes from
-- exact redirect_uri matching + mandatory PKCE on every authorization_code
-- exchange.
create table if not exists public.oauth_clients (
  client_id     text primary key,
  client_name   text not null,
  redirect_uris text[] not null,
  created_at    timestamptz not null default now()
);

alter table public.oauth_clients enable row level security;

-- Single-use authorization codes from the /oauth/authorize consent screen.
-- Only the hash is stored (mirrors api_tokens' token_hash pattern) so a DB
-- leak alone can't be exchanged for a token. Deleted (not just marked) on
-- successful exchange — see lib/oauth/token.ts.
create table if not exists public.oauth_authorization_codes (
  code_hash      text primary key,
  client_id      text not null references public.oauth_clients (client_id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  redirect_uri   text not null,
  code_challenge text not null,
  resource       text,
  expires_at     timestamptz not null,
  created_at     timestamptz not null default now()
);

create index if not exists oauth_authorization_codes_expires_idx on public.oauth_authorization_codes (expires_at);

alter table public.oauth_authorization_codes enable row level security;

-- Access + refresh token pairs issued at the token endpoint. Refresh tokens
-- rotate on every use (`rotated_at` gets set the moment a refresh token is
-- consumed to mint the next pair) and share a `family_id` across the whole
-- chain back to the original grant. If a refresh token with `rotated_at`
-- already set is presented again, that's proof of token theft (someone is
-- replaying a token we already superseded) — the whole family gets revoked
-- in one UPDATE ... WHERE family_id = X, killing every descendant token too.
create table if not exists public.oauth_tokens (
  id                 uuid primary key default gen_random_uuid(),
  family_id          uuid not null,
  client_id          text not null references public.oauth_clients (client_id) on delete cascade,
  user_id            uuid not null references auth.users (id) on delete cascade,
  access_token_hash  text not null unique,
  refresh_token_hash text unique,
  access_expires_at  timestamptz not null,
  refresh_expires_at timestamptz,
  rotated_at         timestamptz,
  revoked_at         timestamptz,
  created_at         timestamptz not null default now()
);

create index if not exists oauth_tokens_family_idx on public.oauth_tokens (family_id);
create index if not exists oauth_tokens_user_idx on public.oauth_tokens (user_id);

alter table public.oauth_tokens enable row level security;
