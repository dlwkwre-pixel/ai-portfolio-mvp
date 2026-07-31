-- Cross-run recommendation linkage + position_thesis revision history.
--
-- Gives the AI recommendation engine memory of its own past calls (fixes it repeating
-- BUY on a ticker with no awareness of a prior call at a different price) and lets
-- position_thesis.thesis_status actually be revised over time instead of being frozen
-- at 'intact' forever after the initial buy-seed.

ALTER TABLE recommendation_items
  ADD COLUMN IF NOT EXISTS supersedes_recommendation_item_id uuid
    REFERENCES recommendation_items(id) ON DELETE SET NULL;

ALTER TABLE position_thesis
  ADD COLUMN IF NOT EXISTS last_status_change_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_status_change_run_id uuid,
  ADD COLUMN IF NOT EXISTS last_status_change_reason text;

CREATE TABLE IF NOT EXISTS position_thesis_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  ticker text NOT NULL,
  old_status text,
  new_status text NOT NULL,
  reason text,
  run_id uuid,
  changed_by text NOT NULL DEFAULT 'ai',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS position_thesis_history_portfolio_ticker
  ON position_thesis_history (portfolio_id, ticker);

ALTER TABLE position_thesis_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own position thesis history"
  ON position_thesis_history FOR SELECT
  USING (portfolio_id IN (SELECT id FROM portfolios WHERE user_id = auth.uid()));
