# BUYTUNE PLANNING OS

## Master Product Vision & Implementation Guide

### Purpose

BuyTune Planning should not feel like a collection of financial calculators.

It should feel like a Financial Operating System.

The goal is to rival the value provided by a traditional financial advisor while remaining understandable to everyday investors.

Most competitors can show users charts and projections.

BuyTune should answer:

* Where am I today?
* Am I on track?
* What matters most?
* What should I do next?
* How do today's decisions affect my future?

The user should leave every Planning session with a clear understanding of their financial position and the next action that will create the greatest impact.

---

# Core Philosophy

Planning follows this hierarchy:

```
Balance Sheet
+
Cash Flow
+
Forecast
↓
Life Planning
↓
FINN Intelligence
```

Life Planning should NOT be the starting point.

Users must first build their financial foundation before modeling life decisions.

All future planning modules should consume data from:

* Assets
* Liabilities
* Income
* Expenses
* Savings rate
* Portfolio value
* Forecast assumptions

Life Planning should be the culmination of the planning experience.

---

# Design Philosophy

## Theme

Financial Operating System

NOT:
* Spreadsheet software
* Financial calculator
* Retirement calculator

YES:
* Command center
* Mission control
* Intelligent advisor

---

## Design Requirements

Every page should contain:

1. Current status
2. What matters most
3. Recommended action
4. Future impact

Every page should answer: "What should I do next?"

---

## Visual Design

Continue dark premium aesthetic.

Increase:
* motion
* transitions
* visual hierarchy
* AI-driven guidance

Reduce:
* empty space
* static cards
* dead-end screens

---

## Animation Requirements

Use subtle premium motion.

| Element | Animation |
|---|---|
| Financial Health Score | Count-up on mount |
| Forecast Charts | Curve redraw when assumptions change |
| Life Planning timeline | Nodes animate into existence |
| FINN Recommendation cards | Slide/fade when priorities change |
| Readiness Scores | SVG ring sweep progress |

Nothing should feel static.

---

# Planning Information Architecture

Planning should tell a story:

```
Current Position
↓
Future Projection
↓
Major Life Decisions
↓
Protection & Legacy
↓
AI Guidance
```

Without changing navigation structure.

---

# PAGE 1 — OVERVIEW

**Goal:** Transform from summary page into command center. This should become the most important page in Planning.

## Section 1 — Financial Position

Display primary KPIs:
* Net Worth
* Monthly Savings
* Savings Rate
* Retirement Probability
* Financial Health Score

## Section 2 — What Matters Most Right Now

AI-ranked priorities. Each item includes:
* Why it matters
* Estimated impact
* Direct action button

Examples:
> Priority #1: Model a Home Purchase
> Priority #2: Increase Savings Rate
> Priority #3: Complete Estate Readiness
> Priority #4: Fund Emergency Reserve

## Section 3 — FINN Recommendations

Impact-driven, not generic.

> "Buying a $400,000 home would reduce projected retirement assets by approximately $2.3M."

## Section 4 — Financial System Health

Completion status for each module:
* Balance Sheet
* Cash Flow
* Forecast
* Life Planning
* Estate Readiness

Users should clearly see what information is missing.

## Section 5 — Future Milestones

Mini timeline showing retirement, home purchase, children, career change, education goals. Always show placeholders. Never show an empty timeline.

---

# PAGE 2 — BALANCE SHEET

**Goal:** Net Worth Intelligence — not simply a list of assets.

## Add: Asset Allocation Breakdown
Visual chart: Cash / Investments / Real Estate / Other Assets.

## Add: Net Worth Composition
Explain the composition in plain English.
> "Your portfolio only represents 18% of your net worth."
> "Cash exceeds recommended emergency reserve by $12,000."

## Add: Net Worth History
Timeline: 1 month / 3 months / 1 year / all time.

## Add: FINN Insight
Contextual intelligence on the balance sheet state.

---

# PAGE 3 — CASH FLOW

**Goal:** Primary spending hub. Merge Budget Tracker into Cash Flow (remove separate Budget Tracker page).

## New Structure

**Top:** Income / Expenses / Savings / Savings Rate

**Middle — Income Sources:** Salary / Business Income / Rental Income / Other

**Middle — Expense Categories:** Housing / Food / Transportation / Entertainment / Insurance / Subscriptions / Travel

**Bottom — Budget vs Actual:** Forecasted / Actual / Variance

## Add: Cash Flow Health Score
Measures: savings rate, housing burden, expense concentration, consistency.

## Add: FINN Insight
> "Housing represents 54% of spending."
> "You could increase annual savings by $3,000 by reducing discretionary spending 10%."

---

# PAGE 4 — FORECAST

**Goal:** Answer "What changes my outcome most?" — not just "What happens?"

## Keep (already strong)
Forecast chart, forecast assumptions, scenario comparison, sensitivity analysis.

## Add: Biggest Drivers
Ranked by impact:
> Retirement Age: +$7.6M
> Investment Return: +$5.4M
> Monthly Savings: +$4.2M
> Future Home Purchase: Not Modeled
> Career Change: Not Modeled

## Add: AI What-If Generator
Quick buttons: Retire Earlier / Retire Later / Save $500 More / Market Crash / Home Purchase / Child. Generate scenarios instantly.

## Add: Confidence Narrative
> "You are currently projected to retire with approximately $13.4M. The largest variable affecting this outcome is retirement age."

---

# PAGE 5 — LIFE PLANNING

Already substantially improved. Keep current roadmap direction.

**Goal:** Model major life decisions — not retirement calculations.

**Planners:** Home / Family / Career / Education

## Add: Cross-Planner Impact Engine
Show downstream effects:
* Home purchase impacts retirement
* Child costs impact savings
* Career change impacts all downstream forecasts

This should become the unique differentiator.

## Add: Life Readiness Score
Based on planning completeness, scenario coverage, modeled risks.

---

# PAGE 6 — ESTATE READINESS

Rename: "Estate & Will" → "Estate Readiness"

**Purpose:** Organize, track, prepare. NOT generate legal documents. BuyTune is not a law firm.

## Add: Estate Readiness Score

## Add: Progress Tracker
* Will
* Trust
* POA
* Healthcare Directive
* Beneficiaries
* Digital Assets

## Add: FINN Insight
> "You have beneficiary designations incomplete on retirement accounts."

## Add: Recommended Next Step
Single action. Always.

---

# PAGE 7 — ASK FINN

**Purpose:** Master intelligence layer. Not a chatbot page. A financial advisor page.

## FINN should have access to everything:
Balance Sheet / Cash Flow / Forecast / Life Planning / Estate Readiness / Portfolio Data / Strategy Data / Tax Data

## Suggested Questions
Generated dynamically. Never static.
> "What happens if I buy a house?"
> "What if I retire at 60?"
> "Could I afford two children?"
> "Am I saving enough?"
> "What should I optimize first?"

## Add: Today's Biggest Insight
Displayed before conversation begins.
> "The single biggest opportunity available is increasing retirement age from 65 to 67, improving projected retirement assets by $2.1M."

---

# FINN System-Wide Behavior

FINN should appear on every page — not only Ask FINN.

| Page | FINN Focus |
|---|---|
| Balance Sheet | Asset insights |
| Cash Flow | Spending insights |
| Forecast | Outcome insights |
| Life Planning | Decision insights |
| Estate | Readiness insights |

---

# AI Strategy (Priority Order)

1. **Rule-based recommendations** — cheap, fast, no API cost
2. **Hybrid intelligence** — rules + AI summaries
3. **Full advisor mode** — dynamic prioritization, scenario generation, action plans (only if API economics allow)

---

# Success Metrics

Users should be able to instantly answer:

1. What is my financial position?
2. Am I on track?
3. What should I do next?
4. What decision affects me most?
5. How does my future change if I make a major life decision?

---

# DO NOT DO

* Turn Planning into a collection of calculators
* Overload users with financial jargon
* Force users into Life Planning before they have entered foundational financial data
* Make AI purely conversational
* Create pages that only display data

Every page must explain, prioritize, and guide. Every page must tell the user what matters most. Every page must feel like a financial advisor sitting beside them.

---

**End Goal:** BuyTune Planning becomes a Financial Operating System that rivals the guidance of a traditional financial advisor while remaining understandable, actionable, and deeply integrated with the user's investing activity.
