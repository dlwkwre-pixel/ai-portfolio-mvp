"use server";

import { createClient } from "@/lib/supabase/server";

type BadgeContext = {
  longestStreak: number;
  onboardingStatus: string | null;
  portfolioCount: number;
  holdingCount: number;
  strategyCount: number;
  aiRunCount: number;
  executedCount: number;
  sharedPortfolioCount: number;
  followingCount: number;
  followerCount: number;
};

function evaluate(ctx: BadgeContext, existing: Set<string>): string[] {
  const toAward: string[] = [];
  const check = (id: string, cond: boolean) => {
    if (cond && !existing.has(id)) toAward.push(id);
  };

  check("first_login",    true);
  check("streak_3",       ctx.longestStreak >= 3);
  check("streak_7",       ctx.longestStreak >= 7);
  check("streak_30",      ctx.longestStreak >= 30);
  check("streak_50",      ctx.longestStreak >= 50);
  check("streak_100",     ctx.longestStreak >= 100);
  check("tutorial",       ctx.onboardingStatus === "completed");
  check("first_portfolio",ctx.portfolioCount > 0);
  check("first_holding",  ctx.holdingCount > 0);
  check("strategist",     ctx.strategyCount > 0);
  check("ai_first",       ctx.aiRunCount > 0);
  check("ai_10",          ctx.aiRunCount >= 10);
  check("exec_first",     ctx.executedCount > 0);
  check("shared",         ctx.sharedPortfolioCount > 0);
  check("following",      ctx.followingCount > 0);
  check("follower",       ctx.followerCount > 0);

  return toAward;
}

export async function checkAndAwardBadges(userId: string): Promise<string[]> {
  const supabase = await createClient();

  const [
    { data: profile },
    { data: existingBadges },
    { count: portfolioCount },
    { count: holdingCount },
    { count: strategyCount },
    { count: aiRunCount },
    { count: executedCount },
    { count: sharedCount },
    { count: followingCount },
    { count: followerCount },
  ] = await Promise.all([
    supabase.from("user_profiles")
      .select("longest_streak, onboarding_status")
      .eq("id", userId)
      .maybeSingle(),
    supabase.from("user_badges")
      .select("badge_id")
      .eq("user_id", userId),
    supabase.from("portfolios")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_active", true),
    supabase.from("holdings")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    supabase.from("strategies")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_active", true),
    supabase.from("recommendation_runs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "completed"),
    supabase.from("recommendation_items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("recommendation_status", "executed"),
    supabase.from("public_portfolios")
      .select("id", { count: "exact", head: true })
      .eq("owner_user_id", userId)
      .eq("is_public", true),
    supabase.from("user_follows")
      .select("id", { count: "exact", head: true })
      .eq("follower_id", userId),
    supabase.from("user_follows")
      .select("id", { count: "exact", head: true })
      .eq("following_id", userId),
  ]);

  const p = profile as { longest_streak?: number | null; onboarding_status?: string | null } | null;
  const ctx: BadgeContext = {
    longestStreak:        p?.longest_streak ?? 0,
    onboardingStatus:     p?.onboarding_status ?? null,
    portfolioCount:       portfolioCount ?? 0,
    holdingCount:         holdingCount ?? 0,
    strategyCount:        strategyCount ?? 0,
    aiRunCount:           aiRunCount ?? 0,
    executedCount:        executedCount ?? 0,
    sharedPortfolioCount: sharedCount ?? 0,
    followingCount:       followingCount ?? 0,
    followerCount:        followerCount ?? 0,
  };

  const existing = new Set((existingBadges ?? []).map((b) => b.badge_id));
  const toAward = evaluate(ctx, existing);

  if (toAward.length > 0) {
    await supabase.from("user_badges").insert(
      toAward.map((badge_id) => ({ user_id: userId, badge_id }))
    );
  }

  return toAward;
}
