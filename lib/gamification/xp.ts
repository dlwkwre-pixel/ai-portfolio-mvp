import { createAdminClient } from "@/lib/supabase/admin";

// XP & Levels engine. All awards are off actions the app already records (no AI/token cost),
// and are idempotent via a per-user dedup_key in xp_events.

export type XpKind =
  | "holding_added"
  | "first_holding"
  | "holdings_imported"
  | "profile_complete"
  | "analysis_run"
  | "strategy_assigned"
  | "journal_logged"
  | "dividend_logged"
  | "community_post"
  | "budget_logged"
  | "watchlist_added"
  | "goal_progress"
  | "planner_used"
  | "challenge";

export const XP_VALUES: Record<XpKind, number> = {
  holding_added: 10,
  first_holding: 25,
  holdings_imported: 20,
  profile_complete: 50,
  analysis_run: 20,
  strategy_assigned: 30,
  journal_logged: 15,
  dividend_logged: 10,
  community_post: 15,
  budget_logged: 15,
  watchlist_added: 10,
  goal_progress: 12,
  planner_used: 10,
  challenge: 0, // variable — pass an explicit amount to awardXp
};

export const XP_LABELS: Record<XpKind, string> = {
  holding_added: "Added a holding",
  first_holding: "First holding",
  holdings_imported: "Imported holdings",
  profile_complete: "Completed your profile",
  analysis_run: "Ran an AI analysis",
  strategy_assigned: "Assigned a strategy",
  journal_logged: "Logged a decision",
  dividend_logged: "Logged a dividend",
  community_post: "Shared with the community",
  budget_logged: "Tracked your budget",
  watchlist_added: "Added to watchlist",
  goal_progress: "Made progress on a goal",
  planner_used: "Used a planner",
  challenge: "Completed a weekly challenge",
};

// Daily-dedup key so a repeatable action credits XP at most once per day
// (matches the analysis_run pattern). Weekly challenges still detect it fine.
export function dailyKey(kind: XpKind): string {
  return `${kind}:${new Date().toISOString().slice(0, 10)}`;
}

// Level curve: level L starts at 100·(L-1)² XP. Level 2 at 100, 3 at 400, 4 at 900 …
// Fast early levels, gradually steeper.
export function xpForLevel(level: number): number {
  return 100 * Math.max(0, level - 1) ** 2;
}
export function levelForXp(xp: number): number {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1;
}

export type LevelProgress = {
  xp: number;
  level: number;
  levelFloor: number;   // XP at the start of this level
  nextLevelXp: number;  // XP needed for the next level
  intoLevel: number;    // XP earned within the current level
  levelSpan: number;    // XP between this level and the next
  pct: number;          // 0–100 progress to next level
};

export function levelProgress(xp: number): LevelProgress {
  const level = levelForXp(xp);
  const levelFloor = xpForLevel(level);
  const nextLevelXp = xpForLevel(level + 1);
  const levelSpan = Math.max(1, nextLevelXp - levelFloor);
  const intoLevel = Math.max(0, xp - levelFloor);
  return {
    xp, level, levelFloor, nextLevelXp, intoLevel, levelSpan,
    pct: Math.min(100, Math.round((intoLevel / levelSpan) * 100)),
  };
}

export type AwardResult = {
  awarded: boolean;     // false if it was a duplicate (already credited)
  xp: number;
  level: number;
  leveledUp: boolean;
};

// Credit XP for an action. `dedupKey` makes it idempotent (defaults to the kind = once ever).
// `amountOverride` lets variable-value awards (e.g. challenges) set their own XP.
// Best-effort: never throws into the calling action (XP is a side effect, not the main work).
export async function awardXp(userId: string, kind: XpKind, dedupKey?: string, amountOverride?: number): Promise<AwardResult | null> {
  if (!userId) return null;
  const amount = amountOverride ?? XP_VALUES[kind] ?? 0;
  const key = dedupKey ?? kind;

  try {
    const admin = createAdminClient();

    // Ledger insert — unique (user_id, dedup_key) means a duplicate award is a no-op.
    const { error: evErr } = await admin
      .from("xp_events")
      .insert({ user_id: userId, kind, xp: amount, dedup_key: key });
    if (evErr) {
      // 23505 = unique violation → already awarded; anything else → bail quietly.
      return { awarded: false, xp: 0, level: 0, leveledUp: false };
    }

    // Read current total, add, recompute level.
    const { data: cur } = await admin.from("user_xp").select("xp, level").eq("user_id", userId).maybeSingle();
    const prevXp = cur?.xp ?? 0;
    const prevLevel = cur?.level ?? 1;
    const newXp = prevXp + amount;
    const newLevel = levelForXp(newXp);

    await admin.from("user_xp").upsert(
      { user_id: userId, xp: newXp, level: newLevel, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );

    return { awarded: true, xp: newXp, level: newLevel, leveledUp: newLevel > prevLevel };
  } catch {
    return null; // XP is non-critical; swallow failures (e.g., service key not set yet)
  }
}

// Convenience: read a user's XP + level progress (returns level-1 baseline if no row yet).
export async function getUserXp(userId: string): Promise<LevelProgress> {
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("user_xp").select("xp").eq("user_id", userId).maybeSingle();
    return levelProgress(data?.xp ?? 0);
  } catch {
    return levelProgress(0);
  }
}

export type XpEvent = { kind: XpKind; xp: number; label: string; created_at: string };

// Recent XP ledger entries for the Achievements activity feed (most recent first).
export async function getRecentXpEvents(userId: string, limit = 12): Promise<XpEvent[]> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("xp_events")
      .select("kind, xp, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    return (data ?? []).map((e) => ({
      kind: e.kind as XpKind,
      xp: e.xp as number,
      label: XP_LABELS[e.kind as XpKind] ?? (e.kind as string),
      created_at: e.created_at as string,
    }));
  } catch {
    return [];
  }
}
