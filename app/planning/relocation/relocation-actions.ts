"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type RelocationScenario = {
  id: string;
  user_id: string;
  name: string;
  current_city: string | null;
  new_city: string | null;
  is_remote: boolean;
  current_income_monthly: number;
  new_income_monthly: number;
  current_expenses_monthly: number;
  col_delta_pct: number;
  moving_cost: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export async function saveRelocationScenario(
  data: Omit<RelocationScenario, "id" | "user_id" | "created_at" | "updated_at">,
  existingId?: string,
): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const payload = {
    name: data.name,
    current_city: data.current_city,
    new_city: data.new_city,
    is_remote: data.is_remote,
    current_income_monthly: data.current_income_monthly,
    new_income_monthly: data.new_income_monthly,
    current_expenses_monthly: data.current_expenses_monthly,
    col_delta_pct: data.col_delta_pct,
    moving_cost: data.moving_cost,
    notes: data.notes,
  };

  if (existingId) {
    const { error } = await supabase
      .from("relocation_scenarios")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", existingId)
      .eq("user_id", user.id);
    if (error) return { error: error.message };
    revalidatePath("/planning/relocation");
    revalidatePath("/planning");
    return { id: existingId };
  }

  const { data: row, error } = await supabase
    .from("relocation_scenarios")
    .insert({ ...payload, user_id: user.id })
    .select("id")
    .single();
  if (error) return { error: error.message };
  revalidatePath("/planning/relocation");
  revalidatePath("/planning");
  return { id: row.id };
}

export async function deleteRelocationScenario(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { error } = await supabase
    .from("relocation_scenarios")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/planning/relocation");
  revalidatePath("/planning");
  return {};
}
