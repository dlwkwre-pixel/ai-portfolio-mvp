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

// ── Math ──────────────────────────────────────────────────────────────────────

type PhaseBar = { age: number; annualCost: number; phase: "Infant" | "Child" | "Teen"; fill: string };

type ComputedFamily = {
  currentMonthlyImpact: number;
  totalCostToAge18: number;
  remainingYears: number;
  chartData: PhaseBar[];
  monthlySavingsBefore: number | null;
  monthlySavingsAfter: number | null;
  projectedNWBefore: number | null;
  projectedNWAfter: number | null;
};

const PHASE_COLORS: Record<"Infant" | "Child" | "Teen", string> = {
  Infant: "#6366f1",
  Child: "#3b82f6",
  Teen: "#06b6d4",
};

function computeFamily(
  childCurrentAge: number,
  monthlyInfant: number,
  monthlyChild: number,
  monthlyTeen: number,
  monthlyExpensesNow: number,
  investmentReturn: number,
  profile: FinancialProfile | null,
  currentNetWorth: number,
): ComputedFamily {
  function costAtAge(age: number) {
    if (age < 3) return monthlyInfant;
    if (age <= 12) return monthlyChild;
    if (age <= 17) return monthlyTeen;
    return 0;
  }

  const currentMonthlyImpact = costAtAge(childCurrentAge);

  // Total cost from current age to 18
  let totalCostToAge18 = 0;
  for (let age = childCurrentAge; age < 18; age++) {
    totalCostToAge18 += costAtAge(age) * 12;
  }

  const remainingYears = Math.max(0, 18 - childCurrentAge);

  // Chart: each year from current age to 17
  const chartData: PhaseBar[] = [];
  for (let age = childCurrentAge; age < 18; age++) {
    const phase: "Infant" | "Child" | "Teen" = age < 3 ? "Infant" : age <= 12 ? "Child" : "Teen";
    chartData.push({ age, annualCost: costAtAge(age) * 12, phase, fill: PHASE_COLORS[phase] });
  }

  // Retirement impact
  if (
    profile?.monthly_income == null ||
    profile?.current_age == null ||
    profile?.target_retirement_age == null ||
    profile.target_retirement_age <= profile.current_age
  ) {
    return { currentMonthlyImpact, totalCostToAge18, remainingYears, chartData, monthlySavingsBefore: null, monthlySavingsAfter: null, projectedNWBefore: null, projectedNWAfter: null };
  }

  const yearsToRetirement = profile.target_retirement_age - profile.current_age;
  const r = investmentReturn / 12;
  const n = yearsToRetirement * 12;

  const monthlyIncome = profile.monthly_income;
  const baseExpenses = monthlyExpensesNow;
  const savingsBefore = monthlyIncome - baseExpenses;
  const savingsAfter = monthlyIncome - baseExpenses - currentMonthlyImpact;

  function fvFormula(pv: number, pmt: number, months: number) {
    return pv * Math.pow(1 + r, months) + (r > 0 ? pmt * ((Math.pow(1 + r, months) - 1) / r) : pmt * months);
  }

  const projectedNWBefore = fvFormula(currentNetWorth, Math.max(0, savingsBefore), n);
  const projectedNWAfter = fvFormula(currentNetWorth, Math.max(0, savingsAfter), n);

  return {
    currentMonthlyImpact,
    totalCostToAge18,
    remainingYears,
    chartData,
    monthlySavingsBefore: savingsBefore,
    monthlySavingsAfter: savingsAfter,
    projectedNWBefore,
    projectedNWAfter,
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

// ── Component ─────────────────────────────────────────────────────────────────

type Props = {
  scenarios: FamilyScenario[];
  profile: FinancialProfile | null;
  defaultInvestmentReturn: number;
  currentNetWorth: number;
};

export default function FamilyClient({ scenarios: initialScenarios, profile, defaultInvestmentReturn, currentNetWorth }: Props) {
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
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, activeScenario, editingId, profile, currentNetWorth]);

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

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px", maxWidth: 1100, margin: "0 auto", width: "100%" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <a href="/planning" style={{ color: "var(--text-secondary)", fontSize: 13, textDecoration: "none" }}>Planning</a>
          <span style={{ color: "var(--text-secondary)", fontSize: 13 }}>/</span>
          <span style={{ color: "var(--text-primary)", fontSize: 13 }}>Family Planning</span>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Cost of Raising a Child</h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "4px 0 0" }}>
          Model child costs by phase, see retirement impact, and get FINN guidance.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 20, alignItems: "start" }}>
        {/* ── Left Panel ─────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Scenarios list */}
          {scenarios.length > 0 && (
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                Saved Scenarios
              </div>
              {scenarios.map((s) => (
                <div
                  key={s.id}
                  onClick={() => { setActiveScenarioId(s.id); setEditingId(null); setCommentary(null); }}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    cursor: "pointer",
                    background: activeScenarioId === s.id && editingId == null ? "var(--bg-hover)" : "transparent",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 2,
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
                    >
                      Edit
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}
                      disabled={deleting}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: 12, padding: "2px 6px" }}
                    >
                      Del
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Form */}
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
              {editingId ? "Edit Scenario" : "New Scenario"}
            </div>

            {[
              { label: "Scenario Name", field: "name" as const, type: "text" },
              { label: "Child Name (optional)", field: "child_name" as const, type: "text" },
            ].map(({ label, field, type }) => (
              <div key={field} style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>{label}</label>
                <input
                  type={type}
                  value={form[field] as string}
                  onChange={(e) => set(field, e.target.value)}
                  style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 10px", color: "var(--text-primary)", fontSize: 13 }}
                />
              </div>
            ))}

            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Child Current Age</label>
              <input
                type="number"
                value={form.child_current_age}
                min={0} max={17} step={1}
                onChange={(e) => set("child_current_age", Number(e.target.value))}
                style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 10px", color: "var(--text-primary)", fontSize: 13, fontFamily: "var(--font-mono)" }}
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
                  <span style={{ fontSize: 11, color, fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                    {fmt(form[field] as number)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={5000}
                  step={50}
                  value={form[field] as number}
                  onChange={(e) => set(field, Number(e.target.value))}
                  style={{ width: "100%" }}
                />
              </div>
            ))}

            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "14px 0 8px" }}>
              Household Context
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Monthly Household Expenses ($)</label>
              <input
                type="number"
                value={form.monthly_expenses_now}
                min={0}
                step={100}
                onChange={(e) => set("monthly_expenses_now", Number(e.target.value))}
                style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 10px", color: "var(--text-primary)", fontSize: 13, fontFamily: "var(--font-mono)" }}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>Investment Return</label>
                <span style={{ fontSize: 11, color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                  {(form.investment_return * 100).toFixed(1)}%
                </span>
              </div>
              <input
                type="range"
                min={0.03}
                max={0.12}
                step={0.005}
                value={form.investment_return}
                onChange={(e) => set("investment_return", Number(e.target.value))}
                style={{ width: "100%", marginTop: 4 }}
              />
            </div>

            {saveStatus && (
              <div style={{ fontSize: 12, color: saveStatus === "Saved." ? "var(--color-success, #22c55e)" : "#ef4444", marginBottom: 8 }}>
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
                  style={{ padding: "9px 14px", background: "var(--bg-hover)", color: "var(--text-secondary)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, cursor: "pointer" }}
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Right Panel ────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Summary tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {[
              {
                label: "Current Monthly Impact",
                value: fmt(computed.currentMonthlyImpact),
                sub: `${costImpactPct}% of household expenses`,
                color: computed.currentMonthlyImpact > v.monthly_expenses_now * 0.3 ? "#f59e0b" : "var(--text-primary)",
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
                color: retirementImpact != null && retirementImpact > 0 ? "#ef4444" : "var(--text-secondary)",
              },
            ].map(({ label, value, sub, color }) => (
              <div key={label} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" }}>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color, fontFamily: "var(--font-mono)" }}>{value}</div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>{sub}</div>
              </div>
            ))}
          </div>

          {/* Chart */}
          {computed.chartData.length > 0 ? (
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 20px" }}>
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
                  <XAxis dataKey="age" tickFormatter={(v) => `${v}`} tick={{ fontSize: 11, fill: "var(--text-secondary)" }} label={{ value: "Child Age", position: "insideBottom", offset: -2, fill: "var(--text-secondary)", fontSize: 11 }} />
                  <YAxis tickFormatter={fmtK} tick={{ fontSize: 11, fill: "var(--text-secondary)" }} width={56} />
                  <Tooltip
                    formatter={(val) => typeof val === "number" ? [fmt(val), "Annual Cost"] : [String(val ?? ""), "Annual Cost"]}
                    labelFormatter={(label) => `Age ${label}`}
                    contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
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
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>
              Child is 18+ — cost modeling phase complete.
            </div>
          )}

          {/* Retirement impact detail */}
          {computed.projectedNWBefore != null && computed.projectedNWAfter != null && (
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 20px" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>Retirement Impact</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {[
                  { label: "Monthly Savings (No Child Costs)", value: fmt(computed.monthlySavingsBefore ?? 0) + "/mo" },
                  { label: "Monthly Savings (With Child Costs)", value: fmt(Math.max(0, computed.monthlySavingsAfter ?? 0)) + "/mo" },
                  { label: "Projected NW at Retirement (Before)", value: fmtK(computed.projectedNWBefore) },
                  { label: "Projected NW at Retirement (With Child)", value: fmtK(Math.max(0, computed.projectedNWAfter)) },
                ].map(({ label, value }) => (
                  <div key={label} style={{ padding: "10px 12px", background: "var(--bg-base)", borderRadius: 8 }}>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 2 }}>{label}</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* FINN Commentary */}
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>FINN Analysis</div>
              <button
                onClick={handleGetCommentary}
                disabled={loadingCommentary}
                style={{
                  padding: "7px 16px",
                  background: "var(--accent)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: loadingCommentary ? "not-allowed" : "pointer",
                  opacity: loadingCommentary ? 0.7 : 1,
                }}
              >
                {loadingCommentary ? "Analyzing…" : "Get FINN Guidance"}
              </button>
            </div>
            {commentary ? (
              <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>{commentary}</p>
            ) : (
              <p style={{ fontSize: 12, color: "var(--text-tertiary, var(--text-secondary))", margin: 0 }}>
                Click &ldquo;Get FINN Guidance&rdquo; for personalized guidance on child cost planning and retirement impact.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
