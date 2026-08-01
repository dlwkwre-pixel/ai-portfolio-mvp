-- Second due day for semimonthly cash flow items (e.g. paycheck on the 15th AND
-- last day of month). Only meaningful when frequency = 'semimonthly'; null otherwise.
-- Mirrors the existing due_day column/constraint from cash-flow-due-day.sql.
alter table cash_flow_items add column if not exists due_day_2 smallint check (due_day_2 between 1 and 31);
