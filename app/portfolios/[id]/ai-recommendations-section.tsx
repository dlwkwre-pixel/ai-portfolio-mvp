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

  // Auto-archive proposals older than 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  await supabase
    .from("recommendation_items")
    .update({
      recommendation_status: "archived",
      user_decision: "archived",
      decision_notes: "Auto-archived: proposed > 30 days",
    })
    .eq("portfolio_id", portfolioId)
    .eq("recommendation_status", "proposed")
    .lt("created_at", thirtyDaysAgo);

  const { data: runs, error: runsError } = await supabase
    .from("recommendation_runs")
    .select("*")
    .eq("portfolio_id", portfolioId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (runsError) {
    throw new Error(runsError.message);
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

      {latestRun?.summary && (
        <div className="mt-4 rounded-xl border p-5" style={{ background: "rgba(124,58,237,0.03)", borderColor: "rgba(124,58,237,0.15)" }}>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg width="13" height="13" viewBox="0 0 20 20" fill="#a78bfa">
                <path d="M15.98 1.804a1 1 0 00-1.96 0l-.24 1.192a1 1 0 01-.784.785l-1.192.238a1 1 0 000 1.962l1.192.238a1 1 0 01.785.785l.238 1.192a1 1 0 001.962 0l.238-1.192a1 1 0 01.785-.785l1.192-.238a1 1 0 000-1.962l-1.192-.238a1 1 0 01-.785-.785l-.238-1.192z"/>
                <path d="M6.949 5.684a1 1 0 00-1.898 0l-.683 2.051a1 1 0 01-.633.633l-2.051.683a1 1 0 000 1.898l2.051.684a1 1 0 01.633.632l.683 2.051a1 1 0 001.898 0l.683-2.051a1 1 0 01.633-.633l2.051-.683a1 1 0 000-1.897l-2.051-.684a1 1 0 01-.633-.633L6.95 5.684z"/>
              </svg>
              <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#a78bfa" }}>
                Latest Analysis
              </span>
            </div>
            <span className="text-[10px] text-slate-500">
              {new Date(latestRun.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
              {" · "}
              {new Date(latestRun.created_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
            </span>
          </div>
          <p className="text-sm leading-relaxed text-slate-300 overflow-y-auto" style={{ maxHeight: "260px", whiteSpace: "pre-wrap" }}>
            {latestRun.summary}
          </p>
        </div>
      )}

      {runs && runs.length > 1 && (
        <details className="mt-3 group">
          <summary className="cursor-pointer list-none text-[11px] text-slate-500 hover:text-slate-400 transition-colors py-1 px-2 select-none">
            Analysis history ({runs.length - 1} older run{runs.length - 1 !== 1 ? "s" : ""})
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            {runs.slice(1).map((run) => (
              <div key={run.id} className="rounded-lg border border-slate-800 bg-slate-950 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[10px] text-slate-500">
                    {new Date(run.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    {" · "}
                    {new Date(run.created_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                  </span>
                  <span className="text-[9px] uppercase tracking-wide px-2 py-0.5 rounded-full" style={{
                    background: run.status === "completed" ? "rgba(0,211,149,0.08)" : "rgba(100,116,139,0.1)",
                    color: run.status === "completed" ? "#00d395" : "#64748b",
                  }}>
                    {run.status ?? "unknown"}
                  </span>
                </div>
                {run.summary ? (
                  <p className="text-[12px] leading-relaxed text-slate-400 overflow-y-auto" style={{ maxHeight: "140px", whiteSpace: "pre-wrap" }}>
                    {run.summary}
                  </p>
                ) : (
                  <p className="text-[12px] text-slate-600 italic">No summary saved for this run.</p>
                )}
              </div>
            ))}
          </div>
        </details>
      )}

      <div className="mt-4">
        <AddRecommendationForm portfolioId={portfolioId} />
      </div>

      {runs && runs.length > 0 ? (
        <div className="mt-4">
          <AIRecommendationRunsList portfolioId={portfolioId} />
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