-- holding_lots: tracks individual buy/sell lots per holding for accurate cost basis + chart reconstruction.
-- Each lot is a distinct trade: buy lots add shares and create cash-IN flows; sell lots reduce shares and create cash-OUT flows.
-- The parent holdings row (shares, average_cost_basis) is the aggregate; lots are the source of truth for reconstruction.

CREATE TABLE IF NOT EXISTS holding_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holding_id UUID NOT NULL REFERENCES holdings(id) ON DELETE CASCADE,
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  lot_type TEXT NOT NULL DEFAULT 'BUY' CHECK (lot_type IN ('BUY', 'SELL', 'DRIP')),
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
