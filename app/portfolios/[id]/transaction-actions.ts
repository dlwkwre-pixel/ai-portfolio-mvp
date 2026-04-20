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