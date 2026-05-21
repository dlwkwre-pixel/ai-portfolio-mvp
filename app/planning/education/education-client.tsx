"use client";

import { useState, useTransition, useMemo } from "react";
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import { saveEducationScenario, deleteEducationScenario } from "./education-actions";
import type { EducationScenario } from "./education-actions";
import type { FinancialProfile } from "@/app/planning/planning-actions";
import type { EducationFinnRequest } from "@/app/api/planning/education-finn/route";

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

type Computed529 = {
  yearsUntilCollege: number;
  futureAnnualCost: number;
  totalCollegeCost: number;
  fv529: number;
  coveragePct: number;
  monthlyNeeded: number;
  fundingGap: number;
  chartData: { year: number; balance: number; target: number; label: string }[];
};

function compute529(
  childCurrentAge: number,
  yearsInCollege: number,
  annualCostToday: number,
  costInflationRate: number,
  current529Balance: number,
  monthlyContribution: number,
  investmentReturn: number,
): Computed529 {
  const yearsUntilCollege = Math.max(0, 18 - childCurrentAge);
  const futureAnnualCost = annualCostToday * Math.pow(1 + costInflationRate, yearsUntilCollege);
  const totalCollegeCost = futureAnnualCost * yearsInCollege;

  const r = investmentReturn / 12;
  const n = yearsUntilCollege * 12;

  const fv529 =
    n === 0
      ? current529Balance
      : current529Balance * Math.pow(1 + r, n) +
        (r > 0
          ? monthlyContribution * ((Math.pow(1 + r, n) - 1) / r)
          : monthlyContribution * n);

  const coveragePct = totalCollegeCost > 0 ? (fv529 / totalCollegeCost) * 100 : 100;
  const fundingGap = Math.max(0, totalCollegeCost - fv529);

  // Monthly needed to fully fund (solving for PMT)
  const pvGrowth = current529Balance * (n > 0 ? Math.pow(1 + r, n) : 1);
  const remainder = totalCollegeCost - pvGrowth;
  const monthlyNeeded =
    remainder <= 0 || n === 0
      ? 0
      : r > 0
        ? (remainder * r) / (Math.pow(1 + r, n) - 1)
        : remainder / n;

  // Chart: yearly balance from now to college start
  const chartData = Array.from({ length: yearsUntilCollege + 1 }, (_, i) => {
    const months = i * 12;
    const balance =
      current529Balance * Math.pow(1 + r, months) +
      (r > 0
        ? monthlyContribution * ((Math.pow(1 + r, months) - 1) / r)
        : monthlyContribution * months);
    return {
      year: i,
      balance: Math.round(balance),
      target: Math.round(totalCollegeCost),
      label: i === 0 ? "Now" : `Yr ${i}`,
    };
  });

  return { yearsUntilCollege, futureAnnualCost, totalCollegeCost, fv529, coveragePct, monthlyNeeded, fundingGap, chartData };
}

// ── Types ─────────────────────────────────────────────────────────────────────

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

function defaultForm(profile: FinancialProfile | null, defaultReturn: number): FormState {
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

// ── Component ─────────────────────────────────────────────────────────────────

type Props = {
  scenarios: EducationScenario[];
  profile: FinancialProfile | null;
  defaultInvestmentReturn: number;
};

export default function EducationClient({ scenarios: initialScenarios, profile, defaultInvestmentReturn }: Props) {
  const [scenarios, setScenarios] = useState<EducationScenario[]>(initialScenarios);
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

  const computed = useMemo<Computed529>(() => {
    const src = editingId != null ? form : activeScenario
      ? {
          child_current_age: activeScenario.child_current_age,
          years_in_college: activeScenario.years_in_college,
          annual_cost_today: Number(activeScenario.annual_cost_today),
          cost_inflation_rate: Number(activeScenario.cost_inflation_rate),
          current_529_balance: Number(activeScenario.current_529_balance),
          monthly_contribution: Number(activeScenario.monthly_contribution),
          investment_return: Number(activeScenario.investment_return),
        }
      : form;

    return compute529(
      src.child_current_age,
      src.years_in_college,
      src.annual_cost_today,
      src.cost_inflation_rate,
      src.current_529_balance,
      src.monthly_contribution,
      src.investment_return,
    );
  }, [form, activeScenario, editingId]);

  function set(field: keyof FormState, value: string | number) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSaveStatus(null);
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
      if (result.error) {
        setSaveStatus(result.error);
        return;
      }
      // Refresh from server via re-fetch trick: just reload page state by updating scenarios list
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
    const src = editingId != null ? form : activeScenario
      ? {
          name: activeScenario.name,
          child_name: activeScenario.child_name,
          child_current_age: activeScenario.child_current_age,
          years_in_college: activeScenario.years_in_college,
          annual_cost_today: Number(activeScenario.annual_cost_today),
          cost_inflation_rate: Number(activeScenario.cost_inflation_rate),
          current_529_balance: Number(activeScenario.current_529_balance),
          monthly_contribution: Number(activeScenario.monthly_contribution),
          investment_return: Number(activeScenario.investment_return),
        }
      : form;

    const payload: EducationFinnRequest = {
      scenario_name: (editingId != null ? form.name : activeScenario?.name) ?? form.name,
      child_name: src.child_name ?? null,
      child_current_age: src.child_current_age,
      years_until_college: computed.yearsUntilCollege,
      years_in_college: src.years_in_college,
      annual_cost_today: src.annual_cost_today,
      cost_inflation_rate_pct: src.cost_inflation_rate * 100,
      future_annual_cost: computed.futureAnnualCost,
      total_college_cost: computed.totalCollegeCost,
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

  const showingForm = editingId != null || activeScenarioId == null;
  const displayScenario = editingId == null && activeScenario;

  const coverageColor =
    computed.coveragePct >= 100
      ? "var(--color-success, #22c55e)"
      : computed.coveragePct >= 60
        ? "#f59e0b"
        : "#ef4444";

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px", maxWidth: 1100, margin: "0 auto", width: "100%" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <a href="/planning" style={{ color: "var(--text-secondary)", fontSize: 13, textDecoration: "none" }}>Planning</a>
          <span style={{ color: "var(--text-secondary)", fontSize: 13 }}>/</span>
          <span style={{ color: "var(--text-primary)", fontSize: 13 }}>Education / 529</span>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>College Savings Planner</h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "4px 0 0" }}>
          Project 529 growth vs college cost, find funding gaps, and get FINN guidance.
        </p>
      </div>

      <div data-edu-grid style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 20, alignItems: "start" }}>
        {/* ── Left Panel: Scenarios list + form ─────────────────────────────── */}
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

            {[
              { label: "Child Current Age", field: "child_current_age" as const, min: 0, max: 17, step: 1 },
              { label: "Years in College", field: "years_in_college" as const, min: 1, max: 8, step: 1 },
              { label: "Annual Cost Today ($)", field: "annual_cost_today" as const, min: 0, max: 200000, step: 1000 },
            ].map(({ label, field, min, max, step }) => (
              <div key={field} style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>{label}</label>
                <input
                  type="number"
                  value={form[field] as number}
                  min={min}
                  max={max}
                  step={step}
                  onChange={(e) => set(field, Number(e.target.value))}
                  style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 10px", color: "var(--text-primary)", fontSize: 13, fontFamily: "var(--font-mono)" }}
                />
              </div>
            ))}

            <div style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <label style={{ fontSize: 11, color: "var(--text-secondary)" }}>Education Inflation</label>
                <span style={{ fontSize: 11, color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                  {(form.cost_inflation_rate * 100).toFixed(1)}%
                </span>
              </div>
              <input
                type="range"
                min={0.02}
                max={0.10}
                step={0.005}
                value={form.cost_inflation_rate}
                onChange={(e) => set("cost_inflation_rate", Number(e.target.value))}
                style={{ width: "100%", marginTop: 4 }}
              />
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Current 529 Balance ($)</label>
              <input
                type="number"
                value={form.current_529_balance}
                min={0}
                step={1000}
                onChange={(e) => set("current_529_balance", Number(e.target.value))}
                style={{ width: "100%", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 10px", color: "var(--text-primary)", fontSize: 13, fontFamily: "var(--font-mono)" }}
              />
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Monthly Contribution ($)</label>
              <input
                type="number"
                value={form.monthly_contribution}
                min={0}
                step={50}
                onChange={(e) => set("monthly_contribution", Number(e.target.value))}
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

        {/* ── Right Panel: Chart + metrics ──────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Coverage banner */}
          <div style={{
            background: "var(--bg-card)",
            border: `1px solid ${coverageColor}40`,
            borderRadius: 12,
            padding: "14px 20px",
            display: "flex",
            alignItems: "center",
            gap: 20,
            flexWrap: "wrap",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 52,
                height: 52,
                borderRadius: "50%",
                border: `3px solid ${coverageColor}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                fontWeight: 700,
                color: coverageColor,
                fontFamily: "var(--font-mono)",
              }}>
                {Math.min(computed.coveragePct, 999).toFixed(0)}%
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Coverage</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: coverageColor }}>
                  {computed.coveragePct >= 100 ? "Fully Funded" : computed.coveragePct >= 60 ? "Partially Funded" : "Under-Funded"}
                </div>
              </div>
            </div>

            {[
              { label: "Total College Cost", value: fmtK(computed.totalCollegeCost) },
              { label: "Projected 529 Value", value: fmtK(computed.fv529) },
              { label: computed.coveragePct >= 100 ? "Surplus" : "Funding Gap", value: fmtK(computed.coveragePct >= 100 ? computed.fv529 - computed.totalCollegeCost : computed.fundingGap) },
              ...(computed.coveragePct < 100 ? [{ label: "Monthly Needed", value: fmt(computed.monthlyNeeded) + "/mo" }] : []),
            ].map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{label}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Chart */}
          {computed.yearsUntilCollege > 0 ? (
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 20px" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
                529 Balance vs College Cost Target
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 16 }}>
                {computed.yearsUntilCollege} years to enrollment
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={computed.chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--text-secondary)" }} />
                  <YAxis tickFormatter={fmtK} tick={{ fontSize: 11, fill: "var(--text-secondary)" }} width={60} />
                  <Tooltip
                    formatter={(v) => typeof v === "number" ? fmt(v) : String(v ?? "")}
                    contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                  />
                  <ReferenceLine
                    y={computed.totalCollegeCost}
                    stroke="#ef4444"
                    strokeDasharray="6 3"
                    label={{ value: "Target", position: "insideTopRight", fill: "#ef4444", fontSize: 11 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="balance"
                    stroke="#3b82f6"
                    fill="#3b82f620"
                    strokeWidth={2}
                    name="529 Balance"
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>
              Child is 18+ — college cost projection starts from current balance.
            </div>
          )}

          {/* Cost breakdown */}
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 20px" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>Cost Breakdown</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[
                { label: "Annual Cost Today", value: fmt(showingForm ? form.annual_cost_today : Number(activeScenario?.annual_cost_today ?? form.annual_cost_today)) },
                { label: "Future Annual Cost", value: fmt(computed.futureAnnualCost) },
                { label: "Years in College", value: String(showingForm ? form.years_in_college : activeScenario?.years_in_college ?? form.years_in_college) },
                { label: "Total College Cost", value: fmt(computed.totalCollegeCost) },
              ].map(({ label, value }) => (
                <div key={label} style={{ padding: "10px 12px", background: "var(--bg-base)", borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

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
                Click &ldquo;Get FINN Guidance&rdquo; for personalized 529 analysis and contribution recommendations.
              </p>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 700px) {
          [data-edu-grid] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
