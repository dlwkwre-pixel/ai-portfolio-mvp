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
