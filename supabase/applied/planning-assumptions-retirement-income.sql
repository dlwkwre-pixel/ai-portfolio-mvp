-- Retirement income (tax-aware readiness): Social Security materially changes
-- how much portfolio you actually need. Netting it against expenses makes the
-- retirement-readiness math realistic (the 25x rule on net-of-SS spending).
alter table public.planning_assumptions
  add column if not exists social_security_monthly numeric,    -- estimated monthly benefit in today's dollars
  add column if not exists social_security_claim_age integer;  -- age benefits start (e.g. 67)
