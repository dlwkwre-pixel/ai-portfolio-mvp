"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

type Thesis = { ticker: string; thesis: string };
type Guardrail = { triggered: boolean; dropPct?: number; severity?: "notable" | "severe"; theses?: Thesis[]; holdingsCount?: number };

const DISMISS_KEY = "bt-guardrail-dismissed"; // value = YYYY-MM-DD it was dismissed

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

// On a big market-down day, surface a calm, evidence-based pause before the user
// reacts — reflecting their own logged thesis back at them. Deliberately quiet
// (no red, no modal): the goal is to lower the temperature, not raise it.
export default function BehavioralGuardrail() {
  const [data, setData] = useState<Guardrail | null>(null);
  const [open, setOpen] = useState(false);

  const check = useCallback(async () => {
    const preview = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("guardrail") === "preview";
    // Already dismissed today? Skip the fetch entirely (unless previewing).
    if (!preview) {
      try { if (localStorage.getItem(DISMISS_KEY) === todayKey()) return; } catch { /* ignore */ }
    }
    try {
      const res = await fetch(`/api/me/market-guardrail${preview ? "?preview=1" : ""}`, { cache: "no-store" });
      if (!res.ok) return;
      const d = (await res.json()) as Guardrail;
      if (d.triggered) { setData(d); setOpen(true); }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { void check(); }, 800);
    return () => clearTimeout(t);
  }, [check]);

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, todayKey()); } catch { /* ignore */ }
    setOpen(false);
  }

  if (!open || !data || !data.triggered) return null;

  const drop = Math.abs(data.dropPct ?? 0).toFixed(1);
  const theses = data.theses ?? [];

  return (
    <div
      style={{
        position: "fixed", zIndex: 1300, right: "16px", bottom: "16px",
        width: "min(380px, calc(100vw - 32px))",
        animation: "bt-guard-in 0.5s cubic-bezier(0.16,1,0.3,1) both",
      }}
      className="bt-guardrail-card"
      role="status"
    >
      <style>{`
        @keyframes bt-guard-in { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
        @media (max-width: 768px) { .bt-guardrail-card { bottom: calc(var(--bt-mobile-nav-h, 64px) + 12px) !important; right: 12px !important; left: 12px !important; width: auto !important; } }
      `}</style>
      <div style={{
        background: "linear-gradient(180deg, #0f1b2e, #0b1422)",
        border: "1px solid rgba(96,165,250,0.28)",
        borderRadius: "16px", padding: "16px 17px",
        boxShadow: "0 18px 48px rgba(0,0,0,0.5)",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: "11px", marginBottom: "11px" }}>
          <div style={{ width: "34px", height: "34px", borderRadius: "10px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(96,165,250,0.14)", border: "1px solid rgba(96,165,250,0.3)" }}>
            {/* steady "anchor/shield" mark — calm, not alarming */}
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#93c5fd" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#7fd9d4" }}>A steadying word</div>
            <h3 style={{ fontSize: "14.5px", fontWeight: 700, color: "#fff", margin: "1px 0 0", lineHeight: 1.25 }}>
              The market&apos;s down {drop}% today
            </h3>
          </div>
          <button type="button" onClick={dismiss} aria-label="Dismiss" style={{ background: "none", border: "none", color: "var(--text-muted, #64748b)", cursor: "pointer", fontSize: "18px", lineHeight: 1, padding: "0 2px", flexShrink: 0 }}>×</button>
        </div>

        {/* Calm reframe */}
        <p style={{ fontSize: "12.5px", color: "var(--text-secondary, #94a3b8)", lineHeight: 1.55, margin: "0 0 12px" }}>
          {data.severity === "severe"
            ? "Sharp drops feel urgent, but they're a normal part of investing — the market has a down day like this several times a year and has recovered from every one so far. Selling in the red turns a paper dip into a real loss."
            : "Red days are routine — the average year sees a drop of ~14% at some point and still tends to finish positive. The investors who do best usually do nothing on days like this."}
        </p>

        {/* Their own thesis, reflected back */}
        {theses.length > 0 && (
          <div style={{ background: "var(--surface-003)", border: "1px solid var(--line-007)", borderRadius: "11px", padding: "11px 12px", marginBottom: "12px" }}>
            <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-tertiary, #64748b)", marginBottom: "7px" }}>Why you bought in — your words</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {theses.map((t) => (
                <div key={t.ticker} style={{ fontSize: "12px", color: "var(--text-secondary, #94a3b8)", lineHeight: 1.5 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "#cbd5e1" }}>{t.ticker}</span>
                  <span style={{ color: "var(--text-muted, #64748b)" }}> — </span>
                  <span style={{ fontStyle: "italic" }}>&ldquo;{t.thesis}&rdquo;</span>
                </div>
              ))}
            </div>
            <p style={{ fontSize: "11px", color: "var(--text-tertiary, #64748b)", margin: "9px 0 0", lineHeight: 1.45 }}>Has anything in that thesis actually changed today? If not, today&apos;s price is noise.</p>
          </div>
        )}

        {/* Actions — friction before panic, not a sell button */}
        <div style={{ display: "flex", gap: "8px" }}>
          <Link href="/planning" onClick={dismiss} style={{ flex: 1, textAlign: "center", padding: "9px 12px", borderRadius: "10px", background: "var(--brand-gradient)", color: "#fff", fontSize: "12.5px", fontWeight: 700, textDecoration: "none" }}>
            Zoom out to my plan
          </Link>
          <button type="button" onClick={dismiss} style={{ padding: "9px 14px", borderRadius: "10px", border: "1px solid var(--line-015)", background: "transparent", color: "var(--text-secondary, #94a3b8)", fontSize: "12.5px", fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)" }}>
            I&apos;m steady
          </button>
        </div>
        <p style={{ fontSize: "10px", color: "var(--text-tertiary, #64748b)", margin: "10px 0 0", lineHeight: 1.45 }}>
          Tempted to sell? Log <em>why</em> in your portfolio&apos;s Journal first — and run the devil&apos;s advocate on it. A 10-minute pause is the cheapest risk management there is.
        </p>
      </div>
    </div>
  );
}
