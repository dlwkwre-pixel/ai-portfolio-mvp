"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type FamilyScenario = {
  id: string;
  user_id: string;
  name: string;
  child_name: string | null;
  child_current_age: number;
  monthly_infant_cost: number;
  monthly_child_cost: number;
  monthly_teen_cost: number;
  monthly_expenses_now: number;
  investment_return: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export async function saveFamilyScenario(
  data: Omit<FamilyScenario, "id" | "user_id" | "is_active" | "created_at" | "updated_at">,
  existingId?: string,
): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  if (existingId) {
    const { error } = await supabase
      .from("family_scenarios")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("id", existingId)
      .eq("user_id", user.id);
    if (error) return { error: error.message };
    revalidatePath("/planning");
    revalidatePath("/planning/family");
    return { id: existingId };
  }

  const { count } = await supabase
    .from("family_scenarios")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if ((count ?? 0) >= 10) return { error: "Maximum 10 scenarios per account." };

  const { data: row, error } = await supabase
    .from("family_scenarios")
    .insert({ user_id: user.id, ...data })
    .select("id")
    .single();

  if (error) return { error: error.message };
  revalidatePath("/planning");
  revalidatePath("/planning/family");
  return { id: row.id };
}

export async function deleteFamilyScenario(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { error } = await supabase
    .from("family_scenarios")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/planning");
  revalidatePath("/planning/family");
  return {};
}

export async function addFamilyToForecast(params: {
  childName: string;
  childCurrentAge: number;
  monthlyInfantCost: number;
  monthlyChildCost: number;
  monthlyTeenCost: number;
  currentYear: number;
}): Promise<{ error?: string; added: number }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated.", added: 0 };

  const label = params.childName ? `${params.childName} — ` : "Child — ";
  const events: {
    user_id: string; label: string; event_year: number;
    amount_impact: number; category: string; sort_order: number;
  }[] = [];

  for (let age = params.childCurrentAge; age < 18; age++) {
    const yearsFromNow = age - params.childCurrentAge;
    const monthlyCost = age < 3 ? params.monthlyInfantCost : age <= 12 ? params.monthlyChildCost : params.monthlyTeenCost;
    if (monthlyCost <= 0) continue;
    const phase = age < 3 ? "Infant" : age <= 12 ? "Child" : "Teen";
    events.push({
      user_id: user.id,
      label: `${label}${phase} phase (age ${age})`,
      event_year: params.currentYear + yearsFromNow,
      amount_impact: -(monthlyCost * 12),
      category: "family",
      sort_order: yearsFromNow,
    });
  }

  if (events.length === 0) return { added: 0 };

  const { error } = await supabase.from("planning_future_events").insert(events);
  if (error) return { error: error.message, added: 0 };
  revalidatePath("/planning");
  revalidatePath("/planning/family");
  return { added: events.length };
}
