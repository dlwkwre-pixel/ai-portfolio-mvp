"use client";

import { useState, useTransition, useMemo } from "react";
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { saveEducationScenario, deleteEducationScenario } from "./education-actions";
import type { EducationScenario } from "./education-actions";
import type { FinancialProfile } from "@/app/planning/planning-actions";
import type { EducationFinnRequest } from "@/app/api/planning/education-finn/route";

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number) { return "$" + Math.round(n).toLocaleString("en-US"); }
function fmtK(n: number) {
  if (Math.abs(n) >= 1_000_000) return "$" + (n / 1_000_000).toFixed(1) + "M";
  if (Math.abs(n) >= 1_000)     return "$" + Math.round(n / 1_000) + "K";
  return "$" + Math.round(n);
}

// ── Math ──────────────────────────────────────────────────────────────────────

function fvCalc(pv: number, pmt: number, years: number, r: number): number {
  if (years <= 0) return pv;
  const mr = r / 12;
  const mo = years * 12;
  if (mr === 0) return pv + pmt * mo;
  return pv * Math.pow(1 + mr, mo) + pmt * ((Math.pow(1 + mr, mo) - 1) / mr);
}

function retirProb(nw: number, annualExpenses: number): number {
  const needed = annualExpenses * 25;
  if (needed <= 0) return 100;
  const ratio = nw / needed;
  if (ratio >= 1.5) return 99;
  if (ratio >= 1.2) return 95;
  if (ratio >= 1.0) return 87;
  if (ratio >= 0.8) return 74;
  if (ratio >= 0.6) return 58;
  if (ratio >= 0.4) return 40;
  return 20;
}

// ── Presets (P5) ─────────────────────────────────────────────────────────────

type Preset = { label: string; annualCost: number; inflation: number; years: number };
const PRESETS: Record<string, Preset> = {
  "public-in-state": { label: "Public In-State",      annualCost: 28000, inflation: 0.04, years: 4 },
  "public-oos":      { label: "Public Out-of-State",  annualCost: 45000, inflation: 0.05, years: 4 },
  "private":         { label: "Private University",   annualCost: 60000, inflation: 0.05, years: 4 },
  "community":       { label: "Community + Transfer", annualCost: 18000, inflation: 0.03, years: 2 },
  "custom":          { label: "Custom",               annualCost: 35000, inflation: 0.05, years: 4 },
};

// ── Verdict (P1) ──────────────────────────────────────────────────────────────

type VerdictType = "FULLY_FUNDED" | "ON_TRACK" | "PARTIALLY_FUNDED" | "UNDERFUNDED";

function computeVerdictType(coveragePct: number): VerdictType {
  if (coveragePct >= 100) return "FULLY_FUNDED";
  if (coveragePct >= 80)  return "ON_TRACK";
  if (coveragePct >= 40)  return "PARTIALLY_FUNDED";
  return "UNDERFUNDED";
}

const VERDICT_META: Record<VerdictType, { label: string; color: string; bg: string }> = {
  FULLY_FUNDED:     { label: "Fully Funded",     color: "oklch(0.72 0.18 145)", bg: "oklch(0.72 0.18 145 / 0.10)" },
  ON_TRACK:         { label: "On Track",         color: "oklch(0.65 0.15 250)", bg: "oklch(0.65 0.15 250 / 0.10)" },
  PARTIALLY_FUNDED: { label: "Partially Funded", color: "oklch(0.78 0.15 80)",  bg: "oklch(0.78 0.15 80  / 0.10)" },
  UNDERFUNDED:      { label: "Underfunded",      color: "oklch(0.70 0.18 25)",  bg: "oklch(0.70 0.18 25  / 0.10)" },
};

// ── Types ─────────────────────────────────────────────────────────────────────

type Computed529 = {
  yearsUntilCollege: number;
  futureAnnualCost: number;
  totalCollegeCost: number;
  effectiveTotalCost: number;
  scholarshipSavings: number;
  fv529: number;
  coveragePct: number;
  monthlyNeeded: number;
  fundingGap: number;
  chartData: { year: number; balance: number; target: number; label: string }[];
  verdictType: VerdictType;
  verdictReasons: string[];
  confidencePct: number;
  suggestedMonthly: number;
  readinessScore: number;
  readinessComponents: { label: string; score: number; max: number }[];
  fundingTargets: { pct: number; monthly: number }[];
  retirAssetsBefore: number | null;
  retirAssetsAfter: number | null;
  retirProbBefore: number | null;
  retirProbAfter: number | null;
  monthlySavingsBefore: number | null;
  monthlySavingsAfter: number | null;
  flipContribution: number | null;
  flipCostReduction: number | null;
  flipReturn: number | null;
  opportunityCostRetirement: number | null;
  autoNarrative: string;
};

type FormState = {
  name: string;
  child_name: string;
  child_current_age: number;
  years_in_college: number;
  annual_cost_today: number;
  cost_inflation_rate: number;
  current_529_balance: number;
  monthly_contribution: number;
  investment_return: number;
};

function defaultForm(_profile: FinancialProfile | null, defaultReturn: number): FormState {
  return {
    name: "College Savings",
    child_name: "",
    child_current_age: 0,
    years_in_college: 4,
    annual_cost_today: 35000,
    cost_inflation_rate: 0.05,
    current_529_balance: 0,
    monthly_contribution: 500,
    investment_return: defaultReturn,
  };
}

// ── Core computation ──────────────────────────────────────────────────────────

function computeAll(
  f: FormState,
  numChildren: number,
  scholarshipPct: number,
  profile: FinancialProfile | null,
  currentNetWorth: number,
): Computed529 {
  const { child_current_age: childAge, years_in_college: yrs, annual_cost_today: costToday,
    cost_inflation_rate: inflation, current_529_balance: bal529, monthly_contribution: monthly,
    investment_return: ret } = f;

  const yearsUntilCollege = Math.max(0, 18 - childAge);
  const futureAnnualCost = costToday * Math.pow(1 + inflation, yearsUntilCollege);
  const totalCollegeCost = futureAnnualCost * yrs;
  const scholarshipSavings = totalCollegeCost * numChildren * (scholarshipPct / 100);
  const effectiveTotalCost = Math.max(0, totalCollegeCost * numChildren - scholarshipSavings);

  const mr = ret / 12;
  const mo = yearsUntilCollege * 12;

  const fv529 = mo === 0
    ? bal529
    : bal529 * Math.pow(1 + mr, mo) +
      (mr > 0 ? monthly * ((Math.pow(1 + mr, mo) - 1) / mr) : monthly * mo);

  const coveragePct = effectiveTotalCost > 0 ? Math.min(999, (fv529 / effectiveTotalCost) * 100) : 100;
  const fundingGap = Math.max(0, effectiveTotalCost - fv529);

  const pvGrowth = bal529 * (mo > 0 ? Math.pow(1 + mr, mo) : 1);
  const remainder = effectiveTotalCost - pvGrowth;
  const monthlyNeeded = remainder <= 0 || mo === 0
    ? 0
    : mr > 0 ? (remainder * mr) / (Math.pow(1 + mr, mo) - 1) : remainder / mo;

  // P8: chart — 529 balance (blue) vs inflating college cost (orange)
  const chartData = Array.from({ length: yearsUntilCollege + 1 }, (_, i) => {
    const months = i * 12;
    const balance = months === 0
      ? bal529
      : bal529 * Math.pow(1 + mr, months) +
        (mr > 0 ? monthly * ((Math.pow(1 + mr, months) - 1) / mr) : monthly * months);
    const target = costToday * Math.pow(1 + inflation, i) * yrs * numChildren * (1 - scholarshipPct / 100);
    return { year: i, balance: Math.round(balance), target: Math.round(Math.max(0, target)), label: i === 0 ? "Now" : `Yr ${i}` };
  });

  const verdictType = computeVerdictType(coveragePct);
  const pctStr = Math.round(Math.min(coveragePct, 100));

  // P1: Verdict reasons
  const verdictReasons: string[] = [
    `Current contributions cover ${pctStr}% of projected ${numChildren > 1 ? `${numChildren}-child ` : ""}college costs`,
  ];
  if (yearsUntilCollege >= 5) verdictReasons.push(`${yearsUntilCollege} years until enrollment to build savings`);
  else if (yearsUntilCollege > 0) verdictReasons.push(`Only ${yearsUntilCollege} year${yearsUntilCollege === 1 ? "" : "s"} until enrollment — urgency is high`);
  if (scholarshipPct > 0) verdictReasons.push(`${scholarshipPct}% scholarship reduces required funding by ${fmtK(scholarshipSavings)}`);
  else if (coveragePct < 80) verdictReasons.push("College inflation may outpace the current savings rate");
  if (coveragePct >= 100) verdictReasons.push("Retirement planning is not impacted by current contributions");

  const confidencePct = coveragePct >= 100
    ? Math.min(95, Math.round(90 + (coveragePct - 100) / 20))
    : Math.round(40 + coveragePct * 0.45);

  // P1: Suggested monthly (to reach ON_TRACK 80%)
  const rem80 = effectiveTotalCost * 0.80 - pvGrowth;
  const suggestedMonthly = rem80 <= 0 || mo === 0
    ? monthly
    : Math.max(0, mr > 0 ? (rem80 * mr) / (Math.pow(1 + mr, mo) - 1) : rem80 / mo);

  // P3: Funding targets (50/75/100/125%)
  const fundingTargets = [50, 75, 100, 125].map((pct) => {
    const tCost = effectiveTotalCost * (pct / 100);
    const rem = tCost - pvGrowth;
    const m = rem <= 0 || mo === 0 ? 0 : mr > 0 ? (rem * mr) / (Math.pow(1 + mr, mo) - 1) : rem / mo;
    return { pct, monthly: Math.max(0, m) };
  });

  // P4: Ecosystem (retirement impact)
  let retirAssetsBefore: number | null = null;
  let retirAssetsAfter: number | null = null;
  let retirProbBefore: number | null = null;
  let retirProbAfter: number | null = null;
  let monthlySavingsBefore: number | null = null;
  let monthlySavingsAfter: number | null = null;
  let retirImpactScore = 15;

  if (profile?.monthly_income && profile?.monthly_expenses && profile?.current_age && profile?.target_retirement_age) {
    const yToRetir = Math.max(0, profile.target_retirement_age - profile.current_age);
    const inc = profile.monthly_income;
    const exp = profile.monthly_expenses;
    monthlySavingsBefore = inc - exp;
    monthlySavingsAfter = inc - exp - monthly;
    retirAssetsBefore = fvCalc(currentNetWorth, Math.max(0, monthlySavingsBefore), yToRetir, ret);
    retirAssetsAfter  = fvCalc(currentNetWorth, Math.max(0, monthlySavingsAfter),  yToRetir, ret);
    retirProbBefore = retirProb(retirAssetsBefore, exp * 12);
    retirProbAfter  = retirProb(retirAssetsAfter,  exp * 12);
    const drop = retirProbBefore - (retirProbAfter ?? 0);
    retirImpactScore = drop < 3 ? 15 : drop < 7 ? 11 : drop < 12 ? 7 : 3;
  }

  // P2: Readiness score
  const rS_prog   = Math.round(Math.min(coveragePct, 100) * 0.30);
  const rS_time   = yearsUntilCollege >= 10 ? 20 : yearsUntilCollege >= 7 ? 17 : yearsUntilCollege >= 5 ? 14 : yearsUntilCollege >= 3 ? 9 : yearsUntilCollege >= 1 ? 5 : 2;
  const rS_contrib = monthlyNeeded > 0 ? Math.min(20, Math.round((monthly / monthlyNeeded) * 20)) : 20;
  const gapRatio  = effectiveTotalCost > 0 ? fundingGap / effectiveTotalCost : 0;
  const rS_gap    = gapRatio < 0.05 ? 15 : gapRatio < 0.2 ? 11 : gapRatio < 0.4 ? 7 : gapRatio < 0.7 ? 3 : 0;
  const readinessComponents = [
    { label: "Funding Progress",      score: rS_prog,         max: 30 },
    { label: "Time Until Enrollment", score: rS_time,         max: 20 },
    { label: "Contribution Adequacy", score: rS_contrib,      max: 20 },
    { label: "Funding Gap",           score: rS_gap,          max: 15 },
    { label: "Retirement Impact",     score: retirImpactScore, max: 15 },
  ];
  const readinessScore = readinessComponents.reduce((s, c) => s + c.score, 0);

  // P9: What would change the verdict
  let flipContribution: number | null = null;
  let flipCostReduction: number | null = null;
  let flipReturn: number | null = null;

  if (verdictType === "PARTIALLY_FUNDED" || verdictType === "UNDERFUNDED") {
    if (rem80 > 0 && mo > 0) {
      const needed80 = mr > 0 ? (rem80 * mr) / (Math.pow(1 + mr, mo) - 1) : rem80 / mo;
      const diff = needed80 - monthly;
      if (diff > 0) flipContribution = Math.ceil(diff / 10) * 10;
    }

    const maxCostFor80 = effectiveTotalCost > 0 ? fv529 / 0.80 : 0;
    const costRed = effectiveTotalCost - maxCostFor80;
    if (costRed > 500) flipCostReduction = Math.ceil(costRed / 1000) * 1000;

    if (yearsUntilCollege > 0 && effectiveTotalCost > 0) {
      const mr_max = 0.20 / 12;
      const fv_max = bal529 * Math.pow(1 + mr_max, mo) + (mr_max > 0 ? monthly * ((Math.pow(1 + mr_max, mo) - 1) / mr_max) : monthly * mo);
      if ((fv_max / effectiveTotalCost) >= 0.80) {
        let lo = ret, hi = 0.20;
        for (let i = 0; i < 40; i++) {
          const mid = (lo + hi) / 2;
          const mr2 = mid / 12;
          const fv2 = bal529 * Math.pow(1 + mr2, mo) + (mr2 > 0 ? monthly * ((Math.pow(1 + mr2, mo) - 1) / mr2) : monthly * mo);
          if ((fv2 / effectiveTotalCost) >= 0.80) hi = mid; else lo = mid;
        }
        const retInc = hi - ret;
        if (retInc > 0.002 && hi < 0.195) flipReturn = Math.round(retInc * 1000) / 10;
      }
    }
  }

  // P10: Opportunity cost
  let opportunityCostRetirement: number | null = null;
  if (monthly > 0 && profile?.current_age && profile?.target_retirement_age) {
    opportunityCostRetirement = fvCalc(0, monthly, Math.max(0, profile.target_retirement_age - profile.current_age), ret);
  }

  // P11: Auto narrative
  const childStr = numChildren > 1 ? `${numChildren} children` : "college";
  let autoNarrative = "Enter your scenario details to get a personalized funding analysis.";
  if (effectiveTotalCost > 0) {
    if (verdictType === "FULLY_FUNDED") {
      autoNarrative = `Your 529 is on pace to fully cover projected ${childStr} costs. At ${fmt(monthly)}/mo you'll have ${fmtK(fv529)} at enrollment — ${fmtK(fv529 - effectiveTotalCost)} above the ${fmtK(effectiveTotalCost)} target. Retirement impact is minimal.`;
    } else if (verdictType === "ON_TRACK") {
      autoNarrative = `You're on track to fund ${pctStr}% of projected ${childStr} costs. ${flipContribution ? `A modest increase of ${fmt(flipContribution)}/mo would close the remaining ${fmtK(fundingGap)} gap.` : "Continue at the current rate."} Your retirement trajectory is healthy alongside these contributions.`;
    } else if (verdictType === "PARTIALLY_FUNDED") {
      autoNarrative = `Current contributions will cover approximately ${pctStr}% of projected ${childStr} costs${scholarshipPct > 0 ? ` after a ${scholarshipPct}% scholarship` : ""}. ${flipContribution ? `Increasing by ${fmt(flipContribution)}/mo reaches 80% coverage.` : ""} ${yearsUntilCollege > 3 ? `With ${yearsUntilCollege} years until enrollment, there is still time to close this gap.` : "Enrollment is approaching — prioritize contributions soon."}`;
    } else {
      autoNarrative = `At the current savings rate, the 529 will cover only ${pctStr}% of projected ${childStr} costs. ${flipContribution ? `Adding ${fmt(flipContribution)}/mo reaches the 80% threshold.` : "A significant increase is needed."} ${flipCostReduction ? `Alternatively, reducing expected costs by ${fmtK(flipCostReduction)} through scholarships or school choice could close the gap.` : ""}`;
    }
  }

  return {
    yearsUntilCollege, futureAnnualCost, totalCollegeCost, effectiveTotalCost,
    scholarshipSavings, fv529, coveragePct, monthlyNeeded, fundingGap, chartData,
    verdictType, verdictReasons, confidencePct, suggestedMonthly,
    readinessScore, readinessComponents, fundingTargets,
    retirAssetsBefore, retirAssetsAfter, retirProbBefore, retirProbAfter,
    monthlySavingsBefore, monthlySavingsAfter,
    flipContribution, flipCostReduction, flipReturn,
    opportunityCostRetirement, autoNarrative,
  };
}

// ── Card style ────────────────────────────────────────────────────────────────

const cardS: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: "16px 20px",
};

// ── Component ─────────────────────────────────────────────────────────────────

type Props = {
  scenarios: EducationScenario[];
  profile: FinancialProfile | null;
  defaultInvestmentReturn: number;
  currentNetWorth: number;
};

export default function EducationClient({ scenarios: initialScenarios, profile, defaultInvestmentReturn, currentNetWorth }: Props) {
  const [scenarios, setScenarios]           = useState<EducationScenario[]>(initialScenarios);
  const [editingId, setEditingId]           = useState<string | null>(null);
  const [form, setForm]                     = useState<FormState>(() => defaultForm(profile, defaultInvestmentReturn));
  const [saving, startSaving]               = useTransition();
  const [deleting, startDeleting]           = useTransition();
  const [saveStatus, setSaveStatus]         = useState<string | null>(null);
  const [commentary, setCommentary]         = useState<string | null>(null);
  const [loadingCommentary, setLoadingCommentary] = useState(false);
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(
    initialScenarios.length > 0 ? initialScenarios[0].id : null,
  );
  const [numChildren, setNumChildren]       = useState<number>(1);
  const [scholarshipPct, setScholarshipPct] = useState<number>(0);
  const [preset, setPreset]                 = useState<string>("custom");

  const activeScenario = scenarios.find((s) => s.id === activeScenarioId) ?? null;

  const src = useMemo<FormState>(() => {
    if (editingId != null) return form;
    if (activeScenario) return {
      name: activeScenario.name,
      child_name: activeScenario.child_name ?? "",
      child_current_age: activeScenario.child_current_age,
      years_in_college: activeScenario.years_in_college,
      annual_cost_today: Number(activeScenario.annual_cost_today),
      cost_inflation_rate: Number(activeScenario.cost_inflation_rate),
      current_529_balance: Number(activeScenario.current_529_balance),
      monthly_contribution: Number(activeScenario.monthly_contribution),
      investment_return: Number(activeScenario.investment_return),
    };
    return form;
  }, [form, activeScenario, editingId]);

  const computed = useMemo(() =>
    computeAll(src, numChildren, scholarshipPct, profile, currentNetWorth),
    [src, numChildren, scholarshipPct, profile, currentNetWorth],
  );

  function set(field: keyof FormState, value: string | number) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSaveStatus(null);
    setCommentary(null);
    setPreset("custom");
  }

  function applyPreset(key: string) {
    const p = PRESETS[key];
    if (!p) return;
    setPreset(key);
    if (key !== "custom") {
      setForm((prev) => ({
        ...prev,
        annual_cost_today: p.annualCost,
        cost_inflation_rate: p.inflation,
        years_in_college: p.years,
      }));
    }
    setCommentary(null);
  }

  function startEdit(s: EducationScenario) {
    setEditingId(s.id);
    setActiveScenarioId(s.id);
    setForm({
      name: s.name,
      child_name: s.child_name ?? "",
      child_current_age: s.child_current_age,
      years_in_college: s.years_in_college,
      annual_cost_today: Number(s.annual_cost_today),
      cost_inflation_rate: Number(s.cost_inflation_rate),
      current_529_balance: Number(s.current_529_balance),
      monthly_contribution: Number(s.monthly_contribution),
      investment_return: Number(s.investment_return),
    });
    setCommentary(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(defaultForm(profile, defaultInvestmentReturn));
    setSaveStatus(null);
  }

  function handleSave() {
    startSaving(async () => {
      setSaveStatus(null);
      const payload = {
        name: form.name || "College Savings",
        child_name: form.child_name || null,
        child_current_age: form.child_current_age,
        years_in_college: form.years_in_college,
        annual_cost_today: form.annual_cost_today,
        cost_inflation_rate: form.cost_inflation_rate,
        current_529_balance: form.current_529_balance,
        monthly_contribution: form.monthly_contribution,
        investment_return: form.investment_return,
      };
      const result = await saveEducationScenario(payload, editingId ?? undefined);
      if (result.error) { setSaveStatus(result.error); return; }
      const newScenario: EducationScenario = {
        id: result.id!,
        user_id: "",
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...payload,
      };
      if (editingId) {
        setScenarios((prev) => prev.map((s) => (s.id === editingId ? newScenario : s)));
      } else {
        setScenarios((prev) => [newScenario, ...prev]);
        setActiveScenarioId(result.id!);
      }
      setEditingId(null);
      setForm(defaultForm(profile, defaultInvestmentReturn));
      setSaveStatus("Saved.");
    });
  }

  function handleDelete(id: string) {
    startDeleting(async () => {
      const result = await deleteEducationScenario(id);
      if (result.error) { setSaveStatus(result.error); return; }
      setScenarios((prev) => prev.filter((s) => s.id !== id));
      if (activeScenarioId === id) {
        const remaining = scenarios.filter((s) => s.id !== id);
        setActiveScenarioId(remaining.length > 0 ? remaining[0].id : null);
      }
      if (editingId === id) cancelEdit();
    });
  }

  async function handleGetCommentary() {
    const payload: EducationFinnRequest = {
      scenario_name: src.name,
      child_name: src.child_name || null,
      child_current_age: src.child_current_age,
      years_until_college: computed.yearsUntilCollege,
      years_in_college: src.years_in_college,
      annual_cost_today: src.annual_cost_today,
      cost_inflation_rate_pct: src.cost_inflation_rate * 100,
      future_annual_cost: computed.futureAnnualCost,
      total_college_cost: computed.effectiveTotalCost,
      current_529_balance: src.current_529_balance,
      monthly_contribution: src.monthly_contribution,
      investment_return_pct: src.investment_return * 100,
      fv529: computed.fv529,
      coverage_pct: computed.coveragePct,
      monthly_needed: computed.monthlyNeeded,
      funding_gap: computed.fundingGap,
    };
    setLoadingCommentary(true);
    setCommentary(null);
    try {
      const res = await fetch("/api/planning/education-finn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      setCommentary(data.commentary ?? data.error ?? "No response.");
    } catch {
      setCommentary("Failed to get FINN commentary.");
    } finally {
      setLoadingCommentary(false);
    }
  }

  const vm = VERDICT_META[computed.verdictType];

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "24px 24px 0", maxWidth: 1200, margin: "0 auto", width: "100%" }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <a href="/planning?tab=events" style={{ color: "var(--text-secondary)", fontSize: 13, textDecoration: "none" }}>Planning</a>
          <span style={{ color: "var(--text-secondary)", fontSize: 13 }}>/</span>
          <span style={{ color: "var(--text-primary)", fontSize: 13 }}>Education / 529</span>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>College Funding Decision Engine</h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "4px 0 0" }}>
          Am I on track? How much should I save? Can I fund college and retire on time?
        </p>
      </div>

      {/* ── 2-col grid ─────────────────────────────────────────────────────── */}
      <div data-edu-grid style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 20, alignItems: "start" }}>

        {/* Left column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

          {/* P5: College presets */}
          <div style={{ ...cardS, padding: "14px 16px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>College Type</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {Object.entries(PRESETS).map(([key, p]) => {
                const active = preset === key;
                return (
                  <button
                    key={key}
                    onClick={() => applyPreset(key)}
                    style={{
                      padding: "7px 8px", borderRadius: 8, fontSize: 11, fontWeight: active ? 700 : 500, cursor: "pointer",
                      background: active ? "oklch(0.45 0.18 250 / 0.15)" : "var(--bg-elevated, var(--bg-base))",
                      color: active ? "oklch(0.72 0.15 250)" : "var(--text-secondary)",
                      border: active ? "1px solid oklch(0.45 0.18 250 / 0.4)" : "1px solid var(--border)",
                      textAlign: "left", transition: "all 0.15s ease",
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* P7: Multi-child */}
          <div style={{ ...cardS, padding: "14px 16px", background: "linear-gradient(135deg, oklch(0.13 0.02 250) 0%, oklch(0.11 0.01 240) 100%)", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: -15, right: -15, width: 60, height: 60, borderRadius: "50%", background: "oklch(0.55 0.15 250 / 0.07)", pointerEvents: "none" }} />
            <div style={{ fontSize: 10, fontWeight: 700, color: "oklch(0.62 0.12 250)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Number of Children</div>
            <div style={{ display: "flex", gap: 6 }}>
              {([1, 2, 3, 4] as const).map((n) => {
                const active = numChildren === n;
                const icons = ["👶", "👶👶", "👶👶👶", "👨‍👩‍👧‍👦"];
                return (
                  <button
                    key={n}
                    onClick={() => setNumChildren(n)}
                    style={{
                      flex: 1, padding: "8px 0 6px", borderRadius: 8, cursor: "pointer",
                      background: active ? "oklch(0.55 0.15 250 / 0.18)" : "oklch(0.14 0.01 240)",
                      border: active ? "1px solid oklch(0.55 0.15 250 / 0.5)" : "1px solid oklch(0.22 0.02 240)",
                      boxShadow: active ? "0 0 12px oklch(0.55 0.15 250 / 0.22)" : "none",
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                      transition: "all 0.18s ease",
                    }}
                  >
                    <span style={{ fontSize: n >= 3 ? 11 : 13 }}>{icons[n - 1]}</span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: active ? "oklch(0.82 0.12 250)" : "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>{n === 4 ? "4+" : n}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* P6: Scholarship */}
          <div style={{ ...cardS, padding: "14px 16px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Scholarship Assumption</div>
            <div style={{ display: "flex", gap: 5 }}>
              {([0, 25, 50, 75, 100] as const).map((pct) => {
                const active = scholarshipPct === pct;
                return (
                  <button
                    key={pct}
                    onClick={() => setScholarshipPct(pct)}
                    style={{
                      flex: 1, padding: "7px 0", borderRadius: 7, fontSize: 11, fontWeight: active ? 700 : 500, cursor: "pointer",
                      background: active ? "oklch(0.72 0.18 145 / 0.15)" : "var(--bg-elevated, var(--bg-base))",
                      color: active ? "oklch(0.72 0.18 145)" : "var(--text-secondary)",
                      border: active ? "1px solid oklch(0.72 0.18 145 / 0.4)" : "1px solid var(--border)",
                      transition: "all 0.15s ease", fontFamily: "var(--font-mono)",
                    }}
                  >
                    {pct === 0 ? "None" : pct === 100 ? "Full" : `${pct}%`}
                  </button>
                );
              })}
            </div>
            {scholarshipPct > 0 && (
              <div style={{ fontSize: 11, color: "oklch(0.65 0.12 145)", marginTop: 8, padding: "5px 8px", background: "oklch(0.72 0.18 145 / 0.06)", borderRadius: 6, border: "1px solid oklch(0.72 0.18 145 / 0.12)" }}>
                Saves {fmtK(computed.scholarshipSavings)} in projected costs
              </div>
            )}
          </div>

          {/* Saved scenarios */}
          {scenarios.length > 0 && (
            <div style={cardS}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Saved Scenarios</div>
              {scenarios.map((s) => (
                <div
                  key={s.id}
                  onClick={() => { setActiveScenarioId(s.id); setEditingId(null); setCommentary(null); }}
                  style={{
                    padding: "8px 10px", borderRadius: 8, cursor: "pointer",
                    background: activeScenarioId === s.id && editingId == null ? "var(--bg-hover)" : "transparent",
                    display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>{s.name}</div>
                    {s.child_name && <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{s.child_name}, age {s.child_current_age}</div>}
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={(e) => { e.stopPropagation(); startEdit(s); }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", fontSize: 12, padding: "2px 6px" }}>Edit</button>
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }} disabled={deleting} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: 12, padding: "2px 6px" }}>Del</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Form */}
          <div style={cardS}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
              {editingId ? "Edit Scenario" : "Scenario Details"}
            </div>
            {[
              { label: "Scenario Name", field: "name" as const, type: "text" },
              { label: "Child Name (optional)", field: "child_name" as const, type: "text" },
            ].map(({ label, field, type }) => (
              <div key={field} style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>{label}</label>
                <input type={type} value={form[field] as string} onChange={(e) => set(field, e.target.value)}
                  style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 10px", color: "var(--text-primary)", fontSize: 13, boxSizing: "border-box" }} />
              </div>
            ))}
            {[
              { label: "Child Current Age", field: "child_current_age" as const, min: 0, max: 17, step: 1 },
              { label: "Years in College", field: "years_in_college" as const, min: 1, max: 8, step: 1 },
              { label: "Annual Cost Today ($)", field: "annual_cost_today" as const, min: 0, max: 200000, step: 1000 },
            ].map(({ label, field, min, max, step }) => (
              <div key={field} style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>{label}</label>
                <input type="number" value={form[field] as number} min={min} max={max} step={step} onChange={(e) => set(field, Number(e.target.value))}
                  style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 10px", color: "var(--text-primary)", fontSize: 13, fontFamily: "var(--font-mono)", boxSizing: "border-box" }} />
              </div>
            ))}
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>Education Inflation</label>
                <span style={{ fontSize: 11, color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>{(form.cost_inflation_rate * 100).toFixed(1)}%</span>
              </div>
              <input type="range" min={0.02} max={0.10} step={0.005} value={form.cost_inflation_rate} onChange={(e) => set("cost_inflation_rate", Number(e.target.value))} style={{ width: "100%", marginTop: 4 }} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Current 529 Balance ($)</label>
              <input type="number" value={form.current_529_balance} min={0} step={1000} onChange={(e) => set("current_529_balance", Number(e.target.value))}
                style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 10px", color: "var(--text-primary)", fontSize: 13, fontFamily: "var(--font-mono)", boxSizing: "border-box" }} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Monthly Contribution ($)</label>
              <input type="number" value={form.monthly_contribution} min={0} step={50} onChange={(e) => set("monthly_contribution", Number(e.target.value))}
                style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 10px", color: "var(--text-primary)", fontSize: 13, fontFamily: "var(--font-mono)", boxSizing: "border-box" }} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>Investment Return</label>
                <span style={{ fontSize: 11, color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>{(form.investment_return * 100).toFixed(1)}%</span>
              </div>
              <input type="range" min={0.03} max={0.12} step={0.005} value={form.investment_return} onChange={(e) => set("investment_return", Number(e.target.value))} style={{ width: "100%", marginTop: 4 }} />
            </div>
            {saveStatus && <div style={{ fontSize: 12, color: saveStatus === "Saved." ? "var(--color-success, #22c55e)" : "#ef4444", marginBottom: 8 }}>{saveStatus}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleSave} disabled={saving} style={{ flex: 1, padding: "9px 0", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}>
                {saving ? "Saving…" : editingId ? "Update" : "Save Scenario"}
              </button>
              {editingId && (
                <button onClick={cancelEdit} style={{ padding: "9px 14px", background: "var(--bg-hover)", color: "var(--text-secondary)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>Cancel</button>
              )}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* P1: Verdict card */}
          <div style={{ ...cardS, background: vm.bg, border: `1px solid ${vm.color}40`, animation: "edu-fade-up 0.4s ease-out both" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: vm.color, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>BuyTune Education Verdict</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: vm.color, letterSpacing: "-0.01em", lineHeight: 1 }}>{vm.label}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>Confidence</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: vm.color, fontFamily: "var(--font-mono)" }}>{computed.confidencePct}%</div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
              {[
                { label: "Funded",              value: `${Math.round(Math.min(computed.coveragePct, 100))}%` },
                { label: computed.coveragePct >= 100 ? "Surplus" : "Funding Gap", value: fmtK(computed.coveragePct >= 100 ? computed.fv529 - computed.effectiveTotalCost : computed.fundingGap) },
                { label: "Suggested / mo",      value: computed.verdictType === "FULLY_FUNDED" ? "On Track" : fmt(computed.suggestedMonthly) },
              ].map(({ label, value }) => (
                <div key={label} style={{ padding: "10px 12px", background: "var(--bg-card)", borderRadius: 8, border: `1px solid ${vm.color}20` }}>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: vm.color, fontFamily: "var(--font-mono)" }}>{value}</div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {computed.verdictReasons.map((reason, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, color: "var(--text-secondary)", animation: `edu-fade-up 0.3s ease-out ${0.1 + i * 0.06}s both` }}>
                  <span style={{ color: computed.verdictType === "FULLY_FUNDED" || computed.verdictType === "ON_TRACK" ? vm.color : i === 0 ? vm.color : "var(--text-muted)", flexShrink: 0 }}>
                    {computed.verdictType === "FULLY_FUNDED" ? "✓" : i === 2 ? "⚠" : "✓"}
                  </span>
                  <span>{reason}</span>
                </div>
              ))}
            </div>
          </div>

          {/* P2: Readiness score */}
          <div style={{ ...cardS, animation: "edu-fade-up 0.4s ease-out 0.08s both" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
              <p style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Education Readiness Score</p>
              <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "24px", fontWeight: 900, color: computed.readinessScore >= 75 ? "oklch(0.72 0.18 145)" : computed.readinessScore >= 50 ? "oklch(0.78 0.15 80)" : "oklch(0.70 0.18 25)" }}>
                  {computed.readinessScore}
                </span>
                <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>/ 100</span>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {computed.readinessComponents.map(({ label, score, max }, i) => (
                <div key={label} style={{ animation: `edu-fade-up 0.28s ease-out ${0.1 + i * 0.05}s both` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                    <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{label}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: score >= max * 0.7 ? "var(--green)" : score >= max * 0.4 ? "var(--amber)" : "var(--red)" }}>{score}/{max}</span>
                  </div>
                  <div style={{ height: 4, background: "var(--bg-elevated, var(--border-subtle))", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(score / max) * 100}%`, background: score >= max * 0.7 ? "oklch(0.72 0.18 145)" : score >= max * 0.4 ? "oklch(0.78 0.15 80)" : "oklch(0.70 0.18 25)", borderRadius: 2, transformOrigin: "left", animation: `edu-scale-x 0.5s ease-out ${0.2 + i * 0.06}s both` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* ── Full-width below the grid ─────────────────────────────────────────── */}
      <div style={{ padding: "16px 0 24px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Row 1: P3 Funding Targets + P4 Ecosystem */}
        <div data-edu-fw style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>

          {/* P3: Funding targets */}
          <div style={{ ...cardS, animation: "edu-fade-up 0.4s ease-out both" }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 14px" }}>What Should I Save?</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {computed.fundingTargets.map(({ pct, monthly }, i) => {
                const isSelected = Math.abs(src.monthly_contribution - monthly) < 50 && pct !== 125;
                const isCurrent  = pct === 100;
                return (
                  <div key={pct} className="edu-target-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 8, background: isCurrent ? "oklch(0.45 0.18 250 / 0.08)" : "var(--bg-elevated, var(--bg-base))", border: isCurrent ? "1px solid oklch(0.45 0.18 250 / 0.3)" : "1px solid var(--border)", animation: `edu-fade-up 0.3s ease-out ${0.05 + i * 0.06}s both`, cursor: "pointer" }} onClick={() => set("monthly_contribution", Math.round(monthly / 10) * 10)}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: isCurrent ? "oklch(0.72 0.15 250)" : "var(--text-primary)" }}>{pct}% Coverage</div>
                      <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{fmtK(computed.effectiveTotalCost * pct / 100)} of {fmtK(computed.effectiveTotalCost)} target</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 800, color: isCurrent ? "oklch(0.72 0.15 250)" : "var(--text-primary)" }}>{fmt(monthly)}/mo</div>
                      {isSelected && <div style={{ fontSize: 10, color: "var(--text-muted)" }}>current pace</div>}
                    </div>
                  </div>
                );
              })}
            </div>
            <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "10px 0 0" }}>Click a row to apply that contribution to the calculator.</p>
          </div>

          {/* P4: Ecosystem impact */}
          {computed.retirProbBefore != null ? (
            <div style={{ ...cardS, animation: "edu-fade-up 0.4s ease-out 0.08s both" }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 14px" }}>Impact Across Your Financial Plan</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
                {[
                  { label: "Retirement Probability", value: `${computed.retirProbBefore}% → ${computed.retirProbAfter}%`, icon: "◎", color: (computed.retirProbBefore - (computed.retirProbAfter ?? 0)) > 8 ? "var(--red)" : (computed.retirProbBefore - (computed.retirProbAfter ?? 0)) > 3 ? "var(--amber)" : "var(--green)" },
                  { label: "Retirement Assets", value: computed.retirAssetsAfter != null ? `${fmtK(computed.retirAssetsAfter)}` : "—", icon: "▲", color: (computed.retirAssetsBefore ?? 0) - (computed.retirAssetsAfter ?? 0) > 500000 ? "var(--amber)" : "var(--text-secondary)" },
                  { label: "Monthly Savings", value: computed.monthlySavingsAfter != null ? `${fmt(Math.max(0, computed.monthlySavingsBefore ?? 0))} → ${fmt(Math.max(0, computed.monthlySavingsAfter))}` : "—", icon: "$", color: (computed.monthlySavingsAfter ?? 0) < 0 ? "var(--red)" : "var(--text-secondary)" },
                  { label: "529 at Enrollment", value: fmtK(computed.fv529), icon: "🎓", color: computed.coveragePct >= 100 ? "var(--green)" : computed.coveragePct >= 80 ? "var(--amber)" : "var(--red)" },
                ].map(({ label, value, icon, color }, ei) => (
                  <div key={label} className="edu-eco-tile" style={{ padding: "12px", borderRadius: 8, background: "var(--bg-elevated, var(--bg-base))", border: "1px solid var(--border)", animation: `edu-fade-up 0.28s ease-out ${0.05 + ei * 0.04}s both` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{icon}</span>
                      <span style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>{label}</span>
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ ...cardS, animation: "edu-fade-up 0.4s ease-out 0.08s both" }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 10px" }}>Impact Across Your Financial Plan</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
                {[
                  { label: "529 at Enrollment", value: fmtK(computed.fv529), color: computed.coveragePct >= 100 ? "var(--green)" : computed.coveragePct >= 80 ? "var(--amber)" : "var(--red)" },
                  { label: "Funding Gap",        value: computed.fundingGap > 0 ? fmtK(computed.fundingGap) : "None", color: computed.fundingGap === 0 ? "var(--green)" : "var(--red)" },
                  { label: "Future Annual Cost", value: fmt(computed.futureAnnualCost), color: "var(--text-primary)" },
                  { label: "Total Cost",         value: fmtK(computed.effectiveTotalCost), color: "var(--text-primary)" },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ padding: "12px", borderRadius: 8, background: "var(--bg-elevated, var(--bg-base))", border: "1px solid var(--border)" }}>
                    <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 4 }}>{label}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color }}>{value}</div>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "12px 0 0" }}>Add income, expenses, and retirement age in your profile to see retirement impact.</p>
            </div>
          )}
        </div>

        {/* Row 2: P8 Chart */}
        {computed.yearsUntilCollege > 0 ? (
          <div style={{ ...cardS, animation: "edu-fade-up 0.4s ease-out 0.1s both" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 4 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>529 Balance vs College Cost Projection</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{computed.yearsUntilCollege} years to enrollment</div>
            </div>
            <div style={{ display: "flex", gap: 16, marginBottom: 14, flexWrap: "wrap" }}>
              {[
                { label: "529 Balance", color: "#3b82f6" },
                { label: "College Cost Target", color: "#f97316" },
              ].map(({ label, color }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--text-secondary)" }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
                  {label}
                </div>
              ))}
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={computed.chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--text-secondary)" }} />
                <YAxis tickFormatter={fmtK} tick={{ fontSize: 11, fill: "var(--text-secondary)" }} width={58} />
                <Tooltip
                  formatter={(v, name) => typeof v === "number" ? [fmt(v), name] : [String(v ?? ""), name]}
                  contentStyle={{ background: "oklch(0.13 0.01 240)", border: "1px solid oklch(0.24 0.02 240)", borderRadius: 8, fontSize: 12, color: "oklch(0.92 0.01 240)" }}
                  labelStyle={{ color: "oklch(0.92 0.01 240)", fontWeight: 600, marginBottom: 4 }}
                  itemStyle={{ color: "oklch(0.72 0.04 240)" }}
                  cursor={{ fill: "oklch(0.20 0.01 240 / 0.7)" }}
                />
                <Area type="monotone" dataKey="balance" stroke="#3b82f6" fill="#3b82f620" strokeWidth={2} name="529 Balance" dot={false} />
                <Line type="monotone" dataKey="target" stroke="#f97316" strokeWidth={2} strokeDasharray="5 3" name="College Cost" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div style={{ ...cardS, textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>
            Child is 18+ — cost projection complete. Current 529 balance: {fmtK(computed.fv529)}.
          </div>
        )}

        {/* Row 3: P9 What Would Change + P10 Opportunity Cost */}
        {(computed.flipContribution != null || computed.flipCostReduction != null || computed.flipReturn != null || computed.opportunityCostRetirement != null) && (
          <div data-edu-fw style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>

            {/* P9: What would change the verdict */}
            {(computed.flipContribution != null || computed.flipCostReduction != null || computed.flipReturn != null) && (
              <div style={{ ...cardS, animation: "edu-fade-up 0.4s ease-out both" }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 14px" }}>What Would Change the Verdict?</p>
                <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 12px" }}>To reach ON TRACK (80% funded):</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {computed.flipContribution != null && (
                    <div className="edu-flip-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 8, background: "var(--bg-elevated, var(--bg-base))", border: "1px solid var(--border)" }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>Increase contributions by</div>
                        <div style={{ fontSize: 10, color: "var(--text-muted)" }}>additional monthly savings</div>
                      </div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 800, color: "oklch(0.72 0.18 145)" }}>+{fmt(computed.flipContribution)}/mo</div>
                    </div>
                  )}
                  {computed.flipCostReduction != null && (
                    <div className="edu-flip-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 8, background: "var(--bg-elevated, var(--bg-base))", border: "1px solid var(--border)" }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>Reduce expected costs by</div>
                        <div style={{ fontSize: 10, color: "var(--text-muted)" }}>scholarships, in-state, community college</div>
                      </div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 800, color: "oklch(0.72 0.18 145)" }}>{fmtK(computed.flipCostReduction)}</div>
                    </div>
                  )}
                  {computed.flipReturn != null && (
                    <div className="edu-flip-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 8, background: "var(--bg-elevated, var(--bg-base))", border: "1px solid var(--border)" }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>Earn higher annual return</div>
                        <div style={{ fontSize: 10, color: "var(--text-muted)" }}>growth-oriented 529 allocation</div>
                      </div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 800, color: "oklch(0.72 0.18 145)" }}>+{computed.flipReturn}%/yr</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* P10: Opportunity cost */}
            {computed.opportunityCostRetirement != null && (
              <div style={{ ...cardS, animation: "edu-fade-up 0.4s ease-out 0.08s both" }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>Opportunity Cost Analysis</p>
                <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 14px" }}>If {fmt(src.monthly_contribution)}/mo were invested for retirement instead:</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                  <div style={{ padding: "12px", borderRadius: 8, background: "oklch(0.45 0.18 25 / 0.08)", border: "1px solid oklch(0.45 0.18 25 / 0.2)" }}>
                    <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 4 }}>If Directed to Retirement</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 800, color: "oklch(0.65 0.15 25)" }}>+{fmtK(computed.opportunityCostRetirement)}</div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>retirement assets at {profile?.target_retirement_age ?? "65"}</div>
                  </div>
                  <div style={{ padding: "12px", borderRadius: 8, background: "oklch(0.45 0.18 250 / 0.08)", border: "1px solid oklch(0.45 0.18 250 / 0.2)" }}>
                    <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 4 }}>If Directed to 529</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 800, color: "oklch(0.65 0.15 250)" }}>{Math.round(Math.min(computed.coveragePct, 100))}% funded</div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>college coverage at enrollment</div>
                  </div>
                </div>
                <p style={{ fontSize: 10, color: "var(--text-muted)", margin: 0, fontStyle: "italic" }}>This is a financial tradeoff analysis, not a recommendation.</p>
              </div>
            )}
          </div>
        )}

        {/* Row 4: P11 Auto FINN narrative + FINN deep */}
        <div data-edu-fw style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "stretch" }}>

          {/* P11: Auto FINN narrative */}
          <div style={{ ...cardS, animation: "edu-fade-up 0.4s ease-out both" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }}>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: "oklch(0.45 0.18 250 / 0.15)", border: "1px solid oklch(0.45 0.18 250 / 0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                  <path d="M10 2l2.4 5.6L18 10l-5.6 2.4L10 18l-2.4-5.6L2 10l5.6-2.4z" fill="oklch(0.72 0.15 250)"/>
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>FINN&apos;s Take</div>
                <div style={{ fontSize: 10, color: "oklch(0.58 0.1 250)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Rule-Based Analysis</div>
              </div>
            </div>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.65, margin: 0, animation: "edu-fade-up 0.4s ease-out 0.1s both" }}>
              {computed.autoNarrative}
            </p>
          </div>

          {/* FINN Deep Analysis */}
          <div style={{ ...cardS, background: "linear-gradient(145deg, oklch(0.12 0.03 285) 0%, oklch(0.10 0.01 240) 60%, oklch(0.11 0.02 265) 100%)", overflow: "hidden", position: "relative", display: "flex", flexDirection: "column", animation: "edu-fade-up 0.4s ease-out 0.08s both" }}>
            <div style={{ position: "absolute", top: -30, right: -30, width: 120, height: 120, borderRadius: "50%", background: "radial-gradient(circle, oklch(0.50 0.25 290 / 0.10) 0%, transparent 70%)", pointerEvents: "none", animation: "edu-orb-pulse 4s ease-in-out infinite" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, position: "relative" }}>
              <div style={{ width: 30, height: 30, borderRadius: 7, background: "oklch(0.50 0.25 290 / 0.15)", border: "1px solid oklch(0.50 0.25 290 / 0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="8" stroke="oklch(0.72 0.2 290)" strokeWidth="1.5" />
                  <path d="M7 9c0-1.657 1.343-3 3-3s3 1.343 3 3c0 1.5-1 2.5-2.5 3V13.5" stroke="oklch(0.72 0.2 290)" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="10" cy="15.5" r="0.75" fill="oklch(0.72 0.2 290)" />
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>FINN Deep Analysis</div>
                <div style={{ fontSize: 10, color: "oklch(0.60 0.12 290)", textTransform: "uppercase", letterSpacing: "0.08em" }}>AI Education Advisor</div>
              </div>
            </div>
            <div style={{ flex: 1, position: "relative" }}>
              {commentary ? (
                <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7, margin: 0, animation: "edu-fade-up 0.4s ease-out both" }}>{commentary}</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, lineHeight: 1.5 }}>
                    Get personalized AI guidance on 529 strategy, tax advantages, investment allocation, and optimal funding timeline.
                  </p>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {["Tax strategy", "Asset allocation", "529 vs Roth", "Aid impact"].map((tag) => (
                      <span key={tag} style={{ fontSize: 10, padding: "3px 7px", borderRadius: 4, background: "oklch(0.50 0.2 290 / 0.1)", border: "1px solid oklch(0.50 0.2 290 / 0.2)", color: "oklch(0.65 0.12 290)" }}>{tag}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div style={{ marginTop: 14 }}>
              <button
                onClick={handleGetCommentary}
                disabled={loadingCommentary}
                className="edu-finn-btn"
                style={{ width: "100%", padding: "10px 16px", background: loadingCommentary ? "oklch(0.50 0.2 290 / 0.08)" : "oklch(0.50 0.2 290 / 0.14)", color: "oklch(0.78 0.18 290)", border: `1px solid oklch(0.50 0.2 290 / ${loadingCommentary ? "0.15" : "0.35"})`, borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: loadingCommentary ? "not-allowed" : "pointer", opacity: loadingCommentary ? 0.7 : 1, fontFamily: "var(--font-body)", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
              >
                {loadingCommentary ? (
                  <><span style={{ width: 12, height: 12, border: "2px solid oklch(0.60 0.15 290)", borderTopColor: "transparent", borderRadius: "50%", animation: "edu-spin 0.7s linear infinite", display: "inline-block" }} />Analyzing…</>
                ) : (
                  <><svg width="13" height="13" viewBox="0 0 20 20" fill="none"><path d="M10 2l2.4 5.6L18 10l-5.6 2.4L10 18l-2.4-5.6L2 10l5.6-2.4z" fill="oklch(0.78 0.18 290)"/></svg>Get FINN Guidance</>
                )}
              </button>
            </div>
          </div>
        </div>

      </div>

      <style>{`
        @keyframes edu-fade-up {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes edu-scale-x {
          from { transform: scaleX(0); }
          to   { transform: scaleX(1); }
        }
        @keyframes edu-orb-pulse {
          0%, 100% { opacity: 0.7; transform: scale(1); }
          50%       { opacity: 1;   transform: scale(1.08); }
        }
        @keyframes edu-spin {
          to { transform: rotate(360deg); }
        }
        .edu-target-row { transition: background 0.15s ease, box-shadow 0.15s ease; }
        .edu-target-row:hover { box-shadow: 0 0 0 1px oklch(0.45 0.18 250 / 0.3), 0 4px 14px oklch(0.45 0.18 250 / 0.1); }
        .edu-flip-row { transition: background 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease; }
        .edu-flip-row:hover { transform: translateX(4px); background: oklch(0.18 0.04 145 / 0.3) !important; box-shadow: inset 0 0 0 1px oklch(0.65 0.18 145 / 0.3); }
        .edu-eco-tile { transition: transform 0.18s ease, box-shadow 0.18s ease; }
        .edu-eco-tile:hover { transform: translateY(-2px); box-shadow: 0 0 0 1px oklch(0.45 0.18 250 / 0.3), 0 4px 14px oklch(0.45 0.18 250 / 0.15); }
        .edu-finn-btn { transition: background 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease !important; }
        .edu-finn-btn:not(:disabled):hover { background: oklch(0.50 0.2 290 / 0.24) !important; border-color: oklch(0.50 0.2 290 / 0.6) !important; box-shadow: 0 0 18px oklch(0.50 0.25 290 / 0.45) !important; }
        @media (max-width: 900px) {
          [data-edu-fw] { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 700px) {
          [data-edu-grid] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
