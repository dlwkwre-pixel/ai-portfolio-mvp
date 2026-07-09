"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ReconcileChip — the 1-tap "reconcile ritual". Because holdings are entered by
// hand (no bank sync), data drifts and trust erodes. This lets the user confirm
// "yes, still accurate" in one tap: it stamps holdings_verified_at, credits a
// little XP, and shows how fresh the book is. Goes stale after 14 days and nudges.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useTransition } from "react";
import { reconcilePortfolio } from "./actions";

const AMBER = "#f59e0b";
const GREEN = "#00d395";
const STALE_DAYS = 14;

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}
function relLabel(iso: string | null): string {
  const d = daysSince(iso);
  if (d == null) return "never";
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 7) return `${d} days ago`;
  if (d < 30) return `${Math.round(d / 7)} wk ago`;
  return `${Math.round(d / 30)} mo ago`;
}

export default function ReconcileChip({
  portfolioId, verifiedAt: initial,
}: { portfolioId: string; verifiedAt: string | null }) {
  const [verifiedAt, setVerifiedAt] = useState<string | null>(initial);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const d = daysSince(verifiedAt);
  const stale = d == null || d > STALE_DAYS;
  const accent = stale ? AMBER : GREEN;

  function confirm() {
    setError(null);
    startTransition(async () => {
      const res = await reconcilePortfolio(portfolioId);
      if (!res.ok) { setError(res.error ?? "Could not save."); return; }
      setVerifiedAt(res.verifiedAt);
      setFlash(res.awardedXp > 0 ? `Confirmed · +${res.awardedXp} XP` : "Confirmed");
      setTimeout(() => setFlash(null), 2600);
    });
  }

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap",
      padding: "9px 12px", borderRadius: "12px",
      border: `1px solid ${stale ? "rgba(245,158,11,0.28)" : "var(--card-border)"}`,
      background: stale ? "rgba(245,158,11,0.06)" : "var(--surface-004, rgba(255,255,255,0.02))",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
        <span aria-hidden style={{
          width: "18px", height: "18px", flexShrink: 0, borderRadius: "50%",
          display: "flex", alignItems: "center", justifyContent: "center",
          background: stale ? "rgba(245,158,11,0.15)" : "rgba(0,211,149,0.14)",
          color: accent, fontSize: "11px", fontWeight: 700,
        }}>{stale ? "!" : "✓"}</span>
        <span style={{ fontSize: "12px", color: "var(--text-secondary)", minWidth: 0 }}>
          {flash ? (
            <span style={{ color: GREEN, fontWeight: 600 }}>{flash}</span>
          ) : verifiedAt ? (
            <>Holdings confirmed <strong style={{ color: "var(--text-primary)" }}>{relLabel(verifiedAt)}</strong>
              {stale && <span style={{ color: AMBER }}> · still accurate?</span>}</>
          ) : (
            <>Confirm your holdings are current so your numbers stay trustworthy</>
          )}
          {error && <span style={{ display: "block", color: AMBER, fontSize: "11px", marginTop: "2px" }}>{error}</span>}
        </span>
      </div>
      <button type="button" onClick={confirm} disabled={pending}
        style={{
          flexShrink: 0, minHeight: "38px", padding: "8px 15px", borderRadius: "9px", cursor: pending ? "default" : "pointer",
          fontFamily: "var(--font-body)", fontSize: "12px", fontWeight: 600,
          border: `1px solid ${stale ? "rgba(245,158,11,0.4)" : "var(--card-border)"}`,
          background: stale ? "rgba(245,158,11,0.12)" : "var(--surface-004, rgba(255,255,255,0.03))",
          color: stale ? AMBER : "var(--text-secondary)",
          opacity: pending ? 0.6 : 1, whiteSpace: "nowrap", transition: "background 0.15s, opacity 0.15s",
        }}>
        {pending ? "Saving…" : verifiedAt && !stale ? "Re-confirm" : "Looks right"}
      </button>
    </div>
  );
}
