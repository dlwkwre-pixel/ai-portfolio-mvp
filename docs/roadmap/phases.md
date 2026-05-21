# BuyTune Roadmap — Phases

Last updated: May 2026

---

## Completed (Shipped)

### Core Platform
- [x] Dashboard with portfolio overview + performance analytics
- [x] Portfolio detail page: chart, holdings table, overview tab, notes
- [x] AI analysis via Grok (live web/X search) + Gemini health score
- [x] Strategies page with public/private toggle
- [x] AI Strategy Builder (chat-based, Gemini Flash via `/api/strategies/chat`)
- [x] Social features: community page, profiles, follow, like, save, copy as template, people search
- [x] Profile settings: avatar color picker, visibility toggle
- [x] PWA: manifest, service worker, app icons
- [x] Mobile bottom nav
- [x] Live market ribbon on landing page
- [x] Earnings alert banner on portfolio pages
- [x] Finnhub rate limiting: batch of 3, retry on 429
- [x] Onboarding modal: 7-step portfolio setup wizard
- [x] Reddit Social Pulse: per-ticker sentiment from Reddit
- [x] Research page: ticker search, screener, AI analysis, news feed
- [x] Mobile polish: planning tab scroll, two-panel grid collapse, topbar icon-only buttons

### Portfolio Tools
- [x] Intraday snapshots: 4h throttle on page-load, free snapshot after AI run
- [x] Portfolio Audit / Reconciliation ("Sync Holdings"): CSV/paste import, drift detection, apply changes, audit log
- [x] AI context note: one-time text injected into Grok prompt per run
- [x] PDF Investor Report: printable report page at `/portfolios/[id]/report`
- [x] CSV / XLSX Export: holdings download via `/api/portfolios/[id]/export-xlsx`

### Phase 1 — Financial Foundation (`/planning`)
- [x] `/planning` route and page shell
- [x] Financial profile setup: age, income, target retirement age
- [x] Balance sheet: assets and liabilities (cash, investments, real assets)
- [x] Cash flow: income sources, recurring expenses
- [x] Net worth calculation: assets − liabilities
- [x] Basic deterministic forecast: net worth trajectory chart
- [x] Savings rate display
- [x] Financial health score (composite 0–100)
- [x] FINN Phase 1: health commentary
- [x] Portfolio integration: BuyTune portfolio value pulled into balance sheet
- [x] Progressive profiling: immediate output after first save

### Phase 2 — Forecasting Engine
- [x] Assumptions engine: editable return rate, inflation, salary growth + presets
- [x] Retirement probability score (4% rule)
- [x] Monte Carlo simulation (1,000+ runs) with confidence cone
- [x] Future events: home purchase, inheritance, major expenses (events tab)
- [x] Scenario modeling: home rent vs. buy, career change, education 529, family cost labs
- [x] Sensitivity analysis grid (retirement age × market returns × spending)
- [x] FINN Phase 2: conversational FINN chat with full financial context

### Phase 3 — FINN Financial Planner
- [x] Conversational FINN chat interface on `/planning`
- [x] What-if simulations via natural language
- [x] Proactive alerts (retirement probability, cash flow pressure)
- [x] Optimization recommendations
- [x] Stress testing: recession scenarios in FINN
- [x] Estate / insurance pointers (informational only, in FINN system prompt)

---

## Remaining

| Item | Notes |
|---|---|
| Household mode | Model spouse/partner income + expenses jointly in planning + FINN context |

---

## Future Integrations (not roadmapped yet)

- Plaid bank account aggregation
- Brokerage direct sync (beyond Robinhood CSV import)
- Credit card data
- Tax form import (1099, W-2) for income accuracy

---

## Architecture Principle

Planning **consumes** portfolio data from the existing system — it does not own it.
`portfolios` and `holdings` tables are not moved or duplicated.
The planning system reads them via the same Supabase client with the same RLS.
