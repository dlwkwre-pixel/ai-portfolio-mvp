"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ConnectionStatus } from "@/lib/connections/snaptrade";

export default function SnaptradeConnect({ status }: { status: ConnectionStatus }) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "link" | "sync">(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [connected, setConnected] = useState(status.connected);
  const [lastSynced, setLastSynced] = useState(status.lastSyncedAt);
  const [portfolioId, setPortfolioId] = useState(status.portfolioId);

  async function connect() {
    setBusy("link"); setErr(null); setMsg(null);
    try {
      const res = await fetch("/api/connections/snaptrade/link", { method: "POST" });
      const d = await res.json();
      if (!res.ok || !d.redirectURI) { setErr(d.error ?? "Could not open the connection portal."); return; }
      // Open SnapTrade's hosted portal; the user logs into their brokerage there.
      window.open(d.redirectURI, "snaptrade", "width=460,height=760");
      setMsg("When the popup says “Connection Complete”, close it and press Sync now.");
    } catch { setErr("Network error. Try again."); }
    finally { setBusy(null); }
  }

  async function sync() {
    setBusy("sync"); setErr(null); setMsg(null);
    try {
      const res = await fetch("/api/connections/snaptrade/sync", { method: "POST" });
      const d = await res.json();
      if (!res.ok) { setErr(d.error ?? "Sync failed."); return; }
      setConnected(true);
      setLastSynced(new Date().toISOString());
      if (d.portfolioId) setPortfolioId(d.portfolioId);
      setMsg(d.imported > 0 ? `Imported ${d.imported} position${d.imported === 1 ? "" : "s"}.` : (d.note ?? "Nothing to import yet."));
      router.refresh();
    } catch { setErr("Network error. Try again."); }
    finally { setBusy(null); }
  }

  const btn: React.CSSProperties = {
    flex: "1 1 auto", padding: "10px", borderRadius: "10px", fontSize: "13px", fontWeight: 600,
    fontFamily: "var(--font-body)", cursor: "pointer",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ display: "flex", gap: "8px" }}>
        <button type="button" onClick={connect} disabled={busy !== null}
          style={{ ...btn, border: "1px solid rgba(0,211,149,0.4)", background: "rgba(0,211,149,0.12)", color: "#00d395", opacity: busy ? 0.6 : 1 }}>
          {busy === "link" ? "Opening…" : connected ? "Reconnect" : "Connect brokerage"}
        </button>
        <button type="button" onClick={sync} disabled={busy !== null}
          style={{ ...btn, border: "1px solid var(--card-border)", background: "var(--bg-elevated)", color: "var(--text-primary)", opacity: busy ? 0.6 : 1 }}>
          {busy === "sync" ? "Syncing…" : "Sync now"}
        </button>
      </div>
      {(msg || err) && <div style={{ fontSize: "11.5px", color: err ? "#f59e0b" : "var(--text-secondary)" }}>{err ?? msg}</div>}
      {!connected && !msg && !err && (
        <div style={{ fontSize: "10.5px", color: "var(--text-tertiary)", lineHeight: 1.5 }}>
          Connect opens your brokerage login in a popup. When it says “Connection Complete”, close it and press Sync now.
        </div>
      )}
      <div style={{ fontSize: "10.5px", color: "var(--text-tertiary)", display: "flex", gap: "10px", flexWrap: "wrap" }}>
        {lastSynced ? <span>Last synced {new Date(lastSynced).toLocaleString()}</span> : <span>Not synced yet</span>}
        {portfolioId && <a href={`/portfolios/${portfolioId}`} style={{ color: "var(--accent, #818cf8)", textDecoration: "none" }}>View synced portfolio →</a>}
      </div>
    </div>
  );
}
