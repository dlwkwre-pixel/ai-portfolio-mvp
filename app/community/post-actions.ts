"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { awardXp, dailyKey } from "@/lib/gamification/xp";

// Light profanity guard — blocks the most obvious slurs/abuse. Not exhaustive;
// reporting + own-delete handle the rest.
const BANNED = ["nigger", "faggot", "retard", "kike", "spic", "chink", "cunt"];
function hasBannedWords(text: string): boolean {
  const t = text.toLowerCase();
  return BANNED.some((w) => new RegExp(`\\b${w}`, "i").test(t));
}

function cleanTickers(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const r of raw) {
    const t = String(r ?? "").toUpperCase().replace(/[^A-Z.]/g, "").slice(0, 8);
    if (t.length >= 1 && t.length <= 6) seen.add(t);
    if (seen.size >= 8) break;
  }
  return [...seen];
}

export type CreatePostInput = {
  body: string;
  tickers?: string[];
  attachStrategyId?: string | null;
  attachPortfolioId?: string | null;
  pollOptions?: string[] | null;
  aiTicker?: string | null;
  aiTake?: string | null;
};

export async function createPost(input: CreatePostInput): Promise<{ id: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { limited } = checkRateLimit(`community-post:${user.id}`, 8, 10 * 60 * 1000);
  if (limited) throw new Error("You're posting too fast. Take a breather and try again shortly.");

  const body = (input.body ?? "").trim();
  if (!body) throw new Error("Write something to post.");
  if (body.length > 2000) throw new Error("Posts are limited to 2000 characters.");
  if (hasBannedWords(body)) throw new Error("Your post contains language that isn't allowed.");

  // Poll: 2–5 non-empty options
  let pollOptions: string[] | null = null;
  if (Array.isArray(input.pollOptions)) {
    const opts = input.pollOptions.map((o) => String(o ?? "").trim()).filter(Boolean).slice(0, 5);
    if (opts.length >= 2) {
      if (opts.some(hasBannedWords)) throw new Error("Your poll contains language that isn't allowed.");
      pollOptions = opts.map((o) => o.slice(0, 60));
    }
  }

  // Attachments must belong to the user (and strategies must be public to share).
  let attachStrategyId: string | null = null;
  if (input.attachStrategyId) {
    const { data } = await supabase
      .from("strategies").select("id, is_public")
      .eq("id", input.attachStrategyId).eq("user_id", user.id).maybeSingle();
    if (data?.is_public) attachStrategyId = data.id as string;
  }
  let attachPortfolioId: string | null = null;
  if (input.attachPortfolioId) {
    const { data } = await supabase
      .from("public_portfolios").select("id")
      .eq("id", input.attachPortfolioId).eq("owner_user_id", user.id).maybeSingle();
    if (data) attachPortfolioId = data.id as string;
  }

  const aiTicker = input.aiTicker ? String(input.aiTicker).toUpperCase().replace(/[^A-Z.]/g, "").slice(0, 6) : null;
  const aiTake = input.aiTake ? String(input.aiTake).trim().slice(0, 600) : null;

  const { data: post, error } = await supabase
    .from("community_posts")
    .insert({
      user_id: user.id,
      body,
      tickers: cleanTickers(input.tickers),
      attached_strategy_id: attachStrategyId,
      attached_portfolio_id: attachPortfolioId,
      poll_options: pollOptions,
      ai_ticker: aiTicker && aiTake ? aiTicker : null,
      ai_take: aiTicker && aiTake ? aiTake : null,
    })
    .select("id")
    .single();

  if (error || !post) throw new Error(error?.message || "Could not create post.");
  void awardXp(user.id, "community_post", dailyKey("community_post"));
  revalidatePath("/community");
  return { id: post.id as string };
}

export async function deletePost(postId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { error } = await supabase.from("community_posts").delete().eq("id", postId).eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/community");
}

export async function togglePostLike(postId: string): Promise<{ liked: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: existing } = await supabase
    .from("community_post_likes").select("post_id")
    .eq("post_id", postId).eq("user_id", user.id).maybeSingle();
  if (existing) {
    await supabase.from("community_post_likes").delete().eq("post_id", postId).eq("user_id", user.id);
    return { liked: false };
  }
  await supabase.from("community_post_likes").insert({ post_id: postId, user_id: user.id });
  return { liked: true };
}

export async function addPostComment(postId: string, body: string): Promise<{ id: string; created_at: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const text = (body ?? "").trim();
  if (!text) throw new Error("Write a comment.");
  if (text.length > 1000) throw new Error("Comments are limited to 1000 characters.");
  if (hasBannedWords(text)) throw new Error("Your comment contains language that isn't allowed.");
  const { data, error } = await supabase
    .from("community_post_comments")
    .insert({ post_id: postId, user_id: user.id, body: text })
    .select("id, created_at").single();
  if (error || !data) throw new Error(error?.message || "Could not add comment.");
  revalidatePath("/community");
  return { id: data.id as string, created_at: data.created_at as string };
}

export async function deletePostComment(commentId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { error } = await supabase.from("community_post_comments").delete().eq("id", commentId).eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/community");
}

export async function votePoll(postId: string, optionIdx: number) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  // Upsert the user's single vote for this poll.
  const { error } = await supabase
    .from("community_poll_votes")
    .upsert({ post_id: postId, user_id: user.id, option_idx: optionIdx }, { onConflict: "post_id,user_id" });
  if (error) throw new Error(error.message);
  revalidatePath("/community");
}

export async function reportPost(postId: string, reason: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { error } = await supabase
    .from("community_post_reports")
    .insert({ post_id: postId, reporter_id: user.id, reason: (reason ?? "").slice(0, 500) || null });
  if (error) throw new Error(error.message);
}
