"use client";

import { useMemo, useState } from "react";
import RecommendationStatusButtons from "./recommendation-status-buttons";

type RecommendationRun = {
  id: string;
  run_type: string | null;
  triggered_by: string | null;
  model_name: string | null;
  model_version: string | null;
  summary: string | null;
  status: string | null;
  strategy_version_id: string | null;
  created_at: string;
};

type RecommendationItem = {
  id: string;
  recommendation_run_id: string;
  action_type: string | null;
  ticker: string | null;
  company_name: string | null;
  thesis: string | null;
  rationale: string | null;
  risks: string | null;
  conviction: string | null;
  confidence_score: number | null;
  priority_rank: number | null;
  sizing_pct: number | null;
  sizing_dollars: number | null;
  share_quantity: number | null;
  target_price_1: number | null;
  target_price_2: number | null;
  stop_price: number | null;
  time_horizon: string | null;
  recommendation_status: string | null;
  created_at: string;
};

type AIRecommendationRunsListProps = {
  portfolioId: string;
  runs: RecommendationRun[];
  recommendations: RecommendationItem[];
};

const DEFAULT_VISIBLE_RUNS = 3;

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `$${Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatNumber(value: number | null | undefined, maxDigits = 2) {
  if (value === null || value === undefined) return "—";
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDigits,
  });
}

function formatTimeHorizon(value: string | null) {
  if (!value) return "—";

  const map: Record<string, string> = {
    short_term: "Short-term",
    medium_term: "Medium-term",
    long_term: "Long-term",
  };

  return map[value] ?? value;
}

function formatActionType(value: string | null) {
  if (!value) return "—";
  return value.replaceAll("_", " ").toUpperCase();
}

function formatRunType(value: string | null) {
  if (!value) return "Review";
  return value.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function badgeClassForStatus(value: string | null) {
  const normalized = (value || "").toLowerCase();

  if (normalized === "accepted" || normalized === "executed") {
    return "bg-emerald-500/10 text-emerald-300";
  }

  if (normalized === "rejected") {
    return "bg-red-500/10 text-red-300";
  }

  if (normalized === "watchlist") {
    return "bg-amber-500/10 text-amber-300";
  }

  return "bg-slate-800 text-slate-300";
}

export default function AIRecommendationRunsList({
  portfolioId,
  runs,
  recommendations,
}: AIRecommendationRunsListProps) {
  const [statusFilter, setStatusFilter] = useState("open");
  const [sortBy, setSortBy] = useState("newest");
  const [showAllRuns, setShowAllRuns] = useState(false);
  const [expandedRunIds, setExpandedRunIds] = useState<string[]>([]);

  const filteredRuns = useMemo(() => {
    const itemsByRunId = new Map<string, RecommendationItem[]>();

    for (const item of recommendations) {
      const existing = itemsByRunId.get(item.recommendation_run_id) ?? [];
      existing.push(item);
      itemsByRunId.set(item.recommendation_run_id, existing);
    }

    return runs
      .map((run) => {
        let items = itemsByRunId.get(run.id) ?? [];

        if (statusFilter === "open") {
          items = items.filter((item) =>
            ["proposed", "accepted", "watchlist"].includes(
              item.recommendation_status || ""
            )
          );
        } else if (statusFilter !== "all") {
          items = items.filter(
            (item) => (item.recommendation_status || "") === statusFilter
          );
        }

        if (sortBy === "priority") {
          items = [...items].sort((a, b) => {
            const aPriority = a.priority_rank ?? 9999;
            const bPriority = b.priority_rank ?? 9999;
            return aPriority - bPriority;
          });
        } else if (sortBy === "confidence") {
          items = [...items].sort((a, b) => {
            const aConfidence = a.confidence_score ?? -1;
            const bConfidence = b.confidence_score ?? -1;
            return bConfidence - aConfidence;
          });
        } else if (sortBy === "oldest") {
          items = [...items].sort(
            (a, b) =>
              new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
        } else {
          items = [...items].sort(
            (a, b) =>
              new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
        }

        return {
          ...run,
          items,
        };
      })
      .filter((run) => run.items.length > 0);
  }, [runs, recommendations, sortBy, statusFilter]);

  const visibleRuns = showAllRuns
    ? filteredRuns
    : filteredRuns.slice(0, DEFAULT_VISIBLE_RUNS);

  const hasMoreRuns = filteredRuns.length > DEFAULT_VISIBLE_RUNS;

  function toggleRun(runId: string) {
    setExpandedRunIds((prev) =>
      prev.includes(runId)
        ? prev.filter((id) => id !== runId)
        : [...prev, runId]
    );
  }

  return (
    <div className="mt-4">
      <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950 p-4 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-2">
          <label className="text-xs uppercase tracking-wide text-slate-500">
            Filter
          </label>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setShowAllRuns(false);
            }}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-500"
          >
            <option value="open">Open</option>
            <option value="all">All</option>
            <option value="proposed">Proposed</option>
            <option value="accepted">Accepted</option>
            <option value="watchlist">Watchlist</option>
            <option value="executed">Executed</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs uppercase tracking-wide text-slate-500">
            Sort Items
          </label>
          <select
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value);
              setShowAllRuns(false);
            }}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-500"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="priority">Priority</option>
            <option value="confidence">Confidence</option>
          </select>
        </div>
      </div>

      {visibleRuns.length > 0 ? (
        <>
          <div className="mt-4 space-y-4">
            {visibleRuns.map((run) => {
              const isExpanded = expandedRunIds.includes(run.id);

              return (
                <div
                  key={run.id}
                  className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950"
                >
                  <button
                    type="button"
                    onClick={() => toggleRun(run.id)}
                    className="w-full px-4 py-4 text-left transition hover:bg-slate-900/40"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-slate-800 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-300">
                            {formatRunType(run.run_type)}
                          </span>

                          <span
                            className={`rounded-full px-2.5 py-1 text-[11px] font-medium capitalize ${badgeClassForStatus(
                              run.status
                            )}`}
                          >
                            {run.status || "—"}
                          </span>
                        </div>

                        <h3 className="mt-3 text-lg font-semibold text-white">
                          {run.summary || "Recommendation Review"}
                        </h3>

                        <div className="mt-2 space-y-1 text-sm text-slate-400">
                          <p>Triggered By: {run.triggered_by || "—"}</p>
                          <p>
                            Model: {run.model_name || "—"}{" "}
                            {run.model_version || ""}
                          </p>
                          <p>Created: {new Date(run.created_at).toLocaleString()}</p>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <span className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300">
                          {run.items.length} item{run.items.length === 1 ? "" : "s"}
                        </span>

                        <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300">
                          {isExpanded ? "Collapse" : "Expand"}
                        </span>
                      </div>
                    </div>
                  </button>

                  {isExpanded ? (
                    <div className="border-t border-slate-800 px-4 pb-4 pt-4">
                      <div className="space-y-4">
                        {run.items.map((item) => (
                          <div
                            key={item.id}
                            className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-4"
                          >
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="rounded-full bg-slate-800 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-300">
                                    {formatActionType(item.action_type)}
                                  </span>

                                  <h4 className="text-base font-semibold text-white">
                                    {item.ticker || "No Ticker"}
                                  </h4>

                                  <span
                                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium capitalize ${badgeClassForStatus(
                                      item.recommendation_status
                                    )}`}
                                  >
                                    {item.recommendation_status || "—"}
                                  </span>
                                </div>

                                {item.company_name ? (
                                  <p className="mt-2 text-sm text-slate-400">
                                    {item.company_name}
                                  </p>
                                ) : null}
                              </div>

                              <div className="shrink-0 rounded-full bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200">
                                {item.conviction || "No Conviction"}
                              </div>
                            </div>

                            <div className="mt-4 grid gap-3 md:grid-cols-2">
                              <div className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-3">
                                <p className="text-[11px] uppercase tracking-wide text-slate-500">
                                  Thesis
                                </p>
                                <p className="mt-1 text-sm text-slate-200">
                                  {item.thesis || "—"}
                                </p>
                              </div>

                              <div className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-3">
                                <p className="text-[11px] uppercase tracking-wide text-slate-500">
                                  Rationale
                                </p>
                                <p className="mt-1 text-sm text-slate-200">
                                  {item.rationale || "—"}
                                </p>
                              </div>
                            </div>

                            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                              <div className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-3">
                                <p className="text-[11px] uppercase tracking-wide text-slate-500">
                                  Confidence
                                </p>
                                <p className="mt-1 text-sm font-semibold text-white">
                                  {formatNumber(item.confidence_score, 2)}
                                </p>
                              </div>

                              <div className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-3">
                                <p className="text-[11px] uppercase tracking-wide text-slate-500">
                                  Priority
                                </p>
                                <p className="mt-1 text-sm font-semibold text-white">
                                  {item.priority_rank ?? "—"}
                                </p>
                              </div>

                              <div className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-3">
                                <p className="text-[11px] uppercase tracking-wide text-slate-500">
                                  Time Horizon
                                </p>
                                <p className="mt-1 text-sm font-semibold text-white">
                                  {formatTimeHorizon(item.time_horizon)}
                                </p>
                              </div>

                              <div className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-3">
                                <p className="text-[11px] uppercase tracking-wide text-slate-500">
                                  Suggested Size %
                                </p>
                                <p className="mt-1 text-sm font-semibold text-white">
                                  {item.sizing_pct !== null &&
                                  item.sizing_pct !== undefined
                                    ? `${formatNumber(item.sizing_pct, 2)}%`
                                    : "—"}
                                </p>
                              </div>

                              <div className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-3">
                                <p className="text-[11px] uppercase tracking-wide text-slate-500">
                                  Suggested Dollars
                                </p>
                                <p className="mt-1 text-sm font-semibold text-white">
                                  {formatMoney(item.sizing_dollars)}
                                </p>
                              </div>

                              <div className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-3">
                                <p className="text-[11px] uppercase tracking-wide text-slate-500">
                                  Estimated Shares
                                </p>
                                <p className="mt-1 text-sm font-semibold text-white">
                                  {formatNumber(item.share_quantity, 6)}
                                </p>
                              </div>
                            </div>

                            <div className="mt-3 grid gap-3 md:grid-cols-3">
                              <div className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-3">
                                <p className="text-[11px] uppercase tracking-wide text-slate-500">
                                  Target 1
                                </p>
                                <p className="mt-1 text-sm font-semibold text-white">
                                  {formatMoney(item.target_price_1)}
                                </p>
                              </div>

                              <div className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-3">
                                <p className="text-[11px] uppercase tracking-wide text-slate-500">
                                  Target 2
                                </p>
                                <p className="mt-1 text-sm font-semibold text-white">
                                  {formatMoney(item.target_price_2)}
                                </p>
                              </div>

                              <div className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-3">
                                <p className="text-[11px] uppercase tracking-wide text-slate-500">
                                  Stop Price
                                </p>
                                <p className="mt-1 text-sm font-semibold text-white">
                                  {formatMoney(item.stop_price)}
                                </p>
                              </div>
                            </div>

                            <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950 px-3 py-3">
                              <p className="text-[11px] uppercase tracking-wide text-slate-500">
                                Risks
                              </p>
                              <p className="mt-1 text-sm text-slate-200">
                                {item.risks || "—"}
                              </p>
                            </div>

                            <div className="mt-4">
                              <RecommendationStatusButtons
                                portfolioId={portfolioId}
                                recommendationItemId={item.id}
                                currentStatus={item.recommendation_status}
                              />
                            </div>

                            <div className="mt-4 flex flex-col gap-1 border-t border-slate-800 pt-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                              <p>Status: {item.recommendation_status ?? "—"}</p>
                              <p>
                                Created {new Date(item.created_at).toLocaleString()}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {hasMoreRuns ? (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => setShowAllRuns((prev) => !prev)}
                className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-slate-800 hover:text-white"
              >
                {showAllRuns
                  ? "Show less"
                  : `Show more runs (${filteredRuns.length - DEFAULT_VISIBLE_RUNS} more)`}
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950 p-5">
          <p className="text-sm text-slate-400">
            No recommendation runs match the current filter.
          </p>
        </div>
      )}
    </div>
  );
}