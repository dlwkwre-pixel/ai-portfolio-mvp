"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createPortfolio(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in to create a portfolio.");
  }

  const name = String(formData.get("name") || "").trim();
  const accountType = String(formData.get("account_type") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const benchmarkSymbol = String(formData.get("benchmark_symbol") || "").trim();
  const cashBalanceRaw = String(formData.get("cash_balance") || "0").trim();

  if (!name) {
    throw new Error("Portfolio name is required.");
  }

  if (!accountType) {
    throw new Error("Account type is required.");
  }

  const cashBalance = Number(cashBalanceRaw || 0);

  const { error } = await supabase.from("portfolios").insert({
    user_id: user.id,
    name,
    account_type: accountType,
    description: description || null,
    benchmark_symbol: benchmarkSymbol || "SPY",
    cash_balance: Number.isFinite(cashBalance) ? cashBalance : 0,
    status: "active",
    is_active: true,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/portfolios");
}

export async function archivePortfolio(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in to archive a portfolio.");
  }

  const portfolioId = String(formData.get("portfolio_id") || "").trim();

  if (!portfolioId) {
    throw new Error("Portfolio ID is required.");
  }

  const { error } = await supabase
    .from("portfolios")
    .update({
      status: "archived",
      is_active: false,
    })
    .eq("id", portfolioId)
    .eq("user_id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/portfolios");
}

export async function restorePortfolio(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in to restore a portfolio.");
  }

  const portfolioId = String(formData.get("portfolio_id") || "").trim();

  if (!portfolioId) {
    throw new Error("Portfolio ID is required.");
  }

  const { error } = await supabase
    .from("portfolios")
    .update({
      status: "active",
      is_active: true,
    })
    .eq("id", portfolioId)
    .eq("user_id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/portfolios");
}