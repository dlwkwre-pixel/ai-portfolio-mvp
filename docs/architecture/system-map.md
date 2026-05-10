# BuyTune System Map

Full map of pages, API routes, components, and library modules.
Keep this updated when adding new routes or major components.

---

## Pages (App Router)

| Route | File | Type | Purpose |
|---|---|---|---|
| `/` | `app/page.tsx` | Server | Landing / marketing page with live market ribbon |
| `/dashboard` | `app/dashboard/page.tsx` | Server | Main hub: portfolio overview, feed, onboarding |
| `/portfolios/[id]` | `app/portfolios/[id]/page.tsx` | Server | Portfolio detail: holdings, chart, AI recs, strategy |
| `/strategies` | `app/strategies/page.tsx` | Server | Strategy library: public/private toggle |
| `/community` | `app/community/page.tsx` | Server | Social feed: public portfolios, people, trending |
| `/research` | `app/research/page.tsx` | Server | Stock research hub (in progress) |
| `/profile` | `app/settings/page.tsx` | Server | Profile settings: avatar, visibility |
| `/[username]` | `app/[username]/page.tsx` | Server | Public user profile |
| `/login` | `app/login/page.tsx` | Client | Auth: Supabase magic link / OAuth |
| `/signup` | `app/signup/page.tsx` | Client | Auth: new user registration |
| `/learn` | `app/learn/page.tsx` | Server | Educational content |
| `/offline` | `app/offline/page.tsx` | Client | PWA offline fallback |

### Planned

| Route | Purpose |
|---|---|
| `/planning` | Financial planning hub (Phase 1 — next major project) |

---

## API Routes

### Market Data
| Route | Source | Purpose |
|---|---|---|
| `GET /api/market/ribbon` | Finnhub | Landing page live ticker: SPY, QQQ, BTC, etc. |
| `GET /api/market-data/[ticker]` | Finnhub | Full quote + company profile for a ticker |
| `GET /api/market-data/chart/[ticker]` | FMP | Historical price chart data |
| `GET /api/sparkline/[ticker]` | Finnhub | 5-day sparkline data |
| `GET /api/stock-chart/[ticker]` | Finnhub/FMP | Portfolio chart overlay |

### Research
| Route | Purpose |
|---|---|
| `GET /api/research/search` | Ticker search (Finnhub symbol search) |
| `GET /api/research/news` | Market news for a ticker |
| `GET /api/research/screener` | Pre-built screener sections (trending, momentum, etc.) |
| `GET /api/research/trending` | Trending tickers on platform |
| `POST /api/research/ai-analysis` | Gemini Flash analysis for a stock |
| `POST /api/research/track` | Track ticker view (for trending) |

### AI
| Route | Purpose |
|---|---|
| `POST /api/recommendations` | Grok (grok-4-fast) portfolio analysis with live search |
| `POST /api/strategies/chat` | Gemini Flash AI strategy builder chat |
| `GET /api/social-pulse/[ticker]` | Reddit Social Pulse (PRAW or Reddit API) |

### Utilities
| Route | Purpose |
|---|---|
| `GET /api/portfolio-order` | Reorder portfolio display_order |
| `GET /api/cron/daily-snapshot` | Vercel cron: daily portfolio snapshot |

---

## Key Components

### Shared (`app/components/`)
- `sidebar.tsx` — Desktop left nav (portfolios list, nav links)
- `mobile-nav.tsx` — Bottom tab bar: Home, Portfolios, Strategies, Community, Profile

### Portfolio Page (`app/portfolios/[id]/`)
- `portfolio-header.tsx` + `PortfolioStatCards` — Topbar with value/cash/positions stats
- `portfolio-tabs.tsx` — Tab switcher: Overview, Holdings, Analysis, Strategy, Notes, Share
- `portfolio-chart-section.tsx` — Net worth chart (Recharts), intraday snapshot logic
- `holdings-table.tsx` — Holdings list with live quotes
- `ai-recommendations-section.tsx` — Grok recommendations display
- `run-ai-controls.tsx` — Run AI button + context note textarea
- `audit-portfolio-modal.tsx` — "Sync Holdings" CSV/paste import modal
- `portfolio-performance-section.tsx` — Performance vs. benchmark
- `assign-strategy-form.tsx` — Strategy assignment
- `earnings-alert-banner.tsx` — Upcoming earnings warning

### Dashboard (`app/dashboard/`)
- `dashboard-client.tsx` — Full client-side dashboard with onboarding modal trigger

### Onboarding (`app/onboarding/`)
- `onboarding-modal.tsx` — 7-step portfolio setup wizard
- `actions.ts` — Server actions for onboarding steps

---

## Library Modules (`lib/`)

| Module | Purpose |
|---|---|
| `lib/supabase/server.ts` | Supabase server client (uses cookies) |
| `lib/supabase/client.ts` | Supabase browser client |
| `lib/portfolio/valuation.ts` | `getPortfolioValuation()` — calls Finnhub for live prices |
| `lib/market-data/finnhub.ts` | Rate-limited Finnhub client (batch of 3, retry on 429) |
| `lib/market-data/fmp.ts` | FMP historical data client |
| `lib/portfolio-audit/diff.ts` | Compute holdings drift between imported and current |
| `lib/portfolio-audit/parsers/robinhood.ts` | Parse Robinhood CSV exports |
| `lib/portfolio-audit/parsers/paste.ts` | Parse free-form ticker/shares paste |
| `lib/portfolio-audit/parsers/types.ts` | Shared types for the audit system |

---

## Data Flow Summary

```
Browser (Client Component)
  → fetch() / Server Action
    → app/api/[route]/route.ts  ← external APIs (Finnhub, FMP, Grok, Gemini)
    → "use server" actions       ← Supabase mutations

Server Component (page.tsx)
  → createClient() (server Supabase)
  → getPortfolioValuation() (Finnhub via lib/)
  → renders props into Client Components
```

---

## Environment Variables

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role (server only) |
| `FINNHUB_API_KEY` | Finnhub market data |
| `FMP_API_KEY` | Financial Modeling Prep historical data |
| `GEMINI_API_KEY` | Google Gemini Flash |
| `GROK_API_KEY` / `XAI_API_KEY` | xAI Grok API |
| `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` | Reddit API (Social Pulse) |
