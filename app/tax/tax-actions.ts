"use server";

import { createClient } from "@/lib/supabase/server";
import { kvSet } from "@/lib/kv";
import { PAY_PERIODS, type PaystubInputs } from "@/lib/tax/refund-forecast";

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

// Paystub numbers behind the refund forecast, one set per tax year.
export async function saveRefundInputs(year: number, inputs: PaystubInputs): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  if (!Number.isInteger(year) || year < 2020 || year > 2100) return { error: "Invalid year." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inputs.payDate) || Number(inputs.payDate.slice(0, 4)) !== year) return { error: `Pay date must be in ${year}.` };
  if (!(inputs.frequency in PAY_PERIODS)) return { error: "Pick how often you're paid." };
  const num = (v: unknown, required: boolean): number | null => {
    if (v == null || v === "") return required ? NaN : null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 && n < 10_000_000 ? n : NaN;
  };
  const clean = {
    payDate: inputs.payDate,
    frequency: inputs.frequency,
    ytdGross: num(inputs.ytdGross, true),
    ytdFedWithheld: num(inputs.ytdFedWithheld, true),
    ytdPreTax: num(inputs.ytdPreTax, true),
    checkGross: num(inputs.checkGross, false),
    checkFedWithheld: num(inputs.checkFedWithheld, false),
    checkPreTax: num(inputs.checkPreTax, false),
    futureGross: num(inputs.futureGross, false),
    interest: num(inputs.interest, false),
    overtimePremium: num(inputs.overtimePremium, false),
    bonusOnStub: Boolean(inputs.bonusOnStub),
  };
  if (Object.values(clean).some((v) => typeof v === "number" && Number.isNaN(v))) return { error: "Check the amounts — use plain numbers." };
  if ((clean.ytdGross ?? 0) <= 0) return { error: "Enter your year-to-date gross pay." };
  await kvSet(`taxstub:${user.id}:${year}`, { ...clean, savedAt: new Date().toISOString() }, 2 * 365 * 86_400_000);
  return {};
}
