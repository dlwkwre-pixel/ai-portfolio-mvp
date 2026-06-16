-- User-assignable category on cash flow items. When null, the app falls back
-- to keyword inference from the label (getCategoryForExpense). When set, it is
-- the source of truth so users can correct a miscategorized item.
-- Safe to run repeatedly.

alter table cash_flow_items add column if not exists category text;
