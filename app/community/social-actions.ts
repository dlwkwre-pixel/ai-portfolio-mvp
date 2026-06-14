"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

const TICKER_RE = /\b([A-Z]{1,5})\b/g;

function extractTickers(text: string): string[] {
  const matches = text.matchAll(TICKER_RE);
  const found = new Set<string>();
  for (const m of matches) found.add(m[1]);
  // Filter out common English words that look like tickers
  const stopWords = new Set(["I", "A", "AN", "IN", "ON", "AT", "TO", "OF", "IS", "IT", "MY", "WE", "US", "BE", "DO", "GO", "UP", "OR", "SO", "IF", "BY", "AS", "NO"]);
  return [...found].filter((t) => !stopWords.has(t) && t.length >= 2);
}

export async function postStrategyUpdate(
  strategyId: string,
  updateText: string,
  changeType: "add" | "remove" | "rebalance" | "note"
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const trimmed = updateText.trim();
  if (!trimmed || trimmed.length > 500) throw new Error("Update must be 1–500 characters");

  // Verify ownership and public status
  const { data: strategy } = await supabase
    .from("strategies")
    .select("user_id, is_public")
    .eq("id", strategyId)
    .single();

  if (!strategy || strategy.user_id !== user.id) throw new Error("Strategy not found or not yours");
  if (!strategy.is_public) throw new Error("Strategy must be public to post updates");

  const tickers = extractTickers(trimmed);

  const { error } = await supabase.from("strategy_updates").insert({
    strategy_id: strategyId,
    author_id: user.id,
    update_text: trimmed,
    change_type: changeType,
    tickers_mentioned: tickers,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/community");
}

export async function deleteStrategyUpdate(updateId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("strategy_updates")
    .delete()
    .eq("id", updateId)
    .eq("author_id", user.id);

  if (error) throw new Error(error.message);
  revalidatePath("/community");
}

export async function copyStrategyAsTemplate(strategyId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Use admin client to read source data — strategy_versions RLS only allows
  // the owner to read their own rows, so a user-scoped client would return null
  // for another user's version, silently dropping all AI instructions.
  const admin = createAdminClient();

  const { data: source } = await admin
    .from("strategies")
    .select("*")
    .eq("id", strategyId)
    .eq("is_public", true)
    .single();

  if (!source) throw new Error("Strategy not found or not public");
  if (source.user_id === user.id) throw new Error("Cannot copy your own strategy");

  const { data: latestVersion } = await admin
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

  // Increment copies count — use admin client + is_public guard to prevent
  // count inflation on private strategies or race-condition visibility changes.
  await admin
    .from("strategies")
    .update({ copies_count: (source.copies_count ?? 0) + 1 })
    .eq("id", strategyId)
    .eq("is_public", true);

  revalidatePath("/strategies");
  revalidatePath("/community");

  return { id: newStrategy.id, name: newStrategy.name };
}
