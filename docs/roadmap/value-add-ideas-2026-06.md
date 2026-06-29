# Value-add ideas backlog (captured 2026-06-28)

Brainstormed high-value features, filtered to what's buildable with what we ALREADY have:
existing data, pure computation, current quotes + the Finnhub/FMP APIs already integrated, and the
free AI (Gemini/Groq). No NEW paid services. (Brokerage sync via SnapTrade/Plaid was considered and
DROPPED — it's paid; revisit only if we ever accept a paid aggregator. Robinhood has no free API.)

## Information architecture — DO NOT add many top-level tabs
The sidebar nav is already rich (Dashboard, Portfolios, Strategies, Planning, Tax, Research,
Community, Learn, Achievements). Most of these belong INSIDE existing surfaces, not as new tabs.
Recommended homes below.

## The ideas (with home + data source + rough effort)

### Portfolio detail page → add an "Analytics / X-ray" tab + an "Income" view + "Rebalance" + "Journal"
1. **Decision Journal + reasoning scorecard** ⭐ (own data + free AI). Capture *why* on each buy/sell
   (thesis + one-tap conviction/emotion); resurface later and score the *reasoning* vs outcome.
   Extends the existing recommendation scorecard + `position_thesis` table. HOME: a "Journal" tab on
   the portfolio detail page + resurfacing nudges on the dashboard. (Could be promoted to a
   top-level "Journal" tab later if it becomes a flagship differentiator.)
2. **Portfolio X-ray (look-through exposure)** (Finnhub profiles for stock sector/industry; FMP/
   Finnhub ETF holdings if our tier exposes them, else a curated static sector-weight table for the
   ~20 common ETFs). True sector/factor/geo + single-stock exposure across funds; reveals hidden
   concentration. HOME: "Analytics / X-ray" tab on portfolio detail (pairs with #3).
3. **Correlation / "real diversification" heatmap** (per-stock price history via Finnhub/FMP — we
   have the APIs). How correlated holdings actually are. HOME: same Analytics tab.
4. **Tax-aware rebalancing assistant** (holdings + strategy target + lots + current quotes). When
   allocation drifts from target, propose trades, preferring lots that minimize taxable gains.
   HOME: a "Rebalance" card on portfolio detail (+ optionally surfaced through AI recs).
5. **Dividend income hub** (project from logged dividends in cash_ledger; enrich with Finnhub/FMP
   dividend data if available). Projected annual income + payout calendar + YoY growth.
   HOME: an "Income" section/tab on portfolio detail.

### Planning hub → sections, not tabs
6. **Goal-based buckets** (pure app feature). Map holdings to goals (house, retirement, college),
   track each goal's funded %, wire into the Conflict Engine. HOME: a "Goals" section in Planning.
7. **Retirement withdrawal-sequencing + Social Security optimizer** (public formulas, pure compute).
   Which accounts to draw from + claiming-age modeling. HOME: a section in Planning (retirement).
   Larger build.

### Research → Watchlist tab/section
8. **Watchlist + AI monitoring** (existing quotes + research + free AI). Track names you don't own;
   alert on your price target / earnings / thesis-changing news. HOME: a "Watchlist" tab/section in
   Research. (The one idea that could justify its own top-level entry if you want it prominent.)

### Global components → NO nav
9. **Behavioral guardrails** (index quote we already fetch + the user's own thesis). On big
   market-down days, a calm pre-action nudge ("before you sell, here's your thesis + plan"). HOME: a
   global watcher component (like LevelUpWatcher), no nav. Pairs with the Decision Journal.

### Dashboard + a dedicated route → entry points, no permanent tab
10. **Portfolio Year-in-Review ("Wrapped")** ⭐ low-effort/high-virality (own data + share-card
    infra). Shareable recap: best/worst calls, total contributed, dividends, biggest mover, XP,
    badges. HOME: a seasonal dashboard CTA → a dedicated full-screen route (e.g. /wrapped), shareable.

## Suggested build order
1. **Decision Journal** ✅ SHIPPED (8e15dae) — "Journal" tab on portfolio detail; capture
   ticker/action/conviction/mood/thesis + price snapshot; outcome (% since) + directional verdict;
   30+ day resurfacing with reflect prompt. ⚠️ needs supabase/decision-journal.sql run.
2. **Portfolio Wrapped** ✅ SHIPPED (709cd3b) — /wrapped route, animated stat cards from existing
   data + share button; slim dashboard CTA. No migration.
3. **Analytics tab** ✅ SHIPPED (c991182) — "Analytics" tab on portfolio detail: exposure X-ray
   (sector/asset stacked bar + concentration warning) + correlation heatmap (Pearson on top
   holdings' ~6mo daily returns) via async /api/portfolios/[id]/analytics. No migration.
4. **Goal-based buckets** ✅ SHIPPED (e230b61) — /planning/goals sub-route + planning hub card;
   goals w/ target, year, saved amount, animated funded-% bar, monthly pace, contribute/edit/delete,
   all-goals summary. ⚠️ needs supabase/planning-goals.sql run. (Also fixed a dashboard
   duplicate-header bug + de-duped the streak across sidebar/header.)
5. Tax-aware rebalancing, Dividend hub, Watchlist, Behavioral guardrails, Withdrawal/SS optimizer.
