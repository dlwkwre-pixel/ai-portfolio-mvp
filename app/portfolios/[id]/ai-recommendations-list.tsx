"use client";

import { useMemo, useState } from "react";
import RecommendationStatusButtons from "./recommendation-status-buttons";

type RecommendationItem = {
  id: string;
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

type AIRecommendationsListProps = {
  portfolioId: string;
  recommendations: RecommendationItem[];
};

const DEFAULT_VISIBLE_COUNT = 3;

function formatMoney(value: number | null) {
  if (value === null || value === undefined) return "—";
  return `$${Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatNumber(value: number | null, maxDigits = 2) {
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

export default function AIRecommendationsList({
  portfolioId,
  recommendations,
}: AIRecommendationsListProps) {
  const [statusFilter, setStatusFilter] = useState("open");
  const [sortBy, setSortBy] = useState("newest");
  const [showAll, setShowAll] = useState(false);

  const filteredAndSorted = useMemo(() => {
    let result = [...recommendations];

    if (statusFilter === "open") {
      result = result.filter((item) =>
        ["proposed", "accepted", "watchlist"].includes(
          item.recommendation_status || ""
        )
      );
    } else if (statusFilter !== "all") {
      result = result.filter(
        (item) => (item.recommendation_status || "") === statusFilter
      );
    }

    result.sort((a, b) => {
      if (sortBy === "oldest") {
        return (
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
      }

      if (sortBy === "priority") {
        const aPriority = a.priority_rank ?? 9999;
        const bPriority = b.priority_rank ?? 9999;
        return aPriority - bPriority;
      }

      if (sortBy === "confidence") {
        const aConfidence = a.confidence_score ?? -1;
        const bConfidence = b.confidence_score ?? -1;
        return bConfidence - aConfidence;
      }

      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return result;
  }, [recommendations, sortBy, statusFilter]);

  const visibleRecommendations = showAll
    ? filteredAndSorted
    : filteredAndSorted.slice(0, DEFAULT_VISIBLE_COUNT);

  const hasMoreThanDefault =
    filteredAndSorted.length > DEFAULT_VISIBLE_COUNT;

  return (
    <div className="mt-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-950 p-4 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-slate-400">Filter</label>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setShowAll(false);
            }}
            className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-white outline-none focus:border-blue-500"
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
          <label className="text-sm font-medium text-slate-400">Sort</label>
          <select
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value);
              setShowAll(false);
            }}
            className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-white outline-none focus:border-blue-500"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="priority">Priority</option>
            <option value="confidence">Confidence</option>
          </select>
        </div>
      </div>

      {visibleRecommendations.length > 0 ? (
        <>
          <div className="mt-5 space-y-5">
            {visibleRecommendations.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-slate-800 bg-slate-950 p-6"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-300">
                        {formatActionType(item.action_type)}
                      </span>
                      <h3 className="text-2xl font-semibold text-white">
                        {item.ticker || "No Ticker"}
                      </h3>
                      <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-medium capitalize text-slate-300">
                        {item.recommendation_status || "—"}
                      </span>
                    </div>

                    {item.company_name ? (
                      <p className="mt-3 text-slate-400">{item.company_name}</p>
                    ) : null}
                  </div>

                  <div className="rounded-full bg-slate-800 px-4 py-2 text-sm font-medium text-slate-200">
                    {item.conviction || "No Conviction"}
                  </div>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                    <p className="text-sm font-medium text-slate-400">Thesis</p>
                    <p className="mt-2 text-base text-slate-200">
                      {item.thesis || "—"}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                    <p className="text-sm font-medium text-slate-400">Rationale</p>
                    <p className="mt-2 text-base text-slate-200">
                      {item.rationale || "—"}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                    <p className="text-sm text-slate-400">Confidence</p>
                    <p className="mt-2 text-lg font-semibold text-white">
                      {formatNumber(item.confidence_score, 2)}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                    <p className="text-sm text-slate-400">Priority</p>
                    <p className="mt-2 text-lg font-semibold text-white">
                      {item.priority_rank ?? "—"}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                    <p className="text-sm text-slate-400">Time Horizon</p>
                    <p className="mt-2 text-lg font-semibold text-white">
                      {formatTimeHorizon(item.time_horizon)}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                    <p className="text-sm text-slate-400">Suggested Size %</p>
                    <p className="mt-2 text-lg font-semibold text-white">
                      {item.sizing_pct !== null && item.sizing_pct !== undefined
                        ? `${formatNumber(item.sizing_pct, 2)}%`
                        : "—"}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                    <p className="text-sm text-slate-400">Suggested Dollar Amount</p>
                    <p className="mt-2 text-lg font-semibold text-white">
                      {formatMoney(item.sizing_dollars)}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                    <p className="text-sm text-slate-400">Estimated Shares</p>
                    <p className="mt-2 text-lg font-semibold text-white">
                      {formatNumber(item.share_quantity, 6)}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                    <p className="text-sm text-slate-400">Target 1</p>
                    <p className="mt-2 text-lg font-semibold text-white">
                      {formatMoney(item.target_price_1)}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                    <p className="text-sm text-slate-400">Target 2</p>
                    <p className="mt-2 text-lg font-semibold text-white">
                      {formatMoney(item.target_price_2)}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                    <p className="text-sm text-slate-400">Stop Price</p>
                    <p className="mt-2 text-lg font-semibold text-white">
                      {formatMoney(item.stop_price)}
                    </p>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900 p-4">
                  <p className="text-sm font-medium text-slate-400">Risks</p>
                  <p className="mt-2 text-base text-slate-200">{item.risks || "—"}</p>
                </div>

                <RecommendationStatusButtons
                  portfolioId={portfolioId}
                  recommendationItemId={item.id}
                  currentStatus={item.recommendation_status}
                />

                <div className="mt-5 flex flex-col gap-2 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                  <p>Status: {item.recommendation_status ?? "—"}</p>
                  <p>Created {new Date(item.created_at).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>

          {hasMoreThanDefault ? (
            <div className="mt-5 flex justify-center">
              <button
                type="button"
                onClick={() => setShowAll((prev) => !prev)}
                className="rounded-2xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                {showAll
                  ? "Show less"
                  : `Show more (${filteredAndSorted.length - DEFAULT_VISIBLE_COUNT} more)`}
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950 p-6">
          <p className="text-slate-400">
            No recommendations match the current filter.
          </p>
        </div>
      )}
    </div>
  );
}