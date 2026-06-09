"use server";

import OpenAI from "openai";
import { getTickerMarketContext, getFinnhubQuote } from "@/lib/market-data/finnhub";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getPortfolioValuation } from "@/lib/portfolio/valuation";
import { searchRedditPosts } from "@/lib/market-data/reddit";
import { buildCompactRedditPulse, type CompactRedditPulse } from "@/lib/market-data/reddit-pulse";
import { getFredMacroSignals } from "@/lib/market-data/fred";
import { computeRegime, regimePromptContext } from "@/lib/market-data/regime";
import { getFinnhubMetrics } from "@/lib/market-data/finnhub";
import { getFmpMarketBreadth } from "@/lib/market-data/fmp-breadth";


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
  bear_price: number | null;
  bull_price: number | null;
  base_return_pct: number | null;
  bear_return_pct: number | null;
  bull_return_pct: number | null;
  catalysts: string[] | null;
  target_change_reason: string | null;
  time_horizon: string | null;
  target_horizon: string | null;
  probability_bear: number | null;
  probability_base: number | null;
  probability_bull: number | null;
  expected_value: number | null;
  expected_return_pct: number | null;
  low_conviction_flag: boolean | null;
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

  const bearPrice = toNullableNumber(raw.bear_price);
  const basePrice = toNullableNumber(raw.base_price ?? raw.target_price_1);
  const bullPrice = toNullableNumber(raw.bull_price);
  const bearReturn = toNullableNumber(raw.bear_return_pct);
  const baseReturn = toNullableNumber(raw.base_return_pct);
  const bullReturn = toNullableNumber(raw.bull_return_pct);

  const probBear = toNullableNumber(raw.probability_bear);
  const probBase = toNullableNumber(raw.probability_base);
  const probBull = toNullableNumber(raw.probability_bull);

  const hasProbs = probBear != null && probBase != null && probBull != null;
  const hasPrices = bearPrice != null && basePrice != null && bullPrice != null;
  const hasReturns = bearReturn != null && baseReturn != null && bullReturn != null;

  const expectedValue = hasProbs && hasPrices
    ? (probBear * bearPrice + probBase * basePrice + probBull * bullPrice) / 100
    : null;

  const expectedReturnPct = hasProbs && hasReturns
    ? (probBear * bearReturn + probBase * baseReturn + probBull * bullReturn) / 100
    : null;

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
    target_price_1: basePrice,
    target_price_2: toNullableNumber(raw.target_price_2),
    stop_price: toNullableNumber(raw.stop_price),
    bear_price: bearPrice,
    bull_price: bullPrice,
    base_return_pct: baseReturn,
    bear_return_pct: bearReturn,
    bull_return_pct: bullReturn,
    catalysts: Array.isArray(raw.catalysts) ? (raw.catalysts as unknown[]).map(c => String(c)).filter(Boolean) : null,
    target_change_reason: String(raw.target_change_reason ?? "").trim() || null,
    time_horizon: String(raw.time_horizon ?? "").trim() || null,
    target_horizon: String(raw.target_horizon ?? "").trim() || null,
    probability_bear: probBear,
    probability_base: probBase,
    probability_bull: probBull,
    expected_value: expectedValue,
    expected_return_pct: expectedReturnPct,
    low_conviction_flag: null, // set post-run in anchoring detection pass
  };
}

function inferPortfolioRole(actionType: string | null, conviction: string | null): string {
  const conv = (conviction ?? "").toLowerCase().replace(/\s+/g, "_");
  if (conv === "very_high") return "high_conviction_growth";
  const act = (actionType ?? "").toLowerCase();
  if (act === "add") return "core_holding";
  if (conv === "low") return "starter_position";
  if (conv === "moderate") return "tactical_momentum";
  return "core_holding";
}

function inferHoldingProfile(timeHorizon: string | null): string {
  const th = (timeHorizon ?? "").toLowerCase();
  if (th === "short_term") return "short_term_tactical";
  if (th === "long_term") return "long_term_compounder";
  return "medium_term_momentum";
}

function normalizeConviction(conviction: string | null): string | null {
  if (!conviction) return null;
  return conviction.toLowerCase().replace(/\s+/g, "_");
}

async function fetchRedditSentimentForTickers(
  holdings: { ticker: string; company_name?: string | null }[]
): Promise<Record<string, CompactRedditPulse>> {
  const ANALYSIS_SUBREDDITS = ["stocks", "investing", "wallstreetbets"];
  const result: Record<string, CompactRedditPulse> = {};

  for (const h of holdings) {
    try {
      const posts = await searchRedditPosts(h.ticker, h.company_name ?? h.ticker, {
        timeWindow: "week",
        subreddits: ANALYSIS_SUBREDDITS,
        maxPerSubreddit: 5,
      });
      if (posts.length > 0) {
        result[h.ticker.toUpperCase()] = buildCompactRedditPulse(h.ticker, posts);
      }
    } catch {
      // non-fatal per ticker
    }
  }

  return result;
}

// ─── Factor Intelligence ─────────────────────────────────────────────────────

type FactorScores = Record<string, number>;

const TICKER_FACTORS: Record<string, FactorScores> = {
  // AI / Semiconductors
  NVDA: { ai_infrastructure: 0.95, high_beta_growth: 0.85, liquidity_sensitive: 0.80, speculative_momentum: 0.40 },
  AMD:  { ai_infrastructure: 0.85, high_beta_growth: 0.80, liquidity_sensitive: 0.75 },
  AVGO: { ai_infrastructure: 0.80, high_beta_growth: 0.60, defensive: 0.20 },
  TSM:  { ai_infrastructure: 0.90, high_beta_growth: 0.55 },
  SMCI: { ai_infrastructure: 0.90, high_beta_growth: 0.85, speculative_momentum: 0.70 },
  ARM:  { ai_infrastructure: 0.80, high_beta_growth: 0.75, speculative_momentum: 0.50 },
  AMAT: { ai_infrastructure: 0.75, high_beta_growth: 0.60 },
  LRCX: { ai_infrastructure: 0.75, high_beta_growth: 0.60 },
  KLAC: { ai_infrastructure: 0.70, high_beta_growth: 0.55 },
  MRVL: { ai_infrastructure: 0.80, high_beta_growth: 0.65 },
  MU:   { ai_infrastructure: 0.80, high_beta_growth: 0.70, liquidity_sensitive: 0.65 },
  ON:   { ai_infrastructure: 0.55, high_beta_growth: 0.60 },
  INTC: { ai_infrastructure: 0.50, high_beta_growth: 0.20 },
  QCOM: { ai_infrastructure: 0.55, consumer_tech: 0.40, high_beta_growth: 0.40 },
  // Big Tech / Cloud Platform
  MSFT: { cloud_growth: 0.80, ai_infrastructure: 0.50, consumer_tech: 0.30, defensive: 0.30 },
  AMZN: { cloud_growth: 0.70, consumer_tech: 0.50, high_beta_growth: 0.50 },
  GOOG: { cloud_growth: 0.70, consumer_tech: 0.60, ai_infrastructure: 0.50 },
  GOOGL:{ cloud_growth: 0.70, consumer_tech: 0.60, ai_infrastructure: 0.50 },
  META: { consumer_tech: 0.80, high_beta_growth: 0.60, ai_infrastructure: 0.35 },
  AAPL: { consumer_tech: 0.80, defensive: 0.35, high_beta_growth: 0.25 },
  TSLA: { high_beta_growth: 0.85, speculative_momentum: 0.75, ai_infrastructure: 0.35, liquidity_sensitive: 0.80 },
  // SaaS / Cloud
  CRM:  { cloud_growth: 0.85, high_beta_growth: 0.65 },
  NOW:  { cloud_growth: 0.90, high_beta_growth: 0.70 },
  SNOW: { cloud_growth: 0.90, high_beta_growth: 0.80, liquidity_sensitive: 0.75, speculative_momentum: 0.55 },
  DDOG: { cloud_growth: 0.85, high_beta_growth: 0.75, liquidity_sensitive: 0.70 },
  NET:  { cloud_growth: 0.85, high_beta_growth: 0.75, liquidity_sensitive: 0.70 },
  PANW: { cloud_growth: 0.75, high_beta_growth: 0.65 },
  CRWD: { cloud_growth: 0.80, high_beta_growth: 0.70, liquidity_sensitive: 0.65 },
  OKTA: { cloud_growth: 0.80, high_beta_growth: 0.70, liquidity_sensitive: 0.65 },
  ZS:   { cloud_growth: 0.80, high_beta_growth: 0.70 },
  WDAY: { cloud_growth: 0.80, high_beta_growth: 0.65 },
  ADBE: { cloud_growth: 0.80, high_beta_growth: 0.60 },
  INTU: { cloud_growth: 0.75, fintech: 0.40, high_beta_growth: 0.55 },
  // Consumer Tech / Media
  NFLX: { consumer_tech: 0.82, high_beta_growth: 0.60 },
  SPOT: { consumer_tech: 0.75, high_beta_growth: 0.70, speculative_momentum: 0.40 },
  UBER: { consumer_tech: 0.70, high_beta_growth: 0.65 },
  ABNB: { consumer_tech: 0.75, high_beta_growth: 0.65 },
  PINS: { consumer_tech: 0.70, speculative_momentum: 0.50, liquidity_sensitive: 0.55 },
  SNAP: { consumer_tech: 0.65, speculative_momentum: 0.60, liquidity_sensitive: 0.70 },
  DIS:  { consumer_tech: 0.55, defensive: 0.40, high_beta_growth: 0.35 },
  RBLX: { consumer_tech: 0.70, speculative_momentum: 0.65, liquidity_sensitive: 0.70 },
  // Fintech
  V:    { fintech: 0.85, defensive: 0.40 },
  MA:   { fintech: 0.85, defensive: 0.40 },
  PYPL: { fintech: 0.80, high_beta_growth: 0.45, speculative_momentum: 0.35 },
  SQ:   { fintech: 0.80, high_beta_growth: 0.75, speculative_momentum: 0.55 },
  AFRM: { fintech: 0.65, speculative_momentum: 0.80, liquidity_sensitive: 0.85 },
  NU:   { fintech: 0.75, high_beta_growth: 0.70, speculative_momentum: 0.50 },
  SOFI: { fintech: 0.70, rates_sensitive: 0.50, speculative_momentum: 0.55 },
  COIN: { crypto_adjacent: 0.90, speculative_momentum: 0.85, liquidity_sensitive: 0.85, high_beta_growth: 0.75 },
  // Financials
  JPM:  { fintech: 0.30, rates_sensitive: 0.75, defensive: 0.50 },
  BAC:  { fintech: 0.25, rates_sensitive: 0.80, defensive: 0.40 },
  GS:   { fintech: 0.50, rates_sensitive: 0.65, high_beta_growth: 0.40 },
  MS:   { fintech: 0.50, rates_sensitive: 0.65, high_beta_growth: 0.40 },
  WFC:  { rates_sensitive: 0.80, defensive: 0.45 },
  C:    { rates_sensitive: 0.80, defensive: 0.35 },
  // Energy
  XOM:  { energy: 0.90, defensive: 0.45 },
  CVX:  { energy: 0.90, defensive: 0.45 },
  COP:  { energy: 0.85 },
  OXY:  { energy: 0.85, speculative_momentum: 0.35 },
  SLB:  { energy: 0.85 },
  EOG:  { energy: 0.80 },
  PSX:  { energy: 0.75, defensive: 0.30 },
  // Defensive / Staples
  JNJ:  { defensive: 0.90, rates_sensitive: 0.30 },
  PG:   { defensive: 0.92 },
  KO:   { defensive: 0.90, rates_sensitive: 0.35 },
  PEP:  { defensive: 0.88, rates_sensitive: 0.35 },
  WMT:  { defensive: 0.82, consumer_tech: 0.20 },
  COST: { defensive: 0.78 },
  MCD:  { defensive: 0.82, rates_sensitive: 0.25 },
  SBUX: { consumer_tech: 0.55, defensive: 0.55 },
  TGT:  { defensive: 0.72, consumer_tech: 0.25 },
  HD:   { defensive: 0.70, rates_sensitive: 0.35 },
  LOW:  { defensive: 0.68, rates_sensitive: 0.35 },
  // Healthcare
  UNH:  { defensive: 0.80, rates_sensitive: 0.20 },
  LLY:  { defensive: 0.55, high_beta_growth: 0.65, speculative_momentum: 0.40 },
  AMGN: { defensive: 0.72, rates_sensitive: 0.30 },
  PFE:  { defensive: 0.82, rates_sensitive: 0.25 },
  MRK:  { defensive: 0.80, rates_sensitive: 0.25 },
  ABT:  { defensive: 0.75 },
  BMY:  { defensive: 0.80, rates_sensitive: 0.25 },
  ABBV: { defensive: 0.78, rates_sensitive: 0.30 },
  // Industrials / Defense
  CAT:  { industrials_cycle: 0.85, defensive: 0.30 },
  DE:   { industrials_cycle: 0.85 },
  BA:   { industrials_cycle: 0.80, high_beta_growth: 0.35 },
  HON:  { industrials_cycle: 0.75, defensive: 0.40 },
  GE:   { industrials_cycle: 0.80 },
  RTX:  { industrials_cycle: 0.80, defensive: 0.40 },
  LMT:  { industrials_cycle: 0.78, defensive: 0.50 },
  NOC:  { industrials_cycle: 0.78, defensive: 0.50 },
  UPS:  { industrials_cycle: 0.70, defensive: 0.40 },
  FDX:  { industrials_cycle: 0.70, high_beta_growth: 0.30 },
  // Crypto adjacent
  MSTR: { crypto_adjacent: 0.95, speculative_momentum: 0.90, liquidity_sensitive: 0.90 },
  MARA: { crypto_adjacent: 0.90, speculative_momentum: 0.85 },
  RIOT: { crypto_adjacent: 0.90, speculative_momentum: 0.85 },
  HUT:  { crypto_adjacent: 0.85, speculative_momentum: 0.80 },
  // ETFs
  SPY:  { defensive: 0.50, high_beta_growth: 0.35, ai_infrastructure: 0.20 },
  QQQ:  { high_beta_growth: 0.70, ai_infrastructure: 0.45, cloud_growth: 0.40 },
  VOO:  { defensive: 0.55, high_beta_growth: 0.30 },
  IWM:  { high_beta_growth: 0.60, speculative_momentum: 0.40, liquidity_sensitive: 0.55 },
  XLK:  { ai_infrastructure: 0.55, cloud_growth: 0.50, high_beta_growth: 0.65 },
  XLE:  { energy: 0.90 },
  XLF:  { fintech: 0.40, rates_sensitive: 0.75 },
  XLU:  { defensive: 0.80, rates_sensitive: 0.65 },
  GLD:  { defensive: 0.70 },
  TLT:  { rates_sensitive: 0.90, defensive: 0.60 },
};

const FACTOR_ENVIRONMENTS: Record<string, { up: string[]; down: string[] }> = {
  ai_infrastructure: { up: ["AI capex expansion", "growth leadership", "tech earnings beats"], down: ["AI spending pullback", "semiconductor cycles", "risk-off rotation"] },
  cloud_growth:      { up: ["SaaS re-rating", "enterprise IT spending growth"], down: ["rate spikes", "multiple compression", "cloud spend scrutiny"] },
  high_beta_growth:  { up: ["risk-on environments", "liquidity easing", "momentum runs"], down: ["rate spikes", "momentum reversals", "value rotation"] },
  liquidity_sensitive: { up: ["Fed easing cycles", "credit expansion"], down: ["liquidity contraction", "credit tightening", "rates spike"] },
  speculative_momentum: { up: ["retail momentum", "low-volatility environments", "risk appetite peaks"], down: ["deleveraging", "sentiment reversals", "VIX spikes"] },
  crypto_adjacent:   { up: ["crypto bull markets", "speculative risk appetite"], down: ["regulatory crackdowns", "broad deleveraging", "risk-off"] },
  energy:            { up: ["oil price spikes", "inflation regimes", "supply shocks"], down: ["demand destruction", "oil gluts", "green transition acceleration"] },
  rates_sensitive:   { up: ["rate-cutting cycles", "yield curve steepening"], down: ["rate spikes", "hawkish Fed", "inflation surprises"] },
  defensive:         { up: ["volatility spikes", "bear markets", "flight to quality"], down: ["bull markets", "growth leadership", "risk-on rotation"] },
  fintech:           { up: ["consumer spending growth", "digital payments adoption"], down: ["credit tightening", "recession fears"] },
  industrials_cycle: { up: ["infrastructure spending", "manufacturing expansion"], down: ["recession", "inventory destocking"] },
  consumer_tech:     { up: ["consumer confidence", "ad market expansion"], down: ["consumer slowdown", "ad market contraction"] },
};

function buildFactorIntelligence(
  holdings: { ticker: string; company_name?: string | null; weight_pct: number | null | undefined }[],
  strategy: { name?: string | null; style?: string | null; risk_level?: string | null } | null,
  strategyVersion: { prompt_text?: string | null } | null
) {
  const name = (strategy?.name ?? "").toLowerCase();
  const style = (strategy?.style ?? "").toLowerCase();
  const promptText = (strategyVersion?.prompt_text ?? "").toLowerCase();
  const combined = `${name} ${style} ${promptText}`;

  // Portfolio-weighted factor scores
  const portFactors: Record<string, number> = {};
  let totalWeight = 0;

  for (const h of holdings) {
    const w = h.weight_pct ?? 0;
    if (w <= 0) continue;
    totalWeight += w;

    const ticker = h.ticker.toUpperCase();
    let tf: FactorScores = TICKER_FACTORS[ticker] ?? {};

    // Fallback to company name keywords when ticker is unknown
    if (Object.keys(tf).length === 0) {
      const cn = (h.company_name ?? "").toLowerCase();
      if (/semiconductor|chip|foundry|wafer|lithograph/.test(cn))       tf = { ai_infrastructure: 0.60, high_beta_growth: 0.50 };
      else if (/cloud|saas|enterprise software|platform/.test(cn))      tf = { cloud_growth: 0.60, high_beta_growth: 0.55 };
      else if (/\bai\b|artificial intelligence|machine learning/.test(cn)) tf = { ai_infrastructure: 0.65, high_beta_growth: 0.60 };
      else if (/oil|gas|energy|petroleum|lng|refin/.test(cn))           tf = { energy: 0.80 };
      else if (/bank|financial|insurance|capital market/.test(cn))      tf = { rates_sensitive: 0.65, fintech: 0.30 };
      else if (/pharma|biotech|drug|therapeut|genomic/.test(cn))        tf = { defensive: 0.55, speculative_momentum: 0.45 };
      else if (/consumer|retail|restaurant|food|beverage/.test(cn))     tf = { defensive: 0.65 };
      else if (/defense|aerospace|weapon|military/.test(cn))            tf = { industrials_cycle: 0.70, defensive: 0.45 };
      else if (/crypto|blockchain|bitcoin|digital asset/.test(cn))      tf = { crypto_adjacent: 0.85, speculative_momentum: 0.80 };
      else tf = { high_beta_growth: 0.35 };
    }

    for (const [factor, score] of Object.entries(tf)) {
      portFactors[factor] = (portFactors[factor] ?? 0) + score * w;
    }
  }

  if (totalWeight > 0) {
    for (const k of Object.keys(portFactors)) portFactors[k] = portFactors[k] / totalWeight;
  }

  // Filter to meaningful exposures and round
  const factorExposure: Record<string, number> = {};
  for (const [k, v] of Object.entries(portFactors)) {
    if (v >= 0.08) factorExposure[k] = Math.round(v * 100) / 100;
  }

  // Top 3 dominant factors
  const dominantFactors = Object.entries(factorExposure)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k);

  // Crowding detection — pairs of high-exposure factors with amplified correlation risk
  const CROWDING_PAIRS: [string, string, string][] = [
    ["ai_infrastructure", "high_beta_growth", "AI/tech factor crowding — correlated drawdown risk in risk-off episodes"],
    ["ai_infrastructure", "liquidity_sensitive", "AI + liquidity crowding — amplified sensitivity to funding conditions"],
    ["speculative_momentum", "liquidity_sensitive", "Speculation + liquidity crowding — vulnerable to sentiment reversals"],
    ["crypto_adjacent", "speculative_momentum", "Crypto/speculative crowding — extreme volatility amplification"],
    ["rates_sensitive", "defensive", "Duration clustering — concentrated sensitivity to rate changes"],
  ];
  const highFactors = new Set(Object.entries(factorExposure).filter(([, v]) => v >= 0.50).map(([k]) => k));
  const crowdingRisks = CROWDING_PAIRS
    .filter(([f1, f2]) => highFactors.has(f1) && highFactors.has(f2))
    .map(([,, msg]) => msg);

  // Behavior profile
  const volScore = (factorExposure.speculative_momentum ?? 0) * 0.40 +
    (factorExposure.high_beta_growth ?? 0) * 0.35 +
    (factorExposure.crypto_adjacent ?? 0) * 0.25;
  const volatility = volScore > 0.65 ? "very_high" : volScore > 0.45 ? "high" : volScore > 0.25 ? "moderate" : "low";

  const macroScore = (factorExposure.liquidity_sensitive ?? 0) * 0.40 +
    (factorExposure.rates_sensitive ?? 0) * 0.35 +
    (factorExposure.energy ?? 0) * 0.25;
  const macroSensitivity = macroScore > 0.55 ? "high" : macroScore > 0.35 ? "moderate_high" : macroScore > 0.20 ? "moderate" : "low";

  const ddScore = (factorExposure.speculative_momentum ?? 0) * 0.40 +
    (factorExposure.liquidity_sensitive ?? 0) * 0.35 +
    (factorExposure.high_beta_growth ?? 0) * 0.25;
  const drawdownRisk = ddScore > 0.60 ? "high" : ddScore > 0.40 ? "elevated" : ddScore > 0.20 ? "moderate" : "low";

  // Outperforms/underperforms derived from dominant factors
  const outperformsIn: string[] = [];
  const underperformsIn: string[] = [];
  const seenUp = new Set<string>(); const seenDown = new Set<string>();
  for (const factor of dominantFactors) {
    const env = FACTOR_ENVIRONMENTS[factor];
    if (!env) continue;
    env.up.slice(0, 2).forEach(e => { if (!seenUp.has(e)) { outperformsIn.push(e); seenUp.add(e); } });
    env.down.slice(0, 2).forEach(e => { if (!seenDown.has(e)) { underperformsIn.push(e); seenDown.add(e); } });
  }

  // Strategy integrity score — how well the factor exposure matches strategy intent
  const EXPECTED_HIGH_MAP: [string, string[]][] = [
    ["ai", ["ai_infrastructure", "high_beta_growth"]],
    ["semiconductor", ["ai_infrastructure"]],
    ["cloud", ["cloud_growth", "high_beta_growth"]],
    ["growth", ["high_beta_growth"]],
    ["momentum", ["high_beta_growth", "speculative_momentum"]],
    ["speculative", ["speculative_momentum", "high_beta_growth"]],
    ["energy", ["energy"]],
    ["defensive", ["defensive"]],
    ["income", ["defensive", "rates_sensitive"]],
    ["dividend", ["defensive", "rates_sensitive"]],
    ["fintech", ["fintech"]],
  ];
  const EXPECTED_LOW_MAP: [string, string[]][] = [
    ["defensive", ["high_beta_growth", "speculative_momentum", "crypto_adjacent"]],
    ["income", ["speculative_momentum", "crypto_adjacent"]],
    ["dividend", ["speculative_momentum", "crypto_adjacent"]],
    ["growth", ["defensive"]],
    ["ai", ["defensive", "energy"]],
  ];

  const expectedHigh = new Set<string>();
  const expectedLow = new Set<string>();
  for (const [kw, factors] of EXPECTED_HIGH_MAP) {
    if (combined.includes(kw)) factors.forEach(f => expectedHigh.add(f));
  }
  for (const [kw, factors] of EXPECTED_LOW_MAP) {
    if (combined.includes(kw)) factors.forEach(f => expectedLow.add(f));
  }

  let integrityScore = strategy ? 75 : 70;
  for (const f of expectedHigh) { if ((factorExposure[f] ?? 0) >= 0.45) integrityScore += 5; }
  for (const f of expectedLow)  { if ((factorExposure[f] ?? 0) >= 0.40) integrityScore -= 10; }
  integrityScore = Math.max(0, Math.min(100, integrityScore));

  const integrityLabel =
    integrityScore >= 90 ? "Highly Aligned" :
    integrityScore >= 75 ? "Well Aligned" :
    integrityScore >= 60 ? "Moderate Drift" :
    integrityScore >= 45 ? "Notable Drift" : "Strategy Misaligned";

  const topTwo = dominantFactors.slice(0, 2).join(" + ");
  const isIntentional = strategy?.risk_level === "aggressive" || strategy?.risk_level === "very_aggressive" || expectedHigh.has(dominantFactors[0] ?? "");
  const factorNote = `Portfolio driven by ${topTwo || "diversified factors"}.${crowdingRisks.length > 0 ? " " + crowdingRisks[0] + "." : ""} Factor exposure is ${isIntentional ? "intentional" : "potentially accidental"} for ${strategy?.name ?? "this strategy"}.`;

  return {
    factor_exposure: factorExposure,
    dominant_factors: dominantFactors,
    crowding_risks: crowdingRisks,
    behavior_profile: { volatility, macro_sensitivity: macroSensitivity, drawdown_risk: drawdownRisk },
    outperforms_in: outperformsIn.slice(0, 4),
    underperforms_in: underperformsIn.slice(0, 4),
    strategy_integrity_score: integrityScore,
    strategy_integrity_label: integrityLabel,
    factor_note: factorNote,
  };
}

// ─── Catalyst Intelligence ───────────────────────────────────────────────────

const FACTOR_CATALYST_TYPE: Record<string, string> = {
  ai_infrastructure: "secular_growth",
  cloud_growth: "secular_growth",
  consumer_tech: "secular_growth",
  fintech: "secular_growth",
  high_beta_growth: "earnings_momentum",
  speculative_momentum: "momentum_driven",
  liquidity_sensitive: "liquidity_driven",
  rates_sensitive: "macro_sensitive",
  energy: "cyclical_recovery",
  industrials_cycle: "cyclical_recovery",
  defensive: "macro_sensitive",
  crypto_adjacent: "momentum_driven",
};

const FACTOR_CATALYSTS: Record<string, { key: string[]; deps: string[]; invalid: string[] }> = {
  ai_infrastructure: {
    key: ["AI capex expansion", "positive earnings revisions", "data center demand growth"],
    deps: ["hyperscaler AI spend", "semiconductor cycle momentum"],
    invalid: ["AI spending slowdown", "inventory buildup", "revision deterioration"],
  },
  cloud_growth: {
    key: ["enterprise IT spending", "SaaS revenue acceleration", "margin expansion"],
    deps: ["cloud spend growth", "enterprise demand resilience"],
    invalid: ["spend scrutiny", "multiple compression", "churn acceleration"],
  },
  high_beta_growth: {
    key: ["liquidity easing", "growth earnings beats", "momentum persistence"],
    deps: ["risk-on environment", "positive earnings revisions"],
    invalid: ["rate spikes", "multiple compression", "momentum reversal"],
  },
  speculative_momentum: {
    key: ["retail participation", "sentiment expansion", "low-vol persistence"],
    deps: ["risk appetite", "liquidity conditions"],
    invalid: ["VIX spike", "deleveraging event", "sentiment reversal"],
  },
  liquidity_sensitive: {
    key: ["Fed easing signals", "credit expansion", "risk appetite improvement"],
    deps: ["favorable liquidity", "credit market stability"],
    invalid: ["credit tightening", "liquidity withdrawal", "rate surprises"],
  },
  rates_sensitive: {
    key: ["Fed rate cuts", "yield curve steepening", "inflation moderation"],
    deps: ["rate trajectory", "inflation trend"],
    invalid: ["rate spikes", "hawkish Fed pivot", "inflation surprises"],
  },
  energy: {
    key: ["oil price persistence", "supply discipline", "demand resilience"],
    deps: ["commodity price trajectory", "OPEC discipline"],
    invalid: ["demand destruction", "supply glut", "green transition acceleration"],
  },
  defensive: {
    key: ["volatility persistence", "flight-to-quality demand", "dividend stability"],
    deps: ["risk-off environment", "earnings consistency"],
    invalid: ["risk appetite return", "rising rates", "bull market acceleration"],
  },
  fintech: {
    key: ["consumer spending growth", "digital payments volume", "margin expansion"],
    deps: ["consumer health", "credit conditions"],
    invalid: ["recession fears", "credit tightening", "regulatory headwinds"],
  },
  industrials_cycle: {
    key: ["infrastructure spend", "manufacturing expansion", "capex cycle"],
    deps: ["economic growth", "government spending"],
    invalid: ["recession", "inventory destocking", "capex freeze"],
  },
  consumer_tech: {
    key: ["ad market expansion", "consumer spending resilience", "engagement growth"],
    deps: ["consumer confidence", "digital advertising demand"],
    invalid: ["ad market contraction", "consumer slowdown", "platform regulation"],
  },
  crypto_adjacent: {
    key: ["crypto bull market persistence", "institutional adoption", "regulatory clarity"],
    deps: ["crypto sentiment", "risk appetite"],
    invalid: ["regulatory crackdown", "broad deleveraging", "crypto market collapse"],
  },
};

type CatalystProfile = {
  catalyst_type: string;
  key_catalysts: string[];
  dependencies: string[];
  invalidation_signals: string[];
  dominant_factor: string;
};

function buildCatalystIntelligence(
  holdings: { ticker: string; company_name?: string | null; weight_pct: number | null | undefined }[]
): Record<string, CatalystProfile> {
  const result: Record<string, CatalystProfile> = {};

  for (const h of holdings) {
    const ticker = h.ticker.toUpperCase();
    let tf: FactorScores = TICKER_FACTORS[ticker] ?? {};

    if (Object.keys(tf).length === 0) {
      const cn = (h.company_name ?? "").toLowerCase();
      if (/semiconductor|chip|foundry|wafer/.test(cn))         tf = { ai_infrastructure: 0.60 };
      else if (/cloud|saas|enterprise software/.test(cn))      tf = { cloud_growth: 0.60 };
      else if (/\bai\b|artificial intelligence/.test(cn))       tf = { ai_infrastructure: 0.65 };
      else if (/oil|gas|energy|petroleum/.test(cn))            tf = { energy: 0.80 };
      else if (/bank|financial|insurance/.test(cn))            tf = { rates_sensitive: 0.65 };
      else if (/pharma|biotech|drug|therapeut/.test(cn))       tf = { defensive: 0.55 };
      else if (/consumer|retail|restaurant/.test(cn))          tf = { defensive: 0.65 };
      else if (/crypto|blockchain|bitcoin/.test(cn))           tf = { crypto_adjacent: 0.85 };
      else tf = { high_beta_growth: 0.35 };
    }

    const dominantFactor = Object.entries(tf).sort((a, b) => b[1] - a[1]).map(([k]) => k)[0] ?? "high_beta_growth";
    const cp = FACTOR_CATALYSTS[dominantFactor];
    if (!cp) continue;

    result[ticker] = {
      catalyst_type: FACTOR_CATALYST_TYPE[dominantFactor] ?? "earnings_momentum",
      key_catalysts: cp.key.slice(0, 3),
      dependencies: cp.deps.slice(0, 2),
      invalidation_signals: cp.invalid.slice(0, 2),
      dominant_factor: dominantFactor,
    };
  }

  return result;
}

// ─── Portfolio Evolution Intelligence ────────────────────────────────────────

type EvolutionSnap = {
  recorded_at: string;
  strategy_integrity_score: number | null;
  portfolio_hhi: number | null;
  factor_exposure: unknown;
  behavior_profile: unknown;
  dominant_factors: unknown;
};

function buildEvolutionNote(
  drifts: { factor: string; delta: number }[],
  hhiChange: number,
  volDelta: number,
  integrityDelta: number,
  window: string
): string {
  const parts: string[] = [];
  if (drifts.length > 0) {
    const top = drifts[0];
    parts.push(`${top.factor.replace(/_/g, " ")} exposure ${top.delta > 0 ? "increased" : "decreased"} ${Math.abs(Math.round(top.delta * 100))}pp over ${window}`);
  }
  if (Math.abs(hhiChange) >= 200) {
    parts.push(`concentration ${hhiChange > 0 ? "increased" : "decreased"} (HHI ${hhiChange > 0 ? "+" : ""}${hhiChange})`);
  }
  if (Math.abs(volDelta) >= 1) {
    parts.push(`volatility profile ${volDelta > 0 ? "elevated" : "reduced"}`);
  }
  if (Math.abs(integrityDelta) >= 8) {
    parts.push(`strategy integrity ${integrityDelta > 0 ? "improved" : "declined"} ${Math.abs(integrityDelta)}pts`);
  }
  return parts.length === 0
    ? `No significant evolution detected over ${window}.`
    : parts.join("; ") + ".";
}

function computeEvolutionDrift(
  snaps: EvolutionSnap[],
  current: ReturnType<typeof buildFactorIntelligence>,
  currentHhi: number
) {
  const now = Date.now();
  // Prefer a baseline ~20+ days old; fall back to oldest available
  const baselineSnap = snaps.find(s =>
    now - new Date(s.recorded_at).getTime() >= 20 * 24 * 60 * 60 * 1000
  ) ?? snaps[snaps.length - 1];

  const daysSince = Math.max(0, Math.round((now - new Date(baselineSnap.recorded_at).getTime()) / (24 * 60 * 60 * 1000)));
  const comparisonWindow = daysSince <= 3 ? "prior run" : `${daysSince}d`;

  // Factor drift
  const prevFactors = ((baselineSnap.factor_exposure ?? {}) as Record<string, number>);
  const currFactors = current.factor_exposure;
  const drifts: { factor: string; delta: number }[] = [];
  for (const f of new Set([...Object.keys(prevFactors), ...Object.keys(currFactors)])) {
    const delta = Math.round(((currFactors[f] ?? 0) - (prevFactors[f] ?? 0)) * 100) / 100;
    if (Math.abs(delta) >= 0.07) drifts.push({ factor: f, delta });
  }
  drifts.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  // HHI / concentration change
  const hhiChange = Math.round(currentHhi - (baselineSnap.portfolio_hhi ?? currentHhi));

  // Volatility direction
  const VOL_RANK: Record<string, number> = { low: 0, moderate: 1, high: 2, very_high: 3 };
  const prevVolStr = ((baselineSnap.behavior_profile as Record<string, string> | null)?.volatility) ?? "moderate";
  const volDelta = (VOL_RANK[current.behavior_profile.volatility] ?? 1) - (VOL_RANK[prevVolStr] ?? 1);

  // Strategy integrity change
  const integrityDelta = Math.round(current.strategy_integrity_score - (baselineSnap.strategy_integrity_score ?? 75));

  // Dominant factor changes
  const prevDom = ((baselineSnap.dominant_factors ?? []) as string[]);
  const newDom = current.dominant_factors.filter(f => !prevDom.includes(f));
  const droppedDom = prevDom.filter(f => !current.dominant_factors.includes(f));

  return {
    comparison_window: comparisonWindow,
    factor_drift: drifts.slice(0, 4),
    hhi_change: hhiChange,
    volatility_direction: (volDelta > 0 ? "elevated" : volDelta < 0 ? "reduced" : "stable") as string,
    strategy_integrity_change: integrityDelta,
    new_dominant_factors: newDom,
    dropped_dominant_factors: droppedDom,
    note: buildEvolutionNote(drifts, hhiChange, volDelta, integrityDelta, comparisonWindow),
  };
}

// ─────────────────────────────────────────────────────────────────────────────

function buildPortfolioConstruction(
  holdings: { ticker: string; weight_pct: number | null | undefined }[],
  strategy: { name?: string | null; description?: string | null; style?: string | null; risk_level?: string | null } | null,
  strategyVersion: { max_position_pct?: number | null; prompt_text?: string | null } | null
) {
  const name = (strategy?.name ?? "").toLowerCase();
  const style = (strategy?.style ?? "").toLowerCase();
  const riskLevel = (strategy?.risk_level ?? "").toLowerCase();
  const promptText = (strategyVersion?.prompt_text ?? "").toLowerCase();
  const combined = `${name} ${style} ${promptText}`;

  let concentrationTolerance: "low" | "moderate" | "high" | "very_high" = "moderate";
  if (riskLevel === "conservative") concentrationTolerance = "low";
  else if (riskLevel === "moderate") concentrationTolerance = "moderate";
  else if (riskLevel === "aggressive") concentrationTolerance = "high";
  else if (riskLevel === "very_aggressive") concentrationTolerance = "very_high";

  const concentratedKeywords = ["concentrated", "thematic", "focused", "conviction", "high-conviction", "sector", "breakout", "momentum", "speculative"];
  const diversifiedKeywords = ["diversified", "balanced", "broad", "blend", "income", "dividend", "defensive"];
  const isConcentratedStyle = concentratedKeywords.some(kw => combined.includes(kw));
  const isDiversifiedStyle = diversifiedKeywords.some(kw => combined.includes(kw));

  if (isConcentratedStyle && concentrationTolerance === "moderate") concentrationTolerance = "high";
  if (isDiversifiedStyle && concentrationTolerance === "high") concentrationTolerance = "moderate";

  const intentionalConcentration = (riskLevel === "aggressive" || riskLevel === "very_aggressive") && isConcentratedStyle;

  const inferredMax: Record<string, number> = { low: 10, moderate: 15, high: 25, very_high: 40 };
  const maxSinglePositionPct: number = strategyVersion?.max_position_pct != null
    ? strategyVersion.max_position_pct
    : inferredMax[concentrationTolerance];

  const safeHoldings = holdings.map(h => ({ ticker: h.ticker, weight_pct: h.weight_pct ?? 0 }));
  const hhi = safeHoldings.reduce((sum, h) => sum + (h.weight_pct / 100) ** 2, 0) * 10000;
  const sorted = [...safeHoldings].sort((a, b) => b.weight_pct - a.weight_pct);
  const top3Weight = sorted.slice(0, 3).reduce((s, h) => s + h.weight_pct, 0);

  const hardLimit = maxSinglePositionPct + 5;
  const overweightFlags = sorted
    .filter(h => h.weight_pct > hardLimit)
    .map(h => `${h.ticker} at ${h.weight_pct.toFixed(1)}% (strategy limit: ${maxSinglePositionPct}%)`);

  let constructionNote: string;
  if (safeHoldings.length === 0) {
    constructionNote = "No holdings — portfolio is all cash.";
  } else if (intentionalConcentration) {
    constructionNote = `Concentrated strategy by design — high single-name weights are intentional. Only flag positions exceeding the hard limit of ${hardLimit.toFixed(0)}% (${maxSinglePositionPct}% limit + 5% buffer).`;
  } else if (concentrationTolerance === "low" || concentrationTolerance === "moderate") {
    constructionNote = `Diversification-oriented strategy — flag positions above ${maxSinglePositionPct}% and consider trimming top-heavy positions.`;
  } else {
    constructionNote = `Growth strategy with ${maxSinglePositionPct}% position limit. Top-3 holdings at ${top3Weight.toFixed(1)}% combined.`;
  }

  return {
    concentration_tolerance: concentrationTolerance,
    intentional_concentration: intentionalConcentration,
    max_single_position_pct: maxSinglePositionPct,
    portfolio_hhi: Math.round(hhi),
    top3_weight_pct: Math.round(top3Weight * 10) / 10,
    position_count: safeHoldings.length,
    overweight_flags: overweightFlags,
    construction_note: constructionNote,
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
  ] = await Promise.all([
    supabase.from("holdings").select("*").eq("portfolio_id", portfolioId).order("ticker", { ascending: true }),
    supabase.from("portfolio_transactions").select("ticker, transaction_type, quantity, price_per_share, traded_at, notes").eq("portfolio_id", portfolioId).order("traded_at", { ascending: false }).limit(20),
    supabase.from("cash_ledger").select("*").eq("portfolio_id", portfolioId).order("effective_at", { ascending: false }).limit(10),
    supabase.from("portfolio_notes").select("*").eq("portfolio_id", portfolioId).order("created_at", { ascending: false }).limit(5),
    supabase.from("portfolio_snapshots").select("snapshot_date, total_value").eq("portfolio_id", portfolioId).order("snapshot_date", { ascending: false }).limit(5),
    supabase.from("portfolio_strategy_assignments").select(`
      *,
      strategies (id, name, description, style, risk_level),
      strategy_versions (id, version_number, prompt_text, max_position_pct, min_position_pct, turnover_preference, holding_period_bias, cash_min_pct, cash_max_pct)
    `).eq("portfolio_id", portfolioId).eq("is_active", true).is("ended_at", null).order("assigned_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  if (holdingsError) throw new Error(holdingsError.message);
  if (transactionsError) throw new Error(transactionsError.message);
  if (cashLedgerError) throw new Error(cashLedgerError.message);
  if (notesError) throw new Error(notesError.message);
  if (snapshotsError) throw new Error(snapshotsError.message);
  if (activeAssignmentError) throw new Error(activeAssignmentError.message);

  // Position thesis memory — keyed by ticker, non-fatal (table may not exist yet)
  let positionThesisMemory: Record<string, unknown> = {};
  try {
    const { data: thesisList } = await supabase
      .from("position_thesis")
      .select("ticker, original_thesis, portfolio_role, holding_profile, entry_conviction, thesis_status, thesis_notes")
      .eq("portfolio_id", portfolioId);
    if (thesisList && thesisList.length > 0) {
      positionThesisMemory = Object.fromEntries(
        thesisList.map((t: any) => [t.ticker.toUpperCase(), {
          original_thesis: t.original_thesis,
          portfolio_role: t.portfolio_role,
          holding_profile: t.holding_profile,
          entry_conviction: t.entry_conviction,
          thesis_status: t.thesis_status,
          notes: t.thesis_notes,
        }])
      );
    }
  } catch {
    // non-fatal — thesis memory degrades gracefully
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

  // Always use the latest strategy version, not the one frozen in the assignment FK
  let latestStrategyVersion = (activeAssignment as any)?.strategy_versions ?? null;
  const assignedStrategyId = (activeAssignment as any)?.strategy_id ?? null;
  if (assignedStrategyId) {
    const { data: latestVersion } = await supabase
      .from("strategy_versions")
      .select("id, version_number, prompt_text, max_position_pct, min_position_pct, turnover_preference, holding_period_bias, cash_min_pct, cash_max_pct")
      .eq("strategy_id", assignedStrategyId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestVersion) latestStrategyVersion = latestVersion;
  }

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

  // Fetch Reddit sentiment per ticker (keyword-based, no Gemini, 8s timeout)
  let redditSentiment: Record<string, CompactRedditPulse> = {};
  if (tickers.length > 0) {
    try {
      const holdingsForReddit = (holdings ?? []).map((h: any) => ({
        ticker: h.ticker as string,
        company_name: h.company_name as string | null,
      }));
      const timeout = new Promise<Record<string, CompactRedditPulse>>((resolve) =>
        setTimeout(() => resolve({}), 8000)
      );
      redditSentiment = await Promise.race([
        fetchRedditSentimentForTickers(holdingsForReddit),
        timeout,
      ]);
    } catch {
      // Non-fatal — Grok still runs without Reddit sentiment
    }
  }


  // Prune news to headline + source + datetime only — summaries/images/URLs waste tokens
  const prunedMarketContext: Record<string, unknown> = {};
  for (const [ticker, data] of Object.entries(marketContext)) {
    const d = data as { news: { headline: string; source: string; datetime: number }[]; recommendation: unknown; priceTarget: unknown };
    prunedMarketContext[ticker] = {
      news: d.news.map(({ headline, source, datetime }) => ({ headline, source, datetime })),
      recommendation: d.recommendation,
      priceTarget: d.priceTarget,
    };
  }

  const portfolioConstruction = buildPortfolioConstruction(
    simplifiedHoldings,
    (activeAssignment as any)?.strategies ?? null,
    latestStrategyVersion,
  );

  const factorIntelligence = buildFactorIntelligence(
    simplifiedHoldings,
    (activeAssignment as any)?.strategies ?? null,
    latestStrategyVersion,
  );

  const catalystIntelligence = buildCatalystIntelligence(simplifiedHoldings);

  // Portfolio evolution — compare current factor state against historical snapshots
  let portfolioEvolution: ReturnType<typeof computeEvolutionDrift> | null = null;
  try {
    const { data: historicalSnaps } = await supabase
      .from("portfolio_factor_snapshots")
      .select("recorded_at, strategy_integrity_score, portfolio_hhi, factor_exposure, behavior_profile, dominant_factors")
      .eq("portfolio_id", portfolioId)
      .order("recorded_at", { ascending: false })
      .limit(5);
    if (historicalSnaps && historicalSnaps.length >= 1) {
      portfolioEvolution = computeEvolutionDrift(
        historicalSnaps as EvolutionSnap[],
        factorIntelligence,
        portfolioConstruction.portfolio_hhi,
      );
    }
  } catch {
    // non-fatal — table may not exist yet or network failure
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
          strategy_version: latestStrategyVersion,
        }
      : null,
    notes: notes ?? [],
    recent_transactions: transactions ?? [],
    recent_cash_ledger: cashLedger ?? [],
    recent_snapshots: snapshots ?? [],
    market_context: prunedMarketContext,
    reddit_sentiment: redditSentiment,
    portfolio_construction: portfolioConstruction,
    portfolio_factor_intelligence: factorIntelligence,
    portfolio_evolution: portfolioEvolution,
    position_thesis_memory: positionThesisMemory,
    position_catalyst_context: catalystIntelligence,
  };
}

// --- Grok: Buy/Hold/Sell Recommendations with live search ---
async function callGrokForRecommendations(context: unknown, contextNote?: string): Promise<AiRunResponse> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error("Missing XAI_API_KEY in environment variables.");

  const client = new OpenAI({
    apiKey,
    baseURL: "https://api.x.ai/v1",
    timeout: 300000,
  });

  const ctx = context as any;
  const availableCash = ctx?.portfolio?.cash_balance ?? ctx?.current_valuation?.cash_balance ?? 0;
  const totalPortfolioValue: number = ctx?.current_valuation?.total_portfolio_value ?? availableCash;
  const strategyVersion = ctx?.strategy?.strategy_version ?? null;
  const maxPositionPct: number | null = strategyVersion?.max_position_pct ?? null;
  const minPositionPct: number | null = strategyVersion?.min_position_pct ?? null;
  const cashMinPct: number | null = strategyVersion?.cash_min_pct ?? null;
  const cashMaxPct: number | null = strategyVersion?.cash_max_pct ?? null;
  const currentCashPct = totalPortfolioValue > 0 ? (availableCash / totalPortfolioValue) * 100 : 0;
  const strategyRiskLevel: string = (
    ctx?.strategy?.strategy?.risk_level ??
    strategyVersion?.risk_level ??
    "moderate"
  ).toString().toLowerCase();

  const hurdleRateBlock = (() => {
    if (strategyRiskLevel.includes("conservative")) {
      return "HURDLE RATE: This is a CONSERVATIVE strategy. Minimum expected return threshold = 8-10% annualized. Only recommend BUY/ADD when probability-weighted expected return clearly clears 8% annualized. Below that threshold, HOLD or WAIT for better entry.";
    } else if (strategyRiskLevel.includes("aggressive") && strategyRiskLevel.includes("very")) {
      return "HURDLE RATE: This is a VERY AGGRESSIVE strategy. Minimum expected return threshold = 20%+ annualized. Seek high-conviction asymmetric opportunities. Good opportunities in aggressive portfolios should target 25-40%+ upside in base case.";
    } else if (strategyRiskLevel.includes("aggressive")) {
      return "HURDLE RATE: This is an AGGRESSIVE strategy. Minimum expected return threshold = 15-20% annualized. Seek securities where base case delivers 18-25%+ upside. Do NOT recommend BUY/ADD for 8-12% expected returns — that's a conservative profile opportunity.";
    } else {
      return "HURDLE RATE: This is a MODERATE strategy. Minimum expected return threshold = 10-15% annualized. Recommend BUY/ADD when probability-weighted expected return clears 12% annualized. Avoid low-single-digit expected returns — they are not worth the risk.";
    }
  })();

  const systemPrompt = [
    // ── Role: Capital Allocator
    "You are an institutional portfolio manager at a top-tier investment firm. Your mandate is intelligent capital allocation — deploying capital where expected asymmetric return is highest, and holding cash only as an explicit, justified choice. You are NOT an analyst trying to avoid being wrong. You are a PM responsible for where every dollar goes.",

    // ── Capital Allocation Philosophy (MOST IMPORTANT)
    "CAPITAL ALLOCATION PHILOSOPHY: Cash is not a neutral position — it is an ACTIVE allocation decision with an opportunity cost. Every dollar sitting in cash while a strong asymmetric opportunity exists is a portfolio management choice, not a safe default. You must evaluate BOTH the risk of entering a position AND the risk of NOT entering it. These two risks are symmetric and must be weighed together. 'Doing nothing' has a cost. 'Staying cautious' has a cost. Missing a strong asymmetric opportunity IS portfolio risk.",

    // ── Marginal Dollar Question
    "MARGINAL DOLLAR QUESTION: For every recommendation, ask: 'Where is the best marginal dollar deployed right now?' This is the core question of portfolio management. New opportunities must compete against existing holdings — evaluate relative conviction, relative asymmetry, relative catalyst quality, and relative portfolio fit. A new idea does not need to be perfect — it needs to be better than the current use of that capital. If existing holdings are fully sized and appropriately positioned, HOLD is correct. If cash is sitting idle and strong opportunities exist, deployment is correct.",

    // ── Two-Engine Architecture
    "TWO-ENGINE ARCHITECTURE: Your analysis ALWAYS runs two parallel evaluations. ENGINE 1 — PORTFOLIO MANAGEMENT: Evaluate every existing holding — thesis continuity, sizing appropriateness, macro overlay, factor drift, catalyst health. ENGINE 2 — OPPORTUNITY DISCOVERY: Independently scan for external candidates that deserve capital. Ask: 'What outside this portfolio deserves consideration right now?' These engines run simultaneously and compete for capital in the final output. Existing holdings carry NO automatic incumbency advantage — they must justify their capital allocation against the best available alternatives. A real PM constantly asks: 'If I had fresh capital today, would I still allocate here — or is there something better?'",

    // ── Exploration Pressure
    "EXPLORATION PRESSURE: Recommendation breadth scales with portfolio conditions, NOT with holding count. Exploration pressure is HIGH when: (a) cash is idle (>10% of portfolio); (b) portfolio is concentrated (few holdings, high HHI); (c) strategy is aggressive, growth, or momentum-oriented; (d) environment is constructive or mixed; (e) conviction gaps exist. A 2-stock portfolio with 35% cash and an aggressive growth strategy should generate MORE external opportunity exploration than a fully-deployed 15-stock balanced portfolio. Small or concentrated portfolios increase discovery obligation — fewer holdings means more undiscovered opportunity. NEVER let holding count constrain idea generation.",

    // ── Eight-layer evaluation
    "EVALUATION PROCESS — apply eight independent layers before any recommendation:",
    "(1) SECURITY ANALYSIS: Is this security fundamentally attractive? Earnings quality, growth, valuation, momentum, analyst revisions, catalysts, balance sheet. Evaluate independent of macro.",
    "(2) STRATEGY FIT: Does it align with the user's selected strategy style, risk tolerance, and portfolio construction rules?",
    "(3) MACRO OVERLAY: How do current conditions affect HOW AGGRESSIVELY to express this conviction? The macro_overlay is a sizing and aggressiveness modifier — it does NOT veto attractive securities and does NOT justify HOLD for fundamentally sound positions. In constructive environments, macro supports deployment. In mixed environments, macro reduces sizing and increases selectivity — it does not eliminate participation. Only in genuinely hostile macro conditions (severe credit stress, systemic risk, deteriorating liquidity) should macro suppress participation broadly.",
    "(4) PORTFOLIO CONSTRUCTION INTELLIGENCE: Evaluate holdings as a portfolio system. The portfolio_construction context tells you concentration tolerance, whether high concentration is intentional, and which positions exceed their limit. NEVER penalize intentional concentration in a concentrated strategy. Only flag overweight positions in overweight_flags (>5% over limit). Distinguish structural positions (core long-term) from tactical positions (short-term catalyst) — never apply trim logic uniformly. Never exit a strategically-defined core position due to macro alone.",
    "(5) FACTOR INTELLIGENCE: The portfolio_factor_intelligence context provides factor exposures, dominant factors, crowding risks, and behavior profile. Reason at the factor level. A portfolio of NVDA, AMD, TSM, SMCI may look diversified by company but is a single AI-infrastructure factor bet. Only flag crowding_risks listed in context. NEVER flag strategy-aligned factor concentration. Use outperforms_in and underperforms_in for expectation-setting. strategy_integrity_score below 65 warrants a factor drift note. Always explain what makes this portfolio win and what makes it lose.",
    "(6) PORTFOLIO EVOLUTION INTELLIGENCE: The portfolio_evolution context (if present) shows change versus a historical baseline. factor_drift lists exposures that moved >7pp — use for trajectory narrative, not just snapshot. Distinguish INTENTIONAL drift (AI strategy accumulating more AI exposure in a bull run — aligned) from ACCIDENTAL drift (balanced strategy silently becoming speculative momentum — worth flagging). If null, first run — no comparison available.",
    "(7) POSITION THESIS MEMORY: The position_thesis_memory context contains the original thesis, portfolio role, entry conviction, and thesis status for executed positions. Use this as institutional memory. Ask: does this position still fulfill the reason we bought it? Thesis status: intact = proceed on security merit; strengthening = lean toward adding; weakening = reduce or watch; broken = exit regardless of price action. CRITICAL: macro alone does not change thesis status — it affects sizing only. Short-term volatility does not break a long-term structural thesis. Never trim a core holding solely because it appreciated — trim when the original thesis deteriorated, crowding risk materialized, or better capital allocation exists. Reference thesis continuity explicitly in rationale.",
    "(8) CATALYST INTELLIGENCE: The position_catalyst_context provides catalyst type, key catalysts, thesis dependencies, and invalidation signals. Assess catalyst health for each position using Finnhub data, news, and Reddit sentiment. Lead with catalyst status: 'The [X] thesis depends on [dependency] and is currently [intact/strengthening/weakening]. Key risk: [signal].' Keep to 1-2 sentences. Catalyst awareness must be strategy-sensitive. Macro influences catalyst urgency and sizing — not automatic invalidation.",

    // ── HOLD Discipline
    "HOLD DISCIPLINE: HOLD is a valid and important action — but it must earn its place. HOLD is correct when: the thesis is fully intact and position is appropriately sized, there is no better marginal use of capital, or you are awaiting a specific catalyst or entry point. HOLD is WRONG when it results from: generalized macro nervousness, fear of being wrong, vague caution, or default inactivity. 'Macro is mixed' is NOT a valid HOLD reason. A fundamentally attractive security with intact thesis should receive a sized recommendation — potentially smaller due to macro overlay, but not HOLD. When in doubt: if you'd recommend buying this security for a new portfolio at current prices, HOLD is the wrong answer.",

    // ── Congressional Activity Signal
    "CONGRESSIONAL SIGNALS: If congressional_signals is present in context, use it as a corroborating behavioral indicator. Net purchasing by multiple members is a mild bullish signal — politicians have access to non-public legislative information. Net selling is a mild risk flag. Weight these signals lightly: STOCK Act disclosures lag by up to 45 days, so congressional activity is a lagging indicator. Never make a recommendation solely on congressional activity. Use it as a tie-breaker or supporting detail in thesis — e.g., 'Congressional net buying ($50K–$250K range) corroborates the bull thesis here.'",

    // ── Data Discipline + Discovery Search
    "DATA AND DISCOVERY SEARCHES: Current prices, Finnhub data, and Reddit sentiment are pre-loaded for existing holdings. DO NOT use training-data memory for stock prices. Use web_search PROACTIVELY — the majority of your searches should be DISCOVERY searches, not price lookups. Discovery search protocol: (1) Run 2-4 searches to find external candidates relevant to this portfolio's strategy theme and current environment — e.g., '[strategy theme] best stocks 2025', '[sector] momentum leaders today', 'top [style] stocks outperforming now', 'analyst upgrades [theme] sector'. (2) Then run 1-2 targeted searches to get current prices for specific candidates you identified. (3) Use x_search for recent sentiment on high-conviction new names. Total budget: 5-7 searches per run, with discovery searches taking clear priority over price lookups for existing holdings.",

    // ── Anti-Anchoring Mandate
    "PRICE ANCHORING ALERT: The most common failure mode in price target generation is anchoring — setting bear/base/bull targets that cluster tightly around the current price, producing near-zero expected returns and defaulting to HOLD for every position. THIS IS WRONG. Your targets must reflect where fundamentals and catalysts point over the stated horizon, NOT where the stock trades today. Before submitting any recommendation, self-check: if |base_price - current_price| < 5% of current_price, you are anchoring. Your base case must have a genuine directional view. A flat base case is an analyst hiding behind consensus. Anchoring means you have no view — if you have no view, say so in the thesis, but still assign a real probability-weighted outcome.",

    // ── Scenario Probability Mandate
    "SCENARIO PROBABILITIES: Every recommendation must include probability_bear, probability_base, probability_bull. These three values must sum to exactly 100. Assign based on your genuine conviction about the distribution of outcomes — not a default 25/50/25 split. Examples of realistic distributions: high conviction bull thesis = 15/35/50; high uncertainty = 35/30/35; deteriorating thesis = 40/40/20. The probabilities signal your directional conviction. A 25/50/25 default is a red flag that you have no view.",

    // ── Hurdle Rate Awareness
    hurdleRateBlock,

    // ── Hard constraints
    `CASH DEPLOYMENT MANDATE: Available cash = $${Math.round(availableCash).toLocaleString()} (${currentCashPct.toFixed(1)}% of portfolio).${cashMaxPct != null ? ` Strategy cash_max_pct = ${cashMaxPct}%. If cash exceeds this limit, BUY/ADD recommendations are MANDATORY — not optional. Deploy capital to bring cash within the target range.` : " Deploy idle cash where strong asymmetric opportunities exist."}`,
    "TRIM/SELL PROCEEDS RULE: If you recommend a trim or sell, you MUST also recommend where the proceeds are deployed (a BUY/ADD/scale_in) UNLESS the portfolio's cash position is already AT or ABOVE cash_max_pct. Never generate a trim/sell without a corresponding redeployment — selling without buying creates uninvested drag, which violates the capital allocation mandate.",
    "COMBINED BUY SIZING: The sum of all buy/add sizing_dollars must not exceed available cash.",
    "For trim/sell, always specify share_quantity not exceeding shares owned.",
    "Return only valid JSON with no markdown fences.",
  ].join(" ");

  const cashConstraintLines: string[] = [];
  if (cashMaxPct != null) {
    const overageAmt = totalPortfolioValue > 0 ? Math.max(0, availableCash - (totalPortfolioValue * cashMaxPct / 100)) : 0;
    cashConstraintLines.push(`- cash_max_pct: ${cashMaxPct}% — current cash is ${currentCashPct.toFixed(1)}% ($${Math.round(availableCash).toLocaleString()}) of $${Math.round(totalPortfolioValue).toLocaleString()} portfolio.`);
    if (currentCashPct > cashMaxPct + 0.5 && overageAmt > 10) {
      cashConstraintLines.push(`  !! CASH OVERAGE: Cash (${currentCashPct.toFixed(1)}%) EXCEEDS the strategy's ${cashMaxPct}% maximum by $${Math.round(overageAmt).toLocaleString()}. You MUST include BUY/ADD recommendations totaling at least $${Math.round(overageAmt).toLocaleString()} to bring cash within the strategy target. Leaving cash idle above this limit is a strategy violation — not a conservative choice.`);
    }
  }
  if (cashMinPct != null) {
    cashConstraintLines.push(`- cash_min_pct: ${cashMinPct}% — do NOT deploy cash below this floor ($${Math.round(totalPortfolioValue * cashMinPct / 100).toLocaleString()} minimum cash balance).`);
  }

  const strategyConstraintsBlock = (maxPositionPct != null || cashConstraintLines.length > 0)
    ? `\nSTRATEGY CONSTRAINTS (from latest strategy version — must be respected):
${maxPositionPct != null ? `- max_position_pct: ${maxPositionPct}% — do NOT recommend trimming or selling a holding solely because it is near this limit; only flag if it is materially above (>5% over the limit, i.e. above ${(maxPositionPct + 5).toFixed(0)}%)` : ""}
${minPositionPct != null ? `- min_position_pct: ${minPositionPct}%` : ""}
${cashConstraintLines.join("\n")}\n`
    : "";

  const userPrompt = `Analyze this portfolio and return a strict JSON object.
${strategyConstraintsBlock}
HARD CONSTRAINTS:

1. CASH LIMIT: $${availableCash.toLocaleString()} available. Combined sizing_dollars of ALL buy/add recommendations must not exceed this. Size multiple buys so they fit together.

2. PROBABILISTIC TARGETS: Use current_price from holdings context (or search for it on new names). Provide three scenarios:
   - base_price = most likely outcome (BUY/ADD: above current price; SELL/TRIM: below). Also sets target_price_1. MUST be directional — not near current price.
   - bear_price = downside scenario if key risks materialize.
   - bull_price = upside scenario if catalysts outperform.
   - base_return_pct / bear_return_pct / bull_return_pct = signed % return from current price to each scenario (e.g. -12.5, +18.0, +48.0).
   - probability_bear / probability_base / probability_bull = integer probabilities 0-100 summing to exactly 100. Reflect genuine conviction. Default 25/50/25 is unacceptable — assign based on asymmetry, catalyst quality, fundamental strength.
   - target_horizon = specific timeframe for the base case (e.g. "6-12 months", "1-2 earnings cycles", "2-3 years"). Write an actual range, not "short_term".
   - catalysts = array of 2-4 concise strings naming key drivers (e.g. "AI infrastructure demand", "earnings revisions", "margin expansion").
   - target_change_reason = null (no prior run data is provided — always set to null).

3. TRIM/SELL QUANTITY: share_quantity must not exceed shares owned. Full sell = total shares. sizing_dollars = share_quantity × current_price.

4. SIZING CONSISTENCY: share_quantity × price = sizing_dollars. All three must be internally consistent.

RECOMMENDATION STRUCTURE — for each recommendation, structure the fields as follows:
- thesis: "[SECURITY] Why the stock is fundamentally attractive or unattractive — earnings, valuation, momentum, catalysts. Include current price. [SIZING] State sizing guidance: full position / starter position / reduced size (with macro reason) / scale-in / trim strength / avoid adding."
- rationale: "[STRATEGY FIT] Alignment with the user's strategy style. [PORTFOLIO] Impact on diversification, concentration, or correlation."
- risks: "[MACRO IMPACT] How the macro overlay affects conviction or sizing for this specific position. [DOWNSIDE] Key security-specific risks."

Return this exact JSON shape:

{
  "summary": "3 sentences max. Sentence 1: portfolio's dominant factor bet and whether current conditions favor it. Sentence 2: most notable current risk or opportunity based on factor drift, macro shift, or thesis developments. Sentence 3: the single highest-priority action and why. Max 280 chars.",
  "recommendations": [
    {
      "action_type": "buy|add|trim|sell|hold|scale_in|rotate|rebalance|raise_cash",
      "ticker": "string",
      "company_name": "string|null",
      "thesis": "string",
      "rationale": "string|null",
      "risks": "string|null",
      "conviction": "Low|Moderate|High|Very High|null",
      "confidence_score": number|null,
      "priority_rank": number|null,
      "sizing_pct": number|null,
      "sizing_dollars": number|null,
      "share_quantity": number|null,
      "base_price": number|null,
      "bear_price": number|null,
      "bull_price": number|null,
      "base_return_pct": number|null,
      "bear_return_pct": number|null,
      "bull_return_pct": number|null,
      "probability_bear": number|null,
      "probability_base": number|null,
      "probability_bull": number|null,
      "catalysts": ["string"],
      "target_change_reason": "string|null",
      "target_price_2": number|null,
      "stop_price": number|null,
      "target_horizon": "string|null",
      "time_horizon": "short_term|medium_term|long_term|null"
    }
  ]
}

Execution rules:
- Cover EVERY existing holding. No exceptions.
- HOLD FRESH CAPITAL TEST: Before assigning HOLD, answer: "If I had fresh capital today, would I buy this at current prices?" If YES → use ADD. If NO with no exit signal → justify HOLD explicitly. HOLD is only valid when: (a) position is fully sized and thesis intact with no better alternative, OR (b) awaiting a specific upcoming catalyst for a better entry. Generic market caution is never a valid HOLD reason.
- PROBABILITY CHECK: probability_bear + probability_base + probability_bull must equal 100 for every recommendation. No exceptions. Never submit 25/50/25 as a default — assign conviction-weighted probabilities.
- CONSTRUCTION: only trim positions in portfolio_construction.overweight_flags. If intentional_concentration is true, never trim for diversification.
- TIME HORIZON: label time_horizon accurately. Never trim a structural position on a short-term miss.
- scale_in: strong thesis, better entry possible. rotate: exit one to fund another in same theme. Trim/sell/hold: only existing holdings.
- Apply sizing_modifier from macro overlay. Apply speculative_penalty to low-quality names only.
- Return JSON only, no markdown fences.

Portfolio context:
${JSON.stringify(context)}${contextNote ? `\n\n## Investor Note (one-time context for this run only)\n${contextNote}` : ""}`.trim();

  const response = await client.responses.create({
    model: "grok-4.20-0309-reasoning",
    input: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    tools: [
      { type: "web_search" },
      { type: "x_search" },
    ],
  } as any);

  // Log search activity for analysis — visible in Vercel function logs
  try {
    const outputItems: unknown[] = (response as any).output ?? [];
    const searches: { type: string; query: string }[] = [];
    for (const item of outputItems) {
      const it = item as any;
      if (it?.type === "web_search_call" && it?.query) {
        searches.push({ type: "web", query: it.query });
      } else if (it?.type === "x_search_call" && it?.query) {
        searches.push({ type: "x", query: it.query });
      } else if (it?.type === "tool_call") {
        const name = it?.name ?? "";
        const query = it?.parameters?.query ?? it?.input?.query ?? "";
        if (query) searches.push({ type: name, query });
      }
    }
    const usage = (response as any).usage ?? null;
    console.log("[GROK_SEARCH_LOG]", JSON.stringify({
      model: "grok-4.20-0309-reasoning",
      searches,
      search_count: searches.length,
      output_items: outputItems.length,
      usage,
    }));
  } catch {
    // non-fatal — logging should never break a run
  }

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
  const normalized = recommendationsRaw
    .map((item) => item && typeof item === "object" ? normalizeRecommendation(item as Record<string, unknown>) : null)
    .filter((item): item is AiRecommendation => Boolean(item));

  // Anchoring detection: flag individual recs where |base_price - current_price| < 5%
  const holdingsMap = new Map<string, number>();
  const holdings = ctx?.current_valuation?.holdings ?? [];
  for (const h of holdings) {
    if (h.ticker && h.current_price != null) {
      holdingsMap.set(String(h.ticker).toUpperCase(), Number(h.current_price));
    }
  }

  const recommendations = normalized.map((rec) => {
    if (rec.target_price_1 == null) return rec;
    const currentPrice = holdingsMap.get(rec.ticker ?? "");
    if (currentPrice == null || currentPrice === 0) return rec;
    const pctDiff = Math.abs(rec.target_price_1 - currentPrice) / currentPrice;
    return { ...rec, low_conviction_flag: pctDiff < 0.05 };
  });

  // Run-level anchoring flag: >60% of recs have base within 5% of current price
  const flaggedCount = recommendations.filter((r) => r.low_conviction_flag).length;
  const anchoringRate = recommendations.length > 0 ? flaggedCount / recommendations.length : 0;
  const runAnchoringFlag = anchoringRate > 0.6;

  const finalSummary = runAnchoringFlag
    ? `[Low Conviction Forecast Set: ${Math.round(anchoringRate * 100)}% of base targets within 5% of current price — model may be anchoring to consensus] ${summary}`
    : summary;

  return { summary: finalSummary, recommendations };
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
${JSON.stringify(context)}`;

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

const COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours

export async function runPortfolioAiRecommendation(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in to run AI recommendations.");

  const portfolioId = String(formData.get("portfolio_id") || "").trim();
  if (!portfolioId) throw new Error("Portfolio ID is required.");

  const isSecondaryRun = formData.get("is_secondary_run") === "true";
  const feedbackNote = String(formData.get("feedback_note") || "").trim().slice(0, 500);
  const contextNote = isSecondaryRun && feedbackNote
    ? `SECONDARY RUN — User feedback on prior analysis: "${feedbackNote}". Address the user's concerns directly while still following all portfolio management principles. Be more specific and decisive in recommendations than the prior run.`
    : String(formData.get("context_note") || "").trim().slice(0, 500);

  // Auto-archive stale proposals (>30 days) at run time, not on every tab view
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  supabase.from("recommendation_items").update({
    recommendation_status: "archived",
    user_decision: "archived",
    decision_notes: "Auto-archived: proposed > 30 days",
  }).eq("portfolio_id", portfolioId).eq("recommendation_status", "proposed").lt("created_at", thirtyDaysAgo);

  const context = await buildPortfolioAiContext(portfolioId, user.id);
  const activeAssignment = (context as any).strategy?.assignment ?? null;

  // Empty portfolio — no existing holdings, all cash. Override the context note to focus on
  // first-allocation construction rather than the default portfolio-management framing.
  const holdingCount: number = (context as any).current_valuation?.total_positions ?? 0;
  const firstPortfolioNote: string | null = holdingCount === 0
    ? `FIRST PORTFOLIO BUILD: This portfolio has zero existing positions — it is entirely cash. Your entire mandate is building an initial allocation from scratch. Do NOT generate HOLD, TRIM, SELL, or scale_in recommendations — the user has no holdings to hold or trim.

Output a starting portfolio of 4–8 BUY recommendations that together form a coherent first allocation. For each pick, justify: (a) why this security fits the assigned strategy style and risk level, (b) suggested initial sizing as a percentage of total capital (aim for 10–20% per position to leave room to scale into winners), and (c) how it contributes to diversification across sectors or factors.

Your summary field should describe the portfolio construction rationale — what kind of portfolio you are building, what factors it bets on, and why the current macro regime supports this allocation. Do NOT reference "dominant factor bet" or "factor drift" (no history exists). Frame it as: "Building a [style] portfolio of [N] positions targeting [theme/thesis]. Initial allocation concentrates on [key factor]. Key risk is [X]."

Run 3–4 discovery searches to identify the best current opportunities for this strategy. Do not default to obvious mega-cap names without checking whether there are higher-conviction opportunities available right now.`
    : null;

  // Sparse portfolio — 1–5 holdings with significant idle cash. The default prompt leaves
  // discovery obligation vague; inject hard numbers so Grok actually rounds out the portfolio.
  const totalValue: number = (context as any).current_valuation?.total_portfolio_value ?? 0;
  const cashBalance: number = (context as any).current_valuation?.cash_balance ?? 0;
  const cashPct: number = totalValue > 0 ? (cashBalance / totalValue) * 100 : 0;
  const strategyVersion = (context as any).strategy?.strategy_version ?? null;
  const maxPosPct: number = strategyVersion?.max_position_pct ?? 20;
  const minPosPct: number = strategyVersion?.min_position_pct ?? 5;
  // How many positions does the strategy call for?
  const impliedMinPositions = maxPosPct > 0 ? Math.floor(100 / maxPosPct) : 5;
  const impliedMaxPositions = minPosPct > 0 ? Math.floor(100 / minPosPct) : 20;
  const positionsNeeded = Math.max(0, impliedMinPositions - holdingCount);

  const sparsePortfolioNote: string | null =
    holdingCount >= 1 && holdingCount <= 5 && cashPct > 20 && positionsNeeded > 0
      ? `SPARSE PORTFOLIO — ACTIVE BUILD PHASE: This portfolio has only ${holdingCount} position${holdingCount !== 1 ? "s" : ""} but ${cashPct.toFixed(0)}% of capital is idle in cash ($${Math.round(cashBalance).toLocaleString()}). The assigned strategy implies a target range of ${impliedMinPositions}–${impliedMaxPositions} positions (max_position_pct=${maxPosPct}%, min_position_pct=${minPosPct}%). The portfolio needs at least ${positionsNeeded} more position${positionsNeeded !== 1 ? "s" : ""} to be properly deployed.

MANDATORY: You MUST recommend at least ${Math.min(positionsNeeded + 1, 4)} new BUY positions (in addition to covering existing holdings). These must be genuinely distinct names found through discovery searches, not vague placeholders. Run 3–4 discovery searches to identify the best current candidates for this strategy before finalizing new picks.

For each new position, state: (a) specific sizing in dollars and percentage of total portfolio, (b) how it diversifies the existing holdings (different sector, factor, or geographic exposure), and (c) why this specific security ranks above cash in the current environment. Distributing idle cash across ${positionsNeeded}+ new positions is not optional — it is the primary action this run.`
      : null;

  // Rate limit: 4 hours per portfolio, with bypass for meaningful changes
  const { data: lastCompletedRun } = await supabase
    .from("recommendation_runs")
    .select("id, created_at, strategy_id, strategy_version_id")
    .eq("portfolio_id", portfolioId)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastCompletedRun) {
    const elapsed = Date.now() - new Date(lastCompletedRun.created_at).getTime();
    if (elapsed < COOLDOWN_MS) {
      const currentStrategyId = activeAssignment?.strategy_id ?? null;
      const currentVersionId = activeAssignment?.strategy_version_id ?? null;
      const strategyChanged =
        lastCompletedRun.strategy_id !== currentStrategyId ||
        lastCompletedRun.strategy_version_id !== currentVersionId;

      const [{ count: newTx }, { count: newCash }] = await Promise.all([
        supabase.from("portfolio_transactions")
          .select("*", { count: "exact", head: true })
          .eq("portfolio_id", portfolioId)
          .gt("traded_at", lastCompletedRun.created_at),
        supabase.from("cash_ledger")
          .select("*", { count: "exact", head: true })
          .eq("portfolio_id", portfolioId)
          .gt("effective_at", lastCompletedRun.created_at),
      ]);

      const hasBypass = strategyChanged || (newTx ?? 0) > 0 || (newCash ?? 0) > 0;

      if (!hasBypass && !isSecondaryRun) {
        const nextRunAt = new Date(new Date(lastCompletedRun.created_at).getTime() + COOLDOWN_MS);
        const mins = Math.ceil((nextRunAt.getTime() - Date.now()) / 60000);
        const wait = mins >= 60 ? `${Math.ceil(mins / 60)}h` : `${mins}m`;
        throw new Error(
          `Rate limited — next full scan available in ${wait}. You can run again immediately if you change your strategy, make a trade, or add cash.`
        );
      }
    }
  }

  const { data: run, error: runError } = await supabase
    .from("recommendation_runs")
    .insert({
      portfolio_id: portfolioId,
      strategy_id: activeAssignment?.strategy_id ?? null,
      strategy_version_id: activeAssignment?.strategy_version_id ?? null,
      run_type: "ai_review",
      triggered_by: "manual",
      model_name: "grok-4.20-0309-reasoning",
      model_version: "grok-4.20-0309-reasoning",
      summary: "AI review in progress...",
      status: "pending",
    })
    .select()
    .single();

  if (runError || !run) throw new Error(runError?.message || "Failed to create AI recommendation run.");

  // Fetch market regime in parallel with AI calls (soft-fail — regime is advisory only)
  const regimeContextStr = await (async () => {
    try {
      const [macro, spyQuote, spyMetrics, xlkQuote, xluQuote, breadth] = await Promise.all([
        getFredMacroSignals(),
        getFinnhubQuote("SPY"),
        getFinnhubMetrics("SPY"),
        getFinnhubQuote("XLK"),
        getFinnhubQuote("XLU"),
        getFmpMarketBreadth(),
      ]);
      const spyDailyMove = spyQuote?.dp !== undefined ? Math.abs(spyQuote.dp) : null;
      const xlkDp = xlkQuote?.dp ?? null;
      const xluDp = xluQuote?.dp ?? null;
      const regime = computeRegime(macro, {
        spyPrice: spyQuote?.c ?? null,
        spy52wHigh: spyMetrics?.weekHigh52 ?? null,
        spy52wLow: spyMetrics?.weekLow52 ?? null,
        spyMomentum1m: null,
        qqqVsSpyRatio: null,
        techVsDefensiveRatio: xlkDp !== null && xluDp !== null ? xlkDp - xluDp : null,
        impliedVolProxy: spyDailyMove !== null ? Math.round(spyDailyMove * (252 ** 0.5) * 0.7) : null,
        marketBreadthRatio: breadth?.ratio ?? null,
      });
      return regimePromptContext(regime);
    } catch {
      return null;
    }
  })();

  const regimePrefixedNote = [
    firstPortfolioNote,
    sparsePortfolioNote,
    regimeContextStr,
    contextNote || null,
  ].filter(Boolean).join("\n\n") || undefined;

  try {
    const [grokResult, geminiResult] = await Promise.all([
      callGrokForRecommendations(context, regimePrefixedNote),
      callGeminiForHealthReport(context),
    ]);

    // Build a map of owned shares for trim/sell validation
    const { data: currentHoldings } = await supabase
      .from("holdings")
      .select("ticker, shares")
      .eq("portfolio_id", portfolioId);
    const ownedSharesMap = new Map(
      (currentHoldings ?? []).map((h) => [h.ticker.toUpperCase(), Number(h.shares ?? 0)])
    );

    // Validate and cap trim/sell quantities against owned shares
    const validatedRecs = grokResult.recommendations.map((item) => {
      const action = (item.action_type ?? "").toLowerCase();
      const isTrimOrSell = action === "trim" || action === "sell";
      if (isTrimOrSell && item.ticker) {
        const owned = ownedSharesMap.get(item.ticker.toUpperCase()) ?? 0;
        if (owned > 0) {
          // Cap share_quantity to owned shares
          const cappedQty = item.share_quantity !== null
            ? Math.min(item.share_quantity, owned)
            : action === "sell" ? owned : Math.ceil(owned * 0.25); // default trim = 25% if not specified
          return { ...item, share_quantity: cappedQty };
        }
      }
      return item;
    });

    let insertedItemIds: string[] = [];
    if (validatedRecs.length > 0) {
      const { data: insertedItems, error: insertItemsError } = await supabase
        .from("recommendation_items")
        .insert(
          validatedRecs.map((item) => ({
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
            bear_price: item.bear_price,
            bull_price: item.bull_price,
            base_return_pct: item.base_return_pct,
            bear_return_pct: item.bear_return_pct,
            bull_return_pct: item.bull_return_pct,
            probability_bear: item.probability_bear,
            probability_base: item.probability_base,
            probability_bull: item.probability_bull,
            expected_value: item.expected_value,
            expected_return_pct: item.expected_return_pct,
            low_conviction_flag: item.low_conviction_flag ?? false,
            catalysts: item.catalysts,
            target_change_reason: item.target_change_reason,
            time_horizon: item.time_horizon,
            target_horizon: item.target_horizon,
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

    // Free snapshot — skip if valuation is zero/invalid (all prices missing)
    const aiSnapValue: number = (context as any).current_valuation.total_portfolio_value ?? 0;
    if (aiSnapValue > 0 && Number.isFinite(aiSnapValue)) {
      await supabase.from("portfolio_snapshots").insert({
        portfolio_id: portfolioId,
        total_value: aiSnapValue,
        cash_balance: (context as any).portfolio.cash_balance,
        snapshot_date: new Date().toISOString(),
        notes: "Auto snapshot — AI analysis",
      });
    }

    // Save factor intelligence snapshot for future evolution/drift detection (non-fatal)
    try {
      const fi = (context as any).portfolio_factor_intelligence;
      const pc = (context as any).portfolio_construction;
      if (fi) {
        await supabase.from("portfolio_factor_snapshots").insert({
          portfolio_id: portfolioId,
          strategy_integrity_score: fi.strategy_integrity_score ?? null,
          portfolio_hhi: pc?.portfolio_hhi ?? null,
          factor_exposure: fi.factor_exposure ?? null,
          behavior_profile: fi.behavior_profile ?? null,
          dominant_factors: fi.dominant_factors ?? null,
        });
      }
    } catch {
      // non-fatal — table may not exist yet
    }

    revalidatePath(`/portfolios/${portfolioId}`);
    revalidatePath("/dashboard");

    return {
      runId: run.id,
      recommendationCount: validatedRecs.length,
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
    .select("id, recommendation_status, action_type, ticker, company_name, share_quantity, sizing_dollars, sizing_pct, target_price_1, conviction, time_horizon, thesis, recommendation_run_id")
    .eq("id", recommendationItemId).eq("portfolio_id", portfolioId).single();
  if (itemError || !item) throw new Error("Recommendation item not found.");

  const userDecisionMap: Record<string, string | null> = {
    proposed: null, rejected: "rejected",
    watchlist: "watchlist", executed: "executed",
    acknowledged: "acknowledged", archived: "archived",
  };

  const { error: updateError } = await supabase
    .from("recommendation_items")
    .update({
      recommendation_status: newStatus,
      user_decision: userDecisionMap[newStatus] ?? null,
      decision_notes: note || null,
      ...(newStatus === "executed" ? { executed_at: new Date().toISOString() } : {}),
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

    // Capture execution price for outcome tracking: target_price_1 first, then live Finnhub quote
    let executedPrice: number | null = item.target_price_1 ? Number(item.target_price_1) : null;
    if (!executedPrice) {
      try {
        const liveQuote = await getFinnhubQuote(item.ticker);
        if (liveQuote && liveQuote.c > 0) executedPrice = liveQuote.c;
      } catch { /* non-fatal */ }
    }
    if (executedPrice) {
      // Fire-and-forget — column may not exist yet until migration is applied
      void Promise.resolve(
        supabase.from("recommendation_items")
          .update({ executed_price: executedPrice })
          .eq("id", recommendationItemId)
          .eq("portfolio_id", portfolioId)
      ).catch(() => {});
    }

    if (isBuy || isSell) {
      const transactionType = isBuy ? "buy" : "sell";
      const quantity = item.share_quantity ? Number(item.share_quantity) : null;

      const pricePerShare = executedPrice;

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

    // Auto-seed position thesis on executed buy — preserves original thesis on re-buys (non-fatal)
    if (isBuy) {
      try {
        await supabase.from("position_thesis").upsert({
          portfolio_id: portfolioId,
          ticker: item.ticker.toUpperCase(),
          original_thesis: item.thesis ? String(item.thesis).slice(0, 300) : null,
          portfolio_role: inferPortfolioRole(item.action_type, item.conviction),
          holding_profile: inferHoldingProfile(item.time_horizon),
          entry_conviction: normalizeConviction(item.conviction),
          thesis_status: "intact",
          seeded_from_run_id: (item as any).recommendation_run_id ?? null,
          updated_at: new Date().toISOString(),
        }, { onConflict: "portfolio_id,ticker", ignoreDuplicates: true });
      } catch {
        // non-fatal — thesis table may not exist yet
      }
    }
  }

  revalidatePath(`/portfolios/${portfolioId}`, "layout");
  revalidatePath("/dashboard", "layout");
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

// Bulk status update — does NOT create transactions.
// Use for Acknowledge/Watch/Reject/Archive on multiple items at once.
export async function bulkUpdateRecommendationStatus(
  portfolioId: string,
  itemIds: string[],
  newStatus: string
): Promise<{ updated: number }> {
  if (!itemIds.length) return { updated: 0 };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in.");

  const { data: portfolio } = await supabase
    .from("portfolios").select("id").eq("id", portfolioId).eq("user_id", user.id).single();
  if (!portfolio) throw new Error("Portfolio not found.");

  const userDecisionMap: Record<string, string | null> = {
    proposed: null, rejected: "rejected", watchlist: "watchlist",
    executed: "executed", acknowledged: "acknowledged", archived: "archived",
  };

  // Snapshot current statuses for history
  const { data: currentItems } = await supabase
    .from("recommendation_items")
    .select("id, recommendation_status")
    .eq("portfolio_id", portfolioId)
    .in("id", itemIds);

  const statusMap = new Map((currentItems ?? []).map(r => [r.id, r.recommendation_status]));

  const { error: updateError } = await supabase
    .from("recommendation_items")
    .update({ recommendation_status: newStatus, user_decision: userDecisionMap[newStatus] ?? null })
    .eq("portfolio_id", portfolioId)
    .in("id", itemIds);

  if (updateError) throw new Error(updateError.message);

  const historyRows = itemIds.map(id => ({
    recommendation_item_id: id,
    portfolio_id: portfolioId,
    old_status: statusMap.get(id) ?? null,
    new_status: newStatus,
    changed_by: "user",
    notes: "Bulk action",
  }));

  await supabase.from("recommendation_item_status_history").insert(historyRows);

  revalidatePath(`/portfolios/${portfolioId}`);
  return { updated: itemIds.length };
}
