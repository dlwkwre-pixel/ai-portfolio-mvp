import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserXp } from "@/lib/gamification/xp";
import { getWeeklyChallenges } from "@/lib/gamification/challenges";

export const dynamic = "force-dynamic";

// Lightweight gamification state for the current user — powers the dashboard challenges widget
// and the global level-up watcher. Calling getWeeklyChallenges here also detects + credits any
// freshly completed quests (idempotent), so the XP read below reflects them.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ signedIn: false, level: 0, xp: 0, pct: 0, challenges: [], weekKey: null });
  }

  const { weekKey, challenges } = await getWeeklyChallenges(user.id);
  const xp = await getUserXp(user.id);

  return NextResponse.json({
    signedIn: true,
    level: xp.level,
    xp: xp.xp,
    pct: xp.pct,
    intoLevel: xp.intoLevel,
    levelSpan: xp.levelSpan,
    nextLevelXp: xp.nextLevelXp,
    weekKey,
    challenges,
  });
}
