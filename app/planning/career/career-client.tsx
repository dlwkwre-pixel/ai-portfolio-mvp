"use client";

import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from "recharts";
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
  if (s >= 90) return "oklch(0.72 0.18 145)";
  if (s >= 75) return "oklch(0.75 0.15 145)";
  if (s >= 60) return "oklch(0.72 0.15 80)";
  return "oklch(0.65 0.18 25)";
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
  border: "1px solid var(--card-border)", background: "var(--bg-elevated)",
  color: "var(--text-primary)", fontSize: "13px", fontFamily: "var(--font-mono)",
  outline: "none", boxSizing: "border-box",
};
const labelS: React.CSSProperties = {
  display: "block", fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em",
  textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "4px",
  fontFamily: "var(--font-body)",
};
const cardS: React.CSSProperties = {
  background: "var(--card-bg)", border: "1px solid var(--card-border)",
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
    current_monthly_income: profile.monthly_income ? Math.round(profile.monthly_income) : base.current_monthly_income,
    new_monthly_income: profile.monthly_income ? Math.round(profile.monthly_income * 0.85) : base.new_monthly_income,
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
  const [showLifestyle, setShowLifestyle] = useState(false);
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
    const timeline = buildCareerTimeline(
      inputs.current_monthly_income,
      inputs.current_growth_rate / 100,
      inputs.new_monthly_income,
      inputs.new_growth_rate / 100,
      inputs.gap_months,
      inputs.transition_cost,
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
    const lifetimeNewGross = lifetimeNewNet + inputs.transition_cost;
    const lifetimeDelta = lifetimeNewNet - lifetimeCurrent;

    // Emergency fund analysis
    const gapCost = inputs.gap_months * inputs.monthly_expenses + inputs.transition_cost;
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

    // Scenario analysis (best/worst)
    const scenarioBest = buildScenarioMetrics(inputs, 2.0, 0.5, 0.7);
    const scenarioWorst = buildScenarioMetrics(inputs, -2.0, 1.5, 1.4);

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
      + (inputs.new_monthly_income >= inputs.current_monthly_income ? 15 : -15),
    ));
    const overallRoiScore = Math.round(
      financialReturnScore * 0.30
      + paybackScore * 0.20
      + transitionRiskScore * 0.15
      + retirementScore * 0.20
      + incomeStabilityScore * 0.15,
    );

    // Verdict
    const highRisk = gapDeficit > inputs.monthly_expenses * 3
      || (runwayMonths < 2 && inputs.gap_months > 6);

    type VerdictType = "SWITCH" | "WAIT" | "STAY" | "HIGH_RISK";
    let verdict: VerdictType;
    let verdictConfidence: "High" | "Medium" | "Low";
    let verdictConditions: string[];

    if (highRisk) {
      verdict = "HIGH_RISK";
      verdictConfidence = "Medium";
      verdictConditions = [
        `Build savings to ${inputs.gap_months + 3}+ months of expenses`,
        "Reduce one-time transition costs if possible",
        "Consider overlapping income sources during transition",
      ];
    } else if (breakEvenYear != null && breakEvenYear <= 7 && lifetimeDelta > 0) {
      verdict = "SWITCH";
      verdictConfidence = breakEvenYear <= 5 && lifetimeDelta > lifetimeCurrent * 0.15 ? "High" : "Medium";
      verdictConditions = [];
    } else if (breakEvenYear != null && breakEvenYear <= 15 && lifetimeDelta > 0) {
      verdict = "WAIT";
      verdictConfidence = breakEvenYear <= 10 ? "Medium" : "Low";
      verdictConditions = [
        `Stay in the new field ${inputs.projection_years}+ years`,
        `Income growth of ${pct(inputs.new_growth_rate)} annually is achieved`,
        ...(inputs.transition_cost > 0 ? [`Transition costs stay below ${fmtK(inputs.transition_cost * 1.25)}`] : []),
      ];
    } else {
      verdict = "STAY";
      verdictConfidence = lifetimeDelta < -lifetimeCurrent * 0.10 ? "High" : "Medium";
      verdictConditions = [];
    }

    // Transition risk level
    let transitionRiskLevel: "LOW" | "MODERATE" | "HIGH";
    if (gapDeficit > inputs.monthly_expenses * 3) transitionRiskLevel = "HIGH";
    else if (gapDeficit > 0 || (inputs.gap_months > 0 && runwayMonths < 4)) transitionRiskLevel = "MODERATE";
    else transitionRiskLevel = "LOW";

    // Rule-based FINN narrative
    let finnNarrative: string;
    if (verdict === "HIGH_RISK") {
      finnNarrative = `The math on this switch can work out long-term, but the transition itself is the real problem. With ${runwayMonths.toFixed(1)} months of runway and a projected cash shortfall of ${fmt(gapDeficit)}, this transition carries real financial risk. Before moving, build savings to at least ${inputs.gap_months + 3} months of expenses. The switch may be right — but the timing isn't.`;
    } else if (verdict === "SWITCH") {
      finnNarrative = `The numbers make a clear case. Breaking even at Year ${breakEvenYear} and generating ${fmtK(lifetimeDelta)} more in lifetime earnings${retirDeltaPp > 0 ? `, with a +${retirDeltaPp}pp retirement improvement,` : ""} puts this firmly in switch territory. The main execution risk is whether the projected ${pct(inputs.new_growth_rate)} annual growth materializes — that assumption carries most of the long-term value.`;
    } else if (verdict === "WAIT") {
      finnNarrative = `This switch pays off eventually, but not for a long time. The current path stays ahead for ${(breakEvenYear ?? inputs.projection_years) - 1} years, and the new path only starts winning in Year ${breakEvenYear}. If staying in the new field for ${inputs.projection_years}+ years is realistic, the ${fmtK(lifetimeDelta)} lifetime advantage justifies it. If not, the current path likely wins on financial terms.`;
    } else {
      finnNarrative = `Financially, staying on the current path appears superior over this ${inputs.projection_years}-year window. The new career generates ${fmtK(Math.abs(lifetimeDelta))} less in total earnings${breakEvenYear == null ? " and never closes the gap" : `, and only breaks even at Year ${breakEvenYear}, leaving little margin`}. Unless lifestyle factors strongly favor the switch, the numbers support staying.`;
    }

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
      verdict, verdictConfidence, verdictConditions,
      transitionRiskLevel,
      finnNarrative,
      ecosystemImpact,
      milestones,
      benchmarkPercentile,
      sensitivityItems,
      minSalaryForSwitch, minGrowthForSwitch, maxGapForSwitch,
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
      current_monthly_income: inputs.current_monthly_income,
      current_growth_rate_pct: inputs.current_growth_rate,
      new_monthly_income: inputs.new_monthly_income,
      new_growth_rate_pct: inputs.new_growth_rate,
      gap_months: inputs.gap_months,
      transition_cost: inputs.transition_cost,
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
    const yr1Delta = (inputs.new_monthly_income - inputs.current_monthly_income) * 12;
    const yr5New = inputs.new_monthly_income * 12 * Math.pow(1 + inputs.new_growth_rate / 100, 5);
    const yr5Current = inputs.current_monthly_income * 12 * Math.pow(1 + inputs.current_growth_rate / 100, 5);
    const yr5Delta = yr5New - yr5Current;
    const result = await addCareerChangeToForecast({
      scenarioName: inputs.name,
      transitionCost: inputs.transition_cost,
      annualIncomeChangeYear1: yr1Delta,
      annualIncomeChangeYear5: yr5Delta,
      currentYear,
    });
    if (result.error) { setForecastStatus("error"); return; }
    setForecastStatus("done");
    setTimeout(() => setForecastStatus("idle"), 4000);
  }

  // ── Verdict styling ────────────────────────────────────────────────────────

  const { verdict, verdictConfidence, verdictConditions } = computed;

  const verdictMeta = {
    SWITCH: {
      label: "SWITCH",
      color: "oklch(0.72 0.18 145)",
      bg: "color-mix(in oklch, oklch(0.55 0.15 145) 12%, transparent)",
      border: "color-mix(in oklch, oklch(0.55 0.15 145) 28%, transparent)",
    },
    WAIT: {
      label: "WAIT",
      color: "oklch(0.78 0.15 80)",
      bg: "color-mix(in oklch, oklch(0.65 0.15 80) 12%, transparent)",
      border: "color-mix(in oklch, oklch(0.65 0.15 80) 28%, transparent)",
    },
    STAY: {
      label: "STAY CURRENT PATH",
      color: "oklch(0.68 0.10 240)",
      bg: "color-mix(in oklch, oklch(0.50 0.10 240) 12%, transparent)",
      border: "color-mix(in oklch, oklch(0.50 0.10 240) 28%, transparent)",
    },
    HIGH_RISK: {
      label: "HIGH RISK",
      color: "oklch(0.70 0.18 25)",
      bg: "color-mix(in oklch, oklch(0.55 0.18 25) 12%, transparent)",
      border: "color-mix(in oklch, oklch(0.55 0.18 25) 30%, transparent)",
    },
  }[verdict];

  const incomeDeltaYear1 = inputs.new_monthly_income - inputs.current_monthly_income;
  const isPayCut = incomeDeltaYear1 < 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ flex: 1, overflowY: "auto", color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>

      {/* Header */}
      <div style={{
        padding: "12px 24px", borderBottom: "1px solid var(--border-subtle)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "var(--bg-base)", position: "sticky", top: 0, zIndex: 10, gap: "12px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Link href="/planning" style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px", color: "var(--text-muted)", textDecoration: "none" }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10 3L5 8l5 5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Planning
          </Link>
          <span style={{ color: "var(--border)" }}>/</span>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>Career Change</span>
        </div>
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

      {/* Scenario tabs */}
      <div style={{ padding: "0 24px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", gap: "4px", overflowX: "auto" }}>
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

      {/* ─── BUYTUNE VERDICT CARD ─────────────────────────────────────────────── */}
      <div style={{ padding: "16px 24px 0" }}>
        <div style={{
          borderRadius: "var(--radius-lg)",
          padding: "20px 24px",
          background: verdictMeta.bg,
          border: `1px solid ${verdictMeta.border}`,
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: "200px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.10em", color: "var(--text-muted)" }}>BuyTune Verdict</span>
                <span style={{
                  fontSize: "10px", fontWeight: 600, padding: "2px 8px",
                  borderRadius: "99px",
                  background: verdictMeta.border,
                  color: verdictMeta.color,
                }}>
                  {verdictConfidence} Confidence
                </span>
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "30px", fontWeight: 800, color: verdictMeta.color, letterSpacing: "-0.01em", lineHeight: 1.1 }}>
                {verdictMeta.label}
              </div>

              {/* Verdict supporting stats */}
              {(verdict === "SWITCH" || verdict === "WAIT") && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", marginTop: "10px" }}>
                  <div>
                    <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)" }}>Lifetime Advantage</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "15px", fontWeight: 700, color: computed.lifetimeDelta >= 0 ? verdictMeta.color : "var(--red)" }}>
                      {(computed.lifetimeDelta >= 0 ? "+" : "") + fmtK(computed.lifetimeDelta)}
                    </div>
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
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: "15px", fontWeight: 700, color: computed.retirDeltaPp >= 0 ? verdictMeta.color : "var(--red)" }}>
                        {computed.retirDeltaPp >= 0 ? "+" : ""}{computed.retirDeltaPp}pp
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* WAIT conditions */}
              {(verdict === "WAIT" || verdict === "HIGH_RISK") && verdictConditions.length > 0 && (
                <div style={{ marginTop: "10px" }}>
                  <div style={{ fontSize: "10px", color: "var(--text-muted)", marginBottom: "5px" }}>
                    {verdict === "WAIT" ? "Switch becomes worthwhile if:" : "Before you make the move:"}
                  </div>
                  {verdictConditions.map((c, i) => (
                    <div key={i} style={{ display: "flex", gap: "7px", alignItems: "flex-start", marginTop: "3px" }}>
                      <span style={{ color: verdictMeta.color, fontSize: "11px", marginTop: "1px" }}>✓</span>
                      <span style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.4 }}>{c}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* STAY explanation */}
              {verdict === "STAY" && (
                <div style={{ marginTop: "8px", fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                  Current path generates {fmtK(Math.abs(computed.lifetimeDelta))} more over {inputs.projection_years} years.
                  {computed.breakEvenYear == null ? " The new career never breaks even within the projection window." : ""}
                </div>
              )}
            </div>

            {/* Add to Forecast (P1) */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: "160px", alignItems: "flex-end" }}>
              <button
                type="button"
                onClick={handleAddToForecast}
                disabled={forecastStatus === "adding" || forecastStatus === "done"}
                style={{
                  padding: "8px 16px", borderRadius: "var(--radius-md)",
                  border: `1px solid ${verdictMeta.border}`,
                  background: forecastStatus === "done"
                    ? "color-mix(in oklch, oklch(0.55 0.15 145) 15%, transparent)"
                    : "color-mix(in oklch, oklch(0.50 0.08 240) 10%, transparent)",
                  color: forecastStatus === "done" ? "oklch(0.72 0.18 145)" : verdictMeta.color,
                  fontFamily: "var(--font-body)", fontSize: "11px", fontWeight: 700,
                  cursor: forecastStatus === "adding" || forecastStatus === "done" ? "default" : "pointer",
                  opacity: forecastStatus === "adding" ? 0.6 : 1,
                  whiteSpace: "nowrap",
                }}
              >
                {forecastStatus === "adding" ? "Adding…"
                  : forecastStatus === "done" ? "Added to Forecast"
                  : forecastStatus === "error" ? "Try Again"
                  : "Add to Forecast →"}
              </button>
              {forecastStatus === "done" && (
                <div style={{ fontSize: "10px", color: "var(--text-muted)", textAlign: "right", lineHeight: 1.4 }}>
                  Events created in{" "}
                  <a href="/planning" style={{ color: "var(--accent)", textDecoration: "none" }}>Planning</a>
                </div>
              )}
            </div>

            {/* Score ring */}
            <div style={{ textAlign: "center", minWidth: "72px" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "42px", fontWeight: 800, color: verdictMeta.color, lineHeight: 1 }}>
                {overallScore}
              </div>
              <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "2px", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                {lifestyleEngaged ? "Overall" : "Score"}
              </div>
              {lifestyleEngaged && (
                <div style={{ fontSize: "9px", color: "var(--text-tertiary)", marginTop: "3px" }}>
                  {computed.overallRoiScore} fin / {lifestyleScore} life
                </div>
              )}
              <div style={{ fontSize: "9px", color: scoreColor(overallScore), marginTop: "2px", fontWeight: 600 }}>
                {scoreLabel(overallScore)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main layout */}
      <div data-career-grid style={{ display: "grid", gridTemplateColumns: "minmax(280px, 360px) 1fr", gap: "20px", padding: "16px 24px 20px", alignItems: "start" }}>

        {/* ── LEFT: Inputs ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <label style={labelS}>Scenario Name</label>
            <input value={inputs.name} onChange={(e) => set("name", e.target.value)} style={inputS} />
          </div>

          {/* Income delta indicator */}
          {inputs.current_monthly_income > 0 && (
            <div style={{
              padding: "9px 12px", borderRadius: "var(--radius-md)",
              background: isPayCut
                ? "color-mix(in oklch, oklch(0.45 0.18 25) 12%, transparent)"
                : "color-mix(in oklch, oklch(0.55 0.15 155) 10%, transparent)",
              border: `1px solid ${isPayCut
                ? "color-mix(in oklch, oklch(0.45 0.18 25) 28%, transparent)"
                : "color-mix(in oklch, oklch(0.55 0.15 155) 22%, transparent)"}`,
              display: "flex", alignItems: "flex-start", gap: "8px",
            }}>
              <div style={{
                width: "16px", height: "16px", borderRadius: "50%", flexShrink: 0, marginTop: "1px",
                background: isPayCut ? "oklch(0.45 0.18 25)" : "oklch(0.55 0.15 155)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <span style={{ fontSize: "9px", color: "#fff", fontWeight: 700 }}>{isPayCut ? "▼" : "▲"}</span>
              </div>
              <div>
                <div style={{ fontSize: "11px", fontWeight: 600, color: isPayCut ? "oklch(0.75 0.12 25)" : "oklch(0.80 0.12 155)", fontFamily: "var(--font-body)" }}>
                  {isPayCut
                    ? `Pay cut: ${fmt(Math.abs(incomeDeltaYear1))}/mo in year 1`
                    : `Pay raise: +${fmt(incomeDeltaYear1)}/mo from day one`}
                </div>
                <div style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginTop: "2px" }}>
                  {inputs.new_growth_rate > inputs.current_growth_rate
                    ? `New path grows ${pct(inputs.new_growth_rate - inputs.current_growth_rate)} faster annually`
                    : inputs.new_growth_rate === inputs.current_growth_rate
                    ? "Same growth rate as current path"
                    : `Current path grows ${pct(inputs.current_growth_rate - inputs.new_growth_rate)} faster annually`}
                </div>
              </div>
            </div>
          )}

          {/* Current path */}
          <div style={cardS}>
            <p style={sectionHead}>Current Path</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div>
                <label style={labelS}>Monthly Income</label>
                <input type="number" min="0" value={inputs.current_monthly_income} onChange={num("current_monthly_income")} style={inputS} />
              </div>
              <div>
                <label style={labelS}>Annual Income Growth (%)</label>
                <input type="number" min="0" max="30" step="0.1" value={inputs.current_growth_rate} onChange={num("current_growth_rate")} style={inputS} />
              </div>
            </div>
          </div>

          {/* New career */}
          <div style={cardS}>
            <p style={sectionHead}>New Career</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div>
                <label style={labelS}>Year 1 Monthly Income</label>
                <input type="number" min="0" value={inputs.new_monthly_income} onChange={num("new_monthly_income")} style={inputS} />
              </div>
              <div>
                <label style={labelS}>Annual Income Growth (%)</label>
                <input type="number" min="0" max="30" step="0.1" value={inputs.new_growth_rate} onChange={num("new_growth_rate")} style={inputS} />
              </div>
            </div>
          </div>

          {/* Transition */}
          <div style={cardS}>
            <p style={sectionHead}>Transition Details</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div>
                <label style={labelS}>Income Gap (months)</label>
                <input type="number" min="0" max="60" value={inputs.gap_months} onChange={num("gap_months")} style={inputS} />
              </div>
              <div>
                <label style={labelS}>One-time Transition Cost</label>
                <input type="number" min="0" value={inputs.transition_cost} onChange={num("transition_cost")} style={inputS} />
              </div>
            </div>
          </div>

          {/* Context */}
          <div style={cardS}>
            <p style={sectionHead}>Context</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div>
                <label style={labelS}>Monthly Expenses</label>
                <input type="number" min="0" value={inputs.monthly_expenses} onChange={num("monthly_expenses")} style={inputS} />
              </div>
              <div>
                <label style={labelS}>Liquid Savings (emergency fund)</label>
                <input type="number" min="0" value={inputs.liquid_assets} onChange={num("liquid_assets")} style={inputS} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                <div>
                  <label style={labelS}>Investment Return (%)</label>
                  <input type="number" min="0" max="30" step="0.1" value={inputs.investment_return} onChange={num("investment_return")} style={inputS} />
                </div>
                <div>
                  <label style={labelS}>Projection (years)</label>
                  <input type="number" min="5" max="40" value={inputs.projection_years} onChange={num("projection_years")} style={inputS} />
                </div>
              </div>
            </div>
          </div>

          {/* Lifestyle factors (P7) */}
          <div style={cardS}>
            <button
              type="button"
              onClick={() => setShowLifestyle((p) => !p)}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "var(--font-body)" }}
            >
              <p style={{ ...sectionHead, margin: 0 }}>Lifestyle Factors</p>
              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{showLifestyle ? "▲" : "▼"}</span>
            </button>
            {!showLifestyle && (
              <p style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "6px" }}>
                Rate the new career on 6 lifestyle dimensions to get a combined career score.
              </p>
            )}
            {showLifestyle && (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "12px" }}>
                {LIFESTYLE_FACTORS.map(({ key, label }) => (
                  <div key={key}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                      <label style={{ ...labelS, margin: 0 }}>{label}</label>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 700, color: lifestyle[key] >= 7 ? "var(--green)" : lifestyle[key] <= 3 ? "var(--red)" : "var(--text-secondary)" }}>
                        {lifestyle[key]}/10
                      </span>
                    </div>
                    <input
                      type="range" min="1" max="10" value={lifestyle[key]}
                      onChange={(e) => setLifestyle((p) => ({ ...p, [key]: Number(e.target.value) }))}
                      style={{ width: "100%", accentColor: "var(--accent)" }}
                    />
                  </div>
                ))}
                <div style={{
                  marginTop: "4px", padding: "10px 12px", borderRadius: "var(--radius-md)",
                  background: "var(--bg-elevated)", border: "1px solid var(--card-border)",
                  display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", textAlign: "center",
                }}>
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
            )}
          </div>
        </div>

        {/* ── RIGHT: Analysis ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

          {/* P8: Future Path Comparison */}
          <div style={cardS}>
            <p style={sectionHead}>Choosing Between Futures</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              {[
                {
                  title: "Current Career",
                  yr10: computed.pt10?.currentIncome ?? 0,
                  retirAssets: computed.nwCurrentPath,
                  retirProb: computed.retirCurrentProb,
                  risk: "Low",
                  riskColor: "var(--green)",
                  accent: "#94a3b8",
                  border: "rgba(148,163,184,0.2)",
                },
                {
                  title: "New Career",
                  yr10: computed.pt10?.newIncome ?? 0,
                  retirAssets: computed.nwNewPath,
                  retirProb: computed.retirNewProb,
                  risk: computed.transitionRiskLevel === "LOW" ? "Moderate" : computed.transitionRiskLevel === "MODERATE" ? "Moderate" : "High",
                  riskColor: computed.transitionRiskLevel === "LOW" ? "var(--amber)" : computed.transitionRiskLevel === "MODERATE" ? "var(--amber)" : "var(--red)",
                  accent: "#3b82f6",
                  border: "rgba(59,130,246,0.22)",
                },
              ].map(({ title, yr10, retirAssets, retirProb, risk, riskColor, accent, border }) => (
                <div key={title} style={{
                  padding: "14px", borderRadius: "var(--radius-md)",
                  background: "var(--bg-elevated)", border: `1px solid ${border}`,
                }}>
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
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: "17px", fontWeight: 700, marginTop: "2px", color: retirProb >= 80 ? "var(--green)" : retirProb >= 60 ? "var(--amber)" : "var(--red)" }}>
                          {retirProb}%
                        </div>
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

          {/* P2: Career Milestone Timeline */}
          <div style={cardS}>
            <p style={sectionHead}>Career Timeline</p>
            <div style={{ position: "relative", paddingLeft: "20px" }}>
              <div style={{
                position: "absolute", left: "7px", top: "8px", bottom: "8px",
                width: "2px", background: "var(--border-subtle)", borderRadius: "1px",
              }} />
              {computed.milestones.map((m, i) => {
                const dotColor = m.type === "breakeven" ? "oklch(0.72 0.18 145)"
                  : m.type === "retirement" ? "oklch(0.72 0.15 280)"
                  : m.type === "gap" ? "oklch(0.70 0.18 25)"
                  : m.type === "income" ? "oklch(0.78 0.15 145)"
                  : m.type === "now" ? "var(--accent)"
                  : "var(--text-muted)";
                return (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "10px", marginBottom: "14px", position: "relative" }}>
                    <div style={{
                      width: "8px", height: "8px", borderRadius: "50%",
                      background: dotColor, flexShrink: 0, marginTop: "4px", zIndex: 1,
                      boxShadow: `0 0 0 2px var(--card-bg)`,
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "8px" }}>
                        <span style={{ fontSize: "12px", fontWeight: 600, color: dotColor }}>{m.label}</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 700, color: "var(--text-secondary)", flexShrink: 0 }}>
                          {m.year === 0 ? "Now" : `Yr ${m.year}`}
                        </span>
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
              <div style={{
                fontFamily: "var(--font-mono)", fontSize: "40px", fontWeight: 800, lineHeight: 1,
                color: computed.lifetimeDelta >= 0 ? "var(--green)" : "var(--red)",
              }}>
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
            <p style={{ fontSize: "10px", color: "var(--text-tertiary)", margin: "8px 0 0" }}>
              Cumulative income over {inputs.projection_years} years, adjusted for transition costs.
            </p>
          </div>

          {/* P3: Career ROI Score */}
          <div style={cardS}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "14px" }}>
              <p style={{ ...sectionHead, margin: 0 }}>Career Change Score</p>
              <div style={{ textAlign: "right" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "24px", fontWeight: 800, color: scoreColor(computed.overallRoiScore) }}>
                  {computed.overallRoiScore}
                </span>
                <span style={{ fontSize: "12px", color: "var(--text-muted)" }}> / 100</span>
                <div style={{ fontSize: "9px", color: scoreColor(computed.overallRoiScore), fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {scoreLabel(computed.overallRoiScore)}
                </div>
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
                  <div style={{ height: "4px", background: "var(--bg-elevated)", borderRadius: "2px", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.round(score)}%`, background: scoreColor(score), borderRadius: "2px" }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* P4: Benchmarking Engine */}
          <div style={cardS}>
            <p style={sectionHead}>People Like You</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", marginBottom: "14px" }}>
              {[
                { pct: "63%", label: "Improved", color: "oklch(0.72 0.18 145)", bg: "color-mix(in oklch, oklch(0.55 0.15 145) 10%, transparent)" },
                { pct: "22%", label: "Broke Even", color: "oklch(0.68 0.12 240)", bg: "color-mix(in oklch, oklch(0.50 0.10 240) 10%, transparent)" },
                { pct: "15%", label: "Worse Off", color: "oklch(0.70 0.18 25)", bg: "color-mix(in oklch, oklch(0.55 0.18 25) 10%, transparent)" },
              ].map(({ pct: p, label, color, bg }) => (
                <div key={label} style={{ padding: "12px", borderRadius: "var(--radius-md)", background: bg, textAlign: "center" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "22px", fontWeight: 800, color }}>{p}</div>
                  <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginTop: "2px" }}>{label}</div>
                </div>
              ))}
            </div>
            <div style={{ padding: "12px 14px", borderRadius: "var(--radius-md)", background: "var(--bg-elevated)", border: "1px solid var(--card-border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>Your projected outcome</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 700, color: scoreColor(computed.overallRoiScore) }}>
                  Top {100 - computed.benchmarkPercentile}%
                </span>
              </div>
              <div style={{ marginTop: "8px", height: "6px", background: "var(--border-subtle)", borderRadius: "3px", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${computed.benchmarkPercentile}%`, background: scoreColor(computed.overallRoiScore), borderRadius: "3px" }} />
              </div>
              <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "6px" }}>
                Based on career ROI score of {computed.overallRoiScore}. Comparable transitions to similar fields.
              </div>
            </div>
          </div>

          {/* P5: Best / Expected / Worst Case */}
          <div style={cardS}>
            <p style={sectionHead}>Outcome Scenarios</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
              {[
                {
                  label: "Best Case",
                  be: computed.scenarioBest.breakEvenYear,
                  delta: computed.scenarioBest.lifetimeDelta,
                  bg: "color-mix(in oklch, oklch(0.55 0.15 145) 8%, var(--bg-elevated))",
                  border: "color-mix(in oklch, oklch(0.55 0.15 145) 25%, transparent)",
                  color: "oklch(0.72 0.18 145)",
                },
                {
                  label: "Expected Case",
                  be: computed.breakEvenYear,
                  delta: computed.lifetimeDelta,
                  bg: "color-mix(in oklch, oklch(0.50 0.10 240) 8%, var(--bg-elevated))",
                  border: "color-mix(in oklch, oklch(0.50 0.10 240) 25%, transparent)",
                  color: "oklch(0.68 0.12 240)",
                },
                {
                  label: "Worst Case",
                  be: computed.scenarioWorst.breakEvenYear,
                  delta: computed.scenarioWorst.lifetimeDelta,
                  bg: "color-mix(in oklch, oklch(0.55 0.18 25) 8%, var(--bg-elevated))",
                  border: "color-mix(in oklch, oklch(0.55 0.18 25) 25%, transparent)",
                  color: "oklch(0.70 0.18 25)",
                },
              ].map(({ label, be, delta, bg, border, color }) => (
                <div key={label} style={{ padding: "12px", borderRadius: "var(--radius-md)", background: bg, border: `1px solid ${border}` }}>
                  <p style={{ fontSize: "10px", fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "10px" }}>{label}</p>
                  <div style={{ marginBottom: "8px" }}>
                    <div style={{ fontSize: "9px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Break-even</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "15px", fontWeight: 700, color: "var(--text-primary)", marginTop: "2px" }}>
                      {be != null ? `Year ${be}` : "Never"}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "9px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Lifetime Impact</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "15px", fontWeight: 700, marginTop: "2px", color: delta >= 0 ? "oklch(0.72 0.18 145)" : "oklch(0.70 0.18 25)" }}>
                      {(delta >= 0 ? "+" : "") + fmtK(delta)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: "10px", color: "var(--text-tertiary)", margin: "10px 0 0", lineHeight: 1.5 }}>
              Best: +2pp growth, half the income gap, 70% of transition cost. Worst: -2pp growth, 1.5x gap, 140% of transition cost.
            </p>
          </div>

          {/* P3: Regret Risk Analysis */}
          <div style={cardS}>
            <p style={sectionHead}>Regret Risk</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{
                padding: "12px 14px", borderRadius: "var(--radius-md)",
                background: `color-mix(in oklch, ${regretColor(financialRegretLevel)} 8%, transparent)`,
                border: `1px solid color-mix(in oklch, ${regretColor(financialRegretLevel)} 25%, transparent)`,
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                  <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)" }}>Financial Regret</span>
                  <span style={{ fontSize: "11px", fontWeight: 800, color: regretColor(financialRegretLevel), letterSpacing: "0.05em" }}>{financialRegretLevel}</span>
                </div>
                <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>{financialRegretText}</p>
              </div>
              {lifestyleRegretLevel && lifestyleRegretText && (
                <div style={{
                  padding: "12px 14px", borderRadius: "var(--radius-md)",
                  background: `color-mix(in oklch, ${regretColor(lifestyleRegretLevel)} 8%, transparent)`,
                  border: `1px solid color-mix(in oklch, ${regretColor(lifestyleRegretLevel)} 25%, transparent)`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                    <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)" }}>Lifestyle Regret</span>
                    <span style={{ fontSize: "11px", fontWeight: 800, color: regretColor(lifestyleRegretLevel), letterSpacing: "0.05em" }}>{lifestyleRegretLevel}</span>
                  </div>
                  <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>{lifestyleRegretText}</p>
                </div>
              )}
              {!lifestyleEngaged && (
                <p style={{ fontSize: "10px", color: "var(--text-tertiary)", margin: 0 }}>
                  Rate lifestyle factors to unlock Lifestyle Regret analysis.
                </p>
              )}
            </div>
          </div>

          {/* Transition Risk */}
          <div style={{
            ...cardS,
            background: computed.transitionRiskLevel === "HIGH"
              ? "color-mix(in oklch, oklch(0.40 0.18 25) 10%, var(--card-bg))"
              : computed.transitionRiskLevel === "MODERATE"
              ? "color-mix(in oklch, oklch(0.60 0.14 80) 8%, var(--card-bg))"
              : "color-mix(in oklch, oklch(0.55 0.15 155) 8%, var(--card-bg))",
            borderColor: computed.transitionRiskLevel === "HIGH"
              ? "color-mix(in oklch, oklch(0.45 0.18 25) 30%, transparent)"
              : computed.transitionRiskLevel === "MODERATE"
              ? "color-mix(in oklch, oklch(0.60 0.14 80) 28%, transparent)"
              : "color-mix(in oklch, oklch(0.55 0.15 155) 25%, transparent)",
          }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "12px" }}>
              <p style={{ ...sectionHead, margin: 0 }}>Transition Risk</p>
              <span style={{
                fontSize: "11px", fontWeight: 800, letterSpacing: "0.05em",
                color: computed.transitionRiskLevel === "HIGH" ? "oklch(0.70 0.18 25)"
                  : computed.transitionRiskLevel === "MODERATE" ? "oklch(0.78 0.15 80)"
                  : "oklch(0.72 0.18 145)",
              }}>
                {computed.transitionRiskLevel} RISK
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
              {[
                {
                  label: "Emergency Fund",
                  value: `${computed.runwayMonths.toFixed(1)} mo`,
                  sub: computed.runwayMonths >= 6 ? "Adequate" : computed.runwayMonths >= 3 ? "Thin" : "Insufficient",
                  color: computed.runwayMonths >= 6 ? "var(--green)" : computed.runwayMonths >= 3 ? "var(--amber)" : "var(--red)",
                },
                {
                  label: "Income Gap",
                  value: inputs.gap_months > 0 ? `${inputs.gap_months} mo` : "None",
                  sub: inputs.gap_months > 0 ? fmt(inputs.gap_months * inputs.monthly_expenses) + " cost" : "No gap",
                  color: inputs.gap_months === 0 ? "var(--green)" : inputs.gap_months <= 3 ? "var(--amber)" : "var(--red)",
                },
                {
                  label: computed.gapDeficit > 0 ? "Cash Shortfall" : "Runway",
                  value: computed.gapDeficit > 0 ? fmt(computed.gapDeficit) : fmt(inputs.liquid_assets - computed.gapCost),
                  sub: computed.gapDeficit > 0 ? "additional savings needed" : "remaining after gap",
                  color: computed.gapDeficit > 0 ? "var(--red)" : "var(--green)",
                },
              ].map(({ label, value, sub, color }) => (
                <div key={label}>
                  <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: "3px" }}>{label}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 700, color }}>{value}</div>
                  <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "2px" }}>{sub}</div>
                </div>
              ))}
            </div>
          </div>

          {/* P6: Decision Sensitivity Analysis */}
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
                    <div style={{ height: "4px", background: "var(--bg-elevated)", borderRadius: "2px", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${bar}%`, background: isPositive ? "oklch(0.72 0.18 145)" : "oklch(0.70 0.18 25)", borderRadius: "2px" }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <p style={{ fontSize: "10px", color: "var(--text-tertiary)", margin: "10px 0 0", lineHeight: 1.5 }}>
              Lifetime delta impact from each one-unit change. Ranked by magnitude.
            </p>
          </div>

          {/* P7: What Would Need to Change? */}
          {(computed.minSalaryForSwitch != null || computed.minGrowthForSwitch != null || computed.maxGapForSwitch != null) && (
            <div style={cardS}>
              <p style={sectionHead}>What Would Change the Verdict?</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {computed.minSalaryForSwitch != null && (
                  <div style={{ padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--bg-elevated)", border: "1px solid var(--card-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>Min starting salary for SWITCH</div>
                      <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "2px" }}>
                        {fmtK((computed.minSalaryForSwitch - inputs.new_monthly_income) * 12)}/yr increase needed
                      </div>
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "17px", fontWeight: 700, color: "var(--accent)", flexShrink: 0 }}>
                      {fmt(computed.minSalaryForSwitch)}/mo
                    </div>
                  </div>
                )}
                {computed.minGrowthForSwitch != null && (
                  <div style={{ padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--bg-elevated)", border: "1px solid var(--card-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>Min growth rate for SWITCH</div>
                      <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "2px" }}>
                        +{pct(computed.minGrowthForSwitch - inputs.new_growth_rate)} more than current assumption
                      </div>
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "17px", fontWeight: 700, color: "var(--accent)", flexShrink: 0 }}>
                      {pct(computed.minGrowthForSwitch)}/yr
                    </div>
                  </div>
                )}
                {computed.maxGapForSwitch != null && (
                  <div style={{ padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--bg-elevated)", border: "1px solid var(--card-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>Max income gap to keep SWITCH</div>
                      <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "2px" }}>
                        {computed.maxGapForSwitch - inputs.gap_months} additional months of tolerance
                      </div>
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "17px", fontWeight: 700, color: "oklch(0.72 0.18 145)", flexShrink: 0 }}>
                      {computed.maxGapForSwitch} mo
                    </div>
                  </div>
                )}
              </div>
              <p style={{ fontSize: "10px", color: "var(--text-tertiary)", margin: "10px 0 0", lineHeight: 1.5 }}>
                Minimum threshold at which the verdict flips to SWITCH with break-even within 7 years.
              </p>
            </div>
          )}

          {/* Retirement Impact */}
          {computed.retirCurrentProb != null && computed.retirNewProb != null && (
            <div style={cardS}>
              <p style={sectionHead}>Retirement Impact</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: "12px" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "24px", fontWeight: 700, color: "var(--text-secondary)" }}>{computed.retirCurrentProb}%</div>
                  <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "2px" }}>Staying</div>
                  <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "1px", fontFamily: "var(--font-mono)" }}>{fmtK(computed.nwCurrentPath)}</div>
                </div>
                <svg width="24" height="14" viewBox="0 0 24 14" fill="none">
                  <path d="M1 7h22M16 1l6 6-6 6" stroke={computed.retirNewProb >= computed.retirCurrentProb ? "var(--green)" : "var(--amber)"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "24px", fontWeight: 700, color: computed.retirNewProb >= computed.retirCurrentProb ? "var(--green)" : "var(--amber)" }}>
                    {computed.retirNewProb}%
                  </div>
                  <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "2px" }}>
                    New path ({computed.retirDeltaPp > 0 ? "+" : ""}{computed.retirDeltaPp}pp)
                  </div>
                  <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "1px", fontFamily: "var(--font-mono)" }}>{fmtK(computed.nwNewPath)}</div>
                </div>
              </div>
              <p style={{ fontSize: "11px", color: "var(--text-tertiary)", margin: "10px 0 0", lineHeight: 1.5 }}>
                Projected net worth at retirement age {profile?.target_retirement_age}. Based on annual savings differences compounded at {pct(inputs.investment_return)}.
              </p>
            </div>
          )}

          {/* P9: BuyTune Ecosystem Impact */}
          {computed.ecosystemImpact && (
            <div style={cardS}>
              <p style={sectionHead}>Impact Across BuyTune</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "10px" }}>
                {[
                  {
                    label: "Retirement Probability",
                    value: computed.ecosystemImpact.retirProbDelta !== 0
                      ? `${computed.ecosystemImpact.retirProbDelta >= 0 ? "+" : ""}${computed.ecosystemImpact.retirProbDelta}pp`
                      : "No change",
                    sub: "retirement on track",
                    icon: "◎",
                    color: computed.ecosystemImpact.retirProbDelta >= 0 ? "var(--green)" : "var(--red)",
                  },
                  {
                    label: "Home Affordability",
                    value: computed.ecosystemImpact.homeAffordabilityDelta > 0
                      ? `+${fmtK(computed.ecosystemImpact.homeAffordabilityDelta)}`
                      : "No change",
                    sub: "additional home budget",
                    icon: "⌂",
                    color: computed.ecosystemImpact.homeAffordabilityDelta > 0 ? "var(--green)" : "var(--text-muted)",
                  },
                  {
                    label: "Monthly Savings",
                    value: `${computed.ecosystemImpact.monthlySavingsDelta >= 0 ? "+" : ""}${fmt(computed.ecosystemImpact.monthlySavingsDelta)}/mo`,
                    sub: "at year 5 income level",
                    icon: "$",
                    color: computed.ecosystemImpact.monthlySavingsDelta >= 0 ? "var(--green)" : "var(--red)",
                  },
                  {
                    label: "Financial Independence",
                    value: computed.ecosystemImpact.fiYearsSooner > 0
                      ? `~${computed.ecosystemImpact.fiYearsSooner} yrs sooner`
                      : "No improvement",
                    sub: "estimated at 7% return",
                    icon: "→",
                    color: computed.ecosystemImpact.fiYearsSooner > 0 ? "var(--green)" : "var(--text-muted)",
                  },
                ].map(({ label, value, sub, icon, color }) => (
                  <div key={label} style={{ padding: "12px", borderRadius: "var(--radius-md)", background: "var(--bg-elevated)", border: "1px solid var(--card-border)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                      <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{icon}</span>
                      <span style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>{label}</span>
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 700, color }}>{value}</div>
                    <div style={{ fontSize: "9px", color: "var(--text-tertiary)", marginTop: "2px" }}>{sub}</div>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: "10px", color: "var(--text-tertiary)", margin: "8px 0 0", lineHeight: 1.5 }}>
                Estimates based on year-5 income projections. Home affordability uses 28% DTI and 7% mortgage rate.
              </p>
            </div>
          )}

          {/* P6: FINN — auto narrative + AI deep analysis */}
          <div style={cardS}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="8" stroke="#7c3aed" strokeWidth="1.5" />
                <path d="M7 9c0-1.657 1.343-3 3-3s3 1.343 3 3c0 1.5-1 2.5-2.5 3V13.5" stroke="#7c3aed" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="10" cy="15.5" r="0.75" fill="#7c3aed" />
              </svg>
              <p style={{ ...sectionHead, margin: 0 }}>FINN&apos;s Take</p>
            </div>

            {/* Rule-based narrative always shown */}
            <div style={{
              padding: "12px 14px",
              borderRadius: "var(--radius-md)",
              background: "color-mix(in oklch, #7c3aed 7%, transparent)",
              border: `1px solid ${verdictMeta.border}`,
              marginBottom: finnCommentary ? "12px" : "0",
            }}>
              <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.65, margin: 0 }}>
                {computed.finnNarrative}
              </p>
            </div>

            {/* AI deep analysis */}
            {finnCommentary ? (
              <div style={{ marginTop: "12px" }}>
                <p style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "#7c3aed", marginBottom: "6px" }}>Deep AI Analysis</p>
                <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.65, margin: 0 }}>{finnCommentary}</p>
                <button type="button" onClick={() => setFinnCommentary(null)} style={{ marginTop: "8px", fontSize: "10px", color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0, fontFamily: "var(--font-body)" }}>
                  Refresh
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={fetchFinnCommentary}
                disabled={finnLoading}
                style={{
                  marginTop: "10px", display: "flex", alignItems: "center", gap: "7px",
                  padding: "7px 14px", borderRadius: "var(--radius-xl)",
                  border: "1px solid rgba(109,40,217,0.22)", background: "rgba(109,40,217,0.07)",
                  color: "#7c3aed", fontFamily: "var(--font-body)", fontSize: "12px",
                  fontWeight: 600, cursor: finnLoading ? "default" : "pointer", opacity: finnLoading ? 0.7 : 1,
                }}
              >
                <svg width="12" height="12" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="8" stroke="#7c3aed" strokeWidth="1.5" />
                  <path d="M7 9c0-1.657 1.343-3 3-3s3 1.343 3 3c0 1.5-1 2.5-2.5 3V13.5" stroke="#7c3aed" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="10" cy="15.5" r="0.75" fill="#7c3aed" />
                </svg>
                {finnLoading ? "FINN is thinking…" : "Get Deep AI Analysis"}
              </button>
            )}
          </div>

          {/* Income trajectory chart */}
          <div style={cardS}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
              <p style={{ ...sectionHead, margin: 0 }}>Income Trajectory</p>
              <div style={{ display: "flex", gap: "4px" }}>
                {(["annual", "cumulative"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setChartMode(m)}
                    style={{
                      padding: "3px 8px", borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border)",
                      background: chartMode === m ? "var(--accent)" : "transparent",
                      color: chartMode === m ? "#fff" : "var(--text-muted)",
                      fontSize: "10px", cursor: "pointer", fontFamily: "var(--font-body)",
                    }}
                  >
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
                  <Tooltip
                    contentStyle={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "8px", fontSize: "11px" }}
                    formatter={(v) => typeof v === "number" ? fmt(v) : String(v ?? "")}
                  />
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

        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          [data-career-grid] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
