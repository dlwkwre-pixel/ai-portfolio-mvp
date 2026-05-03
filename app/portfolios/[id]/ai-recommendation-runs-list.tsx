"use client";

import { useState, useMemo, useEffect } from "react";
import { updateRecommendationStatus, deleteRecommendationItem } from "./recommendation-actions";

// ── Types ─────────────────────────────────────────────────────────────────────

type RedditPulse = {
  source?: "reddit" | "apewisdom";
  ticker: string; fetched_at: string; stale?: boolean;
  post_count: number; bullish_pct: number; bearish_pct: number;
  neutral_pct: number; sentiment_score: number; hype_score: number;
  conviction_score: number; reddit_pulse_score: number; sentiment_label: string;
  top_bullish_themes: string[]; top_bearish_themes: string[];
  subreddit_breakdown: { subreddit: string; post_count: number; sentiment: string; sentiment_label: string }[];
  source_post_links: { subreddit: string; title: string; score: number; comment_count: number; created_utc: number; permalink: string }[];
  summary: string; ai_powered: boolean;
  mentions?: number; mention_change_pct?: number; upvotes?: number;
  rank?: number; rank_change?: number; reddit_trend_score?: number;
  status?: string; message?: string;
};

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

type LocalRec = RecommendationItem & { _syncing?: boolean };

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;
const HOLD_LIKE = new Set(["hold", "rebalance", "raise_cash"]);
const STATUS_TABS = ["open", "all", "proposed", "watchlist", "executed", "rejected", "archived"] as const;

function matchesTab(tab: string, status: string | null): boolean {
  const s = (status ?? "proposed").toLowerCase();
  switch (tab) {
    case "open":      return s === "proposed" || s === "watchlist";
    case "proposed":  return s === "proposed";
    case "watchlist": return s === "watchlist";
    case "executed":  return s === "executed" || s === "acknowledged";
    case "rejected":  return s === "rejected";
    case "archived":  return s === "archived";
    default:          return true; // "all"
  }
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmt$(v: number | null) {
  if (v == null) return null;
  return "$" + Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtN(v: number | null, max = 2) {
  if (v == null) return null;
  return Number(v).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: max });
}

function fmtHorizon(v: string | null) {
  if (!v) return null;
  const m: Record<string, string> = { short_term: "Short", medium_term: "Medium", long_term: "Long" };
  return m[v] ?? v;
}

// ── Style helpers ─────────────────────────────────────────────────────────────

function actionStyle(action: string | null) {
  const a = (action ?? "").toLowerCase();
  if (a === "buy" || a === "add")  return "bg-emerald-500/15 border-emerald-500/25 text-emerald-300";
  if (a === "sell")                return "bg-red-500/15 border-red-500/25 text-red-300";
  if (a === "trim")                return "bg-amber-500/15 border-amber-500/25 text-amber-300";
  if (a === "hold")                return "bg-slate-500/15 border-slate-500/25 text-slate-300";
  if (a === "rebalance")           return "bg-blue-500/15 border-blue-500/25 text-blue-300";
  if (a === "raise_cash")          return "bg-purple-500/15 border-purple-500/25 text-purple-300";
  return "bg-white/5 border-white/10 text-slate-300";
}

function convictionColor(v: string | null) {
  const c = (v ?? "").toLowerCase();
  if (c === "very high") return "text-emerald-400";
  if (c === "high")      return "text-blue-400";
  if (c === "moderate")  return "text-amber-400";
  return "text-slate-400";
}

function statusBadgeStyle(s: string | null) {
  const v = (s ?? "").toLowerCase();
  if (v === "executed" || v === "acknowledged") return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
  if (v === "rejected")                         return "border-red-500/20 bg-red-500/10 text-red-300";
  if (v === "watchlist")                        return "border-amber-500/20 bg-amber-500/10 text-amber-300";
  if (v === "archived")                         return "border-slate-500/20 bg-slate-500/10 text-slate-400";
  return "border-white/10 bg-white/5 text-slate-400";
}

function statusLabel(s: string | null) {
  const v = (s ?? "proposed").toLowerCase();
  const labels: Record<string, string> = {
    proposed: "Proposed", watchlist: "Watchlist", executed: "Executed",
    rejected: "Rejected", archived: "Archived", acknowledged: "Acknowledged",
  };
  return labels[v] ?? (s ?? "Proposed");
}

// ── Quick action config ───────────────────────────────────────────────────────

type QuickAction = {
  value: string;
  inactiveLabel: string;
  activeLabel: string;
  activeStyle: string;
  hoverStyle: string;
};

function getQuickActions(actionType: string | null): QuickAction[] {
  const isHold = HOLD_LIKE.has((actionType ?? "").toLowerCase());
  if (isHold) {
    return [
      { value: "acknowledged", inactiveLabel: "Acknowledge", activeLabel: "Acknowledged",
        activeStyle: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
        hoverStyle: "border-white/10 bg-white/3 text-slate-400 hover:border-emerald-500/20 hover:text-emerald-400" },
      { value: "watchlist", inactiveLabel: "Watch", activeLabel: "Watchlisted",
        activeStyle: "border-amber-500/30 bg-amber-500/10 text-amber-300",
        hoverStyle: "border-white/10 bg-white/3 text-slate-400 hover:border-amber-500/20 hover:text-amber-400" },
      { value: "rejected", inactiveLabel: "Reject", activeLabel: "Rejected",
        activeStyle: "border-red-500/30 bg-red-500/10 text-red-300",
        hoverStyle: "border-white/10 bg-white/3 text-slate-400 hover:border-red-500/20 hover:text-red-400" },
    ];
  }
  return [
    { value: "executed", inactiveLabel: "Execute", activeLabel: "Executed",
      activeStyle: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
      hoverStyle: "border-white/10 bg-white/3 text-slate-400 hover:border-emerald-500/20 hover:text-emerald-400" },
    { value: "watchlist", inactiveLabel: "Watch", activeLabel: "Watchlisted",
      activeStyle: "border-amber-500/30 bg-amber-500/10 text-amber-300",
      hoverStyle: "border-white/10 bg-white/3 text-slate-400 hover:border-amber-500/20 hover:text-amber-400" },
    { value: "rejected", inactiveLabel: "Reject", activeLabel: "Rejected",
      activeStyle: "border-red-500/30 bg-red-500/10 text-red-300",
      hoverStyle: "border-white/10 bg-white/3 text-slate-400 hover:border-red-500/20 hover:text-red-400" },
  ];
}

// ── Reddit Pulse panels ───────────────────────────────────────────────────────

function ApeWisdomPanel({ sp }: { sp: RedditPulse }) {
  const ts = sp.reddit_trend_score ?? 0;
  const tc = ts >= 70 ? "text-emerald-400" : ts >= 45 ? "text-amber-400" : "text-slate-300";
  const cc = (sp.mention_change_pct ?? 0) >= 0 ? "text-emerald-400" : "text-red-400";
  return (
    <div>
      <p className="mb-2 text-xs text-amber-400">Reddit Trend via ApeWisdom — full sentiment requires Reddit API approval</p>
      <div className="mb-2 flex items-center gap-4">
        <div>
          <span className={`text-xl font-bold tabular-nums ${tc}`}>{ts}</span>
          <span className="text-xs text-slate-500">/100</span>
          <p className="text-[10px] text-slate-500">Trend Score</p>
        </div>
        <div className="flex-1">
          {sp.rank != null && (
            <p className="text-sm font-semibold text-slate-200">
              #{sp.rank} most mentioned on Reddit this week
              {sp.rank_change != null && sp.rank_change !== 0 && (
                <span className={`ml-1.5 text-xs ${sp.rank_change > 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {sp.rank_change > 0 ? `▲${sp.rank_change}` : `▼${Math.abs(sp.rank_change)}`} since yesterday
                </span>
              )}
            </p>
          )}
          <p className="text-xs text-slate-500">{sp.mentions ?? 0} mentions · {sp.upvotes ?? 0} upvotes</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-white/5 bg-white/2 p-2">
          <p className="text-[9px] uppercase tracking-widest text-slate-500">Mentions (7d)</p>
          <p className="text-sm font-semibold tabular-nums text-slate-200">{sp.mentions ?? 0}</p>
        </div>
        <div className="rounded-lg border border-white/5 bg-white/2 p-2">
          <p className="text-[9px] uppercase tracking-widest text-slate-500">24h Change</p>
          <p className={`text-sm font-semibold tabular-nums ${cc}`}>
            {(sp.mention_change_pct ?? 0) >= 0 ? "+" : ""}{sp.mention_change_pct ?? 0}%
          </p>
        </div>
      </div>
      <p className="mt-2 text-[10px] text-slate-600">Data from ApeWisdom · Cached 30 min</p>
    </div>
  );
}

function RedditPulsePanel({ sp }: { sp: RedditPulse }) {
  const sc = sp.sentiment_score >= 15 ? "text-emerald-400" : sp.sentiment_score <= -15 ? "text-red-400" : "text-slate-200";
  return (
    <div>
      {sp.stale && <p className="mb-2 text-xs text-amber-400">Using cached data — Reddit currently unavailable</p>}
      <div className="mb-2 flex items-center gap-4">
        <div>
          <span className={`text-xl font-bold tabular-nums ${sc}`}>{sp.reddit_pulse_score}</span>
          <span className="text-xs text-slate-500">/100</span>
          <p className="text-[10px] text-slate-500">Reddit Pulse</p>
        </div>
        <div className="flex-1">
          <p className={`text-sm font-semibold ${sc}`}>{sp.sentiment_label}</p>
          <p className="text-xs text-slate-500">{sp.post_count} posts · {sp.ai_powered ? "AI analyzed" : "Keyword analysis"}</p>
        </div>
      </div>
      <div className="mb-2 flex h-1.5 gap-0.5 overflow-hidden rounded-full">
        <div className="bg-emerald-500" style={{ width: `${sp.bullish_pct}%` }} />
        <div className="bg-slate-700" style={{ width: `${sp.neutral_pct}%` }} />
        <div className="bg-red-500" style={{ width: `${sp.bearish_pct}%` }} />
      </div>
      <div className="mb-2 flex gap-3 text-xs">
        <span className="text-emerald-400">Bull {sp.bullish_pct}%</span>
        <span className="text-slate-500">Neutral {sp.neutral_pct}%</span>
        <span className="text-red-400">Bear {sp.bearish_pct}%</span>
      </div>
      <div className="mb-2 grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-white/5 bg-white/2 p-2">
          <p className="text-[9px] uppercase tracking-widest text-slate-500">Conviction</p>
          <p className={`text-sm font-semibold tabular-nums ${sp.conviction_score >= 60 ? "text-emerald-400" : sp.conviction_score >= 35 ? "text-amber-400" : "text-slate-300"}`}>
            {sp.conviction_score}<span className="text-xs text-slate-500">/100</span>
          </p>
        </div>
        <div className="rounded-lg border border-white/5 bg-white/2 p-2">
          <p className="text-[9px] uppercase tracking-widest text-slate-500">Hype Risk</p>
          <p className={`text-sm font-semibold tabular-nums ${sp.hype_score >= 65 ? "text-red-400" : sp.hype_score >= 40 ? "text-amber-400" : "text-slate-300"}`}>
            {sp.hype_score}<span className="text-xs text-slate-500">/100</span>
          </p>
        </div>
      </div>
      {sp.summary && <p className="mb-2 text-xs text-slate-400">{sp.summary}</p>}
      <p className="text-[10px] text-slate-600">Updated {new Date(sp.fetched_at).toLocaleDateString()}</p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type Props = {
  portfolioId: string;
  recommendations: RecommendationItem[];
};

export default function AIRecommendationRunsList({ portfolioId, recommendations }: Props) {
  const [localRecs, setLocalRecs]           = useState<LocalRec[]>(recommendations);
  const [statusFilter, setStatusFilter]     = useState("open");
  const [sortBy, setSortBy]                 = useState("priority");
  const [expandedId, setExpandedId]         = useState<string | null>(null);
  const [visibleCount, setVisibleCount]     = useState(PAGE_SIZE);
  const [openMoreId, setOpenMoreId]         = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [pulseMap, setPulseMap]             = useState<Record<string, RedditPulse>>({});
  const [pulseLoading, setPulseLoading]     = useState<Set<string>>(new Set());
  const [pulseError, setPulseError]         = useState<Record<string, string>>({});
  const [pendingIds, setPendingIds]         = useState<Set<string>>(new Set());
  const [actionErrors, setActionErrors]     = useState<Record<string, string>>({});

  // Sync with server re-renders (e.g. after a new AI run)
  useEffect(() => { setLocalRecs(recommendations); }, [recommendations]);
  // Reset pagination when filter changes
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [statusFilter]);

  // ── Optimistic status update ─────────────────────────────────────────────

  async function handleAction(itemId: string, newStatus: string) {
    if (pendingIds.has(itemId)) return;
    const item = localRecs.find(r => r.id === itemId);
    if (!item) return;
    const oldStatus = item.recommendation_status;

    setPendingIds(prev => new Set(prev).add(itemId));
    setLocalRecs(prev => prev.map(r => r.id === itemId ? { ...r, recommendation_status: newStatus, _syncing: true } : r));
    setActionErrors(prev => { const n = { ...prev }; delete n[itemId]; return n; });
    setOpenMoreId(null);

    try {
      const fd = new FormData();
      fd.append("portfolio_id", portfolioId);
      fd.append("recommendation_item_id", itemId);
      fd.append("new_status", newStatus);
      await updateRecommendationStatus(fd);
      setLocalRecs(prev => prev.map(r => r.id === itemId ? { ...r, _syncing: false } : r));
    } catch (err) {
      setLocalRecs(prev => prev.map(r => r.id === itemId ? { ...r, recommendation_status: oldStatus, _syncing: false } : r));
      setActionErrors(prev => ({ ...prev, [itemId]: err instanceof Error ? err.message : "Action failed." }));
    } finally {
      setPendingIds(prev => { const n = new Set(prev); n.delete(itemId); return n; });
    }
  }

  // ── Optimistic delete ────────────────────────────────────────────────────

  async function handleDelete(itemId: string) {
    if (pendingIds.has(itemId)) return;
    const snapshot = [...localRecs];
    setPendingIds(prev => new Set(prev).add(itemId));
    setLocalRecs(prev => prev.filter(r => r.id !== itemId));
    setDeleteConfirmId(null);
    setOpenMoreId(null);
    if (expandedId === itemId) setExpandedId(null);

    try {
      const fd = new FormData();
      fd.append("portfolio_id", portfolioId);
      fd.append("recommendation_item_id", itemId);
      await deleteRecommendationItem(fd);
    } catch (err) {
      setLocalRecs(snapshot);
      setActionErrors(prev => ({ ...prev, [itemId]: err instanceof Error ? err.message : "Delete failed." }));
    } finally {
      setPendingIds(prev => { const n = new Set(prev); n.delete(itemId); return n; });
    }
  }

  // ── Reddit Pulse loader ──────────────────────────────────────────────────

  function loadPulse(ticker: string, companyName: string | null) {
    if (!ticker || pulseMap[ticker] || pulseLoading.has(ticker)) return;
    setPulseLoading(prev => new Set(prev).add(ticker));
    setPulseError(prev => { const n = { ...prev }; delete n[ticker]; return n; });
    fetch(`/api/social-pulse/${ticker}?company=${encodeURIComponent(companyName ?? ticker)}`)
      .then(r => r.json())
      .then((d: RedditPulse) => {
        if (d.status === "unavailable" || d.status === "disabled" || (d as { error?: string }).error) {
          setPulseError(prev => ({ ...prev, [ticker]: d.message ?? "Unavailable." }));
        } else {
          setPulseMap(prev => ({ ...prev, [ticker]: d }));
        }
      })
      .catch(() => setPulseError(prev => ({ ...prev, [ticker]: "Failed to load." })))
      .finally(() => setPulseLoading(prev => { const n = new Set(prev); n.delete(ticker); return n; }));
  }

  // ── Derived lists ────────────────────────────────────────────────────────

  const filteredAndSorted = useMemo(() => {
    const result = localRecs.filter(r => matchesTab(statusFilter, r.recommendation_status));
    result.sort((a, b) => {
      if (sortBy === "oldest")     return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sortBy === "priority")   return (a.priority_rank ?? 9999) - (b.priority_rank ?? 9999);
      if (sortBy === "confidence") return (b.confidence_score ?? -1) - (a.confidence_score ?? -1);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return result;
  }, [localRecs, statusFilter, sortBy]);

  const visibleItems = filteredAndSorted.slice(0, visibleCount);
  const hasMore = filteredAndSorted.length > visibleCount;

  const actionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredAndSorted.forEach(item => {
      const a = (item.action_type ?? "other").toLowerCase();
      counts[a] = (counts[a] ?? 0) + 1;
    });
    return counts;
  }, [filteredAndSorted]);

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    STATUS_TABS.forEach(tab => {
      counts[tab] = localRecs.filter(r => matchesTab(tab, r.recommendation_status)).length;
    });
    return counts;
  }, [localRecs]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="mt-4 space-y-4">

      {/* Filter + sort bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1 rounded-xl border border-white/8 bg-white/3 p-1">
          {STATUS_TABS.map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => setStatusFilter(tab)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-medium capitalize transition ${
                statusFilter === tab ? "bg-white/10 text-white" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {tab}
              {tabCounts[tab] > 0 && (
                <span className={`ml-1 text-[10px] ${statusFilter === tab ? "text-slate-400" : "text-slate-600"}`}>
                  {tabCounts[tab]}
                </span>
              )}
            </button>
          ))}
        </div>

        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value)}
          className="rounded-xl border border-white/8 bg-[#040d1a] px-3 py-1.5 text-xs text-slate-300 outline-none"
        >
          <option value="priority">Sort: Priority</option>
          <option value="confidence">Sort: Confidence</option>
          <option value="newest">Sort: Newest</option>
          <option value="oldest">Sort: Oldest</option>
        </select>

        <span className="ml-auto text-xs text-slate-600">{filteredAndSorted.length} total</span>
      </div>

      {/* Action type summary pills */}
      {filteredAndSorted.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(actionCounts).map(([action, count]) => (
            <span key={action} className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${actionStyle(action)}`}>
              {action.replace(/_/g, " ")} · {count}
            </span>
          ))}
        </div>
      )}

      {/* Recommendation cards */}
      {visibleItems.length > 0 ? (
        <div className="space-y-2">
          {visibleItems.map(item => {
            const isExpanded    = expandedId === item.id;
            const isSyncing     = item._syncing ?? false;
            const isPending     = pendingIds.has(item.id);
            const actionError   = actionErrors[item.id];
            const pulse         = item.ticker ? pulseMap[item.ticker] : null;
            const quickActions  = getQuickActions(item.action_type);
            const currentStatus = item.recommendation_status ?? "proposed";
            const isActive      = currentStatus === "proposed" || currentStatus === "watchlist";

            return (
              <div
                key={item.id}
                className="rounded-2xl border border-white/6 bg-white/2 overflow-hidden transition-colors hover:bg-white/3 cursor-pointer"
                onClick={() => {
                  setExpandedId(isExpanded ? null : item.id);
                  setOpenMoreId(null);
                  if (!isExpanded && item.ticker) loadPulse(item.ticker, item.company_name);
                }}
              >
                {/* ── Card header (always visible) ───────────────────────── */}
                <div className="px-4 py-3">

                  {/* Row 1: badge · ticker · company → conviction · confidence · syncing · chevron */}
                  <div className="flex items-center gap-2">
                    <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${actionStyle(item.action_type)}`}>
                      {(item.action_type ?? "—").replace(/_/g, " ")}
                    </span>
                    <span className="text-base font-bold text-white">{item.ticker ?? "—"}</span>
                    {item.company_name && (
                      <span className="hidden min-w-0 flex-1 truncate text-sm text-slate-500 sm:block">
                        {item.company_name}
                      </span>
                    )}
                    <div className="ml-auto flex shrink-0 items-center gap-2">
                      {item.conviction && (
                        <span className={`hidden text-xs font-semibold sm:inline ${convictionColor(item.conviction)}`}>
                          {item.conviction}
                        </span>
                      )}
                      {item.confidence_score != null && (
                        <span className="hidden text-xs text-slate-600 sm:inline">{item.confidence_score}%</span>
                      )}
                      {isSyncing && (
                        <span className="animate-pulse text-[10px] text-slate-500">syncing…</span>
                      )}
                      <svg viewBox="0 0 20 20" fill="currentColor"
                        className={`h-4 w-4 shrink-0 text-slate-600 transition-transform ${isExpanded ? "rotate-180" : ""}`}>
                        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </div>

                  {/* Rows 2+3: only when collapsed */}
                  {!isExpanded && (
                    <>
                      {/* Row 2: thesis preview + sizing + social signal */}
                      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                        {item.thesis && (
                          <span className="min-w-0 flex-1 truncate text-xs text-slate-400" style={{ maxWidth: "45ch" }}>
                            {item.thesis}
                          </span>
                        )}
                        <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs tabular-nums text-slate-500">
                          {item.share_quantity != null && (
                            <span>{fmtN(item.share_quantity, 0)} sh</span>
                          )}
                          {item.sizing_dollars != null && (
                            <span>{fmt$(item.sizing_dollars)}</span>
                          )}
                          {item.target_price_1 != null && (
                            <span className="text-slate-600">T {fmt$(item.target_price_1)}</span>
                          )}
                          {pulse?.rank != null && (
                            <span className="hidden sm:inline text-slate-600">
                              Reddit #{pulse.rank}
                              {pulse.rank_change != null && pulse.rank_change !== 0 && (
                                <span className={pulse.rank_change > 0 ? " text-emerald-500" : " text-red-500"}>
                                  {" "}{pulse.rank_change > 0 ? `▲${pulse.rank_change}` : `▼${Math.abs(pulse.rank_change)}`}
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Row 3: quick actions OR done status badge (stop propagation so clicks don't toggle expand) */}
                      <div
                        className="mt-2 flex flex-wrap items-center gap-1.5"
                        onClick={e => e.stopPropagation()}
                      >
                        {isActive ? (
                          <>
                            {quickActions.map(qa => {
                              const isCurrentStatus = currentStatus === qa.value;
                              return (
                                <button
                                  key={qa.value}
                                  type="button"
                                  disabled={isPending}
                                  onClick={() => handleAction(item.id, qa.value)}
                                  className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition disabled:opacity-50 ${
                                    isCurrentStatus ? `cursor-default ${qa.activeStyle}` : qa.hoverStyle
                                  }`}
                                >
                                  {isCurrentStatus ? qa.activeLabel : qa.inactiveLabel}
                                </button>
                              );
                            })}

                            {/* More menu */}
                            <div className="relative">
                              <button
                                type="button"
                                onClick={e => {
                                  e.stopPropagation();
                                  setOpenMoreId(openMoreId === item.id ? null : item.id);
                                  setDeleteConfirmId(null);
                                }}
                                className="rounded-lg border border-white/8 bg-white/3 px-2 py-1 text-xs text-slate-500 transition hover:bg-white/6 hover:text-slate-300"
                                title="More options"
                              >
                                ···
                              </button>
                              {openMoreId === item.id && (
                                <div className="absolute left-0 top-full z-20 mt-1 min-w-[150px] rounded-xl border border-white/10 bg-[#0a1628] p-1 shadow-xl">
                                  <button
                                    type="button"
                                    onClick={() => handleAction(item.id, "archived")}
                                    className="w-full rounded-lg px-3 py-2 text-left text-xs text-slate-400 transition hover:bg-white/5 hover:text-white"
                                  >
                                    Archive
                                  </button>
                                  {deleteConfirmId === item.id ? (
                                    <div className="px-3 py-2">
                                      <p className="mb-1.5 text-[10px] text-slate-500">Delete permanently?</p>
                                      <div className="flex gap-1.5">
                                        <button type="button" onClick={() => handleDelete(item.id)}
                                          className="rounded-lg bg-red-500/15 px-2.5 py-1 text-xs text-red-400 hover:bg-red-500/25">
                                          Delete
                                        </button>
                                        <button type="button" onClick={() => setDeleteConfirmId(null)}
                                          className="rounded-lg bg-white/5 px-2.5 py-1 text-xs text-slate-400 hover:bg-white/10">
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setDeleteConfirmId(item.id)}
                                      className="w-full rounded-lg px-3 py-2 text-left text-xs text-red-400 transition hover:bg-red-500/8"
                                    >
                                      Delete
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </>
                        ) : (
                          <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-medium ${statusBadgeStyle(currentStatus)}`}>
                            {currentStatus === "executed" || currentStatus === "acknowledged" ? "✓ " : ""}
                            {statusLabel(currentStatus)}
                          </span>
                        )}

                        {actionError && (
                          <span className="text-xs text-red-400">{actionError}</span>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* ── Expanded detail ─────────────────────────────────────── */}
                {isExpanded && (
                  <div className="border-t border-white/5 px-4 pb-4 pt-3" onClick={e => e.stopPropagation()}>

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

                    {item.risks && (
                      <div className="mt-3 rounded-xl border border-amber-500/10 bg-amber-500/5 p-3">
                        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-amber-400">Risks</p>
                        <p className="text-sm leading-6 text-slate-300">{item.risks}</p>
                      </div>
                    )}

                    {/* Metrics grid */}
                    <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                      {[
                        { label: "Confidence", value: item.confidence_score != null ? `${item.confidence_score}%` : null },
                        { label: "Priority",   value: item.priority_rank != null ? `#${item.priority_rank}` : null },
                        { label: "Horizon",    value: fmtHorizon(item.time_horizon) },
                        { label: "Size %",     value: item.sizing_pct != null ? `${fmtN(item.sizing_pct)}%` : null },
                        { label: "Size $",     value: fmt$(item.sizing_dollars) },
                        { label: "Shares",     value: item.share_quantity != null ? fmtN(item.share_quantity, 4) : null },
                      ].map(m => m.value ? (
                        <div key={m.label} className="rounded-xl border border-white/5 bg-white/2 px-2 py-2 text-center">
                          <p className="text-[9px] uppercase tracking-widest text-slate-600">{m.label}</p>
                          <p className="mt-0.5 text-sm font-semibold text-white">{m.value}</p>
                        </div>
                      ) : null)}
                    </div>

                    {/* Price targets */}
                    {(item.target_price_1 ?? item.target_price_2 ?? item.stop_price) != null && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {item.target_price_1 && (
                          <div className="rounded-xl border border-emerald-500/10 bg-emerald-500/5 px-3 py-2">
                            <p className="text-[9px] uppercase tracking-widest text-emerald-400">Target 1</p>
                            <p className="text-sm font-semibold text-white">{fmt$(item.target_price_1)}</p>
                          </div>
                        )}
                        {item.target_price_2 && (
                          <div className="rounded-xl border border-emerald-500/10 bg-emerald-500/5 px-3 py-2">
                            <p className="text-[9px] uppercase tracking-widest text-emerald-400">Target 2</p>
                            <p className="text-sm font-semibold text-white">{fmt$(item.target_price_2)}</p>
                          </div>
                        )}
                        {item.stop_price && (
                          <div className="rounded-xl border border-red-500/10 bg-red-500/5 px-3 py-2">
                            <p className="text-[9px] uppercase tracking-widest text-red-400">Stop</p>
                            <p className="text-sm font-semibold text-white">{fmt$(item.stop_price)}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Reddit Pulse */}
                    {item.ticker && (
                      <div className="mt-3 rounded-xl border border-white/5 bg-white/2 p-3">
                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">Reddit Pulse</p>
                        {pulseLoading.has(item.ticker) && (
                          <p className="text-xs text-slate-500">Fetching…</p>
                        )}
                        {pulseError[item.ticker] && !pulseLoading.has(item.ticker) && (
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-xs text-slate-500">{pulseError[item.ticker]}</p>
                            <button type="button"
                              onClick={() => { setPulseError(p => { const n = { ...p }; delete n[item.ticker!]; return n; }); loadPulse(item.ticker!, item.company_name); }}
                              className="text-xs text-slate-400 transition hover:text-white">Retry</button>
                          </div>
                        )}
                        {pulse && !pulseLoading.has(item.ticker) && (
                          pulse.source === "apewisdom"
                            ? <ApeWisdomPanel sp={pulse} />
                            : <RedditPulsePanel sp={pulse} />
                        )}
                      </div>
                    )}

                    {/* Expanded action buttons */}
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {quickActions.map(qa => {
                        const isCurrentStatus = currentStatus === qa.value;
                        return (
                          <button
                            key={qa.value}
                            type="button"
                            disabled={isPending || isCurrentStatus}
                            onClick={() => handleAction(item.id, qa.value)}
                            className={`rounded-xl border px-4 py-2 text-sm font-medium transition disabled:opacity-50 ${
                              isCurrentStatus ? `cursor-default ${qa.activeStyle}` : qa.hoverStyle
                            }`}
                          >
                            {isCurrentStatus ? qa.activeLabel : qa.inactiveLabel}
                          </button>
                        );
                      })}

                      {currentStatus !== "archived" && (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleAction(item.id, "archived")}
                          className="rounded-xl border border-white/8 bg-white/3 px-4 py-2 text-sm font-medium text-slate-500 transition hover:bg-white/6 hover:text-slate-300 disabled:opacity-50"
                        >
                          Archive
                        </button>
                      )}

                      {/* Delete */}
                      <div className="ml-auto">
                        {deleteConfirmId === item.id ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500">Delete permanently?</span>
                            <button type="button" onClick={() => handleDelete(item.id)} disabled={isPending}
                              className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/20 disabled:opacity-60">
                              Confirm
                            </button>
                            <button type="button" onClick={() => setDeleteConfirmId(null)}
                              className="rounded-xl border border-white/10 bg-white/4 px-3 py-1.5 text-xs text-slate-400 hover:text-white">
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button type="button" onClick={() => setDeleteConfirmId(item.id)} disabled={isPending}
                            className="rounded-xl border border-white/8 bg-white/3 p-2 text-slate-600 transition hover:border-red-500/30 hover:text-red-400 disabled:opacity-60"
                            title="Delete recommendation">
                            <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                              <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>

                    {actionError && (
                      <div className="mt-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                        {actionError}
                      </div>
                    )}

                    <p className="mt-2 text-xs text-slate-700">{new Date(item.created_at).toLocaleString()}</p>
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

      {/* Load more */}
      {hasMore && (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
            className="rounded-xl border border-white/10 bg-white/3 px-6 py-2.5 text-sm text-slate-400 transition hover:bg-white/6 hover:text-white"
          >
            Load {Math.min(PAGE_SIZE, filteredAndSorted.length - visibleCount)} more
          </button>
        </div>
      )}
    </div>
  );
}
