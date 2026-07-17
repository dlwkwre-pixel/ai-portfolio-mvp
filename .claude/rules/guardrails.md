# BuyTune Guardrails

Adapted from everything-claude-code for the BuyTune.io Next.js/TypeScript codebase.

## Commit Workflow

- Use conventional commit prefixes: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`
- Keep subjects near 70 characters
- Co-author line for Claude: `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`

## TypeScript

- Strict mode is on — no `any` unless truly unavoidable and commented
- Prefer explicit return types on exported functions
- Use `type` imports: `import type { Foo } from "./types"`
- Server actions must be in files with `"use server"` at the top
- Client components must have `"use client"` as the first line

## File Naming

- Pages: `page.tsx`, `layout.tsx` (Next.js conventions)
- Client components: `kebab-case.tsx` (e.g., `portfolio-header.tsx`)
- Server actions: `[feature]-actions.ts`
- API routes: `route.ts` inside `app/api/[feature]/`
- Library modules: `kebab-case.ts` inside `lib/`

## Architecture Boundaries

- Never call AI APIs (Grok, Gemini) from client components — always proxy through `app/api/`
- Never call Finnhub directly from pages — use helpers in `lib/market-data/`
- Server actions (`"use server"`) are for Supabase mutations, not external API calls
- External API calls go in `app/api/[feature]/route.ts` (called from client via `fetch`)

## Supabase / Database

- Every mutation verifies user ownership: `.eq("user_id", user.id)` or via RLS
- RLS is the safety net, not the primary check — both are required
- New tables must have a SQL file in `supabase/` before shipping the feature
- `supabase/` root = NOT yet run against the live DB; after running a file in the SQL editor, `git mv` it to `supabase/applied/` (see supabase/README.md)
- Use `.maybeSingle()` when 0 rows is valid; `.single()` when 0 rows is an error

## UI / Design

- Dark theme only — use CSS tokens, never raw hex in component files
- Gains/up = `var(--green)`, losses/down/errors = `var(--red)` — never Tailwind emerald/green/red literals (unlayered remaps in globals.css catch legacy classes)
- Font sizes use the type-scale tokens (`--text-2xs` … `--text-lg`); floor is 10px — nothing user-facing smaller (numeric SVG chart ticks exempt)
- Border radii use `--radius-sm/md/lg/xl/full`, not ad-hoc pixel values
- Tailwind v4: arbitrary values with CSS vars use paren syntax `bg-(--bg-base)` — the bracket form `bg-[var(--x)]` silently generates NO utility
- All numeric values use DM Mono font (`var(--font-mono)`)
- New buttons/chips/section headers use the primitives in `app/components/ui-primitives.tsx` (Button, Chip, SectionHeader) — no more bespoke inline-styled buttons; migrate old ones opportunistically when touching a file
- Touch targets minimum 44px on mobile
- Mobile-first: all new components tested at 375px
- Run `$impeccable craft` or `$impeccable shape` for significant new UI surfaces

## Security

- Never log or return Supabase service role key
- Validate user ownership in every server action before any mutation
- No `dangerouslySetInnerHTML` without explicit sanitization
- SQL files in `supabase/` are documentation only — never execute via the app

## Review Reminder

Update these guardrails when project conventions materially change.
