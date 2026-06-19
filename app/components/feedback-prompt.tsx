"use client";

import { useState, useEffect } from "react";

const STORAGE_KEY = "bt_feedback_prompted_at";
const CADENCE_MS = 30 * 24 * 60 * 60 * 1000; // re-ask every 30 days
const MIN_ACCOUNT_AGE_MS = 24 * 60 * 60 * 1000; // skip brand-new accounts (returning users only)
const SHOW_DELAY_MS = 5000; // let the dashboard settle before prompting

export default function FeedbackPrompt({ accountCreatedAt }: { accountCreatedAt: string | null }) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Only prompt returning users — skip accounts created in the last day.
    if (accountCreatedAt) {
      const age = Date.now() - new Date(accountCreatedAt).getTime();
      if (Number.isFinite(age) && age < MIN_ACCOUNT_AGE_MS) return;
    }

    let last = 0;
    try {
      last = Number(window.localStorage.getItem(STORAGE_KEY) ?? 0);
    } catch {
      return; // localStorage blocked — don't prompt
    }
    if (last && Date.now() - last < CADENCE_MS) return;

    const t = setTimeout(() => setOpen(true), SHOW_DELAY_MS);
    return () => clearTimeout(t);
  }, [accountCreatedAt]);

  function markPrompted() {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch { /* ignore */ }
  }

  function dismiss() {
    markPrompted();
    setOpen(false);
  }

  async function submit() {
    if (rating < 1 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, feedback }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Could not save your feedback.");
      }
      markPrompted();
      setDone(true);
      setTimeout(() => setOpen(false), 1600);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9998,
        background: "rgba(2,7,18,0.82)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "20px",
      }}
      onClick={dismiss}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--card-border)",
          borderRadius: "16px",
          maxWidth: "440px", width: "100%",
          padding: "28px",
          boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
        }}
      >
        {done ? (
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <div style={{ fontSize: "32px", marginBottom: "8px" }}>🙏</div>
            <h2 style={{
              fontFamily: "var(--font-display)", fontSize: "18px", fontWeight: 700,
              color: "var(--text-primary)", marginBottom: "4px",
            }}>
              Thank you!
            </h2>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
              Your feedback helps shape BuyTune.
            </p>
          </div>
        ) : (
          <>
            <div style={{
              fontSize: "11px", fontWeight: 700, letterSpacing: "0.12em",
              textTransform: "uppercase", color: "var(--brand-blue)", marginBottom: "10px",
            }}>
              BuyTune
            </div>
            <h2 style={{
              fontFamily: "var(--font-display)", fontSize: "20px", fontWeight: 700,
              color: "var(--text-primary)", letterSpacing: "-0.4px", marginBottom: "6px",
            }}>
              Are you enjoying BuyTune?
            </h2>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: "20px" }}>
              Tap a rating below. It takes a few seconds and genuinely helps.
            </p>

            {/* Stars */}
            <div style={{ display: "flex", gap: "8px", marginBottom: "20px", justifyContent: "center" }}>
              {[1, 2, 3, 4, 5].map((n) => {
                const active = (hover || rating) >= n;
                return (
                  <button
                    key={n}
                    type="button"
                    aria-label={`${n} star${n > 1 ? "s" : ""}`}
                    onMouseEnter={() => setHover(n)}
                    onMouseLeave={() => setHover(0)}
                    onClick={() => setRating(n)}
                    style={{
                      background: "none", border: "none", cursor: "pointer",
                      padding: "4px", lineHeight: 0, transition: "transform 0.12s",
                      transform: active ? "scale(1.08)" : "scale(1)",
                    }}
                  >
                    <svg width="34" height="34" viewBox="0 0 24 24"
                      fill={active ? "#f59e0b" : "none"}
                      stroke={active ? "#f59e0b" : "var(--border-strong)"}
                      strokeWidth="1.5">
                      <path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.8 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z"
                        strokeLinejoin="round" />
                    </svg>
                  </button>
                );
              })}
            </div>

            {/* Optional feedback */}
            <label style={{
              display: "block", fontSize: "11px", fontWeight: 600,
              textTransform: "uppercase", letterSpacing: "0.06em",
              color: "var(--text-muted)", marginBottom: "8px",
            }}>
              Anything you&apos;d like to share? (optional)
            </label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder="What's working, what's not, what you'd love to see…"
              style={{
                width: "100%", resize: "vertical", minHeight: "72px",
                background: "var(--bg-surface)", border: "1px solid var(--card-border)",
                borderRadius: "10px", padding: "10px 12px",
                fontSize: "13px", color: "var(--text-primary)",
                fontFamily: "var(--font-body)", marginBottom: "16px",
                outline: "none",
              }}
            />

            {error && (
              <div style={{ fontSize: "12px", color: "var(--red)", marginBottom: "12px" }}>
                {error}
              </div>
            )}

            <div style={{ display: "flex", gap: "10px" }}>
              <button
                onClick={dismiss}
                style={{
                  flex: "0 0 auto", padding: "11px 16px", borderRadius: "10px",
                  border: "1px solid var(--card-border)", background: "transparent",
                  color: "var(--text-secondary)", fontSize: "13px", fontWeight: 600,
                  cursor: "pointer", fontFamily: "var(--font-body)",
                }}
              >
                Maybe later
              </button>
              <button
                onClick={submit}
                disabled={rating < 1 || submitting}
                style={{
                  flex: 1, padding: "11px", borderRadius: "10px", border: "none",
                  background: rating >= 1 ? "var(--brand-blue)" : "var(--bg-surface)",
                  color: rating >= 1 ? "#fff" : "var(--text-muted)",
                  fontSize: "14px", fontWeight: 600,
                  cursor: rating >= 1 && !submitting ? "pointer" : "not-allowed",
                  fontFamily: "var(--font-body)", transition: "all 0.15s",
                  opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting ? "Sending…" : "Submit feedback"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
