-- Lets a linked brokerage account route its cash to a DIFFERENT portfolio than
-- its position default, the same way individual tickers can already be routed
-- independently. Without this, cash silently reverts to the default portfolio
-- on every re-sync even after the user explicitly chose otherwise in the
-- account-review UI (the choice was applied once but never persisted).

alter table public.brokerage_account_links
  add column if not exists cash_portfolio_id uuid;

comment on column public.brokerage_account_links.cash_portfolio_id is
  'Portfolio this account''s cash balance routes to on sync. Null = fall back to default_portfolio_id (legacy behavior).';
