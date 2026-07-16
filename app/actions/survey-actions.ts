"use server";

import { createClient } from "@/lib/supabase/server";

const FEATURES = new Set([
  "multiple_portfolios",
  "unlimited_ai",
  "tax_center",
  "planning_stress",
  "community_strategies",
  "none",
]);
const PRICES = new Set(["0", "5", "10", "20"]);

export async function submitPricingSurvey(
  features: string[],
  price: string,
  comment: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const cleanFeatures = features.filter((f) => FEATURES.has(f)).slice(0, 6);
  const cleanPrice = PRICES.has(price) ? price : null;
  const cleanComment = comment.trim().slice(0, 500) || null;
  if (cleanFeatures.length === 0 && !cleanPrice) return { ok: false, error: "Pick at least one option." };

  const { error } = await supabase.from("pricing_survey_responses").insert({
    user_id: user.id,
    features: cleanFeatures,
    price: cleanPrice,
    comment: cleanComment,
  });

  // Duplicate submit (PK conflict) still counts as answered — don't show an error.
  if (error && !error.message.includes("duplicate")) return { ok: false, error: "Could not save. Try again." };
  return { ok: true };
}
