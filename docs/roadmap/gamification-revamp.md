# Gamification Revamp — Scope (2026-06)

## Why
Engagement is the #1 lever for a retail-investing app, and our gamification today is thin:
badges exist (`lib/badges/definitions.ts`, `lib/badges/check.ts`, `user_badges`) but they only
show on the public profile (`app/[username]/badges-section.tsx`), most are login-streak based,
and nothing surfaces in the daily flow. Goal: turn this into a cohesive, visible loop that
rewards the behaviors we actually want (funding goals, reviewing the portfolio, following a
strategy, learning) — with **zero AI/token cost** (everything is event-driven off user actions
the app already records).

## Current state (what we build on)
- `user_badges` (user_id, badge_id, earned_at) + RLS (public read, own insert).
- `BADGES` catalog: tiers bronze/silver/gold/legendary; categories streak/setup/portfolio/
  strategy/ai/community.
- `lib/badges/check.ts` evaluates and awards.
- Surfaced only on the profile page.

## The revamp — five pillars

### 1. Levels & XP (the spine)
A single visible progression number so every action "counts."
- New table `user_xp (user_id, xp, level, updated_at)` + an `xp_events` ledger
  (user_id, kind, xp, created_at) for idempotency + history.
- Award XP on real events (no new tracking needed): add a holding, log a transaction,
  fund a goal / hit a savings milestone, complete the profile, run an AI analysis, assign a
  strategy, finish a tutorial, maintain a login streak, post in community.
- Level curve: simple `level = floor(sqrt(xp / 100))`-style so early levels come fast.
- Award server-side in the same actions that already run (e.g., `createHolding`,
  `upsertFinancialProfile`, `runPortfolioAiRecommendation`) via a tiny `awardXp(kind)` helper
  that's idempotent per (user, kind, period).

### 2. Badges 2.0 (meaningful, tiered, progress-visible)
- Expand beyond login streaks to outcome/behavior badges: "Diversified" (holdings across N
  sectors), "Emergency Fund Funded" (cash ≥ chosen months), "401(k) Maximizer" (capturing full
  match), "Tax-Loss Harvester," "Strategist" (created + assigned a strategy), "Researcher" (X
  stocks researched), "Plan Complete" (profile + budget + goals filled).
- Show **progress toward unearned badges** ("3 / 5 sectors"), not just earned ones.
- Keep the existing catalog shape; add the new definitions + check logic.

### 3. Streaks, surfaced
- Promote the login/activity streak from a hidden badge to a small **flame + day count** in the
  sidebar/dashboard header, with a gentle "don't break your streak" nudge. Streak data likely
  needs a `user_activity (user_id, last_active_date, current_streak, longest_streak)` row updated
  once per day on app load.

### 4. Challenges / quests (rotating, optional)
- A short checklist of "this week" actions ("review your portfolio," "fund your goal," "run an
  AI scan," "read one Learn card") that grant XP + a badge on completion. Drives return visits.
- Data: `user_challenges` or compute from `xp_events` against a small rotating catalog.

### 5. Where it shows (the loop)
- **Dashboard header:** level chip + XP-to-next-level bar + streak flame.
- **A "Progress" / Achievements page** (or a tab): level, XP history, all badges with progress,
  active challenges. Replaces the profile-only view as the home of gamification.
- **Toasts/notification bell:** "+25 XP — Holding added," "Badge unlocked: Diversified," level-up
  celebration. Reuse the existing `app_notifications` bell for milestone pushes.
- Keep public badges on the profile (social proof), but the *engine* lives in the app.

## Data model summary (new)
- `user_xp` (current xp + level)
- `xp_events` (ledger — idempotency + history + challenge tracking)
- `user_activity` (streak)
- extend `BADGES` catalog + `check.ts`

## Phasing
1. **P1 — XP engine + levels** ✅ SHIPPED: `supabase/gamification-xp.sql` (user_xp + xp_events
   ledger, idempotent via dedup_key), `lib/gamification/xp.ts` (awardXp/getUserXp/level curve),
   wired into createHolding / upsertFinancialProfile / AI-run actions, dashboard level chip
   (`app/components/xp-level-chip.tsx`). ⚠️ run supabase/gamification-xp.sql.
2. **P2 — Badges 2.0** ✅ SHIPPED: new tiered behavior badges (holdings_10/25, multi_portfolio,
   ai_25, exec_10, follower_10) with **progress bars** toward unearned ones; per-badge `progress`
   metadata (`{metric, target}`) in definitions.ts; `getBadgeContext` + `badgeMetrics` extracted
   in check.ts so progress reuses the same counts the awarder evaluates; shared `BadgeIcon`
   component (`app/components/badge-icon.tsx`); **Achievements hub** at `/achievements` (level
   medallion + XP bar + recent-XP feed + all badges grouped by category with progress), linked
   from the sidebar Discover section + the clickable dashboard XP chip. Badges auto-award on the
   existing dashboard/profile load paths (no new wiring). NOTE: sector-based ("Diversified across
   N sectors") + budget/emergency-fund badges deferred — they need per-holding sector data /
   planning-profile reads not yet in BadgeContext; current count-based set ships value now.
3. **P3 — Streaks surfaced** ✅ MOSTLY DONE: login/activity streak with smart weekday+US-holiday
   logic (app/dashboard/streak-actions.ts: recordDailyActivity) + StreakBadge in the dashboard
   header (app/dashboard/streak-badge.tsx). Remaining nice-to-have: a sidebar flame + a
   "don't break your streak" nudge (low priority — already visible on the main screen).
4. **P4 — Challenges** ✅ SHIPPED: rotating weekly quests on the Achievements hub
   (lib/gamification/challenges.ts). 3 quests computed from this-ISO-week data (AI analysis →
   recommendation_runs, community post → community_posts, build a strategy → strategies); XP
   credited once per week per quest via the xp_events dedup key `challenge:<id>:<weekKey>` (no
   new tables). awardXp gained an amountOverride for variable awards. Surfaced as "This week's
   challenges" with done/incomplete state. FUTURE: bell celebration on completion + more quest
   variety (log a transaction, execute a recommendation) once those tables' created_at confirmed.

## Guardrails
- **No token/AI cost** — all triggers are user actions already persisted; XP is awarded in the
  same DB writes. (Contrast with the shelved "community symphonies" idea, which would cost a
  Grok run per use.)
- Idempotent awards (the `xp_events` ledger prevents double-credit on retries/refreshes).
- Don't gamify risky behavior — reward *good habits* (saving, diversifying, learning, reviewing),
  never trade frequency or chasing performance.

## Open questions for product
- Level curve aggressiveness (fast early levels vs. slow burn)?
- Do levels unlock anything (cosmetic avatar frames? feature flair?) or purely status?
- Weekly challenges: auto-rotating catalog vs. curated?
