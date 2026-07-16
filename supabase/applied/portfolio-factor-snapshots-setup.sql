-- Portfolio Factor Snapshots
-- Stores factor intelligence state after each AI recommendation run.
-- Used by the Portfolio Evolution Intelligence Layer for drift detection.
-- Run this in the Supabase SQL editor.

create table if not exists portfolio_factor_snapshots (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references portfolios(id) on delete cascade,
  recorded_at timestamptz not null default now(),
  strategy_integrity_score integer,
  portfolio_hhi integer,
  factor_exposure jsonb,         -- e.g. {"ai_infrastructure": 0.72, "high_beta_growth": 0.81}
  behavior_profile jsonb,        -- e.g. {"volatility": "high", "macro_sensitivity": "moderate_high", "drawdown_risk": "elevated"}
  dominant_factors text[],       -- e.g. ["high_beta_growth", "ai_infrastructure", "liquidity_sensitive"]
  created_at timestamptz not null default now()
);

create index if not exists portfolio_factor_snapshots_portfolio_recorded
  on portfolio_factor_snapshots (portfolio_id, recorded_at desc);

alter table portfolio_factor_snapshots enable row level security;

create policy "Users can manage their own factor snapshots"
  on portfolio_factor_snapshots
  for all
  using (
    portfolio_id in (
      select id from portfolios where user_id = auth.uid()
    )
  );
