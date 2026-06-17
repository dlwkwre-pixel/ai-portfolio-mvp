"use client";

import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import type { SabbaticalScenario } from "./sabbatical-actions";
import { saveSabbaticalScenario, deleteSabbaticalScenario } from "./sabbatical-actions";
import type { FinancialProfile } from "@/app/planning/planning-actions";

// ── Types ─────────────────────────────────────────────────────────────────────

type BreakType = "vacation" | "sabbatical";
type VacationVerdict = "BOOK_IT" | "SAVE_MORE" | "PLAN_AHEAD" | "RECONSIDER";
type SabbaticalVerdict = "GO" | "PLAN" | "NOT_YET";
type VerdictType = VacationVerdict | SabbaticalVerdict;

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtK(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${n < 0 ? "-" : ""}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${n < 0 ? "-" : ""}$${Math.round(abs / 1_000)}k`;
  return `${n < 0 ? "-" : ""}$${Math.round(abs)}`;
}
function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

// ── FI helper ─────────────────────────────────────────────────────────────────

function yearsToFI(currentNW: number, monthlySavings: number, fiTarget: number, annualReturn: number): number | null {
  if (fiTarget <= 0 || currentNW >= fiTarget) return 0;
  if (monthlySavings <= 0) return null;
  const mr = annualReturn / 12;
  for (let y = 1; y <= 60; y++) {
    const mo = y * 12;
    const fv = mr > 0
      ? currentNW * Math.pow(1 + mr, mo) + monthlySavings * ((Math.pow(1 + mr, mo) - 1) / mr)
      : currentNW + monthlySavings * mo;
    if (fv >= fiTarget) return y;
  }
  return null;
}

// ── Vacation math ─────────────────────────────────────────────────────────────

type VacationComputed = {
  totalCost: number;
  depletionPct: number;
  isFunded: boolean;
  shortfall: number;
  monthsToSave: number | null;
  targetMonthsAway: number | null;
  canSaveInTime: boolean | null;
  monthlySavingsNeeded: number | null;
  verdict: VacationVerdict;
  verdictConfidence: string;
  verdictConditions: string[];
  finnNarrative: string;
};

function computeVacation(
  inputs: SabbaticalScenario,
  liquidAssets: number,
  monthlySavings: number,
): VacationComputed {
  const travel = Number(inputs.vacation_travel_costs ?? 500);
  const daily = Number(inputs.vacation_daily_budget ?? 200);
  const days = Number(inputs.vacation_duration_days ?? 7);
  const totalCost = travel + daily * days;
  const liquid = Number(inputs.liquid_assets_available) || liquidAssets;
  const depletionPct = liquid > 0 ? Math.min(100, Math.round((totalCost / liquid) * 100)) : 100;
  const isFunded = liquid >= totalCost;
  const shortfall = Math.max(0, totalCost - liquid);
  const monthsToSave = monthlySavings > 0 && !isFunded ? Math.ceil(shortfall / monthlySavings) : isFunded ? 0 : null;

  // Target date math
  let targetMonthsAway: number | null = null;
  let canSaveInTime: boolean | null = null;
  let monthlySavingsNeeded: number | null = null;
  if (inputs.vacation_target_date) {
    const [yr, mo] = inputs.vacation_target_date.split("-").map(Number);
    const now = new Date();
    targetMonthsAway = Math.max(0, (yr - now.getFullYear()) * 12 + (mo - 1 - now.getMonth()));
    canSaveInTime = isFunded || (monthsToSave != null && monthsToSave <= targetMonthsAway);
    if (!isFunded && targetMonthsAway > 0) {
      monthlySavingsNeeded = Math.ceil(shortfall / targetMonthsAway);
    }
  }

  let verdict: VacationVerdict;
  let verdictConfidence: string;
  let verdictConditions: string[] = [];

  if (isFunded && depletionPct <= 15) {
    verdict = "BOOK_IT";
    verdictConfidence = "Well Funded";
  } else if (isFunded && depletionPct <= 40) {
    verdict = "BOOK_IT";
    verdictConfidence = "Funded";
    verdictConditions = [`This uses ${depletionPct}% of your liquid savings — confirm emergency fund stays intact`];
  } else if (isFunded && depletionPct > 40) {
    verdict = "RECONSIDER";
    verdictConfidence = "Drains Savings";
    verdictConditions = [`${depletionPct}% of liquid savings is a large portion — consider a smaller budget or later date`];
  } else if (!isFunded && canSaveInTime === true) {
    verdict = "SAVE_MORE";
    verdictConfidence = "Achievable";
    verdictConditions = [`Save ${monthlySavingsNeeded != null ? fmt(monthlySavingsNeeded) : fmt(Math.ceil(shortfall / (targetMonthsAway ?? 6)))}/mo to reach your target date`];
  } else if (!isFunded && monthsToSave != null) {
    verdict = "PLAN_AHEAD";
    verdictConfidence = "Save First";
    verdictConditions = [`${fmt(shortfall)} shortfall at current savings rate`, `Ready in approximately ${monthsToSave} months`];
  } else {
    verdict = "RECONSIDER";
    verdictConfidence = "Not Achievable";
    verdictConditions = ["No savings margin — build a savings cushion before planning this trip"];
  }

  // FINN narrative
  let finnNarrative: string;
  if (verdict === "BOOK_IT") {
    finnNarrative = `At ${fmt(totalCost)} total, this trip uses ${depletionPct}% of your liquid savings${depletionPct <= 15 ? " — comfortably within range. Book it." : ". That's manageable, but make sure your emergency fund stays untouched."}${monthlySavings > 0 ? ` At your savings rate, you'd rebuild in ${Math.ceil(totalCost / monthlySavings)} months.` : ""}`;
  } else if (verdict === "SAVE_MORE") {
    const mo = monthlySavingsNeeded ?? Math.ceil(shortfall / Math.max(1, monthlySavings));
    finnNarrative = `You need ${fmt(totalCost)} and currently have ${fmtK(liquid)}. The ${fmt(shortfall)} gap is within reach — saving ${fmt(mo)}/mo gets you there${targetMonthsAway != null ? ` by your target date (${inputs.vacation_target_date})` : ` in about ${monthsToSave} months`}. Set up an automatic transfer now and this trip is locked in.`;
  } else if (verdict === "PLAN_AHEAD") {
    finnNarrative = `You're ${fmt(shortfall)} short. At your current savings rate${monthlySavings > 0 ? ` of ${fmt(monthlySavings)}/mo` : ""}, you'll be ready in about ${monthsToSave} months. If you want to go sooner, either increase your savings rate or trim the trip budget — ${fmt(travel)} in travel costs and ${fmt(daily)}/day in daily spending are the two biggest levers.`;
  } else {
    finnNarrative = `This trip costs ${fmt(totalCost)}, which represents ${depletionPct}% of your liquid savings — a level that leaves you financially exposed. Either spread the cost over more time, reduce daily spending or travel costs, or build your savings base before committing.`;
  }

  return { totalCost, depletionPct, isFunded, shortfall, monthsToSave, targetMonthsAway, canSaveInTime, monthlySavingsNeeded, verdict, verdictConfidence, verdictConditions, finnNarrative };
}

// ── Sabbatical math ───────────────────────────────────────────────────────────

type SabbaticalComputed = {
  netMonthlyBurn: number;
  runwayMonths: number;
  canAfford: boolean;
  bufferMonths: number;
  totalDepletion: number;
  depletionPct: number;
  recoveryMonths: number | null;
  incomeLost: number;
  breakEvenMonth: number | null;
  fiYearsBefore: number | null;
  fiYearsAfter: number | null;
  verdict: SabbaticalVerdict;
  verdictConfidence: string;
  verdictConditions: string[];
  finnNarrative: string;
  timeline: { month: number; balance: number }[];
};

function computeSabbatical(
  inputs: SabbaticalScenario,
  currentNetWorth: number,
  effectiveExpenses: number,
  investmentReturn: number,
): SabbaticalComputed {
  const months = inputs.sabbatical_months;
  const burn = Math.max(0, Number(inputs.monthly_expenses_during) - Number(inputs.monthly_stipend));
  const liquid = Number(inputs.liquid_assets_available);
  const income = Number(inputs.current_monthly_income);
  const incomeAfter = Number(inputs.monthly_income_after_return);

  const runway = burn > 0 ? liquid / burn : 999;
  const canAfford = runway >= months;
  const buffer = runway - months;
  const depletion = months * burn;
  const depletionPct = liquid > 0 ? Math.min(100, Math.round((depletion / liquid) * 100)) : 100;

  const netSavingsAfter = incomeAfter - effectiveExpenses;
  const recoveryMonths = netSavingsAfter > 0 ? Math.ceil(depletion / netSavingsAfter) : null;
  const incomeLost = months * income;
  const breakEvenMonth = recoveryMonths != null ? months + recoveryMonths : null;

  const fiTarget = effectiveExpenses > 0 ? effectiveExpenses * 12 * 25 : 0;
  const fiBefore = fiTarget > 0 ? yearsToFI(currentNetWorth, Math.max(0, income - effectiveExpenses), fiTarget, investmentReturn) : null;
  const fiAfter = fiTarget > 0 ? yearsToFI(currentNetWorth - depletion, Math.max(0, incomeAfter - effectiveExpenses), fiTarget, investmentReturn) : null;

  let verdict: SabbaticalVerdict;
  let verdictConfidence: string;
  let verdictConditions: string[];

  if (!canAfford) {
    verdict = "NOT_YET";
    verdictConfidence = "Insufficient Runway";
    verdictConditions = [`Build liquid savings to at least ${fmt(depletion)}`, `Current runway: ${runway.toFixed(1)} months vs ${months} needed`];
  } else if (buffer >= 3 && (recoveryMonths == null || recoveryMonths <= 18)) {
    verdict = "GO";
    verdictConfidence = buffer >= 6 ? "Strong Case" : "Solid Case";
    verdictConditions = [];
  } else if (canAfford && (recoveryMonths == null || recoveryMonths <= 36)) {
    verdict = "PLAN";
    verdictConfidence = buffer < 3 ? "Tight Margin" : "Plan Required";
    verdictConditions = [
      ...(buffer < 3 ? [`Buffer is only ${buffer.toFixed(1)} months — build to 3+ months extra`] : []),
      ...(recoveryMonths != null && recoveryMonths > 18 ? [`Recovery takes ${recoveryMonths} months — explore part-time income`] : []),
    ];
  } else {
    verdict = "NOT_YET";
    verdictConfidence = recoveryMonths != null ? "Long Recovery" : "No Recovery Path";
    verdictConditions = [
      recoveryMonths != null ? `${recoveryMonths}-month recovery exceeds 3-year threshold` : "Return income insufficient to rebuild savings",
      "Shorten the break, find stipend income, or increase savings first",
    ];
  }

  let finnNarrative: string;
  if (!canAfford) {
    finnNarrative = `The numbers don't support this yet. A ${months}-month sabbatical requires ${fmtK(depletion)} in available cash, but you have ${fmtK(liquid)} — a ${fmtK(depletion - liquid)} gap. Build liquid savings toward that target first.`;
  } else if (verdict === "GO") {
    finnNarrative = `The math supports this. ${runway.toFixed(0)} months of runway against a ${months}-month plan gives you a ${buffer.toFixed(0)}-month buffer.${recoveryMonths != null ? ` Recovery takes ${recoveryMonths} months at your expected return income.` : ""}${fiBefore != null && fiAfter != null && fiAfter > fiBefore ? ` It delays FI by about ${fiAfter - fiBefore} year${fiAfter - fiBefore > 1 ? "s" : ""}.` : ""} The biggest risk is whether ${fmt(incomeAfter)}/mo on return is realistic.`;
  } else if (verdict === "PLAN") {
    finnNarrative = `Possible, but the margin is thin${buffer < 3 ? ` — only ${buffer.toFixed(1)} months of cushion` : ""}.${recoveryMonths != null && recoveryMonths > 18 ? ` At ${recoveryMonths} months to rebuild, part-time income during the break would change this analysis significantly.` : " The plan works if execution stays on track."} Run the numbers again after increasing liquid savings or stipend income.`;
  } else {
    finnNarrative = `Not yet. The recovery path is too long${recoveryMonths != null ? ` — ${recoveryMonths} months to return to your starting position` : ""}. Shorten the sabbatical, find supplementary income during the break, or increase savings before starting.`;
  }

  const displayMonths = Math.min(60, months + (recoveryMonths ?? 24));
  const timeline: { month: number; balance: number }[] = [];
  let balance = liquid;
  for (let m = 0; m <= displayMonths; m++) {
    if (m > 0) balance = m <= months ? balance - burn : balance + netSavingsAfter;
    timeline.push({ month: m, balance: Math.max(0, Math.round(balance)) });
  }

  return { netMonthlyBurn: burn, runwayMonths: runway, canAfford, bufferMonths: buffer, totalDepletion: depletion, depletionPct, recoveryMonths, incomeLost, breakEvenMonth, fiYearsBefore: fiBefore, fiYearsAfter: fiAfter, verdict, verdictConfidence, verdictConditions, finnNarrative, timeline };
}

// ── Verdict metadata ──────────────────────────────────────────────────────────

const VACATION_META: Record<VacationVerdict, { label: string; color: string; bg: string; border: string }> = {
  BOOK_IT:   { label: "Book It",     color: "oklch(0.72 0.19 145)", bg: "color-mix(in oklch, oklch(0.55 0.15 145) 9%, transparent)",  border: "color-mix(in oklch, oklch(0.55 0.15 145) 28%, transparent)" },
  SAVE_MORE: { label: "Save More",   color: "oklch(0.78 0.17 70)",  bg: "color-mix(in oklch, oklch(0.78 0.17 70) 9%, transparent)",   border: "color-mix(in oklch, oklch(0.78 0.17 70) 22%, transparent)" },
  PLAN_AHEAD:{ label: "Plan Ahead",  color: "oklch(0.78 0.17 70)",  bg: "color-mix(in oklch, oklch(0.78 0.17 70) 9%, transparent)",   border: "color-mix(in oklch, oklch(0.78 0.17 70) 22%, transparent)" },
  RECONSIDER:{ label: "Reconsider",  color: "oklch(0.65 0.18 25)",  bg: "color-mix(in oklch, oklch(0.50 0.15 25) 10%, transparent)",  border: "color-mix(in oklch, oklch(0.50 0.15 25) 28%, transparent)" },
};

const SABBATICAL_META: Record<SabbaticalVerdict, { label: string; color: string; bg: string; border: string }> = {
  GO:      { label: "Go For It",    color: "oklch(0.72 0.19 145)", bg: "color-mix(in oklch, oklch(0.55 0.15 145) 9%, transparent)",  border: "color-mix(in oklch, oklch(0.55 0.15 145) 28%, transparent)" },
  PLAN:    { label: "Plan It First",color: "oklch(0.78 0.17 70)",  bg: "color-mix(in oklch, oklch(0.78 0.17 70) 9%, transparent)",   border: "color-mix(in oklch, oklch(0.78 0.17 70) 22%, transparent)" },
  NOT_YET: { label: "Not Yet",      color: "oklch(0.65 0.18 25)",  bg: "color-mix(in oklch, oklch(0.50 0.15 25) 10%, transparent)",  border: "color-mix(in oklch, oklch(0.50 0.15 25) 28%, transparent)" },
};

// ── Component ─────────────────────────────────────────────────────────────────

type Props = {
  scenarios: SabbaticalScenario[];
  profile: FinancialProfile | null;
  defaultInvestmentReturn: number;
  liquidAssets: number;
  currentNetWorth: number;
  effectiveIncome: number;
  effectiveExpenses: number;
};

const DEFAULT_FORM = (
  effectiveExpenses: number,
  effectiveIncome: number,
  liquidAssets: number,
  defaultInvestmentReturn: number,
  scenario?: SabbaticalScenario,
): Omit<SabbaticalScenario, "id" | "user_id" | "created_at" | "updated_at"> => ({
  name:                          scenario?.name ?? "My Trip",
  break_type:                    scenario?.break_type ?? "vacation",
  // Vacation
  vacation_duration_days:        scenario?.vacation_duration_days ?? 7,
  vacation_daily_budget:         scenario?.vacation_daily_budget ?? 200,
  vacation_travel_costs:         scenario?.vacation_travel_costs ?? 500,
  vacation_target_date:          scenario?.vacation_target_date ?? null,
  // Sabbatical
  sabbatical_months:             scenario?.sabbatical_months ?? 12,
  monthly_expenses_during:       scenario?.monthly_expenses_during ?? (effectiveExpenses || 3000),
  monthly_stipend:               scenario?.monthly_stipend ?? 0,
  current_monthly_income:        scenario?.current_monthly_income ?? (effectiveIncome || 5000),
  monthly_income_after_return:   scenario?.monthly_income_after_return ?? (effectiveIncome || 5000),
  investment_return_rate:        scenario?.investment_return_rate ?? defaultInvestmentReturn,
  // Shared
  liquid_assets_available:       scenario?.liquid_assets_available ?? liquidAssets,
  notes:                         scenario?.notes ?? null,
});

export default function TimeOffClient({
  scenarios,
  profile: _profile,
  defaultInvestmentReturn,
  liquidAssets,
  currentNetWorth,
  effectiveIncome,
  effectiveExpenses,
}: Props) {
  const [activeId, setActiveId] = useState<string | null>(scenarios[0]?.id ?? null);
  const [isPending, startTransition] = useTransition();
  const [isEditing, setIsEditing] = useState(scenarios.length === 0);
  const [showNewForm, setShowNewForm] = useState(false);

  const activeScenario = scenarios.find((s) => s.id === activeId) ?? scenarios[0] ?? null;
  const showAnalysis = activeScenario != null || isEditing || showNewForm;

  const [form, setForm] = useState(() =>
    DEFAULT_FORM(effectiveExpenses, effectiveIncome, liquidAssets, defaultInvestmentReturn, activeScenario ?? undefined)
  );

  const breakType: BreakType = (form.break_type as BreakType) ?? "vacation";

  const monthlySavings = Math.max(0, effectiveIncome - effectiveExpenses);

  const vacationResult = useMemo(
    () => breakType === "vacation"
      ? computeVacation({ ...form, id: "", user_id: "", created_at: "", updated_at: "" }, liquidAssets, monthlySavings)
      : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [form, liquidAssets, monthlySavings, breakType],
  );

  const sabbaticalResult = useMemo(
    () => breakType === "sabbatical"
      ? computeSabbatical(
          { ...form, id: "", user_id: "", created_at: "", updated_at: "" },
          currentNetWorth,
          effectiveExpenses || Number(form.monthly_expenses_during),
          Number(form.investment_return_rate),
        )
      : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [form, currentNetWorth, effectiveExpenses, breakType],
  );

  const verdict: VerdictType | null = vacationResult?.verdict ?? sabbaticalResult?.verdict ?? null;
  const meta = verdict
    ? (breakType === "vacation" ? VACATION_META[verdict as VacationVerdict] : SABBATICAL_META[verdict as SabbaticalVerdict])
    : null;

  function setField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    startTransition(async () => {
      await saveSabbaticalScenario(form, showNewForm ? undefined : activeScenario?.id);
      setIsEditing(false);
      setShowNewForm(false);
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteSabbaticalScenario(id);
      setActiveId(null);
    });
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "7px 10px", borderRadius: "var(--radius-sm)",
    background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)",
    color: "var(--text-primary)", fontSize: "13px", fontFamily: "var(--font-body)",
    outline: "none", boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: "10px", fontWeight: 600, textTransform: "uppercase" as const,
    letterSpacing: "0.07em", color: "var(--text-muted)", fontFamily: "var(--font-body)",
    marginBottom: "4px", display: "block",
  };
  const sectionLabel: React.CSSProperties = {
    fontSize: "9px", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.12em",
    color: "var(--text-muted)", margin: "0 0 8px", fontFamily: "var(--font-body)",
  };

  // Vacation At-a-Glance
  const vGlance = vacationResult ? [
    { label: "Total Cost", value: fmtK(vacationResult.totalCost), sub: `${form.vacation_duration_days ?? 7} days`, color: "var(--text-primary)" },
    { label: "% of Savings", value: `${vacationResult.depletionPct}%`, sub: "of liquid savings", color: vacationResult.depletionPct > 40 ? "var(--red)" : vacationResult.depletionPct > 20 ? "oklch(0.78 0.15 75)" : "var(--green)" },
    { label: vacationResult.isFunded ? "Funded" : "Shortfall", value: vacationResult.isFunded ? "Yes" : fmtK(vacationResult.shortfall), sub: vacationResult.isFunded ? "ready now" : "to save", color: vacationResult.isFunded ? "var(--green)" : "var(--red)" },
    { label: "Recovery", value: vacationResult.isFunded ? `${Math.ceil(vacationResult.totalCost / Math.max(1, monthlySavings))} mo` : vacationResult.monthsToSave != null ? `${vacationResult.monthsToSave} mo` : "—", sub: "to rebuild savings", color: "var(--text-muted)" },
  ] : [];

  // Sabbatical At-a-Glance
  const sGlance = sabbaticalResult ? [
    { label: "Runway", value: sabbaticalResult.runwayMonths > 99 ? "∞" : `${sabbaticalResult.runwayMonths.toFixed(0)} mo`, sub: `of ${form.sabbatical_months} needed`, color: sabbaticalResult.canAfford ? "var(--green)" : "var(--red)" },
    { label: "Net Cost", value: fmtK(sabbaticalResult.totalDepletion), sub: `${sabbaticalResult.depletionPct}% of savings`, color: sabbaticalResult.depletionPct > 75 ? "var(--red)" : sabbaticalResult.depletionPct > 50 ? "oklch(0.78 0.15 75)" : "var(--text-primary)" },
    { label: "Recovery", value: sabbaticalResult.recoveryMonths != null ? `${sabbaticalResult.recoveryMonths} mo` : "Open", sub: "to restore savings", color: sabbaticalResult.recoveryMonths == null ? "var(--red)" : sabbaticalResult.recoveryMonths <= 18 ? "var(--green)" : sabbaticalResult.recoveryMonths <= 36 ? "oklch(0.78 0.15 75)" : "var(--red)" },
    { label: "FI Impact", value: sabbaticalResult.fiYearsBefore != null && sabbaticalResult.fiYearsAfter != null ? sabbaticalResult.fiYearsAfter - sabbaticalResult.fiYearsBefore > 0 ? `+${sabbaticalResult.fiYearsAfter - sabbaticalResult.fiYearsBefore} yr` : "None" : "—", sub: "to FI timeline", color: "var(--text-muted)" },
  ] : [];

  const glanceItems = breakType === "vacation" ? vGlance : sGlance;
  const maxTimeline = sabbaticalResult && sabbaticalResult.timeline.length > 0 ? Math.max(...sabbaticalResult.timeline.map((t) => t.balance), 1) : 1;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
      <style>{`
        @media (max-width: 768px) {
          [data-sab-cols] { flex-direction: column !important; }
          [data-sab-sidebar] { width: 100% !important; min-width: 0 !important; max-width: none !important; border-right: none !important; border-bottom: 1px solid var(--border-subtle) !important; overflow-y: visible !important; }
        }
      `}</style>

      {/* Header */}
      <div style={{ padding: "12px 24px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--bg-base)", flexShrink: 0, gap: "12px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "3px" }}>
            <Link href="/planning?tab=events" style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px", color: "var(--text-muted)", textDecoration: "none" }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10 3L5 8l5 5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Planning
            </Link>
            <span style={{ color: "var(--border)" }}>/</span>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>Time Off</span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
            <span style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>Time Off Planner</span>
            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Plan a vacation or career break</span>
          </div>
        </div>
        {scenarios.length > 0 && (
          <button type="button" onClick={() => { setShowNewForm(true); setIsEditing(false); setForm(DEFAULT_FORM(effectiveExpenses, effectiveIncome, liquidAssets, defaultInvestmentReturn)); }} style={{ padding: "6px 12px", borderRadius: "var(--radius-md)", background: "var(--accent)", color: "#fff", border: "none", fontSize: "12px", fontWeight: 600, fontFamily: "var(--font-body)", cursor: "pointer" }}>
            + New Scenario
          </button>
        )}
      </div>

      {/* Body */}
      <div data-sab-cols style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "row", minHeight: 0 }}>

        {/* Left sidebar */}
        <div data-sab-sidebar style={{ width: "280px", minWidth: "260px", maxWidth: "300px", flexShrink: 0, borderRight: "1px solid var(--border-subtle)", overflowY: "auto", padding: "18px 16px", display: "flex", flexDirection: "column", gap: "14px", background: "var(--bg-base)" }}>

          {/* Scenario selector */}
          {scenarios.length > 1 && (
            <div>
              <label style={labelStyle}>Scenario</label>
              <select value={activeId ?? ""} onChange={(e) => {
                const s = scenarios.find((sc) => sc.id === e.target.value);
                if (s) { setActiveId(s.id); setForm(DEFAULT_FORM(effectiveExpenses, effectiveIncome, liquidAssets, defaultInvestmentReturn, s)); setIsEditing(false); }
              }} style={inputStyle}>
                {scenarios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}

          {/* Form */}
          {(isEditing || showNewForm || scenarios.length === 0) && (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>

              {/* Break type toggle */}
              <div>
                <label style={labelStyle}>Type</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px" }}>
                  {(["vacation", "sabbatical"] as BreakType[]).map((t) => (
                    <button key={t} type="button" onClick={() => { setField("break_type", t); setField("name", t === "vacation" ? "My Vacation" : "Career Break"); }}
                      style={{ padding: "7px 0", borderRadius: "var(--radius-sm)", fontSize: "12px", fontWeight: 600, fontFamily: "var(--font-body)", cursor: "pointer", border: `1px solid ${breakType === t ? "var(--accent)" : "var(--border-subtle)"}`, background: breakType === t ? "var(--accent)" : "transparent", color: breakType === t ? "#fff" : "var(--text-secondary)", textTransform: "capitalize" }}>
                      {t === "vacation" ? "Vacation" : "Career Break"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={labelStyle}>Name</label>
                <input style={inputStyle} value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder={breakType === "vacation" ? "e.g. Europe Trip" : "e.g. 6-Month Break"} />
              </div>

              <div style={{ height: "1px", background: "var(--border-subtle)" }} />

              {/* === VACATION FIELDS === */}
              {breakType === "vacation" && (
                <>
                  <p style={sectionLabel}>Trip Details</p>
                  <div>
                    <label style={labelStyle}>Duration (days)</label>
                    <input style={inputStyle} type="number" min={1} max={365} value={form.vacation_duration_days ?? 7} onChange={(e) => setField("vacation_duration_days", Number(e.target.value))} />
                  </div>
                  <div>
                    <label style={labelStyle}>Daily budget (hotels, food, activities)</label>
                    <input style={inputStyle} type="number" min={0} value={form.vacation_daily_budget ?? 200} onChange={(e) => setField("vacation_daily_budget", Number(e.target.value))} placeholder="200" />
                  </div>
                  <div>
                    <label style={labelStyle}>Flights &amp; travel costs</label>
                    <input style={inputStyle} type="number" min={0} value={form.vacation_travel_costs ?? 500} onChange={(e) => setField("vacation_travel_costs", Number(e.target.value))} placeholder="500" />
                  </div>
                  <div>
                    <label style={labelStyle}>Target date (optional)</label>
                    <input style={inputStyle} type="month" value={form.vacation_target_date ?? ""} onChange={(e) => setField("vacation_target_date", e.target.value || null)} />
                    <div style={{ fontSize: "9px", color: "var(--text-muted)", marginTop: "3px", fontFamily: "var(--font-body)" }}>Set a deadline to calculate how much to save monthly</div>
                  </div>

                  <div style={{ height: "1px", background: "var(--border-subtle)" }} />
                  <p style={sectionLabel}>Funding</p>
                  <div>
                    <label style={labelStyle}>Liquid savings available</label>
                    <input style={inputStyle} type="number" min={0} value={form.liquid_assets_available} onChange={(e) => setField("liquid_assets_available", Number(e.target.value))} />
                    {liquidAssets > 0 && Math.abs(Number(form.liquid_assets_available) - liquidAssets) > 500 && (
                      <button type="button" onClick={() => setField("liquid_assets_available", liquidAssets)} style={{ fontSize: "10px", color: "var(--accent)", background: "none", border: "none", cursor: "pointer", padding: "2px 0", fontFamily: "var(--font-body)" }}>
                        Use balance sheet ({fmt(Math.round(liquidAssets))})
                      </button>
                    )}
                  </div>
                </>
              )}

              {/* === SABBATICAL FIELDS === */}
              {breakType === "sabbatical" && (
                <>
                  <p style={sectionLabel}>Career Break</p>
                  <div>
                    <label style={labelStyle}>Length (months)</label>
                    <input style={inputStyle} type="number" min={1} max={60} value={form.sabbatical_months} onChange={(e) => setField("sabbatical_months", Number(e.target.value))} />
                  </div>
                  <div>
                    <label style={labelStyle}>Monthly spending during break</label>
                    <input style={inputStyle} type="number" min={0} value={form.monthly_expenses_during} onChange={(e) => setField("monthly_expenses_during", Number(e.target.value))} />
                  </div>
                  <div>
                    <label style={labelStyle}>Monthly stipend / freelance</label>
                    <input style={inputStyle} type="number" min={0} value={form.monthly_stipend} onChange={(e) => setField("monthly_stipend", Number(e.target.value))} />
                    <div style={{ fontSize: "9px", color: "var(--text-muted)", marginTop: "3px", fontFamily: "var(--font-body)" }}>Part-time or consulting income during the break</div>
                  </div>

                  <div style={{ height: "1px", background: "var(--border-subtle)" }} />
                  <p style={sectionLabel}>Financial Position</p>
                  <div>
                    <label style={labelStyle}>Liquid savings available</label>
                    <input style={inputStyle} type="number" min={0} value={form.liquid_assets_available} onChange={(e) => setField("liquid_assets_available", Number(e.target.value))} />
                    {liquidAssets > 0 && Math.abs(Number(form.liquid_assets_available) - liquidAssets) > 500 && (
                      <button type="button" onClick={() => setField("liquid_assets_available", liquidAssets)} style={{ fontSize: "10px", color: "var(--accent)", background: "none", border: "none", cursor: "pointer", padding: "2px 0", fontFamily: "var(--font-body)" }}>
                        Use balance sheet ({fmt(Math.round(liquidAssets))})
                      </button>
                    )}
                  </div>
                  <div>
                    <label style={labelStyle}>Current monthly income</label>
                    <input style={inputStyle} type="number" min={0} value={form.current_monthly_income} onChange={(e) => setField("current_monthly_income", Number(e.target.value))} />
                  </div>

                  <div style={{ height: "1px", background: "var(--border-subtle)" }} />
                  <p style={sectionLabel}>After Returning</p>
                  <div>
                    <label style={labelStyle}>Monthly income on return</label>
                    <input style={inputStyle} type="number" min={0} value={form.monthly_income_after_return} onChange={(e) => setField("monthly_income_after_return", Number(e.target.value))} />
                    <div style={{ fontSize: "9px", color: "var(--text-muted)", marginTop: "3px", fontFamily: "var(--font-body)" }}>Same as current if returning to same role</div>
                  </div>
                </>
              )}

              <div style={{ display: "flex", gap: "8px" }}>
                <button type="button" disabled={isPending} onClick={handleSave} style={{ flex: 1, padding: "9px 0", borderRadius: "var(--radius-md)", background: "oklch(0.62 0.22 295)", color: "#fff", border: "none", fontSize: "12px", fontWeight: 700, fontFamily: "var(--font-body)", cursor: "pointer", opacity: isPending ? 0.55 : 1, boxShadow: isPending ? "none" : "0 2px 12px oklch(0.62 0.22 295 / 0.4)", letterSpacing: "0.03em" }}>
                  {isPending ? "Saving…" : "Save Scenario"}
                </button>
                {activeScenario && (
                  <button type="button" onClick={() => { setIsEditing(false); setShowNewForm(false); }} style={{ padding: "8px 12px", borderRadius: "var(--radius-md)", background: "transparent", color: "var(--text-muted)", border: "1px solid var(--border-subtle)", fontSize: "12px", fontFamily: "var(--font-body)", cursor: "pointer" }}>
                    Cancel
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Edit / Delete for existing scenario */}
          {activeScenario && !isEditing && !showNewForm && (
            <div style={{ display: "flex", gap: "8px" }}>
              <button type="button" onClick={() => setIsEditing(true)} style={{ flex: 1, padding: "7px 0", borderRadius: "var(--radius-md)", background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border-subtle)", fontSize: "12px", fontFamily: "var(--font-body)", cursor: "pointer" }}>Edit</button>
              <button type="button" disabled={isPending} onClick={() => handleDelete(activeScenario.id)} style={{ padding: "7px 10px", borderRadius: "var(--radius-md)", background: "transparent", color: "var(--red)", border: "1px solid color-mix(in oklch, var(--red) 30%, transparent)", fontSize: "12px", fontFamily: "var(--font-body)", cursor: "pointer" }}>Delete</button>
            </div>
          )}

          {/* At a Glance */}
          {showAnalysis && glanceItems.length > 0 && (
            <>
              <div style={{ height: "1px", background: "var(--border-subtle)", margin: "2px 0 6px" }} />
              <p style={{ ...sectionLabel, marginBottom: "10px" }}>At a Glance</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                {glanceItems.map(({ label, value, sub, color }) => (
                  <div key={label} style={{ padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}>
                    <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", marginBottom: "4px", fontFamily: "var(--font-body)" }}>{label}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "14px", fontWeight: 800, color, lineHeight: 1, marginBottom: "3px" }}>{value}</div>
                    <div style={{ fontSize: "9px", color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>{sub}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Right panel */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px 40px", display: "flex", flexDirection: "column", gap: "16px", minWidth: 0 }}>

          {/* Empty state — only when no scenarios and not in form */}
          {!showAnalysis && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: "14px", textAlign: "center" }}>
              <div style={{ width: "52px", height: "52px", borderRadius: "50%", background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="oklch(0.65 0.18 260)" strokeWidth="1.5"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
              </div>
              <div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: "20px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "6px" }}>Plan your time off</div>
                <div style={{ fontSize: "13px", color: "var(--text-secondary)", maxWidth: "340px", lineHeight: 1.6 }}>Model a vacation, sabbatical, or career break. See exactly what it costs, whether you can afford it, and when you&apos;d financially recover.</div>
              </div>
              <button type="button" onClick={() => setIsEditing(true)} style={{ padding: "9px 20px", borderRadius: "var(--radius-md)", background: "var(--accent)", color: "#fff", border: "none", fontSize: "13px", fontWeight: 600, fontFamily: "var(--font-body)", cursor: "pointer" }}>
                Create a scenario
              </button>
            </div>
          )}

          {/* Verdict card */}
          {showAnalysis && verdict && meta && (
            <div style={{ background: meta.bg, border: `1px solid ${meta.border}`, borderRadius: "var(--radius-lg)", padding: "20px 24px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                    <span style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>FINN Assessment</span>
                    <span style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", padding: "2px 8px", borderRadius: "99px", background: `${meta.color}22`, color: meta.color, fontFamily: "var(--font-body)" }}>
                      {(vacationResult ?? sabbaticalResult)?.verdictConfidence}
                    </span>
                  </div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: "46px", fontWeight: 800, letterSpacing: "-1.5px", lineHeight: 1, color: meta.color, marginBottom: "12px" }}>
                    {meta.label}
                  </div>

                  {/* Key stats row */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", marginTop: "10px" }}>
                    {breakType === "vacation" && vacationResult && (
                      <>
                        <div>
                          <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>Total Cost</div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 800, color: meta.color, marginTop: "2px" }}>{fmt(vacationResult.totalCost)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>% of Savings</div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 800, color: vacationResult.depletionPct > 30 ? "var(--red)" : meta.color, marginTop: "2px" }}>{vacationResult.depletionPct}%</div>
                        </div>
                        {!vacationResult.isFunded && (
                          <div>
                            <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>Still Need</div>
                            <div style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 800, color: "var(--red)", marginTop: "2px" }}>{fmt(vacationResult.shortfall)}</div>
                          </div>
                        )}
                      </>
                    )}
                    {breakType === "sabbatical" && sabbaticalResult && (
                      <>
                        <div>
                          <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>Runway</div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 800, color: sabbaticalResult.canAfford ? meta.color : "var(--red)", marginTop: "2px" }}>{sabbaticalResult.runwayMonths > 99 ? "∞" : `${sabbaticalResult.runwayMonths.toFixed(0)} months`}</div>
                        </div>
                        {sabbaticalResult.recoveryMonths != null && (
                          <div>
                            <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>Recovery</div>
                            <div style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 800, color: sabbaticalResult.recoveryMonths <= 18 ? meta.color : "oklch(0.78 0.15 75)", marginTop: "2px" }}>{sabbaticalResult.recoveryMonths} months</div>
                          </div>
                        )}
                        <div>
                          <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>Net Cost</div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 800, color: "var(--text-primary)", marginTop: "2px" }}>{fmtK(sabbaticalResult.totalDepletion)}</div>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Progress ring */}
                <div style={{ textAlign: "center", flexShrink: 0 }}>
                  {breakType === "vacation" && vacationResult && (() => {
                    const pct = Math.min(1, vacationResult.totalCost / Math.max(1, Number(form.liquid_assets_available)));
                    return (
                      <div style={{ position: "relative", width: "72px", height: "72px" }}>
                        <svg width="72" height="72" viewBox="0 0 72 72" style={{ transform: "rotate(-90deg)" }}>
                          <circle cx="36" cy="36" r="28" fill="none" stroke="var(--border)" strokeWidth="5" />
                          <circle cx="36" cy="36" r="28" fill="none" stroke={meta.color} strokeWidth="5" strokeLinecap="round"
                            strokeDasharray={`${2 * Math.PI * 28}`}
                            strokeDashoffset={`${2 * Math.PI * 28 * (1 - Math.min(1, pct))}`} />
                        </svg>
                        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 800, color: meta.color, lineHeight: 1 }}>{Math.round(pct * 100)}%</div>
                          <div style={{ fontSize: "8px", color: "var(--text-muted)", fontFamily: "var(--font-body)", textAlign: "center", marginTop: "1px" }}>of savings</div>
                        </div>
                      </div>
                    );
                  })()}
                  {breakType === "sabbatical" && sabbaticalResult && (() => {
                    const pct = Math.min(1, form.sabbatical_months / Math.max(1, sabbaticalResult.runwayMonths));
                    return (
                      <div style={{ position: "relative", width: "72px", height: "72px" }}>
                        <svg width="72" height="72" viewBox="0 0 72 72" style={{ transform: "rotate(-90deg)" }}>
                          <circle cx="36" cy="36" r="28" fill="none" stroke="var(--border)" strokeWidth="5" />
                          <circle cx="36" cy="36" r="28" fill="none" stroke={meta.color} strokeWidth="5" strokeLinecap="round"
                            strokeDasharray={`${2 * Math.PI * 28}`}
                            strokeDashoffset={`${2 * Math.PI * 28 * (1 - Math.min(1, pct))}`} />
                        </svg>
                        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 800, color: meta.color, lineHeight: 1 }}>{Math.round(Math.min(100, (sabbaticalResult.runwayMonths / Math.max(1, form.sabbatical_months)) * 100))}%</div>
                          <div style={{ fontSize: "8px", color: "var(--text-muted)", fontFamily: "var(--font-body)", textAlign: "center", marginTop: "1px" }}>funded</div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Conditions */}
              {(vacationResult ?? sabbaticalResult)?.verdictConditions.length ? (
                <div style={{ marginTop: "14px", paddingTop: "14px", borderTop: `1px solid ${meta.border}` }}>
                  <div style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-body)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "8px" }}>Conditions</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                    {(vacationResult ?? sabbaticalResult)!.verdictConditions.map((c, i) => (
                      <div key={i} style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: meta.color, marginTop: "1px", flexShrink: 0 }}>→</span>
                        <span style={{ fontSize: "12px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", lineHeight: 1.5 }}>{c}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* FINN narrative */}
          {showAnalysis && (vacationResult ?? sabbaticalResult) && (
            <div style={{ background: "rgba(99,102,241,0.04)", border: "1px solid rgba(99,102,241,0.22)", borderRadius: "var(--radius-lg)", padding: "14px 16px" }}>
              <div style={{ display: "flex", gap: "11px", alignItems: "flex-start" }}>
                <div style={{ flexShrink: 0, width: "24px", height: "24px", borderRadius: "50%", background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.25)", display: "flex", alignItems: "center", justifyContent: "center", marginTop: "1px" }}>
                  <svg width="10" height="10" viewBox="0 0 20 20" fill="none">
                    <path d="M10 2a7 7 0 014.83 12.01L14 17H6l-.83-2.99A7 7 0 0110 2z" fill="rgba(99,102,241,0.2)" stroke="oklch(0.65 0.18 260)" strokeWidth="1.5"/>
                    <path d="M8 17h4" stroke="oklch(0.65 0.18 260)" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>
                <div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: "9px", fontWeight: 700, color: "oklch(0.65 0.18 260)", letterSpacing: "0.09em", textTransform: "uppercase", marginBottom: "4px" }}>FINN</div>
                  <p style={{ fontSize: "13px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", lineHeight: 1.65, margin: 0 }}>{(vacationResult ?? sabbaticalResult)!.finnNarrative}</p>
                </div>
              </div>
            </div>
          )}

          {/* === VACATION: Cost breakdown + Savings plan === */}
          {showAnalysis && breakType === "vacation" && vacationResult && (
            <>
              {/* Cost Breakdown */}
              <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "18px 20px" }}>
                <div style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: "14px", color: "var(--text-primary)", marginBottom: "14px" }}>Trip Budget Breakdown</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {[
                    { label: "Flights & travel", value: Number(form.vacation_travel_costs ?? 500), pct: vacationResult.totalCost > 0 ? Math.round((Number(form.vacation_travel_costs ?? 500) / vacationResult.totalCost) * 100) : 0 },
                    { label: `${form.vacation_duration_days ?? 7} days × ${fmt(Number(form.vacation_daily_budget ?? 200))}/day`, value: (form.vacation_duration_days ?? 7) * (Number(form.vacation_daily_budget ?? 200)), pct: vacationResult.totalCost > 0 ? Math.round(((form.vacation_duration_days ?? 7) * Number(form.vacation_daily_budget ?? 200) / vacationResult.totalCost) * 100) : 0 },
                  ].map(({ label, value, pct }) => (
                    <div key={label} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                          <span style={{ fontSize: "12px", color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>{label}</span>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>{fmt(value)}</span>
                        </div>
                        <div style={{ height: "4px", borderRadius: "2px", background: "var(--border-subtle)", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${pct}%`, borderRadius: "2px", background: "var(--accent)", transition: "width 0.4s ease" }} />
                        </div>
                      </div>
                    </div>
                  ))}
                  <div style={{ height: "1px", background: "var(--border-subtle)", margin: "4px 0" }} />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>Total</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "15px", fontWeight: 800, color: "var(--text-primary)" }}>{fmt(vacationResult.totalCost)}</span>
                  </div>
                </div>
              </div>

              {/* Savings plan (if not funded or target date set) */}
              {(!vacationResult.isFunded || form.vacation_target_date) && (
                <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "18px 20px" }}>
                  <div style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: "14px", color: "var(--text-primary)", marginBottom: "4px" }}>Savings Plan</div>
                  <div style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginBottom: "14px" }}>How to reach {fmt(vacationResult.totalCost)}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                    {[
                      { label: "Have now", value: fmt(Math.round(Number(form.liquid_assets_available))), color: vacationResult.isFunded ? "var(--green)" : "var(--text-primary)" },
                      { label: "Still need", value: vacationResult.isFunded ? "Funded" : fmt(vacationResult.shortfall), color: vacationResult.isFunded ? "var(--green)" : "var(--red)" },
                      ...(form.vacation_target_date && vacationResult.monthlySavingsNeeded != null ? [{ label: `By ${form.vacation_target_date}`, value: `${fmt(vacationResult.monthlySavingsNeeded)}/mo`, color: "var(--accent)" }] : []),
                      ...(vacationResult.monthsToSave != null && !vacationResult.isFunded ? [{ label: "Ready in", value: `${vacationResult.monthsToSave} months`, color: "var(--text-secondary)" }] : []),
                    ].map(({ label, value, color }) => (
                      <div key={label} style={{ padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}>
                        <div style={{ fontSize: "9px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "3px", fontFamily: "var(--font-body)" }}>{label}</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: "14px", fontWeight: 700, color }}>{value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* === VACATION: Opportunity cost + Recurring cost === */}
          {showAnalysis && breakType === "vacation" && vacationResult && (() => {
            const cost = vacationResult.totalCost;
            const r = 0.07;
            const fv10 = Math.round(cost * Math.pow(1 + r, 10));
            const fv20 = Math.round(cost * Math.pow(1 + r, 20));
            const annualCost = cost;
            const fiveYearCost = cost * 5;
            const tenYearCost = cost * 10;
            return (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                {/* Opportunity cost */}
                <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "16px 18px" }}>
                  <div style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: "13px", color: "var(--text-primary)", marginBottom: "3px" }}>If Invested Instead</div>
                  <div style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginBottom: "12px" }}>Opportunity cost at 7% annual return</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
                    {[
                      { label: "In 10 years", value: `$${(fv10 / 1000).toFixed(0)}k` },
                      { label: "In 20 years", value: `$${(fv20 / 1000).toFixed(0)}k` },
                    ].map(({ label, value }) => (
                      <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>{label}</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 700, color: "var(--text-muted)" }}>{value}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: "10px", fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-body)", lineHeight: 1.5 }}>
                    The experience is the value. This is just the cost of choosing it.
                  </div>
                </div>
                {/* Annual recurring cost */}
                <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "16px 18px" }}>
                  <div style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: "13px", color: "var(--text-primary)", marginBottom: "3px" }}>Recurring Cost</div>
                  <div style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginBottom: "12px" }}>If this becomes an annual trip</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
                    {[
                      { label: "Per year", value: fmt(Math.round(annualCost)) },
                      { label: "Over 5 years", value: fmt(Math.round(fiveYearCost)) },
                      { label: "Over 10 years", value: fmt(Math.round(tenYearCost)) },
                    ].map(({ label, value }) => (
                      <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>{label}</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 700, color: "var(--text-primary)" }}>{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* === SABBATICAL: Runway chart + Ecosystem impact === */}
          {showAnalysis && breakType === "sabbatical" && sabbaticalResult && (
            <>
              {/* Savings runway chart */}
              {sabbaticalResult.timeline.length > 1 && (
                <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "18px 20px" }}>
                  <div style={{ marginBottom: "14px" }}>
                    <div style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: "14px", color: "var(--text-primary)", marginBottom: "2px" }}>Savings Runway</div>
                    <div style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>Liquid savings during and after your career break</div>
                  </div>
                  <div style={{ position: "relative", height: "80px" }}>
                    <svg width="100%" height="80" viewBox={`0 0 ${sabbaticalResult.timeline.length} 80`} preserveAspectRatio="none">
                      <defs>
                        <linearGradient id="sab-line-grad" x1="0" y1="0" x2="1" y2="0" gradientUnits="objectBoundingBox">
                          <stop offset="0%" stopColor="oklch(0.65 0.18 260)" />
                          <stop offset={`${(Number(form.sabbatical_months) / sabbaticalResult.timeline.length) * 100}%`} stopColor="oklch(0.65 0.18 260)" />
                          <stop offset={`${(Number(form.sabbatical_months) / sabbaticalResult.timeline.length) * 100}%`} stopColor="oklch(0.72 0.19 145)" />
                          <stop offset="100%" stopColor="oklch(0.72 0.19 145)" />
                        </linearGradient>
                      </defs>
                      <rect x={0} y={0} width={Number(form.sabbatical_months)} height={80} fill="rgba(99,102,241,0.05)" />
                      <polyline
                        points={sabbaticalResult.timeline.map((t, i) => `${i},${Math.round(80 - (t.balance / maxTimeline) * 72)}`).join(" ")}
                        fill="none" stroke="url(#sab-line-grad)" strokeWidth="2" vectorEffect="non-scaling-stroke"
                      />
                    </svg>
                    <div style={{ position: "absolute", left: 0, bottom: 0, fontSize: "9px", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>Month 0</div>
                    <div style={{ position: "absolute", right: 0, bottom: 0, fontSize: "9px", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>Month {sabbaticalResult.timeline.length - 1}</div>
                    <div style={{ position: "absolute", top: 0, left: "4px", fontSize: "9px", color: "oklch(0.65 0.18 260)", fontFamily: "var(--font-body)", fontWeight: 600 }}>Break →</div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginTop: "14px" }}>
                    {[
                      { label: "Starting savings", value: fmt(Math.round(Number(form.liquid_assets_available))) },
                      { label: `After ${form.sabbatical_months} months`, value: fmt(Math.max(0, Math.round(Number(form.liquid_assets_available) - sabbaticalResult.totalDepletion))) },
                      { label: "Recovery point", value: sabbaticalResult.breakEvenMonth != null ? `Month ${sabbaticalResult.breakEvenMonth}` : "Open-ended" },
                    ].map(({ label, value }) => (
                      <div key={label} style={{ padding: "8px 10px", borderRadius: "var(--radius-sm)", background: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}>
                        <div style={{ fontSize: "9px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "3px", fontFamily: "var(--font-body)" }}>{label}</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>{value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Ecosystem impact */}
              <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "18px 20px" }}>
                <div style={{ marginBottom: "14px" }}>
                  <div style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: "14px", color: "var(--text-primary)", marginBottom: "2px" }}>Financial Ecosystem Impact</div>
                  <div style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>How this decision ripples through your financial life</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  {[
                    { label: "Income Foregone", value: fmtK(sabbaticalResult.incomeLost), sub: `${form.sabbatical_months} mo × ${fmt(Math.round(Number(form.current_monthly_income)))}`, color: "var(--red)" },
                    { label: "Savings Depleted", value: fmtK(sabbaticalResult.totalDepletion), sub: `${sabbaticalResult.depletionPct}% of liquid savings`, color: sabbaticalResult.depletionPct > 50 ? "var(--red)" : "oklch(0.78 0.15 75)" },
                    { label: "FI Timeline", value: sabbaticalResult.fiYearsBefore != null && sabbaticalResult.fiYearsAfter != null ? sabbaticalResult.fiYearsAfter - sabbaticalResult.fiYearsBefore > 0 ? `+${sabbaticalResult.fiYearsAfter - sabbaticalResult.fiYearsBefore} yr${sabbaticalResult.fiYearsAfter - sabbaticalResult.fiYearsBefore > 1 ? "s" : ""} later` : "Unchanged" : "—", sub: "to FI (25× expenses)", color: "var(--text-secondary)" },
                    { label: "Net Monthly Burn", value: sabbaticalResult.netMonthlyBurn > 0 ? fmt(Math.round(sabbaticalResult.netMonthlyBurn)) : "Break-even", sub: "spending minus stipend", color: sabbaticalResult.netMonthlyBurn > 0 ? "var(--red)" : "var(--green)" },
                  ].map(({ label, value, sub, color }) => (
                    <div key={label} style={{ padding: "12px 14px", borderRadius: "var(--radius-md)", background: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}>
                      <div style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", fontFamily: "var(--font-body)", marginBottom: "3px" }}>{label}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: "14px", fontWeight: 700, color, marginBottom: "2px" }}>{value}</div>
                      <div style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>{sub}</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* What would change the verdict */}
          {showAnalysis && verdict && verdict !== "GO" && verdict !== "BOOK_IT" && (
            <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "18px 20px" }}>
              <div style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: "14px", color: "var(--text-primary)", marginBottom: "4px" }}>What Would Change the Verdict?</div>
              <div style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginBottom: "14px" }}>Adjustments that move the needle</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {(() => {
                  const hints: { label: string; desc: string }[] = [];
                  if (breakType === "vacation" && vacationResult) {
                    if (!vacationResult.isFunded) hints.push({ label: `Save ${fmt(vacationResult.shortfall)} more`, desc: "Reach full funding before booking." });
                    if (Number(form.vacation_daily_budget ?? 200) > 150) hints.push({ label: "Trim daily budget", desc: `Cutting to $150/day saves ${fmt((Number(form.vacation_daily_budget ?? 200) - 150) * (form.vacation_duration_days ?? 7))} total.` });
                    if (Number(form.vacation_duration_days ?? 7) > 5) hints.push({ label: `Shorten to ${Math.max(3, Math.round((form.vacation_duration_days ?? 7) * 0.7))} days`, desc: "Smaller trip, lower cost, same experience." });
                  }
                  if (breakType === "sabbatical" && sabbaticalResult) {
                    if (!sabbaticalResult.canAfford) {
                      const shortfall = sabbaticalResult.totalDepletion - Number(form.liquid_assets_available);
                      hints.push({ label: `Save ${fmtK(shortfall)} more`, desc: "Reach minimum required liquid savings." });
                    }
                    if (sabbaticalResult.bufferMonths < 3) {
                      const extra = (3 - sabbaticalResult.bufferMonths) * sabbaticalResult.netMonthlyBurn;
                      if (extra > 0) hints.push({ label: `Add ${fmtK(extra)} buffer`, desc: "Reach a 3-month safety cushion above the break cost." });
                    }
                    if (sabbaticalResult.recoveryMonths == null || sabbaticalResult.recoveryMonths > 18) hints.push({ label: "Find part-time income", desc: "Even modest freelance income changes recovery significantly." });
                    hints.push({ label: `Shorten to ${Math.max(1, Math.round(Number(form.sabbatical_months) * 0.65))} months`, desc: `Reduces total cost to ~${fmtK(Math.round(Number(form.sabbatical_months) * 0.65) * sabbaticalResult.netMonthlyBurn)}.` });
                  }
                  return hints.slice(0, 3).map((h, i) => (
                    <div key={i} style={{ display: "flex", gap: "10px", padding: "10px 12px", borderRadius: "var(--radius-sm)", background: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "oklch(0.72 0.19 145)", flexShrink: 0, marginTop: "1px" }}>#{i + 1}</span>
                      <div>
                        <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-body)", marginBottom: "2px" }}>{h.label}</div>
                        <div style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", lineHeight: 1.5 }}>{h.desc}</div>
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
