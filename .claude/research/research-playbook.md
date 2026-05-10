# BuyTune Research Playbook

Use this when the task is documentation-heavy, source-sensitive, or requires broad codebase context.

## Defaults

- Inspect local code and docs first — the source of truth is in the repo
- Browse (`context7` MCP or web) only for unstable facts: library APIs, Next.js behavior, Supabase edge cases
- Keep a short evidence trail: file paths, line numbers, or links

## Suggested Flow

1. **Read the relevant files** — start with `CLAUDE.md`, `docs/architecture/system-map.md`, then drill into the specific module
2. **Check the database map** — `docs/architecture/database-map.md` for schema questions
3. **Check design system** — `DESIGN.md` or `docs/ui/design-language.md` before touching UI
4. **Use context7 MCP** for Next.js App Router docs, Supabase client API, and Tailwind — these change between versions
5. **Use web search** for Finnhub/FMP/Grok API specifics and rate limit behavior
6. **Summarize findings** with file paths and line numbers before implementing

## Repo Signals

- Primary language: TypeScript (strict)
- Framework: Next.js 14+ App Router
- Database: Supabase (PostgreSQL + RLS)
- Deployment: Vercel
- AI APIs: Grok (grok-4-fast) for portfolio analysis, Gemini Flash for health scores + strategy builder
- Market data: Finnhub (quotes/company), FMP (benchmark history)

## Key Docs

- `CLAUDE.md` — tech stack, conventions, current backlog
- `PRODUCT.md` — users, brand, design principles
- `DESIGN.md` — full design system tokens and component specs
- `docs/architecture/system-map.md` — page/route/component map
- `docs/architecture/database-map.md` — Supabase tables, columns, relationships
- `docs/ai/finn-behavior.md` — AI system behavior (FINN planning layer)
- `docs/roadmap/phases.md` — current phase and upcoming work
- `docs/planning/buytune-planning-system.md` — financial planning system vision
