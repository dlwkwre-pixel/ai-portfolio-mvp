# Future ideas — parked, NOT scheduled (captured 2026-06-28)

Everything brainstormed across sessions that is **not** in the active backlog
([value-add-ideas-2026-06.md](value-add-ideas-2026-06.md)). Tagged FREE (buildable with what we
already have: own data, pure compute, current Finnhub/FMP quotes, free AI) vs PAID (needs a service
we don't pay for). "FREE*" = free but data coverage on our current API tier is uncertain — verify
the endpoint before committing.

## FREE — buildable whenever we want them

1. **What-if trade simulator** — add/remove/resize a holding and instantly see the impact on
   allocation, sector exposure, correlation, and the stress test. Pure compute on existing data.
   Pairs naturally with the rebalancing assistant.
2. **AI "second opinion" / devil's advocate** — free AI argues the bear case against a holding or a
   proposed buy, using the user's own thesis from the Decision Journal. Free AI + own data.
3. **Peer / cohort benchmarking** — "how your allocation, diversification, or savings rate compares
   to similar BuyTune users" (anonymized, aggregate — same no-PII rule as the admin metrics page).
   Own data, pure compute.
4. **DCA scheduler + contribution reminders** — set a recurring contribution cadence per portfolio;
   push reminders via the in-app bell (we already have push infra). Own data + existing notifications.
5. **Tax-loss harvesting scanner** — flag lots sitting at a loss near year-end + wash-sale warnings.
   Overlaps the tax-aware rebalancer but is its own standalone alert. Lots + quotes, pure compute.
6. **Strategy backtester** — test a strategy's target allocation against historical prices (FMP
   history, which we already use for benchmarks). FREE*, depends on history depth on our tier.
7. **Factor tilt analysis** — value/growth/size/momentum lean of the portfolio from Finnhub
   fundamentals (P/E, market cap, etc.). FREE*, depends on fundamentals coverage.
8. **News sentiment timeline per holding** — Finnhub company-news feed scored by free AI, plotted
   against price. FREE*, Finnhub news on free tier is limited.
9. **Insider-transaction tracker** — Finnhub insider-transactions endpoint per holding (sits next to
   the existing Congress-trading section in Research). FREE*, verify endpoint access.
10. **Per-portfolio stress test** — already planned to fold into the Analytics tab (see main backlog
    notes). FREE, cheap.

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
