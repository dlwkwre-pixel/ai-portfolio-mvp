-- Position Thesis Memory
-- Stores the original thesis, portfolio role, and conviction for each position.
-- Auto-seeded when a buy recommendation is marked as "executed" in BuyTune.
-- Run this in the Supabase SQL editor.

create table if not exists position_thesis (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references portfolios(id) on delete cascade,
  ticker text not null,
  original_thesis text,           -- brief thesis from the buy recommendation
  portfolio_role text,            -- core_holding | high_conviction_growth | tactical_momentum | starter_position | defensive_stabilizer | asymmetric_upside
  holding_profile text,           -- short_term_tactical | medium_term_momentum | long_term_compounder | event_driven | cyclical_hold
  entry_conviction text,          -- low | moderate | high | very_high
  thesis_status text not null default 'intact',  -- intact | strengthening | weakening | broken
  thesis_notes text,
  seeded_from_run_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint position_thesis_portfolio_ticker_unique unique (portfolio_id, ticker)
);

create index if not exists position_thesis_portfolio_id
  on position_thesis (portfolio_id);

alter table position_thesis enable row level security;

create policy "Users can manage their own position thesis"
  on position_thesis
  for all
  using (
    portfolio_id in (
      select id from portfolios where user_id = auth.uid()
    )
  );
