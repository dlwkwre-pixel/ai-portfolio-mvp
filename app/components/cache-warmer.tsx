"use client";

import { useEffect, useRef } from "react";

// Predictive cache warming — the moment the cursor (or finger) touches any link
// into a valuation-heavy page, fire /api/warm so the expensive portfolio math
// is running before the click lands. Document-level delegation means every
// existing <Link> in the app gets this for free; the server rate-limits and
// the 60s valuation cache dedupes, so eager hovering costs nothing extra.
const WARM_PATHS = ["/dashboard", "/portfolios", "/planning", "/tax"];
const REWARM_MS = 45_000; // just under the 60s valuation TTL

export default function CacheWarmer() {
  const lastWarm = useRef(0);

  useEffect(() => {
    function maybeWarm(target: EventTarget | null) {
      const anchor = (target as Element | null)?.closest?.("a[href]");
      const href = anchor?.getAttribute("href");
      if (!href || !WARM_PATHS.some((p) => href === p || href.startsWith(p + "/"))) return;
      const now = Date.now();
      if (now - lastWarm.current < REWARM_MS) return;
      lastWarm.current = now;
      fetch("/api/warm", { method: "POST", keepalive: true }).catch(() => {});
    }

    const onPointerOver = (e: PointerEvent) => maybeWarm(e.target);
    const onTouchStart = (e: TouchEvent) => maybeWarm(e.target);
    const onFocusIn = (e: FocusEvent) => maybeWarm(e.target);

    document.addEventListener("pointerover", onPointerOver, { passive: true });
    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("focusin", onFocusIn, { passive: true });
    return () => {
      document.removeEventListener("pointerover", onPointerOver);
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, []);

  return null;
}
