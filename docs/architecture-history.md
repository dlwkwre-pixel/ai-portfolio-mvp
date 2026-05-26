# BuyTune Architecture History

Chronological record of major architectural decisions, pivots, and feature additions.
For current system structure, see [system-map.md](architecture/system-map.md) and [database-map.md](architecture/database-map.md).

---

## Phase 0 — Foundation (Early 2026)

**Stack chosen:** Next.js App Router (TypeScript), Supabase (auth + DB), Vercel (hosting), Tailwind CSS.

**Core decisions:**
- App Router over Pages Router for server components, streaming, and simplified auth patterns
- Supabase over Firebase for relational data, row-level security, and SQL flexibility
- Dark-only theme from day one — no light mode complexity
- Mobile-first: bottom nav for app, full responsiveness throughout

**Initial features:** portfolio CRUD, holdings table, basic performance chart, Finnhub market data integration.

---

## Phase 1 — AI Intelligence Layer

**AI architecture:** Proxy all AI calls through `/api/` routes — never from client. This was established early and is a hard guardrail in CLAUDE.md.

**Gemini Flash** chosen as primary AI for health scores and strategy generation (cost-effective, fast).
**Grok** (xAI) added for portfolio analysis with live web/X search context.

**Institutional 3-Layer Architecture (major refactor):**
- Layer 1: Portfolio Construction Intelligence (strategy-relative concentration)
- Layer 2: Factor Intelligence (behavioral profiling)
- Layer 3: Portfolio Evolution Intelligence (temporal drift)
- Plus: Position Thesis Memory, Catalyst Intelligence, Output Presentation Layer

This refactor transformed AI output from generic summaries into institutional-grade PM briefings.

---

## Phase 2 — Social and Community

- Public portfolio sharing with share cards and animations
- Community page: public portfolios feed, people search, trending
- Follow, like, save, copy-as-template social graph
- Public user profiles at `/[username]`
- Strategy Builder (chat-based, Gemini Flash)
- Community leaderboard tab

---

## Phase 3 — Email and Notifications

- Per-portfolio email digest with frequency controls
- Timezone-aware send time
- PDF investor report attachment (generated server-side)
- Email template redesign: PE investor letter format
- Resend for delivery; test email button in settings
- Full Report link fix: unauthenticated users redirect to `/login?next=` instead of home

**CRON architecture:** Vercel cron jobs trigger `/api/cron/` routes. Hobby plan: daily max.
**Known gap:** CRON routes currently don't validate a `CRON_SECRET` header — flagged in compliance dashboard.

---

## Phase 4 — Financial Planning

- `/planning` route added
- Retirement projection calculator
- Net worth tracker (assets + liabilities)
- Cash flow modeling
- Financial health score
- Estate & will planning tab
- Actual vs. forecasted expense tracker
- Home planning with local market intelligence (Census ACS + FRED data)
- Compare vs. Forecast tab consolidation

---

## Phase 5 — Gamification and Engagement

- Achievement badge system (profile showcase)
- Daily activity streak badge on dashboard
- Streak logic: only resets on missed weekdays that are not US federal bank holidays
- Streak badge hover animation (glow + flame flicker)
- Recommendation outcome intelligence (entry price tracking, running return)
- Reddit Social Pulse integration in research tab

---

## Phase 6 — Legal and Compliance Foundation (May 2026)

- All 5 legal pages created: Terms of Service, Privacy Policy, AI Disclaimer, Investment Disclaimer, Financial Planning Disclaimer
- Legal layout with sidebar navigation at `/legal/`
- Footer legal links on landing page
- Terms + Privacy links in signup flow
- Admin compliance dashboard at `/admin/compliance`
- `docs/intellectual-property.md` created
- Platform language audit (see below)

---

## Removed Features

| Feature | Reason | Commit |
|---|---|---|
| Congressional trades (QuiverQuant) | API reliability issues | `a9887e5` |
| Congressional trades (FMP) | S3 data sources returning 403 | `70044f5` |
| Congressional trades (Senate/House Stock Watcher S3) | Same 403 issue | `a9887e5` |
| Local Market Intelligence panel in Home Planning | Consolidated into Compare/Forecast tab | `eb70e1f` |

---

## Key Architectural Invariants

These decisions are load-bearing and should not be reversed without discussion:

1. **No AI calls from client** — all Grok/Gemini calls go through `/api/` routes
2. **No Finnhub direct from pages** — always through `lib/market-data/` rate-limited helper
3. **RLS on every table** — user data is row-scoped; service role key is server-only
4. **Server actions for Supabase mutations only** — not for external API calls
5. **Dark theme only** — no light mode; CSS tokens throughout, no raw hex in components
6. **Educational framing** — BuyTune is not a registered investment adviser; all AI output labeled as educational

---

## Planned (Next)

| Feature | Priority | Notes |
|---|---|---|
| BIMI inbox sender icon | Deferred | Requires DNS + VMC certificate |
| CRON_SECRET header validation | Near-term | Prevent unauthorized cron trigger |
| Financial Planning Phase 2 | Future | Tax-aware projections, Social Security estimation |
| FINN Personality System | Planned | Institutional AI experience, thinking states, Strategy DNA |
