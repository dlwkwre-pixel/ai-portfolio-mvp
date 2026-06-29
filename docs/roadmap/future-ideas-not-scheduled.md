# Future ideas — parked, NOT scheduled (captured 2026-06-28)

Everything brainstormed across sessions that is **not** in the active backlog
([value-add-ideas-2026-06.md](value-add-ideas-2026-06.md)). Tagged FREE (buildable with what we
already have: own data, pure compute, current Finnhub/FMP quotes, free AI) vs PAID (needs a service
we don't pay for). "FREE*" = free but data coverage on our current API tier is uncertain — verify
the endpoint before committing.

## FREE — status (most shipped 2026-06-28)

1. ✅ **What-if trade simulator** — SHIPPED (718b575). Analytics tab: resize/remove/add holdings →
   live deltas on total, top-position/top-sector weight, effective holdings, beta, downside.
2. ✅ **AI "second opinion" / devil's advocate** — SHIPPED (914a68f). Journal entries get a bear-case
   generator anchored to the logged thesis + live Finnhub context.
3. ✅ **Peer / cohort benchmarking** — SHIPPED (601e197). Community leaderboard "How you compare"
   card: anonymized percentile vs cohort (positions, cash %) + most-held overlap. No-PII.
4. ✅ **DCA scheduler + contribution reminders** — SHIPPED (baf6de6). /planning/contributions + daily
   cron → in-app bell. ⚠️ needs supabase/contribution-schedules.sql run.
5. ✅ **Tax-loss harvesting scanner** — ALREADY BUILT (Tax Center TLH tab + wash-sale tab).
6. ✅ **Strategy backtester** — SHIPPED (8d2a0ec) as an allocation backtester: replays current weights
   through dividend-adjusted history vs benchmark (1Y/3Y/5Y/MAX). Analytics tab.
7. ✅ **Factor tilt analysis** — SHIPPED (923466a). Analytics tab: value/blend/growth + size split +
   blended P/E/beta/yield/momentum from free Finnhub fundamentals.
8. **News sentiment timeline per holding** — PARTIAL/SKIP. ~70% covered (market news feed, Reddit
   social pulse, analyst sentiment, news fed into AI). The AI-scored-headline-vs-price timeline isn't
   built; lowest ROI of the set, recommend skipping (overlaps existing surfaces).
9. ✅ **Insider-transaction tracker** — ALREADY BUILT (Research "Insider Activity" panel + per-holding
   InsiderPanel + fed into AI). getFinnhubInsiderTransactions, /api/insider/[ticker].
10. **Per-portfolio stress test** — STILL TODO. Fold a compact stress card into the Analytics tab
    (recommended; keep the account-wide one on the dashboard). FREE, cheap.

## PAID / blocked — out of scope unless we accept a cost

11. **Brokerage account sync (SnapTrade / Plaid)** — auto-import real holdings + transactions. The
    single most-requested-type feature, but every aggregator with real coverage is paid. DROPPED
    until we're willing to pay for an aggregator.
12. **Robinhood integration** — no public/free developer API. ON HOLD until Robinhood ships one.
13. **ESG / sustainability scoring** — requires a paid ESG data vendor.
14. **ETF expense-ratio / fee-drag analyzer** — needs reliable fund expense + holdings data; not
    dependable on our free tier (would need a paid fund-data source for accuracy).
15. **Multi-currency / international accounts** — needs a live FX-rate feed (paid for reliable rates)
    and broader instrument coverage.
16. **Crypto holdings support** — needs a crypto price feed (free options exist but rate-limited and
    unreliable; treat as a separate evaluation).
17. **Real-time intraday streaming quotes** — websocket/real-time tiers are paid; we use cached
    REST quotes by design.

## Notes
- The FREE list is genuinely shippable; the only reason these aren't in the active backlog is
  prioritization, not feasibility.
- FREE* items need a 10-minute endpoint check against our current Finnhub/FMP tier before building.
- If we ever revisit #11 (brokerage sync), it would reshape the whole product (real data instead of
  manual entry) — worth a dedicated decision, not a quiet add.
