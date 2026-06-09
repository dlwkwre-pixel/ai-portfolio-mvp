-- holding_lots: tracks individual purchase lots per holding for accurate cost basis + chart reconstruction
-- Each lot represents a distinct buy transaction with its own date and price.
-- The parent holdings row (shares, average_cost_basis) remains the aggregate; lots are the source of truth for reconstruction.

CREATE TABLE IF NOT EXISTS holding_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holding_id UUID NOT NULL REFERENCES holdings(id) ON DELETE CASCADE,
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  purchased_at DATE NOT NULL,
  shares NUMERIC(18, 6) NOT NULL CHECK (shares > 0),
  price_per_share NUMERIC(18, 6) NOT NULL CHECK (price_per_share > 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE holding_lots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own holding lots"
  ON holding_lots FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM portfolios p
      WHERE p.id = holding_lots.portfolio_id
        AND p.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS holding_lots_holding_id_idx ON holding_lots (holding_id);
CREATE INDEX IF NOT EXISTS holding_lots_portfolio_id_idx ON holding_lots (portfolio_id);
