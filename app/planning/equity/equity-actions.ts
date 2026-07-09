"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type EquityGrantType = "rsu" | "iso" | "nso" | "espp";

export type EquityGrant = {
  id: string;
  user_id: string;
  label: string | null;
  ticker: string | null;
  company_name: string | null;
  grant_type: EquityGrantType;
  total_shares: number;
  strike_price: number | null;
  current_price_manual: number | null;
  grant_date: string | null;
  vest_start_date: string | null;
  vest_months: number;
  cliff_months: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type EquityGrantInput = Omit<EquityGrant, "id" | "user_id" | "created_at" | "updated_at">;

export async function saveEquityGrant(
  data: EquityGrantInput,
  existingId?: string,
): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const clean = {
    ...data,
    ticker: data.ticker ? data.ticker.trim().toUpperCase() : null,
    total_shares: Number.isFinite(data.total_shares) ? data.total_shares : 0,
    vest_months: Math.max(1, Math.round(data.vest_months || 48)),
    cliff_months: Math.max(0, Math.round(data.cliff_months || 0)),
  };

  if (existingId) {
    const { error } = await supabase
      .from("equity_grants")
      .update({ ...clean, updated_at: new Date().toISOString() })
      .eq("id", existingId).eq("user_id", user.id);
    if (error) return { error: error.message };
    revalidatePath("/planning/equity");
    revalidatePath("/planning");
    return { id: existingId };
  }

  const { data: row, error } = await supabase
    .from("equity_grants")
    .insert({ ...clean, user_id: user.id })
    .select("id").single();
  if (error) return { error: error.message };
  revalidatePath("/planning/equity");
  revalidatePath("/planning");
  return { id: row?.id };
}

export async function deleteEquityGrant(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { error } = await supabase.from("equity_grants").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/planning/equity");
  revalidatePath("/planning");
  return {};
}
