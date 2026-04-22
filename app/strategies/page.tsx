import Link from "next/link";
import Sidebar from "@/app/components/sidebar";
import MobileNav from "@/app/components/mobile-nav";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NewStrategyForm from "./new-strategy-form";
import EditStrategyForm from "./edit-strategy-form";

function formatRiskLevel(value: string | null) {
  if (!value) return "No Risk Set";
  const map: Record<string, string> = {
    low: "Conservative", Low: "Conservative",
    moderate: "Moderate", Moderate: "Moderate",
    high: "Aggressive", High: "Aggressive",
    conservative: "Conservative", Conservative: "Conservative",
    aggressive: "Aggressive", Aggressive: "Aggressive",
  };
  return map[value] ?? value;
}

function riskBadgeStyle(value: string | null) {
  const level = formatRiskLevel(value);
  if (level === "Conservative") return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
  if (level === "Aggressive") return "border-red-500/20 bg-red-500/10 text-red-300";
  return "border-amber-500/20 bg-amber-500/10 text-amber-300";
}

type StrategyRow = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  style: string | null;
  risk_level: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type StrategyVersion = {
  id: string;
  strategy_id: string;
  version_number: number;
  prompt_text: string | null;
  max_position_pct: number | null;
  min_position_pct: number | null;
  turnover_preference: string | null;
  holding_period_bias: string | null;
  cash_min_pct: number | null;
  cash_max_pct: number | null;
  created_at: string;
};

type StrategyCard = StrategyRow & {
  latest_version: StrategyVersion | null;
  version_history: StrategyVersion[];
};

export default async function StrategiesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: strategiesData, error } = await supabase
    .from("strategies")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const strategies: StrategyRow[] = (strategiesData ?? []) as StrategyRow[];
  const strategyIds = strategies.map((s) => s.id);

  const versionsByStrategyId = new Map<string, StrategyVersion[]>();
  const latestVersionsByStrategyId = new Map<string, StrategyVersion>();

  if (strategyIds.length > 0) {
    const { data: versionsData, error: versionsError } = await supabase
      .from("strategy_versions")
      .select("*")
      .in("strategy_id", strategyIds)
      .order("version_number", { ascending: false });

    if (versionsError) throw new Error(versionsError.message);

    for (const version of (versionsData ?? []) as StrategyVersion[]) {
      const existing = versionsByStrategyId.get(version.strategy_id) ?? [];
      existing.push(version);
      versionsByStrategyId.set(version.strategy_id, existing);
      if (!latestVersionsByStrategyId.has(version.strategy_id)) {
        latestVersionsByStrategyId.set(version.strategy_id, version);
      }
    }
  }

  const strategyCards: StrategyCard[] = strategies.map((strategy) => ({
    ...strategy,
    latest_version: latestVersionsByStrategyId.get(strategy.id) ?? null,
    version_history: versionsByStrategyId.get(strategy.id) ?? [],
  }));

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

          <div className="mx-auto max-w-5xl px-4 py-6 lg:px-8 lg:py-8">

            {/* Header */}
            <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-widest text-blue-400">Strategy Library</p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight">Investing Strategies</h1>
                <p className="mt-0.5 text-sm text-slate-500">
                  Create reusable frameworks that guide AI analysis across your portfolios.
                </p>
              </div>
              <NewStrategyForm />
            </div>

            {/* Summary */}
            <div className="mb-6 grid gap-3 sm:grid-cols-3">
              {[
                { label: "Active Strategies", value: strategyCards.length },
                { label: "Total Versions", value: strategyCards.reduce((sum, s) => sum + s.version_history.length, 0) },
                { label: "With AI Prompts", value: strategyCards.filter((s) => s.latest_version?.prompt_text).length },
              ].map((stat) => (
                <div key={stat.label} className="card rounded-2xl p-5">
                  <p className="text-xs font-medium uppercase tracking-widest text-slate-500">{stat.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{stat.value}</p>
                </div>
              ))}
            </div>

            {/* Strategy cards */}
            {strategyCards.length > 0 ? (
              <div className="space-y-5">
                {strategyCards.map((strategy) => (
                  <div key={strategy.id} className="card rounded-2xl p-5">

                    {/* Strategy header */}
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-lg font-semibold text-white">{strategy.name}</h2>
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${riskBadgeStyle(strategy.risk_level)}`}>
                            {formatRiskLevel(strategy.risk_level)}
                          </span>
                          {strategy.style && (
                            <span className="rounded-full border border-white/8 bg-white/4 px-2 py-0.5 text-[10px] text-slate-400">
                              {strategy.style}
                            </span>
                          )}
                          <span className="rounded-full border border-white/8 bg-white/4 px-2 py-0.5 text-[10px] text-slate-400">
                            v{strategy.latest_version?.version_number ?? "—"}
                          </span>
                        </div>

                        {strategy.description ? (
                          <p className="mt-2 text-sm leading-6 text-slate-400">{strategy.description}</p>
                        ) : (
                          <p className="mt-2 text-sm text-slate-600">No description added yet.</p>
                        )}
                      </div>

                      <div className="shrink-0">
                        <EditStrategyForm strategy={strategy} />
                      </div>
                    </div>

                    {/* Version parameters grid */}
                    {strategy.latest_version && (
                      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                        {[
                          { label: "Max Pos %", value: strategy.latest_version.max_position_pct ?? "—" },
                          { label: "Min Pos %", value: strategy.latest_version.min_position_pct ?? "—" },
                          { label: "Cash Min %", value: strategy.latest_version.cash_min_pct ?? "—" },
                          { label: "Cash Max %", value: strategy.latest_version.cash_max_pct ?? "—" },
                          { label: "Turnover", value: strategy.latest_version.turnover_preference ?? "—" },
                          { label: "Holding Bias", value: strategy.latest_version.holding_period_bias ?? "—" },
                        ].map((item) => (
                          <div key={item.label} className="card-inner rounded-xl px-3 py-2.5">
                            <p className="text-[10px] uppercase tracking-widest text-slate-600">{item.label}</p>
                            <p className="mt-1 text-xs font-semibold text-slate-300">{item.value}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* AI Prompt */}
                    {strategy.latest_version?.prompt_text && (
                      <div className="mt-4 rounded-xl border border-blue-500/10 bg-blue-500/5 px-4 py-4">
                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-blue-400">AI Prompt / Rules</p>
                        <p className="whitespace-pre-wrap text-sm leading-6 text-slate-300">
                          {strategy.latest_version.prompt_text}
                        </p>
                      </div>
                    )}

                    {/* Version history */}
                    {strategy.version_history.length > 0 && (
                      <details className="group mt-4">
                        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-1 py-2 text-xs text-slate-500 transition hover:text-slate-300">
                          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 transition group-open:rotate-90">
                            <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                          </svg>
                          Version History ({strategy.version_history.length})
                        </summary>

                        <div className="mt-3 space-y-2">
                          {strategy.version_history.map((version) => (
                            <div key={version.id} className="card-inner rounded-xl px-4 py-4">
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs font-semibold text-slate-300">
                                    v{version.version_number}
                                  </span>
                                  {strategy.latest_version?.id === version.id && (
                                    <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-300">
                                      Current
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-slate-600">{new Date(version.created_at).toLocaleDateString()}</p>
                              </div>

                              <div className="mt-3 grid grid-cols-2 gap-1.5 text-xs sm:grid-cols-3">
                                {[
                                  { label: "Max Pos %", value: version.max_position_pct ?? "—" },
                                  { label: "Min Pos %", value: version.min_position_pct ?? "—" },
                                  { label: "Turnover", value: version.turnover_preference ?? "—" },
                                  { label: "Holding Bias", value: version.holding_period_bias ?? "—" },
                                  { label: "Cash Min %", value: version.cash_min_pct ?? "—" },
                                  { label: "Cash Max %", value: version.cash_max_pct ?? "—" },
                                ].map((item) => (
                                  <span key={item.label} className="text-slate-500">
                                    {item.label}: <span className="text-slate-400">{item.value}</span>
                                  </span>
                                ))}
                              </div>

                              {version.prompt_text && (
                                <div className="mt-3 rounded-xl border border-white/5 bg-white/2 px-3 py-3">
                                  <p className="text-[10px] uppercase tracking-widest text-slate-600">Prompt</p>
                                  <p className="mt-1.5 whitespace-pre-wrap text-xs leading-5 text-slate-400">
                                    {version.prompt_text}
                                  </p>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="card rounded-2xl p-10 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6 text-blue-400">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-white">No strategies yet</h2>
                <p className="mt-2 text-sm text-slate-500">
                  Create your first strategy to define AI investing rules for your portfolios.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
