import { createClient } from "@/lib/supabase/server";
import { getPortfolioPerformanceSummary } from "@/lib/portfolio/performance";
import { getPortfolioValuation } from "@/lib/portfolio/valuation";
import PerformanceDisplay from "./performance-display";

type Props = { portfolioId: string; cashBalance: number; };

export default async function PortfolioPerformanceSection({ portfolioId, cashBalance }: Props) {
  const supabase = await createClient();

  const [{ data: holdings }, { data: transactions }] = await Promise.all([
    supabase.from("holdings").select("*").eq("portfolio_id", portfolioId).order("ticker", { ascending: true }),
    supabase.from("portfolio_transactions").select("transaction_type, gross_amount, net_cash_impact, realized_gain_loss").eq("portfolio_id", portfolioId),
  ]);

  const valuation = await getPortfolioValuation({
    holdings: (holdings ?? []).map((h) => ({
      id: h.id, ticker: h.ticker, company_name: h.company_name,
      asset_type: h.asset_type, shares: h.shares, average_cost_basis: h.average_cost_basis,
    })),
    cashBalance,
  });

  const performance = getPortfolioPerformanceSummary({
    valuedHoldings: valuation.valued_holdings,
    transactions: transactions ?? [],
    cashBalance,
  });

  const totalReturnPct = performance.invested_capital > 0
    ? (performance.total_pl / performance.invested_capital) * 100
    : null;

  return (
    <PerformanceDisplay
      investedCapital={performance.invested_capital}
      holdingsCostBasis={performance.holdings_cost_basis_total}
      holdingsMarketValue={performance.holdings_market_value_total}
      totalPortfolioValue={performance.total_portfolio_value}
      unrealizedPl={performance.unrealized_pl_total}
      realizedPl={performance.realized_pl_total}
      totalPl={performance.total_pl}
      totalReturnPct={totalReturnPct}
    />
  );
}
