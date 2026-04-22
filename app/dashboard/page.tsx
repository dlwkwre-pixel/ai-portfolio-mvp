import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/app/components/sidebar";
import MobileNav from "@/app/components/mobile-nav";

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `$${Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
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

// Color coding per account type
function accountTypeStyle(value: string | null) {
  const type = (value || "").toLowerCase();
  if (["taxable", "brokerage"].includes(type))
    return { dot: "bg-blue-400", badge: "border-blue-500/20 bg-blue-500/10 text-blue-300" };
  if (["retirement"].includes(type))
    return { dot: "bg-emerald-400", badge: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" };
  if (["speculative", "margin"].includes(type))
    return { dot: "bg-amber-400", badge: "border-amber-500/20 bg-amber-500/10 text-amber-300" };
  if (["paper_trade"].includes(type))
    return { dot: "bg-purple-400", badge: "border-purple-500/20 bg-purple-500/10 text-purple-300" };
  return { dot: "bg-slate-400", badge: "border-white/10 bg-white/5 text-slate-400" };
}

function formatTitleCase(value: string | null | undefined) {
  if (!value) return "—";
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function truncateText(value: string | null | undefined, maxLength = 180) {
  if (!value) return "Recommendation Review";
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}

function statusBadgeClass(status: string | null | undefined) {
  const normalized = (status || "").toLowerCase();
  if (["completed", "accepted", "executed"].includes(normalized))
    return "bg-emerald-500/15 text-emerald-300 border border-emerald-500/20";
  if (["failed", "rejected"].includes(normalized))
    return "bg-red-500/15 text-red-300 border border-red-500/20";
  if (["running", "pending", "queued"].includes(normalized))
    return "bg-amber-500/15 text-amber-300 border border-amber-500/20";
  return "bg-white/5 text-slate-300 border border-white/10";
}

type RecentActivity = {
  id: string;
  kind: "transaction" | "cash" | "ai";
  portfolioId: string;
  portfolioName: string;
  title: string;
  detail: string;
  occurredAt: string;
  amount: number | null;
  amountTone: "positive" | "negative" | "neutral";
  href: string;
  aiStatus?: string | null;
};

const kindIcon = {
  transaction: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
      <path fillRule="evenodd" d="M9.99 2a8 8 0 100 16 8 8 0 000-16zm.25 3.25a.75.75 0 00-1.5 0v.54a3.64 3.64 0 00-1.651.734C6.499 6.916 6 7.67 6 8.5c0 .83.499 1.584 1.089 2.005a4.28 4.28 0 001.661.755v2.516a1.867 1.867 0 01-.73-.28c-.287-.187-.52-.47-.52-.746a.75.75 0 00-1.5 0c0 .786.496 1.483 1.089 1.904a3.64 3.64 0 001.661.718v.578a.75.75 0 001.5 0v-.575a3.89 3.89 0 001.652-.756C12.499 14.584 13 13.83 13 13c0-.83-.499-1.584-1.098-2.005a4.44 4.44 0 00-1.652-.737V7.742c.26.066.503.181.73.28.287.187.52.47.52.728a.75.75 0 001.5 0c0-.786-.496-1.482-1.089-1.904A3.64 3.64 0 0010.24 6.29V5.25z" clipRule="evenodd" />
    </svg>
  ),
  cash: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
      <path d="M1 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-1 1H2a1 1 0 01-1-1V4zM1 10a1 1 0 011-1h6a1 1 0 110 2H2a1 1 0 01-1-1zM1 14a1 1 0 011-1h6a1 1 0 110 2H2a1 1 0 01-1-1z" />
    </svg>
  ),
  ai: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
      <path d="M15.98 1.804a1 1 0 00-1.96 0l-.24 1.192a1 1 0 01-.784.785l-1.192.238a1 1 0 000 1.962l1.192.238a1 1 0 01.785.785l.238 1.192a1 1 0 001.962 0l.238-1.192a1 1 0 01.785-.785l1.192-.238a1 1 0 000-1.962l-1.192-.238a1 1 0 01-.785-.785l-.238-1.192zM6.949 5.684a1 1 0 00-1.898 0l-.683 2.051a1 1 0 01-.633.633l-2.051.683a1 1 0 000 1.898l2.051.684a1 1 0 01.633.632l.683 2.051a1 1 0 001.898 0l.683-2.051a1 1 0 01.633-.633l2.051-.683a1 1 0 000-1.897l-2.051-.684a1 1 0 01-.633-.633L6.95 5.684z" />
    </svg>
  ),
};

const statIcons = [
  // Active Portfolios
  <svg key="portfolios" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-blue-400">
    <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
    <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.439A1.5 1.5 0 008.378 6H4.5z" />
  </svg>,
  // Total Portfolio Value
  <svg key="value" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-emerald-400">
    <path fillRule="evenodd" d="M12 7a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0V8.414l-4.293 4.293a1 1 0 01-1.414 0L8 10.414l-4.293 4.293a1 1 0 01-1.414-1.414l5-5a1 1 0 011.414 0L11 10.586 14.586 7H12z" clipRule="evenodd" />
  </svg>,
  // Active Strategies
  <svg key="strategies" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-purple-400">
    <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
  </svg>,
  // Last AI Run
  <svg key="ai" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-amber-400">
    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd" />
  </svg>,
];

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const { data: portfolios, error: portfoliosError } = await supabase
    .from("portfolios")
    .select("id, name, is_active, cash_balance, benchmark_symbol, created_at, status, account_type")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (portfoliosError) throw new Error(portfoliosError.message);

  const { count: activeStrategiesCount, error: strategiesError } = await supabase
    .from("strategies")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("is_active", true);

  if (strategiesError) throw new Error(strategiesError.message);

  const activePortfolios = (portfolios ?? []).filter((p) => p.is_active);
  const archivedPortfolios = (portfolios ?? []).filter((p) => !p.is_active);
  const portfolioIds = (portfolios ?? []).map((p) => p.id);

  let runs: Array<{
    id: string;
    portfolio_id: string;
    status: string | null;
    summary: string | null;
    model_name: string | null;
    created_at: string;
  }> = [];

  let recentTransactions: Array<{
    id: string;
    portfolio_id: string;
    transaction_type: string | null;
    ticker: string | null;
    net_cash_impact: number | null;
    traded_at: string;
  }> = [];

  let recentCashActivity: Array<{
    id: string;
    portfolio_id: string;
    direction: string | null;
    reason: string | null;
    amount: number | null;
    effective_at: string;
  }> = [];

  if (portfolioIds.length > 0) {
    const [
      { data: recommendationRuns, error: runsError },
      { data: transactions, error: transactionsError },
      { data: cashEntries, error: cashEntriesError },
    ] = await Promise.all([
      supabase
        .from("recommendation_runs")
        .select("id, portfolio_id, status, summary, model_name, created_at")
        .in("portfolio_id", portfolioIds)
        .order("created_at", { ascending: false })
        .limit(6),
      supabase
        .from("portfolio_transactions")
        .select("id, portfolio_id, transaction_type, ticker, net_cash_impact, traded_at")
        .in("portfolio_id", portfolioIds)
        .order("traded_at", { ascending: false })
        .limit(8),
      supabase
        .from("cash_ledger")
        .select("id, portfolio_id, direction, reason, amount, effective_at")
        .in("portfolio_id", portfolioIds)
        .order("effective_at", { ascending: false })
        .limit(8),
    ]);

    if (runsError) throw new Error(runsError.message);
    if (transactionsError) throw new Error(transactionsError.message);
    if (cashEntriesError) throw new Error(cashEntriesError.message);

    runs = recommendationRuns ?? [];
    recentTransactions = transactions ?? [];
    recentCashActivity = cashEntries ?? [];
  }

  const portfolioNameById = new Map(
    (portfolios ?? []).map((p) => [p.id, p.name])
  );

  const totalCashTracked = activePortfolios.reduce(
    (sum, p) => sum + Number(p.cash_balance ?? 0),
    0
  );

  const lastRunTime = runs[0] ? formatDateTime(runs[0].created_at) : "No runs yet";

  // Unified activity feed (transactions + cash + AI runs)
  const transactionActivity: RecentActivity[] = recentTransactions.map((t) => {
    const amount = Number(t.net_cash_impact ?? 0);
    const amountTone: "positive" | "negative" | "neutral" =
      amount > 0 ? "positive" : amount < 0 ? "negative" : "neutral";
    return {
      id: `tx-${t.id}`,
      kind: "transaction",
      portfolioId: t.portfolio_id,
      portfolioName: portfolioNameById.get(t.portfolio_id) || "Unknown Portfolio",
      title: `${formatTitleCase(t.transaction_type)}${t.ticker ? ` · ${t.ticker}` : ""}`,
      detail: "Portfolio transaction",
      occurredAt: t.traded_at,
      amount,
      amountTone,
      href: `/portfolios/${t.portfolio_id}`,
    };
  });

  const cashActivity: RecentActivity[] = recentCashActivity.map((entry) => {
    const baseAmount = Number(entry.amount ?? 0);
    const signedAmount =
      (entry.direction || "").toUpperCase() === "OUT" ? -baseAmount : baseAmount;
    const amountTone: "positive" | "negative" | "neutral" =
      signedAmount > 0 ? "positive" : signedAmount < 0 ? "negative" : "neutral";
    return {
      id: `cash-${entry.id}`,
      kind: "cash",
      portfolioId: entry.portfolio_id,
      portfolioName: portfolioNameById.get(entry.portfolio_id) || "Unknown Portfolio",
      title: `${formatTitleCase(entry.reason)} Cash`,
      detail: `Direction: ${entry.direction || "—"}`,
      occurredAt: entry.effective_at,
      amount: signedAmount,
      amountTone,
      href: `/portfolios/${entry.portfolio_id}`,
    };
  });

  const aiActivity: RecentActivity[] = runs.map((run) => ({
    id: `run-${run.id}`,
    kind: "ai",
    portfolioId: run.portfolio_id,
    portfolioName: portfolioNameById.get(run.portfolio_id) || "Unknown Portfolio",
    title: truncateText(run.summary, 140),
    detail: `${run.model_name || "Unknown Model"} · ${run.status || "—"}`,
    occurredAt: run.created_at,
    amount: null,
    amountTone: "neutral",
    href: `/portfolios/${run.portfolio_id}`,
    aiStatus: run.status,
  }));

  const unifiedFeed: RecentActivity[] = [
    ...transactionActivity,
    ...cashActivity,
    ...aiActivity,
  ]
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, 15);

  const stats = [
    { label: "Active Portfolios", value: String(activePortfolios.length), sub: `${archivedPortfolios.length} archived` },
    { label: "Total Cash Tracked", value: formatMoney(totalCashTracked), sub: "across active portfolios" },
    { label: "Active Strategies", value: String(activeStrategiesCount ?? 0), sub: "in strategy library" },
    { label: "Last AI Run", value: lastRunTime, sub: "most recent analysis" },
  ];

  return (
    <main
      className="min-h-screen bg-[#040d1a] text-white"
      style={{ fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif" }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&display=swap');
        .sidebar-link { transition: all 0.15s ease; color: #94a3b8; }
        .sidebar-link:hover { background: rgba(255,255,255,0.06); color: white; }
        .sidebar-link.active { background: rgba(37,99,235,0.15); border: 1px solid rgba(37,99,235,0.25); color: #93c5fd; }
        .card { border: 1px solid rgba(255,255,255,0.07); background: rgba(255,255,255,0.03); }
        .card-inner { border: 1px solid rgba(255,255,255,0.05); background: rgba(255,255,255,0.02); }
        .card-hover { transition: all 0.15s ease; }
        .card-hover:hover { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.1); }
        .stat-card { border: 1px solid rgba(255,255,255,0.07); background: rgba(255,255,255,0.03); transition: all 0.2s ease; }
        .stat-card:hover { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.12); }
        .cta-btn { background: linear-gradient(135deg,#2563eb,#4f46e5); box-shadow: 0 4px 16px rgba(37,99,235,0.3); transition: all 0.2s ease; }
        .cta-btn:hover { box-shadow: 0 6px 24px rgba(37,99,235,0.45); transform: translateY(-1px); }
        .dash-glow { background: radial-gradient(ellipse 70% 40% at 50% 0%, rgba(56,139,253,0.1) 0%, transparent 60%); }
        .mobile-active { background: rgba(37,99,235,0.15); border-color: rgba(37,99,235,0.3); color: #93c5fd; }
        details summary::-webkit-details-marker { display: none; }
      `}</style>

      <div className="dash-glow pointer-events-none fixed inset-0 z-0" />

      <div className="relative z-10 flex min-h-screen">
        <Sidebar userEmail={user.email} />

        {/* Main content */}
        <div className="flex-1 overflow-x-hidden">
          <MobileNav />

          <div className="mx-auto max-w-[1400px] px-4 py-6 lg:px-8 lg:py-8">

            {/* Header */}
            <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-widest text-blue-400">Dashboard</p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight">Portfolio Workspace</h1>
                <p className="mt-0.5 text-sm text-slate-500">Welcome back, {user.email?.split("@")[0]}</p>
              </div>
              <div className="flex gap-2">
                <Link href="/portfolios" className="cta-btn rounded-xl px-4 py-2.5 text-sm font-semibold text-white">
                  View Portfolios
                </Link>
                <Link
                  href="/strategies"
                  className="rounded-xl border border-white/10 bg-white/4 px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-white/8"
                >
                  Strategies
                </Link>
              </div>
            </div>

            {/* Stat cards — improved with icons + sub-labels */}
            <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {stats.map((stat, i) => (
                <div key={stat.label} className="stat-card rounded-2xl p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium uppercase tracking-widest text-slate-500">{stat.label}</p>
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5">
                      {statIcons[i]}
                    </div>
                  </div>
                  <p className="mt-3 text-2xl font-semibold text-white">{stat.value}</p>
                  <p className="mt-0.5 text-xs text-slate-600">{stat.sub}</p>
                </div>
              ))}
            </div>

            {/* Main grid */}
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.9fr)]">
              <div className="space-y-5">

                {/* Active Portfolios */}
                <div className="card rounded-2xl p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-semibold text-white">Active Portfolios</h2>
                      <p className="mt-0.5 text-sm text-slate-500">Accounts you are actively managing.</p>
                    </div>
                    <Link href="/portfolios" className="text-xs text-blue-400 transition hover:text-blue-300">
                      View all →
                    </Link>
                  </div>

                  <div className="mt-4 space-y-2.5">
                    {activePortfolios.length > 0 ? (
                      activePortfolios.slice(0, 6).map((portfolio) => {
                        const style = accountTypeStyle(portfolio.account_type);
                        return (
                          <div key={portfolio.id} className="card-inner card-hover rounded-xl px-4 py-3.5">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div className="flex min-w-0 items-center gap-3">
                                {/* Color dot */}
                                <div className={`h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="text-sm font-semibold text-white">{portfolio.name}</h3>
                                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${style.badge}`}>
                                      {formatAccountType(portfolio.account_type)}
                                    </span>
                                    <span className="rounded-full border border-white/8 bg-white/4 px-2 py-0.5 text-[10px] text-slate-400">
                                      {portfolio.benchmark_symbol || "SPY"}
                                    </span>
                                  </div>
                                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                                    <span>Cash: {formatMoney(Number(portfolio.cash_balance))}</span>
                                    <span>·</span>
                                    <span>{new Date(portfolio.created_at).toLocaleDateString()}</span>
                                    <span>·</span>
                                    <span className="capitalize">{portfolio.status}</span>
                                  </div>
                                </div>
                              </div>
                              <Link
                                href={`/portfolios/${portfolio.id}`}
                                className="cta-btn shrink-0 rounded-xl px-4 py-2 text-xs font-semibold text-white"
                              >
                                Open →
                              </Link>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="card-inner rounded-xl p-5">
                        <p className="text-sm text-slate-500">No active portfolios yet. Create one to start tracking.</p>
                      </div>
                    )}
                  </div>

                  {/* Archived portfolios — collapsible */}
                  {archivedPortfolios.length > 0 && (
                    <details className="mt-3 group">
                      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-2 py-2 text-xs text-slate-500 transition hover:text-slate-300">
                        <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 transition group-open:rotate-90">
                          <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                        </svg>
                        {archivedPortfolios.length} archived portfolio{archivedPortfolios.length !== 1 ? "s" : ""}
                      </summary>
                      <div className="mt-2 space-y-2">
                        {archivedPortfolios.map((portfolio) => (
                          <div key={portfolio.id} className="card-inner flex items-center justify-between rounded-xl px-4 py-3 opacity-60">
                            <div className="flex items-center gap-3">
                              <div className="h-1.5 w-1.5 rounded-full bg-slate-600" />
                              <p className="text-sm text-slate-400">{portfolio.name}</p>
                            </div>
                            <Link
                              href={`/portfolios/${portfolio.id}`}
                              className="text-xs text-slate-500 transition hover:text-slate-300"
                            >
                              View →
                            </Link>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>

                {/* Unified activity feed */}
                <div className="card rounded-2xl p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-semibold text-white">Activity Feed</h2>
                      <p className="mt-0.5 text-sm text-slate-500">Trades, cash movements, and AI runs — all in one place.</p>
                    </div>
                    <span className="text-xs text-slate-600">{unifiedFeed.length} items</span>
                  </div>

                  {/* Kind filter legend */}
                  <div className="mt-3 flex gap-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-slate-400" />Trade</span>
                    <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Cash</span>
                    <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-blue-400" />AI Run</span>
                  </div>

                  <div className="mt-3 space-y-2">
                    {unifiedFeed.length > 0 ? (
                      unifiedFeed.map((item) => (
                        <Link
                          key={item.id}
                          href={item.href}
                          className="card-inner card-hover flex items-start justify-between gap-3 rounded-xl px-4 py-3.5 transition"
                        >
                          <div className="flex min-w-0 items-start gap-3">
                            <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${
                              item.kind === "ai"
                                ? "bg-blue-500/15 text-blue-400"
                                : item.kind === "cash"
                                ? "bg-emerald-500/15 text-emerald-400"
                                : "bg-slate-500/15 text-slate-400"
                            }`}>
                              {kindIcon[item.kind]}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="truncate text-sm font-medium text-white">{item.title}</p>
                                {item.kind === "ai" && item.aiStatus && (
                                  <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium capitalize ${statusBadgeClass(item.aiStatus)}`}>
                                    {item.aiStatus}
                                  </span>
                                )}
                              </div>
                              <p className="mt-0.5 text-xs text-slate-500">
                                {item.portfolioName} · {formatDateTime(item.occurredAt)}
                              </p>
                            </div>
                          </div>
                          {item.amount !== null && (
                            <span className={`shrink-0 text-sm font-semibold ${
                              item.amountTone === "positive"
                                ? "text-emerald-400"
                                : item.amountTone === "negative"
                                ? "text-red-400"
                                : "text-slate-400"
                            }`}>
                              {item.amount > 0 ? "+" : ""}{formatMoney(item.amount)}
                            </span>
                          )}
                        </Link>
                      ))
                    ) : (
                      <div className="card-inner rounded-xl p-5">
                        <p className="text-sm text-slate-500">No recent activity yet.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right column */}
              <div className="space-y-5">

                {/* Workspace Snapshot — improved stats */}
                <div className="card rounded-2xl p-5">
                  <h2 className="text-base font-semibold text-white">Workspace Snapshot</h2>
                  <div className="mt-4 space-y-2">
                    {[
                      { label: "Account", value: user.email?.split("@")[0] ?? user.email ?? "—" },
                      { label: "Active Portfolios", value: activePortfolios.length },
                      { label: "Archived Portfolios", value: archivedPortfolios.length },
                      { label: "Total Cash", value: formatMoney(totalCashTracked) },
                      { label: "Last AI Run", value: lastRunTime },
                    ].map((item) => (
                      <div key={item.label} className="card-inner flex items-center justify-between rounded-xl px-4 py-3">
                        <p className="text-xs uppercase tracking-widest text-slate-500">{item.label}</p>
                        <p className="max-w-[55%] truncate text-right text-sm font-medium text-white">{item.value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Quick Actions — simplified, no redundancy */}
                <div className="card rounded-2xl p-5">
                  <h2 className="text-base font-semibold text-white">Quick Actions</h2>
                  <div className="mt-4 grid gap-2">
                    <Link
                      href="/portfolios"
                      className="cta-btn rounded-xl px-4 py-3 text-center text-sm font-semibold text-white"
                    >
                      Open Portfolio Manager
                    </Link>
                    <Link
                      href="/strategies"
                      className="card-inner card-hover rounded-xl px-4 py-3 text-center text-sm font-medium text-slate-300 transition"
                    >
                      Strategy Library →
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
