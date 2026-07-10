"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Keeps a linked portfolio fresh while you're looking at it: re-syncs from the broker
// on open and then every couple of minutes, but only when the tab is visible and only
// if it's been at least `minGapSeconds` since the last sync — so it catches a trade you
// just made without hammering the broker (the live dollar value already updates from
// market quotes on every load; this refreshes composition + the broker return).
export default function AutoResync({ lastSyncedAt, minGapSeconds = 120 }: { lastSyncedAt: string | null; minGapSeconds?: number }) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const lastSync = useRef<number>(lastSyncedAt ? new Date(lastSyncedAt).getTime() : 0);
  const busy = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function maybeSync() {
      if (busy.current || cancelled) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      if (Date.now() - lastSync.current < minGapSeconds * 1000) return;
      busy.current = true;
      setSyncing(true);
      try {
        const r = await fetch("/api/connections/snaptrade/refresh", { method: "POST" });
        if (r.ok && !cancelled) { lastSync.current = Date.now(); router.refresh(); }
      } catch { /* best-effort */ }
      finally { busy.current = false; if (!cancelled) setSyncing(false); }
    }
    void maybeSync(); // on open
    const id = setInterval(() => void maybeSync(), 60 * 1000); // check each minute
    const onVis = () => { if (document.visibilityState === "visible") void maybeSync(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { cancelled = true; clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, [minGapSeconds, router]);

  if (!syncing) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "10.5px", color: "var(--text-tertiary)", marginLeft: "8px" }}>
      <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#00d395", animation: "bt-pulse 1.4s ease-in-out infinite" }} />
      Syncing…
    </span>
  );
}
