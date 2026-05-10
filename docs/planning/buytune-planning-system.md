# BuyTune Planning System
## Financial Forecasting, Net Worth, Retirement & Life Planning Platform

> This document is the canonical source for the financial planning system vision.
> Source: `app/docs/financial-planning-system.md` — originally authored May 2026.

**Status:** Foundational Product Architecture Document
**Project Codename:** BuyTune Planning
**Primary AI System:** FINN
**Owner:** BuyTune.io

See the full spec at [app/docs/financial-planning-system.md](../../app/docs/financial-planning-system.md).

---

## TL;DR for Implementation

BuyTune Planning is a **living simulation engine** for a user's financial future — not a retirement calculator, not a budget app. It should feel like institutional underwriting software crossed with a modern data platform.

### The Four Engines

| Engine | Purpose | Phase |
|---|---|---|
| Balance Sheet Engine | Assets, liabilities, net worth | Phase 1 |
| Cash Flow Engine | Recurring inflows/outflows, savings rate | Phase 1 |
| Forecasting & Simulation Engine | Retirement probability, net worth trajectory, scenarios | Phase 2 |
| FINN AI Layer | Conversational planning, what-if simulations, coaching | Phase 3 |

### Phase 1 Scope (what we're building now)

- User profile: age, income, retirement goal, savings rate
- Balance sheet: cash accounts, investments, real assets, liabilities
- Cash flow: income sources + recurring expenses
- Net worth tracking: historical (manual) + projected (simple deterministic)
- Financial health score (composite 0–100)
- Portfolio integration: consume `portfolios` + `holdings` data from the existing system
- Basic FINN commentary on the health score

### Key Architecture Decisions

1. **Planning CONSUMES portfolio data — it does NOT own it.** The `portfolios` / `holdings` tables stay where they are. Planning reads them.
2. **Progressive profiling** — Stage 1 collects ~6 fields and immediately returns a forecast. Never 50-question forms.
3. **Modular engines** — Each engine is independently queryable. The forecasting engine calls the balance sheet engine; FINN calls both.
4. **Assumptions are first-class** — Every forecast is driven by editable assumptions. Users can change them and see the impact.

### New Route

`/planning` — the financial planning hub page.

### FINN

FINN is the AI persona for the planning layer (distinct from Grok-powered portfolio recommendations). FINN:
- Explains why forecasts changed
- Surfaces biggest financial drivers
- Answers what-if questions
- Uses Gemini Flash (same as health scores) for Phase 1
- Upgrades to a richer conversational layer in Phase 3

See `docs/ai/finn-behavior.md` for the full spec.
