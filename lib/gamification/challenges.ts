import { createAdminClient } from "@/lib/supabase/admin";
import { awardXp, type XpKind } from "@/lib/gamification/xp";

// Weekly challenges — rotating quests that grant XP, computed entirely from data the app
// already records (no new tables). A pool of quests rotates 3-at-a-time each ISO week.
// Completion is idempotent per week via the xp_events dedup key `challenge:<id>:<weekKey>`,
// so XP is credited at most once per week per quest. On first completion we also drop a
// celebratory notification in the user's bell.

export type ChallengeIcon = "cpu" | "users" | "sparkle" | "plus-circle" | "chart-line";

// A quest's completion is detected either from a domain table (created_at this week) or from
// the xp_events activity ledger (a given XP kind logged this week).
type ChallengeSource =
  | { kind: "table"; table: string; eqCol?: string; eqVal?: string | boolean }
  | { kind: "xp"; xpKind: XpKind };

export type ChallengeDef = {
  id: string;
  label: string;
  description: string;
  xp: number;
  icon: ChallengeIcon;
  source: ChallengeSource;
};

// The full pool. WEEKLY_COUNT of these rotate into view each week. Detection is
// via xp_events (the action's XP kind) — reliable, since xp_events always carries
// user_id (recommendation_runs/community_posts detection by user_id was flaky).
const POOL: ChallengeDef[] = [
  { id: "ai_analysis",    label: "Run an AI analysis",       description: "Scan any portfolio with Atlas this week.",       xp: 30, icon: "cpu",         source: { kind: "xp", xpKind: "analysis_run" } },
  { id: "add_holding",    label: "Add a position",           description: "Add a holding to one of your portfolios.",       xp: 20, icon: "plus-circle", source: { kind: "xp", xpKind: "holding_added" } },
  { id: "community_post", label: "Share with the community", description: "Post a take, question, or win in the feed.",     xp: 20, icon: "users",       source: { kind: "xp", xpKind: "community_post" } },
  { id: "journal_decision", label: "Journal a decision",     description: "Log the reasoning behind a buy, trim, or hold.", xp: 20, icon: "chart-line",  source: { kind: "xp", xpKind: "journal_logged" } },
  { id: "budget_check",   label: "Check your budget",        description: "Log this month's actual spending in Cash Flow.", xp: 20, icon: "chart-line",  source: { kind: "xp", xpKind: "budget_logged" } },
  { id: "watchlist_add",  label: "Add to your watchlist",    description: "Track a name you're eyeing in Research.",        xp: 15, icon: "plus-circle", source: { kind: "xp", xpKind: "watchlist_added" } },
  { id: "fund_goal",      label: "Fund a goal",              description: "Create or add to a savings goal in Planning.",   xp: 20, icon: "sparkle",     source: { kind: "xp", xpKind: "goal_progress" } },
];

const WEEKLY_COUNT = 3;

export type ChallengeState = Omit<ChallengeDef, "source"> & { done: boolean };

// ISO-week key like "2026-W26" (weeks start Monday).
export function isoWeekKey(d = new Date()): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((t.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function weekNumber(weekKey: string): number {
  const m = weekKey.match(/W(\d+)$/);
  return m ? parseInt(m[1], 10) : 0;
}

// Deterministically rotate WEEKLY_COUNT quests into view for the given week.
function questsForWeek(weekKey: string): ChallengeDef[] {
  const offset = (weekNumber(weekKey) * WEEKLY_COUNT) % POOL.length;
  return Array.from({ length: WEEKLY_COUNT }, (_, i) => POOL[(offset + i) % POOL.length]);
}

// Monday 00:00 UTC of the current week, as an ISO timestamp.
function weekStartIso(now = new Date()): string {
  const t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() - (day - 1));
  return t.toISOString();
}

type Admin = ReturnType<typeof createAdminClient>;

async function isDone(admin: Admin, userId: string, src: ChallengeSource, sinceIso: string): Promise<boolean> {
  try {
    if (src.kind === "xp") {
      const { count } = await admin
        .from("xp_events").select("id", { count: "exact", head: true })
        .eq("user_id", userId).eq("kind", src.xpKind).gte("created_at", sinceIso);
      return (count ?? 0) > 0;
    }
    let q = admin.from(src.table).select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", sinceIso);
    if (src.eqCol !== undefined) q = q.eq(src.eqCol, src.eqVal as string);
    const { count } = await q;
    return (count ?? 0) > 0;
  } catch {
    return false;
  }
}

// Compute this week's quests for a user, award XP for any freshly completed ones, and drop a
// bell notification on first completion. Safe to call from multiple places (idempotent).
export async function getWeeklyChallenges(userId: string): Promise<{ weekKey: string; challenges: ChallengeState[] }> {
  const weekKey = isoWeekKey();
  const quests = questsForWeek(weekKey);
  const fallback = quests.map((q) => ({ id: q.id, label: q.label, description: q.description, xp: q.xp, icon: q.icon, done: false }));
  if (!userId) return { weekKey, challenges: fallback };

  let admin: Admin;
  try {
    admin = createAdminClient();
  } catch {
    return { weekKey, challenges: fallback };
  }

  const since = weekStartIso();
  const dones = await Promise.all(quests.map((q) => isDone(admin, userId, q.source, since)));
  const challenges: ChallengeState[] = quests.map((q, i) => ({
    id: q.id, label: q.label, description: q.description, xp: q.xp, icon: q.icon, done: dones[i],
  }));

  // Credit XP once per week for each completed quest; celebrate the first time.
  await Promise.all(
    challenges.filter((c) => c.done).map(async (c) => {
      const res = await awardXp(userId, "challenge", `challenge:${c.id}:${weekKey}`, c.xp);
      if (res?.awarded) {
        try {
          await admin.from("app_notifications").insert({
            title: "Challenge complete 🎯",
            body: `You finished "${c.label}" and earned +${c.xp} XP. Keep the streak going!`,
            target_user_id: userId,
          });
        } catch { /* non-fatal */ }
      }
    }),
  );

  return { weekKey, challenges };
}
