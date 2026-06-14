-- Strategy Update Feed
-- Strategy owners post update notes when they change their strategy.
-- Followers see these in the community to know what changed and why.

CREATE TABLE IF NOT EXISTS strategy_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  update_text TEXT NOT NULL CHECK (char_length(update_text) BETWEEN 1 AND 500),
  change_type TEXT CHECK (change_type IN ('add', 'remove', 'rebalance', 'note')),
  tickers_mentioned TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS strategy_updates_strategy_id_idx
  ON strategy_updates (strategy_id, created_at DESC);

CREATE INDEX IF NOT EXISTS strategy_updates_author_idx
  ON strategy_updates (author_id, created_at DESC);

ALTER TABLE strategy_updates ENABLE ROW LEVEL SECURITY;

-- Anyone can read updates for public strategies
CREATE POLICY "Public strategy updates are readable"
  ON strategy_updates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM strategies
      WHERE id = strategy_updates.strategy_id
        AND is_public = true
        AND is_active = true
    )
  );

-- Only the strategy owner can post updates
CREATE POLICY "Strategy owner can post updates"
  ON strategy_updates FOR INSERT
  WITH CHECK (
    auth.uid() = author_id AND
    EXISTS (
      SELECT 1 FROM strategies
      WHERE id = strategy_updates.strategy_id
        AND user_id = auth.uid()
        AND is_public = true
    )
  );

-- Owner can delete their own updates
CREATE POLICY "Owner can delete own updates"
  ON strategy_updates FOR DELETE
  USING (auth.uid() = author_id);
