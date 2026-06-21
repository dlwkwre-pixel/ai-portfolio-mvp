# Product backlog (captured 2026-06-21)

User-raised items. Tackle separately. Priority/notes are my recommendation.

1. **Contribution-limit accuracy + auto-update** 🔴 correctness — START FIRST.
   Tax (and maybe planning) shows stale IRS limits (e.g. Roth IRA "$7,000" — should be
   current year; user believes raised to ~$7,500). Centralize all IRS limits (IRA/Roth,
   401k, HSA, catch-ups, std deduction) into one year-keyed module, reference everywhere,
   pick the current year automatically. True auto-fetch is hard (no clean IRS API) — best
   path is a single source-of-truth module + easy annual bump (+ maybe a scheduled check).

2. **Site speed / navigation latency** 🟠 high-leverage before onboarding strangers.
   Pages feel slow on click. Suspects: huge client bundles (planning-client.tsx ~11k lines),
   server-render data waterfalls, un-memoized work, no prefetch. Needs a profiling pass +
   concrete wins (code-split, parallelize fetches, cache, Link prefetch).

3. **Tutorials for Tax / Planning / Research / Community pages** 🟠 onboarding.
   Run on first visit to each page; also stored in the Learn tab for replay. Planning already
   has the guided first-run wizard + density modes; reuse that pattern. Need a generic
   "page tutorial" system (first-visit detection via localStorage/profile + a Learn-tab launcher).

4b. **Congressional trades ("Unusual Whales"-style) — FREE path** (fold into #4).
   Unusual Whales itself is paid. VERIFIED 2026-06-21: paid APIs are NOT free for this now —
   Finnhub congressional = premium; FMP senate/house = paid Starter ($29/mo), not the free
   250/day tier. **Use the free public datasets instead:** Senate Stock Watcher
   (github.com/timothycarambat/senate-stock-watcher-data, raw JSON) + House Stock Watcher
   (housestockwatcher.com/api) — daily-updated official STOCK Act disclosures, no key, $0.
   Build: fetch + cache those, add a "Congress is trading" list on research + per-ticker
   "traded by Congress" signal. NOT YET BUILT.

4. **Research-page list automation + most-popular ranking** 🟠.
   Top movers / most popular currently manual or thresholded. Automate top-movers (needs a
   market-movers data source — check Finnhub/FMP). Most-popular: rank by # of BuyTune owners
   (drop the ">2 owners" floor, just sort by holder count).

5. **Non-tradeable / advisor funds** 🟡 — RESEARCHED 2026-06-21; build-ready spec below.
   FINDING (the "how do we track these accurately + free" answer): truly non-exchange funds
   (private/interval/advisor-only funds, some annuities) have NO public price feed — the free
   APIs (Finnhub/FMP/AlphaVantage) only quote exchange-listed tickers + mutual funds with a
   public symbol. So the only accurate, FREE method is user-entered NAV (the advisor/statement
   gives the NAV; the user updates it periodically). No paid data source needed.
   BUILD SPEC (careful — must not corrupt valuations/snapshots):
   1. Migration supabase/holdings-manual-price.sql: `alter table holdings add column if not
      exists manual_price numeric;` (asset_type = "manual" marks it). Optional
      manual_price_updated_at.
   2. lib/portfolio/valuation.ts: add manual_price to HoldingRow; exclude asset_type==="manual"
      from the Finnhub/crypto batches; in assembly, manual → current_price = manual_price,
      day_change/dayChangePct = null, has_live_price = false.
   3. Thread `manual_price` into the holdings SELECT at ALL 15 getPortfolioValuation call sites
      (dashboard, planning, portfolios, portfolios/[id], report, tax, community, cron x2,
      monday-prep, weekly-recap, export-xlsx, actions, recommendation-actions,
      portfolio-performance-section) — otherwise manual holdings value as $0 and corrupt
      snapshots/returns. This is the critical, tedious part.
   4. UI in holdings-table.tsx (+ add/import flows): "Non-tradeable fund" type → enter name +
      shares + current NAV; an "Update NAV" affordance to refresh it. Badge it as manual/stale.
   NOT YET BUILT — large + valuation-sensitive; warrants a dedicated focused pass.

6. **Move portfolio stress simulator** 🟢 small.
   Currently at the bottom of the AI analysis page; consider relocating/surfacing on the
   dashboard Overview (or planning). Decide home, then move/share the component.

7. **Dual-storage backup for Supabase** 🟡 resilience, larger/infra.
   Disaster-recovery if Supabase fails. Options: scheduled DB backups/exports (cheapest,
   recommended first), read-replica, or a secondary store. Full dual-write is complex; start
   with automated backups/point-in-time recovery before a true dual system.
