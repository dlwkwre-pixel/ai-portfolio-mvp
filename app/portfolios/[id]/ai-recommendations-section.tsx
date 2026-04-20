import { createClient } from "@/lib/supabase/server";
import AddRecommendationForm from "./add-recommendation-form";
import AIRecommendationRunsList from "./ai-recommendation-runs-list";

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

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">AI Recommendations</h2>
          <p className="mt-1 text-sm text-slate-400">
            Recommendation history grouped by review session.
          </p>
        </div>

        <div className="text-xs text-slate-500">
          {runs?.length ?? 0} run{(runs?.length ?? 0) === 1 ? "" : "s"}
        </div>
      </div>

      <div className="mt-4">
        <AddRecommendationForm portfolioId={portfolioId} />
      </div>

      {runs && runs.length > 0 ? (
        <div className="mt-4">
          <AIRecommendationRunsList
            portfolioId={portfolioId}
            runs={runs}
            recommendations={recommendations}
          />
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950 p-5">
          <p className="text-sm text-slate-400">
            No recommendation runs yet. Add a recommendation to seed the first
            review session.
          </p>
        </div>
      )}
    </section>
  );
}