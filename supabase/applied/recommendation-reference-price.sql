-- Reference price at recommendation time.
-- Stamped on every AI rec item when the run completes (best-effort, from the
-- holdings valuation already in the AI context). Enables the "recs you followed
-- vs recs you skipped" outcome delta: skipped recs previously had no baseline
-- price, so their hypothetical performance couldn't be computed.

ALTER TABLE recommendation_items
  ADD COLUMN IF NOT EXISTS reference_price numeric(12, 4);
