"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { likeStrategy, saveStrategy, followUser, postComment, copyStrategyAsTemplate } from "./social-actions";

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

type PersonRow = {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_color: string;
  followers_count: number;
  is_following: boolean;
  is_friend: boolean;
  is_self: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function riskColor(r: string | null) {
  if (!r) return { bg: "var(--card-bg)", border: "var(--card-border)", color: "var(--text-tertiary)" };
  const l = r.toLowerCase();
  if (["low", "conservative"].includes(l)) return { bg: "var(--green-bg)", border: "var(--green-border)", color: "var(--green)" };
  if (["high", "aggressive"].includes(l))  return { bg: "var(--red-bg)",   border: "var(--red-border)",   color: "var(--red)" };
  return { bg: "var(--amber-bg)", border: "var(--amber-border)", color: "var(--amber)" };
}

// ─── Primitive components ─────────────────────────────────────────────────────

function SectionTab({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
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
      }}
    >
      {label}
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

// ─── Strategy card ────────────────────────────────────────────────────────────

function StrategyCard({ s, onLike, onSave, onFollow, onComment, onCopy }: {
  s: StrategyRow;
  onLike: (id: string) => void;
  onSave: (id: string) => void;
  onFollow: (userId: string) => void;
  onComment: (id: string) => void;
  onCopy: (id: string) => void;
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

        {/* Copies */}
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

        {/* Copy as template */}
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
              transition: "color 150ms ease, border-color 150ms ease",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; e.currentTarget.style.borderColor = "var(--border-strong)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)";      e.currentTarget.style.borderColor = "var(--card-border)"; }}
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
              transition: "opacity 150ms ease",
            }}
            onPointerDown={(e) => { if (text.trim() && !submitting) e.currentTarget.style.transform = "scale(0.97)"; }}
            onPointerUp={(e)   => { e.currentTarget.style.transform = ""; }}
          >
            {submitting ? "Posting..." : "Post"}
          </button>
        </div>
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
  initialFeed,
  followingCount,
  initialSection,
  peopleRows,
}: {
  strategies: StrategyRow[];
  currentUserId: string;
  initialSort: string;
  initialStyle: string;
  initialRisk: string;
  initialQuery: string;
  initialFeed: string;
  followingCount: number;
  initialSection: string;
  peopleRows: PersonRow[];
}) {
  const router = useRouter();
  const [strategies, setStrategies] = useState(initialStrategies);
  const [feed, setFeed]             = useState(initialFeed);
  const [section, setSection]       = useState(initialSection);
  const [people, setPeople]         = useState<PersonRow[]>(peopleRows);
  const [commentingId, setCommentingId] = useState<string | null>(null);
  const [isPending, startTransition]    = useTransition();
  const [search, setSearch]             = useState(initialQuery);

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
    router.push("/strategies");
  }

  async function submitComment(strategyId: string, text: string) {
    await postComment(strategyId, text);
    setCommentingId(null);
    router.refresh();
  }

  return (
    <div style={{ maxWidth: "900px", display: "flex", flexDirection: "column" }}>

      {/* Section nav — underline tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--border-subtle)", marginBottom: "18px" }}>
        <SectionTab
          active={section === "strategies"}
          label="Strategies"
          onClick={() => { setSection("strategies"); updateUrl({ section: "strategies" }); }}
        />
        <SectionTab
          active={section === "people"}
          label="People"
          onClick={() => { setSection("people"); updateUrl({ section: "people" }); }}
        />
      </div>

      {/* Filter row */}
      <div className="community-filter-row" style={{ marginBottom: "18px" }}>
        {/* Search */}
        <div style={{ position: "relative", flex: "1 1 180px", minWidth: "150px" }}>
          <svg
            width="13" height="13" viewBox="0 0 20 20" fill="currentColor"
            style={{ position: "absolute", left: "11px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }}
          >
            <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && updateUrl({ q: search })}
            placeholder={section === "people" ? "Search people..." : "Search strategies..."}
            style={{
              width: "100%", padding: "7px 12px 7px 30px",
              background: "var(--card-bg)", border: "1px solid var(--card-border)",
              borderRadius: "var(--radius-full)", color: "var(--text-primary)",
              fontSize: "12px", fontFamily: "var(--font-body)", outline: "none",
              transition: "border-color 150ms ease, box-shadow 150ms ease",
            }}
            onFocus={(e) => { e.target.style.borderColor = "var(--brand-blue)"; e.target.style.boxShadow = "0 0 0 3px rgba(37,99,235,0.1)"; }}
            onBlur={(e)  => { e.target.style.borderColor = "var(--card-border)"; e.target.style.boxShadow = "none"; }}
          />
        </div>

        {section === "strategies" && (
          <>
            {/* Feed */}
            <FilterChip active={feed === "all"}       label="All"       onClick={() => { setFeed("all");       updateUrl({ feed: "all" }); }} />
            <FilterChip active={feed === "following"}  label={`Following${followingCount > 0 ? ` (${followingCount})` : ""}`} onClick={() => { setFeed("following"); updateUrl({ feed: "following" }); }} />

            {/* Sort */}
            <FilterChip active={initialSort === "popular"} label="Popular" onClick={() => updateUrl({ sort: "popular" })} />
            <FilterChip active={initialSort === "newest"}  label="Newest"  onClick={() => updateUrl({ sort: "newest" })} />
            <FilterChip active={initialSort === "copied"}  label="Copied"  onClick={() => updateUrl({ sort: "copied" })} />

            {/* Risk */}
            <select
              value={initialRisk}
              onChange={(e) => updateUrl({ risk: e.target.value })}
              style={{
                padding: "5px 10px",
                background: "var(--card-bg)", border: "1px solid var(--card-border)",
                borderRadius: "var(--radius-full)", color: "var(--text-secondary)",
                fontSize: "11px", fontFamily: "var(--font-body)", outline: "none",
                cursor: "pointer", flexShrink: 0,
                transition: "border-color 150ms ease",
              }}
              onFocus={(e) => { e.target.style.borderColor = "var(--brand-blue)"; }}
              onBlur={(e)  => { e.target.style.borderColor = "var(--card-border)"; }}
            >
              <option value="">All risk levels</option>
              <option value="low">Conservative</option>
              <option value="moderate">Moderate</option>
              <option value="high">Aggressive</option>
            </select>
          </>
        )}
      </div>

      {/* Count */}
      <p style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "14px" }}>
        {section === "people"
          ? `${people.length} ${people.length === 1 ? "person" : "people"}`
          : `${strategies.length} public ${strategies.length === 1 ? "strategy" : "strategies"}`}
      </p>

      {section === "people" ? (
        /* ── People ── */
        people.length > 0 ? (
          <div className="bt-list-animate" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {people.map((person) => (
              <div
                key={person.id}
                style={{
                  display: "flex", alignItems: "center", gap: "14px",
                  background: "var(--card-bg)", border: "1px solid var(--card-border)",
                  borderRadius: "var(--radius-lg)", padding: "12px 16px",
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
                <Link href={`/${person.username}`} style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "12px", flex: 1, minWidth: 0 }}>
                  <div style={{
                    width: "40px", height: "40px", minWidth: "40px",
                    borderRadius: "50%", background: person.avatar_color,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "16px", fontWeight: 700, color: "#fff",
                    boxShadow: `0 0 14px ${person.avatar_color}35`,
                  }}>
                    {((person.display_name || person.username)[0] ?? "?").toUpperCase()}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "7px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                        {person.display_name || person.username}
                      </span>
                      <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>@{person.username}</span>
                      {person.is_friend && (
                        <span style={{
                          fontSize: "9px", fontWeight: 600,
                          background: "rgba(0,211,149,0.1)", border: "1px solid rgba(0,211,149,0.2)",
                          color: "var(--green)", padding: "1px 6px", borderRadius: "var(--radius-full)",
                        }}>
                          Friends
                        </span>
                      )}
                    </div>
                    {person.bio && (
                      <p style={{
                        fontSize: "12px", color: "var(--text-tertiary)", marginTop: "2px",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {person.bio}
                      </p>
                    )}
                    <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                      <span className="num">{person.followers_count}</span>
                      {" "}{person.followers_count === 1 ? "follower" : "followers"}
                    </p>
                  </div>
                </Link>
                {!person.is_self && (
                  <button
                    type="button"
                    onClick={() => {
                      setPeople((prev) =>
                        prev.map((p) =>
                          p.id === person.id
                            ? { ...p, is_following: !p.is_following, followers_count: p.is_following ? p.followers_count - 1 : p.followers_count + 1 }
                            : p
                        )
                      );
                      startTransition(() => followUser(person.id));
                    }}
                    style={{
                      padding: "6px 14px", borderRadius: "var(--radius-full)",
                      fontSize: "12px", fontWeight: 500, flexShrink: 0,
                      background: person.is_following ? "transparent" : "rgba(37,99,235,0.1)",
                      border: `1px solid ${person.is_following ? "var(--card-border)" : "rgba(37,99,235,0.25)"}`,
                      color: person.is_following ? "var(--text-tertiary)" : "#93c5fd",
                      cursor: "pointer", fontFamily: "var(--font-body)",
                      transition: "color 150ms ease, background 150ms ease, border-color 150ms ease",
                    }}
                    onPointerDown={(e) => { e.currentTarget.style.transform = "scale(0.96)"; }}
                    onPointerUp={(e)   => { e.currentTarget.style.transform = ""; }}
                    onPointerCancel={(e) => { e.currentTarget.style.transform = ""; }}
                  >
                    {person.is_following ? "Following" : "Follow"}
                  </button>
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
            <p style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>
              No users found{search ? ` for "${search}"` : ""}.
            </p>
          </div>
        )
      ) : (
        /* ── Strategies ── */
        strategies.length > 0 ? (
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
              No public strategies yet
            </h3>
            <p style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>
              Be the first to share — go to Strategies and toggle one public.
            </p>
          </div>
        )
      )}
    </div>
  );
}
