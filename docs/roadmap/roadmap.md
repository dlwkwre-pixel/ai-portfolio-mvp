# BuyTune Roadmap

Delete a section once the work ships.

---

## Email Digest (next up)

Weekly summary email, no paid AI tokens. Resend free tier. Template-based HTML.

**New DB column needed:** `email_digest_opt_in boolean default false` on `profiles` table. Write SQL to `supabase/add_email_digest_opt_in.sql`.

**New route:** `app/api/cron/weekly-digest/route.ts`
- GET, protected by `CRON_SECRET` header check
- Install Resend: `npm install resend`
- Env var: `RESEND_API_KEY`
- Add to `vercel.json` cron: `{ "path": "/api/cron/weekly-digest", "schedule": "0 8 * * 1" }` (Monday 8am UTC)

**Per-user email content:**
1. Portfolio name + all-time return vs benchmark (from `public_portfolios` or fallback to `portfolios` + `portfolio_snapshots`)
2. Week-over-week change: compare last 2 `portfolio_snapshots` by date
3. Top 3 holdings with allocation % (from `public_portfolio_holdings` if shared, else from `holdings`)
4. Upcoming earnings in next 7 days (join `holdings` tickers against any earnings table if it exists)
5. FINN health score label if available
6. CTA button linking to their portfolio

**HTML template:** inline styles only (email clients ignore external CSS). Design: dark card on dark bg like the share card, BuyTune logo at top, clean table-based layout for broad compatibility.

**Unsubscribe:** include `?token=<hmac>` link pointing to `app/api/unsubscribe/route.ts` — HMAC-sign `userId` with `UNSUBSCRIBE_SECRET` env var, verify on GET, set `email_digest_opt_in = false`.

**Settings toggle:** add to `/settings` page under a "Notifications" section. Show/hide based on whether `RESEND_API_KEY` is set in env.

---

## Onboarding Flow + Page Intros

Defer until user has tested /planning and /tax and confirmed design direction.

When ready:
- Tutorial overlay for first-time dashboard visit (check `profiles.onboarding_complete`)
- Page intro banners on /planning, /tax, and any future major routes
- "What is this?" inline helpers on Monte Carlo, health score, FINN DNA radar
- Guided first-run: connect portfolio → run AI analysis → explore strategies

---

## Deferred: Push Notifications

Skip until BuyTune is a native iOS/Android app and the $99 Apple developer fee makes sense.

Candidates for when it ships: earnings alerts day-before, portfolio down >3% intraday, new FINN recommendation.

---

## OG Image / iMessage Preview (ongoing bug)

All known fixes are applied (see `app/share/portfolio/[id]/opengraph-image.tsx` comments). Still unconfirmed working.

Next debug step: use https://www.opengraph.xyz/ to test a live share URL. Check Vercel function logs for the OG image route on the relevant deployment. The `NEXT_PUBLIC_SITE_URL` env var must be set to `https://buytune.io` in Vercel settings.
