-- Expanded digest content options so users can "design" their email.
-- Safe to run repeatedly (add column if not exists).

alter table portfolio_digest_preferences add column if not exists include_top_movers   boolean not null default true;
alter table portfolio_digest_preferences add column if not exists include_benchmark    boolean not null default false;
alter table portfolio_digest_preferences add column if not exists include_ai_recs      boolean not null default false;
alter table portfolio_digest_preferences add column if not exists include_week_ahead   boolean not null default false;
alter table portfolio_digest_preferences add column if not exists include_news         boolean not null default false;
alter table portfolio_digest_preferences add column if not exists include_transactions boolean not null default false;
alter table portfolio_digest_preferences add column if not exists include_cash         boolean not null default false;
alter table portfolio_digest_preferences add column if not exists attach_pdf           boolean not null default true;
