"use client";

import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from "recharts";
import AddToPlanButton from "@/app/planning/add-to-plan-button";
import AtlasThinking from "@/app/planning/atlas-thinking";
import type { CareerScenario } from "./career-actions";
import { saveCareerScenario, deleteCareerScenario, addCareerChangeToForecast } from "./career-actions";
import type { FinancialProfile } from "@/app/planning/planning-actions";
import type { CareerFinnRequest } from "@/app/api/planning/career-finn/route";

// ── Math engines ──────────────────────────────────────────────────────────────

type CareerYearPoint = {
  year: number;
  currentIncome: number;
  newIncome: number;
  inGap: boolean;
  cumulativeCurrent: number;
  cumulativeNew: number;
  cumulativeDelta: number;
};

function buildCareerTimeline(
  currentMonthly: number,
  currentGrowthRate: number,
  newMonthly: number,
  newGrowthRate: number,
  gapMonths: number,
  transitionCost: number,
  projectionYears: number,
): CareerYearPoint[] {
  const gapYears = gapMonths / 12;
  let cumulativeCurrent = 0;
  let cumulativeNew = -transitionCost;
  const points: CareerYearPoint[] = [];

  for (let y = 0; y <= projectionYears; y++) {
    const currentIncome = currentMonthly * 12 * Math.pow(1 + currentGrowthRate, y);
    const inGap = gapMonths > 0 && y < gapYears;
    let newIncome: number;
    if (y < gapYears) {
      newIncome = 0;
    } else {
      const yearsInNew = y - gapYears;
      newIncome = newMonthly * 12 * Math.pow(1 + newGrowthRate, yearsInNew);
    }
    if (y > 0) {
      cumulativeCurrent += currentIncome;
      cumulativeNew += newIncome;
    }
    points.push({
      year: y,
      currentIncome: Math.round(currentIncome),
      newIncome: Math.round(newIncome),
      inGap,
      cumulativeCurrent: Math.round(cumulativeCurrent),
      cumulativeNew: Math.round(cumulativeNew),
      cumulativeDelta: Math.round(cumulativeNew - cumulativeCurrent),
    });
  }
  return points;
}

const RETIRE_TIERS = [1.5, 1.2, 1.0, 0.8, 0.6, 0.4, 0.2] as const;
const RETIRE_PROBS = [95, 88, 82, 70, 55, 38, 20] as const;

function calcRetirementProb(nw: number, annualExpenses: number): number | null {
  if (annualExpenses <= 0 || nw <= 0) return null;
  const ratio = nw / (annualExpenses * 25);
  for (let i = 0; i < RETIRE_TIERS.length; i++) {
    if (ratio >= RETIRE_TIERS[i]) return RETIRE_PROBS[i];
  }
  return 8;
}

function buildScenarioMetrics(
  inputs: {
    current_monthly_income: number;
    current_growth_rate: number;
    new_monthly_income: number;
    new_growth_rate: number;
    gap_months: number;
    transition_cost: number;
    projection_years: number;
  },
  newGrowthAdj: number,
  gapFactor: number,
  costFactor: number,
) {
  const tl = buildCareerTimeline(
    inputs.current_monthly_income,
    inputs.current_growth_rate / 100,
    inputs.new_monthly_income,
    Math.max(0.005, (inputs.new_growth_rate + newGrowthAdj) / 100),
    Math.round(inputs.gap_months * gapFactor),
    inputs.transition_cost * costFactor,
    inputs.projection_years,
  );
  const be = tl.find((p) => p.year > 0 && p.cumulativeNew >= p.cumulativeCurrent)?.year ?? null;
  const last = tl[tl.length - 1];
  return { breakEvenYear: be, lifetimeDelta: last.cumulativeNew - last.cumulativeCurrent };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) => "$" + Math.round(Math.abs(n)).toLocaleString("en-US");
const fmtK = (n: number) => {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return sign + "$" + (abs / 1_000_000).toFixed(1) + "M";
  if (abs >= 1_000) return sign + "$" + (abs / 1000).toFixed(0) + "K";
  return sign + "$" + Math.round(abs);
};
const pct = (n: number) => n.toFixed(1) + "%";

function scoreColor(s: number): string {
  if (s >= 90) return "var(--green)";
  if (s >= 75) return "oklch(0.72 0.18 145)";
  if (s >= 60) return "oklch(0.78 0.17 70)";
  return "var(--red)";
}
function scoreLabel(s: number): string {
  if (s >= 90) return "Excellent";
  if (s >= 75) return "Strong";
  if (s >= 60) return "Moderate";
  return "High Risk";
}

// ── Lifestyle factors ─────────────────────────────────────────────────────────

const LIFESTYLE_FACTORS = [
  { key: "workLifeBalance" as const, label: "Work-Life Balance" },
  { key: "stressReduction" as const, label: "Stress Reduction" },
  { key: "careerSatisfaction" as const, label: "Career Satisfaction" },
  { key: "remoteFlexibility" as const, label: "Remote Flexibility" },
  { key: "travelFlexibility" as const, label: "Travel Flexibility" },
  { key: "advancement" as const, label: "Advancement Opportunity" },
];
type LifestyleKey = "workLifeBalance" | "stressReduction" | "careerSatisfaction" | "remoteFlexibility" | "travelFlexibility" | "advancement";
type LifestyleState = Record<LifestyleKey, number>;

// ── Styles ────────────────────────────────────────────────────────────────────

const inputS: React.CSSProperties = {
  width: "100%", padding: "7px 10px", borderRadius: "10px",
  border: "1px solid var(--border-subtle)", background: "var(--bg-card)",
  color: "var(--text-primary)", fontSize: "13px", fontFamily: "var(--font-mono)",
  outline: "none", boxSizing: "border-box",
};
const labelS: React.CSSProperties = {
  display: "block", fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em",
  textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "4px",
  fontFamily: "var(--font-body)",
};
const cardS: React.CSSProperties = {
  background: "var(--bg-card)", border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-lg)", padding: "16px",
};
const sectionHead: React.CSSProperties = {
  fontSize: "10px", fontWeight: 700, textTransform: "uppercase",
  letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "12px",
  fontFamily: "var(--font-body)",
};

// ── Defaults ──────────────────────────────────────────────────────────────────

const BASE_DEFAULTS = {
  name: "Career Scenario",
  current_monthly_income: 5000,
  current_growth_rate: 3.0,
  new_monthly_income: 4500,
  new_growth_rate: 5.0,
  gap_months: 0,
  transition_cost: 0,
  monthly_expenses: 3000,
  liquid_assets: 0,
  investment_return: 7.0,
  projection_years: 20,
  // Total comp extras
  current_annual_bonus: 0,
  current_equity_annual: 0,
  current_benefits_monthly: 0,
  current_401k_match_pct: 0,
  new_annual_bonus: 0,
  new_equity_annual: 0,
  new_benefits_monthly: 0,
  new_401k_match_pct: 0,
  new_signing_bonus: 0,
  new_relocation: 0,
};

type Inputs = typeof BASE_DEFAULTS;

function buildDefaults(
  profile: FinancialProfile | null,
  defaultInvestmentReturn: number,
  liquidAssets: number,
): Inputs {
  const base: Inputs = {
    ...BASE_DEFAULTS,
    investment_return: +(defaultInvestmentReturn * 100).toFixed(2),
    liquid_assets: Math.round(liquidAssets),
  };
  if (!profile) return base;
  return {
    ...base,
    current_monthly_income: profile.gross_monthly_income ? Math.round(profile.gross_monthly_income) : base.current_monthly_income,
    new_monthly_income: profile.gross_monthly_income ? Math.round(profile.gross_monthly_income * 0.85) : base.new_monthly_income,
    monthly_expenses: profile.monthly_expenses ? Math.round(profile.monthly_expenses) : base.monthly_expenses,
  };
}

function scenarioToInputs(s: CareerScenario): Inputs {
  return {
    name: s.name,
    current_monthly_income: s.current_monthly_income,
    current_growth_rate: +(s.current_growth_rate * 100).toFixed(2),
    new_monthly_income: s.new_monthly_income,
    new_growth_rate: +(s.new_growth_rate * 100).toFixed(2),
    gap_months: s.gap_months,
    transition_cost: s.transition_cost,
    monthly_expenses: s.monthly_expenses,
    liquid_assets: s.liquid_assets,
    investment_return: +(s.investment_return * 100).toFixed(2),
    projection_years: s.projection_years,
    current_annual_bonus: s.current_annual_bonus ?? 0,
    current_equity_annual: s.current_equity_annual ?? 0,
    current_benefits_monthly: s.current_benefits_monthly ?? 0,
    current_401k_match_pct: s.current_401k_match_pct ?? 0,
    new_annual_bonus: s.new_annual_bonus ?? 0,
    new_equity_annual: s.new_equity_annual ?? 0,
    new_benefits_monthly: s.new_benefits_monthly ?? 0,
    new_401k_match_pct: s.new_401k_match_pct ?? 0,
    new_signing_bonus: s.new_signing_bonus ?? 0,
    new_relocation: s.new_relocation ?? 0,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CareerClient({
  scenarios,
  profile,
  defaultInvestmentReturn,
  liquidAssets,
  currentNetWorth,
}: {
  scenarios: CareerScenario[];
  profile: FinancialProfile | null;
  defaultInvestmentReturn: number;
  liquidAssets: number;
  currentNetWorth: number;
}) {
  const router = useRouter();
  const smartDefaults = buildDefaults(profile, defaultInvestmentReturn, liquidAssets);
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(
    scenarios.length > 0 ? scenarios[0].id : null,
  );
  const [inputs, setInputs] = useState<Inputs>(() => {
    const first = scenarios[0];
    if (first) return scenarioToInputs(first);
    return smartDefaults;
  });
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [isPending, startTransition] = useTransition();
  const [finnCommentary, setFinnCommentary] = useState<string | null>(null);
  const [finnLoading, setFinnLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [chartMode, setChartMode] = useState<"annual" | "cumulative">("annual");
  const [lifestyle, setLifestyle] = useState<LifestyleState>({
    workLifeBalance: 5,
    stressReduction: 5,
    careerSatisfaction: 5,
    remoteFlexibility: 5,
    travelFlexibility: 5,
    advancement: 5,
  });
  const [forecastStatus, setForecastStatus] = useState<"idle" | "adding" | "done" | "error">("idle");


  function set<K extends keyof Inputs>(key: K, val: Inputs[K]) {
    setInputs((p) => ({ ...p, [key]: val }));
    setFinnCommentary(null);
  }
  function num(key: keyof Inputs) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      set(key, Number(e.target.value) as Inputs[typeof key]);
  }

  // ── Derived calculations ───────────────────────────────────────────────────

  const computed = useMemo(() => {
    // Effective monthly comp = base + bonus/12 + equity/12 + benefits + 401k match
    const effectiveCurrentMonthly =
      inputs.current_monthly_income
      + inputs.current_annual_bonus / 12
      + inputs.current_equity_annual / 12
      + inputs.current_benefits_monthly
      + inputs.current_monthly_income * (inputs.current_401k_match_pct / 100);

    const effectiveNewMonthly =
      inputs.new_monthly_income
      + inputs.new_annual_bonus / 12
      + inputs.new_equity_annual / 12
      + inputs.new_benefits_monthly
      + inputs.new_monthly_income * (inputs.new_401k_match_pct / 100);

    // Signing bonus and relocation reduce the net cost of switching
    const effectiveTransitionCost = Math.max(0, inputs.transition_cost - inputs.new_signing_bonus - inputs.new_relocation);

    const timeline = buildCareerTimeline(
      effectiveCurrentMonthly,
      inputs.current_growth_rate / 100,
      effectiveNewMonthly,
      inputs.new_growth_rate / 100,
      inputs.gap_months,
      effectiveTransitionCost,
      inputs.projection_years,
    );

    const breakEvenYear = timeline.find((p) => p.year > 0 && p.cumulativeNew >= p.cumulativeCurrent)?.year ?? null;
    const maxCost = Math.abs(Math.min(0, ...timeline.map((p) => p.cumulativeDelta)));

    const pt10 = timeline[Math.min(10, timeline.length - 1)];
    const pt20 = timeline[Math.min(20, timeline.length - 1)];
    const lastPt = timeline[timeline.length - 1];

    // Lifetime earnings
    const lifetimeCurrent = lastPt.cumulativeCurrent;
    const lifetimeNewNet = lastPt.cumulativeNew;
    const lifetimeNewGross = lifetimeNewNet + effectiveTransitionCost;
    const lifetimeDelta = lifetimeNewNet - lifetimeCurrent;

    // Emergency fund analysis
    const gapCost = inputs.gap_months * inputs.monthly_expenses + effectiveTransitionCost;
    const gapDeficit = Math.max(0, gapCost - inputs.liquid_assets);
    const runwayMonths = inputs.monthly_expenses > 0 ? inputs.liquid_assets / inputs.monthly_expenses : 0;

    // Retirement impact
    let retirCurrentProb: number | null = null;
    let retirNewProb: number | null = null;
    let nwCurrentPath = currentNetWorth;
    let nwNewPath = currentNetWorth;

    if (profile?.current_age && profile?.target_retirement_age) {
      const yearsToRetire = profile.target_retirement_age - profile.current_age;
      const annualExpenses = inputs.monthly_expenses * 12;
      const ir = inputs.investment_return / 100;
      const r = ir / 12;

      for (let y = 1; y <= yearsToRetire && y <= inputs.projection_years; y++) {
        const pt = timeline[y];
        if (!pt) break;
        const savingsCurrent = Math.max(0, pt.currentIncome - annualExpenses);
        const savingsNew = Math.max(0, pt.newIncome - annualExpenses);
        const mc = savingsCurrent / 12;
        const mn = savingsNew / 12;
        nwCurrentPath = r > 0
          ? nwCurrentPath * Math.pow(1 + r, 12) + mc * (Math.pow(1 + r, 12) - 1) / r
          : nwCurrentPath + savingsCurrent;
        nwNewPath = r > 0
          ? nwNewPath * Math.pow(1 + r, 12) + mn * (Math.pow(1 + r, 12) - 1) / r
          : nwNewPath + savingsNew;
      }
      retirCurrentProb = calcRetirementProb(nwCurrentPath, annualExpenses);
      retirNewProb = calcRetirementProb(nwNewPath, annualExpenses);
    }

    const retirDeltaPp = (retirNewProb ?? 0) - (retirCurrentProb ?? 0);

    // Scenario analysis (best/worst) — use effective comp values
    const effectiveInputs = { ...inputs, current_monthly_income: effectiveCurrentMonthly, new_monthly_income: effectiveNewMonthly, transition_cost: effectiveTransitionCost };
    const scenarioBest = buildScenarioMetrics(effectiveInputs, 2.0, 0.5, 0.7);
    const scenarioWorst = buildScenarioMetrics(effectiveInputs, -2.0, 1.5, 1.4);

    // Career ROI sub-scores
    const financialReturnScore = lifetimeCurrent > 0
      ? Math.max(0, Math.min(100, 50 + (lifetimeDelta / lifetimeCurrent) * 100))
      : 50;
    const paybackScore = breakEvenYear == null
      ? 5
      : Math.max(0, Math.min(100, 100 - (breakEvenYear - 1) * 5));
    const transRiskRaw = inputs.gap_months * 5 + (gapDeficit > 0 ? (gapDeficit / Math.max(1, inputs.monthly_expenses)) * 8 : 0);
    const transitionRiskScore = Math.max(0, Math.min(100, 100 - transRiskRaw));
    const retirementScore = Math.max(0, Math.min(100, 50 + retirDeltaPp * 5));
    const incomeStabilityScore = Math.max(0, Math.min(100,
      50
      + (inputs.new_growth_rate - inputs.current_growth_rate) * 5
      + (effectiveNewMonthly >= effectiveCurrentMonthly ? 15 : -15),
    ));
    const overallRoiScore = Math.round(
      financialReturnScore * 0.30
      + paybackScore * 0.20
      + transitionRiskScore * 0.15
      + retirementScore * 0.20
      + incomeStabilityScore * 0.15,
    );

    // Verdict
    const verdictHighRisk = gapDeficit > inputs.monthly_expenses * 3
      || (runwayMonths < 2 && inputs.gap_months > 6);

    type VerdictType = "SWITCH" | "WAIT" | "STAY";
    let verdict: VerdictType;
    let verdictConfidence: string;
    let verdictConditions: string[];

    if (breakEvenYear != null && breakEvenYear <= 7 && lifetimeDelta > 0) {
      verdict = "SWITCH";
      verdictConfidence = breakEvenYear <= 3 && lifetimeDelta > lifetimeCurrent * 0.20 ? "Strong Case"
        : breakEvenYear <= 5 && lifetimeDelta > lifetimeCurrent * 0.10 ? "Good Case"
        : "Possible";
      verdictConditions = [];
    } else if (breakEvenYear != null && breakEvenYear <= 15 && lifetimeDelta > 0) {
      verdict = "WAIT";
      verdictConfidence = breakEvenYear <= 10 ? "Low Conviction" : "Weak Edge";
      verdictConditions = [
        `Stay in the new field ${inputs.projection_years}+ years`,
        `Income growth of ${pct(inputs.new_growth_rate)} annually is achieved`,
        ...(inputs.transition_cost > 0 ? [`Transition costs stay below ${fmtK(inputs.transition_cost * 1.25)}`] : []),
      ];
    } else {
      verdict = "STAY";
      verdictConfidence = lifetimeDelta < -lifetimeCurrent * 0.10 ? "Clear Case" : "Uncertain";
      verdictConditions = [];
    }

    // Transition risk level
    let transitionRiskLevel: "LOW" | "MODERATE" | "HIGH";
    if (gapDeficit > inputs.monthly_expenses * 3) transitionRiskLevel = "HIGH";
    else if (gapDeficit > 0 || (inputs.gap_months > 0 && runwayMonths < 4)) transitionRiskLevel = "MODERATE";
    else transitionRiskLevel = "LOW";

    // P6: Rule-based Atlas narrative — opinionated first-person
    let finnNarrative: string;
    if (verdictHighRisk) {
      finnNarrative = `I'd hold off. The transition math could work eventually, but right now the cash situation is the real problem. With ${runwayMonths.toFixed(1)} months of runway against a projected shortfall of ${fmt(gapDeficit)}, you're betting your financial stability on everything going right. Build savings to at least ${inputs.gap_months + 3} months of expenses first, then revisit.`;
    } else if (verdict === "SWITCH") {
      finnNarrative = verdictConfidence === "Strong Case"
        ? `I would switch. Break-even at Year ${breakEvenYear} and ${fmtK(lifetimeDelta)} in lifetime earnings${retirDeltaPp > 0 ? `, with a +${retirDeltaPp}pp retirement improvement` : ""} — this is a clear financial win. The main risk is whether the projected ${pct(inputs.new_growth_rate)} annual growth materializes; that assumption carries most of the long-term value.`
        : `I'd lean toward switching. The numbers are positive but not overwhelming: break-even at Year ${breakEvenYear}, ${fmtK(lifetimeDelta)} lifetime advantage. If you're confident the ${pct(inputs.new_growth_rate)} growth rate is achievable, the financial case holds. Career satisfaction could easily tip the balance.`;
    } else if (verdict === "WAIT") {
      finnNarrative = `I would not switch for financial reasons alone. The new career produces only ${fmtK(lifetimeDelta)} more over ${inputs.projection_years} years and requires ${(breakEvenYear ?? inputs.projection_years) - 1} years to recover the earnings deficit. This move should be driven primarily by career satisfaction, lifestyle, or long-term interest rather than expected financial gain.`;
    } else {
      finnNarrative = `I would stay on the current path. Financially, switching generates ${fmtK(Math.abs(lifetimeDelta))} less in total earnings over ${inputs.projection_years} years${breakEvenYear == null ? " and never closes the gap" : `, breaking even only at Year ${breakEvenYear}`}. Unless lifestyle or career factors strongly favor the switch, the math makes a case for staying.`;
    }

    // P2: Score weakness drivers
    const scoreWeaknesses: string[] = [];
    if (paybackScore < 50) {
      scoreWeaknesses.push(breakEvenYear != null ? `Break-even takes ${breakEvenYear} year${breakEvenYear === 1 ? "" : "s"} — long payback` : "New career never breaks even in the projection window");
    }
    if (financialReturnScore < 60 && lifetimeDelta < 0) scoreWeaknesses.push(`Lifetime earnings gap: ${fmtK(Math.abs(lifetimeDelta))} below current path`);
    if (financialReturnScore >= 50 && financialReturnScore < 65 && lifetimeDelta > 0) scoreWeaknesses.push(`Lifetime advantage of ${fmtK(lifetimeDelta)} is modest relative to the commitment`);
    if (transitionRiskScore < 60 && inputs.gap_months > 0) scoreWeaknesses.push(`${inputs.gap_months} months without income during transition`);
    if (transitionRiskScore < 60 && gapDeficit > 0) scoreWeaknesses.push(`Savings cover only ${runwayMonths.toFixed(1)} of ${inputs.gap_months} months needed`);
    if (retirementScore < 50) scoreWeaknesses.push("Retirement outcome improves only marginally");
    if (incomeStabilityScore < 50) scoreWeaknesses.push(`New career starts ${fmt(Math.abs(inputs.new_monthly_income - inputs.current_monthly_income))}/mo lower with slower growth`);

    // P5: Was It Worth It?
    const annualEquivalent = inputs.projection_years > 0 ? Math.round(lifetimeDelta / inputs.projection_years) : 0;
    const monthlyEquivalent = Math.round(annualEquivalent / 12);

    // P3: Dynamic scenario distribution
    const posCount = [lifetimeDelta > 0, scenarioBest.lifetimeDelta > 0, scenarioWorst.lifetimeDelta > 0].filter(Boolean).length;
    const scenarioDistribution = posCount === 3
      ? { improved: 75, brokeEven: 18, worseOff: 7 }
      : posCount === 2
      ? { improved: 55, brokeEven: 22, worseOff: 23 }
      : posCount === 1
      ? { improved: 28, brokeEven: 25, worseOff: 47 }
      : { improved: 8, brokeEven: 17, worseOff: 75 };

    // Ecosystem impact
    type EcosystemImpact = {
      retirProbDelta: number;
      homeAffordabilityDelta: number;
      monthlySavingsDelta: number;
      fiYearsSooner: number;
    } | null;
    let ecosystemImpact: EcosystemImpact = null;
    if (profile?.current_age && profile?.target_retirement_age && inputs.monthly_expenses > 0) {
      const yr5Pt = timeline[Math.min(5, timeline.length - 1)];
      const monthlyIncomeDelta = (yr5Pt.newIncome - yr5Pt.currentIncome) / 12;
      const monthlySavingsDelta = Math.round(Math.max(-9999, monthlyIncomeDelta * 0.45));
      const homeAffordabilityDelta = Math.round(Math.max(0, monthlyIncomeDelta) * 12 * 0.28 / 0.07);
      const fiTarget = Math.max(1, inputs.monthly_expenses * 12 * 25);
      const addAnnual = monthlySavingsDelta * 12;
      const fiYearsSooner = addAnnual > 0
        ? Math.round(Math.min(15, (addAnnual * 13.8 / fiTarget) * (inputs.projection_years / 2)) * 10) / 10
        : 0;
      ecosystemImpact = { retirProbDelta: retirDeltaPp, homeAffordabilityDelta, monthlySavingsDelta, fiYearsSooner };
    }

    // P2: Career Milestone Timeline
    type MilestoneType = "now" | "gap" | "income" | "breakeven" | "checkpoint" | "retirement";
    type Milestone = { label: string; year: number; sub: string; type: MilestoneType };
    const rawMilestones: Milestone[] = [];
    rawMilestones.push({ label: "Decision Point", year: 0, sub: "Today", type: "now" });
    if (inputs.gap_months > 0) {
      rawMilestones.push({ label: "Income Gap Closes", year: Math.round(inputs.gap_months / 12 * 10) / 10, sub: `${inputs.gap_months} months`, type: "gap" });
    }
    const gapEndYear = inputs.gap_months / 12;
    const incomeCrossYear = timeline.find((p) => p.year > Math.ceil(gapEndYear) && p.newIncome >= p.currentIncome)?.year ?? null;
    if (incomeCrossYear != null) {
      rawMilestones.push({ label: "New Salary Surpasses Current", year: incomeCrossYear, sub: fmtK(timeline[incomeCrossYear]?.newIncome ?? 0), type: "income" });
    }
    if (breakEvenYear != null) {
      rawMilestones.push({ label: "Break-Even Point", year: breakEvenYear, sub: "Cumulative earnings equal", type: "breakeven" });
    }
    if (inputs.projection_years >= 10 && timeline[10]) {
      rawMilestones.push({ label: "10-Year Checkpoint", year: 10, sub: `${fmtK(timeline[10].newIncome)}/yr`, type: "checkpoint" });
    }
    if (profile?.current_age && profile?.target_retirement_age) {
      const ytr = profile.target_retirement_age - profile.current_age;
      if (ytr > 0 && ytr <= inputs.projection_years + 10) {
        rawMilestones.push({ label: "Retirement Target", year: ytr, sub: `Age ${profile.target_retirement_age}`, type: "retirement" });
      }
    }
    rawMilestones.push({ label: "Projection End", year: inputs.projection_years, sub: `${fmtK(lastPt.newIncome)}/yr`, type: "checkpoint" });
    rawMilestones.sort((a, b) => a.year - b.year);
    const milestones = rawMilestones.filter((m, i) => i === 0 || m.year - rawMilestones[i - 1].year > 0.4);

    // P4: Benchmarking
    const benchmarkPercentile = overallRoiScore >= 80 ? 85
      : overallRoiScore >= 65 ? 70
      : overallRoiScore >= 50 ? 55
      : overallRoiScore >= 35 ? 35
      : 20;

    // P6: Sensitivity — rank variables by impact magnitude on lifetime delta
    const sensitivityItems = [
      { label: "+1% annual growth rate", impact: buildScenarioMetrics({ ...inputs, new_growth_rate: inputs.new_growth_rate + 1 }, 0, 1, 1).lifetimeDelta - lifetimeDelta },
      { label: "+3 months income gap", impact: buildScenarioMetrics({ ...inputs, gap_months: inputs.gap_months + 3 }, 0, 1, 1).lifetimeDelta - lifetimeDelta },
      { label: "+20% transition cost", impact: buildScenarioMetrics({ ...inputs, transition_cost: inputs.transition_cost * 1.2 + 1000 }, 0, 1, 1).lifetimeDelta - lifetimeDelta },
      { label: "+$500/mo starting salary", impact: buildScenarioMetrics({ ...inputs, new_monthly_income: inputs.new_monthly_income + 500 }, 0, 1, 1).lifetimeDelta - lifetimeDelta },
      { label: "+1% current path growth", impact: buildScenarioMetrics({ ...inputs, current_growth_rate: inputs.current_growth_rate + 1 }, 0, 1, 1).lifetimeDelta - lifetimeDelta },
    ].sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));

    // P7: What Would Need to Change?
    let minSalaryForSwitch: number | null = null;
    if (verdict !== "SWITCH") {
      let lo = inputs.new_monthly_income, hi = inputs.new_monthly_income * 4 + 10000;
      for (let iter = 0; iter < 40; iter++) {
        const mid = (lo + hi) / 2;
        const m = buildScenarioMetrics({ ...inputs, new_monthly_income: mid }, 0, 1, 1);
        if (m.breakEvenYear != null && m.breakEvenYear <= 7 && m.lifetimeDelta > 0) hi = mid;
        else lo = mid;
        if (hi - lo < 50) break;
      }
      const candidate = Math.ceil(hi / 50) * 50;
      if (candidate > inputs.new_monthly_income && candidate < inputs.new_monthly_income * 5) minSalaryForSwitch = candidate;
    }

    let minGrowthForSwitch: number | null = null;
    if (verdict !== "SWITCH") {
      let lo = inputs.new_growth_rate, hi = 25;
      for (let iter = 0; iter < 40; iter++) {
        const mid = (lo + hi) / 2;
        const m = buildScenarioMetrics({ ...inputs, new_growth_rate: mid }, 0, 1, 1);
        if (m.breakEvenYear != null && m.breakEvenYear <= 7 && m.lifetimeDelta > 0) hi = mid;
        else lo = mid;
        if (hi - lo < 0.1) break;
      }
      const candidate = Math.ceil(hi * 10) / 10;
      if (candidate > inputs.new_growth_rate + 0.1 && candidate <= 25) minGrowthForSwitch = candidate;
    }

    let maxGapForSwitch: number | null = null;
    if (verdict === "SWITCH") {
      let lo = inputs.gap_months, hi = inputs.gap_months + 60;
      for (let iter = 0; iter < 40; iter++) {
        const mid = (lo + hi) / 2;
        const m = buildScenarioMetrics({ ...inputs, gap_months: Math.round(mid) }, 0, 1, 1);
        if (m.breakEvenYear != null && m.breakEvenYear <= 7 && m.lifetimeDelta > 0) lo = mid;
        else hi = mid;
        if (hi - lo < 0.5) break;
      }
      if (lo > inputs.gap_months) maxGapForSwitch = Math.floor(lo);
    }

    return {
      timeline, breakEvenYear, maxCost,
      pt10, pt20, lastPt,
      lifetimeCurrent, lifetimeNewNet, lifetimeNewGross, lifetimeDelta,
      gapCost, gapDeficit, runwayMonths,
      retirCurrentProb, retirNewProb, nwCurrentPath, nwNewPath, retirDeltaPp,
      scenarioBest, scenarioWorst,
      financialReturnScore, paybackScore, transitionRiskScore, retirementScore, incomeStabilityScore,
      overallRoiScore,
      verdict, verdictConfidence, verdictConditions, verdictHighRisk,
      transitionRiskLevel,
      finnNarrative,
      ecosystemImpact,
      milestones,
      benchmarkPercentile, scenarioDistribution,
      sensitivityItems,
      minSalaryForSwitch, minGrowthForSwitch, maxGapForSwitch,
      scoreWeaknesses,
      annualEquivalent, monthlyEquivalent,
      effectiveCurrentMonthly, effectiveNewMonthly, effectiveTransitionCost,
    };
  }, [inputs, profile, currentNetWorth]);

  // Lifestyle-derived scores (depends on lifestyle state, not just inputs)
  const lifestyleEngaged = Object.values(lifestyle).some((v) => v !== 5);
  const lifestyleScore = Math.round(
    (Object.values(lifestyle).reduce((a, b) => a + b, 0) / LIFESTYLE_FACTORS.length) * 10,
  );
  const overallScore = lifestyleEngaged
    ? Math.round(computed.overallRoiScore * 0.6 + lifestyleScore * 0.4)
    : computed.overallRoiScore;

  // P3: Regret Risk (outside useMemo — depends on lifestyle)
  const financialRegretLevel: "LOW" | "MEDIUM" | "HIGH" =
    computed.lifetimeDelta < -100_000 ? "HIGH"
    : computed.lifetimeDelta < -20_000 ? "MEDIUM"
    : "LOW";
  const lifestyleRegretLevel: "LOW" | "MEDIUM" | "HIGH" | null = lifestyleEngaged
    ? (lifestyleScore < 40 ? "HIGH" : lifestyleScore < 60 ? "MEDIUM" : "LOW")
    : null;
  const financialRegretText = financialRegretLevel === "HIGH"
    ? `You'd be walking away from roughly ${fmtK(Math.abs(computed.lifetimeDelta))} over ${inputs.projection_years} years. Make sure the reasons for switching are strong enough to justify it.`
    : financialRegretLevel === "MEDIUM"
    ? `The current path has a ${fmtK(Math.abs(computed.lifetimeDelta))} lifetime edge — within the range where lifestyle or growth factors could tip the balance.`
    : computed.lifetimeDelta >= 0
    ? `New career comes out ahead by ${fmtK(computed.lifetimeDelta)}, so this move doesn't create meaningful financial regret exposure.`
    : `The financial gap is small enough that other factors should drive the decision.`;
  const lifestyleRegretText = lifestyleRegretLevel === "HIGH"
    ? "Lifestyle ratings suggest this role may not deliver the improvements you're hoping for. Consider whether a different role in the same field could score better."
    : lifestyleRegretLevel === "MEDIUM"
    ? "Mixed lifestyle signals — some dimensions improve, others stay flat or decline. These tend to matter more over time than the year-1 numbers suggest."
    : lifestyleRegretLevel === "LOW"
    ? "Strong lifestyle improvement across all rated dimensions. Non-financial upside like this often predicts long-term satisfaction better than salary alone."
    : null;
  const regretColor = (level: "LOW" | "MEDIUM" | "HIGH") =>
    level === "HIGH" ? "oklch(0.70 0.18 25)"
    : level === "MEDIUM" ? "oklch(0.78 0.15 80)"
    : "oklch(0.72 0.18 145)";

  // ── Chart data ─────────────────────────────────────────────────────────────

  const chartData = computed.timeline.map((p) => ({
    year: `Yr ${p.year}`,
    "Current Path": p.currentIncome,
    "New Career": p.newIncome,
    "Cumulative Current": p.cumulativeCurrent,
    "Cumulative New": p.cumulativeNew,
  }));

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleSelectScenario(s: CareerScenario) {
    setActiveScenarioId(s.id);
    setInputs(scenarioToInputs(s));
    setFinnCommentary(null);
    setSaveStatus("idle");
  }

  function handleNewScenario() {
    setActiveScenarioId(null);
    setInputs(smartDefaults);
    setFinnCommentary(null);
    setSaveStatus("idle");
  }

  async function handleDelete(id: string) {
    startTransition(async () => {
      await deleteCareerScenario(id);
      if (activeScenarioId === id) handleNewScenario();
      setDeleteConfirm(null);
      router.refresh();
    });
  }

  async function handleSave() {
    setSaveStatus("saving");
    const data = {
      name: inputs.name,
      current_monthly_income: inputs.current_monthly_income,
      current_growth_rate: inputs.current_growth_rate / 100,
      new_monthly_income: inputs.new_monthly_income,
      new_growth_rate: inputs.new_growth_rate / 100,
      gap_months: inputs.gap_months,
      transition_cost: inputs.transition_cost,
      monthly_expenses: inputs.monthly_expenses,
      liquid_assets: inputs.liquid_assets,
      investment_return: inputs.investment_return / 100,
      projection_years: inputs.projection_years,
      current_annual_bonus: inputs.current_annual_bonus,
      current_equity_annual: inputs.current_equity_annual,
      current_benefits_monthly: inputs.current_benefits_monthly,
      current_401k_match_pct: inputs.current_401k_match_pct,
      new_annual_bonus: inputs.new_annual_bonus,
      new_equity_annual: inputs.new_equity_annual,
      new_benefits_monthly: inputs.new_benefits_monthly,
      new_401k_match_pct: inputs.new_401k_match_pct,
      new_signing_bonus: inputs.new_signing_bonus,
      new_relocation: inputs.new_relocation,
    };
    const result = await saveCareerScenario(data, activeScenarioId ?? undefined);
    if (result.error) { setSaveStatus("error"); return; }
    if (result.id && !activeScenarioId) setActiveScenarioId(result.id);
    setSaveStatus("saved");
    router.refresh();
    setTimeout(() => setSaveStatus("idle"), 2000);
  }

  async function fetchFinnCommentary() {
    setFinnLoading(true);
    const { pt10, pt20, breakEvenYear, maxCost, gapDeficit, runwayMonths, retirCurrentProb, retirNewProb } = computed;
    const body: CareerFinnRequest = {
      scenario_name: inputs.name,
      current_monthly_income: computed.effectiveCurrentMonthly,
      current_growth_rate_pct: inputs.current_growth_rate,
      new_monthly_income: computed.effectiveNewMonthly,
      new_growth_rate_pct: inputs.new_growth_rate,
      gap_months: inputs.gap_months,
      transition_cost: computed.effectiveTransitionCost,
      monthly_expenses: inputs.monthly_expenses,
      liquid_assets: inputs.liquid_assets,
      projection_years: inputs.projection_years,
      break_even_year: breakEvenYear,
      max_transition_cost: Math.round(maxCost),
      income_at_year10_current: pt10?.currentIncome ?? 0,
      income_at_year10_new: pt10?.newIncome ?? 0,
      income_at_year20_current: pt20?.currentIncome ?? 0,
      income_at_year20_new: pt20?.newIncome ?? 0,
      emergency_fund_runway_months: runwayMonths,
      gap_deficit: gapDeficit,
      retirement_prob_current: retirCurrentProb,
      retirement_prob_new: retirNewProb,
    };
    try {
      const res = await fetch("/api/planning/career-finn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setFinnCommentary(data.commentary ?? data.error ?? "Unable to analyze.");
    } catch {
      setFinnCommentary("Unable to connect. Please try again.");
    }
    setFinnLoading(false);
  }

  async function handleAddToForecast() {
    setForecastStatus("adding");
    const currentYear = new Date().getFullYear();
    const yr1Delta = (computed.effectiveNewMonthly - computed.effectiveCurrentMonthly) * 12;
    const yr5New = computed.effectiveNewMonthly * 12 * Math.pow(1 + inputs.new_growth_rate / 100, 5);
    const yr5Current = computed.effectiveCurrentMonthly * 12 * Math.pow(1 + inputs.current_growth_rate / 100, 5);
    const yr5Delta = yr5New - yr5Current;
    const result = await addCareerChangeToForecast({
      scenarioName: inputs.name,
      transitionCost: computed.effectiveTransitionCost,
      annualIncomeChangeYear1: yr1Delta,
      annualIncomeChangeYear5: yr5Delta,
      currentYear,
    });
    if (result.error) { setForecastStatus("error"); return; }
    setForecastStatus("done");
    setTimeout(() => setForecastStatus("idle"), 4000);
  }

  // ── Verdict styling ────────────────────────────────────────────────────────

  const { verdict, verdictConfidence, verdictConditions, verdictHighRisk } = computed;

  const verdictMeta = {
    SWITCH: {
      label: "Strong Case",
      color: "oklch(0.72 0.18 145)",
      bg: "color-mix(in oklch, oklch(0.55 0.15 145) 12%, transparent)",
      border: "color-mix(in oklch, oklch(0.55 0.15 145) 28%, transparent)",
    },
    WAIT: {
      label: "Moderate",
      color: "oklch(0.78 0.17 70)",
      bg: "color-mix(in oklch, oklch(0.78 0.17 70) 9%, transparent)",
      border: "color-mix(in oklch, oklch(0.78 0.17 70) 22%, transparent)",
    },
    STAY: {
      label: "High Risk",
      color: "oklch(0.68 0.10 240)",
      bg: "color-mix(in oklch, oklch(0.50 0.10 240) 12%, transparent)",
      border: "color-mix(in oklch, oklch(0.50 0.10 240) 28%, transparent)",
    },
  }[computed.verdict];

  const incomeDeltaYear1 = computed.effectiveNewMonthly - computed.effectiveCurrentMonthly;
  const isPayCut = incomeDeltaYear1 < 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>

      {/* Header */}
      <div data-print-hide style={{
        padding: "12px 24px", borderBottom: "1px solid var(--border-subtle)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "var(--bg-base)", flexShrink: 0, gap: "12px",
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "3px" }}>
            <Link href="/planning?tab=events" style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px", color: "var(--text-muted)", textDecoration: "none" }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10 3L5 8l5 5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Planning
            </Link>
            <span style={{ color: "var(--border)" }}>/</span>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>Career Change</span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
            <span style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>Career Decision Engine</span>
            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Model the financial impact of switching careers</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px" }} data-print-hide>
          <button
            type="button"
            onClick={() => window.print()}
            style={{
              padding: "6px 12px", borderRadius: "var(--radius-md)",
              background: "transparent", color: "var(--text-muted)",
              border: "1px solid var(--border)", fontSize: "12px", fontWeight: 600,
              fontFamily: "var(--font-body)", cursor: "pointer",
            }}
            title="Export as PDF"
          >
            PDF
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saveStatus === "saving"}
            style={{
              padding: "6px 14px", borderRadius: "var(--radius-md)",
              background: saveStatus === "saved" ? "var(--green)" : "var(--accent)",
              color: "#fff", border: "none", fontSize: "12px", fontWeight: 600,
              fontFamily: "var(--font-body)", cursor: "pointer", opacity: saveStatus === "saving" ? 0.6 : 1,
            }}
          >
            {saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved" : saveStatus === "error" ? "Error" : "Save"}
          </button>
        </div>
      </div>

      {/* Scenario tabs */}
      <div data-print-hide style={{ padding: "0 24px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", gap: "4px", overflowX: "auto", flexShrink: 0 }}>
        {scenarios.map((s) => (
          <div key={s.id} style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => handleSelectScenario(s)}
              style={{
                padding: "10px 14px", border: "none", cursor: "pointer",
                background: "transparent", fontSize: "12px", fontFamily: "var(--font-body)",
                color: activeScenarioId === s.id ? "var(--text-primary)" : "var(--text-tertiary)",
                fontWeight: activeScenarioId === s.id ? 600 : 400,
                borderBottom: activeScenarioId === s.id ? "2px solid var(--accent)" : "2px solid transparent",
                whiteSpace: "nowrap",
              }}
            >
              {s.name}
            </button>
            {deleteConfirm === s.id ? (
              <div style={{ display: "flex", gap: "4px", padding: "0 4px" }}>
                <button type="button" onClick={() => handleDelete(s.id)} disabled={isPending} style={{ fontSize: "10px", color: "var(--red)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-body)" }}>Delete</button>
                <button type="button" onClick={() => setDeleteConfirm(null)} style={{ fontSize: "10px", color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-body)" }}>Cancel</button>
              </div>
            ) : (
              <button type="button" onClick={() => setDeleteConfirm(s.id)} style={{ padding: "4px", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", opacity: 0.5, lineHeight: 1 }} title="Delete">×</button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={handleNewScenario}
          style={{
            padding: "10px 14px", border: "none", cursor: "pointer",
            background: "transparent", fontSize: "12px", fontFamily: "var(--font-body)",
            color: activeScenarioId === null ? "var(--accent)" : "var(--text-muted)",
            borderBottom: activeScenarioId === null ? "2px solid var(--accent)" : "2px solid transparent",
            flexShrink: 0,
          }}
        >
          + New
        </button>
      </div>

      {/* ── Two-column advisor layout ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }} data-career-cols>

        {/* Left sidebar: assumptions */}
        <div style={{ width: "300px", flexShrink: 0, borderRight: "1px solid var(--border-subtle)", overflowY: "auto", padding: "20px 20px 40px", display: "flex", flexDirection: "column" }} data-career-sidebar>

          <div style={{ marginBottom: "16px" }}>
            <label style={labelS}>Scenario Name</label>
            <input value={inputs.name} onChange={(e) => set("name", e.target.value)} style={inputS} />
          </div>

          {inputs.current_monthly_income > 0 && (
            <div style={{ marginBottom: "16px", padding: "9px 12px", borderRadius: "var(--radius-md)", background: isPayCut ? "color-mix(in oklch, oklch(0.45 0.18 25) 12%, transparent)" : "color-mix(in oklch, oklch(0.55 0.15 155) 10%, transparent)", border: `1px solid ${isPayCut ? "color-mix(in oklch, oklch(0.45 0.18 25) 28%, transparent)" : "color-mix(in oklch, oklch(0.55 0.15 155) 22%, transparent)"}`, display: "flex", alignItems: "flex-start", gap: "8px" }}>
              <div style={{ width: "16px", height: "16px", borderRadius: "50%", flexShrink: 0, marginTop: "1px", background: isPayCut ? "oklch(0.45 0.18 25)" : "oklch(0.55 0.15 155)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: "9px", color: "#fff", fontWeight: 700 }}>{isPayCut ? "▼" : "▲"}</span>
              </div>
              <div>
                <div style={{ fontSize: "11px", fontWeight: 600, color: isPayCut ? "oklch(0.75 0.12 25)" : "oklch(0.80 0.12 155)", fontFamily: "var(--font-body)" }}>
                  {isPayCut ? `Pay cut: ${fmt(Math.abs(incomeDeltaYear1))}/mo in year 1` : `Pay raise: +${fmt(incomeDeltaYear1)}/mo from day one`}
                </div>
                <div style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginTop: "2px" }}>
                  {inputs.new_growth_rate > inputs.current_growth_rate ? `New path grows ${pct(inputs.new_growth_rate - inputs.current_growth_rate)} faster annually` : inputs.new_growth_rate === inputs.current_growth_rate ? "Same growth rate as current path" : `Current path grows ${pct(inputs.current_growth_rate - inputs.new_growth_rate)} faster annually`}
                </div>
              </div>
            </div>
          )}

          <div style={{ height: "1px", background: "var(--border-subtle)", marginBottom: "16px" }} />
          <p style={{ ...sectionHead, marginBottom: "10px" }}>Current Path</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "10px" }}>
            <div>
              <label style={labelS}>Base Monthly Salary</label>
              <input type="number" min="0" value={inputs.current_monthly_income} onChange={num("current_monthly_income")} style={inputS} />
            </div>
            <div>
              <label style={labelS}>Annual Salary Growth (%)</label>
              <input type="number" min="0" max="30" step="0.1" value={inputs.current_growth_rate} onChange={num("current_growth_rate")} style={inputS} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <div>
                <label style={labelS}>Annual Bonus ($)</label>
                <input type="number" min="0" step="500" value={inputs.current_annual_bonus} onChange={num("current_annual_bonus")} style={inputS} />
              </div>
              <div>
                <label style={labelS}>Annual Equity/RSUs ($)</label>
                <input type="number" min="0" step="1000" value={inputs.current_equity_annual} onChange={num("current_equity_annual")} style={inputS} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <div>
                <label style={labelS}>Monthly Benefits ($)</label>
                <input type="number" min="0" step="50" value={inputs.current_benefits_monthly} onChange={num("current_benefits_monthly")} style={inputS} />
              </div>
              <div>
                <label style={labelS}>401k Match (%)</label>
                <input type="number" min="0" max="20" step="0.5" value={inputs.current_401k_match_pct} onChange={num("current_401k_match_pct")} style={inputS} />
              </div>
            </div>
          </div>
          {(inputs.current_annual_bonus > 0 || inputs.current_equity_annual > 0 || inputs.current_benefits_monthly > 0 || inputs.current_401k_match_pct > 0) && (
            <div style={{ marginBottom: "14px", padding: "7px 10px", borderRadius: "8px", background: "oklch(0.14 0.015 250)", border: "1px solid oklch(0.25 0.03 250 / 0.5)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Effective total comp</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>{fmtK(computed.effectiveCurrentMonthly * 12)}/yr</span>
            </div>
          )}

          <div style={{ height: "1px", background: "var(--border-subtle)", marginBottom: "16px" }} />
          <p style={{ ...sectionHead, marginBottom: "10px" }}>New Career</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "10px" }}>
            <div>
              <label style={labelS}>Year 1 Base Monthly Salary</label>
              <input type="number" min="0" value={inputs.new_monthly_income} onChange={num("new_monthly_income")} style={inputS} />
            </div>
            <div>
              <label style={labelS}>Annual Salary Growth (%)</label>
              <input type="number" min="0" max="30" step="0.1" value={inputs.new_growth_rate} onChange={num("new_growth_rate")} style={inputS} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <div>
                <label style={labelS}>Annual Bonus ($)</label>
                <input type="number" min="0" step="500" value={inputs.new_annual_bonus} onChange={num("new_annual_bonus")} style={inputS} />
              </div>
              <div>
                <label style={labelS}>Annual Equity/RSUs ($)</label>
                <input type="number" min="0" step="1000" value={inputs.new_equity_annual} onChange={num("new_equity_annual")} style={inputS} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <div>
                <label style={labelS}>Monthly Benefits ($)</label>
                <input type="number" min="0" step="50" value={inputs.new_benefits_monthly} onChange={num("new_benefits_monthly")} style={inputS} />
              </div>
              <div>
                <label style={labelS}>401k Match (%)</label>
                <input type="number" min="0" max="20" step="0.5" value={inputs.new_401k_match_pct} onChange={num("new_401k_match_pct")} style={inputS} />
              </div>
            </div>
          </div>
          {(inputs.new_annual_bonus > 0 || inputs.new_equity_annual > 0 || inputs.new_benefits_monthly > 0 || inputs.new_401k_match_pct > 0) && (
            <div style={{ marginBottom: "14px", padding: "7px 10px", borderRadius: "8px", background: "oklch(0.14 0.015 250)", border: "1px solid oklch(0.25 0.03 250 / 0.5)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Effective total comp</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>{fmtK(computed.effectiveNewMonthly * 12)}/yr</span>
            </div>
          )}

          <div style={{ height: "1px", background: "var(--border-subtle)", marginBottom: "16px" }} />
          <p style={{ ...sectionHead, marginBottom: "10px" }}>Transition</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "18px" }}>
            <div>
              <label style={labelS}>Income Gap (months)</label>
              <input type="number" min="0" max="60" value={inputs.gap_months} onChange={num("gap_months")} style={inputS} />
            </div>
            <div>
              <label style={labelS}>One-time Transition Cost ($)</label>
              <input type="number" min="0" value={inputs.transition_cost} onChange={num("transition_cost")} style={inputS} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <div>
                <label style={labelS}>Signing Bonus ($)</label>
                <input type="number" min="0" step="1000" value={inputs.new_signing_bonus} onChange={num("new_signing_bonus")} style={inputS} />
              </div>
              <div>
                <label style={labelS}>Relocation Stipend ($)</label>
                <input type="number" min="0" step="500" value={inputs.new_relocation} onChange={num("new_relocation")} style={inputS} />
              </div>
            </div>
            {(inputs.new_signing_bonus > 0 || inputs.new_relocation > 0) && (
              <div style={{ padding: "6px 9px", borderRadius: "7px", background: "oklch(0.72 0.18 145 / 0.07)", border: "1px solid oklch(0.72 0.18 145 / 0.2)", fontSize: "11px", color: "oklch(0.72 0.18 145)" }}>
                Net transition cost: {fmtK(computed.effectiveTransitionCost)} after signing/relocation
              </div>
            )}
          </div>

          <div style={{ height: "1px", background: "var(--border-subtle)", marginBottom: "16px" }} />
          <p style={{ ...sectionHead, marginBottom: "10px" }}>Context</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "18px" }}>
            <div>
              <label style={labelS}>Monthly Expenses</label>
              <input type="number" min="0" value={inputs.monthly_expenses} onChange={num("monthly_expenses")} style={inputS} />
            </div>
            <div>
              <label style={labelS}>Liquid Savings</label>
              <input type="number" min="0" value={inputs.liquid_assets} onChange={num("liquid_assets")} style={inputS} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <div>
                <label style={labelS}>Return (%)</label>
                <input type="number" min="0" max="30" step="0.1" value={inputs.investment_return} onChange={num("investment_return")} style={inputS} />
              </div>
              <div>
                <label style={labelS}>Horizon (yrs)</label>
                <input type="number" min="5" max="40" value={inputs.projection_years} onChange={num("projection_years")} style={inputS} />
              </div>
            </div>
          </div>

          <div style={{ height: "1px", background: "var(--border-subtle)", marginBottom: "16px" }} />
          <p style={{ ...sectionHead, marginBottom: "10px" }}>Lifestyle Factors</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {LIFESTYLE_FACTORS.map(({ key, label }) => (
              <div key={key}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                  <label style={{ ...labelS, margin: 0 }}>{label}</label>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 700, color: lifestyle[key] >= 7 ? "var(--green)" : lifestyle[key] <= 3 ? "var(--red)" : "var(--text-secondary)" }}>
                    {lifestyle[key]}/10
                  </span>
                </div>
                <input type="range" min="1" max="10" value={lifestyle[key]} onChange={(e) => setLifestyle((p) => ({ ...p, [key]: Number(e.target.value) }))} style={{ width: "100%", accentColor: "var(--accent)" }} />
              </div>
            ))}
            <div style={{ marginTop: "4px", padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--bg-card)", border: "1px solid var(--border-subtle)", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", textAlign: "center" }}>
              {[
                { label: "Financial", val: computed.overallRoiScore },
                { label: "Lifestyle", val: lifestyleScore },
                { label: "Overall", val: overallScore },
              ].map(({ label, val }) => (
                <div key={label}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "18px", fontWeight: 800, color: scoreColor(val) }}>{val}</div>
                  <div style={{ fontSize: "9px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: "1px" }}>{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* At a Glance — live snapshot */}
          <div style={{ height: "1px", background: "var(--border-subtle)", margin: "6px 0 14px" }} />
          <p style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-muted)", margin: "0 0 10px" }}>At a Glance</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            {[
              {
                label: "Break-Even",
                value: computed.breakEvenYear != null ? `Year ${computed.breakEvenYear}` : "Never",
                color: computed.breakEvenYear != null && computed.breakEvenYear <= 7 ? "var(--green)" : computed.breakEvenYear != null ? "oklch(0.78 0.15 75)" : "var(--red)",
              },
              {
                label: "Lifetime Edge",
                value: (computed.lifetimeDelta >= 0 ? "+" : "") + fmtK(computed.lifetimeDelta),
                color: computed.lifetimeDelta >= 0 ? "var(--green)" : "var(--red)",
              },
              {
                label: "Retirement",
                value: computed.retirDeltaPp !== 0 ? `${computed.retirDeltaPp >= 0 ? "+" : ""}${computed.retirDeltaPp}pp` : "No Change",
                color: computed.retirDeltaPp > 0 ? "var(--green)" : computed.retirDeltaPp < 0 ? "var(--red)" : "var(--text-muted)",
              },
              {
                label: "Trans. Risk",
                value: computed.transitionRiskLevel,
                color: computed.transitionRiskLevel === "LOW" ? "var(--green)" : computed.transitionRiskLevel === "HIGH" ? "var(--red)" : "oklch(0.78 0.15 75)",
              },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}>
                <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", marginBottom: "4px" }}>{label}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "14px", fontWeight: 800, color }}>{value}</div>
              </div>
            ))}
          </div>

        </div>

        {/* Right panel: advisor analysis */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px 40px", display: "flex", flexDirection: "column", gap: "14px" }} data-career-analysis>

          {/* Verdict */}
          <div style={{ borderRadius: "var(--radius-lg)", padding: "20px 24px", background: verdictMeta.bg, border: `1px solid ${verdictMeta.border}` }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: "200px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                  <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.10em", color: "var(--text-muted)" }}>Atlas</span>
                  <span style={{ fontSize: "10px", fontWeight: 600, padding: "2px 8px", borderRadius: "99px", background: verdictMeta.border, color: verdictMeta.color }}>{verdictConfidence} Confidence</span>
                </div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: "48px", fontWeight: 800, color: verdictMeta.color, letterSpacing: "-1.5px", lineHeight: 1 }}>{verdictMeta.label}</div>

                {(verdict === "SWITCH" || verdict === "WAIT") && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", marginTop: "10px" }}>
                    <div>
                      <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)" }}>Lifetime Advantage</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: "15px", fontWeight: 700, color: computed.lifetimeDelta >= 0 ? verdictMeta.color : "var(--red)" }}>{(computed.lifetimeDelta >= 0 ? "+" : "") + fmtK(computed.lifetimeDelta)}</div>
                    </div>
                    {computed.breakEvenYear != null && (
                      <div>
                        <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)" }}>Break-even</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: "15px", fontWeight: 700, color: verdictMeta.color }}>Year {computed.breakEvenYear}</div>
                      </div>
                    )}
                    {computed.retirCurrentProb != null && computed.retirNewProb != null && (
                      <div>
                        <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)" }}>Retirement Impact</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: "15px", fontWeight: 700, color: computed.retirDeltaPp >= 0 ? verdictMeta.color : "var(--red)" }}>{computed.retirDeltaPp >= 0 ? "+" : ""}{computed.retirDeltaPp}pp</div>
                      </div>
                    )}
                  </div>
                )}

                {verdictHighRisk && (
                  <div style={{ marginTop: "10px", padding: "10px 12px", borderRadius: "var(--radius-md)", background: "color-mix(in oklch, oklch(0.55 0.18 25) 12%, transparent)", border: "1px solid color-mix(in oklch, oklch(0.55 0.18 25) 28%, transparent)" }}>
                    <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "oklch(0.70 0.18 25)", marginBottom: "5px" }}>Timing Risk</div>
                    {[
                      `Build savings to ${inputs.gap_months + 3}+ months of expenses`,
                      "Reduce one-time transition costs if possible",
                      "Consider overlapping income sources during transition",
                    ].map((c, i) => (
                      <div key={i} style={{ display: "flex", gap: "7px", alignItems: "flex-start", marginTop: "3px" }}>
                        <span style={{ color: "oklch(0.70 0.18 25)", fontSize: "11px", marginTop: "1px" }}>!</span>
                        <span style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.4 }}>{c}</span>
                      </div>
                    ))}
                  </div>
                )}

                {verdict === "WAIT" && verdictConditions.length > 0 && (
                  <div style={{ marginTop: "10px" }}>
                    <div style={{ fontSize: "10px", color: "var(--text-muted)", marginBottom: "5px" }}>Switch becomes worthwhile if:</div>
                    {verdictConditions.map((c, i) => (
                      <div key={i} style={{ display: "flex", gap: "7px", alignItems: "flex-start", marginTop: "3px" }}>
                        <span style={{ color: verdictMeta.color, fontSize: "11px", marginTop: "1px" }}>✓</span>
                        <span style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.4 }}>{c}</span>
                      </div>
                    ))}
                  </div>
                )}

                {verdict === "STAY" && (
                  <div style={{ marginTop: "8px", fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    Current path generates {fmtK(Math.abs(computed.lifetimeDelta))} more over {inputs.projection_years} years.
                    {computed.breakEvenYear == null ? " The new career never breaks even within the projection window." : ""}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: "160px", alignItems: "flex-end" }}>
                <button type="button" onClick={handleAddToForecast} disabled={forecastStatus === "adding" || forecastStatus === "done"} style={{ padding: "8px 16px", borderRadius: "var(--radius-md)", border: `1px solid ${verdictMeta.border}`, background: forecastStatus === "done" ? "color-mix(in oklch, oklch(0.55 0.15 145) 15%, transparent)" : "color-mix(in oklch, oklch(0.50 0.08 240) 10%, transparent)", color: forecastStatus === "done" ? "oklch(0.72 0.18 145)" : verdictMeta.color, fontFamily: "var(--font-body)", fontSize: "11px", fontWeight: 700, cursor: forecastStatus === "adding" || forecastStatus === "done" ? "default" : "pointer", opacity: forecastStatus === "adding" ? 0.6 : 1, whiteSpace: "nowrap" }}>
                  {forecastStatus === "adding" ? "Adding…" : forecastStatus === "done" ? "Added to Forecast" : forecastStatus === "error" ? "Try Again" : "Add to Forecast →"}
                </button>
                {forecastStatus === "done" && (
                  <div style={{ fontSize: "10px", color: "var(--text-muted)", textAlign: "right", lineHeight: 1.4 }}>
                    Events created in{" "}<a href="/planning?tab=events" style={{ color: "var(--accent)", textDecoration: "none" }}>Planning</a>
                  </div>
                )}
              </div>

              <div style={{ textAlign: "center", minWidth: "72px" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "42px", fontWeight: 800, color: verdictMeta.color, lineHeight: 1 }}>{overallScore}</div>
                <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "2px", textTransform: "uppercase", letterSpacing: "0.07em" }}>{lifestyleEngaged ? "Overall" : "Score"}</div>
                {lifestyleEngaged && <div style={{ fontSize: "9px", color: "var(--text-tertiary)", marginTop: "3px" }}>{computed.overallRoiScore} fin / {lifestyleScore} life</div>}
                <div style={{ fontSize: "9px", color: scoreColor(overallScore), marginTop: "2px", fontWeight: 600 }}>{scoreLabel(overallScore)}</div>
              </div>
            </div>
          </div>

          {/* Atlas's Take */}
          <div style={cardS}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="8" stroke="#7c3aed" strokeWidth="1.5" />
                <path d="M7 9c0-1.657 1.343-3 3-3s3 1.343 3 3c0 1.5-1 2.5-2.5 3V13.5" stroke="#7c3aed" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="10" cy="15.5" r="0.75" fill="#7c3aed" />
              </svg>
              <p style={{ ...sectionHead, margin: 0 }}>Atlas&apos;s Take</p>
            </div>
            <div style={{ padding: "12px 14px", borderRadius: "var(--radius-md)", background: "color-mix(in oklch, #7c3aed 7%, transparent)", border: `1px solid ${verdictMeta.border}`, marginBottom: finnCommentary ? "12px" : "0" }}>
              <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.65, margin: 0, borderLeft: "2px solid color-mix(in oklch, #7c3aed 40%, transparent)", paddingLeft: "12px" }}>{computed.finnNarrative}</p>
            </div>
            {finnCommentary ? (
              <div style={{ marginTop: "12px" }}>
                <p style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "#7c3aed", marginBottom: "6px" }}>Deep AI Analysis</p>
                <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.65, margin: 0, borderLeft: "2px solid color-mix(in oklch, #7c3aed 40%, transparent)", paddingLeft: "12px" }}>{finnCommentary}</p>
                <button type="button" onClick={() => setFinnCommentary(null)} style={{ marginTop: "8px", fontSize: "10px", color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0, fontFamily: "var(--font-body)" }}>Refresh</button>
              </div>
            ) : finnLoading ? (
              <div style={{ marginTop: "10px" }}>
                <AtlasThinking messages={["Weighing the income change…", "Modeling the transition gap…", "Projecting long-term earnings…", "Checking the break-even point…"]} />
              </div>
            ) : (
              <button type="button" onClick={fetchFinnCommentary} disabled={finnLoading} style={{ marginTop: "10px", display: "flex", alignItems: "center", gap: "7px", padding: "8px 16px", borderRadius: "var(--radius-xl)", border: "none", background: finnLoading ? "oklch(0.45 0.2 290 / 0.15)" : "linear-gradient(135deg,#7c3aed,#5b21b6)", color: "#fff", fontFamily: "var(--font-body)", fontSize: "12px", fontWeight: 600, cursor: finnLoading ? "default" : "pointer", opacity: finnLoading ? 0.7 : 1, boxShadow: finnLoading ? "none" : "0 2px 12px rgba(124,58,237,0.35)" }}>
                <svg width="12" height="12" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="8" stroke="#7c3aed" strokeWidth="1.5" />
                  <path d="M7 9c0-1.657 1.343-3 3-3s3 1.343 3 3c0 1.5-1 2.5-2.5 3V13.5" stroke="#7c3aed" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="10" cy="15.5" r="0.75" fill="#7c3aed" />
                </svg>
                {finnLoading ? "Atlas is thinking…" : "Get Deep AI Analysis"}
              </button>
            )}
          </div>

          {/* Add to plan — one-time transition cost + the recurring income change */}
          {(computed.gapCost > 0 || incomeDeltaYear1 !== 0) && (
            <div style={cardS}>
              <p style={{ ...sectionHead, margin: "0 0 10px" }}>Add to your plan</p>
              <AddToPlanButton
                label={`${inputs.name?.trim() || "Career change"}`}
                category="career"
                amountImpact={-Math.round(computed.gapCost)}
                recurringAnnual={Math.round(incomeDeltaYear1 * 12)}
                note={`Models the ${fmt(Math.round(computed.gapCost))} transition cost and a ${incomeDeltaYear1 >= 0 ? "+" : ""}${fmt(Math.round(incomeDeltaYear1 * 12))}/yr income change (at steady spending) from that year, so your forecast reflects the switch.`}
              />
            </div>
          )}

          {/* Impact Analysis divider */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ flex: 1, height: "1px", background: "var(--border-subtle)" }} />
            <span style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-muted)" }}>Impact Analysis</span>
            <div style={{ flex: 1, height: "1px", background: "var(--border-subtle)" }} />
          </div>

          {/* Ecosystem Impact */}
          {computed.ecosystemImpact && (
            <div style={cardS}>
              <p style={sectionHead}>Impact Across BuyTune</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "10px" }}>
                {[
                  { label: "Retirement Probability", value: computed.ecosystemImpact.retirProbDelta !== 0 ? `${computed.ecosystemImpact.retirProbDelta >= 0 ? "+" : ""}${computed.ecosystemImpact.retirProbDelta}pp` : "No change", sub: "retirement on track", icon: "◎", color: computed.ecosystemImpact.retirProbDelta >= 0 ? "var(--green)" : "var(--red)" },
                  { label: "Home Affordability", value: computed.ecosystemImpact.homeAffordabilityDelta > 0 ? `+${fmtK(computed.ecosystemImpact.homeAffordabilityDelta)}` : "No change", sub: "additional home budget", icon: "⌂", color: computed.ecosystemImpact.homeAffordabilityDelta > 0 ? "var(--green)" : "var(--text-muted)" },
                  { label: "Monthly Savings", value: `${computed.ecosystemImpact.monthlySavingsDelta >= 0 ? "+" : ""}${fmt(computed.ecosystemImpact.monthlySavingsDelta)}/mo`, sub: "at year 5 income level", icon: "$", color: computed.ecosystemImpact.monthlySavingsDelta >= 0 ? "var(--green)" : "var(--red)" },
                  { label: "Financial Independence", value: computed.ecosystemImpact.fiYearsSooner > 0 ? `~${computed.ecosystemImpact.fiYearsSooner} yrs sooner` : "No improvement", sub: "estimated at 7% return", icon: "→", color: computed.ecosystemImpact.fiYearsSooner > 0 ? "var(--green)" : "var(--text-muted)" },
                ].map(({ label, value, sub, icon, color }) => (
                  <div key={label} style={{ padding: "12px", borderRadius: "var(--radius-md)", background: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                      <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{icon}</span>
                      <span style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>{label}</span>
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 700, color }}>{value}</div>
                    <div style={{ fontSize: "9px", color: "var(--text-tertiary)", marginTop: "2px" }}>{sub}</div>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: "10px", color: "var(--text-tertiary)", margin: "8px 0 0", lineHeight: 1.5 }}>Estimates based on year-5 income projections. Home affordability uses 28% DTI and 7% mortgage rate.</p>
            </div>
          )}

          {/* Choosing Between Futures */}
          <div style={cardS}>
            <p style={sectionHead}>Choosing Between Futures</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              {[
                { title: "Current Career", yr10: computed.pt10?.currentIncome ?? 0, retirAssets: computed.nwCurrentPath, retirProb: computed.retirCurrentProb, risk: "Low", riskColor: "var(--green)", accent: "#94a3b8", border: "rgba(148,163,184,0.2)" },
                { title: "New Career", yr10: computed.pt10?.newIncome ?? 0, retirAssets: computed.nwNewPath, retirProb: computed.retirNewProb, risk: computed.transitionRiskLevel === "LOW" ? "Moderate" : computed.transitionRiskLevel === "MODERATE" ? "Moderate" : "High", riskColor: computed.transitionRiskLevel === "LOW" ? "oklch(0.78 0.17 70)" : computed.transitionRiskLevel === "MODERATE" ? "oklch(0.78 0.17 70)" : "var(--red)", accent: "#3b82f6", border: "rgba(59,130,246,0.22)" },
              ].map(({ title, yr10, retirAssets, retirProb, risk, riskColor, accent, border }) => (
                <div key={title} style={{ padding: "14px", borderRadius: "var(--radius-md)", background: "var(--bg-card)", border: `1px solid ${border}` }}>
                  <p style={{ fontSize: "11px", fontWeight: 700, color: accent, marginBottom: "10px", letterSpacing: "0.02em" }}>{title}</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div>
                      <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>Year 10 Income</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: "17px", fontWeight: 700, color: "var(--text-primary)", marginTop: "2px" }}>{fmtK(yr10)}</div>
                    </div>
                    {retirAssets > 0 && (
                      <div>
                        <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>Retirement Assets</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: "17px", fontWeight: 700, color: "var(--text-primary)", marginTop: "2px" }}>{fmtK(retirAssets)}</div>
                      </div>
                    )}
                    {retirProb != null && (
                      <div>
                        <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>Retire Probability</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: "17px", fontWeight: 700, marginTop: "2px", color: retirProb >= 80 ? "var(--green)" : retirProb >= 60 ? "oklch(0.78 0.17 70)" : "var(--red)" }}>{retirProb}%</div>
                      </div>
                    )}
                    <div>
                      <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>Transition Risk</div>
                      <div style={{ fontSize: "13px", fontWeight: 700, color: riskColor, marginTop: "2px" }}>{risk}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Career Timeline */}
          <div style={cardS}>
            <p style={sectionHead}>Career Timeline</p>
            <div style={{ position: "relative", paddingLeft: "20px" }}>
              <div style={{ position: "absolute", left: "7px", top: "8px", bottom: "8px", width: "2px", background: "var(--border-subtle)", borderRadius: "1px" }} />
              {computed.milestones.map((m, i) => {
                const dotColor = m.type === "breakeven" ? "oklch(0.72 0.18 145)" : m.type === "retirement" ? "oklch(0.72 0.15 280)" : m.type === "gap" ? "oklch(0.70 0.18 25)" : m.type === "income" ? "oklch(0.78 0.15 145)" : m.type === "now" ? "var(--accent)" : "var(--text-muted)";
                return (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "10px", marginBottom: "14px", position: "relative" }}>
                    <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: dotColor, flexShrink: 0, marginTop: "4px", zIndex: 1, boxShadow: "0 0 0 2px var(--bg-card)" }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "8px" }}>
                        <span style={{ fontSize: "12px", fontWeight: 600, color: dotColor }}>{m.label}</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 700, color: "var(--text-secondary)", flexShrink: 0 }}>{m.year === 0 ? "Now" : `Yr ${m.year}`}</span>
                      </div>
                      <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "1px" }}>{m.sub}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Lifetime Earnings */}
          <div style={cardS}>
            <p style={sectionHead}>Lifetime Earnings</p>
            <div style={{ textAlign: "center", padding: "4px 0 14px" }}>
              <div style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "4px" }}>
                {computed.lifetimeDelta >= 0 ? "Lifetime Advantage — New Career" : "Lifetime Disadvantage — Current Career Wins"}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "40px", fontWeight: 800, lineHeight: 1, color: computed.lifetimeDelta >= 0 ? "var(--green)" : "var(--red)" }}>
                {(computed.lifetimeDelta >= 0 ? "+" : "") + fmtK(computed.lifetimeDelta)}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", borderTop: "1px solid var(--border-subtle)", paddingTop: "12px" }}>
              {[
                { label: "Current Path Total", value: fmtK(computed.lifetimeCurrent), color: "#94a3b8", note: null },
                { label: "New Career Total", value: fmtK(computed.lifetimeNewGross), color: "#3b82f6", note: inputs.transition_cost > 0 ? `−${fmtK(inputs.transition_cost)} costs` : null },
              ].map(({ label, value, color, note }) => (
                <div key={label}>
                  <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: "2px" }}>{label}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "17px", fontWeight: 700, color }}>{value}</div>
                  {note && <div style={{ fontSize: "9px", color: "var(--text-muted)", marginTop: "1px" }}>{note}</div>}
                </div>
              ))}
            </div>
            <p style={{ fontSize: "10px", color: "var(--text-tertiary)", margin: "8px 0 0" }}>Cumulative income over {inputs.projection_years} years, adjusted for transition costs.</p>
          </div>

          {/* Income Trajectory */}
          <div style={cardS}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
              <p style={{ ...sectionHead, margin: 0 }}>Income Trajectory</p>
              <div style={{ display: "flex", gap: "4px" }}>
                {(["annual", "cumulative"] as const).map((m) => (
                  <button key={m} type="button" onClick={() => setChartMode(m)} style={{ padding: "3px 8px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: chartMode === m ? "var(--accent)" : "transparent", color: chartMode === m ? "#fff" : "var(--text-muted)", fontSize: "10px", cursor: "pointer", fontFamily: "var(--font-body)" }}>
                    {m === "annual" ? "Annual" : "Cumulative"}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ height: "220px" }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="year" tick={{ fontSize: 9, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} interval={Math.ceil(inputs.projection_years / 5)} />
                  <YAxis tickFormatter={fmtK} tick={{ fontSize: 9, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} width={52} />
                  <Tooltip contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "8px", fontSize: "11px" }} formatter={(v) => typeof v === "number" ? fmt(v) : String(v ?? "")} />
                  <Legend wrapperStyle={{ fontSize: "11px" }} />
                  {chartMode === "annual" ? (
                    <>
                      <Line type="monotone" dataKey="Current Path" stroke="#94a3b8" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="New Career" stroke="#3b82f6" strokeWidth={2} dot={false} />
                    </>
                  ) : (
                    <>
                      <Line type="monotone" dataKey="Cumulative Current" stroke="#94a3b8" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="Cumulative New" stroke="#3b82f6" strokeWidth={2} dot={false} />
                      {computed.breakEvenYear != null && (
                        <ReferenceLine x={`Yr ${computed.breakEvenYear}`} stroke="var(--green)" strokeDasharray="4 2" label={{ value: "Break-even", fill: "var(--green)", fontSize: 9 }} />
                      )}
                    </>
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
            {computed.pt10 && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginTop: "12px" }}>
                {[
                  { label: "Yr 10 Current", value: fmtK(computed.pt10.currentIncome), color: "#94a3b8" },
                  { label: "Yr 10 New", value: fmtK(computed.pt10.newIncome), color: "#3b82f6" },
                  { label: "10yr Delta", value: (computed.pt10.newIncome - computed.pt10.currentIncome >= 0 ? "+" : "") + fmtK(computed.pt10.newIncome - computed.pt10.currentIncome), color: computed.pt10.newIncome >= computed.pt10.currentIncome ? "var(--green)" : "var(--red)" },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ textAlign: "center" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 700, color }}>{value}</div>
                    <div style={{ fontSize: "9px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: "2px" }}>{label}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Modeled Outcomes */}
          <div style={cardS}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "14px" }}>
              <p style={{ ...sectionHead, margin: 0 }}>Modeled Outcomes</p>
              <span style={{ fontSize: "9px", color: "var(--text-muted)", fontStyle: "italic" }}>scenario modeling</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", marginBottom: "12px" }}>
              {[
                { pct: `${computed.scenarioDistribution.improved}%`, label: "Favorable", color: "oklch(0.72 0.18 145)", bg: "color-mix(in oklch, oklch(0.55 0.15 145) 10%, transparent)" },
                { pct: `${computed.scenarioDistribution.brokeEven}%`, label: "Broke Even", color: "oklch(0.68 0.12 240)", bg: "color-mix(in oklch, oklch(0.50 0.10 240) 10%, transparent)" },
                { pct: `${computed.scenarioDistribution.worseOff}%`, label: "Unfavorable", color: "oklch(0.70 0.18 25)", bg: "color-mix(in oklch, oklch(0.55 0.18 25) 10%, transparent)" },
              ].map(({ pct: p, label, color, bg }) => (
                <div key={label} style={{ padding: "12px", borderRadius: "var(--radius-md)", background: bg, textAlign: "center" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "22px", fontWeight: 800, color }}>{p}</div>
                  <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginTop: "2px" }}>{label}</div>
                </div>
              ))}
            </div>
            <div style={{ padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>Your scenario</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 700, color: scoreColor(computed.overallRoiScore) }}>Top {100 - computed.benchmarkPercentile}%</span>
              </div>
              <div style={{ height: "5px", background: "var(--border-subtle)", borderRadius: "3px", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${computed.benchmarkPercentile}%`, background: scoreColor(computed.overallRoiScore), borderRadius: "3px" }} />
              </div>
            </div>
            <p style={{ fontSize: "10px", color: "var(--text-tertiary)", margin: "8px 0 0", lineHeight: 1.5, fontStyle: "italic" }}>Based on BuyTune scenario modeling across best, expected, and worst cases — not historical labor-market data.</p>
          </div>

          {/* Outcome Scenarios */}
          <div style={cardS}>
            <p style={sectionHead}>Outcome Scenarios</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
              {[
                { label: "Best Case", be: computed.scenarioBest.breakEvenYear, delta: computed.scenarioBest.lifetimeDelta, bg: "color-mix(in oklch, oklch(0.55 0.15 145) 8%, var(--bg-card))", border: "color-mix(in oklch, oklch(0.55 0.15 145) 25%, transparent)", color: "oklch(0.72 0.18 145)" },
                { label: "Expected Case", be: computed.breakEvenYear, delta: computed.lifetimeDelta, bg: "color-mix(in oklch, oklch(0.50 0.10 240) 8%, var(--bg-card))", border: "color-mix(in oklch, oklch(0.50 0.10 240) 25%, transparent)", color: "oklch(0.68 0.12 240)" },
                { label: "Worst Case", be: computed.scenarioWorst.breakEvenYear, delta: computed.scenarioWorst.lifetimeDelta, bg: "color-mix(in oklch, oklch(0.55 0.18 25) 8%, var(--bg-card))", border: "color-mix(in oklch, oklch(0.55 0.18 25) 25%, transparent)", color: "oklch(0.70 0.18 25)" },
              ].map(({ label, be, delta, bg, border, color }) => (
                <div key={label} style={{ padding: "12px", borderRadius: "var(--radius-md)", background: bg, border: `1px solid ${border}` }}>
                  <p style={{ fontSize: "10px", fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "10px" }}>{label}</p>
                  <div style={{ marginBottom: "8px" }}>
                    <div style={{ fontSize: "9px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Break-even</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "15px", fontWeight: 700, color: "var(--text-primary)", marginTop: "2px" }}>{be != null ? `Year ${be}` : "Never"}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "9px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Lifetime Impact</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "15px", fontWeight: 700, marginTop: "2px", color: delta >= 0 ? "oklch(0.72 0.18 145)" : "oklch(0.70 0.18 25)" }}>{(delta >= 0 ? "+" : "") + fmtK(delta)}</div>
                  </div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: "10px", color: "var(--text-tertiary)", margin: "10px 0 0", lineHeight: 1.5 }}>Best: +2pp growth, half the income gap, 70% of transition cost. Worst: -2pp growth, 1.5x gap, 140% of transition cost.</p>
          </div>

          {/* Was It Worth It? */}
          <div style={cardS}>
            <p style={sectionHead}>Was It Worth It?</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", marginBottom: "14px" }}>
              {[
                { label: "Break-even", value: computed.breakEvenYear != null ? `Year ${computed.breakEvenYear}` : "Never", color: computed.breakEvenYear != null && computed.breakEvenYear <= 7 ? "var(--green)" : computed.breakEvenYear != null ? "oklch(0.78 0.17 70)" : "var(--red)", sub: "years to recover" },
                { label: "Lifetime Gain", value: (computed.lifetimeDelta >= 0 ? "+" : "") + fmtK(computed.lifetimeDelta), color: computed.lifetimeDelta >= 0 ? "var(--green)" : "var(--red)", sub: `over ${inputs.projection_years} years` },
                { label: "Per Year", value: (computed.annualEquivalent >= 0 ? "+" : "") + fmtK(computed.annualEquivalent), color: computed.annualEquivalent >= 0 ? "var(--green)" : "var(--red)", sub: "equivalent reward/yr" },
              ].map(({ label, value, color, sub }) => (
                <div key={label} style={{ padding: "12px", borderRadius: "var(--radius-md)", background: "var(--bg-card)", border: "1px solid var(--border-subtle)", textAlign: "center" }}>
                  <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: "4px" }}>{label}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "17px", fontWeight: 800, color }}>{value}</div>
                  <div style={{ fontSize: "9px", color: "var(--text-tertiary)", marginTop: "2px" }}>{sub}</div>
                </div>
              ))}
            </div>
            <div style={{ padding: "12px 14px", borderRadius: "var(--radius-md)", background: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}>
              <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.65, margin: 0 }}>
                {computed.breakEvenYear != null
                  ? `You accept ${computed.breakEvenYear} years of lower cumulative earnings in exchange for ${fmtK(computed.lifetimeDelta)} in total lifetime gain. That works out to ${computed.annualEquivalent >= 0 ? "+" : ""}${fmt(Math.abs(computed.monthlyEquivalent))}/month averaged over ${inputs.projection_years} years.`
                  : `The new career does not recover the earnings deficit within ${inputs.projection_years} years. The total lifetime impact is ${fmtK(computed.lifetimeDelta)}, averaging ${fmt(Math.abs(computed.monthlyEquivalent))}/month.`}
              </p>
            </div>
          </div>

          {/* Retirement Impact */}
          {computed.retirCurrentProb != null && computed.retirNewProb != null && (
            <div style={cardS}>
              <p style={sectionHead}>Retirement Impact</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "14px" }}>
                {[
                  { label: "Current Career", value: computed.nwCurrentPath, color: "#94a3b8" },
                  { label: "New Career", value: computed.nwNewPath, color: "#3b82f6" },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ padding: "12px 14px", borderRadius: "var(--radius-md)", background: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}>
                    <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: "4px" }}>{label}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "22px", fontWeight: 800, color }}>{fmtK(value)}</div>
                    <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "2px" }}>at retirement</div>
                  </div>
                ))}
              </div>
              <div style={{ padding: "10px 14px", borderRadius: "var(--radius-md)", background: computed.nwNewPath >= computed.nwCurrentPath ? "color-mix(in oklch, oklch(0.55 0.15 145) 10%, transparent)" : "color-mix(in oklch, oklch(0.55 0.18 25) 8%, transparent)", border: `1px solid ${computed.nwNewPath >= computed.nwCurrentPath ? "color-mix(in oklch, oklch(0.55 0.15 145) 22%, transparent)" : "color-mix(in oklch, oklch(0.55 0.18 25) 22%, transparent)"}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>Retirement assets difference</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "15px", fontWeight: 800, color: computed.nwNewPath >= computed.nwCurrentPath ? "var(--green)" : "var(--red)" }}>
                  {(computed.nwNewPath >= computed.nwCurrentPath ? "+" : "") + fmtK(computed.nwNewPath - computed.nwCurrentPath)}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "10px", paddingTop: "10px", borderTop: "1px solid var(--border-subtle)" }}>
                <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>Retirement probability</span>
                <span style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                  {computed.retirCurrentProb}% → {computed.retirNewProb}%
                  {computed.retirDeltaPp !== 0 && (
                    <span style={{ color: computed.retirDeltaPp > 0 ? "var(--green)" : "var(--red)", marginLeft: "4px" }}>
                      ({computed.retirDeltaPp > 0 ? "+" : ""}{computed.retirDeltaPp}pp)
                    </span>
                  )}
                </span>
              </div>
              <p style={{ fontSize: "10px", color: "var(--text-tertiary)", margin: "6px 0 0", lineHeight: 1.5 }}>Projected at retirement age {profile?.target_retirement_age}, compounded at {pct(inputs.investment_return)}/yr.</p>
            </div>
          )}

          {/* Readiness & Risk divider */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ flex: 1, height: "1px", background: "var(--border-subtle)" }} />
            <span style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-muted)" }}>Readiness & Risk</span>
            <div style={{ flex: 1, height: "1px", background: "var(--border-subtle)" }} />
          </div>

          {/* Career Change Score */}
          <div style={cardS}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "14px" }}>
              <p style={{ ...sectionHead, margin: 0 }}>Career Change Score</p>
              <div style={{ textAlign: "right" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "24px", fontWeight: 800, color: scoreColor(computed.overallRoiScore) }}>{computed.overallRoiScore}</span>
                <span style={{ fontSize: "12px", color: "var(--text-muted)" }}> / 100</span>
                <div style={{ fontSize: "9px", color: scoreColor(computed.overallRoiScore), fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{scoreLabel(computed.overallRoiScore)}</div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
              {[
                { label: "Financial Return", score: computed.financialReturnScore },
                { label: "Payback Period", score: computed.paybackScore },
                { label: "Transition Risk", score: computed.transitionRiskScore },
                { label: "Retirement Impact", score: computed.retirementScore },
                { label: "Income Stability", score: computed.incomeStabilityScore },
              ].map(({ label, score }) => (
                <div key={label}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "3px" }}>
                    <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>{label}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 700, color: scoreColor(score) }}>{Math.round(score)}</span>
                  </div>
                  <div style={{ height: "4px", background: "var(--bg-card)", borderRadius: "2px", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.round(score)}%`, background: scoreColor(score), borderRadius: "2px" }} />
                  </div>
                </div>
              ))}
            </div>
            {computed.scoreWeaknesses.length > 0 && (
              <div style={{ marginTop: "14px", paddingTop: "12px", borderTop: "1px solid var(--border-subtle)" }}>
                <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", marginBottom: "8px" }}>What&apos;s holding it back</div>
                {computed.scoreWeaknesses.map((w, i) => (
                  <div key={i} style={{ display: "flex", gap: "7px", alignItems: "flex-start", marginBottom: "5px" }}>
                    <span style={{ color: "oklch(0.70 0.18 25)", fontSize: "10px", flexShrink: 0, marginTop: "2px" }}>↓</span>
                    <span style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.5 }}>{w}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Transition Risk */}
          <div style={{ ...cardS, background: computed.transitionRiskLevel === "HIGH" ? "color-mix(in oklch, oklch(0.40 0.18 25) 10%, var(--bg-card))" : computed.transitionRiskLevel === "MODERATE" ? "color-mix(in oklch, oklch(0.60 0.14 80) 8%, var(--bg-card))" : "color-mix(in oklch, oklch(0.55 0.15 155) 8%, var(--bg-card))", borderColor: computed.transitionRiskLevel === "HIGH" ? "color-mix(in oklch, oklch(0.45 0.18 25) 30%, transparent)" : computed.transitionRiskLevel === "MODERATE" ? "color-mix(in oklch, oklch(0.60 0.14 80) 28%, transparent)" : "color-mix(in oklch, oklch(0.55 0.15 155) 25%, transparent)" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "12px" }}>
              <p style={{ ...sectionHead, margin: 0 }}>Transition Risk</p>
              <span style={{ fontSize: "11px", fontWeight: 800, letterSpacing: "0.05em", color: computed.transitionRiskLevel === "HIGH" ? "oklch(0.70 0.18 25)" : computed.transitionRiskLevel === "MODERATE" ? "oklch(0.78 0.15 80)" : "oklch(0.72 0.18 145)" }}>
                {computed.transitionRiskLevel} RISK
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
              {[
                { label: "Emergency Fund", value: `${computed.runwayMonths.toFixed(1)} mo`, sub: computed.runwayMonths >= 6 ? "Adequate" : computed.runwayMonths >= 3 ? "Thin" : "Insufficient", color: computed.runwayMonths >= 6 ? "var(--green)" : computed.runwayMonths >= 3 ? "oklch(0.78 0.17 70)" : "var(--red)" },
                { label: "Income Gap", value: inputs.gap_months > 0 ? `${inputs.gap_months} mo` : "None", sub: inputs.gap_months > 0 ? fmt(inputs.gap_months * inputs.monthly_expenses) + " cost" : "No gap", color: inputs.gap_months === 0 ? "var(--green)" : inputs.gap_months <= 3 ? "oklch(0.78 0.17 70)" : "var(--red)" },
                { label: computed.gapDeficit > 0 ? "Cash Shortfall" : "Runway", value: computed.gapDeficit > 0 ? fmt(computed.gapDeficit) : fmt(inputs.liquid_assets - computed.gapCost), sub: computed.gapDeficit > 0 ? "additional savings needed" : "remaining after gap", color: computed.gapDeficit > 0 ? "var(--red)" : "var(--green)" },
              ].map(({ label, value, sub, color }) => (
                <div key={label}>
                  <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: "3px" }}>{label}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 700, color }}>{value}</div>
                  <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "2px" }}>{sub}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Regret Risk */}
          <div style={cardS}>
            <p style={sectionHead}>Regret Risk</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ padding: "12px 14px", borderRadius: "var(--radius-md)", background: `color-mix(in oklch, ${regretColor(financialRegretLevel)} 8%, transparent)`, border: `1px solid color-mix(in oklch, ${regretColor(financialRegretLevel)} 25%, transparent)` }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                  <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)" }}>Financial Regret</span>
                  <span style={{ fontSize: "11px", fontWeight: 800, color: regretColor(financialRegretLevel), letterSpacing: "0.05em" }}>{financialRegretLevel}</span>
                </div>
                <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>{financialRegretText}</p>
              </div>
              {lifestyleRegretLevel && lifestyleRegretText && (
                <div style={{ padding: "12px 14px", borderRadius: "var(--radius-md)", background: `color-mix(in oklch, ${regretColor(lifestyleRegretLevel)} 8%, transparent)`, border: `1px solid color-mix(in oklch, ${regretColor(lifestyleRegretLevel)} 25%, transparent)` }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                    <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)" }}>Lifestyle Regret</span>
                    <span style={{ fontSize: "11px", fontWeight: 800, color: regretColor(lifestyleRegretLevel), letterSpacing: "0.05em" }}>{lifestyleRegretLevel}</span>
                  </div>
                  <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>{lifestyleRegretText}</p>
                </div>
              )}
              {!lifestyleEngaged && (
                <p style={{ fontSize: "10px", color: "var(--text-tertiary)", margin: 0 }}>Rate lifestyle factors to unlock Lifestyle Regret analysis.</p>
              )}
            </div>
          </div>

          {/* What Moves the Needle Most */}
          <div style={cardS}>
            <p style={sectionHead}>What Moves the Needle Most</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {computed.sensitivityItems.map(({ label, impact }, i) => {
                const isPositive = impact >= 0;
                const bar = Math.min(100, Math.abs(impact) / (Math.abs(computed.sensitivityItems[0].impact) + 1) * 100);
                return (
                  <div key={label}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "3px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        {i === 0 && <span style={{ fontSize: "9px", fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Biggest lever</span>}
                        <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>{label}</span>
                      </div>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 700, color: isPositive ? "var(--green)" : "var(--red)", flexShrink: 0 }}>
                        {(isPositive ? "+" : "") + fmtK(impact)}
                      </span>
                    </div>
                    <div style={{ height: "4px", background: "var(--bg-card)", borderRadius: "2px", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${bar}%`, background: isPositive ? "oklch(0.72 0.18 145)" : "oklch(0.70 0.18 25)", borderRadius: "2px" }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <p style={{ fontSize: "10px", color: "var(--text-tertiary)", margin: "10px 0 0", lineHeight: 1.5 }}>Lifetime delta impact from each one-unit change. Ranked by magnitude.</p>
          </div>

          {/* What Would Change the Verdict? */}
          {(computed.minSalaryForSwitch != null || computed.minGrowthForSwitch != null || computed.maxGapForSwitch != null) && (
            <div style={cardS}>
              <p style={sectionHead}>What Would Change the Verdict?</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {computed.minSalaryForSwitch != null && (
                  <div style={{ padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--bg-card)", border: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>Min starting salary for SWITCH</div>
                      <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "2px" }}>{fmtK((computed.minSalaryForSwitch - inputs.new_monthly_income) * 12)}/yr increase needed</div>
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "17px", fontWeight: 700, color: "var(--accent)", flexShrink: 0 }}>{fmt(computed.minSalaryForSwitch)}/mo</div>
                  </div>
                )}
                {computed.minGrowthForSwitch != null && (
                  <div style={{ padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--bg-card)", border: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>Min growth rate for SWITCH</div>
                      <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "2px" }}>+{pct(computed.minGrowthForSwitch - inputs.new_growth_rate)} more than current assumption</div>
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "17px", fontWeight: 700, color: "var(--accent)", flexShrink: 0 }}>{pct(computed.minGrowthForSwitch)}/yr</div>
                  </div>
                )}
                {computed.maxGapForSwitch != null && (
                  <div style={{ padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--bg-card)", border: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>Max income gap to keep SWITCH</div>
                      <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "2px" }}>{computed.maxGapForSwitch - inputs.gap_months} additional months of tolerance</div>
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "17px", fontWeight: 700, color: "oklch(0.72 0.18 145)", flexShrink: 0 }}>{computed.maxGapForSwitch} mo</div>
                  </div>
                )}
              </div>
              <p style={{ fontSize: "10px", color: "var(--text-tertiary)", margin: "10px 0 0", lineHeight: 1.5 }}>Minimum threshold at which the verdict flips to SWITCH with break-even within 7 years.</p>
            </div>
          )}

        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          [data-career-cols] { flex-direction: column !important; overflow: visible !important; }
          [data-career-sidebar] { width: 100% !important; border-right: none !important; border-bottom: 1px solid var(--border-subtle); }
          [data-career-analysis] { overflow-y: visible !important; }
        }
        @media print {
          :root {
            --bg-base: #ffffff;
            --bg-elevated: #f4f6f8;
            --card-bg: #ffffff;
            --card-border: #e2e6ea;
            --border-subtle: #e2e6ea;
            --border: #d1d5db;
            --text-primary: #111827;
            --text-secondary: #374151;
            --text-tertiary: #6b7280;
            --text-muted: #9ca3af;
            --accent: #2563eb;
            --green: #16a34a;
            --red: #dc2626;
            --amber: #d97706;
            --radius-lg: 8px;
            --radius-md: 6px;
            --radius-sm: 4px;
            --radius-xl: 10px;
          }
          [data-print-hide] { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: white; }
          [data-career-cols] { flex-direction: column !important; overflow: visible !important; }
          [data-career-sidebar] { width: 100% !important; border-right: none !important; }
          @page { margin: 16mm; }
        }
      `}</style>
    </div>
  );
}
