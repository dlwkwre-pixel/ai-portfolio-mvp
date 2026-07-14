# Planning Spine — Master Life Roadmap + Forecast Write-Back

**Status: BUILT (verified 2026-07-13).** Delivered incrementally rather than as the collectLifeEvents() module below — the shipped shape:
- Forecast write-back: `FutureEvent` gained `recurring_annual`/`end_year`/`included` (Committed vs Considering); the projection, Monte Carlo, and drawdown all consume recurring streams.
- Every planner bridges into `planning_future_events`: `AddToPlanButton` (car, career, debt, sabbatical, wedding, relocation, business, elder-care, medical, rental) or bespoke actions (home `addFutureEvent` down-payment+equity, `addEducationToForecast`, `addFamilyToForecast`).
- The living roadmap = the interactive TrajectoryChart (draggable event pins + retirement handle, live recompute) on Overview + Life Plan, with Committed/Considering lists.
- Conflict engine (`computeConflictAlerts`) sees scenarios + all committed events; rules include clustered costs, home+infant, near-retirement expenses, emergency-reserve stress, career-gap×college, projected funding gaps.
- **Final piece (commit 042869d):** conflict zones drawn ON the trajectory chart as amber/red bands (alert years → `conflictZones` prop), plus post-commit deep link to the Life Plan.

Remaining ideas from this spec that were consciously NOT built: a separate MasterLifeRoadmap horizontal timeline (superseded by the trajectory chart; the component exists but is unused), per-planner "In your plan → retirement 92%" persistent write-back lines, and explore-preview deltas before committing.

---

*Original spec below (historical).*
**Goal:** Turn 11 separate planners + 7 hub tabs into **one living plan**. Every life decision a user models should (a) re-draw the single master forecast and (b) appear on one visual lifetime timeline with conflict detection. This is the highest perceived-value move and mostly *unifies what already exists* rather than building new math.

## Why this first
Competitors (Boldin, ProjectionLab) are strong forward modelers but **disconnected from the user's real portfolio and have no per-decision life engines**. BuyTune already has: a normalized event model, a Monte Carlo forecast that consumes events, live portfolio value feeding net worth, and 11 planners. The missing piece is the **spine** that makes them feel like one advisor-grade plan. See [[project-planning-os-roadmap]] (P4/P5) and [[planning-os-20]] (Sprint 2.1: Conflict Engine + Master Life Roadmap + Action Center).

## Current state (grounding — verified 2026-06-19)
- **Normalized event model exists:** `FutureEvent = { id, label, event_year, amount_impact, category, sort_order }` in [app/planning/planning-actions.ts](app/planning/planning-actions.ts).
- **Forecast already consumes events:** `runMonteCarlo` + projection functions in [app/planning/planning-client.tsx](app/planning/planning-client.tsx) (~lines 182–390) fold `futureEvents` into the projection (`eventImpact = futureEvents…`).
- **A conflict engine already exists but is partial:** `computeConflictAlerts` (~line 607) aggregates **family + education + manual futureEvents** only, and detects clustered-cost windows (2-year window, ≥2 sources, >$15k → warning/critical). It does NOT see home, career, car, sabbatical, wedding, relocation, windfall, debt.
- **Planner scenario tables:** `home_planning_scenarios`, `career_scenarios`, `education_scenarios`, `family_scenarios`, `sabbatical_scenarios`, `car_scenarios`, `apartment_listings`, plus `planning_future_events`. Each planner persists its own scenarios; only family/education currently inject into the forecast/conflict aggregation.
- **Portfolio integration:** [app/planning/page.tsx](app/planning/page.tsx) already pulls holdings → `getPortfolioValuation` → `portfolioTotalValue` into net worth.

## The core abstraction: one `collectLifeEvents()` source of truth
Build a single canonical function that converts **every** planner's committed scenarios + manual future events into a normalized stream the whole system reads:

```
type LifeEvent = {
  id: string;
  source: "home"|"car"|"career"|"education"|"family"|"sabbatical"|"wedding"|"relocation"|"windfall"|"debt"|"manual";
  label: string;
  year: number;              // event year (one-time) or start year (recurring)
  endYear?: number;          // for recurring streams (childcare, mortgage, tuition)
  oneTimeImpact: number;     // signed $ at `year` (down payment, windfall +, wedding -)
  recurringAnnual?: number;  // signed $/yr from year..endYear (mortgage -, raise +, sabbatical income gap -)
  category: "housing"|"family"|"education"|"career"|"vehicle"|"lifestyle"|"windfall"|"debt"|"other";
  scenarioId?: string;       // link back to the planner scenario for click-through
  committed: boolean;        // is this part of the active plan, or just an explored scenario?
};
```

- `collectLifeEvents(planData)` lives in a new shared module (e.g. `app/planning/life-events.ts`) and is imported by: the forecast projection, `runMonteCarlo`, `computeConflictAlerts`, and the new Master Life Roadmap. **Single source of truth — no per-consumer aggregation.**
- Map each planner's scenario shape → `LifeEvent`(s). Examples:
  - **Home:** down payment + closing as `oneTimeImpact` in purchase year; mortgage P&I + tax/insurance as `recurringAnnual` (negative) over the loan term; equity build optional.
  - **Career:** salary delta as `recurringAnnual` (positive or negative) from change year.
  - **Sabbatical:** income gap as `recurringAnnual` (negative) for the sabbatical window.
  - **Car:** down payment one-time + loan payments recurring.
  - **Family/Education:** already modeled — port their existing logic into this function.
  - **Wedding / Relocation / Windfall / Debt:** one-time impacts (and debt payoff = recurring positive once freed).

## Part A — Forecast write-back (make decisions count)
1. Refactor the forecast/Monte-Carlo input from `futureEvents: FutureEvent[]` to the unified `LifeEvent[]` from `collectLifeEvents`, supporting **recurring** streams (not just one-time `amount_impact`). This alone makes home/career/sabbatical decisions move the retirement number — today they largely don't.
2. **"Committed vs explored"**: a planner scenario should have a clear in-plan state. Add a `committed`/`is_in_plan` flag per scenario (or treat the user's saved/active scenario as committed). Only committed scenarios feed the forecast; exploring a scenario can show a *preview* delta ("this would change retirement 95%→88%") without committing.
3. Surface the write-back in each planner: a persistent line "**In your plan → retirement 92% · FI age 58**" that updates when they commit, closing the loop the roadmap (P4) calls for.

## Part B — Master Life Roadmap (the visual spine)
A flagship horizontal timeline on the **Life Events** tab (becomes the tab's hero, above the planner cards):
- X-axis = years (Today → retirement/age 90). Markers for each committed `LifeEvent`, colored by category, sized by impact.
- Auto-milestones: FI age, target retirement year, "down-payment ready," wealth milestones ($100k/$250k/$500k/$1M) from the forecast.
- **Conflict zones highlighted** (red/amber bands) where the upgraded conflict engine flags pressure.
- Each marker is click-through to its planner (`scenarioId`).
- A net-worth/probability sparkline underneath so the user sees the plan's trajectory with the events overlaid.
- Empty state: "Your plan is empty — model your first life decision" → links to planners.

## Part C — Conflict Detection Engine (upgrade `computeConflictAlerts`)
Feed it `collectLifeEvents` (all sources) and extend beyond clustered-cost:
- **Timing conflicts:** ≥2 major events within N years (existing).
- **Cash-flow stress:** recurring obligations in a year exceed available monthly savings.
- **Retirement-impact concentration:** combined event drag pushes retirement probability below a threshold.
- **Ordering issues:** e.g. large discretionary purchase before emergency fund is funded.
- Output: severity (info/warning/critical) + plain-language recommendation + the years to highlight on the roadmap. Surface in the Action Center (Overview) and as roadmap bands.

## Phasing
1. **P-Spine-1:** `collectLifeEvents()` module + map all planners → unified `LifeEvent[]` (port family/education, add home/career/car/sabbatical/wedding/relocation/windfall/debt). Wire the forecast + Monte Carlo to consume it (recurring support). *No UI yet — verify numbers move.*
2. **P-Spine-2:** Master Life Roadmap timeline UI on the Events tab (read-only render of committed events + milestones + trajectory).
3. **P-Spine-3:** Upgrade `computeConflictAlerts` to the full engine on the unified stream; highlight conflict zones on the roadmap; surface in Action Center.
4. **P-Spine-4:** Committed-vs-explored state + per-planner "in your plan" write-back line + scenario commit/preview UX.

## Acceptance criteria
- Committing a home purchase / career change / sabbatical visibly changes the master forecast's retirement probability and FI age.
- The Events tab shows one timeline with every committed decision, color-coded, click-through to its planner, with conflict zones highlighted.
- The conflict engine sees all planners (not just family/education).
- No regression to existing per-planner math; existing `futureEvents` continue to work (mapped as `source:"manual"`).

## Explicitly NOT in this thrust
- Tax-aware retirement (Social Security/RMD/Roth) — separate thrust (the credibility gap).
- Leveling the stub planners — separate consistency pass.
- Sankey cash flow, whole-plan A/B comparison — later "feel rigorous" thrust.
