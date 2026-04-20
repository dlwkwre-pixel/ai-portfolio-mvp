import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolioValuation } from "@/lib/portfolio/valuation";
import AddHoldingForm from "./add-holding-form";
import AddNoteForm from "./add-note-form";
import AddCashActivityForm from "./add-cash-activity-form";
import AssignStrategyForm from "./assign-strategy-form";
import UpgradeStrategyVersionButton from "./upgrade-strategy-version-button";
import AIRecommendationsSection from "./ai-recommendations-section";
import TransactionHistorySection from "./transaction-history-section";
import PortfolioPerformanceSection from "./portfolio-performance-section";
import BenchmarkComparisonSection from "./benchmark-comparison-section";

type PortfolioPageProps = {
  params: Promise<{
    id: string;
  }>;
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

function formatAccountType(value: string | null) {
  if (!value) return "—";

  const map: Record<string, string> = {
    taxable: "Brokerage",
    brokerage: "Brokerage",
    retirement: "Retirement",
    speculative: "Margin",
    margin: "Margin",
    paper_trade: "Paper Trade",
  };

  return map[value] ?? value.replaceAll("_", " ");
}

function formatRiskLevel(value: string | null) {
  if (!value) return "No Risk Set";

  const map: Record<string, string> = {
    low: "Conservative",
    Low: "Conservative",
    moderate: "Moderate",
    Moderate: "Moderate",
    high: "Aggressive",
    High: "Aggressive",
    conservative: "Conservative",
    Conservative: "Conservative",
    aggressive: "Aggressive",
    Aggressive: "Aggressive",
  };

  return map[value] ?? value;
}

export default async function SinglePortfolioPage({
  params,
}: PortfolioPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const { data: portfolio, error: portfolioError } = await supabase
    .from("portfolios")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (portfolioError || !portfolio) {
    notFound();
  }

  const { data: holdings, error: holdingsError } = await supabase
    .from("holdings")
    .select("*")
    .eq("portfolio_id", portfolio.id)
    .order("ticker", { ascending: true });

  if (holdingsError) {
    throw new Error(holdingsError.message);
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
    cashBalance: Number(portfolio.cash_balance ?? 0),
  });

  const { data: notes, error: notesError } = await supabase
    .from("portfolio_notes")
    .select("*")
    .eq("portfolio_id", portfolio.id)
    .order("created_at", { ascending: false });

  if (notesError) {
    throw new Error(notesError.message);
  }

  const { data: cashLedger, error: cashLedgerError } = await supabase
    .from("cash_ledger")
    .select("*")
    .eq("portfolio_id", portfolio.id)
    .order("effective_at", { ascending: false })
    .limit(8);

  if (cashLedgerError) {
    throw new Error(cashLedgerError.message);
  }

  const { data: strategies, error: strategiesError } = await supabase
    .from("strategies")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (strategiesError) {
    throw new Error(strategiesError.message);
  }

  const { data: activeAssignment, error: activeAssignmentError } = await supabase
    .from("portfolio_strategy_assignments")
    .select(`
      *,
      strategies (
        id,
        name,
        description,
        style,
        risk_level
      ),
      strategy_versions (
        id,
        version_number,
        prompt_text,
        max_position_pct,
        min_position_pct,
        turnover_preference,
        holding_period_bias,
        cash_min_pct,
        cash_max_pct
      )
    `)
    .eq("portfolio_id", portfolio.id)
    .eq("is_active", true)
    .is("ended_at", null)
    .order("assigned_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeAssignmentError) {
    throw new Error(activeAssignmentError.message);
  }

  let latestAvailableVersionNumber: number | null = null;

  if (activeAssignment?.strategy_id) {
    const { data: latestVersion, error: latestVersionError } = await supabase
      .from("strategy_versions")
      .select("id, version_number")
      .eq("strategy_id", activeAssignment.strategy_id)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestVersionError) {
      throw new Error(latestVersionError.message);
    }

    latestAvailableVersionNumber = latestVersion?.version_number ?? null;
  }

  const currentVersionNumber =
    activeAssignment?.strategy_versions?.version_number ?? null;

  const shouldShowUpgradeButton =
    currentVersionNumber !== null &&
    latestAvailableVersionNumber !== null &&
    latestAvailableVersionNumber > currentVersionNumber;

  const totalShares =
    holdings?.reduce((sum, holding) => sum + Number(holding.shares ?? 0), 0) ?? 0;

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-5 text-white lg:px-6 lg:py-6">
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-4">
          <Link
            href="/portfolios"
            className="inline-flex items-center text-sm text-slate-400 transition hover:text-white"
          >
            ← Back to portfolios
          </Link>
        </div>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-sky-400">
                Portfolio Detail
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                {portfolio.name}
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                {formatAccountType(portfolio.account_type)}
              </p>

              {portfolio.description ? (
                <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
                  {portfolio.description}
                </p>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-slate-800 bg-slate-950 px-3 py-1 text-slate-300">
                  Benchmark: {portfolio.benchmark_symbol || "SPY"}
                </span>
                <span className="rounded-full border border-slate-800 bg-slate-950 px-3 py-1 text-slate-300">
                  Base: {portfolio.base_currency}
                </span>
                <span className="rounded-full border border-slate-800 bg-slate-950 px-3 py-1 text-slate-300 capitalize">
                  Status: {portfolio.status}
                </span>
                <span className="rounded-full border border-slate-800 bg-slate-950 px-3 py-1 text-slate-300">
                  Created: {new Date(portfolio.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>

            <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:w-[520px]">
              <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Cash
                </p>
                <p className="mt-1 text-xl font-semibold">
                  {formatMoney(Number(portfolio.cash_balance))}
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Holdings
                </p>
                <p className="mt-1 text-xl font-semibold">
                  {formatMoney(valuation.holdings_value)}
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Total Value
                </p>
                <p className="mt-1 text-xl font-semibold">
                  {formatMoney(valuation.total_portfolio_value)}
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Positions
                </p>
                <p className="mt-1 text-xl font-semibold">
                  {holdings?.length ?? 0}
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 sm:col-span-2">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Total Shares
                </p>
                <p className="mt-1 text-xl font-semibold">
                  {totalShares.toLocaleString(undefined, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 4,
                  })}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_400px]">
          <div className="space-y-5">
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold">Holdings</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Current positions with live market valuation.
                  </p>
                </div>

                <div className="w-full sm:w-auto">
                  <AddHoldingForm portfolioId={portfolio.id} />
                </div>
              </div>

              {valuation.valued_holdings.length > 0 ? (
                <div className="mt-4 overflow-x-auto rounded-xl border border-slate-800">
                  <table className="min-w-full divide-y divide-slate-800">
                    <thead className="bg-slate-950/70">
                      <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                        <th className="px-3 py-3 font-medium">Ticker</th>
                        <th className="px-3 py-3 font-medium">Company</th>
                        <th className="px-3 py-3 font-medium">Shares</th>
                        <th className="px-3 py-3 font-medium">Avg Cost</th>
                        <th className="px-3 py-3 font-medium">Price</th>
                        <th className="px-3 py-3 font-medium">Value</th>
                        <th className="px-3 py-3 font-medium">Unrealized</th>
                        <th className="px-3 py-3 font-medium">Weight</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 bg-slate-900">
                      {valuation.valued_holdings.map((holding) => (
                        <tr key={holding.id} className="text-sm text-slate-200">
                          <td className="px-3 py-3 font-semibold">{holding.ticker}</td>
                          <td className="px-3 py-3">{holding.company_name || "—"}</td>
                          <td className="px-3 py-3">
                            {holding.shares_number.toLocaleString(undefined, {
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 6,
                            })}
                          </td>
                          <td className="px-3 py-3">
                            {formatMoney(holding.average_cost_basis_number)}
                          </td>
                          <td className="px-3 py-3">
                            {formatMoney(holding.current_price)}
                          </td>
                          <td className="px-3 py-3">
                            {formatMoney(holding.market_value)}
                          </td>
                          <td
                            className={`px-3 py-3 font-medium ${
                              holding.unrealized_pl !== null && holding.unrealized_pl > 0
                                ? "text-emerald-300"
                                : holding.unrealized_pl !== null && holding.unrealized_pl < 0
                                  ? "text-red-300"
                                  : "text-slate-200"
                            }`}
                          >
                            <div>{formatMoney(holding.unrealized_pl)}</div>
                            <div className="text-[11px] text-slate-500">
                              {formatPercent(holding.unrealized_pl_pct)}
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            {formatPercent(holding.weight_pct)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950 p-5">
                  <p className="text-sm text-slate-400">
                    No holdings yet. Add your first position to start building this
                    portfolio.
                  </p>
                </div>
              )}
            </div>

            <PortfolioPerformanceSection
              portfolioId={portfolio.id}
              cashBalance={Number(portfolio.cash_balance ?? 0)}
            />

            <TransactionHistorySection portfolioId={portfolio.id} />

            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold">Portfolio Notes</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Thesis, context, and account-level notes.
                  </p>
                </div>

                <div className="w-full sm:w-auto">
                  <AddNoteForm portfolioId={portfolio.id} />
                </div>
              </div>

              {notes && notes.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {notes.map((note) => (
                    <div
                      key={note.id}
                      className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-4"
                    >
                      <h3 className="text-base font-semibold leading-tight text-white">
                        {note.title}
                      </h3>

                      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-300">
                        {note.content || "—"}
                      </p>

                      <p className="mt-4 text-xs text-slate-500">
                        {new Date(note.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950 p-5">
                  <p className="text-sm text-slate-400">
                    No notes yet. This is where account-specific context will live.
                  </p>
                </div>
              )}
            </div>

            <BenchmarkComparisonSection
              portfolioId={portfolio.id}
              benchmarkSymbol={portfolio.benchmark_symbol || "SPY"}
            />
          </div>

          <div className="space-y-5">
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <div>
                <h2 className="text-xl font-semibold">Assigned Strategy</h2>
                <p className="mt-1 text-sm text-slate-400">
                  This portfolio’s current investing framework.
                </p>
              </div>

              <div className="mt-4">
                <AssignStrategyForm
                  portfolioId={portfolio.id}
                  strategies={(strategies ?? []).map((strategy) => ({
                    id: strategy.id,
                    name: strategy.name,
                  }))}
                />
              </div>

              {activeAssignment?.strategies ? (
                <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold">
                        {activeAssignment.strategies.name}
                      </h3>
                      <p className="mt-1 text-sm text-slate-400">
                        {activeAssignment.strategies.style || "Custom Strategy"}
                      </p>
                    </div>

                    <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">
                      {formatRiskLevel(activeAssignment.strategies.risk_level)}
                    </span>
                  </div>

                  {activeAssignment.strategies.description ? (
                    <p className="mt-3 text-sm leading-6 text-slate-300">
                      {activeAssignment.strategies.description}
                    </p>
                  ) : null}

                  <div className="mt-4 space-y-2 text-sm text-slate-400">
                    <p>
                      Current Assigned Version:{" "}
                      {activeAssignment.strategy_versions?.version_number ?? "—"}
                    </p>
                    <p>
                      Latest Available Version: {latestAvailableVersionNumber ?? "—"}
                    </p>
                    <p>
                      Max Position %:{" "}
                      {activeAssignment.strategy_versions?.max_position_pct ?? "—"}
                    </p>
                    <p>
                      Turnover:{" "}
                      {activeAssignment.strategy_versions?.turnover_preference ?? "—"}
                    </p>
                    <p>
                      Holding Bias:{" "}
                      {activeAssignment.strategy_versions?.holding_period_bias ?? "—"}
                    </p>
                  </div>

                  {shouldShowUpgradeButton &&
                  currentVersionNumber !== null &&
                  latestAvailableVersionNumber !== null ? (
                    <div className="mt-4">
                      <UpgradeStrategyVersionButton
                        portfolioId={portfolio.id}
                        currentVersionNumber={currentVersionNumber}
                        latestVersionNumber={latestAvailableVersionNumber}
                      />
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950 p-5">
                  <p className="text-sm text-slate-400">No strategy assigned yet.</p>
                </div>
              )}
            </div>

            <AIRecommendationsSection portfolioId={portfolio.id} />

            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <div>
                <h2 className="text-xl font-semibold">Cash Activity</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Track deposits, withdrawals, dividends, fees, and adjustments.
                </p>
              </div>

              <div className="mt-4">
                <AddCashActivityForm portfolioId={portfolio.id} />
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <h2 className="text-xl font-semibold">Portfolio Status</h2>

              <div className="mt-4 space-y-3 text-sm text-slate-300">
                <div className="flex items-center justify-between gap-4">
                  <span>Status</span>
                  <span className="rounded-full bg-slate-800 px-3 py-1 text-xs capitalize">
                    {portfolio.status}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <span>Active</span>
                  <span>{portfolio.is_active ? "Yes" : "No"}</span>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <span>Base Currency</span>
                  <span>{portfolio.base_currency}</span>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <span>Benchmark</span>
                  <span>{portfolio.benchmark_symbol || "SPY"}</span>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <span>Created</span>
                  <span>{new Date(portfolio.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <h2 className="text-xl font-semibold">Recent Cash Activity</h2>

              {cashLedger && cashLedger.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {cashLedger.map((entry) => (
                    <div
                      key={entry.id}
                      className="rounded-xl border border-slate-800 bg-slate-950 p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium capitalize">
                          {entry.reason.replaceAll("_", " ")}
                        </p>
                        <p
                          className={
                            entry.direction === "IN"
                              ? "text-sm font-semibold text-emerald-300"
                              : "text-sm font-semibold text-red-300"
                          }
                        >
                          {entry.direction === "IN" ? "+" : "-"}
                          {formatMoney(Number(entry.amount))}
                        </p>
                      </div>

                      <p className="mt-2 text-xs text-slate-500">
                        {new Date(entry.effective_at).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950 p-5">
                  <p className="text-sm text-slate-400">
                    No cash activity yet. Deposits, withdrawals, dividends, and
                    other movements will appear here.
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}