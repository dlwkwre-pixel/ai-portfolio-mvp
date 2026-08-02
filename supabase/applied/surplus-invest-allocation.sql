-- While the emergency fund (financial_profiles.emergency_fund_months) is below
-- target, this is the % of free cash the "Available to Invest" card treats as
-- investable right now — the rest is earmarked toward the fund. Once the fund is
-- fully funded, 100% of surplus above the target is available regardless of this.
alter table financial_profiles add column if not exists surplus_to_invest_pct numeric default 50;
