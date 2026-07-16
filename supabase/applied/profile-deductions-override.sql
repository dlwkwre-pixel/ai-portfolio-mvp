-- Add pre-tax deductions and net monthly override to financial_profiles
ALTER TABLE financial_profiles
  ADD COLUMN IF NOT EXISTS pre_tax_deductions_annual NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_monthly_override NUMERIC;
