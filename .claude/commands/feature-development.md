---
name: feature-development
description: End-to-end feature workflow for BuyTune.io — Next.js App Router, Supabase, TypeScript.
allowed_tools: ["Bash", "Read", "Write", "Edit", "Grep", "Glob"]
---

# /feature-development

Use this workflow when implementing a new feature or significant enhancement in BuyTune.

## Pre-flight

Before writing code, answer these questions:
1. Which page/route does this feature live on?
2. Does it need new Supabase tables or columns? If yes, run `/database-migration` first.
3. Is there a Server Component, Client Component, or Server Action boundary involved?
4. Does it need a new API route, or can it use an existing one?

## Suggested Sequence

1. **Read the relevant files** — understand current state before touching anything.
2. **Plan the data layer** — Supabase schema, RLS policy, TypeScript types.
3. **Implement server-side** — server actions in `[feature]-actions.ts`, API route if external data is needed.
4. **Implement UI** — follow `DESIGN.md` tokens, `PRODUCT.md` principles. Run `$impeccable craft` for significant UI work.
5. **Type-check** — `npx tsc --noEmit` must pass clean.
6. **Test the golden path** — start dev server, manually verify the feature works end to end.
7. **Commit** — conventional commit message, `feat:` prefix.

## Key File Locations

- Pages: `app/[page]/page.tsx` (Server Component)
- Client components: `app/[page]/[component].tsx` with `"use client"` directive
- Server actions: `app/[page]/[feature]-actions.ts` with `"use server"` directive
- API routes: `app/api/[feature]/route.ts`
- Shared UI: `app/components/`
- Market data: `lib/market-data/`
- Portfolio logic: `lib/portfolio/`
- Supabase client: `lib/supabase/server.ts` (server), `lib/supabase/client.ts` (client)

## BuyTune Conventions

- All database access goes through Supabase; never call AI APIs from the client
- Verify RLS: every new table needs a policy tied to `auth.uid()`
- Dark theme only: use CSS tokens (`var(--bg-base)`, `var(--text-primary)`, etc.) — no raw hex values except in DESIGN.md-defined globals
- Mobile-first: every component must work at 375px width
- Finnhub calls must batch through the rate-limited helper in `lib/market-data/`
- TypeScript strict — no `any` unless truly unavoidable

## Commit Signals

- `feat: add [feature name]`
- `feat: [page] — [what changed]`
