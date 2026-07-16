-- Indexes for AI recommendation queries
-- Safe to re-run (CREATE INDEX IF NOT EXISTS)

-- recommendation_items: primary query patterns
CREATE INDEX IF NOT EXISTS idx_rec_items_portfolio_status
  ON recommendation_items(portfolio_id, recommendation_status);

CREATE INDEX IF NOT EXISTS idx_rec_items_portfolio_created
  ON recommendation_items(portfolio_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rec_items_portfolio_ticker
  ON recommendation_items(portfolio_id, ticker);

CREATE INDEX IF NOT EXISTS idx_rec_items_run_id
  ON recommendation_items(recommendation_run_id);

CREATE INDEX IF NOT EXISTS idx_rec_items_status_created
  ON recommendation_items(recommendation_status, created_at DESC);

-- recommendation_runs: portfolio lookups
CREATE INDEX IF NOT EXISTS idx_rec_runs_portfolio_created
  ON recommendation_runs(portfolio_id, created_at DESC);

-- recommendation_item_status_history: audit lookups
CREATE INDEX IF NOT EXISTS idx_rec_history_item_id
  ON recommendation_item_status_history(recommendation_item_id);

CREATE INDEX IF NOT EXISTS idx_rec_history_portfolio_id
  ON recommendation_item_status_history(portfolio_id);
