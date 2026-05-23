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
  partner_name: string | null;
  partner_age: number | null;
  partner_target_retirement_age: number | null;
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
  const partner_name = String(formData.get("partner_name") || "").trim() || null;
  const partner_age = formData.get("partner_age") ? Number(formData.get("partner_age")) : null;
  const partner_target_retirement_age = formData.get("partner_target_retirement_age") ? Number(formData.get("partner_target_retirement_age")) : null;

  const { error } = await supabase.from("financial_profiles").upsert(
    {
      user_id: user.id,
      current_age,
      target_retirement_age,
      risk_tolerance,
      monthly_income,
      monthly_expenses,
      partner_name,
      partner_age,
      partner_target_retirement_age,
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
  const LIABILITY_CATS = new Set(["mortgage", "auto_loan", "student_loan", "credit_card", "personal_loan", "other_liability", "liability"]);
  const is_liability = LIABILITY_CATS.has(category);

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
  const LIABILITY_CATS = new Set(["mortgage", "auto_loan", "student_loan", "credit_card", "personal_loan", "other_liability", "liability"]);
  const is_liability = LIABILITY_CATS.has(category);

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

// ── Planning Assumptions ──────────────────────────────────────────────────────

export type PlanningAssumptions = {
  id: string;
  user_id: string;
  return_rate: number;
  inflation_rate: number;
  salary_growth_rate: number;
  updated_at: string;
};

export async function upsertPlanningAssumptions(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const return_rate = Number(formData.get("return_rate") ?? 7) / 100;
  const inflation_rate = Number(formData.get("inflation_rate") ?? 3) / 100;
  const salary_growth_rate = Number(formData.get("salary_growth_rate") ?? 2) / 100;

  const { error } = await supabase.from("planning_assumptions").upsert(
    { user_id: user.id, return_rate, inflation_rate, salary_growth_rate, updated_at: new Date().toISOString() },
    { onConflict: "user_id" }
  );

  if (error) return { error: error.message };
  revalidatePath("/planning");
  return {};
}

// ── Future Events ─────────────────────────────────────────────────────────────

export type FutureEvent = {
  id: string;
  user_id: string;
  label: string;
  event_year: number;
  amount_impact: number;
  category: string;
  sort_order: number;
};

export async function addFutureEvent(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const label = String(formData.get("label") || "").trim();
  if (!label) return { error: "Label is required." };

  const event_year = Number(formData.get("event_year") || new Date().getFullYear());
  const amount_impact = Number(formData.get("amount_impact") || 0);
  const category = String(formData.get("category") || "other");

  const { data: existing } = await supabase
    .from("planning_future_events")
    .select("sort_order")
    .eq("user_id", user.id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const sort_order = (existing?.sort_order ?? -1) + 1;

  const { error } = await supabase.from("planning_future_events").insert({
    user_id: user.id, label, event_year, amount_impact, category, sort_order,
  });

  if (error) return { error: error.message };
  revalidatePath("/planning");
  return {};
}

export async function deleteFutureEvent(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { error } = await supabase
    .from("planning_future_events")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/planning");
  return {};
}

// ── Expense Actuals ───────────────────────────────────────────────────────────

export type ExpenseActual = {
  id: string;
  user_id: string;
  cash_flow_item_id: string | null;
  label: string;
  period_year: number;
  period_month: number;
  actual_amount: number;
  notes: string | null;
  created_at: string;
};

export async function logExpenseActual(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const cash_flow_item_id = String(formData.get("cash_flow_item_id") || "").trim() || null;
  const label = String(formData.get("label") || "").trim();
  if (!label) return { error: "Label is required." };

  const period_year = Number(formData.get("period_year") || new Date().getFullYear());
  const period_month = Number(formData.get("period_month") || new Date().getMonth() + 1);
  const actual_amount = Number(formData.get("actual_amount") || 0);
  const notes = String(formData.get("notes") || "").trim() || null;

  const { error } = await supabase.from("expense_actuals").upsert(
    { user_id: user.id, cash_flow_item_id, label, period_year, period_month, actual_amount, notes, updated_at: new Date().toISOString() },
    { onConflict: "user_id,cash_flow_item_id,period_year,period_month" }
  );

  if (error) return { error: error.message };
  revalidatePath("/planning");
  return {};
}

export async function deleteExpenseActual(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { error } = await supabase
    .from("expense_actuals")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/planning");
  return {};
}

// When 3+ months of actuals exist for a cash_flow_item, compute rolling average
// and update the forecasted amount to reflect learned spending behavior.
export async function syncForecastToActuals(cash_flow_item_id: string): Promise<{ error?: string; newAmount?: number }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: actuals } = await supabase
    .from("expense_actuals")
    .select("actual_amount, period_year, period_month")
    .eq("user_id", user.id)
    .eq("cash_flow_item_id", cash_flow_item_id)
    .order("period_year", { ascending: false })
    .order("period_month", { ascending: false })
    .limit(6);

  if (!actuals || actuals.length < 3) return { error: "Need at least 3 months of actuals to sync." };

  const avg = actuals.slice(0, 3).reduce((sum, r) => sum + Number(r.actual_amount), 0) / 3;
  const rounded = Math.round(avg * 100) / 100;

  const { error } = await supabase
    .from("cash_flow_items")
    .update({ amount: rounded, updated_at: new Date().toISOString() })
    .eq("id", cash_flow_item_id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/planning");
  return { newAmount: rounded };
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
