"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type GoalCategory = "house" | "car" | "travel" | "education" | "retirement" | "emergency" | "wedding" | "fund" | "other";

export type Goal = {
  id: string;
  name: string;
  category: GoalCategory;
  target_amount: number;
  current_amount: number;
  target_year: number | null;
  sort_order: number;
};

const CATEGORIES: GoalCategory[] = ["house", "car", "travel", "education", "retirement", "emergency", "wedding", "fund", "other"];

export async function addGoal(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const name = String(formData.get("name") || "").trim().slice(0, 80);
  const category = String(formData.get("category") || "other").trim().toLowerCase();
  const target = Number(formData.get("target_amount") || 0);
  const current = Number(formData.get("current_amount") || 0);
  const yearRaw = String(formData.get("target_year") || "").trim();
  const target_year = yearRaw ? Number(yearRaw) : null;

  if (!name) return { error: "Give your goal a name." };
  if (!Number.isFinite(target) || target <= 0) return { error: "Set a target amount greater than 0." };

  const { data: existing } = await supabase
    .from("planning_goals").select("sort_order").eq("user_id", user.id)
    .order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const sort_order = (existing?.sort_order ?? -1) + 1;

  const { error } = await supabase.from("planning_goals").insert({
    user_id: user.id,
    name,
    category: CATEGORIES.includes(category as GoalCategory) ? category : "other",
    target_amount: target,
    current_amount: Math.max(0, Number.isFinite(current) ? current : 0),
    target_year: target_year && target_year >= 2000 && target_year <= 2200 ? target_year : null,
    sort_order,
  });
  if (error) return { error: error.message };
  revalidatePath("/planning/goals");
  return {};
}

export async function updateGoal(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const id = String(formData.get("id") || "").trim();
  if (!id) return { error: "Missing goal." };
  const name = String(formData.get("name") || "").trim().slice(0, 80);
  const category = String(formData.get("category") || "other").trim().toLowerCase();
  const target = Number(formData.get("target_amount") || 0);
  const current = Number(formData.get("current_amount") || 0);
  const yearRaw = String(formData.get("target_year") || "").trim();
  const target_year = yearRaw ? Number(yearRaw) : null;
  if (!name) return { error: "Give your goal a name." };
  if (!Number.isFinite(target) || target <= 0) return { error: "Set a target amount greater than 0." };

  const { error } = await supabase.from("planning_goals").update({
    name,
    category: CATEGORIES.includes(category as GoalCategory) ? category : "other",
    target_amount: target,
    current_amount: Math.max(0, Number.isFinite(current) ? current : 0),
    target_year: target_year && target_year >= 2000 && target_year <= 2200 ? target_year : null,
    updated_at: new Date().toISOString(),
  }).eq("id", id).eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/planning/goals");
  return {};
}

// Quick contribute/withdraw (delta) — clamps current_amount at 0.
export async function adjustGoal(id: string, delta: number): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  const { data: row } = await supabase.from("planning_goals").select("current_amount").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!row) return { error: "Goal not found." };
  const next = Math.max(0, Number(row.current_amount ?? 0) + delta);
  const { error } = await supabase.from("planning_goals").update({ current_amount: next, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/planning/goals");
  return {};
}

export async function deleteGoal(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  const { error } = await supabase.from("planning_goals").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/planning/goals");
  return {};
}
