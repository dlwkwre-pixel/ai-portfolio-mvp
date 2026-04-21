"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type InitialHolding = {
  ticker: string;
  company_name: string;
  shares: string;
  average_cost_basis: string;
};

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
  const initialHoldingsRaw = String(formData.get("initial_holdings") || "[]").trim();

  if (!name) {
    throw new Error("Portfolio name is required.");
  }

  if (!accountType) {
    throw new Error("Account type is required.");
  }

  const cashBalance = Number(cashBalanceRaw || 0);

  // Parse initial holdings safely
  let initialHoldings: InitialHolding[] = [];
  try {
    const parsed = JSON.parse(initialHoldingsRaw);
    if (Array.isArray(parsed)) {
      initialHoldings = parsed;
    }
  } catch {
    // If parsing fails, just proceed with no holdings
    initialHoldings = [];
  }

  // Create the portfolio
  const { data: portfolio, error: portfolioError } = await supabase
    .from("portfolios")
    .insert({
      user_id: user.id,
      name,
      account_type: accountType,
      description: description || null,
      benchmark_symbol: benchmarkSymbol || "SPY",
      cash_balance: Number.isFinite(cashBalance) ? cashBalance : 0,
      status: "active",
      is_active: true,
    })
    .select("id")
    .single();

  if (portfolioError || !portfolio) {
    throw new Error(portfolioError?.message || "Failed to create portfolio.");
  }

  // Insert initial holdings if any were provided
  if (initialHoldings.length > 0) {
    const holdingsToInsert = initialHoldings
      .filter((h) => h.ticker && h.shares)
      .map((h) => ({
        portfolio_id: portfolio.id,
        ticker: h.ticker.toUpperCase().trim(),
        company_name: h.company_name?.trim() || null,
        shares: Number(h.shares),
        average_cost_basis: h.average_cost_basis ? Number(h.average_cost_basis) : null,
        asset_type: "stock",
      }));

    if (holdingsToInsert.length > 0) {
      const { error: holdingsError } = await supabase
        .from("holdings")
        .insert(holdingsToInsert);

      if (holdingsError) {
        // Don't throw here — portfolio was created successfully,
        // just surface the holdings error as a warning
        console.error("Failed to insert initial holdings:", holdingsError.message);
      }
    }
  }

  revalidatePath("/portfolios");

  // Return the portfolio id so the form can redirect to it
  return { id: portfolio.id };
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
