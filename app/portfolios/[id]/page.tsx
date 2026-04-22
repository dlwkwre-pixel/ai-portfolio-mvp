import Link from "next/link";
import Sidebar from "@/app/components/sidebar";
import MobileNav from "@/app/components/mobile-nav";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolioValuation } from "@/lib/portfolio/valuation";
import AddHoldingForm from "./add-holding-form";
import HoldingsTable from "./holdings-table";
import AddNoteForm from "./add-note-form";
import AddCashActivityForm from "./add-cash-activity-form";
import AssignStrategyForm from "./assign-strategy-form";
import UpgradeStrategyVersionButton from "./upgrade-strategy-version-button";
import AIRecommendationsSection from "./ai-recommendations-section";
import TransactionHistorySection from "./transaction-history-section";
import PortfolioPerformanceSection from "./portfolio-performance-section";
import BenchmarkComparisonSection from "./benchmark-comparison-section";
import PortfolioTabs from "./portfolio-tabs";

type PortfolioPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
};

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatAccountType(value: string | null) {
  if (!value) return "—";
  const map: Record<string, string> = {
    taxable: "Brokerage", brokerage: "Brokerage", retirement: "Retirement",
    speculative: "Margin", margin: "Margin", paper_trade: "Paper Trade",
    roth_ira: "Roth IRA", traditional_ira: "Traditional IRA",
  };
  return map[value] ?? value.replaceAll("_", " ");
}

function formatRiskLevel(value: string | null) {
  if (!value) return "No Risk Set";
  const map: Record<string, string> = {
    low: "Conservative", Low: "Conservative", moderate: "Moderate", Moderate: "Moderate",
    high: "Aggressive", High: "Aggressive", conservative: "Conservative", Conservative: "Conservative",
    aggressive: "Aggressive", Aggressive: "Aggressive",
  };
  return map[value] ?? value;
}

function accountTypeStyle(value: string | null) {
  const type = (value || "").toLowerCase();
  if (["taxable", "brokerage"].includes(type)) return { dot: "bg-blue-400", badge: "border-blue-500/20 bg-blue-500/10 text-blue-300" };
  if (["retirement", "roth_ira", "traditional_ira"].includes(type)) return { dot: "bg-emerald-400", badge: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" };
  if (["speculative", "margin"].includes(type)) return { dot: "bg-amber-400", badge: "border-amber-500/20 bg-amber-500/10 text-amber-300" };
  if (["paper_trade", "paper trade"].includes(type)) return { dot: "bg-purple-400", badge: "border-purple-500/20 bg-purple-500/10 text-purple-300" };
  return { dot: "bg-slate-400", badge: "border-white/10 bg-white/5 text-slate-400" };
}

export default async function SinglePortfolioPage({ params, searchParams }: PortfolioPageProps) {
  const { id } = await params;
  const { tab } = await searchParams;
  const activeTab = tab || "overview";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: portfolio, error: portfolioError } = await supabase
    .from("portfolios").select("*").eq("id", id).eq("user_id", user.id).single();
  if (portfolioError || !portfolio) notFound();

  const { data: holdings, error: holdingsError } = await supabase
    .from("holdings").select("*").eq("portfolio_id", portfolio.id).order("ticker", { ascending: true });
  if (holdingsError) throw new Error(holdingsError.message);

  const valuation = await getPortfolioValuation({
    holdings: (holdings ?? []).map((h) => ({
      id: h.id, ticker: h.ticker, company_name: h.company_name,
      asset_type: h.asset_type, shares: h.shares, average_cost_basis: h.average_cost_basis,
    })),
    cashBalance: Number(portfolio.cash_balance ?? 0),
  });

  const { data: notes } = await supabase
    .from("portfolio_notes").select("*").eq("portfolio_id", portfolio.id).order("created_at", { ascending: false });

  const { data: cashLedger } = await supabase
    .from("cash_ledger").select("*").eq("portfolio_id", portfolio.id).order("effective_at", { ascending: false }).limit(8);

  const { data: strategies } = await supabase
    .from("strategies").select("*").eq("user_id", user.id).eq("is_active", true).order("created_at", { ascending: false });

  const { data: activeAssignment } = await supabase
    .from("portfolio_strategy_assignments")
    .select(`*, strategies (id, name, description, style, risk_level), strategy_versions (id, version_number, prompt_text, max_position_pct, min_position_pct, turnover_preference, holding_period_bias, cash_min_pct, cash_max_pct)`)
    .eq("portfolio_id", portfolio.id).eq("is_active", true).is("ended_at", null)
    .order("assigned_at", { ascending: false }).limit(1).maybeSingle();

  let latestAvailableVersionNumber: number | null = null;
  if (activeAssignment?.strategy_id) {
    const { data: latestVersion } = await supabase
      .from("strategy_versions").select("id, version_number")
      .eq("strategy_id", activeAssignment.strategy_id)
      .order("version_number", { ascending: false }).limit(1).maybeSingle();
    latestAvailableVersionNumber = latestVersion?.version_number ?? null;
  }

  const currentVersionNumber = activeAssignment?.strategy_versions?.version_number ?? null;
  const shouldShowUpgradeButton = currentVersionNumber !== null && latestAvailableVersionNumber !== null && latestAvailableVersionNumber > currentVersionNumber;
  const totalShares = holdings?.reduce((sum, h) => sum + Number(h.shares ?? 0), 0) ?? 0;
  const style = accountTypeStyle(portfolio.account_type);

  const statCards = [
    { label: "Cash", value: formatMoney(Number(portfolio.cash_balance)) },
    { label: "Holdings Value", value: formatMoney(valuation.holdings_value) },
    { label: "Total Value", value: formatMoney(valuation.total_portfolio_value), highlight: true },
    { label: "Positions", value: holdings?.length ?? 0 },
  ];

  return (
    <main className="min-h-screen bg-[#040d1a] text-white" style={{ fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&display=swap');
        .card { border: 1px solid rgba(255,255,255,0.07); background: rgba(255,255,255,0.03); }
        .card-inner { border: 1px solid rgba(255,255,255,0.05); background: rgba(255,255,255,0.02); }
        .cta-btn { background: linear-gradient(135deg,#2563eb,#4f46e5); box-shadow: 0 4px 16px rgba(37,99,235,0.3); transition: all 0.2s ease; }
        .cta-btn:hover { box-shadow: 0 6px 24px rgba(37,99,235,0.45); transform: translateY(-1px); }
        .dash-glow { background: radial-gradient(ellipse 70% 40% at 50% 0%, rgba(56,139,253,0.1) 0%, transparent 60%); }
        .table-row:hover td { background: rgba(255,255,255,0.03); }
        details summary::-webkit-details-marker { display: none; }
      `}</style>

      <div className="dash-glow pointer-events-none fixed inset-0 z-0" />

      <div className="relative z-10 flex min-h-screen">
        <Sidebar userEmail={user?.email} />

        <div className="flex-1 overflow-x-hidden">
          <MobileNav />

          <div className="mx-auto max-w-[1500px] px-4 py-6 lg:px-8 lg:py-8">

            {/* Header */}
            <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className={`h-2.5 w-2.5 rounded-full ${style.dot}`} />
                  <p className="text-xs font-medium uppercase tracking-widest text-blue-400">Portfolio</p>
                </div>
                <h1 className="text-2xl font-semibold tracking-tight">{portfolio.name}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${style.badge}`}>
                    {formatAccountType(portfolio.account_type)}
                  </span>
                  <span className="rounded-full border border-white/8 bg-white/4 px-2 py-0.5 text-[10px] text-slate-400">{portfolio.benchmark_symbol || "SPY"}</span>
                  <span className="rounded-full border border-white/8 bg-white/4 px-2 py-0.5 text-[10px] capitalize text-slate-400">{portfolio.status}</span>
                </div>
                {portfolio.description && <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">{portfolio.description}</p>}
              </div>
              <div className="text-sm text-slate-500">Created {new Date(portfolio.created_at).toLocaleDateString()}</div>
            </div>

            {/* Stat cards */}
            <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {statCards.map((stat) => (
                <div key={stat.label} className={`rounded-2xl p-5 ${stat.highlight ? "border border-blue-500/20 bg-blue-500/8" : "card"}`}>
                  <p className="text-xs font-medium uppercase tracking-widest text-slate-500">{stat.label}</p>
                  <p className={`mt-2 text-2xl font-semibold ${stat.highlight ? "text-blue-300" : "text-white"}`}>{stat.value}</p>
                </div>
              ))}
            </div>

            {/* Tabs */}
            <div className="mb-6">
              <PortfolioTabs activeTab={activeTab} portfolioId={portfolio.id} />
            </div>

            {/* ── OVERVIEW TAB ── */}
            {activeTab === "overview" && (
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_360px]">
                <div className="space-y-5">
                  {/* Holdings */}
                  <div className="card rounded-2xl p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h2 className="text-base font-semibold text-white">Holdings</h2>
                        <p className="mt-0.5 text-sm text-slate-500">Current positions with live market valuation.</p>
                      </div>
                      <AddHoldingForm portfolioId={portfolio.id} />
                    </div>
                    <HoldingsTable
                      portfolioId={portfolio.id}
                      holdings={valuation.valued_holdings.map((h) => ({
                        ...h,
                        notes: (holdings ?? []).find((raw) => raw.id === h.id)?.notes ?? null,
                      }))}
                    />
                  </div>

                  <PortfolioPerformanceSection portfolioId={portfolio.id} cashBalance={Number(portfolio.cash_balance ?? 0)} />
                  <BenchmarkComparisonSection portfolioId={portfolio.id} benchmarkSymbol={portfolio.benchmark_symbol || "SPY"} />
                </div>

                {/* Right column */}
                <div className="space-y-5">
                  {/* Strategy */}
                  <div className="card rounded-2xl p-5">
                    <h2 className="text-base font-semibold text-white">Assigned Strategy</h2>
                    <p className="mt-0.5 text-sm text-slate-500">This portfolio's investing framework.</p>
                    <div className="mt-4">
                      <AssignStrategyForm portfolioId={portfolio.id} strategies={(strategies ?? []).map((s) => ({ id: s.id, name: s.name }))} />
                    </div>
                    {activeAssignment?.strategies ? (
                      <div className="card-inner mt-4 rounded-xl p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="text-sm font-semibold text-white">{activeAssignment.strategies.name}</h3>
                            <p className="mt-0.5 text-xs text-slate-400">{activeAssignment.strategies.style || "Custom Strategy"}</p>
                          </div>
                          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-slate-300">
                            {formatRiskLevel(activeAssignment.strategies.risk_level)}
                          </span>
                        </div>
                        {activeAssignment.strategies.description && <p className="mt-2 text-xs leading-5 text-slate-400">{activeAssignment.strategies.description}</p>}
                        <div className="mt-3 grid grid-cols-2 gap-1.5 text-xs text-slate-500">
                          <span>Version: v{activeAssignment.strategy_versions?.version_number ?? "—"}</span>
                          <span>Latest: v{latestAvailableVersionNumber ?? "—"}</span>
                          <span>Max Pos: {activeAssignment.strategy_versions?.max_position_pct ?? "—"}%</span>
                          <span>Turnover: {activeAssignment.strategy_versions?.turnover_preference ?? "—"}</span>
                          <span className="col-span-2">Holding: {activeAssignment.strategy_versions?.holding_period_bias ?? "—"}</span>
                        </div>
                        {shouldShowUpgradeButton && currentVersionNumber !== null && latestAvailableVersionNumber !== null && (
                          <div className="mt-3">
                            <UpgradeStrategyVersionButton portfolioId={portfolio.id} currentVersionNumber={currentVersionNumber} latestVersionNumber={latestAvailableVersionNumber} />
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="card-inner mt-4 rounded-xl p-4"><p className="text-sm text-slate-500">No strategy assigned yet.</p></div>
                    )}
                  </div>

                  {/* Cash Activity */}
                  <div className="card rounded-2xl p-5">
                    <h2 className="text-base font-semibold text-white">Cash Activity</h2>
                    <p className="mt-0.5 text-sm text-slate-500">Deposits, withdrawals, dividends, and fees.</p>
                    <div className="mt-4">
                      <AddCashActivityForm portfolioId={portfolio.id} currentCashBalance={Number(portfolio.cash_balance ?? 0)} />
                    </div>
                    {cashLedger && cashLedger.length > 0 && (
                      <div className="mt-4 space-y-2">
                        {cashLedger.map((entry) => (
                          <div key={entry.id} className="card-inner flex items-center justify-between rounded-xl px-4 py-3">
                            <div>
                              <p className="text-sm font-medium capitalize text-white">{entry.reason.replaceAll("_", " ")}</p>
                              <p className="text-xs text-slate-600">{new Date(entry.effective_at).toLocaleString()}</p>
                            </div>
                            <p className={`text-sm font-semibold ${entry.direction === "IN" ? "text-emerald-400" : "text-red-400"}`}>
                              {entry.direction === "IN" ? "+" : "-"}{formatMoney(Number(entry.amount))}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Portfolio Info */}
                  <div className="card rounded-2xl p-5">
                    <h2 className="text-base font-semibold text-white">Portfolio Info</h2>
                    <div className="mt-4 space-y-2">
                      {[
                        { label: "Status", value: portfolio.status },
                        { label: "Active", value: portfolio.is_active ? "Yes" : "No" },
                        { label: "Currency", value: portfolio.base_currency },
                        { label: "Benchmark", value: portfolio.benchmark_symbol || "SPY" },
                        { label: "Total Shares", value: totalShares.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 }) },
                        { label: "Created", value: new Date(portfolio.created_at).toLocaleDateString() },
                      ].map((item) => (
                        <div key={item.label} className="card-inner flex items-center justify-between rounded-xl px-4 py-3">
                          <p className="text-xs uppercase tracking-widest text-slate-500">{item.label}</p>
                          <p className="text-sm font-medium capitalize text-white">{item.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── AI ANALYSIS TAB ── */}
            {activeTab === "ai" && (
              <div className="space-y-5">
                {/* Big run button at top */}
                <div className="rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-500/10 to-transparent p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-xl font-semibold text-white">AI Portfolio Analysis</h2>
                      <p className="mt-1 text-sm text-slate-400">
                        Grok analyzes every holding against your strategy and gives buy/hold/trim/sell recommendations.
                        Gemini Flash cross-checks with a portfolio health score.
                      </p>
                      {activeAssignment?.strategies && (
                        <p className="mt-2 text-xs text-blue-400">
                          Strategy: <span className="font-medium">{activeAssignment.strategies.name}</span>
                          {" · "}{formatRiskLevel(activeAssignment.strategies.risk_level)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* AI section full width */}
                <AIRecommendationsSection portfolioId={portfolio.id} />
              </div>
            )}

            {/* ── TRANSACTIONS TAB ── */}
            {activeTab === "transactions" && (
              <div className="space-y-5">
                <div className="card rounded-2xl p-5">
                  <h2 className="text-base font-semibold text-white">Transaction Ledger</h2>
                  <p className="mt-0.5 text-sm text-slate-400">
                    All trades and cash events. Accepting AI recommendations automatically creates draft transactions here for you to review and confirm.
                  </p>
                </div>
                <TransactionHistorySection portfolioId={portfolio.id} />
              </div>
            )}

            {/* ── NOTES TAB ── */}
            {activeTab === "notes" && (
              <div className="grid gap-5 xl:grid-cols-2">
                {/* Notes */}
                <div className="card rounded-2xl p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-base font-semibold text-white">Portfolio Notes</h2>
                      <p className="mt-0.5 text-sm text-slate-500">Thesis, context, and account-level notes.</p>
                    </div>
                    <AddNoteForm portfolioId={portfolio.id} />
                  </div>
                  {notes && notes.length > 0 ? (
                    <div className="mt-4 space-y-3">
                      {notes.map((note) => (
                        <div key={note.id} className="card-inner rounded-xl px-4 py-4">
                          <h3 className="text-sm font-semibold text-white">{note.title}</h3>
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">{note.content || "—"}</p>
                          <p className="mt-3 text-xs text-slate-600">{new Date(note.created_at).toLocaleDateString()}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="card-inner mt-4 rounded-xl p-5">
                      <p className="text-sm text-slate-500">No notes yet.</p>
                    </div>
                  )}
                </div>

                {/* Portfolio Info */}
                <div className="card rounded-2xl p-5">
                  <h2 className="text-base font-semibold text-white">Portfolio Info</h2>
                  <div className="mt-4 space-y-2">
                    {[
                      { label: "Status", value: portfolio.status },
                      { label: "Active", value: portfolio.is_active ? "Yes" : "No" },
                      { label: "Currency", value: portfolio.base_currency },
                      { label: "Benchmark", value: portfolio.benchmark_symbol || "SPY" },
                      { label: "Account Type", value: formatAccountType(portfolio.account_type) },
                      { label: "Total Shares", value: totalShares.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 }) },
                      { label: "Created", value: new Date(portfolio.created_at).toLocaleDateString() },
                    ].map((item) => (
                      <div key={item.label} className="card-inner flex items-center justify-between rounded-xl px-4 py-3">
                        <p className="text-xs uppercase tracking-widest text-slate-500">{item.label}</p>
                        <p className="text-sm font-medium capitalize text-white">{item.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </main>
  );
}
