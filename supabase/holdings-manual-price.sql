-- Non-tradeable / advisor funds (#5): manual NAV tracking.
--
-- Truly non-exchange funds (private / interval / advisor-only funds, some annuities)
-- have NO public price feed — the free market-data APIs (Finnhub / FMP / CoinGecko) only
-- quote exchange-listed tickers and publicly-symboled mutual funds. The only accurate,
-- FREE way to track them is a user-entered NAV that the user refreshes periodically from
-- their statement or advisor.
--
-- Such holdings are stored with asset_type = 'manual' and their latest NAV in manual_price.
-- The valuation engine (lib/portfolio/valuation.ts) skips the live-quote batches for these
-- and values them at shares * manual_price, marking has_live_price = false so the UI can
-- badge them as manual / potentially stale.

alter table holdings add column if not exists manual_price numeric;
alter table holdings add column if not exists manual_price_updated_at timestamptz;

comment on column holdings.manual_price is
  'User-entered NAV for non-tradeable funds (asset_type = manual). No live price feed exists for these; the user refreshes it manually from their statement/advisor.';
comment on column holdings.manual_price_updated_at is
  'Timestamp of the last manual_price update by the user, used to flag a stale NAV in the UI.';
