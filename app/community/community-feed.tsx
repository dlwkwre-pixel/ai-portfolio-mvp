"use client";

import { useState, useMemo, useRef, useTransition } from "react";
import Link from "next/link";
import {
  createPost, deletePost, togglePostLike,
  addPostComment, deletePostComment, votePoll, reportPost,
} from "./post-actions";

// ── Types ────────────────────────────────────────────────────────────────────

export type FeedAuthor = { id: string; username: string | null; display_name: string | null; avatar_color: string | null };
export type FeedComment = { id: string; user_id: string; body: string; created_at: string; author: FeedAuthor | null };
export type FeedPost = {
  id: string;
  user_id: string;
  body: string;
  tickers: string[];
  created_at: string;
  author: FeedAuthor | null;
  attached_strategy: { id: string; name: string; style: string | null; risk_level: string | null } | null;
  attached_portfolio: { id: string; public_name: string | null; return_pct: number | null } | null;
  poll_options: string[] | null;
  poll_counts: number[];
  poll_my_vote: number | null;
  ai_ticker: string | null;
  ai_take: string | null;
  like_count: number;
  liked_by_me: boolean;
  comments: FeedComment[];
};

export type MyOption = { id: string; name: string };

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function initial(a: FeedAuthor | null): string {
  const s = a?.display_name || a?.username || "?";
  return s.charAt(0).toUpperCase();
}
function authorName(a: FeedAuthor | null): string {
  return a?.display_name || a?.username || "Investor";
}

function Avatar({ author, size = 34 }: { author: FeedAuthor | null; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: author?.avatar_color || "var(--brand-gradient)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.42, fontWeight: 600, color: "#fff", fontFamily: "var(--font-body)",
    }}>
      {initial(author)}
    </div>
  );
}

// Render body with $TICKER chips clickable to filter the feed.
function PostBody({ body, onTicker }: { body: string; onTicker: (t: string) => void }) {
  const parts = body.split(/(\$[A-Za-z.]{1,6})/g);
  return (
    <p style={{ fontSize: "14px", color: "var(--text-primary)", lineHeight: 1.55, whiteSpace: "pre-wrap", margin: 0 }}>
      {parts.map((part, i) => {
        if (/^\$[A-Za-z.]{1,6}$/.test(part)) {
          const t = part.slice(1).toUpperCase();
          return (
            <button key={i} type="button" onClick={() => onTicker(t)}
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--brand-blue)", fontWeight: 600, fontFamily: "inherit", fontSize: "inherit" }}>
              ${t}
            </button>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </p>
  );
}

// ── Composer ─────────────────────────────────────────────────────────────────

function Composer({ me, myStrategies, myPortfolios, onPosted }: {
  me: FeedAuthor;
  myStrategies: MyOption[];
  myPortfolios: MyOption[];
  onPosted: (p: FeedPost) => void;
}) {
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const [showPoll, setShowPoll] = useState(false);
  const [pollOpts, setPollOpts] = useState<string[]>(["", ""]);
  const [attachStrategyId, setAttachStrategyId] = useState("");
  const [attachPortfolioId, setAttachPortfolioId] = useState("");

  const [finnTicker, setFinnTicker] = useState("");
  const [finnTake, setFinnTake] = useState("");
  const [finnLoading, setFinnLoading] = useState(false);
  const [showFinn, setShowFinn] = useState(false);

  const detectedTickers = useMemo(() => {
    const found = new Set<string>();
    for (const m of body.matchAll(/\$([A-Za-z.]{1,6})/g)) found.add(m[1].toUpperCase());
    return [...found].slice(0, 8);
  }, [body]);

  async function generateFinn() {
    const t = finnTicker.toUpperCase().replace(/[^A-Z.]/g, "");
    if (!t) return;
    setFinnLoading(true);
    setError("");
    try {
      const res = await fetch("/api/community/finn-take", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: t }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Atlas is unavailable.");
      setFinnTake(data.take);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Atlas failed.");
    } finally {
      setFinnLoading(false);
    }
  }

  function submit() {
    if (!body.trim() || pending) return;
    setError("");
    const validPoll = showPoll ? pollOpts.map(o => o.trim()).filter(Boolean) : [];
    startTransition(async () => {
      try {
        const { id } = await createPost({
          body: body.trim(),
          tickers: detectedTickers,
          attachStrategyId: attachStrategyId || null,
          attachPortfolioId: attachPortfolioId || null,
          pollOptions: validPoll.length >= 2 ? validPoll : null,
          aiTicker: showFinn && finnTake ? finnTicker.toUpperCase() : null,
          aiTake: showFinn && finnTake ? finnTake : null,
        });
        // Optimistically prepend
        const strat = myStrategies.find(s => s.id === attachStrategyId);
        const port = myPortfolios.find(p => p.id === attachPortfolioId);
        onPosted({
          id, user_id: me.id, body: body.trim(), tickers: detectedTickers,
          created_at: new Date().toISOString(), author: me,
          attached_strategy: strat ? { id: strat.id, name: strat.name, style: null, risk_level: null } : null,
          attached_portfolio: port ? { id: port.id, public_name: port.name, return_pct: null } : null,
          poll_options: validPoll.length >= 2 ? validPoll : null,
          poll_counts: validPoll.length >= 2 ? validPoll.map(() => 0) : [],
          poll_my_vote: null,
          ai_ticker: showFinn && finnTake ? finnTicker.toUpperCase() : null,
          ai_take: showFinn && finnTake ? finnTake : null,
          like_count: 0, liked_by_me: false, comments: [],
        });
        // reset
        setBody(""); setShowPoll(false); setPollOpts(["", ""]);
        setAttachStrategyId(""); setAttachPortfolioId("");
        setShowFinn(false); setFinnTicker(""); setFinnTake("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not post.");
      }
    });
  }

  const toolBtn = (active: boolean): React.CSSProperties => ({
    display: "inline-flex", alignItems: "center", gap: "5px", padding: "6px 12px",
    borderRadius: "var(--radius-full)", fontSize: "11px", fontWeight: 600, cursor: "pointer",
    border: `1px solid ${active ? "rgba(37,99,235,0.4)" : "var(--card-border)"}`,
    background: active ? "rgba(37,99,235,0.1)" : "var(--card-bg)",
    color: active ? "var(--brand-blue)" : "var(--text-secondary)", transition: "all 0.12s",
  });
  const selStyle = (active: boolean): React.CSSProperties => ({
    appearance: "auto", maxWidth: "150px", padding: "6px 8px",
    borderRadius: "var(--radius-md)", fontSize: "11px", fontWeight: 600, cursor: "pointer",
    border: `1px solid ${active ? "rgba(37,99,235,0.4)" : "var(--card-border)"}`,
    background: active ? "rgba(37,99,235,0.1)" : "var(--card-bg)",
    color: active ? "var(--brand-blue)" : "var(--text-secondary)",
    textOverflow: "ellipsis",
  });

  return (
    <div className="bt-card" style={{ padding: "14px 16px", marginBottom: "16px" }}>
      <div style={{ display: "flex", gap: "10px" }}>
        <Avatar author={me} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Share a take, tag a stock with $NVDA, ask the community…"
            maxLength={2000}
            rows={2}
            style={{
              width: "100%", resize: "none", minHeight: "44px",
              background: "transparent", border: "none", outline: "none",
              fontSize: "14px", color: "var(--text-primary)", fontFamily: "var(--font-body)", lineHeight: 1.5,
            }}
          />

          {detectedTickers.length > 0 && (
            <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", marginTop: "4px" }}>
              {detectedTickers.map(t => (
                <span key={t} style={{ fontSize: "10px", fontWeight: 600, fontFamily: "var(--font-mono)", color: "var(--brand-blue)", background: "rgba(37,99,235,0.1)", border: "1px solid rgba(37,99,235,0.2)", padding: "1px 7px", borderRadius: "var(--radius-full)" }}>${t}</span>
              ))}
            </div>
          )}

          {/* Poll editor */}
          {showPoll && (
            <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "6px" }}>
              {pollOpts.map((opt, i) => (
                <div key={i} style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  <input value={opt} onChange={(e) => setPollOpts(prev => prev.map((o, j) => j === i ? e.target.value : o))}
                    placeholder={`Option ${i + 1}`} maxLength={60}
                    style={{ flex: 1, background: "var(--bg-base)", border: "1px solid var(--card-border)", borderRadius: "8px", padding: "6px 10px", fontSize: "12px", color: "var(--text-primary)", outline: "none" }} />
                  {pollOpts.length > 2 && (
                    <button type="button" onClick={() => setPollOpts(prev => prev.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "16px" }}>×</button>
                  )}
                </div>
              ))}
              {pollOpts.length < 5 && (
                <button type="button" onClick={() => setPollOpts(prev => [...prev, ""])} style={{ alignSelf: "flex-start", background: "none", border: "none", color: "var(--brand-blue)", fontSize: "11px", fontWeight: 600, cursor: "pointer", padding: 0 }}>+ Add option</button>
              )}
            </div>
          )}

          {/* Atlas take editor */}
          {showFinn && (
            <div style={{ marginTop: "10px", padding: "10px 12px", background: "var(--violet-bg)", border: "1px solid var(--violet-border)", borderRadius: "10px" }}>
              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                <input value={finnTicker} onChange={(e) => setFinnTicker(e.target.value.toUpperCase().replace(/[^A-Z.]/g, ""))}
                  placeholder="Ticker" maxLength={6}
                  style={{ width: "90px", background: "var(--bg-base)", border: "1px solid var(--card-border)", borderRadius: "8px", padding: "6px 10px", fontSize: "12px", color: "var(--text-primary)", outline: "none", fontFamily: "var(--font-mono)" }} />
                <button type="button" onClick={generateFinn} disabled={finnLoading || !finnTicker}
                  style={{ padding: "6px 12px", borderRadius: "8px", border: "none", background: "var(--violet)", color: "#fff", fontSize: "11px", fontWeight: 600, cursor: "pointer", opacity: finnLoading || !finnTicker ? 0.6 : 1 }}>
                  {finnLoading ? "Thinking…" : "Get Atlas's take"}
                </button>
              </div>
              {finnTake && <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.5, margin: "8px 0 0" }}>{finnTake}</p>}
            </div>
          )}

          {/* Attach selectors */}
          {(attachStrategyId || myStrategies.length > 0) && attachStrategyId && (
            <div style={{ marginTop: "8px", fontSize: "11px", color: "var(--text-tertiary)" }}>
              Attaching strategy: <strong style={{ color: "var(--text-secondary)" }}>{myStrategies.find(s => s.id === attachStrategyId)?.name}</strong>
              <button type="button" onClick={() => setAttachStrategyId("")} style={{ marginLeft: "6px", background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}>remove</button>
            </div>
          )}
          {attachPortfolioId && (
            <div style={{ marginTop: "4px", fontSize: "11px", color: "var(--text-tertiary)" }}>
              Attaching portfolio: <strong style={{ color: "var(--text-secondary)" }}>{myPortfolios.find(p => p.id === attachPortfolioId)?.name}</strong>
              <button type="button" onClick={() => setAttachPortfolioId("")} style={{ marginLeft: "6px", background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}>remove</button>
            </div>
          )}

          {error && <div style={{ fontSize: "12px", color: "var(--red)", marginTop: "8px" }}>{error}</div>}

          {/* Toolbar */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "12px", flexWrap: "wrap" }}>
            <button type="button" style={toolBtn(showPoll)} onClick={() => setShowPoll(v => !v)}>📊 Poll</button>
            <button type="button" style={toolBtn(showFinn)} onClick={() => setShowFinn(v => !v)}>✦ Atlas take</button>
            {myStrategies.length > 0 && (
              <select value={attachStrategyId} onChange={(e) => setAttachStrategyId(e.target.value)}
                style={selStyle(!!attachStrategyId)}>
                <option value="">+ Strategy</option>
                {myStrategies.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
            {myPortfolios.length > 0 && (
              <select value={attachPortfolioId} onChange={(e) => setAttachPortfolioId(e.target.value)}
                style={selStyle(!!attachPortfolioId)}>
                <option value="">+ Portfolio</option>
                {myPortfolios.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
            <div style={{ flex: 1 }} />
            <button type="button" onClick={submit} disabled={!body.trim() || pending}
              style={{ padding: "8px 18px", borderRadius: "var(--radius-full)", border: "none", background: "linear-gradient(135deg,#2563eb,#4f46e5)", color: "#fff", fontSize: "13px", fontWeight: 600, cursor: "pointer", opacity: !body.trim() || pending ? 0.5 : 1 }}>
              {pending ? "Posting…" : "Post"}
            </button>
          </div>
          <p style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "8px" }}>
            Posts are community opinions, not financial advice.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Post card ────────────────────────────────────────────────────────────────

function PostCard({ post, myUserId, onTicker, onChange, onRemove }: {
  post: FeedPost; myUserId: string;
  onTicker: (t: string) => void;
  onChange: (p: FeedPost) => void;
  onRemove: (id: string) => void;
}) {
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [pending, startTransition] = useTransition();
  const [menuOpen, setMenuOpen] = useState(false);
  const likeBusy = useRef(false);

  const isMine = post.user_id === myUserId;
  const pollTotal = post.poll_counts.reduce((a, b) => a + b, 0);

  function toggleLike() {
    if (likeBusy.current) return;
    likeBusy.current = true;
    const liked = !post.liked_by_me;
    onChange({ ...post, liked_by_me: liked, like_count: post.like_count + (liked ? 1 : -1) });
    togglePostLike(post.id).catch(() => {
      onChange({ ...post, liked_by_me: !liked, like_count: post.like_count });
    }).finally(() => { likeBusy.current = false; });
  }

  function castVote(idx: number) {
    if (post.poll_my_vote === idx) return;
    const counts = [...post.poll_counts];
    if (post.poll_my_vote != null) counts[post.poll_my_vote] = Math.max(0, counts[post.poll_my_vote] - 1);
    counts[idx] = (counts[idx] ?? 0) + 1;
    onChange({ ...post, poll_counts: counts, poll_my_vote: idx });
    votePoll(post.id, idx).catch(() => {});
  }

  function submitComment() {
    if (!commentText.trim() || pending) return;
    const text = commentText.trim();
    startTransition(async () => {
      try {
        const { id, created_at } = await addPostComment(post.id, text);
        onChange({ ...post, comments: [...post.comments, { id, user_id: myUserId, body: text, created_at, author: null }] });
        setCommentText("");
      } catch { /* surfaced minimally */ }
    });
  }

  function removeComment(cid: string) {
    onChange({ ...post, comments: post.comments.filter(c => c.id !== cid) });
    deletePostComment(cid).catch(() => {});
  }

  function handleReport() {
    setMenuOpen(false);
    reportPost(post.id, "reported from feed").catch(() => {});
    alert("Thanks — this post has been reported for review.");
  }
  function handleDelete() {
    setMenuOpen(false);
    onRemove(post.id);
    deletePost(post.id).catch(() => {});
  }

  return (
    <div className="bt-card" style={{ padding: "14px 16px", marginBottom: "10px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
        <Avatar author={post.author} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>{authorName(post.author)}</div>
          <div style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
            {post.author?.username ? `@${post.author.username} · ` : ""}{timeAgo(post.created_at)}
          </div>
        </div>
        <div style={{ position: "relative" }}>
          <button type="button" onClick={() => setMenuOpen(v => !v)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "4px", fontSize: "16px", lineHeight: 1 }}>⋯</button>
          {menuOpen && (
            <div style={{ position: "absolute", right: 0, top: "100%", zIndex: 20, background: "var(--bg-elevated)", border: "1px solid var(--card-border)", borderRadius: "10px", boxShadow: "var(--shadow-md)", overflow: "hidden", minWidth: "120px" }}>
              {isMine ? (
                <button type="button" onClick={handleDelete} style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 14px", background: "none", border: "none", cursor: "pointer", fontSize: "12px", color: "var(--red)" }}>Delete</button>
              ) : (
                <button type="button" onClick={handleReport} style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 14px", background: "none", border: "none", cursor: "pointer", fontSize: "12px", color: "var(--text-secondary)" }}>Report</button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <PostBody body={post.body} onTicker={onTicker} />

      {/* Atlas take */}
      {post.ai_ticker && post.ai_take && (
        <div style={{ marginTop: "10px", padding: "10px 12px", background: "var(--violet-bg)", border: "1px solid var(--violet-border)", borderRadius: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--violet)" }}>✦ Atlas on ${post.ai_ticker}</span>
          </div>
          <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.5, margin: 0 }}>{post.ai_take}</p>
        </div>
      )}

      {/* Poll */}
      {post.poll_options && post.poll_options.length >= 2 && (
        <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "6px" }}>
          {post.poll_options.map((opt, i) => {
            const pct = pollTotal > 0 ? Math.round((post.poll_counts[i] ?? 0) / pollTotal * 100) : 0;
            const voted = post.poll_my_vote === i;
            return (
              <button key={i} type="button" onClick={() => castVote(i)}
                style={{ position: "relative", overflow: "hidden", textAlign: "left", padding: "8px 12px", borderRadius: "9px", cursor: "pointer",
                  border: `1px solid ${voted ? "rgba(37,99,235,0.45)" : "var(--card-border)"}`, background: "var(--bg-base)" }}>
                <div style={{ position: "absolute", inset: 0, width: `${pct}%`, background: voted ? "rgba(37,99,235,0.18)" : "var(--card-hover)", transition: "width 0.4s ease" }} />
                <div style={{ position: "relative", display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                  <span style={{ color: "var(--text-primary)", fontWeight: voted ? 600 : 400 }}>{opt}</span>
                  <span style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{pct}%</span>
                </div>
              </button>
            );
          })}
          <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>{pollTotal} vote{pollTotal !== 1 ? "s" : ""}</div>
        </div>
      )}

      {/* Attachments */}
      {post.attached_strategy && (
        <Link href="/community?section=strategies" style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "10px", padding: "9px 12px", background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "10px", textDecoration: "none" }}>
          <span style={{ fontSize: "13px" }}>🎯</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>{post.attached_strategy.name}</div>
            <div style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>Strategy{post.attached_strategy.risk_level ? ` · ${post.attached_strategy.risk_level}` : ""}</div>
          </div>
        </Link>
      )}
      {post.attached_portfolio && (
        <Link href={`/community/portfolios/${post.attached_portfolio.id}`} style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "8px", padding: "9px 12px", background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "10px", textDecoration: "none" }}>
          <span style={{ fontSize: "13px" }}>📁</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>{post.attached_portfolio.public_name || "Portfolio"}</div>
            <div style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>Shared portfolio</div>
          </div>
        </Link>
      )}

      {/* Actions */}
      <div style={{ display: "flex", alignItems: "center", gap: "18px", marginTop: "12px", paddingTop: "10px", borderTop: "1px solid var(--border-subtle)" }}>
        <button type="button" onClick={toggleLike} style={{ display: "flex", alignItems: "center", gap: "6px", background: "none", border: "none", cursor: "pointer", color: post.liked_by_me ? "var(--red)" : "var(--text-tertiary)", fontSize: "12px", fontWeight: 600 }}>
          <svg width="15" height="15" viewBox="0 0 20 20" fill={post.liked_by_me ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6"><path d="M10 17s-6-4.35-6-8.5A3.5 3.5 0 0110 6a3.5 3.5 0 016 2.5C16 12.65 10 17 10 17z" /></svg>
          {post.like_count > 0 ? post.like_count : ""} Like
        </button>
        <button type="button" onClick={() => setShowComments(v => !v)} style={{ display: "flex", alignItems: "center", gap: "6px", background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", fontSize: "12px", fontWeight: 600 }}>
          <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 5.5A1.5 1.5 0 014.5 4h11A1.5 1.5 0 0117 5.5v7a1.5 1.5 0 01-1.5 1.5H8l-4 3v-3H4.5A1.5 1.5 0 013 12.5z" /></svg>
          {post.comments.length > 0 ? post.comments.length : ""} Comment
        </button>
      </div>

      {/* Comments */}
      {showComments && (
        <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
          {post.comments.map(c => (
            <div key={c.id} style={{ display: "flex", gap: "8px" }}>
              <Avatar author={c.author} size={24} />
              <div style={{ flex: 1, minWidth: 0, background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "10px", padding: "7px 10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                  <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-primary)" }}>{authorName(c.author)}</span>
                  <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>{timeAgo(c.created_at)}</span>
                </div>
                <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.45, margin: "2px 0 0", whiteSpace: "pre-wrap" }}>{c.body}</p>
              </div>
              {c.user_id === myUserId && (
                <button type="button" onClick={() => removeComment(c.id)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "13px", flexShrink: 0 }}>×</button>
              )}
            </div>
          ))}
          <div style={{ display: "flex", gap: "6px" }}>
            <input value={commentText} onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitComment()}
              placeholder="Add a comment…" maxLength={1000}
              style={{ flex: 1, background: "var(--bg-base)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-full)", padding: "8px 14px", fontSize: "12px", color: "var(--text-primary)", outline: "none" }} />
            <button type="button" onClick={submitComment} disabled={!commentText.trim() || pending}
              style={{ padding: "8px 14px", borderRadius: "var(--radius-full)", border: "none", background: "var(--brand-blue)", color: "#fff", fontSize: "12px", fontWeight: 600, cursor: "pointer", opacity: !commentText.trim() || pending ? 0.5 : 1 }}>
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Feed ─────────────────────────────────────────────────────────────────────

export default function CommunityFeed({ me, initialPosts, myFollowIds, myStrategies, myPortfolios }: {
  me: FeedAuthor;
  initialPosts: FeedPost[];
  myFollowIds: string[];
  myStrategies: MyOption[];
  myPortfolios: MyOption[];
}) {
  const [posts, setPosts] = useState<FeedPost[]>(initialPosts);
  const [view, setView] = useState<"foryou" | "following">("foryou");
  const [tickerFilter, setTickerFilter] = useState<string | null>(null);
  const followSet = useMemo(() => new Set(myFollowIds), [myFollowIds]);

  const visible = useMemo(() => {
    let list = posts;
    if (view === "following") list = list.filter(p => followSet.has(p.user_id));
    if (tickerFilter) list = list.filter(p => p.tickers.includes(tickerFilter) || p.ai_ticker === tickerFilter);
    return list;
  }, [posts, view, tickerFilter, followSet]);

  // What the community is talking about — most-tagged tickers across the feed.
  const trendingTickers = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of posts) {
      const tset = new Set<string>([...p.tickers, ...(p.ai_ticker ? [p.ai_ticker] : [])]);
      for (const t of tset) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [posts]);

  function updatePost(p: FeedPost) { setPosts(prev => prev.map(x => x.id === p.id ? p : x)); }
  function removePost(id: string) { setPosts(prev => prev.filter(x => x.id !== id)); }
  function prepend(p: FeedPost) { setPosts(prev => [p, ...prev]); }

  return (
    <div>
      <Composer me={me} myStrategies={myStrategies} myPortfolios={myPortfolios} onPosted={prepend} />

      {/* Trending tickers — what the community is talking about */}
      {!tickerFilter && trendingTickers.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>🔥 Trending</span>
          {trendingTickers.map(([t, n]) => (
            <button key={t} type="button" onClick={() => setTickerFilter(t)}
              style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "4px 10px", borderRadius: "var(--radius-full)", fontSize: "11px", fontWeight: 600, cursor: "pointer", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--text-secondary)" }}>
              <span style={{ color: "var(--brand-blue)", fontFamily: "var(--font-mono)" }}>${t}</span>
              <span style={{ color: "var(--text-muted)" }}>{n}</span>
            </button>
          ))}
        </div>
      )}

      {/* Active ticker filter — header with a link into stock research */}
      {tickerFilter && (
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px", padding: "10px 14px", borderRadius: "var(--radius-lg)", background: "rgba(37,99,235,0.06)", border: "1px solid rgba(37,99,235,0.2)" }}>
          <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--brand-blue)", fontFamily: "var(--font-mono)" }}>${tickerFilter}</span>
          <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>{visible.length} post{visible.length !== 1 ? "s" : ""}</span>
          <Link href={`/research?ticker=${encodeURIComponent(tickerFilter)}`}
            style={{ fontSize: "12px", fontWeight: 600, color: "var(--brand-blue)", textDecoration: "none" }}>
            Research ${tickerFilter} →
          </Link>
          <button type="button" onClick={() => setTickerFilter(null)}
            style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: "13px", fontWeight: 600 }}>
            Clear ✕
          </button>
        </div>
      )}

      {/* View toggle */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
        {(["foryou", "following"] as const).map(v => (
          <button key={v} type="button" onClick={() => setView(v)}
            style={{ padding: "6px 14px", borderRadius: "var(--radius-full)", fontSize: "12px", fontWeight: 600, cursor: "pointer",
              border: `1px solid ${view === v ? "rgba(37,99,235,0.4)" : "var(--card-border)"}`,
              background: view === v ? "rgba(37,99,235,0.1)" : "transparent",
              color: view === v ? "var(--brand-blue)" : "var(--text-tertiary)" }}>
            {v === "foryou" ? "For You" : "Following"}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="bt-card" style={{ padding: "32px", textAlign: "center", color: "var(--text-tertiary)", fontSize: "13px" }}>
          {view === "following"
            ? "Posts from people you follow will show up here."
            : tickerFilter ? `No posts about $${tickerFilter} yet.` : "No posts yet — be the first to share a take."}
        </div>
      ) : (
        visible.map(p => (
          <PostCard key={p.id} post={p} myUserId={me.id} onTicker={setTickerFilter} onChange={updatePost} onRemove={removePost} />
        ))
      )}
    </div>
  );
}
