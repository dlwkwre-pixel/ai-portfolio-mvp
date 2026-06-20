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
