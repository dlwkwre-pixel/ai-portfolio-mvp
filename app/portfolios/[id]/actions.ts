"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { validateTicker, validateLength, validateEnum, validateDate } from "@/lib/validation";
import { getPortfolioValuation } from "@/lib/portfolio/valuation";
import { getBenchmarkHistory } from "@/lib/market-data/finnhub-benchmark";
import { getFmpQuotes } from "@/lib/market-data/fmp";
import { awardXp } from "@/lib/gamification/xp";

// "manual" = non-tradeable / advisor fund with no live price feed; valued at a
// user-entered NAV (manual_price) that the user refreshes from their statement.
const ASSET_TYPES = ["stock", "etf", "crypto", "bond", "option", "manual", "other"] as const;
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
  const manualPriceRaw = String(formData.get("manual_price") || "").trim();
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
  const isManual = assetType === "manual";

  if (!Number.isFinite(shares) || shares <= 0) throw new Error("Shares must be greater than 0.");
  if (!Number.isFinite(averageCostBasis) || averageCostBasis < 0) throw new Error("Average cost must be 0 or greater.");

  // Non-tradeable funds have no live feed, so a current NAV is required up front.
  let manualPrice: number | null = null;
  if (isManual) {
    manualPrice = Number(manualPriceRaw);
    if (!Number.isFinite(manualPrice) || manualPrice <= 0) {
      throw new Error("Enter a current NAV (price per share) for a non-tradeable fund.");
    }
  }

  const { data: portfolio, error: portfolioError } = await supabase
    .from("portfolios").select("id").eq("id", portfolioId).eq("user_id", user.id).single();
  if (portfolioError || !portfolio) throw new Error("Portfolio not found.");

  const { data: newHolding, error } = await supabase.from("holdings").insert({
    portfolio_id: portfolioId,
    ticker,
    company_name: companyName || null,
    asset_type: assetType,
    shares,
    average_cost_basis: averageCostBasis,
    manual_price: manualPrice,
    manual_price_updated_at: isManual ? new Date().toISOString() : null,
    opened_at: openedAtRaw || null,
    notes: notes || null,
  }).select("id").single();

  if (error) {
    if (error.message.toLowerCase().includes("duplicate")) {
      throw new Error("That ticker already exists in this portfolio.");
    }
    throw new Error(error.message);
  }

  // Auto-create a BUY lot so chart reconstruction works without manual lot entry.
  // Only when both purchase date and cost basis are known.
  if (newHolding && openedAtRaw && averageCostBasis > 0) {
    await supabase.from("holding_lots").insert({
      holding_id: newHolding.id,
      portfolio_id: portfolioId,
      ticker,
      lot_type: "BUY",
      purchased_at: openedAtRaw,
      shares,
      price_per_share: averageCostBasis,
    });
  }

  // XP (idempotent): per-holding award + a one-time first-holding bonus.
  if (newHolding) {
    void awardXp(user.id, "holding_added", `holding_added:${newHolding.id}`);
    void awardXp(user.id, "first_holding");
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
  const manualPriceRaw = String(formData.get("manual_price") || "").trim();
  const openedAtRaw = String(formData.get("opened_at") || "").trim();
  const notes = String(formData.get("notes") || "").trim();

  if (!holdingId) throw new Error("Holding ID is required.");
  if (!portfolioId) throw new Error("Portfolio ID is required.");
  validateEnum(assetType, ASSET_TYPES, "asset type");
  validateLength(companyName, 200, "Company name");
  validateLength(notes, 2000, "Notes");

  const shares = Number(sharesRaw);
  const averageCostBasis = Number(averageCostBasisRaw);
  const isManual = assetType === "manual";

  if (!Number.isFinite(shares) || shares <= 0) throw new Error("Shares must be greater than 0.");
  if (!Number.isFinite(averageCostBasis) || averageCostBasis < 0) throw new Error("Average cost must be 0 or greater.");

  let manualPrice: number | null = null;
  if (isManual) {
    manualPrice = Number(manualPriceRaw);
    if (!Number.isFinite(manualPrice) || manualPrice <= 0) {
      throw new Error("Enter a current NAV (price per share) for a non-tradeable fund.");
    }
  }

  // Verify the holding belongs to a portfolio owned by this user
  const { data: holding, error: holdingError } = await supabase
    .from("holdings")
    .select("id, portfolio_id, manual_price, portfolios!inner(user_id)")
    .eq("id", holdingId)
    .single();

  if (holdingError || !holding) throw new Error("Holding not found.");

  // Only stamp manual_price_updated_at when the NAV actually changed (or first set).
  const navChanged = isManual && Number(holding.manual_price ?? NaN) !== manualPrice;

  const { error } = await supabase
    .from("holdings")
    .update({
      company_name: companyName || null,
      asset_type: assetType,
      shares,
      average_cost_basis: averageCostBasis,
      manual_price: manualPrice,
      ...(isManual
        ? (navChanged ? { manual_price_updated_at: new Date().toISOString() } : {})
        : { manual_price_updated_at: null }),
      notes: notes || null,
      opened_at: openedAtRaw || null,
    })
    .eq("id", holdingId);

  if (error) throw new Error(error.message);

  revalidatePath(`/portfolios/${portfolioId}`);
}

// Lightweight "Update NAV" action for non-tradeable funds — refreshes just the
// user-entered price without re-validating the whole holding form.
export async function updateManualNav(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in to update a NAV.");

  const holdingId = String(formData.get("holding_id") || "").trim();
  const portfolioId = String(formData.get("portfolio_id") || "").trim();
  const manualPrice = Number(String(formData.get("manual_price") || "").trim());

  if (!holdingId) throw new Error("Holding ID is required.");
  if (!portfolioId) throw new Error("Portfolio ID is required.");
  if (!Number.isFinite(manualPrice) || manualPrice <= 0) throw new Error("Enter a valid NAV greater than 0.");

  // Verify ownership before mutating.
  const { data: holding, error: holdingError } = await supabase
    .from("holdings")
    .select("id, portfolios!inner(user_id)")
    .eq("id", holdingId)
    .single();
  if (holdingError || !holding) throw new Error("Holding not found.");

  const { error } = await supabase
    .from("holdings")
    .update({ manual_price: manualPrice, manual_price_updated_at: new Date().toISOString() })
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

function localCalculateTwr(
  snapshots: { snapshot_date: string; total_value: number }[],
  cashFlows: { effective_at: string; direction: string | null; amount: number | string }[]
): number | null {
  if (snapshots.length < 2) return null;
  function toDateKey(d: string) { return new Date(d).toISOString().slice(0, 10); }
  const flowByDate = new Map<string, number>();
  for (const cf of cashFlows) {
    const date = toDateKey(cf.effective_at);
    const signed = ((cf.direction || "").toUpperCase() === "OUT" ? -1 : 1) * Number(cf.amount ?? 0);
    flowByDate.set(date, (flowByDate.get(date) ?? 0) + signed);
  }
  let twr = 1;
  for (let i = 1; i < snapshots.length; i++) {
    const prevDate = toDateKey(snapshots[i - 1].snapshot_date);
    const currDate = toDateKey(snapshots[i].snapshot_date);
    let cf = 0;
    for (const [d, v] of flowByDate) { if (d > prevDate && d <= currDate) cf += v; }
    const denom = snapshots[i - 1].total_value + cf * 0.5;
    if (denom <= 0) continue;
    twr *= 1 + (snapshots[i].total_value - snapshots[i - 1].total_value - cf) / denom;
  }
  return (twr - 1) * 100;
}

export async function previewCashActivityDeletion(entryId: string, portfolioId: string): Promise<{
  currentTwr: number | null;
  simulatedTwr: number | null;
  amount: number;
  direction: string;
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const { data: portfolio } = await supabase.from("portfolios").select("id").eq("id", portfolioId).eq("user_id", user.id).single();
  if (!portfolio) throw new Error("Portfolio not found.");

  const [{ data: snapshotsRaw }, { data: allFlows }, { data: entry }] = await Promise.all([
    supabase.from("portfolio_snapshots").select("snapshot_date, total_value").eq("portfolio_id", portfolioId).order("snapshot_date", { ascending: true }),
    supabase.from("cash_ledger").select("id, effective_at, direction, amount").eq("portfolio_id", portfolioId),
    supabase.from("cash_ledger").select("id, amount, direction").eq("id", entryId).eq("portfolio_id", portfolioId).single(),
  ]);

  const snapshots = (snapshotsRaw ?? []).map((s) => ({ snapshot_date: s.snapshot_date, total_value: Number(s.total_value) }));
  const flows = allFlows ?? [];
  const currentTwr = localCalculateTwr(snapshots, flows);
  const simulatedTwr = localCalculateTwr(snapshots, flows.filter((f) => f.id !== entryId));

  return {
    currentTwr,
    simulatedTwr,
    amount: entry ? Number(entry.amount) : 0,
    direction: entry?.direction ?? "IN",
  };
}

export async function deleteCashActivity(entryId: string, portfolioId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in.");

  const { data: portfolio, error: portfolioError } = await supabase
    .from("portfolios").select("id, cash_balance").eq("id", portfolioId).eq("user_id", user.id).single();
  if (portfolioError || !portfolio) throw new Error("Portfolio not found.");

  const { data: entry, error: entryError } = await supabase
    .from("cash_ledger").select("id, amount, direction, reason, effective_at, portfolio_id").eq("id", entryId).eq("portfolio_id", portfolioId).single();
  if (entryError || !entry) throw new Error("Cash activity entry not found.");

  const reversal = entry.direction === "IN" ? -Number(entry.amount) : Number(entry.amount);
  const newBalance = Number(portfolio.cash_balance) + reversal;
  if (newBalance < 0) throw new Error("Deleting this entry would make cash balance negative. Edit or adjust other entries first.");

  // Archive first so it can be restored
  await supabase.from("cash_ledger_archive").insert({
    original_id: entry.id,
    portfolio_id: entry.portfolio_id,
    amount: entry.amount,
    direction: entry.direction,
    reason: entry.reason,
    effective_at: entry.effective_at,
  });

  const { error: deleteError } = await supabase.from("cash_ledger").delete().eq("id", entryId).eq("portfolio_id", portfolioId);
  if (deleteError) throw new Error(deleteError.message);

  const { error: updateError } = await supabase.from("portfolios").update({ cash_balance: newBalance }).eq("id", portfolioId).eq("user_id", user.id);
  if (updateError) throw new Error(updateError.message);

  revalidatePath(`/portfolios/${portfolioId}`);
}

export async function restoreCashActivity(archiveId: string, portfolioId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in.");

  const { data: portfolio, error: portfolioError } = await supabase
    .from("portfolios").select("id, cash_balance").eq("id", portfolioId).eq("user_id", user.id).single();
  if (portfolioError || !portfolio) throw new Error("Portfolio not found.");

  const { data: archived, error: archiveError } = await supabase
    .from("cash_ledger_archive").select("*").eq("id", archiveId).eq("portfolio_id", portfolioId).single();
  if (archiveError || !archived) throw new Error("Archived entry not found.");

  const reapply = archived.direction === "IN" ? Number(archived.amount) : -Number(archived.amount);
  const newBalance = Number(portfolio.cash_balance) + reapply;
  if (newBalance < 0) throw new Error("Restoring this entry would make cash balance negative.");

  const { error: insertError } = await supabase.from("cash_ledger").insert({
    portfolio_id: archived.portfolio_id,
    amount: archived.amount,
    direction: archived.direction,
    reason: archived.reason,
    effective_at: archived.effective_at,
  });
  if (insertError) throw new Error(insertError.message);

  await supabase.from("cash_ledger_archive").delete().eq("id", archiveId).eq("portfolio_id", portfolioId);

  const { error: updateError } = await supabase.from("portfolios").update({ cash_balance: newBalance }).eq("id", portfolioId).eq("user_id", user.id);
  if (updateError) throw new Error(updateError.message);

  revalidatePath(`/portfolios/${portfolioId}`);
}

export async function updateCashActivity(entryId: string, portfolioId: string, newAmount: number, newReason: string, newEffectiveAt: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in.");

  if (!Number.isFinite(newAmount) || newAmount <= 0) throw new Error("Amount must be greater than 0.");
  if (newAmount > 1_000_000_000) throw new Error("Amount exceeds maximum allowed value.");
  validateEnum(newReason, CASH_REASONS, "activity type");
  validateDate(newEffectiveAt, "Effective date");

  const { data: portfolio, error: portfolioError } = await supabase
    .from("portfolios").select("id, cash_balance").eq("id", portfolioId).eq("user_id", user.id).single();
  if (portfolioError || !portfolio) throw new Error("Portfolio not found.");

  const { data: entry, error: entryError } = await supabase
    .from("cash_ledger").select("id, amount, direction, portfolio_id").eq("id", entryId).eq("portfolio_id", portfolioId).single();
  if (entryError || !entry) throw new Error("Cash activity entry not found.");

  const oldSigned = entry.direction === "IN" ? Number(entry.amount) : -Number(entry.amount);
  const newDirection: "IN" | "OUT" = ["deposit", "dividend", "adjustment_in"].includes(newReason) ? "IN" : "OUT";
  const newSigned = newDirection === "IN" ? newAmount : -newAmount;

  const newBalance = Number(portfolio.cash_balance) - oldSigned + newSigned;
  if (newBalance < 0) throw new Error("This change would make cash balance negative.");

  const { error: updateLedgerError } = await supabase.from("cash_ledger").update({
    amount: newAmount,
    direction: newDirection,
    reason: newReason,
    effective_at: newEffectiveAt,
  }).eq("id", entryId).eq("portfolio_id", portfolioId);
  if (updateLedgerError) throw new Error(updateLedgerError.message);

  const { error: updatePortfolioError } = await supabase.from("portfolios").update({ cash_balance: newBalance }).eq("id", portfolioId).eq("user_id", user.id);
  if (updatePortfolioError) throw new Error(updatePortfolioError.message);

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
  manual_price?: number; // current NAV for asset_type === "manual" (non-tradeable funds)
};

// Check which tickers resolve to a real, priceable security (single batched FMP call per
// chunk). Used by the CSV importer to flag positions it can't identify so the user can mark
// them as non-tradeable funds (or fix a typo). Returns [] missing if no data source is
// available, so we never wrongly flag everything.
export async function resolveTickers(tickers: string[]): Promise<{ missing: string[] }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { missing: [] };

  const clean = [...new Set(
    tickers.map((t) => (t || "").trim().toUpperCase()).filter((t) => /^[A-Z0-9.\-]{1,20}$/.test(t))
  )].slice(0, 200);
  if (clean.length === 0) return { missing: [] };

  const found = new Set<string>();
  let anyData = false;
  const CHUNK = 40;
  for (let i = 0; i < clean.length; i += CHUNK) {
    const chunk = clean.slice(i, i + CHUNK);
    try {
      const map = await getFmpQuotes(chunk);
      if (map.size > 0) anyData = true;
      for (const t of chunk) if (map.has(t)) found.add(t);
    } catch { /* ignore chunk failure */ }
  }
  if (!anyData) return { missing: [] };
  return { missing: clean.filter((t) => !found.has(t)) };
}

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

  const VALID_ASSET_TYPES = ["stock", "etf", "crypto", "bond", "option", "mutual_fund", "cash_equivalent", "manual", "other"];
  const errors: ImportHoldingsResult["errors"] = [];
  const validRows: { portfolio_id: string; ticker: string; shares: number; average_cost_basis: number; company_name: string | null; asset_type: string; notes: string | null; manual_price: number | null; manual_price_updated_at: string | null }[] = [];

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
    const isManual = assetType === "manual";
    let manualPrice: number | null = null;
    if (isManual) {
      manualPrice = Number(row.manual_price);
      if (!Number.isFinite(manualPrice) || manualPrice <= 0) {
        errors.push({ row: rowNum, ticker, message: "Non-tradeable fund needs a current NAV." });
        continue;
      }
    }
    validRows.push({
      portfolio_id: portfolioId,
      ticker,
      shares: row.shares,
      average_cost_basis: row.average_cost_basis,
      company_name: row.company_name?.trim() || null,
      asset_type: assetType,
      notes: row.notes?.trim() || null,
      manual_price: manualPrice,
      manual_price_updated_at: isManual ? new Date().toISOString() : null,
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
        .update({ shares: row.shares, average_cost_basis: row.average_cost_basis, company_name: row.company_name, asset_type: row.asset_type, notes: row.notes, manual_price: row.manual_price, manual_price_updated_at: row.manual_price_updated_at })
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
    .select("id, ticker, company_name, asset_type, shares, average_cost_basis, manual_price, manual_price_updated_at")
    .eq("portfolio_id", portfolioId);

  const valuation = await getPortfolioValuation({
    holdings: (holdings ?? []).map((h) => ({
      id: h.id, ticker: h.ticker, company_name: h.company_name,
      asset_type: h.asset_type, shares: h.shares, average_cost_basis: h.average_cost_basis,
      manual_price: h.manual_price, manual_price_updated_at: h.manual_price_updated_at,
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

export async function setDirectCashBalance(portfolioId: string, newBalance: number): Promise<void> {
  "use server";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  if (!Number.isFinite(newBalance) || newBalance < 0) throw new Error("Cash balance must be a non-negative number.");
  if (newBalance > 1_000_000_000) throw new Error("Amount exceeds maximum allowed value.");

  const { data: portfolio } = await supabase
    .from("portfolios").select("id").eq("id", portfolioId).eq("user_id", user.id).maybeSingle();
  if (!portfolio) throw new Error("Portfolio not found.");

  const { error } = await supabase
    .from("portfolios")
    .update({ cash_balance: newBalance })
    .eq("id", portfolioId)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath(`/portfolios/${portfolioId}`);
}

export async function trimSnapshotsBefore(portfolioId: string, cutoffDate: string): Promise<{ deleted: number }> {
  "use server";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const { data: portfolio } = await supabase
    .from("portfolios").select("id").eq("id", portfolioId).eq("user_id", user.id).maybeSingle();
  if (!portfolio) throw new Error("Portfolio not found.");

  // Normalize to ISO date string (YYYY-MM-DD) for comparison
  const cutoff = new Date(cutoffDate).toISOString().slice(0, 10);

  const { data: toDelete } = await supabase
    .from("portfolio_snapshots")
    .select("id")
    .eq("portfolio_id", portfolioId)
    .lt("snapshot_date", cutoff + "T00:00:00");

  const count = toDelete?.length ?? 0;
  if (count > 0) {
    await supabase
      .from("portfolio_snapshots")
      .delete()
      .eq("portfolio_id", portfolioId)
      .lt("snapshot_date", cutoff + "T00:00:00");
  }

  revalidatePath(`/portfolios/${portfolioId}`);
  return { deleted: count };
}

export async function removePolygonBackfill(portfolioId: string): Promise<{ deleted: number }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const { data: portfolio } = await supabase
    .from("portfolios").select("id").eq("id", portfolioId).eq("user_id", user.id).maybeSingle();
  if (!portfolio) throw new Error("Portfolio not found.");

  const { data: toDelete } = await supabase
    .from("portfolio_snapshots")
    .select("id")
    .eq("portfolio_id", portfolioId)
    .eq("notes", "Polygon backfill");

  const count = toDelete?.length ?? 0;
  if (count > 0) {
    await supabase
      .from("portfolio_snapshots")
      .delete()
      .eq("portfolio_id", portfolioId)
      .eq("notes", "Polygon backfill");
  }

  revalidatePath(`/portfolios/${portfolioId}`);
  return { deleted: count };
}

type ReconstructResult =
  | { success: true; inserted: number; tickers: string[]; cashFlows: number; missingFromChart: string[]; guessedDates: string[] }
  | { success: false; error: string };

export async function reconstructPortfolioChart(portfolioId: string): Promise<ReconstructResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not signed in." };

    const { data: portfolio } = await supabase
      .from("portfolios").select("id, created_at").eq("id", portfolioId).eq("user_id", user.id).single();
    if (!portfolio) return { success: false, error: "Portfolio not found." };

    // Lots take precedence over opened_at + cost_basis for multi-purchase holdings.
    // Transactions are used only as a last-resort date resolver for holdings with neither.
    const [{ data: holdings, error: holdingsErr }, { data: txData }, { data: lotsData }] = await Promise.all([
      supabase.from("holdings").select("id, ticker, shares, opened_at, average_cost_basis").eq("portfolio_id", portfolioId),
      supabase.from("portfolio_transactions")
        .select("ticker, traded_at, transaction_type")
        .eq("portfolio_id", portfolioId)
        .order("traded_at", { ascending: true }),
      supabase.from("holding_lots")
        .select("id, holding_id, lot_type, purchased_at, shares, price_per_share, ticker")
        .eq("portfolio_id", portfolioId)
        .order("purchased_at", { ascending: true }),
    ]);

    if (holdingsErr) return { success: false, error: `Holdings query failed: ${holdingsErr.message}` };

    // Group lots by holding_id; preserve lot_type for sell-aware share/cash calculations
    type LotEntry = { date: string; shares: number; price: number; type: "BUY" | "SELL" | "DRIP" };
    const lotsByHoldingId = new Map<string, LotEntry[]>();
    for (const lot of lotsData ?? []) {
      const key = lot.holding_id as string;
      if (!lotsByHoldingId.has(key)) lotsByHoldingId.set(key, []);
      lotsByHoldingId.get(key)!.push({
        date: (lot.purchased_at as string).slice(0, 10),
        shares: Number(lot.shares),
        price: Number(lot.price_per_share),
        type: ((lot.lot_type as string | null) ?? "BUY").toUpperCase() as "BUY" | "SELL" | "DRIP",
      });
    }

    // Build earliest BUY date per ticker from transactions — used only when no lots and no opened_at
    const firstBuyMap = new Map<string, string>();
    for (const tx of txData ?? []) {
      if (!tx.traded_at) continue;
      if ((tx.transaction_type as string).toUpperCase() !== "BUY") continue;
      const date = (tx.traded_at as string).slice(0, 10);
      if (!firstBuyMap.has(tx.ticker as string)) firstBuyMap.set(tx.ticker as string, date);
    }

    // Resolve each holding: lots (preferred) → opened_at → first BUY tx date → portfolio.created_at → skip
    type HoldingEntry = { id: string; ticker: string; shares: number; openedAt: string; costBasis: number; lots: LotEntry[] };
    const holdingEntries: HoldingEntry[] = [];
    const missingDate: string[] = [];
    const guessedDateTickers: string[] = []; // holdings that fell back to portfolio.created_at

    // Ultimate fallback: portfolio creation date (represents "held since I started tracking")
    const portfolioCreatedAt = portfolio.created_at
      ? (portfolio.created_at as string).slice(0, 10)
      : null;

    for (const h of holdings ?? []) {
      if (!h.shares || Number(h.shares) <= 0) continue;
      const lots = lotsByHoldingId.get(h.id) ?? [];

      if (lots.length > 0) {
        const buyLots = lots.filter((l) => l.type === "BUY" || l.type === "DRIP");
        if (buyLots.length === 0) {
          missingDate.push(h.ticker as string);
          continue;
        }
        const earliestBuy = buyLots.reduce((min, l) => (l.date < min.date ? l : min));
        holdingEntries.push({
          id: h.id,
          ticker: h.ticker as string,
          shares: Number(h.shares),
          openedAt: earliestBuy.date,
          costBasis: Number(h.average_cost_basis ?? 0),
          lots,
        });
      } else {
        const costBasis = Number(h.average_cost_basis ?? 0);
        // Resolution order: opened_at → first BUY tx → portfolio.created_at (if cost basis known)
        const resolvedFromTx = firstBuyMap.get(h.ticker as string) ?? null;
        const resolvedDate = h.opened_at
          ? (h.opened_at as string).slice(0, 10)
          : resolvedFromTx
          ?? (costBasis > 0 && portfolioCreatedAt ? portfolioCreatedAt : null);

        if (!resolvedDate) {
          missingDate.push(h.ticker as string);
          continue;
        }

        const usedPortfolioDate = !h.opened_at && !resolvedFromTx && costBasis > 0;
        if (usedPortfolioDate) guessedDateTickers.push(h.ticker as string);

        if (!h.opened_at) {
          await supabase.from("holdings").update({ opened_at: resolvedDate })
            .eq("id", h.id).eq("portfolio_id", portfolioId);
        }
        holdingEntries.push({
          id: h.id,
          ticker: h.ticker as string,
          shares: Number(h.shares),
          openedAt: resolvedDate,
          costBasis,
          lots: [],
        });
      }
    }

    if (holdingEntries.length === 0) {
      return {
        success: false,
        error: `No holdings with purchase dates. Missing: ${missingDate.join(", ")}. Open each holding and set a purchase date or add lots via Purchase History.`,
      };
    }

    // Fetch price history for all resolved tickers
    const tickers = [...new Set(holdingEntries.map((h) => h.ticker))];
    const priceResults = await Promise.allSettled(
      tickers.map(async (ticker) => ({ ticker, bars: await getBenchmarkHistory(ticker, "MAX", false, true) }))
    );

    const priceMap = new Map<string, Map<string, number>>();
    const successfulTickers: string[] = [];
    const failedTickers: string[] = [];
    for (const r of priceResults) {
      if (r.status === "fulfilled" && r.value.bars.length > 0) {
        const m = new Map<string, number>();
        for (const bar of r.value.bars) {
          // Use adjClose only — it accounts for splits and dividends.
          // Never fall back to close: unadjusted close is wrong for split stocks (e.g. NVDA 10:1).
          if (bar.adjClose > 0) m.set(bar.date, bar.adjClose);
        }
        if (m.size > 0) {
          priceMap.set(r.value.ticker, m);
          successfulTickers.push(r.value.ticker);
        } else {
          failedTickers.push(r.value.ticker);
        }
      } else {
        failedTickers.push(r.status === "fulfilled" ? r.value.ticker : "unknown");
      }
    }
    if (successfulTickers.length === 0) {
      return { success: false, error: `No price history available. Failed: ${failedTickers.join(", ")}. Check FMP_API_KEY.` };
    }

    function priceOn(m: Map<string, number>, targetDate: string): number | null {
      for (let i = 0; i <= 7; i++) {
        const d = new Date(targetDate + "T12:00:00Z");
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        if (m.has(key)) return m.get(key)!;
      }
      return null;
    }

    // Lot-aware shares on a given date: net buys minus sells up to that date.
    // After the last recorded lot, snap to holdings.shares to capture any unlogged activity.
    function sharesOnDate(h: HoldingEntry, date: string): number {
      if (h.lots.length > 0) {
        const lotsOnDate = h.lots.filter((l) => l.date <= date);
        if (lotsOnDate.length === 0) return 0;
        const netShares = lotsOnDate.reduce(
          (sum, l) => (l.type === "SELL" ? sum - l.shares : sum + l.shares), // DRIP adds shares same as BUY
          0
        );
        const lastLotDate = h.lots[h.lots.length - 1].date;
        return date >= lastLotDate ? Math.max(0, Math.min(netShares, h.shares)) : Math.max(0, netShares);
      }
      return date >= h.openedAt ? h.shares : 0;
    }

    // Date range: earliest openedAt across all holdings → today, weekly snapshots
    const earliest = holdingEntries.reduce((min, h) => (h.openedAt < min ? h.openedAt : min), holdingEntries[0].openedAt);
    const today = new Date().toISOString().slice(0, 10);
    const dates: string[] = [];
    const cur = new Date(earliest + "T12:00:00Z");
    while (cur.toISOString().slice(0, 10) <= today) {
      dates.push(cur.toISOString().slice(0, 10));
      cur.setDate(cur.getDate() + 7);
    }
    if (dates[dates.length - 1] !== today) dates.push(today);

    // Build snapshots using lot-aware share counts
    const snapshotRows: { portfolio_id: string; total_value: number; cash_balance: number; snapshot_date: string; notes: string }[] = [];
    for (const date of dates) {
      let total = 0;
      let hasData = false;
      for (const h of holdingEntries) {
        if (!successfulTickers.includes(h.ticker)) continue;
        if (date < h.openedAt) continue;
        const shares = sharesOnDate(h, date);
        if (shares <= 0) continue;
        const m = priceMap.get(h.ticker);
        if (!m) continue;
        const p = priceOn(m, date);
        if (p && p > 0) { total += shares * p; hasData = true; }
      }
      if (hasData && total > 0) {
        snapshotRows.push({
          portfolio_id: portfolioId,
          total_value: Math.round(total * 100) / 100,
          cash_balance: 0,
          snapshot_date: new Date(date + "T20:00:00Z").toISOString(),
          notes: "Reconstructed from holdings",
        });
      }
    }
    if (snapshotRows.length === 0) return { success: false, error: "No price data found. Tickers may not have FMP history coverage." };

    // Cash flows: one per lot (lots mode) OR one per holding via cost basis (fallback)
    const cashLedgerRows: { portfolio_id: string; amount: number; direction: string; reason: string; effective_at: string }[] = [];
    for (const h of holdingEntries) {
      if (!successfulTickers.includes(h.ticker)) continue;
      if (h.lots.length > 0) {
        for (const lot of h.lots) {
          const amount = Math.round(lot.shares * lot.price * 100) / 100;
          if (amount <= 0) continue;
          cashLedgerRows.push({
            portfolio_id: portfolioId,
            amount,
            direction: lot.type === "SELL" ? "OUT" : "IN", // BUY and DRIP both treated as capital inflows
            reason: `${h.ticker} (Reconstructed)`,
            effective_at: new Date(lot.date + "T12:00:00Z").toISOString(),
          });
        }
      } else {
        if (h.costBasis <= 0) continue;
        const amount = Math.round(h.shares * h.costBasis * 100) / 100;
        if (amount <= 0) continue;
        cashLedgerRows.push({
          portfolio_id: portfolioId,
          amount,
          direction: "IN",
          reason: `${h.ticker} (Reconstructed)`,
          effective_at: new Date(h.openedAt + "T12:00:00Z").toISOString(),
        });
      }
    }

    await supabase.from("portfolio_snapshots").delete().eq("portfolio_id", portfolioId);
    await supabase.from("cash_ledger").delete().eq("portfolio_id", portfolioId);
    await supabase.from("portfolios").update({ cash_balance: 0 }).eq("id", portfolioId).eq("user_id", user.id);

    if (cashLedgerRows.length > 0) {
      const { error: cashErr } = await supabase.from("cash_ledger").insert(cashLedgerRows);
      if (cashErr) return { success: false, error: `Cash flow insert failed: ${cashErr.message}` };
    }

    const { error: insertErr } = await supabase.from("portfolio_snapshots").insert(snapshotRows);
    if (insertErr) return { success: false, error: `Insert failed: ${insertErr.message}` };

    const allHoldingTickers = (holdings ?? []).map((h) => h.ticker as string);
    const missingFromChart = allHoldingTickers.filter(
      (t) => missingDate.includes(t) || !successfulTickers.includes(t)
    );

    revalidatePath(`/portfolios/${portfolioId}`);
    return {
      success: true,
      inserted: snapshotRows.length,
      tickers: successfulTickers.filter((t) => holdingEntries.some((h) => h.ticker === t)),
      cashFlows: cashLedgerRows.length,
      missingFromChart,
      guessedDates: guessedDateTickers,
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Unexpected error during reconstruction." };
  }
}

export async function backfillOpenedAt(portfolioId: string): Promise<{ updated: number; skipped: string[] }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const { data: portfolio } = await supabase
    .from("portfolios").select("id").eq("id", portfolioId).eq("user_id", user.id).single();
  if (!portfolio) throw new Error("Portfolio not found.");

  const { data: holdings } = await supabase
    .from("holdings").select("id, ticker, opened_at").eq("portfolio_id", portfolioId);

  const needsDate = (holdings ?? []).filter((h) => !h.opened_at);
  if (needsDate.length === 0) return { updated: 0, skipped: [] };

  const { data: transactions } = await supabase
    .from("portfolio_transactions")
    .select("ticker, traded_at, transaction_type")
    .eq("portfolio_id", portfolioId)
    .order("traded_at", { ascending: true });

  const txMap = new Map<string, string>();
  for (const tx of transactions ?? []) {
    if (tx.transaction_type === "BUY" && tx.traded_at && !txMap.has(tx.ticker)) {
      txMap.set(tx.ticker, tx.traded_at.slice(0, 10));
    }
  }

  const skipped: string[] = [];
  let updated = 0;

  for (const h of needsDate) {
    const date = txMap.get(h.ticker as string);
    if (!date) { skipped.push(h.ticker as string); continue; }
    await supabase.from("holdings").update({ opened_at: date }).eq("id", h.id).eq("portfolio_id", portfolioId);
    updated++;
  }

  revalidatePath(`/portfolios/${portfolioId}`);
  return { updated, skipped };
}

export async function createHoldingLot(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const holdingId = formData.get("holding_id") as string;
  const portfolioId = formData.get("portfolio_id") as string;
  const ticker = formData.get("ticker") as string;
  const purchasedAt = formData.get("purchased_at") as string;
  const shares = Number(formData.get("shares"));
  const pricePerShare = Number(formData.get("price_per_share"));
  const lotType = (formData.get("lot_type") as string | null) ?? "BUY";

  if (!holdingId || !portfolioId || !purchasedAt || !shares || !pricePerShare) {
    throw new Error("Date, shares, and price per share are required.");
  }
  if (shares <= 0 || pricePerShare <= 0) throw new Error("Shares and price must be greater than 0.");
  if (!["BUY", "SELL", "DRIP"].includes(lotType)) throw new Error("Lot type must be BUY, SELL, or DRIP.");

  const { data: portfolio } = await supabase.from("portfolios")
    .select("id").eq("id", portfolioId).eq("user_id", user.id).single();
  if (!portfolio) throw new Error("Portfolio not found.");

  const { error } = await supabase.from("holding_lots").insert({
    holding_id: holdingId,
    portfolio_id: portfolioId,
    ticker,
    lot_type: lotType,
    purchased_at: purchasedAt,
    shares,
    price_per_share: pricePerShare,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/portfolios/${portfolioId}`);
}

export async function updateHoldingLot(
  lotId: string,
  portfolioId: string,
  lotType: string,
  purchasedAt: string,
  shares: number,
  pricePerShare: number,
): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  if (!["BUY", "SELL", "DRIP"].includes(lotType)) throw new Error("Invalid lot type.");
  if (shares <= 0 || pricePerShare <= 0) throw new Error("Shares and price must be greater than 0.");

  const { data: portfolio } = await supabase.from("portfolios")
    .select("id").eq("id", portfolioId).eq("user_id", user.id).single();
  if (!portfolio) throw new Error("Portfolio not found.");

  const { error } = await supabase.from("holding_lots")
    .update({ lot_type: lotType, purchased_at: purchasedAt, shares, price_per_share: pricePerShare })
    .eq("id", lotId).eq("portfolio_id", portfolioId);
  if (error) throw new Error(error.message);

  revalidatePath(`/portfolios/${portfolioId}`);
}

export async function deleteHoldingLot(lotId: string, portfolioId: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const { data: portfolio } = await supabase.from("portfolios")
    .select("id").eq("id", portfolioId).eq("user_id", user.id).single();
  if (!portfolio) throw new Error("Portfolio not found.");

  const { error } = await supabase.from("holding_lots")
    .delete().eq("id", lotId).eq("portfolio_id", portfolioId);
  if (error) throw new Error(error.message);

  revalidatePath(`/portfolios/${portfolioId}`);
}

export type AutoImportResult = {
  created: number;
  skipped: string[];
  alreadyHaveLots: string[];
  errors: string[];
};

export async function getHoldingsForChartSetup(portfolioId: string): Promise<{
  id: string;
  ticker: string;
  shares: number;
  average_cost_basis: number | null;
  opened_at: string | null;
  lots: { id: string; lot_type: string; purchased_at: string; shares: number; price_per_share: number }[];
}[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const { data: portfolio } = await supabase.from("portfolios").select("id").eq("id", portfolioId).eq("user_id", user.id).single();
  if (!portfolio) throw new Error("Portfolio not found.");

  const [{ data: holdings }, { data: lots }] = await Promise.all([
    supabase.from("holdings")
      .select("id, ticker, shares, average_cost_basis, opened_at")
      .eq("portfolio_id", portfolioId)
      .order("ticker"),
    supabase.from("holding_lots")
      .select("id, holding_id, lot_type, purchased_at, shares, price_per_share")
      .eq("portfolio_id", portfolioId)
      .order("purchased_at", { ascending: true }),
  ]);

  const lotsByHolding = new Map<string, { id: string; lot_type: string; purchased_at: string; shares: number; price_per_share: number }[]>();
  for (const lot of lots ?? []) {
    const key = lot.holding_id as string;
    if (!lotsByHolding.has(key)) lotsByHolding.set(key, []);
    lotsByHolding.get(key)!.push({
      id: lot.id as string,
      lot_type: lot.lot_type as string,
      purchased_at: String(lot.purchased_at).slice(0, 10),
      shares: Number(lot.shares),
      price_per_share: Number(lot.price_per_share),
    });
  }

  return (holdings ?? []).map((h) => ({
    id: h.id as string,
    ticker: h.ticker as string,
    shares: Number(h.shares),
    average_cost_basis: h.average_cost_basis != null ? Number(h.average_cost_basis) : null,
    opened_at: h.opened_at as string | null,
    lots: lotsByHolding.get(h.id as string) ?? [],
  }));
}

export async function autoImportLots(portfolioId: string): Promise<AutoImportResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const { data: portfolio } = await supabase
    .from("portfolios").select("id, created_at").eq("id", portfolioId).eq("user_id", user.id).single();
  if (!portfolio) throw new Error("Portfolio not found.");

  const portfolioDate = (portfolio.created_at as string).slice(0, 10);

  const [{ data: holdings }, { data: existingLots }, { data: transactions }] = await Promise.all([
    supabase.from("holdings")
      .select("id, ticker, shares, average_cost_basis, opened_at")
      .eq("portfolio_id", portfolioId),
    supabase.from("holding_lots")
      .select("holding_id")
      .eq("portfolio_id", portfolioId)
      .then((r) => r, () => ({ data: null, error: null })),
    supabase.from("portfolio_transactions")
      .select("ticker, traded_at, transaction_type, quantity, price_per_share")
      .eq("portfolio_id", portfolioId)
      .order("traded_at", { ascending: true }),
  ]);

  const holdingsWithLots = new Set((existingLots ?? []).map((l) => l.holding_id as string));

  // BUY transactions grouped by ticker (AI paper trades — prices may be approximate)
  const txByTicker = new Map<string, { date: string; shares: number; price: number }[]>();
  for (const tx of transactions ?? []) {
    if ((tx.transaction_type as string).toUpperCase() !== "BUY") continue;
    if (!tx.traded_at || !tx.quantity || !tx.price_per_share) continue;
    const ticker = tx.ticker as string;
    if (!txByTicker.has(ticker)) txByTicker.set(ticker, []);
    txByTicker.get(ticker)!.push({
      date: (tx.traded_at as string).slice(0, 10),
      shares: Number(tx.quantity),
      price: Number(tx.price_per_share),
    });
  }

  let created = 0;
  const skipped: string[] = [];
  const alreadyHaveLots: string[] = [];
  const errors: string[] = [];

  for (const h of holdings ?? []) {
    if (holdingsWithLots.has(h.id)) {
      alreadyHaveLots.push(h.ticker as string);
      continue;
    }

    const ticker = h.ticker as string;
    const costBasis = Number(h.average_cost_basis ?? 0);
    const txs = txByTicker.get(ticker) ?? [];

    type LotRow = { holding_id: string; portfolio_id: string; ticker: string; lot_type: string; purchased_at: string; shares: number; price_per_share: number };
    let rows: LotRow[] = [];

    if (txs.length > 0) {
      // Create one lot per BUY transaction
      rows = txs.map((t) => ({
        holding_id: h.id,
        portfolio_id: portfolioId,
        ticker,
        lot_type: "BUY",
        purchased_at: t.date,
        shares: t.shares,
        price_per_share: t.price,
      }));
    } else if (costBasis > 0) {
      // Synthesize a single lot from known cost basis
      const date = h.opened_at
        ? (h.opened_at as string).slice(0, 10)
        : portfolioDate;
      rows = [{
        holding_id: h.id,
        portfolio_id: portfolioId,
        ticker,
        lot_type: "BUY",
        purchased_at: date,
        shares: Number(h.shares),
        price_per_share: costBasis,
      }];
    } else {
      skipped.push(ticker);
      continue;
    }

    const { error } = await supabase.from("holding_lots").insert(rows);
    if (error) {
      errors.push(`${ticker}: ${error.message}`);
    } else {
      created += rows.length;
      if (!h.opened_at) {
        const earliest = rows.reduce((min, r) => r.purchased_at < min ? r.purchased_at : min, rows[0].purchased_at);
        await supabase.from("holdings")
          .update({ opened_at: earliest })
          .eq("id", h.id).eq("portfolio_id", portfolioId);
      }
    }
  }

  revalidatePath(`/portfolios/${portfolioId}`);
  return { created, skipped, alreadyHaveLots, errors };
}