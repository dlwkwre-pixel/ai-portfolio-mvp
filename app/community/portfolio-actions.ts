"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getPortfolioValuation } from "@/lib/portfolio/valuation";
import { validateLength } from "@/lib/validation";
import { getBenchmarkComparison } from "@/lib/portfolio/benchmark";

// ─── Types ────────────────────────────────────────────────────────────────────

type HoldingAllocation = {
  ticker: string;
  company_name: string | null;
  allocation_pct: number;
  is_cash: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function computeAllocations(
  portfolioId: string,
  cashBalance: number,
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<{ allocations: HoldingAllocation[]; totalValue: number }> {
  const { data: holdings } = await supabase
    .from("holdings")
    .select("id, ticker, company_name, asset_type, shares, average_cost_basis, manual_price, manual_price_updated_at")
    .eq("portfolio_id", portfolioId);

  if (!holdings || holdings.length === 0) {
    // Portfolio has only cash
    const total = cashBalance;
    if (total <= 0) return { allocations: [], totalValue: 0 };
    return {
      allocations: [{ ticker: "CASH", company_name: "Cash", allocation_pct: 100, is_cash: true }],
      totalValue: total,
    };
  }

  const valuation = await getPortfolioValuation({
    holdings: holdings.map((h) => ({
      id: h.id,
      ticker: h.ticker,
      company_name: h.company_name,
      asset_type: h.asset_type,
      shares: h.shares,
      average_cost_basis: h.average_cost_basis,
      manual_price: h.manual_price, manual_price_updated_at: h.manual_price_updated_at,
    })),
    cashBalance,
  });

  const total = valuation.total_portfolio_value;
  if (total <= 0) return { allocations: [], totalValue: 0 };

  const allocations: HoldingAllocation[] = valuation.valued_holdings
    .filter((h) => h.market_value !== null && h.market_value > 0)
    .map((h, i) => ({
      ticker: h.ticker,
      company_name: h.company_name ?? null,
      allocation_pct: Number(((h.market_value! / total) * 100).toFixed(4)),
      is_cash: false,
    }))
    .sort((a, b) => b.allocation_pct - a.allocation_pct);

  // Add cash if meaningful (> 0.01%)
  if (cashBalance > 0) {
    const cashPct = Number(((cashBalance / total) * 100).toFixed(4));
    if (cashPct > 0.01) {
      allocations.push({ ticker: "CASH", company_name: "Cash", allocation_pct: cashPct, is_cash: true });
    }
  }

  return { allocations, totalValue: total };
}

// Detect meaningful changes between old and new allocations
// Returns a summary string if changes are significant, null otherwise.
function detectMeaningfulChanges(
  oldHoldings: Array<{ ticker: string; allocation_pct: number; is_cash: boolean }>,
  newAllocations: HoldingAllocation[]
): string | null {
  const THRESHOLD = 2; // % points
  const changes: string[] = [];

  const oldMap = new Map(oldHoldings.map((h) => [h.ticker, h]));
  const newMap = new Map(newAllocations.map((h) => [h.ticker, h]));

  // Added holdings
  for (const [ticker, holding] of newMap) {
    if (!oldMap.has(ticker) && !holding.is_cash) {
      changes.push(`added ${ticker}`);
    }
  }

  // Removed holdings
  for (const [ticker, holding] of oldMap) {
    if (!newMap.has(ticker) && !holding.is_cash) {
      changes.push(`removed ${ticker}`);
    }
  }

  // Changed allocations
  for (const [ticker, newH] of newMap) {
    const oldH = oldMap.get(ticker);
    if (!oldH) continue;
    const diff = Math.abs(newH.allocation_pct - oldH.allocation_pct);
    if (diff >= THRESHOLD) {
      const direction = newH.allocation_pct > oldH.allocation_pct ? "increased" : "trimmed";
      if (newH.is_cash) {
        changes.push(`cash now ${newH.allocation_pct.toFixed(1)}%`);
      } else {
        changes.push(`${direction} ${ticker}`);
      }
    }
  }

  if (changes.length === 0) return null;
  return changes.slice(0, 4).join(", ");
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export async function publishPortfolio(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const portfolioId = String(formData.get("portfolio_id") || "").trim();
  const publicName = String(formData.get("public_name") || "").trim();
  const publicDescription = String(formData.get("public_description") || "").trim();

  if (!portfolioId) throw new Error("Portfolio ID is required.");
  if (!publicName) throw new Error("Public name is required.");
  validateLength(publicName, 100, "Public name");
  validateLength(publicDescription, 1000, "Description");

  // Verify ownership
  const { data: portfolio, error: portfolioError } = await supabase
    .from("portfolios")
    .select("id, name, cash_balance, status")
    .eq("id", portfolioId)
    .eq("user_id", user.id)
    .single();

  if (portfolioError || !portfolio) throw new Error("Portfolio not found.");
  if (portfolio.status === "archived") throw new Error("Cannot share an archived portfolio.");

  const cashBalance = Number(portfolio.cash_balance ?? 0);

  // Check if already published
  const { data: existing } = await supabase
    .from("public_portfolios")
    .select("id")
    .eq("source_portfolio_id", portfolioId)
    .maybeSingle();

  if (existing) throw new Error("Portfolio is already published. Use sync to update it.");

  // Compute allocations using live prices
  const { allocations, totalValue } = await computeAllocations(portfolioId, cashBalance, supabase);
  if (allocations.length === 0) throw new Error("Portfolio has no holdings to share.");

  // Fetch linked public strategy if any
  const { data: assignment } = await supabase
    .from("portfolio_strategy_assignments")
    .select("strategy_id, strategies!inner(is_public)")
    .eq("portfolio_id", portfolioId)
    .eq("is_active", true)
    .maybeSingle();

  const linkedStrategyId =
    assignment && (assignment.strategies as unknown as { is_public: boolean } | null)?.is_public
      ? assignment.strategy_id
      : null;

  // Insert public_portfolio record
  const { data: pubPortfolio, error: pubError } = await supabase
    .from("public_portfolios")
    .insert({
      source_portfolio_id: portfolioId,
      owner_user_id: user.id,
      public_name: publicName,
      public_description: publicDescription || null,
      linked_strategy_id: linkedStrategyId,
      is_public: true,
      follower_count: 0,
      copy_count: 0,
      baseline_total_value: totalValue,
      last_synced_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (pubError || !pubPortfolio) throw new Error(pubError?.message ?? "Failed to publish portfolio.");

  // Insert holdings (percentages only)
  const holdingsToInsert = allocations.map((h, i) => ({
    public_portfolio_id: pubPortfolio.id,
    ticker: h.ticker,
    company_name: h.company_name,
    allocation_pct: h.allocation_pct,
    is_cash: h.is_cash,
    display_order: i,
  }));

  await supabase.from("public_portfolio_holdings").insert(holdingsToInsert);

  // Insert first performance point (return_pct = 0 at publication)
  const today = new Date().toISOString().split("T")[0];
  await supabase.from("public_portfolio_performance").insert({
    public_portfolio_id: pubPortfolio.id,
    snapshot_date: today,
    return_pct: 0,
  });

  revalidatePath("/community");
  revalidatePath(`/portfolios/${portfolioId}`);
  return { id: pubPortfolio.id };
}

export async function unpublishPortfolio(portfolioId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const { error } = await supabase
    .from("public_portfolios")
    .update({ is_public: false, updated_at: new Date().toISOString() })
    .eq("source_portfolio_id", portfolioId)
    .eq("owner_user_id", user.id);

  if (error) throw new Error(error.message);

  revalidatePath("/community");
  revalidatePath(`/portfolios/${portfolioId}`);
}

export async function syncPublicAllocation(portfolioId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  // Fetch the public_portfolio record
  const { data: pubPortfolio, error: pubErr } = await supabase
    .from("public_portfolios")
    .select("id, baseline_total_value, public_name")
    .eq("source_portfolio_id", portfolioId)
    .eq("owner_user_id", user.id)
    .eq("is_public", true)
    .single();

  if (pubErr || !pubPortfolio) throw new Error("No published portfolio found for this source.");

  // Fetch current portfolio state
  const { data: portfolio } = await supabase
    .from("portfolios")
    .select("cash_balance, benchmark_symbol")
    .eq("id", portfolioId)
    .eq("user_id", user.id)
    .single();

  if (!portfolio) throw new Error("Portfolio not found.");

  const cashBalance = Number(portfolio.cash_balance ?? 0);

  // Compute new allocations
  const { allocations: newAllocations, totalValue } = await computeAllocations(
    portfolioId,
    cashBalance,
    supabase
  );

  // Fetch old holdings for change detection
  const { data: oldHoldings } = await supabase
    .from("public_portfolio_holdings")
    .select("ticker, allocation_pct, is_cash")
    .eq("public_portfolio_id", pubPortfolio.id);

  const changesSummary = detectMeaningfulChanges(
    (oldHoldings ?? []).map((h) => ({ ticker: h.ticker, allocation_pct: Number(h.allocation_pct), is_cash: h.is_cash })),
    newAllocations
  );

  // Replace all holdings with fresh snapshot
  await supabase.from("public_portfolio_holdings").delete().eq("public_portfolio_id", pubPortfolio.id);

  if (newAllocations.length > 0) {
    await supabase.from("public_portfolio_holdings").insert(
      newAllocations.map((h, i) => ({
        public_portfolio_id: pubPortfolio.id,
        ticker: h.ticker,
        company_name: h.company_name,
        allocation_pct: h.allocation_pct,
        is_cash: h.is_cash,
        display_order: i,
      }))
    );
  }

  // Update performance entry for today
  const today = new Date().toISOString().split("T")[0];
  const baseline = Number(pubPortfolio.baseline_total_value ?? 0);
  const returnPct = baseline > 0 ? ((totalValue - baseline) / baseline) * 100 : 0;

  await supabase.from("public_portfolio_performance").upsert(
    { public_portfolio_id: pubPortfolio.id, snapshot_date: today, return_pct: returnPct },
    { onConflict: "public_portfolio_id,snapshot_date" }
  );

  // Compute all-time benchmark comparison for the share card
  const benchmarkSymbol = portfolio.benchmark_symbol || "SPY";
  let returnPctAlltime: number | null = null;
  let benchmarkReturnPct: number | null = null;
  try {
    const [{ data: snapshots }, { data: cashFlows }] = await Promise.all([
      supabase.from("portfolio_snapshots").select("snapshot_date, total_value").eq("portfolio_id", portfolioId).order("snapshot_date"),
      supabase.from("cash_ledger").select("effective_at, direction, amount").eq("portfolio_id", portfolioId),
    ]);
    if (snapshots && snapshots.length >= 2) {
      const result = await getBenchmarkComparison({
        snapshots: snapshots.map((s) => ({ snapshot_date: s.snapshot_date, total_value: s.total_value })),
        benchmarkSymbol,
        cashFlows: (cashFlows ?? []).map((c) => ({ effective_at: c.effective_at, direction: c.direction, amount: c.amount })),
      });
      returnPctAlltime = result.portfolioTwrPct ?? result.portfolioReturnPct ?? null;
      benchmarkReturnPct = result.benchmarkReturnPct ?? null;
    }
  } catch {
    // Non-fatal — share card stats just won't update this sync
  }

  // Update last_synced_at + share card stats
  await supabase
    .from("public_portfolios")
    .update({
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...(returnPctAlltime != null ? {
        return_pct_alltime: Math.round(returnPctAlltime * 100) / 100,
        benchmark_symbol: benchmarkSymbol,
        benchmark_return_pct: benchmarkReturnPct != null ? Math.round(benchmarkReturnPct * 100) / 100 : null,
        stats_updated_at: new Date().toISOString(),
      } : {}),
    })
    .eq("id", pubPortfolio.id);

  // Create notifications for followers if meaningful changes detected
  if (changesSummary) {
    const { data: followers } = await supabase
      .from("portfolio_followers")
      .select("follower_user_id")
      .eq("public_portfolio_id", pubPortfolio.id);

    if (followers && followers.length > 0) {
      // Throttle: check if a notification was sent in the last 24 hours
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: recentNotif } = await supabase
        .from("notifications")
        .select("id")
        .eq("related_entity_id", pubPortfolio.id)
        .eq("related_entity_type", "public_portfolio")
        .gte("created_at", yesterday)
        .limit(1)
        .maybeSingle();

      if (!recentNotif) {
        await supabase.from("notifications").insert(
          followers.map((f) => ({
            user_id: f.follower_user_id,
            type: "portfolio_update",
            title: `${pubPortfolio.public_name} updated`,
            message: changesSummary,
            related_entity_type: "public_portfolio",
            related_entity_id: pubPortfolio.id,
          }))
        );
      }
    }
  }

  revalidatePath("/community");
  revalidatePath(`/portfolios/${portfolioId}`);
  revalidatePath(`/community/portfolios/${pubPortfolio.id}`);
}

export async function updatePublicPortfolioMeta(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const portfolioId = String(formData.get("portfolio_id") || "").trim();
  const publicName = String(formData.get("public_name") || "").trim();
  const publicDescription = String(formData.get("public_description") || "").trim();

  if (!portfolioId) throw new Error("Portfolio ID is required.");
  if (!publicName) throw new Error("Public name is required.");
  validateLength(publicName, 100, "Public name");
  validateLength(publicDescription, 1000, "Description");

  const { error } = await supabase
    .from("public_portfolios")
    .update({
      public_name: publicName,
      public_description: publicDescription || null,
      updated_at: new Date().toISOString(),
    })
    .eq("source_portfolio_id", portfolioId)
    .eq("owner_user_id", user.id);

  if (error) throw new Error(error.message);

  revalidatePath("/community");
  revalidatePath(`/portfolios/${portfolioId}`);
}

export async function followPublicPortfolio(publicPortfolioId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  // Cannot follow your own portfolio
  const { data: pp } = await supabase
    .from("public_portfolios")
    .select("owner_user_id")
    .eq("id", publicPortfolioId)
    .single();

  if (pp?.owner_user_id === user.id) throw new Error("Cannot follow your own portfolio.");

  const { data: existing } = await supabase
    .from("portfolio_followers")
    .select("id")
    .eq("public_portfolio_id", publicPortfolioId)
    .eq("follower_user_id", user.id)
    .maybeSingle();

  if (existing) {
    await supabase.from("portfolio_followers").delete()
      .eq("public_portfolio_id", publicPortfolioId)
      .eq("follower_user_id", user.id);

    // Decrement: try RPC first, fall back to manual decrement
    const { error: rpcDecErr } = await supabase.rpc("decrement_follower_count", { portfolio_id: publicPortfolioId });
    if (rpcDecErr) {
      const { data: current } = await supabase
        .from("public_portfolios").select("follower_count").eq("id", publicPortfolioId).single();
      await supabase.from("public_portfolios")
        .update({ follower_count: Math.max(0, Number(current?.follower_count ?? 1) - 1) })
        .eq("id", publicPortfolioId);
    }
  } else {
    await supabase.from("portfolio_followers").insert({
      public_portfolio_id: publicPortfolioId,
      follower_user_id: user.id,
    });

    // Increment: try RPC first, fall back to manual increment
    const { error: rpcIncErr } = await supabase.rpc("increment_follower_count", { portfolio_id: publicPortfolioId });
    if (rpcIncErr) {
      const { data: current } = await supabase
        .from("public_portfolios").select("follower_count").eq("id", publicPortfolioId).single();
      await supabase.from("public_portfolios")
        .update({ follower_count: Number(current?.follower_count ?? 0) + 1 })
        .eq("id", publicPortfolioId);
    }
  }

  revalidatePath("/community");
  revalidatePath(`/community/portfolios/${publicPortfolioId}`);
}

export async function copyPublicAllocation(publicPortfolioId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  // Fetch the public portfolio
  const { data: pubPortfolio, error: pubErr } = await supabase
    .from("public_portfolios")
    .select("id, public_name, public_description, risk_level, style, owner_user_id, copy_count")
    .eq("id", publicPortfolioId)
    .eq("is_public", true)
    .single();

  if (pubErr || !pubPortfolio) throw new Error("Public portfolio not found.");
  if (pubPortfolio.owner_user_id === user.id) throw new Error("Cannot copy your own portfolio.");

  // Fetch the public holdings
  const { data: holdings } = await supabase
    .from("public_portfolio_holdings")
    .select("ticker, company_name, allocation_pct, is_cash, display_order")
    .eq("public_portfolio_id", publicPortfolioId)
    .order("display_order", { ascending: true });

  // Create a new private portfolio (empty — user will fund it)
  const { data: newPortfolio, error: newErr } = await supabase
    .from("portfolios")
    .insert({
      user_id: user.id,
      name: `${pubPortfolio.public_name} (copy)`,
      description: `Copied from public portfolio "${pubPortfolio.public_name}". Original allocations: ${
        (holdings ?? [])
          .filter((h) => !h.is_cash)
          .slice(0, 5)
          .map((h) => `${h.ticker} ${Number(h.allocation_pct).toFixed(1)}%`)
          .join(", ")
      }`,
      account_type: "brokerage",
      cash_balance: 0,
      benchmark_symbol: "SPY",
      status: "active",
      is_active: true,
    })
    .select("id")
    .single();

  if (newErr || !newPortfolio) throw new Error(newErr?.message ?? "Failed to create portfolio.");

  // Add non-cash holdings as target placeholders (shares = 0, avg cost = 0)
  const holdingsToCreate = (holdings ?? [])
    .filter((h) => !h.is_cash)
    .map((h) => ({
      portfolio_id: newPortfolio.id,
      ticker: h.ticker,
      company_name: h.company_name,
      asset_type: "stock",
      shares: 0,
      average_cost_basis: 0,
    }));

  if (holdingsToCreate.length > 0) {
    await supabase.from("holdings").insert(holdingsToCreate);
  }

  // Track the copy
  await supabase.from("portfolio_copies").insert({
    public_portfolio_id: publicPortfolioId,
    copied_by_user_id: user.id,
    new_portfolio_id: newPortfolio.id,
  });

  // Increment copy count
  await supabase
    .from("public_portfolios")
    .update({ copy_count: (Number(pubPortfolio.copy_count ?? 0)) + 1 })
    .eq("id", publicPortfolioId);

  revalidatePath("/portfolios");
  revalidatePath("/community");

  return { id: newPortfolio.id };
}
