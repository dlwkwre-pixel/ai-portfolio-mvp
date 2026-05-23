"use server";

import { createClient } from "@/lib/supabase/server";
import { checkAndAwardBadges } from "@/lib/badges/check";

export async function recordDailyActivity(): Promise<number> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("login_streak, longest_streak, last_active_date")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) return 0;

  const lastDate = (profile as { last_active_date?: string | null }).last_active_date ?? null;
  const currentStreak = (profile as { login_streak?: number | null }).login_streak ?? 0;
  const longestStreak = (profile as { longest_streak?: number | null }).longest_streak ?? 0;

  if (lastDate === today) return currentStreak;

  const newStreak = lastDate === yesterday ? currentStreak + 1 : 1;
  const newLongest = Math.max(longestStreak, newStreak);

  await supabase
    .from("user_profiles")
    .update({
      login_streak: newStreak,
      longest_streak: newLongest,
      last_active_date: today,
    } as Record<string, unknown>)
    .eq("id", user.id);

  // Fire-and-forget badge check — non-fatal if user_badges table doesn't exist yet
  void checkAndAwardBadges(user.id).catch(() => {});

  return newStreak;
}
