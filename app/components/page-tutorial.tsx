"use client";

import { useState, useEffect } from "react";
import { TUTORIALS } from "@/lib/tutorials";

// Runs a page walkthrough once on first visit (localStorage) and on demand when the
// URL has ?tutorial=<id> (the Learn-tab "Replay" links). Calm, premium step modal.
export default function PageTutorial({ tutorialId }: { tutorialId: string }) {
  const tutorial = TUTORIALS[tutorialId];
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!tutorial) return;
    const key = `bt-tutorial-${tutorialId}`;
    let replay = false;
    try {
      const params = new URLSearchParams(window.location.search);
      replay = params.get("tutorial") === tutorialId;
    } catch { /* ignore */ }
    let seen = false;
    try { seen = localStorage.getItem(key) === "1"; } catch { /* ignore */ }
    if (replay || !seen) {
      setStep(0);
      setOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutorialId]);

  // Keyboard users can always escape the dialog (WCAG 2.1.2 — no keyboard trap).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      try { localStorage.setItem(`bt-tutorial-${tutorialId}`, "1"); } catch { /* ignore */ }
      setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, tutorialId]);

  if (!tutorial || !open) return null;

  const steps = tutorial.steps;
  const last = step >= steps.length - 1;
  function dismiss() {
    try { localStorage.setItem(`bt-tutorial-${tutorialId}`, "1"); } catch { /* ignore */ }
    // Clean the ?tutorial= param so a refresh doesn't reopen it.
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("tutorial")) {
        url.searchParams.delete("tutorial");
        window.history.replaceState({}, "", url.pathname + url.search);
      }
    } catch { /* ignore */ }
    setOpen(false);
  }

  const s = steps[step];

  return (
    <div role="dialog" aria-modal="true" aria-label="Page tutorial" onClick={dismiss} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(4,13,26,0.78)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", animation: "bt-tut-fade 0.25s ease both" }}>
      <style>{`@keyframes bt-tut-fade { from { opacity: 0; } to { opacity: 1; } } @keyframes bt-tut-pop { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: none; } }`}</style>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--card-bg, #0b1524)", border: "1px solid var(--card-border, rgba(255,255,255,0.1))", borderRadius: "var(--radius-lg, 16px)", padding: "26px 26px 20px", width: "100%", maxWidth: "440px", boxShadow: "0 28px 60px rgba(0,0,0,0.6)", animation: "bt-tut-pop 0.3s cubic-bezier(0.16,1,0.3,1) both" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
          <div style={{ width: "34px", height: "34px", borderRadius: "9px", background: "linear-gradient(135deg, rgba(37,99,235,0.18), rgba(124,58,237,0.14))", border: "1px solid rgba(99,102,241,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "17px" }}>{tutorial.emoji}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>{tutorial.label} · Walkthrough</div>
            <div style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{step + 1} of {steps.length}</div>
          </div>
          <button type="button" onClick={dismiss} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "12px", fontFamily: "var(--font-body)" }}>Skip</button>
        </div>

        <h2 key={`t-${step}`} style={{ fontFamily: "var(--font-display)", fontSize: "18px", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 8px", animation: "bt-tut-pop 0.3s ease both" }}>{s.title}</h2>
        <p key={`b-${step}`} style={{ fontSize: "13px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", lineHeight: 1.65, margin: "0 0 20px", animation: "bt-tut-pop 0.3s ease both" }}>{s.body}</p>

        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "18px" }}>
          {steps.map((_, i) => (
            <div key={i} style={{ height: "5px", flex: i === step ? "0 0 22px" : "0 0 5px", borderRadius: "3px", background: i === step ? "var(--brand-blue, #2563eb)" : i < step ? "rgba(37,99,235,0.4)" : "var(--border, rgba(255,255,255,0.12))", transition: "all 0.25s ease" }} />
          ))}
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          {step > 0 && (
            <button type="button" onClick={() => setStep((p) => p - 1)} style={{ padding: "10px 16px", borderRadius: "var(--radius-md, 10px)", border: "1px solid var(--border-subtle, rgba(255,255,255,0.1))", background: "transparent", color: "var(--text-secondary)", fontSize: "13px", fontFamily: "var(--font-body)", cursor: "pointer" }}>Back</button>
          )}
          <button type="button" onClick={() => (last ? dismiss() : setStep((p) => p + 1))} style={{ flex: 1, padding: "10px 16px", borderRadius: "var(--radius-md, 10px)", border: "none", background: "var(--brand-gradient)", color: "#fff", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
            {last ? "Got it" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
