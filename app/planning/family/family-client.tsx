"use client";

import { useState, useTransition, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import { saveFamilyScenario, deleteFamilyScenario } from "./family-actions";
import type { FamilyScenario } from "./family-actions";
import type { FinancialProfile } from "@/app/planning/planning-actions";
import type { FamilyFinnRequest } from "@/app/api/planning/family-finn/route";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return "$" + Math.round(n).toLocaleString("en-US");
}
function fmtK(n: number) {
  if (Math.abs(n) >= 1_000_000) return "$" + (n / 1_000_000).toFixed(1) + "M";
  if (Math.abs(n) >= 1_000) return "$" + Math.round(n / 1_000) + "K";
  return "$" + Math.round(n);
}
function pct(n: number) { return n.toFixed(1) + "%"; }

// ── Math ──────────────────────────────────────────────────────────────────────

type PhaseBar = { age: number; annualCost: number; phase: "Infant" | "Child" | "Teen"; fill: string };

type VerdictType = "READY" | "WAIT" | "HIGH_STRAIN" | "LOW_IMPACT";

type ComputedFamily = {
  currentMonthlyImpact: number;
  totalCostToAge18: number;
  remainingYears: number;
  chartData: PhaseBar[];
  monthlySavingsBefore: number | null;
  monthlySavingsAfter: number | null;
  projectedNWBefore: number | null;
  projectedNWAfter: number | null;
  // P1
  verdict: VerdictType | null;
  verdictConfidence: string;
  verdictReasons: string[];
  // P2
  readinessScore: number | null;
  readinessComponents: { label: string; score: number; max: number }[];
  // P3
  timingRows: { label: string; delayYears: number; retirAssets: number }[];
  timingBestDelayLabel: string | null;
  timingBestGain: number;
  // P4
  retirProbBefore: number | null;
  retirProbAfter: number | null;
  homeAffordBefore: number | null;
  homeAffordAfter: number | null;
  fiYearsBefore: number | null;
  fiYearsAfter: number | null;
  emergencyMonths: number | null;
};

const PHASE_COLORS: Record<"Infant" | "Child" | "Teen", string> = {
  Infant: "#6366f1",
  Child: "#3b82f6",
  Teen: "#06b6d4",
};

const MORTGAGE_FACTOR = (() => {
  const r = 0.07 / 12;
  const n = 360;
  return r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
})();

function fvCalc(pv: number, pmt: number, months: number, r: number): number {
  return pv * Math.pow(1 + r, months) + (r > 0 ? pmt * ((Math.pow(1 + r, months) - 1) / r) : pmt * months);
}

function retirProb(projectedNW: number, monthlyExpenses: number): number {
  const targetNW = monthlyExpenses * 12 * 25;
  if (targetNW <= 0) return 50;
  return Math.min(100, Math.max(0, Math.round((projectedNW / targetNW) * 100)));
}

function yearsToFI(currentNW: number, monthlySavings: number, targetNW: number, r: number): number | null {
  if (currentNW >= targetNW) return 0;
  if (monthlySavings <= 0) return null;
  for (let y = 1; y <= 60; y++) {
    if (fvCalc(currentNW, monthlySavings, y * 12, r) >= targetNW) return y;
  }
  return null;
}

function computeTimingNW(
  delayYears: number,
  currentNW: number,
  savingsBefore: number,
  savingsAfter: number,
  yearsToRetirement: number,
  r: number,
): number {
  if (delayYears >= yearsToRetirement) {
    return fvCalc(currentNW, Math.max(0, savingsBefore), yearsToRetirement * 12, r);
  }
  const nwAfterDelay = fvCalc(currentNW, Math.max(0, savingsBefore), delayYears * 12, r);
  const childYears = Math.min(18, yearsToRetirement - delayYears);
  const nwAfterChild = fvCalc(nwAfterDelay, Math.max(0, savingsAfter), childYears * 12, r);
  const remainingYears = Math.max(0, yearsToRetirement - delayYears - 18);
  return fvCalc(nwAfterChild, Math.max(0, savingsBefore), remainingYears * 12, r);
}

function computeFamily(
  childCurrentAge: number,
  monthlyInfant: number,
  monthlyChild: number,
  monthlyTeen: number,
  monthlyExpensesNow: number,
  investmentReturn: number,
  profile: FinancialProfile | null,
  currentNetWorth: number,
  liquidAssets: number,
): ComputedFamily {
  function costAtAge(age: number) {
    if (age < 3) return monthlyInfant;
    if (age <= 12) return monthlyChild;
    if (age <= 17) return monthlyTeen;
    return 0;
  }

  const currentMonthlyImpact = costAtAge(childCurrentAge);
  let totalCostToAge18 = 0;
  for (let age = childCurrentAge; age < 18; age++) totalCostToAge18 += costAtAge(age) * 12;
  const remainingYears = Math.max(0, 18 - childCurrentAge);

  const chartData: PhaseBar[] = [];
  for (let age = childCurrentAge; age < 18; age++) {
    const phase: "Infant" | "Child" | "Teen" = age < 3 ? "Infant" : age <= 12 ? "Child" : "Teen";
    chartData.push({ age, annualCost: costAtAge(age) * 12, phase, fill: PHASE_COLORS[phase] });
  }

  const noProfile: ComputedFamily = {
    currentMonthlyImpact, totalCostToAge18, remainingYears, chartData,
    monthlySavingsBefore: null, monthlySavingsAfter: null,
    projectedNWBefore: null, projectedNWAfter: null,
    verdict: null, verdictConfidence: "Low", verdictReasons: ["Add profile data for analysis"],
    readinessScore: null, readinessComponents: [],
    timingRows: [], timingBestDelayLabel: null, timingBestGain: 0,
    retirProbBefore: null, retirProbAfter: null,
    homeAffordBefore: null, homeAffordAfter: null,
    fiYearsBefore: null, fiYearsAfter: null, emergencyMonths: null,
  };

  if (
    profile?.monthly_income == null ||
    profile?.current_age == null ||
    profile?.target_retirement_age == null ||
    profile.target_retirement_age <= profile.current_age
  ) return noProfile;

  const yearsToRetirement = profile.target_retirement_age - profile.current_age;
  const r = investmentReturn / 12;
  const n = yearsToRetirement * 12;
  const monthlyIncome = profile.monthly_income;
  const baseExpenses = monthlyExpensesNow;
  const savingsBefore = monthlyIncome - baseExpenses;
  const savingsAfter = monthlyIncome - baseExpenses - currentMonthlyImpact;

  const projectedNWBefore = fvCalc(currentNetWorth, Math.max(0, savingsBefore), n, r);
  const projectedNWAfter = fvCalc(currentNetWorth, Math.max(0, savingsAfter), n, r);

  // P1: Verdict
  const probBefore = retirProb(projectedNWBefore, baseExpenses);
  const probAfter = retirProb(projectedNWAfter, baseExpenses);
  const retirDrop = probBefore - probAfter;
  const isStrained = savingsAfter < 0;
  const isTight = savingsAfter >= 0 && savingsAfter < currentMonthlyImpact * 0.5;
  const isLowImpact = monthlyIncome > 0 && currentMonthlyImpact < monthlyIncome * 0.05 && retirDrop < 5;

  let verdict: VerdictType;
  let verdictConfidence: string;
  let verdictReasons: string[];

  if (isStrained) {
    verdict = "HIGH_STRAIN";
    verdictConfidence = "Strong";
    verdictReasons = [
      "Child costs exceed available monthly cash flow",
      savingsAfter < -currentMonthlyImpact * 0.5
        ? "Household would run a monthly deficit"
        : "Emergency fund would erode over time",
      retirDrop > 5
        ? `Retirement probability drops ${retirDrop}pp to ${probAfter}%`
        : "Retirement timeline is at risk",
    ];
  } else if (retirDrop > 15 || isTight) {
    verdict = "WAIT";
    verdictConfidence = retirDrop > 15 ? "Strong" : "Good";
    verdictReasons = [
      retirDrop > 15
        ? `Retirement probability drops ${retirDrop}pp — waiting reduces this impact`
        : "Cash flow buffer is thin for unexpected child expenses",
      "Each year of waiting adds to your financial cushion",
      "Emergency fund coverage improves with more savings time",
    ];
  } else if (isLowImpact) {
    verdict = "LOW_IMPACT";
    verdictConfidence = "Good";
    verdictReasons = [
      "Child costs are a small fraction of household income",
      "Retirement plan stays largely intact",
      retirDrop < 2
        ? "Minimal retirement probability impact"
        : `Retirement probability changes by ${retirDrop}pp`,
    ];
  } else {
    verdict = "READY";
    verdictConfidence = retirDrop < 5 ? "Strong" : "Good";
    verdictReasons = [
      retirDrop < 5
        ? "Retirement plan stays on track"
        : `Retirement probability changes by ${retirDrop}pp — manageable`,
      savingsAfter > 0
        ? `Monthly buffer of ${fmt(savingsAfter)} after child costs`
        : "Cash flow is tight but positive",
      probAfter >= 80
        ? "Strong retirement probability maintained"
        : "Monitor retirement savings closely",
    ];
  }

  // P2: Readiness score (5 components, 20 pts each)
  const efMonths = baseExpenses > 0 ? liquidAssets / baseExpenses : 0;
  const efScore = Math.min(20, (efMonths / 6) * 20);

  const cfRatio = monthlyIncome > 0 ? Math.max(0, savingsAfter) / monthlyIncome : 0;
  const cfScore = Math.min(20, cfRatio * 100);

  const targetNW = baseExpenses * 12 * 25;
  const retirScore = targetNW > 0 ? Math.min(20, (projectedNWAfter / targetNW) * 20) : 10;

  const coverScore = currentMonthlyImpact > 0 && savingsAfter > 0
    ? Math.min(20, (savingsAfter / currentMonthlyImpact) * 10)
    : 0;

  const bufferScore = savingsBefore > 0
    ? Math.min(20, (Math.max(0, savingsAfter) / savingsBefore) * 20)
    : 0;

  const readinessComponents = [
    { label: "Emergency Fund Strength", score: Math.round(efScore), max: 20 },
    { label: "Monthly Cash Flow", score: Math.round(cfScore), max: 20 },
    { label: "Retirement Progress", score: Math.round(retirScore), max: 20 },
    { label: "Child Cost Coverage", score: Math.round(coverScore), max: 20 },
    { label: "Income Buffer", score: Math.round(bufferScore), max: 20 },
  ];
  const readinessScore = readinessComponents.reduce((s, c) => s + c.score, 0);

  // P3: Timing simulator
  const timingOptions = [
    { label: "Now", delayYears: 0 },
    { label: "1 Year", delayYears: 1 },
    { label: "2 Years", delayYears: 2 },
    { label: "3 Years", delayYears: 3 },
    { label: "5 Years", delayYears: 5 },
  ];
  const timingRows = timingOptions.map(({ label, delayYears }) => ({
    label,
    delayYears,
    retirAssets: Math.max(0, computeTimingNW(delayYears, currentNetWorth, savingsBefore, savingsAfter, yearsToRetirement, r)),
  }));
  const nowAssets = timingRows[0].retirAssets;
  const bestTiming = timingRows.slice(1).reduce((best, row) => row.retirAssets > best.retirAssets ? row : best, timingRows[1]);
  const timingBestGain = bestTiming.retirAssets - nowAssets;
  const timingBestDelayLabel = timingBestGain > 10_000 ? bestTiming.label : null;

  // P4: Ecosystem impact
  const homeAffordBefore = monthlyIncome > 0
    ? Math.max(0, (monthlyIncome - baseExpenses) * 0.28) / MORTGAGE_FACTOR
    : null;
  const homeAffordAfter = monthlyIncome > 0
    ? Math.max(0, (monthlyIncome - baseExpenses - currentMonthlyImpact) * 0.28) / MORTGAGE_FACTOR
    : null;

  const fiTarget = baseExpenses * 12 * 25;
  const fiYearsBefore = yearsToFI(currentNetWorth, Math.max(0, savingsBefore), fiTarget, r);
  const fiYearsAfter = yearsToFI(currentNetWorth, Math.max(0, savingsAfter), fiTarget, r);
  const emergencyMonths = baseExpenses > 0 ? liquidAssets / baseExpenses : null;

  return {
    currentMonthlyImpact, totalCostToAge18, remainingYears, chartData,
    monthlySavingsBefore: savingsBefore, monthlySavingsAfter: savingsAfter,
    projectedNWBefore, projectedNWAfter,
    verdict, verdictConfidence, verdictReasons,
    readinessScore, readinessComponents,
    timingRows, timingBestDelayLabel, timingBestGain,
    retirProbBefore: probBefore, retirProbAfter: probAfter,
    homeAffordBefore, homeAffordAfter,
    fiYearsBefore, fiYearsAfter,
    emergencyMonths,
  };
}

// ── Types ─────────────────────────────────────────────────────────────────────

type FormState = {
  name: string;
  child_name: string;
  child_current_age: number;
  monthly_infant_cost: number;
  monthly_child_cost: number;
  monthly_teen_cost: number;
  monthly_expenses_now: number;
  investment_return: number;
};

function defaultForm(profile: FinancialProfile | null, defaultReturn: number): FormState {
  return {
    name: "Family Scenario",
    child_name: "",
    child_current_age: 0,
    monthly_infant_cost: 2000,
    monthly_child_cost: 1200,
    monthly_teen_cost: 1000,
    monthly_expenses_now: profile?.monthly_expenses ?? 3000,
    investment_return: defaultReturn,
  };
}

// ── Verdict meta ──────────────────────────────────────────────────────────────

const verdictMeta: Record<VerdictType, { label: string; color: string; bg: string; border: string }> = {
  READY:       { label: "READY",       color: "oklch(0.72 0.18 145)", bg: "color-mix(in oklch, oklch(0.55 0.15 145) 8%, var(--card-bg))",  border: "color-mix(in oklch, oklch(0.55 0.15 145) 25%, transparent)" },
  WAIT:        { label: "WAIT",        color: "oklch(0.78 0.15 80)",  bg: "color-mix(in oklch, oklch(0.60 0.14 80) 8%, var(--card-bg))",   border: "color-mix(in oklch, oklch(0.60 0.14 80) 28%, transparent)" },
  HIGH_STRAIN: { label: "HIGH STRAIN", color: "oklch(0.70 0.18 25)",  bg: "color-mix(in oklch, oklch(0.45 0.18 25) 10%, var(--card-bg))",  border: "color-mix(in oklch, oklch(0.45 0.18 25) 30%, transparent)" },
  LOW_IMPACT:  { label: "LOW IMPACT",  color: "oklch(0.68 0.12 240)", bg: "color-mix(in oklch, oklch(0.50 0.10 240) 8%, var(--card-bg))",  border: "color-mix(in oklch, oklch(0.50 0.10 240) 25%, transparent)" },
};

// ── Component ─────────────────────────────────────────────────────────────────

type Props = {
  scenarios: FamilyScenario[];
  profile: FinancialProfile | null;
  defaultInvestmentReturn: number;
  currentNetWorth: number;
  liquidAssets: number;
};

export default function FamilyClient({ scenarios: initialScenarios, profile, defaultInvestmentReturn, currentNetWorth, liquidAssets }: Props) {
  const [scenarios, setScenarios] = useState<FamilyScenario[]>(initialScenarios);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => defaultForm(profile, defaultInvestmentReturn));
  const [saving, startSaving] = useTransition();
  const [deleting, startDeleting] = useTransition();
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [commentary, setCommentary] = useState<string | null>(null);
  const [loadingCommentary, setLoadingCommentary] = useState(false);
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(
    initialScenarios.length > 0 ? initialScenarios[0].id : null,
  );

  const activeScenario = scenarios.find((s) => s.id === activeScenarioId) ?? null;

  function getFormValues(): FormState {
    if (editingId != null) return form;
    if (activeScenario) {
      return {
        name: activeScenario.name,
        child_name: activeScenario.child_name ?? "",
        child_current_age: activeScenario.child_current_age,
        monthly_infant_cost: Number(activeScenario.monthly_infant_cost),
        monthly_child_cost: Number(activeScenario.monthly_child_cost),
        monthly_teen_cost: Number(activeScenario.monthly_teen_cost),
        monthly_expenses_now: Number(activeScenario.monthly_expenses_now),
        investment_return: Number(activeScenario.investment_return),
      };
    }
    return form;
  }

  const computed = useMemo<ComputedFamily>(() => {
    const v = getFormValues();
    return computeFamily(
      v.child_current_age,
      v.monthly_infant_cost,
      v.monthly_child_cost,
      v.monthly_teen_cost,
      v.monthly_expenses_now,
      v.investment_return,
      profile,
      currentNetWorth,
      liquidAssets,
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, activeScenario, editingId, profile, currentNetWorth, liquidAssets]);

  function set(field: keyof FormState, value: string | number) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSaveStatus(null);
    setCommentary(null);
  }

  function startEdit(s: FamilyScenario) {
    setEditingId(s.id);
    setActiveScenarioId(s.id);
    setForm({
      name: s.name,
      child_name: s.child_name ?? "",
      child_current_age: s.child_current_age,
      monthly_infant_cost: Number(s.monthly_infant_cost),
      monthly_child_cost: Number(s.monthly_child_cost),
      monthly_teen_cost: Number(s.monthly_teen_cost),
      monthly_expenses_now: Number(s.monthly_expenses_now),
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
        name: form.name || "Family Scenario",
        child_name: form.child_name || null,
        child_current_age: form.child_current_age,
        monthly_infant_cost: form.monthly_infant_cost,
        monthly_child_cost: form.monthly_child_cost,
        monthly_teen_cost: form.monthly_teen_cost,
        monthly_expenses_now: form.monthly_expenses_now,
        investment_return: form.investment_return,
      };
      const result = await saveFamilyScenario(payload, editingId ?? undefined);
      if (result.error) { setSaveStatus(result.error); return; }

      const newScenario: FamilyScenario = {
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
      const result = await deleteFamilyScenario(id);
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
    const v = getFormValues();
    const yearsToRetirement = profile?.current_age != null && profile?.target_retirement_age != null
      ? profile.target_retirement_age - profile.current_age
      : null;

    const payload: FamilyFinnRequest = {
      scenario_name: v.name || "Family Scenario",
      child_name: v.child_name || null,
      child_current_age: v.child_current_age,
      monthly_infant_cost: v.monthly_infant_cost,
      monthly_child_cost: v.monthly_child_cost,
      monthly_teen_cost: v.monthly_teen_cost,
      monthly_expenses_now: v.monthly_expenses_now,
      current_monthly_impact: computed.currentMonthlyImpact,
      total_cost_to_18: computed.totalCostToAge18,
      investment_return_pct: v.investment_return * 100,
      years_to_retirement: yearsToRetirement,
      monthly_savings_before: computed.monthlySavingsBefore,
      monthly_savings_after: computed.monthlySavingsAfter,
      projected_nw_before: computed.projectedNWBefore,
      projected_nw_after: computed.projectedNWAfter,
    };

    setLoadingCommentary(true);
    setCommentary(null);
    try {
      const res = await fetch("/api/planning/family-finn", {
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

  const v = getFormValues();
  const costImpactPct = v.monthly_expenses_now > 0
    ? (computed.currentMonthlyImpact / v.monthly_expenses_now * 100).toFixed(0)
    : "0";
  const retirementImpact = computed.projectedNWBefore != null && computed.projectedNWAfter != null
    ? computed.projectedNWBefore - computed.projectedNWAfter
    : null;

  const cardS: React.CSSProperties = {
    background: "var(--card-bg, var(--bg-card))",
    border: "1px solid var(--card-border, var(--border))",
    borderRadius: "var(--radius-lg, 12px)",
    padding: "16px 20px",
  };
  const labelS: React.CSSProperties = {
    fontSize: 11, color: "var(--text-secondary)", display: "block", marginBottom: 4,
  };
  const inputS: React.CSSProperties = {
    width: "100%", background: "var(--bg-input, var(--bg-base))",
    border: "1px solid var(--border)", borderRadius: 8,
    padding: "7px 10px", color: "var(--text-primary)", fontSize: 13,
  };

  const meta = computed.verdict ? verdictMeta[computed.verdict] : null;

  return (
    <div style={{ flex: 1, overflowY: "auto", color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
      {/* Header */}
      <div style={{ padding: "12px 24px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--bg-base)", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <a href="/planning?tab=events" style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px", color: "var(--text-muted)", textDecoration: "none" }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10 3L5 8l5 5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Planning
          </a>
          <span style={{ color: "var(--border)" }}>/</span>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>Family Planning</span>
        </div>
      </div>

      {/* ── P1: Verdict card ─────────────────────────────────────────────────── */}
      {meta && computed.verdict && (
        <div style={{ padding: "16px 24px 0" }}>
          <div style={{
            ...cardS,
            background: meta.bg,
            borderColor: meta.border,
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: "20px", fontWeight: 900,
                    letterSpacing: "0.04em", color: meta.color,
                  }}>
                    {computed.verdict === "WAIT" && computed.timingBestDelayLabel
                      ? `WAIT ${computed.timingBestDelayLabel.toUpperCase()}`
                      : meta.label}
                  </span>
                  <span style={{
                    fontSize: "9px", fontWeight: 700, textTransform: "uppercase",
                    letterSpacing: "0.08em", padding: "2px 7px",
                    borderRadius: "var(--radius-sm, 4px)",
                    border: `1px solid ${meta.border}`,
                    color: meta.color,
                  }}>
                    {computed.verdictConfidence} Conviction
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {computed.verdictReasons.map((r, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "7px" }}>
                      <span style={{ color: meta.color, fontSize: "12px", marginTop: "1px", flexShrink: 0 }}>
                        {computed.verdict === "HIGH_STRAIN" ? "✕" : "✓"}
                      </span>
                      <span style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.5 }}>{r}</span>
                    </div>
                  ))}
                </div>
              </div>

              {computed.readinessScore != null && (
                <div style={{ textAlign: "center", flexShrink: 0 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "36px", fontWeight: 900, color: meta.color, lineHeight: 1 }}>
                    {computed.readinessScore}
                  </div>
                  <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginTop: "3px" }}>
                    Readiness Score
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, color: meta.color, marginTop: "2px" }}>
                    / 100
                  </div>
                </div>
              )}
            </div>

            {/* Quick stats row */}
            {computed.retirProbBefore != null && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", marginTop: "14px", paddingTop: "14px", borderTop: `1px solid ${meta.border}` }}>
                {[
                  {
                    label: "Retirement Prob",
                    value: `${computed.retirProbBefore}% → ${computed.retirProbAfter}%`,
                    sub: (computed.retirProbBefore - (computed.retirProbAfter ?? 0)) > 0
                      ? `-${computed.retirProbBefore - (computed.retirProbAfter ?? 0)}pp`
                      : "No change",
                    color: (computed.retirProbBefore - (computed.retirProbAfter ?? 0)) > 10
                      ? "var(--red)" : (computed.retirProbBefore - (computed.retirProbAfter ?? 0)) > 5
                      ? "var(--amber)" : "var(--green)",
                  },
                  {
                    label: "Monthly Cash Flow",
                    value: computed.monthlySavingsAfter != null
                      ? (computed.monthlySavingsAfter >= 0 ? "+" : "") + fmt(computed.monthlySavingsAfter) + "/mo"
                      : "—",
                    sub: "after child costs",
                    color: (computed.monthlySavingsAfter ?? 0) >= 0 ? "var(--green)" : "var(--red)",
                  },
                  {
                    label: "Retirement Impact",
                    value: retirementImpact != null ? "-" + fmtK(retirementImpact) : "—",
                    sub: "vs no child costs",
                    color: (retirementImpact ?? 0) > 500_000 ? "var(--red)" : "var(--amber)",
                  },
                ].map(({ label, value, sub, color }) => (
                  <div key={label}>
                    <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: "3px" }}>{label}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "14px", fontWeight: 700, color }}>{value}</div>
                    <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "1px" }}>{sub}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Grid: left inputs + right analysis ─────────────────────────────── */}
      <div data-family-grid style={{ display: "grid", gridTemplateColumns: "minmax(280px, 320px) 1fr", gap: "20px", padding: "16px 24px 8px", alignItems: "start" }}>

        {/* ── Left: inputs ──────────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {scenarios.length > 0 && (
            <div style={cardS}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                Saved Scenarios
              </div>
              {scenarios.map((s) => (
                <div
                  key={s.id}
                  onClick={() => { setActiveScenarioId(s.id); setEditingId(null); setCommentary(null); }}
                  style={{
                    padding: "8px 10px", borderRadius: 8, cursor: "pointer",
                    background: activeScenarioId === s.id && editingId == null ? "var(--bg-hover, var(--bg-elevated))" : "transparent",
                    display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>{s.name}</div>
                    {s.child_name && (
                      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{s.child_name}, age {s.child_current_age}</div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); startEdit(s); }}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", fontSize: 12, padding: "2px 6px" }}
                    >Edit</button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}
                      disabled={deleting}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--red, #ef4444)", fontSize: 12, padding: "2px 6px" }}
                    >Del</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={cardS}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
              {editingId ? "Edit Scenario" : "New Scenario"}
            </div>

            {[
              { label: "Scenario Name", field: "name" as const, type: "text" },
              { label: "Child Name (optional)", field: "child_name" as const, type: "text" },
            ].map(({ label, field, type }) => (
              <div key={field} style={{ marginBottom: 10 }}>
                <label style={labelS}>{label}</label>
                <input
                  type={type}
                  value={form[field] as string}
                  onChange={(e) => set(field, e.target.value)}
                  style={inputS}
                />
              </div>
            ))}

            <div style={{ marginBottom: 10 }}>
              <label style={labelS}>Child Current Age</label>
              <input
                type="number"
                value={form.child_current_age}
                min={0} max={17} step={1}
                onChange={(e) => set("child_current_age", Number(e.target.value))}
                style={{ ...inputS, fontFamily: "var(--font-mono)" }}
              />
            </div>

            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "14px 0 8px" }}>
              Monthly Costs by Phase
            </div>

            {[
              { label: "Infant (Ages 0–2) $/mo", field: "monthly_infant_cost" as const, color: PHASE_COLORS.Infant },
              { label: "Child (Ages 3–12) $/mo", field: "monthly_child_cost" as const, color: PHASE_COLORS.Child },
              { label: "Teen (Ages 13–17) $/mo", field: "monthly_teen_cost" as const, color: PHASE_COLORS.Teen },
            ].map(({ label, field, color }) => (
              <div key={field} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>{label}</label>
                  <span style={{ fontSize: 11, color, fontFamily: "var(--font-mono)", fontWeight: 600 }}>{fmt(form[field] as number)}</span>
                </div>
                <input
                  type="range" min={0} max={5000} step={50}
                  value={form[field] as number}
                  onChange={(e) => set(field, Number(e.target.value))}
                  style={{ width: "100%", accentColor: "var(--accent)" }}
                />
              </div>
            ))}

            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "14px 0 8px" }}>
              Household Context
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={labelS}>Monthly Household Expenses ($)</label>
              <input
                type="number" value={form.monthly_expenses_now} min={0} step={100}
                onChange={(e) => set("monthly_expenses_now", Number(e.target.value))}
                style={{ ...inputS, fontFamily: "var(--font-mono)" }}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>Investment Return</label>
                <span style={{ fontSize: 11, color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                  {pct(form.investment_return * 100)}
                </span>
              </div>
              <input
                type="range" min={0.03} max={0.12} step={0.005}
                value={form.investment_return}
                onChange={(e) => set("investment_return", Number(e.target.value))}
                style={{ width: "100%", marginTop: 4, accentColor: "var(--accent)" }}
              />
            </div>

            {saveStatus && (
              <div style={{ fontSize: 12, color: saveStatus === "Saved." ? "var(--green, #22c55e)" : "var(--red, #ef4444)", marginBottom: 8 }}>
                {saveStatus}
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{ flex: 1, padding: "9px 0", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}
              >
                {saving ? "Saving…" : editingId ? "Update" : "Save Scenario"}
              </button>
              {editingId && (
                <button
                  onClick={cancelEdit}
                  style={{ padding: "9px 14px", background: "var(--bg-elevated, var(--bg-hover))", color: "var(--text-secondary)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, cursor: "pointer" }}
                >Cancel</button>
              )}
            </div>
          </div>
        </div>

        {/* ── Right: analysis ───────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

          {/* P2: Readiness Score */}
          {computed.readinessScore != null && meta && (
            <div style={cardS}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "14px" }}>
                <p style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Family Readiness Score</p>
                <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "24px", fontWeight: 900, color: meta.color }}>{computed.readinessScore}</span>
                  <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>/ 100</span>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {computed.readinessComponents.map(({ label, score, max }) => (
                  <div key={label}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "3px" }}>
                      <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>{label}</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 700, color: score >= max * 0.7 ? "var(--green)" : score >= max * 0.4 ? "var(--amber)" : "var(--red)" }}>
                        {score}/{max}
                      </span>
                    </div>
                    <div style={{ height: "4px", background: "var(--bg-elevated, var(--border-subtle))", borderRadius: "2px", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${(score / max) * 100}%`, background: score >= max * 0.7 ? "oklch(0.72 0.18 145)" : score >= max * 0.4 ? "oklch(0.78 0.15 80)" : "oklch(0.70 0.18 25)", borderRadius: "2px" }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* P3: Timing Simulator */}
          {computed.timingRows.length > 0 && (
            <div style={cardS}>
              <p style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 12px" }}>When Are You Planning to Have a Child?</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {computed.timingRows.map(({ label, delayYears, retirAssets }) => {
                  const isNow = delayYears === 0;
                  const gain = retirAssets - computed.timingRows[0].retirAssets;
                  const isBest = !isNow && gain === computed.timingBestGain && computed.timingBestGain > 10_000;
                  return (
                    <div key={label} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "10px 12px", borderRadius: "var(--radius-md, 8px)",
                      background: isBest ? "color-mix(in oklch, oklch(0.55 0.15 145) 8%, var(--bg-elevated, transparent))" : "var(--bg-elevated, var(--bg-card))",
                      border: `1px solid ${isBest ? "color-mix(in oklch, oklch(0.55 0.15 145) 25%, transparent)" : "var(--card-border, var(--border))"}`,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        {isBest && (
                          <span style={{ fontSize: "9px", fontWeight: 700, color: "oklch(0.72 0.18 145)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Best</span>
                        )}
                        <span style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: isNow ? 600 : 400 }}>{label}</span>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>{fmtK(retirAssets)}</div>
                        {!isNow && (
                          <div style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: gain >= 0 ? "var(--green)" : "var(--red)", marginTop: "1px" }}>
                            {gain >= 0 ? "+" : ""}{fmtK(gain)} vs now
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {computed.timingBestDelayLabel && computed.timingBestGain > 10_000 && (
                <p style={{ fontSize: "11px", color: "var(--text-secondary)", margin: "10px 0 0", lineHeight: 1.6, padding: "9px 12px", background: "color-mix(in oklch, oklch(0.55 0.15 145) 6%, transparent)", borderRadius: "var(--radius-md, 8px)", border: "1px solid color-mix(in oklch, oklch(0.55 0.15 145) 20%, transparent)" }}>
                  Waiting {computed.timingBestDelayLabel.toLowerCase()} increases projected retirement assets by {fmtK(computed.timingBestGain)}.
                </p>
              )}
            </div>
          )}

          {/* P4: Impact Across BuyTune */}
          {computed.retirProbBefore != null && (
            <div style={cardS}>
              <p style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 12px" }}>Impact Across Your Financial Plan</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "10px" }}>
                {[
                  {
                    label: "Retirement Probability",
                    value: `${computed.retirProbBefore}% → ${computed.retirProbAfter}%`,
                    sub: "on track for retirement",
                    icon: "◎",
                    delta: computed.retirProbBefore - (computed.retirProbAfter ?? 0),
                    color: (computed.retirProbBefore - (computed.retirProbAfter ?? 0)) > 10 ? "var(--red)" : (computed.retirProbBefore - (computed.retirProbAfter ?? 0)) > 5 ? "var(--amber)" : "var(--green)",
                  },
                  {
                    label: "Home Affordability",
                    value: computed.homeAffordBefore != null && computed.homeAffordAfter != null
                      ? `${fmtK(computed.homeAffordBefore)} → ${fmtK(computed.homeAffordAfter)}`
                      : "—",
                    sub: "max home purchase (28% DTI)",
                    icon: "⌂",
                    delta: computed.homeAffordBefore != null && computed.homeAffordAfter != null
                      ? computed.homeAffordBefore - computed.homeAffordAfter
                      : 0,
                    color: computed.homeAffordBefore != null && computed.homeAffordAfter != null && computed.homeAffordBefore - computed.homeAffordAfter > 50_000
                      ? "var(--amber)" : "var(--green)",
                  },
                  {
                    label: "Monthly Savings",
                    value: computed.monthlySavingsAfter != null
                      ? `${fmt(Math.max(0, computed.monthlySavingsBefore ?? 0))}/mo → ${fmt(Math.max(0, computed.monthlySavingsAfter))}/mo`
                      : "—",
                    sub: "household savings rate",
                    icon: "$",
                    delta: (computed.monthlySavingsBefore ?? 0) - (computed.monthlySavingsAfter ?? 0),
                    color: (computed.monthlySavingsAfter ?? 0) >= 0 ? "var(--text-secondary)" : "var(--red)",
                  },
                  {
                    label: "Emergency Fund",
                    value: computed.emergencyMonths != null ? `${computed.emergencyMonths.toFixed(1)} months` : "—",
                    sub: computed.emergencyMonths != null
                      ? computed.emergencyMonths >= 6 ? "Adequate coverage" : computed.emergencyMonths >= 3 ? "Thin coverage" : "Low coverage"
                      : "current coverage",
                    icon: "⛨",
                    delta: 0,
                    color: computed.emergencyMonths != null
                      ? computed.emergencyMonths >= 6 ? "var(--green)" : computed.emergencyMonths >= 3 ? "var(--amber)" : "var(--red)"
                      : "var(--text-muted)",
                  },
                  {
                    label: "Financial Independence",
                    value: computed.fiYearsBefore != null && computed.fiYearsAfter != null
                      ? computed.fiYearsAfter - computed.fiYearsBefore > 0
                        ? `+${computed.fiYearsAfter - computed.fiYearsBefore} years later`
                        : "Same timeline"
                      : computed.fiYearsAfter === null ? "Extended" : "—",
                    sub: "to reach FI (25x expenses)",
                    icon: "→",
                    delta: 0,
                    color: computed.fiYearsAfter != null && computed.fiYearsBefore != null && computed.fiYearsAfter - computed.fiYearsBefore > 5
                      ? "var(--amber)" : "var(--text-secondary)",
                  },
                  {
                    label: "Retirement Assets",
                    value: retirementImpact != null ? "-" + fmtK(retirementImpact) : "—",
                    sub: "vs no child costs",
                    icon: "▲",
                    delta: 0,
                    color: (retirementImpact ?? 0) > 1_000_000 ? "var(--red)" : (retirementImpact ?? 0) > 300_000 ? "var(--amber)" : "var(--text-secondary)",
                  },
                ].map(({ label, value, sub, icon, color }) => (
                  <div key={label} style={{ padding: "12px", borderRadius: "var(--radius-md, 8px)", background: "var(--bg-elevated, var(--bg-base))", border: "1px solid var(--card-border, var(--border))" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: "4px" }}>
                      <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{icon}</span>
                      <span style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>{label}</span>
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 700, color }}>{value}</div>
                    <div style={{ fontSize: "9px", color: "var(--text-tertiary, var(--text-muted))", marginTop: "2px" }}>{sub}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Summary tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {[
              {
                label: "Current Monthly Impact",
                value: fmt(computed.currentMonthlyImpact),
                sub: `${costImpactPct}% of household expenses`,
                color: computed.currentMonthlyImpact > v.monthly_expenses_now * 0.3 ? "var(--amber, #f59e0b)" : "var(--text-primary)",
              },
              {
                label: "Total Cost to Age 18",
                value: fmtK(computed.totalCostToAge18),
                sub: `${computed.remainingYears} years remaining`,
                color: "var(--text-primary)",
              },
              {
                label: "Retirement NW Impact",
                value: retirementImpact != null ? "-" + fmtK(retirementImpact) : "—",
                sub: retirementImpact != null ? "vs no child costs" : "Add profile for forecast",
                color: retirementImpact != null && retirementImpact > 0 ? "var(--red, #ef4444)" : "var(--text-secondary)",
              },
            ].map(({ label, value, sub, color }) => (
              <div key={label} style={{ ...cardS, padding: "14px 16px" }}>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color, fontFamily: "var(--font-mono)" }}>{value}</div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>{sub}</div>
              </div>
            ))}
          </div>

          {/* Chart */}
          {computed.chartData.length > 0 ? (
            <div style={cardS}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>Annual Child Costs by Age</div>
              <div style={{ display: "flex", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
                {(["Infant", "Child", "Teen"] as const).map((p) => (
                  <div key={p} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--text-secondary)" }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: PHASE_COLORS[p] }} />
                    {p}
                  </div>
                ))}
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={computed.chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="age" tickFormatter={(val) => `${val}`} tick={{ fontSize: 11, fill: "var(--text-secondary)" }} label={{ value: "Child Age", position: "insideBottom", offset: -2, fill: "var(--text-secondary)", fontSize: 11 }} />
                  <YAxis tickFormatter={fmtK} tick={{ fontSize: 11, fill: "var(--text-secondary)" }} width={56} />
                  <Tooltip
                    formatter={(val) => typeof val === "number" ? [fmt(val), "Annual Cost"] : [String(val ?? ""), "Annual Cost"]}
                    labelFormatter={(label) => `Age ${label}`}
                    contentStyle={{ background: "var(--card-bg, var(--bg-card))", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                  />
                  <Bar dataKey="annualCost" radius={[4, 4, 0, 0]}>
                    {computed.chartData.map((entry, index) => (
                      <Cell key={index} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div style={{ ...cardS, textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>
              Child is 18+ — cost modeling phase complete.
            </div>
          )}

          {/* P5: Retirement impact rework */}
          {computed.projectedNWBefore != null && computed.projectedNWAfter != null && (
            <div style={cardS}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>Retirement Impact</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                {[
                  { label: "Without Child", value: fmtK(computed.projectedNWBefore), color: "#94a3b8" },
                  { label: "With Child", value: fmtK(Math.max(0, computed.projectedNWAfter)), color: "#3b82f6" },
                  {
                    label: "Difference",
                    value: (computed.projectedNWAfter - computed.projectedNWBefore >= 0 ? "+" : "") + fmtK(computed.projectedNWAfter - computed.projectedNWBefore),
                    color: computed.projectedNWAfter >= computed.projectedNWBefore ? "var(--green)" : "var(--red)",
                  },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ padding: "10px 12px", background: "var(--bg-elevated, var(--bg-base))", borderRadius: 8 }}>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 2 }}>{label}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color, fontFamily: "var(--font-mono)" }}>{value}</div>
                    <div style={{ fontSize: 10, color: "var(--text-tertiary, var(--text-muted))", marginTop: 2 }}>at retirement</div>
                  </div>
                ))}
              </div>
              {computed.retirProbBefore != null && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", borderRadius: 8, background: "var(--bg-elevated, var(--bg-base))" }}>
                  <div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Retirement Probability</div>
                    <div style={{ fontSize: 10, color: "var(--text-tertiary, var(--text-muted))", marginTop: 1 }}>
                      {(computed.projectedNWAfter ?? 0) >= (computed.projectedNWBefore ?? 0) * 0.9
                        ? "Still On Track"
                        : computed.retirProbAfter != null && computed.retirProbAfter >= 80
                        ? "Manageable Impact"
                        : "Review Retirement Plan"}
                    </div>
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>
                    {computed.retirProbBefore}% → {computed.retirProbAfter}%
                  </div>
                </div>
              )}
            </div>
          )}

          {/* FINN Commentary */}
          <div style={cardS}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="8" stroke="#7c3aed" strokeWidth="1.5" />
                  <path d="M7 9c0-1.657 1.343-3 3-3s3 1.343 3 3c0 1.5-1 2.5-2.5 3V13.5" stroke="#7c3aed" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="10" cy="15.5" r="0.75" fill="#7c3aed" />
                </svg>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>FINN Analysis</div>
              </div>
              <button
                onClick={handleGetCommentary}
                disabled={loadingCommentary}
                style={{
                  padding: "7px 14px", background: "rgba(109,40,217,0.08)",
                  color: "#7c3aed", border: "1px solid rgba(109,40,217,0.22)",
                  borderRadius: 8, fontSize: 12, fontWeight: 600,
                  cursor: loadingCommentary ? "not-allowed" : "pointer",
                  opacity: loadingCommentary ? 0.7 : 1, fontFamily: "var(--font-body)",
                }}
              >
                {loadingCommentary ? "Analyzing…" : "Get FINN Guidance"}
              </button>
            </div>
            {commentary ? (
              <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.65, margin: 0 }}>{commentary}</p>
            ) : (
              <p style={{ fontSize: 12, color: "var(--text-tertiary, var(--text-secondary))", margin: 0 }}>
                Get FINN guidance on child cost planning, retirement impact, and timing.
              </p>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          [data-family-grid] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
