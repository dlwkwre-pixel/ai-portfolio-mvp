"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function assignStrategyToPortfolio(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in to assign a strategy.");
  }

  const portfolioId = String(formData.get("portfolio_id") || "").trim();
  const strategyId = String(formData.get("strategy_id") || "").trim();
  const notes = String(formData.get("notes") || "").trim();

  if (!portfolioId) {
    throw new Error("Portfolio ID is required.");
  }

  if (!strategyId) {
    throw new Error("Strategy ID is required.");
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

  const { data: strategy, error: strategyError } = await supabase
    .from("strategies")
    .select("id")
    .eq("id", strategyId)
    .eq("user_id", user.id)
    .single();

  if (strategyError || !strategy) {
    throw new Error("Strategy not found.");
  }

  const { data: latestVersion, error: versionError } = await supabase
    .from("strategy_versions")
    .select("id, version_number")
    .eq("strategy_id", strategyId)
    .order("version_number", { ascending: false })
    .limit(1)
    .single();

  if (versionError || !latestVersion) {
    throw new Error("No strategy version found for that strategy.");
  }

  const { error: closeOldAssignmentsError } = await supabase
    .from("portfolio_strategy_assignments")
    .update({
      is_active: false,
      ended_at: new Date().toISOString(),
    })
    .eq("portfolio_id", portfolioId)
    .eq("is_active", true)
    .is("ended_at", null);

  if (closeOldAssignmentsError) {
    throw new Error(closeOldAssignmentsError.message);
  }

  const { error: insertError } = await supabase
    .from("portfolio_strategy_assignments")
    .insert({
      portfolio_id: portfolioId,
      strategy_id: strategyId,
      strategy_version_id: latestVersion.id,
      is_active: true,
      notes: notes || null,
    });

  if (insertError) {
    throw new Error(insertError.message);
  }

  revalidatePath(`/portfolios/${portfolioId}`);
}

export async function upgradePortfolioStrategyToLatest(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in to upgrade a strategy version.");
  }

  const portfolioId = String(formData.get("portfolio_id") || "").trim();

  if (!portfolioId) {
    throw new Error("Portfolio ID is required.");
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

  const { data: activeAssignment, error: activeAssignmentError } = await supabase
    .from("portfolio_strategy_assignments")
    .select("id, strategy_id, strategy_version_id")
    .eq("portfolio_id", portfolioId)
    .eq("is_active", true)
    .is("ended_at", null)
    .order("assigned_at", { ascending: false })
    .limit(1)
    .single();

  if (activeAssignmentError || !activeAssignment) {
    throw new Error("No active strategy assignment found.");
  }

  const { data: latestVersion, error: latestVersionError } = await supabase
    .from("strategy_versions")
    .select("id, version_number")
    .eq("strategy_id", activeAssignment.strategy_id)
    .order("version_number", { ascending: false })
    .limit(1)
    .single();

  if (latestVersionError || !latestVersion) {
    throw new Error("No latest strategy version found.");
  }

  if (latestVersion.id === activeAssignment.strategy_version_id) {
    throw new Error("This portfolio is already on the latest strategy version.");
  }

  const { error: closeCurrentError } = await supabase
    .from("portfolio_strategy_assignments")
    .update({
      is_active: false,
      ended_at: new Date().toISOString(),
    })
    .eq("id", activeAssignment.id);

  if (closeCurrentError) {
    throw new Error(closeCurrentError.message);
  }

  const { error: newAssignmentError } = await supabase
    .from("portfolio_strategy_assignments")
    .insert({
      portfolio_id: portfolioId,
      strategy_id: activeAssignment.strategy_id,
      strategy_version_id: latestVersion.id,
      is_active: true,
      notes: "Upgraded to latest strategy version",
    });

  if (newAssignmentError) {
    throw new Error(newAssignmentError.message);
  }

  revalidatePath(`/portfolios/${portfolioId}`);
}