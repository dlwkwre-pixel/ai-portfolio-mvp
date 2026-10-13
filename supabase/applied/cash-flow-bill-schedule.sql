-- Bills that repeat every N months (insurance every 6, a renewal every 12, a service every 4).
-- The interval itself lives in cash_flow_items.frequency as 'every_{N}_months' (or the
-- existing 'quarterly' / 'annual'); these columns add when it's due and how to count it.

-- Any date the bill is due (YYYY-MM-DD); due months repeat every N months from here.
ALTER TABLE cash_flow_items ADD COLUMN IF NOT EXISTS due_anchor DATE;

-- 'spread'    = set aside amount/N every month; the payment month doesn't spike
-- 'when_paid' = nothing in other months, the full amount in the month it's due
ALTER TABLE cash_flow_items ADD COLUMN IF NOT EXISTS bill_mode TEXT NOT NULL DEFAULT 'spread';
ALTER TABLE cash_flow_items DROP CONSTRAINT IF EXISTS cash_flow_items_bill_mode_check;
ALTER TABLE cash_flow_items ADD CONSTRAINT cash_flow_items_bill_mode_check CHECK (bill_mode IN ('spread', 'when_paid'));

-- Budget history only allowed 'monthly' / 'annual', so history rows for weekly, biweekly,
-- semimonthly, quarterly (and now every-N-months) items were silently rejected.
ALTER TABLE cash_flow_budget_history DROP CONSTRAINT IF EXISTS cash_flow_budget_history_frequency_check;
