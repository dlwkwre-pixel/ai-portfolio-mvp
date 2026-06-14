-- Week Ahead market outlook cache
-- One row per "week_start" (Monday of the analyzed week).
-- data_hash detects input changes so Gemini only fires when something materially changes.
-- Typically refreshed every 2 hours via the API route's revalidate setting.

create table if not exists market_week_ahead (
  id bigserial primary key,
  week_start date not null unique,
  data_hash text not null,
  volatility text not null,   -- "Low" | "Medium" | "High" | "Extreme"
  lean text not null,         -- "Bullish" | "Cautious" | "Bearish"
  headline text not null,
  key_events jsonb not null default '[]'::jsonb,
  summary text not null,
  generated_at timestamptz not null default now(),
  data_fetched_at timestamptz not null default now()
);

-- No RLS needed — public market data, read-only from app
