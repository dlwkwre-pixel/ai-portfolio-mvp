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

### Portfolio Tools
- [x] Intraday snapshots: 4h throttle on page-load, free snapshot after AI run
- [x] Portfolio Audit / Reconciliation ("Sync Holdings"): CSV/paste import, drift detection, apply changes, audit log
- [x] AI context note: one-time text injected into Grok prompt per run

---

## Current Backlog (pre-planning-system)

| Priority | Item |
|---|---|
| Medium | Mobile polish: dashboard grid, portfolio header, overview tab layout |
| Medium | PDF Investor Report (Gemini, triggered from portfolio page) |
| Low | CSV Export: holdings + transactions download |
| Low | Onboarding Guide: modal/tooltip tour improvements |

---

## Phase 1 — Financial Foundation (`/planning`)
**Goal:** Establish accurate financial state tracking and initial forecasting.

### New Database Tables Needed
- `financial_profiles` — age, retirement goal age, risk tolerance
- `balance_sheet_items` — assets and liabilities (type, value, label)
- `cash_flow_items` — recurring income and expense lines
- `net_worth_history` — time-series snapshots (manual + calculated)

### Features
- [ ] `/planning` route and page shell
- [ ] Financial profile setup: age, income, target retirement age
- [ ] Balance sheet: add cash accounts, investments, real assets, liabilities
- [ ] Cash flow: add income sources, recurring expenses
- [ ] Net worth calculation: assets − liabilities
- [ ] Basic deterministic forecast: net worth trajectory chart
- [ ] Savings rate display
- [ ] Financial health score (composite 0–100)
- [ ] FINN Phase 1: 2–4 sentence health commentary (Gemini Flash)
- [ ] Portfolio integration: pull current portfolio value + allocation from existing `portfolios` / `holdings`
- [ ] Progressive profiling: Stage 1 (6 fields) → immediate output

### Out of Scope for Phase 1
- Monte Carlo simulation
- Plaid / bank account linking
- Advanced scenario modeling
- Tax calculations
- Household / spouse modeling

---

## Phase 2 — Forecasting Engine
**Goal:** Build full financial simulation systems.

- [ ] Assumptions engine: editable investment return rate, inflation, salary growth
- [ ] Forecasted cash flows table: year-by-year income / expenses / net
- [ ] Retirement probability score
- [ ] Confidence bands: optimistic / baseline / pessimistic trajectory
- [ ] Future events: add home purchase, children, inheritance, etc.
- [ ] Scenario modeling: "What if I retire at 58?"
- [ ] Sensitivity analysis grid (retirement age vs. market returns vs. spending)
- [ ] Monte Carlo simulation (1,000+ runs)
- [ ] FINN Phase 2: explains forecast changes, scenario impacts

---

## Phase 3 — FINN Financial Planner
**Goal:** Intelligent conversational financial planning.

- [ ] Conversational FINN chat interface on `/planning`
- [ ] What-if simulations via natural language
- [ ] Proactive alerts (retirement probability drops, cash flow pressure)
- [ ] Optimization recommendations
- [ ] Stress testing: recession scenarios
- [ ] Estate / insurance pointers (informational only)
- [ ] Household mode: model spouse/partner jointly
- [ ] FINN upgrade to higher-capability model

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
