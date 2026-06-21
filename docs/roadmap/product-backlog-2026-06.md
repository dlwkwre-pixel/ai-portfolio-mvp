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
   Unusual Whales itself is paid (don't need it). Public STOCK Act disclosures are free via:
   FMP Senate/House endpoints (already have FMP, free tier 250/day) OR House/Senate Stock
   Watcher datasets (free JSON, no key). Add a "Congress is trading" list on research + a
   per-ticker "traded by Congress" signal. Verified 2026-06-21.

4. **Research-page list automation + most-popular ranking** 🟠.
   Top movers / most popular currently manual or thresholded. Automate top-movers (needs a
   market-movers data source — check Finnhub/FMP). Most-popular: rank by # of BuyTune owners
   (drop the ">2 owners" floor, just sort by holder count).

5. **Non-tradeable / advisor funds** 🟡 research+design then build.
   Let users hold funds not on public exchanges (no Finnhub quote). How to value/track:
   manual NAV entry + periodic update, or a NAV data source (Morningstar/other). Needs an
   asset-type that bypasses the quote pipeline and uses a user-entered/looked-up price.

6. **Move portfolio stress simulator** 🟢 small.
   Currently at the bottom of the AI analysis page; consider relocating/surfacing on the
   dashboard Overview (or planning). Decide home, then move/share the component.

7. **Dual-storage backup for Supabase** 🟡 resilience, larger/infra.
   Disaster-recovery if Supabase fails. Options: scheduled DB backups/exports (cheapest,
   recommended first), read-replica, or a secondary store. Full dual-write is complex; start
   with automated backups/point-in-time recovery before a true dual system.
