"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { likeStrategy, saveStrategy, followUser, postComment } from "./social-actions";

type Author = {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_color: string;
  is_following: boolean;
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

function riskColor(r: string | null) {
  if (!r) return { bg: "var(--card-bg)", border: "var(--card-border)", color: "var(--text-tertiary)" };
  const l = r.toLowerCase();
  if (["low","conservative"].includes(l)) return { bg: "var(--green-bg)", border: "var(--green-border)", color: "var(--green)" };
  if (["high","aggressive"].includes(l)) return { bg: "var(--red-bg)", border: "var(--red-border)", color: "var(--red)" };
  return { bg: "var(--amber-bg)", border: "var(--amber-border)", color: "var(--amber)" };
}

function Avatar({ username, color, size = 28 }: { username: string; color: string; size?: number }) {
  return (
    <div style={{ width: size, height: size, minWidth: size, borderRadius: "50%", background: color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.4, fontWeight: 600, color: "#fff", fontFamily: "var(--font-body)" }}>
      {username[0]?.toUpperCase()}
    </div>
  );
}

function StrategyCard({ s, onLike, onSave, onFollow, onComment }: {
  s: StrategyRow;
  onLike: (id: string) => void;
  onSave: (id: string) => void;
  onFollow: (userId: string) => void;
  onComment: (id: string) => void;
}) {
  const rs = riskColor(s.risk_level);

  return (
    <div className="bt-card bt-lift" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "7px", marginBottom: "5px" }}>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: "15px", fontWeight: 600, color: "var(--text-primary)" }}>
              {s.name}
            </h3>
            {s.risk_level && (
              <span style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", padding: "2px 7px", borderRadius: "var(--radius-full)", background: rs.bg, border: `1px solid ${rs.border}`, color: rs.color }}>
                {s.risk_level}
              </span>
            )}
            {s.style && (
              <span style={{ fontSize: "9px", color: "var(--text-tertiary)", background: "var(--card-bg)", border: "1px solid var(--card-border)", padding: "2px 7px", borderRadius: "var(--radius-full)" }}>
                {s.style}
              </span>
            )}
          </div>
          {s.description && (
            <p style={{ fontSize: "12px", color: "var(--text-tertiary)", lineHeight: 1.6 }}>{s.description}</p>
          )}
        </div>

        {/* Save button */}
        {!s.is_own && (
          <button
            type="button"
            onClick={() => onSave(s.id)}
            title={s.is_saved ? "Remove from saved" : "Save to my strategies"}
            style={{
              display: "flex", alignItems: "center", gap: "5px",
              padding: "6px 11px", borderRadius: "var(--radius-md)",
              fontSize: "12px", fontWeight: 500,
              background: s.is_saved ? "rgba(37,99,235,0.1)" : "var(--card-bg)",
              border: `1px solid ${s.is_saved ? "rgba(37,99,235,0.25)" : "var(--card-border)"}`,
              color: s.is_saved ? "#93c5fd" : "var(--text-secondary)",
              cursor: "pointer", transition: "var(--transition-base)", flexShrink: 0,
              fontFamily: "var(--font-body)",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 20 20" fill={s.is_saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5">
              <path d="M5 3a2 2 0 00-2 2v12l7-3 7 3V5a2 2 0 00-2-2H5z"/>
            </svg>
            {s.is_saved ? "Saved" : "Save"}
          </button>
        )}
      </div>

      {/* Author row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href={`/@${s.author.username}`} style={{ display: "flex", alignItems: "center", gap: "8px", textDecoration: "none" }}>
          <Avatar username={s.author.username} color={s.author.avatar_color} size={26} />
          <div>
            <span style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-secondary)" }}>
              {s.author.display_name || s.author.username}
            </span>
            <span style={{ fontSize: "11px", color: "var(--text-muted)", marginLeft: "4px" }}>
              @{s.author.username}
            </span>
          </div>
        </Link>

        {!s.is_own && (
          <button
            type="button"
            onClick={() => onFollow(s.author.user_id)}
            style={{
              padding: "4px 10px", borderRadius: "var(--radius-full)",
              fontSize: "11px", fontWeight: 500,
              background: s.author.is_following ? "var(--card-bg)" : "rgba(37,99,235,0.1)",
              border: `1px solid ${s.author.is_following ? "var(--card-border)" : "rgba(37,99,235,0.25)"}`,
              color: s.author.is_following ? "var(--text-tertiary)" : "#93c5fd",
              cursor: "pointer", transition: "var(--transition-base)",
              fontFamily: "var(--font-body)",
            }}
          >
            {s.author.is_following ? "Following" : "Follow"}
          </button>
        )}
      </div>

      {/* Footer — likes, saves, comment */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", paddingTop: "8px", borderTop: "1px solid var(--border-subtle)" }}>
        {/* Like */}
        <button
          type="button"
          onClick={() => onLike(s.id)}
          style={{
            display: "flex", alignItems: "center", gap: "5px",
            padding: "4px 8px", borderRadius: "var(--radius-md)",
            fontSize: "12px", fontWeight: 500,
            background: s.is_liked ? "rgba(255,92,92,0.08)" : "none",
            border: `1px solid ${s.is_liked ? "rgba(255,92,92,0.2)" : "transparent"}`,
            color: s.is_liked ? "#ff5c5c" : "var(--text-tertiary)",
            cursor: "pointer", transition: "var(--transition-base)",
            fontFamily: "var(--font-body)",
          }}
        >
          <svg width="13" height="13" viewBox="0 0 20 20" fill={s.is_liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5">
            <path d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z"/>
          </svg>
          {s.likes_count}
        </button>

        {/* Copies */}
        <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px", color: "var(--text-muted)" }}>
          <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
            <path d="M7 9a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H9a2 2 0 01-2-2V9z"/>
            <path d="M5 3a2 2 0 00-2 2v6a2 2 0 002 2V5h8a2 2 0 00-2-2H5z"/>
          </svg>
          {s.copies_count} {s.copies_count === 1 ? "copy" : "copies"}
        </div>

        {/* Comment button */}
        <button
          type="button"
          onClick={() => onComment(s.id)}
          style={{
            display: "flex", alignItems: "center", gap: "5px",
            padding: "4px 8px", borderRadius: "var(--radius-md)",
            fontSize: "12px", color: "var(--text-tertiary)",
            background: "none", border: "1px solid transparent",
            cursor: "pointer", transition: "var(--transition-base)",
            fontFamily: "var(--font-body)",
          }}
        >
          <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2 5a2 2 0 012-2h12a2 2 0 012 2v8a2 2 0 01-2 2H7l-5 3V5z"/>
          </svg>
          Comment
        </button>

        <span style={{ marginLeft: "auto", fontSize: "10px", color: "var(--text-muted)" }}>
          {new Date(s.created_at).toLocaleDateString()}
        </span>
      </div>
    </div>
  );
}

export default function CommunityClient({
  strategies: initialStrategies,
  currentUserId,
  initialSort,
  initialStyle,
  initialRisk,
  initialQuery,
}: {
  strategies: StrategyRow[];
  currentUserId: string;
  initialSort: string;
  initialStyle: string;
  initialRisk: string;
  initialQuery: string;
}) {
  const router = useRouter();
  const [strategies, setStrategies] = useState(initialStrategies);
  const [commentingId, setCommentingId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState(initialQuery);

  function updateUrl(params: Record<string, string>) {
    const sp = new URLSearchParams(window.location.search);
    Object.entries(params).forEach(([k, v]) => v ? sp.set(k, v) : sp.delete(k));
    router.push(`/community?${sp.toString()}`);
  }

  function handleLike(id: string) {
    setStrategies(prev => prev.map(s => s.id === id ? {
      ...s,
      is_liked: !s.is_liked,
      likes_count: s.is_liked ? s.likes_count - 1 : s.likes_count + 1,
    } : s));
    startTransition(() => likeStrategy(id));
  }

  function handleSave(id: string) {
    setStrategies(prev => prev.map(s => s.id === id ? { ...s, is_saved: !s.is_saved } : s));
    startTransition(() => saveStrategy(id));
  }

  function handleFollow(userId: string) {
    setStrategies(prev => prev.map(s => s.author.user_id === userId ? {
      ...s,
      author: { ...s.author, is_following: !s.author.is_following },
    } : s));
    startTransition(() => followUser(userId));
  }

  function handleComment(id: string) {
    setCommentingId(commentingId === id ? null : id);
    setCommentText("");
  }

  async function submitComment(strategyId: string) {
    if (!commentText.trim()) return;
    await postComment(strategyId, commentText);
    setCommentingId(null);
    setCommentText("");
    router.refresh();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Filters */}
      <div className="bt-card" style={{ padding: "14px 16px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" }}>
          {/* Search */}
          <div style={{ position: "relative", flex: 1, minWidth: "200px" }}>
            <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" style={{ position: "absolute", left: "11px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }}>
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd"/>
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === "Enter" && updateUrl({ q: search })}
              placeholder="Search strategies..."
              style={{ width: "100%", padding: "8px 12px 8px 30px", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--text-primary)", fontSize: "13px", fontFamily: "var(--font-body)", outline: "none" }}
            />
          </div>

          {/* Sort */}
          {[
            { val: "popular", label: "Most liked" },
            { val: "newest", label: "Newest" },
            { val: "copied", label: "Most saved" },
          ].map(opt => (
            <button
              key={opt.val}
              type="button"
              onClick={() => updateUrl({ sort: opt.val })}
              style={{
                padding: "7px 13px", borderRadius: "8px", fontSize: "12px", fontWeight: 500,
                background: initialSort === opt.val ? "rgba(37,99,235,0.1)" : "var(--card-bg)",
                border: `1px solid ${initialSort === opt.val ? "rgba(37,99,235,0.25)" : "var(--card-border)"}`,
                color: initialSort === opt.val ? "#93c5fd" : "var(--text-tertiary)",
                cursor: "pointer", transition: "var(--transition-base)", fontFamily: "var(--font-body)",
              }}
            >
              {opt.label}
            </button>
          ))}

          {/* Risk filter */}
          <select
            value={initialRisk}
            onChange={e => updateUrl({ risk: e.target.value })}
            style={{ padding: "7px 12px", background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "8px", color: "var(--text-secondary)", fontSize: "12px", fontFamily: "var(--font-body)", outline: "none", cursor: "pointer" }}
          >
            <option value="">All risk levels</option>
            <option value="low">Conservative</option>
            <option value="moderate">Moderate</option>
            <option value="high">Aggressive</option>
          </select>
        </div>
      </div>

      {/* Strategy count */}
      <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>
        {strategies.length} public {strategies.length === 1 ? "strategy" : "strategies"}
      </p>

      {/* Strategy cards */}
      {strategies.length > 0 ? (
        <div className="bt-list-animate" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {strategies.map(s => (
            <div key={s.id}>
              <StrategyCard
                s={s}
                onLike={handleLike}
                onSave={handleSave}
                onFollow={handleFollow}
                onComment={handleComment}
              />

              {/* Comment box */}
              {commentingId === s.id && (
                <div className="bt-sd" style={{ marginTop: "8px", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "12px" }}>
                  <textarea
                    value={commentText}
                    onChange={e => setCommentText(e.target.value)}
                    placeholder="Share your thoughts on this strategy..."
                    rows={3}
                    maxLength={1000}
                    style={{ width: "100%", background: "transparent", border: "none", outline: "none", color: "var(--text-primary)", fontSize: "13px", fontFamily: "var(--font-body)", resize: "none", lineHeight: 1.6 }}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px", paddingTop: "8px", borderTop: "1px solid var(--border-subtle)" }}>
                    <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{commentText.length}/1000</span>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button type="button" onClick={() => setCommentingId(null)} className="bt-btn bt-btn-ghost bt-btn-sm">Cancel</button>
                      <button type="button" onClick={() => submitComment(s.id)} disabled={!commentText.trim()} className="bt-btn bt-btn-primary bt-btn-sm">Post</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="bt-card" style={{ padding: "48px", textAlign: "center" }}>
          <div style={{ fontSize: "32px", marginBottom: "12px" }}>🌐</div>
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: "15px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "6px" }}>
            No public strategies yet
          </h3>
          <p style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>
            Be the first to share — go to Strategies and toggle one public.
          </p>
        </div>
      )}
    </div>
  );
}
