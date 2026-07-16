"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Maps the current route to a product module and pings /api/activity once per
// module per session (sessionStorage-deduped). Renders nothing; failures are
// silent — retention metrics must never affect the app.
function moduleForPath(path: string): string | null {
  if (path === "/" || path.startsWith("/login") || path.startsWith("/signup")) return null;
  if (path.startsWith("/dashboard")) return "dashboard";
  if (path.startsWith("/portfolios")) return "portfolios";
  if (path.startsWith("/planning")) return "planning";
  if (path.startsWith("/research")) return "research";
  if (path.startsWith("/strategies")) return "strategies";
  if (path.startsWith("/community") || path.startsWith("/u/")) return "community";
  if (path.startsWith("/tax")) return "tax";
  if (path.startsWith("/connections")) return "connections";
  if (path.startsWith("/profile") || path.startsWith("/settings")) return "profile";
  if (path.startsWith("/watchlist")) return "watchlist";
  return null;
}

export default function ActivityTracker() {
  const pathname = usePathname();

  useEffect(() => {
    const mod = moduleForPath(pathname ?? "");
    if (!mod) return;
    const day = new Date().toISOString().slice(0, 10);
    const key = `bt-act-${mod}-${day}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch { /* private mode etc. — fall through and ping anyway */ }
    fetch("/api/activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ module: mod }),
      keepalive: true,
    }).catch(() => {});
  }, [pathname]);

  return null;
}
