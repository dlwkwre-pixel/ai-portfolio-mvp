"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type Debt = {
  name: string;
  balance: number;
  apr: number;          // annual %, e.g. 22.9
  min_payment: number;  // monthly minimum
};

export type DebtScenario = {
  id: string;
  user_id: string;
  name: string;
  debts: Debt[];
  strategy: "avalanche" | "snowball";
  extra_payment: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export async function saveDebtScenario(
  data: Omit<DebtScenario, "id" | "user_id" | "created_at" | "updated_at">,
  existingId?: string,
): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const payload = {
    name: data.name,
    debts: data.debts,
    strategy: data.strategy,
    extra_payment: data.extra_payment,
    notes: data.notes,
  };

  if (existingId) {
    const { error } = await supabase
      .from("debt_payoff_scenarios")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", existingId)
      .eq("user_id", user.id);
    if (error) return { error: error.message };
    revalidatePath("/planning/debt");
    revalidatePath("/planning");
    return { id: existingId };
  }

  const { data: row, error } = await supabase
    .from("debt_payoff_scenarios")
    .insert({ ...payload, user_id: user.id })
    .select("id")
    .single();
  if (error) return { error: error.message };
  revalidatePath("/planning/debt");
  revalidatePath("/planning");
  return { id: row.id };
}

export async function deleteDebtScenario(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { error } = await supabase
    .from("debt_payoff_scenarios")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/planning/debt");
  revalidatePath("/planning");
  return {};
}
