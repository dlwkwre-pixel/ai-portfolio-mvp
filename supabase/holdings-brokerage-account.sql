-- Tags a holding as sourced from a specific linked brokerage account. This lets one
-- brokerage account feed MULTIPLE BuyTune portfolios (e.g. a taxable account split by
-- holding period), with each portfolio reconstructed from only its own assigned tickers
-- and its own chart start date.
--
-- Safe to run more than once.
alter table if exists public.holdings
  add column if not exists brokerage_account_id text;

-- Fast lookup of "which portfolios does this account feed" and "is this portfolio linked".
create index if not exists holdings_brokerage_account_idx
  on public.holdings (brokerage_account_id)
  where brokerage_account_id is not null;

create index if not exists holdings_portfolio_brokerage_idx
  on public.holdings (portfolio_id, brokerage_account_id)
  where brokerage_account_id is not null;
