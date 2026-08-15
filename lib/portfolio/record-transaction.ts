// Shared core of "record a trade, derive the holding from it" — used by both
// the manual Add Transaction form (app/portfolios/[id]/transaction-actions.ts)
// and the MCP record_trade tool. Pulled out so an autonomous agent reporting
// its own trades goes through the exact same cost-basis/cash-balance math as
// a human typing it in, not a second copy that could quietly drift from it.
//
// Deliberately does NOT touch the holdings table directly from a raw
// "set my shares to N" call — every mutation here is derived from a single
// trade event (this buy, this sell), inserted as an auditable
// portfolio_transactions row alongside it. If an agent ever reports
// something wrong, it shows up as a reviewable/deletable transaction, not a
// silent overwrite of the user's portfolio state.

import type { SupabaseClient } from "@supabase/supabase-js";
import { validateTicker, validateLength, validateDate } from "@/lib/validation";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, any, any>;

export type TransactionType = "buy" | "sell" | "dividend" | "deposit" | "withdrawal" | "fee" | "interest";

export type RecordTransactionInput = {
  portfolioId: string;
  userId: string;
  transactionType: TransactionType;
  ticker?: string;
  companyName?: string;
  quantity?: number | null;
  pricePerShare?: number | null;
  grossAmount?: number | null;
  fees?: number;
  notes?: string;
  tradedAt?: string;
  acquiredAt?: string | null;
};

function calculateNetCashImpact(args: { transactionType: TransactionType; grossAmount: number; fees: number }): number {
  const { transactionType, grossAmount, fees } = args;
  switch (transactionType) {
    case "buy": return -(grossAmount + fees);
    case "sell": return grossAmount - fees;
    case "dividend": return grossAmount;
    case "deposit": return grossAmount;
    case "withdrawal": return -grossAmount;
    case "fee": return -grossAmount;
    case "interest": return grossAmount;
    default: throw new Error("Unsupported transaction type.");
  }
}

export async function recordPortfolioTransaction(db: DB, input: RecordTransactionInput): Promise<{ transactionId: string }> {
  const {
    portfolioId, userId, transactionType,
    companyName = "", notes = "", tradedAt = "",
  } = input;
  const ticker = (input.ticker ?? "").trim().toUpperCase();
  const quantity = input.quantity ?? null;
  const pricePerShare = input.pricePerShare ?? null;
  const fees = input.fees ?? 0;
  let grossAmount = input.grossAmount ?? 0;

  if (!portfolioId) throw new Error("Portfolio ID is required.");
  const allowedTypes: TransactionType[] = ["buy", "sell", "dividend", "deposit", "withdrawal", "fee", "interest"];
  if (!allowedTypes.includes(transactionType)) throw new Error("Invalid transaction type.");

  const { data: portfolio, error: portfolioError } = await db
    .from("portfolios").select("id, cash_balance").eq("id", portfolioId).eq("user_id", userId).single();
  if (portfolioError || !portfolio) throw new Error("Portfolio not found.");

  validateLength(companyName, 200, "Company name");
  validateLength(notes, 2000, "Notes");
  validateDate(tradedAt, "Trade date");

  const isTrade = transactionType === "buy" || transactionType === "sell";

  if (isTrade) {
    if (!ticker) throw new Error("Ticker is required for buy and sell transactions.");
    validateTicker(ticker);
    if (quantity === null || quantity <= 0) throw new Error("Quantity must be greater than 0 for buy and sell transactions.");
    if (pricePerShare === null || pricePerShare <= 0) throw new Error("Price per share must be greater than 0 for buy and sell transactions.");
  }

  if (isTrade && grossAmount === 0 && quantity !== null && pricePerShare !== null) {
    grossAmount = quantity * pricePerShare;
  }
  if (grossAmount <= 0) throw new Error("Gross amount must be greater than 0.");

  const netCashImpact = calculateNetCashImpact({ transactionType, grossAmount, fees });

  let linkedHoldingId: string | null = null;
  let costBasisAmount: number | null = null;
  let realizedGainLoss: number | null = null;
  let realizedGainLossPct: number | null = null;

  if (transactionType === "buy") {
    const { data: existingHolding, error: existingHoldingError } = await db
      .from("holdings").select("*").eq("portfolio_id", portfolioId).eq("ticker", ticker).maybeSingle();
    if (existingHoldingError) throw new Error(existingHoldingError.message);

    if (!existingHolding) {
      const { data: newHolding, error: createHoldingError } = await db
        .from("holdings")
        .insert({ portfolio_id: portfolioId, ticker, company_name: companyName || null, shares: quantity, average_cost_basis: pricePerShare, asset_type: "stock" })
        .select().single();
      if (createHoldingError || !newHolding) throw new Error(createHoldingError?.message || "Failed to create holding.");
      linkedHoldingId = newHolding.id;
    } else {
      const oldShares = Number(existingHolding.shares ?? 0);
      const oldAvgCost = Number(existingHolding.average_cost_basis ?? 0);
      const newShares = oldShares + Number(quantity);
      const newAvgCost = newShares > 0 ? (oldShares * oldAvgCost + Number(quantity) * Number(pricePerShare)) / newShares : 0;

      const { error: updateHoldingError } = await db
        .from("holdings")
        .update({ company_name: companyName || existingHolding.company_name || null, shares: newShares, average_cost_basis: newAvgCost })
        .eq("id", existingHolding.id);
      if (updateHoldingError) throw new Error(updateHoldingError.message);
      linkedHoldingId = existingHolding.id;
    }
  }

  if (transactionType === "sell") {
    const { data: existingHolding, error: existingHoldingError } = await db
      .from("holdings").select("*").eq("portfolio_id", portfolioId).eq("ticker", ticker).maybeSingle();
    if (existingHoldingError) throw new Error(existingHoldingError.message);
    if (!existingHolding) throw new Error("Cannot sell a holding that does not exist in this portfolio.");

    const oldShares = Number(existingHolding.shares ?? 0);
    const oldAvgCost = Number(existingHolding.average_cost_basis ?? 0);
    const sellQuantity = Number(quantity);
    if (sellQuantity > oldShares) throw new Error("Cannot sell more shares than currently owned.");

    const remainingShares = oldShares - sellQuantity;
    costBasisAmount = sellQuantity * oldAvgCost;
    realizedGainLoss = grossAmount - fees - costBasisAmount;
    realizedGainLossPct = costBasisAmount > 0 ? (realizedGainLoss / costBasisAmount) * 100 : null;

    if (remainingShares === 0) {
      const { error: deleteHoldingError } = await db.from("holdings").delete().eq("id", existingHolding.id);
      if (deleteHoldingError) throw new Error(deleteHoldingError.message);
      linkedHoldingId = null;
    } else {
      const { error: updateHoldingError } = await db
        .from("holdings")
        .update({ company_name: companyName || existingHolding.company_name || null, shares: remainingShares })
        .eq("id", existingHolding.id);
      if (updateHoldingError) throw new Error(updateHoldingError.message);
      linkedHoldingId = existingHolding.id;
    }
  }

  const { data: txRow, error: insertTransactionError } = await db
    .from("portfolio_transactions")
    .insert({
      portfolio_id: portfolioId,
      holding_id: linkedHoldingId,
      transaction_type: transactionType,
      ticker: ticker || null,
      company_name: companyName || null,
      quantity,
      price_per_share: pricePerShare,
      gross_amount: grossAmount,
      fees,
      net_cash_impact: netCashImpact,
      cost_basis_amount: costBasisAmount,
      realized_gain_loss: realizedGainLoss,
      realized_gain_loss_pct: realizedGainLossPct,
      notes: notes || null,
      traded_at: tradedAt || new Date().toISOString(),
      acquired_at: (transactionType === "sell" && input.acquiredAt) ? input.acquiredAt : null,
    })
    .select("id").single();
  if (insertTransactionError || !txRow) throw new Error(insertTransactionError?.message ?? "Failed to record transaction.");

  if (linkedHoldingId && isTrade && quantity !== null && pricePerShare !== null) {
    const lotDate = (tradedAt || new Date().toISOString()).slice(0, 10);
    const { error: lotErr } = await db.from("holding_lots").insert({
      holding_id: linkedHoldingId, portfolio_id: portfolioId, ticker,
      lot_type: transactionType === "sell" ? "SELL" : "BUY",
      purchased_at: lotDate, shares: quantity, price_per_share: pricePerShare,
    });
    if (lotErr) console.error("Lot insert failed (non-fatal):", lotErr.message);
  }

  const newCashBalance = Number(portfolio.cash_balance ?? 0) + netCashImpact;
  const { error: updatePortfolioError } = await db
    .from("portfolios").update({ cash_balance: newCashBalance }).eq("id", portfolioId).eq("user_id", userId);
  if (updatePortfolioError) throw new Error(updatePortfolioError.message);

  return { transactionId: txRow.id };
}
