-- Add optional due_day (1–31) to cash flow items for bill calendar
alter table cash_flow_items add column if not exists due_day smallint check (due_day between 1 and 31);
