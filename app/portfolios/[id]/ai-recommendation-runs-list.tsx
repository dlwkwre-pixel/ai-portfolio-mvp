"use client";

import { useState, useMemo } from "react";
import RecommendationStatusButtons from "./recommendation-status-buttons";

type RecommendationItem = {
  id: string;
  ticker: string | null;
  company_name: string | null;
  action_type: string | null;
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

function formatMoney(value: number | null) {
  if (value === null || value === undefined) return null;
  return `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatNumber(value: number | null, maxDigits = 2) {
  if (value === null || value === undefined) return null;
  return Number(value).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: maxDigits });
}

function formatTimeHorizon(value: string | null) {
  if (!value) return null;
  const map: Record<string, string> = { short_term: "Short-term", medium_term: "Medium-term", long_term: "Long-term" };
  return map[value] ?? value;
}

function actionStyle(action: string | null) {
  const a = (action || "").toLowerCase();
  if (a === "buy" || a === "add") return { bg: "bg-emerald-500/15 border-emerald-500/25 text-emerald-300", dot: "bg-emerald-400" };
  if (a === "sell") return { bg: "bg-red-500/15 border-red-500/25 text-red-300", dot: "bg-red-400" };
  if (a === "trim") return { bg: "bg-amber-500/15 border-amber-500/25 text-amber-300", dot: "bg-amber-400" };
  if (a === "hold") return { bg: "bg-slate-500/15 border-slate-500/25 text-slate-300", dot: "bg-slate-400" };
  if (a === "rebalance") return { bg: "bg-blue-500/15 border-blue-500/25 text-blue-300", dot: "bg-blue-400" };
  if (a === "raise_cash") return { bg: "bg-purple-500/15 border-purple-500/25 text-purple-300", dot: "bg-purple-400" };
  return { bg: "bg-white/5 border-white/10 text-slate-300", dot: "bg-slate-500" };
}

function convictionColor(conviction: string | null) {
  const c = (conviction || "").toLowerCase();
  if (c === "very high") return "text-emerald-400";
  if (c === "high") return "text-blue-400";
  if (c === "moderate") return "text-amber-400";
  return "text-slate-400";
}

function statusStyle(status: string | null) {
  const s = (status || "").toLowerCase();
  if (s === "accepted" || s === "executed") return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
  if (s === "rejected") return "border-red-500/20 bg-red-500/10 text-red-300";
  if (s === "watchlist") return "border-amber-500/20 bg-amber-500/10 text-amber-300";
  return "border-white/10 bg-white/5 text-slate-400";
}

export default function AIRecommendationsList({ portfolioId, recommendations }: AIRecommendationsListProps) {
  const [statusFilter, setStatusFilter] = useState("open");
  const [sortBy, setSortBy] = useState("priority");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filteredAndSorted = useMemo(() => {
    let result = [...recommendations];

    if (statusFilter === "open") {
      result = result.filter((item) => ["proposed", "watchlist"].includes(item.recommendation_status || ""));
    } else if (statusFilter !== "all") {
      result = result.filter((item) => (item.recommendation_status || "") === statusFilter);
    }

    result.sort((a, b) => {
      if (sortBy === "oldest") return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sortBy === "priority") return (a.priority_rank ?? 9999) - (b.priority_rank ?? 9999);
      if (sortBy === "confidence") return (b.confidence_score ?? -1) - (a.confidence_score ?? -1);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return result;
  }, [recommendations, sortBy, statusFilter]);

  // Group by action type for summary
  const actionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredAndSorted.forEach((item) => {
      const a = (item.action_type || "other").toLowerCase();
      counts[a] = (counts[a] || 0) + 1;
    });
    return counts;
  }, [filteredAndSorted]);

  return (
    <div className="mt-4 space-y-4">
      {/* Filter + sort bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-xl border border-white/8 bg-white/3 p-1">
          {["open", "all", "proposed", "watchlist", "executed", "rejected"].map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setStatusFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition ${
                statusFilter === f ? "bg-white/10 text-white" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="rounded-xl border border-white/8 bg-[#040d1a] px-3 py-1.5 text-xs text-slate-300 outline-none"
        >
          <option value="priority">Sort: Priority</option>
          <option value="confidence">Sort: Confidence</option>
          <option value="newest">Sort: Newest</option>
          <option value="oldest">Sort: Oldest</option>
        </select>

        <span className="ml-auto text-xs text-slate-600">{filteredAndSorted.length} recommendations</span>
      </div>

      {/* Action type summary pills */}
      {filteredAndSorted.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(actionCounts).map(([action, count]) => {
            const style = actionStyle(action);
            return (
              <span key={action} className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${style.bg}`}>
                {action.replace("_", " ")} · {count}
              </span>
            );
          })}
        </div>
      )}

      {/* Recommendations */}
      {filteredAndSorted.length > 0 ? (
        <div className="bt-list-animate space-y-2">
          {filteredAndSorted.map((item) => {
            const style = actionStyle(item.action_type);
            const isExpanded = expandedId === item.id;

            return (
              <div key={item.id} className="bt-rec-card bt-lift rounded-2xl border border-white/6 bg-white/2 overflow-hidden transition hover:bg-white/3">
                {/* Row header — always visible, clickable to expand */}
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : item.id)}
                  className="w-full px-4 py-3.5 text-left"
                >
                  <div className="flex flex-wrap items-center gap-2.5">
                    {/* Action badge */}
                    <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${style.bg}`}>
                      {(item.action_type || "—").replace("_", " ")}
                    </span>

                    {/* Ticker + company */}
                    <span className="text-base font-bold text-white">{item.ticker || "—"}</span>
                    {item.company_name && (
                      <span className="hidden text-sm text-slate-500 sm:inline">{item.company_name}</span>
                    )}

                    {/* Thesis preview */}
                    {item.thesis && !isExpanded && (
                      <span className="hidden flex-1 truncate text-sm text-slate-400 lg:inline">
                        — {item.thesis}
                      </span>
                    )}

                    <div className="ml-auto flex items-center gap-2">
                      {/* Conviction */}
                      {item.conviction && (
                        <span className={`hidden text-xs font-semibold sm:inline ${convictionColor(item.conviction)}`}>
                          {item.conviction}
                        </span>
                      )}

                      {/* Status */}
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] capitalize ${statusStyle(item.recommendation_status)}`}>
                        {item.recommendation_status || "proposed"}
                      </span>

                      {/* Confidence score */}
                      {item.confidence_score !== null && (
                        <span className="hidden text-xs text-slate-600 sm:inline">
                          {item.confidence_score}%
                        </span>
                      )}

                      {/* Expand chevron */}
                      <svg
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className={`h-4 w-4 shrink-0 text-slate-600 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      >
                        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </div>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-white/5 px-4 pb-4 pt-3">
                    {/* Thesis + Rationale */}
                    <div className="grid gap-3 sm:grid-cols-2">
                      {item.thesis && (
                        <div className="rounded-xl border border-white/5 bg-white/2 p-3">
                          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-blue-400">Thesis</p>
                          <p className="text-sm leading-6 text-slate-200">{item.thesis}</p>
                        </div>
                      )}
                      {item.rationale && (
                        <div className="rounded-xl border border-white/5 bg-white/2 p-3">
                          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500">Rationale</p>
                          <p className="text-sm leading-6 text-slate-300">{item.rationale}</p>
                        </div>
                      )}
                    </div>

                    {/* Risks */}
                    {item.risks && (
                      <div className="mt-3 rounded-xl border border-amber-500/10 bg-amber-500/5 p-3">
                        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-amber-400">Risks</p>
                        <p className="text-sm leading-6 text-slate-300">{item.risks}</p>
                      </div>
                    )}

                    {/* Metrics grid */}
                    <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                      {[
                        { label: "Confidence", value: item.confidence_score !== null ? `${item.confidence_score}` : null },
                        { label: "Priority", value: item.priority_rank !== null ? `#${item.priority_rank}` : null },
                        { label: "Horizon", value: formatTimeHorizon(item.time_horizon) },
                        { label: "Size %", value: item.sizing_pct !== null ? `${formatNumber(item.sizing_pct)}%` : null },
                        { label: "Size $", value: formatMoney(item.sizing_dollars) },
                        { label: "Shares", value: item.share_quantity !== null ? formatNumber(item.share_quantity, 4) : null },
                      ].map((m) => m.value ? (
                        <div key={m.label} className="rounded-xl border border-white/5 bg-white/2 px-2 py-2 text-center">
                          <p className="text-[9px] uppercase tracking-widest text-slate-600">{m.label}</p>
                          <p className="mt-0.5 text-sm font-semibold text-white">{m.value}</p>
                        </div>
                      ) : null)}
                    </div>

                    {/* Price targets */}
                    {(item.target_price_1 || item.target_price_2 || item.stop_price) && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {item.target_price_1 && (
                          <div className="rounded-xl border border-emerald-500/10 bg-emerald-500/5 px-3 py-2">
                            <p className="text-[9px] uppercase tracking-widest text-emerald-400">Target 1</p>
                            <p className="text-sm font-semibold text-white">{formatMoney(item.target_price_1)}</p>
                          </div>
                        )}
                        {item.target_price_2 && (
                          <div className="rounded-xl border border-emerald-500/10 bg-emerald-500/5 px-3 py-2">
                            <p className="text-[9px] uppercase tracking-widest text-emerald-400">Target 2</p>
                            <p className="text-sm font-semibold text-white">{formatMoney(item.target_price_2)}</p>
                          </div>
                        )}
                        {item.stop_price && (
                          <div className="rounded-xl border border-red-500/10 bg-red-500/5 px-3 py-2">
                            <p className="text-[9px] uppercase tracking-widest text-red-400">Stop</p>
                            <p className="text-sm font-semibold text-white">{formatMoney(item.stop_price)}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Status buttons */}
                    <div className="mt-3">
                      <RecommendationStatusButtons
                        portfolioId={portfolioId}
                        recommendationItemId={item.id}
                        currentStatus={item.recommendation_status}
                      />
                    </div>

                    <p className="mt-2 text-xs text-slate-700">
                      {new Date(item.created_at).toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-white/5 bg-white/2 p-5">
          <p className="text-sm text-slate-500">No recommendations match the current filter.</p>
        </div>
      )}
    </div>
  );
}
