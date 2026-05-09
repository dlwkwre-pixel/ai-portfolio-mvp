"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { likeStrategy, saveStrategy, followUser, postComment, copyStrategyAsTemplate } from "./social-actions";
import { followPublicPortfolio, copyPublicAllocation } from "./portfolio-actions";

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
  created_at: string;
  is_own: boolean;
  is_liked: boolean;
  is_saved: boolean;
  author: Author;
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

type TrendingStrategyItem = {
  id: string;
  name: string;
  style: string | null;
  risk_level: string | null;
  copies_count: number;
  likes_count: number;
  is_liked: boolean;
  author: { user_id: string; username: string; avatar_color: string };
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

type CopyToast = { message: string; portfolioId?: string } | null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function riskColor(r: string | null) {
  if (!r) return { bg: "var(--card-bg)", border: "var(--card-border)", color: "var(--text-tertiary)" };
  const l = r.toLowerCase();
  if (["low", "conservative"].includes(l)) return { bg: "var(--green-bg)", border: "var(--green-border)", color: "var(--green)" };
  if (["high", "aggressive"].includes(l))  return { bg: "var(--red-bg)",   border: "var(--red-border)",   color: "var(--red)" };
  return { bg: "var(--amber-bg)", border: "var(--amber-border)", color: "var(--amber)" };
}

// ─── Primitive components ─────────────────────────────────────────────────────

function SectionTab({ active, label, count, onClick }: { active: boolean; label: string; count?: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "10px 16px",
        fontSize: "13px",
        fontWeight: active ? 600 : 400,
        fontFamily: "var(--font-body)",
        background: "none",
        border: "none",
        borderBottom: `2px solid ${active ? "var(--brand-blue)" : "transparent"}`,
        color: active ? "var(--text-primary)" : "var(--text-tertiary)",
        cursor: "pointer",
        whiteSpace: "nowrap",
        transition: "color 150ms ease",
        marginBottom: "-1px",
        display: "flex",
        alignItems: "center",
        gap: "5px",
      }}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span style={{
          fontSize: "9px", fontWeight: 600,
          background: active ? "rgba(37,99,235,0.15)" : "var(--card-bg)",
          border: `1px solid ${active ? "rgba(37,99,235,0.3)" : "var(--card-border)"}`,
          color: active ? "#93c5fd" : "var(--text-muted)",
          padding: "1px 5px", borderRadius: "var(--radius-full)",
          fontFamily: "var(--font-mono)",
        }}>
          {count}
        </span>
      )}
    </button>
  );
}

function FilterChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        flexShrink: 0,
        padding: "5px 11px",
        borderRadius: "var(--radius-full)",
        fontSize: "11px",
        fontWeight: active ? 600 : 400,
        fontFamily: "var(--font-body)",
        border: `1px solid ${active ? "rgba(37,99,235,0.45)" : "var(--card-border)"}`,
        background: active ? "rgba(37,99,235,0.12)" : "transparent",
        color: active ? "#93c5fd" : "var(--text-tertiary)",
        cursor: "pointer",
        transition: "color 150ms ease, background 150ms ease, border-color 150ms ease",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}

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

// ─── Trending strip ───────────────────────────────────────────────────────────

function TrendingStrategyStrip({ items }: { items: TrendingStrategyItem[] }) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginBottom: "22px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "11px" }}>
        <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor" style={{ color: "var(--amber)" }}>
          <path d="M12 2C12 2 11.9 6.1 9.5 8.5C7.1 10.9 3 11 3 11C3 11 4.5 14 7 15.5C9.5 17 12 17 12 17C12 17 14.5 17 17 15.5C19.5 14 21 11 21 11C21 11 16.9 10.9 14.5 8.5C12.1 6.1 12 2 12 2Z" />
        </svg>
        <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-tertiary)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
          Trending strategies
        </span>
      </div>
      <div style={{ display: "flex", gap: "10px", overflowX: "auto", paddingBottom: "4px", scrollbarWidth: "none" }}>
        {items.map((s, i) => {
          const rs = riskColor(s.risk_level);
          return (
            <div
              key={s.id}
              style={{
                flexShrink: 0, width: "200px",
                background: "var(--card-bg)",
                border: "1px solid var(--card-border)",
                borderRadius: "var(--radius-lg)",
                padding: "12px 14px",
                display: "flex", flexDirection: "column", gap: "8px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700,
                  color: i === 0 ? "var(--amber)" : "var(--text-muted)",
                  background: i === 0 ? "rgba(251,191,36,0.08)" : "transparent",
                  border: i === 0 ? "1px solid rgba(251,191,36,0.15)" : "none",
                  padding: i === 0 ? "1px 5px" : "0",
                  borderRadius: "var(--radius-full)",
                  flexShrink: 0,
                }}>
                  #{i + 1}
                </span>
                {s.risk_level && (
                  <span style={{
                    fontSize: "8px", fontWeight: 700, textTransform: "uppercase",
                    padding: "1px 5px", borderRadius: "var(--radius-full)",
                    background: rs.bg, border: `1px solid ${rs.border}`, color: rs.color,
                    flexShrink: 0,
                  }}>
                    {s.risk_level}
                  </span>
                )}
              </div>
              <p style={{
                fontSize: "12px", fontWeight: 600, color: "var(--text-primary)",
                overflow: "hidden", display: "-webkit-box",
                WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                lineHeight: 1.35, margin: 0,
              }}>
                {s.name}
              </p>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                  <Avatar username={s.author.username} color={s.author.avatar_color} size={16} />
                  <span style={{ fontSize: "10px", color: "var(--text-muted)", maxWidth: "80px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.author.username}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "3px", color: "var(--text-muted)" }}>
                  <svg width="9" height="9" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M7 9a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H9a2 2 0 01-2-2V9z" />
                    <path d="M5 3a2 2 0 00-2 2v6a2 2 0 002 2V5h8a2 2 0 00-2-2H5z" />
                  </svg>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px" }}>{s.copies_count}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TrendingPortfolioStrip({ items }: { items: TrendingPortfolioItem[] }) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginBottom: "22px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "11px" }}>
        <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor" style={{ color: "var(--amber)" }}>
          <path d="M12 2C12 2 11.9 6.1 9.5 8.5C7.1 10.9 3 11 3 11C3 11 4.5 14 7 15.5C9.5 17 12 17 12 17C12 17 14.5 17 17 15.5C19.5 14 21 11 21 11C21 11 16.9 10.9 14.5 8.5C12.1 6.1 12 2 12 2Z" />
        </svg>
        <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-tertiary)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
          Trending portfolios
        </span>
      </div>
      <div style={{ display: "flex", gap: "10px", overflowX: "auto", paddingBottom: "4px", scrollbarWidth: "none" }}>
        {items.map((p, i) => {
          const rs = riskColor(p.risk_level);
          return (
            <Link
              key={p.id}
              href={`/community/portfolios/${p.id}`}
              style={{
                flexShrink: 0, width: "200px",
                background: "var(--card-bg)",
                border: "1px solid var(--card-border)",
                borderRadius: "var(--radius-lg)",
                padding: "12px 14px",
                display: "flex", flexDirection: "column", gap: "8px",
                textDecoration: "none",
                transition: "border-color 120ms ease, background 120ms ease",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.1)"; (e.currentTarget as HTMLElement).style.background = "var(--card-hover)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--card-border)"; (e.currentTarget as HTMLElement).style.background = "var(--card-bg)"; }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700,
                  color: i === 0 ? "var(--amber)" : "var(--text-muted)",
                  background: i === 0 ? "rgba(251,191,36,0.08)" : "transparent",
                  border: i === 0 ? "1px solid rgba(251,191,36,0.15)" : "none",
                  padding: i === 0 ? "1px 5px" : "0",
                  borderRadius: "var(--radius-full)",
                  flexShrink: 0,
                }}>
                  #{i + 1}
                </span>
                {p.risk_level && (
                  <span style={{
                    fontSize: "8px", fontWeight: 700, textTransform: "uppercase",
                    padding: "1px 5px", borderRadius: "var(--radius-full)",
                    background: rs.bg, border: `1px solid ${rs.border}`, color: rs.color,
                    flexShrink: 0,
                  }}>
                    {p.risk_level}
                  </span>
                )}
              </div>
              <p style={{
                fontSize: "12px", fontWeight: 600, color: "var(--text-primary)",
                overflow: "hidden", display: "-webkit-box",
                WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                lineHeight: 1.35, margin: 0,
              }}>
                {p.public_name}
              </p>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                  <Avatar username={p.author.username} color={p.author.avatar_color} size={16} />
                  <span style={{ fontSize: "10px", color: "var(--text-muted)", maxWidth: "80px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.author.username}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "3px", color: "var(--text-muted)" }}>
                  <svg width="9" height="9" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M7 9a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H9a2 2 0 01-2-2V9z" />
                    <path d="M5 3a2 2 0 00-2 2v6a2 2 0 002 2V5h8a2 2 0 00-2-2H5z" />
                  </svg>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px" }}>{p.copy_count}</span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ─── Strategy card ────────────────────────────────────────────────────────────

function StrategyCard({ s, onLike, onSave, onFollow, onComment, onCopy }: {
  s: StrategyRow;
  onLike: (id: string) => void;
  onSave: (id: string) => void;
  onFollow: (userId: string) => void;
  onComment: (id: string) => void;
  onCopy: (id: string) => Promise<void>;
}) {
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const rs = riskColor(s.risk_level);

  return (
    <div
      style={{
        background: "var(--card-bg)",
        border: "1px solid var(--card-border)",
        borderRadius: "var(--radius-lg)",
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: "11px",
        transition: "border-color 150ms ease, background 150ms ease",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.1)";
        (e.currentTarget as HTMLElement).style.background   = "var(--card-hover)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "var(--card-border)";
        (e.currentTarget as HTMLElement).style.background   = "var(--card-bg)";
      }}
    >
      {/* Name + badges */}
      <div>
        <h3 style={{
          fontFamily: "var(--font-display)", fontSize: "14px", fontWeight: 600,
          color: "var(--text-primary)", marginBottom: "6px", lineHeight: 1.25,
        }}>
          {s.name}
        </h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
          {s.risk_level && (
            <span style={{
              fontSize: "9px", fontWeight: 700, letterSpacing: "0.06em",
              textTransform: "uppercase", padding: "2px 7px",
              borderRadius: "var(--radius-full)",
              background: rs.bg, border: `1px solid ${rs.border}`, color: rs.color,
            }}>
              {s.risk_level}
            </span>
          )}
          {s.style && (
            <span style={{
              fontSize: "9px", color: "var(--text-tertiary)",
              background: "transparent", border: "1px solid var(--card-border)",
              padding: "2px 7px", borderRadius: "var(--radius-full)",
            }}>
              {s.style}
            </span>
          )}
          {s.is_own && (
            <span style={{
              fontSize: "9px", fontWeight: 600, letterSpacing: "0.04em",
              padding: "2px 7px", borderRadius: "var(--radius-full)",
              background: "rgba(37,99,235,0.1)",
              border: "1px solid rgba(37,99,235,0.2)",
              color: "#93c5fd",
            }}>
              Yours
            </span>
          )}
        </div>
      </div>

      {/* Description */}
      {s.description && (
        <p style={{
          fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.55,
          overflow: "hidden", display: "-webkit-box",
          WebkitLineClamp: 3, WebkitBoxOrient: "vertical",
          flex: 1,
        }}>
          {s.description}
        </p>
      )}

      {/* Author row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
        <Link href={`/${s.author.username}`} style={{ display: "flex", alignItems: "center", gap: "7px", textDecoration: "none", minWidth: 0 }}>
          <Avatar username={s.author.username} color={s.author.avatar_color} size={24} />
          <span style={{
            fontSize: "12px", fontWeight: 500, color: "var(--text-secondary)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {s.author.display_name || s.author.username}
          </span>
        </Link>
        {!s.is_own && (
          <button
            type="button"
            onClick={() => onFollow(s.author.user_id)}
            style={{
              padding: "3px 9px", borderRadius: "var(--radius-full)",
              fontSize: "11px", fontWeight: 500, flexShrink: 0,
              background: s.author.is_following ? "transparent" : "rgba(37,99,235,0.1)",
              border: `1px solid ${s.author.is_following ? "var(--card-border)" : "rgba(37,99,235,0.25)"}`,
              color: s.author.is_following ? "var(--text-tertiary)" : "#93c5fd",
              cursor: "pointer", fontFamily: "var(--font-body)",
              transition: "color 150ms ease, background 150ms ease, border-color 150ms ease",
            }}
            onPointerDown={(e) => { e.currentTarget.style.transform = "scale(0.96)"; }}
            onPointerUp={(e)   => { e.currentTarget.style.transform = ""; }}
            onPointerCancel={(e) => { e.currentTarget.style.transform = ""; }}
          >
            {s.author.is_following ? "Following" : "Follow"}
          </button>
        )}
      </div>

      {/* Footer */}
      <div style={{
        display: "flex", alignItems: "center", gap: "4px",
        paddingTop: "10px", borderTop: "1px solid var(--border-subtle)",
      }}>
        {/* Like */}
        <button
          type="button"
          onClick={() => onLike(s.id)}
          style={{
            display: "flex", alignItems: "center", gap: "4px",
            padding: "4px 7px", borderRadius: "var(--radius-md)",
            fontSize: "11px", fontWeight: 500,
            background: s.is_liked ? "rgba(255,92,92,0.08)" : "none",
            border: `1px solid ${s.is_liked ? "rgba(255,92,92,0.2)" : "transparent"}`,
            color: s.is_liked ? "#ff5c5c" : "var(--text-tertiary)",
            cursor: "pointer", fontFamily: "var(--font-body)",
            transition: "color 150ms ease, background 150ms ease, border-color 150ms ease",
          }}
          onPointerDown={(e) => { e.currentTarget.style.transform = "scale(0.94)"; }}
          onPointerUp={(e)   => { e.currentTarget.style.transform = ""; }}
          onPointerCancel={(e) => { e.currentTarget.style.transform = ""; }}
        >
          <svg width="12" height="12" viewBox="0 0 20 20" fill={s.is_liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5">
            <path d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" />
          </svg>
          <span className="num" style={{ fontSize: "11px" }}>{s.likes_count}</span>
        </button>

        {/* Copies count */}
        <div style={{ display: "flex", alignItems: "center", gap: "4px", padding: "4px 6px", fontSize: "11px", color: "var(--text-muted)" }}>
          <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor">
            <path d="M7 9a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H9a2 2 0 01-2-2V9z" />
            <path d="M5 3a2 2 0 00-2 2v6a2 2 0 002 2V5h8a2 2 0 00-2-2H5z" />
          </svg>
          <span className="num">{s.copies_count}</span>
        </div>

        <div style={{ flex: 1 }} />

        {/* Comment */}
        <button
          type="button"
          onClick={() => onComment(s.id)}
          title="Comment"
          style={{
            display: "flex", alignItems: "center",
            padding: "4px 6px", borderRadius: "var(--radius-md)",
            background: "none", border: "1px solid transparent",
            color: "var(--text-muted)", cursor: "pointer",
            transition: "color 150ms ease, border-color 150ms ease",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; e.currentTarget.style.borderColor = "var(--card-border)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)";      e.currentTarget.style.borderColor = "transparent"; }}
          onPointerDown={(e) => { e.currentTarget.style.transform = "scale(0.94)"; }}
          onPointerUp={(e)   => { e.currentTarget.style.transform = ""; }}
          onPointerCancel={(e) => { e.currentTarget.style.transform = ""; }}
        >
          <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2 5a2 2 0 012-2h12a2 2 0 012 2v8a2 2 0 01-2 2H7l-5 3V5z" />
          </svg>
        </button>

        {/* Save */}
        {!s.is_own && (
          <button
            type="button"
            onClick={() => onSave(s.id)}
            title={s.is_saved ? "Remove from saved" : "Save"}
            style={{
              display: "flex", alignItems: "center", gap: "4px",
              padding: "4px 8px", borderRadius: "var(--radius-md)",
              fontSize: "11px", fontWeight: 500,
              background: s.is_saved ? "rgba(37,99,235,0.1)" : "none",
              border: `1px solid ${s.is_saved ? "rgba(37,99,235,0.25)" : "var(--card-border)"}`,
              color: s.is_saved ? "#93c5fd" : "var(--text-tertiary)",
              cursor: "pointer", fontFamily: "var(--font-body)",
              transition: "color 150ms ease, background 150ms ease, border-color 150ms ease",
            }}
            onPointerDown={(e) => { e.currentTarget.style.transform = "scale(0.94)"; }}
            onPointerUp={(e)   => { e.currentTarget.style.transform = ""; }}
            onPointerCancel={(e) => { e.currentTarget.style.transform = ""; }}
          >
            <svg width="11" height="11" viewBox="0 0 20 20" fill={s.is_saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5">
              <path d="M5 3a2 2 0 00-2 2v12l7-3 7 3V5a2 2 0 00-2-2H5z" />
            </svg>
            {s.is_saved ? "Saved" : "Save"}
          </button>
        )}

        {/* Use as template */}
        {!s.is_own && (
          <button
            type="button"
            onClick={async () => {
              if (copying || copied) return;
              setCopying(true);
              try {
                await onCopy(s.id);
                setCopied(true);
                setTimeout(() => setCopied(false), 3000);
              } finally {
                setCopying(false);
              }
            }}
            style={{
              display: "flex", alignItems: "center", gap: "4px",
              padding: "4px 8px", borderRadius: "var(--radius-md)",
              fontSize: "11px", fontWeight: 500,
              background: copied ? "rgba(0,211,149,0.1)" : "none",
              border: `1px solid ${copied ? "rgba(0,211,149,0.25)" : "var(--card-border)"}`,
              color: copied ? "var(--green)" : "var(--text-tertiary)",
              cursor: copying ? "not-allowed" : "pointer",
              opacity: copying ? 0.6 : 1,
              fontFamily: "var(--font-body)",
              transition: "color 150ms ease, background 150ms ease, border-color 150ms ease, opacity 150ms ease",
            }}
            onPointerDown={(e) => { if (!copying) e.currentTarget.style.transform = "scale(0.94)"; }}
            onPointerUp={(e)   => { e.currentTarget.style.transform = ""; }}
            onPointerCancel={(e) => { e.currentTarget.style.transform = ""; }}
          >
            {copied ? (
              <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M7 9a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H9a2 2 0 01-2-2V9z" />
                <path d="M5 3a2 2 0 00-2 2v6a2 2 0 002 2V5h8a2 2 0 00-2-2H5z" />
              </svg>
            )}
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

  async function handleSubmit() {
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    await onSubmit(text);
    setSubmitting(false);
  }

  return (
    <div className="bt-sd" style={{
      marginTop: "6px",
      background: "var(--bg-elevated)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-md)",
      padding: "12px 14px",
    }}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Share your thoughts on this strategy..."
        rows={3}
        maxLength={1000}
        autoFocus
        style={{
          width: "100%", background: "transparent", border: "none", outline: "none",
          color: "var(--text-primary)", fontSize: "13px", fontFamily: "var(--font-body)",
          resize: "none", lineHeight: 1.6,
        }}
      />
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginTop: "8px", paddingTop: "8px", borderTop: "1px solid var(--border-subtle)",
      }}>
        <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>{text.length}/1000</span>
        <div style={{ display: "flex", gap: "6px" }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: "5px 12px", background: "none",
              border: "1px solid var(--card-border)", borderRadius: "var(--radius-md)",
              color: "var(--text-muted)", fontSize: "12px", cursor: "pointer",
              fontFamily: "var(--font-body)",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!text.trim() || submitting}
            style={{
              padding: "5px 14px", background: "var(--brand-gradient)",
              border: "none", borderRadius: "var(--radius-md)",
              color: "#fff", fontSize: "12px", fontWeight: 600,
              cursor: !text.trim() || submitting ? "not-allowed" : "pointer",
              opacity: !text.trim() || submitting ? 0.5 : 1,
              fontFamily: "var(--font-body)",
            }}
          >
            {submitting ? "Posting..." : "Post"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Allocation bar ───────────────────────────────────────────────────────────

const ALLOC_COLORS = ["#3b82f6", "#7c3aed", "#0891b2", "#065f46", "#92400e", "#4338ca"];
const ALLOC_CASH_COLOR = "rgba(255,255,255,0.12)";
const ALLOC_REST_COLOR = "rgba(255,255,255,0.06)";

function AllocationBar({ holdings }: { holdings: PortfolioHolding[] }) {
  const nonCash = holdings.filter((h) => !h.is_cash).slice(0, 5);
  const cash = holdings.find((h) => h.is_cash);
  const shown = [...nonCash, ...(cash ? [cash] : [])];
  const shownSum = shown.reduce((s, h) => s + h.allocation_pct, 0);
  const rest = Math.max(0, 100 - shownSum);

  return (
    <div style={{
      display: "flex", height: "5px", borderRadius: "3px",
      overflow: "hidden", gap: "1px", width: "100%",
    }}>
      {nonCash.map((h, i) => (
        <div
          key={h.ticker}
          title={`${h.ticker} ${h.allocation_pct.toFixed(1)}%`}
          style={{
            height: "100%",
            width: `${h.allocation_pct}%`,
            background: ALLOC_COLORS[i % ALLOC_COLORS.length],
            borderRadius: i === 0 ? "3px 0 0 3px" : "0",
            flexShrink: 0,
          }}
        />
      ))}
      {cash && (
        <div
          key="cash"
          title={`Cash ${cash.allocation_pct.toFixed(1)}%`}
          style={{
            height: "100%",
            width: `${cash.allocation_pct}%`,
            background: ALLOC_CASH_COLOR,
            flexShrink: 0,
          }}
        />
      )}
      {rest > 0.5 && (
        <div style={{
          height: "100%",
          flex: 1,
          background: ALLOC_REST_COLOR,
          borderRadius: "0 3px 3px 0",
          minWidth: "2px",
        }} />
      )}
    </div>
  );
}

// ─── Portfolio card ───────────────────────────────────────────────────────────

function PortfolioCard({
  p, onFollow, onCopy,
}: {
  p: PortfolioRow;
  onFollow: (id: string) => void;
  onCopy: (id: string) => Promise<void>;
}) {
  const [copying, setCopying] = useState(false);
  const rs = riskColor(p.risk_level);

  const nonCashHoldings = p.holdings.filter((h) => !h.is_cash);
  const cashHolding = p.holdings.find((h) => h.is_cash);
  const topHoldings = nonCashHoldings.slice(0, 3);
  const moreCount = nonCashHoldings.length - topHoldings.length;

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
        background: "var(--card-bg)",
        border: "1px solid var(--card-border)",
        borderRadius: "var(--radius-lg)",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        transition: "border-color 150ms ease, background 150ms ease",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.1)";
        (e.currentTarget as HTMLElement).style.background = "var(--card-hover)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "var(--card-border)";
        (e.currentTarget as HTMLElement).style.background = "var(--card-bg)";
      }}
    >
      {/* Allocation bar */}
      <AllocationBar holdings={p.holdings} />

      {/* Name + badges + privacy chip */}
      <div>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px", marginBottom: "7px" }}>
          <h3 style={{
            fontFamily: "var(--font-display)", fontSize: "14px", fontWeight: 600,
            color: "var(--text-primary)", lineHeight: 1.25, flex: 1,
          }}>
            {p.public_name}
          </h3>
          <div style={{ display: "flex", gap: "5px", alignItems: "center", flexShrink: 0 }}>
            {p.is_own && (
              <span style={{
                fontSize: "9px", fontWeight: 600, letterSpacing: "0.04em",
                padding: "2px 6px", borderRadius: "var(--radius-full)",
                background: "rgba(37,99,235,0.1)",
                border: "1px solid rgba(37,99,235,0.2)",
                color: "#93c5fd",
              }}>
                Yours
              </span>
            )}
            <span
              title="Only allocation percentages are shared. Dollar amounts, cost basis, and account balances are never visible."
              style={{
                fontSize: "9px", fontWeight: 600, letterSpacing: "0.06em",
                textTransform: "uppercase", padding: "2px 6px",
                borderRadius: "var(--radius-full)",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "var(--text-muted)",
                cursor: "help",
              }}
            >
              % only
            </span>
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
          {p.risk_level && (
            <span style={{
              fontSize: "9px", fontWeight: 700, letterSpacing: "0.06em",
              textTransform: "uppercase", padding: "2px 7px",
              borderRadius: "var(--radius-full)",
              background: rs.bg, border: `1px solid ${rs.border}`, color: rs.color,
            }}>
              {p.risk_level}
            </span>
          )}
          {p.style && (
            <span style={{
              fontSize: "9px", color: "var(--text-tertiary)",
              background: "transparent", border: "1px solid var(--card-border)",
              padding: "2px 7px", borderRadius: "var(--radius-full)",
            }}>
              {p.style}
            </span>
          )}
        </div>
      </div>

      {/* Description */}
      {p.public_description && (
        <p style={{
          fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.55,
          overflow: "hidden", display: "-webkit-box",
          WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
        }}>
          {p.public_description}
        </p>
      )}

      {/* Top holdings */}
      <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
        {topHoldings.map((h, i) => (
          <div key={h.ticker} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ width: "8px", height: "8px", borderRadius: "2px", background: ALLOC_COLORS[i % ALLOC_COLORS.length], flexShrink: 0 }} />
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 500,
              color: "var(--text-secondary)", letterSpacing: "-0.2px", flexShrink: 0, width: "38px",
            }}>
              {h.ticker}
            </span>
            <div style={{
              flex: 1, height: "3px", borderRadius: "2px",
              background: "rgba(255,255,255,0.06)",
              overflow: "hidden",
            }}>
              <div style={{
                height: "100%",
                width: `${Math.min(h.allocation_pct, 100)}%`,
                background: ALLOC_COLORS[i % ALLOC_COLORS.length],
                borderRadius: "2px",
              }} />
            </div>
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 500,
              color: "var(--text-primary)", letterSpacing: "-0.2px", flexShrink: 0,
              minWidth: "38px", textAlign: "right",
            }}>
              {h.allocation_pct.toFixed(1)}%
            </span>
          </div>
        ))}
        {(moreCount > 0 || cashHolding) && (
          <div style={{ display: "flex", gap: "10px", marginTop: "1px" }}>
            {moreCount > 0 && (
              <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                +{moreCount} more
              </span>
            )}
            {cashHolding && (
              <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                Cash <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>{cashHolding.allocation_pct.toFixed(1)}%</span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Author row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
        <Link href={`/${p.author.username}`} style={{ display: "flex", alignItems: "center", gap: "7px", textDecoration: "none", minWidth: 0 }}>
          <Avatar username={p.author.username} color={p.author.avatar_color} size={22} />
          <span style={{
            fontSize: "12px", fontWeight: 500, color: "var(--text-secondary)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {p.author.display_name || p.author.username}
          </span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
          {relativeTime && (
            <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>{relativeTime}</span>
          )}
          <div style={{ display: "flex", gap: "5px", alignItems: "center" }}>
            <span style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{p.follower_count}</span>
            <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor" style={{ color: "var(--text-muted)" }}>
              <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
              <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
            </svg>
          </div>
        </div>
      </div>

      {/* Footer actions */}
      <div style={{
        display: "flex", alignItems: "center", gap: "6px",
        paddingTop: "10px", borderTop: "1px solid var(--border-subtle)",
      }}>
        <Link
          href={`/community/portfolios/${p.id}`}
          style={{
            display: "flex", alignItems: "center", gap: "4px",
            padding: "5px 10px", borderRadius: "var(--radius-md)",
            fontSize: "11px", fontWeight: 500, textDecoration: "none",
            background: "none", border: "1px solid var(--card-border)",
            color: "var(--text-secondary)",
            transition: "color 150ms ease, border-color 150ms ease",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.15)"; (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--card-border)"; (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}
        >
          Preview
        </Link>

        <div style={{ flex: 1 }} />

        {!p.is_own && (
          <button
            type="button"
            onClick={() => onFollow(p.id)}
            style={{
              padding: "5px 11px", borderRadius: "var(--radius-full)",
              fontSize: "11px", fontWeight: 500,
              background: p.is_following ? "transparent" : "rgba(37,99,235,0.1)",
              border: `1px solid ${p.is_following ? "var(--card-border)" : "rgba(37,99,235,0.25)"}`,
              color: p.is_following ? "var(--text-tertiary)" : "#93c5fd",
              cursor: "pointer", fontFamily: "var(--font-body)",
              transition: "color 150ms ease, background 150ms ease, border-color 150ms ease",
            }}
            onPointerDown={(e) => { e.currentTarget.style.transform = "scale(0.95)"; }}
            onPointerUp={(e) => { e.currentTarget.style.transform = ""; }}
            onPointerCancel={(e) => { e.currentTarget.style.transform = ""; }}
          >
            {p.is_following ? "Following" : "Follow"}
          </button>
        )}

        {!p.is_own && (
          <button
            type="button"
            onClick={async () => {
              if (copying) return;
              setCopying(true);
              try {
                await onCopy(p.id);
              } finally {
                setCopying(false);
              }
            }}
            style={{
              display: "flex", alignItems: "center", gap: "4px",
              padding: "5px 11px", borderRadius: "var(--radius-md)",
              fontSize: "11px", fontWeight: 500,
              background: "rgba(37,99,235,0.08)",
              border: "1px solid rgba(37,99,235,0.2)",
              color: "#93c5fd",
              cursor: copying ? "not-allowed" : "pointer",
              opacity: copying ? 0.6 : 1,
              fontFamily: "var(--font-body)",
              transition: "opacity 150ms ease",
            }}
            onPointerDown={(e) => { if (!copying) e.currentTarget.style.transform = "scale(0.95)"; }}
            onPointerUp={(e) => { e.currentTarget.style.transform = ""; }}
            onPointerCancel={(e) => { e.currentTarget.style.transform = ""; }}
          >
            {copying ? "..." : "Copy Allocation"}
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
  initialSort,
  initialStyle,
  initialRisk,
  initialQuery,
  initialSection,
  portfolios: initialPortfolios,
  initialPSort,
  initialPRisk,
  initialPQuery,
  initialMine,
  followingIds: followingIdsArray,
  trendingStrategies,
  trendingPortfolios,
}: {
  strategies: StrategyRow[];
  currentUserId: string;
  initialSort: string;
  initialStyle: string;
  initialRisk: string;
  initialQuery: string;
  initialSection: string;
  portfolios: PortfolioRow[];
  initialPSort: string;
  initialPRisk: string;
  initialPQuery: string;
  initialMine: boolean;
  followingIds: string[];
  trendingStrategies: TrendingStrategyItem[];
  trendingPortfolios: TrendingPortfolioItem[];
}) {
  const router = useRouter();
  const [strategies, setStrategies] = useState(initialStrategies);
  const [portfolios, setPortfolios] = useState(initialPortfolios);
  const [section, setSection]       = useState(initialSection);
  const [mine, setMine]             = useState(initialMine);
  const [commentingId, setCommentingId] = useState<string | null>(null);
  const [isPending, startTransition]    = useTransition();
  const [search, setSearch]             = useState(initialQuery);
  const [pSearch, setPSearch]           = useState(initialPQuery);
  const [copyToast, setCopyToast]       = useState<CopyToast>(null);

  const followingSet = new Set(followingIdsArray);

  function updateUrl(params: Record<string, string>) {
    const sp = new URLSearchParams(window.location.search);
    Object.entries(params).forEach(([k, v]) => (v ? sp.set(k, v) : sp.delete(k)));
    router.push(`/community?${sp.toString()}`);
  }

  function handleLike(id: string) {
    setStrategies((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, is_liked: !s.is_liked, likes_count: s.is_liked ? s.likes_count - 1 : s.likes_count + 1 }
          : s
      )
    );
    startTransition(() => likeStrategy(id));
  }

  function handleSave(id: string) {
    setStrategies((prev) => prev.map((s) => (s.id === id ? { ...s, is_saved: !s.is_saved } : s)));
    startTransition(() => saveStrategy(id));
  }

  function handleFollow(userId: string) {
    setStrategies((prev) =>
      prev.map((s) =>
        s.author.user_id === userId
          ? { ...s, author: { ...s.author, is_following: !s.author.is_following } }
          : s
      )
    );
    startTransition(() => followUser(userId));
  }

  function handleComment(id: string) {
    setCommentingId((prev) => (prev === id ? null : id));
  }

  async function handleCopy(id: string) {
    await copyStrategyAsTemplate(id);
    setCopyToast({ message: "Strategy copied as a template to your Strategies." });
    setTimeout(() => setCopyToast(null), 4500);
  }

  async function submitComment(strategyId: string, text: string) {
    await postComment(strategyId, text);
    setCommentingId(null);
    router.refresh();
  }

  function handleFollowPortfolio(portfolioId: string) {
    setPortfolios((prev) =>
      prev.map((p) =>
        p.id === portfolioId
          ? { ...p, is_following: !p.is_following, follower_count: p.is_following ? p.follower_count - 1 : p.follower_count + 1 }
          : p
      )
    );
    startTransition(() => followPublicPortfolio(portfolioId));
  }

  async function handleCopyPortfolio(portfolioId: string) {
    const result = await copyPublicAllocation(portfolioId);
    setCopyToast({ message: "Copied to your portfolios.", portfolioId: result.id });
    setTimeout(() => setCopyToast(null), 4500);
  }

  function toggleMine() {
    const next = !mine;
    setMine(next);
    updateUrl({ mine: next ? "true" : "" });
  }

  const searchPlaceholder =
    section === "following" ? "Search strategies & portfolios from people you follow..." :
    section === "portfolios" ? "Search portfolios..." :
    "Search strategies...";

  // Following feed: filter from loaded data by is_following on author
  const followingStrategies = strategies.filter(s => !s.is_own && s.author.is_following);
  const followingPortfolios = portfolios.filter(p => !p.is_own && p.author.is_following);

  return (
    <div style={{ maxWidth: "900px", display: "flex", flexDirection: "column" }}>

      {/* ── Section nav ─────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--border-subtle)", marginBottom: "18px" }}>
        <SectionTab
          active={section === "strategies"}
          label="Strategies"
          onClick={() => { setSection("strategies"); updateUrl({ section: "strategies" }); }}
        />
        <SectionTab
          active={section === "portfolios"}
          label="Portfolios"
          onClick={() => { setSection("portfolios"); updateUrl({ section: "portfolios" }); }}
        />
        <SectionTab
          active={section === "following"}
          label="Following"
          count={followingStrategies.length + followingPortfolios.length}
          onClick={() => { setSection("following"); updateUrl({ section: "following" }); }}
        />
      </div>

      {/* ── Filter row ──────────────────────────────────────────────────────── */}
      {section !== "following" && (
        <div className="community-filter-row" style={{ marginBottom: "18px" }}>
          <div style={{ position: "relative", flex: "1 1 180px", minWidth: "150px" }}>
            <svg
              width="13" height="13" viewBox="0 0 20 20" fill="currentColor"
              style={{ position: "absolute", left: "11px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }}
            >
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
            </svg>
            <input
              type="text"
              value={section === "portfolios" ? pSearch : search}
              onChange={(e) => section === "portfolios" ? setPSearch(e.target.value) : setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                if (section === "portfolios") updateUrl({ pq: pSearch });
                else updateUrl({ q: search });
              }}
              placeholder={searchPlaceholder}
              style={{
                width: "100%", padding: "7px 12px 7px 30px",
                background: "var(--card-bg)", border: "1px solid var(--card-border)",
                borderRadius: "var(--radius-full)", color: "var(--text-primary)",
                fontSize: "12px", fontFamily: "var(--font-body)", outline: "none",
                transition: "border-color 150ms ease, box-shadow 150ms ease",
              }}
              onFocus={(e) => { e.target.style.borderColor = "var(--brand-blue)"; e.target.style.boxShadow = "0 0 0 3px rgba(37,99,235,0.1)"; }}
              onBlur={(e) => { e.target.style.borderColor = "var(--card-border)"; e.target.style.boxShadow = "none"; }}
            />
          </div>

          {section === "strategies" && (
            <>
              <FilterChip active={initialSort === "popular"} label="Popular" onClick={() => updateUrl({ sort: "popular" })} />
              <FilterChip active={initialSort === "newest"} label="Newest" onClick={() => updateUrl({ sort: "newest" })} />
              <FilterChip active={initialSort === "copied"} label="Most Copied" onClick={() => updateUrl({ sort: "copied" })} />
              <FilterChip active={mine} label="Mine" onClick={toggleMine} />
              <select
                value={initialRisk}
                onChange={(e) => updateUrl({ risk: e.target.value })}
                style={{
                  padding: "5px 10px", background: "var(--card-bg)", border: "1px solid var(--card-border)",
                  borderRadius: "var(--radius-full)", color: "var(--text-secondary)",
                  fontSize: "11px", fontFamily: "var(--font-body)", outline: "none",
                  cursor: "pointer", flexShrink: 0, transition: "border-color 150ms ease",
                }}
                onFocus={(e) => { e.target.style.borderColor = "var(--brand-blue)"; }}
                onBlur={(e) => { e.target.style.borderColor = "var(--card-border)"; }}
              >
                <option value="">All risk levels</option>
                <option value="low">Conservative</option>
                <option value="moderate">Moderate</option>
                <option value="high">Aggressive</option>
              </select>
            </>
          )}

          {section === "portfolios" && (
            <>
              <FilterChip active={initialPSort === "popular"} label="Popular" onClick={() => updateUrl({ psort: "popular" })} />
              <FilterChip active={initialPSort === "newest"} label="Newest" onClick={() => updateUrl({ psort: "newest" })} />
              <FilterChip active={initialPSort === "copied"} label="Most Copied" onClick={() => updateUrl({ psort: "copied" })} />
              <FilterChip active={mine} label="Mine" onClick={toggleMine} />
              <select
                value={initialPRisk}
                onChange={(e) => updateUrl({ prisk: e.target.value })}
                style={{
                  padding: "5px 10px", background: "var(--card-bg)", border: "1px solid var(--card-border)",
                  borderRadius: "var(--radius-full)", color: "var(--text-secondary)",
                  fontSize: "11px", fontFamily: "var(--font-body)", outline: "none",
                  cursor: "pointer", flexShrink: 0, transition: "border-color 150ms ease",
                }}
                onFocus={(e) => { e.target.style.borderColor = "var(--brand-blue)"; }}
                onBlur={(e) => { e.target.style.borderColor = "var(--card-border)"; }}
              >
                <option value="">All risk levels</option>
                <option value="Conservative">Conservative</option>
                <option value="Moderate">Moderate</option>
                <option value="Aggressive">Aggressive</option>
              </select>
            </>
          )}
        </div>
      )}

      {/* ── Count label ─────────────────────────────────────────────────────── */}
      {section !== "following" && (
        <p style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "14px" }}>
          {section === "portfolios"
            ? `${portfolios.length} public ${portfolios.length === 1 ? "portfolio" : "portfolios"}${mine ? " (yours)" : ""}`
            : `${strategies.length} public ${strategies.length === 1 ? "strategy" : "strategies"}${mine ? " (yours)" : ""}`}
        </p>
      )}

      {/* ── Section content ──────────────────────────────────────────────────── */}

      {section === "following" ? (
        // ── Following / updates feed ─────────────────────────────────────────
        followingSet.size === 0 ? (
          <div style={{
            padding: "56px 24px", textAlign: "center",
            background: "var(--card-bg)", border: "1px solid var(--card-border)",
            borderRadius: "var(--radius-lg)",
          }}>
            <div style={{
              width: "40px", height: "40px", borderRadius: "10px",
              background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 14px",
            }}>
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="#93c5fd" strokeWidth="1.5">
                <path d="M17 20h-2v-2a3 3 0 00-5.356-1.857M7 20H5v-2a3 3 0 015.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h3 style={{
              fontFamily: "var(--font-display)", fontSize: "15px", fontWeight: 600,
              color: "var(--text-primary)", marginBottom: "6px",
            }}>
              No one followed yet
            </h3>
            <p style={{ fontSize: "13px", color: "var(--text-tertiary)", maxWidth: "320px", margin: "0 auto 18px" }}>
              Follow investors to see their latest strategies and portfolios here.
            </p>
            <button
              type="button"
              onClick={() => { setSection("strategies"); updateUrl({ section: "strategies" }); }}
              style={{
                padding: "8px 18px",
                background: "rgba(37,99,235,0.1)", border: "1px solid rgba(37,99,235,0.25)",
                borderRadius: "var(--radius-md)", color: "#93c5fd",
                fontSize: "12px", fontWeight: 600, cursor: "pointer",
                fontFamily: "var(--font-body)",
              }}
            >
              Browse strategies to find investors
            </button>
          </div>
        ) : followingStrategies.length === 0 && followingPortfolios.length === 0 ? (
          <div style={{
            padding: "56px 24px", textAlign: "center",
            background: "var(--card-bg)", border: "1px solid var(--card-border)",
            borderRadius: "var(--radius-lg)",
          }}>
            <p style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>
              People you follow haven&apos;t shared anything publicly yet.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            {/* Following: strategies */}
            {followingStrategies.length > 0 && (
              <div>
                <p style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "12px" }}>
                  Strategies from people you follow
                </p>
                <div className="community-grid bt-list-animate">
                  {followingStrategies.map((s) => (
                    <div key={s.id}>
                      <StrategyCard
                        s={s}
                        onLike={handleLike}
                        onSave={handleSave}
                        onFollow={handleFollow}
                        onComment={handleComment}
                        onCopy={handleCopy}
                      />
                      {commentingId === s.id && (
                        <CommentBox
                          onSubmit={(text) => submitComment(s.id, text)}
                          onCancel={() => setCommentingId(null)}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Following: portfolios */}
            {followingPortfolios.length > 0 && (
              <div>
                <p style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "12px" }}>
                  Portfolios from people you follow
                </p>
                <div className="community-grid bt-list-animate">
                  {followingPortfolios.map((p) => (
                    <PortfolioCard
                      key={p.id}
                      p={p}
                      onFollow={handleFollowPortfolio}
                      onCopy={handleCopyPortfolio}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )

      ) : section === "portfolios" ? (
        // ── Portfolios ────────────────────────────────────────────────────────
        <>
          <TrendingPortfolioStrip items={trendingPortfolios} />
          {portfolios.length > 0 ? (
            <div className="community-grid bt-list-animate">
              {portfolios.map((p) => (
                <PortfolioCard
                  key={p.id}
                  p={p}
                  onFollow={handleFollowPortfolio}
                  onCopy={handleCopyPortfolio}
                />
              ))}
            </div>
          ) : (
            <div style={{
              padding: "56px 24px", textAlign: "center",
              background: "var(--card-bg)", border: "1px solid var(--card-border)",
              borderRadius: "var(--radius-lg)",
            }}>
              <div style={{
                width: "40px", height: "40px", borderRadius: "10px",
                background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.15)",
                display: "flex", alignItems: "center", justifyContent: "center",
                margin: "0 auto 14px",
              }}>
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="#93c5fd" strokeWidth="1.5">
                  <path d="M3 3h14v14H3V3z" /><path d="M3 7h14M7 3v14" />
                </svg>
              </div>
              <h3 style={{
                fontFamily: "var(--font-display)", fontSize: "15px", fontWeight: 600,
                color: "var(--text-primary)", marginBottom: "6px",
              }}>
                {mine ? "You haven't shared any portfolios yet" : "No public portfolios yet"}
              </h3>
              <p style={{ fontSize: "13px", color: "var(--text-tertiary)", maxWidth: "320px", margin: "0 auto" }}>
                {mine
                  ? "Go to your portfolio page and publish one to share allocation percentages with the community."
                  : "Community portfolios are public allocation ideas. Share yours using the Share button above."}
              </p>
            </div>
          )}
        </>

      ) : (
        // ── Strategies ────────────────────────────────────────────────────────
        <>
          <TrendingStrategyStrip items={trendingStrategies} />
          {strategies.length > 0 ? (
            <div className="community-grid bt-list-animate">
              {strategies.map((s) => (
                <div key={s.id}>
                  <StrategyCard
                    s={s}
                    onLike={handleLike}
                    onSave={handleSave}
                    onFollow={handleFollow}
                    onComment={handleComment}
                    onCopy={handleCopy}
                  />
                  {commentingId === s.id && (
                    <CommentBox
                      onSubmit={(text) => submitComment(s.id, text)}
                      onCancel={() => setCommentingId(null)}
                    />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={{
              padding: "48px 24px", textAlign: "center",
              background: "var(--card-bg)", border: "1px solid var(--card-border)",
              borderRadius: "var(--radius-lg)",
            }}>
              <h3 style={{
                fontFamily: "var(--font-display)", fontSize: "15px", fontWeight: 600,
                color: "var(--text-primary)", marginBottom: "6px",
              }}>
                {mine ? "You haven't shared any strategies yet" : "No public strategies yet"}
              </h3>
              <p style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>
                {mine
                  ? "Go to your Strategies page and toggle one public."
                  : "Be the first to share — go to Strategies and toggle one public."}
              </p>
            </div>
          )}
        </>
      )}

      {/* ── Copy toast ──────────────────────────────────────────────────────── */}
      {copyToast && (
        <div style={{
          position: "fixed", bottom: "24px", right: "24px", zIndex: 300,
          background: "var(--bg-elevated)",
          border: "1px solid rgba(0,211,149,0.2)",
          borderRadius: "var(--radius-md)",
          padding: "11px 16px",
          display: "flex", alignItems: "center", gap: "10px",
          boxShadow: "0 4px 20px rgba(0,0,0,0.55)",
          maxWidth: "300px",
        }}>
          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" style={{ color: "var(--green)", flexShrink: 0 }}>
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          <span style={{ fontSize: "12px", color: "var(--text-secondary)", flex: 1 }}>{copyToast.message}</span>
          {copyToast.portfolioId && (
            <Link
              href={`/portfolios/${copyToast.portfolioId}`}
              style={{
                fontSize: "11px", fontWeight: 600, color: "#93c5fd",
                textDecoration: "none", flexShrink: 0,
                padding: "3px 8px",
                background: "rgba(37,99,235,0.12)",
                border: "1px solid rgba(37,99,235,0.2)",
                borderRadius: "var(--radius-md)",
              }}
            >
              Open
            </Link>
          )}
          <button
            type="button"
            onClick={() => setCopyToast(null)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--text-muted)", padding: "2px", flexShrink: 0,
              display: "flex", alignItems: "center",
            }}
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
