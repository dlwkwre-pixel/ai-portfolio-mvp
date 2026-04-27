import { createClient } from "@/lib/supabase/server";
import { getPortfolioPerformanceSummary } from "@/lib/portfolio/performance";
import { getPortfolioValuation } from "@/lib/portfolio/valuation";

type PortfolioPerformanceSectionProps = {
  portfolioId: string;
  cashBalance: number;
};

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function valueColor(value: number | null | undefined) {
  if (value === null || value === undefined) return "var(--text-primary)";
  if (value > 0) return "var(--green)";
  if (value < 0) return "var(--red)";
  return "var(--text-primary)";
}

export default async function PortfolioPerformanceSection({
  portfolioId,
  cashBalance,
}: PortfolioPerformanceSectionProps) {
  const supabase = await createClient();

  const [
    { data: holdings, error: holdingsError },
    { data: transactions, error: transactionsError },
  ] = await Promise.all([
    supabase.from("holdings").select("*").eq("portfolio_id", portfolioId).order("ticker", { ascending: true }),
    supabase.from("portfolio_transactions").select("transaction_type, gross_amount, net_cash_impact, realized_gain_loss").eq("portfolio_id", portfolioId),
  ]);

  if (holdingsError) throw new Error(holdingsError.message);
  if (transactionsError) throw new Error(transactionsError.message);

  const valuation = await getPortfolioValuation({
    holdings: (holdings ?? []).map((holding) => ({
      id: holding.id, ticker: holding.ticker, company_name: holding.company_name,
      asset_type: holding.asset_type, shares: holding.shares, average_cost_basis: holding.average_cost_basis,
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

  const stats = [
    { label: "Invested Capital",      value: formatMoney(performance.invested_capital),            color: "var(--text-primary)", highlight: false },
    { label: "Cost Basis",            value: formatMoney(performance.holdings_cost_basis_total),   color: "var(--text-primary)", highlight: false },
    { label: "Market Value",          value: formatMoney(performance.holdings_market_value_total), color: "var(--text-primary)", highlight: false },
    { label: "Total Portfolio Value", value: formatMoney(performance.total_portfolio_value),       color: "var(--text-primary)", highlight: true },
    { label: "Unrealized P/L",        value: formatMoney(performance.unrealized_pl_total),         color: valueColor(performance.unrealized_pl_total), highlight: false },
    { label: "Realized P/L",          value: formatMoney(performance.realized_pl_total),           color: valueColor(performance.realized_pl_total), highlight: false },
    { label: "Total P/L",             value: formatMoney(performance.total_pl),                    color: valueColor(performance.total_pl), highlight: false },
    { label: "Return on Capital",     value: formatPercent(totalReturnPct),                        color: valueColor(totalReturnPct), highlight: false },
  ];

  return (
    <div className="bt-card">
      <div style={{ marginBottom: "14px" }}>
        <h2 style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-secondary)" }}>
          Performance Analytics
        </h2>
        <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "2px" }}>
          Portfolio-level profit, cost basis, and return metrics.
        </p>
      </div>
      <div className="bt-animate-page" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
        {stats.map((stat) => (
          <div key={stat.label} style={{
            background: stat.highlight ? "rgba(37,99,235,0.07)" : "var(--bg-elevated)",
            border: `1px solid ${stat.highlight ? "rgba(37,99,235,0.18)" : "var(--border-subtle)"}`,
            borderRadius: "var(--radius-md)",
            padding: "11px 13px",
          }}>
            <div className="label" style={{ marginBottom: "5px" }}>{stat.label}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "15px", fontWeight: 500, color: stat.color, letterSpacing: "-0.3px" }}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
