"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type SabbaticalScenario = {
  id: string;
  user_id: string;
  name: string;
  sabbatical_months: number;
  monthly_expenses_during: number;
  monthly_stipend: number;
  liquid_assets_available: number;
  current_monthly_income: number;
  monthly_income_after_return: number;
  investment_return_rate: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export async function saveSabbaticalScenario(
  data: Omit<SabbaticalScenario, "id" | "user_id" | "created_at" | "updated_at">,
  existingId?: string,
): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  if (existingId) {
    const { error } = await supabase
      .from("sabbatical_scenarios")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("id", existingId)
      .eq("user_id", user.id);
    if (error) return { error: error.message };
    revalidatePath("/planning/sabbatical");
    revalidatePath("/planning");
    return { id: existingId };
  }

  const { data: row, error } = await supabase
    .from("sabbatical_scenarios")
    .insert({ ...data, user_id: user.id })
    .select("id")
    .single();
  if (error) return { error: error.message };
  revalidatePath("/planning/sabbatical");
  revalidatePath("/planning");
  return { id: row.id };
}

export async function deleteSabbaticalScenario(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { error } = await supabase
    .from("sabbatical_scenarios")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/planning/sabbatical");
  revalidatePath("/planning");
  return {};
}
