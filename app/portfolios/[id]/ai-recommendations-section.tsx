import { createClient } from "@/lib/supabase/server";
import AddRecommendationForm from "./add-recommendation-form";
import AIRecommendationRunsList from "./ai-recommendation-runs-list";
import RunAiControls from "./run-ai-controls";

type AIRecommendationsSectionProps = {
  portfolioId: string;
};

export default async function AIRecommendationsSection({
  portfolioId,
}: AIRecommendationsSectionProps) {
  const supabase = await createClient();

  const { data: runs, error: runsError } = await supabase
    .from("recommendation_runs")
    .select("*")
    .eq("portfolio_id", portfolioId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (runsError) {
    throw new Error(runsError.message);
  }

  const runIds = (runs ?? []).map((run) => run.id);

  let recommendations: any[] = [];

  if (runIds.length > 0) {
    const { data: items, error: itemsError } = await supabase
      .from("recommendation_items")
      .select("*")
      .eq("portfolio_id", portfolioId)
      .in("recommendation_run_id", runIds)
      .order("created_at", { ascending: false });

    if (itemsError) {
      throw new Error(itemsError.message);
    }

    recommendations = items ?? [];
  }

  const latestRun = runs?.[0] ?? null;
  const pendingRunCount =
    runs?.filter((run) =>
      ["pending", "running", "queued"].includes(
        String(run.status ?? "").toLowerCase()
      )
    ).length ?? 0;

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div>
        <h2 className="text-xl font-semibold text-white">AI Recommendations</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">
          On-demand portfolio reviews using the full portfolio, strategy, cash,
          holdings, notes, and recent activity context.
        </p>

        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-slate-800 bg-slate-950 px-3 py-1 text-slate-300">
            {runs?.length ?? 0} run{(runs?.length ?? 0) === 1 ? "" : "s"}
          </span>
          <span className="rounded-full border border-slate-800 bg-slate-950 px-3 py-1 text-slate-300">
            {pendingRunCount} pending
          </span>
          <span className="rounded-full border border-slate-800 bg-slate-950 px-3 py-1 text-slate-300">
            Latest:{" "}
            {latestRun
              ? new Date(latestRun.created_at).toLocaleDateString()
              : "—"}
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <RunAiControls
          portfolioId={portfolioId}
          pendingRunCount={pendingRunCount}
          latestRunCreatedAt={latestRun?.created_at ?? null}
        />

        <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">
            Run Behavior
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-300">
            AI runs on demand and saves a full recommendation session instead of
            polling continuously.
          </p>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            This keeps API usage controlled while still letting you generate a
            full portfolio review whenever you want updated suggestions.
          </p>
        </div>
      </div>

      <div className="mt-4">
        <AddRecommendationForm portfolioId={portfolioId} />
      </div>

      {runs && runs.length > 0 ? (
        <div className="mt-4">
          <AIRecommendationRunsList
            portfolioId={portfolioId}
            recommendations={recommendations}
          />
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950 p-5">
          <p className="text-sm text-slate-400">
            No recommendation runs yet. Run AI for a full portfolio review or add
            a manual recommendation to seed the first session.
          </p>
        </div>
      )}
    </section>
  );
}