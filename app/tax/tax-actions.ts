"use server";

import { createClient } from "@/lib/supabase/server";

export async function saveLotAcqYears(years: Record<string, number>): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("financial_profiles")
    .upsert(
      { user_id: user.id, lot_acq_years: years },
      { onConflict: "user_id" }
    );
}

export async function saveLotCostBasis(overrides: Record<string, number>): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("financial_profiles")
    .upsert(
      { user_id: user.id, lot_cost_basis: overrides },
      { onConflict: "user_id" }
    );
}

export async function saveLotProceeds(overrides: Record<string, number>): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("financial_profiles")
    .upsert(
      { user_id: user.id, lot_proceeds: overrides },
      { onConflict: "user_id" }
    );
}
