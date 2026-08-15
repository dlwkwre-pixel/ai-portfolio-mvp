# BuyTune as an MCP server for a user's own AI agent (2026-08-13/14)

## Why

User wants to connect their own Claude/ChatGPT (with Robinhood's official "Agentic Trading" MCP integration, `agent.robinhood.com/mcp/trading`, launched May 2026) to actually place trades. Two architectures were considered:

1. **BuyTune-triggered cron job holding trading credentials** — rejected. This is the first thing in the whole project that would move real, irreversible money unattended, and every disclaimer already in this codebase asserts BuyTune is not a registered investment adviser. That posture doesn't survive BuyTune's own infrastructure autonomously executing trades.
2. **BuyTune as a pure read/analysis MCP source, user's own agent + own Robinhood account decides and trades** — what this is. BuyTune never touches a brokerage credential. The user's agent calls BuyTune for research, calls Robinhood (independently, under the user's own account) to act. Much cleaner liability boundary — same pattern as `worldmonitor.app`, which already ships an MCP server for its own read-only data.

## What's built

- `supabase/applied/api-tokens.sql` — `api_tokens` table. Personal access tokens: raw token shown once at creation, only a SHA-256 hash persisted. `scopes` column defaults to `['read']` — **no write/trade scope exists**, by design.
- `lib/auth/api-tokens.ts` — `generateApiToken()` / `verifyApiToken()`. Verification has no Supabase auth session to check (that's the point of a token), so every query in a tool handler manually filters `.eq("user_id", userId)` against the service-role client — RLS doesn't fire under service-role, so this is the actual ownership check, not a backstop.
- `app/settings/api-tokens-client.tsx` + `api-tokens-actions.ts` — Settings > Connected AI Agents. Create/revoke tokens; raw token shown once with a copy button.
- `app/api/mcp/route.ts` — the MCP server itself, using `@modelcontextprotocol/sdk`'s `WebStandardStreamableHTTPServerTransport` in stateless mode (no sessionIdGenerator — each request independent, matches Vercel's serverless model). Bearer-token-gated, then rate-limited (60 req/min per user, keyed by userId not IP since an agent's calls may all come from shared provider infrastructure), before any MCP protocol handling happens.
- `supabase/applied/research-digest-cache.sql` — persistent, ticker-keyed cache for the Research page's AI Digest, mirrored from the `/api/research/digest` route's existing in-memory cache (still primary/fast path; this is the durable backstop + what makes `get_research` possible from a separate serverless invocation).
- **Seven tools**:
  - `get_portfolio` — active portfolios + holdings (ticker, shares, cost basis). Read-only.
  - `get_recommendation(ticker)` — cached AI verdict from `stock_ai_analyses`. Read-only, no fresh call.
  - `run_ai_analysis(ticker)` — same verdict, but regenerates if stale (>12h). This is the cheap, free-tier-model "quick take," not the paid live-search Grok deep-dive — internally calls the existing unauthenticated `/api/research/ai-analysis` route, which has its own 12h cache.
  - `get_kronos_forecast(ticker)` — cached forecast from `kronos_forecasts`. Read-only. Disclaimer names the 2026-08-13 backtest finding (didn't beat a naive baseline) directly in the response.
  - `get_research(ticker)` — cached AI Digest from `research_digests`. Read-only, no fresh call (a fresh digest costs a Gemini call, stays user-initiated in the app).
  - `get_watchlist()` / `add_to_watchlist(ticker, ...)` — read/add the user's own watchlist. `add_to_watchlist` validates the ticker has a live quote before inserting (same check `watchlist-actions.ts` does).

All seven verified live end-to-end (real token, real `tools/list` + `tools/call` round trips, including a real digest generate → `get_research` read-back).

## Connecting your own agent (Claude Desktop / Claude Code — static token)

1. Settings → Connected AI Agents → name it, create a token, copy it (shown once).
2. Add an MCP server pointing at `https://buytune.io/api/mcp` (or `http://localhost:3000/api/mcp` locally) with `Authorization: Bearer <token>`.
3. Ask the agent to check your BuyTune portfolio — it should call `get_portfolio` and get back JSON including holdings and an embedded `disclaimer` field.

User has this set up but hasn't connected an agent yet (2026-08-14) — deliberate, wanted the surface ready before actually wiring in Robinhood's MCP alongside it.

## OAuth 2.1 (claude.ai web Connectors — 2026-08-15)

Claude Desktop's config file can hold a static bearer token directly, but claude.ai's web "Connectors" screen expects real OAuth (it shows Client ID / Client Secret fields, has no static-token option). Built a full spec-compliant authorization server alongside the static-token flow above — both issue tokens `/api/mcp` accepts, neither depends on the other.

**Spec surface implemented** (MCP Authorization, 2025-11-25 revision — OAuth 2.1 + PKCE S256 mandatory + RFC 7591/8414/9728):
- `GET /.well-known/oauth-protected-resource` — RFC 9728. Points a client at `authorization_servers: ["https://buytune.io"]` after it gets a 401 from `/api/mcp`.
- `GET /.well-known/oauth-authorization-server` — RFC 8414. Advertises the three endpoints below, `code_challenge_methods_supported: ["S256"]`, `token_endpoint_auth_methods_supported: ["none"]` (public client, no secret — see below).
- `POST /api/oauth/register` — RFC 7591 Dynamic Client Registration, unauthenticated. Validates `redirect_uris` (must be `https://`, or `http://localhost` for local dev), returns a `client_id` with **no `client_secret`** — this is a public client per RFC 8252 (a native/hosted client can't keep a secret safe anyway), so security is PKCE + exact redirect_uri match + single-use codes instead.
- `GET /oauth/authorize` + `app/oauth/authorize/consent-actions.ts` — the human consent screen. Validates `client_id`/`redirect_uri` against the DB *before* trusting the redirect (unknown client → dead-end error page, not a redirect); once trusted, every further failure (bad `response_type`, missing/wrong PKCE method, `resource` not matching `https://buytune.io/api/mcp`) bounces back to the client as a standard OAuth error instead of dead-ending. No session → redirects to `/login?next=...` (mirrors `app/login/page.tsx`'s existing pattern) and returns here after sign-in. Approve mints a single-use authorization code; Deny bounces back with `error=access_denied`. Both server actions re-validate client_id/redirect_uri independently of the GET page, since a `<form action>` is its own reachable POST endpoint.
- `POST /api/oauth/token` — `authorization_code` grant (verifies PKCE via `lib/oauth/crypto.ts`'s `verifyPkce`, single-use code enforced by deleting the row on first read in `consumeAuthorizationCode`) and `refresh_token` grant (rotates on every use — old refresh token marked `rotated_at`, new pair shares the same `family_id`). Presenting an already-rotated refresh token is treated as theft: the entire token family gets revoked in one query (`lib/oauth/tokens.ts`'s `rotateRefreshToken`).
- `app/api/mcp/route.ts` — now accepts both token flavors by prefix (`bt_live_...` → `api_tokens` table via `verifyApiToken`; `bt_at_...` → `oauth_tokens` table via `verifyOAuthAccessToken`), and its 401 response carries `WWW-Authenticate: Bearer resource_metadata="..."` per spec so a client can discover the authorization server automatically.

**Schema**: `supabase/oauth-server.sql` — `oauth_clients`, `oauth_authorization_codes`, `oauth_tokens`. All three RLS-enabled with zero policies (service-role-only, same posture as `oauth_authorization_codes` holding pre-auth secrets and `oauth_tokens` holding live credentials — no authenticated user should ever SELECT these directly, not even their own rows). **Not yet applied — needs to be run in the Supabase SQL editor before this goes live**, then moved to `supabase/applied/` per the repo convention.

**Deliberately identical constraints to the static-token flow**: same `read`-only scope, same `/api/mcp` tool surface, same rate limit. This is a different front door onto the exact same permission model, not a bigger one.

## Deliberately not built

- **The paid live-search Grok deep-dive and fresh Kronos inference as MCP tools** — both cost real money/time per call (Grok live search, up to a minute for a fresh Kronos run) and have no per-call budget cap yet. `run_ai_analysis` was safe to add because it's the cheap free-tier path with its own cache; these two are a different cost profile and need their own design before being exposed to something that might call them in a loop.
- **Scopes beyond `read`** — the column exists but nothing beyond read is implemented or should be, until there's a specific, deliberately-designed reason to add a write scope (and that's a much bigger conversation than this one).
