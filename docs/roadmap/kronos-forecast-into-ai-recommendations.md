# Kronos forecast → AI recommendation engine — deferred (2026-08)

## Why

The standalone Kronos forecast panel (Watchlist page, shipped 2026-08) is display-only by design — it does not feed the Grok-based portfolio recommendation engine (`recommendation-actions.ts`). Wiring it in is a deliberate follow-on, not part of the initial build, because the rec engine's prompt/scoring surface is a different subsystem with its own review cadence, and it's worth learning whether the standalone panel is actually useful before threading a new AI signal into an already-complex prompt.

## Current state

- `lib/market-data/kronos.ts` — `getKronosForecast()`, a fail-soft client to a self-hosted Kronos-small inference service (Hugging Face Space, see `kronos-space/README.md`).
- `kronos_forecasts` table (`supabase/kronos-forecast-cache.sql`) — a 24h-TTL shared cache keyed by ticker (identical forecast for every user, so no per-user ownership).
- Surfaced only in `app/research/watchlist/watchlist-client.tsx`, as an on-demand "AI price forecast" button next to the existing "AI news scan" button.

## The idea

Feed the cached Kronos N-day forecast (direction + magnitude) into the Grok recommendation context as one more signal alongside fundamentals, analyst targets, and Reddit sentiment — framed as a model-based technical view that complements Grok's fundamental/news-driven read, not replaces it.

Needs, before building:
1. **Phrasing model uncertainty in the prompt** so a single-path forecast from a small (24.7M-param) model isn't over-weighted as false confidence next to Grok's more qualitative reasoning. Consider running Kronos with `sample_count > 1` (it already supports averaging multiple sampled paths) and surfacing a range, not a point estimate.
2. **Extending beyond watchlist to held positions** — right now the forecast only exists for tickers a user is watching, not tickers they own. The recommendation engine runs across the whole portfolio.
3. **Revisiting Hugging Face Spaces cold-start latency** once this sits inside a synchronous recommendation-generation run instead of a standalone user-initiated button — a 30-60s wait is fine for one on-demand click, less fine buried inside a multi-ticker batch job. A keep-warm cron (reusing the `CRON_SECRET`-gated pattern in `app/api/cron/*`, pinging the Space's `/health` on a schedule) or upgrading off the free tier would both help.

## Not now because

Scope discipline — ship the standalone panel, see whether it gets used, before threading a new AI signal into the existing recommendation engine's prompt.
