"use client";

import { useState, useRef, useEffect, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createStrategy } from "./actions";
import { saveFinnProfile } from "./finn-profile-actions";

// ── Types ──────────────────────────────────────────────────────────────────────

type Message = {
  role: "assistant" | "user";
  content: string;
  isInsight?: boolean;
  insightTitle?: string;
};

type GeneratedStrategy = {
  name: string;
  style: string;
  risk_level: string;
  turnover_preference: string;
  holding_period_bias: string;
  max_position_pct: number | null;
  min_position_pct: number | null;
  cash_min_pct: number | null;
  cash_max_pct: number | null;
  description: string;
  prompt_text: string;
};

type DNAProfile = {
  growth: number;
  defense: number;
  volatility: number;
  taxEfficiency: number;
  income: number;
};

// ── Strategy builder constants ─────────────────────────────────────────────────

const STRATEGY_STYLES = [
  "Growth", "Value", "Blend", "Dividend / Income", "Quality",
  "Index / Passive", "Sector / Thematic", "Momentum", "Swing",
  "Mean Reversion", "Defensive", "Balanced", "Speculative", "Custom",
];
const RISK_LEVELS           = ["Conservative", "Moderate", "Aggressive"];
const TURNOVER_PREFERENCES  = ["Low", "Moderate", "High"];
const HOLDING_PERIOD_BIASES = [
  "Short-term", "Swing", "Medium-term", "Long-term", "Very Long-term", "Flexible",
];

// ── Section 18: Atlas visual identity tokens ───────────────────────────────────

const FV = {
  bg:          "rgba(109,40,217,0.05)",
  bgMed:       "rgba(109,40,217,0.09)",
  border:      "rgba(109,40,217,0.18)",
  borderFaint: "rgba(109,40,217,0.11)",
  glowRing:    "rgba(109,40,217,0.22)",
  glowOuter:   "rgba(109,40,217,0.08)",
  accent:      "#7c3aed",
  accentBright:"#8b5cf6",
  accentDim:   "#6d28d9",
} as const;

// ── Tier 1: Atlas thinking states ──────────────────────────────────────────────

const CHAT_THINKING = [
  "Analyzing your investing goal…",
  "Evaluating your risk profile…",
  "Processing your preferences…",
  "Considering your time horizon…",
  "Calibrating recommendations…",
];

const GEN_THINKING = [
  "Detecting investment objectives…",
  "Calibrating risk parameters…",
  "Building allocation framework…",
  "Stress testing assumptions…",
  "Finalizing strategy DNA…",
];

const DNA_DIMENSIONS: Array<{ key: keyof DNAProfile; label: string }> = [
  { key: "growth",        label: "Growth"    },
  { key: "defense",       label: "Defense"   },
  { key: "volatility",    label: "Volatility"},
  { key: "taxEfficiency", label: "Tax Eff."  },
  { key: "income",        label: "Income"    },
];

const SIGNALS_META = [
  { id: "goal",    label: "Investment goal" },
  { id: "risk",    label: "Risk tolerance"  },
  { id: "horizon", label: "Time horizon"    },
  { id: "income",  label: "Income pref."    },
  { id: "style",   label: "Style pref."     },
];

// ── Tier 2: Naming + Insight constants ────────────────────────────────────────

const NAME_MATRIX: Record<string, Record<string, string>> = {
  "Growth":            { Conservative: "Horizon Builder",  Moderate: "Nova Growth",      Aggressive: "Atlas Growth"    },
  "Value":             { Conservative: "Sentinel Value",   Moderate: "Meridian Value",   Aggressive: "Catalyst Value"  },
  "Blend":             { Conservative: "Anchor Blend",     Moderate: "Prism Core",       Aggressive: "Fusion Growth"   },
  "Dividend / Income": { Conservative: "Harbor Yield",     Moderate: "Bastion Income",   Aggressive: "Velocity Income" },
  "Quality":           { Conservative: "Citadel Quality",  Moderate: "Keystone Quality", Aggressive: "Apex Quality"    },
  "Index / Passive":   { Conservative: "Foundation Core",  Moderate: "Pillar Index",     Aggressive: "Vertex Index"    },
  "Sector / Thematic": { Conservative: "Prism Thematic",   Moderate: "Vertex Thematic",  Aggressive: "Apex Thematic"   },
  "Momentum":          { Conservative: "Steady Velocity",  Moderate: "Velocity Pro",     Aggressive: "Zenith Momentum" },
  "Swing":             { Conservative: "Tactical Core",    Moderate: "Cycle Edge",       Aggressive: "Apex Swing"      },
  "Mean Reversion":    { Conservative: "Reversion Core",   Moderate: "Reversion Pro",    Aggressive: "Contrarian Edge" },
  "Defensive":         { Conservative: "Citadel Core",     Moderate: "Anchor Portfolio", Aggressive: "Iron Core"       },
  "Balanced":          { Conservative: "Equilibrium",      Moderate: "Meridian Blend",   Aggressive: "Apex Balanced"   },
  "Speculative":       { Conservative: "Phoenix Base",     Moderate: "Phoenix Mid",      Aggressive: "Phoenix Alpha"   },
  "Custom":            { Conservative: "Horizon Custom",   Moderate: "Meridian Custom",  Aggressive: "Apex Custom"     },
};

const GENERIC_SUFFIXES = ["strategy", "portfolio", "plan", "fund", "approach", "model"];

const INSIGHT_TRIGGERS: Array<{ id: string; patterns: RegExp[]; title: string; body: string }> = [
  {
    id: "volatility",
    patterns: [/drawdown|volatil|correction|bear market|loss|decline/i],
    title: "Volatility Sensitivity",
    body: "Your tolerance will be tested during corrections. Aggressive strategies can draw down 30–50% — sizing conviction against comfort matters.",
  },
  {
    id: "tax",
    patterns: [/tax|capital gain|tax.effic|turnover/i],
    title: "Tax Optimization",
    body: "Low turnover defers capital gains tax indefinitely — a structural compounding advantage that grows with time horizon.",
  },
  {
    id: "income",
    patterns: [/dividend|income|yield|cash flow|distribution|payout/i],
    title: "Income Architecture",
    body: "Dividend strategies build predictable cash flow that can be reinvested or drawn without selling positions.",
  },
  {
    id: "compounding",
    patterns: [/long.term|compound|decade|time in market|years|horizon|retire/i],
    title: "Compounding Runway",
    body: "Time in market compounds returns exponentially. An extra decade can more than double terminal wealth at the same rate.",
  },
];

// ── Section 17: Stress simulator data ────────────────────────────────────────

type StressEntry   = { drawdown: string; recovery: string; resilience: "High" | "Medium" | "Low" };
type StressRiskMap = Record<"Conservative" | "Moderate" | "Aggressive", StressEntry>;

const STRESS_TABLE: Record<"2008" | "rate" | "bear" | "inflation", StressRiskMap> = {
  "2008": {
    Conservative: { drawdown: "−18% to −28%", recovery: "12–18 mo", resilience: "High"   },
    Moderate:     { drawdown: "−32% to −48%", recovery: "24–36 mo", resilience: "Medium" },
    Aggressive:   { drawdown: "−48% to −65%", recovery: "36–54 mo", resilience: "Low"    },
  },
  "rate": {
    Conservative: { drawdown: "−8% to −18%",  recovery: "6–12 mo",  resilience: "High"   },
    Moderate:     { drawdown: "−18% to −30%", recovery: "12–24 mo", resilience: "Medium" },
    Aggressive:   { drawdown: "−28% to −45%", recovery: "24–36 mo", resilience: "Low"    },
  },
  "bear": {
    Conservative: { drawdown: "−15% to −25%", recovery: "18–30 mo", resilience: "High"   },
    Moderate:     { drawdown: "−28% to −42%", recovery: "24–42 mo", resilience: "Medium" },
    Aggressive:   { drawdown: "−42% to −60%", recovery: "36–60 mo", resilience: "Low"    },
  },
  "inflation": {
    Conservative: { drawdown: "−5% to −15%",  recovery: "6–18 mo",  resilience: "High"   },
    Moderate:     { drawdown: "−12% to −25%", recovery: "12–24 mo", resilience: "Medium" },
    Aggressive:   { drawdown: "−20% to −38%", recovery: "18–36 mo", resilience: "Medium" },
  },
};

const STRESS_SCENARIOS_META: Array<{ id: keyof typeof STRESS_TABLE; label: string }> = [
  { id: "2008",      label: "2008-Style Crisis" },
  { id: "rate",      label: "Rate Shock"        },
  { id: "bear",      label: "Prolonged Bear"    },
  { id: "inflation", label: "Inflation Surge"   },
];

// ── Helpers: Tier 1 ───────────────────────────────────────────────────────────

function detectSignals(msgs: Message[]): Map<string, string> {
  const detected = new Map<string, string>();
  const userText = msgs.filter(m => m.role === "user" && !m.isInsight).map(m => m.content.toLowerCase()).join(" ");
  const allText  = msgs.filter(m => !m.isInsight).map(m => m.content.toLowerCase()).join(" ");

  if (/grow|wealth|income|retire|capital|dividend|build|accumulate|compound|invest/.test(userText)) {
    if (/dividend|passive income/.test(userText))               detected.set("goal", "Income");
    else if (/retire|retirement/.test(userText))                detected.set("goal", "Retirement");
    else if (/conserv|protect|preserve|stable/.test(userText)) detected.set("goal", "Capital preservation");
    else                                                        detected.set("goal", "Growth");
  }
  if (/aggress|high.risk|risk|moderate|conserv|low.risk|safe|volatile|tolerance/.test(userText)) {
    if (/aggress|high.risk/.test(userText))          detected.set("risk", "Aggressive");
    else if (/conserv|low.risk|safe/.test(userText)) detected.set("risk", "Conservative");
    else                                             detected.set("risk", "Moderate");
  } else if (msgs.length > 2 && /aggressive|conservative|moderate/.test(allText)) {
    if (/aggressive/.test(allText))        detected.set("risk", "Aggressive");
    else if (/conservative/.test(allText)) detected.set("risk", "Conservative");
    else                                   detected.set("risk", "Moderate");
  }
  if (/\d+\s*year|long.term|short.term|retire|decade|\b2\d\s*year|\b3\d\s*year/.test(userText)) {
    if (/short.term|\b[12]\s*year/.test(userText))                              detected.set("horizon", "Short-term");
    else if (/\b(20|25|30)\s*year|very long|decades|generation/.test(userText)) detected.set("horizon", "Very long-term");
    else                                                                         detected.set("horizon", "Long-term");
  }
  if (/dividend|yield|cash flow|distribution|passive income/.test(userText)) {
    detected.set("income", "Dividends");
  } else if (userText.length > 60 && /capital gain|appreciat|compounder/.test(userText)) {
    detected.set("income", "Capital growth");
  }
  if (/passive|index|momentum|value stock|defensive|quality|thematic|tech|healthcare|energy|sector|small.cap|large.cap/.test(userText)) {
    if (/passive|index/.test(userText))    detected.set("style", "Index / Passive");
    else if (/defensive/.test(userText))   detected.set("style", "Defensive");
    else if (/momentum/.test(userText))    detected.set("style", "Momentum");
    else if (/value/.test(userText))       detected.set("style", "Value");
    else if (/quality/.test(userText))     detected.set("style", "Quality");
    else                                   detected.set("style", "Thematic");
  }
  return detected;
}

function computeDNA(s: GeneratedStrategy): DNAProfile {
  const growthByStyle: Record<string, number> = {
    Growth: 85, Momentum: 80, Speculative: 90, "Sector / Thematic": 72, Swing: 62,
    Value: 52, Blend: 58, Quality: 62, "Index / Passive": 56, "Mean Reversion": 52,
    Balanced: 52, "Dividend / Income": 32, Defensive: 30, Custom: 55,
  };
  const defenseByStyle: Record<string, number> = {
    Defensive: 85, Balanced: 65, "Dividend / Income": 68, Value: 62, Quality: 60,
    "Index / Passive": 58, "Mean Reversion": 55, Blend: 52, Custom: 50,
    Swing: 38, "Sector / Thematic": 32, Growth: 28, Momentum: 22, Speculative: 15,
  };
  const incomeByStyle: Record<string, number> = {
    "Dividend / Income": 88, Defensive: 62, Balanced: 55, Value: 48, Quality: 42,
    "Index / Passive": 42, Blend: 38, "Mean Reversion": 35, Custom: 40,
    Swing: 22, Growth: 18, Momentum: 15, "Sector / Thematic": 28, Speculative: 10,
  };
  const volByRisk: Record<string, number>     = { Conservative: 20, Moderate: 50, Aggressive: 82 };
  const volAdjByStyle: Record<string, number> = {
    Speculative: 10, Momentum: 8, Growth: 5, Swing: 5,
    Defensive: -12, Balanced: -5, Value: -3, "Dividend / Income": -8, "Index / Passive": -3,
  };
  const taxByTurnover: Record<string, number> = { Low: 85, Moderate: 52, High: 22 };
  const riskGrowthMod = s.risk_level === "Aggressive" ? 8  : s.risk_level === "Conservative" ? -8  : 0;
  const riskDefMod    = s.risk_level === "Conservative" ? 10 : s.risk_level === "Aggressive"  ? -10 : 0;
  return {
    growth:        Math.min(100, Math.max(5, (growthByStyle[s.style]  ?? 55) + riskGrowthMod)),
    defense:       Math.min(100, Math.max(5, (defenseByStyle[s.style] ?? 50) + riskDefMod)),
    volatility:    Math.min(100, Math.max(5, (volByRisk[s.risk_level] ?? 50) + (volAdjByStyle[s.style] ?? 0))),
    taxEfficiency: taxByTurnover[s.turnover_preference] ?? 52,
    income:        Math.min(100, Math.max(5, incomeByStyle[s.style]   ?? 40)),
  };
}

// ── Helpers: Tier 2 ───────────────────────────────────────────────────────────

function brandifyName(s: GeneratedStrategy): { name: string; isBranded: boolean } {
  const lower     = s.name.toLowerCase();
  const isGeneric = GENERIC_SUFFIXES.some(suffix => lower.endsWith(suffix) || lower.includes(` ${suffix} `));
  if (!isGeneric) return { name: s.name, isBranded: false };
  const branded = NAME_MATRIX[s.style]?.[s.risk_level];
  if (!branded) return { name: s.name, isBranded: false };
  return { name: branded, isBranded: true };
}

function detectInsight(
  latestMsg: string,
  shownIds: Set<string>,
  userMsgCount: number,
): { id: string; title: string; body: string } | null {
  for (const trigger of INSIGHT_TRIGGERS) {
    if (shownIds.has(trigger.id)) continue;
    if (trigger.patterns.some(p => p.test(latestMsg))) return trigger;
  }
  if (userMsgCount >= 4 && !shownIds.has("profile_complete")) {
    return {
      id: "profile_complete",
      title: "Profile Complete",
      body: "Atlas has gathered enough context to build a high-confidence strategy. Your preferences have been mapped.",
    };
  }
  return null;
}

// ── Contradiction Detection ───────────────────────────────────────────────────

type ContradictionDef = {
  id: string;
  a: RegExp;
  b: RegExp;
  title: string;
  body: string;
  resolution: string;
};

const CONTRADICTION_PAIRS: ContradictionDef[] = [
  {
    id: "aggr-safe",
    a: /aggress|maximum.return|beat.market|outperform|high.alpha|best.return/i,
    b: /low.risk|low.volatil|safe|protect.capital|minimal.loss|no.loss|conservative/i,
    title: "Return vs. Risk Conflict",
    body: "Aggressive returns and low volatility are structurally at odds. Higher expected returns require accepting higher variance — that's a foundational tradeoff. Atlas is prioritizing long-term compounding with managed, not minimized, risk.",
    resolution: "Atlas will optimize for risk-adjusted returns rather than maximum upside or maximum safety independently.",
  },
  {
    id: "income-growth",
    a: /maximum.income|high.dividend|passive.income|yield.focused|income.first/i,
    b: /maximum.growth|high.growth|capital.appreciat|growth.only|compound.wealth/i,
    title: "Income vs. Growth Conflict",
    body: "Maximum income and maximum growth pull capital in opposite directions. High-yield positions redirect earnings away from reinvestment; pure growth strategies rarely prioritize distributions. Atlas will build a primary objective with a secondary allocation.",
    resolution: "Atlas will determine the dominant objective from your time horizon and bias the strategy accordingly.",
  },
  {
    id: "concentr-safe",
    a: /concentrat|few.stock|[3-9].stock|10.stock|focused.portf|high.conviction.few/i,
    b: /low.risk|low.volatil|safe|stable|downside.protect|conservative|protect/i,
    title: "Concentration vs. Safety Conflict",
    body: "Concentrated portfolios carry materially higher single-position and sector risk. Low-risk positioning and high concentration are difficult to reconcile — concentrated bets amplify both upside and drawdowns. Atlas will moderate position sizing.",
    resolution: "Atlas will cap single positions at 15–18% to preserve high-conviction character while limiting concentration risk.",
  },
  {
    id: "tax-active",
    a: /tax.effici|minimize.tax|low.tax|tax.optimal|defer.tax|tax.sensitive/i,
    b: /active.trad|high.turnover|frequent.trad|short.term.trad|trade.often|swing.trad/i,
    title: "Tax Efficiency vs. Active Trading Conflict",
    body: "Frequent trading generates short-term capital gains taxed at ordinary income rates. Tax efficiency requires holding periods that active trading explicitly avoids. These objectives are structurally incompatible at high turnover.",
    resolution: "Atlas will bias toward lower turnover and longer holds to qualify for long-term capital gains treatment.",
  },
  {
    id: "passive-alpha",
    a: /passive|index.fund|index.invest|s&p.500|market.return/i,
    b: /beat.market|outperform|alpha|above.market|excess.return|better.than.market/i,
    title: "Passive Index vs. Alpha Pursuit Conflict",
    body: "Passive index strategies are designed to match the market — not beat it. Pursuing alpha requires active selection, which is the structural opposite of a passive approach.",
    resolution: "Atlas will build a core-satellite strategy: index core for market exposure with selective active positions for alpha.",
  },
];

function detectContradiction(
  messages: { role: string; content: string; isInsight?: boolean }[],
  shownIds: Set<string>,
): ContradictionDef | null {
  // Only check after 2+ user messages to reduce false positives
  const userMessages = messages.filter(m => m.role === "user" && !m.isInsight);
  if (userMessages.length < 2) return null;
  const fullText = userMessages.map(m => m.content).join(" ");
  for (const pair of CONTRADICTION_PAIRS) {
    if (shownIds.has(pair.id)) continue;
    if (pair.a.test(fullText) && pair.b.test(fullText)) return pair;
  }
  return null;
}

// ── Helpers: Tier 3 ───────────────────────────────────────────────────────────

function buildSimpleSnapshot(s: GeneratedStrategy): Array<{ label: string; value: string }> {
  const objectiveByStyle: Record<string, string> = {
    Growth:              "Long-term capital appreciation via growth equities",
    Value:               "Capital appreciation through undervalued asset selection",
    "Dividend / Income": "Reliable income generation via dividend-paying equities",
    Defensive:           "Capital preservation with modest appreciation potential",
    Momentum:            "Systematic trend-following for outperformance",
    "Index / Passive":   "Broad market exposure with minimal active risk",
    Balanced:            "Balanced growth and income with moderate volatility",
    Blend:               "Combined growth and value across market cycles",
    Quality:             "Durable compounding through high-quality businesses",
    "Sector / Thematic": "Concentrated exposure to high-conviction thematic trends",
    Swing:               "Short-to-medium-term tactical price action capture",
    "Mean Reversion":    "Systematic capture of price deviations from mean",
    Speculative:         "High-risk, high-reward positions in emerging opportunities",
    Custom:              "Custom-tailored approach based on personal objectives",
  };
  const approachByRisk: Record<string, string> = {
    Conservative: "Low-concentration, diversified positions with downside focus",
    Moderate:     "Balanced conviction sizing with risk-adjusted positioning",
    Aggressive:   "High-conviction, concentrated positions for maximum upside",
  };
  const riskProfileByRisk: Record<string, string> = {
    Conservative: "Low — capital preservation prioritized over returns",
    Moderate:     "Medium — willing to accept periodic drawdowns",
    Aggressive:   "High — significant drawdown tolerance required",
  };
  const rebalancingByTurnover: Record<string, string> = {
    Low:      "Low turnover, buy-and-hold orientation",
    Moderate: "Periodic rebalancing, moderate activity",
    High:     "Active rebalancing, frequent position adjustments",
  };
  return [
    { label: "Objective",    value: objectiveByStyle[s.style]                    ?? "Custom investment objective" },
    { label: "Approach",     value: approachByRisk[s.risk_level]                 ?? "" },
    { label: "Risk Profile", value: riskProfileByRisk[s.risk_level]              ?? "" },
    { label: "Rebalancing",  value: rebalancingByTurnover[s.turnover_preference] ?? "" },
  ];
}

function buildProSnapshot(s: GeneratedStrategy): Array<{ label: string; value: string }> {
  const volatilityByRisk: Record<string, string> = {
    Conservative: "Low — ~8–14% annual range",
    Moderate:     "Medium — ~14–22% annual range",
    Aggressive:   "High — ~22–38% annual range",
  };
  const drawdownByRisk: Record<string, string> = {
    Conservative: "−10% to −25%",
    Moderate:     "−20% to −40%",
    Aggressive:   "−35% to −55%",
  };
  const driverByStyle: Record<string, string> = {
    Growth:              "Earnings growth + multiple expansion",
    Value:               "Mean reversion + margin improvement",
    "Dividend / Income": "Yield + dividend growth compounding",
    Defensive:           "Stable cash flows + relative outperformance",
    Momentum:            "Trend persistence + price continuation",
    "Index / Passive":   "Market beta + systematic rebalancing",
    Balanced:            "Diversified beta + income yield",
    Blend:               "Mixed value and growth factors",
    Quality:             "High ROIC + durable earnings quality",
    "Sector / Thematic": "Thematic tailwinds + sector concentration",
    Swing:               "Price action + technical momentum",
    "Mean Reversion":    "Statistical edge + fair value reversion",
    Speculative:         "Asymmetric upside + narrative momentum",
    Custom:              "Custom factor combination",
  };
  const frictionByTurnover: Record<string, string> = {
    Low:      "Low — infrequent tax events",
    Moderate: "Moderate — periodic capital gains",
    High:     "High — frequent realized gains",
  };
  const holdingByBias: Record<string, string> = {
    "Short-term":     "Weeks to months",
    Swing:            "Days to weeks",
    "Medium-term":    "3–12 months",
    "Long-term":      "3–7 years",
    "Very Long-term": "7–20+ years",
    Flexible:         "Varies by opportunity",
  };
  return [
    { label: "Exp. Volatility", value: volatilityByRisk[s.risk_level]           ?? "" },
    { label: "Max Drawdown",    value: drawdownByRisk[s.risk_level]              ?? "" },
    { label: "Return Driver",   value: driverByStyle[s.style]                    ?? "Custom factors" },
    { label: "Tax Friction",    value: frictionByTurnover[s.turnover_preference] ?? "" },
    { label: "Hold Period",     value: holdingByBias[s.holding_period_bias]      ?? "" },
  ];
}

function getConfidence(signalCount: number): {
  level: "Low" | "Moderate" | "High"; bars: number; color: string; reason: string;
} {
  if (signalCount <= 1) return { level: "Low",      bars: 1, color: "#f59e0b",      reason: "Limited preference data. Defaults applied."  };
  if (signalCount <= 3) return { level: "Moderate", bars: 2, color: FV.accentBright, reason: "Partial profile. Some assumptions were made." };
  return                       { level: "High",     bars: 3, color: "#00d395",      reason: "Full profile. Strategy is well-calibrated."   };
}

function getPsychologyBrief(s: GeneratedStrategy): { drawdown: string; challenge: string } {
  const drawdownByRisk: Record<string, string> = {
    Conservative: "Expect −10% to −25% drops during corrections. Volatility is lower, but inflation steadily erodes real returns — patience is still required.",
    Moderate:     "Expect −15% to −30% periodic drawdowns. Staying disciplined during extended sideways markets is the hardest part.",
    Aggressive:   "Expect −30% to −55% drops during corrections. Most investors panic-sell near the bottom — this strategy demands conviction to hold through the pain.",
  };
  const challengeByStyle: Record<string, string> = {
    Growth:              "Watching high-multiple growth names crash 50%+ during rate spikes or recessions.",
    Value:               "Holding undervalued names while momentum plays run further for months or years.",
    "Dividend / Income": "Watching peers compound faster during euphoric bull markets while income trickles in.",
    Defensive:           "Significant underperformance during risk-on rallies — this strategy is built for survival, not sprinting.",
    Momentum:            "Sharp reversals when momentum breaks — drawdowns are fast and severe with little warning.",
    "Index / Passive":   "Riding full market downturns with no defensive cushion. Simplicity has psychological costs.",
    Balanced:            "Neither the best nor worst in any environment — requires comfort with ‘good enough’ returns.",
    Blend:               "Mixed signals — some positions will look wrong at any point in the cycle.",
    Quality:             "Premium valuations compress hard during value rotations, making the thesis feel broken.",
    "Sector / Thematic": "Concentrated sector risk — one bad narrative shift or regulatory change can dominate returns.",
    Swing:               "Frequent stop-outs and false signals. Requires emotional detachment from individual trades.",
    "Mean Reversion":    "Catching falling knives — positions will look deeply wrong before they work.",
    Speculative:         "Watching speculative positions go to zero is common. Position sizing and exit discipline are everything.",
    Custom:              "Psychological challenges vary based on the specific holdings and market conditions encountered.",
  };
  return {
    drawdown:  drawdownByRisk[s.risk_level]  ?? "Expect periodic drawdowns that test your conviction.",
    challenge: challengeByStyle[s.style]     ?? "Market conditions will test conviction at various points.",
  };
}

// ── Helpers: Section 15 (Evolution) ──────────────────────────────────────────

function computeEvolution(original: GeneratedStrategy, current: GeneratedStrategy): string[] {
  const entries: string[] = [];
  const origDNA = computeDNA(original);
  const currDNA = computeDNA(current);

  if (original.risk_level !== current.risk_level) {
    const dir = RISK_LEVELS.indexOf(current.risk_level) > RISK_LEVELS.indexOf(original.risk_level) ? "raised" : "reduced";
    entries.push(`Risk level ${dir}: ${original.risk_level} → ${current.risk_level}`);
  }
  if (original.style !== current.style) {
    entries.push(`Style shifted: ${original.style} → ${current.style}`);
  }
  if (original.turnover_preference !== current.turnover_preference) {
    const taxDelta = currDNA.taxEfficiency - origDNA.taxEfficiency;
    entries.push(`Turnover ${current.turnover_preference.toLowerCase()} — tax efficiency ${taxDelta >= 0 ? "improved" : "reduced"} by ${Math.abs(taxDelta)} pts`);
  }
  if (original.holding_period_bias !== current.holding_period_bias) {
    entries.push(`Hold bias: ${original.holding_period_bias} → ${current.holding_period_bias}`);
  }
  const volDelta = currDNA.volatility - origDNA.volatility;
  if (Math.abs(volDelta) >= 5 && original.risk_level === current.risk_level) {
    entries.push(`Volatility exposure ${volDelta > 0 ? "increased" : "reduced"} (${volDelta > 0 ? "+" : ""}${volDelta})`);
  }
  const growthDelta = currDNA.growth - origDNA.growth;
  if (Math.abs(growthDelta) >= 5 && original.style === current.style) {
    entries.push(`Growth orientation ${growthDelta > 0 ? "strengthened" : "moderated"} (${growthDelta > 0 ? "+" : ""}${growthDelta})`);
  }
  return entries;
}

// ── Form style constants ───────────────────────────────────────────────────────

const inputClass =
  "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20";
const selectClass =
  "w-full rounded-xl border border-white/10 bg-[#040d1a] px-3 py-2.5 text-sm text-white outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20";
const labelClass =
  "mb-1.5 block text-xs font-medium uppercase tracking-widest text-slate-500";

// ── Sub-components ─────────────────────────────────────────────────────────────

function renderMessageContent(content: string) {
  return content.split("\n").map((line, i) => {
    const parts = line.split(/\*\*(.*?)\*\*/g);
    return (
      <p key={i} className={i > 0 ? "mt-1" : ""}>
        {parts.map((part, j) =>
          j % 2 === 1 ? <strong key={j} className="font-semibold text-white">{part}</strong> : part
        )}
      </p>
    );
  });
}

// Section 18: Atlas F-glyph mark
function FinnGlyph({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M4 3h8"   stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M4 8h5.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M4 3v10"  stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function StrategyDNAChart({ profile }: { profile: DNAProfile }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const entries = DNA_DIMENSIONS.map(d => ({ ...d, value: profile[d.key] }));
  const maxVal  = Math.max(...entries.map(e => e.value));
  return (
    <div
      className="rounded-xl border px-4 pt-3 pb-4"
      style={{ background: "var(--surface-002)", borderColor: FV.borderFaint, animation: "bt-scale-in 0.35s ease both" }}
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: FV.accent, animation: "finnPulse 2.5s ease-in-out infinite" }} />
        <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-500">Strategy DNA</p>
      </div>
      <div className="space-y-2.5">
        {entries.map(({ key, label, value }) => {
          const isMax = value === maxVal;
          return (
            <div key={key} className="flex items-center gap-3">
              <span className="w-16 shrink-0 text-[11px] text-slate-400">{label}</span>
              <div className="relative flex-1 h-[5px] rounded-full overflow-hidden" style={{ background: "var(--surface-008)" }}>
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: ready ? `${value}%` : "0%",
                    background: isMax ? `linear-gradient(90deg,${FV.accentDim},${FV.accentBright})` : "rgba(255,255,255,0.2)",
                    transition: "width 0.75s cubic-bezier(0.23,1,0.32,1)",
                  }}
                />
              </div>
              <span className="w-6 shrink-0 text-right text-[11px] text-slate-500 tabular-nums" style={{ fontFamily: "var(--font-mono)" }}>
                {value}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ContradictionCard({ title, body, resolution }: { title: string; body: string; resolution: string }) {
  return (
    <div
      className="ml-10 max-w-[85%] rounded-xl border px-4 py-3"
      style={{ background: "rgba(239,68,68,0.06)", borderColor: "rgba(239,68,68,0.22)", animation: "bt-fade-up 0.25s ease both" }}
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        <svg className="h-2.5 w-2.5 shrink-0" viewBox="0 0 10 10" fill="none">
          <path d="M5 1v4M5 7.5v.5" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        <span className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: "#ef4444" }}>Atlas — Objective Conflict</span>
      </div>
      <p className="text-[12px] font-semibold leading-snug text-slate-200">{title}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{body}</p>
      <p className="mt-1.5 text-[10px] leading-relaxed" style={{ color: "rgba(239,68,68,0.7)" }}>{resolution}</p>
    </div>
  );
}

function InsightCard({ title, body }: { title: string; body: string }) {
  return (
    <div
      className="ml-10 max-w-[85%] rounded-xl border px-4 py-3"
      style={{ background: FV.bg, borderColor: FV.border, animation: "bt-fade-up 0.25s ease both" }}
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        <svg className="h-2.5 w-2.5 shrink-0" viewBox="0 0 10 10" fill="currentColor" style={{ color: FV.accentBright }}>
          <path d="M5 0l.58 3.42L9 5l-3.42.58L5 10l-.58-3.42L1 5l3.42-.58L5 0z" />
        </svg>
        <span className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: FV.accentBright }}>Atlas Insight</span>
      </div>
      <p className="text-[12px] font-semibold leading-snug text-slate-200">{title}</p>
      <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">{body}</p>
    </div>
  );
}

function StrategySnapshotCard({ strategy, mode, onToggle }: {
  strategy: GeneratedStrategy; mode: "simple" | "pro"; onToggle: () => void;
}) {
  const rows = mode === "simple" ? buildSimpleSnapshot(strategy) : buildProSnapshot(strategy);
  return (
    <div
      className="rounded-xl border border-white/6 px-4 pt-3 pb-3.5"
      style={{ background: "var(--surface-002)", animation: "bt-fade-up 0.4s 0.1s ease both" }}
    >
      <div className="mb-2.5 flex items-center justify-between">
        <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-600">Strategy Snapshot</p>
        <div className="flex items-center gap-0.5 rounded-md p-0.5" style={{ background: "var(--surface-004)" }}>
          {(["simple", "pro"] as const).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => mode !== m && onToggle()}
              className="rounded px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest transition-colors"
              style={{
                background: mode === m ? "rgba(255,255,255,0.09)" : "transparent",
                color:      mode === m ? "#f0f4ff" : "#475569",
              }}
            >
              {m === "simple" ? "Simple" : "Pro"}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex gap-3 text-[12px] leading-relaxed">
            <span className="w-24 shrink-0 text-slate-500" style={{ fontFamily: "var(--font-mono)" }}>{label}</span>
            <span className="text-slate-300">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConfidenceMeter({ signalCount }: { signalCount: number }) {
  const conf = getConfidence(signalCount);
  return (
    <div
      className="flex items-center gap-3 rounded-xl border px-4 py-2.5"
      style={{ background: FV.bg, borderColor: FV.borderFaint, animation: "bt-fade-in 0.4s 0.2s ease both" }}
    >
      <div className="flex shrink-0 items-end gap-[3px]">
        {[1, 2, 3].map(i => (
          <div
            key={i}
            className="w-[4px] rounded-sm transition-colors duration-300"
            style={{
              height: i === 1 ? "7px" : i === 2 ? "11px" : "15px",
              background: i <= conf.bars ? conf.color : "rgba(255,255,255,0.1)",
            }}
          />
        ))}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-semibold uppercase tracking-widest text-slate-600">Atlas Confidence</span>
          <span className="text-[10px] font-semibold" style={{ color: conf.color }}>{conf.level}</span>
        </div>
        <p className="text-[11px] text-slate-500">{conf.reason}</p>
      </div>
    </div>
  );
}

function PsychologyBrief({ strategy }: { strategy: GeneratedStrategy }) {
  const [open, setOpen] = useState(false);
  const brief = getPsychologyBrief(strategy);
  return (
    <div
      className="overflow-hidden rounded-xl border border-white/6"
      style={{ background: "var(--surface-002)", animation: "bt-fade-up 0.4s 0.25s ease both" }}
    >
      <button
        type="button"
        onClick={() => setOpen(p => !p)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
        style={{ minHeight: "44px" }}
      >
        <div className="flex items-center gap-2">
          <svg className="h-3 w-3 shrink-0 text-slate-500" viewBox="0 0 12 12" fill="none">
            <path d="M6 1.5L1 10.5h10L6 1.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
            <path d="M6 5v2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            <circle cx="6" cy="8.75" r="0.6" fill="currentColor" />
          </svg>
          <span className="text-[9px] font-semibold uppercase tracking-widest text-slate-500">Psychology Brief</span>
        </div>
        <svg
          className="h-3.5 w-3.5 text-slate-600"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s ease" }}
          viewBox="0 0 16 16" fill="none"
        >
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="border-t border-white/6 px-4 pb-4 pt-3 space-y-3">
          <div>
            <p className="mb-1 text-[9px] font-semibold uppercase tracking-widest text-slate-600">Drawdown Reality</p>
            <p className="text-[12px] leading-relaxed text-slate-300">{brief.drawdown}</p>
          </div>
          <div>
            <p className="mb-1 text-[9px] font-semibold uppercase tracking-widest text-slate-600">Psychological Challenge</p>
            <p className="text-[12px] leading-relaxed text-slate-300">{brief.challenge}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// Section 13: Scenario Sandbox
function ScenarioSandbox({ strategy }: { strategy: GeneratedStrategy }) {
  const [active, setActive] = useState<string | null>(null);
  const baseDNA     = useMemo(() => computeDNA(strategy), [strategy]);
  const scenarioDNA = useMemo(
    () => active ? computeDNA({ ...strategy, risk_level: active }) : null,
    [strategy, active],
  );
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!scenarioDNA) { setReady(false); return; }
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, [scenarioDNA]);

  return (
    <div
      className="rounded-xl border px-4 pt-3 pb-3.5"
      style={{ background: "var(--surface-002)", borderColor: "var(--line-006)", animation: "bt-fade-in 0.35s ease both" }}
    >
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-semibold uppercase tracking-widest text-slate-600">Scenario Sandbox</span>
          {active && (
            <button
              type="button"
              onClick={() => setActive(null)}
              className="text-[9px] text-slate-500 underline-offset-2 transition hover:text-slate-300"
            >
              Clear
            </button>
          )}
        </div>
        <span className="text-[9px] text-slate-700">Explore risk pivots without changing your strategy</span>
      </div>
      <div className="flex gap-1.5">
        {RISK_LEVELS.map(r => {
          const isActive  = active === r;
          const isCurrent = strategy.risk_level === r && !active;
          return (
            <button
              key={r}
              type="button"
              onClick={() => setActive(prev => prev === r ? null : r)}
              className="flex-1 rounded-lg px-2 py-1.5 text-[11px] font-medium transition-all"
              style={{
                background: isActive ? FV.bgMed      : "rgba(255,255,255,0.04)",
                border:     `1px solid ${isActive ? FV.border : isCurrent ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)"}`,
                color:      isActive ? FV.accentBright : isCurrent ? "#e2e8f0" : "#64748b",
                fontFamily: "var(--font-mono)",
              }}
            >
              {r}
              {isCurrent && <span className="ml-1 text-[8px] text-slate-600"> current</span>}
            </button>
          );
        })}
      </div>

      {scenarioDNA && (
        <div className="mt-3 space-y-2 border-t border-white/5 pt-3">
          <p className="mb-2 text-[9px] font-semibold uppercase tracking-widest" style={{ color: FV.accentBright }}>
            DNA under {active} scenario
          </p>
          {DNA_DIMENSIONS.map(d => {
            const base     = baseDNA[d.key];
            const scenario = scenarioDNA[d.key];
            const delta    = scenario - base;
            return (
              <div key={d.key} className="flex items-center gap-3">
                <span className="w-16 shrink-0 text-[11px] text-slate-400">{d.label}</span>
                <div className="relative flex-1 h-[4px] rounded-full overflow-hidden" style={{ background: "var(--surface-006)" }}>
                  <div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{
                      width: ready ? `${scenario}%` : `${base}%`,
                      background: delta > 0 ? "#f59e0b" : delta < 0 ? "#00d395" : "rgba(255,255,255,0.2)",
                      transition: "width 0.6s cubic-bezier(0.23,1,0.32,1)",
                    }}
                  />
                </div>
                <span
                  className="w-8 shrink-0 text-right text-[10px] tabular-nums"
                  style={{ fontFamily: "var(--font-mono)", color: delta > 0 ? "#f59e0b" : delta < 0 ? "#00d395" : "#475569" }}
                >
                  {delta > 0 ? `+${delta}` : delta === 0 ? "—" : delta}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Section 17: Stress Simulator
function StressSimulator({ strategy }: { strategy: GeneratedStrategy }) {
  const riskKey = (["Conservative", "Moderate", "Aggressive"].includes(strategy.risk_level)
    ? strategy.risk_level
    : "Moderate") as "Conservative" | "Moderate" | "Aggressive";
  const resilienceColor = (r: string) =>
    r === "High" ? "#00d395" : r === "Medium" ? "#f59e0b" : "#ef4444";

  return (
    <div
      className="rounded-xl border border-white/6 px-4 pt-3 pb-3.5"
      style={{ background: "var(--surface-002)", animation: "bt-fade-up 0.4s 0.3s ease both" }}
    >
      <div className="mb-2.5 flex items-center gap-2">
        <span className="text-[9px] font-semibold uppercase tracking-widest text-slate-600">Stress Scenarios</span>
        <span className="text-[9px] text-slate-700">estimated impact at {riskKey.toLowerCase()} risk</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {STRESS_SCENARIOS_META.map(s => {
          const data = STRESS_TABLE[s.id][riskKey];
          return (
            <div
              key={s.id}
              className="rounded-xl border border-white/6 px-3 py-2.5"
              style={{ background: "var(--surface-002)" }}
            >
              <p className="mb-2 text-[10px] font-semibold text-slate-400">{s.label}</p>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-slate-600">Drawdown</span>
                  <span className="text-[10px] font-medium text-red-400 tabular-nums" style={{ fontFamily: "var(--font-mono)" }}>{data.drawdown}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-slate-600">Recovery</span>
                  <span className="text-[10px] text-slate-400 tabular-nums" style={{ fontFamily: "var(--font-mono)" }}>{data.recovery}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-slate-600">Resilience</span>
                  <span className="text-[10px] font-semibold" style={{ color: resilienceColor(data.resilience) }}>{data.resilience}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Section 15: Evolution log (conditional on form divergence)
function FinnEvolutionLog({ original, current }: { original: GeneratedStrategy; current: GeneratedStrategy }) {
  const entries = useMemo(() => computeEvolution(original, current), [original, current]);
  if (entries.length === 0) return null;
  return (
    <div
      className="rounded-xl border px-4 pt-3 pb-3.5"
      style={{ background: FV.bg, borderColor: FV.borderFaint, animation: "bt-fade-in 0.3s ease both" }}
    >
      <div className="mb-2.5 flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: FV.accentBright, animation: "finnPulse 2.5s ease-in-out infinite" }} />
        <span className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: FV.accentBright }}>Atlas Adjustments</span>
      </div>
      <div className="relative pl-3.5">
        <div className="absolute inset-y-0 left-0 w-px" style={{ background: FV.border }} />
        <div className="space-y-2">
          {entries.map((e, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: FV.accent, marginLeft: "-4px" }} />
              <p className="text-[11px] leading-relaxed text-slate-300">{e}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function StrategyQuestionnaire({
  onClose,
  onSaved,
  variant = "modal",
}: {
  onClose: () => void;
  onSaved?: (strategyName: string, strategyId?: string) => void;
  variant?: "modal" | "inline";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hi, I'm **Atlas** — your AI strategy advisor. I'll ask you a few questions about your goals, then build a complete investing strategy tailored to your answers.\n\nLet's start: **What's your main investing goal?** Are you focused on growing your wealth aggressively, building steady income, protecting capital, or something in between?",
    },
  ]);
  const [input, setInput]                         = useState("");
  const [isLoading, setIsLoading]                 = useState(false);
  const [isGenerating, setIsGenerating]           = useState(false);
  const [generatedStrategy, setGeneratedStrategy] = useState<GeneratedStrategy | null>(null);
  const [editedStrategy, setEditedStrategy]       = useState<GeneratedStrategy | null>(null);
  const [saveError, setSaveError]                 = useState("");
  const [animatingIdx, setAnimatingIdx]           = useState<number | null>(null);
  const [animatedText, setAnimatedText]           = useState("");

  const [chatThinkingIdx, setChatThinkingIdx] = useState(0);
  const [genThinkingIdx,  setGenThinkingIdx]  = useState(0);
  const [isBrandedName, setIsBrandedName]     = useState(false);
  const [pendingInsight, setPendingInsight]   = useState<{ id: string; title: string; body: string } | null>(null);
  const [pendingContradiction, setPendingContradiction] = useState<ContradictionDef | null>(null);
  const shownInsightIdsRef                    = useRef(new Set<string>());
  const [explainMode, setExplainMode]         = useState<"simple" | "pro">("simple");

  const messagesEndRef       = useRef<HTMLDivElement>(null);
  const inputRef             = useRef<HTMLInputElement>(null);
  const prevMsgCountRef      = useRef(1);
  const animationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatThinkingRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const genThinkingRef       = useRef<ReturnType<typeof setInterval> | null>(null);

  const detectedSignalsMap = useMemo(() => detectSignals(messages), [messages]);
  const hasAnySignal       = detectedSignalsMap.size > 0;
  const dnaProfile         = useMemo(
    () => (generatedStrategy ? computeDNA(generatedStrategy) : null),
    [generatedStrategy],
  );
  const isBusy = isLoading || isGenerating;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, isGenerating, animatedText]);

  useEffect(() => {
    const prev = prevMsgCountRef.current;
    prevMsgCountRef.current = messages.length;
    if (messages.length <= prev) return;
    const newIdx    = messages.length - 1;
    const newestMsg = messages[newIdx];
    if (newestMsg.role !== "assistant" || newestMsg.isInsight) return;
    const fullText  = newestMsg.content;
    const msPerChar = Math.max(8, Math.min(22, 2200 / fullText.length));
    if (animationIntervalRef.current) clearInterval(animationIntervalRef.current);
    setAnimatingIdx(newIdx);
    setAnimatedText("");
    let charIdx = 0;
    animationIntervalRef.current = setInterval(() => {
      charIdx += 1;
      setAnimatedText(fullText.slice(0, charIdx));
      if (charIdx >= fullText.length) {
        clearInterval(animationIntervalRef.current!);
        animationIntervalRef.current = null;
        setAnimatingIdx(null);
      }
    }, msPerChar);
    return () => { if (animationIntervalRef.current) clearInterval(animationIntervalRef.current); };
  }, [messages]);

  useEffect(() => {
    if (isLoading) {
      setChatThinkingIdx(0);
      chatThinkingRef.current = setInterval(() => setChatThinkingIdx(p => (p + 1) % CHAT_THINKING.length), 1600);
    } else {
      if (chatThinkingRef.current) { clearInterval(chatThinkingRef.current); chatThinkingRef.current = null; }
    }
    return () => { if (chatThinkingRef.current) clearInterval(chatThinkingRef.current); };
  }, [isLoading]);

  useEffect(() => {
    if (isGenerating) {
      setGenThinkingIdx(0);
      genThinkingRef.current = setInterval(() => setGenThinkingIdx(p => Math.min(p + 1, GEN_THINKING.length - 1)), 1800);
    } else {
      if (genThinkingRef.current) { clearInterval(genThinkingRef.current); genThinkingRef.current = null; }
    }
    return () => { if (genThinkingRef.current) clearInterval(genThinkingRef.current); };
  }, [isGenerating]);

  useEffect(() => {
    if (!pendingInsight || animatingIdx !== null) return;
    const timer = setTimeout(() => {
      setMessages(prev => [
        ...prev,
        { role: "assistant" as const, content: pendingInsight.body, isInsight: true, insightTitle: pendingInsight.title },
      ]);
      setPendingInsight(null);
    }, 420);
    return () => clearTimeout(timer);
  }, [pendingInsight, animatingIdx]);

  useEffect(() => {
    if (!pendingContradiction || animatingIdx !== null) return;
    const timer = setTimeout(() => {
      setMessages(prev => [
        ...prev,
        {
          role: "assistant" as const,
          content: pendingContradiction.body,
          isInsight: true,
          insightTitle: `⚡ ${pendingContradiction.title}`,
        },
      ]);
      setPendingContradiction(null);
    }, 600);
    return () => clearTimeout(timer);
  }, [pendingContradiction, animatingIdx]);

  async function generateStrategy(conversationMessages: Message[]) {
    setIsGenerating(true);
    try {
      const response = await fetch("/api/strategies/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: conversationMessages.filter(m => !m.isInsight).map(m => ({ role: m.role, content: m.content })),
          phase: "generate",
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Generation failed");
      const raw     = (data.text ?? "").trim();
      const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
      const js = cleaned.indexOf("{"), je = cleaned.lastIndexOf("}");
      if (js < 0 || je <= js) throw new Error("Could not parse strategy JSON");
      const parsed = JSON.parse(cleaned.slice(js, je + 1)) as GeneratedStrategy;
      const { name: brandedName, isBranded } = brandifyName(parsed);
      setGeneratedStrategy(parsed);
      setEditedStrategy({ ...parsed, name: brandedName });
      setIsBrandedName(isBranded);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setMessages(prev => [
        ...prev,
        { role: "assistant", content: `Something went wrong while building your strategy: ${msg}. Please try sending your last message again.` },
      ]);
    } finally {
      setIsGenerating(false);
    }
  }

  async function sendMessage() {
    if (!input.trim() || isLoading || isGenerating) return;
    const userMessage       = input.trim();
    setInput("");
    const updatedMessages: Message[] = [...messages, { role: "user", content: userMessage }];
    setMessages(updatedMessages);

    // Contradiction detection — fires before AI responds
    const contradiction = detectContradiction(updatedMessages, shownInsightIdsRef.current);
    if (contradiction) {
      shownInsightIdsRef.current.add(contradiction.id);
      setPendingContradiction(contradiction);
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/strategies/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updatedMessages.filter(m => !m.isInsight).map(m => ({ role: m.role, content: m.content })),
          phase: "chat",
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Request failed");
      const text = data.text ?? "";

      if (text.includes("READY_TO_GENERATE")) {
        const summaryText = text.split("READY_TO_GENERATE")[0].trim();
        const withSummary: Message[] = summaryText
          ? [...updatedMessages, { role: "assistant", content: summaryText }]
          : updatedMessages;
        const js = text.indexOf("{"), je = text.lastIndexOf("}");
        if (js >= 0 && je > js) {
          try {
            const parsed = JSON.parse(text.slice(js, je + 1)) as GeneratedStrategy;
            const { name: brandedName, isBranded } = brandifyName(parsed);
            setMessages(withSummary);
            setGeneratedStrategy(parsed);
            setEditedStrategy({ ...parsed, name: brandedName });
            setIsBrandedName(isBranded);
            return;
          } catch { /* fall through */ }
        }
        setMessages(withSummary);
        setIsLoading(false);
        await generateStrategy(withSummary);
        return;
      } else {
        setMessages(prev => [...prev, { role: "assistant", content: text }]);
        const userMsgCount = updatedMessages.filter(m => m.role === "user" && !m.isInsight).length;
        const insight = detectInsight(text, shownInsightIdsRef.current, userMsgCount);
        if (insight) {
          shownInsightIdsRef.current.add(insight.id);
          setPendingInsight(insight);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setMessages(prev => [
        ...prev,
        { role: "assistant", content: `Sorry, something went wrong: ${msg}. Please try again in a moment.` },
      ]);
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }

  function detectArchetype(s: GeneratedStrategy): string {
    const style = s.style ?? "";
    const holding = s.holding_period_bias ?? "";
    if (style.includes("Dividend") || style.includes("Income")) return "Dividend Investor";
    if (style === "Value") return "Value Investor";
    if (style === "Quality") return "Quality Investor";
    if (style.includes("Index") || style.includes("Passive")) return "Index Investor";
    if (style.includes("Sector") || style.includes("Thematic")) return "Thematic Investor";
    if (style === "Momentum") return "Momentum Investor";
    if (style === "Mean Reversion") return "Contrarian Investor";
    if (style === "Speculative") return "Speculative Trader";
    if (style === "Defensive") return "Defensive Investor";
    if (style === "Swing" || holding === "Swing" || holding === "Short-term") return "Swing Trader";
    if (style === "Growth" && (holding === "Long-term" || holding === "Very Long-term")) return "Growth Compounder";
    if (style === "Growth") return "Growth Investor";
    if (style === "Balanced" || style === "Blend") return "Balanced Investor";
    return "Independent Investor";
  }

  function detectTraits(s: GeneratedStrategy): string[] {
    const traits: string[] = [];
    const holding = s.holding_period_bias ?? "";
    const turnover = s.turnover_preference ?? "";
    const risk = s.risk_level ?? "";
    const style = s.style ?? "";
    const maxPos = s.max_position_pct;
    const cashMin = s.cash_min_pct;
    if (holding === "Long-term" || holding === "Very Long-term") traits.push("Long-term thinker");
    if (turnover === "Low") traits.push("Tax-conscious");
    if (turnover === "High") traits.push("Active trader");
    if (style.includes("Dividend") || style.includes("Income")) traits.push("Income-focused");
    if (risk === "Aggressive") traits.push("High conviction");
    if (risk === "Conservative") traits.push("Capital protector");
    if (maxPos != null && maxPos >= 20) traits.push("Concentrated positions");
    if (maxPos != null && maxPos <= 8) traits.push("Diversified approach");
    if (cashMin != null && cashMin >= 10) traits.push("Cash-strategic");
    if (style.includes("Sector") || style.includes("Thematic")) traits.push("Thematic focus");
    if (holding === "Short-term" || holding === "Swing") traits.push("Tactical mindset");
    return traits.slice(0, 5);
  }

  function handleSaveStrategy() {
    if (!editedStrategy) return;
    setSaveError("");
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("name",                editedStrategy.name);
        fd.set("style",               editedStrategy.style);
        fd.set("risk_level",          editedStrategy.risk_level);
        fd.set("turnover_preference", editedStrategy.turnover_preference);
        fd.set("holding_period_bias", editedStrategy.holding_period_bias);
        fd.set("max_position_pct",    editedStrategy.max_position_pct?.toString() ?? "");
        fd.set("min_position_pct",    editedStrategy.min_position_pct?.toString() ?? "");
        fd.set("cash_min_pct",        editedStrategy.cash_min_pct?.toString() ?? "");
        fd.set("cash_max_pct",        editedStrategy.cash_max_pct?.toString() ?? "");
        fd.set("description",         editedStrategy.description);
        fd.set("prompt_text",         editedStrategy.prompt_text);
        const created = await createStrategy(fd);
        // Silently persist Atlas profile — don't block or surface save errors
        const arch = detectArchetype(editedStrategy);
        const traits = detectTraits(editedStrategy);
        saveFinnProfile(arch, traits).catch(() => {});
        if (onSaved && editedStrategy) onSaved(editedStrategy.name, created?.id);
        else { router.refresh(); onClose(); }
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : "Failed to save strategy.");
      }
    });
  }

  const inner = (
    <div
      className={
        variant === "inline"
          ? "w-full max-h-[560px] flex flex-col rounded-2xl border border-white/10 bg-[#07090f]"
          : "w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-white/10 bg-[#040d1a] shadow-2xl"
      }
      style={{
        boxShadow: isBusy
          ? `0 0 0 1px ${FV.glowRing}, 0 0 48px ${FV.glowOuter}, 0 25px 50px rgba(0,0,0,0.5)`
          : variant === "inline" ? undefined : "0 25px 50px rgba(0,0,0,0.5)",
        transition: "box-shadow 0.6s ease",
      }}
    >
      {/* Header — Section 18: Atlas visual identity */}
      <div
        className="flex items-center justify-between border-b px-6 py-4"
        style={{
          borderColor: "var(--line-008)",
          background: "radial-gradient(ellipse 70% 140% at 50% 0%, rgba(109,40,217,0.07), transparent)",
        }}
      >
        <div>
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ background: FV.bgMed, border: `1px solid ${FV.border}` }}
            >
              <span style={{ color: FV.accentBright }}><FinnGlyph size={15} /></span>
            </div>
            <div className="flex items-center gap-1.5">
              <h2
                className="text-sm font-bold text-white"
                style={{ letterSpacing: "0.14em" }}
              >
                Atlas
              </h2>
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  background: isBusy ? FV.accentBright : "#334155",
                  animation: isBusy ? "finnPulse 1.4s ease-in-out infinite" : "none",
                  transition: "background 0.4s ease",
                }}
              />
            </div>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">Strategy Intelligence</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-white/10 bg-white/4 p-2 text-slate-400 transition hover:text-white"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      </div>

      {/* Tier 1: Construction strip */}
      {hasAnySignal && !generatedStrategy && (
        <div className="border-b border-white/6 px-5 py-2.5" style={{ animation: "bt-fade-in 0.4s ease both" }}>
          <div className="mb-1.5 flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: FV.accent, animation: "finnPulse 2s ease-in-out infinite" }} />
            <span className="text-[9px] font-semibold uppercase tracking-widest text-slate-600">Strategy Build</span>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1.5">
            {SIGNALS_META.map(sig => {
              const val      = detectedSignalsMap.get(sig.id);
              const detected = val !== undefined;
              return (
                <div key={sig.id} className="flex items-center gap-1" style={{ opacity: detected ? 1 : 0.18, transition: "opacity 0.3s ease-out" }}>
                  {detected ? (
                    <svg className="h-2.5 w-2.5 shrink-0" viewBox="0 0 10 10" fill="none">
                      <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="#00d395" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <div className="h-2 w-2 shrink-0 rounded-full border border-slate-700" />
                  )}
                  <span className="text-[11px] text-slate-400">
                    {sig.label}
                    {val && <span className="ml-1 text-[10px] text-slate-300" style={{ fontFamily: "var(--font-mono)" }}>— {val}</span>}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Messages */}
      <div
        className={generatedStrategy ? "overflow-y-auto px-6 py-3 space-y-3 border-b border-white/8" : "flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-0"}
        style={generatedStrategy ? { maxHeight: "120px" } : undefined}
      >
        {messages.map((msg, i) => {
          if (msg.isInsight) {
            const isContradiction = msg.insightTitle?.startsWith("⚡");
            if (isContradiction) {
              const title = msg.insightTitle!.replace("⚡ ", "");
              const contradiction = CONTRADICTION_PAIRS.find(p => p.title === title);
              return (
                <div key={i}>
                  <ContradictionCard
                    title={title}
                    body={msg.content}
                    resolution={contradiction?.resolution ?? "Atlas will resolve the tension by prioritizing your primary objective."}
                  />
                </div>
              );
            }
            return <div key={i}><InsightCard title={msg.insightTitle!} body={msg.content} /></div>;
          }
          return (
            <div key={i} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
              {/* Section 18: Atlas glyph in every avatar position */}
              <div
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                style={
                  msg.role === "assistant"
                    ? { background: FV.bgMed, border: `1px solid ${FV.borderFaint}`, color: FV.accentBright }
                    : { background: "var(--surface-008)", color: "#cbd5e1" }
                }
              >
                {msg.role === "assistant" ? <FinnGlyph size={13} /> : "You"}
              </div>
              {/* Section 18: violet-tinted Atlas bubble */}
              <div
                className="max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-6"
                style={
                  msg.role === "assistant"
                    ? { background: FV.bg, border: `1px solid ${FV.borderFaint}`, color: "#cbd5e1" }
                    : { background: "rgba(37,99,235,0.25)", border: "1px solid rgba(37,99,235,0.25)", color: "#fff" }
                }
              >
                {animatingIdx === i ? (
                  <p>
                    {animatedText}
                    <span className="inline-block w-0.5 h-3.5 ml-px align-middle animate-pulse" style={{ background: FV.accentBright }} />
                  </p>
                ) : renderMessageContent(msg.content)}
              </div>
            </div>
          );
        })}

        {/* Tier 1: Chat thinking */}
        {isLoading && (
          <div className="flex gap-3">
            <div
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
              style={{ background: FV.bgMed, border: `1px solid ${FV.borderFaint}`, color: FV.accentBright }}
            >
              <FinnGlyph size={13} />
            </div>
            <div
              className="flex min-w-0 items-center gap-2.5 rounded-2xl px-4 py-3"
              style={{ background: FV.bg, border: `1px solid ${FV.borderFaint}` }}
            >
              <span className="flex shrink-0 items-end gap-0.5" style={{ height: "12px" }}>
                {[0, 1, 2].map(i => (
                  <span
                    key={i}
                    className="w-[3px] rounded-full"
                    style={{ height: "10px", background: FV.accentBright, opacity: 0.6, animation: `finnPulse 1.2s ease-in-out ${i * 200}ms infinite` }}
                  />
                ))}
              </span>
              <span
                key={chatThinkingIdx}
                className="truncate text-[13px]"
                style={{ fontFamily: "var(--font-mono)", color: FV.accentBright, opacity: 0.9, animation: "finnFadeIn 0.3s ease-out both" }}
              >
                {CHAT_THINKING[chatThinkingIdx]}
              </span>
            </div>
          </div>
        )}

        {/* Tier 1: Generation thinking */}
        {isGenerating && (
          <div className="flex gap-3">
            <div
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
              style={{ background: FV.bgMed, border: `1px solid ${FV.borderFaint}`, color: FV.accentBright }}
            >
              <FinnGlyph size={13} />
            </div>
            <div
              className="flex items-center gap-3 rounded-2xl px-4 py-3"
              style={{ background: FV.bg, border: `1px solid ${FV.border}` }}
            >
              <svg className="h-3.5 w-3.5 shrink-0 animate-spin" style={{ color: FV.accentBright }} viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.2" />
                <path d="M8 2a6 6 0 016 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <span
                key={genThinkingIdx}
                className="text-[13px]"
                style={{ fontFamily: "var(--font-mono)", color: FV.accentBright, animation: "finnFadeIn 0.35s ease-out both" }}
              >
                {GEN_THINKING[genThinkingIdx]}
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Strategy Review */}
      {generatedStrategy && editedStrategy && (
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {/* Tier 1: DNA chart */}
          {dnaProfile && <StrategyDNAChart profile={dnaProfile} />}

          {/* Section 13: Scenario Sandbox */}
          <ScenarioSandbox strategy={generatedStrategy} />

          {/* Tier 3: Snapshot with Simple/Pro toggle */}
          <StrategySnapshotCard
            strategy={generatedStrategy}
            mode={explainMode}
            onToggle={() => setExplainMode(p => p === "simple" ? "pro" : "simple")}
          />

          {/* Tier 3: Confidence meter */}
          <ConfidenceMeter signalCount={detectedSignalsMap.size} />

          {/* Tier 3: Psychology brief */}
          <PsychologyBrief strategy={generatedStrategy} />

          {/* Section 17: Stress simulator */}
          <StressSimulator strategy={generatedStrategy} />

          {/* Section 15: Evolution log — only when form diverges from generated */}
          <FinnEvolutionLog original={generatedStrategy} current={editedStrategy} />

          <p className="text-xs font-semibold uppercase tracking-widest pt-1" style={{ color: FV.accentBright }}>
            Review &amp; Edit Strategy
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="mb-1.5 flex items-center gap-1.5">
                <span className="text-xs font-medium uppercase tracking-widest text-slate-500">Name</span>
                {isBrandedName && (
                  <span
                    className="rounded px-1 py-px text-[8px] font-semibold uppercase tracking-widest"
                    style={{ background: FV.bgMed, color: FV.accentBright, animation: "bt-fade-in 0.4s ease both" }}
                  >
                    Atlas
                  </span>
                )}
              </div>
              <input
                type="text"
                value={editedStrategy.name}
                onChange={e => setEditedStrategy(p => p ? { ...p, name: e.target.value } : p)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Style</label>
              <select value={editedStrategy.style} onChange={e => setEditedStrategy(p => p ? { ...p, style: e.target.value } : p)} className={selectClass}>
                {STRATEGY_STYLES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Risk Level</label>
              <select value={editedStrategy.risk_level} onChange={e => setEditedStrategy(p => p ? { ...p, risk_level: e.target.value } : p)} className={selectClass}>
                {RISK_LEVELS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Turnover</label>
              <select value={editedStrategy.turnover_preference} onChange={e => setEditedStrategy(p => p ? { ...p, turnover_preference: e.target.value } : p)} className={selectClass}>
                {TURNOVER_PREFERENCES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Holding Bias</label>
              <select value={editedStrategy.holding_period_bias} onChange={e => setEditedStrategy(p => p ? { ...p, holding_period_bias: e.target.value } : p)} className={selectClass}>
                {HOLDING_PERIOD_BIASES.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelClass}>Max Pos %</label>
                <input type="number" value={editedStrategy.max_position_pct ?? ""} onChange={e => setEditedStrategy(p => p ? { ...p, max_position_pct: e.target.value ? Number(e.target.value) : null } : p)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Min Pos %</label>
                <input type="number" value={editedStrategy.min_position_pct ?? ""} onChange={e => setEditedStrategy(p => p ? { ...p, min_position_pct: e.target.value ? Number(e.target.value) : null } : p)} className={inputClass} />
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Description</label>
              <textarea value={editedStrategy.description} onChange={e => setEditedStrategy(p => p ? { ...p, description: e.target.value } : p)} spellCheck className={`${inputClass} min-h-16`} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>AI Prompt</label>
              <textarea value={editedStrategy.prompt_text} onChange={e => setEditedStrategy(p => p ? { ...p, prompt_text: e.target.value } : p)} spellCheck className={`${inputClass} min-h-20`} />
            </div>
          </div>

          {saveError && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">{saveError}</div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleSaveStrategy}
              disabled={isPending}
              className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: `linear-gradient(135deg,${FV.accentDim},${FV.accent})` }}
            >
              {isPending ? "Saving..." : "Save Strategy"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/10 bg-white/4 px-5 py-2.5 text-sm text-slate-400 transition hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      {!generatedStrategy && (
        <div className="border-t border-white/8 px-6 py-4">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder={isGenerating ? "Building your strategy..." : "Type your answer..."}
              disabled={isBusy}
              className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-600 outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={sendMessage}
              disabled={isBusy || !input.trim()}
              className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
              style={{ background: `linear-gradient(135deg,${FV.accentDim},${FV.accent})` }}
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" />
              </svg>
            </button>
          </div>
          <p className="mt-2 text-[10px] text-slate-600">Press Enter to send · Powered by Atlas</p>
        </div>
      )}
    </div>
  );

  if (variant === "inline") return inner;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      {inner}
    </div>
  );
}
