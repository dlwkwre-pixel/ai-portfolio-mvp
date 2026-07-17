"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Keeps a linked portfolio reasonably fresh while you're looking at it, and gives it a
// visible "Sync now" button — the same forced full sync (holdings + cash + activities +
// chart/return rebuild) as the Connections page's "Sync all now".
//
// Background behavior: the live dollar value already updates from market quotes on every
// render, so the automatic sync only refreshes composition + the broker return — at most
// once every `minGapSeconds` (default 15 min), only when the tab is visible, and only
// re-rendering when it ran. The manual button always forces immediately.
export default function AutoResync({ lastSyncedAt, minGapSeconds = 900 }: { lastSyncedAt: string | null; minGapSeconds?: number }) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const lastSync = useRef<number>(lastSyncedAt ? new Date(lastSyncedAt).getTime() : 0);
  const busy = useRef(false);

  async function runSync(full: boolean): Promise<void> {
    if (busy.current) return;
    busy.current = true;
    setSyncing(true);
    try {
      const r = await fetch("/api/connections/snaptrade/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full }),
      });
      if (r.ok) { lastSync.current = Date.now(); router.refresh(); }
    } catch { /* best-effort */ }
    finally { busy.current = false; setSyncing(false); }
  }

  useEffect(() => {
    let cancelled = false;
    async function maybeSync() {
      if (cancelled || busy.current) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      if (Date.now() - lastSync.current < minGapSeconds * 1000) return;
      await runSync(false);
    }
    void maybeSync(); // on open
    const id = setInterval(() => void maybeSync(), 5 * 60 * 1000); // check every 5 min
    const onVis = () => { if (document.visibilityState === "visible") void maybeSync(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { cancelled = true; clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minGapSeconds]);

  return (
    <button
      type="button"
      onClick={() => void runSync(true)}
      disabled={syncing}
      title="Pull the latest holdings, cash, and activity from your brokerage and rebuild the chart"
      style={{
        display: "inline-flex", alignItems: "center", gap: "6px",
        fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)",
        background: "var(--surface-005, rgba(255,255,255,0.05))",
        border: "1px solid var(--line-010, rgba(255,255,255,0.1))",
        borderRadius: "999px", padding: "5px 11px",
        cursor: syncing ? "default" : "pointer", opacity: syncing ? 0.7 : 1,
        minHeight: "28px",
      }}
    >
      {syncing ? (
        <>
          <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--green)", animation: "bt-pulse 1.4s ease-in-out infinite" }} />
          Syncing…
        </>
      ) : (
        <>↻ Sync now</>
      )}
    </button>
  );
}
