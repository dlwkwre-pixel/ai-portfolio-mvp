// Market Regime Intelligence Engine
// Deterministic, explainable, stable signal scoring.
// AI does NOT control interpretation — scoring is rule-based.

import type { MacroSignals } from "./fred";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RegimeLevel = "risk-on" | "constructive" | "cautious" | "defensive" | "risk-off";

export type DimensionScores = {
  macro: number;        // 0-100: macro environment quality (yield curve, rates, credit)
  growth: number;       // 0-100: equity growth momentum (price trend, sector leadership)
  volatility: number;   // 0-100: market stability (100 = calm, 0 = extreme stress)
  liquidity: number;    // 0-100: funding + credit conditions
  inflation: number;    // 0-100: inflation regime (100 = benign, 0 = extreme)
};

export type RegimeModifiers = {
  // Hard-capped influence per spec — these are SUGGESTIONS to the AI, not commands
  positionSizingDelta: number;     // -25 to +25 (% adjustment to max position size)
  cashAllocationDelta: number;     // -20 to +20 (% adjustment to target cash)
  concentrationDelta: number;      // -15 to +15 (% adjustment to concentration limit)
  turnoverDelta: number;           // -25 to +25 (adjustment to turnover aggressiveness)
  convictionDelta: number;         // -20 to +20 (adjustment to conviction thresholds)
};

export type MarketSignals = {
  // SPY / broad market
  spyPrice: number | null;
  spy52wHigh: number | null;
  spy52wLow: number | null;
  spyMomentum1m: number | null;    // 1-month % return proxy
  // QQQ relative strength vs SPY
  qqqVsSpyRatio: number | null;
  // Sector ETF: XLK daily % change minus XLU daily % change (positive = tech leading)
  techVsDefensiveRatio: number | null;
  // Implied volatility proxy (SPY 30-day realized vol)
  impliedVolProxy: number | null;
  // NYSE+NASDAQ breadth: advancing / (advancing + declining), 0–1
  marketBreadthRatio: number | null;
};

export type RegimeSnapshot = {
  label: RegimeLabel;
  level: RegimeLevel;
  score: number;                   // 0-100 composite
  dimensions: DimensionScores;
  modifiers: RegimeModifiers;
  narrative: string;               // 1-sentence plain-English summary
  signals: {
    yieldCurve: string;
    fedPolicy: string;
    inflation: string;
    employment: string;
    creditConditions: string;
    marketBreadth: string;         // "64% advancing — healthy" or "Unavailable"
    sectorLeadership: string;      // "Tech +0.8% vs Defensives — leading" or "Unavailable"
  };
  dataQuality: "full" | "partial" | "market-only";  // what data was available
  calculatedAt: string;
};

export type RegimeLabel =
  | "Risk-On"
  | "Constructive"
  | "Cautious"
  | "Defensive"
  | "Risk-Off";

// ─── Clamp helper ─────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// ─── Score individual signals (each returns 0-100) ────────────────────────────

function scoreYieldCurve(spread: number | null): number {
  if (spread === null) return 50; // neutral fallback
  // > 1.5: very healthy = 90
  // 0.5-1.5: normal = 70-85
  // 0-0.5: flattening = 50-65
  // -0.5-0: mild inversion = 30-45
  // < -0.5: deep inversion = 5-25
  if (spread >= 1.5) return 90;
  if (spread >= 0.5) return 70 + (spread - 0.5) * 20;
  if (spread >= 0) return 50 + spread * 40;
  if (spread >= -0.5) return 30 + (spread + 0.5) * 40;
  return clamp(30 + spread * 50, 5, 30);
}

function scoreFedPolicy(rate: number | null, prevRate: number | null): number {
  if (rate === null) return 50;
  // Rate cutting trend = bullish (higher score)
  // Rate hiking trend = bearish (lower score)
  // Level: very high rates = restrictive
  const trend = prevRate !== null ? rate - prevRate : 0;
  let levelScore: number;
  if (rate <= 1.0) levelScore = 80;        // very accommodative
  else if (rate <= 2.5) levelScore = 70;
  else if (rate <= 4.0) levelScore = 55;
  else if (rate <= 5.5) levelScore = 40;
  else levelScore = 25;                    // very restrictive

  // Trend bonus/penalty: cutting = +15, hiking = -15
  const trendScore = trend < -0.1 ? 15 : trend > 0.1 ? -15 : 0;
  return clamp(levelScore + trendScore, 10, 95);
}

function scoreInflation(cpi: number | null, cpiPrev: number | null): number {
  if (cpi === null) return 50;
  // 2-3%: goldilocks = 85
  // 1-2% or 3-4%: acceptable = 65-80
  // < 1%: deflation risk = 45
  // 4-6%: elevated = 35-50
  // > 6%: severe = 10-25
  const trend = cpiPrev !== null ? cpi - cpiPrev : 0;

  let base: number;
  if (cpi >= 1.5 && cpi <= 3.0) base = 85;
  else if (cpi >= 1.0 && cpi <= 4.0) base = 65;
  else if (cpi < 1.0) base = 45;
  else if (cpi <= 5.0) base = 40;
  else if (cpi <= 7.0) base = 25;
  else base = 10;

  // Trend: improving = +10, worsening = -10
  const trendAdj = trend < -0.3 ? 10 : trend > 0.3 ? -10 : 0;
  return clamp(base + trendAdj, 5, 95);
}

function scoreEmployment(unemployment: number | null, prevUnemployment: number | null): number {
  if (unemployment === null) return 55;
  const trend = prevUnemployment !== null ? unemployment - prevUnemployment : 0;

  let base: number;
  if (unemployment <= 3.5) base = 80;
  else if (unemployment <= 4.5) base = 70;
  else if (unemployment <= 5.5) base = 55;
  else if (unemployment <= 7.0) base = 40;
  else base = 20;

  // Rising unemployment = bearish
  const trendAdj = trend > 0.3 ? -15 : trend < -0.2 ? 10 : 0;
  return clamp(base + trendAdj, 5, 95);
}

function scoreCreditConditions(creditSpread: number | null): number {
  if (creditSpread === null) return 55;
  // High yield OAS (basis points): lower = benign, higher = stress
  // < 300bps: benign
  // 300-450: normal
  // 450-650: elevated
  // > 650: stress
  if (creditSpread < 250) return 90;
  if (creditSpread < 350) return 75;
  if (creditSpread < 450) return 60;
  if (creditSpread < 600) return 40;
  if (creditSpread < 800) return 20;
  return 5;
}

function scoreSpyTrend(price: number | null, high52w: number | null, low52w: number | null): number {
  if (price === null || high52w === null || low52w === null) return 50;
  const range = high52w - low52w;
  if (range <= 0) return 50;
  // Where in 52-week range: near high = bullish
  const position = (price - low52w) / range; // 0-1
  return clamp(20 + position * 70, 20, 90);
}

function scoreVolatility(impliedVol: number | null): number {
  if (impliedVol === null) return 55;
  // VIX-like: < 15 = calm, 15-20 = normal, 20-30 = elevated, > 30 = fear
  if (impliedVol < 12) return 85;
  if (impliedVol < 18) return 70;
  if (impliedVol < 25) return 55;
  if (impliedVol < 35) return 30;
  return 10;
}

function scoreBreadth(ratio: number | null): number {
  if (ratio === null) return 50; // neutral fallback
  // advancing / (advancing + declining): 0-1
  // > 0.65 = strong breadth: 80-90
  // 0.55-0.65 = healthy: 65-78
  // 0.45-0.55 = neutral: 45-62
  // 0.35-0.45 = weak: 25-42
  // < 0.35 = very weak: 5-22
  if (ratio >= 0.65) return clamp(75 + (ratio - 0.65) * 150, 80, 92);
  if (ratio >= 0.55) return clamp(55 + (ratio - 0.55) * 200, 65, 78);
  if (ratio >= 0.45) return clamp(45 + (ratio - 0.45) * 200, 45, 62);
  if (ratio >= 0.35) return clamp(20 + (ratio - 0.35) * 250, 25, 42);
  return clamp(ratio * 60, 5, 22);
}

function scoreTechLeadership(dpDiff: number | null): number {
  // dpDiff = XLK daily % change minus XLU daily % change
  // Positive = tech outperforming defensives = risk-on signal
  if (dpDiff === null) return 50; // neutral fallback
  if (dpDiff >= 1.5) return 85;
  if (dpDiff >= 0.5) return 70;
  if (dpDiff >= 0.0) return 55;
  if (dpDiff >= -0.5) return 45;
  if (dpDiff >= -1.5) return 32;
  return 18;
}

// ─── Compute dimension scores ─────────────────────────────────────────────────

function computeDimensions(macro: MacroSignals, market: MarketSignals): DimensionScores {
  const yieldScore = scoreYieldCurve(macro.yieldCurveSpread);
  const fedScore = scoreFedPolicy(macro.fedFundsRate, macro.fedFundsPrev);
  const creditScore = scoreCreditConditions(macro.creditSpread);
  const inflScore = scoreInflation(macro.cpi, macro.cpiPrev);
  const emplScore = scoreEmployment(macro.unemployment, macro.unemploymentPrev);
  const trendScore = scoreSpyTrend(market.spyPrice, market.spy52wHigh, market.spy52wLow);
  const volScore = scoreVolatility(market.impliedVolProxy);
  const breadthScore = scoreBreadth(market.marketBreadthRatio);
  const techLeadScore = scoreTechLeadership(market.techVsDefensiveRatio);

  // Macro: yield curve (40%), fed policy (35%), credit (25%)
  const macroScore = yieldScore * 0.4 + fedScore * 0.35 + creditScore * 0.25;

  // Growth: SPY 52w position (40%), breadth (35%), tech vs defensive leadership (25%)
  // Null signals fall back to 50 (neutral) via their respective scoring functions
  const growthScore = trendScore * 0.40 + breadthScore * 0.35 + techLeadScore * 0.25;

  // Volatility: vol proxy (100%)
  const volatilityScore = volScore;

  // Liquidity: credit (50%), yield curve (30%), fed (20%)
  const liquidityScore = creditScore * 0.5 + yieldScore * 0.3 + fedScore * 0.2;

  // Inflation: inflation score (60%), employment (40%)
  const inflationScore = inflScore * 0.6 + emplScore * 0.4;

  return {
    macro: Math.round(macroScore),
    growth: Math.round(growthScore),
    volatility: Math.round(volatilityScore),
    liquidity: Math.round(liquidityScore),
    inflation: Math.round(inflationScore),
  };
}

// ─── Composite score → regime level ───────────────────────────────────────────

function computeCompositeScore(dims: DimensionScores): number {
  // Weights: macro (30%), growth (25%), volatility (20%), liquidity (15%), inflation (10%)
  return Math.round(
    dims.macro * 0.30 +
    dims.growth * 0.25 +
    dims.volatility * 0.20 +
    dims.liquidity * 0.15 +
    dims.inflation * 0.10
  );
}

function scoreToLevel(score: number): RegimeLevel {
  if (score >= 72) return "risk-on";
  if (score >= 57) return "constructive";
  if (score >= 42) return "cautious";
  if (score >= 27) return "defensive";
  return "risk-off";
}

function levelToLabel(level: RegimeLevel): RegimeLabel {
  const map: Record<RegimeLevel, RegimeLabel> = {
    "risk-on": "Risk-On",
    "constructive": "Constructive",
    "cautious": "Cautious",
    "defensive": "Defensive",
    "risk-off": "Risk-Off",
  };
  return map[level];
}

// ─── Hard-capped modifiers (per spec) ─────────────────────────────────────────

function computeModifiers(level: RegimeLevel): RegimeModifiers {
  // All values within spec caps: sizing ±25, cash ±20, concentration ±15, turnover ±25, conviction ±20
  // Positive = more aggressive, Negative = more conservative
  const table: Record<RegimeLevel, RegimeModifiers> = {
    "risk-on": {
      positionSizingDelta: 5,
      cashAllocationDelta: -5,
      concentrationDelta: 5,
      turnoverDelta: 5,
      convictionDelta: 5,
    },
    "constructive": {
      positionSizingDelta: 0,
      cashAllocationDelta: 0,
      concentrationDelta: 0,
      turnoverDelta: 0,
      convictionDelta: 0,
    },
    "cautious": {
      positionSizingDelta: -10,
      cashAllocationDelta: 8,
      concentrationDelta: -8,
      turnoverDelta: -10,
      convictionDelta: -10,
    },
    "defensive": {
      positionSizingDelta: -18,
      cashAllocationDelta: 14,
      concentrationDelta: -12,
      turnoverDelta: -18,
      convictionDelta: -16,
    },
    "risk-off": {
      positionSizingDelta: -25,
      cashAllocationDelta: 20,
      concentrationDelta: -15,
      turnoverDelta: -25,
      convictionDelta: -20,
    },
  };
  return table[level];
}

// ─── Signal labels for UI ─────────────────────────────────────────────────────

function yieldCurveLabel(spread: number | null): string {
  if (spread === null) return "Unavailable";
  if (spread >= 1.5) return `Normal +${spread.toFixed(2)}% — healthy term premium`;
  if (spread >= 0.5) return `Normal +${spread.toFixed(2)}% — modest term premium`;
  if (spread >= 0) return `Flat +${spread.toFixed(2)}% — caution warranted`;
  if (spread >= -0.5) return `Inverted ${spread.toFixed(2)}% — mild recession signal`;
  return `Deep inversion ${spread.toFixed(2)}% — recession signal`;
}

function fedPolicyLabel(rate: number | null, prev: number | null): string {
  if (rate === null) return "Unavailable";
  const trend = prev !== null ? rate - prev : 0;
  const trendStr = trend < -0.05 ? " (cutting)" : trend > 0.05 ? " (hiking)" : " (stable)";
  if (rate <= 2.0) return `${rate.toFixed(2)}%${trendStr} — accommodative`;
  if (rate <= 4.0) return `${rate.toFixed(2)}%${trendStr} — neutral`;
  return `${rate.toFixed(2)}%${trendStr} — restrictive`;
}

function inflationLabel(cpi: number | null): string {
  if (cpi === null) return "Unavailable";
  if (cpi <= 2.5) return `${cpi.toFixed(1)}% YoY — benign`;
  if (cpi <= 4.0) return `${cpi.toFixed(1)}% YoY — above target`;
  return `${cpi.toFixed(1)}% YoY — elevated`;
}

function employmentLabel(unemployment: number | null, prev: number | null): string {
  if (unemployment === null) return "Unavailable";
  const trend = prev !== null ? unemployment - prev : 0;
  const dir = trend > 0.1 ? " (rising)" : trend < -0.1 ? " (falling)" : " (stable)";
  if (unemployment <= 4.0) return `${unemployment.toFixed(1)}%${dir} — tight labor market`;
  if (unemployment <= 5.5) return `${unemployment.toFixed(1)}%${dir} — moderate slack`;
  return `${unemployment.toFixed(1)}%${dir} — meaningful slack`;
}

function creditLabel(spread: number | null): string {
  if (spread === null) return "Unavailable";
  if (spread < 300) return `HY OAS ${Math.round(spread)}bps — benign`;
  if (spread < 450) return `HY OAS ${Math.round(spread)}bps — normal`;
  if (spread < 650) return `HY OAS ${Math.round(spread)}bps — elevated`;
  return `HY OAS ${Math.round(spread)}bps — stress`;
}

function breadthLabel(ratio: number | null): string {
  if (ratio === null) return "Unavailable";
  const pct = Math.round(ratio * 100);
  if (pct >= 65) return `${pct}% advancing — strong breadth`;
  if (pct >= 55) return `${pct}% advancing — healthy`;
  if (pct >= 45) return `${pct}% advancing — neutral`;
  if (pct >= 35) return `${pct}% advancing — weak breadth`;
  return `${pct}% advancing — narrow / deteriorating`;
}

function sectorLeadershipLabel(dpDiff: number | null): string {
  if (dpDiff === null) return "Unavailable";
  const sign = dpDiff >= 0 ? "+" : "";
  if (dpDiff >= 1.0) return `XLK ${sign}${dpDiff.toFixed(1)}% vs XLU — tech strongly leading`;
  if (dpDiff >= 0.3) return `XLK ${sign}${dpDiff.toFixed(1)}% vs XLU — tech leading`;
  if (dpDiff >= -0.3) return `XLK/XLU spread ${sign}${dpDiff.toFixed(1)}% — neutral rotation`;
  if (dpDiff >= -1.0) return `XLK ${sign}${dpDiff.toFixed(1)}% vs XLU — defensives leading`;
  return `XLK ${sign}${dpDiff.toFixed(1)}% vs XLU — defensives strongly leading`;
}

// ─── Narrative generator ──────────────────────────────────────────────────────

function buildNarrative(level: RegimeLevel, dims: DimensionScores): string {
  const weakness = Object.entries(dims)
    .filter(([, v]) => v < 45)
    .map(([k]) => k);

  const strength = Object.entries(dims)
    .filter(([, v]) => v > 65)
    .map(([k]) => k);

  const map: Record<RegimeLevel, string> = {
    "risk-on": `Macro and market conditions are broadly supportive — full strategic expression is appropriate.`,
    "constructive": strength.length
      ? `Environment is broadly constructive with ${strength[0]} conditions favorable; maintain standard positioning.`
      : `Environment is broadly constructive; maintain standard strategic positioning.`,
    "cautious": weakness.length
      ? `Elevated ${weakness[0]} risk suggests modest tactical conservatism — reduce speculative sizing by 10%.`
      : `Mixed conditions suggest modest tactical conservatism — trim speculative exposure slightly.`,
    "defensive": weakness.length >= 2
      ? `${weakness[0]} and ${weakness[1]} conditions are under pressure — meaningfully reduce risk expression.`
      : `Conditions warrant a defensive posture — reduce position sizes and build cash buffer.`,
    "risk-off": `Broad deterioration across macro and market signals — maximum tactical conservatism within hard caps.`,
  };
  return map[level];
}

// ─── Data quality assessment ──────────────────────────────────────────────────

function assessDataQuality(macro: MacroSignals, market: MarketSignals): RegimeSnapshot["dataQuality"] {
  const macroAvailable = macro.fredAvailable &&
    macro.yieldCurveSpread !== null &&
    macro.fedFundsRate !== null;
  const marketAvailable = market.spyPrice !== null;
  const extendedAvailable = market.marketBreadthRatio !== null || market.techVsDefensiveRatio !== null;

  if (macroAvailable && marketAvailable && extendedAvailable) return "full";
  if (macroAvailable && marketAvailable) return "partial"; // FRED ok but no breadth/sector
  if (marketAvailable) return "market-only";
  return "partial";
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function computeRegime(macro: MacroSignals, market: MarketSignals): RegimeSnapshot {
  const dimensions = computeDimensions(macro, market);
  const score = computeCompositeScore(dimensions);
  const level = scoreToLevel(score);
  const label = levelToLabel(level);
  const modifiers = computeModifiers(level);
  const narrative = buildNarrative(level, dimensions);
  const dataQuality = assessDataQuality(macro, market);

  return {
    label,
    level,
    score,
    dimensions,
    modifiers,
    narrative,
    signals: {
      yieldCurve: yieldCurveLabel(macro.yieldCurveSpread),
      fedPolicy: fedPolicyLabel(macro.fedFundsRate, macro.fedFundsPrev),
      inflation: inflationLabel(macro.cpi),
      employment: employmentLabel(macro.unemployment, macro.unemploymentPrev),
      creditConditions: creditLabel(macro.creditSpread),
      marketBreadth: breadthLabel(market.marketBreadthRatio),
      sectorLeadership: sectorLeadershipLabel(market.techVsDefensiveRatio),
    },
    dataQuality,
    calculatedAt: new Date().toISOString(),
  };
}

// Compact structured overlay for Grok prompts.
// Returns a JSON object string + a brief usage note — much more token-efficient
// than verbose text and prevents LLMs from interpreting macro labels emotionally.
export function regimePromptContext(regime: RegimeSnapshot): string {
  // Sizing modifier: multiplier applied to new position max size
  const sizingModifier: Record<RegimeLevel, number> = {
    "risk-on":      1.00,
    "constructive": 0.95,
    "cautious":     0.80,
    "defensive":    0.65,
    "risk-off":     0.50,
  };

  // Speculative penalty: extra bar raised for low-quality or high-risk names
  const speculativePenalty: Record<RegimeLevel, number> = {
    "risk-on":      0.00,
    "constructive": 0.05,
    "cautious":     0.20,
    "defensive":    0.35,
    "risk-off":     0.50,
  };

  const participationBias: Record<RegimeLevel, string> = {
    "risk-on":      "favor_participation",
    "constructive": "favor_participation",
    "cautious":     "balanced",
    "defensive":    "favor_caution",
    "risk-off":     "favor_caution",
  };

  function dimLabel(score: number): string {
    if (score >= 65) return "strong";
    if (score >= 45) return "mixed";
    return "stressed";
  }

  function volLabel(score: number): string {
    if (score >= 65) return "calm";
    if (score >= 45) return "elevated";
    return "high";
  }

  const overlay = {
    macro_score:        regime.score,
    macro_conditions:   dimLabel(regime.dimensions.macro),
    liquidity:          dimLabel(regime.dimensions.liquidity),
    breadth:            dimLabel(regime.dimensions.growth),
    volatility:         volLabel(regime.dimensions.volatility),
    inflation:          dimLabel(regime.dimensions.inflation),
    participation_bias: participationBias[regime.level],
    sizing_modifier:    sizingModifier[regime.level],
    speculative_penalty: speculativePenalty[regime.level],
    key_signals: {
      yield_curve: regime.signals.yieldCurve,
      fed_policy:  regime.signals.fedPolicy,
      inflation:   regime.signals.inflation,
    },
  };

  return [
    `MACRO_OVERLAY: ${JSON.stringify(overlay)}`,
    `Usage: sizing_modifier scales new position sizes (0.8 = 80% of standard max). speculative_penalty raises the bar for low-quality or high-risk names only. These are portfolio construction inputs — they DO NOT determine whether securities are attractive and DO NOT justify HOLD for fundamentally sound positions. Security quality and strategy fit are evaluated independently of this overlay.`,
  ].join("\n");
}
