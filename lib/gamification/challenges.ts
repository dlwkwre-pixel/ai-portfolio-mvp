import { createAdminClient } from "@/lib/supabase/admin";
import { awardXp } from "@/lib/gamification/xp";

// Weekly challenges — rotating quests that grant XP, computed entirely from data the app
// already records (no new tables). Completion is idempotent per ISO week via the xp_events
// dedup key `challenge:<id>:<weekKey>`, so XP is credited at most once per week per challenge.

export type ChallengeId = "ai_analysis" | "community_post" | "fresh_strategy";

export type ChallengeDef = {
  id: ChallengeId;
  label: string;
  description: string;
  xp: number;
  icon: "cpu" | "users" | "sparkle";
};

export const WEEKLY_CHALLENGES: ChallengeDef[] = [
  { id: "ai_analysis",    label: "Run an AI analysis",   description: "Scan any portfolio with Atlas this week.", xp: 30, icon: "cpu" },
  { id: "community_post", label: "Share with the community", description: "Post a take, question, or win in the feed.", xp: 20, icon: "users" },
  { id: "fresh_strategy", label: "Build a strategy",      description: "Create a new investment strategy.",        xp: 25, icon: "sparkle" },
];

export type ChallengeState = ChallengeDef & { done: boolean };

// ISO-week key like "2026-W26" (weeks start Monday). Used for the dedup key + display.
export function isoWeekKey(d = new Date()): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7; // Sun=7
  t.setUTCDate(t.getUTCDate() + 4 - day); // nearest Thursday
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((t.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

// Monday 00:00 UTC of the current week, as an ISO timestamp.
function weekStartIso(now = new Date()): string {
  const t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() - (day - 1));
  return t.toISOString();
}

async function countSince(
  admin: ReturnType<typeof createAdminClient>,
  table: string,
  userId: string,
  sinceIso: string,
  eqCol?: string,
  eqVal?: string | boolean,
): Promise<number> {
  try {
    let q = admin.from(table).select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", sinceIso);
    if (eqCol !== undefined) q = q.eq(eqCol, eqVal as string);
    const { count } = await q;
    return count ?? 0;
  } catch {
    return 0;
  }
}

// Compute this week's challenge states for a user and award XP for any freshly completed ones.
export async function getWeeklyChallenges(userId: string): Promise<{ weekKey: string; challenges: ChallengeState[] }> {
  const weekKey = isoWeekKey();
  if (!userId) return { weekKey, challenges: WEEKLY_CHALLENGES.map((c) => ({ ...c, done: false })) };

  const since = weekStartIso();
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return { weekKey, challenges: WEEKLY_CHALLENGES.map((c) => ({ ...c, done: false })) };
  }

  const [aiRuns, posts, strategiesNew] = await Promise.all([
    countSince(admin, "recommendation_runs", userId, since, "status", "completed"),
    countSince(admin, "community_posts", userId, since),
    countSince(admin, "strategies", userId, since, "is_active", true),
  ]);

  const doneMap: Record<ChallengeId, boolean> = {
    ai_analysis: aiRuns > 0,
    community_post: posts > 0,
    fresh_strategy: strategiesNew > 0,
  };

  const challenges = WEEKLY_CHALLENGES.map((c) => ({ ...c, done: doneMap[c.id] }));

  // Credit XP once per week for each completed challenge (idempotent via dedup key).
  await Promise.all(
    challenges
      .filter((c) => c.done)
      .map((c) => awardXp(userId, "challenge", `challenge:${c.id}:${weekKey}`, c.xp)),
  );

  return { weekKey, challenges };
}
