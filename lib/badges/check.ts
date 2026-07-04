"use server";

import { createClient } from "@/lib/supabase/server";
import type { BadgeMetric } from "@/lib/badges/definitions";

export type BadgeContext = {
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

// Flatten the context into the countable metrics a badge can show progress against.
// Keys must match BadgeMetric (and the per-badge `progress.metric` in definitions.ts).
export async function badgeMetrics(ctx: BadgeContext): Promise<Record<BadgeMetric, number>> {
  return {
    longestStreak:        ctx.longestStreak,
    portfolioCount:       ctx.portfolioCount,
    holdingCount:         ctx.holdingCount,
    strategyCount:        ctx.strategyCount,
    aiRunCount:           ctx.aiRunCount,
    executedCount:        ctx.executedCount,
    sharedPortfolioCount: ctx.sharedPortfolioCount,
    followingCount:       ctx.followingCount,
    followerCount:        ctx.followerCount,
  };
}

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
  check("holdings_10",    ctx.holdingCount >= 10);
  check("holdings_25",    ctx.holdingCount >= 25);
  check("multi_portfolio",ctx.portfolioCount >= 3);
  check("strategist",     ctx.strategyCount > 0);
  check("ai_first",       ctx.aiRunCount > 0);
  check("ai_10",          ctx.aiRunCount >= 10);
  check("ai_25",          ctx.aiRunCount >= 25);
  check("exec_first",     ctx.executedCount > 0);
  check("exec_10",        ctx.executedCount >= 10);
  check("shared",         ctx.sharedPortfolioCount > 0);
  check("following",      ctx.followingCount > 0);
  check("follower",       ctx.followerCount > 0);
  check("follower_10",    ctx.followerCount >= 10);

  return toAward;
}

// Gather everything the badge system reasons about, in one parallel pass.
// Shared by checkAndAwardBadges (award) and the Achievements hub (progress display).
export async function getBadgeContext(userId: string): Promise<BadgeContext> {
  const supabase = await createClient();

  const [
    { data: profile },
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
    supabase.from("portfolios")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_active", true),
    // Holdings carry only portfolio_id (no user_id), so count via the owning portfolio.
    supabase.from("holdings")
      .select("id, portfolios!inner(user_id)", { count: "exact", head: true })
      .eq("portfolios.user_id", userId),
    supabase.from("strategies")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_active", true),
    // recommendation_runs/_items don't store user_id — count via the owning
    // portfolio (same join holdings uses), which is correct AND retroactive.
    supabase.from("recommendation_runs")
      .select("id, portfolios!inner(user_id)", { count: "exact", head: true })
      .eq("portfolios.user_id", userId)
      .eq("status", "completed"),
    supabase.from("recommendation_items")
      .select("id, portfolios!inner(user_id)", { count: "exact", head: true })
      .eq("portfolios.user_id", userId)
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
  return {
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
}

export async function checkAndAwardBadges(userId: string): Promise<string[]> {
  const supabase = await createClient();

  const [ctx, { data: existingBadges }] = await Promise.all([
    getBadgeContext(userId),
    supabase.from("user_badges").select("badge_id").eq("user_id", userId),
  ]);

  const existing = new Set((existingBadges ?? []).map((b) => b.badge_id));
  const toAward = evaluate(ctx, existing);

  if (toAward.length > 0) {
    await supabase.from("user_badges").insert(
      toAward.map((badge_id) => ({ user_id: userId, badge_id }))
    );
  }

  return toAward;
}
