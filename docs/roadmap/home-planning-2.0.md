# BuyTune Home Planning 2.0
## Transform Home Planning from Calculator → Decision Engine

Status: Planned
Priority: High

---

## What already exists (math is done)

- `breakEvenYear` — year when home equity > rent portfolio
- `retirBaselineProb` + `retirWithHomeProb` — retirement impact already computed
- `buildTimeline` — year-by-year rent vs buy wealth comparison
- `buildAmortization` with equity milestones (20%, 50%, 80%)
- FINN commentary via `/api/planning/home-finn`
- Smart defaults from financial profile (28% DTI rule)
- Future events integration (down payment, liability, equity events)

## What's missing (presentation + features)

### Sprint 1 (highest impact, use existing math)
- [ ] Phase 1: BuyTune Verdict — synthesize breakEvenYear + retirement impact into BUY/WAIT/RENT verdict with confidence
- [ ] Phase 2: Market Presets — dropdown with hardcoded presets for major metros
- [ ] Phase 7: Equivalent Rent Metric — single number: "if rent < $X, renting wins"
- [ ] Phase 4: Rent vs Buy Wealth Comparison — reframe timeline as "Net Wealth Outcome"
- [ ] Phase 6: Real Ownership Cost breakdown — maintenance reserve, transaction costs

### Sprint 2 (integration + advanced)
- [ ] Phase 3: Home Search Planner — "what can I afford" mode with Conservative/Target/Stretch ranges
- [ ] Phase 8: Portfolio Integration — show portfolio balance, down payment impact, opportunity cost
- [ ] Phase 9: Retirement Integration — show score impact as visual before/after
- [ ] Phase 10: Equity milestone timeline visualization (data exists, needs visual)
- [ ] Phase 11: FINN Home Advisor — upgrade to personalized verdict language

### Sprint 3 (future)
- [ ] Phase 5: Scenario Comparison Center — save + compare up to 4 scenarios side by side
- [ ] Phase 12: Future Events integration (partially built, needs UX)
- [ ] Phase 13: ZIP/address lookup (deferred)

---

## Market Preset Data

| Market | Med Price | Med Rent | Tax Rate | Insurance | Appreciation | Rent Growth |
|---|---|---|---|---|---|---|
| Dallas-Fort Worth | $380,000 | $2,100 | 1.70% | $175/mo | 3.5% | 3.0% |
| Houston | $320,000 | $1,800 | 1.80% | $165/mo | 3.0% | 2.5% |
| Austin | $480,000 | $2,400 | 1.80% | $195/mo | 4.0% | 3.5% |
| San Antonio | $280,000 | $1,600 | 1.75% | $145/mo | 3.0% | 2.5% |
| Atlanta | $360,000 | $2,000 | 0.90% | $160/mo | 3.5% | 3.0% |
| Phoenix | $420,000 | $2,100 | 0.60% | $170/mo | 4.5% | 3.5% |
| Denver | $560,000 | $2,400 | 0.55% | $185/mo | 3.5% | 3.0% |
| Nashville | $420,000 | $2,100 | 0.70% | $170/mo | 4.0% | 3.5% |
| Charlotte | $360,000 | $1,900 | 0.80% | $155/mo | 4.0% | 3.5% |
| Tampa | $380,000 | $2,000 | 1.00% | $250/mo | 4.0% | 3.0% |
| National Average | $420,000 | $2,000 | 1.10% | $170/mo | 3.5% | 3.0% |

---

## Verdict Logic

```
verdict = "BUY" when:
  - breakEvenYear <= 5 AND
  - retirWithHomeProb >= retirBaselineProb - 2

verdict = "WAIT" when:
  - breakEvenYear is 6-10 AND
  - affordability ratio > 0.9

verdict = "RENT" when:
  - breakEvenYear > 10 OR
  - retirWithHomeProb < retirBaselineProb - 5

confidence = f(breakEvenYear, affordability, retirement delta, hold_years)
```

## Equivalent Rent Formula

```
equivalentRent = totalMonthly - (equity gain per month) - (tax deduction benefit)
              ≈ monthlyPmt + tax + insurance + hoa + maintenance
                - (appreciation/12) × (purchase_price × 0.8)
                - (principal per month)

Simplified: if current rent < equivalentRent → renting likely wins
```
