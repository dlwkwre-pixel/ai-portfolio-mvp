-- "To review" for bank-synced transactions: new ones show up front until the user marks
-- them reviewed; reviewed ones move into the full list. Statement imports and manual
-- entries were already reviewed when they were added, so only source = 'plaid' rows use this.
ALTER TABLE cash_flow_transactions ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- Everything synced so far was sorted by hand already — start with a clean slate.
UPDATE cash_flow_transactions SET reviewed_at = NOW() WHERE reviewed_at IS NULL;
