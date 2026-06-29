"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { firstDueDate, CADENCES, type Cadence } from "@/lib/planning/contributions";

export type ContributionSchedule = {
  id: string;
  portfolio_id: string | null;
  label: string;
  amount: number;
  cadence: Cadence;
  anchor_day: number;
  next_due: string;
  active: boolean;
};

function parseCadence(v: string): Cadence {
  return (CADENCES as string[]).includes(v) ? (v as Cadence) : "monthly";
}

export async function addContribution(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const label = String(formData.get("label") || "").trim().slice(0, 80);
  const amount = Number(formData.get("amount") || 0);
  const cadence = parseCadence(String(formData.get("cadence") || "monthly"));
  const anchorDay = Number(formData.get("anchor_day") || (cadence === "monthly" ? 1 : 1));
  const portfolioRaw = String(formData.get("portfolio_id") || "").trim();

  if (!label) return { error: "Give this contribution a name." };
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Set an amount greater than 0." };

  // Validate portfolio ownership if one was chosen.
  let portfolio_id: string | null = null;
  if (portfolioRaw) {
    const { data: p } = await supabase.from("portfolios").select("id").eq("id", portfolioRaw).eq("user_id", user.id).maybeSingle();
    portfolio_id = p?.id ?? null;
  }

  const { error } = await supabase.from("contribution_schedules").insert({
    user_id: user.id,
    portfolio_id,
    label,
    amount,
    cadence,
    anchor_day: Math.round(anchorDay),
    next_due: firstDueDate(cadence, anchorDay),
    active: true,
  });
  if (error) return { error: error.message };
  revalidatePath("/planning/contributions");
  return {};
}

export async function updateContribution(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const id = String(formData.get("id") || "").trim();
  if (!id) return { error: "Missing schedule." };
  const label = String(formData.get("label") || "").trim().slice(0, 80);
  const amount = Number(formData.get("amount") || 0);
  const cadence = parseCadence(String(formData.get("cadence") || "monthly"));
  const anchorDay = Number(formData.get("anchor_day") || 1);
  if (!label) return { error: "Give this contribution a name." };
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Set an amount greater than 0." };

  const { error } = await supabase.from("contribution_schedules").update({
    label,
    amount,
    cadence,
    anchor_day: Math.round(anchorDay),
    next_due: firstDueDate(cadence, anchorDay),
    updated_at: new Date().toISOString(),
  }).eq("id", id).eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/planning/contributions");
  return {};
}

export async function toggleContribution(id: string, active: boolean): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  const { error } = await supabase.from("contribution_schedules")
    .update({ active, updated_at: new Date().toISOString() })
    .eq("id", id).eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/planning/contributions");
  return {};
}

export async function deleteContribution(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  const { error } = await supabase.from("contribution_schedules").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/planning/contributions");
  return {};
}
