"use server";

import OpenAI from "openai";
import { getTickerMarketContext } from "@/lib/market-data/finnhub";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getPortfolioValuation } from "@/lib/portfolio/valuation";

type AiRecommendation = {
  action_type: string | null;
  ticker: string | null;
  company_name: string | null;
  thesis: string | null;
  rationale: string | null;
  risks: string | null;
  conviction: string | null;
  confidence_score: number | null;
  priority_rank: number | null;
  sizing_pct: number | null;
  sizing_dollars: number | null;
  share_quantity: number | null;
  target_price_1: number | null;
  target_price_2: number | null;
  stop_price: number | null;
  time_horizon: string | null;
};

type AiRunResponse = {
  summary: string;
  recommendations: AiRecommendation[];
};

type HealthReport = {
  overall_score: number | null;
  risk_assessment: string | null;
  concentration_analysis: string | null;
  gaps_and_weaknesses: string | null;
  strengths: string | null;
  suggested_focus: string | null;
};

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}

function extractJsonText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("```")) {
    const withoutFenceStart = trimmed.replace(/^```(?:json)?/i, "").trim();
    return withoutFenceStart.replace(/```$/, "").trim();
  }
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}

function normalizeRecommendation(raw: Record<string, unknown>): AiRecommendation | null {
  const actionType = String(raw.action_type ?? "").trim().toLowerCase();
  const ticker = String(raw.ticker ?? "").trim().toUpperCase();
  const thesis = String(raw.thesis ?? "").trim();
  if (!actionType || !ticker || !thesis) return null;
  return {
    action_type: actionType,
    ticker,
    company_name: String(raw.company_name ?? "").trim() || null,
    thesis,
    rationale: String(raw.rationale ?? "").trim() || null,
    risks: String(raw.risks ?? "").trim() || null,
    conviction: String(raw.conviction ?? "").trim() || null,
    confidence_score: toNullableNumber(raw.confidence_score),
    priority_rank: toNullableNumber(raw.priority_rank),
    sizing_pct: toNullableNumber(raw.sizing_pct),
    sizing_dollars: toNullableNumber(raw.sizing_dollars),
    share_quantity: toNullableNumber(raw.share_quantity),
    target_price_1: toNullableNumber(raw.target_price_1),
    target_price_2: toNullableNumber(raw.target_price_2),
    stop_price: toNullableNumber(raw.stop_price),
    time_horizon: String(raw.time_horizon ?? "").trim() || null,
  };
}

async function buildPortfolioAiContext(portfolioId: string, userId: string) {
  const supabase = await createClient();

  const { data: portfolio, error: portfolioError } = await supabase
    .from("portfolios")
    .select("*")
    .eq("id", portfolioId)
    .eq("user_id", userId)
    .single();

  if (portfolioError || !portfolio) throw new Error("Portfolio not found.");

  const [
    { data: holdings, error: holdingsError },
    { data: transactions, error: transactionsError },
    { data: cashLedger, error: cashLedgerError },
    { data: notes, error: notesError },
    { data: snapshots, error: snapshotsError },
    { data: activeAssignment, error: activeAssignmentError },
    { data: recentRuns, error: recentRunsError },
  ] = await Promise.all([
    supabase.from("holdings").select("*").eq("portfolio_id", portfolioId).order("ticker", { ascending: true }),
    supabase.from("portfolio_transactions").select("*").eq("portfolio_id", portfolioId).order("traded_at", { ascending: false }).limit(20),
    supabase.from("cash_ledger").select("*").eq("portfolio_id", portfolioId).order("effective_at", { ascending: false }).limit(10),
    supabase.from("portfolio_notes").select("*").eq("portfolio_id", portfolioId).order("created_at", { ascending: false }).limit(5),
    supabase.from("portfolio_snapshots").select("snapshot_date, total_value").eq("portfolio_id", portfolioId).order("snapshot_date", { ascending: false }).limit(5),
    supabase.from("portfolio_strategy_assignments").select(`
      *,
      strategies (id, name, description, style, risk_level),
      strategy_versions (id, version_number, prompt_text, max_position_pct, min_position_pct, turnover_preference, holding_period_bias, cash_min_pct, cash_max_pct)
    `).eq("portfolio_id", portfolioId).eq("is_active", true).is("ended_at", null).order("assigned_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("recommendation_runs").select("id, status, summary, model_name, created_at").eq("portfolio_id", portfolioId).order("created_at", { ascending: false }).limit(10),
  ]);

  if (holdingsError) throw new Error(holdingsError.message);
  if (transactionsError) throw new Error(transactionsError.message);
  if (cashLedgerError) throw new Error(cashLedgerError.message);
  if (notesError) throw new Error(notesError.message);
  if (snapshotsError) throw new Error(snapshotsError.message);
  if (activeAssignmentError) throw new Error(activeAssignmentError.message);
  if (recentRunsError) throw new Error(recentRunsError.message);

  const recentRunIds = (recentRuns ?? []).map((run) => run.id);
  let recentRecommendationItems: any[] = [];

  if (recentRunIds.length > 0) {
    const { data: items, error: itemsError } = await supabase
      .from("recommendation_items")
      .select("recommendation_run_id, action_type, ticker, company_name, thesis, conviction, confidence_score, priority_rank, recommendation_status, created_at")
      .eq("portfolio_id", portfolioId)
      .in("recommendation_run_id", recentRunIds)
      .order("created_at", { ascending: false })
      .limit(10);

    if (itemsError) throw new Error(itemsError.message);
    recentRecommendationItems = items ?? [];
  }

  const valuation = await getPortfolioValuation({
    holdings: (holdings ?? []).map((holding: any) => ({
      id: holding.id,
      ticker: holding.ticker,
      company_name: holding.company_name,
      asset_type: holding.asset_type,
      shares: holding.shares,
      average_cost_basis: holding.average_cost_basis,
    })),
    cashBalance: Number(portfolio.cash_balance ?? 0),
  });

  const simplifiedHoldings = valuation.valued_holdings.map((holding) => ({
    ticker: holding.ticker,
    company_name: holding.company_name,
    asset_type: holding.asset_type,
    shares: holding.shares_number,
    average_cost_basis: holding.average_cost_basis_number,
    current_price: holding.current_price,
    market_value: holding.market_value,
    unrealized_pl: holding.unrealized_pl,
    unrealized_pl_pct: holding.unrealized_pl_pct,
    weight_pct: holding.weight_pct,
  }));

  // Fetch live market context: news, analyst ratings, price targets per ticker
  let marketContext: Record<string, unknown> = {};
  const tickers = (holdings ?? []).map((h: any) => h.ticker).filter(Boolean);
  if (tickers.length > 0) {
    try {
      marketContext = await getTickerMarketContext(tickers);
    } catch {
      // Non-fatal — Grok still runs without market context
    }
  }

  return {
    generated_at: new Date().toISOString(),
    portfolio: {
      id: portfolio.id,
      name: portfolio.name,
      description: portfolio.description,
      account_type: portfolio.account_type,
      status: portfolio.status,
      base_currency: portfolio.base_currency,
      benchmark_symbol: portfolio.benchmark_symbol ?? "SPY",
      cash_balance: Number(portfolio.cash_balance ?? 0),
      created_at: portfolio.created_at,
    },
    current_valuation: {
      cash_balance: Number(portfolio.cash_balance ?? 0),
      holdings_value: valuation.holdings_value,
      total_portfolio_value: valuation.total_portfolio_value,
      total_positions: simplifiedHoldings.length,
      holdings: simplifiedHoldings,
    },
    strategy: activeAssignment
      ? {
          assignment: activeAssignment,
          strategy: (activeAssignment as any).strategies ?? null,
          strategy_version: (activeAssignment as any).strategy_versions ?? null,
        }
      : null,
    notes: notes ?? [],
    recent_transactions: transactions ?? [],
    recent_cash_ledger: cashLedger ?? [],
    recent_snapshots: snapshots ?? [],
    recent_recommendation_runs: recentRuns ?? [],
    recent_recommendation_items: recentRecommendationItems,
    market_context: marketContext,
  };
}

// --- Grok: Buy/Hold/Sell Recommendations with live search ---
async function callGrokForRecommendations(context: unknown): Promise<AiRunResponse> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error("Missing XAI_API_KEY in environment variables.");

  const client = new OpenAI({
    apiKey,
    baseURL: "https://api.x.ai/v1",
    timeout: 300000,
  });

  const systemPrompt = [
    "You are an institutional-quality portfolio analyst with deep knowledge of equities, ETFs, and portfolio construction.",
    "You have access to real-time web search and X (Twitter) search — use them to get current stock prices, recent earnings, analyst sentiment, and market news for each holding and any new buy candidates.",
    "Search X for market sentiment and trending discussion on each ticker before making recommendations.",
    "The portfolio context already includes Finnhub market data (news, analyst ratings, price targets) — use this alongside your live search.",
    "Evaluate the entire portfolio and strategy context before making any recommendation.",
    "Respect current holdings, cash balance, benchmark, account type, strategy rules, concentration, turnover preference, and holding period bias.",
    "You may recommend: buy, add, trim, sell, hold, rebalance, or raise_cash.",
    "For new buy candidates, search for current opportunities that fit the strategy style and risk level.",
    "Prefer high-quality, finance-first reasoning grounded in current data.",
    "Return only valid JSON with no markdown fences.",
  ].join(" ");

  const userPrompt = `Search for current market data and sentiment on each holding, then analyze this portfolio and return a strict JSON object:

{
  "summary": "short portfolio-level summary with current market context (2-3 sentences)",
  "recommendations": [
    {
      "action_type": "buy|add|trim|sell|hold|rebalance|raise_cash",
      "ticker": "string",
      "company_name": "string|null",
      "thesis": "string (investment-grade, include current price/news context)",
      "rationale": "string|null",
      "risks": "string|null",
      "conviction": "Low|Moderate|High|Very High|null",
      "confidence_score": number|null,
      "priority_rank": number|null,
      "sizing_pct": number|null,
      "sizing_dollars": number|null,
      "share_quantity": number|null,
      "target_price_1": number|null,
      "target_price_2": number|null,
      "stop_price": number|null,
      "time_horizon": "short_term|medium_term|long_term|null"
    }
  ]
}

Rules:
- Search for current price, recent news, and X sentiment for EACH existing holding before making a recommendation.
- Provide a recommendation for EVERY holding in the portfolio — no holding should be skipped.
- Additionally suggest 1-3 NEW buy candidates if cash is available and the strategy supports it. Search for current opportunities that fit the strategy style, risk level, and gaps in the portfolio. Name real tickers with current price context.
- For each existing holding choose: hold, add, trim, or sell based on strategy rules, current price action, concentration, and portfolio health.
- For trim/sell/hold, only reference tickers that exist in the provided holdings.
- Keep sizing realistic relative to available cash and portfolio size.
- Keep thesis concise but investment-grade, grounded in current data (1-2 sentences).
- Return JSON only, no markdown fences.

Portfolio context:
${JSON.stringify(context, null, 2)}`.trim();

  const response = await client.responses.create({
    model: "grok-4-fast",
    input: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    tools: [
      { type: "web_search" },
      { type: "x_search" },
    ],
  } as any);

  const outputText = response.output_text?.trim();
  if (!outputText) throw new Error("Grok returned an empty response.");

  const parsed = JSON.parse(extractJsonText(outputText)) as {
    summary?: unknown;
    recommendations?: unknown;
  };

  const summary =
    typeof parsed.summary === "string" && parsed.summary.trim()
      ? parsed.summary.trim()
      : "AI portfolio review completed.";

  const recommendationsRaw = Array.isArray(parsed.recommendations) ? parsed.recommendations : [];
  const recommendations = recommendationsRaw
    .map((item) => item && typeof item === "object" ? normalizeRecommendation(item as Record<string, unknown>) : null)
    .filter((item): item is AiRecommendation => Boolean(item));

  return { summary, recommendations };
}

// --- Gemini Flash: Portfolio Health Report (free, cross-check) ---
async function callGeminiForHealthReport(context: unknown): Promise<HealthReport> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return { overall_score: null, risk_assessment: null, concentration_analysis: null, gaps_and_weaknesses: null, strengths: null, suggested_focus: null };
  }

  const prompt = `You are a portfolio health analyst. Analyze this investment portfolio and return ONLY a valid JSON object (no markdown, no preamble):

{
  "overall_score": <number 1-100>,
  "risk_assessment": "<2-3 sentence risk analysis>",
  "concentration_analysis": "<2-3 sentences on sector/position concentration>",
  "gaps_and_weaknesses": "<2-3 sentences on what's missing or overexposed>",
  "strengths": "<2-3 sentences on what's working well>",
  "suggested_focus": "<1-2 sentences on what to focus on next>"
}

Portfolio context:
${JSON.stringify(context, null, 2)}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 1500 },
        }),
      }
    );

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    if (!text) throw new Error("Gemini returned empty response.");

    const parsed = JSON.parse(extractJsonText(text)) as HealthReport;
    return {
      overall_score: toNullableNumber(parsed.overall_score),
      risk_assessment: typeof parsed.risk_assessment === "string" ? parsed.risk_assessment : null,
      concentration_analysis: typeof parsed.concentration_analysis === "string" ? parsed.concentration_analysis : null,
      gaps_and_weaknesses: typeof parsed.gaps_and_weaknesses === "string" ? parsed.gaps_and_weaknesses : null,
      strengths: typeof parsed.strengths === "string" ? parsed.strengths : null,
      suggested_focus: typeof parsed.suggested_focus === "string" ? parsed.suggested_focus : null,
    };
  } catch {
    return { overall_score: null, risk_assessment: null, concentration_analysis: null, gaps_and_weaknesses: null, strengths: null, suggested_focus: null };
  }
}

async function insertRecommendationStatusHistory(args: {
  portfolioId: string;
  recommendationItemIds: string[];
  notes: string;
}) {
  if (!args.recommendationItemIds.length) return;
  const supabase = await createClient();
  const payload = args.recommendationItemIds.map((id) => ({
    recommendation_item_id: id,
    portfolio_id: args.portfolioId,
    old_status: null,
    new_status: "proposed",
    changed_by: "ai",
    notes: args.notes,
  }));
  const { error } = await supabase.from("recommendation_item_status_history").insert(payload);
  if (error) throw new Error(error.message);
}

export async function runPortfolioAiRecommendation(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in to run AI recommendations.");

  const portfolioId = String(formData.get("portfolio_id") || "").trim();
  if (!portfolioId) throw new Error("Portfolio ID is required.");

  const context = await buildPortfolioAiContext(portfolioId, user.id);
  const activeAssignment = (context as any).strategy?.assignment ?? null;

  const { data: run, error: runError } = await supabase
    .from("recommendation_runs")
    .insert({
      portfolio_id: portfolioId,
      strategy_id: activeAssignment?.strategy_id ?? null,
      strategy_version_id: activeAssignment?.strategy_version_id ?? null,
      run_type: "ai_review",
      triggered_by: "manual",
      model_name: "grok-4-fast",
      model_version: "grok-4-fast",
      summary: "AI review in progress...",
      status: "pending",
    })
    .select()
    .single();

  if (runError || !run) throw new Error(runError?.message || "Failed to create AI recommendation run.");

  try {
    const [grokResult, geminiResult] = await Promise.all([
      callGrokForRecommendations(context),
      callGeminiForHealthReport(context),
    ]);

    let insertedItemIds: string[] = [];
    if (grokResult.recommendations.length > 0) {
      const { data: insertedItems, error: insertItemsError } = await supabase
        .from("recommendation_items")
        .insert(
          grokResult.recommendations.map((item) => ({
            recommendation_run_id: run.id,
            portfolio_id: portfolioId,
            action_type: item.action_type,
            ticker: item.ticker,
            company_name: item.company_name,
            thesis: item.thesis,
            rationale: item.rationale,
            risks: item.risks,
            conviction: item.conviction,
            confidence_score: item.confidence_score,
            priority_rank: item.priority_rank,
            sizing_pct: item.sizing_pct,
            sizing_dollars: item.sizing_dollars,
            share_quantity: item.share_quantity,
            target_price_1: item.target_price_1,
            target_price_2: item.target_price_2,
            stop_price: item.stop_price,
            time_horizon: item.time_horizon,
            recommendation_status: "proposed",
            user_decision: null,
            decision_notes: null,
          }))
        )
        .select("id");

      if (insertItemsError) throw new Error(insertItemsError.message);
      insertedItemIds = (insertedItems ?? []).map((item: any) => item.id);
      await insertRecommendationStatusHistory({
        portfolioId,
        recommendationItemIds: insertedItemIds,
        notes: "Initial AI recommendation created.",
      });
    }

    let completionSummary = grokResult.summary || "AI review completed.";
    if (geminiResult.overall_score !== null) {
      completionSummary += ` | Health Score: ${geminiResult.overall_score}/100.`;
    }
    if (geminiResult.suggested_focus) {
      completionSummary += ` Focus: ${geminiResult.suggested_focus}`;
    }

    const { error: updateRunError } = await supabase
      .from("recommendation_runs")
      .update({ status: "completed", summary: truncateText(completionSummary, 500) })
      .eq("id", run.id)
      .eq("portfolio_id", portfolioId);

    if (updateRunError) throw new Error(updateRunError.message);

    revalidatePath(`/portfolios/${portfolioId}`);
    revalidatePath("/dashboard");

    return {
      runId: run.id,
      recommendationCount: grokResult.recommendations.length,
      summary: completionSummary,
      healthReport: geminiResult,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI recommendation run failed.";
    await supabase
      .from("recommendation_runs")
      .update({ status: "failed", summary: truncateText(`AI run failed: ${message}`, 500) })
      .eq("id", run.id)
      .eq("portfolio_id", portfolioId);
    revalidatePath(`/portfolios/${portfolioId}`);
    revalidatePath("/dashboard");
    throw new Error(message);
  }
}

export async function createManualRecommendation(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in to create a recommendation.");

  const portfolioId = String(formData.get("portfolio_id") || "").trim();
  const actionType = String(formData.get("action_type") || "").trim().toLowerCase();
  const ticker = String(formData.get("ticker") || "").trim().toUpperCase();
  const companyName = String(formData.get("company_name") || "").trim();
  const thesis = String(formData.get("thesis") || "").trim();
  const rationale = String(formData.get("rationale") || "").trim();
  const risks = String(formData.get("risks") || "").trim();
  const conviction = String(formData.get("conviction") || "").trim();
  const confidenceScoreRaw = String(formData.get("confidence_score") || "").trim();
  const priorityRankRaw = String(formData.get("priority_rank") || "").trim();
  const sizingPctRaw = String(formData.get("sizing_pct") || "").trim();
  const sizingDollarsRaw = String(formData.get("sizing_dollars") || "").trim();
  const shareQuantityRaw = String(formData.get("share_quantity") || "").trim();
  const targetPrice1Raw = String(formData.get("target_price_1") || "").trim();
  const targetPrice2Raw = String(formData.get("target_price_2") || "").trim();
  const stopPriceRaw = String(formData.get("stop_price") || "").trim();
  const timeHorizon = String(formData.get("time_horizon") || "").trim();

  if (!portfolioId) throw new Error("Portfolio ID is required.");
  if (!actionType) throw new Error("Action type is required.");
  if (!ticker) throw new Error("Ticker is required.");
  if (!thesis) throw new Error("Thesis is required.");

  const { data: portfolio, error: portfolioError } = await supabase
    .from("portfolios").select("id").eq("id", portfolioId).eq("user_id", user.id).single();
  if (portfolioError || !portfolio) throw new Error("Portfolio not found.");

  const { data: activeAssignment } = await supabase
    .from("portfolio_strategy_assignments")
    .select("strategy_id, strategy_version_id")
    .eq("portfolio_id", portfolioId).eq("is_active", true).is("ended_at", null)
    .order("assigned_at", { ascending: false }).limit(1).maybeSingle();

  const { data: run, error: runError } = await supabase
    .from("recommendation_runs")
    .insert({
      portfolio_id: portfolioId,
      strategy_id: activeAssignment?.strategy_id ?? null,
      strategy_version_id: activeAssignment?.strategy_version_id ?? null,
      run_type: "manual_review",
      triggered_by: "manual",
      model_name: "manual-seed",
      model_version: "v1",
      summary: `${actionType.toUpperCase()} recommendation for ${ticker}`,
      status: "completed",
    })
    .select().single();

  if (runError || !run) throw new Error(runError?.message || "Failed to create recommendation run.");

  const { data: item, error: itemError } = await supabase
    .from("recommendation_items")
    .insert({
      recommendation_run_id: run.id,
      portfolio_id: portfolioId,
      action_type: actionType,
      ticker,
      company_name: companyName || null,
      thesis,
      rationale: rationale || null,
      risks: risks || null,
      conviction: conviction || null,
      confidence_score: confidenceScoreRaw ? Number(confidenceScoreRaw) : null,
      priority_rank: priorityRankRaw ? Number(priorityRankRaw) : null,
      sizing_pct: sizingPctRaw ? Number(sizingPctRaw) : null,
      sizing_dollars: sizingDollarsRaw ? Number(sizingDollarsRaw) : null,
      share_quantity: shareQuantityRaw ? Number(shareQuantityRaw) : null,
      target_price_1: targetPrice1Raw ? Number(targetPrice1Raw) : null,
      target_price_2: targetPrice2Raw ? Number(targetPrice2Raw) : null,
      stop_price: stopPriceRaw ? Number(stopPriceRaw) : null,
      time_horizon: timeHorizon || null,
      recommendation_status: "proposed",
      user_decision: null,
      decision_notes: null,
    })
    .select().single();

  if (itemError || !item) throw new Error(itemError?.message || "Failed to create recommendation item.");

  const { error: historyError } = await supabase
    .from("recommendation_item_status_history")
    .insert({
      recommendation_item_id: item.id,
      portfolio_id: portfolioId,
      old_status: null,
      new_status: "proposed",
      changed_by: "user",
      notes: "Initial manual recommendation created.",
    });

  if (historyError) throw new Error(historyError.message);

  revalidatePath(`/portfolios/${portfolioId}`);
  revalidatePath("/dashboard");
}

export async function updateRecommendationStatus(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in to update a recommendation.");

  const recommendationItemId = String(formData.get("recommendation_item_id") || "").trim();
  const portfolioId = String(formData.get("portfolio_id") || "").trim();
  const newStatus = String(formData.get("new_status") || "").trim();
  const note = String(formData.get("note") || "").trim();

  if (!recommendationItemId) throw new Error("Recommendation item ID is required.");
  if (!portfolioId) throw new Error("Portfolio ID is required.");
  if (!newStatus) throw new Error("New status is required.");

  const { data: portfolio, error: portfolioError } = await supabase
    .from("portfolios").select("id, cash_balance").eq("id", portfolioId).eq("user_id", user.id).single();
  if (portfolioError || !portfolio) throw new Error("Portfolio not found.");

  const { data: item, error: itemError } = await supabase
    .from("recommendation_items")
    .select("id, recommendation_status, action_type, ticker, company_name, share_quantity, sizing_dollars, sizing_pct, target_price_1")
    .eq("id", recommendationItemId).eq("portfolio_id", portfolioId).single();
  if (itemError || !item) throw new Error("Recommendation item not found.");

  const userDecisionMap: Record<string, string | null> = {
    proposed: null, rejected: "rejected",
    watchlist: "watchlist", executed: "executed",
  };

  const { error: updateError } = await supabase
    .from("recommendation_items")
    .update({
      recommendation_status: newStatus,
      user_decision: userDecisionMap[newStatus] ?? null,
      decision_notes: note || null,
    })
    .eq("id", recommendationItemId).eq("portfolio_id", portfolioId);
  if (updateError) throw new Error(updateError.message);

  const { error: historyError } = await supabase
    .from("recommendation_item_status_history")
    .insert({
      recommendation_item_id: recommendationItemId,
      portfolio_id: portfolioId,
      old_status: item.recommendation_status,
      new_status: newStatus,
      changed_by: "user",
      notes: note || null,
    });
  if (historyError) throw new Error(historyError.message);

  // Auto-create transaction when marking as executed
  if (newStatus === "executed" && item.ticker) {
    const action = (item.action_type || "").toLowerCase();
    const isBuy = action === "buy" || action === "add";
    const isSell = action === "sell" || action === "trim";

    if (isBuy || isSell) {
      const transactionType = isBuy ? "buy" : "sell";
      const quantity = item.share_quantity ? Number(item.share_quantity) : null;
      const pricePerShare = item.target_price_1 ? Number(item.target_price_1) : null;
      const grossAmount = quantity && pricePerShare
        ? quantity * pricePerShare
        : item.sizing_dollars ? Number(item.sizing_dollars) : null;

      if (grossAmount && grossAmount > 0) {
        const fees = 0;
        const netCashImpact = isBuy ? -(grossAmount + fees) : grossAmount - fees;
        const ticker = item.ticker.toUpperCase();

        if (isBuy && quantity) {
          const { data: existingHolding } = await supabase
            .from("holdings").select("*").eq("portfolio_id", portfolioId).eq("ticker", ticker).maybeSingle();

          if (!existingHolding) {
            await supabase.from("holdings").insert({
              portfolio_id: portfolioId,
              ticker,
              company_name: item.company_name || null,
              shares: quantity,
              average_cost_basis: pricePerShare ?? grossAmount / quantity,
              asset_type: "stock",
            });
          } else {
            const oldShares = Number(existingHolding.shares ?? 0);
            const oldAvgCost = Number(existingHolding.average_cost_basis ?? 0);
            const newShares = oldShares + quantity;
            const newAvgCost = pricePerShare
              ? (oldShares * oldAvgCost + quantity * pricePerShare) / newShares
              : oldAvgCost;
            await supabase.from("holdings").update({ shares: newShares, average_cost_basis: newAvgCost }).eq("id", existingHolding.id);
          }
        }

        if (isSell && quantity) {
          const { data: existingHolding } = await supabase
            .from("holdings").select("*").eq("portfolio_id", portfolioId).eq("ticker", ticker).maybeSingle();

          if (existingHolding) {
            const remainingShares = Number(existingHolding.shares ?? 0) - quantity;
            if (remainingShares <= 0) {
              await supabase.from("holdings").delete().eq("id", existingHolding.id);
            } else {
              await supabase.from("holdings").update({ shares: remainingShares }).eq("id", existingHolding.id);
            }
          }
        }

        const newCashBalance = Number(portfolio.cash_balance ?? 0) + netCashImpact;
        await supabase.from("portfolios").update({ cash_balance: newCashBalance }).eq("id", portfolioId);

        await supabase.from("portfolio_transactions").insert({
          portfolio_id: portfolioId,
          transaction_type: transactionType,
          ticker,
          company_name: item.company_name || null,
          quantity,
          price_per_share: pricePerShare,
          gross_amount: grossAmount,
          fees,
          net_cash_impact: netCashImpact,
          notes: `Auto-created from AI recommendation. Edit if actual price differs.`,
          traded_at: new Date().toISOString(),
        });
      }
    }
  }

  revalidatePath(`/portfolios/${portfolioId}`);
  revalidatePath("/dashboard");
}

export async function deleteRecommendationItem(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in to delete a recommendation.");

  const recommendationItemId = String(formData.get("recommendation_item_id") || "").trim();
  const portfolioId = String(formData.get("portfolio_id") || "").trim();

  if (!recommendationItemId) throw new Error("Recommendation item ID is required.");
  if (!portfolioId) throw new Error("Portfolio ID is required.");

  // Verify the portfolio belongs to the user
  const { data: portfolio, error: portfolioError } = await supabase
    .from("portfolios").select("id").eq("id", portfolioId).eq("user_id", user.id).single();
  if (portfolioError || !portfolio) throw new Error("Portfolio not found.");

  // Delete status history first (foreign key constraint)
  await supabase
    .from("recommendation_item_status_history")
    .delete()
    .eq("recommendation_item_id", recommendationItemId);

  // Delete the recommendation item
  const { error: deleteError } = await supabase
    .from("recommendation_items")
    .delete()
    .eq("id", recommendationItemId)
    .eq("portfolio_id", portfolioId);

  if (deleteError) throw new Error(deleteError.message);

  revalidatePath(`/portfolios/${portfolioId}`);
  revalidatePath("/dashboard");
}
