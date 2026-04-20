"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createStrategy(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in to create a strategy.");
  }

  const name = String(formData.get("name") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const style = String(formData.get("style") || "").trim();
  const riskLevel = String(formData.get("risk_level") || "").trim();
  const promptText = String(formData.get("prompt_text") || "").trim();
  const maxPositionPctRaw = String(formData.get("max_position_pct") || "").trim();
  const minPositionPctRaw = String(formData.get("min_position_pct") || "").trim();
  const turnoverPreference = String(
    formData.get("turnover_preference") || ""
  ).trim();
  const holdingPeriodBias = String(
    formData.get("holding_period_bias") || ""
  ).trim();
  const cashMinPctRaw = String(formData.get("cash_min_pct") || "").trim();
  const cashMaxPctRaw = String(formData.get("cash_max_pct") || "").trim();

  if (!name) {
    throw new Error("Strategy name is required.");
  }

  const maxPositionPct = maxPositionPctRaw ? Number(maxPositionPctRaw) : null;
  const minPositionPct = minPositionPctRaw ? Number(minPositionPctRaw) : null;
  const cashMinPct = cashMinPctRaw ? Number(cashMinPctRaw) : null;
  const cashMaxPct = cashMaxPctRaw ? Number(cashMaxPctRaw) : null;

  const { data: strategy, error: strategyError } = await supabase
    .from("strategies")
    .insert({
      user_id: user.id,
      name,
      description: description || null,
      style: style || null,
      risk_level: riskLevel || null,
      is_active: true,
    })
    .select()
    .single();

  if (strategyError || !strategy) {
    throw new Error(strategyError?.message || "Failed to create strategy.");
  }

  const { error: versionError } = await supabase.from("strategy_versions").insert({
    strategy_id: strategy.id,
    version_number: 1,
    prompt_text: promptText || null,
    max_position_pct: maxPositionPct,
    min_position_pct: minPositionPct,
    turnover_preference: turnoverPreference || null,
    holding_period_bias: holdingPeriodBias || null,
    cash_min_pct: cashMinPct,
    cash_max_pct: cashMaxPct,
    sector_constraints: null,
    diversification_rules: null,
    allow_fractional_shares: false,
    buy_rules_json: null,
    sell_rules_json: null,
    risk_rules_json: null,
    exit_rules_json: null,
  });

  if (versionError) {
    throw new Error(versionError.message);
  }

  revalidatePath("/strategies");
  revalidatePath("/portfolios");
}

export async function updateStrategy(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in to update a strategy.");
  }

  const strategyId = String(formData.get("strategy_id") || "").trim();
  const name = String(formData.get("name") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const style = String(formData.get("style") || "").trim();
  const riskLevel = String(formData.get("risk_level") || "").trim();
  const promptText = String(formData.get("prompt_text") || "").trim();
  const maxPositionPctRaw = String(formData.get("max_position_pct") || "").trim();
  const minPositionPctRaw = String(formData.get("min_position_pct") || "").trim();
  const turnoverPreference = String(
    formData.get("turnover_preference") || ""
  ).trim();
  const holdingPeriodBias = String(
    formData.get("holding_period_bias") || ""
  ).trim();
  const cashMinPctRaw = String(formData.get("cash_min_pct") || "").trim();
  const cashMaxPctRaw = String(formData.get("cash_max_pct") || "").trim();

  if (!strategyId) {
    throw new Error("Strategy ID is required.");
  }

  if (!name) {
    throw new Error("Strategy name is required.");
  }

  const { data: strategy, error: strategyError } = await supabase
    .from("strategies")
    .select("id")
    .eq("id", strategyId)
    .eq("user_id", user.id)
    .single();

  if (strategyError || !strategy) {
    throw new Error("Strategy not found.");
  }

  const { data: latestVersion, error: latestVersionError } = await supabase
    .from("strategy_versions")
    .select("version_number")
    .eq("strategy_id", strategyId)
    .order("version_number", { ascending: false })
    .limit(1)
    .single();

  if (latestVersionError || !latestVersion) {
    throw new Error("Could not find latest strategy version.");
  }

  const nextVersionNumber = Number(latestVersion.version_number) + 1;

  const maxPositionPct = maxPositionPctRaw ? Number(maxPositionPctRaw) : null;
  const minPositionPct = minPositionPctRaw ? Number(minPositionPctRaw) : null;
  const cashMinPct = cashMinPctRaw ? Number(cashMinPctRaw) : null;
  const cashMaxPct = cashMaxPctRaw ? Number(cashMaxPctRaw) : null;

  const { error: strategyUpdateError } = await supabase
    .from("strategies")
    .update({
      name,
      description: description || null,
      style: style || null,
      risk_level: riskLevel || null,
    })
    .eq("id", strategyId)
    .eq("user_id", user.id);

  if (strategyUpdateError) {
    throw new Error(strategyUpdateError.message);
  }

  const { error: versionInsertError } = await supabase
    .from("strategy_versions")
    .insert({
      strategy_id: strategyId,
      version_number: nextVersionNumber,
      prompt_text: promptText || null,
      max_position_pct: maxPositionPct,
      min_position_pct: minPositionPct,
      turnover_preference: turnoverPreference || null,
      holding_period_bias: holdingPeriodBias || null,
      cash_min_pct: cashMinPct,
      cash_max_pct: cashMaxPct,
      sector_constraints: null,
      diversification_rules: null,
      allow_fractional_shares: false,
      buy_rules_json: null,
      sell_rules_json: null,
      risk_rules_json: null,
      exit_rules_json: null,
    });

  if (versionInsertError) {
    throw new Error(versionInsertError.message);
  }

  revalidatePath("/strategies");
  revalidatePath("/portfolios");
}