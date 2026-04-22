import Link from "next/link";
import Sidebar from "@/app/components/sidebar";
import MobileNav from "@/app/components/mobile-nav";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NewPortfolioForm from "./new-portfolio-form";
import PortfolioStatusButton from "./portfolio-status-button";

function formatAccountType(value: string | null) {
  if (!value) return "—";
  const map: Record<string, string> = {
    taxable: "Brokerage",
    brokerage: "Brokerage",
    retirement: "Retirement",
    speculative: "Margin",
    margin: "Margin",
    paper_trade: "Paper Trade",
    roth_ira: "Roth IRA",
    traditional_ira: "Traditional IRA",
  };
  return map[value] ?? value.replaceAll("_", " ");
}

function accountTypeStyle(value: string | null) {
  const type = (value || "").toLowerCase();
  if (["taxable", "brokerage"].includes(type))
    return { dot: "bg-blue-400", badge: "border-blue-500/20 bg-blue-500/10 text-blue-300" };
  if (["retirement", "roth_ira", "traditional_ira"].includes(type))
    return { dot: "bg-emerald-400", badge: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" };
  if (["speculative", "margin"].includes(type))
    return { dot: "bg-amber-400", badge: "border-amber-500/20 bg-amber-500/10 text-amber-300" };
  if (["paper_trade", "paper trade"].includes(type))
    return { dot: "bg-purple-400", badge: "border-purple-500/20 bg-purple-500/10 text-purple-300" };
  return { dot: "bg-slate-400", badge: "border-white/10 bg-white/5 text-slate-400" };
}

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `$${Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

type SnapshotRow = {
  portfolio_id: string;
  total_value: number | string;
  snapshot_date: string;
};

export default async function PortfoliosPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const { data: activePortfolios, error: activeError } = await supabase
    .from("portfolios")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (activeError) throw new Error(activeError.message);

  const { data: archivedPortfolios, error: archivedError } = await supabase
    .from("portfolios")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_active", false)
    .order("created_at", { ascending: false });

  if (archivedError) throw new Error(archivedError.message);

  const allPortfolios = [...(activePortfolios ?? []), ...(archivedPortfolios ?? [])];
  const portfolioIds = allPortfolios.map((p) => p.id);

  let latestSnapshotsByPortfolioId = new Map<string, { total_value: number; snapshot_date: string }>();

  if (portfolioIds.length > 0) {
    const { data: snapshots, error: snapshotsError } = await supabase
      .from("portfolio_snapshots")
      .select("portfolio_id, total_value, snapshot_date")
      .in("portfolio_id", portfolioIds)
      .order("portfolio_id", { ascending: true })
      .order("snapshot_date", { ascending: false });

    if (snapshotsError) throw new Error(snapshotsError.message);

    for (const snapshot of (snapshots ?? []) as SnapshotRow[]) {
      if (!latestSnapshotsByPortfolioId.has(snapshot.portfolio_id)) {
        latestSnapshotsByPortfolioId.set(snapshot.portfolio_id, {
          total_value: Number(snapshot.total_value ?? 0),
          snapshot_date: snapshot.snapshot_date,
        });
      }
    }
  }

  const activeCount = activePortfolios?.length ?? 0;
  const archivedCount = archivedPortfolios?.length ?? 0;
  const portfoliosWithSnapshots = allPortfolios.filter((p) =>
    latestSnapshotsByPortfolioId.has(p.id)
  ).length;

  const totalTrackedValue = (activePortfolios ?? []).reduce((sum, p) => {
    const snap = latestSnapshotsByPortfolioId.get(p.id);
    return sum + (snap?.total_value ?? Number(p.cash_balance ?? 0));
  }, 0);

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
        .cta-btn { background: linear-gradient(135deg,#2563eb,#4f46e5); box-shadow: 0 4px 16px rgba(37,99,235,0.3); transition: all 0.2s ease; }
        .cta-btn:hover { box-shadow: 0 6px 24px rgba(37,99,235,0.45); transform: translateY(-1px); }
        .dash-glow { background: radial-gradient(ellipse 70% 40% at 50% 0%, rgba(56,139,253,0.1) 0%, transparent 60%); }
        .mobile-active { background: rgba(37,99,235,0.15); border-color: rgba(37,99,235,0.3); color: #93c5fd; }
        details summary::-webkit-details-marker { display: none; }
      `}</style>

      <div className="dash-glow pointer-events-none fixed inset-0 z-0" />

      <div className="relative z-10 flex min-h-screen">
        <Sidebar userEmail={user?.email} />

        {/* Main */}
        <div className="flex-1 overflow-x-hidden">
          {/* Mobile nav */}
          <MobileNav />

          <div className="mx-auto max-w-[1400px] px-4 py-6 lg:px-8 lg:py-8">

            {/* Header */}
            <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-widest text-blue-400">Portfolio Management</p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight">Your Portfolios</h1>
                <p className="mt-0.5 text-sm text-slate-500">{activeCount} active · {archivedCount} archived · {portfoliosWithSnapshots} with snapshots</p>
              </div>
              <NewPortfolioForm />
            </div>

            {/* Summary stat cards */}
            <div className="mb-8 grid gap-3 sm:grid-cols-3">
              {[
                { label: "Active Portfolios", value: activeCount },
                { label: "Total Tracked Value", value: formatMoney(totalTrackedValue) },
                { label: "Archived", value: archivedCount },
              ].map((stat) => (
                <div key={stat.label} className="card rounded-2xl p-5">
                  <p className="text-xs font-medium uppercase tracking-widest text-slate-500">{stat.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{stat.value}</p>
                </div>
              ))}
            </div>

            {/* Active portfolios */}
            <section className="mb-8">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-white">Active Portfolios</h2>
                  <p className="mt-0.5 text-sm text-slate-500">Accounts currently in use.</p>
                </div>
                <span className="text-xs text-slate-600">{activeCount} portfolio{activeCount !== 1 ? "s" : ""}</span>
              </div>

              {activePortfolios && activePortfolios.length > 0 ? (
                <div className="grid gap-4 xl:grid-cols-2">
                  {activePortfolios.map((portfolio) => {
                    const snap = latestSnapshotsByPortfolioId.get(portfolio.id);
                    const style = accountTypeStyle(portfolio.account_type);
                    return (
                      <div key={portfolio.id} className="card rounded-2xl p-5">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className={`h-2 w-2 rounded-full ${style.dot}`} />
                              <h3 className="text-lg font-semibold text-white">{portfolio.name}</h3>
                              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${style.badge}`}>
                                {formatAccountType(portfolio.account_type)}
                              </span>
                              <span className="rounded-full border border-white/8 bg-white/4 px-2 py-0.5 text-[10px] text-slate-400">
                                {portfolio.benchmark_symbol ?? "SPY"}
                              </span>
                              <span className="rounded-full border border-white/8 bg-white/4 px-2 py-0.5 text-[10px] capitalize text-slate-400">
                                {portfolio.status}
                              </span>
                            </div>

                            {portfolio.description && (
                              <p className="mt-2 text-sm leading-6 text-slate-400">{portfolio.description}</p>
                            )}

                            <p className="mt-2 text-xs text-slate-600">Created {formatDate(portfolio.created_at)}</p>
                          </div>

                          {/* Value stats */}
                          <div className="grid grid-cols-2 gap-2 lg:w-[240px]">
                            <div className="card-inner col-span-2 rounded-xl px-4 py-3">
                              <p className="text-[10px] uppercase tracking-widest text-slate-500">Portfolio Value</p>
                              <p className="mt-1 text-base font-semibold text-white">
                                {snap ? formatMoney(snap.total_value) : "No snapshot yet"}
                              </p>
                              <p className="mt-0.5 text-[10px] text-slate-600">
                                {snap ? `As of ${formatDate(snap.snapshot_date)}` : "Add snapshots to track value"}
                              </p>
                            </div>
                            <div className="card-inner rounded-xl px-4 py-3">
                              <p className="text-[10px] uppercase tracking-widest text-slate-500">Cash</p>
                              <p className="mt-1 text-sm font-semibold text-white">{formatMoney(Number(portfolio.cash_balance))}</p>
                            </div>
                            <div className="card-inner rounded-xl px-4 py-3">
                              <p className="text-[10px] uppercase tracking-widest text-slate-500">Type</p>
                              <p className="mt-1 text-sm font-semibold text-white">{formatAccountType(portfolio.account_type)}</p>
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          <Link
                            href={`/portfolios/${portfolio.id}`}
                            className="cta-btn rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
                          >
                            Open Portfolio →
                          </Link>
                          <PortfolioStatusButton
                            portfolioId={portfolio.id}
                            portfolioName={portfolio.name}
                            mode="archive"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="card rounded-2xl p-8 text-center">
                  <p className="text-base font-semibold text-white">No active portfolios yet</p>
                  <p className="mt-2 text-sm text-slate-500">Create your first portfolio to start tracking holdings, cash, and AI recommendations.</p>
                </div>
              )}
            </section>

            {/* Archived portfolios */}
            {archivedPortfolios && archivedPortfolios.length > 0 && (
              <section>
                <details className="group">
                  <summary className="mb-4 flex cursor-pointer list-none items-center gap-2 text-sm text-slate-500 transition hover:text-slate-300">
                    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 transition group-open:rotate-90">
                      <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                    </svg>
                    <span className="font-medium">Archived Portfolios</span>
                    <span className="text-slate-600">({archivedCount})</span>
                  </summary>

                  <div className="grid gap-4 xl:grid-cols-2">
                    {archivedPortfolios.map((portfolio) => {
                      const snap = latestSnapshotsByPortfolioId.get(portfolio.id);
                      return (
                        <div key={portfolio.id} className="card rounded-2xl p-5 opacity-70">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="h-2 w-2 rounded-full bg-slate-600" />
                                <h3 className="text-base font-semibold text-slate-300">{portfolio.name}</h3>
                                <span className="rounded-full border border-white/8 bg-white/4 px-2 py-0.5 text-[10px] text-slate-500">
                                  {formatAccountType(portfolio.account_type)}
                                </span>
                              </div>
                              <div className="mt-2 flex gap-3 text-xs text-slate-600">
                                <span>Cash: {formatMoney(Number(portfolio.cash_balance))}</span>
                                <span>·</span>
                                <span>{snap ? formatMoney(snap.total_value) : "No snapshot"}</span>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Link
                                href={`/portfolios/${portfolio.id}`}
                                className="rounded-xl border border-white/8 bg-white/4 px-4 py-2 text-sm font-medium text-slate-400 transition hover:text-white"
                              >
                                View
                              </Link>
                              <PortfolioStatusButton
                                portfolioId={portfolio.id}
                                portfolioName={portfolio.name}
                                mode="restore"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </details>
              </section>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
