# BuyTune Home Planning 2.3
## Decision Optimization & Life Planning Intelligence

Priority: High
Status: In Progress

---

## Objective

Home Decision Engine → Financial Decision Optimizer

The page should identify: **which decision creates the strongest long-term outcome.**

---

## Priority 1: Best Financial Outcome Engine
Analyze all saved scenarios + rent path. Surface the winner with:
- Recommended path name
- Confidence % (derived from score gap vs next-best)
- Expected advantage vs next-best alternative (retirement asset difference)
- Top 3 reasons it wins

Status: Built in Sprint 2.3

---

## Priority 2: Scenario Ranking System
Composite 0-100 score per path. Dimensions:
- Retirement Impact (30%)
- Wealth Outcome (25%)
- Affordability (25%)
- Break-even Fitness (10%)
- Liquidity Preservation (10%)

Scored paths: all saved scenarios + "Continue Renting" baseline.
Sorted by score, ranked #1–N in the Compare Futures table.

Status: Built in Sprint 2.3

---

## Priority 3: Home Purchase Readiness Score
"Am I ready?" — separate from "Can I afford it?"

Components:
- Down Payment Strength (20%)
- Income Buffer (20%)
- Savings Rate (18%)
- Liquidity Recovery (17%)
- Retirement Progress (15%)
- Expense Load (10%)

Ratings: 90-100 Ready / 75-89 Mostly Ready / 60-74 Needs Preparation / <60 Not Recommended

Status: Built in Sprint 2.3

---

## Priority 4: Cash Flow Stress Testing (Financial Resilience)
Three stress scenarios scored 1–10:
- Mild: $5K unexpected repair
- Moderate: 3 months at 50% income
- Severe: 6 months unemployment

Computed from monthly buffer + estimated emergency fund proxy.

Status: Built in Sprint 2.3

---

## Priority 5: Future Event Integration Expansion
Saved scenarios interact with future life events (marriage, children, career changes).
Retirement forecasts update automatically with layered life decisions.

Status: Deferred to Sprint 2.4 (requires new DB schema + planning event architecture)

---

## Priority 6: "What Would FINN Do?" (Rule-Based)
Rule-based recommendation derived from ranked paths. Shows:
- Primary recommendation + confidence + reasons
- Alternative recommendation + expected advantage

Status: Built in Sprint 2.3 (rule-based; AI-powered variant deferred to 2.4)

---

## Priority 7: FINN Scenario Analysis
FINN evaluates all saved scenarios together in one AI call.

Status: Deferred to Sprint 2.4 (requires API route update)

---

## Design Philosophy
Page evolves from "here are calculations" to "here is the strongest financial decision."

Success criteria:
1. Which option creates the most wealth?
2. Which option protects retirement the best?
3. Am I ready to buy?
4. How resilient is my plan?
5. What would FINN do?
