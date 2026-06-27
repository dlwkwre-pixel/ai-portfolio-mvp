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

4b. **Congressional trades ("Unusual Whales"-style) — FREE path** ✅ SHIPPED 2026-06-21.
   Built on the free House/Senate Stock Watcher S3 datasets (official STOCK Act filings, daily,
   no key, $0) — NOT paid Finnhub/FMP congressional endpoints. lib/market-data/congress.ts
   (fetch + normalize both chambers, aggregate by ticker, 12h module TTL cache, graceful empty),
   /api/research/congress (recent trades + top tickers, or ?ticker=X), and a "Congress is
   Trading" section in the research feed (top-traded cards + recent buy/sell disclosures,
   tappable to research). Endpoints: house-stock-watcher-data.s3-us-west-2.amazonaws.com/data/
   all_transactions.json + senate-stock-watcher-data.s3-us-west-2.amazonaws.com/aggregate/
   all_transactions.json. NOTE: couldn't verify reachability from the dev sandbox (no egress);
   if S3 keys 403 from Vercel, the section just hides — swap URLs in congress.ts.

4c. **401(k) optimizer** ✅ SHIPPED 2026-06-21 (planning + tax). ⚠️ REQUIRES MIGRATION:
   run supabase/profile-401k-fields.sql (won't break the site if skipped — planning/tax use
   select(*) — but saving 401k settings fails until columns exist). lib/tax/retirement-401k.ts
   (contribution + match capture + scenario take-home), plan-401k-section.tsx, upsert401kSettings
   action. Traditional deferral folds into the existing pre-tax pipeline so take-home/taxable
   income drop automatically on planning + tax; employee+match feed the drawdown's deferred bucket.

4. **Research-page list automation + most-popular ranking** ✅ SHIPPED 2026-06-21.
   ALL research sections now auto-populate by their header from live FMP data
   (app/api/research/screener/route.ts + getFmpScreen in lib/market-data/fmp.ts):
   Trending→FMP actives, Momentum→gainers, High Growth→large-cap high-beta tech screener,
   Dividend Stars→large-cap dividend screener, Defensive→low-beta large-cap screener; each
   falls back to its curated list if FMP is empty. Daily Top Movers uses real FMP
   gainers/losers. Most-popular ("Popular on BuyTune") ranks purely by holder count
   (MIN_HOLDERS dropped to 1 in research/trending/route.ts).

5. **Non-tradeable / advisor funds** ✅ SHIPPED 2026-06-21 (FREE = manual NAV).
   ⚠️ REQUIRES MIGRATION: run supabase/holdings-manual-price.sql in the Supabase SQL editor.
   Until it runs, the explicit holdings SELECTs that now request manual_price/_updated_at
   will 400 ("column does not exist") and break valuation site-wide. The ALTER is instant
   and safe (adds two nullable columns). Built: asset_type "manual" valued at user-entered
   NAV, skips live batches (has_live_price=false), threaded through all 15 valuation call
   sites, Add/Edit "Non-tradeable Fund" type + Current NAV field, holdings-table NAV badge
   (age + >45d stale flag) + inline "Update NAV" (updateManualNav action). Original spec:
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

---

## New asks (2026-06-27)

8. **"Add BuyTune to your iPhone home screen" tutorial** 🟢 onboarding.
   Walk iOS Safari users through Share → Add to Home Screen so they install the PWA. Best as a
   replayable card in the Learn tab + a one-time, dismissible prompt shown only to iOS Safari
   users (detect iPhone + Safari + not already standalone via `navigator.standalone`). Reuse the
   page-tutorial pattern (lib/tutorials.ts + page-tutorial.tsx). The home-screen ICON itself is
   already fixed (app/apple-icon.tsx — full-bleed brand mark, no gaps). NOT YET BUILT.

9. **Logo / brand-mark ideas** (optional, user likely keeping current). Current mark = rising
   chart line with 4 data-point dots on a blue→violet gradient. If exploring: a stylized "BT"
   monogram, an equalizer/"tune" bars motif (plays on "Tune"), or a soundwave-meets-chart hybrid.
