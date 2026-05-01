"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type OnboardingStatus = "not_started" | "in_progress" | "completed" | "skipped";

export const STARTER_STRATEGIES = [
  {
    name: "Balanced Growth",
    emoji: "⚖️",
    tagline: "Steady growth, managed risk",
    description: "Diversified across sectors with moderate volatility. A solid foundation for most investors.",
    style: "balanced",
    risk_level: "moderate",
    prompt_text: "Balanced portfolio targeting consistent 10–15% annual returns. Prioritize quality companies with steady revenue growth and reasonable valuations. No single position above 15%. Mix of growth (60%) and value (40%). Maintain 5–15% cash. Sectors: Technology, Healthcare, Consumer, Financials.",
    max_position_pct: 15,
    min_position_pct: 2,
    cash_min_pct: 5,
    cash_max_pct: 15,
    turnover_preference: "medium",
    holding_period_bias: "medium_term",
  },
  {
    name: "Long-Term Compounder",
    emoji: "🌱",
    tagline: "Buy quality, hold for years",
    description: "Exceptional businesses with durable advantages. Built for 5+ year horizons with minimal turnover.",
    style: "value",
    risk_level: "conservative",
    prompt_text: "Long-term portfolio targeting exceptional businesses with wide economic moats. Consistent free cash flow, durable competitive advantages, strong management. Positions held for years. Max 20% in any single established holding. Minimize turnover. Sectors: Technology, Consumer Staples, Healthcare, Financial Services.",
    max_position_pct: 20,
    min_position_pct: 3,
    cash_min_pct: 5,
    cash_max_pct: 10,
    turnover_preference: "low",
    holding_period_bias: "long_term",
  },
  {
    name: "Aggressive Growth",
    emoji: "🚀",
    tagline: "High conviction, high upside",
    description: "Concentrated bets on high-growth companies. Higher volatility in exchange for higher return potential.",
    style: "growth",
    risk_level: "aggressive",
    prompt_text: "Aggressive portfolio targeting 20%+ annual returns. Focus on high-growth companies with rapidly expanding revenue and large addressable markets. Accept elevated volatility. 10–15 concentrated positions. Sectors: Technology, Biotech, Fintech, AI. Trim losers quickly, let winners run. Cash up to 20% for dip deployment.",
    max_position_pct: 20,
    min_position_pct: 3,
    cash_min_pct: 5,
    cash_max_pct: 20,
    turnover_preference: "high",
    holding_period_bias: "short_term",
  },
  {
    name: "Dividend Focus",
    emoji: "💰",
    tagline: "Consistent income stream",
    description: "Reliable dividend payers for steady income and capital preservation. Suited for income-oriented investors.",
    style: "income",
    risk_level: "conservative",
    prompt_text: "Income portfolio targeting 4–6% annual dividend yield. Companies with 5+ year dividend growth history, sustainable payout ratios (<70%), and strong balance sheets. Sectors: Utilities, Consumer Staples, REITs, Healthcare, Financials. Focus on dividend quality over raw yield. Max 10% per position.",
    max_position_pct: 10,
    min_position_pct: 2,
    cash_min_pct: 3,
    cash_max_pct: 10,
    turnover_preference: "low",
    holding_period_bias: "long_term",
  },
  {
    name: "AI Momentum",
    emoji: "⚡",
    tagline: "Ride the AI wave",
    description: "Focused on AI infrastructure, software, and enablers. A thematic strategy for the current tech cycle.",
    style: "thematic",
    risk_level: "aggressive",
    prompt_text: "Thematic portfolio focused on AI infrastructure, software, and services. Target companies directly monetizing AI demand: chip makers, cloud providers, AI software platforms, enterprise AI adopters. Track momentum and rotate on fundamental shifts. Max 15% per position. Sectors: Semiconductors, Cloud, AI Software, Data Infrastructure.",
    max_position_pct: 15,
    min_position_pct: 3,
    cash_min_pct: 5,
    cash_max_pct: 20,
    turnover_preference: "medium",
    holding_period_bias: "medium_term",
  },
] as const;

// ─── Onboarding status ─────────────────────────────────────────────────────────

export async function getOnboardingState() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("user_profiles")
    .select("onboarding_status, onboarding_step")
    .eq("id", user.id)
    .maybeSingle();

  return {
    status: (data?.onboarding_status ?? "not_started") as OnboardingStatus,
    step: Number(data?.onboarding_step ?? 1),
  };
}

export async function saveOnboardingProgress(
  step: number,
  status: OnboardingStatus = "in_progress"
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const updates: Record<string, unknown> = {
    onboarding_status: status,
    onboarding_step: step,
  };
  if (status === "completed") updates.onboarding_completed_at = new Date().toISOString();
  if (status === "skipped") updates.onboarding_skipped_at = new Date().toISOString();

  await supabase.from("user_profiles").update(updates).eq("id", user.id);
  revalidatePath("/dashboard");
}

// ─── Portfolio ─────────────────────────────────────────────────────────────────

export async function createOnboardingPortfolio(data: {
  name: string;
  account_type: string;
  description?: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const name = data.name.trim() || "My Portfolio";

  // Idempotency: return existing if same name already exists
  const { data: existing } = await supabase
    .from("portfolios")
    .select("id")
    .eq("user_id", user.id)
    .eq("name", name)
    .eq("is_active", true)
    .maybeSingle();

  if (existing) return { id: existing.id };

  const { data: portfolio, error } = await supabase
    .from("portfolios")
    .insert({
      user_id: user.id,
      name,
      account_type: data.account_type,
      description: data.description || null,
      benchmark_symbol: "SPY",
      cash_balance: 0,
      status: "active",
      is_active: true,
    })
    .select("id")
    .single();

  if (error || !portfolio) throw new Error(error?.message || "Failed to create portfolio");

  revalidatePath("/dashboard");
  revalidatePath("/portfolios");

  return { id: portfolio.id };
}

// ─── Holdings ──────────────────────────────────────────────────────────────────

export async function addOnboardingHoldings(
  portfolioId: string,
  holdings: { ticker: string; company_name?: string; shares: number; average_cost_basis: number }[]
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: portfolio } = await supabase
    .from("portfolios")
    .select("id")
    .eq("id", portfolioId)
    .eq("user_id", user.id)
    .single();
  if (!portfolio) throw new Error("Portfolio not found");

  const errors: string[] = [];

  for (const h of holdings) {
    const ticker = h.ticker.toUpperCase().trim();
    if (!ticker) continue;

    const { data: existing } = await supabase
      .from("holdings")
      .select("id")
      .eq("portfolio_id", portfolioId)
      .eq("ticker", ticker)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase.from("holdings").update({
        shares: h.shares,
        average_cost_basis: h.average_cost_basis,
        company_name: h.company_name || null,
      }).eq("id", existing.id);
      if (error) errors.push(`${ticker}: ${error.message}`);
    } else {
      const { error } = await supabase.from("holdings").insert({
        portfolio_id: portfolioId,
        ticker,
        company_name: h.company_name || null,
        asset_type: "stock",
        shares: h.shares,
        average_cost_basis: h.average_cost_basis,
      });
      if (error) errors.push(`${ticker}: ${error.message}`);
    }
  }

  if (errors.length > 0) throw new Error(errors.join("; "));
  revalidatePath(`/portfolios/${portfolioId}`);
}

// ─── Cash ──────────────────────────────────────────────────────────────────────

export async function setOnboardingCash(portfolioId: string, cashAmount: number) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: portfolio } = await supabase
    .from("portfolios")
    .select("id")
    .eq("id", portfolioId)
    .eq("user_id", user.id)
    .single();
  if (!portfolio) throw new Error("Portfolio not found");

  const amount = Math.max(0, cashAmount);

  if (amount > 0) {
    await supabase.from("cash_ledger").insert({
      portfolio_id: portfolioId,
      amount,
      direction: "IN",
      reason: "deposit",
      effective_at: new Date().toISOString(),
    });
  }

  await supabase.from("portfolios")
    .update({ cash_balance: amount })
    .eq("id", portfolioId)
    .eq("user_id", user.id);

  revalidatePath(`/portfolios/${portfolioId}`);
}

// ─── Strategy ──────────────────────────────────────────────────────────────────

export async function createAndAssignStrategy(
  portfolioId: string,
  data: {
    name: string;
    description: string;
    style: string;
    risk_level: string;
    prompt_text: string;
    max_position_pct: number;
    min_position_pct: number;
    cash_min_pct: number;
    cash_max_pct: number;
    turnover_preference: string;
    holding_period_bias: string;
  }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: strategy, error: sErr } = await supabase
    .from("strategies")
    .insert({
      user_id: user.id,
      name: data.name,
      description: data.description || null,
      style: data.style || null,
      risk_level: data.risk_level || null,
      is_active: true,
    })
    .select("id")
    .single();
  if (sErr || !strategy) throw new Error(sErr?.message || "Failed to create strategy");

  const { data: version, error: vErr } = await supabase
    .from("strategy_versions")
    .insert({
      strategy_id: strategy.id,
      version_number: 1,
      prompt_text: data.prompt_text || null,
      max_position_pct: data.max_position_pct,
      min_position_pct: data.min_position_pct,
      cash_min_pct: data.cash_min_pct,
      cash_max_pct: data.cash_max_pct,
      turnover_preference: data.turnover_preference || null,
      holding_period_bias: data.holding_period_bias || null,
      allow_fractional_shares: false,
    })
    .select("id")
    .single();
  if (vErr || !version) throw new Error(vErr?.message || "Failed to create strategy version");

  // Deactivate any prior assignment then assign new one
  await supabase
    .from("portfolio_strategy_assignments")
    .update({ is_active: false, ended_at: new Date().toISOString() })
    .eq("portfolio_id", portfolioId)
    .eq("is_active", true);

  const { error: assignErr } = await supabase.from("portfolio_strategy_assignments").insert({
    portfolio_id: portfolioId,
    strategy_id: strategy.id,
    strategy_version_id: version.id,
    is_active: true,
    assigned_at: new Date().toISOString(),
  });
  if (assignErr) throw new Error(assignErr.message);

  revalidatePath("/strategies");
  revalidatePath(`/portfolios/${portfolioId}`);

  return { strategyId: strategy.id };
}

export async function assignExistingStrategyToPortfolio(
  portfolioId: string,
  strategyId: string
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: version } = await supabase
    .from("strategy_versions")
    .select("id")
    .eq("strategy_id", strategyId)
    .order("version_number", { ascending: false })
    .limit(1)
    .single();
  if (!version) throw new Error("Strategy version not found");

  await supabase
    .from("portfolio_strategy_assignments")
    .update({ is_active: false, ended_at: new Date().toISOString() })
    .eq("portfolio_id", portfolioId)
    .eq("is_active", true);

  await supabase.from("portfolio_strategy_assignments").insert({
    portfolio_id: portfolioId,
    strategy_id: strategyId,
    strategy_version_id: version.id,
    is_active: true,
    assigned_at: new Date().toISOString(),
  });

  revalidatePath(`/portfolios/${portfolioId}`);
}

export async function getUserStrategies() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("strategies")
    .select("id, name, description, style, risk_level")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  return data ?? [];
}

// ─── First recommendation ──────────────────────────────────────────────────────

export async function triggerFirstRecommendation(portfolioId: string) {
  const { runPortfolioAiRecommendation } = await import(
    "@/app/portfolios/[id]/recommendation-actions"
  );
  const fd = new FormData();
  fd.set("portfolio_id", portfolioId);
  return await runPortfolioAiRecommendation(fd);
}
