"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type HomeScenario = {
  id: string;
  user_id: string;
  name: string;
  purchase_price: number;
  down_payment: number;
  mortgage_rate: number;
  loan_term_years: number;
  property_tax_monthly: number;
  insurance_monthly: number;
  hoa_monthly: number;
  maintenance_pct: number;
  monthly_rent: number;
  rent_growth_rate: number;
  expected_appreciation: number;
  investment_return: number;
  hold_years: number;
  closing_cost_pct: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export async function saveHomeScenario(
  data: Omit<HomeScenario, "id" | "user_id" | "is_active" | "created_at" | "updated_at">,
  existingId?: string,
): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  if (existingId) {
    const { error } = await supabase
      .from("home_planning_scenarios")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("id", existingId)
      .eq("user_id", user.id);
    if (error) return { error: error.message };
    revalidatePath("/planning");
    revalidatePath("/planning/home");
    return { id: existingId };
  }

  // Cap at 10 scenarios per user
  const { count } = await supabase
    .from("home_planning_scenarios")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if ((count ?? 0) >= 10) return { error: "Maximum 10 scenarios per account." };

  const { data: row, error } = await supabase
    .from("home_planning_scenarios")
    .insert({ user_id: user.id, ...data })
    .select("id")
    .single();

  if (error) return { error: error.message };
  revalidatePath("/planning");
  revalidatePath("/planning/home");
  return { id: row.id };
}

export type HomeOwnerProfile = {
  is_homeowner: boolean;
  owner_home_value: number | null;
  owner_mortgage_balance: number | null;
  owner_monthly_payment: number | null;
  owner_interest_rate: number | null;
  owner_remaining_term: number | null;
  owner_agent_commission_pct: number;
  owner_move_in_costs: number;
  owner_expected_sale_price: number | null;
  owner_hoa_monthly: number | null;
};

export async function saveHomeOwnerProfile(data: HomeOwnerProfile): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { error } = await supabase.from("financial_profiles").upsert(
    { user_id: user.id, ...data, updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );

  if (error) return { error: error.message };
  revalidatePath("/planning/home");
  return {};
}

export async function deleteHomeScenario(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { error } = await supabase
    .from("home_planning_scenarios")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/planning");
  revalidatePath("/planning/home");
  return {};
}
