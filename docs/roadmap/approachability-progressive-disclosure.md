# Approachability & Progressive Disclosure — queued for full treatment

> **Status:** captured 2026-06-20, NOT yet worked. The user typed this while thinking out loud and
> wants a **full response/ideas pass later**, after the current work (tax-aware retirement) is done.
> Do not implement against this yet — it needs its own dedicated design pass.

## The user's concern (verbatim intent)

BuyTune has been handed to a lot of people **without a finance/investing background**, and the
recurring feedback is that it's **daunting at first** — they're overwhelmed by all the available
data and often don't want the hassle of figuring it all out.

This matters strategically because **BuyTune is trying to capture the customer who would otherwise
just ask an AI chatbot for all their answers.** If the first-run experience feels like a terminal,
we lose that person back to ChatGPT.

One piece of feedback specifically: **look at how Fidelity and Robinhood use shapes/figures more
than text** to keep people from feeling overwhelmed, while still letting users drill in if they want.
The user found this an interesting and worthwhile direction.

### The balance to strike
- A good mix of **data accessible to drive decisions** WITHOUT overwhelming a first-time user.
- **We should be creating a story and guiding the user more than anything** — narrative/guided over raw data dumps.
- BUT it must **not feel "too dumb"** for an investor who already knows finance. Don't dumb it down,
  layer it.

## What the full later-response should cover (prompt for future me)
Give concrete ideas to solve this. Likely themes to explore:
- Progressive disclosure: a calm, shape/figure-first **first screen** (Robinhood/Fidelity style)
  with a clear "story" of where the user stands, and explicit affordances to drill deeper.
- A guided **narrative layer** (FINN-led?) that walks a novice through their picture vs. dumping tabs.
- **Density modes / audience modes** (e.g., "Guided" vs "Pro") so familiar investors aren't held back.
- Visual-first summaries (gauges, simple charts, one-number-with-context) over tables on entry.
- First-run / empty-state choreography, defaults that pre-tell a story, fewer simultaneous choices.
- Where this intersects: dashboard, planning Overview tab, AI analysis page, onboarding.

(See related: [[project-light-mode-redesign]] reference to Robinhood, [[project-strategy-flow-redesign]]
onboarding work, [[project-finn-personality]] for the guiding-advisor voice.)

---

## Planning roadmap (decided 2026-06-20, after tax-aware engine completed)

The tax-aware retirement engine is complete (federal brackets, SS taxation, LTCG+basis, state
tax, RMDs, Roth conversions, healthcare/LTC, Monte Carlo, FINN-aware). The frontier moves from
capability → connection + trust. All four tracks below are approved for the roadmap; **building
in this order:**

1. **Guided first-run + narrative Overview** (BUILDING FIRST). The fix for "daunting on arrival":
   on first visit /planning shows ~18 surfaces (7 tabs + 11 planner cards), mostly empty, with no
   "start here." Build a 3-question guided setup (age + retirement age, ~investments, monthly
   savings/expenses) that lands on an immediate **shape-first "here's where you stand"** — one big
   number (retirement readiness), one FINN sentence, one next action. Then reveal the full hub.
   Overview should later lead with a FINN-written plan summary before the dense tabs. Shapes over
   tables on entry; depth on demand. Robinhood/Fidelity calm-first reference.
2. **Deepen the thin planners** (coverage, not line count). Windfall: tax treatment of RSU /
   inheritance / bonus + an explicit employer-401k-match step before "invest." Richer Wedding /
   Relocation / Debt variations. Thin ≠ weak; the gap is missing real-world branches.
3. **Build missing planners** — every life situation: Insurance/protection (life/disability/
   umbrella), Starting/buying a business, Caring for aging parents, Emergency-fund, Big-purchase /
   travel sinking-fund, Inheritance receipt, Major medical event, Divorce, Rental/real-estate
   investment, a dedicated Retirement-income/drawdown planner page, a Tax/Roth-conversion page.
4. **Whole-plan A/B compare + Sankey cash flow** — the two ProjectionLab features still missing.
   "Compare two versions of my life" side by side; Sankey of income→spend→save. High wow-factor.

Constraint (user, 2026-06-20): **no time crunch — make it perfect before advertising to strangers.**
Hold every new planning surface to craft-level UI (Impeccable bar).
