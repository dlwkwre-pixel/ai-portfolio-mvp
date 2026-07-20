"use client";

import { useState, useEffect, useTransition } from "react";
import { submitPricingSurvey } from "@/app/actions/survey-actions";

const FEATURE_OPTIONS: { key: string; label: string }[] = [
  { key: "multiple_portfolios", label: "More portfolios" },
  { key: "unlimited_ai", label: "Unlimited AI runs" },
  { key: "tax_center", label: "Tax center + export" },
  { key: "planning_stress", label: "Planning stress tests" },
  { key: "community_strategies", label: "Premium strategies" },
  { key: "none", label: "None of these" },
];

const PRICE_OPTIONS: { key: string; label: string }[] = [
  { key: "0", label: "$0" },
  { key: "5", label: "$5/mo" },
  { key: "10", label: "$10/mo" },
  { key: "20", label: "$20+/mo" },
];

const DISMISS_KEY = "bt-wtp-dismissed";

// One-time willingness-to-pay pulse. Shown on the dashboard until answered or
// dismissed; feeds /admin/metrics so Phase 1 pricing is based on real users.
export default function PricingSurveyCard({ hasResponded }: { hasResponded: boolean }) {
  const [visible, setVisible] = useState(false);
  const [features, setFeatures] = useState<string[]>([]);
  const [price, setPrice] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (hasResponded) return;
    try {
      if (localStorage.getItem(DISMISS_KEY)) return;
    } catch { /* show anyway */ }
    setVisible(true);
  }, [hasResponded]);

  if (!visible) return null;

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch {}
    setVisible(false);
  }

  function toggleFeature(key: string) {
    setFeatures((prev) => {
      if (key === "none") return prev.includes("none") ? [] : ["none"];
      const next = prev.filter((f) => f !== "none");
      return next.includes(key) ? next.filter((f) => f !== key) : [...next, key];
    });
  }

  function submit() {
    setErr(null);
    startTransition(async () => {
      const res = await submitPricingSurvey(features, price ?? "", comment);
      if (!res.ok) { setErr(res.error ?? "Could not save."); return; }
      setDone(true);
      try { localStorage.setItem(DISMISS_KEY, "1"); } catch {}
      setTimeout(() => setVisible(false), 2200);
    });
  }

  const chip = (active: boolean): React.CSSProperties => ({
    padding: "7px 12px",
    borderRadius: "999px",
    fontSize: "11.5px",
    fontWeight: 600,
    cursor: "pointer",
    border: "1px solid",
    borderColor: active ? "var(--brand-blue)" : "var(--border-subtle)",
    background: active ? "rgba(37,99,235,0.15)" : "transparent",
    color: active ? "var(--brand-blue)" : "var(--text-secondary)",
    transition: "all 120ms",
    minHeight: "32px",
  });

  return (
    <div style={{
      background: "var(--bg-card)",
      border: "1px solid var(--border-subtle)",
      borderRadius: "16px",
      padding: "16px 18px",
      marginBottom: "16px",
    }}>
      {done ? (
        <div style={{ fontSize: "13px", color: "var(--green)", padding: "6px 0" }}>
          Thanks — this directly shapes what gets built next.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", marginBottom: "10px" }}>
            <div>
              <div style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--text-primary)" }}>
                10 seconds: help shape BuyTune
              </div>
              <div style={{ fontSize: "11.5px", color: "var(--text-muted)", marginTop: "2px" }}>
                Which of these would you actually pay for — and what feels fair per month?
              </div>
            </div>
            <button
              onClick={dismiss}
              aria-label="Dismiss survey"
              style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "16px", lineHeight: 1, padding: "4px", minWidth: "24px" }}
            >
              ×
            </button>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "10px" }}>
            {FEATURE_OPTIONS.map((f) => (
              <button key={f.key} onClick={() => toggleFeature(f.key)} style={chip(features.includes(f.key))}>
                {f.label}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", marginBottom: "12px" }}>
            <span style={{ fontSize: "11px", color: "var(--text-tertiary)", marginRight: "2px" }}>Fair price:</span>
            {PRICE_OPTIONS.map((p) => (
              <button key={p.key} onClick={() => setPrice(price === p.key ? null : p.key)} style={chip(price === p.key)}>
                <span style={{ fontFamily: "var(--font-mono)" }}>{p.label}</span>
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Anything you'd pay for that isn't listed? (optional)"
              aria-label="Other feature you would pay for"
              maxLength={500}
              style={{
                flex: "1 1 220px",
                background: "var(--surface-005)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "10px",
                padding: "8px 12px",
                fontSize: "12px",
                color: "var(--text-primary)",
                outline: "none",
                minHeight: "36px",
              }}
            />
            <button
              onClick={submit}
              disabled={isPending || (features.length === 0 && !price)}
              style={{
                padding: "8px 16px",
                borderRadius: "10px",
                fontSize: "12px",
                fontWeight: 700,
                border: "none",
                cursor: "pointer",
                background: "var(--brand-gradient)",
                color: "#fff",
                opacity: isPending || (features.length === 0 && !price) ? 0.5 : 1,
                minHeight: "36px",
              }}
            >
              {isPending ? "Saving…" : "Send"}
            </button>
          </div>
          {err && <div style={{ fontSize: "11px", color: "var(--red)", marginTop: "6px" }}>{err}</div>}
        </>
      )}
    </div>
  );
}
