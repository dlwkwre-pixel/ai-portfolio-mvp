"use client";

import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from "recharts";
import type { CareerScenario } from "./career-actions";
import { saveCareerScenario, deleteCareerScenario } from "./career-actions";
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

    // Maximum cumulative cost (deepest negative delta)
    const maxCost = Math.abs(Math.min(0, ...timeline.map((p) => p.cumulativeDelta)));

    const pt10 = timeline[Math.min(10, timeline.length - 1)];
    const pt20 = timeline[Math.min(20, timeline.length - 1)];

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

    return {
      timeline, breakEvenYear, maxCost,
      pt10, pt20, gapCost, gapDeficit, runwayMonths,
      retirCurrentProb, retirNewProb, nwCurrentPath, nwNewPath,
    };
  }, [inputs, profile, currentNetWorth]);

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

  // ── Affordability check ────────────────────────────────────────────────────

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
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
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

      {/* Main layout */}
      <div data-career-grid style={{ display: "grid", gridTemplateColumns: "minmax(280px, 360px) 1fr", gap: "20px", padding: "20px 24px", alignItems: "start" }}>

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
        </div>

        {/* ── RIGHT: Analysis ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

          {/* Summary tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
            {[
              {
                label: "Break-Even",
                value: computed.breakEvenYear != null ? `Year ${computed.breakEvenYear}` : "N/A",
                sub: computed.breakEvenYear != null ? "new path pulls ahead" : "within projection",
                color: computed.breakEvenYear != null ? "var(--green)" : "var(--amber)",
              },
              {
                label: "Max Transition Cost",
                value: fmtK(computed.maxCost),
                sub: "cumulative income lost",
                color: "var(--red)",
              },
              {
                label: `Income at Yr ${Math.min(inputs.projection_years, 20)}`,
                value: fmtK(computed.pt20?.newIncome ?? 0),
                sub: computed.pt20 ? `vs ${fmtK(computed.pt20.currentIncome)} current` : "",
                color: (computed.pt20?.newIncome ?? 0) >= (computed.pt20?.currentIncome ?? 0) ? "var(--green)" : "var(--amber)",
              },
            ].map(({ label, value, sub, color }) => (
              <div key={label} style={{ background: "var(--bg-elevated)", borderRadius: "var(--radius-md)", padding: "12px" }}>
                <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", marginBottom: "4px" }}>{label}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "20px", fontWeight: 700, color }}>{value}</div>
                <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "2px" }}>{sub}</div>
              </div>
            ))}
          </div>

          {/* Emergency fund check */}
          {inputs.gap_months > 0 && (
            <div style={{
              ...cardS,
              background: computed.gapDeficit > 0
                ? "color-mix(in oklch, oklch(0.40 0.18 25) 10%, var(--card-bg))"
                : "color-mix(in oklch, oklch(0.55 0.15 155) 8%, var(--card-bg))",
              borderColor: computed.gapDeficit > 0
                ? "color-mix(in oklch, oklch(0.45 0.18 25) 30%, transparent)"
                : "color-mix(in oklch, oklch(0.55 0.15 155) 25%, transparent)",
            }}>
              <p style={sectionHead}>Emergency Fund Check</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
                {[
                  { label: "Gap Cost", value: fmt(computed.gapCost), sub: `${inputs.gap_months} mo × ${fmt(inputs.monthly_expenses)} + costs` },
                  { label: "Savings Available", value: fmt(inputs.liquid_assets), sub: `${computed.runwayMonths.toFixed(1)} months runway` },
                  {
                    label: computed.gapDeficit > 0 ? "Shortfall" : "Cushion",
                    value: fmt(Math.abs(computed.gapDeficit > 0 ? computed.gapDeficit : inputs.liquid_assets - computed.gapCost)),
                    sub: computed.gapDeficit > 0 ? "additional savings needed" : "remaining after gap",
                  },
                ].map(({ label, value, sub }) => (
                  <div key={label}>
                    <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: "4px" }}>{label}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 700, color: label === "Shortfall" ? "var(--red)" : label === "Cushion" ? "var(--green)" : "var(--text-primary)" }}>{value}</div>
                    <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "2px" }}>{sub}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

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
                      <Line type="monotone" dataKey="New Career" stroke="#3b82f6" strokeWidth={2} dot={false} strokeDasharray={inputs.gap_months > 0 ? undefined : undefined} />
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

          {/* Retirement impact */}
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
                    New path ({computed.retirNewProb - computed.retirCurrentProb > 0 ? "+" : ""}{computed.retirNewProb - computed.retirCurrentProb}pp)
                  </div>
                  <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "1px", fontFamily: "var(--font-mono)" }}>{fmtK(computed.nwNewPath)}</div>
                </div>
              </div>
              <p style={{ fontSize: "11px", color: "var(--text-tertiary)", margin: "10px 0 0", lineHeight: 1.5 }}>
                Projected net worth at retirement age {profile?.target_retirement_age}. Based on annual savings differences compounded at {pct(inputs.investment_return)} return.
              </p>
            </div>
          )}

          {/* FINN Analysis */}
          <div style={cardS}>
            <p style={sectionHead}>FINN Analysis</p>
            {finnCommentary ? (
              <>
                <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.65, margin: 0 }}>{finnCommentary}</p>
                <button type="button" onClick={() => setFinnCommentary(null)} style={{ marginTop: "10px", fontSize: "10px", color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0, fontFamily: "var(--font-body)" }}>
                  Refresh
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={fetchFinnCommentary}
                disabled={finnLoading}
                style={{ display: "flex", alignItems: "center", gap: "7px", padding: "7px 14px", borderRadius: "var(--radius-xl)", border: "1px solid rgba(109,40,217,0.22)", background: "rgba(109,40,217,0.07)", color: "#7c3aed", fontFamily: "var(--font-body)", fontSize: "12px", fontWeight: 600, cursor: finnLoading ? "default" : "pointer", opacity: finnLoading ? 0.7 : 1 }}
              >
                <svg width="12" height="12" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="8" stroke="#7c3aed" strokeWidth="1.5" />
                  <path d="M7 9c0-1.657 1.343-3 3-3s3 1.343 3 3c0 1.5-1 2.5-2.5 3V13.5" stroke="#7c3aed" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="10" cy="15.5" r="0.75" fill="#7c3aed" />
                </svg>
                {finnLoading ? "FINN is thinking…" : "Get FINN Analysis"}
              </button>
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
