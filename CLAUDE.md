# BuyTune.io — AI Portfolio Management App

## Project Overview
BuyTune.io is an AI-powered portfolio management web app. Live at buytuneio.vercel.app.
GitHub: https://github.com/dlwkwre-pixel/ai-portfolio-mvp

## Tech Stack
- **Framework:** Next.js App Router (TypeScript)
- **Auth + DB:** Supabase
- **Styling:** Tailwind CSS + custom CSS design tokens
- **Fonts:** Syne, DM Sans, DM Mono
- **AI:** Grok API (grok-4-fast) with live web/X search, Gemini Flash
- **Market Data:** Finnhub (holdings/quotes), FMP (benchmark history)
- **Deployment:** Vercel

## Repo Structure
- `app/` — all Next.js pages and components
- `app/components/` — shared UI components
- `app/api/` — API routes
- `lib/market-data/` — Finnhub + FMP data fetching
- `lib/portfolio/` — portfolio calculation logic
- `public/` — static assets, PWA icons

## Design System
- Full dark/light mode via CSS tokens
- Dark bg: `#040d1a`, card surfaces: `bg-white/5`, borders: `border-white/10`
- Blue accent: `#2563eb` → `#4f46e5` (gradient)
- All interactive elements use `rounded-xl`, subtle hover states
- Keep everything consistent with existing token usage — do not introduce new color values

## What's Built and Working
- Dashboard with portfolio overview + performance analytics
- Portfolio detail page with chart, holdings table, overview tab
- AI analysis via Grok (live search) + Gemini health score
- Strategies page with public/private toggle
- AI Strategy Builder (chat-based, routes through `/api/strategies/chat` → Gemini Flash)
- Social features: community page, profiles, follow, like, save, copy as template, people search
- Profile settings: avatar color picker, visibility toggle
- PWA: manifest, service worker, app icons
- Mobile bottom nav: Home, Portfolios, Strategies, Community, Profile
- Live market ribbon on landing page via `/api/market/ribbon`
- Earnings alert banner on portfolio pages
- Finnhub rate limiting: batches of 3, retry on 429

## AI API Setup
- **Gemini Flash** is the primary free AI — used for health scores and strategy builder
  - Env var: `GEMINI_API_KEY`
  - Endpoint: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`
- **Grok** (grok-4.3) — used for portfolio analysis with live web/X search
  - Env var: `GROK_API_KEY` (or `XAI_API_KEY`)
- Never call AI APIs directly from the client — always proxy through `/api/` routes

## Key Coding Conventions
- Use `async/await` with proper error handling in all API routes
- Finnhub calls must go through the rate-limited batch helper in `lib/market-data/`
- All new pages follow the existing dark theme — no white backgrounds
- Mobile-first: every new component must work on 375px width
- Use `border-white/10` dividers, `text-slate-400` for secondary text, `text-white` for primary
- TypeScript strict — no `any` types unless absolutely necessary
- New API routes go in `app/api/[feature]/route.ts`
@AGENTS.md
