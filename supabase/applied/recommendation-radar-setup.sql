-- AI Radar: structured tracking for (a) attractive-but-not-yet-timed new candidates and
-- (b) tactical sell-and-rewatch re-entry conditions. Both live inside the existing
-- recommendation_items table and the existing 'watchlist' recommendation_status bucket —
-- this just adds the columns needed to make that bucket AI-addressable and traceable.

ALTER TABLE recommendation_items
  ADD COLUMN IF NOT EXISTS radar_type text CHECK (radar_type IN ('new_candidate','re_entry')),
  ADD COLUMN IF NOT EXISTS radar_status text
    CHECK (radar_status IN ('pending_execution','active','ready','expired','invalidated')) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS radar_condition jsonb,
  ADD COLUMN IF NOT EXISTS radar_origin_recommendation_item_id uuid
    REFERENCES recommendation_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_evaluated_at timestamptz,
  ADD COLUMN IF NOT EXISTS eval_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_rec_items_radar_active
  ON recommendation_items (radar_status) WHERE radar_type IS NOT NULL AND radar_status = 'active';
