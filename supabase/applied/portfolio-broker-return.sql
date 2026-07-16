-- Store the broker's OWN computed return for a linked portfolio (from SnapTrade's
-- getUserAccountReturnRates), so we display Robinhood's real number instead of a
-- derived one. Refreshed on every sync. NULL for non-linked portfolios.

alter table public.portfolios
  add column if not exists broker_return_pct   numeric,
  add column if not exists broker_return_as_of timestamptz;
