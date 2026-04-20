"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createManualRecommendation(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in to create a recommendation.");
  }

  const portfolioId = String(formData.get("portfolio_id") || "").trim();
  const actionType = String(formData.get("action_type") || "").trim().toLowerCase();
  const ticker = String(formData.get("ticker") || "").trim().toUpperCase();
  const companyName = String(formData.get("company_name") || "").trim();
  const thesis = String(formData.get("thesis") || "").trim();
  const rationale = String(formData.get("rationale") || "").trim();
  const risks = String(formData.get("risks") || "").trim();
  const conviction = String(formData.get("conviction") || "").trim();
  const confidenceScoreRaw = String(formData.get("confidence_score") || "").trim();
  const priorityRankRaw = String(formData.get("priority_rank") || "").trim();
  const sizingPctRaw = String(formData.get("sizing_pct") || "").trim();
  const sizingDollarsRaw = String(formData.get("sizing_dollars") || "").trim();
  const shareQuantityRaw = String(formData.get("share_quantity") || "").trim();
  const targetPrice1Raw = String(formData.get("target_price_1") || "").trim();
  const targetPrice2Raw = String(formData.get("target_price_2") || "").trim();
  const stopPriceRaw = String(formData.get("stop_price") || "").trim();
  const timeHorizon = String(formData.get("time_horizon") || "").trim();

  if (!portfolioId) {
    throw new Error("Portfolio ID is required.");
  }

  if (!actionType) {
    throw new Error("Action type is required.");
  }

  if (!ticker) {
    throw new Error("Ticker is required.");
  }

  if (!thesis) {
    throw new Error("Thesis is required.");
  }

  const { data: portfolio, error: portfolioError } = await supabase
    .from("portfolios")
    .select("id")
    .eq("id", portfolioId)
    .eq("user_id", user.id)
    .single();

  if (portfolioError || !portfolio) {
    throw new Error("Portfolio not found.");
  }

  const { data: activeAssignment } = await supabase
    .from("portfolio_strategy_assignments")
    .select("strategy_id, strategy_version_id")
    .eq("portfolio_id", portfolioId)
    .eq("is_active", true)
    .is("ended_at", null)
    .order("assigned_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const confidenceScore = confidenceScoreRaw ? Number(confidenceScoreRaw) : null;
  const priorityRank = priorityRankRaw ? Number(priorityRankRaw) : null;
  const sizingPct = sizingPctRaw ? Number(sizingPctRaw) : null;
  const sizingDollars = sizingDollarsRaw ? Number(sizingDollarsRaw) : null;
  const shareQuantity = shareQuantityRaw ? Number(shareQuantityRaw) : null;
  const targetPrice1 = targetPrice1Raw ? Number(targetPrice1Raw) : null;
  const targetPrice2 = targetPrice2Raw ? Number(targetPrice2Raw) : null;
  const stopPrice = stopPriceRaw ? Number(stopPriceRaw) : null;

  const { data: run, error: runError } = await supabase
    .from("recommendation_runs")
    .insert({
      portfolio_id: portfolioId,
      strategy_id: activeAssignment?.strategy_id ?? null,
      strategy_version_id: activeAssignment?.strategy_version_id ?? null,
      run_type: "manual_review",
      triggered_by: "manual",
      model_name: "manual-seed",
      model_version: "v1",
      summary: `${actionType.toUpperCase()} recommendation for ${ticker}`,
      status: "completed",
    })
    .select()
    .single();

  if (runError || !run) {
    throw new Error(runError?.message || "Failed to create recommendation run.");
  }

  const { data: item, error: itemError } = await supabase
    .from("recommendation_items")
    .insert({
      recommendation_run_id: run.id,
      portfolio_id: portfolioId,
      action_type: actionType,
      ticker,
      company_name: companyName || null,
      thesis,
      rationale: rationale || null,
      risks: risks || null,
      conviction: conviction || null,
      confidence_score: confidenceScore,
      priority_rank: priorityRank,
      sizing_pct: sizingPct,
      sizing_dollars: sizingDollars,
      share_quantity: shareQuantity,
      target_price_1: targetPrice1,
      target_price_2: targetPrice2,
      stop_price: stopPrice,
      time_horizon: timeHorizon || null,
      recommendation_status: "proposed",
      user_decision: null,
      decision_notes: null,
    })
    .select()
    .single();

  if (itemError || !item) {
    throw new Error(itemError?.message || "Failed to create recommendation item.");
  }

  const { error: historyError } = await supabase
    .from("recommendation_item_status_history")
    .insert({
      recommendation_item_id: item.id,
      portfolio_id: portfolioId,
      old_status: null,
      new_status: "proposed",
      changed_by: "user",
      notes: "Initial manual recommendation created.",
    });

  if (historyError) {
    throw new Error(historyError.message);
  }

  revalidatePath(`/portfolios/${portfolioId}`);
}

export async function updateRecommendationStatus(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in to update a recommendation.");
  }

  const recommendationItemId = String(
    formData.get("recommendation_item_id") || ""
  ).trim();
  const portfolioId = String(formData.get("portfolio_id") || "").trim();
  const newStatus = String(formData.get("new_status") || "").trim();
  const note = String(formData.get("note") || "").trim();

  if (!recommendationItemId) {
    throw new Error("Recommendation item ID is required.");
  }

  if (!portfolioId) {
    throw new Error("Portfolio ID is required.");
  }

  if (!newStatus) {
    throw new Error("New status is required.");
  }

  const { data: portfolio, error: portfolioError } = await supabase
    .from("portfolios")
    .select("id")
    .eq("id", portfolioId)
    .eq("user_id", user.id)
    .single();

  if (portfolioError || !portfolio) {
    throw new Error("Portfolio not found.");
  }

  const { data: item, error: itemError } = await supabase
    .from("recommendation_items")
    .select("id, recommendation_status")
    .eq("id", recommendationItemId)
    .eq("portfolio_id", portfolioId)
    .single();

  if (itemError || !item) {
    throw new Error("Recommendation item not found.");
  }

  const oldStatus = item.recommendation_status;

  const userDecisionMap: Record<string, string | null> = {
    proposed: null,
    accepted: "accepted",
    rejected: "rejected",
    watchlist: "watchlist",
    executed: "executed",
  };

  const { error: updateError } = await supabase
    .from("recommendation_items")
    .update({
      recommendation_status: newStatus,
      user_decision: userDecisionMap[newStatus] ?? null,
      decision_notes: note || null,
    })
    .eq("id", recommendationItemId)
    .eq("portfolio_id", portfolioId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  const { error: historyError } = await supabase
    .from("recommendation_item_status_history")
    .insert({
      recommendation_item_id: recommendationItemId,
      portfolio_id: portfolioId,
      old_status: oldStatus,
      new_status: newStatus,
      changed_by: "user",
      notes: note || null,
    });

  if (historyError) {
    throw new Error(historyError.message);
  }

  revalidatePath(`/portfolios/${portfolioId}`);
}