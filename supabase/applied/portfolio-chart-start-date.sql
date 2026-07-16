-- Optional per-portfolio chart start date. For a brokerage-linked portfolio, the
-- history is rebuilt from the broker's value series starting at this date, so a user
-- can exclude an old period (e.g. early losses + a dormant gap) from their chart and
-- return. NULL = use the default lookback. Only affects linked portfolios.

alter table public.portfolios
  add column if not exists chart_start_date date;
