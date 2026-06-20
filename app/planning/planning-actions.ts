"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ProfileKid = { name: string; age: number };

export type FinancialProfile = {
  id: string;
  user_id: string;
  date_of_birth: string | null;
  current_age: number | null;
  target_retirement_age: number | null;
  risk_tolerance: string | null;
  gross_monthly_income: number | null;
  pre_tax_deductions_annual: number | null;
  net_monthly_override: number | null;
  monthly_expenses: number | null;
  filing_status: string | null;
  state_code: string | null;
  income_type: string | null;
  partner_name: string | null;
  partner_age: number | null;
  partner_target_retirement_age: number | null;
  kids_json: ProfileKid[];
  updated_at: string;
  // Home owner-mover mode
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

export type BalanceSheetItem = {
  id: string;
  user_id: string;
  label: string;
  category: string;
  value: number;
  is_liability: boolean;
  sort_order: number;
};

// Recurring cadences. weekly/biweekly/semimonthly support real pay cycles;
// quarterly rounds out the set. Stored as text; normalized via toMonthly().
export type CashFlowFrequency =
  | "weekly" | "biweekly" | "semimonthly" | "monthly" | "quarterly" | "annual";

const CASH_FLOW_FREQUENCIES: CashFlowFrequency[] = [
  "weekly", "biweekly", "semimonthly", "monthly", "quarterly", "annual",
];

function normalizeFrequency(v: unknown): CashFlowFrequency {
  return (CASH_FLOW_FREQUENCIES as string[]).includes(String(v)) ? (v as CashFlowFrequency) : "monthly";
}

export type CashFlowItem = {
  id: string;
  user_id: string;
  label: string;
  type: "income" | "expense";
  frequency: CashFlowFrequency;
  amount: number;
  due_day: number | null;
  sort_order: number;
  category: string | null; // user-assigned; null = infer from label
  is_variable?: boolean;    // income that fluctuates (freelance/commission)
};

export type NetWorthSnapshot = {
  id: string;
  snapshot_date: string;
  total_assets: number;
  total_liabilities: number;
  net_worth: number;
  portfolio_value: number | null;
};

export type BudgetHistoryEntry = {
  id: string;
  user_id: string;
  item_id: string;
  amount: number;
  frequency: CashFlowFrequency;
  effective_year: number;
  effective_month: number;
  created_at: string;
};

// ── Profile ───────────────────────────────────────────────────────────────────

export async function upsertFinancialProfile(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const date_of_birth = formData.get("date_of_birth") ? String(formData.get("date_of_birth")) : null;
  const target_retirement_age = formData.get("target_retirement_age") ? Number(formData.get("target_retirement_age")) : null;
  const risk_tolerance = String(formData.get("risk_tolerance") || "moderate");
  const gross_monthly_income = formData.get("gross_monthly_income") ? Number(formData.get("gross_monthly_income")) : null;
  const pre_tax_deductions_annual = formData.get("pre_tax_deductions_annual") ? Number(formData.get("pre_tax_deductions_annual")) : 0;
  const net_monthly_override_raw = String(formData.get("net_monthly_override") ?? "").trim();
  const net_monthly_override = net_monthly_override_raw !== "" ? Number(net_monthly_override_raw) : null;
  const monthly_expenses = formData.get("monthly_expenses") ? Number(formData.get("monthly_expenses")) : null;
  const filing_status = String(formData.get("filing_status") || "single");
  const state_code = String(formData.get("state_code") || "").trim() || null;
  const income_type = String(formData.get("income_type") || "w2");
  const partner_name = String(formData.get("partner_name") || "").trim() || null;
  const partner_age = formData.get("partner_age") ? Number(formData.get("partner_age")) : null;
  const partner_target_retirement_age = formData.get("partner_target_retirement_age") ? Number(formData.get("partner_target_retirement_age")) : null;
  let kids_json: { name: string; age: number }[] = [];
  try { kids_json = JSON.parse(String(formData.get("kids_json") || "[]")); } catch {}

  const { error } = await supabase.from("financial_profiles").upsert(
    {
      user_id: user.id,
      date_of_birth,
      target_retirement_age,
      risk_tolerance,
      gross_monthly_income,
      pre_tax_deductions_annual,
      net_monthly_override,
      monthly_expenses,
      filing_status,
      state_code,
      income_type,
      partner_name,
      partner_age,
      partner_target_retirement_age,
      kids_json,
      updated_at: new Date().toISOString(),
      // Preserve owner fields — not managed by this form
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
  const frequency = normalizeFrequency(formData.get("frequency"));
  const amount = Number(formData.get("amount") || 0);
  const dueDayRaw = String(formData.get("due_day") ?? "").trim();
  const due_day = dueDayRaw !== "" ? Math.min(31, Math.max(1, Number(dueDayRaw))) : null;
  const categoryRaw = String(formData.get("category") ?? "").trim();
  const category = categoryRaw !== "" ? categoryRaw : null;
  const is_variable = formData.get("is_variable") === "1" || formData.get("is_variable") === "true";

  const { data: existing } = await supabase
    .from("cash_flow_items")
    .select("sort_order")
    .eq("user_id", user.id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const sort_order = (existing?.sort_order ?? -1) + 1;

  const { data: newItem, error } = await supabase.from("cash_flow_items").insert({
    user_id: user.id,
    label,
    type,
    frequency,
    amount,
    due_day,
    sort_order,
    category,
    is_variable,
  }).select("id").single();

  if (error) return { error: error.message };

  if (newItem) {
    await supabase.from("cash_flow_budget_history").insert({
      user_id: user.id,
      item_id: newItem.id,
      amount,
      frequency,
      effective_year: 2000,
      effective_month: 1,
    });
  }

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
  const frequency = normalizeFrequency(formData.get("frequency"));
  const amount = Number(formData.get("amount") || 0);
  const dueDayRawU = String(formData.get("due_day") ?? "").trim();
  const due_day = dueDayRawU !== "" ? Math.min(31, Math.max(1, Number(dueDayRawU))) : null;
  // category: present + non-empty sets it; the literal "__auto__" clears it back to inference
  const hasCategory = formData.has("category");
  const categoryRawU = String(formData.get("category") ?? "").trim();
  const categoryUpdate: { category?: string | null } = hasCategory
    ? { category: categoryRawU === "" || categoryRawU === "__auto__" ? null : categoryRawU }
    : {};
  const variableUpdate: { is_variable?: boolean } = formData.has("is_variable")
    ? { is_variable: formData.get("is_variable") === "1" || formData.get("is_variable") === "true" }
    : {};

  const { data: currentItem } = await supabase
    .from("cash_flow_items")
    .select("amount, frequency")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  const { error } = await supabase
    .from("cash_flow_items")
    .update({ label, type, frequency, amount, due_day, ...categoryUpdate, ...variableUpdate, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  const { data: existingHistory } = await supabase
    .from("cash_flow_budget_history")
    .select("id")
    .eq("item_id", id)
    .limit(1)
    .maybeSingle();

  if (!existingHistory && currentItem) {
    await supabase.from("cash_flow_budget_history").insert({
      user_id: user.id,
      item_id: id,
      amount: Number(currentItem.amount),
      frequency: normalizeFrequency(currentItem.frequency),
      effective_year: 2000,
      effective_month: 1,
    });
  }

  const editDate = new Date();
  await supabase.from("cash_flow_budget_history").upsert(
    {
      user_id: user.id,
      item_id: id,
      amount,
      frequency,
      effective_year: editDate.getFullYear(),
      effective_month: editDate.getMonth() + 1,
    },
    { onConflict: "item_id,effective_year,effective_month" }
  );

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

// One-click re-categorize. Pass null/"__auto__" to clear back to label inference.
export async function setCashFlowItemCategory(id: string, category: string | null): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const value = !category || category === "__auto__" ? null : category;
  const { error } = await supabase
    .from("cash_flow_items")
    .update({ category: value, updated_at: new Date().toISOString() })
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
  recurring_annual?: number | null;  // signed $/yr applied event_year..end_year
  end_year?: number | null;          // last year the recurring stream applies (null = horizon)
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
  // Optional recurring stream (requires planning-future-events-recurring.sql).
  const recurringRaw = formData.get("recurring_annual");
  const endYearRaw = formData.get("end_year");
  const recurring_annual = recurringRaw != null && String(recurringRaw).trim() !== "" ? Number(recurringRaw) : null;
  const end_year = endYearRaw != null && String(endYearRaw).trim() !== "" ? Number(endYearRaw) : null;

  const { data: existing } = await supabase
    .from("planning_future_events")
    .select("sort_order")
    .eq("user_id", user.id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const sort_order = (existing?.sort_order ?? -1) + 1;

  // Only include recurring columns when actually used, so one-time events keep
  // working even before the recurring migration is applied.
  const row: Record<string, unknown> = { user_id: user.id, label, event_year, amount_impact, category, sort_order };
  if (recurring_annual != null) { row.recurring_annual = recurring_annual; row.end_year = end_year; }

  const { error } = await supabase.from("planning_future_events").insert(row);

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

export type ActualBreakdownItem = { label: string; amount: number };

export type ExpenseActual = {
  id: string;
  user_id: string;
  cash_flow_item_id: string | null;
  label: string;
  period_year: number;
  period_month: number;
  actual_amount: number;
  notes: string | null;
  breakdown: ActualBreakdownItem[] | null;
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
  let breakdown: ActualBreakdownItem[] | null = null;
  const breakdownRaw = formData.get("breakdown");
  if (breakdownRaw) {
    try { breakdown = JSON.parse(String(breakdownRaw)); } catch { /* ignore malformed */ }
  }

  const { error } = await supabase.from("expense_actuals").upsert(
    { user_id: user.id, cash_flow_item_id, label, period_year, period_month, actual_amount, notes, breakdown, updated_at: new Date().toISOString() },
    { onConflict: "user_id,cash_flow_item_id,period_year,period_month" }
  );

  if (error) return { error: error.message };
  revalidatePath("/planning");
  return {};
}

export async function moveMerchantActual(
  sourceItemId: string,
  destItemId: string,
  merchantLabel: string,
  merchantAmount: number,
  periodYear: number,
  periodMonth: number,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: src } = await supabase
    .from("expense_actuals")
    .select("*")
    .eq("user_id", user.id)
    .eq("cash_flow_item_id", sourceItemId)
    .eq("period_year", periodYear)
    .eq("period_month", periodMonth)
    .maybeSingle();

  if (!src) return { error: "Source actual not found." };

  // Remove first matching merchant from source breakdown
  let removed = false;
  const newSrcBreakdown = ((src.breakdown ?? []) as ActualBreakdownItem[]).filter((m) => {
    if (!removed && m.label === merchantLabel && Math.abs(m.amount - merchantAmount) < 0.01) {
      removed = true;
      return false;
    }
    return true;
  });
  const newSrcAmount = Math.max(0, (src.actual_amount ?? 0) - merchantAmount);

  const { error: srcErr } = await supabase
    .from("expense_actuals")
    .update({ actual_amount: newSrcAmount, breakdown: newSrcBreakdown.length > 0 ? newSrcBreakdown : null, updated_at: new Date().toISOString() })
    .eq("id", src.id)
    .eq("user_id", user.id);

  if (srcErr) return { error: srcErr.message };

  const { data: dest } = await supabase
    .from("expense_actuals")
    .select("*")
    .eq("user_id", user.id)
    .eq("cash_flow_item_id", destItemId)
    .eq("period_year", periodYear)
    .eq("period_month", periodMonth)
    .maybeSingle();

  const newDestBreakdown: ActualBreakdownItem[] = [
    ...((dest?.breakdown ?? []) as ActualBreakdownItem[]),
    { label: merchantLabel, amount: merchantAmount },
  ];
  const newDestAmount = (dest?.actual_amount ?? 0) + merchantAmount;

  const { error: destErr } = await supabase
    .from("expense_actuals")
    .upsert(
      { user_id: user.id, cash_flow_item_id: destItemId, label: dest?.label ?? merchantLabel, period_year: periodYear, period_month: periodMonth, actual_amount: newDestAmount, breakdown: newDestBreakdown, notes: dest?.notes ?? null, updated_at: new Date().toISOString() },
      { onConflict: "user_id,cash_flow_item_id,period_year,period_month" }
    );

  if (destErr) return { error: destErr.message };
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

// ── Estate Profile ────────────────────────────────────────────────────────────

export type EstateBeneficiary = {
  id: string;
  name: string;
  relationship: string;
  allocation_pct: number;
  notes: string;
};

export type EstateAccount = {
  id: string;
  institution: string;
  account_type: string;
  contact: string;
  notes: string;
};

export type EstateProfile = {
  id: string;
  user_id: string;
  doc_will: string;
  doc_living_trust: string;
  doc_durable_poa: string;
  doc_healthcare_directive: string;
  doc_beneficiary_desig: string;
  doc_digital_assets: string;
  executor_name: string | null;
  executor_phone: string | null;
  executor_email: string | null;
  attorney_name: string | null;
  attorney_phone: string | null;
  attorney_email: string | null;
  healthcare_proxy_name: string | null;
  healthcare_proxy_phone: string | null;
  beneficiaries: EstateBeneficiary[];
  estate_accounts: EstateAccount[];
  family_instructions: string | null;
  notes: string | null;
  last_reviewed_at: string | null;
  updated_at: string;
};

export async function upsertEstateProfile(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const str = (key: string) => String(formData.get(key) || "").trim() || null;

  const { error } = await supabase.from("estate_profiles").upsert(
    {
      user_id: user.id,
      doc_will:                 String(formData.get("doc_will") || "none"),
      doc_living_trust:         String(formData.get("doc_living_trust") || "none"),
      doc_durable_poa:          String(formData.get("doc_durable_poa") || "none"),
      doc_healthcare_directive: String(formData.get("doc_healthcare_directive") || "none"),
      doc_beneficiary_desig:    String(formData.get("doc_beneficiary_desig") || "none"),
      doc_digital_assets:       String(formData.get("doc_digital_assets") || "none"),
      executor_name:            str("executor_name"),
      executor_phone:           str("executor_phone"),
      executor_email:           str("executor_email"),
      attorney_name:            str("attorney_name"),
      attorney_phone:           str("attorney_phone"),
      attorney_email:           str("attorney_email"),
      healthcare_proxy_name:    str("healthcare_proxy_name"),
      healthcare_proxy_phone:   str("healthcare_proxy_phone"),
      family_instructions:      str("family_instructions"),
      notes:                    str("notes"),
      last_reviewed_at:         str("last_reviewed_at"),
      updated_at:               new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) return { error: error.message };
  revalidatePath("/planning");
  return {};
}

export async function upsertEstateBeneficiaries(
  beneficiaries: EstateBeneficiary[]
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { error } = await supabase.from("estate_profiles").upsert(
    { user_id: user.id, beneficiaries, updated_at: new Date().toISOString() },
    { onConflict: "user_id" }
  );

  if (error) return { error: error.message };
  revalidatePath("/planning");
  return {};
}

export async function upsertEstateAccounts(
  accounts: EstateAccount[]
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { error } = await supabase.from("estate_profiles").upsert(
    { user_id: user.id, estate_accounts: accounts, updated_at: new Date().toISOString() },
    { onConflict: "user_id" }
  );

  if (error) return { error: error.message };
  revalidatePath("/planning");
  return {};
}

export async function upsertFamilyInstructions(
  text: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { error } = await supabase.from("estate_profiles").upsert(
    { user_id: user.id, family_instructions: text, updated_at: new Date().toISOString() },
    { onConflict: "user_id" }
  );

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

export async function trimNetWorthHistoryBefore(
  beforeDate: string
): Promise<{ deleted: number; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { deleted: 0, error: "Not authenticated." };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(beforeDate)) return { deleted: 0, error: "Invalid date format." };

  const { data, error } = await supabase
    .from("net_worth_history")
    .delete()
    .eq("user_id", user.id)
    .lt("snapshot_date", beforeDate)
    .select("id");

  if (error) return { deleted: 0, error: error.message };
  revalidatePath("/planning");
  return { deleted: (data ?? []).length };
}
