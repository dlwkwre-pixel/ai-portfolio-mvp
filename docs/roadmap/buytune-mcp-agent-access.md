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
- **Eleven tools**:
  - `get_portfolio` — active portfolios + holdings (ticker, shares, cost basis). Read-only.
  - `get_recommendation(ticker)` — cached AI verdict from `stock_ai_analyses`. Read-only, no fresh call.
  - `run_ai_analysis(ticker)` — same verdict, but regenerates if stale (>12h). This is the cheap, free-tier-model "quick take," not the paid live-search Grok deep-dive — internally calls the existing unauthenticated `/api/research/ai-analysis` route, which has its own 12h cache.
  - `run_deep_analysis(ticker)` — the paid live-search Grok deep-dive (2026-08-15). Shares a 12h cache with the Research page's own deep-dive button (`stock_ai_analyses`, key `grok:<ticker>`) via `lib/ai/grok-deep-dive.ts`, PLUS a per-connection daily cap (`DEEP_ANALYSIS_DAILY_CAP = 10`, in-memory best-effort) on top of that, since this is real money per call with an agent capable of looping far faster than a human clicking a button.
  - `get_kronos_forecast(ticker)` — cached forecast from `kronos_forecasts`. Read-only. Disclaimer names the 2026-08-13 backtest finding (didn't beat a naive baseline) directly in the response.
  - `get_research(ticker)` — cached AI Digest from `research_digests`. Read-only, no fresh call (a fresh digest costs a Gemini call, stays user-initiated in the app).
  - `get_strategies()` — the user's saved strategies (rules, guidance text) plus the portfolio + holdings each is currently assigned to (2026-08-15). This is the personalized layer the generic per-ticker tools above don't have.
  - `get_watchlist()` / `add_to_watchlist(ticker, ...)` — read/add the user's own watchlist. `add_to_watchlist` validates the ticker has a live quote before inserting (same check `watchlist-actions.ts` does).
  - `get_financial_profile()` — risk tolerance, retirement horizon, tax filing status/state, income/expenses, 401(k) (2026-08-15). Curated subset of `financial_profiles` — excludes home/mortgage detail and partner/kids fields as not relevant to investing decisions.
  - `get_net_worth_summary(history_days?)` — current + recent daily net worth trend from `net_worth_history` (2026-08-15).

All eleven verified live end-to-end against real account data (real token, real `tools/list` + `tools/call` round trips).

**Two real bugs found via that testing, both fixed same-day (2026-08-15):**
- `get_portfolio` always returned holdings as `[]` — it filtered the `holdings` query on `.eq("user_id", userId)`, but `holdings` has no `user_id` column at all. Supabase errored on the bad column reference and the code silently swallowed the error into an empty array (`const { data } = ...` with no error check), so this had been broken since the tool shipped. Ownership was already guaranteed via `portfolio_id`, itself scoped through the user's own `portfolios` query — the filter was both wrong and redundant. Found because Claude web reported "empty holdings" when actually testing against a real account with real positions.
- `run_deep_analysis` / the Grok deep-dive cache was silently not persisting: the cache write was `void supabase.from("stock_ai_analyses").upsert(...)` (fire-and-forget, inherited from the original `/api/research/grok-analysis` route), and serverless can freeze a function's execution right after its response is sent — killing that write before it commits. Confirmed empirically: two `run_deep_analysis` calls a few seconds apart returned *different* price targets, meaning it silently re-ran the paid Grok call every time instead of caching. Fixed by awaiting the upsert in the now-shared `lib/ai/grok-deep-dive.ts`. Worth periodically grepping this codebase for other `void supabase.from(...)` writes that matter for correctness (not just fire-and-forget-safe ones like `last_used_at` bumps) — this pattern is easy to reach for and easy to get away with until something depends on the write actually landing.

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

**Schema**: `supabase/applied/oauth-server.sql` — `oauth_clients`, `oauth_authorization_codes`, `oauth_tokens`. All three RLS-enabled with zero policies (service-role-only, same posture as `oauth_authorization_codes` holding pre-auth secrets and `oauth_tokens` holding live credentials — no authenticated user should ever SELECT these directly, not even their own rows). Applied 2026-08-15.

**Deliberately identical constraints to the static-token flow**: same `read`-only scope, same `/api/mcp` tool surface, same rate limit. This is a different front door onto the exact same permission model, not a bigger one.

## Deliberately not built

- **Fresh Kronos inference as an MCP tool** — up to a minute per call, no per-call budget cap. `get_kronos_forecast` stays cache-only.
- **Full Planning OS as MCP tools** — only `get_financial_profile` and `get_net_worth_summary` are exposed (2026-08-15), a curated subset relevant to investing decisions. The individual sub-planners (home, car, wedding, elder-care, etc.) are scenario-planning tools unrelated to "help decide what to do with an agentic Robinhood account" and weren't added.
- **Scopes beyond `read`** — the column exists but nothing beyond read is implemented or should be, until there's a specific, deliberately-designed reason to add a write scope (and that's a much bigger conversation than this one).

## Why this exists (2026-08-15 update)

User's actual workflow: Claude is the "director" (reasons, decides, and — via Robinhood's own separate Agentic Trading MCP — executes), BuyTune is the "analyst" (supplies portfolio state, strategy rules, research, and financial context). This is why the tool surface leans toward *more read access* rather than staying minimal — the explicit goal is giving Claude enough real context to reason well, not just proving the plumbing works. The boundary that doesn't move: BuyTune still never executes anything and never expands past `read` + the one narrow watchlist write.
