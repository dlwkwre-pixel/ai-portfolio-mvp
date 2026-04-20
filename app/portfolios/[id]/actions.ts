"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createHolding(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in to add a holding.");
  }

  const portfolioId = String(formData.get("portfolio_id") || "").trim();
  const ticker = String(formData.get("ticker") || "").trim().toUpperCase();
  const companyName = String(formData.get("company_name") || "").trim();
  const assetType = String(formData.get("asset_type") || "stock").trim();
  const sharesRaw = String(formData.get("shares") || "").trim();
  const averageCostBasisRaw = String(
    formData.get("average_cost_basis") || ""
  ).trim();
  const openedAtRaw = String(formData.get("opened_at") || "").trim();
  const notes = String(formData.get("notes") || "").trim();

  if (!portfolioId) {
    throw new Error("Portfolio ID is required.");
  }

  if (!ticker) {
    throw new Error("Ticker is required.");
  }

  const shares = Number(sharesRaw);
  const averageCostBasis = Number(averageCostBasisRaw);

  if (!Number.isFinite(shares) || shares <= 0) {
    throw new Error("Shares must be greater than 0.");
  }

  if (!Number.isFinite(averageCostBasis) || averageCostBasis < 0) {
    throw new Error("Average cost must be 0 or greater.");
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

  const { error } = await supabase.from("holdings").insert({
    portfolio_id: portfolioId,
    ticker,
    company_name: companyName || null,
    asset_type: assetType,
    shares,
    average_cost_basis: averageCostBasis,
    opened_at: openedAtRaw || null,
    notes: notes || null,
  });

  if (error) {
    if (error.message.toLowerCase().includes("duplicate")) {
      throw new Error("That ticker already exists in this portfolio.");
    }
    throw new Error(error.message);
  }

  revalidatePath(`/portfolios/${portfolioId}`);
}

export async function createPortfolioNote(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in to add a note.");
  }

  const portfolioId = String(formData.get("portfolio_id") || "").trim();
  const title = String(formData.get("title") || "").trim();
  const content = String(formData.get("content") || "").trim();

  if (!portfolioId) {
    throw new Error("Portfolio ID is required.");
  }

  if (!title) {
    throw new Error("Note title is required.");
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

  const { error } = await supabase.from("portfolio_notes").insert({
    portfolio_id: portfolioId,
    title,
    content: content || null,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/portfolios/${portfolioId}`);
}

export async function createCashActivity(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in to add cash activity.");
  }

  const portfolioId = String(formData.get("portfolio_id") || "").trim();
  const reason = String(formData.get("reason") || "").trim().toLowerCase();
  const amountRaw = String(formData.get("amount") || "").trim();
  const effectiveAtRaw = String(formData.get("effective_at") || "").trim();

  if (!portfolioId) {
    throw new Error("Portfolio ID is required.");
  }

  if (!reason) {
    throw new Error("Activity type is required.");
  }

  const amount = Number(amountRaw);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Amount must be greater than 0.");
  }

  const { data: portfolio, error: portfolioError } = await supabase
    .from("portfolios")
    .select("id, cash_balance")
    .eq("id", portfolioId)
    .eq("user_id", user.id)
    .single();

  if (portfolioError || !portfolio) {
    throw new Error("Portfolio not found.");
  }

  let direction: "IN" | "OUT";
  if (reason === "deposit" || reason === "dividend" || reason === "adjustment_in") {
    direction = "IN";
  } else {
    direction = "OUT";
  }

  const signedAmount = direction === "IN" ? amount : -amount;
  const newCashBalance = Number(portfolio.cash_balance) + signedAmount;

  if (newCashBalance < 0) {
    throw new Error("This activity would make cash balance go negative.");
  }

  const { error: ledgerError } = await supabase.from("cash_ledger").insert({
    portfolio_id: portfolioId,
    amount,
    direction,
    reason,
    effective_at: effectiveAtRaw || new Date().toISOString(),
  });

  if (ledgerError) {
    throw new Error(ledgerError.message);
  }

  const { error: portfolioUpdateError } = await supabase
    .from("portfolios")
    .update({
      cash_balance: newCashBalance,
    })
    .eq("id", portfolioId)
    .eq("user_id", user.id);

  if (portfolioUpdateError) {
    throw new Error(portfolioUpdateError.message);
  }

  revalidatePath(`/portfolios/${portfolioId}`);
}

export async function createPortfolioSnapshot(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in to save a snapshot.");
  }

  const portfolioId = String(formData.get("portfolio_id") || "").trim();
  const totalValueRaw = String(formData.get("total_value") || "").trim();
  const snapshotDateRaw = String(formData.get("snapshot_date") || "").trim();
  const notes = String(formData.get("notes") || "").trim();

  if (!portfolioId) {
    throw new Error("Portfolio ID is required.");
  }

  const totalValue = Number(totalValueRaw);

  if (!Number.isFinite(totalValue) || totalValue < 0) {
    throw new Error("Total value must be 0 or greater.");
  }

  const { data: portfolio, error: portfolioError } = await supabase
    .from("portfolios")
    .select("id, cash_balance")
    .eq("id", portfolioId)
    .eq("user_id", user.id)
    .single();

  if (portfolioError || !portfolio) {
    throw new Error("Portfolio not found.");
  }

  const { error } = await supabase.from("portfolio_snapshots").insert({
    portfolio_id: portfolioId,
    total_value: totalValue,
    cash_balance: Number(portfolio.cash_balance),
    snapshot_date: snapshotDateRaw || new Date().toISOString(),
    notes: notes || null,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/portfolios/${portfolioId}`);
}