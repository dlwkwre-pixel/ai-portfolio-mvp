"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

const SEEN_KEY = "bt-seen-level";
const CONFETTI = ["#2563eb", "#7c3aed", "#34d399", "#fbbf24", "#f472b6"];

// Watches the user's level and celebrates when it goes up. Decoupled from the actions that
// award XP — it just compares the current level to the last one this device saw. Mounted
// globally; the fetch is a no-op for signed-out visitors.
export default function LevelUpWatcher() {
  const [celebrating, setCelebrating] = useState<number | null>(null);

  const check = useCallback(async () => {
    try {
      const res = await fetch("/api/me/gamification", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { signedIn?: boolean; level?: number };
      if (!data.signedIn || !data.level || data.level < 1) return;
      let seen = 0;
      try { seen = parseInt(localStorage.getItem(SEEN_KEY) || "0", 10) || 0; } catch { /* ignore */ }
      if (seen > 0 && data.level > seen) {
        setCelebrating(data.level);
      }
      try { localStorage.setItem(SEEN_KEY, String(data.level)); } catch { /* ignore */ }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    // Defer out of the effect body (check() sets state via an async fetch callback).
    const t = setTimeout(() => { void check(); }, 0);
    const onFocus = () => { void check(); };
    window.addEventListener("focus", onFocus);
    return () => { clearTimeout(t); window.removeEventListener("focus", onFocus); };
  }, [check]);

  // Auto-dismiss after a few seconds.
  useEffect(() => {
    if (celebrating === null) return;
    const t = setTimeout(() => setCelebrating(null), 6000);
    return () => clearTimeout(t);
  }, [celebrating]);

  if (celebrating === null) return null;

  return (
    <div
      onClick={() => setCelebrating(null)}
      style={{
        position: "fixed", inset: 0, zIndex: 1400, display: "flex",
        alignItems: "center", justifyContent: "center", padding: "20px",
        background: "rgba(4,13,26,0.55)", backdropFilter: "blur(3px)",
        animation: "bt-lvl-fade 0.3s ease both",
      }}
    >
      <style>{`
        @keyframes bt-lvl-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes bt-lvl-pop { 0% { opacity: 0; transform: translateY(14px) scale(0.9); } 60% { transform: translateY(0) scale(1.04); } 100% { opacity: 1; transform: scale(1); } }
        @keyframes bt-confetti { 0% { transform: translateY(0) rotate(0); opacity: 1; } 100% { transform: translateY(420px) rotate(540deg); opacity: 0; } }
      `}</style>

      {/* Confetti burst */}
      <div style={{ position: "absolute", top: "30%", left: 0, right: 0, height: 0, pointerEvents: "none" }}>
        {Array.from({ length: 16 }).map((_, i) => (
          <div key={i} style={{
            position: "absolute", left: `${6 + (i * 5.6)}%`,
            width: "8px", height: "8px", borderRadius: i % 2 ? "2px" : "50%",
            background: CONFETTI[i % CONFETTI.length],
            animation: `bt-confetti ${1.6 + (i % 5) * 0.25}s cubic-bezier(0.2,0.6,0.3,1) ${(i % 4) * 0.08}s forwards`,
          }} />
        ))}
      </div>

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative", width: "100%", maxWidth: "340px", textAlign: "center",
          background: "var(--bg-elevated)", border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: "20px", padding: "28px 24px 22px", boxShadow: "0 28px 60px rgba(0,0,0,0.6)",
          animation: "bt-lvl-pop 0.45s cubic-bezier(0.16,1,0.3,1) both",
        }}
      >
        <div style={{
          width: "72px", height: "72px", margin: "0 auto 16px", borderRadius: "20px",
          background: "linear-gradient(135deg,#2563eb,#7c3aed)", display: "flex",
          alignItems: "center", justifyContent: "center", boxShadow: "0 10px 28px rgba(37,99,235,0.45)",
        }}>
          <span style={{ fontSize: "30px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-mono)" }}>{celebrating}</span>
        </div>
        <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--accent, #818cf8)", marginBottom: "4px" }}>
          Level up
        </div>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: "21px", fontWeight: 800, color: "#fff", margin: "0 0 6px" }}>
          You reached Level {celebrating}
        </h2>
        <p style={{ fontSize: "13px", color: "var(--text-secondary, #94a3b8)", lineHeight: 1.5, margin: "0 0 18px" }}>
          Nice work staying active. Keep adding holdings, running analyses, and finishing weekly challenges to climb higher.
        </p>
        <div style={{ display: "flex", gap: "8px" }}>
          <Link href="/achievements" onClick={() => setCelebrating(null)} style={{ flex: 1, padding: "10px 16px", borderRadius: "12px", background: "linear-gradient(135deg,#2563eb,#4f46e5)", color: "#fff", fontSize: "13px", fontWeight: 700, textDecoration: "none" }}>
            View achievements
          </Link>
          <button type="button" onClick={() => setCelebrating(null)} style={{ padding: "10px 16px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.14)", background: "transparent", color: "var(--text-secondary, #94a3b8)", fontSize: "13px", fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)" }}>
            Nice
          </button>
        </div>
      </div>
    </div>
  );
}
