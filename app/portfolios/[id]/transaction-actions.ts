"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { validateLength, validateDate } from "@/lib/validation";
import { recordPortfolioTransaction, type TransactionType } from "@/lib/portfolio/record-transaction";

export async function createPortfolioTransaction(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in to add a transaction.");
  }

  const portfolioId = String(formData.get("portfolio_id") || "").trim();
  const transactionType = String(formData.get("transaction_type") || "").trim().toLowerCase() as TransactionType;
  const ticker = String(formData.get("ticker") || "").trim().toUpperCase();
  const companyName = String(formData.get("company_name") || "").trim();
  const quantityRaw = String(formData.get("quantity") || "").trim();
  const pricePerShareRaw = String(formData.get("price_per_share") || "").trim();
  const grossAmountRaw = String(formData.get("gross_amount") || "").trim();
  const feesRaw = String(formData.get("fees") || "").trim();
  const notes = String(formData.get("notes") || "").trim();
  const tradedAt = String(formData.get("traded_at") || "").trim();
  const acquiredAtRaw = String(formData.get("acquired_at") || "").trim();

  if (!transactionType) {
    throw new Error("Transaction type is required.");
  }

  await recordPortfolioTransaction(supabase, {
    portfolioId,
    userId: user.id,
    transactionType,
    ticker,
    companyName,
    quantity: quantityRaw ? Number(quantityRaw) : null,
    pricePerShare: pricePerShareRaw ? Number(pricePerShareRaw) : null,
    grossAmount: grossAmountRaw ? Number(grossAmountRaw) : 0,
    fees: feesRaw ? Number(feesRaw) : 0,
    notes,
    tradedAt,
    acquiredAt: acquiredAtRaw || null,
  });

  revalidatePath(`/portfolios/${portfolioId}`);
}
// ADD THESE TWO FUNCTIONS TO THE BOTTOM OF transaction-actions.ts

export async function updateTransaction(formData: FormData) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in to update a transaction.");

  const transactionId = String(formData.get("transaction_id") || "").trim();
  const portfolioId = String(formData.get("portfolio_id") || "").trim();
  const quantityRaw = String(formData.get("quantity") || "").trim();
  const pricePerShareRaw = String(formData.get("price_per_share") || "").trim();
  const feesRaw = String(formData.get("fees") || "0").trim();
  const notes = String(formData.get("notes") || "").trim();
  const tradedAt = String(formData.get("traded_at") || "").trim();

  if (!transactionId) throw new Error("Transaction ID is required.");
  if (!portfolioId) throw new Error("Portfolio ID is required.");
  validateLength(notes, 2000, "Notes");
  validateDate(tradedAt, "Trade date");

  // Verify portfolio belongs to user
  const { data: portfolio, error: portfolioError } = await supabase
    .from("portfolios")
    .select("id, cash_balance")
    .eq("id", portfolioId)
    .eq("user_id", user.id)
    .single();
  if (portfolioError || !portfolio) throw new Error("Portfolio not found.");

  // Get the existing transaction
  const { data: existingTx, error: txError } = await supabase
    .from("portfolio_transactions")
    .select("*")
    .eq("id", transactionId)
    .eq("portfolio_id", portfolioId)
    .single();
  if (txError || !existingTx) throw new Error("Transaction not found.");

  const quantity = quantityRaw ? Number(quantityRaw) : existingTx.quantity;
  const pricePerShare = pricePerShareRaw ? Number(pricePerShareRaw) : existingTx.price_per_share;
  const fees = feesRaw ? Number(feesRaw) : 0;
  const grossAmount = quantity && pricePerShare ? quantity * pricePerShare : existingTx.gross_amount;

  const transactionType = existingTx.transaction_type;
  let netCashImpact = existingTx.net_cash_impact;

  // Recalculate net cash impact
  if (transactionType === "buy") {
    netCashImpact = -(grossAmount + fees);
  } else if (transactionType === "sell") {
    netCashImpact = grossAmount - fees;
  }

  // Adjust portfolio cash balance:
  // Reverse the old net cash impact, apply the new one
  const oldNetCashImpact = Number(existingTx.net_cash_impact ?? 0);
  const cashAdjustment = netCashImpact - oldNetCashImpact;
  const newCashBalance = Number(portfolio.cash_balance ?? 0) + cashAdjustment;

  // Update the transaction
  const { error: updateError } = await supabase
    .from("portfolio_transactions")
    .update({
      quantity,
      price_per_share: pricePerShare,
      gross_amount: grossAmount,
      fees,
      net_cash_impact: netCashImpact,
      notes: notes || existingTx.notes,
      traded_at: tradedAt ? new Date(tradedAt).toISOString() : existingTx.traded_at,
    })
    .eq("id", transactionId)
    .eq("portfolio_id", portfolioId);

  if (updateError) throw new Error(updateError.message);

  // Update portfolio cash balance
  const { error: cashError } = await supabase
    .from("portfolios")
    .update({ cash_balance: newCashBalance })
    .eq("id", portfolioId)
    .eq("user_id", user.id);

  if (cashError) throw new Error(cashError.message);

  // If it's a buy/sell, also update the holding's average cost basis
  if ((transactionType === "buy" || transactionType === "sell") && existingTx.ticker) {
    const ticker = existingTx.ticker.toUpperCase();
    const { data: holding } = await supabase
      .from("holdings")
      .select("*")
      .eq("portfolio_id", portfolioId)
      .eq("ticker", ticker)
      .maybeSingle();

    if (holding && transactionType === "buy" && pricePerShare) {
      // Recalculate average cost basis using new price
      // Simple approach: if shares didn't change, just update the avg cost
      const shares = Number(holding.shares ?? 0);
      if (shares > 0 && quantity) {
        const newAvgCost = pricePerShare; // Use new price as the cost basis for this transaction
        await supabase
          .from("holdings")
          .update({ average_cost_basis: newAvgCost })
          .eq("id", holding.id)
          .eq("portfolio_id", portfolioId);
      }
    }
  }

  // Sync the holding lot so chart reconstruction stays accurate
  if ((transactionType === "buy" || transactionType === "sell") && existingTx.ticker) {
    const oldDate = (existingTx.traded_at as string).slice(0, 10);
    const newDate = tradedAt ? new Date(tradedAt).toISOString().slice(0, 10) : oldDate;
    const lotType = (transactionType as string).toUpperCase();
    const oldShares = Number(existingTx.quantity);
    const { data: lots } = await supabase
      .from("holding_lots")
      .select("id")
      .eq("portfolio_id", portfolioId)
      .eq("ticker", existingTx.ticker.toUpperCase())
      .eq("lot_type", lotType)
      .eq("purchased_at", oldDate)
      .gte("shares", oldShares - 0.00001)
      .lte("shares", oldShares + 0.00001)
      .limit(1);
    if (lots && lots.length > 0) {
      await supabase
        .from("holding_lots")
        .update({ shares: quantity, price_per_share: pricePerShare, purchased_at: newDate })
        .eq("id", lots[0].id);
    }
  }

  revalidatePath(`/portfolios/${portfolioId}`);
  revalidatePath("/dashboard");
}

export async function deleteTransaction(formData: FormData) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in to delete a transaction.");

  const transactionId = String(formData.get("transaction_id") || "").trim();
  const portfolioId = String(formData.get("portfolio_id") || "").trim();

  if (!transactionId) throw new Error("Transaction ID is required.");
  if (!portfolioId) throw new Error("Portfolio ID is required.");

  // Verify portfolio belongs to user
  const { data: portfolio, error: portfolioError } = await supabase
    .from("portfolios")
    .select("id, cash_balance")
    .eq("id", portfolioId)
    .eq("user_id", user.id)
    .single();
  if (portfolioError || !portfolio) throw new Error("Portfolio not found.");

  // Get the transaction to reverse its cash impact
  const { data: tx, error: txError } = await supabase
    .from("portfolio_transactions")
    .select("*")
    .eq("id", transactionId)
    .eq("portfolio_id", portfolioId)
    .single();
  if (txError || !tx) throw new Error("Transaction not found.");

  // Reverse the cash impact
  const reversedCashBalance =
    Number(portfolio.cash_balance ?? 0) - Number(tx.net_cash_impact ?? 0);

  // Delete the transaction
  const { error: deleteError } = await supabase
    .from("portfolio_transactions")
    .delete()
    .eq("id", transactionId)
    .eq("portfolio_id", portfolioId);

  if (deleteError) throw new Error(deleteError.message);

  // Restore cash balance
  const { error: cashError } = await supabase
    .from("portfolios")
    .update({ cash_balance: reversedCashBalance })
    .eq("id", portfolioId)
    .eq("user_id", user.id);

  if (cashError) throw new Error(cashError.message);

  // If it was a buy, reverse the holding shares
  if (tx.transaction_type === "buy" && tx.ticker && tx.quantity) {
    const ticker = tx.ticker.toUpperCase();
    const { data: holding } = await supabase
      .from("holdings")
      .select("*")
      .eq("portfolio_id", portfolioId)
      .eq("ticker", ticker)
      .maybeSingle();

    if (holding) {
      const remainingShares = Number(holding.shares ?? 0) - Number(tx.quantity ?? 0);
      if (remainingShares <= 0) {
        await supabase.from("holdings").delete().eq("id", holding.id).eq("portfolio_id", portfolioId);
      } else {
        await supabase.from("holdings").update({ shares: remainingShares }).eq("id", holding.id).eq("portfolio_id", portfolioId);
      }
    }
  }

  // If it was a sell, restore the holding shares
  if (tx.transaction_type === "sell" && tx.ticker && tx.quantity) {
    const ticker = tx.ticker.toUpperCase();
    const { data: holding } = await supabase
      .from("holdings")
      .select("*")
      .eq("portfolio_id", portfolioId)
      .eq("ticker", ticker)
      .maybeSingle();

    if (holding) {
      await supabase
        .from("holdings")
        .update({ shares: Number(holding.shares ?? 0) + Number(tx.quantity ?? 0) })
        .eq("id", holding.id)
        .eq("portfolio_id", portfolioId);
    } else {
      // Holding was fully sold — recreate it
      await supabase.from("holdings").insert({
        portfolio_id: portfolioId,
        ticker,
        company_name: tx.company_name || null,
        shares: Number(tx.quantity ?? 0),
        average_cost_basis: tx.price_per_share ?? null,
        asset_type: "stock",
      });
    }
  }

  // Delete the holding lot so chart reconstruction doesn't count phantom shares
  if ((tx.transaction_type === "buy" || tx.transaction_type === "sell") && tx.ticker && tx.quantity) {
    const lotDate = (tx.traded_at as string).slice(0, 10);
    const lotType = (tx.transaction_type as string).toUpperCase();
    const txShares = Number(tx.quantity);
    const { data: lots } = await supabase
      .from("holding_lots")
      .select("id")
      .eq("portfolio_id", portfolioId)
      .eq("ticker", tx.ticker.toUpperCase())
      .eq("lot_type", lotType)
      .eq("purchased_at", lotDate)
      .gte("shares", txShares - 0.00001)
      .lte("shares", txShares + 0.00001)
      .limit(1);
    if (lots && lots.length > 0) {
      await supabase.from("holding_lots").delete().eq("id", lots[0].id);
    }
  }

  revalidatePath(`/portfolios/${portfolioId}`);
  revalidatePath("/dashboard");
}
