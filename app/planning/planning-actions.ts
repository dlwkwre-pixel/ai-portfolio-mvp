"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// ── Types ─────────────────────────────────────────────────────────────────────

export type FinancialProfile = {
  id: string;
  user_id: string;
  current_age: number | null;
  target_retirement_age: number | null;
  risk_tolerance: string | null;
  monthly_income: number | null;
  monthly_expenses: number | null;
  updated_at: string;
};

export type BalanceSheetItem = {
  id: string;
  user_id: string;
  label: string;
  category: string;
  value: number;
  is_liability: boolean;
  sort_order: number;
};

export type CashFlowItem = {
  id: string;
  user_id: string;
  label: string;
  type: "income" | "expense";
  frequency: "monthly" | "annual";
  amount: number;
  sort_order: number;
};

export type NetWorthSnapshot = {
  id: string;
  snapshot_date: string;
  total_assets: number;
  total_liabilities: number;
  net_worth: number;
  portfolio_value: number | null;
};

// ── Profile ───────────────────────────────────────────────────────────────────

export async function upsertFinancialProfile(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const current_age = formData.get("current_age") ? Number(formData.get("current_age")) : null;
  const target_retirement_age = formData.get("target_retirement_age") ? Number(formData.get("target_retirement_age")) : null;
  const risk_tolerance = String(formData.get("risk_tolerance") || "moderate");
  const monthly_income = formData.get("monthly_income") ? Number(formData.get("monthly_income")) : null;
  const monthly_expenses = formData.get("monthly_expenses") ? Number(formData.get("monthly_expenses")) : null;

  const { error } = await supabase.from("financial_profiles").upsert(
    {
      user_id: user.id,
      current_age,
      target_retirement_age,
      risk_tolerance,
      monthly_income,
      monthly_expenses,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) return { error: error.message };
  revalidatePath("/planning");
  return {};
}

// ── Balance Sheet ─────────────────────────────────────────────────────────────

export async function addBalanceSheetItem(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const label = String(formData.get("label") || "").trim();
  if (!label) return { error: "Label is required." };

  const category = String(formData.get("category") || "other_asset");
  const value = Number(formData.get("value") || 0);
  const is_liability = category === "liability";

  const { data: existing } = await supabase
    .from("balance_sheet_items")
    .select("sort_order")
    .eq("user_id", user.id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const sort_order = (existing?.sort_order ?? -1) + 1;

  const { error } = await supabase.from("balance_sheet_items").insert({
    user_id: user.id,
    label,
    category,
    value,
    is_liability,
    sort_order,
  });

  if (error) return { error: error.message };
  revalidatePath("/planning");
  return {};
}

export async function updateBalanceSheetItem(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const id = String(formData.get("id") || "");
  const label = String(formData.get("label") || "").trim();
  if (!id || !label) return { error: "ID and label are required." };

  const category = String(formData.get("category") || "other_asset");
  const value = Number(formData.get("value") || 0);
  const is_liability = category === "liability";

  const { error } = await supabase
    .from("balance_sheet_items")
    .update({ label, category, value, is_liability, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/planning");
  return {};
}

export async function deleteBalanceSheetItem(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { error } = await supabase
    .from("balance_sheet_items")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/planning");
  return {};
}

// ── Cash Flow ─────────────────────────────────────────────────────────────────

export async function addCashFlowItem(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const label = String(formData.get("label") || "").trim();
  if (!label) return { error: "Label is required." };

  const type = String(formData.get("type") || "expense") as "income" | "expense";
  const frequency = String(formData.get("frequency") || "monthly") as "monthly" | "annual";
  const amount = Number(formData.get("amount") || 0);

  const { data: existing } = await supabase
    .from("cash_flow_items")
    .select("sort_order")
    .eq("user_id", user.id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const sort_order = (existing?.sort_order ?? -1) + 1;

  const { error } = await supabase.from("cash_flow_items").insert({
    user_id: user.id,
    label,
    type,
    frequency,
    amount,
    sort_order,
  });

  if (error) return { error: error.message };
  revalidatePath("/planning");
  return {};
}

export async function updateCashFlowItem(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const id = String(formData.get("id") || "");
  const label = String(formData.get("label") || "").trim();
  if (!id || !label) return { error: "ID and label are required." };

  const type = String(formData.get("type") || "expense") as "income" | "expense";
  const frequency = String(formData.get("frequency") || "monthly") as "monthly" | "annual";
  const amount = Number(formData.get("amount") || 0);

  const { error } = await supabase
    .from("cash_flow_items")
    .update({ label, type, frequency, amount, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/planning");
  return {};
}

export async function deleteCashFlowItem(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { error } = await supabase
    .from("cash_flow_items")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/planning");
  return {};
}

// ── Net Worth Snapshot ────────────────────────────────────────────────────────

export async function saveNetWorthSnapshot(
  totalAssets: number,
  totalLiabilities: number,
  portfolioValue: number | null
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const netWorth = totalAssets - totalLiabilities;
  const today = new Date().toISOString().split("T")[0];

  const { error } = await supabase.from("net_worth_history").upsert(
    {
      user_id: user.id,
      snapshot_date: today,
      total_assets: totalAssets,
      total_liabilities: totalLiabilities,
      net_worth: netWorth,
      portfolio_value: portfolioValue,
    },
    { onConflict: "user_id,snapshot_date" }
  );

  if (error) return { error: error.message };
  return {};
}
