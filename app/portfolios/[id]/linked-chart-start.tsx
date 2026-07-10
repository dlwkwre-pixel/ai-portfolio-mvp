"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Lets a linked portfolio's owner pick when their chart/return history starts, so an
// old period (early losses + a dormant gap) doesn't distort the number. Rebuilds from
// the broker on save.
export default function LinkedChartStart({ portfolioId, startDate }: { portfolioId: string; startDate: string | null }) {
  const router = useRouter();
  const [date, setDate] = useState(startDate ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function save(nextDate: string | null) {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const res = await fetch("/api/connections/snaptrade/set-start-date", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portfolioId, startDate: nextDate }),
      });
      const d = await res.json();
      if (!res.ok) { setErr(d.error ?? "Could not update."); return; }
      setDate(nextDate ?? "");
      setMsg(nextDate ? "Chart start updated." : "Reset to full history.");
      router.refresh();
    } catch { setErr("Network error."); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginTop: "8px" }}>
      <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>Chart starts</span>
      <input type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)}
        style={{ padding: "5px 8px", borderRadius: "7px", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)", fontSize: "12px", fontFamily: "var(--font-mono)" }} />
      <button type="button" onClick={() => save(date || null)} disabled={busy}
        style={{ padding: "5px 11px", borderRadius: "7px", border: "1px solid rgba(0,211,149,0.35)", background: "rgba(0,211,149,0.12)", color: "#00d395", fontSize: "11.5px", fontWeight: 600, cursor: busy ? "default" : "pointer", fontFamily: "var(--font-body)", opacity: busy ? 0.6 : 1 }}>
        {busy ? "…" : "Apply"}
      </button>
      {startDate && (
        <button type="button" onClick={() => save(null)} disabled={busy}
          style={{ padding: "5px 9px", borderRadius: "7px", border: "1px solid var(--card-border)", background: "none", color: "var(--text-tertiary)", fontSize: "11.5px", cursor: busy ? "default" : "pointer", fontFamily: "var(--font-body)" }}>
          Reset
        </button>
      )}
      {(msg || err) && <span style={{ fontSize: "11px", color: err ? "#f59e0b" : "var(--text-secondary)" }}>{err ?? msg}</span>}
    </div>
  );
}
