import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NewStrategyForm from "./new-strategy-form";
import EditStrategyForm from "./edit-strategy-form";
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const { data: strategiesData, error } = await supabase
    .from("strategies")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

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

    if (versionsError) {
      throw new Error(versionsError.message);
    }

    const versions: StrategyVersion[] = (versionsData ?? []) as StrategyVersion[];

    for (const version of versions) {
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
    <main className="min-h-screen bg-slate-950 p-6 text-white lg:p-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <Link href="/dashboard" className="text-slate-400 hover:text-white">
            ← Back to dashboard
          </Link>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-sky-400">
              Strategies
            </p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight">
              Manage your AI strategies
            </h1>
            <p className="mt-3 text-slate-400">
              Create reusable investing frameworks for your portfolios.
            </p>
          </div>

          <NewStrategyForm />
        </div>

        {strategyCards.length > 0 ? (
          <div className="mt-10 grid gap-6">
            {strategyCards.map((strategy: StrategyCard) => (
              <div
                key={strategy.id}
                className="rounded-3xl border border-slate-800 bg-slate-900 p-6"
              >
                <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                  <div className="max-w-2xl">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h2 className="text-2xl font-semibold">{strategy.name}</h2>
                        <p className="mt-2 text-slate-400">
                          {strategy.style || "Custom Strategy"}
                        </p>
                      </div>

                      <span className="rounded-full bg-slate-800 px-3 py-1 text-sm text-slate-300">
                        {formatRiskLevel(strategy.risk_level)}
                      </span>
                    </div>

                    {strategy.description ? (
                      <p className="mt-4 text-slate-300">{strategy.description}</p>
                    ) : (
                      <p className="mt-4 text-slate-500">
                        No description added yet.
                      </p>
                    )}

                    <div className="mt-5 grid gap-2 text-sm text-slate-400 sm:grid-cols-2">
                      <p>
                        Current Version:{" "}
                        {strategy.latest_version?.version_number ?? "—"}
                      </p>
                      <p>
                        Turnover:{" "}
                        {strategy.latest_version?.turnover_preference ?? "—"}
                      </p>
                      <p>
                        Holding Bias:{" "}
                        {strategy.latest_version?.holding_period_bias ?? "—"}
                      </p>
                      <p>
                        Max Position %:{" "}
                        {strategy.latest_version?.max_position_pct ?? "—"}
                      </p>
                      <p>
                        Min Position %:{" "}
                        {strategy.latest_version?.min_position_pct ?? "—"}
                      </p>
                      <p>
                        Cash Range %:{" "}
                        {strategy.latest_version?.cash_min_pct ?? "—"} to{" "}
                        {strategy.latest_version?.cash_max_pct ?? "—"}
                      </p>
                    </div>

                    {strategy.latest_version?.prompt_text ? (
                      <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950 px-5 py-4">
                        <p className="text-sm font-medium text-slate-400">
                          Current AI Prompt / Rules
                        </p>
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-300">
                          {strategy.latest_version.prompt_text}
                        </p>
                      </div>
                    ) : null}
                  </div>

                  <div className="lg:w-[260px]">
                    <EditStrategyForm strategy={strategy} />
                  </div>
                </div>

                <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-950 p-5">
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold">Version History</h3>
                    <p className="mt-1 text-sm text-slate-400">
                      Newest version first. Editing a strategy creates a new version.
                    </p>
                  </div>

                  {strategy.version_history.length > 0 ? (
                    <div className="space-y-4">
                      {strategy.version_history.map((version: StrategyVersion) => (
                        <div
                          key={version.id}
                          className="rounded-2xl border border-slate-800 bg-slate-900 px-5 py-4"
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <div className="flex items-center gap-3">
                                <span className="rounded-full bg-slate-800 px-3 py-1 text-sm text-slate-300">
                                  v{version.version_number}
                                </span>
                                {strategy.latest_version?.id === version.id ? (
                                  <span className="rounded-full bg-blue-600/20 px-3 py-1 text-xs font-medium text-blue-300">
                                    Current
                                  </span>
                                ) : null}
                              </div>

                              <div className="mt-3 grid gap-2 text-sm text-slate-400 sm:grid-cols-2">
                                <p>
                                  Max Position %: {version.max_position_pct ?? "—"}
                                </p>
                                <p>
                                  Min Position %: {version.min_position_pct ?? "—"}
                                </p>
                                <p>
                                  Turnover: {version.turnover_preference ?? "—"}
                                </p>
                                <p>
                                  Holding Bias: {version.holding_period_bias ?? "—"}
                                </p>
                                <p>
                                  Cash Min %: {version.cash_min_pct ?? "—"}
                                </p>
                                <p>
                                  Cash Max %: {version.cash_max_pct ?? "—"}
                                </p>
                              </div>
                            </div>

                            <p className="text-sm text-slate-500">
                              {new Date(version.created_at).toLocaleDateString()}
                            </p>
                          </div>

                          {version.prompt_text ? (
                            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
                              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                Prompt / Rules
                              </p>
                              <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-300">
                                {version.prompt_text}
                              </p>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-slate-800 bg-slate-900 px-5 py-4">
                      <p className="text-slate-400">No version history yet.</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-10 rounded-3xl border border-slate-800 bg-slate-900 p-8">
            <h2 className="text-2xl font-semibold">No strategies yet</h2>
            <p className="mt-3 text-slate-400">
              Create your first strategy to start assigning investment rules to
              portfolios.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}