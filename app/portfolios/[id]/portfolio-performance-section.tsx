import { createClient } from "@/lib/supabase/server";
import { getPortfolioPerformanceSummary } from "@/lib/portfolio/performance";
import { getPortfolioValuation } from "@/lib/portfolio/valuation";
import AddSnapshotForm from "./add-snapshot-form";

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
  if (value === null || value === undefined) return "text-white";
  if (value > 0) return "text-emerald-400";
  if (value < 0) return "text-red-400";
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
    { data: snapshots },
  ] = await Promise.all([
    supabase.from("holdings").select("*").eq("portfolio_id", portfolioId).order("ticker", { ascending: true }),
    supabase.from("portfolio_transactions").select("transaction_type, gross_amount, net_cash_impact, realized_gain_loss").eq("portfolio_id", portfolioId),
    supabase.from("portfolio_snapshots").select("total_value, snapshot_date").eq("portfolio_id", portfolioId).order("snapshot_date", { ascending: false }).limit(10),
  ]);

  if (holdingsError) throw new Error(holdingsError.message);
  if (transactionsError) throw new Error(transactionsError.message);

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

  const snapshotCount = snapshots?.length ?? 0;

  const metrics = [
    { label: "Invested Capital", value: formatMoney(performance.invested_capital), tone: null },
    { label: "Holdings Cost Basis", value: formatMoney(performance.holdings_cost_basis_total), tone: null },
    { label: "Holdings Market Value", value: formatMoney(performance.holdings_market_value_total), tone: null },
    { label: "Total Portfolio Value", value: formatMoney(performance.total_portfolio_value), tone: null },
    { label: "Unrealized P/L", value: formatMoney(performance.unrealized_pl_total), tone: performance.unrealized_pl_total },
    { label: "Realized P/L", value: formatMoney(performance.realized_pl_total), tone: performance.realized_pl_total },
    { label: "Total P/L", value: formatMoney(performance.total_pl), tone: performance.total_pl },
    { label: "Return on Capital", value: formatPercent(totalReturnPct), tone: totalReturnPct },
  ];

  return (
    <section
      className="rounded-2xl p-5"
      style={{ border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.03)" }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">Performance Analytics</h2>
          <p className="mt-0.5 text-sm text-slate-500">Portfolio-level profit, cost basis, and return metrics.</p>
        </div>
        <AddSnapshotForm portfolioId={portfolioId} />
      </div>

      <div className="mt-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((m) => (
          <div key={m.label} className="rounded-xl px-4 py-3" style={{ border: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.02)" }}>
            <p className="text-[10px] uppercase tracking-widest text-slate-500">{m.label}</p>
            <p className={`mt-1 text-xl font-semibold ${m.tone !== null ? valueColor(m.tone) : "text-white"}`}>
              {m.value}
            </p>
          </div>
        ))}
      </div>

      {/* Snapshot how-to section */}
      <div className="mt-5 rounded-xl border border-blue-500/15 bg-blue-500/5 p-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-500/20">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-blue-400">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-blue-300">
              How Performance vs Benchmark Works
              {snapshotCount > 0 && (
                <span className="ml-2 text-[10px] font-normal text-blue-400/70">
                  {snapshotCount} snapshot{snapshotCount !== 1 ? "s" : ""} recorded
                </span>
              )}
            </p>
            <div className="mt-2 space-y-1.5 text-xs leading-5 text-slate-400">
              <p>
                <span className="font-medium text-slate-300">What are snapshots?</span> A snapshot is a manual record of your total portfolio value at a specific point in time. The benchmark chart compares your portfolio's growth against the S&P 500 (or your chosen benchmark) over time.
              </p>
              <p>
                <span className="font-medium text-slate-300">How to use it:</span> Click <span className="rounded border border-white/10 bg-white/8 px-1 py-0.5 font-mono text-[10px] text-slate-300">Add Snapshot</span> periodically (weekly or monthly) and enter your current total portfolio value. After 2+ snapshots the chart will appear showing your performance vs benchmark.
              </p>
              <p>
                <span className="font-medium text-slate-300">Tip:</span> Your total portfolio value is shown at the top of this page. Just copy that number each time you save a snapshot.
              </p>
            </div>
          </div>
        </div>

        {snapshotCount === 0 && (
          <div className="mt-3 rounded-lg border border-amber-500/15 bg-amber-500/8 px-3 py-2">
            <p className="text-xs text-amber-300">
              ⚠ You have no snapshots yet. Add your first one now to start tracking performance over time.
            </p>
          </div>
        )}

        {snapshotCount === 1 && (
          <div className="mt-3 rounded-lg border border-amber-500/15 bg-amber-500/8 px-3 py-2">
            <p className="text-xs text-amber-300">
              ⚠ You need at least 2 snapshots before the benchmark chart appears. Add another snapshot on a different date.
            </p>
          </div>
        )}

        {snapshotCount >= 2 && (
          <div className="mt-3 rounded-lg border border-emerald-500/15 bg-emerald-500/8 px-3 py-2">
            <p className="text-xs text-emerald-300">
              ✓ You have {snapshotCount} snapshots. Scroll down to see your performance vs benchmark chart.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
