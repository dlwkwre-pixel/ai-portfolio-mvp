import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/app/components/sidebar";
import MobileNav from "@/app/components/mobile-nav";
import DashboardClient from "./dashboard-client";

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, { month: "numeric", day: "numeric", year: "2-digit", hour: "numeric", minute: "2-digit" });
}

function formatAccountType(value: string | null) {
  if (!value) return "—";
  const map: Record<string, string> = {
    taxable: "Brokerage", brokerage: "Brokerage", retirement: "Retirement",
    speculative: "Margin", margin: "Margin", paper_trade: "Paper Trade",
  };
  return map[value] ?? value.replaceAll("_", " ");
}

function accountTypeStyle(value: string | null) {
  const type = (value || "").toLowerCase();
  if (["taxable", "brokerage"].includes(type)) return { dot: "bg-blue-400", badge: "border-blue-500/20 bg-blue-500/10 text-blue-300" };
  if (["retirement"].includes(type)) return { dot: "bg-emerald-400", badge: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" };
  if (["speculative", "margin"].includes(type)) return { dot: "bg-amber-400", badge: "border-amber-500/20 bg-amber-500/10 text-amber-300" };
  if (["paper_trade"].includes(type)) return { dot: "bg-purple-400", badge: "border-purple-500/20 bg-purple-500/10 text-purple-300" };
  return { dot: "bg-slate-400", badge: "border-white/10 bg-white/5 text-slate-400" };
}

function formatTitleCase(value: string | null | undefined) {
  if (!value) return "—";
  return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function truncateText(value: string | null | undefined, maxLength = 180) {
  if (!value) return "Recommendation Review";
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}

function statusBadgeClass(status: string | null | undefined) {
  const normalized = (status || "").toLowerCase();
  if (["completed", "executed"].includes(normalized)) return "bg-emerald-500/15 text-emerald-300 border border-emerald-500/20";
  if (["failed", "rejected"].includes(normalized)) return "bg-red-500/15 text-red-300 border border-red-500/20";
  if (["running", "pending", "queued"].includes(normalized)) return "bg-amber-500/15 text-amber-300 border border-amber-500/20";
  return "bg-white/5 text-slate-300 border border-white/10";
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: portfolios, error: portfoliosError } = await supabase
    .from("portfolios")
    .select("id, name, is_active, cash_balance, benchmark_symbol, created_at, status, account_type")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (portfoliosError) throw new Error(portfoliosError.message);

  const { count: activeStrategiesCount } = await supabase
    .from("strategies").select("*", { count: "exact", head: true })
    .eq("user_id", user.id).eq("is_active", true);

  const activePortfolios = (portfolios ?? []).filter((p) => p.is_active);
  const archivedPortfolios = (portfolios ?? []).filter((p) => !p.is_active);
  const portfolioIds = (portfolios ?? []).map((p) => p.id);

  let runs: any[] = [];
  let recentTransactions: any[] = [];
  let recentCashActivity: any[] = [];

  if (portfolioIds.length > 0) {
    const [
      { data: recommendationRuns },
      { data: transactions },
      { data: cashEntries },
    ] = await Promise.all([
      supabase.from("recommendation_runs").select("id, portfolio_id, status, summary, model_name, created_at").in("portfolio_id", portfolioIds).order("created_at", { ascending: false }).limit(6),
      supabase.from("portfolio_transactions").select("id, portfolio_id, transaction_type, ticker, net_cash_impact, traded_at").in("portfolio_id", portfolioIds).order("traded_at", { ascending: false }).limit(8),
      supabase.from("cash_ledger").select("id, portfolio_id, direction, reason, amount, effective_at").in("portfolio_id", portfolioIds).order("effective_at", { ascending: false }).limit(8),
    ]);
    runs = recommendationRuns ?? [];
    recentTransactions = transactions ?? [];
    recentCashActivity = cashEntries ?? [];
  }

  const portfolioNameById = new Map((portfolios ?? []).map((p) => [p.id, p.name]));
  const totalCashTracked = activePortfolios.reduce((sum, p) => sum + Number(p.cash_balance ?? 0), 0);
  const lastRunTime = runs[0] ? formatDateTime(runs[0].created_at) : "No runs yet";

  // Build unified activity feed
  const transactionActivity = recentTransactions.map((t) => {
    const amount = Number(t.net_cash_impact ?? 0);
    return {
      id: `tx-${t.id}`, kind: "transaction" as const,
      portfolioId: t.portfolio_id, portfolioName: portfolioNameById.get(t.portfolio_id) || "Unknown",
      title: `${formatTitleCase(t.transaction_type)}${t.ticker ? ` · ${t.ticker}` : ""}`,
      occurredAt: t.traded_at, amount,
      amountTone: (amount > 0 ? "positive" : amount < 0 ? "negative" : "neutral") as "positive" | "negative" | "neutral",
      href: `/portfolios/${t.portfolio_id}`,
    };
  });

  const cashActivity = recentCashActivity.map((entry) => {
    const baseAmount = Number(entry.amount ?? 0);
    const signedAmount = (entry.direction || "").toUpperCase() === "OUT" ? -baseAmount : baseAmount;
    return {
      id: `cash-${entry.id}`, kind: "cash" as const,
      portfolioId: entry.portfolio_id, portfolioName: portfolioNameById.get(entry.portfolio_id) || "Unknown",
      title: `${formatTitleCase(entry.reason)} Cash`,
      occurredAt: entry.effective_at, amount: signedAmount,
      amountTone: (signedAmount > 0 ? "positive" : signedAmount < 0 ? "negative" : "neutral") as "positive" | "negative" | "neutral",
      href: `/portfolios/${entry.portfolio_id}`,
    };
  });

  const aiActivity = runs.map((run) => ({
    id: `run-${run.id}`, kind: "ai" as const,
    portfolioId: run.portfolio_id, portfolioName: portfolioNameById.get(run.portfolio_id) || "Unknown",
    title: truncateText(run.summary, 140),
    occurredAt: run.created_at, amount: null,
    amountTone: "neutral" as const,
    href: `/portfolios/${run.portfolio_id}`,
    aiStatus: run.status,
  }));

  const unifiedFeed = [...transactionActivity, ...cashActivity, ...aiActivity]
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, 15);

  const stats = [
    { label: "Active Portfolios", value: String(activePortfolios.length), sub: `${archivedPortfolios.length} archived`, isMoney: false },
    { label: "Total Cash Tracked", value: formatMoney(totalCashTracked), sub: "across active portfolios", isMoney: true },
    { label: "Active Strategies", value: String(activeStrategiesCount ?? 0), sub: "in strategy library", isMoney: false },
    { label: "Last AI Run", value: lastRunTime, sub: "most recent analysis", isMoney: false },
  ];

  // Serialize portfolio data for client
  const portfolioRows = activePortfolios.slice(0, 6).map((p) => ({
    id: p.id, name: p.name, account_type: p.account_type,
    cash_balance: Number(p.cash_balance ?? 0),
    benchmark_symbol: p.benchmark_symbol, created_at: p.created_at, status: p.status,
    style: accountTypeStyle(p.account_type),
    accountTypeLabel: formatAccountType(p.account_type),
    cashLabel: formatMoney(Number(p.cash_balance ?? 0)),
    dateLabel: new Date(p.created_at).toLocaleDateString(),
  }));

  const archivedRows = archivedPortfolios.map((p) => ({
    id: p.id, name: p.name,
  }));

  return (
    <main className="min-h-screen bg-[#040d1a] text-white" style={{ fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&display=swap');
        .card { border: 1px solid rgba(255,255,255,0.07); background: rgba(255,255,255,0.03); }
        .card-inner { border: 1px solid rgba(255,255,255,0.05); background: rgba(255,255,255,0.02); }
        .card-hover { transition: all 0.15s ease; }
        .card-hover:hover { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.1); }
        .cta-btn { background: linear-gradient(135deg,#2563eb,#4f46e5); box-shadow: 0 4px 16px rgba(37,99,235,0.3); transition: all 0.2s ease; }
        .cta-btn:hover { box-shadow: 0 6px 24px rgba(37,99,235,0.45); transform: translateY(-1px); }
        .dash-glow { background: radial-gradient(ellipse 70% 40% at 50% 0%, rgba(56,139,253,0.1) 0%, transparent 60%); }
        details summary::-webkit-details-marker { display: none; }
      `}</style>

      <div className="dash-glow pointer-events-none fixed inset-0 z-0" />

      <div className="relative z-10 flex min-h-screen">
        <Sidebar userEmail={user.email} />

        <div className="flex-1 overflow-x-hidden">
          <MobileNav />

          <div className="mx-auto max-w-[1400px] px-4 py-6 lg:px-8 lg:py-8">

            {/* Header */}
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-widest text-blue-400">Dashboard</p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight">Portfolio Workspace</h1>
                <p className="mt-0.5 text-sm text-slate-500">Welcome back, {user.email?.split("@")[0]}</p>
              </div>
              <div className="flex gap-2">
                <Link href="/portfolios" className="cta-btn rounded-xl px-4 py-2.5 text-sm font-semibold text-white">
                  View Portfolios
                </Link>
                <Link href="/strategies" className="rounded-xl border border-white/10 bg-white/4 px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-white/8">
                  Strategies
                </Link>
              </div>
            </div>

            {/* Client section — handles privacy mode + all interactive content */}
            <DashboardClient
              stats={stats}
              portfolioRows={portfolioRows}
              archivedRows={archivedRows}
              unifiedFeed={unifiedFeed.map((item) => ({
                ...item,
                amountLabel: item.amount !== null ? formatMoney(item.amount) : null,
                occurredAtLabel: formatDateTime(item.occurredAt),
                statusBadgeClass: item.kind === "ai" && item.aiStatus ? statusBadgeClass(item.aiStatus) : null,
              }))}
              workspaceSnapshot={{
                account: user.email?.split("@")[0] ?? user.email ?? "—",
                activePortfolios: activePortfolios.length,
                archivedPortfolios: archivedPortfolios.length,
                totalCash: formatMoney(totalCashTracked),
                lastAiRun: lastRunTime,
              }}
            />

          </div>
        </div>
      </div>
    </main>
  );
}
