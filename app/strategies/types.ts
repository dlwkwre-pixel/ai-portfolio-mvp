export type StrategyRow = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  style: string | null;
  risk_level: string | null;
  is_public?: boolean;
  is_active: boolean;
  is_archived?: boolean;
  created_at: string;
  updated_at: string;
};

export type StrategyVersion = {
  id: string;
  strategy_id: string;
  version_number: number;
  prompt_text: string | null;
  max_position_pct: number | null;
  min_position_pct: number | null;
  turnover_preference: string | null;
  holding_period_bias: string | null;
  cash_min_pct: number | null;
  cash_max_pct: number | null;
  created_at: string;
};

export type StrategyCard = StrategyRow & {
  latest_version: StrategyVersion | null;
  version_history: StrategyVersion[];
};
