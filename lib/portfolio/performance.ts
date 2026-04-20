type ValuedHolding = {
  id: string;
  ticker: string;
  company_name: string | null;
  shares_number: number;
  average_cost_basis_number: number;
  current_price: number | null;
  market_value: number | null;
  cost_basis_total: number;
  unrealized_pl: number | null;
  unrealized_pl_pct: number | null;
};

type TransactionRow = {
  transaction_type: string | null;
  gross_amount: number | string | null;
  net_cash_impact: number | string | null;
  realized_gain_loss: number | string | null;
};

export type PortfolioPerformanceSummary = {
  invested_capital: number;
  realized_pl_total: number;
  unrealized_pl_total: number;
  total_pl: number;
  holdings_cost_basis_total: number;
  holdings_market_value_total: number;
  cash_balance: number;
  total_portfolio_value: number;
};

export function getPortfolioPerformanceSummary(args: {
  valuedHoldings: ValuedHolding[];
  transactions: TransactionRow[];
  cashBalance: number;
}): PortfolioPerformanceSummary {
  const { valuedHoldings, transactions, cashBalance } = args;

  const investedCapital = transactions.reduce((sum, transaction) => {
    if (transaction.transaction_type === "deposit") {
      return sum + Number(transaction.gross_amount ?? 0);
    }

    if (transaction.transaction_type === "withdrawal") {
      return sum - Number(transaction.gross_amount ?? 0);
    }

    return sum;
  }, 0);

  const realizedPLTotal = transactions.reduce((sum, transaction) => {
    return sum + Number(transaction.realized_gain_loss ?? 0);
  }, 0);

  const holdingsCostBasisTotal = valuedHoldings.reduce((sum, holding) => {
    return sum + Number(holding.cost_basis_total ?? 0);
  }, 0);

  const holdingsMarketValueTotal = valuedHoldings.reduce((sum, holding) => {
    return sum + Number(holding.market_value ?? 0);
  }, 0);

  const unrealizedPLTotal = valuedHoldings.reduce((sum, holding) => {
    return sum + Number(holding.unrealized_pl ?? 0);
  }, 0);

  const totalPL = realizedPLTotal + unrealizedPLTotal;
  const totalPortfolioValue = holdingsMarketValueTotal + cashBalance;

  return {
    invested_capital: investedCapital,
    realized_pl_total: realizedPLTotal,
    unrealized_pl_total: unrealizedPLTotal,
    total_pl: totalPL,
    holdings_cost_basis_total: holdingsCostBasisTotal,
    holdings_market_value_total: holdingsMarketValueTotal,
    cash_balance: cashBalance,
    total_portfolio_value: totalPortfolioValue,
  };
}