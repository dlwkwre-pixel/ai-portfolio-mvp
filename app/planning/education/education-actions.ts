"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type EducationScenario = {
  id: string;
  user_id: string;
  name: string;
  child_name: string | null;
  child_current_age: number;
  years_in_college: number;
  annual_cost_today: number;
  cost_inflation_rate: number;
  current_529_balance: number;
  monthly_contribution: number;
  investment_return: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export async function saveEducationScenario(
  data: Omit<EducationScenario, "id" | "user_id" | "is_active" | "created_at" | "updated_at">,
  existingId?: string,
): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  if (existingId) {
    const { error } = await supabase
      .from("education_scenarios")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("id", existingId)
      .eq("user_id", user.id);
    if (error) return { error: error.message };
    revalidatePath("/planning");
    revalidatePath("/planning/education");
    return { id: existingId };
  }

  const { count } = await supabase
    .from("education_scenarios")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if ((count ?? 0) >= 10) return { error: "Maximum 10 scenarios per account." };

  const { data: row, error } = await supabase
    .from("education_scenarios")
    .insert({ user_id: user.id, ...data })
    .select("id")
    .single();

  if (error) return { error: error.message };
  revalidatePath("/planning");
  revalidatePath("/planning/education");
  return { id: row.id };
}

export async function deleteEducationScenario(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { error } = await supabase
    .from("education_scenarios")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/planning");
  revalidatePath("/planning/education");
  return {};
}
