"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// On opening a linked portfolio, silently re-sync from the broker if the data is
// stale (older than the threshold), then refresh the page. Throttled by last-synced
// time so navigating around doesn't re-sync on every load.
export default function AutoResync({ lastSyncedAt, thresholdMinutes = 60 }: { lastSyncedAt: string | null; thresholdMinutes?: number }) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const stale = !lastSyncedAt || (Date.now() - new Date(lastSyncedAt).getTime()) > thresholdMinutes * 60 * 1000;
    if (!stale) return;
    setSyncing(true);
    fetch("/api/connections/snaptrade/refresh", { method: "POST" })
      .then((r) => (r.ok ? r.json() : null))
      .then(() => { router.refresh(); })
      .catch(() => { /* best-effort */ })
      .finally(() => setSyncing(false));
  }, [lastSyncedAt, thresholdMinutes, router]);

  if (!syncing) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "10.5px", color: "var(--text-tertiary)", marginLeft: "8px" }}>
      <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#00d395", animation: "bt-pulse 1.4s ease-in-out infinite" }} />
      Syncing from your brokerage…
    </span>
  );
}
