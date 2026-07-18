import { createClient } from "@/lib/supabase/server";

// Admin-controlled page denylist (inverse of feature-access): every account has
// full access unless a page_blocks row revokes a section. Enforced by the thin
// section layouts, which render an "under construction" wall instead of the
// page — so even a stray link into a blocked section shows the wall rather
// than content. Blocks are invisible to unaffected users.

export const BLOCKABLE_PAGES = [
  { id: "portfolios", label: "Portfolios" },
  { id: "strategies", label: "Strategies" },
  { id: "planning", label: "Planning" },
  { id: "tax", label: "Tax Center" },
  { id: "connections", label: "Connections" },
  { id: "research", label: "Research" },
  { id: "community", label: "Community" },
  { id: "learn", label: "Learn" },
  { id: "achievements", label: "Achievements" },
  { id: "wrapped", label: "Wrapped" },
] as const;

export type BlockablePage = (typeof BLOCKABLE_PAGES)[number]["id"];

/**
 * True when the signed-in user is blocked from `page`.
 * Fails open on any error (missing table, no session) — a broken check must
 * never lock paying users out of the app.
 */
export async function isPageBlocked(page: BlockablePage): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false; // signed-out flows have their own auth redirects
    const { data, error } = await supabase
      .from("page_blocks")
      .select("id")
      .eq("user_id", user.id)
      .eq("page", page)
      .maybeSingle();
    if (error) return false;
    return !!data;
  } catch {
    return false;
  }
}
