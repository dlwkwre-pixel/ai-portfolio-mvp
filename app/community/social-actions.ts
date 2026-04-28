"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function toggleStrategyPublic(strategyId: string, isPublic: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("strategies")
    .update({ is_public: isPublic })
    .eq("id", strategyId)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
  revalidatePath("/strategies");
  revalidatePath("/community");
}

export async function likeStrategy(strategyId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: existing } = await supabase
    .from("strategy_likes")
    .select("id")
    .eq("user_id", user.id)
    .eq("strategy_id", strategyId)
    .maybeSingle();

  if (existing) {
    await supabase.from("strategy_likes").delete()
      .eq("user_id", user.id).eq("strategy_id", strategyId);
  } else {
    await supabase.from("strategy_likes").insert({ user_id: user.id, strategy_id: strategyId });
  }

  revalidatePath("/community");
  revalidatePath("/strategies");
}

export async function saveStrategy(strategyId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Don't save your own strategy
  const { data: strategy } = await supabase
    .from("strategies").select("user_id").eq("id", strategyId).single();
  if (strategy?.user_id === user.id) throw new Error("Cannot save your own strategy");

  const { data: existing } = await supabase
    .from("strategy_saves")
    .select("id").eq("user_id", user.id).eq("strategy_id", strategyId).maybeSingle();

  if (existing) {
    await supabase.from("strategy_saves").delete()
      .eq("user_id", user.id).eq("strategy_id", strategyId);
  } else {
    await supabase.from("strategy_saves").insert({ user_id: user.id, strategy_id: strategyId });
  }

  revalidatePath("/community");
  revalidatePath("/strategies");
}

export async function postComment(strategyId: string, content: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  if (!content.trim()) throw new Error("Comment cannot be empty");

  const { error } = await supabase.from("strategy_comments").insert({
    user_id: user.id,
    strategy_id: strategyId,
    content: content.trim(),
  });

  if (error) throw new Error(error.message);
  revalidatePath("/community");
}

export async function deleteComment(commentId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase.from("strategy_comments").delete()
    .eq("id", commentId).eq("user_id", user.id);

  if (error) throw new Error(error.message);
  revalidatePath("/community");
}

export async function followUser(targetUserId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  if (user.id === targetUserId) throw new Error("Cannot follow yourself");

  const { data: existing } = await supabase
    .from("user_follows")
    .select("follower_id").eq("follower_id", user.id).eq("following_id", targetUserId).maybeSingle();

  if (existing) {
    await supabase.from("user_follows").delete()
      .eq("follower_id", user.id).eq("following_id", targetUserId);
  } else {
    await supabase.from("user_follows").insert({ follower_id: user.id, following_id: targetUserId });
  }

  revalidatePath("/community");
}

export async function copyStrategyAsTemplate(strategyId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Get the source strategy and its latest version
  const { data: source } = await supabase
    .from("strategies")
    .select("*")
    .eq("id", strategyId)
    .eq("is_public", true)
    .single();

  if (!source) throw new Error("Strategy not found or not public");
  if (source.user_id === user.id) throw new Error("Cannot copy your own strategy");

  const { data: latestVersion } = await supabase
    .from("strategy_versions")
    .select("*")
    .eq("strategy_id", strategyId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Create new strategy
  const { data: newStrategy, error: stratError } = await supabase
    .from("strategies")
    .insert({
      user_id: user.id,
      name: `${source.name} (copy)`,
      description: source.description,
      style: source.style,
      risk_level: source.risk_level,
      is_active: true,
      is_public: false,
    })
    .select()
    .single();

  if (stratError || !newStrategy) throw new Error(stratError?.message ?? "Failed to create strategy");

  // Copy latest version if it exists
  if (latestVersion) {
    await supabase.from("strategy_versions").insert({
      strategy_id: newStrategy.id,
      version_number: 1,
      prompt_text: latestVersion.prompt_text,
      max_position_pct: latestVersion.max_position_pct,
      min_position_pct: latestVersion.min_position_pct,
      turnover_preference: latestVersion.turnover_preference,
      holding_period_bias: latestVersion.holding_period_bias,
      cash_min_pct: latestVersion.cash_min_pct,
      cash_max_pct: latestVersion.cash_max_pct,
    });
  }

  // Increment copies count on source
  await supabase
    .from("strategies")
    .update({ copies_count: (source.copies_count ?? 0) + 1 })
    .eq("id", strategyId);

  revalidatePath("/strategies");
  revalidatePath("/community");

  return { id: newStrategy.id, name: newStrategy.name };
}
