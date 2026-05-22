import { createClient } from "@/lib/supabase/server";
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

  const latestRun = runs?.[0] ?? null;
  const pendingRunCount =
    runs?.filter((run) =>
      ["pending", "running", "queued"].includes(
        String(run.status ?? "").toLowerCase()
      )
    ).length ?? 0;

  // Pre-calculate cooldown window for the UI
  const COOLDOWN_MS = 4 * 60 * 60 * 1000;
  const lastCompleted = runs?.find((r) => r.status === "completed") ?? null;
  const cooldownEndsAt = lastCompleted
    ? new Date(new Date(lastCompleted.created_at).getTime() + COOLDOWN_MS).toISOString()
    : null;

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

      <div className="mt-3 flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
        <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor" className="shrink-0 text-slate-600">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
        </svg>
        <span className="text-[11px] text-slate-500">
          Market data reflects the last trading session. Prices may be stale outside US trading hours (Mon–Fri, 9:30am–4pm ET). Grok searches for live data before analyzing.
        </span>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <RunAiControls
          portfolioId={portfolioId}
          pendingRunCount={pendingRunCount}
          latestRunCreatedAt={latestRun?.created_at ?? null}
          cooldownEndsAt={cooldownEndsAt}
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

      {latestRun?.summary && (() => {
        const raw = latestRun.summary;

        // Parse: "{grok summary} | Health Score: X/100. Focus: {focus}"
        const healthMatch = raw.match(/\|\s*Health Score:\s*(\d+)\/100/i);
        const healthScore = healthMatch ? parseInt(healthMatch[1], 10) : null;
        const focusMatch = raw.match(/\bFocus:\s*(.+?)(?:\s*$)/i);
        const focusText = focusMatch ? focusMatch[1].trim() : null;
        const mainText = raw
          .replace(/\|\s*Health Score:\s*\d+\/100\.?/i, "")
          .replace(/\bFocus:\s*.+$/i, "")
          .trim()
          .replace(/\s+$/, "")
          .replace(/\.$/, "");

        const scoreColor =
          healthScore === null ? null :
          healthScore >= 75 ? "#22c55e" :
          healthScore >= 55 ? "#f59e0b" : "#ef4444";
        const scoreBg =
          healthScore === null ? null :
          healthScore >= 75 ? "rgba(34,197,94,0.08)" :
          healthScore >= 55 ? "rgba(245,158,11,0.08)" : "rgba(239,68,68,0.08)";
        const scoreBorder =
          healthScore === null ? null :
          healthScore >= 75 ? "rgba(34,197,94,0.15)" :
          healthScore >= 55 ? "rgba(245,158,11,0.15)" : "rgba(239,68,68,0.15)";

        return (
          <div className="mt-4 rounded-xl border border-white/8 bg-white/2 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" className="text-slate-500">
                  <path d="M15.98 1.804a1 1 0 00-1.96 0l-.24 1.192a1 1 0 01-.784.785l-1.192.238a1 1 0 000 1.962l1.192.238a1 1 0 01.785.785l.238 1.192a1 1 0 001.962 0l.238-1.192a1 1 0 01.785-.785l1.192-.238a1 1 0 000-1.962l-1.192-.238a1 1 0 01-.785-.785l-.238-1.192z"/>
                  <path d="M6.949 5.684a1 1 0 00-1.898 0l-.683 2.051a1 1 0 01-.633.633l-2.051.683a1 1 0 000 1.898l2.051.684a1 1 0 01.633.632l.683 2.051a1 1 0 001.898 0l.683-2.051a1 1 0 01.633-.633l2.051-.683a1 1 0 000-1.897l-2.051-.684a1 1 0 01-.633-.633L6.95 5.684z"/>
                </svg>
                <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                  Morning Briefing
                </span>
              </div>
              <span className="text-[10px] text-slate-600">
                {new Date(latestRun.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                {" · "}
                {new Date(latestRun.created_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
              </span>
            </div>

            <div className="flex items-start gap-4">
              {/* Health score badge */}
              {healthScore !== null && (
                <div
                  className="shrink-0 rounded-xl border px-3 py-2 text-center"
                  style={{ background: scoreBg ?? undefined, borderColor: scoreBorder ?? undefined }}
                >
                  <p className="text-xl font-bold tabular-nums leading-none" style={{ color: scoreColor ?? undefined }}>
                    {healthScore}
                  </p>
                  <p className="mt-0.5 text-[9px] uppercase tracking-widest" style={{ color: scoreColor ?? undefined, opacity: 0.7 }}>
                    Health
                  </p>
                </div>
              )}

              {/* Main briefing text */}
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-relaxed text-slate-300">{mainText}</p>
              </div>
            </div>

            {/* Focus callout */}
            {focusText && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-blue-500/15 bg-blue-500/6 px-3 py-2">
                <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 shrink-0 text-blue-400">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-11.25a.75.75 0 00-1.5 0v2.5h-2.5a.75.75 0 000 1.5h2.5v2.5a.75.75 0 001.5 0v-2.5h2.5a.75.75 0 000-1.5h-2.5v-2.5z" clipRule="evenodd" />
                </svg>
                <p className="text-xs text-slate-300">
                  <span className="font-semibold text-blue-400">Focus: </span>
                  {focusText}
                </p>
              </div>
            )}
          </div>
        );
      })()}

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

      {runs && runs.length > 0 ? (
        <div className="mt-4">
          <AIRecommendationRunsList portfolioId={portfolioId} latestRunId={latestRun?.id ?? null} />
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