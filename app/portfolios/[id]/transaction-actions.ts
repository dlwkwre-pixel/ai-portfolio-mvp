"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function calculateNetCashImpact(args: {
  transactionType: string;
  grossAmount: number;
  fees: number;
}) {
  const { transactionType, grossAmount, fees } = args;

  switch (transactionType) {
    case "buy":
      return -(grossAmount + fees);
    case "sell":
      return grossAmount - fees;
    case "dividend":
      return grossAmount;
    case "deposit":
      return grossAmount;
    case "withdrawal":
      return -grossAmount;
    case "fee":
      return -grossAmount;
    case "interest":
      return grossAmount;
    default:
      throw new Error("Unsupported transaction type.");
  }
}

export async function createPortfolioTransaction(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in to add a transaction.");
  }

  const portfolioId = String(formData.get("portfolio_id") || "").trim();
  const transactionType = String(formData.get("transaction_type") || "")
    .trim()
    .toLowerCase();
  const ticker = String(formData.get("ticker") || "")
    .trim()
    .toUpperCase();
  const companyName = String(formData.get("company_name") || "").trim();
  const quantityRaw = String(formData.get("quantity") || "").trim();
  const pricePerShareRaw = String(formData.get("price_per_share") || "").trim();
  const grossAmountRaw = String(formData.get("gross_amount") || "").trim();
  const feesRaw = String(formData.get("fees") || "").trim();
  const notes = String(formData.get("notes") || "").trim();
  const tradedAt = String(formData.get("traded_at") || "").trim();

  if (!portfolioId) {
    throw new Error("Portfolio ID is required.");
  }

  if (!transactionType) {
    throw new Error("Transaction type is required.");
  }

  const allowedTypes = [
    "buy",
    "sell",
    "dividend",
    "deposit",
    "withdrawal",
    "fee",
    "interest",
  ];

  if (!allowedTypes.includes(transactionType)) {
    throw new Error("Invalid transaction type.");
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

  const quantity = quantityRaw ? Number(quantityRaw) : null;
  const pricePerShare = pricePerShareRaw ? Number(pricePerShareRaw) : null;
  const fees = feesRaw ? Number(feesRaw) : 0;

  let grossAmount = grossAmountRaw ? Number(grossAmountRaw) : 0;

  const isTrade = transactionType === "buy" || transactionType === "sell";

  if (isTrade) {
    if (!ticker) {
      throw new Error("Ticker is required for buy and sell transactions.");
    }

    if (quantity === null || quantity <= 0) {
      throw new Error("Quantity must be greater than 0 for buy and sell transactions.");
    }

    if (pricePerShare === null || pricePerShare <= 0) {
      throw new Error(
        "Price per share must be greater than 0 for buy and sell transactions."
      );
    }
  }

  if (
    isTrade &&
    grossAmount === 0 &&
    quantity !== null &&
    pricePerShare !== null
  ) {
    grossAmount = quantity * pricePerShare;
  }

  if (grossAmount <= 0) {
    throw new Error("Gross amount must be greater than 0.");
  }

  const netCashImpact = calculateNetCashImpact({
    transactionType,
    grossAmount,
    fees,
  });

  let linkedHoldingId: string | null = null;
  let costBasisAmount: number | null = null;
  let realizedGainLoss: number | null = null;
  let realizedGainLossPct: number | null = null;

  if (transactionType === "buy") {
    const { data: existingHolding, error: existingHoldingError } = await supabase
      .from("holdings")
      .select("*")
      .eq("portfolio_id", portfolioId)
      .eq("ticker", ticker)
      .maybeSingle();

    if (existingHoldingError) {
      throw new Error(existingHoldingError.message);
    }

    if (!existingHolding) {
      const { data: newHolding, error: createHoldingError } = await supabase
        .from("holdings")
        .insert({
          portfolio_id: portfolioId,
          ticker,
          company_name: companyName || null,
          shares: quantity,
          average_cost_basis: pricePerShare,
          asset_type: "stock",
        })
        .select()
        .single();

      if (createHoldingError || !newHolding) {
        throw new Error(createHoldingError?.message || "Failed to create holding.");
      }

      linkedHoldingId = newHolding.id;
    } else {
      const oldShares = Number(existingHolding.shares ?? 0);
      const oldAvgCost = Number(existingHolding.average_cost_basis ?? 0);
      const newShares = oldShares + Number(quantity);
      const newAvgCost =
        newShares > 0
          ? (oldShares * oldAvgCost + Number(quantity) * Number(pricePerShare)) /
            newShares
          : 0;

      const { error: updateHoldingError } = await supabase
        .from("holdings")
        .update({
          company_name: companyName || existingHolding.company_name || null,
          shares: newShares,
          average_cost_basis: newAvgCost,
        })
        .eq("id", existingHolding.id);

      if (updateHoldingError) {
        throw new Error(updateHoldingError.message);
      }

      linkedHoldingId = existingHolding.id;
    }
  }

  if (transactionType === "sell") {
    const { data: existingHolding, error: existingHoldingError } = await supabase
      .from("holdings")
      .select("*")
      .eq("portfolio_id", portfolioId)
      .eq("ticker", ticker)
      .maybeSingle();

    if (existingHoldingError) {
      throw new Error(existingHoldingError.message);
    }

    if (!existingHolding) {
      throw new Error("Cannot sell a holding that does not exist in this portfolio.");
    }

    const oldShares = Number(existingHolding.shares ?? 0);
    const oldAvgCost = Number(existingHolding.average_cost_basis ?? 0);
    const sellQuantity = Number(quantity);

    if (sellQuantity > oldShares) {
      throw new Error("Cannot sell more shares than currently owned.");
    }

    const remainingShares = oldShares - sellQuantity;

    costBasisAmount = sellQuantity * oldAvgCost;
    realizedGainLoss = grossAmount - fees - costBasisAmount;
    realizedGainLossPct =
      costBasisAmount > 0 ? (realizedGainLoss / costBasisAmount) * 100 : null;

    if (remainingShares === 0) {
      const { error: deleteHoldingError } = await supabase
        .from("holdings")
        .delete()
        .eq("id", existingHolding.id);

      if (deleteHoldingError) {
        throw new Error(deleteHoldingError.message);
      }

      linkedHoldingId = null;
    } else {
      const { error: updateHoldingError } = await supabase
        .from("holdings")
        .update({
          company_name: companyName || existingHolding.company_name || null,
          shares: remainingShares,
        })
        .eq("id", existingHolding.id);

      if (updateHoldingError) {
        throw new Error(updateHoldingError.message);
      }

      linkedHoldingId = existingHolding.id;
    }
  }

  const { error: insertTransactionError } = await supabase
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
    });

  if (insertTransactionError) {
    throw new Error(insertTransactionError.message);
  }

  const newCashBalance = Number(portfolio.cash_balance ?? 0) + netCashImpact;

  const { error: updatePortfolioError } = await supabase
    .from("portfolios")
    .update({
      cash_balance: newCashBalance,
    })
    .eq("id", portfolioId)
    .eq("user_id", user.id);

  if (updatePortfolioError) {
    throw new Error(updatePortfolioError.message);
  }

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
          .eq("id", holding.id);
      }
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
        await supabase.from("holdings").delete().eq("id", holding.id);
      } else {
        await supabase.from("holdings").update({ shares: remainingShares }).eq("id", holding.id);
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
        .eq("id", holding.id);
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

  revalidatePath(`/portfolios/${portfolioId}`);
  revalidatePath("/dashboard");
}
