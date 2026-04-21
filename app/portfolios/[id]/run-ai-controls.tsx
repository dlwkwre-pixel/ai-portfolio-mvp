"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runPortfolioAiRecommendation } from "./recommendation-actions";

type RunAiControlsProps = {
  portfolioId: string;
  pendingRunCount: number;
  latestRunCreatedAt: string | null;
};

type HealthReport = {
  overall_score: number | null;
  risk_assessment: string | null;
  concentration_analysis: string | null;
  gaps_and_weaknesses: string | null;
  strengths: string | null;
  suggested_focus: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export default function RunAiControls({
  portfolioId,
  pendingRunCount,
  latestRunCreatedAt,
}: RunAiControlsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [healthReport, setHealthReport] = useState<HealthReport | null>(null);

  const hasPendingRun = pendingRunCount > 0;
  const isDisabled = isPending || hasPendingRun;

  function handleRunAi() {
    if (isDisabled) return;
    setErrorMessage("");
    setSuccessMessage("");
    setHealthReport(null);

    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("portfolio_id", portfolioId);

        const result = await runPortfolioAiRecommendation(formData);

        setSuccessMessage(
          `AI review complete — ${result.recommendationCount} recommendation${result.recommendationCount === 1 ? "" : "s"} generated.`
        );

        if (result.healthReport && result.healthReport.overall_score !== null) {
          setHealthReport(result.healthReport);
        }

        router.refresh();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "AI review failed.");
      }
    });
  }

  return (
    <div className="space-y-3">
      {/* Run button card */}
      <div className="rounded-xl border border-white/8 bg-white/3 p-4">
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-400">Run AI Analysis</p>
            <p className="mt-1 text-sm leading-6 text-slate-300">
              Grok analyzes your portfolio using holdings, strategy, cash, notes, and transaction history.
              Gemini Flash provides a portfolio health check as a cross-reference.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-white/8 bg-white/4 px-2.5 py-1 text-slate-400">
              {pendingRunCount} pending
            </span>
            <span className="rounded-full border border-white/8 bg-white/4 px-2.5 py-1 text-slate-400">
              Last run: {formatDate(latestRunCreatedAt)}
            </span>
          </div>

          <button
            type="button"
            onClick={handleRunAi}
            disabled={isDisabled}
            className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            style={isDisabled ? {} : { background: "linear-gradient(135deg,#2563eb,#4f46e5)", boxShadow: "0 4px 16px rgba(37,99,235,0.3)" }}
          >
            {isPending ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Running AI Analysis...
              </>
            ) : hasPendingRun ? (
              "AI Run Already Pending"
            ) : (
              <>
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path d="M15.98 1.804a1 1 0 00-1.96 0l-.24 1.192a1 1 0 01-.784.785l-1.192.238a1 1 0 000 1.962l1.192.238a1 1 0 01.785.785l.238 1.192a1 1 0 001.962 0l.238-1.192a1 1 0 01.785-.785l1.192-.238a1 1 0 000-1.962l-1.192-.238a1 1 0 01-.785-.785l-.238-1.192z" />
                </svg>
                Run AI Analysis
              </>
            )}
          </button>

          {hasPendingRun && !isPending && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-300">
              A run is already in progress. Wait for it to finish before starting another.
            </div>
          )}

          {successMessage && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-300">
              {successMessage}
            </div>
          )}

          {errorMessage && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
              {errorMessage}
            </div>
          )}
        </div>
      </div>

      {/* Health report card — shown after a successful run */}
      {healthReport && healthReport.overall_score !== null && (
        <div className="rounded-xl border border-blue-500/15 bg-blue-500/5 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-400">
              Gemini Health Report
            </p>
            <div className="flex items-center gap-2">
              <div className={`text-2xl font-bold ${
                healthReport.overall_score >= 70 ? "text-emerald-400"
                : healthReport.overall_score >= 50 ? "text-amber-400"
                : "text-red-400"
              }`}>
                {healthReport.overall_score}
              </div>
              <span className="text-xs text-slate-500">/100</span>
            </div>
          </div>

          <div className="space-y-2.5 text-sm">
            {healthReport.strengths && (
              <div>
                <p className="text-[10px] uppercase tracking-widest text-emerald-400 mb-1">Strengths</p>
                <p className="text-slate-300 leading-5">{healthReport.strengths}</p>
              </div>
            )}
            {healthReport.gaps_and_weaknesses && (
              <div>
                <p className="text-[10px] uppercase tracking-widest text-amber-400 mb-1">Gaps & Weaknesses</p>
                <p className="text-slate-300 leading-5">{healthReport.gaps_and_weaknesses}</p>
              </div>
            )}
            {healthReport.concentration_analysis && (
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Concentration</p>
                <p className="text-slate-400 leading-5">{healthReport.concentration_analysis}</p>
              </div>
            )}
            {healthReport.risk_assessment && (
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Risk</p>
                <p className="text-slate-400 leading-5">{healthReport.risk_assessment}</p>
              </div>
            )}
            {healthReport.suggested_focus && (
              <div className="mt-2 rounded-lg border border-blue-500/15 bg-blue-500/8 px-3 py-2">
                <p className="text-[10px] uppercase tracking-widest text-blue-400 mb-1">Suggested Focus</p>
                <p className="text-slate-300 leading-5">{healthReport.suggested_focus}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
