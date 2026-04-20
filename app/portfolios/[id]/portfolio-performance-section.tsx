import { createClient } from "@/lib/supabase/server";
import { getPortfolioPerformanceSummary } from "@/lib/portfolio/performance";
import { getPortfolioValuation } from "@/lib/portfolio/valuation";

type PortfolioPerformanceSectionProps = {
  portfolioId: string;
  cashBalance: number;
};

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";

  return `$${Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";

  return `${Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

function valueColor(value: number | null | undefined) {
  if (value === null || value === undefined) return "text-white";
  if (value > 0) return "text-emerald-300";
  if (value < 0) return "text-red-300";
  return "text-white";
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
    supabase
      .from("holdings")
      .select("*")
      .eq("portfolio_id", portfolioId)
      .order("ticker", { ascending: true }),
    supabase
      .from("portfolio_transactions")
      .select("transaction_type, gross_amount, net_cash_impact, realized_gain_loss")
      .eq("portfolio_id", portfolioId),
  ]);

  if (holdingsError) {
    throw new Error(holdingsError.message);
  }

  if (transactionsError) {
    throw new Error(transactionsError.message);
  }

  const valuation = await getPortfolioValuation({
    holdings: (holdings ?? []).map((holding) => ({
      id: holding.id,
      ticker: holding.ticker,
      company_name: holding.company_name,
      asset_type: holding.asset_type,
      shares: holding.shares,
      average_cost_basis: holding.average_cost_basis,
    })),
    cashBalance,
  });

  const performance = getPortfolioPerformanceSummary({
    valuedHoldings: valuation.valued_holdings,
    transactions: transactions ?? [],
    cashBalance,
  });

  const totalReturnPct =
    performance.invested_capital > 0
      ? (performance.total_pl / performance.invested_capital) * 100
      : null;

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Performance Analytics</h2>
          <p className="mt-1 text-sm text-slate-400">
            Portfolio-level profit, cost basis, and return metrics.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Invested Capital
          </p>
          <p className="mt-1 text-xl font-semibold text-white">
            {formatMoney(performance.invested_capital)}
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Holdings Cost Basis
          </p>
          <p className="mt-1 text-xl font-semibold text-white">
            {formatMoney(performance.holdings_cost_basis_total)}
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Holdings Market Value
          </p>
          <p className="mt-1 text-xl font-semibold text-white">
            {formatMoney(performance.holdings_market_value_total)}
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Total Portfolio Value
          </p>
          <p className="mt-1 text-xl font-semibold text-white">
            {formatMoney(performance.total_portfolio_value)}
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Unrealized P/L
          </p>
          <p
            className={`mt-1 text-xl font-semibold ${valueColor(
              performance.unrealized_pl_total
            )}`}
          >
            {formatMoney(performance.unrealized_pl_total)}
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Realized P/L
          </p>
          <p
            className={`mt-1 text-xl font-semibold ${valueColor(
              performance.realized_pl_total
            )}`}
          >
            {formatMoney(performance.realized_pl_total)}
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Total P/L
          </p>
          <p
            className={`mt-1 text-xl font-semibold ${valueColor(
              performance.total_pl
            )}`}
          >
            {formatMoney(performance.total_pl)}
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Return on Invested Capital
          </p>
          <p
            className={`mt-1 text-xl font-semibold ${valueColor(totalReturnPct)}`}
          >
            {formatPercent(totalReturnPct)}
          </p>
        </div>
      </div>
    </section>
  );
}