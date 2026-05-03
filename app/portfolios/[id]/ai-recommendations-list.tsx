"use client";

import { useMemo, useState } from "react";
import RecommendationStatusButtons from "./recommendation-status-buttons";

type RedditPulse = {
  ticker: string; post_count: number; bullish_pct: number; bearish_pct: number;
  neutral_pct: number; sentiment_score: number; hype_score: number;
  conviction_score: number; reddit_pulse_score: number; sentiment_label: string;
  top_bullish_themes: string[]; top_bearish_themes: string[];
  top_risks: string[]; top_catalysts: string[];
  subreddit_breakdown: { subreddit: string; post_count: number; sentiment: string; sentiment_label: string }[];
  source_post_links: { subreddit: string; title: string; score: number; comment_count: number; created_utc: number; permalink: string }[];
  summary: string; ai_powered: boolean; stale?: boolean;
  fetched_at: string; status?: string; message?: string;
};

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

  // Reddit Pulse — keyed by ticker, loaded on demand
  const [pulseMap, setPulseMap] = useState<Record<string, RedditPulse>>({});
  const [pulseLoading, setPulseLoading] = useState<Set<string>>(new Set());
  const [pulseError, setPulseError] = useState<Record<string, string>>({});

  function loadPulse(ticker: string, companyName: string | null) {
    if (!ticker || pulseMap[ticker] || pulseLoading.has(ticker)) return;
    setPulseLoading((prev) => new Set(prev).add(ticker));
    setPulseError((prev) => { const n = { ...prev }; delete n[ticker]; return n; });
    const company = encodeURIComponent(companyName ?? ticker);
    fetch(`/api/social-pulse/${ticker}?company=${company}`)
      .then((r) => r.json())
      .then((d: RedditPulse) => {
        if (d.status === "unavailable" || d.status === "no_credentials" || d.status === "disabled" || (d as any).error) {
          setPulseError((prev) => ({ ...prev, [ticker]: d.message ?? (d as any).error ?? "Reddit Pulse unavailable." }));
        } else {
          setPulseMap((prev) => ({ ...prev, [ticker]: d }));
        }
      })
      .catch(() => setPulseError((prev) => ({ ...prev, [ticker]: "Failed to load Reddit Pulse." })))
      .finally(() => setPulseLoading((prev) => { const n = new Set(prev); n.delete(ticker); return n; }));
  }

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

                {/* Reddit Social Pulse — loaded on demand per ticker */}
                {item.ticker && (
                  <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-sm font-medium text-slate-400">Reddit Pulse</p>
                      {!pulseMap[item.ticker] && !pulseLoading.has(item.ticker) && (
                        <button
                          type="button"
                          onClick={() => loadPulse(item.ticker!, item.company_name)}
                          className="rounded-lg border border-slate-700 px-3 py-1 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
                        >
                          Load
                        </button>
                      )}
                    </div>
                    {pulseLoading.has(item.ticker) && (
                      <p className="text-sm text-slate-500">Fetching Reddit discussion for {item.ticker}…</p>
                    )}
                    {pulseError[item.ticker] && !pulseLoading.has(item.ticker) && (
                      <div className="flex items-center justify-between gap-4">
                        <p className="text-sm text-slate-500">{pulseError[item.ticker]}</p>
                        <button type="button" onClick={() => { setPulseError(p => { const n={...p}; delete n[item.ticker!]; return n; }); loadPulse(item.ticker!, item.company_name); }}
                          className="text-xs text-slate-400 hover:text-white">Retry</button>
                      </div>
                    )}
                    {pulseMap[item.ticker] && !pulseLoading.has(item.ticker) && (() => {
                      const sp = pulseMap[item.ticker!]!;
                      const scoreColor = sp.sentiment_score >= 15 ? "text-emerald-400" : sp.sentiment_score <= -15 ? "text-red-400" : "text-slate-200";
                      return (
                        <div>
                          {sp.stale && (
                            <p className="mb-2 text-xs text-amber-400">Using cached data — Reddit currently unavailable</p>
                          )}
                          {/* Score row */}
                          <div className="mb-3 flex items-center gap-4">
                            <div>
                              <span className={`text-2xl font-bold tabular-nums ${scoreColor}`}>{sp.reddit_pulse_score}</span>
                              <span className="ml-0.5 text-xs text-slate-500">/100</span>
                              <p className="text-xs text-slate-500">Reddit Pulse</p>
                            </div>
                            <div className="flex-1">
                              <p className={`text-sm font-semibold ${scoreColor}`}>{sp.sentiment_label}</p>
                              <p className="text-xs text-slate-500">{sp.post_count} posts · {sp.ai_powered ? "AI analyzed" : "Keyword analysis"}</p>
                            </div>
                          </div>
                          {/* Sentiment bar */}
                          <div className="mb-3">
                            <div className="mb-1 flex h-1.5 gap-0.5 overflow-hidden rounded-full">
                              <div className="bg-emerald-500" style={{ width: `${sp.bullish_pct}%` }} />
                              <div className="bg-slate-700" style={{ width: `${sp.neutral_pct}%` }} />
                              <div className="bg-red-500" style={{ width: `${sp.bearish_pct}%` }} />
                            </div>
                            <div className="flex gap-3 text-xs">
                              <span className="text-emerald-400">Bull {sp.bullish_pct}%</span>
                              <span className="text-slate-500">Neutral {sp.neutral_pct}%</span>
                              <span className="text-red-400">Bear {sp.bearish_pct}%</span>
                            </div>
                          </div>
                          {/* Conviction + Hype */}
                          <div className="mb-3 grid grid-cols-2 gap-2">
                            <div className="rounded-xl border border-slate-700 p-2">
                              <p className="text-xs text-slate-500">Conviction</p>
                              <p className={`text-base font-semibold tabular-nums ${sp.conviction_score >= 60 ? "text-emerald-400" : sp.conviction_score >= 35 ? "text-amber-400" : "text-slate-300"}`}>
                                {sp.conviction_score}<span className="text-xs text-slate-500">/100</span>
                              </p>
                            </div>
                            <div className="rounded-xl border border-slate-700 p-2">
                              <p className="text-xs text-slate-500">Hype Risk</p>
                              <p className={`text-base font-semibold tabular-nums ${sp.hype_score >= 65 ? "text-red-400" : sp.hype_score >= 40 ? "text-amber-400" : "text-slate-300"}`}>
                                {sp.hype_score}<span className="text-xs text-slate-500">/100</span>
                              </p>
                            </div>
                          </div>
                          {/* Summary */}
                          {sp.summary && <p className="mb-3 text-sm text-slate-400">{sp.summary}</p>}
                          {/* Themes */}
                          {(sp.top_bullish_themes.length > 0 || sp.top_bearish_themes.length > 0) && (
                            <div className="mb-3 grid grid-cols-2 gap-2">
                              {sp.top_bullish_themes.length > 0 && (
                                <div>
                                  <p className="mb-1 text-xs font-medium text-emerald-400">Bullish Themes</p>
                                  {sp.top_bullish_themes.slice(0, 3).map((t, i) => <p key={i} className="text-xs text-slate-400">· {t}</p>)}
                                </div>
                              )}
                              {sp.top_bearish_themes.length > 0 && (
                                <div>
                                  <p className="mb-1 text-xs font-medium text-red-400">Bearish Themes</p>
                                  {sp.top_bearish_themes.slice(0, 3).map((t, i) => <p key={i} className="text-xs text-slate-400">· {t}</p>)}
                                </div>
                              )}
                            </div>
                          )}
                          {/* Subreddit breakdown */}
                          {sp.subreddit_breakdown.length > 0 && (
                            <div className="mb-3">
                              <p className="mb-1 text-xs text-slate-500 uppercase tracking-wider">By Subreddit</p>
                              {sp.subreddit_breakdown.map((sub) => (
                                <div key={sub.subreddit} className="flex items-center justify-between border-b border-slate-800 py-1 last:border-0">
                                  <span className="text-xs text-slate-400">r/{sub.subreddit}</span>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-slate-600">{sub.post_count}p</span>
                                    <span className={`text-xs font-medium ${sub.sentiment === "bullish" ? "text-emerald-400" : sub.sentiment === "bearish" ? "text-red-400" : sub.sentiment === "mixed" ? "text-amber-400" : "text-slate-400"}`}>{sub.sentiment_label}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          {/* Source links */}
                          {sp.source_post_links.length > 0 && (
                            <div>
                              <p className="mb-1 text-xs text-slate-500 uppercase tracking-wider">Top Posts</p>
                              {sp.source_post_links.slice(0, 3).map((link, i) => (
                                <a key={i} href={link.permalink} target="_blank" rel="noopener noreferrer"
                                  className="block border-b border-slate-800 py-1.5 last:border-0 hover:opacity-75">
                                  <p className="line-clamp-1 text-xs text-slate-300">{link.title}</p>
                                  <p className="text-xs text-slate-600">r/{link.subreddit} · ↑{link.score}</p>
                                </a>
                              ))}
                            </div>
                          )}
                          <p className="mt-2 text-xs text-slate-600">
                            Updated {new Date(sp.fetched_at).toLocaleDateString()}
                          </p>
                        </div>
                      );
                    })()}
                  </div>
                )}

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