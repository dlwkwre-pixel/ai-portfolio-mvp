"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type CareerScenario = {
  id: string;
  user_id: string;
  name: string;
  current_monthly_income: number;
  current_growth_rate: number;
  new_monthly_income: number;
  new_growth_rate: number;
  gap_months: number;
  transition_cost: number;
  monthly_expenses: number;
  liquid_assets: number;
  investment_return: number;
  projection_years: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export async function saveCareerScenario(
  data: Omit<CareerScenario, "id" | "user_id" | "is_active" | "created_at" | "updated_at">,
  existingId?: string,
): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  if (existingId) {
    const { error } = await supabase
      .from("career_scenarios")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("id", existingId)
      .eq("user_id", user.id);
    if (error) return { error: error.message };
    revalidatePath("/planning");
    revalidatePath("/planning/career");
    return { id: existingId };
  }

  const { count } = await supabase
    .from("career_scenarios")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if ((count ?? 0) >= 10) return { error: "Maximum 10 scenarios per account." };

  const { data: row, error } = await supabase
    .from("career_scenarios")
    .insert({ user_id: user.id, ...data })
    .select("id")
    .single();

  if (error) return { error: error.message };
  revalidatePath("/planning");
  revalidatePath("/planning/career");
  return { id: row.id };
}

export async function deleteCareerScenario(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { error } = await supabase
    .from("career_scenarios")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/planning");
  revalidatePath("/planning/career");
  return {};
}
