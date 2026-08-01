-- Tracks the specific due-date OCCURRENCE (not the click date) last satisfied for
-- a recurring expense, so "Available to Invest" can tell whether the upcoming/
-- current cycle has already been paid. Only used for expense items with
-- frequency in ('monthly','semimonthly') and due_day/due_day_2 set.
alter table cash_flow_items add column if not exists last_paid_for_date date;
