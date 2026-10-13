"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { awardXp, dailyKey } from "@/lib/gamification/xp";
import { closestOccurrenceTo, fromDateOnly, toDateOnly } from "@/lib/planning/cash-flow-forecast";
import { merchantKey, NEW_PAYCHECK_BUCKET, type TxnKind } from "@/lib/planning/transactions";
import { EXPENSE_CATEGORIES } from "@/lib/planning/expense-categories";
import { dismissPlaidTransaction } from "@/lib/connections/plaid";

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
  // 401(k) / workplace retirement plan (only populated on the main /planning profile load)
  has_401k?: boolean;
  k401_contribution_pct?: number | null;
  k401_is_roth?: boolean;
  k401_employer_match_pct?: number | null;
  k401_employer_match_limit_pct?: number | null;
  k401_current_balance?: number | null;
  pay_frequency?: string | null; // weekly | biweekly | semimonthly | monthly
  emergency_fund_months?: number | null; // 6 | 9 | 12
  surplus_to_invest_pct?: number | null; // 0-100, see updateSurplusAllocation
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
  tax_treatment?: TaxTreatment | null; // taxable | tax_deferred | tax_free; null = n/a (illiquid)
};

export type TaxTreatment = "taxable" | "tax_deferred" | "tax_free";

// Default tax bucket inferred from an asset category when the user hasn't set one.
// Liquid/investable categories get a sensible default; everything else is null (n/a).
// Not exported — "use server" files may only export async functions.
function inferTaxTreatment(category: string): TaxTreatment | null {
  if (category === "cash" || category === "investment") return "taxable";
  if (category === "retirement") return "tax_deferred"; // most common; user can switch to Roth
  return null;
}

function parseTaxTreatment(formData: FormData, category: string): TaxTreatment | null {
  const raw = String(formData.get("tax_treatment") ?? "").trim();
  if (raw === "taxable" || raw === "tax_deferred" || raw === "tax_free") return raw;
  if (raw === "" || raw === "__auto__") return inferTaxTreatment(category);
  return inferTaxTreatment(category);
}

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
  due_day_2: number | null; // second due date for semimonthly items (e.g. paycheck 15th + last day)
  sort_order: number;
  category: string | null; // user-assigned; null = infer from label
  is_variable?: boolean;    // income that fluctuates (freelance/commission)
  last_paid_for_date: string | null; // specific due-date occurrence ('YYYY-MM-DD') last satisfied — see lib/planning/cash-flow-forecast.ts
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
  const PAY_FREQUENCIES = ["weekly", "biweekly", "semimonthly", "monthly"];
  const pay_frequency_raw = String(formData.get("pay_frequency") || "").trim();
  const pay_frequency = PAY_FREQUENCIES.includes(pay_frequency_raw) ? pay_frequency_raw : "biweekly";
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
      pay_frequency,
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
  // XP: one-time award once the core profile is filled (income + birthdate).
  if (gross_monthly_income && date_of_birth) void awardXp(user.id, "profile_complete");
  revalidatePath("/planning");
  return {};
}

// 401(k) settings — saved independently of the main profile form so the user can tweak
// their deferral % without re-entering everything. The Traditional employee contribution
// flows into the pre-tax-deduction pipeline (estimator.ts), so take-home and tax estimates
// update automatically across planning and the tax page.
export async function upsert401kSettings(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const has_401k = String(formData.get("has_401k") ?? "") === "true";
  const num = (k: string): number => {
    const v = Number(formData.get(k));
    return Number.isFinite(v) && v >= 0 ? v : 0;
  };
  const k401_contribution_pct = Math.min(100, num("k401_contribution_pct"));
  const k401_is_roth = String(formData.get("k401_is_roth") ?? "") === "true";
  const k401_employer_match_pct = num("k401_employer_match_pct");
  const k401_employer_match_limit_pct = Math.min(100, num("k401_employer_match_limit_pct"));
  const balanceRaw = String(formData.get("k401_current_balance") ?? "").trim();
  const k401_current_balance = balanceRaw !== "" && Number.isFinite(Number(balanceRaw)) ? Number(balanceRaw) : null;
  const efRaw = Number(formData.get("emergency_fund_months"));
  const emergency_fund_months = [6, 9, 12].includes(efRaw) ? efRaw : 6;

  const { error } = await supabase.from("financial_profiles").upsert(
    {
      user_id: user.id,
      has_401k,
      k401_contribution_pct,
      k401_is_roth,
      k401_employer_match_pct,
      k401_employer_match_limit_pct,
      k401_current_balance,
      emergency_fund_months,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) return { error: error.message };

  // Reflect the 401(k) balance in net worth by managing a single "401(k)" balance-sheet item
  // (category retirement → tax-deferred, or tax-free for Roth). This flows through every
  // net-worth / tax-bucket calculation that already exists, with no double-counting: the
  // planner owns this one item. Growth is projected separately in the forecast.
  try {
    const { data: existing } = await supabase
      .from("balance_sheet_items")
      .select("id, value")
      .eq("user_id", user.id)
      .eq("label", "401(k)")
      .maybeSingle();

    if (has_401k && k401_current_balance != null && k401_current_balance > 0) {
      const tax_treatment = k401_is_roth ? "tax_free" : "tax_deferred";
      if (existing) {
        await supabase.from("balance_sheet_items")
          .update({ value: k401_current_balance, tax_treatment, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
        // This panel is a THIRD write path for the "401(k)" item, bypassing
        // updateBalanceSheetItem entirely — it needs its own copy of the
        // changed-value-only history logic, or this item would never accumulate
        // history from its normal edit path.
        if (existing.value !== k401_current_balance) {
          await supabase.from("balance_sheet_item_history").insert({ user_id: user.id, item_id: existing.id, value: k401_current_balance });
        }
      } else {
        const { data: inserted } = await supabase.from("balance_sheet_items").insert({
          user_id: user.id,
          label: "401(k)",
          category: "retirement",
          value: k401_current_balance,
          is_liability: false,
          tax_treatment,
        }).select("id").single();
        if (inserted) {
          await supabase.from("balance_sheet_item_history").insert({ user_id: user.id, item_id: inserted.id, value: k401_current_balance });
        }
      }
    } else if (existing) {
      // No 401(k) (or zero balance) → remove the managed item so net worth stays accurate.
      // ON DELETE CASCADE on balance_sheet_item_history.item_id cleans up its history too.
      await supabase.from("balance_sheet_items").delete().eq("id", existing.id);
    }
  } catch { /* non-fatal: 401(k) settings still saved even if the balance-sheet sync fails */ }

  revalidatePath("/planning");
  revalidatePath("/tax");
  return {};
}

// Narrow update for the "Available to Invest" emergency-fund split, settable from
// the Cash Flow tab. Deliberately does NOT reuse upsert401kSettings — that does a
// full-field upsert reconstructed from FormData, and calling it from a form that
// doesn't carry has_401k/k401_* would silently zero those out. Postgres's
// ON CONFLICT DO UPDATE only touches the columns listed here, so this is safe to
// call independently of the 401(k) settings on the same profile row.
export async function updateSurplusAllocation(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const update: Record<string, unknown> = { user_id: user.id, updated_at: new Date().toISOString() };

  if (formData.has("emergency_fund_months")) {
    const efRaw = Number(formData.get("emergency_fund_months"));
    update.emergency_fund_months = [6, 9, 12].includes(efRaw) ? efRaw : 6;
  }
  if (formData.has("surplus_to_invest_pct")) {
    const pctRaw = Number(formData.get("surplus_to_invest_pct"));
    update.surplus_to_invest_pct = Number.isFinite(pctRaw) ? Math.min(100, Math.max(0, pctRaw)) : 50;
  }

  const { error } = await supabase.from("financial_profiles").upsert(update, { onConflict: "user_id" });
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

  const row: Record<string, unknown> = { user_id: user.id, label, category, value, is_liability, sort_order };
  // Tax treatment only written for assets, and only when the form opts in — so
  // saves still work before balance-sheet-tax-treatment.sql is run.
  if (!is_liability && formData.has("tax_treatment")) {
    row.tax_treatment = parseTaxTreatment(formData, category);
  }

  const { data: inserted, error } = await supabase.from("balance_sheet_items").insert(row).select("id").single();

  if (error) return { error: error.message };
  // Baseline history row so "vs. 1 month ago" has something to compare against once
  // enough time has passed — non-fatal: the item itself is already saved either way.
  if (inserted) {
    await supabase.from("balance_sheet_item_history").insert({ user_id: user.id, item_id: inserted.id, value });
  }
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

  // Fetch the pre-update value so history only gets a new row when the value actually
  // changed — a label-only edit shouldn't clutter the trail with a duplicate-value row.
  const { data: before } = await supabase.from("balance_sheet_items").select("value").eq("id", id).eq("user_id", user.id).maybeSingle();

  const patch: Record<string, unknown> = { label, category, value, is_liability, updated_at: new Date().toISOString() };
  if (formData.has("tax_treatment")) {
    patch.tax_treatment = is_liability ? null : parseTaxTreatment(formData, category);
  }

  const { error } = await supabase
    .from("balance_sheet_items")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  if (before && before.value !== value) {
    await supabase.from("balance_sheet_item_history").insert({ user_id: user.id, item_id: id, value });
  }

  // Keep the 401(k) planner in sync: editing the managed "401(k)" balance-sheet item here
  // writes the new value straight back to the profile, so both views stay linked.
  if (label === "401(k)") {
    await supabase.from("financial_profiles")
      .update({ k401_current_balance: value, updated_at: new Date().toISOString() })
      .eq("user_id", user.id);
  }

  revalidatePath("/planning");
  return {};
}

export async function deleteBalanceSheetItem(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  // If this is the managed "401(k)" item, also clear its balance + enrollment on the profile
  // so the planner and balance sheet stay in sync (no orphaned balance / re-created item).
  const { data: item } = await supabase
    .from("balance_sheet_items")
    .select("label")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  const { error } = await supabase
    .from("balance_sheet_items")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  if (item?.label === "401(k)") {
    await supabase.from("financial_profiles")
      .update({ k401_current_balance: null, updated_at: new Date().toISOString() })
      .eq("user_id", user.id);
  }

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
  // due_day_2 only means anything for semimonthly items (e.g. paycheck 15th + last day).
  const dueDay2Raw = String(formData.get("due_day_2") ?? "").trim();
  const due_day_2 = frequency === "semimonthly" && dueDay2Raw !== "" ? Math.min(31, Math.max(1, Number(dueDay2Raw))) : null;
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
    due_day_2,
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
  // due_day_2 only means anything for semimonthly items — clear it whenever the
  // submitted frequency isn't semimonthly, so switching away and back later
  // doesn't resurrect a stale second date.
  const dueDay2RawU = String(formData.get("due_day_2") ?? "").trim();
  const due_day_2 = frequency === "semimonthly" && dueDay2RawU !== "" ? Math.min(31, Math.max(1, Number(dueDay2RawU))) : null;
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
    .update({ label, type, frequency, amount, due_day, due_day_2, ...categoryUpdate, ...variableUpdate, updated_at: new Date().toISOString() })
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

// Marks a recurring expense's current/upcoming due-date occurrence as paid, for
// "Available to Invest" (lib/planning/cash-flow-forecast.ts). Stores the specific
// occurrence satisfied — not the day clicked — so the item correctly flips back to
// "owed" once its next cycle rolls around, whether this was clicked a few days
// early, on the due date, or a few days late. todayLocalISO is the CLIENT's local
// 'YYYY-MM-DD' (not a server-side `new Date()`, which can be a day off in UTC for
// users west of it) — same convention as the forecast module's date helpers.
export async function markCashFlowItemPaid(id: string, todayLocalISO: string): Promise<{ error?: string; paidForDate?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: item, error: fetchError } = await supabase
    .from("cash_flow_items")
    .select("frequency, due_day, due_day_2")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (fetchError) return { error: fetchError.message };
  if (!item) return { error: "Item not found." };

  const occurrence = closestOccurrenceTo(item, fromDateOnly(todayLocalISO));
  if (!occurrence) return { error: "This item has no due date set." };
  const paidForDate = toDateOnly(occurrence);

  const { error } = await supabase
    .from("cash_flow_items")
    .update({ last_paid_for_date: paidForDate, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/planning");
  return { paidForDate };
}

// Undo — marks the item as owed again regardless of its last-paid occurrence.
export async function clearCashFlowItemPaid(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { error } = await supabase
    .from("cash_flow_items")
    .update({ last_paid_for_date: null, updated_at: new Date().toISOString() })
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
  social_security_monthly?: number | null;   // estimated monthly benefit (today's $)
  social_security_claim_age?: number | null;  // age benefits start
  updated_at: string;
};

export async function upsertPlanningAssumptions(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const return_rate = Number(formData.get("return_rate") ?? 7) / 100;
  const inflation_rate = Number(formData.get("inflation_rate") ?? 3) / 100;
  const salary_growth_rate = Number(formData.get("salary_growth_rate") ?? 2) / 100;

  const row: Record<string, unknown> = { user_id: user.id, return_rate, inflation_rate, salary_growth_rate, updated_at: new Date().toISOString() };
  // Optional retirement income (requires planning-assumptions-retirement-income.sql).
  // Only included when the form provides them, so other saves work pre-migration.
  const ssRaw = formData.get("social_security_monthly");
  const claimRaw = formData.get("social_security_claim_age");
  if (ssRaw != null) row.social_security_monthly = Number(ssRaw) || 0;
  if (claimRaw != null && String(claimRaw).trim() !== "") row.social_security_claim_age = Number(claimRaw) || null;

  const { error } = await supabase.from("planning_assumptions").upsert(
    row,
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
  included?: boolean;                 // true = Committed (counts in forecast); false = Considering (draft)
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
  // "Preview first" adds the event as Considering (excluded from the forecast) so the
  // user can toggle its pin on the trajectory and watch the impact live before committing.
  if (String(formData.get("included") ?? "") === "false") row.included = false;
  // New events start as "Considering" (draft) so adding a plan never silently
  // moves the retirement number. Callers can pass included="true" to commit now.
  row.included = String(formData.get("included") ?? "") === "true";

  const { error } = await supabase.from("planning_future_events").insert(row);

  if (error) return { error: error.message };
  revalidatePath("/planning");
  return {};
}

// Move an event to a different year (trajectory-chart pin drag, written on release).
export async function updateFutureEventYear(id: string, event_year: number): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const yr = Math.round(event_year);
  if (!Number.isFinite(yr) || yr < 2000 || yr > 2200) return { error: "Invalid year." };

  const { error } = await supabase
    .from("planning_future_events")
    .update({ event_year: yr })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/planning");
  return {};
}

// Flip an event between Committed (counts in the forecast) and Considering (draft).
export async function setFutureEventIncluded(id: string, included: boolean): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { error } = await supabase
    .from("planning_future_events")
    .update({ included })
    .eq("id", id)
    .eq("user_id", user.id);

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
  // "transactions" = synthesized in page.tsx by summing cash_flow_transactions for this
  // item-month (id is "txn:…", not a real expense_actuals row — can't be deleted/moved as
  // a whole; edit the transactions instead). Absent/"logged" = a real expense_actuals row.
  source?: "transactions" | "logged";
  txn_count?: number;
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
  void awardXp(user.id, "budget_logged", dailyKey("budget_logged"));
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

  const { data: item } = await supabase
    .from("cash_flow_items").select("type").eq("id", cash_flow_item_id).eq("user_id", user.id).maybeSingle();
  if (!item) return { error: "Item not found." };
  const isIncome = item.type === "income";

  const [{ data: logged }, { data: txns }] = await Promise.all([
    supabase
      .from("expense_actuals")
      .select("actual_amount, period_year, period_month")
      .eq("user_id", user.id)
      .eq("cash_flow_item_id", cash_flow_item_id)
      .order("period_year", { ascending: false })
      .order("period_month", { ascending: false })
      .limit(12),
    supabase
      .from("cash_flow_transactions")
      .select("amount, period_year, period_month")
      .eq("user_id", user.id)
      .eq("cash_flow_item_id", cash_flow_item_id)
      .eq("direction", isIncome ? "in" : "out"),
  ]);

  // Same rule as page.tsx: a month's transactions win over a legacy logged total.
  const byMonth = new Map<number, number>();
  if (!isIncome) for (const r of logged ?? []) byMonth.set(r.period_year * 12 + r.period_month, Number(r.actual_amount));
  const txnMonths = new Map<number, number>();
  for (const t of txns ?? []) {
    const k = t.period_year * 12 + t.period_month;
    txnMonths.set(k, (txnMonths.get(k) ?? 0) + Number(t.amount));
  }
  for (const [k, v] of txnMonths) byMonth.set(k, v);
  // Income: a month still in progress has only some of its paychecks — leave it out so
  // it doesn't drag the "expected" average down. (Keys here are year*12 + 1-based month.)
  if (isIncome) {
    const now = new Date();
    byMonth.delete(now.getFullYear() * 12 + now.getMonth() + 1);
  }
  const actuals = Array.from(byMonth.entries()).sort((a, b) => b[0] - a[0]).map(([, v]) => v);

  if (actuals.length < 3) return { error: "Need at least 3 months of actuals to sync." };

  const avg = actuals.slice(0, 3).reduce((sum, v) => sum + v, 0) / 3;
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
// The snapshot itself is now written server-side in app/planning/page.tsx on
// every page load (reliable, matches the portfolio chart's auto-snapshot) —
// this file only keeps the trim/cleanup action.

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

// ── Cash flow transactions ────────────────────────────────────────────────────
// Transaction-level actuals (cash_flow_transactions). Each imported statement line is
// its own row, so re-importing adds rather than overwrites, and duplicates are flagged
// in review (see app/api/planning/transactions/parse) instead of silently merged.

type SaveTxnRow = {
  date: string;          // YYYY-MM-DD
  description: string;
  merchant: string;
  amount: number;        // positive
  kind: Exclude<TxnKind, "transfer">;
  bucket: string | null; // cash_flow_items.id, "new:<Expense Category>", or null = unsorted
};

const NEW_BUCKET_PREFIX = "new:";

// Turns review-table bucket values into real cash_flow_items ids the user owns. Unknown or
// foreign ids resolve to null (unsorted) rather than failing the whole import. "new:<Cat>"
// reuses an existing item literally named after the category, else creates a $0 budget
// line so the spending has somewhere to land (it shows as over budget until a target is set).
async function resolveBuckets(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  buckets: string[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const ids = buckets.filter((b) => !b.startsWith(NEW_BUCKET_PREFIX) && b !== NEW_PAYCHECK_BUCKET);
  const newCats = Array.from(new Set(buckets.filter((b) => b.startsWith(NEW_BUCKET_PREFIX)).map((b) => b.slice(NEW_BUCKET_PREFIX.length))))
    .filter((c) => EXPENSE_CATEGORIES.some((e) => e.label === c));

  const { data: items } = await supabase
    .from("cash_flow_items").select("id, label, type, sort_order").eq("user_id", userId);
  const owned = new Set((items ?? []).map((i) => i.id));
  for (const id of ids) out.set(id, owned.has(id) ? id : null);

  let sortOrder = Math.max(-1, ...(items ?? []).map((i) => i.sort_order ?? 0));
  for (const cat of newCats) {
    const existing = (items ?? []).find((i) => i.type === "expense" && i.label.toLowerCase() === cat.toLowerCase());
    if (existing) { out.set(NEW_BUCKET_PREFIX + cat, existing.id); continue; }
    const { data: created } = await supabase.from("cash_flow_items").insert({
      user_id: userId, label: cat, type: "expense", frequency: "monthly", amount: 0,
      sort_order: ++sortOrder, category: cat,
    }).select("id").single();
    if (created) {
      await supabase.from("cash_flow_budget_history").insert({
        user_id: userId, item_id: created.id, amount: 0, frequency: "monthly", effective_year: 2000, effective_month: 1,
      });
    }
    out.set(NEW_BUCKET_PREFIX + cat, created?.id ?? null);
  }

  // A $0 variable income source for people whose income lives on their profile. $0 keeps
  // effectiveIncome on the profile estimate (planning-client.tsx only switches to items when
  // they sum > 0); recorded paychecks assigned here then replace that estimate per month.
  if (buckets.includes(NEW_PAYCHECK_BUCKET)) {
    const existing = (items ?? []).find((i) => i.type === "income" && i.label.toLowerCase() === "paycheck");
    if (existing) {
      out.set(NEW_PAYCHECK_BUCKET, existing.id);
    } else {
      const { data: created } = await supabase.from("cash_flow_items").insert({
        user_id: userId, label: "Paycheck", type: "income", frequency: "monthly", amount: 0,
        sort_order: ++sortOrder, is_variable: true,
      }).select("id").single();
      if (created) {
        await supabase.from("cash_flow_budget_history").insert({
          user_id: userId, item_id: created.id, amount: 0, frequency: "monthly", effective_year: 2000, effective_month: 1,
        });
      }
      out.set(NEW_PAYCHECK_BUCKET, created?.id ?? null);
    }
  }
  return out;
}

export async function saveImportedTransactions(input: {
  rows: SaveTxnRow[];
  remember: { merchant: string; bucket: string }[];
}): Promise<{ error?: string; inserted?: number; batchId?: string; skippedSaves?: number }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const rows = (Array.isArray(input?.rows) ? input.rows : []).slice(0, 2000).filter((r) =>
    /^\d{4}-\d{2}-\d{2}$/.test(String(r.date)) && Number.isFinite(Number(r.amount)) && Number(r.amount) > 0 &&
    ["spend", "refund", "income", "save"].includes(r.kind));
  if (rows.length === 0) return { error: "Nothing to save." };

  const bucketValues = Array.from(new Set([
    ...rows.map((r) => r.bucket).filter((b): b is string => typeof b === "string" && b.length > 0),
    ...(input.remember ?? []).map((r) => r.bucket).filter((b): b is string => typeof b === "string" && b.length > 0),
  ]));
  const resolved = await resolveBuckets(supabase, user.id, bucketValues);

  const batchId = crypto.randomUUID();
  const records = rows.map((r) => {
    const amount = Math.round(Number(r.amount) * 100) / 100;
    return {
      user_id: user.id,
      txn_date: r.date,
      period_year: Number(r.date.slice(0, 4)),
      period_month: Number(r.date.slice(5, 7)),
      description: String(r.description ?? "").slice(0, 200) || String(r.merchant ?? "").slice(0, 200) || "Transaction",
      merchant: String(r.merchant ?? "").trim().slice(0, 60) || "Unknown",
      amount: r.kind === "refund" ? -amount : amount,
      direction: r.kind === "income" ? "in" : r.kind === "save" ? "save" : "out",
      cash_flow_item_id: r.kind === "save" ? null : r.bucket ? resolved.get(r.bucket) ?? null : null,
      source: "statement",
      import_batch_id: batchId,
    };
  });

  let saved = records;
  let { error } = await supabase.from("cash_flow_transactions").insert(records);
  // 23514 = check violation: the 'save' direction migration (supabase/cash-flow-saved-and-month-close.sql)
  // hasn't been run yet. Keep the rest of the import rather than failing all of it.
  if (error?.code === "23514" && records.some((r) => r.direction === "save")) {
    saved = records.filter((r) => r.direction !== "save");
    ({ error } = saved.length > 0 ? await supabase.from("cash_flow_transactions").insert(saved) : { error: null });
  }
  if (error) return { error: error.message };

  const ruleRows = (input.remember ?? [])
    .map((r) => ({ key: merchantKey(String(r.merchant ?? "")), itemId: resolved.get(r.bucket) ?? null }))
    .filter((r): r is { key: string; itemId: string } => !!r.key && !!r.itemId);
  if (ruleRows.length > 0) {
    await supabase.from("cash_flow_merchant_rules").upsert(
      ruleRows.map((r) => ({ user_id: user.id, merchant_key: r.key, cash_flow_item_id: r.itemId, updated_at: new Date().toISOString() })),
      { onConflict: "user_id,merchant_key" },
    );
  }

  void awardXp(user.id, "budget_logged", dailyKey("budget_logged"));
  revalidatePath("/planning");
  return { inserted: saved.length, batchId, skippedSaves: records.length - saved.length };
}

// Re-buckets one transaction. With remember=true it also saves a merchant rule and moves
// every other transaction from the same merchant in the same month, so fixing "Costco"
// once fixes it for the month and on every future import.
export async function updateTransactionBucket(
  id: string,
  bucket: string | null,
  remember: boolean,
): Promise<{ error?: string; moved?: number }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: txn } = await supabase
    .from("cash_flow_transactions").select("id, merchant, period_year, period_month, direction")
    .eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!txn) return { error: "Transaction not found." };

  const itemId = bucket ? (await resolveBuckets(supabase, user.id, [bucket])).get(bucket) ?? null : null;
  if (bucket && !itemId) return { error: "That budget item no longer exists." };

  let ids = [txn.id];
  if (remember) {
    const key = merchantKey(txn.merchant);
    const { data: sameMonth } = await supabase
      .from("cash_flow_transactions").select("id, merchant")
      .eq("user_id", user.id).eq("period_year", txn.period_year).eq("period_month", txn.period_month)
      .eq("direction", txn.direction);
    ids = Array.from(new Set([txn.id, ...(sameMonth ?? []).filter((t) => merchantKey(t.merchant) === key).map((t) => t.id)]));
    if (itemId && key) {
      await supabase.from("cash_flow_merchant_rules").upsert(
        { user_id: user.id, merchant_key: key, cash_flow_item_id: itemId, updated_at: new Date().toISOString() },
        { onConflict: "user_id,merchant_key" },
      );
    }
  }

  const { error } = await supabase
    .from("cash_flow_transactions")
    .update({ cash_flow_item_id: itemId, updated_at: new Date().toISOString() })
    .in("id", ids).eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/planning");
  return { moved: ids.length };
}

// One transaction typed in by hand — a Marketplace sale, a paycheck, a cash purchase.
// Recorded for its own month only; the plan is untouched.
export async function addManualTransaction(input: {
  date: string;
  merchant: string;
  amount: number;
  kind: Exclude<TxnKind, "transfer">;
  bucket: string | null;
  note?: string;
}): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const date = String(input?.date ?? "");
  const amount = Math.round(Number(input?.amount) * 100) / 100;
  const merchant = String(input?.merchant ?? "").trim().slice(0, 60);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Pick a date." };
  if (!merchant) return { error: "Add a description." };
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter an amount greater than 0." };
  if (!["spend", "refund", "income", "save"].includes(input.kind)) return { error: "Invalid type." };

  const itemId = input.kind !== "save" && input.bucket ? (await resolveBuckets(supabase, user.id, [input.bucket])).get(input.bucket) ?? null : null;
  const { error } = await supabase.from("cash_flow_transactions").insert({
    user_id: user.id,
    txn_date: date,
    period_year: Number(date.slice(0, 4)),
    period_month: Number(date.slice(5, 7)),
    description: merchant,
    merchant,
    amount: input.kind === "refund" ? -amount : amount,
    direction: input.kind === "income" ? "in" : input.kind === "save" ? "save" : "out",
    cash_flow_item_id: itemId,
    source: "manual",
    note: input.note ? String(input.note).slice(0, 200) : null,
  });
  if (error?.code === "23514" && input.kind === "save") {
    return { error: "Saving moves need a quick database update first (supabase/cash-flow-saved-and-month-close.sql)." };
  }
  if (error) return { error: error.message };
  revalidatePath("/planning");
  return {};
}

// "Paid ✓" for a planned bill: records one transaction at the amount given (defaults to the
// budget) in the chosen month, so fixed bills become real numbers in one tap instead of
// being silently assumed. Also marks the bill paid for the "still owed" list when it has a
// due day.
export async function recordBillPaid(
  itemId: string,
  year: number,
  month: number,
  amount: number,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return { error: "Invalid month." };
  const amt = Math.round(Number(amount) * 100) / 100;
  if (!Number.isFinite(amt) || amt <= 0) return { error: "Enter an amount greater than 0." };

  const { data: item } = await supabase
    .from("cash_flow_items").select("id, label, type, due_day, last_paid_for_date")
    .eq("id", itemId).eq("user_id", user.id).maybeSingle();
  if (!item || item.type !== "expense") return { error: "Budget item not found." };

  const lastDay = new Date(year, month, 0).getDate();
  const now = new Date();
  const isCurrent = now.getFullYear() === year && now.getMonth() + 1 === month;
  const day = item.due_day != null ? Math.min(item.due_day, lastDay) : isCurrent ? now.getDate() : 1;
  const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  const { error } = await supabase.from("cash_flow_transactions").insert({
    user_id: user.id, txn_date: date, period_year: year, period_month: month,
    description: item.label, merchant: item.label, amount: amt, direction: "out",
    cash_flow_item_id: item.id, source: "manual",
  });
  if (error) return { error: error.message };

  if (item.due_day != null && (!item.last_paid_for_date || item.last_paid_for_date < date)) {
    await supabase.from("cash_flow_items")
      .update({ last_paid_for_date: date, updated_at: new Date().toISOString() })
      .eq("id", item.id).eq("user_id", user.id);
  }
  revalidatePath("/planning");
  return {};
}

// "Sort all with suggestions" — applies the suggested bucket to many unsorted transactions
// at once and remembers each merchant for future imports.
export async function bulkSetTransactionBuckets(
  assignments: { id: string; bucket: string }[],
): Promise<{ error?: string; updated?: number }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };
  const list = (Array.isArray(assignments) ? assignments : []).slice(0, 500)
    .filter((a) => typeof a?.id === "string" && typeof a?.bucket === "string" && a.bucket.length > 0);
  if (list.length === 0) return { updated: 0 };

  const resolved = await resolveBuckets(supabase, user.id, Array.from(new Set(list.map((a) => a.bucket))));
  const { data: txns } = await supabase
    .from("cash_flow_transactions").select("id, merchant")
    .eq("user_id", user.id).in("id", list.map((a) => a.id));
  const merchantById = new Map((txns ?? []).map((t) => [t.id, t.merchant as string]));

  const byItem = new Map<string, string[]>();
  for (const a of list) {
    const itemId = resolved.get(a.bucket);
    if (!itemId || !merchantById.has(a.id)) continue;
    byItem.set(itemId, [...(byItem.get(itemId) ?? []), a.id]);
  }
  let updated = 0;
  for (const [itemId, ids] of byItem) {
    const { error } = await supabase.from("cash_flow_transactions")
      .update({ cash_flow_item_id: itemId, updated_at: new Date().toISOString() })
      .in("id", ids).eq("user_id", user.id);
    if (error) return { error: error.message };
    updated += ids.length;
    const rules = Array.from(new Set(ids.map((id) => merchantKey(merchantById.get(id) ?? "")).filter(Boolean)))
      .map((merchant_key) => ({ user_id: user.id, merchant_key, cash_flow_item_id: itemId, updated_at: new Date().toISOString() }));
    if (rules.length > 0) await supabase.from("cash_flow_merchant_rules").upsert(rules, { onConflict: "user_id,merchant_key" });
  }
  revalidatePath("/planning");
  return { updated };
}

// Monthly close-out: snapshot of the month when the user finished reviewing it.
export async function closeCashFlowMonth(input: {
  year: number; month: number; income: number; spending: number; saved: number;
}): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };
  const { year, month } = input;
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return { error: "Invalid month." };
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Math.round(Number(v) * 100) / 100 : 0);
  const { error } = await supabase.from("cash_flow_month_closes").upsert({
    user_id: user.id, period_year: year, period_month: month,
    income: num(input.income), spending: num(input.spending), saved: num(input.saved),
    closed_at: new Date().toISOString(),
  }, { onConflict: "user_id,period_year,period_month" });
  if (error) {
    return { error: error.code === "42P01" || /cash_flow_month_closes/.test(error.message)
      ? "Closing months needs a quick database update first (supabase/cash-flow-saved-and-month-close.sql)."
      : error.message };
  }
  void awardXp(user.id, "budget_logged", dailyKey("budget_logged"));
  revalidatePath("/planning");
  return {};
}

export async function reopenCashFlowMonth(year: number, month: number): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };
  const { error } = await supabase.from("cash_flow_month_closes").delete()
    .eq("user_id", user.id).eq("period_year", year).eq("period_month", month);
  if (error) return { error: error.message };
  revalidatePath("/planning");
  return {};
}

export async function deleteTransaction(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };
  const { data: row } = await supabase.from("cash_flow_transactions")
    .select("source, external_id").eq("id", id).eq("user_id", user.id).maybeSingle();
  const { error } = await supabase.from("cash_flow_transactions").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { error: error.message };
  // A deleted bank transaction must not come back on the next Plaid sync.
  if (row?.source === "plaid" && row.external_id) {
    try { await dismissPlaidTransaction(user.id, row.external_id); } catch { /* best-effort */ }
  }
  revalidatePath("/planning");
  return {};
}

// Undo for a whole import — every row saved by one saveImportedTransactions call.
export async function deleteImportBatch(batchId: string): Promise<{ error?: string; deleted?: number }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };
  const { data, error } = await supabase
    .from("cash_flow_transactions").delete()
    .eq("import_batch_id", batchId).eq("user_id", user.id).select("id");
  if (error) return { error: error.message };
  revalidatePath("/planning");
  return { deleted: (data ?? []).length };
}
