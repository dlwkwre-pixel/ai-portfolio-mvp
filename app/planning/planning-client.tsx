"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import {
  upsertFinancialProfile,
  addBalanceSheetItem,
  updateBalanceSheetItem,
  deleteBalanceSheetItem,
  addCashFlowItem,
  updateCashFlowItem,
  deleteCashFlowItem,
  saveNetWorthSnapshot,
} from "./planning-actions";
import type { FinancialProfile, BalanceSheetItem, CashFlowItem, NetWorthSnapshot } from "./planning-actions";
import type { FinnContext } from "@/app/api/planning/finn/route";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}
function fmtFull(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPct(n: number) {
  return n.toFixed(1) + "%";
}
function toMonthly(amount: number, frequency: "monthly" | "annual") {
  return frequency === "annual" ? amount / 12 : amount;
}

function calcHealthScore(
  savingsRate: number,
  monthlyExpenses: number,
  liquidAssets: number,
  totalAssets: number,
  totalLiabilities: number,
  currentAge: number | null,
  targetRetirementAge: number | null,
  monthlyNetWorth: number,
) {
  // Factor 1: Savings rate (0-25 pts). Target ≥ 20%.
  const savingsScore = Math.min(25, (savingsRate / 20) * 25);

  // Factor 2: Emergency fund (0-25 pts). Target: 3 months expenses.
  const emergencyMonths = monthlyExpenses > 0 ? liquidAssets / monthlyExpenses : 0;
  const emergencyScore = Math.min(25, (emergencyMonths / 3) * 25);

  // Factor 3: Debt ratio (0-25 pts). Lower liabilities vs assets = better.
  const debtRatio = totalAssets > 0 ? totalLiabilities / totalAssets : 1;
  const debtScore = Math.min(25, Math.max(0, (1 - debtRatio) * 25));

  // Factor 4: Retirement trajectory (0-25 pts). Are they saving anything?
  let trajectoryScore = 0;
  if (currentAge != null && targetRetirementAge != null && targetRetirementAge > currentAge) {
    const yearsLeft = targetRetirementAge - currentAge;
    // Simple check: saving > 0, and at current rate they accumulate something meaningful
    if (monthlyNetWorth > 0) {
      const projected = monthlyNetWorth * 12 * yearsLeft;
      // Target: 25× current annual expenses at retirement
      const target = monthlyExpenses * 12 * 25;
      trajectoryScore = target > 0 ? Math.min(25, (projected / target) * 25) : 12;
    }
  } else if (monthlyNetWorth > 0) {
    trajectoryScore = 12; // partial credit for saving without full profile
  }

  return {
    total: Math.round(savingsScore + emergencyScore + debtScore + trajectoryScore),
    factors: [
      { name: "Savings Rate", score: Math.round(savingsScore), max: 25, direction: (savingsScore >= 20 ? "strength" : savingsScore >= 10 ? "neutral" : "weakness") as "strength" | "weakness" | "neutral" },
      { name: "Emergency Fund", score: Math.round(emergencyScore), max: 25, direction: (emergencyScore >= 20 ? "strength" : emergencyScore >= 10 ? "neutral" : "weakness") as "strength" | "weakness" | "neutral" },
      { name: "Debt Ratio", score: Math.round(debtScore), max: 25, direction: (debtScore >= 20 ? "strength" : debtScore >= 10 ? "neutral" : "weakness") as "strength" | "weakness" | "neutral" },
      { name: "Retirement Trajectory", score: Math.round(trajectoryScore), max: 25, direction: (trajectoryScore >= 20 ? "strength" : trajectoryScore >= 10 ? "neutral" : "weakness") as "strength" | "weakness" | "neutral" },
    ],
  };
}

function buildForecast(
  currentNetWorth: number,
  monthlyContribution: number,
  years: number,
  annualReturnRate = 0.07,
): { year: number; projected: number; label: string }[] {
  const r = annualReturnRate / 12;
  const points: { year: number; projected: number; label: string }[] = [];
  for (let y = 0; y <= years; y++) {
    const n = y * 12;
    const fv = r > 0
      ? currentNetWorth * Math.pow(1 + r, n) + monthlyContribution * (Math.pow(1 + r, n) - 1) / r
      : currentNetWorth + monthlyContribution * n;
    points.push({ year: y, projected: Math.round(Math.max(0, fv)), label: `Year ${y}` });
  }
  return points;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MetricCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{
      background: "var(--card-bg)", border: "1px solid var(--card-border)",
      borderRadius: "var(--radius-lg)", padding: "16px 20px",
      display: "flex", flexDirection: "column", gap: "4px",
    }}>
      <span style={{ fontSize: "10px", fontFamily: "var(--font-body)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)" }}>{label}</span>
      <span style={{ fontSize: "22px", fontFamily: "var(--font-mono)", fontWeight: 600, color: color ?? "var(--text-primary)", lineHeight: 1.2 }}>{value}</span>
      {sub && <span style={{ fontSize: "12px", color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>{sub}</span>}
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const color = score >= 75 ? "var(--green)" : score >= 50 ? "var(--amber)" : "var(--red)";
  const r = 28; const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <div style={{ position: "relative", width: 72, height: 72, flexShrink: 0 }}>
      <svg width="72" height="72" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="36" cy="36" r={r} fill="none" stroke="var(--card-border)" strokeWidth="5" />
        <circle cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.6s cubic-bezier(0.23,1,0.32,1)" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: "16px", color }}>{score}</span>
      </div>
    </div>
  );
}

function AddItemRow({
  type, onAdd, placeholder,
}: {
  type: "balance" | "cashflow";
  onAdd: (fd: FormData) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await onAdd(fd);
      formRef.current?.reset();
      setOpen(false);
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          display: "flex", alignItems: "center", gap: "6px",
          padding: "7px 12px", borderRadius: "var(--radius-md)",
          border: "1px dashed var(--border)", background: "transparent",
          color: "var(--text-tertiary)", fontSize: "12px",
          fontFamily: "var(--font-body)", cursor: "pointer",
          transition: "color 0.15s, border-color 0.15s",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-secondary)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border-strong)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-tertiary)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
        Add item
      </button>
    );
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "flex-end" }}>
      <input name="label" required placeholder={placeholder ?? "Label"} autoFocus
        style={inputStyle} />

      {type === "balance" ? (
        <>
          <select name="category" style={selectStyle} defaultValue="cash">
            <option value="cash">Cash</option>
            <option value="investment">Investment</option>
            <option value="real_asset">Real Asset</option>
            <option value="other_asset">Other Asset</option>
            <option value="liability">Liability</option>
          </select>
          <input name="value" type="number" min="0" step="0.01" placeholder="Value" required style={{ ...inputStyle, width: "120px" }} />
        </>
      ) : (
        <>
          <select name="type" style={selectStyle} defaultValue="income">
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>
          <select name="frequency" style={selectStyle} defaultValue="monthly">
            <option value="monthly">Monthly</option>
            <option value="annual">Annual</option>
          </select>
          <input name="amount" type="number" min="0" step="0.01" placeholder="Amount" required style={{ ...inputStyle, width: "120px" }} />
        </>
      )}

      <button type="submit" disabled={pending} style={btnPrimaryStyle}>{pending ? "Adding…" : "Add"}</button>
      <button type="button" onClick={() => setOpen(false)} style={btnSecondaryStyle}>Cancel</button>
    </form>
  );
}

function LineItemRow({
  item, type, onDelete,
}: {
  item: BalanceSheetItem | CashFlowItem;
  type: "balance" | "cashflow";
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  const isBalance = type === "balance";
  const bal = item as BalanceSheetItem;
  const cf = item as CashFlowItem;

  const displayValue = isBalance
    ? fmtFull(bal.value)
    : fmtFull(cf.amount) + " / " + (cf.frequency === "annual" ? "yr" : "mo");

  const accentColor = isBalance
    ? (bal.is_liability ? "var(--red)" : "var(--green)")
    : (cf.type === "income" ? "var(--green)" : "var(--red)");

  function handleDelete() {
    if (!confirm(`Remove "${item.label}"?`)) return;
    startTransition(async () => { await onDelete(item.id); });
  }

  function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("id", item.id);
    startTransition(async () => {
      if (isBalance) await updateBalanceSheetItem(fd);
      else await updateCashFlowItem(fd);
      setEditing(false);
    });
  }

  if (editing) {
    return (
      <form onSubmit={handleUpdate} style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "flex-end", padding: "8px 0" }}>
        <input name="label" defaultValue={item.label} required style={inputStyle} />
        {isBalance ? (
          <>
            <select name="category" defaultValue={bal.category} style={selectStyle}>
              <option value="cash">Cash</option>
              <option value="investment">Investment</option>
              <option value="real_asset">Real Asset</option>
              <option value="other_asset">Other Asset</option>
              <option value="liability">Liability</option>
            </select>
            <input name="value" type="number" min="0" step="0.01" defaultValue={bal.value} style={{ ...inputStyle, width: "120px" }} />
          </>
        ) : (
          <>
            <select name="type" defaultValue={cf.type} style={selectStyle}>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </select>
            <select name="frequency" defaultValue={cf.frequency} style={selectStyle}>
              <option value="monthly">Monthly</option>
              <option value="annual">Annual</option>
            </select>
            <input name="amount" type="number" min="0" step="0.01" defaultValue={cf.amount} style={{ ...inputStyle, width: "120px" }} />
          </>
        )}
        <button type="submit" disabled={pending} style={btnPrimaryStyle}>{pending ? "Saving…" : "Save"}</button>
        <button type="button" onClick={() => setEditing(false)} style={btnSecondaryStyle}>Cancel</button>
      </form>
    );
  }

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "12px",
      padding: "10px 0", borderBottom: "1px solid var(--border-subtle)",
    }}>
      <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: accentColor, flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: "13px", color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>{item.label}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", color: accentColor, fontWeight: 500 }}>{displayValue}</span>
      <button type="button" onClick={() => setEditing(true)} style={iconBtnStyle} title="Edit">
        <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
      </button>
      <button type="button" onClick={handleDelete} disabled={pending} style={{ ...iconBtnStyle, color: "var(--red)" }} title="Delete">
        <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
      </button>
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  flex: 1, minWidth: "140px", padding: "7px 10px",
  borderRadius: "var(--radius-md)", border: "1px solid var(--border)",
  background: "var(--bg-surface)", color: "var(--text-primary)",
  fontSize: "13px", fontFamily: "var(--font-body)", outline: "none",
};
const selectStyle: React.CSSProperties = {
  padding: "7px 10px", borderRadius: "var(--radius-md)",
  border: "1px solid var(--border)", background: "var(--bg-surface)",
  color: "var(--text-primary)", fontSize: "13px", fontFamily: "var(--font-body)",
  cursor: "pointer",
};
const btnPrimaryStyle: React.CSSProperties = {
  padding: "7px 14px", borderRadius: "var(--radius-md)",
  background: "var(--brand-gradient)", color: "var(--text-primary)",
  border: "none", fontSize: "12px", fontWeight: 600,
  fontFamily: "var(--font-body)", cursor: "pointer",
};
const btnSecondaryStyle: React.CSSProperties = {
  padding: "7px 12px", borderRadius: "var(--radius-md)",
  border: "1px solid var(--border)", background: "transparent",
  color: "var(--text-secondary)", fontSize: "12px",
  fontFamily: "var(--font-body)", cursor: "pointer",
};
const iconBtnStyle: React.CSSProperties = {
  padding: "4px", background: "none", border: "none",
  color: "var(--text-tertiary)", cursor: "pointer", lineHeight: 1,
};
const sectionHeadStyle: React.CSSProperties = {
  fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em",
  textTransform: "uppercase", color: "var(--text-tertiary)",
  fontFamily: "var(--font-body)", marginBottom: "8px",
};

// ── Main component ────────────────────────────────────────────────────────────

type Props = {
  profile: FinancialProfile | null;
  balanceItems: BalanceSheetItem[];
  cashFlowItems: CashFlowItem[];
  netWorthHistory: NetWorthSnapshot[];
  portfolioTotalValue: number;
};

type Tab = "overview" | "balance" | "cashflow" | "forecast";

export default function PlanningClient({
  profile, balanceItems, cashFlowItems, netWorthHistory, portfolioTotalValue,
}: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  const [profilePending, startProfileTransition] = useTransition();
  const [editingProfile, setEditingProfile] = useState(!profile);
  const [finnCommentary, setFinnCommentary] = useState<string | null>(null);
  const [finnLoading, setFinnLoading] = useState(false);
  const snapshotSaved = useRef(false);

  // ── Derived numbers ────────────────────────────────────────────────────────

  const assets = balanceItems.filter((i) => !i.is_liability);
  const liabilities = balanceItems.filter((i) => i.is_liability);

  const manualAssets = assets.reduce((s, i) => s + i.value, 0);
  const totalLiabilities = liabilities.reduce((s, i) => s + i.value, 0);
  // Portfolio value counts as assets but avoid double-counting if user added it manually
  const totalAssets = manualAssets + portfolioTotalValue;
  const netWorth = totalAssets - totalLiabilities;

  const monthlyIncome = cashFlowItems
    .filter((i) => i.type === "income")
    .reduce((s, i) => s + toMonthly(i.amount, i.frequency), 0);
  const monthlyExpenses = cashFlowItems
    .filter((i) => i.type === "expense")
    .reduce((s, i) => s + toMonthly(i.amount, i.frequency), 0);

  // Use profile overrides if cash flow items are empty
  const effectiveIncome = monthlyIncome > 0 ? monthlyIncome : (profile?.monthly_income ?? 0);
  const effectiveExpenses = monthlyExpenses > 0 ? monthlyExpenses : (profile?.monthly_expenses ?? 0);
  const monthlySavings = effectiveIncome - effectiveExpenses;
  const savingsRate = effectiveIncome > 0 ? (monthlySavings / effectiveIncome) * 100 : 0;

  const liquidAssets = assets
    .filter((i) => i.category === "cash")
    .reduce((s, i) => s + i.value, 0);

  const yearsToRetire = (profile?.current_age != null && profile?.target_retirement_age != null)
    ? Math.max(0, profile.target_retirement_age - profile.current_age)
    : null;

  const healthData = calcHealthScore(
    savingsRate, effectiveExpenses, liquidAssets,
    totalAssets, totalLiabilities,
    profile?.current_age ?? null, profile?.target_retirement_age ?? null,
    monthlySavings,
  );

  // ── Auto-save snapshot once per session ───────────────────────────────────

  useEffect(() => {
    if (snapshotSaved.current) return;
    if (totalAssets > 0 || totalLiabilities > 0) {
      snapshotSaved.current = true;
      saveNetWorthSnapshot(totalAssets, totalLiabilities, portfolioTotalValue).catch(() => {});
    }
  }, [totalAssets, totalLiabilities, portfolioTotalValue]);

  // ── FINN commentary ────────────────────────────────────────────────────────

  async function fetchFinnCommentary() {
    setFinnLoading(true);
    try {
      const ctx: FinnContext = {
        current_age: profile?.current_age ?? null,
        target_retirement_age: profile?.target_retirement_age ?? null,
        years_to_retire: yearsToRetire,
        total_assets: totalAssets,
        total_liabilities: totalLiabilities,
        net_worth: netWorth,
        monthly_income: effectiveIncome,
        monthly_expenses: effectiveExpenses,
        monthly_savings: monthlySavings,
        savings_rate_pct: savingsRate,
        portfolio_total_value: portfolioTotalValue,
        financial_health_score: healthData.total,
        health_factors: healthData.factors,
      };
      const res = await fetch("/api/planning/finn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ctx),
      });
      const data = await res.json();
      setFinnCommentary(data.commentary ?? null);
    } catch {
      setFinnCommentary("Unable to load FINN commentary at this time.");
    } finally {
      setFinnLoading(false);
    }
  }

  // ── Forecast data ──────────────────────────────────────────────────────────

  const forecastYears = yearsToRetire ?? 30;
  const forecastData = buildForecast(netWorth, monthlySavings, Math.min(forecastYears, 40));

  // Combine historical + forecast for the chart
  const historyForChart = netWorthHistory.map((s) => ({
    label: s.snapshot_date,
    historical: s.net_worth,
    projected: null as number | null,
  }));
  const forecastForChart = forecastData.map((p) => ({
    label: `+${p.year}yr`,
    historical: null as number | null,
    projected: p.projected,
  }));
  const chartData = [...historyForChart, ...forecastForChart];

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleProfileSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startProfileTransition(async () => {
      await upsertFinancialProfile(fd);
      setEditingProfile(false);
    });
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "balance", label: "Balance Sheet" },
    { id: "cashflow", label: "Cash Flow" },
    { id: "forecast", label: "Forecast" },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: "24px", maxWidth: "900px" }}>

      {/* Page header */}
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "22px", color: "var(--text-primary)", margin: 0 }}>
          Financial Planning
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "13px", marginTop: "4px", fontFamily: "var(--font-body)" }}>
          Net worth, cash flow, and retirement trajectory.
        </p>
      </div>

      {/* Hero metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px", marginBottom: "20px" }}>
        <MetricCard
          label="Net Worth"
          value={fmt(netWorth)}
          color={netWorth >= 0 ? "var(--green)" : "var(--red)"}
        />
        <MetricCard
          label="Monthly Savings"
          value={monthlySavings >= 0 ? fmt(monthlySavings) : "-" + fmt(Math.abs(monthlySavings))}
          sub={effectiveIncome > 0 ? `${fmtPct(savingsRate)} savings rate` : undefined}
          color={monthlySavings >= 0 ? "var(--text-primary)" : "var(--red)"}
        />
        <MetricCard
          label="Total Assets"
          value={fmt(totalAssets)}
        />
        <MetricCard
          label="Total Liabilities"
          value={fmt(totalLiabilities)}
          color={totalLiabilities > 0 ? "var(--red)" : "var(--text-secondary)"}
        />
      </div>

      {/* Health score + FINN banner */}
      <div style={{
        background: "var(--violet-bg)", border: "1px solid var(--violet-border)",
        borderRadius: "var(--radius-lg)", padding: "16px 20px",
        display: "flex", gap: "16px", alignItems: "flex-start",
        marginBottom: "20px", flexWrap: "wrap",
      }}>
        <ScoreRing score={healthData.total} />
        <div style={{ flex: 1, minWidth: "200px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--violet)", fontFamily: "var(--font-body)" }}>
              Financial Health Score
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-secondary)" }}>
              {healthData.total}/100
            </span>
          </div>

          {/* Factor bars */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "10px" }}>
            {healthData.factors.map((f) => (
              <div key={f.name} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                <div style={{ width: "48px", height: "4px", borderRadius: "2px", background: "var(--card-border)", overflow: "hidden" }}>
                  <div style={{ width: `${(f.score / f.max) * 100}%`, height: "100%", background: f.direction === "strength" ? "var(--green)" : f.direction === "weakness" ? "var(--red)" : "var(--amber)", borderRadius: "2px", transition: "width 0.5s cubic-bezier(0.23,1,0.32,1)" }} />
                </div>
                <span style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>{f.name}</span>
              </div>
            ))}
          </div>

          {finnCommentary ? (
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", lineHeight: 1.6, margin: 0 }}>{finnCommentary}</p>
          ) : (
            <button
              type="button"
              onClick={fetchFinnCommentary}
              disabled={finnLoading}
              style={{ ...btnPrimaryStyle, fontSize: "11px", padding: "6px 12px", opacity: finnLoading ? 0.7 : 1 }}
            >
              {finnLoading ? "FINN is thinking…" : "Get FINN Commentary"}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "2px", borderBottom: "1px solid var(--border-subtle)", marginBottom: "20px" }}>
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            style={{
              padding: "9px 16px", background: "none", border: "none",
              borderBottom: tab === id ? "2px solid var(--brand-blue)" : "2px solid transparent",
              color: tab === id ? "var(--text-primary)" : "var(--text-tertiary)",
              fontSize: "13px", fontWeight: tab === id ? 600 : 400,
              fontFamily: "var(--font-body)", cursor: "pointer",
              transition: "color 0.15s",
              marginBottom: "-1px",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab: Overview ── */}
      {tab === "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

          {/* Profile card */}
          <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", padding: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <span style={sectionHeadStyle}>Your Profile</span>
              {!editingProfile && (
                <button type="button" onClick={() => setEditingProfile(true)} style={btnSecondaryStyle}>Edit</button>
              )}
            </div>

            {editingProfile ? (
              <form onSubmit={handleProfileSubmit}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "12px" }}>
                  {[
                    { name: "current_age", label: "Current Age", type: "number", default: profile?.current_age ?? "" },
                    { name: "target_retirement_age", label: "Retirement Age", type: "number", default: profile?.target_retirement_age ?? 65 },
                    { name: "monthly_income", label: "Monthly Income ($)", type: "number", default: profile?.monthly_income ?? "" },
                    { name: "monthly_expenses", label: "Monthly Expenses ($)", type: "number", default: profile?.monthly_expenses ?? "" },
                  ].map((f) => (
                    <div key={f.name}>
                      <label style={{ display: "block", fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "5px", fontFamily: "var(--font-body)" }}>{f.label}</label>
                      <input name={f.name} type={f.type} min="0" defaultValue={String(f.default)} style={{ ...inputStyle, minWidth: "unset", width: "100%" }} />
                    </div>
                  ))}
                  <div>
                    <label style={{ display: "block", fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "5px", fontFamily: "var(--font-body)" }}>Risk Tolerance</label>
                    <select name="risk_tolerance" defaultValue={profile?.risk_tolerance ?? "moderate"} style={{ ...selectStyle, width: "100%" }}>
                      <option value="conservative">Conservative</option>
                      <option value="moderate">Moderate</option>
                      <option value="aggressive">Aggressive</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "8px", marginTop: "14px" }}>
                  <button type="submit" disabled={profilePending} style={btnPrimaryStyle}>{profilePending ? "Saving…" : "Save Profile"}</button>
                  {profile && <button type="button" onClick={() => setEditingProfile(false)} style={btnSecondaryStyle}>Cancel</button>}
                </div>
              </form>
            ) : profile ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "12px" }}>
                {[
                  { label: "Age", value: profile.current_age ? String(profile.current_age) : "—" },
                  { label: "Retirement Target", value: profile.target_retirement_age ? String(profile.target_retirement_age) : "—" },
                  { label: "Years Left", value: yearsToRetire != null ? `${yearsToRetire} yrs` : "—" },
                  { label: "Risk Tolerance", value: profile.risk_tolerance ?? "—" },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <div style={{ ...sectionHeadStyle, marginBottom: "2px" }}>{label}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "14px", color: "var(--text-primary)", fontWeight: 500 }}>{value}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: "13px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", margin: 0 }}>
                Add your profile to unlock your financial health score and retirement forecast.
              </p>
            )}
          </div>

          {/* Quick summary */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", padding: "16px" }}>
              <div style={sectionHeadStyle}>Assets Breakdown</div>
              {assets.length === 0 && portfolioTotalValue === 0 ? (
                <p style={{ color: "var(--text-tertiary)", fontSize: "12px", fontFamily: "var(--font-body)" }}>No assets added yet.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {portfolioTotalValue > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", fontFamily: "var(--font-body)", color: "var(--text-secondary)" }}>
                      <span>Portfolio (all accounts)</span>
                      <span style={{ fontFamily: "var(--font-mono)", color: "var(--green)" }}>{fmt(portfolioTotalValue)}</span>
                    </div>
                  )}
                  {assets.map((a) => (
                    <div key={a.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", fontFamily: "var(--font-body)", color: "var(--text-secondary)" }}>
                      <span>{a.label}</span>
                      <span style={{ fontFamily: "var(--font-mono)" }}>{fmt(a.value)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", padding: "16px" }}>
              <div style={sectionHeadStyle}>Liabilities</div>
              {liabilities.length === 0 ? (
                <p style={{ color: "var(--text-tertiary)", fontSize: "12px", fontFamily: "var(--font-body)" }}>No liabilities added.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {liabilities.map((l) => (
                    <div key={l.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", fontFamily: "var(--font-body)", color: "var(--text-secondary)" }}>
                      <span>{l.label}</span>
                      <span style={{ fontFamily: "var(--font-mono)", color: "var(--red)" }}>{fmt(l.value)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Balance Sheet ── */}
      {tab === "balance" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

          {/* Portfolio integration notice */}
          {portfolioTotalValue > 0 && (
            <div style={{ padding: "10px 14px", borderRadius: "var(--radius-md)", background: "var(--green-bg)", border: "1px solid var(--green-border)", fontSize: "12px", color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
              <strong style={{ color: "var(--green)" }}>Portfolio auto-included:</strong> {fmt(portfolioTotalValue)} from your active BuyTune portfolios is counted in Total Assets.
            </div>
          )}

          {/* Assets */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <span style={sectionHeadStyle}>Assets</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", color: "var(--green)", fontWeight: 500 }}>{fmt(totalAssets)}</span>
            </div>
            {assets.map((item) => (
              <LineItemRow key={item.id} item={item} type="balance" onDelete={deleteBalanceSheetItem} />
            ))}
            <div style={{ marginTop: "10px" }}>
              <AddItemRow type="balance" placeholder="e.g. Checking account" onAdd={addBalanceSheetItem} />
            </div>
          </div>

          {/* Liabilities */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <span style={sectionHeadStyle}>Liabilities</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", color: "var(--red)", fontWeight: 500 }}>{fmt(totalLiabilities)}</span>
            </div>
            {liabilities.map((item) => (
              <LineItemRow key={item.id} item={item} type="balance" onDelete={deleteBalanceSheetItem} />
            ))}
            <div style={{ marginTop: "10px" }}>
              <AddItemRow type="balance" placeholder="e.g. Student loan" onAdd={(fd) => { fd.set("category", "liability"); return addBalanceSheetItem(fd); }} />
            </div>
          </div>

          {/* Net worth total */}
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: "var(--font-body)", fontWeight: 600, fontSize: "14px", color: "var(--text-primary)" }}>Net Worth</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "20px", fontWeight: 700, color: netWorth >= 0 ? "var(--green)" : "var(--red)" }}>{fmt(netWorth)}</span>
          </div>
        </div>
      )}

      {/* ── Tab: Cash Flow ── */}
      {tab === "cashflow" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

          {/* Income */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <span style={sectionHeadStyle}>Income</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", color: "var(--green)", fontWeight: 500 }}>{fmt(monthlyIncome)} / mo</span>
            </div>
            {cashFlowItems.filter((i) => i.type === "income").map((item) => (
              <LineItemRow key={item.id} item={item} type="cashflow" onDelete={deleteCashFlowItem} />
            ))}
            <div style={{ marginTop: "10px" }}>
              <AddItemRow type="cashflow" placeholder="e.g. Salary" onAdd={(fd) => { fd.set("type", "income"); return addCashFlowItem(fd); }} />
            </div>
          </div>

          {/* Expenses */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <span style={sectionHeadStyle}>Expenses</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", color: "var(--red)", fontWeight: 500 }}>{fmt(monthlyExpenses)} / mo</span>
            </div>
            {cashFlowItems.filter((i) => i.type === "expense").map((item) => (
              <LineItemRow key={item.id} item={item} type="cashflow" onDelete={deleteCashFlowItem} />
            ))}
            <div style={{ marginTop: "10px" }}>
              <AddItemRow type="cashflow" placeholder="e.g. Rent" onAdd={(fd) => { fd.set("type", "expense"); return addCashFlowItem(fd); }} />
            </div>
          </div>

          {/* Summary */}
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: "16px", display: "flex", flexWrap: "wrap", gap: "20px" }}>
            {[
              { label: "Monthly Income", value: fmt(monthlyIncome), color: "var(--green)" },
              { label: "Monthly Expenses", value: fmt(monthlyExpenses), color: "var(--red)" },
              { label: "Monthly Savings", value: fmt(Math.abs(monthlySavings)), color: monthlySavings >= 0 ? "var(--green)" : "var(--red)" },
              { label: "Savings Rate", value: fmtPct(savingsRate), color: savingsRate >= 20 ? "var(--green)" : savingsRate >= 10 ? "var(--amber)" : "var(--red)" },
            ].map(({ label, value, color }) => (
              <div key={label}>
                <div style={sectionHeadStyle}>{label}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 600, color }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Tab: Forecast ── */}
      {tab === "forecast" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <p style={{ fontSize: "13px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", margin: 0 }}>
                Deterministic projection assuming 7% annual return and {fmt(monthlySavings > 0 ? monthlySavings : 0)}/mo savings.
              </p>
            </div>
            {yearsToRetire != null && (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--violet)", background: "var(--violet-bg)", border: "1px solid var(--violet-border)", padding: "4px 10px", borderRadius: "var(--radius-full)" }}>
                {yearsToRetire} years to retirement
              </div>
            )}
          </div>

          {/* Net worth chart — history + forecast */}
          <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", padding: "20px" }}>
            <div style={{ ...sectionHeadStyle, marginBottom: "16px" }}>
              Net Worth Trajectory
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="histGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00d395" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#00d395" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="projGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontFamily: "var(--font-mono)", fontSize: 10, fill: "var(--text-tertiary)" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tickFormatter={(v) => "$" + (v >= 1000000 ? (v / 1000000).toFixed(1) + "M" : v >= 1000 ? (v / 1000).toFixed(0) + "k" : v)} tick={{ fontFamily: "var(--font-mono)", fontSize: 10, fill: "var(--text-tertiary)" }} axisLine={false} tickLine={false} width={55} />
                <Tooltip
                  contentStyle={{ background: "var(--bg-overlay)", border: "1px solid var(--border)", borderRadius: "8px", fontFamily: "var(--font-mono)", fontSize: "12px" }}
                  labelStyle={{ color: "var(--text-secondary)" }}
                  formatter={(value, name) => [fmt(typeof value === "number" ? value : 0), name === "historical" ? "Historical" : "Projected"]}
                />
                <Area type="monotone" dataKey="historical" stroke="#00d395" strokeWidth={1.5} fill="url(#histGrad)" dot={false} connectNulls={false} />
                <Area type="monotone" dataKey="projected" stroke="#a78bfa" strokeWidth={1.5} strokeDasharray="4 3" fill="url(#projGrad)" dot={false} connectNulls={false} />
                {yearsToRetire != null && (
                  <ReferenceLine x={`+${yearsToRetire}yr`} stroke="rgba(245,158,11,0.5)" strokeDasharray="4 3" label={{ value: "Retirement", fill: "var(--amber)", fontSize: 10, fontFamily: "var(--font-mono)" }} />
                )}
              </AreaChart>
            </ResponsiveContainer>
            <div style={{ display: "flex", gap: "16px", marginTop: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>
                <div style={{ width: "16px", height: "2px", background: "#00d395" }} /> Historical
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>
                <div style={{ width: "16px", height: "2px", background: "#a78bfa", borderTop: "2px dashed #a78bfa" }} /> Projected
              </div>
            </div>
          </div>

          {/* Target at retirement */}
          {yearsToRetire != null && forecastData.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "12px" }}>
              <MetricCard
                label={`Net Worth at ${profile?.target_retirement_age ?? "Retirement"}`}
                value={fmt(forecastData[forecastData.length - 1]?.projected ?? 0)}
                color="var(--violet)"
              />
              <MetricCard
                label="Assumed Annual Return"
                value="7.0%"
                sub="Editable in Phase 2"
              />
              <MetricCard
                label="Monthly Contribution"
                value={fmt(Math.max(0, monthlySavings))}
                sub="Based on your cash flow"
              />
            </div>
          )}

          <p style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", margin: 0 }}>
            Projection assumes consistent contributions and 7% annual return. Actual results will vary. For informational purposes only.
          </p>
        </div>
      )}
    </div>
  );
}
