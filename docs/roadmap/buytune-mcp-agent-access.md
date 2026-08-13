# BuyTune as an MCP server for a user's own AI agent — v0 (2026-08-13)

## Why

User wants to connect their own Claude/ChatGPT (with Robinhood's official "Agentic Trading" MCP integration, `agent.robinhood.com/mcp/trading`, launched May 2026) to actually place trades. Two architectures were considered:

1. **BuyTune-triggered cron job holding trading credentials** — rejected. This is the first thing in the whole project that would move real, irreversible money unattended, and every disclaimer already in this codebase asserts BuyTune is not a registered investment adviser. That posture doesn't survive BuyTune's own infrastructure autonomously executing trades.
2. **BuyTune as a pure read/analysis MCP source, user's own agent + own Robinhood account decides and trades** — what this is. BuyTune never touches a brokerage credential. The user's agent calls BuyTune for research, calls Robinhood (independently, under the user's own account) to act. Much cleaner liability boundary — same pattern as `worldmonitor.app`, which already ships an MCP server for its own read-only data.

## What's built (v0, 2026-08-13)

- `supabase/api-tokens.sql` — `api_tokens` table. Personal access tokens: raw token shown once at creation, only a SHA-256 hash persisted. `scopes` column defaults to `['read']` — **no write/trade scope exists**, by design.
- `lib/auth/api-tokens.ts` — `generateApiToken()` / `verifyApiToken()`. Verification has no Supabase auth session to check (that's the point of a token), so every query in a tool handler manually filters `.eq("user_id", userId)` against the service-role client — RLS doesn't fire under service-role, so this is the actual ownership check, not a backstop.
- `app/settings/api-tokens-client.tsx` + `api-tokens-actions.ts` — Settings > Connected AI Agents. Create/revoke tokens; raw token shown once with a copy button.
- `app/api/mcp/route.ts` — the MCP server itself, using `@modelcontextprotocol/sdk`'s `WebStandardStreamableHTTPServerTransport` in stateless mode (no sessionIdGenerator — each request independent, matches Vercel's serverless model). Bearer-token-gated before any MCP protocol handling happens.
- **Five tools**, all either cache/DB reads or a watchlist-only write (never a brokerage action):
  - `get_portfolio` — active portfolios + holdings (ticker, shares, cost basis)
  - `get_recommendation(ticker)` — cached AI verdict from `stock_ai_analyses`, embeds a disclaimer noting it's cached/offline/not personalized
  - `get_kronos_forecast(ticker)` — cached forecast from `kronos_forecasts`, embeds a disclaimer that names the 2026-08-13 backtest finding (didn't beat a naive baseline) directly in the response
  - `get_watchlist()` / `add_to_watchlist(ticker, ...)` — read/add the user's own watchlist, validates the ticker has a live quote before inserting (same check `watchlist-actions.ts` does)

## Connecting your own agent (Claude Desktop / Claude Code)

1. Settings → Connected AI Agents → name it, create a token, copy it (shown once).
2. Add an MCP server pointing at `https://buytuneio.vercel.app/api/mcp` (or `http://localhost:3000/api/mcp` locally) with `Authorization: Bearer <token>`.
3. Ask the agent to check your BuyTune portfolio — it should call `get_portfolio` and get back JSON including holdings and an embedded `disclaimer` field.

## Deferred / not built yet

- **`run_ai_analysis` / `get_research`**: deliberately skipped in this batch. `run_ai_analysis` would spend real Grok tokens on every call from a context with no rate limiting yet — needs its own cost-control design before it's safe to expose to an agent that might loop. `get_research`'s digest cache (`app/api/research/digest/route.ts`) is in-memory, not Supabase-backed, so it isn't readable from a separate MCP request/serverless invocation without first giving it a persistent cache table (same pattern as `stock_ai_analyses`).
- **Disclaimer propagation**: all five current tools embed a disclaimer field now. Any future tool needs the same — an agent calling the API directly never sees the UI's caveat text, so it has to be structured data in the response, not decoration on a page.
- **Rate limiting** on the token verification path — currently none. Worth adding before this is used beyond one person's own testing.
- **Scopes beyond `read`** — the column exists but nothing beyond read is implemented or should be, until there's a specific, deliberately-designed reason to add a write scope (and that's a much bigger conversation than this one).
