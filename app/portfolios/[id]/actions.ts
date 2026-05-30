"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { validateTicker, validateLength, validateEnum, validateDate } from "@/lib/validation";
import { getPortfolioValuation } from "@/lib/portfolio/valuation";

const ASSET_TYPES = ["stock", "etf", "crypto", "bond", "option", "other"] as const;
const CASH_REASONS = ["deposit", "withdrawal", "dividend", "adjustment_in", "adjustment_out", "fee"] as const;
const PORTFOLIO_STATUSES = ["active", "archived"] as const;

export async function createHolding(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in to add a holding.");

  const portfolioId = String(formData.get("portfolio_id") || "").trim();
  const ticker = String(formData.get("ticker") || "").trim().toUpperCase();
  const companyName = String(formData.get("company_name") || "").trim();
  const assetType = String(formData.get("asset_type") || "stock").trim();
  const sharesRaw = String(formData.get("shares") || "").trim();
  const averageCostBasisRaw = String(formData.get("average_cost_basis") || "").trim();
  const openedAtRaw = String(formData.get("opened_at") || "").trim();
  const notes = String(formData.get("notes") || "").trim();

  if (!portfolioId) throw new Error("Portfolio ID is required.");
  validateTicker(ticker);
  validateEnum(assetType, ASSET_TYPES, "asset type");
  validateLength(companyName, 200, "Company name");
  validateLength(notes, 2000, "Notes");
  validateDate(openedAtRaw, "Opened at");

  const shares = Number(sharesRaw);
  const averageCostBasis = Number(averageCostBasisRaw);

  if (!Number.isFinite(shares) || shares <= 0) throw new Error("Shares must be greater than 0.");
  if (!Number.isFinite(averageCostBasis) || averageCostBasis < 0) throw new Error("Average cost must be 0 or greater.");

  const { data: portfolio, error: portfolioError } = await supabase
    .from("portfolios").select("id").eq("id", portfolioId).eq("user_id", user.id).single();
  if (portfolioError || !portfolio) throw new Error("Portfolio not found.");

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

export async function updateHolding(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in to update a holding.");

  const holdingId = String(formData.get("holding_id") || "").trim();
  const portfolioId = String(formData.get("portfolio_id") || "").trim();
  const companyName = String(formData.get("company_name") || "").trim();
  const assetType = String(formData.get("asset_type") || "stock").trim();
  const sharesRaw = String(formData.get("shares") || "").trim();
  const averageCostBasisRaw = String(formData.get("average_cost_basis") || "").trim();
  const notes = String(formData.get("notes") || "").trim();

  if (!holdingId) throw new Error("Holding ID is required.");
  if (!portfolioId) throw new Error("Portfolio ID is required.");
  validateEnum(assetType, ASSET_TYPES, "asset type");
  validateLength(companyName, 200, "Company name");
  validateLength(notes, 2000, "Notes");

  const shares = Number(sharesRaw);
  const averageCostBasis = Number(averageCostBasisRaw);

  if (!Number.isFinite(shares) || shares <= 0) throw new Error("Shares must be greater than 0.");
  if (!Number.isFinite(averageCostBasis) || averageCostBasis < 0) throw new Error("Average cost must be 0 or greater.");

  // Verify the holding belongs to a portfolio owned by this user
  const { data: holding, error: holdingError } = await supabase
    .from("holdings")
    .select("id, portfolio_id, portfolios!inner(user_id)")
    .eq("id", holdingId)
    .single();

  if (holdingError || !holding) throw new Error("Holding not found.");

  const { error } = await supabase
    .from("holdings")
    .update({
      company_name: companyName || null,
      asset_type: assetType,
      shares,
      average_cost_basis: averageCostBasis,
      notes: notes || null,
    })
    .eq("id", holdingId);

  if (error) throw new Error(error.message);

  revalidatePath(`/portfolios/${portfolioId}`);
}

export async function deleteHolding(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in to delete a holding.");

  const holdingId = String(formData.get("holding_id") || "").trim();
  const portfolioId = String(formData.get("portfolio_id") || "").trim();

  if (!holdingId) throw new Error("Holding ID is required.");
  if (!portfolioId) throw new Error("Portfolio ID is required.");

  // Verify ownership via portfolio
  const { data: portfolio, error: portfolioError } = await supabase
    .from("portfolios").select("id").eq("id", portfolioId).eq("user_id", user.id).single();
  if (portfolioError || !portfolio) throw new Error("Portfolio not found.");

  const { error } = await supabase.from("holdings").delete().eq("id", holdingId).eq("portfolio_id", portfolioId);
  if (error) throw new Error(error.message);

  revalidatePath(`/portfolios/${portfolioId}`);
}

export async function createPortfolioNote(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in to add a note.");

  const portfolioId = String(formData.get("portfolio_id") || "").trim();
  const title = String(formData.get("title") || "").trim();
  const content = String(formData.get("content") || "").trim();

  if (!portfolioId) throw new Error("Portfolio ID is required.");
  if (!title) throw new Error("Note title is required.");
  validateLength(title, 200, "Title");
  validateLength(content, 5000, "Content");

  const { data: portfolio, error: portfolioError } = await supabase
    .from("portfolios").select("id").eq("id", portfolioId).eq("user_id", user.id).single();
  if (portfolioError || !portfolio) throw new Error("Portfolio not found.");

  const { error } = await supabase.from("portfolio_notes").insert({
    portfolio_id: portfolioId,
    title,
    content: content || null,
  });

  if (error) throw new Error(error.message);
  revalidatePath(`/portfolios/${portfolioId}`);
}

export async function createCashActivity(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in to add cash activity.");

  const portfolioId = String(formData.get("portfolio_id") || "").trim();
  const reason = String(formData.get("reason") || "").trim().toLowerCase();
  const amountRaw = String(formData.get("amount") || "").trim();
  const effectiveAtRaw = String(formData.get("effective_at") || "").trim();

  if (!portfolioId) throw new Error("Portfolio ID is required.");
  if (!reason) throw new Error("Activity type is required.");
  validateEnum(reason, CASH_REASONS, "activity type");
  validateDate(effectiveAtRaw, "Effective date");

  const amount = Number(amountRaw);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be greater than 0.");
  if (amount > 1_000_000_000) throw new Error("Amount exceeds maximum allowed value.");

  const { data: portfolio, error: portfolioError } = await supabase
    .from("portfolios").select("id, cash_balance").eq("id", portfolioId).eq("user_id", user.id).single();
  if (portfolioError || !portfolio) throw new Error("Portfolio not found.");

  let direction: "IN" | "OUT";
  if (reason === "deposit" || reason === "dividend" || reason === "adjustment_in") {
    direction = "IN";
  } else {
    direction = "OUT";
  }

  const signedAmount = direction === "IN" ? amount : -amount;
  const newCashBalance = Number(portfolio.cash_balance) + signedAmount;

  if (newCashBalance < 0) throw new Error("This activity would make cash balance go negative.");

  const { error: ledgerError } = await supabase.from("cash_ledger").insert({
    portfolio_id: portfolioId,
    amount,
    direction,
    reason,
    effective_at: effectiveAtRaw || new Date().toISOString(),
  });
  if (ledgerError) throw new Error(ledgerError.message);

  const { error: portfolioUpdateError } = await supabase
    .from("portfolios").update({ cash_balance: newCashBalance }).eq("id", portfolioId).eq("user_id", user.id);
  if (portfolioUpdateError) throw new Error(portfolioUpdateError.message);

  revalidatePath(`/portfolios/${portfolioId}`);
}

export async function createPortfolioSnapshot(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in to save a snapshot.");

  const portfolioId = String(formData.get("portfolio_id") || "").trim();
  const totalValueRaw = String(formData.get("total_value") || "").trim();
  const snapshotDateRaw = String(formData.get("snapshot_date") || "").trim();
  const notes = String(formData.get("notes") || "").trim();

  if (!portfolioId) throw new Error("Portfolio ID is required.");
  validateDate(snapshotDateRaw, "Snapshot date");
  validateLength(notes, 2000, "Notes");

  const totalValue = Number(totalValueRaw);
  if (!Number.isFinite(totalValue) || totalValue < 0) throw new Error("Total value must be 0 or greater.");

  const { data: portfolio, error: portfolioError } = await supabase
    .from("portfolios").select("id, cash_balance").eq("id", portfolioId).eq("user_id", user.id).single();
  if (portfolioError || !portfolio) throw new Error("Portfolio not found.");

  const { error } = await supabase.from("portfolio_snapshots").insert({
    portfolio_id: portfolioId,
    total_value: totalValue,
    cash_balance: Number(portfolio.cash_balance),
    snapshot_date: snapshotDateRaw || new Date().toISOString(),
    notes: notes || null,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/portfolios/${portfolioId}`);
}
// ADD THIS FUNCTION TO THE BOTTOM OF app/portfolios/[id]/actions.ts

export async function updatePortfolio(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in.");

  const portfolioId = String(formData.get("portfolio_id") || "").trim();
  const name = String(formData.get("name") || "").trim();
  const benchmarkSymbol = String(formData.get("benchmark_symbol") || "SPY").trim();
  const status = String(formData.get("status") || "active").trim();
  const description = String(formData.get("description") || "").trim();

  if (!portfolioId) throw new Error("Portfolio ID is required.");
  if (!name) throw new Error("Portfolio name is required.");
  validateLength(name, 100, "Portfolio name");
  validateLength(description, 2000, "Description");
  validateEnum(status, PORTFOLIO_STATUSES, "status");
  validateTicker(benchmarkSymbol, "Benchmark symbol");

  const { error } = await supabase
    .from("portfolios")
    .update({
      name,
      benchmark_symbol: benchmarkSymbol,
      status,
      description: description || null,
    })
    .eq("id", portfolioId)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);

  revalidatePath(`/portfolios/${portfolioId}`);
  revalidatePath("/portfolios");
  revalidatePath("/dashboard");
}

export type CSVHoldingRow = {
  ticker: string;
  shares: number;
  average_cost_basis: number;
  company_name?: string;
  asset_type?: string;
  notes?: string;
};

export type ImportHoldingsResult = {
  imported: number;
  updated: number;
  errors: { row: number; ticker: string; message: string }[];
};

export async function importHoldingsCSV(
  portfolioId: string,
  rows: CSVHoldingRow[]
): Promise<ImportHoldingsResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated.");

  if (!portfolioId) throw new Error("Portfolio ID is required.");
  if (!rows || rows.length === 0) throw new Error("No rows to import.");
  if (rows.length > 200) throw new Error("Maximum 200 holdings per import.");

  const { data: portfolio } = await supabase
    .from("portfolios").select("id").eq("id", portfolioId).eq("user_id", user.id).single();
  if (!portfolio) throw new Error("Portfolio not found.");

  const VALID_ASSET_TYPES = ["stock", "etf", "crypto", "bond", "option", "mutual_fund", "cash_equivalent", "other"];
  const errors: ImportHoldingsResult["errors"] = [];
  const validRows: { portfolio_id: string; ticker: string; shares: number; average_cost_basis: number; company_name: string | null; asset_type: string; notes: string | null }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 1;
    const ticker = (row.ticker || "").trim().toUpperCase();

    if (!ticker || !/^[A-Z0-9.\-]{1,20}$/.test(ticker)) {
      errors.push({ row: rowNum, ticker: ticker || "(blank)", message: "Invalid ticker symbol." });
      continue;
    }
    if (!Number.isFinite(row.shares) || row.shares <= 0) {
      errors.push({ row: rowNum, ticker, message: "Shares must be greater than 0." });
      continue;
    }
    if (!Number.isFinite(row.average_cost_basis) || row.average_cost_basis < 0) {
      errors.push({ row: rowNum, ticker, message: "Average cost basis must be 0 or greater." });
      continue;
    }

    const assetType = VALID_ASSET_TYPES.includes(row.asset_type || "") ? (row.asset_type as string) : "stock";
    validRows.push({
      portfolio_id: portfolioId,
      ticker,
      shares: row.shares,
      average_cost_basis: row.average_cost_basis,
      company_name: row.company_name?.trim() || null,
      asset_type: assetType,
      notes: row.notes?.trim() || null,
    });
  }

  if (validRows.length === 0) {
    return { imported: 0, updated: 0, errors };
  }

  // Upsert: if ticker already exists in portfolio, update shares + cost basis
  const { data: existing } = await supabase
    .from("holdings").select("id, ticker").eq("portfolio_id", portfolioId);
  const existingTickers = new Set((existing ?? []).map(h => h.ticker));

  let imported = 0;
  let updated = 0;

  for (const row of validRows) {
    if (existingTickers.has(row.ticker)) {
      const { error } = await supabase.from("holdings")
        .update({ shares: row.shares, average_cost_basis: row.average_cost_basis, company_name: row.company_name, asset_type: row.asset_type, notes: row.notes })
        .eq("portfolio_id", portfolioId).eq("ticker", row.ticker);
      if (error) {
        errors.push({ row: -1, ticker: row.ticker, message: error.message });
      } else {
        updated++;
      }
    } else {
      const { error } = await supabase.from("holdings").insert(row);
      if (error) {
        errors.push({ row: -1, ticker: row.ticker, message: error.message });
      } else {
        imported++;
        existingTickers.add(row.ticker);
      }
    }
  }

  revalidatePath(`/portfolios/${portfolioId}`);
  return { imported, updated, errors };
}

export async function resetPerformanceHistory(portfolioId: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in.");

  const { data: portfolio } = await supabase
    .from("portfolios")
    .select("id, cash_balance")
    .eq("id", portfolioId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!portfolio) throw new Error("Portfolio not found.");

  // Delete all existing snapshots for this portfolio
  await supabase.from("portfolio_snapshots").delete().eq("portfolio_id", portfolioId);

  // Get current holdings for a fresh baseline snapshot
  const { data: holdings } = await supabase
    .from("holdings")
    .select("id, ticker, company_name, asset_type, shares, average_cost_basis")
    .eq("portfolio_id", portfolioId);

  const valuation = await getPortfolioValuation({
    holdings: (holdings ?? []).map((h) => ({
      id: h.id, ticker: h.ticker, company_name: h.company_name,
      asset_type: h.asset_type, shares: h.shares, average_cost_basis: h.average_cost_basis,
    })),
    cashBalance: Number(portfolio.cash_balance ?? 0),
  });

  const freshValue = valuation.total_portfolio_value;
  if (freshValue > 0 && Number.isFinite(freshValue)) {
    await supabase.from("portfolio_snapshots").insert({
      portfolio_id: portfolioId,
      total_value: freshValue,
      cash_balance: Number(portfolio.cash_balance ?? 0),
      snapshot_date: new Date().toISOString(),
      notes: "Baseline reset by user",
    });
  }

  revalidatePath(`/portfolios/${portfolioId}`);
}
