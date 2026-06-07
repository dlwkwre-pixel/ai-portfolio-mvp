"use client";

import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import type { SabbaticalScenario } from "./sabbatical-actions";
import { saveSabbaticalScenario, deleteSabbaticalScenario } from "./sabbatical-actions";
import type { FinancialProfile } from "@/app/planning/planning-actions";

// ── Math engine ──────────────────────────────────────────────────────────────

type VerdictType = "GO" | "PLAN" | "NOT_YET";

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
  retirImpactPp: number | null;
  verdict: VerdictType;
  verdictConfidence: string;
  verdictConditions: string[];
  finnNarrative: string;
  timeline: { month: number; balance: number; phase: "sabbatical" | "recovery" | "baseline" }[];
};

function fmtK(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${n < 0 ? "-" : ""}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${n < 0 ? "-" : ""}$${Math.round(abs / 1_000)}k`;
  return `${n < 0 ? "-" : ""}$${Math.round(abs)}`;
}
function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

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

function computeSabbatical(
  inputs: SabbaticalScenario,
  currentNetWorth: number,
  effectiveExpenses: number,
  investmentReturn: number,
): SabbaticalComputed {
  const r = investmentReturn;
  const months = inputs.sabbatical_months;
  const burn = Math.max(0, Number(inputs.monthly_expenses_during) - Number(inputs.monthly_stipend));
  const liquid = Number(inputs.liquid_assets_available);
  const income = Number(inputs.current_monthly_income);
  const incomeAfter = Number(inputs.monthly_income_after_return);
  const expensesDuring = Number(inputs.monthly_expenses_during);

  const runway = burn > 0 ? liquid / burn : 999;
  const canAfford = runway >= months;
  const buffer = runway - months;
  const depletion = months * burn;
  const depletionPct = liquid > 0 ? Math.min(100, Math.round((depletion / liquid) * 100)) : 100;

  const netSavingsAfter = incomeAfter - effectiveExpenses;
  const recoveryMonths = netSavingsAfter > 0 ? Math.ceil(depletion / netSavingsAfter) : null;

  const incomeLost = months * income;
  const breakEvenMonth = recoveryMonths != null ? months + recoveryMonths : null;

  // FI impact
  const fiTarget = effectiveExpenses > 0 ? effectiveExpenses * 12 * 25 : 0;
  const monthlySavingsBefore = income - effectiveExpenses;
  const monthlySavingsAfter = incomeAfter - effectiveExpenses;
  const fiBefore = fiTarget > 0 ? yearsToFI(currentNetWorth, Math.max(0, monthlySavingsBefore), fiTarget, r) : null;
  const nwAfterSabbatical = currentNetWorth - depletion;
  const fiAfter = fiTarget > 0 ? yearsToFI(nwAfterSabbatical, Math.max(0, monthlySavingsAfter), fiTarget, r) : null;

  // Rough retirement probability change: if income after return is lower, prob drops
  const retirImpactPp = (incomeAfter < income && effectiveExpenses > 0)
    ? Math.round(((income - incomeAfter) / income) * -15)
    : null;

  // Verdict
  let verdict: VerdictType;
  let verdictConfidence: string;
  let verdictConditions: string[];

  if (!canAfford) {
    verdict = "NOT_YET";
    verdictConfidence = "Insufficient Runway";
    verdictConditions = [
      `Build liquid savings to at least ${fmt(depletion)}`,
      `Current runway is ${runway.toFixed(1)} months vs ${months} needed`,
    ];
  } else if (buffer >= 3 && (recoveryMonths == null || recoveryMonths <= 18)) {
    verdict = "GO";
    verdictConfidence = buffer >= 6 ? "Strong Case" : "Solid Case";
    verdictConditions = [];
  } else if (canAfford && (recoveryMonths == null || recoveryMonths <= 36)) {
    verdict = "PLAN";
    verdictConfidence = buffer < 3 ? "Tight Margin" : "Plan Required";
    verdictConditions = [
      ...(buffer < 3 ? [`Buffer is only ${buffer.toFixed(1)} months — build to 3+ months of extra runway`] : []),
      ...(recoveryMonths != null && recoveryMonths > 18 ? [`Recovery takes ${recoveryMonths} months — explore part-time income`] : []),
    ];
  } else {
    verdict = "NOT_YET";
    verdictConfidence = recoveryMonths != null ? "Long Recovery" : "No Recovery Path";
    verdictConditions = [
      recoveryMonths != null
        ? `Recovery of ${recoveryMonths} months exceeds 3-year threshold`
        : "Return income insufficient to rebuild savings",
      "Increase return income or reduce sabbatical length",
    ];
  }

  // FINN narrative
  let finnNarrative: string;
  if (!canAfford) {
    finnNarrative = `The numbers don't support this yet. A ${months}-month sabbatical requires ${fmtK(depletion)} in available cash, but you only have ${fmtK(liquid)} to work with — a ${fmtK(depletion - liquid)} gap. Before anything else, build liquid savings toward that target. Everything else is secondary.`;
  } else if (verdict === "GO") {
    finnNarrative = `The math supports this. With ${runway.toFixed(0)} months of runway against a ${months}-month plan, you have ${buffer.toFixed(0)} months of buffer. ${recoveryMonths != null ? `Recovery takes ${recoveryMonths} months at your expected return income — ` : ""}${fiBefore != null && fiAfter != null && fiAfter > fiBefore ? `it delays FI by about ${fiAfter - fiBefore} year${fiAfter - fiBefore > 1 ? "s" : ""}, ` : ""}but this is a financially sound break. The biggest risk is whether the ${fmt(incomeAfter)}/mo income after return is realistic.`;
  } else if (verdict === "PLAN") {
    finnNarrative = `Possible, but the margin is thin${buffer < 3 ? ` — ${buffer.toFixed(1)} months of cushion isn't enough to absorb a setback` : ""}. ${recoveryMonths != null && recoveryMonths > 18 ? `At ${recoveryMonths} months to rebuild, a part-time or freelance income stream during the sabbatical would materially change this analysis.` : "The plan works if execution stays on track."} Run the numbers again after increasing either your liquid savings or your stipend income.`;
  } else {
    finnNarrative = `Not yet. The recovery path is too long${recoveryMonths != null ? ` — ${recoveryMonths} months to get back to your starting position` : ""}, which suggests the return income doesn't provide enough margin to rebuild. Either shorten the sabbatical, find supplementary income during the break, or increase your savings before starting.`;
  }

  // Build timeline for chart (show month-by-month balance)
  const timeline: SabbaticalComputed["timeline"] = [];
  let balance = liquid;
  const displayMonths = Math.min(60, months + (recoveryMonths ?? 24));
  for (let m = 0; m <= displayMonths; m++) {
    let phase: "sabbatical" | "recovery" | "baseline";
    if (m < months) {
      phase = "sabbatical";
      if (m > 0) balance -= burn;
    } else {
      phase = balance < liquid ? "recovery" : "baseline";
      if (m > 0) balance += netSavingsAfter;
    }
    timeline.push({ month: m, balance: Math.max(0, Math.round(balance)), phase });
  }

  return {
    netMonthlyBurn: burn,
    runwayMonths: runway,
    canAfford,
    bufferMonths: buffer,
    totalDepletion: depletion,
    depletionPct,
    recoveryMonths,
    incomeLost,
    breakEvenMonth,
    fiYearsBefore: fiBefore,
    fiYearsAfter: fiAfter,
    retirImpactPp,
    verdict,
    verdictConfidence,
    verdictConditions,
    finnNarrative,
    timeline,
  };
}

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

export default function SabbaticalClient({
  scenarios,
  profile,
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

  const [form, setForm] = useState<Omit<SabbaticalScenario, "id" | "user_id" | "created_at" | "updated_at">>({
    name: activeScenario?.name ?? "Sabbatical",
    sabbatical_months: activeScenario?.sabbatical_months ?? 12,
    monthly_expenses_during: activeScenario?.monthly_expenses_during ?? (effectiveExpenses || 3000),
    monthly_stipend: activeScenario?.monthly_stipend ?? 0,
    liquid_assets_available: activeScenario?.liquid_assets_available ?? liquidAssets,
    current_monthly_income: activeScenario?.current_monthly_income ?? (effectiveIncome || 5000),
    monthly_income_after_return: activeScenario?.monthly_income_after_return ?? (effectiveIncome || 5000),
    investment_return_rate: activeScenario?.investment_return_rate ?? defaultInvestmentReturn,
    notes: activeScenario?.notes ?? null,
  });

  const computed = useMemo(
    () => computeSabbatical(
      { ...form, id: "", user_id: "", created_at: "", updated_at: "" },
      currentNetWorth,
      effectiveExpenses || Number(form.monthly_expenses_during),
      Number(form.investment_return_rate),
    ),
    [form, currentNetWorth, effectiveExpenses],
  );

  function setField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    startTransition(async () => {
      await saveSabbaticalScenario(form, activeScenario?.id);
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

  const verdictMeta: Record<VerdictType, { label: string; color: string; bg: string; border: string }> = {
    GO: {
      label: "Go For It",
      color: "oklch(0.72 0.19 145)",
      bg: "color-mix(in oklch, oklch(0.55 0.15 145) 9%, transparent)",
      border: "color-mix(in oklch, oklch(0.55 0.15 145) 28%, transparent)",
    },
    PLAN: {
      label: "Plan It First",
      color: "oklch(0.78 0.17 70)",
      bg: "color-mix(in oklch, oklch(0.78 0.17 70) 9%, transparent)",
      border: "color-mix(in oklch, oklch(0.78 0.17 70) 22%, transparent)",
    },
    NOT_YET: {
      label: "Not Yet",
      color: "oklch(0.65 0.18 25)",
      bg: "color-mix(in oklch, oklch(0.50 0.15 25) 10%, transparent)",
      border: "color-mix(in oklch, oklch(0.50 0.15 25) 28%, transparent)",
    },
  };

  const meta = verdictMeta[computed.verdict];

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

  const maxTimeline = computed.timeline.length > 0 ? Math.max(...computed.timeline.map((t) => t.balance)) : 1;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>

      {/* Header */}
      <div style={{
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
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>Sabbatical</span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
            <span style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>Sabbatical Planner</span>
            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Model the financial impact of taking time off</span>
          </div>
        </div>
        {scenarios.length > 0 && (
          <button
            type="button"
            onClick={() => setShowNewForm((v) => !v)}
            style={{
              padding: "6px 12px", borderRadius: "var(--radius-md)",
              background: "var(--accent)", color: "#fff",
              border: "none", fontSize: "12px", fontWeight: 600,
              fontFamily: "var(--font-body)", cursor: "pointer",
            }}
          >
            + New Scenario
          </button>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "row", minHeight: 0 }}>

        {/* Left sidebar */}
        <div style={{
          width: "280px", minWidth: "260px", maxWidth: "300px", flexShrink: 0,
          borderRight: "1px solid var(--border-subtle)", overflowY: "auto",
          padding: "18px 16px", display: "flex", flexDirection: "column", gap: "14px",
          background: "var(--bg-base)",
        }}>

          {/* Scenario selector */}
          {scenarios.length > 1 && (
            <div>
              <span style={labelStyle}>Scenario</span>
              <select
                value={activeId ?? ""}
                onChange={(e) => {
                  const s = scenarios.find((sc) => sc.id === e.target.value);
                  if (s) {
                    setActiveId(s.id);
                    setForm({
                      name: s.name,
                      sabbatical_months: s.sabbatical_months,
                      monthly_expenses_during: s.monthly_expenses_during,
                      monthly_stipend: s.monthly_stipend,
                      liquid_assets_available: s.liquid_assets_available,
                      current_monthly_income: s.current_monthly_income,
                      monthly_income_after_return: s.monthly_income_after_return,
                      investment_return_rate: s.investment_return_rate,
                      notes: s.notes,
                    });
                    setIsEditing(false);
                  }
                }}
                style={{ ...inputStyle }}
              >
                {scenarios.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Form */}
          {(isEditing || showNewForm || scenarios.length === 0) && (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div>
                <label style={labelStyle}>Name</label>
                <input style={inputStyle} value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder="e.g. 6-Month Break" />
              </div>

              <div style={{ height: "1px", background: "var(--border-subtle)" }} />
              <p style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-muted)", margin: 0 }}>Sabbatical</p>

              <div>
                <label style={labelStyle}>Length (months)</label>
                <input style={inputStyle} type="number" min={1} max={60} value={form.sabbatical_months} onChange={(e) => setField("sabbatical_months", Number(e.target.value))} />
              </div>
              <div>
                <label style={labelStyle}>Monthly spending during</label>
                <input style={inputStyle} type="number" min={0} value={form.monthly_expenses_during} onChange={(e) => setField("monthly_expenses_during", Number(e.target.value))} placeholder="3000" />
              </div>
              <div>
                <label style={labelStyle}>Monthly stipend / freelance</label>
                <input style={inputStyle} type="number" min={0} value={form.monthly_stipend} onChange={(e) => setField("monthly_stipend", Number(e.target.value))} placeholder="0" />
                <div style={{ fontSize: "9px", color: "var(--text-muted)", marginTop: "3px", fontFamily: "var(--font-body)" }}>Part-time, consulting, or side income during the break</div>
              </div>

              <div style={{ height: "1px", background: "var(--border-subtle)" }} />
              <p style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-muted)", margin: 0 }}>Financial Position</p>

              <div>
                <label style={labelStyle}>Liquid savings available</label>
                <input style={inputStyle} type="number" min={0} value={form.liquid_assets_available} onChange={(e) => setField("liquid_assets_available", Number(e.target.value))} placeholder={String(Math.round(liquidAssets))} />
                {liquidAssets > 0 && Math.abs(Number(form.liquid_assets_available) - liquidAssets) > 500 && (
                  <button type="button" onClick={() => setField("liquid_assets_available", liquidAssets)}
                    style={{ fontSize: "10px", color: "var(--accent)", background: "none", border: "none", cursor: "pointer", padding: "2px 0", fontFamily: "var(--font-body)" }}>
                    Use balance sheet ({fmt(Math.round(liquidAssets))})
                  </button>
                )}
              </div>
              <div>
                <label style={labelStyle}>Current monthly income</label>
                <input style={inputStyle} type="number" min={0} value={form.current_monthly_income} onChange={(e) => setField("current_monthly_income", Number(e.target.value))} placeholder={String(Math.round(effectiveIncome))} />
              </div>

              <div style={{ height: "1px", background: "var(--border-subtle)" }} />
              <p style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-muted)", margin: 0 }}>After Returning</p>

              <div>
                <label style={labelStyle}>Monthly income on return</label>
                <input style={inputStyle} type="number" min={0} value={form.monthly_income_after_return} onChange={(e) => setField("monthly_income_after_return", Number(e.target.value))} />
                <div style={{ fontSize: "9px", color: "var(--text-muted)", marginTop: "3px", fontFamily: "var(--font-body)" }}>Same as before if returning to same role</div>
              </div>

              <div style={{ display: "flex", gap: "8px" }}>
                <button type="button" disabled={isPending} onClick={handleSave}
                  style={{ flex: 1, padding: "8px 0", borderRadius: "var(--radius-md)", background: "var(--accent)", color: "#fff", border: "none", fontSize: "12px", fontWeight: 600, fontFamily: "var(--font-body)", cursor: "pointer", opacity: isPending ? 0.55 : 1 }}>
                  {isPending ? "Saving…" : "Save"}
                </button>
                {activeScenario && (
                  <button type="button" onClick={() => { setIsEditing(false); setShowNewForm(false); }}
                    style={{ padding: "8px 12px", borderRadius: "var(--radius-md)", background: "transparent", color: "var(--text-muted)", border: "1px solid var(--border-subtle)", fontSize: "12px", fontFamily: "var(--font-body)", cursor: "pointer" }}>
                    Cancel
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Edit/Delete for existing */}
          {activeScenario && !isEditing && !showNewForm && (
            <div style={{ display: "flex", gap: "8px" }}>
              <button type="button" onClick={() => setIsEditing(true)}
                style={{ flex: 1, padding: "7px 0", borderRadius: "var(--radius-md)", background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border-subtle)", fontSize: "12px", fontFamily: "var(--font-body)", cursor: "pointer" }}>
                Edit
              </button>
              <button type="button" disabled={isPending} onClick={() => handleDelete(activeScenario.id)}
                style={{ padding: "7px 10px", borderRadius: "var(--radius-md)", background: "transparent", color: "var(--red)", border: "1px solid color-mix(in oklch, var(--red) 30%, transparent)", fontSize: "12px", fontFamily: "var(--font-body)", cursor: "pointer" }}>
                Delete
              </button>
            </div>
          )}

          {/* At a Glance */}
          {activeScenario && (
            <>
              <div style={{ height: "1px", background: "var(--border-subtle)", margin: "2px 0 6px" }} />
              <p style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-muted)", margin: "0 0 10px" }}>At a Glance</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                {[
                  {
                    label: "Runway",
                    value: computed.runwayMonths > 99 ? "∞" : `${computed.runwayMonths.toFixed(0)} mo`,
                    sub: `of ${form.sabbatical_months} needed`,
                    color: computed.canAfford ? "var(--green)" : "var(--red)",
                  },
                  {
                    label: "Net Cost",
                    value: fmtK(computed.totalDepletion),
                    sub: `${computed.depletionPct}% of savings`,
                    color: computed.depletionPct > 75 ? "var(--red)" : computed.depletionPct > 50 ? "oklch(0.78 0.15 75)" : "var(--text-primary)",
                  },
                  {
                    label: "Recovery",
                    value: computed.recoveryMonths != null ? `${computed.recoveryMonths} mo` : "Open-ended",
                    sub: "to restore savings",
                    color: computed.recoveryMonths == null ? "var(--red)" : computed.recoveryMonths <= 18 ? "var(--green)" : computed.recoveryMonths <= 36 ? "oklch(0.78 0.15 75)" : "var(--red)",
                  },
                  {
                    label: "FI Impact",
                    value: computed.fiYearsBefore != null && computed.fiYearsAfter != null
                      ? computed.fiYearsAfter - computed.fiYearsBefore > 0
                        ? `+${computed.fiYearsAfter - computed.fiYearsBefore} yr${computed.fiYearsAfter - computed.fiYearsBefore > 1 ? "s" : ""}`
                        : "None"
                      : "—",
                    sub: "to FI timeline",
                    color: computed.fiYearsBefore != null && computed.fiYearsAfter != null && computed.fiYearsAfter - computed.fiYearsBefore > 2
                      ? "oklch(0.78 0.15 75)"
                      : "var(--text-muted)",
                  },
                ].map(({ label, value, sub, color }) => (
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

          {/* Empty state */}
          {scenarios.length === 0 && !isEditing && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: "14px", textAlign: "center" }}>
              <div style={{ width: "52px", height: "52px", borderRadius: "50%", background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="oklch(0.65 0.18 260)" strokeWidth="1.5"><path d="M12 2v6M12 22v-6M4.93 4.93l4.24 4.24M14.83 14.83l4.24 4.24M2 12h6M22 12h-6M4.93 19.07l4.24-4.24M14.83 9.17l4.24-4.24"/></svg>
              </div>
              <div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: "20px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "6px" }}>Model your sabbatical</div>
                <div style={{ fontSize: "13px", color: "var(--text-secondary)", maxWidth: "340px", lineHeight: 1.6 }}>
                  Enter how long you want to take off, your spending during the break, and available savings. See your runway, recovery timeline, and whether FINN thinks it&apos;s the right time.
                </div>
              </div>
              <button type="button" onClick={() => setIsEditing(true)}
                style={{ padding: "9px 20px", borderRadius: "var(--radius-md)", background: "var(--accent)", color: "#fff", border: "none", fontSize: "13px", fontWeight: 600, fontFamily: "var(--font-body)", cursor: "pointer" }}>
                Create a scenario
              </button>
            </div>
          )}

          {/* Verdict card */}
          {activeScenario && (
            <div style={{ background: meta.bg, border: `1px solid ${meta.border}`, borderRadius: "var(--radius-lg)", padding: "20px 24px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                    <span style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>FINN Assessment</span>
                    <span style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", padding: "2px 8px", borderRadius: "99px", background: `${meta.color}22`, color: meta.color, fontFamily: "var(--font-body)" }}>
                      {computed.verdictConfidence}
                    </span>
                  </div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: "46px", fontWeight: 800, letterSpacing: "-1.5px", lineHeight: 1, color: meta.color, marginBottom: "12px" }}>
                    {meta.label}
                  </div>

                  {computed.verdict !== "NOT_YET" && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", marginTop: "10px" }}>
                      <div>
                        <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>Runway Available</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 800, color: computed.canAfford ? meta.color : "var(--red)", marginTop: "2px" }}>
                          {computed.runwayMonths > 99 ? "∞" : `${computed.runwayMonths.toFixed(0)} months`}
                        </div>
                      </div>
                      {computed.recoveryMonths != null && (
                        <div>
                          <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>Recovery Time</div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 800, color: computed.recoveryMonths <= 18 ? meta.color : "oklch(0.78 0.15 75)", marginTop: "2px" }}>
                            {computed.recoveryMonths} months
                          </div>
                        </div>
                      )}
                      <div>
                        <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>Net Cost</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 800, color: "var(--text-primary)", marginTop: "2px" }}>
                          {fmtK(computed.totalDepletion)}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Runway progress circle */}
                <div style={{ textAlign: "center", flexShrink: 0 }}>
                  <div style={{ position: "relative", width: "72px", height: "72px" }}>
                    <svg width="72" height="72" viewBox="0 0 72 72" style={{ transform: "rotate(-90deg)" }}>
                      <circle cx="36" cy="36" r="28" fill="none" stroke="var(--border)" strokeWidth="5" />
                      <circle
                        cx="36" cy="36" r="28" fill="none"
                        stroke={meta.color}
                        strokeWidth="5"
                        strokeLinecap="round"
                        strokeDasharray={`${2 * Math.PI * 28}`}
                        strokeDashoffset={`${2 * Math.PI * 28 * (1 - Math.min(1, Number(form.sabbatical_months) / Math.max(1, computed.runwayMonths)))}`}
                      />
                    </svg>
                    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 800, color: meta.color, lineHeight: 1 }}>
                        {computed.runwayMonths > 99 ? "∞" : `${Math.round(Math.min(100, (computed.runwayMonths / Math.max(1, Number(form.sabbatical_months))) * 100))}%`}
                      </div>
                      <div style={{ fontSize: "8px", color: "var(--text-muted)", fontFamily: "var(--font-body)", textAlign: "center", marginTop: "1px" }}>funded</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Conditions */}
              {computed.verdictConditions.length > 0 && (
                <div style={{ marginTop: "14px", paddingTop: "14px", borderTop: `1px solid ${meta.border}` }}>
                  <div style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-body)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "8px" }}>Conditions</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                    {computed.verdictConditions.map((c, i) => (
                      <div key={i} style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: meta.color, marginTop: "1px", flexShrink: 0 }}>→</span>
                        <span style={{ fontSize: "12px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", lineHeight: 1.5 }}>{c}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* FINN Narrative */}
          {activeScenario && (
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
                  <p style={{ fontSize: "13px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", lineHeight: 1.65, margin: 0 }}>{computed.finnNarrative}</p>
                </div>
              </div>
            </div>
          )}

          {/* Savings runway chart */}
          {activeScenario && computed.timeline.length > 1 && (
            <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "18px 20px" }}>
              <div style={{ marginBottom: "14px" }}>
                <div style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: "14px", color: "var(--text-primary)", marginBottom: "2px" }}>Savings Runway</div>
                <div style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>Liquid savings over time during and after your sabbatical</div>
              </div>
              <div style={{ position: "relative", height: "80px" }}>
                <svg width="100%" height="80" viewBox={`0 0 ${computed.timeline.length} 80`} preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="sab-line-grad" x1="0" y1="0" x2="1" y2="0" gradientUnits="objectBoundingBox">
                      <stop offset="0%" stopColor="oklch(0.65 0.18 260)" />
                      <stop offset={`${(Number(form.sabbatical_months) / computed.timeline.length) * 100}%`} stopColor="oklch(0.65 0.18 260)" />
                      <stop offset={`${(Number(form.sabbatical_months) / computed.timeline.length) * 100}%`} stopColor="oklch(0.72 0.19 145)" />
                      <stop offset="100%" stopColor="oklch(0.72 0.19 145)" />
                    </linearGradient>
                  </defs>
                  {/* Sabbatical zone fill */}
                  <rect
                    x={0} y={0}
                    width={Number(form.sabbatical_months)}
                    height={80}
                    fill="rgba(99,102,241,0.05)"
                  />
                  {/* Polyline */}
                  <polyline
                    points={computed.timeline.map((t, i) => `${i},${Math.round(80 - (t.balance / maxTimeline) * 72)}`).join(" ")}
                    fill="none"
                    stroke="url(#sab-line-grad)"
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
                <div style={{ position: "absolute", left: 0, bottom: 0, fontSize: "9px", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>Month 0</div>
                <div style={{ position: "absolute", right: 0, bottom: 0, fontSize: "9px", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>Month {computed.timeline.length - 1}</div>
                {/* Sabbatical label */}
                <div style={{ position: "absolute", top: 0, left: "4px", fontSize: "9px", color: "oklch(0.65 0.18 260)", fontFamily: "var(--font-body)", fontWeight: 600 }}>Sabbatical →</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginTop: "14px" }}>
                {[
                  { label: "Starting savings", value: fmt(Math.round(Number(form.liquid_assets_available))) },
                  { label: `After ${form.sabbatical_months} months`, value: fmt(Math.max(0, Math.round(Number(form.liquid_assets_available) - computed.totalDepletion))) },
                  { label: "Recovery point", value: computed.breakEvenMonth != null ? `Month ${computed.breakEvenMonth}` : "Open-ended" },
                ].map(({ label, value }) => (
                  <div key={label} style={{ padding: "8px 10px", borderRadius: "var(--radius-sm)", background: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}>
                    <div style={{ fontSize: "9px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "3px", fontFamily: "var(--font-body)" }}>{label}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Income + Ecosystem impact */}
          {activeScenario && (
            <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "18px 20px" }}>
              <div style={{ marginBottom: "14px" }}>
                <div style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: "14px", color: "var(--text-primary)", marginBottom: "2px" }}>Financial Ecosystem Impact</div>
                <div style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>How this decision ripples through your financial life</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                {[
                  {
                    label: "Income Foregone",
                    value: fmtK(computed.incomeLost),
                    sub: `${form.sabbatical_months} months × ${fmt(Math.round(Number(form.current_monthly_income)))}`,
                    icon: "→",
                    color: "var(--red)",
                  },
                  {
                    label: "Savings Depleted",
                    value: fmtK(computed.totalDepletion),
                    sub: `${computed.depletionPct}% of liquid savings`,
                    icon: "→",
                    color: computed.depletionPct > 50 ? "var(--red)" : "oklch(0.78 0.15 75)",
                  },
                  {
                    label: "Financial Independence",
                    value: computed.fiYearsBefore != null && computed.fiYearsAfter != null
                      ? computed.fiYearsAfter - computed.fiYearsBefore > 0
                        ? `+${computed.fiYearsAfter - computed.fiYearsBefore} year${computed.fiYearsAfter - computed.fiYearsBefore > 1 ? "s" : ""} later`
                        : "Unchanged"
                      : "—",
                    sub: "to FI (25× expenses)",
                    icon: "→",
                    color: computed.fiYearsBefore != null && computed.fiYearsAfter != null && computed.fiYearsAfter - computed.fiYearsBefore > 2
                      ? "oklch(0.78 0.15 75)"
                      : "var(--text-secondary)",
                  },
                  {
                    label: "Net Monthly Burn",
                    value: computed.netMonthlyBurn > 0 ? fmt(Math.round(computed.netMonthlyBurn)) : "Break-even",
                    sub: "spending minus stipend",
                    icon: "→",
                    color: computed.netMonthlyBurn > 0 ? "var(--red)" : "var(--green)",
                  },
                ].map(({ label, value, sub, icon, color }) => (
                  <div key={label} style={{ padding: "12px 14px", borderRadius: "var(--radius-md)", background: "var(--bg-card)", border: "1px solid var(--border-subtle)", display: "flex", alignItems: "flex-start", gap: "10px" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color, marginTop: "3px", flexShrink: 0 }}>{icon}</span>
                    <div>
                      <div style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", fontFamily: "var(--font-body)", marginBottom: "3px" }}>{label}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: "14px", fontWeight: 700, color, marginBottom: "2px" }}>{value}</div>
                      <div style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>{sub}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* What would change the verdict */}
          {activeScenario && computed.verdict !== "GO" && (
            <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "18px 20px" }}>
              <div style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: "14px", color: "var(--text-primary)", marginBottom: "4px" }}>What Would Change the Verdict?</div>
              <div style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginBottom: "14px" }}>Adjustments that move the needle toward GO</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {(() => {
                  const hints: { label: string; desc: string }[] = [];
                  if (!computed.canAfford) {
                    const shortfall = computed.totalDepletion - Number(form.liquid_assets_available);
                    hints.push({ label: `Save ${fmtK(shortfall)} more`, desc: "Reach the minimum required liquid savings for this sabbatical length." });
                  }
                  if (computed.bufferMonths < 3) {
                    const extraNeeded = (3 - computed.bufferMonths) * computed.netMonthlyBurn;
                    if (extraNeeded > 0) hints.push({ label: `Build ${fmtK(extraNeeded)} additional buffer`, desc: "Reach a 3-month safety cushion above the sabbatical cost." });
                  }
                  if (computed.recoveryMonths == null || computed.recoveryMonths > 18) {
                    hints.push({ label: "Find part-time income during the break", desc: "Even modest freelance income reduces depletion and recovery time significantly." });
                  }
                  const shorterMonths = Math.max(1, Math.round(Number(form.sabbatical_months) * 0.65));
                  hints.push({ label: `Shorten to ${shorterMonths} months`, desc: `A shorter break reduces total cost to approximately ${fmtK(shorterMonths * computed.netMonthlyBurn)}.` });
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
