"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

// Client-side view of the admin page denylist: which sections should vanish
// from this user's navigation. RLS only lets a user read their OWN blocks.
// Fails open (empty set) on any error — nav hiding is cosmetic; the section
// layouts are the real enforcement with the under-construction wall.
// Module-level cache so sidebar + mobile nav share one fetch per load.
let cached: Set<string> | null = null;

export function useBlockedPages(): Set<string> {
  const [blocked, setBlocked] = useState<Set<string>>(() => cached ?? new Set());

  useEffect(() => {
    if (cached) return;
    let alive = true;
    (async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data, error } = await supabase.from("page_blocks").select("page");
        if (error || !alive) return;
        cached = new Set((data ?? []).map((r) => r.page as string));
        setBlocked(cached);
      } catch { /* fail open */ }
    })();
    return () => { alive = false; };
  }, []);

  return blocked;
}

/** Maps an app href to its blockable section id, or null if never blockable. */
export function sectionForHref(href: string): string | null {
  const seg = href.split("/")[1] ?? "";
  return ["portfolios", "strategies", "planning", "tax", "connections", "research", "community", "learn", "achievements", "wrapped"]
    .includes(seg) ? seg : null;
}
