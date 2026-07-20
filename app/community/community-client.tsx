"use client";

import { useState, useTransition, useRef, useLayoutEffect, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { likeStrategy, saveStrategy, followUser, postComment, copyStrategyAsTemplate, postStrategyUpdate, deleteStrategyUpdate } from "./social-actions";
import { followPublicPortfolio, copyPublicAllocation } from "./portfolio-actions";
import CommunityFeed from "./community-feed";
import type { FeedPost, FeedAuthor, MyOption } from "./community-feed";
import CommunityLearn from "./community-learn";
import PeerBenchmarkCard from "./peer-benchmark-card";
import PageTutorial from "@/app/components/page-tutorial";

// ─── Types ────────────────────────────────────────────────────────────────────

type Author = {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_color: string;
  is_following: boolean;
  is_friend: boolean;
};

type StrategyRow = {
  id: string;
  name: string;
  description: string | null;
  style: string | null;
  risk_level: string | null;
  likes_count: number;
  copies_count: number;
  finn_confidence: number | null;
  return_pct: number | null;
  return_since: string | null;
  is_official: boolean;
  monthly_return_pct: number | null;
  created_at: string;
  is_own: boolean;
  is_liked: boolean;
  is_saved: boolean;
  author: Author;
};

// Shared preview type used for StrategyPreviewModal
type StrategyPreview = {
  id: string;
  name: string;
  description: string | null;
  style: string | null;
  risk_level: string | null;
  likes_count: number;
  copies_count: number;
  finn_confidence: number | null;
  return_pct: number | null;
  return_since: string | null;
  is_official: boolean;
  monthly_return_pct: number | null;
  is_liked: boolean;
  is_saved: boolean;
  is_own: boolean;
  author: {
    user_id: string;
    username: string;
    display_name: string | null;
    avatar_color: string;
    is_following: boolean;
  };
};

type TrendingStrategyItem = {
  id: string;
  name: string;
  description: string | null;
  style: string | null;
  risk_level: string | null;
  copies_count: number;
  likes_count: number;
  is_liked: boolean;
  is_saved: boolean;
  is_own: boolean;
  author: {
    user_id: string;
    username: string;
    display_name: string | null;
    avatar_color: string;
    is_following: boolean;
  };
};

type TrendingPortfolioItem = {
  id: string;
  public_name: string;
  risk_level: string | null;
  style: string | null;
  copy_count: number;
  follower_count: number;
  author: { user_id: string; username: string; avatar_color: string };
};

type PortfolioHolding = {
  ticker: string;
  company_name: string | null;
  allocation_pct: number;
  is_cash: boolean;
};

type PortfolioRow = {
  id: string;
  public_name: string;
  public_description: string | null;
  risk_level: string | null;
  style: string | null;
  follower_count: number;
  copy_count: number;
  last_synced_at: string | null;
  is_own: boolean;
  is_following: boolean;
  holdings: PortfolioHolding[];
  author: {
    user_id: string;
    username: string;
    display_name: string | null;
    avatar_color: string;
    is_following: boolean;
  };
};

type CopyToast = { message: string; portfolioId?: string } | null;

// ─── Constants ────────────────────────────────────────────────────────────────

const ALLOC_COLORS = ["#0ea5a0", "#3fae4a", "#0891b2", "#065f46", "#92400e", "#4338ca"];
const ALLOC_CASH_COLOR = "rgba(255,255,255,0.12)";
const ALLOC_REST_COLOR = "rgba(255,255,255,0.06)";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function riskColor(r: string | null) {
  if (!r) return { bg: "var(--card-bg)", border: "var(--card-border)", color: "var(--text-tertiary)" };
  const l = r.toLowerCase();
  if (["low", "conservative"].includes(l)) return { bg: "var(--green-bg)", border: "var(--green-border)", color: "var(--green)" };
  if (["high", "aggressive"].includes(l))  return { bg: "var(--red-bg)",   border: "var(--red-border)",   color: "var(--red)" };
  return { bg: "var(--amber-bg)", border: "var(--amber-border)", color: "var(--amber)" };
}

// ─── Primitives ───────────────────────────────────────────────────────────────

function Avatar({ username, color, size = 28 }: { username: string; color: string; size?: number }) {
  return (
    <div style={{
      width: size, height: size, minWidth: size,
      borderRadius: "50%", background: color,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: Math.round(size * 0.38), fontWeight: 700, color: "#fff",
      fontFamily: "var(--font-body)",
    }}>
      {(username[0] ?? "?").toUpperCase()}
    </div>
  );
}

function FilterChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      flexShrink: 0, padding: "5px 11px", borderRadius: "var(--radius-full)",
      fontSize: "11px", fontWeight: active ? 600 : 400, fontFamily: "var(--font-body)",
      border: `1px solid ${active ? "rgba(14,165,160,0.45)" : "var(--card-border)"}`,
      background: active ? "rgba(14,165,160,0.12)" : "transparent",
      color: active ? "#7fd9d4" : "var(--text-tertiary)",
      cursor: "pointer", whiteSpace: "nowrap",
      transition: "color 150ms ease, background 150ms ease, border-color 150ms ease",
    }}>
      {label}
    </button>
  );
}

function RiskBadge({ risk }: { risk: string | null }) {
  if (!risk) return null;
  const rs = riskColor(risk);
  return (
    <span style={{
      fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em",
      textTransform: "uppercase", padding: "2px 7px", borderRadius: "var(--radius-full)",
      background: rs.bg, border: `1px solid ${rs.border}`, color: rs.color, flexShrink: 0,
    }}>
      {risk}
    </span>
  );
}

function StyleBadge({ style }: { style: string | null }) {
  if (!style) return null;
  return (
    <span style={{
      fontSize: "10px", color: "var(--text-tertiary)", background: "transparent",
      border: "1px solid var(--card-border)", padding: "2px 7px",
      borderRadius: "var(--radius-full)", flexShrink: 0,
    }}>
      {style}
    </span>
  );
}

function OwnBadge() {
  return (
    <span style={{
      fontSize: "10px", fontWeight: 600, letterSpacing: "0.04em",
      padding: "2px 7px", borderRadius: "var(--radius-full)",
      background: "rgba(14,165,160,0.1)", border: "1px solid rgba(14,165,160,0.2)",
      color: "#7fd9d4", flexShrink: 0,
    }}>
      Yours
    </span>
  );
}

function OfficialBadge() {
  return (
    <span title="BuyTune Official Strategy" style={{
      fontSize: "10px", fontWeight: 700, letterSpacing: "0.05em",
      padding: "2px 8px", borderRadius: "var(--radius-full)",
      background: "rgba(234,179,8,0.1)", border: "1px solid rgba(234,179,8,0.3)",
      color: "#fbbf24", flexShrink: 0, textTransform: "uppercase",
    }}>
      BuyTune
    </span>
  );
}

// ─── Strategy preview modal ───────────────────────────────────────────────────

function StrategyPreviewModal({
  strategy, onClose, onLike, onSave, onFollow, onCopy,
}: {
  strategy: StrategyPreview;
  onClose: () => void;
  onLike: (id: string) => void;
  onSave: (id: string) => void;
  onFollow: (userId: string) => void;
  onCopy: (id: string) => Promise<void>;
}) {
  const [copying, setCopying] = useState(false);

  type UpdateRow = { id: string; update_text: string; change_type: string | null; tickers_mentioned: string[]; created_at: string };
  const [updates, setUpdates] = useState<UpdateRow[]>([]);
  const [updatesLoading, setUpdatesLoading] = useState(true);
  const [updateText, setUpdateText] = useState("");
  const [changeType, setChangeType] = useState<"add" | "remove" | "rebalance" | "note">("note");
  const [posting, setPosting] = useState(false);
  const [copiedTicker, setCopiedTicker] = useState<string | null>(null);

  // Phase 3b: "How would I have done?" comparison
  type PortfolioOption = { id: string; name: string; account_type: string | null };
  const [compareOpen, setCompareOpen] = useState(false);
  const [comparePortfolios, setComparePortfolios] = useState<PortfolioOption[]>([]);
  const [comparePortfolioId, setComparePortfolioId] = useState<string>("");
  const [compareResult, setCompareResult] = useState<{ returnPct: number | null; startDate: string; endDate: string } | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);

  useEffect(() => {
    if (!compareOpen || comparePortfolios.length > 0) return;
    fetch("/api/portfolio/list")
      .then(r => r.json())
      .then(d => {
        setComparePortfolios(d.portfolios ?? []);
        if (d.portfolios?.length > 0) setComparePortfolioId(d.portfolios[0].id);
      })
      .catch(() => {});
  }, [compareOpen, comparePortfolios.length]);

  useEffect(() => {
    if (!comparePortfolioId || !strategy.return_since) return;
    setCompareLoading(true);
    setCompareResult(null);
    fetch(`/api/portfolio/${comparePortfolioId}/return-since?date=${strategy.return_since}`)
      .then(r => r.json())
      .then(d => setCompareResult({ returnPct: d.returnPct ?? null, startDate: d.startDate, endDate: d.endDate }))
      .catch(() => setCompareResult(null))
      .finally(() => setCompareLoading(false));
  }, [comparePortfolioId, strategy.return_since]);

  useEffect(() => {
    setUpdatesLoading(true);
    fetch(`/api/strategies/${strategy.id}/updates`)
      .then(r => r.json())
      .then(d => setUpdates(d.updates ?? []))
      .catch(() => setUpdates([]))
      .finally(() => setUpdatesLoading(false));
  }, [strategy.id]);

  async function handlePostUpdate() {
    if (!updateText.trim() || posting) return;
    setPosting(true);
    try {
      await postStrategyUpdate(strategy.id, updateText, changeType);
      const res = await fetch(`/api/strategies/${strategy.id}/updates`);
      const d = await res.json();
      setUpdates(d.updates ?? []);
      setUpdateText("");
    } catch { /* non-fatal */ }
    finally { setPosting(false); }
  }

  async function handleDeleteUpdate(updateId: string) {
    await deleteStrategyUpdate(updateId);
    setUpdates(prev => prev.filter(u => u.id !== updateId));
  }

  function handleCopyTicker(ticker: string) {
    navigator.clipboard.writeText(ticker).catch(() => {});
    setCopiedTicker(ticker);
    setTimeout(() => setCopiedTicker(null), 1500);
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(3px)" }}
      />
      <div style={{
        position: "fixed", top: "50%", left: "50%",
        transform: "translate(-50%, -50%)", zIndex: 201,
        width: "min(520px, calc(100vw - 32px))",
        background: "var(--bg-elevated)", border: "1px solid var(--card-border)",
        borderRadius: "18px", boxShadow: "0 8px 40px rgba(0,0,0,0.7)", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{ padding: "16px 20px 14px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", marginBottom: "7px" }}>
              <RiskBadge risk={strategy.risk_level} />
              <StyleBadge style={strategy.style} />
              {strategy.is_own && <OwnBadge />}
            </div>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", letterSpacing: "-0.2px", lineHeight: 1.2 }}>
              {strategy.name}
            </h2>
          </div>
          <button type="button" onClick={onClose}
            style={{ width: "28px", height: "28px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: "var(--radius-md)", color: "var(--text-muted)", cursor: "pointer" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "var(--text-muted)"; }}
          >
            <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "16px 20px 20px", display: "flex", flexDirection: "column", gap: "14px" }}>
          {strategy.description && (
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
              {strategy.description}
            </p>
          )}

          {/* Author + follow */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
            <Link href={`/${strategy.author.username}`} onClick={onClose} style={{ display: "flex", alignItems: "center", gap: "8px", textDecoration: "none", minWidth: 0 }}>
              <Avatar username={strategy.author.username} color={strategy.author.avatar_color} size={28} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {strategy.author.display_name || strategy.author.username}
                </div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>@{strategy.author.username}</div>
              </div>
            </Link>
            {!strategy.is_own && (
              <button type="button" onClick={() => onFollow(strategy.author.user_id)}
                style={{
                  padding: "5px 14px", borderRadius: "var(--radius-full)",
                  fontSize: "12px", fontWeight: 500, flexShrink: 0,
                  background: strategy.author.is_following ? "transparent" : "rgba(14,165,160,0.1)",
                  border: `1px solid ${strategy.author.is_following ? "var(--card-border)" : "rgba(14,165,160,0.25)"}`,
                  color: strategy.author.is_following ? "var(--text-tertiary)" : "#7fd9d4",
                  cursor: "pointer", fontFamily: "var(--font-body)",
                  transition: "color 150ms ease, background 150ms ease",
                }}
                onPointerDown={(e) => { e.currentTarget.style.transform = "scale(0.96)"; }}
                onPointerUp={(e) => { e.currentTarget.style.transform = ""; }}
                onPointerCancel={(e) => { e.currentTarget.style.transform = ""; }}
              >
                {strategy.author.is_following ? "Following" : "Follow"}
              </button>
            )}
          </div>

          {/* Stats row */}
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", padding: "10px 0", borderTop: "1px solid var(--border-subtle)", borderBottom: "1px solid var(--border-subtle)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <svg width="12" height="12" viewBox="0 0 20 20" fill={strategy.is_liked ? "#ff5c5c" : "none"} stroke={strategy.is_liked ? "#ff5c5c" : "var(--text-muted)"} strokeWidth="1.5">
                <path d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" />
              </svg>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-secondary)" }}>{strategy.likes_count}</span>
              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>likes</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor" style={{ color: "var(--text-muted)" }}>
                <path d="M7 9a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H9a2 2 0 01-2-2V9z" />
                <path d="M5 3a2 2 0 00-2 2v6a2 2 0 002 2V5h8a2 2 0 00-2-2H5z" />
              </svg>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-secondary)" }}>{strategy.copies_count}</span>
              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>copies</span>
            </div>
            {strategy.finn_confidence != null && (
              <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                <div style={{
                  padding: "2px 9px", borderRadius: "6px",
                  background: "rgba(109,40,217,0.09)", border: "1px solid rgba(109,40,217,0.2)",
                  fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 700, color: "#8b5cf6",
                }}>
                  {strategy.finn_confidence}
                </div>
                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Atlas score</span>
              </div>
            )}
            {strategy.return_pct != null && (
              <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                <div style={{
                  padding: "2px 9px", borderRadius: "6px",
                  background: strategy.return_pct >= 0 ? "rgba(16,185,129,0.09)" : "rgba(239,68,68,0.09)",
                  border: `1px solid ${strategy.return_pct >= 0 ? "rgba(16,185,129,0.22)" : "rgba(239,68,68,0.22)"}`,
                  fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 700,
                  color: strategy.return_pct >= 0 ? "#34d399" : "#f87171",
                }}>
                  {strategy.return_pct >= 0 ? "+" : ""}{strategy.return_pct.toFixed(2)}%
                </div>
                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                  {strategy.return_since
                    ? `since ${new Date(strategy.return_since + "T12:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" })}`
                    : "verified return"}
                </span>
              </div>
            )}
          </div>

          {/* Phase 3b: How would I have done? */}
          {strategy.return_pct != null && strategy.return_since != null && (
            <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "12px" }}>
              <button
                type="button"
                onClick={() => setCompareOpen(o => !o)}
                style={{ display: "flex", alignItems: "center", gap: "6px", background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--text-secondary)", fontSize: "12px", fontFamily: "var(--font-body)", fontWeight: 500 }}
              >
                <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" style={{ color: "#3fc9c3", flexShrink: 0 }}>
                  <path fillRule="evenodd" d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11 4a1 1 0 10-2 0v4a1 1 0 102 0V7zm-3 1a1 1 0 10-2 0v3a1 1 0 102 0V8zM8 9a1 1 0 00-2 0v2a1 1 0 102 0V9z" clipRule="evenodd" />
                </svg>
                How would I have done?
                <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor" style={{ color: "var(--text-muted)", transform: compareOpen ? "rotate(180deg)" : "none", transition: "transform 150ms ease" }}>
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>

              {compareOpen && (
                <div style={{ marginTop: "10px", padding: "12px", borderRadius: "10px", background: "var(--surface-003)", border: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", gap: "10px" }}>
                  {comparePortfolios.length === 0 ? (
                    <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: 0 }}>No portfolios found.</p>
                  ) : (
                    <>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <label style={{ fontSize: "11px", color: "var(--text-muted)", flexShrink: 0 }}>Compare with</label>
                        <select
                          value={comparePortfolioId}
                          onChange={(e) => setComparePortfolioId(e.target.value)}
                          style={{ flex: 1, fontSize: "12px", padding: "4px 8px", borderRadius: "8px", background: "var(--surface-006)", border: "1px solid var(--card-border)", color: "var(--text-primary)", fontFamily: "var(--font-body)" }}
                        >
                          {comparePortfolios.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </div>

                      {compareLoading ? (
                        <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: 0 }}>Loading…</p>
                      ) : compareResult ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                            <div style={{ padding: "8px 10px", borderRadius: "8px", background: strategy.return_pct >= 0 ? "rgba(16,185,129,0.07)" : "rgba(239,68,68,0.07)", border: `1px solid ${strategy.return_pct >= 0 ? "rgba(16,185,129,0.18)" : "rgba(239,68,68,0.18)"}` }}>
                              <p style={{ fontSize: "10px", color: "var(--text-muted)", margin: "0 0 3px", textTransform: "uppercase", letterSpacing: "0.05em" }}>This strategy</p>
                              <p style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 700, color: strategy.return_pct >= 0 ? "#34d399" : "#f87171", margin: 0 }}>
                                {strategy.return_pct >= 0 ? "+" : ""}{strategy.return_pct.toFixed(2)}%
                              </p>
                            </div>
                            <div style={{ padding: "8px 10px", borderRadius: "8px", background: (compareResult.returnPct ?? 0) >= 0 ? "rgba(16,185,129,0.07)" : "rgba(239,68,68,0.07)", border: `1px solid ${(compareResult.returnPct ?? 0) >= 0 ? "rgba(16,185,129,0.18)" : "rgba(239,68,68,0.18)"}` }}>
                              <p style={{ fontSize: "10px", color: "var(--text-muted)", margin: "0 0 3px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Your portfolio</p>
                              <p style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 700, color: (compareResult.returnPct ?? 0) >= 0 ? "#34d399" : "#f87171", margin: 0 }}>
                                {compareResult.returnPct != null ? `${compareResult.returnPct >= 0 ? "+" : ""}${compareResult.returnPct.toFixed(2)}%` : "—"}
                              </p>
                            </div>
                          </div>
                          {compareResult.returnPct != null && (() => {
                            const diff = strategy.return_pct! - compareResult.returnPct;
                            const strategyWon = diff > 0;
                            return (
                              <p style={{ fontSize: "11px", color: "var(--text-muted)", margin: 0 }}>
                                {strategyWon
                                  ? <><span style={{ color: "var(--green)", fontWeight: 600 }}>Strategy outperformed</span> your portfolio by <span style={{ fontFamily: "var(--font-mono)", color: "var(--green)" }}>+{Math.abs(diff).toFixed(2)}%</span></>
                                  : diff === 0
                                  ? "Tied — identical returns over this period."
                                  : <><span style={{ color: "#f59e0b", fontWeight: 600 }}>You outperformed</span> this strategy by <span style={{ fontFamily: "var(--font-mono)", color: "#f59e0b" }}>+{Math.abs(diff).toFixed(2)}%</span></>
                                }
                                {" "}since {new Date(strategy.return_since! + "T12:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" })}.
                              </p>
                            );
                          })()}
                          {!compareResult.returnPct && (
                            <p style={{ fontSize: "11px", color: "var(--text-muted)", margin: 0 }}>Not enough snapshot history since {new Date(strategy.return_since! + "T12:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" })} to compare.</p>
                          )}
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          {!strategy.is_own && (
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button type="button" onClick={() => onLike(strategy.id)}
                style={{
                  display: "flex", alignItems: "center", gap: "5px",
                  padding: "7px 14px", borderRadius: "var(--radius-md)", fontSize: "12px", fontWeight: 500,
                  background: strategy.is_liked ? "rgba(255,92,92,0.1)" : "var(--card-bg)",
                  border: `1px solid ${strategy.is_liked ? "rgba(255,92,92,0.25)" : "var(--card-border)"}`,
                  color: strategy.is_liked ? "#ff5c5c" : "var(--text-secondary)",
                  cursor: "pointer", fontFamily: "var(--font-body)",
                  transition: "color 150ms ease, background 150ms ease",
                }}
                onPointerDown={(e) => { e.currentTarget.style.transform = "scale(0.96)"; }}
                onPointerUp={(e) => { e.currentTarget.style.transform = ""; }}
                onPointerCancel={(e) => { e.currentTarget.style.transform = ""; }}
              >
                <svg width="12" height="12" viewBox="0 0 20 20" fill={strategy.is_liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5">
                  <path d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" />
                </svg>
                {strategy.is_liked ? "Liked" : "Like"}
              </button>

              <button type="button" onClick={() => onSave(strategy.id)}
                style={{
                  display: "flex", alignItems: "center", gap: "5px",
                  padding: "7px 14px", borderRadius: "var(--radius-md)", fontSize: "12px", fontWeight: 500,
                  background: strategy.is_saved ? "rgba(14,165,160,0.1)" : "var(--card-bg)",
                  border: `1px solid ${strategy.is_saved ? "rgba(14,165,160,0.25)" : "var(--card-border)"}`,
                  color: strategy.is_saved ? "#7fd9d4" : "var(--text-secondary)",
                  cursor: "pointer", fontFamily: "var(--font-body)",
                  transition: "color 150ms ease, background 150ms ease",
                }}
                onPointerDown={(e) => { e.currentTarget.style.transform = "scale(0.96)"; }}
                onPointerUp={(e) => { e.currentTarget.style.transform = ""; }}
                onPointerCancel={(e) => { e.currentTarget.style.transform = ""; }}
              >
                <svg width="11" height="11" viewBox="0 0 20 20" fill={strategy.is_saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5">
                  <path d="M5 3a2 2 0 00-2 2v12l7-3 7 3V5a2 2 0 00-2-2H5z" />
                </svg>
                {strategy.is_saved ? "Saved" : "Save"}
              </button>

              <button type="button"
                onClick={async () => {
                  if (copying) return;
                  setCopying(true);
                  try { await onCopy(strategy.id); } finally { setCopying(false); }
                  onClose();
                }}
                style={{
                  display: "flex", alignItems: "center", gap: "5px",
                  padding: "7px 14px", borderRadius: "var(--radius-md)", fontSize: "12px", fontWeight: 600,
                  background: "var(--brand-gradient)", border: "none",
                  color: "#fff", cursor: copying ? "not-allowed" : "pointer",
                  opacity: copying ? 0.6 : 1, fontFamily: "var(--font-body)",
                  transition: "opacity 150ms ease",
                }}
                onPointerDown={(e) => { if (!copying) e.currentTarget.style.transform = "scale(0.97)"; }}
                onPointerUp={(e) => { e.currentTarget.style.transform = ""; }}
                onPointerCancel={(e) => { e.currentTarget.style.transform = ""; }}
              >
                {copying ? "Copying..." : "Use as Template"}
              </button>
            </div>
          )}

          {/* ── Update feed ───────────────────────────────────────────────── */}
          <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "14px", display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)" }}>Updates</span>
              {updates.length > 0 && <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{updates.length}</span>}
            </div>

            {/* Post form — owner only */}
            {strategy.is_own && (
              <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
                <textarea
                  value={updateText}
                  onChange={e => setUpdateText(e.target.value)}
                  placeholder="What changed? Mention tickers in CAPS (e.g. Added NVDA, trimmed MSFT…)"
                  maxLength={500}
                  rows={2}
                  style={{
                    width: "100%", padding: "8px 10px", borderRadius: "var(--radius-md)",
                    background: "var(--card-bg)", border: "1px solid var(--card-border)",
                    color: "var(--text-primary)", fontSize: "12px", fontFamily: "var(--font-body)",
                    resize: "none", outline: "none", boxSizing: "border-box",
                    lineHeight: 1.5,
                  }}
                />
                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  {(["add", "remove", "rebalance", "note"] as const).map(ct => (
                    <button key={ct} type="button" onClick={() => setChangeType(ct)}
                      style={{
                        padding: "3px 9px", borderRadius: "var(--radius-full)", fontSize: "10px", fontWeight: changeType === ct ? 700 : 400,
                        background: changeType === ct ? "rgba(14,165,160,0.12)" : "transparent",
                        border: `1px solid ${changeType === ct ? "rgba(14,165,160,0.35)" : "var(--card-border)"}`,
                        color: changeType === ct ? "#7fd9d4" : "var(--text-muted)",
                        cursor: "pointer", fontFamily: "var(--font-body)", textTransform: "capitalize",
                      }}
                    >{ct}</button>
                  ))}
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>{updateText.length}/500</span>
                  <button type="button" onClick={handlePostUpdate} disabled={!updateText.trim() || posting}
                    style={{
                      padding: "4px 12px", borderRadius: "var(--radius-md)", fontSize: "11px", fontWeight: 600,
                      background: updateText.trim() && !posting ? "var(--brand-gradient)" : "var(--card-bg)",
                      border: "none", color: updateText.trim() && !posting ? "#fff" : "var(--text-muted)",
                      cursor: updateText.trim() && !posting ? "pointer" : "default",
                      fontFamily: "var(--font-body)", transition: "opacity 150ms ease",
                    }}
                  >{posting ? "Posting…" : "Post"}</button>
                </div>
              </div>
            )}

            {/* Update list */}
            {updatesLoading ? (
              <div style={{ fontSize: "11px", color: "var(--text-muted)", padding: "8px 0" }}>Loading…</div>
            ) : updates.length === 0 ? (
              <div style={{ fontSize: "11px", color: "var(--text-muted)", padding: "4px 0" }}>
                {strategy.is_own ? "No updates yet. Post one above." : "No updates posted yet."}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {updates.map(u => (
                  <div key={u.id} style={{
                    padding: "9px 11px", borderRadius: "var(--radius-md)",
                    background: "var(--card-bg)", border: "1px solid var(--card-border)",
                    display: "flex", flexDirection: "column", gap: "6px",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      {u.change_type && (
                        <span style={{
                          fontSize: "10px", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase",
                          padding: "1px 6px", borderRadius: "var(--radius-full)",
                          background: u.change_type === "add" ? "rgba(16,185,129,0.1)" : u.change_type === "remove" ? "rgba(239,68,68,0.1)" : u.change_type === "rebalance" ? "rgba(234,179,8,0.1)" : "rgba(255,255,255,0.06)",
                          color: u.change_type === "add" ? "#34d399" : u.change_type === "remove" ? "#f87171" : u.change_type === "rebalance" ? "#fbbf24" : "var(--text-tertiary)",
                          border: `1px solid ${u.change_type === "add" ? "rgba(16,185,129,0.2)" : u.change_type === "remove" ? "rgba(239,68,68,0.2)" : u.change_type === "rebalance" ? "rgba(234,179,8,0.2)" : "var(--card-border)"}`,
                        }}>{u.change_type}</span>
                      )}
                      <span style={{ fontSize: "10px", color: "var(--text-muted)", marginLeft: "auto" }}>
                        {new Date(u.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                      {strategy.is_own && (
                        <button type="button" onClick={() => handleDeleteUpdate(u.id)}
                          style={{ background: "none", border: "none", padding: "0 2px", cursor: "pointer", color: "var(--text-muted)", fontSize: "10px", fontFamily: "var(--font-body)" }}
                          onMouseEnter={e => { e.currentTarget.style.color = "#f87171"; }}
                          onMouseLeave={e => { e.currentTarget.style.color = "var(--text-muted)"; }}
                        ><span aria-hidden="true">✕</span><span className="bt-sr-only">Remove</span></button>
                      )}
                    </div>
                    <p style={{ margin: 0, fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.5 }}>{u.update_text}</p>
                    {u.tickers_mentioned && u.tickers_mentioned.length > 0 && (
                      <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
                        {u.tickers_mentioned.map(t => (
                          <button key={t} type="button" onClick={() => handleCopyTicker(t)}
                            title={copiedTicker === t ? "Copied!" : "Copy ticker"}
                            style={{
                              padding: "2px 7px", borderRadius: "var(--radius-full)",
                              background: "rgba(14,165,160,0.08)", border: "1px solid rgba(14,165,160,0.2)",
                              color: copiedTicker === t ? "#34d399" : "#7fd9d4",
                              fontSize: "10px", fontFamily: "var(--font-mono)", fontWeight: 700,
                              cursor: "pointer", transition: "color 120ms ease",
                            }}
                          >{copiedTicker === t ? "✓" : ""}{t}</button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Trending spotlight strip ─────────────────────────────────────────────────

type SpotlightItem = {
  id: string;
  name: string;
  risk_level: string | null;
  style: string | null;
  statValue: number;
  statLabel: string;
  author: { username: string; avatar_color: string };
  href?: string;
  onClick?: () => void;
  ariaLabel: string;
};

function SpotlightCard({ item, rank }: { item: SpotlightItem; rank: number }) {
  const rs = riskColor(item.risk_level);
  const isFirst = rank === 0;

  const cardStyle: React.CSSProperties = {
    flexShrink: 0, width: "190px",
    background: isFirst ? "rgba(14,165,160,0.06)" : "var(--card-bg)",
    border: `1px solid ${isFirst ? "rgba(14,165,160,0.18)" : "var(--card-border)"}`,
    borderRadius: "var(--radius-lg)",
    padding: "12px 14px",
    display: "flex", flexDirection: "column", gap: "8px",
    cursor: "pointer", textAlign: "left",
    textDecoration: "none", color: "inherit",
    fontFamily: "var(--font-body)",
    transition: "border-color 140ms ease, background 140ms ease, transform 140ms ease, box-shadow 140ms ease",
  };

  const inner = (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700,
          color: isFirst ? "#fbbf24" : "var(--text-muted)",
          background: isFirst ? "rgba(251,191,36,0.1)" : "rgba(255,255,255,0.04)",
          border: isFirst ? "1px solid rgba(251,191,36,0.2)" : "1px solid rgba(255,255,255,0.06)",
          padding: "1px 6px", borderRadius: "var(--radius-full)", flexShrink: 0,
        }}>
          #{rank + 1}
        </span>
        {item.risk_level && (
          <span style={{
            fontSize: "10px", fontWeight: 700, textTransform: "uppercase",
            padding: "1px 5px", borderRadius: "var(--radius-full)",
            background: rs.bg, border: `1px solid ${rs.border}`, color: rs.color, flexShrink: 0,
          }}>
            {item.risk_level}
          </span>
        )}
      </div>
      <p style={{
        fontSize: "12px", fontWeight: 600, color: "var(--text-primary)",
        overflow: "hidden", display: "-webkit-box",
        WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
        lineHeight: 1.35, margin: 0,
      }}>
        {item.name}
      </p>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
          <Avatar username={item.author.username} color={item.author.avatar_color} size={15} />
          <span style={{ fontSize: "10px", color: "var(--text-muted)", maxWidth: "80px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.author.username}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
          <svg width="9" height="9" viewBox="0 0 20 20" fill="currentColor" style={{ color: "var(--text-muted)", flexShrink: 0 }}>
            <path d="M7 9a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H9a2 2 0 01-2-2V9z" />
            <path d="M5 3a2 2 0 00-2 2v6a2 2 0 002 2V5h8a2 2 0 00-2-2H5z" />
          </svg>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-tertiary)" }}>{item.statValue}</span>
        </div>
      </div>
    </>
  );

  if (item.href) {
    return (
      <Link
        href={item.href}
        aria-label={item.ariaLabel}
        style={cardStyle}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = isFirst ? "rgba(14,165,160,0.35)" : "rgba(255,255,255,0.1)"; (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 6px 20px rgba(0,0,0,0.35)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = isFirst ? "rgba(14,165,160,0.18)" : "var(--card-border)"; (e.currentTarget as HTMLElement).style.transform = ""; (e.currentTarget as HTMLElement).style.boxShadow = ""; }}
      >
        {inner}
      </Link>
    );
  }

  return (
    <button
      type="button"
      aria-label={item.ariaLabel}
      onClick={item.onClick}
      style={cardStyle}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = isFirst ? "rgba(14,165,160,0.35)" : "rgba(255,255,255,0.1)"; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 6px 20px rgba(0,0,0,0.35)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = isFirst ? "rgba(14,165,160,0.18)" : "var(--card-border)"; e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; }}
      onPointerDown={(e) => { e.currentTarget.style.transform = "scale(0.98)"; }}
      onPointerUp={(e) => { e.currentTarget.style.transform = ""; }}
      onPointerCancel={(e) => { e.currentTarget.style.transform = ""; }}
    >
      {inner}
    </button>
  );
}

function TrendingStrip({ label, items }: { label: string; items: SpotlightItem[] }) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginBottom: "22px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "11px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor" style={{ color: "#fbbf24" }}>
            <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" />
          </svg>
          <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-tertiary)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
            {label}
          </span>
        </div>
      </div>
      <div style={{ display: "flex", gap: "10px", overflowX: "auto", paddingBottom: "6px", scrollbarWidth: "none" }}>
        {items.map((item, i) => (
          <SpotlightCard key={item.id} item={item} rank={i} />
        ))}
      </div>
    </div>
  );
}

// ─── Strategy card ────────────────────────────────────────────────────────────

function StrategyCard({ s, onLike, onSave, onFollow, onComment, onCopy, onPreview }: {
  s: StrategyRow;
  onLike: (id: string) => void;
  onSave: (id: string) => void;
  onFollow: (userId: string) => void;
  onComment: (id: string) => void;
  onCopy: (id: string) => Promise<void>;
  onPreview: (s: StrategyRow) => void;
}) {
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);

  return (
    <div
      style={{
        background: "var(--card-bg)", border: "1px solid var(--card-border)",
        borderRadius: "var(--radius-lg)", padding: "14px 16px",
        display: "flex", flexDirection: "column", gap: "10px",
        transition: "border-color 140ms ease, background 140ms ease, transform 140ms ease, box-shadow 140ms ease",
        cursor: "default",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.1)";
        (e.currentTarget as HTMLElement).style.background = "var(--card-hover)";
        (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)";
        (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.3)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "var(--card-border)";
        (e.currentTarget as HTMLElement).style.background = "var(--card-bg)";
        (e.currentTarget as HTMLElement).style.transform = "";
        (e.currentTarget as HTMLElement).style.boxShadow = "";
      }}
    >
      {/* Name + badges */}
      <div>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px", marginBottom: "6px" }}>
          <button
            type="button"
            onClick={() => onPreview(s)}
            aria-label={`Open strategy: ${s.name}`}
            style={{
              background: "none", border: "none", padding: 0, cursor: "pointer",
              textAlign: "left", fontFamily: "inherit", flex: 1, minWidth: 0,
            }}
          >
            <h3 style={{
              fontFamily: "var(--font-display)", fontSize: "14px", fontWeight: 600,
              color: "var(--text-primary)", lineHeight: 1.25,
              transition: "color 120ms ease",
            }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#7fd9d4"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
            >
              {s.name}
            </h3>
          </button>
          {s.return_pct != null && (
            <div title={s.return_since ? `Since ${new Date(s.return_since + "T12:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" })}` : "Verified return"} style={{
              display: "flex", alignItems: "center", gap: "3px", flexShrink: 0,
              padding: "3px 7px", borderRadius: "var(--radius-full)",
              background: s.return_pct >= 0 ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
              border: `1px solid ${s.return_pct >= 0 ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.25)"}`,
              color: s.return_pct >= 0 ? "#34d399" : "#f87171",
              fontSize: "11px", fontFamily: "var(--font-mono)", fontWeight: 700,
            }}>
              {s.return_pct >= 0 ? "↑" : "↓"}{Math.abs(s.return_pct).toFixed(1)}%
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
          {s.is_official && <OfficialBadge />}
          <RiskBadge risk={s.risk_level} />
          <StyleBadge style={s.style} />
          {s.is_own && <OwnBadge />}
        </div>
      </div>

      {/* Description (1 line) */}
      {s.description && (
        <p style={{
          fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.5,
          overflow: "hidden", display: "-webkit-box",
          WebkitLineClamp: 1, WebkitBoxOrient: "vertical",
          margin: 0,
        }}>
          {s.description}
        </p>
      )}

      {/* Author row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
        <Link href={`/${s.author.username}`} style={{ display: "flex", alignItems: "center", gap: "7px", textDecoration: "none", minWidth: 0 }}>
          <Avatar username={s.author.username} color={s.author.avatar_color} size={22} />
          <span style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {s.author.display_name || s.author.username}
          </span>
        </Link>
        {!s.is_own && (
          <button type="button" onClick={(e) => { e.stopPropagation(); onFollow(s.author.user_id); }}
            style={{
              padding: "3px 9px", borderRadius: "var(--radius-full)", fontSize: "11px", fontWeight: 500, flexShrink: 0,
              background: s.author.is_following ? "transparent" : "rgba(14,165,160,0.1)",
              border: `1px solid ${s.author.is_following ? "var(--card-border)" : "rgba(14,165,160,0.25)"}`,
              color: s.author.is_following ? "var(--text-tertiary)" : "#7fd9d4",
              cursor: "pointer", fontFamily: "var(--font-body)",
              transition: "color 150ms ease, background 150ms ease",
            }}
            onPointerDown={(e) => { e.currentTarget.style.transform = "scale(0.96)"; }}
            onPointerUp={(e) => { e.currentTarget.style.transform = ""; }}
            onPointerCancel={(e) => { e.currentTarget.style.transform = ""; }}
          >
            {s.author.is_following ? "Following" : "Follow"}
          </button>
        )}
      </div>

      {/* Footer */}
      <div style={{ display: "flex", alignItems: "center", gap: "4px", paddingTop: "9px", borderTop: "1px solid var(--border-subtle)" }}>
        <button type="button" onClick={(e) => { e.stopPropagation(); onLike(s.id); }}
          style={{
            display: "flex", alignItems: "center", gap: "4px", padding: "4px 7px", borderRadius: "var(--radius-md)",
            fontSize: "11px", fontWeight: 500,
            background: s.is_liked ? "rgba(255,92,92,0.08)" : "none",
            border: `1px solid ${s.is_liked ? "rgba(255,92,92,0.2)" : "transparent"}`,
            color: s.is_liked ? "#ff5c5c" : "var(--text-tertiary)",
            cursor: "pointer", fontFamily: "var(--font-body)", transition: "color 150ms ease, background 150ms ease",
          }}
          onPointerDown={(e) => { e.currentTarget.style.transform = "scale(0.94)"; }}
          onPointerUp={(e) => { e.currentTarget.style.transform = ""; }}
          onPointerCancel={(e) => { e.currentTarget.style.transform = ""; }}
        >
          <svg width="12" height="12" viewBox="0 0 20 20" fill={s.is_liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5">
            <path d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" />
          </svg>
          <span className="num" style={{ fontSize: "11px" }}>{s.likes_count}</span>
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: "4px", padding: "4px 6px", fontSize: "11px", color: "var(--text-muted)" }}>
          <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor">
            <path d="M7 9a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H9a2 2 0 01-2-2V9z" />
            <path d="M5 3a2 2 0 00-2 2v6a2 2 0 002 2V5h8a2 2 0 00-2-2H5z" />
          </svg>
          <span className="num">{s.copies_count}</span>
        </div>

        {s.finn_confidence != null && (
          <div style={{
            display: "flex", alignItems: "center", gap: "3px",
            padding: "2px 7px", borderRadius: "5px",
            background: "rgba(109,40,217,0.08)", border: "1px solid rgba(109,40,217,0.18)",
            fontSize: "10px", fontFamily: "var(--font-mono)", fontWeight: 700,
            color: "#8b5cf6", flexShrink: 0,
          }}>
            {s.finn_confidence}
          </div>
        )}

        {s.monthly_return_pct != null && (
          <div title="30-day return" style={{
            display: "flex", alignItems: "center", gap: "2px",
            padding: "2px 6px", borderRadius: "5px",
            background: s.monthly_return_pct >= 0 ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)",
            border: `1px solid ${s.monthly_return_pct >= 0 ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)"}`,
            fontSize: "10px", fontFamily: "var(--font-mono)", fontWeight: 700,
            color: s.monthly_return_pct >= 0 ? "#34d399" : "#f87171", flexShrink: 0,
          }}>
            {s.monthly_return_pct >= 0 ? "+" : ""}{s.monthly_return_pct.toFixed(1)}% 30d
          </div>
        )}

        <div style={{ flex: 1 }} />

        <button type="button" onClick={(e) => { e.stopPropagation(); onComment(s.id); }}
          title="Comment"
          style={{
            display: "flex", alignItems: "center", padding: "4px 6px", borderRadius: "var(--radius-md)",
            background: "none", border: "1px solid transparent",
            color: "var(--text-muted)", cursor: "pointer", transition: "color 150ms ease, border-color 150ms ease",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; e.currentTarget.style.borderColor = "var(--card-border)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.borderColor = "transparent"; }}
          onPointerDown={(e) => { e.currentTarget.style.transform = "scale(0.94)"; }}
          onPointerUp={(e) => { e.currentTarget.style.transform = ""; }}
          onPointerCancel={(e) => { e.currentTarget.style.transform = ""; }}
        >
          <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2 5a2 2 0 012-2h12a2 2 0 012 2v8a2 2 0 01-2 2H7l-5 3V5z" />
          </svg>
        </button>

        {!s.is_own && (
          <button type="button" onClick={(e) => { e.stopPropagation(); onSave(s.id); }}
            title={s.is_saved ? "Remove from saved" : "Save"}
            style={{
              display: "flex", alignItems: "center", gap: "4px", padding: "4px 8px", borderRadius: "var(--radius-md)",
              fontSize: "11px", fontWeight: 500,
              background: s.is_saved ? "rgba(14,165,160,0.1)" : "none",
              border: `1px solid ${s.is_saved ? "rgba(14,165,160,0.25)" : "var(--card-border)"}`,
              color: s.is_saved ? "#7fd9d4" : "var(--text-tertiary)",
              cursor: "pointer", fontFamily: "var(--font-body)", transition: "color 150ms ease, background 150ms ease",
            }}
            onPointerDown={(e) => { e.currentTarget.style.transform = "scale(0.94)"; }}
            onPointerUp={(e) => { e.currentTarget.style.transform = ""; }}
            onPointerCancel={(e) => { e.currentTarget.style.transform = ""; }}
          >
            <svg width="11" height="11" viewBox="0 0 20 20" fill={s.is_saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5">
              <path d="M5 3a2 2 0 00-2 2v12l7-3 7 3V5a2 2 0 00-2-2H5z" />
            </svg>
            {s.is_saved ? "Saved" : "Save"}
          </button>
        )}

        {!s.is_own && (
          <button type="button"
            onClick={async (e) => {
              e.stopPropagation();
              if (copying || copied) return;
              setCopying(true);
              try { await onCopy(s.id); setCopied(true); setTimeout(() => setCopied(false), 3000); }
              finally { setCopying(false); }
            }}
            style={{
              display: "flex", alignItems: "center", gap: "4px", padding: "4px 8px", borderRadius: "var(--radius-md)",
              fontSize: "11px", fontWeight: 500,
              background: copied ? "rgba(0,211,149,0.1)" : "none",
              border: `1px solid ${copied ? "rgba(0,211,149,0.25)" : "var(--card-border)"}`,
              color: copied ? "var(--green)" : "var(--text-tertiary)",
              cursor: copying ? "not-allowed" : "pointer", opacity: copying ? 0.6 : 1,
              fontFamily: "var(--font-body)", transition: "color 150ms ease, background 150ms ease, opacity 150ms ease",
            }}
            onPointerDown={(e) => { if (!copying) e.currentTarget.style.transform = "scale(0.94)"; }}
            onPointerUp={(e) => { e.currentTarget.style.transform = ""; }}
            onPointerCancel={(e) => { e.currentTarget.style.transform = ""; }}
          >
            {copied ? "Copied" : copying ? "..." : "Template"}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Comment box ──────────────────────────────────────────────────────────────

function CommentBox({ onSubmit, onCancel }: { onSubmit: (text: string) => Promise<void>; onCancel: () => void }) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  return (
    <div style={{ marginTop: "6px", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "12px 14px" }}>
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Share your thoughts..." rows={3} maxLength={1000} autoFocus
        style={{ width: "100%", background: "transparent", border: "none", outline: "none", color: "var(--text-primary)", fontSize: "13px", fontFamily: "var(--font-body)", resize: "none", lineHeight: 1.6 }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px", paddingTop: "8px", borderTop: "1px solid var(--border-subtle)" }}>
        <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>{text.length}/1000</span>
        <div style={{ display: "flex", gap: "6px" }}>
          <button type="button" onClick={onCancel}
            style={{ padding: "5px 12px", background: "none", border: "1px solid var(--card-border)", borderRadius: "var(--radius-md)", color: "var(--text-muted)", fontSize: "12px", cursor: "pointer", fontFamily: "var(--font-body)" }}
          >Cancel</button>
          <button type="button" onClick={async () => { if (!text.trim() || submitting) return; setSubmitting(true); await onSubmit(text); setSubmitting(false); }}
            disabled={!text.trim() || submitting}
            style={{ padding: "5px 14px", background: "var(--brand-gradient)", border: "none", borderRadius: "var(--radius-md)", color: "#fff", fontSize: "12px", fontWeight: 600, cursor: !text.trim() || submitting ? "not-allowed" : "pointer", opacity: !text.trim() || submitting ? 0.5 : 1, fontFamily: "var(--font-body)" }}
          >{submitting ? "Posting..." : "Post"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Leaderboard types ────────────────────────────────────────────────────────

type LbStrategyItem = {
  id: string;
  name: string;
  style: string | null;
  risk_level: string | null;
  likes_count: number;
  copies_count: number;
  finn_confidence: number | null;
  author: { user_id: string; username: string; display_name: string | null; avatar_color: string };
};

type LbPortfolioItem = {
  id: string;
  public_name: string;
  risk_level: string | null;
  follower_count: number;
  copy_count: number;
  author: { user_id: string; username: string; avatar_color: string };
};

// ─── Market Pulse card ────────────────────────────────────────────────────────

function MarketPulseCard() {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetch("/api/community/market-pulse")
      .then(r => r.json())
      .then(d => setContent(d.content ?? null))
      .catch(() => setContent(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{
      padding: "14px 16px", marginBottom: "24px",
      background: "rgba(14,165,160,0.04)",
      border: "1px solid rgba(14,165,160,0.14)",
      borderRadius: "var(--radius-lg)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
        <div style={{
          width: "20px", height: "20px", borderRadius: "6px",
          background: "rgba(14,165,160,0.12)", border: "1px solid rgba(14,165,160,0.2)",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#93c5fd" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
        </div>
        <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#7fd9d4" }}>
          Atlas&apos;s Market Pulse
        </span>
        <span style={{ fontSize: "10px", color: "var(--text-muted)", marginLeft: "auto" }}>
          {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </span>
      </div>
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
          <div style={{ height: "12px", borderRadius: "4px", background: "var(--surface-006)", width: "88%" }} />
          <div style={{ height: "12px", borderRadius: "4px", background: "var(--surface-006)", width: "65%" }} />
        </div>
      ) : content ? (
        <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.65, margin: 0 }}>
          {content}
        </p>
      ) : (
        <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: 0 }}>
          Commentary unavailable right now.
        </p>
      )}
      <p style={{ fontSize: "10px", color: "var(--text-muted)", margin: "8px 0 0", fontStyle: "italic" }}>
        AI-generated educational commentary. Not financial advice.
      </p>
    </div>
  );
}

// ─── Leaderboard row ──────────────────────────────────────────────────────────

function LeaderboardRow({ rank, name, sub, pct, author, onClick, href }: {
  rank: number;
  name: string;
  sub: string;
  pct: number;
  author: { username: string; avatar_color: string };
  onClick?: () => void;
  href?: string;
}) {
  const rankColors = ["#fbbf24", "#94a3b8", "#cd7c3e"];
  const isGold = rank === 0;
  const rankColor = rank < 3 ? rankColors[rank] : "var(--text-muted)";
  const barColor = isGold ? "#fbbf24" : rank === 1 ? "#94a3b8" : rank === 2 ? "#cd7c3e" : "rgba(14,165,160,0.5)";

  const inner = (
    <div style={{
      display: "flex", alignItems: "center", gap: "10px",
      padding: "9px 12px",
      background: isGold ? "rgba(251,191,36,0.04)" : "var(--card-bg)",
      border: `1px solid ${isGold ? "rgba(251,191,36,0.15)" : "var(--card-border)"}`,
      borderRadius: "var(--radius-md)", marginBottom: "6px",
      transition: "border-color 120ms ease, background 120ms ease",
    }}>
      <span style={{
        fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 700,
        color: rankColor, minWidth: "18px", flexShrink: 0, textAlign: "center",
      }}>
        {rank + 1}
      </span>
      <Avatar username={author.username} color={author.avatar_color} size={22} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "4px" }}>
        <span style={{
          fontSize: "12px", fontWeight: 600, color: "var(--text-primary)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {name}
        </span>
        <div style={{ height: "2px", background: "var(--surface-005)", borderRadius: "2px", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.max(pct, 4)}%`, background: barColor, borderRadius: "2px" }} />
        </div>
      </div>
      <span style={{
        fontSize: "10px", color: "var(--text-muted)", flexShrink: 0,
        fontFamily: "var(--font-mono)", textAlign: "right",
        maxWidth: "72px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {sub}
      </span>
    </div>
  );

  const hoverIn = (el: HTMLElement) => {
    const row = el.tagName === "A" || el.tagName === "BUTTON" ? (el.firstChild as HTMLElement) : el;
    if (row) row.style.borderColor = isGold ? "rgba(251,191,36,0.3)" : "rgba(255,255,255,0.1)";
  };
  const hoverOut = (el: HTMLElement) => {
    const row = el.tagName === "A" || el.tagName === "BUTTON" ? (el.firstChild as HTMLElement) : el;
    if (row) row.style.borderColor = isGold ? "rgba(251,191,36,0.15)" : "var(--card-border)";
  };

  if (href) return (
    <Link href={href} style={{ textDecoration: "none", display: "block" }}
      onMouseEnter={(e) => hoverIn(e.currentTarget as HTMLElement)}
      onMouseLeave={(e) => hoverOut(e.currentTarget as HTMLElement)}
    >
      {inner}
    </Link>
  );
  if (onClick) return (
    <button type="button" onClick={onClick} style={{ width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}
      onMouseEnter={(e) => hoverIn(e.currentTarget as HTMLElement)}
      onMouseLeave={(e) => hoverOut(e.currentTarget as HTMLElement)}
    >
      {inner}
    </button>
  );
  return inner;
}

// ─── Leaderboard section ──────────────────────────────────────────────────────

function LeaderboardSection({ lbStrategies, lbPortfolios, onPreviewStrategy }: {
  lbStrategies: LbStrategyItem[];
  lbPortfolios: LbPortfolioItem[];
  onPreviewStrategy: (s: LbStrategyItem) => void;
}) {
  const topStrategies = useMemo(() =>
    [...lbStrategies]
      .sort((a, b) => (b.likes_count * 2 + b.copies_count * 3) - (a.likes_count * 2 + a.copies_count * 3))
      .slice(0, 8),
    [lbStrategies]
  );

  const topPortfolios = useMemo(() =>
    [...lbPortfolios]
      .sort((a, b) => (b.follower_count + b.copy_count * 2) - (a.follower_count + a.copy_count * 2))
      .slice(0, 6),
    [lbPortfolios]
  );

  const topInvestors = useMemo(() => {
    const map = new Map<string, { score: number; count: number; author: LbStrategyItem["author"] }>();
    for (const s of lbStrategies) {
      const score = s.likes_count * 2 + s.copies_count * 3;
      const existing = map.get(s.author.user_id);
      if (existing) { existing.score += score; existing.count++; }
      else map.set(s.author.user_id, { score, count: 1, author: s.author });
    }
    return [...map.entries()]
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, 6);
  }, [lbStrategies]);

  const maxStratScore = topStrategies[0] ? topStrategies[0].likes_count * 2 + topStrategies[0].copies_count * 3 : 1;
  const maxPortScore = topPortfolios[0] ? topPortfolios[0].follower_count + topPortfolios[0].copy_count * 2 : 1;
  const maxInvScore = topInvestors[0]?.[1].score ?? 1;

  return (
    <div style={{ paddingTop: "20px", display: "flex", flexDirection: "column", gap: "28px" }}>
      <MarketPulseCard />

      {/* Top Strategies */}
      <section>
        <div style={{ display: "flex", alignItems: "baseline", gap: "6px", marginBottom: "12px" }}>
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
            Top Strategies
          </h3>
          <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>by engagement</span>
        </div>
        {topStrategies.length === 0 ? (
          <div style={{ fontSize: "12px", color: "var(--text-muted)", padding: "12px 0" }}>No public strategies yet.</div>
        ) : topStrategies.map((s, i) => {
          const score = s.likes_count * 2 + s.copies_count * 3;
          return (
            <LeaderboardRow
              key={s.id}
              rank={i}
              name={s.name}
              sub={`${s.likes_count} likes`}
              pct={maxStratScore > 0 ? (score / maxStratScore) * 100 : 0}
              author={s.author}
              onClick={() => onPreviewStrategy(s)}
            />
          );
        })}
      </section>

      {/* Two-column: Portfolios + Investors */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "28px" }}>
        <section>
          <div style={{ display: "flex", alignItems: "baseline", gap: "6px", marginBottom: "12px" }}>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
              Top Portfolios
            </h3>
            <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>by followers</span>
          </div>
          {topPortfolios.length === 0 ? (
            <div style={{ fontSize: "12px", color: "var(--text-muted)", padding: "12px 0" }}>No public portfolios yet.</div>
          ) : topPortfolios.map((p, i) => {
            const score = p.follower_count + p.copy_count * 2;
            return (
              <LeaderboardRow
                key={p.id}
                rank={i}
                name={p.public_name}
                sub={`${p.follower_count} followers`}
                pct={maxPortScore > 0 ? (score / maxPortScore) * 100 : 0}
                author={p.author}
                href={`/community/portfolios/${p.id}`}
              />
            );
          })}
        </section>
        <section>
          <div style={{ display: "flex", alignItems: "baseline", gap: "6px", marginBottom: "12px" }}>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
              Top Investors
            </h3>
            <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>by strategy score</span>
          </div>
          {topInvestors.length === 0 ? (
            <div style={{ fontSize: "12px", color: "var(--text-muted)", padding: "12px 0" }}>No strategy authors yet.</div>
          ) : topInvestors.map(([userId, data], i) => (
            <LeaderboardRow
              key={userId}
              rank={i}
              name={data.author.display_name || data.author.username}
              sub={`${data.count} ${data.count === 1 ? "strategy" : "strategies"}`}
              pct={maxInvScore > 0 ? (data.score / maxInvScore) * 100 : 0}
              author={data.author}
              href={`/${data.author.username}`}
            />
          ))}
        </section>
      </div>
    </div>
  );
}

// ─── Allocation bar ───────────────────────────────────────────────────────────

function AllocationBar({ holdings }: { holdings: PortfolioHolding[] }) {
  const nonCash = holdings.filter((h) => !h.is_cash).slice(0, 5);
  const cash = holdings.find((h) => h.is_cash);
  const shown = [...nonCash, ...(cash ? [cash] : [])];
  const shownSum = shown.reduce((s, h) => s + h.allocation_pct, 0);
  const rest = Math.max(0, 100 - shownSum);
  return (
    <div style={{ display: "flex", height: "4px", borderRadius: "3px", overflow: "hidden", gap: "1px", width: "100%" }}>
      {nonCash.map((h, i) => (
        <div key={h.ticker} title={`${h.ticker} ${h.allocation_pct.toFixed(1)}%`}
          style={{ height: "100%", width: `${h.allocation_pct}%`, background: ALLOC_COLORS[i % ALLOC_COLORS.length], borderRadius: i === 0 ? "3px 0 0 3px" : "0", flexShrink: 0 }}
        />
      ))}
      {cash && <div title={`Cash ${cash.allocation_pct.toFixed(1)}%`} style={{ height: "100%", width: `${cash.allocation_pct}%`, background: ALLOC_CASH_COLOR, flexShrink: 0 }} />}
      {rest > 0.5 && <div style={{ height: "100%", flex: 1, background: ALLOC_REST_COLOR, borderRadius: "0 3px 3px 0", minWidth: "2px" }} />}
    </div>
  );
}

// ─── Portfolio card ───────────────────────────────────────────────────────────

function PortfolioCard({ p, onFollow, onCopy }: { p: PortfolioRow; onFollow: (id: string) => void; onCopy: (id: string) => Promise<void> }) {
  const [copying, setCopying] = useState(false);
  const rs = riskColor(p.risk_level);
  const nonCash = p.holdings.filter((h) => !h.is_cash);
  const cash = p.holdings.find((h) => h.is_cash);
  const topHoldings = nonCash.slice(0, 3);
  const moreCount = nonCash.length - topHoldings.length;

  const relativeTime = (() => {
    if (!p.last_synced_at) return null;
    const diff = Date.now() - new Date(p.last_synced_at).getTime();
    const h = Math.floor(diff / 3600000);
    const d = Math.floor(diff / 86400000);
    if (h < 1) return "just now";
    if (h < 24) return `${h}h ago`;
    if (d < 30) return `${d}d ago`;
    return new Date(p.last_synced_at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  })();

  return (
    <div
      style={{
        background: "var(--card-bg)", border: "1px solid var(--card-border)",
        borderRadius: "var(--radius-lg)", padding: "15px 16px",
        display: "flex", flexDirection: "column", gap: "11px",
        transition: "border-color 140ms ease, background 140ms ease, transform 140ms ease, box-shadow 140ms ease",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.1)";
        (e.currentTarget as HTMLElement).style.background = "var(--card-hover)";
        (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)";
        (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.3)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "var(--card-border)";
        (e.currentTarget as HTMLElement).style.background = "var(--card-bg)";
        (e.currentTarget as HTMLElement).style.transform = "";
        (e.currentTarget as HTMLElement).style.boxShadow = "";
      }}
    >
      <AllocationBar holdings={p.holdings} />

      <div>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px", marginBottom: "7px" }}>
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.25, flex: 1 }}>
            {p.public_name}
          </h3>
          <div style={{ display: "flex", gap: "5px", alignItems: "center", flexShrink: 0 }}>
            {p.is_own && <OwnBadge />}
            <span
              title="Only allocation percentages are shared. Dollar amounts, cost basis, and account balance are never visible."
              style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", padding: "2px 6px", borderRadius: "var(--radius-full)", background: "var(--surface-004)", border: "1px solid var(--line-008)", color: "var(--text-muted)", cursor: "help" }}
            >
              % only
            </span>
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
          <RiskBadge risk={p.risk_level} />
          <StyleBadge style={p.style} />
        </div>
      </div>

      {p.public_description && (
        <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", margin: 0 }}>
          {p.public_description}
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
        {topHoldings.map((h, i) => (
          <div key={h.ticker} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ width: "7px", height: "7px", borderRadius: "2px", background: ALLOC_COLORS[i % ALLOC_COLORS.length], flexShrink: 0 }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 500, color: "var(--text-secondary)", letterSpacing: "-0.2px", flexShrink: 0, width: "38px" }}>{h.ticker}</span>
            <div style={{ flex: 1, height: "3px", borderRadius: "2px", background: "var(--surface-006)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.min(h.allocation_pct, 100)}%`, background: ALLOC_COLORS[i % ALLOC_COLORS.length], borderRadius: "2px" }} />
            </div>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 500, color: "var(--text-primary)", letterSpacing: "-0.2px", flexShrink: 0, minWidth: "38px", textAlign: "right" }}>{h.allocation_pct.toFixed(1)}%</span>
          </div>
        ))}
        {(moreCount > 0 || cash) && (
          <div style={{ display: "flex", gap: "10px", marginTop: "1px" }}>
            {moreCount > 0 && <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>+{moreCount} more</span>}
            {cash && <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>Cash <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>{cash.allocation_pct.toFixed(1)}%</span></span>}
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
        <Link href={`/${p.author.username}`} style={{ display: "flex", alignItems: "center", gap: "7px", textDecoration: "none", minWidth: 0 }}>
          <Avatar username={p.author.username} color={p.author.avatar_color} size={20} />
          <span style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {p.author.display_name || p.author.username}
          </span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
          {relativeTime && <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>{relativeTime}</span>}
          <span style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{p.follower_count} following</span>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "6px", paddingTop: "9px", borderTop: "1px solid var(--border-subtle)" }}>
        <Link
          href={`/community/portfolios/${p.id}`}
          style={{ display: "flex", alignItems: "center", gap: "4px", padding: "5px 10px", borderRadius: "var(--radius-md)", fontSize: "11px", fontWeight: 500, textDecoration: "none", background: "none", border: "1px solid var(--card-border)", color: "var(--text-secondary)", transition: "color 150ms ease, border-color 150ms ease" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.15)"; (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--card-border)"; (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}
        >
          Preview
        </Link>
        <div style={{ flex: 1 }} />
        {!p.is_own && (
          <button type="button" onClick={(e) => { e.stopPropagation(); onFollow(p.id); }}
            style={{
              padding: "5px 11px", borderRadius: "var(--radius-full)", fontSize: "11px", fontWeight: 500,
              background: p.is_following ? "transparent" : "rgba(14,165,160,0.1)",
              border: `1px solid ${p.is_following ? "var(--card-border)" : "rgba(14,165,160,0.25)"}`,
              color: p.is_following ? "var(--text-tertiary)" : "#7fd9d4",
              cursor: "pointer", fontFamily: "var(--font-body)", transition: "color 150ms ease, background 150ms ease",
            }}
            onPointerDown={(e) => { e.currentTarget.style.transform = "scale(0.95)"; }}
            onPointerUp={(e) => { e.currentTarget.style.transform = ""; }}
            onPointerCancel={(e) => { e.currentTarget.style.transform = ""; }}
          >
            {p.is_following ? "Following" : "Follow"}
          </button>
        )}
        {!p.is_own && (
          <button type="button"
            onClick={async (e) => { e.stopPropagation(); if (copying) return; setCopying(true); try { await onCopy(p.id); } finally { setCopying(false); } }}
            style={{
              display: "flex", alignItems: "center", gap: "4px", padding: "5px 11px", borderRadius: "var(--radius-md)",
              fontSize: "11px", fontWeight: 500,
              background: "rgba(14,165,160,0.08)", border: "1px solid rgba(14,165,160,0.2)", color: "#7fd9d4",
              cursor: copying ? "not-allowed" : "pointer", opacity: copying ? 0.6 : 1,
              fontFamily: "var(--font-body)", transition: "opacity 150ms ease",
            }}
            onPointerDown={(e) => { if (!copying) e.currentTarget.style.transform = "scale(0.95)"; }}
            onPointerUp={(e) => { e.currentTarget.style.transform = ""; }}
            onPointerCancel={(e) => { e.currentTarget.style.transform = ""; }}
          >
            {copying ? "..." : "Copy"}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CommunityClient({
  strategies: initialStrategies,
  currentUserId,
  initialSort, initialStyle, initialRisk, initialQuery,
  initialSection,
  portfolios: initialPortfolios,
  initialPSort, initialPRisk, initialPQuery,
  initialMine,
  followingIds: followingIdsArray,
  trendingStrategies: initialTrendingStrategies,
  trendingPortfolios,
  leaderboardStrategies,
  leaderboardPortfolios,
  feedPosts,
  feedMe,
  feedMyStrategies,
  feedMyPortfolios,
  mostHeld,
}: {
  strategies: StrategyRow[];
  currentUserId: string;
  initialSort: string; initialStyle: string; initialRisk: string; initialQuery: string;
  initialSection: string;
  portfolios: PortfolioRow[];
  initialPSort: string; initialPRisk: string; initialPQuery: string;
  initialMine: boolean;
  followingIds: string[];
  trendingStrategies: TrendingStrategyItem[];
  trendingPortfolios: TrendingPortfolioItem[];
  leaderboardStrategies: LbStrategyItem[];
  leaderboardPortfolios: LbPortfolioItem[];
  feedPosts: FeedPost[];
  feedMe: FeedAuthor;
  feedMyStrategies: MyOption[];
  feedMyPortfolios: MyOption[];
  mostHeld: { ticker: string; company: string | null; count: number }[];
}) {
  const router = useRouter();
  const [strategies, setStrategies]       = useState(initialStrategies);
  const [portfolios, setPortfolios]       = useState(initialPortfolios);
  const [trendingStrats, setTrendingStrats] = useState(initialTrendingStrategies);
  const [section, setSection]             = useState(initialSection);
  const [mine, setMine]                   = useState(initialMine);
  const [commentingId, setCommentingId]   = useState<string | null>(null);
  const [isPending, startTransition]      = useTransition();
  const [search, setSearch]               = useState(initialQuery);
  const [pSearch, setPSearch]             = useState(initialPQuery);
  const [copyToast, setCopyToast]         = useState<CopyToast>(null);
  const [previewStrategy, setPreviewStrategy] = useState<StrategyPreview | null>(null);

  // Animated tab indicator
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });
  useLayoutEffect(() => {
    const btn = tabRefs.current[section];
    if (btn) setIndicator({ left: btn.offsetLeft, width: btn.offsetWidth });
  }, [section]);

  const followingSet = new Set(followingIdsArray);

  function updateUrl(params: Record<string, string>) {
    const sp = new URLSearchParams(window.location.search);
    Object.entries(params).forEach(([k, v]) => (v ? sp.set(k, v) : sp.delete(k)));
    router.push(`/community?${sp.toString()}`);
  }

  function handleLike(id: string) {
    const update = <T extends { id: string; is_liked: boolean; likes_count: number }>(prev: T[]): T[] =>
      prev.map(s => s.id === id ? { ...s, is_liked: !s.is_liked, likes_count: s.is_liked ? s.likes_count - 1 : s.likes_count + 1 } : s);
    setStrategies(update);
    setTrendingStrats(update);
    setPreviewStrategy(prev => prev?.id === id ? { ...prev, is_liked: !prev.is_liked, likes_count: prev.is_liked ? prev.likes_count - 1 : prev.likes_count + 1 } : prev);
    startTransition(() => likeStrategy(id));
  }

  function handleSave(id: string) {
    setStrategies(prev => prev.map(s => s.id === id ? { ...s, is_saved: !s.is_saved } : s));
    setTrendingStrats(prev => prev.map(s => s.id === id ? { ...s, is_saved: !s.is_saved } : s));
    setPreviewStrategy(prev => prev?.id === id ? { ...prev, is_saved: !prev.is_saved } : prev);
    startTransition(() => saveStrategy(id));
  }

  function handleFollow(userId: string) {
    const updateFollowing = <T extends { author: { user_id: string; is_following: boolean } }>(prev: T[]): T[] =>
      prev.map(s => s.author.user_id === userId ? { ...s, author: { ...s.author, is_following: !s.author.is_following } } : s);
    setStrategies(updateFollowing);
    setTrendingStrats(updateFollowing);
    setPreviewStrategy(prev => prev?.author.user_id === userId ? { ...prev, author: { ...prev.author, is_following: !prev.author.is_following } } : prev);
    startTransition(() => followUser(userId));
  }

  async function handleCopy(id: string) {
    await copyStrategyAsTemplate(id);
    setCopyToast({ message: "Strategy copied as a template to your Strategies." });
    setTimeout(() => setCopyToast(null), 4500);
  }

  function handleComment(id: string) { setCommentingId(prev => prev === id ? null : id); }
  async function submitComment(strategyId: string, text: string) {
    await postComment(strategyId, text);
    setCommentingId(null);
    router.refresh();
  }

  function handleFollowPortfolio(portfolioId: string) {
    setPortfolios(prev => prev.map(p => p.id === portfolioId ? { ...p, is_following: !p.is_following, follower_count: p.is_following ? p.follower_count - 1 : p.follower_count + 1 } : p));
    startTransition(() => followPublicPortfolio(portfolioId));
  }

  async function handleCopyPortfolio(portfolioId: string) {
    const result = await copyPublicAllocation(portfolioId);
    setCopyToast({ message: "Copied to your portfolios.", portfolioId: result.id });
    setTimeout(() => setCopyToast(null), 4500);
  }

  function handlePreviewStrategy(s: StrategyRow) {
    setPreviewStrategy({
      id: s.id, name: s.name, description: s.description,
      style: s.style, risk_level: s.risk_level,
      likes_count: s.likes_count, copies_count: s.copies_count,
      finn_confidence: s.finn_confidence,
      return_pct: s.return_pct, return_since: s.return_since,
      is_official: s.is_official, monthly_return_pct: s.monthly_return_pct,
      is_liked: s.is_liked, is_saved: s.is_saved, is_own: s.is_own,
      author: { user_id: s.author.user_id, username: s.author.username, display_name: s.author.display_name, avatar_color: s.author.avatar_color, is_following: s.author.is_following },
    });
  }

  function handlePreviewTrendingStrategy(item: TrendingStrategyItem) {
    // Prefer the full StrategyRow if it's in the current page
    const full = strategies.find(s => s.id === item.id);
    if (full) { handlePreviewStrategy(full); return; }
    setPreviewStrategy({
      id: item.id, name: item.name, description: item.description,
      style: item.style, risk_level: item.risk_level,
      likes_count: item.likes_count, copies_count: item.copies_count,
      finn_confidence: null,
      return_pct: null, return_since: null,
      is_official: false, monthly_return_pct: null,
      is_liked: item.is_liked, is_saved: item.is_saved, is_own: item.is_own,
      author: { user_id: item.author.user_id, username: item.author.username, display_name: item.author.display_name, avatar_color: item.author.avatar_color, is_following: item.author.is_following },
    });
  }

  function toggleMine() { const next = !mine; setMine(next); updateUrl({ mine: next ? "true" : "" }); }

  // Build spotlight items for trending strips
  const stratSpotlight: SpotlightItem[] = trendingStrats.map(s => ({
    id: s.id, name: s.name, risk_level: s.risk_level, style: s.style,
    statValue: s.copies_count, statLabel: "copies",
    author: s.author,
    ariaLabel: `Open strategy: ${s.name}`,
    onClick: () => handlePreviewTrendingStrategy(s),
  }));

  const portSpotlight: SpotlightItem[] = trendingPortfolios.map(p => ({
    id: p.id, name: p.public_name, risk_level: p.risk_level, style: p.style,
    statValue: p.copy_count, statLabel: "copies",
    author: p.author,
    href: `/community/portfolios/${p.id}`,
    ariaLabel: `View portfolio: ${p.public_name}`,
  }));

  const followingStrategies = strategies.filter(s => !s.is_own && s.author.is_following);
  const followingPortfolios = portfolios.filter(p => !p.is_own && p.author.is_following);

  const TABS = ["feed", "learn", "strategies", "portfolios", "following", "leaderboard"] as const;
  const TAB_LABELS: Record<string, string> = {
    feed: "Feed",
    learn: "Learn",
    strategies: "Strategies",
    portfolios: "Portfolios",
    following: "Following",
    leaderboard: "Leaderboard",
  };

  const dropdownStyle: React.CSSProperties = {
    padding: "5px 10px", background: "var(--card-bg)", border: "1px solid var(--card-border)",
    borderRadius: "var(--radius-full)", color: "var(--text-secondary)",
    fontSize: "11px", fontFamily: "var(--font-body)", outline: "none",
    cursor: "pointer", flexShrink: 0, transition: "border-color 150ms ease",
  };

  return (
    <div style={{ maxWidth: "900px", display: "flex", flexDirection: "column" }}>
      <PageTutorial tutorialId="community" />

      {/* ── Animated tab bar ────────────────────────────────────────────────── */}
      <div style={{ position: "relative", display: "flex", borderBottom: "1px solid var(--border-subtle)", marginBottom: "0" }}>
        {/* Sliding indicator */}
        <div style={{
          position: "absolute", bottom: -1, height: "2px", borderRadius: "2px",
          background: "var(--brand-blue)",
          left: indicator.left, width: indicator.width,
          transition: "left 220ms cubic-bezier(0.23,1,0.32,1), width 220ms cubic-bezier(0.23,1,0.32,1)",
          pointerEvents: "none",
        }} />
        {TABS.map(tab => {
          const isActive = section === tab;
          const badge = tab === "following" ? followingStrategies.length + followingPortfolios.length : 0;
          return (
            <button
              key={tab}
              ref={el => { tabRefs.current[tab] = el; }}
              onClick={() => { setSection(tab); updateUrl({ section: tab }); }}
              style={{
                padding: "11px 16px", fontSize: "13px",
                fontWeight: isActive ? 600 : 400, fontFamily: "var(--font-body)",
                background: "none", border: "none",
                color: isActive ? "var(--text-primary)" : "var(--text-tertiary)",
                cursor: "pointer", whiteSpace: "nowrap",
                transition: "color 150ms ease",
                display: "flex", alignItems: "center", gap: "5px",
              }}
            >
              {TAB_LABELS[tab]}
              {badge > 0 && (
                <span style={{
                  fontSize: "10px", fontWeight: 600,
                  background: isActive ? "rgba(14,165,160,0.15)" : "var(--card-bg)",
                  border: `1px solid ${isActive ? "rgba(14,165,160,0.3)" : "var(--card-border)"}`,
                  color: isActive ? "#7fd9d4" : "var(--text-muted)",
                  padding: "1px 5px", borderRadius: "var(--radius-full)",
                  fontFamily: "var(--font-mono)",
                }}>
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Filter row ──────────────────────────────────────────────────────── */}
      {section !== "following" && section !== "leaderboard" && section !== "feed" && section !== "learn" && (
        <div style={{ padding: "14px 0", display: "flex", flexDirection: "column", gap: "10px", marginBottom: "4px" }}>
          {/* Row 1: search + sort + risk */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <div style={{ position: "relative", flex: "1 1 200px", minWidth: "150px" }}>
              <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor"
                style={{ position: "absolute", left: "11px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }}
              >
                <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
              </svg>
              <input
                type="text"
                value={section === "portfolios" ? pSearch : search}
                onChange={(e) => section === "portfolios" ? setPSearch(e.target.value) : setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key !== "Enter") return; section === "portfolios" ? updateUrl({ pq: pSearch }) : updateUrl({ q: search }); }}
                placeholder={section === "portfolios" ? "Search portfolios..." : "Search strategies..."}
                style={{
                  width: "100%", padding: "7px 12px 7px 30px",
                  background: "var(--card-bg)", border: "1px solid var(--card-border)",
                  borderRadius: "var(--radius-full)", color: "var(--text-primary)",
                  fontSize: "12px", fontFamily: "var(--font-body)", outline: "none",
                  transition: "border-color 150ms ease, box-shadow 150ms ease",
                }}
                onFocus={(e) => { e.target.style.borderColor = "var(--brand-blue)"; e.target.style.boxShadow = "0 0 0 3px rgba(14,165,160,0.1)"; }}
                onBlur={(e) => { e.target.style.borderColor = "var(--card-border)"; e.target.style.boxShadow = "none"; }}
              />
            </div>
            {section === "strategies" && (
              <select value={initialRisk} onChange={(e) => updateUrl({ risk: e.target.value })} style={dropdownStyle}
                onFocus={(e) => { e.target.style.borderColor = "var(--brand-blue)"; }}
                onBlur={(e) => { e.target.style.borderColor = "var(--card-border)"; }}
              >
                <option value="">All risk levels</option>
                <option value="low">Conservative</option>
                <option value="moderate">Moderate</option>
                <option value="high">Aggressive</option>
              </select>
            )}
            {section === "portfolios" && (
              <select value={initialPRisk} onChange={(e) => updateUrl({ prisk: e.target.value })} style={dropdownStyle}
                onFocus={(e) => { e.target.style.borderColor = "var(--brand-blue)"; }}
                onBlur={(e) => { e.target.style.borderColor = "var(--card-border)"; }}
              >
                <option value="">All risk levels</option>
                <option value="Conservative">Conservative</option>
                <option value="Moderate">Moderate</option>
                <option value="Aggressive">Aggressive</option>
              </select>
            )}
          </div>

          {/* Row 2: sort chips + mine */}
          <div style={{ display: "flex", gap: "7px", flexWrap: "wrap", alignItems: "center" }}>
            {section === "strategies" && (
              <>
                <FilterChip active={initialSort === "popular"} label="Popular" onClick={() => updateUrl({ sort: "popular" })} />
                <FilterChip active={initialSort === "newest"} label="Newest" onClick={() => updateUrl({ sort: "newest" })} />
                <FilterChip active={initialSort === "copied"} label="Most copied" onClick={() => updateUrl({ sort: "copied" })} />
                <FilterChip active={initialSort === "finn"} label="Atlas Score" onClick={() => updateUrl({ sort: "finn" })} />
                <FilterChip active={initialSort === "return"} label="Best Return" onClick={() => updateUrl({ sort: "return" })} />
                <FilterChip active={initialSort === "monthly"} label="Monthly" onClick={() => updateUrl({ sort: "monthly" })} />
              </>
            )}
            {section === "portfolios" && (
              <>
                <FilterChip active={initialPSort === "popular"} label="Popular" onClick={() => updateUrl({ psort: "popular" })} />
                <FilterChip active={initialPSort === "newest"} label="Newest" onClick={() => updateUrl({ psort: "newest" })} />
                <FilterChip active={initialPSort === "copied"} label="Most copied" onClick={() => updateUrl({ psort: "copied" })} />
              </>
            )}
            <div style={{ flex: 1 }} />
            {mine ? (
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>Showing your posts</span>
                <button onClick={toggleMine} style={{
                  padding: "3px 8px", borderRadius: "var(--radius-full)", fontSize: "10px", fontWeight: 600,
                  background: "none", border: "1px solid var(--card-border)",
                  color: "var(--text-muted)", cursor: "pointer", fontFamily: "var(--font-body)",
                }}>Clear</button>
              </div>
            ) : (
              <FilterChip active={false} label="Mine" onClick={toggleMine} />
            )}
            <p style={{ fontSize: "11px", color: "var(--text-muted)", margin: 0 }}>
              {section === "portfolios" ? `${portfolios.length} shown` : `${strategies.length} shown`}
            </p>
          </div>
        </div>
      )}

      {/* ── Section content ──────────────────────────────────────────────────── */}

      {section === "feed" ? (
        <CommunityFeed
          me={feedMe}
          initialPosts={feedPosts}
          myFollowIds={followingIdsArray}
          myStrategies={feedMyStrategies}
          myPortfolios={feedMyPortfolios}
        />
      ) : section === "learn" ? (
        <CommunityLearn />
      ) : section === "leaderboard" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        <PeerBenchmarkCard />
        {mostHeld.length > 0 && (
          <div className="bt-card" style={{ padding: "16px 18px" }}>
            <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "2px" }}>📊 Most-held stocks</div>
            <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginBottom: "12px" }}>What the community holds most across public portfolios</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              {mostHeld.map((h, i) => (
                <Link key={h.ticker} href={`/research?ticker=${encodeURIComponent(h.ticker)}`}
                  style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 10px", borderRadius: "8px", textDecoration: "none" }}
                  className="bt-hover-row">
                  <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--text-muted)", width: "18px", flexShrink: 0 }}>{i + 1}</span>
                  <span style={{ fontSize: "13px", fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--brand-blue)", width: "64px", flexShrink: 0 }}>${h.ticker}</span>
                  <span style={{ fontSize: "12px", color: "var(--text-secondary)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.company || ""}</span>
                  <span style={{ fontSize: "11px", color: "var(--text-tertiary)", flexShrink: 0 }}>{h.count} {h.count === 1 ? "portfolio" : "portfolios"}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
        <LeaderboardSection
          lbStrategies={leaderboardStrategies}
          lbPortfolios={leaderboardPortfolios}
          onPreviewStrategy={(s) => setPreviewStrategy({
            id: s.id, name: s.name, description: null,
            style: s.style, risk_level: s.risk_level,
            likes_count: s.likes_count, copies_count: s.copies_count,
            finn_confidence: s.finn_confidence,
            return_pct: null, return_since: null,
            is_official: false, monthly_return_pct: null,
            is_liked: false, is_saved: false, is_own: false,
            author: { user_id: s.author.user_id, username: s.author.username, display_name: s.author.display_name, avatar_color: s.author.avatar_color, is_following: false },
          })}
        />
        </div>
      ) : section === "following" ? (
        followingSet.size === 0 ? (
          /* Empty: no one followed — show suggestions from trending */
          <div style={{ paddingTop: "20px", display: "flex", flexDirection: "column", gap: "24px" }}>
            <div style={{ padding: "28px 24px", textAlign: "center", background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)" }}>
              <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: "rgba(14,165,160,0.08)", border: "1px solid rgba(14,165,160,0.15)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="#93c5fd" strokeWidth="1.5">
                  <path d="M17 20h-2v-2a3 3 0 00-5.356-1.857M7 20H5v-2a3 3 0 015.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h3 style={{ fontFamily: "var(--font-display)", fontSize: "15px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "6px" }}>
                Follow investors to see updates here
              </h3>
              <p style={{ fontSize: "13px", color: "var(--text-tertiary)", maxWidth: "300px", margin: "0 auto 18px", lineHeight: 1.55 }}>
                When you follow someone, their new strategies and portfolio updates appear in this feed.
              </p>
              <div style={{ display: "flex", gap: "8px", justifyContent: "center", flexWrap: "wrap" }}>
                <button type="button" onClick={() => { setSection("strategies"); updateUrl({ section: "strategies" }); }}
                  style={{ padding: "7px 16px", background: "var(--brand-gradient)", border: "none", borderRadius: "var(--radius-md)", color: "#fff", fontSize: "12px", fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)" }}>
                  Browse strategies
                </button>
                <button type="button" onClick={() => { setSection("portfolios"); updateUrl({ section: "portfolios" }); }}
                  style={{ padding: "7px 16px", background: "none", border: "1px solid var(--card-border)", borderRadius: "var(--radius-md)", color: "var(--text-secondary)", fontSize: "12px", cursor: "pointer", fontFamily: "var(--font-body)" }}>
                  Browse portfolios
                </button>
              </div>
            </div>

            {/* Suggestions: trending strategies */}
            {trendingStrats.length > 0 && (
              <div>
                <p style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "12px" }}>
                  Popular right now
                </p>
                <div className="community-grid bt-list-animate">
                  {trendingStrats.slice(0, 4).map(item => {
                    const asFull = strategies.find(s => s.id === item.id);
                    if (!asFull) return null;
                    return (
                      <div key={asFull.id}>
                        <StrategyCard s={asFull} onLike={handleLike} onSave={handleSave} onFollow={handleFollow} onComment={handleComment} onCopy={handleCopy} onPreview={handlePreviewStrategy} />
                        {commentingId === asFull.id && <CommentBox onSubmit={(text) => submitComment(asFull.id, text)} onCancel={() => setCommentingId(null)} />}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : followingStrategies.length === 0 && followingPortfolios.length === 0 ? (
          <div style={{ marginTop: "20px", padding: "48px 24px", textAlign: "center", background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)" }}>
            <p style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>People you follow haven&apos;t shared anything publicly yet.</p>
          </div>
        ) : (
          <div style={{ paddingTop: "20px", display: "flex", flexDirection: "column", gap: "24px" }}>
            {followingStrategies.length > 0 && (
              <div>
                <p style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "12px" }}>Strategies from people you follow</p>
                <div className="community-grid bt-list-animate">
                  {followingStrategies.map(s => (
                    <div key={s.id}>
                      <StrategyCard s={s} onLike={handleLike} onSave={handleSave} onFollow={handleFollow} onComment={handleComment} onCopy={handleCopy} onPreview={handlePreviewStrategy} />
                      {commentingId === s.id && <CommentBox onSubmit={(text) => submitComment(s.id, text)} onCancel={() => setCommentingId(null)} />}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {followingPortfolios.length > 0 && (
              <div>
                <p style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "12px" }}>Portfolios from people you follow</p>
                <div className="community-grid bt-list-animate">
                  {followingPortfolios.map(p => <PortfolioCard key={p.id} p={p} onFollow={handleFollowPortfolio} onCopy={handleCopyPortfolio} />)}
                </div>
              </div>
            )}
          </div>
        )

      ) : section === "portfolios" ? (
        <>
          <div style={{ paddingTop: "6px" }}>
            <TrendingStrip label="Trending portfolios" items={portSpotlight} />
          </div>
          {portfolios.length > 0 ? (
            <div className="community-grid bt-list-animate">
              {portfolios.map(p => <PortfolioCard key={p.id} p={p} onFollow={handleFollowPortfolio} onCopy={handleCopyPortfolio} />)}
            </div>
          ) : (
            <div style={{ padding: "48px 24px", textAlign: "center", background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)" }}>
              <h3 style={{ fontFamily: "var(--font-display)", fontSize: "15px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "6px" }}>
                {mine ? "You haven't shared any portfolios yet" : "No public portfolios yet"}
              </h3>
              <p style={{ fontSize: "13px", color: "var(--text-tertiary)", maxWidth: "300px", margin: "0 auto" }}>
                {mine ? "Publish a portfolio from your Portfolio page." : "Share yours using the Share button at the top."}
              </p>
            </div>
          )}
        </>

      ) : (
        <>
          <div style={{ paddingTop: "6px" }}>
            <TrendingStrip label="Trending strategies" items={stratSpotlight} />
          </div>
          {strategies.length > 0 ? (
            <div className="community-grid bt-list-animate">
              {strategies.map(s => (
                <div key={s.id}>
                  <StrategyCard s={s} onLike={handleLike} onSave={handleSave} onFollow={handleFollow} onComment={handleComment} onCopy={handleCopy} onPreview={handlePreviewStrategy} />
                  {commentingId === s.id && <CommentBox onSubmit={(text) => submitComment(s.id, text)} onCancel={() => setCommentingId(null)} />}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: "48px 24px", textAlign: "center", background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)" }}>
              <h3 style={{ fontFamily: "var(--font-display)", fontSize: "15px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "6px" }}>
                {mine ? "You haven't shared any strategies yet" : "No public strategies yet"}
              </h3>
              <p style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>
                {mine ? "Go to your Strategies page and toggle one public." : "Be the first — go to Strategies and toggle one public."}
              </p>
            </div>
          )}
        </>
      )}

      {/* ── Strategy preview modal ──────────────────────────────────────────── */}
      {previewStrategy && (
        <StrategyPreviewModal
          strategy={previewStrategy}
          onClose={() => setPreviewStrategy(null)}
          onLike={handleLike}
          onSave={handleSave}
          onFollow={handleFollow}
          onCopy={handleCopy}
        />
      )}

      {/* ── Copy toast ──────────────────────────────────────────────────────── */}
      {copyToast && (
        <div style={{
          position: "fixed", bottom: "24px", right: "24px", zIndex: 300,
          background: "var(--bg-elevated)", border: "1px solid rgba(0,211,149,0.2)",
          borderRadius: "var(--radius-md)", padding: "11px 16px",
          display: "flex", alignItems: "center", gap: "10px",
          boxShadow: "0 4px 20px rgba(0,0,0,0.55)", maxWidth: "300px",
        }}>
          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" style={{ color: "var(--green)", flexShrink: 0 }}>
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          <span style={{ fontSize: "12px", color: "var(--text-secondary)", flex: 1 }}>{copyToast.message}</span>
          {copyToast.portfolioId && (
            <Link href={`/portfolios/${copyToast.portfolioId}`}
              style={{ fontSize: "11px", fontWeight: 600, color: "#7fd9d4", textDecoration: "none", flexShrink: 0, padding: "3px 8px", background: "rgba(14,165,160,0.12)", border: "1px solid rgba(14,165,160,0.2)", borderRadius: "var(--radius-md)" }}
            >Open</Link>
          )}
          <button type="button" onClick={() => setCopyToast(null)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "2px", flexShrink: 0, display: "flex", alignItems: "center" }}
          >
            <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
