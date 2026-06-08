"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type CarScenario = {
  id: string;
  user_id: string;
  name: string;
  // Current vehicle
  current_make: string | null;
  current_model: string | null;
  current_year: number | null;
  current_car_value: number;
  current_loan_balance: number;
  current_monthly_payment: number;
  current_interest_rate: number;
  current_mpg: number;
  current_monthly_insurance: number;
  // New vehicle
  new_make: string | null;
  new_model: string | null;
  new_year: number | null;
  new_car_price: number;
  new_down_payment: number;
  new_loan_term_months: number;
  new_interest_rate: number;
  new_mpg: number;
  new_monthly_insurance: number;
  // Shared
  purchase_type: string;  // 'cash' | 'finance'
  gas_price_per_gallon: number;
  miles_per_month: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export async function saveCarScenario(
  data: Omit<CarScenario, "id" | "user_id" | "created_at" | "updated_at">,
  existingId?: string,
): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  if (existingId) {
    const { error } = await supabase
      .from("car_scenarios")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("id", existingId)
      .eq("user_id", user.id);
    if (error) return { error: error.message };
    revalidatePath("/planning/car");
    revalidatePath("/planning");
    return { id: existingId };
  }

  const { data: row, error } = await supabase
    .from("car_scenarios")
    .insert({ ...data, user_id: user.id })
    .select("id")
    .single();
  if (error) return { error: error.message };
  revalidatePath("/planning/car");
  revalidatePath("/planning");
  return { id: row.id };
}

export async function deleteCarScenario(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { error } = await supabase
    .from("car_scenarios")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/planning/car");
  revalidatePath("/planning");
  return {};
}
