# BuyTune Roadmap

Delete a section once the work ships.

---

## Planning OS — Master Vision

Full product vision and page-by-page spec for transforming Planning into a Financial Operating System.

See: [docs/roadmap/planning-os.md](planning-os.md)

North star: every Planning page answers "What should I do next?" and feels like a financial advisor, not a calculator.

---

## Email Aliases (infra, not code)

Set up three forwarding aliases on buytune.io that forward to your real inbox:
- `legal@buytune.io`
- `privacy@buytune.io`
- `support@buytune.io`

Use email forwarding in your domain registrar (Cloudflare Email Routing, Namecheap, etc.) — no separate inbox needed. Required before legal pages go live publicly.

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

## Deferred: Push Notifications

Skip until BuyTune is a native iOS/Android app and the $99 Apple developer fee makes sense.

Candidates for when it ships: earnings alerts day-before, portfolio down >3% intraday, new FINN recommendation.
