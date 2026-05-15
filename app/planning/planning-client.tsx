"use client";

import { useState, useEffect, useTransition, useRef, useMemo } from "react";
import * as XLSX from "xlsx";
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
  upsertPlanningAssumptions,
  addFutureEvent,
  deleteFutureEvent,
} from "./planning-actions";
import type { FinancialProfile, BalanceSheetItem, CashFlowItem, NetWorthSnapshot, PlanningAssumptions, FutureEvent } from "./planning-actions";
import type { FinnContext } from "@/app/api/planning/finn/route";
import type { FinnChatMessage, FinnChatContext } from "@/app/api/planning/finn/chat/route";
import type { ImportedItem } from "@/app/api/planning/import/route";

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
function fmtDate(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function fmtDateShort(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
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

type ForecastPoint = {
  year: number;
  label: string;
  optimistic: number;
  baseline: number;
  pessimistic: number;
  annualIncome: number;
  annualExpenses: number;
  annualSavings: number;
};

function buildForecastBands(
  currentNetWorth: number,
  monthlyIncome: number,
  monthlyExpenses: number,
  years: number,
  returnRate: number,
  inflationRate: number,
  salaryGrowthRate: number,
  futureEvents: FutureEvent[],
  currentYear: number,
): ForecastPoint[] {
  const grow = (nw: number, r: number, annualSavings: number): number => {
    const mr = r / 12;
    const mc = annualSavings / 12;
    return mr > 0
      ? nw * Math.pow(1 + mr, 12) + mc * (Math.pow(1 + mr, 12) - 1) / mr
      : nw + annualSavings;
  };

  let nwOpt = currentNetWorth;
  let nwBase = currentNetWorth;
  let nwPess = currentNetWorth;
  const result: ForecastPoint[] = [];

  for (let y = 0; y <= years; y++) {
    const annualIncome = monthlyIncome * 12 * Math.pow(1 + salaryGrowthRate, y);
    const annualExpenses = monthlyExpenses * 12 * Math.pow(1 + inflationRate, y);
    const annualSavings = annualIncome - annualExpenses;
    const yearAbs = currentYear + y;
    const eventImpact = futureEvents
      .filter((e) => e.event_year === yearAbs)
      .reduce((s, e) => s + e.amount_impact, 0);

    if (y > 0) {
      nwOpt = grow(nwOpt, Math.min(0.20, returnRate + 0.03), annualSavings) + eventImpact;
      nwBase = grow(nwBase, returnRate, annualSavings) + eventImpact;
      nwPess = grow(nwPess, Math.max(0, returnRate - 0.03), annualSavings) + eventImpact;
    }

    result.push({
      year: y,
      label: y === 0 ? "Now" : `+${y}yr`,
      optimistic: Math.round(Math.max(0, nwOpt)),
      baseline: Math.round(Math.max(0, nwBase)),
      pessimistic: Math.round(Math.max(0, nwPess)),
      annualIncome: Math.round(annualIncome),
      annualExpenses: Math.round(annualExpenses),
      annualSavings: Math.round(annualSavings),
    });
  }
  return result;
}

function calcRetirementProbability(baselineNW: number, annualExpenses: number): number | null {
  if (annualExpenses <= 0 || baselineNW <= 0) return null;
  const ratio = baselineNW / (annualExpenses * 25);
  if (ratio >= 1.5) return 95;
  if (ratio >= 1.2) return 88;
  if (ratio >= 1.0) return 82;
  if (ratio >= 0.8) return 70;
  if (ratio >= 0.6) return 55;
  if (ratio >= 0.4) return 38;
  if (ratio >= 0.2) return 20;
  return 8;
}

function normalRandom(mean: number, stdDev: number): number {
  const u = Math.max(1e-10, Math.random());
  const v = Math.random();
  return mean + stdDev * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

type McPoint = { year: number; label: string; p10: number; p25: number; p50: number; p75: number; p90: number };

function runMonteCarlo(
  currentNW: number,
  monthlyIncome: number,
  monthlyExpenses: number,
  years: number,
  returnRate: number,
  inflationRate: number,
  salaryGrowthRate: number,
  futureEvents: FutureEvent[],
  currentYear: number,
  retirementYear: number | null,
  retirementTarget: number | null,
  runs = 1000,
): { points: McPoint[]; mcRetirementProbability: number | null } {
  const allRuns: number[][] = [];
  for (let i = 0; i < runs; i++) {
    let nw = currentNW;
    const yearly: number[] = [nw];
    for (let y = 1; y <= years; y++) {
      const r = Math.max(-0.6, normalRandom(returnRate, 0.15));
      const income = monthlyIncome * 12 * Math.pow(1 + salaryGrowthRate, y);
      const expenses = monthlyExpenses * 12 * Math.pow(1 + inflationRate, y);
      const savings = income - expenses;
      const events = futureEvents
        .filter((e) => e.event_year === currentYear + y)
        .reduce((s, e) => s + e.amount_impact, 0);
      const mr = r / 12;
      const mc = savings / 12;
      nw = mr > 0
        ? nw * Math.pow(1 + mr, 12) + mc * (Math.pow(1 + mr, 12) - 1) / mr
        : nw + savings;
      nw = Math.max(0, nw + events);
      yearly.push(nw);
    }
    allRuns.push(yearly);
  }

  const mcRetirementProbability =
    retirementYear != null && retirementTarget != null && retirementTarget > 0
      ? Math.round((allRuns.filter((r) => (r[retirementYear] ?? 0) >= retirementTarget).length / runs) * 100)
      : null;

  const points: McPoint[] = Array.from({ length: years + 1 }, (_, y) => {
    const vals = allRuns.map((r) => r[y]).sort((a, b) => a - b);
    const p = (pct: number) => Math.round(vals[Math.floor((pct / 100) * runs)] ?? 0);
    return { year: y, label: y === 0 ? "Now" : `+${y}yr`, p10: p(10), p25: p(25), p50: p(50), p75: p(75), p90: p(90) };
  });

  return { points, mcRetirementProbability };
}

// ── Optimization engine ───────────────────────────────────────────────────────

type Optimization = {
  id: string;
  priority: number;
  icon: string;
  headline: string;
  detail: string;
  impact: string;
  effort: "Low" | "Medium" | "High";
};

function computeOptimizations(p: {
  savingsRate: number;
  monthlySavings: number;
  effectiveIncome: number;
  effectiveExpenses: number;
  liquidAssets: number;
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  retirementProb: number | null;
  retirementPointBaseline: number | null;
  retirementPointAnnualExpenses: number | null;
  activeRetirementAge: number | null;
  activeYearsToRetire: number | null;
  forecastYears: number;
  localReturn: number;
  localInflation: number;
  localSalaryGrowth: number;
  futureEvents: FutureEvent[];
  currentYear: number;
}): Optimization[] {
  const recs: Optimization[] = [];

  // 1. Savings rate — run boosted forecast to quantify impact
  if (p.effectiveIncome > 0 && p.savingsRate < 20) {
    const monthlyIncrease = Math.max(100, p.effectiveIncome * 0.20 - p.monthlySavings);
    const boostedBands = buildForecastBands(
      p.netWorth, p.effectiveIncome, Math.max(0, p.effectiveExpenses - monthlyIncrease),
      p.forecastYears, p.localReturn, p.localInflation, p.localSalaryGrowth,
      p.futureEvents, p.currentYear,
    );
    const boostedPt = p.activeYearsToRetire != null
      ? boostedBands[Math.min(p.activeYearsToRetire, boostedBands.length - 1)]
      : boostedBands[boostedBands.length - 1];
    const boostedProb = boostedPt ? calcRetirementProbability(boostedPt.baseline, boostedPt.annualExpenses) : null;
    const nwDelta = boostedPt && p.retirementPointBaseline != null ? boostedPt.baseline - p.retirementPointBaseline : null;
    const probDelta = boostedProb != null && p.retirementProb != null ? boostedProb - p.retirementProb : null;
    const impactParts = [
      nwDelta != null && nwDelta > 0 ? `+${fmt(nwDelta)} at retirement` : null,
      probDelta != null && probDelta > 0 ? `probability ${p.retirementProb}% → ${boostedProb}%` : null,
    ].filter(Boolean);
    recs.push({
      id: "savings-rate", priority: 1, icon: "📈",
      headline: `Raise savings rate to 20% (+${fmt(monthlyIncrease)}/mo)`,
      detail: `Currently ${p.savingsRate.toFixed(1)}%. Each extra $100/mo compounds significantly over time.`,
      impact: impactParts.length > 0 ? impactParts.join(" · ") : "Significant improvement to retirement timeline",
      effort: "Medium",
    });
  }

  // 2. Emergency fund gap
  const emergencyTarget = p.effectiveExpenses * 3;
  const currentMonths = p.effectiveExpenses > 0 ? p.liquidAssets / p.effectiveExpenses : 0;
  if (currentMonths < 3 && p.effectiveExpenses > 0) {
    const gap = emergencyTarget - p.liquidAssets;
    const monthsToFill = p.monthlySavings > 200 ? Math.ceil(gap / (p.monthlySavings * 0.3)) : null;
    recs.push({
      id: "emergency-fund", priority: 2, icon: "🛡️",
      headline: `Fill ${fmt(gap)} emergency fund gap`,
      detail: `${currentMonths.toFixed(1)} months of expenses in liquid assets. The 3-month target (${fmt(emergencyTarget)}) protects your investments from forced liquidation.`,
      impact: monthsToFill != null
        ? `~${monthsToFill} months at 30% of current savings · removes biggest health score drag`
        : "Eliminates your biggest financial health score weakness",
      effort: currentMonths < 1 ? "High" : "Low",
    });
  }

  // 3. Retire later if probability is low
  if (p.retirementProb != null && p.retirementProb < 65 && p.activeRetirementAge != null && p.activeYearsToRetire != null) {
    const laterYears = p.activeYearsToRetire + 5;
    const laterBands = buildForecastBands(
      p.netWorth, p.effectiveIncome, p.effectiveExpenses,
      laterYears, p.localReturn, p.localInflation, p.localSalaryGrowth,
      p.futureEvents, p.currentYear,
    );
    const laterPt = laterBands[laterBands.length - 1];
    const laterProb = laterPt ? calcRetirementProbability(laterPt.baseline, laterPt.annualExpenses) : null;
    if (laterProb != null && laterProb > p.retirementProb + 8) {
      const baselineDelta = laterPt && p.retirementPointBaseline != null ? laterPt.baseline - p.retirementPointBaseline : null;
      recs.push({
        id: "retire-later", priority: 3, icon: "⏳",
        headline: `Retiring at ${p.activeRetirementAge + 5} adds 5 years of compounding`,
        detail: `Your current ${p.retirementProb}% probability reflects the gap to 25× annual expenses. Extra years let existing assets compound harder.`,
        impact: [
          `probability ${p.retirementProb}% → ${laterProb}%`,
          baselineDelta != null && baselineDelta > 0 ? `+${fmt(baselineDelta)} projected at retirement` : null,
        ].filter(Boolean).join(" · "),
        effort: "High",
      });
    }
  }

  // 4. Debt reduction if liabilities are high relative to assets
  const debtRatio = p.totalAssets > 0 ? p.totalLiabilities / p.totalAssets : 0;
  if (debtRatio > 0.35 && p.totalLiabilities > 5000) {
    const reductionNeeded = p.totalLiabilities - p.totalAssets * 0.2;
    recs.push({
      id: "debt-reduction", priority: 4, icon: "💸",
      headline: `Reduce debt by ${fmt(Math.max(0, reductionNeeded))}`,
      detail: `Liabilities are ${(debtRatio * 100).toFixed(0)}% of total assets. Target: below 20% for full Debt Ratio score.`,
      impact: "Brings Debt Ratio score from weakness to strength · unlocks up to 25 more health points",
      effort: "High",
    });
  }

  return recs.sort((a, b) => a.priority - b.priority).slice(0, 3);
}

function getFactorExplainer(
  name: string,
  savingsRate: number,
  liquidAssets: number,
  effectiveExpenses: number,
  totalAssets: number,
  totalLiabilities: number,
  retirementProb: number | null,
): string {
  switch (name) {
    case "Savings Rate": {
      if (savingsRate >= 20) return `${savingsRate.toFixed(1)}% saved — above the 20% target. Strong.`;
      if (savingsRate >= 10) return `${savingsRate.toFixed(1)}% saved. Increasing to 20% unlocks the full 25 points.`;
      return `${savingsRate.toFixed(1)}% saved — below the 10% floor. Highest-priority improvement.`;
    }
    case "Emergency Fund": {
      const months = effectiveExpenses > 0 ? liquidAssets / effectiveExpenses : 0;
      if (months >= 3) return `${months.toFixed(1)} months of expenses in liquid assets — target met (3 months).`;
      return `${months.toFixed(1)} months covered. Build to ${fmt(effectiveExpenses * 3)} (3 months) for full score.`;
    }
    case "Debt Ratio": {
      const ratio = totalAssets > 0 ? (totalLiabilities / totalAssets) * 100 : 0;
      if (ratio < 20) return `Liabilities are ${ratio.toFixed(0)}% of assets — healthy. Target: below 20%.`;
      if (ratio < 50) return `Liabilities are ${ratio.toFixed(0)}% of assets. Reduce to below 20% for the full 25 points.`;
      return `Liabilities are ${ratio.toFixed(0)}% of assets — high. Debt reduction is the biggest lever here.`;
    }
    case "Retirement Trajectory": {
      if (retirementProb == null) return "Set your age and retirement target to unlock this score.";
      if (retirementProb >= 75) return `${retirementProb}% on-track probability — on pace for your retirement goal.`;
      return `${retirementProb}% probability of hitting your retirement target. See Opportunities below for levers.`;
    }
    default:
      return "";
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function InfoTooltip({ text }: { text: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", verticalAlign: "middle" }}>
      <button
        type="button"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onClick={(e) => { e.stopPropagation(); setVisible((v) => !v); }}
        style={{
          background: "none", border: "1px solid var(--text-tertiary)", cursor: "pointer",
          color: "var(--text-tertiary)", padding: 0, margin: "0 3px",
          fontSize: "9px", fontFamily: "var(--font-body)", fontWeight: 600,
          lineHeight: 1, display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: "13px", height: "13px", borderRadius: "50%", flexShrink: 0,
        }}
        aria-label="More info"
      >i</button>
      {visible && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 8px)", left: "50%",
          transform: "translateX(-50%)",
          background: "var(--bg-overlay, #0d1829)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)", padding: "10px 13px",
          fontSize: "12px", color: "var(--text-secondary)", fontFamily: "var(--font-body)",
          lineHeight: 1.55, width: "230px", zIndex: 100,
          boxShadow: "0 6px 20px rgba(0,0,0,0.4)", pointerEvents: "none",
        }}>
          {text}
          <div style={{
            position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)",
            width: 0, height: 0,
            borderLeft: "5px solid transparent", borderRight: "5px solid transparent",
            borderTop: "5px solid var(--border)",
          }} />
        </div>
      )}
    </span>
  );
}

function NetWorthHistoryCard({
  history, currentNW, currentAssets, currentLiabilities,
}: {
  history: NetWorthSnapshot[];
  currentNW: number;
  currentAssets: number;
  currentLiabilities: number;
}) {
  const today = new Date().toISOString().split("T")[0];
  const allPoints: { date: string; net_worth: number }[] = [
    ...history
      .filter((s) => s.snapshot_date !== today)
      .map((s) => ({ date: s.snapshot_date, net_worth: s.net_worth })),
    { date: today, net_worth: currentNW },
  ].sort((a, b) => a.date.localeCompare(b.date));

  const first = allPoints[0];
  const change = allPoints.length >= 2 ? currentNW - first.net_worth : null;
  const isUp = change == null || change >= 0;
  const accentColor = isUp ? "#00d395" : "#f59e0b";

  const useShortDates = allPoints.length > 8;
  const chartData = allPoints.map((p) => ({
    label: useShortDates ? fmtDateShort(p.date) : fmtDate(p.date),
    value: p.net_worth,
  }));

  return (
    <div style={{
      background: "var(--card-bg)", border: "1px solid var(--card-border)",
      borderRadius: "var(--radius-lg)", padding: "20px", marginBottom: "16px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px", marginBottom: allPoints.length >= 2 ? "16px" : "8px" }}>
        <div>
          <div style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginBottom: "4px" }}>Net Worth</div>
          <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "30px", color: currentNW >= 0 ? "var(--text-primary)" : "var(--red)", lineHeight: 1.1 }}>
            {fmt(currentNW)}
          </div>
          {change != null && (
            <div style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: isUp ? "var(--green)" : "var(--red)", marginTop: "4px" }}>
              {isUp ? "▲" : "▼"} {isUp ? "+" : ""}{fmt(change)} since {fmtDate(first.date)}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
          {[
            { label: "Total Assets", value: fmt(currentAssets), color: "var(--green)" },
            { label: "Total Liabilities", value: fmt(currentLiabilities), color: currentLiabilities > 0 ? "var(--red)" : "var(--text-secondary)" },
          ].map(({ label, value, color }) => (
            <div key={label}>
              <div style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginBottom: "3px" }}>{label}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: "16px", color }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {allPoints.length >= 2 ? (
        <ResponsiveContainer width="100%" height={150}>
          <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="nwHistGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={accentColor} stopOpacity={0.18} />
                <stop offset="95%" stopColor={accentColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--text-tertiary)" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis
              tickFormatter={(v) => "$" + (Math.abs(v) >= 1000000 ? (v / 1000000).toFixed(1) + "M" : Math.abs(v) >= 1000 ? (v / 1000).toFixed(0) + "k" : v)}
              tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--text-tertiary)" }}
              axisLine={false} tickLine={false} width={52}
            />
            <Tooltip
              contentStyle={{ background: "var(--bg-overlay, #0d1829)", border: "1px solid var(--border)", borderRadius: "8px", fontFamily: "var(--font-mono)", fontSize: "12px" }}
              labelStyle={{ color: "var(--text-secondary)" }}
              formatter={(value) => [fmt(typeof value === "number" ? value : 0), "Net Worth"]}
            />
            <Area type="monotone" dataKey="value" stroke={accentColor} strokeWidth={2} fill="url(#nwHistGrad)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div style={{ padding: "16px 0 4px", textAlign: "center" }}>
          <p style={{ fontSize: "12px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", margin: 0 }}>
            Your net worth is now being tracked. Return daily and this chart will fill in over time.
          </p>
        </div>
      )}
    </div>
  );
}

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

// ── Cash flow categories ───────────────────────────────────────────────────────

const EXPENSE_CATEGORIES: { label: string; keywords: string[]; emoji: string }[] = [
  { label: "Housing",        keywords: ["rent", "mortgage", "hoa", "property tax", "home insurance", "maintenance", "repair", "condo", "lease", "landlord"],                                        emoji: "🏠" },
  { label: "Transportation", keywords: ["car", "gas", "fuel", "auto insurance", "parking", "uber", "lyft", "transit", "bus", "subway", "toll", "vehicle", "train", "metro"],                       emoji: "🚗" },
  { label: "Food & Dining",  keywords: ["grocery", "groceries", "food", "restaurant", "dining", "coffee", "lunch", "dinner", "breakfast", "meal", "delivery", "doordash", "instacart", "takeout"], emoji: "🍽️" },
  { label: "Healthcare",     keywords: ["health", "medical", "doctor", "dental", "vision", "pharmacy", "prescription", "therapy", "counseling"],                                                   emoji: "🏥" },
  { label: "Fitness",        keywords: ["gym", "fitness", "yoga", "workout", "pilates", "peloton", "crossfit", "exercise"],                                                                        emoji: "💪" },
  { label: "Insurance",      keywords: ["life insurance", "disability", "renters insurance", "term life", "umbrella policy"],                                                                      emoji: "🛡️" },
  { label: "Utilities",      keywords: ["electric", "electricity", "gas bill", "water", "internet", "phone", "cell", "utility", "heating", "cooling", "cable", "sewage"],                         emoji: "⚡" },
  { label: "Entertainment",  keywords: ["streaming", "spotify", "netflix", "hulu", "disney", "games", "gaming", "movies", "books", "hobby", "concert", "theater"],                                emoji: "🎬" },
  { label: "Travel",         keywords: ["travel", "vacation", "hotel", "flight", "airbnb", "trip", "cruise"],                                                                                     emoji: "✈️" },
  { label: "Subscriptions",  keywords: ["subscription", "membership", "amazon prime", "premium", "software", "saas", "monthly service"],                                                          emoji: "📱" },
  { label: "Childcare",      keywords: ["childcare", "daycare", "school", "tuition", "babysitter", "nanny", "kids", "children", "after school"],                                                   emoji: "👶" },
  { label: "Other",          keywords: [],                                                                                                                                                         emoji: "📦" },
];

function getCategoryForExpense(label: string): string {
  const lower = label.toLowerCase();
  for (const cat of EXPENSE_CATEGORIES.slice(0, -1)) {
    if (cat.keywords.some((k) => lower.includes(k))) return cat.label;
  }
  return "Other";
}

// ── Assumption presets ─────────────────────────────────────────────────────────

const ASSUMPTION_PRESETS = {
  Conservative: { return_rate: 5.0, inflation_rate: 3.5, salary_growth_rate: 1.5 },
  Moderate:     { return_rate: 7.0, inflation_rate: 3.0, salary_growth_rate: 2.0 },
  Aggressive:   { return_rate: 10.0, inflation_rate: 2.5, salary_growth_rate: 3.0 },
} as const;

type PresetName = keyof typeof ASSUMPTION_PRESETS;

function getActivePreset(local: { return_rate: number; inflation_rate: number; salary_growth_rate: number }): PresetName | null {
  for (const name of Object.keys(ASSUMPTION_PRESETS) as PresetName[]) {
    const p = ASSUMPTION_PRESETS[name];
    if (
      Math.abs(local.return_rate - p.return_rate) < 0.05 &&
      Math.abs(local.inflation_rate - p.inflation_rate) < 0.05 &&
      Math.abs(local.salary_growth_rate - p.salary_growth_rate) < 0.05
    ) return name;
  }
  return null;
}

// ── Onboarding Wizard ─────────────────────────────────────────────────────────

function OnboardingWizard({ onClose }: { onClose: () => void }) {
  const STEPS = ["Profile", "Income", "Expenses", "Assets & Debts", "Ready"];
  const [step, setStep] = useState(0);
  const [profPending, startProfTransition] = useTransition();
  const [itemPending, startItemTransition] = useTransition();

  const [wizardIncome, setWizardIncome] = useState<{ label: string; amount: number; frequency: string }[]>([]);
  const [wizardExpenses, setWizardExpenses] = useState<{ label: string; amount: number; frequency: string }[]>([]);
  const [wizardAssets, setWizardAssets] = useState<{ label: string; value: number; kind: "asset" | "debt" }[]>([]);

  const incomeFormRef = useRef<HTMLFormElement>(null);
  const expenseFormRef = useRef<HTMLFormElement>(null);
  const assetFormRef = useRef<HTMLFormElement>(null);
  const debtFormRef = useRef<HTMLFormElement>(null);

  function dismiss() {
    localStorage.setItem("buytune_planning_wizard_dismissed", "1");
    onClose();
  }

  function handleProfileSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startProfTransition(async () => {
      await upsertFinancialProfile(fd);
      setStep(1);
    });
  }

  function handleAddCf(
    e: React.FormEvent<HTMLFormElement>,
    cfType: "income" | "expense",
    formRef: React.RefObject<HTMLFormElement>,
    setter: React.Dispatch<React.SetStateAction<{ label: string; amount: number; frequency: string }[]>>,
  ) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("type", cfType);
    const label = (fd.get("label") as string).trim();
    const amount = Number(fd.get("amount"));
    const frequency = fd.get("frequency") as string;
    if (!label || !amount) return;
    startItemTransition(async () => {
      await addCashFlowItem(fd);
      setter((prev) => [...prev, { label, amount, frequency }]);
      formRef.current?.reset();
    });
  }

  function handleAddBalance(
    e: React.FormEvent<HTMLFormElement>,
    kind: "asset" | "debt",
    formRef: React.RefObject<HTMLFormElement>,
  ) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (kind === "debt") fd.set("category", "liability");
    else if (!fd.get("category")) fd.set("category", "other_asset");
    const label = (fd.get("label") as string).trim();
    const value = Number(fd.get("value"));
    if (!label || !value) return;
    startItemTransition(async () => {
      await addBalanceSheetItem(fd);
      setWizardAssets((prev) => [...prev, { label, value, kind }]);
      formRef.current?.reset();
    });
  }

  const fieldStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px", boxSizing: "border-box",
    borderRadius: "8px", border: "1px solid var(--border)",
    background: "var(--bg-surface)", color: "var(--text-primary)",
    fontSize: "13px", fontFamily: "var(--font-body)", outline: "none",
  };

  const totalAdded = wizardIncome.length + wizardExpenses.length + wizardAssets.length;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(4, 13, 26, 0.93)",
      backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "20px",
    }}>
      <div style={{
        background: "var(--card-bg)", border: "1px solid var(--card-border)",
        borderRadius: "var(--radius-lg)", padding: "32px",
        width: "100%", maxWidth: "480px",
        boxShadow: "0 32px 64px rgba(0,0,0,0.65)",
        maxHeight: "90vh", overflowY: "auto",
      }}>

        {/* Progress dots */}
        <div style={{ display: "flex", gap: "6px", marginBottom: "28px", justifyContent: "center", alignItems: "center" }}>
          {STEPS.map((s, i) => (
            <div key={s} style={{
              height: "6px",
              width: i === step ? "20px" : "6px",
              borderRadius: "3px",
              background: i < step ? "#22d3a2" : i === step ? "var(--brand-blue)" : "var(--border)",
              transition: "width 0.3s ease, background 0.3s ease",
              flexShrink: 0,
            }} />
          ))}
        </div>

        {/* Step 0: Profile */}
        {step === 0 && (
          <div>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: "18px", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>Set up your profile</h2>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", margin: "0 0 22px", lineHeight: 1.6 }}>
              A few basics so FINN can build your retirement forecast.
            </p>
            <form onSubmit={handleProfileSave}>
              <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginBottom: "22px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "10px", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "5px", fontFamily: "var(--font-body)" }}>Current Age</label>
                    <input name="current_age" type="number" min="1" max="100" required placeholder="32" style={fieldStyle} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "10px", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "5px", fontFamily: "var(--font-body)" }}>Retire At</label>
                    <input name="target_retirement_age" type="number" min="40" max="85" defaultValue="65" placeholder="65" style={fieldStyle} />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "10px", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "5px", fontFamily: "var(--font-body)" }}>Monthly Net Income</label>
                    <input name="monthly_income" type="number" min="0" step="100" placeholder="e.g. 5000" style={fieldStyle} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "10px", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "5px", fontFamily: "var(--font-body)" }}>Monthly Expenses</label>
                    <input name="monthly_expenses" type="number" min="0" step="100" placeholder="e.g. 3500" style={fieldStyle} />
                  </div>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "10px", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "5px", fontFamily: "var(--font-body)" }}>Risk Tolerance</label>
                  <select name="risk_tolerance" defaultValue="moderate" style={fieldStyle}>
                    <option value="conservative">Conservative — capital preservation first</option>
                    <option value="moderate">Moderate — balanced growth and protection</option>
                    <option value="aggressive">Aggressive — maximize long-term growth</option>
                  </select>
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button type="submit" disabled={profPending} style={{ ...btnPrimaryStyle, flex: 1, padding: "11px 0", fontSize: "13px" }}>
                  {profPending ? "Saving…" : "Continue →"}
                </button>
                <button type="button" onClick={dismiss} style={{ ...btnSecondaryStyle, padding: "11px 14px", fontSize: "12px" }}>Skip</button>
              </div>
            </form>
          </div>
        )}

        {/* Step 1: Income */}
        {step === 1 && (
          <div>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: "18px", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>Add income sources</h2>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", margin: "0 0 18px", lineHeight: 1.6 }}>
              Salary, freelance, dividends — anything you receive regularly.
            </p>
            {wizardIncome.length > 0 && (
              <div style={{ marginBottom: "14px" }}>
                {wizardIncome.map((item, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                    <span style={{ fontSize: "13px", color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>{item.label}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--green)" }}>+{fmt(item.amount)} / {item.frequency === "annual" ? "yr" : "mo"}</span>
                  </div>
                ))}
              </div>
            )}
            <form ref={incomeFormRef} onSubmit={(e) => handleAddCf(e, "income", incomeFormRef as React.RefObject<HTMLFormElement>, setWizardIncome)}
              style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "20px" }}>
              <input name="label" placeholder="Income source (e.g. Salary)" style={fieldStyle} />
              <div style={{ display: "flex", gap: "8px" }}>
                <input name="amount" type="number" min="0" step="0.01" placeholder="Amount" style={{ ...fieldStyle, flex: 1 }} />
                <select name="frequency" defaultValue="monthly" style={{ ...fieldStyle, flex: "0 0 auto", width: "auto" }}>
                  <option value="monthly">Monthly</option>
                  <option value="annual">Annual</option>
                </select>
                <button type="submit" disabled={itemPending} style={{ ...btnPrimaryStyle, whiteSpace: "nowrap" }}>Add</button>
              </div>
            </form>
            <div style={{ display: "flex", gap: "8px" }}>
              <button type="button" onClick={() => setStep(0)} style={{ ...btnSecondaryStyle, padding: "11px 14px" }}>← Back</button>
              <button type="button" onClick={() => setStep(2)} style={{ ...btnPrimaryStyle, flex: 1, padding: "11px 0", fontSize: "13px" }}>Continue →</button>
            </div>
          </div>
        )}

        {/* Step 2: Expenses */}
        {step === 2 && (
          <div>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: "18px", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>Add monthly expenses</h2>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", margin: "0 0 18px", lineHeight: 1.6 }}>
              Rent, groceries, subscriptions — your regular outflows.
            </p>
            {wizardExpenses.length > 0 && (
              <div style={{ marginBottom: "14px" }}>
                {wizardExpenses.map((item, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                    <span style={{ fontSize: "13px", color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>{item.label}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--red)" }}>{fmt(item.amount)} / {item.frequency === "annual" ? "yr" : "mo"}</span>
                  </div>
                ))}
              </div>
            )}
            <form ref={expenseFormRef} onSubmit={(e) => handleAddCf(e, "expense", expenseFormRef as React.RefObject<HTMLFormElement>, setWizardExpenses)}
              style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "20px" }}>
              <input name="label" placeholder="Expense (e.g. Rent, Groceries)" style={fieldStyle} />
              <div style={{ display: "flex", gap: "8px" }}>
                <input name="amount" type="number" min="0" step="0.01" placeholder="Amount" style={{ ...fieldStyle, flex: 1 }} />
                <select name="frequency" defaultValue="monthly" style={{ ...fieldStyle, flex: "0 0 auto", width: "auto" }}>
                  <option value="monthly">Monthly</option>
                  <option value="annual">Annual</option>
                </select>
                <button type="submit" disabled={itemPending} style={{ ...btnPrimaryStyle, whiteSpace: "nowrap" }}>Add</button>
              </div>
            </form>
            <div style={{ display: "flex", gap: "8px" }}>
              <button type="button" onClick={() => setStep(1)} style={{ ...btnSecondaryStyle, padding: "11px 14px" }}>← Back</button>
              <button type="button" onClick={() => setStep(3)} style={{ ...btnPrimaryStyle, flex: 1, padding: "11px 0", fontSize: "13px" }}>Continue →</button>
            </div>
          </div>
        )}

        {/* Step 3: Assets & Debts */}
        {step === 3 && (
          <div>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: "18px", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>Assets & debts</h2>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", margin: "0 0 18px", lineHeight: 1.6 }}>
              Savings, property, loans — your balance sheet snapshot.
            </p>
            {wizardAssets.length > 0 && (
              <div style={{ marginBottom: "14px" }}>
                {wizardAssets.map((item, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                    <span style={{ fontSize: "13px", color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>{item.label}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: item.kind === "debt" ? "var(--red)" : "var(--green)" }}>
                      {item.kind === "debt" ? "−" : "+"}{fmt(item.value)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "20px" }}>
              <div>
                <div style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--green)", marginBottom: "8px", fontFamily: "var(--font-body)" }}>Asset</div>
                <form ref={assetFormRef} onSubmit={(e) => handleAddBalance(e, "asset", assetFormRef as React.RefObject<HTMLFormElement>)}
                  style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <input name="label" placeholder="e.g. Savings account" style={fieldStyle} />
                  <select name="category" defaultValue="cash" style={fieldStyle}>
                    <option value="cash">Cash / Savings</option>
                    <option value="investment">Investment</option>
                    <option value="real_asset">Real Estate</option>
                    <option value="other_asset">Other</option>
                  </select>
                  <input name="value" type="number" min="0" step="0.01" placeholder="Value ($)" style={fieldStyle} />
                  <button type="submit" disabled={itemPending} style={{ ...btnPrimaryStyle, fontSize: "11px", padding: "7px 0" }}>Add Asset</button>
                </form>
              </div>
              <div>
                <div style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--red)", marginBottom: "8px", fontFamily: "var(--font-body)" }}>Debt</div>
                <form ref={debtFormRef} onSubmit={(e) => handleAddBalance(e, "debt", debtFormRef as React.RefObject<HTMLFormElement>)}
                  style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <input name="label" placeholder="e.g. Student loan" style={fieldStyle} />
                  <input name="value" type="number" min="0" step="0.01" placeholder="Balance owed ($)" style={fieldStyle} />
                  <button type="submit" disabled={itemPending} style={{ ...btnSecondaryStyle, fontSize: "11px", padding: "7px 0", borderColor: "rgba(239,68,68,0.4)", color: "var(--red)" }}>Add Debt</button>
                </form>
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button type="button" onClick={() => setStep(2)} style={{ ...btnSecondaryStyle, padding: "11px 14px" }}>← Back</button>
              <button type="button" onClick={() => setStep(4)} style={{ ...btnPrimaryStyle, flex: 1, padding: "11px 0", fontSize: "13px" }}>Continue →</button>
            </div>
          </div>
        )}

        {/* Step 4: Ready */}
        {step === 4 && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "42px", marginBottom: "14px" }}>🎯</div>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: "20px", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 8px" }}>You{"'"}re set up</h2>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", margin: "0 0 22px", lineHeight: 1.7 }}>
              {totalAdded > 0
                ? `${totalAdded} item${totalAdded !== 1 ? "s" : ""} added. FINN has everything it needs to build your forecast and start analyzing your picture.`
                : "FINN is ready. Add your financial details from the tabs below to unlock the full forecast."}
            </p>
            {totalAdded > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", justifyContent: "center", marginBottom: "24px" }}>
                {wizardIncome.length > 0 && <span style={{ padding: "4px 10px", borderRadius: "20px", background: "rgba(0,211,149,0.1)", border: "1px solid rgba(0,211,149,0.2)", fontSize: "11px", color: "var(--green)", fontFamily: "var(--font-body)" }}>{wizardIncome.length} income source{wizardIncome.length !== 1 ? "s" : ""}</span>}
                {wizardExpenses.length > 0 && <span style={{ padding: "4px 10px", borderRadius: "20px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.18)", fontSize: "11px", color: "var(--red)", fontFamily: "var(--font-body)" }}>{wizardExpenses.length} expense{wizardExpenses.length !== 1 ? "s" : ""}</span>}
                {wizardAssets.filter((a) => a.kind === "asset").length > 0 && <span style={{ padding: "4px 10px", borderRadius: "20px", background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.2)", fontSize: "11px", color: "var(--violet)", fontFamily: "var(--font-body)" }}>{wizardAssets.filter((a) => a.kind === "asset").length} asset{wizardAssets.filter((a) => a.kind === "asset").length !== 1 ? "s" : ""}</span>}
                {wizardAssets.filter((a) => a.kind === "debt").length > 0 && <span style={{ padding: "4px 10px", borderRadius: "20px", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.18)", fontSize: "11px", color: "var(--amber)", fontFamily: "var(--font-body)" }}>{wizardAssets.filter((a) => a.kind === "debt").length} debt item{wizardAssets.filter((a) => a.kind === "debt").length !== 1 ? "s" : ""}</span>}
              </div>
            )}
            <button type="button" onClick={dismiss} style={{ ...btnPrimaryStyle, padding: "12px 36px", fontSize: "13px", fontWeight: 700 }}>
              Start Planning
            </button>
          </div>
        )}

      </div>
    </div>
  );
}

// ── AI Import Panel ───────────────────────────────────────────────────────────

type AiImportPanelProps = {
  onAdd: (items: ImportedItem[]) => Promise<void>;
};

function AiImportPanel({ onAdd }: AiImportPanelProps) {
  const [open, setOpen] = useState(false);
  const [rawText, setRawText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [preview, setPreview] = useState<(ImportedItem & { selected: boolean })[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [addedCount, setAddedCount] = useState<number | null>(null);

  async function handleParse() {
    if (!rawText.trim()) return;
    setParsing(true);
    setParseError(null);
    setPreview(null);
    setAddedCount(null);
    try {
      const res = await fetch("/api/planning/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: rawText }),
      });
      const data = await res.json() as { items?: ImportedItem[]; error?: string };
      if (!res.ok || data.error) {
        setParseError(data.error ?? "Something went wrong.");
        return;
      }
      if (!data.items || data.items.length === 0) {
        setParseError("No income or expense items could be detected. Try a more detailed description or paste a CSV.");
        return;
      }
      setPreview(data.items.map((item) => ({ ...item, selected: true })));
    } catch {
      setParseError("Network error — please try again.");
    } finally {
      setParsing(false);
    }
  }

  async function handleAdd() {
    if (!preview) return;
    const selected = preview.filter((i) => i.selected);
    if (selected.length === 0) return;
    setAdding(true);
    try {
      await onAdd(selected);
      setAddedCount(selected.length);
      setPreview(null);
      setRawText("");
    } finally {
      setAdding(false);
    }
  }

  function toggleItem(idx: number) {
    setPreview((prev) => prev ? prev.map((item, i) => i === idx ? { ...item, selected: !item.selected } : item) : prev);
  }

  function updateItem(idx: number, field: keyof ImportedItem, value: string | number) {
    setPreview((prev) => prev ? prev.map((item, i) => i === idx ? { ...item, [field]: value } : item) : prev);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => { setOpen(true); setAddedCount(null); }}
        style={{
          display: "flex", alignItems: "center", gap: "6px",
          padding: "7px 14px", borderRadius: "var(--radius-md)",
          border: "1px dashed var(--border-subtle)", background: "transparent",
          color: "var(--text-tertiary)", fontFamily: "var(--font-body)",
          fontSize: "12px", cursor: "pointer", width: "100%", justifyContent: "center",
          transition: "border-color 0.15s, color 0.15s",
        }}
        onMouseEnter={(e) => { const b = e.currentTarget; b.style.color = "var(--text-secondary)"; b.style.borderColor = "var(--text-tertiary)"; }}
        onMouseLeave={(e) => { const b = e.currentTarget; b.style.color = "var(--text-tertiary)"; b.style.borderColor = "var(--border-subtle)"; }}
      >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M8 2v8M5 7l3 3 3-3M2 11v1.5A1.5 1.5 0 003.5 14h9a1.5 1.5 0 001.5-1.5V11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Import with AI — paste a bank statement or describe your finances
      </button>
    );
  }

  const selectedCount = preview ? preview.filter((i) => i.selected).length : 0;

  return (
    <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", padding: "16px 20px", display: "flex", flexDirection: "column", gap: "14px" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>AI Financial Import</span>
          <span style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginLeft: "8px" }}>Powered by FINN</span>
        </div>
        <button type="button" onClick={() => { setOpen(false); setPreview(null); setParseError(null); setAddedCount(null); }}
          style={{ background: "none", border: "none", color: "var(--text-tertiary)", cursor: "pointer", padding: "2px", fontSize: "16px", lineHeight: 1 }}>
          ×
        </button>
      </div>

      {addedCount != null ? (
        <div style={{ textAlign: "center", padding: "12px 0" }}>
          <div style={{ fontSize: "22px", marginBottom: "6px" }}>✓</div>
          <p style={{ fontSize: "13px", color: "var(--green)", fontFamily: "var(--font-body)", margin: 0, fontWeight: 600 }}>
            {addedCount} item{addedCount !== 1 ? "s" : ""} added to Cash Flow
          </p>
          <button type="button" onClick={() => { setAddedCount(null); setOpen(false); }}
            style={{ marginTop: "10px", fontSize: "11px", color: "var(--text-tertiary)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", fontFamily: "var(--font-body)" }}>
            Done
          </button>
        </div>
      ) : preview ? (
        <>
          <p style={{ fontSize: "12px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", margin: 0 }}>
            FINN detected {preview.length} item{preview.length !== 1 ? "s" : ""}. Review and edit before adding.
          </p>

          {/* Preview table */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "460px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <th style={{ padding: "5px 6px", width: "28px" }} />
                  <th style={{ padding: "5px 6px", fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", fontWeight: 600, textAlign: "left", textTransform: "uppercase", letterSpacing: "0.06em" }}>Label</th>
                  <th style={{ padding: "5px 6px", fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", fontWeight: 600, textAlign: "left", textTransform: "uppercase", letterSpacing: "0.06em" }}>Type</th>
                  <th style={{ padding: "5px 6px", fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", fontWeight: 600, textAlign: "right", textTransform: "uppercase", letterSpacing: "0.06em" }}>Amount</th>
                  <th style={{ padding: "5px 6px", fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", fontWeight: 600, textAlign: "left", textTransform: "uppercase", letterSpacing: "0.06em" }}>Frequency</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((item, idx) => (
                  <tr key={idx} style={{ borderBottom: "1px solid var(--border-subtle)", opacity: item.selected ? 1 : 0.4 }}>
                    <td style={{ padding: "5px 6px" }}>
                      <input type="checkbox" checked={item.selected} onChange={() => toggleItem(idx)}
                        style={{ accentColor: "var(--brand-blue)", cursor: "pointer" }} />
                    </td>
                    <td style={{ padding: "5px 6px" }}>
                      <input
                        value={item.label}
                        onChange={(e) => updateItem(idx, "label", e.target.value)}
                        style={{ background: "transparent", border: "1px solid transparent", borderRadius: "4px", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: "12px", padding: "2px 4px", width: "140px", outline: "none" }}
                        onFocus={(e) => (e.currentTarget.style.borderColor = "var(--brand-blue)")}
                        onBlur={(e) => (e.currentTarget.style.borderColor = "transparent")}
                      />
                    </td>
                    <td style={{ padding: "5px 6px" }}>
                      <select value={item.type} onChange={(e) => updateItem(idx, "type", e.target.value)}
                        style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: "4px", color: item.type === "income" ? "var(--green)" : "var(--red)", fontFamily: "var(--font-body)", fontSize: "11px", padding: "2px 4px" }}>
                        <option value="income">Income</option>
                        <option value="expense">Expense</option>
                      </select>
                    </td>
                    <td style={{ padding: "5px 6px", textAlign: "right" }}>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={item.amount}
                        onChange={(e) => updateItem(idx, "amount", Number(e.target.value))}
                        style={{ background: "transparent", border: "1px solid transparent", borderRadius: "4px", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "12px", padding: "2px 4px", width: "80px", textAlign: "right", outline: "none" }}
                        onFocus={(e) => (e.currentTarget.style.borderColor = "var(--brand-blue)")}
                        onBlur={(e) => (e.currentTarget.style.borderColor = "transparent")}
                      />
                    </td>
                    <td style={{ padding: "5px 6px" }}>
                      <select value={item.frequency} onChange={(e) => updateItem(idx, "frequency", e.target.value)}
                        style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: "4px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", fontSize: "11px", padding: "2px 4px" }}>
                        <option value="monthly">Monthly</option>
                        <option value="annual">Annual</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button type="button" onClick={handleAdd} disabled={adding || selectedCount === 0}
              style={{ padding: "7px 16px", borderRadius: "var(--radius-md)", border: "none", background: selectedCount === 0 ? "var(--border-subtle)" : "var(--brand-blue)", color: selectedCount === 0 ? "var(--text-tertiary)" : "#fff", fontFamily: "var(--font-body)", fontSize: "12px", fontWeight: 600, cursor: selectedCount === 0 ? "default" : "pointer" }}>
              {adding ? "Adding…" : `Add ${selectedCount} Item${selectedCount !== 1 ? "s" : ""}`}
            </button>
            <button type="button" onClick={() => { setPreview(null); setParseError(null); }}
              style={{ padding: "7px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", background: "transparent", color: "var(--text-secondary)", fontFamily: "var(--font-body)", fontSize: "12px", cursor: "pointer" }}>
              Back
            </button>
            <span style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginLeft: "auto" }}>
              {selectedCount} of {preview.length} selected
            </span>
          </div>
        </>
      ) : (
        <>
          <p style={{ fontSize: "12px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", margin: 0 }}>
            Paste a bank statement, CSV rows, or describe your income and expenses in plain text. FINN will extract the items for you to review.
          </p>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder={`Examples:\n• Salary $85,000/year, rent $1,800/mo, groceries $400/mo, Netflix $18/mo\n• Or paste raw CSV rows from your bank`}
            rows={6}
            style={{
              width: "100%", boxSizing: "border-box",
              background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-md)", color: "var(--text-primary)",
              fontFamily: "var(--font-body)", fontSize: "12px", padding: "10px 12px",
              resize: "vertical", outline: "none", lineHeight: 1.6,
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--brand-blue)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-subtle)")}
          />
          {parseError && (
            <p style={{ fontSize: "12px", color: "var(--red)", fontFamily: "var(--font-body)", margin: 0 }}>{parseError}</p>
          )}
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button type="button" onClick={handleParse} disabled={parsing || !rawText.trim()}
              style={{ padding: "7px 16px", borderRadius: "var(--radius-md)", border: "none", background: !rawText.trim() || parsing ? "var(--border-subtle)" : "var(--brand-blue)", color: !rawText.trim() || parsing ? "var(--text-tertiary)" : "#fff", fontFamily: "var(--font-body)", fontSize: "12px", fontWeight: 600, cursor: !rawText.trim() || parsing ? "default" : "pointer" }}>
              {parsing ? "Parsing…" : "Parse with FINN"}
            </button>
            <span style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>
              {rawText.length > 0 ? `${rawText.length} chars` : "Max 8,000 characters"}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

// ── Compare Tab ───────────────────────────────────────────────────────────────

type ScenarioCfg = {
  label: string;
  retirementAge: number;
  monthlySavings: number;
  returnRate: number; // percent e.g. 7
};

type CompareTabProps = {
  currentAge: number | null;
  netWorth: number;
  effectiveIncome: number;
  effectiveExpenses: number;
  defaultRetirementAge: number;
  defaultMonthlySavings: number;
  defaultReturnRate: number; // percent
  defaultInflation: number; // percent
  defaultSalaryGrowth: number; // percent
  futureEvents: FutureEvent[];
  currentYear: number;
};

function CompareTab({
  currentAge, netWorth, effectiveIncome, effectiveExpenses,
  defaultRetirementAge, defaultMonthlySavings, defaultReturnRate,
  defaultInflation, defaultSalaryGrowth, futureEvents, currentYear,
}: CompareTabProps) {
  const baseRetire = defaultRetirementAge || 65;

  const [cfgA, setCfgA] = useState<ScenarioCfg>({
    label: "Scenario A",
    retirementAge: baseRetire,
    monthlySavings: defaultMonthlySavings,
    returnRate: defaultReturnRate,
  });
  const [cfgB, setCfgB] = useState<ScenarioCfg>({
    label: "Scenario B",
    retirementAge: Math.min(baseRetire + 5, 75),
    monthlySavings: defaultMonthlySavings,
    returnRate: defaultReturnRate,
  });

  function applyPreset(preset: "early-late" | "save-more" | "bull-bear") {
    if (preset === "early-late") {
      setCfgA((c) => ({ ...c, label: "Early Retirement", retirementAge: Math.max((currentAge ?? 30) + 5, baseRetire - 7) }));
      setCfgB((c) => ({ ...c, label: "Late Retirement", retirementAge: Math.min(baseRetire + 7, 75) }));
    } else if (preset === "save-more") {
      setCfgA((c) => ({ ...c, label: "Save More", monthlySavings: Math.round(defaultMonthlySavings * 1.25) }));
      setCfgB((c) => ({ ...c, label: "Current Pace", monthlySavings: defaultMonthlySavings }));
    } else {
      setCfgA((c) => ({ ...c, label: "Bull Market", returnRate: Math.min(defaultReturnRate + 3, 14) }));
      setCfgB((c) => ({ ...c, label: "Bear Market", returnRate: Math.max(defaultReturnRate - 3, 2) }));
    }
  }

  function scenarioResult(cfg: ScenarioCfg) {
    const age = currentAge ?? 35;
    const yrs = Math.max(1, cfg.retirementAge - age);
    const expensesForCalc = effectiveExpenses - defaultMonthlySavings + cfg.monthlySavings;
    const incomeForCalc = effectiveIncome + (cfg.monthlySavings - defaultMonthlySavings);
    const bands = buildForecastBands(
      netWorth, incomeForCalc, expensesForCalc, yrs,
      cfg.returnRate / 100, defaultInflation / 100, defaultSalaryGrowth / 100,
      futureEvents, currentYear,
    );
    const retPt = bands[bands.length - 1];
    const prob = retPt ? calcRetirementProbability(retPt.baseline, retPt.annualExpenses) : null;
    const target = retPt ? retPt.annualExpenses * 25 : 0;
    const sr = incomeForCalc > 0 ? ((cfg.monthlySavings / incomeForCalc) * 100) : 0;
    return { bands, retPt, prob, target, yrs, sr };
  }

  const resA = useMemo(() => scenarioResult(cfgA),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cfgA, currentAge, netWorth, effectiveIncome, effectiveExpenses,
     defaultInflation, defaultSalaryGrowth, futureEvents, currentYear]);

  const resB = useMemo(() => scenarioResult(cfgB),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cfgB, currentAge, netWorth, effectiveIncome, effectiveExpenses,
     defaultInflation, defaultSalaryGrowth, futureEvents, currentYear]);

  // Build combined chart — pad shorter series with nulls
  const combinedChart = useMemo(() => {
    const maxLen = Math.max(resA.bands.length, resB.bands.length);
    return Array.from({ length: maxLen }, (_, i) => ({
      label: (resA.bands[i] ?? resB.bands[i]).label,
      a: resA.bands[i]?.baseline ?? null,
      b: resB.bands[i]?.baseline ?? null,
    }));
  }, [resA.bands, resB.bands]);

  const BLUE = "#2563eb";
  const VIOLET = "#7c3aed";

  function delta(a: number | null, b: number | null) {
    if (a == null || b == null) return null;
    return b - a;
  }

  function DeltaCell({ d, fmt: fmtFn = (n: number) => fmt(n) }: { d: number | null; fmt?: (n: number) => string }) {
    if (d == null) return <td style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-tertiary)", padding: "6px 10px", textAlign: "right" }}>—</td>;
    const color = d > 0 ? "var(--green)" : d < 0 ? "var(--red)" : "var(--text-tertiary)";
    return (
      <td style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color, padding: "6px 10px", textAlign: "right", fontWeight: 600 }}>
        {d > 0 ? "+" : ""}{fmtFn(d)}
      </td>
    );
  }

  function ScenarioPanel({ cfg, setCfg, color, result }: {
    cfg: ScenarioCfg;
    setCfg: React.Dispatch<React.SetStateAction<ScenarioCfg>>;
    color: string;
    result: ReturnType<typeof scenarioResult>;
  }) {
    const minAge = (currentAge ?? 25) + 2;
    const savingsMin = 0;
    const savingsMax = Math.max(Math.round(effectiveIncome * 0.8), defaultMonthlySavings + 2000);
    const savingsStep = 100;

    return (
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "14px" }}>
        {/* Label */}
        <input
          value={cfg.label}
          onChange={(e) => setCfg((c) => ({ ...c, label: e.target.value }))}
          style={{
            background: "transparent", border: "none", borderBottom: `2px solid ${color}`,
            color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: "14px",
            fontWeight: 600, padding: "2px 0", outline: "none", width: "100%",
          }}
        />

        {/* Outcome badges */}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <div style={{ background: `${color}18`, border: `1px solid ${color}40`, borderRadius: "8px", padding: "6px 12px", textAlign: "center" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 700, color }}>
              {result.retPt ? fmt(result.retPt.baseline) : "—"}
            </div>
            <div style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginTop: "2px" }}>at retirement</div>
          </div>
          <div style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: "8px", padding: "6px 12px", textAlign: "center" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 700, color: result.prob != null && result.prob >= 70 ? "var(--green)" : "var(--amber)" }}>
              {result.prob != null ? `${result.prob}%` : "—"}
            </div>
            <div style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginTop: "2px" }}>retire prob.</div>
          </div>
          <div style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: "8px", padding: "6px 12px", textAlign: "center" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>
              {result.sr.toFixed(0)}%
            </div>
            <div style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", marginTop: "2px" }}>savings rate</div>
          </div>
        </div>

        {/* Sliders */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
              <span style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>Retire at</span>
              <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color, fontWeight: 600 }}>{cfg.retirementAge}</span>
            </div>
            <input type="range" min={minAge} max={80} step={1} value={cfg.retirementAge}
              onChange={(e) => setCfg((c) => ({ ...c, retirementAge: Number(e.target.value) }))}
              style={{ width: "100%", accentColor: color }} />
          </div>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
              <span style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>Monthly savings</span>
              <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color, fontWeight: 600 }}>{fmt(cfg.monthlySavings)}</span>
            </div>
            <input type="range" min={savingsMin} max={savingsMax} step={savingsStep} value={cfg.monthlySavings}
              onChange={(e) => setCfg((c) => ({ ...c, monthlySavings: Number(e.target.value) }))}
              style={{ width: "100%", accentColor: color }} />
          </div>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
              <span style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>Return rate</span>
              <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color, fontWeight: 600 }}>{cfg.returnRate.toFixed(1)}%</span>
            </div>
            <input type="range" min={2} max={14} step={0.5} value={cfg.returnRate}
              onChange={(e) => setCfg((c) => ({ ...c, returnRate: Number(e.target.value) }))}
              style={{ width: "100%", accentColor: color }} />
          </div>
        </div>
      </div>
    );
  }

  const compareRows: { label: string; a: string; b: string; rawA: number | null; rawB: number | null; fmtFn?: (n: number) => string }[] = [
    {
      label: "Retirement Age", rawA: cfgA.retirementAge, rawB: cfgB.retirementAge,
      a: String(cfgA.retirementAge), b: String(cfgB.retirementAge),
      fmtFn: (n) => (n > 0 ? `+${n} yrs` : `${n} yrs`),
    },
    {
      label: "Years to Retire", rawA: resA.yrs, rawB: resB.yrs,
      a: `${resA.yrs} yrs`, b: `${resB.yrs} yrs`,
      fmtFn: (n) => (n > 0 ? `+${n} yrs` : `${n} yrs`),
    },
    {
      label: "Monthly Savings", rawA: cfgA.monthlySavings, rawB: cfgB.monthlySavings,
      a: fmt(cfgA.monthlySavings), b: fmt(cfgB.monthlySavings),
    },
    {
      label: "Savings Rate", rawA: resA.sr, rawB: resB.sr,
      a: `${resA.sr.toFixed(0)}%`, b: `${resB.sr.toFixed(0)}%`,
      fmtFn: (n) => `${n > 0 ? "+" : ""}${n.toFixed(0)}pp`,
    },
    {
      label: "Return Rate", rawA: cfgA.returnRate, rawB: cfgB.returnRate,
      a: `${cfgA.returnRate.toFixed(1)}%`, b: `${cfgB.returnRate.toFixed(1)}%`,
      fmtFn: (n) => `${n > 0 ? "+" : ""}${n.toFixed(1)}pp`,
    },
    {
      label: "Projected at Retirement", rawA: resA.retPt?.baseline ?? null, rawB: resB.retPt?.baseline ?? null,
      a: resA.retPt ? fmt(resA.retPt.baseline) : "—", b: resB.retPt ? fmt(resB.retPt.baseline) : "—",
    },
    {
      label: "Retirement Target (25×)", rawA: resA.target, rawB: resB.target,
      a: fmt(resA.target), b: fmt(resB.target),
    },
    {
      label: "Retirement Probability", rawA: resA.prob, rawB: resB.prob,
      a: resA.prob != null ? `${resA.prob}%` : "—", b: resB.prob != null ? `${resB.prob}%` : "—",
      fmtFn: (n) => `${n > 0 ? "+" : ""}${n.toFixed(0)}pp`,
    },
  ];

  const thStyle: React.CSSProperties = { padding: "6px 10px", fontSize: "10px", fontFamily: "var(--font-body)", color: "var(--text-tertiary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "right" };
  const tdLabelStyle: React.CSSProperties = { padding: "7px 10px", fontSize: "12px", fontFamily: "var(--font-body)", color: "var(--text-secondary)" };
  const tdValStyle: React.CSSProperties = { padding: "7px 10px", fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--text-primary)", textAlign: "right", fontWeight: 500 };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

      {/* Quick preset chips */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", alignSelf: "center", marginRight: "4px" }}>Quick compare:</span>
        {([
          ["early-late", "Early vs. Late Retirement"],
          ["save-more", "Save More vs. Current"],
          ["bull-bear", "Bull vs. Bear Market"],
        ] as [string, string][]).map(([key, lbl]) => (
          <button key={key} onClick={() => applyPreset(key as Parameters<typeof applyPreset>[0])}
            style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: "20px", padding: "4px 12px", fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", cursor: "pointer" }}>
            {lbl}
          </button>
        ))}
      </div>

      {/* Two panels */}
      <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
        <ScenarioPanel cfg={cfgA} setCfg={setCfgA} color={BLUE} result={resA} />
        <div style={{ width: "1px", background: "var(--border-subtle)", alignSelf: "stretch", flexShrink: 0 }} />
        <ScenarioPanel cfg={cfgB} setCfg={setCfgB} color={VIOLET} result={resB} />
      </div>

      {/* Combined trajectory chart */}
      <div style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: "12px", padding: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "12px" }}>
          <span style={{ fontSize: "12px", fontFamily: "var(--font-body)", fontWeight: 600, color: "var(--text-primary)" }}>Net Worth Trajectory</span>
          <div style={{ display: "flex", gap: "12px", marginLeft: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <div style={{ width: "12px", height: "3px", background: BLUE, borderRadius: "2px" }} />
              <span style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>{cfgA.label}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <div style={{ width: "12px", height: "3px", background: VIOLET, borderRadius: "2px" }} />
              <span style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>{cfgB.label}</span>
            </div>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={combinedChart} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="cmpGradA" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={BLUE} stopOpacity={0.25} />
                <stop offset="95%" stopColor={BLUE} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="cmpGradB" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={VIOLET} stopOpacity={0.2} />
                <stop offset="95%" stopColor={VIOLET} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
            <XAxis dataKey="label" tick={{ fontSize: 9, fill: "var(--text-tertiary)" }} interval="preserveStartEnd" />
            <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 9, fill: "var(--text-tertiary)" }} width={52} />
            <Tooltip
              contentStyle={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: "8px", fontSize: "11px" }}
              formatter={(value, name) => [typeof value === "number" ? fmt(value) : String(value), name === "a" ? cfgA.label : cfgB.label]}
            />
            <Area type="monotone" dataKey="a" stroke={BLUE} strokeWidth={2} fill="url(#cmpGradA)" dot={false} connectNulls />
            <Area type="monotone" dataKey="b" stroke={VIOLET} strokeWidth={2} fill="url(#cmpGradB)" dot={false} connectNulls />
            {resA.yrs > 0 && resA.bands.length > 0 && (
              <ReferenceLine x={resA.bands[resA.bands.length - 1]?.label} stroke={BLUE} strokeDasharray="4 2" strokeOpacity={0.6} />
            )}
            {resB.yrs > 0 && resB.bands.length > 0 && (
              <ReferenceLine x={resB.bands[resB.bands.length - 1]?.label} stroke={VIOLET} strokeDasharray="4 2" strokeOpacity={0.6} />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Head-to-head table */}
      <div style={{ background: "var(--card-bg)", border: "1px solid var(--border-subtle)", borderRadius: "12px", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <th style={{ ...thStyle, textAlign: "left" }}>Metric</th>
              <th style={{ ...thStyle, color: BLUE }}>{cfgA.label}</th>
              <th style={{ ...thStyle, color: VIOLET }}>{cfgB.label}</th>
              <th style={{ ...thStyle }}>Δ B−A</th>
            </tr>
          </thead>
          <tbody>
            {compareRows.map((row, i) => (
              <tr key={row.label} style={{ borderBottom: i < compareRows.length - 1 ? "1px solid var(--border-subtle)" : "none" }}>
                <td style={tdLabelStyle}>{row.label}</td>
                <td style={{ ...tdValStyle, color: BLUE }}>{row.a}</td>
                <td style={{ ...tdValStyle, color: VIOLET }}>{row.b}</td>
                <DeltaCell d={delta(row.rawA, row.rawB)} fmt={row.fmtFn} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type Props = {
  profile: FinancialProfile | null;
  balanceItems: BalanceSheetItem[];
  cashFlowItems: CashFlowItem[];
  netWorthHistory: NetWorthSnapshot[];
  portfolioTotalValue: number;
  assumptions: PlanningAssumptions | null;
  futureEvents: FutureEvent[];
};

type Tab = "overview" | "balance" | "cashflow" | "forecast" | "compare" | "events" | "finn";
type FinnChatEntry = { role: "user" | "finn"; text: string };

export default function PlanningClient({
  profile, balanceItems, cashFlowItems, netWorthHistory, portfolioTotalValue,
  assumptions, futureEvents,
}: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  const [profilePending, startProfileTransition] = useTransition();
  const [editingProfile, setEditingProfile] = useState(!profile);
  const [finnCommentary, setFinnCommentary] = useState<string | null>(null);
  const [finnLoading, setFinnLoading] = useState(false);
  const snapshotSaved = useRef(false);
  const [showWizard, setShowWizard] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    () => new Set(EXPENSE_CATEGORIES.map((c) => c.label))
  );

  // Assumptions local state — updates chart in real-time before saving
  const [localAssumptions, setLocalAssumptions] = useState({
    return_rate: (assumptions?.return_rate ?? 0.07) * 100,
    inflation_rate: (assumptions?.inflation_rate ?? 0.03) * 100,
    salary_growth_rate: (assumptions?.salary_growth_rate ?? 0.02) * 100,
  });
  const [assumptionsPending, startAssumptionsTransition] = useTransition();

  // Future events
  const [addingEvent, setAddingEvent] = useState(false);
  const [eventPending, startEventTransition] = useTransition();
  const eventFormRef = useRef<HTMLFormElement>(null);

  // FINN chat
  const [finnChatMessages, setFinnChatMessages] = useState<FinnChatEntry[]>([]);
  const [finnChatInput, setFinnChatInput] = useState("");
  const [finnChatLoading, setFinnChatLoading] = useState(false);
  const [finnChatAnimatingIdx, setFinnChatAnimatingIdx] = useState<number | null>(null);
  const [finnChatAnimatedText, setFinnChatAnimatedText] = useState("");
  const finnChatInitialized = useRef(false);
  const finnChatScrollRef = useRef<HTMLDivElement>(null);
  const finnChatAnimationRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Forecast scenarios
  const [scenarioRetirementAge, setScenarioRetirementAge] = useState<number | null>(
    profile?.target_retirement_age ?? null
  );
  const [showMonteCarlo, setShowMonteCarlo] = useState(false);

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

  useEffect(() => {
    const dismissed = localStorage.getItem("buytune_planning_wizard_dismissed");
    if (!dismissed && profile?.current_age == null) {
      setShowWizard(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        return_rate_pct: localAssumptions.return_rate,
        inflation_rate_pct: localAssumptions.inflation_rate,
        retirement_probability: retirementProb,
        projected_nw_at_retirement: retirementPoint?.baseline ?? null,
        future_events_count: futureEvents.length,
      };
      const res = await fetch("/api/planning/finn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ctx),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        const msg = res.status === 429
          ? "FINN is temporarily rate-limited. Try again in a moment."
          : "FINN is temporarily unavailable. Please try again.";
        setFinnCommentary(msg);
        return;
      }
      setFinnCommentary(data.commentary ?? null);
    } catch {
      setFinnCommentary("Unable to load FINN commentary at this time.");
    } finally {
      setFinnLoading(false);
    }
  }

  // ── Forecast data ──────────────────────────────────────────────────────────

  const currentYear = new Date().getFullYear();

  // Active retirement target — scenario overrides profile
  const activeRetirementAge = scenarioRetirementAge ?? profile?.target_retirement_age ?? null;
  const activeYearsToRetire = (activeRetirementAge != null && profile?.current_age != null)
    ? Math.max(0, activeRetirementAge - profile.current_age)
    : yearsToRetire;

  const forecastYears = Math.min(activeYearsToRetire ?? 30, 40);

  const forecastBands = buildForecastBands(
    netWorth, effectiveIncome, effectiveExpenses,
    forecastYears,
    localAssumptions.return_rate / 100,
    localAssumptions.inflation_rate / 100,
    localAssumptions.salary_growth_rate / 100,
    futureEvents, currentYear,
  );

  const retirementPoint = activeYearsToRetire != null
    ? forecastBands[Math.min(activeYearsToRetire, forecastBands.length - 1)]
    : forecastBands[forecastBands.length - 1];
  const retirementProb = retirementPoint
    ? calcRetirementProbability(retirementPoint.baseline, retirementPoint.annualExpenses)
    : null;

  // Combine historical + deterministic forecast for chart
  const historyForChart = netWorthHistory.map((s) => ({
    label: s.snapshot_date,
    historical: s.net_worth,
    optimistic: null as number | null,
    baseline: null as number | null,
    pessimistic: null as number | null,
  }));
  const forecastForChart = forecastBands.map((p) => ({
    label: p.label,
    historical: null as number | null,
    optimistic: p.optimistic,
    baseline: p.baseline,
    pessimistic: p.pessimistic,
  }));
  const chartData = [...historyForChart, ...forecastForChart];

  // Key milestone rows for year-by-year table
  const tableRows = forecastBands.filter((p) =>
    forecastBands.length <= 12 || p.year % 5 === 0 || p.year === activeYearsToRetire
  );

  // Monte Carlo — only computed when toggle is on
  const retirementTarget = retirementPoint ? retirementPoint.annualExpenses * 25 : null;
  const mcResult = useMemo(() => {
    if (!showMonteCarlo) return null;
    return runMonteCarlo(
      netWorth, effectiveIncome, effectiveExpenses,
      forecastYears,
      localAssumptions.return_rate / 100,
      localAssumptions.inflation_rate / 100,
      localAssumptions.salary_growth_rate / 100,
      futureEvents, currentYear,
      activeYearsToRetire,
      retirementTarget,
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMonteCarlo, netWorth, effectiveIncome, effectiveExpenses, forecastYears,
      localAssumptions.return_rate, localAssumptions.inflation_rate, localAssumptions.salary_growth_rate,
      futureEvents, currentYear, activeYearsToRetire, retirementTarget]);

  const mcChartData = useMemo(() => {
    if (!mcResult) return null;
    const histPart = netWorthHistory.map((s) => ({
      label: s.snapshot_date,
      historical: s.net_worth,
      p10: null as number | null, p25: null as number | null, p50: null as number | null,
      p75: null as number | null, p90: null as number | null,
    }));
    const mcPart = mcResult.points.map((p) => ({
      label: p.label,
      historical: null as number | null,
      p10: p.p10, p25: p.p25, p50: p.p50, p75: p.p75, p90: p.p90,
    }));
    return [...histPart, ...mcPart];
  }, [mcResult, netWorthHistory]);

  // ── XLSX Export ───────────────────────────────────────────────────────────
  function exportForecastXLSX() {
    const wb = XLSX.utils.book_new();

    // Sheet 1 — Year-by-year forecast
    const forecastRows = forecastBands.map((p) => ({
      Year: p.label,
      "Pessimistic ($)": Math.round(p.pessimistic),
      "Baseline ($)": Math.round(p.baseline),
      "Optimistic ($)": Math.round(p.optimistic),
      "Annual Expenses ($)": Math.round(p.annualExpenses),
      "Is Retirement Year": activeYearsToRetire != null && p.year === activeYearsToRetire ? "Yes" : "",
    }));
    const wsForecas = XLSX.utils.json_to_sheet(forecastRows);
    wsForecas["!cols"] = [{ wch: 14 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 20 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, wsForecas, "Forecast");

    // Sheet 2 — Summary
    const today = new Date().toLocaleDateString("en-US");
    const summaryRows = [
      { Field: "Export Date", Value: today },
      { Field: "Current Age", Value: profile?.current_age ?? "—" },
      { Field: "Target Retirement Age", Value: activeRetirementAge ?? "—" },
      { Field: "Net Worth ($)", Value: Math.round(netWorth) },
      { Field: "Monthly Income ($)", Value: Math.round(effectiveIncome) },
      { Field: "Monthly Expenses ($)", Value: Math.round(effectiveExpenses) },
      { Field: "Monthly Savings ($)", Value: Math.round(monthlySavings) },
      { Field: "Savings Rate (%)", Value: savingsRate.toFixed(1) },
      { Field: "Return Rate Assumption (%)", Value: localAssumptions.return_rate.toFixed(1) },
      { Field: "Inflation Rate Assumption (%)", Value: localAssumptions.inflation_rate.toFixed(1) },
      { Field: "Salary Growth Assumption (%)", Value: localAssumptions.salary_growth_rate.toFixed(1) },
      { Field: "Projected NW at Retirement ($)", Value: retirementPoint ? Math.round(retirementPoint.baseline) : "—" },
      { Field: "Retirement Probability (%)", Value: retirementProb ?? "—" },
      { Field: "Financial Health Score", Value: healthData.total },
    ];
    const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
    wsSummary["!cols"] = [{ wch: 32 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

    // Sheet 3 — Balance Sheet
    if (balanceItems.length > 0) {
      const bsRows = balanceItems.map((i) => ({
        Label: i.label,
        Category: i.category,
        Type: i.is_liability ? "Liability" : "Asset",
        "Value ($)": Math.round(i.value),
      }));
      const wsBs = XLSX.utils.json_to_sheet(bsRows);
      wsBs["!cols"] = [{ wch: 28 }, { wch: 16 }, { wch: 10 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, wsBs, "Balance Sheet");
    }

    // Sheet 4 — Cash Flow
    if (cashFlowItems.length > 0) {
      const cfRows = cashFlowItems.map((i) => ({
        Label: i.label,
        Type: i.type,
        Frequency: i.frequency,
        "Amount ($)": Math.round(i.amount),
        "Monthly Equiv ($)": Math.round(toMonthly(i.amount, i.frequency)),
      }));
      const wsCf = XLSX.utils.json_to_sheet(cfRows);
      wsCf["!cols"] = [{ wch: 28 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, wsCf, "Cash Flow");
    }

    XLSX.writeFile(wb, `buytune-forecast-${currentYear}.xlsx`);
  }

  // Sensitivity grid — return rate × retirement age matrix
  const sensitivityGrid = useMemo(() => {
    if (!profile?.current_age) return null;
    const returnRates = [4, 5, 6, 7, 8, 9, 10];
    const baseRetire = activeRetirementAge ?? (profile.current_age + 30);
    const retirementAges = [-10, -5, 0, 5, 10]
      .map((d) => baseRetire + d)
      .filter((a) => a > profile.current_age! + 1 && a <= 80 && a > profile.current_age!);
    if (retirementAges.length === 0) return null;

    const cells = retirementAges.map((retAge) => {
      const years = retAge - profile.current_age!;
      return returnRates.map((r) => {
        const bands = buildForecastBands(
          netWorth, effectiveIncome, effectiveExpenses,
          years, r / 100,
          localAssumptions.inflation_rate / 100,
          localAssumptions.salary_growth_rate / 100,
          futureEvents, currentYear,
        );
        const pt = bands[bands.length - 1];
        const target = pt ? pt.annualExpenses * 25 : 0;
        const value = pt?.baseline ?? 0;
        return { value, target, ratio: target > 0 ? value / target : 0 };
      });
    });

    return { returnRates, retirementAges, cells };
  }, [profile?.current_age, activeRetirementAge, netWorth, effectiveIncome, effectiveExpenses,
      localAssumptions.inflation_rate, localAssumptions.salary_growth_rate, futureEvents, currentYear]);

  // Optimization recommendations — deterministic, no AI calls
  const recommendations = useMemo(() => computeOptimizations({
    savingsRate, monthlySavings, effectiveIncome, effectiveExpenses,
    liquidAssets, totalAssets, totalLiabilities, netWorth,
    retirementProb,
    retirementPointBaseline: retirementPoint?.baseline ?? null,
    retirementPointAnnualExpenses: retirementPoint?.annualExpenses ?? null,
    activeRetirementAge, activeYearsToRetire, forecastYears,
    localReturn: localAssumptions.return_rate / 100,
    localInflation: localAssumptions.inflation_rate / 100,
    localSalaryGrowth: localAssumptions.salary_growth_rate / 100,
    futureEvents, currentYear,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [savingsRate, monthlySavings, effectiveIncome, effectiveExpenses,
       liquidAssets, totalAssets, totalLiabilities, netWorth,
       retirementProb, retirementPoint?.baseline, retirementPoint?.annualExpenses,
       activeRetirementAge, activeYearsToRetire, forecastYears,
       localAssumptions.return_rate, localAssumptions.inflation_rate, localAssumptions.salary_growth_rate,
       // eslint-disable-next-line react-hooks/exhaustive-deps
       futureEvents, currentYear]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleProfileSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startProfileTransition(async () => {
      await upsertFinancialProfile(fd);
      setEditingProfile(false);
    });
  }

  // ── FINN Chat ──────────────────────────────────────────────────────────────

  function buildFinnChatContext(): FinnChatContext {
    return {
      current_age: profile?.current_age ?? null,
      target_retirement_age: activeRetirementAge,
      years_to_retire: activeYearsToRetire,
      risk_tolerance: profile?.risk_tolerance ?? null,
      net_worth: netWorth,
      total_assets: totalAssets,
      total_liabilities: totalLiabilities,
      portfolio_value: portfolioTotalValue,
      liquid_assets: liquidAssets,
      monthly_net_income: effectiveIncome,
      monthly_expenses: effectiveExpenses,
      monthly_savings: monthlySavings,
      savings_rate_pct: savingsRate,
      asset_items: assets.map((a) => ({ label: a.label, category: a.category, value: a.value })),
      liability_items: liabilities.map((l) => ({ label: l.label, value: l.value })),
      income_items: cashFlowItems.filter((i) => i.type === "income").map((i) => ({ label: i.label, amount: i.amount, frequency: i.frequency })),
      expense_items: cashFlowItems.filter((i) => i.type === "expense").map((i) => ({ label: i.label, amount: i.amount, frequency: i.frequency })),
      return_rate_pct: localAssumptions.return_rate,
      inflation_rate_pct: localAssumptions.inflation_rate,
      salary_growth_rate_pct: localAssumptions.salary_growth_rate,
      projected_nw_at_retirement: retirementPoint?.baseline ?? null,
      retirement_probability: mcResult?.mcRetirementProbability ?? retirementProb,
      financial_health_score: healthData.total,
      health_factors: healthData.factors,
      future_events: futureEvents.map((e) => ({ label: e.label, event_year: e.event_year, amount_impact: e.amount_impact, category: e.category })),
    };
  }

  async function sendFinnChatMessage(text: string, isInit = false) {
    if (!text.trim() && !isInit) return;

    const userEntry: FinnChatEntry = { role: "user", text };
    const updatedEntries = isInit ? [] : [...finnChatMessages, userEntry];
    if (!isInit) setFinnChatMessages(updatedEntries);
    setFinnChatInput("");
    setFinnChatLoading(true);

    const messages: FinnChatMessage[] = [
      ...updatedEntries
        .filter((m) => m.role === "user" || m.role === "finn")
        .map((m) => ({
          role: (m.role === "finn" ? "assistant" : "user") as "user" | "assistant",
          content: m.text,
        })),
      {
        role: "user" as const,
        content: isInit
          ? "Introduce yourself briefly as FINN, then immediately analyze my financial situation. Lead with the single most important alert or insight — cite my actual numbers. Give 2–3 additional specific insights. End by suggesting 2 questions I could ask you."
          : text,
      },
    ];

    try {
      const res = await fetch("/api/planning/finn/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, context: buildFinnChatContext() }),
      });
      const data = await res.json();
      const response: string = data.response ?? data.error ?? "Unable to respond right now. Please try again.";

      const newEntries: FinnChatEntry[] = [...updatedEntries, { role: "finn", text: response }];
      setFinnChatMessages(newEntries);

      const newIdx = newEntries.length - 1;
      setFinnChatAnimatingIdx(newIdx);
      setFinnChatAnimatedText("");
      let i = 0;
      const speed = Math.max(8, Math.min(22, 2400 / response.length));
      finnChatAnimationRef.current = setInterval(() => {
        i++;
        if (i >= response.length) {
          clearInterval(finnChatAnimationRef.current!);
          setFinnChatAnimatingIdx(null);
          setFinnChatAnimatedText("");
        } else {
          setFinnChatAnimatedText(response.slice(0, i));
        }
      }, speed);
    } catch {
      setFinnChatMessages((prev) => [...prev, { role: "finn", text: "Something went wrong. Please try again." }]);
    } finally {
      setFinnChatLoading(false);
    }
  }

  useEffect(() => {
    if (tab !== "finn") return;
    if (finnChatInitialized.current) return;
    finnChatInitialized.current = true;
    sendFinnChatMessage("", true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    finnChatScrollRef.current?.scrollTo({ top: finnChatScrollRef.current.scrollHeight, behavior: "smooth" });
  }, [finnChatMessages, finnChatAnimatedText]);

  useEffect(() => {
    return () => { if (finnChatAnimationRef.current) clearInterval(finnChatAnimationRef.current); };
  }, []);

  const TABS: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "balance", label: "Balance Sheet" },
    { id: "cashflow", label: "Cash Flow" },
    { id: "forecast", label: "Forecast" },
    { id: "compare", label: "Compare" },
    { id: "events", label: "Future Events" },
    { id: "finn", label: "Ask FINN" },
  ];

  function saveAssumptions() {
    const fd = new FormData();
    fd.set("return_rate", String(localAssumptions.return_rate));
    fd.set("inflation_rate", String(localAssumptions.inflation_rate));
    fd.set("salary_growth_rate", String(localAssumptions.salary_growth_rate));
    startAssumptionsTransition(async () => {
      await upsertPlanningAssumptions(fd);
    });
  }

  function handleAddEvent(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startEventTransition(async () => {
      await addFutureEvent(fd);
      eventFormRef.current?.reset();
      setAddingEvent(false);
    });
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: "24px", maxWidth: "900px" }}>

      {showWizard && <OnboardingWizard onClose={() => setShowWizard(false)} />}

      {/* Page header */}
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "22px", color: "var(--text-primary)", margin: 0 }}>
          Financial Planning
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "13px", marginTop: "4px", fontFamily: "var(--font-body)" }}>
          Net worth, cash flow, and retirement trajectory.
        </p>
      </div>

      {/* Net Worth History Chart */}
      <NetWorthHistoryCard
        history={netWorthHistory}
        currentNW={netWorth}
        currentAssets={totalAssets}
        currentLiabilities={totalLiabilities}
      />

      {/* Supporting metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px", marginBottom: "20px" }}>
        <MetricCard
          label="Monthly Savings"
          value={monthlySavings >= 0 ? fmt(monthlySavings) : "−" + fmt(Math.abs(monthlySavings))}
          sub={effectiveIncome > 0 ? `${fmtPct(savingsRate)} savings rate` : undefined}
          color={monthlySavings >= 0 ? "var(--text-primary)" : "var(--red)"}
        />
        <MetricCard
          label="Monthly Income"
          value={fmt(effectiveIncome)}
          sub="net, after taxes"
        />
        <MetricCard
          label="Monthly Expenses"
          value={fmt(effectiveExpenses)}
          color="var(--text-primary)"
        />
        {retirementProb != null && (
          <MetricCard
            label="On Track"
            value={`${mcResult?.mcRetirementProbability ?? retirementProb}%`}
            sub={mcResult ? "Monte Carlo" : "4% rule"}
            color={(mcResult?.mcRetirementProbability ?? retirementProb) >= 75 ? "var(--green)" : (mcResult?.mcRetirementProbability ?? retirementProb) >= 50 ? "var(--amber)" : "var(--red)"}
          />
        )}
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
                <InfoTooltip text={getFactorExplainer(f.name, savingsRate, liquidAssets, effectiveExpenses, totalAssets, totalLiabilities, retirementProb)} />
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
                    { name: "monthly_income", label: "Monthly Net Income ($)", type: "number", default: profile?.monthly_income ?? "" },
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

          {/* Opportunities */}
          {recommendations.length > 0 && (
            <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", padding: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                <div>
                  <div style={sectionHeadStyle}>Opportunities</div>
                  <p style={{ fontSize: "12px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", margin: "2px 0 0", lineHeight: 1.4 }}>
                    Highest-leverage changes, ranked by forecast impact
                  </p>
                </div>
                <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--text-tertiary)", fontWeight: 500, flexShrink: 0 }}>
                  {recommendations.length} identified
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {recommendations.map((rec, i) => (
                  <div key={rec.id} style={{
                    display: "flex", gap: "14px", alignItems: "flex-start", padding: "14px",
                    borderRadius: "var(--radius-md)",
                    background: i === 0 ? "rgba(37,99,235,0.05)" : "var(--bg-surface)",
                    border: `1px solid ${i === 0 ? "rgba(37,99,235,0.15)" : "var(--border-subtle)"}`,
                  }}>
                    <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: "3px", paddingTop: "1px" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-tertiary)", fontWeight: 700, letterSpacing: "0.05em" }}>#{i + 1}</span>
                      <span style={{ fontSize: "18px", lineHeight: 1 }}>{rec.icon}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-body)", marginBottom: "3px" }}>
                        {rec.headline}
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", lineHeight: 1.5, marginBottom: "8px" }}>
                        {rec.detail}
                      </div>
                      <div style={{
                        display: "inline-flex", alignItems: "center", gap: "5px", padding: "4px 10px",
                        borderRadius: "var(--radius-md)", fontSize: "11px",
                        fontFamily: "var(--font-mono)", color: "var(--green)", fontWeight: 500,
                        background: "rgba(0,211,149,0.07)", border: "1px solid rgba(0,211,149,0.16)",
                      }}>
                        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden>
                          <path d="M5 9V1M1 5l4-4 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        {rec.impact}
                      </div>
                    </div>
                    <div style={{
                      flexShrink: 0, padding: "3px 9px", borderRadius: "20px", fontSize: "10px",
                      fontWeight: 600, fontFamily: "var(--font-body)", whiteSpace: "nowrap",
                      background: rec.effort === "Low" ? "rgba(0,211,149,0.1)" : rec.effort === "Medium" ? "rgba(245,158,11,0.1)" : "rgba(239,68,68,0.08)",
                      color: rec.effort === "Low" ? "var(--green)" : rec.effort === "Medium" ? "var(--amber)" : "var(--red)",
                      border: `1px solid ${rec.effort === "Low" ? "rgba(0,211,149,0.2)" : rec.effort === "Medium" ? "rgba(245,158,11,0.2)" : "rgba(239,68,68,0.18)"}`,
                    }}>
                      {rec.effort} effort
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
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
              <span style={sectionHeadStyle}>Income <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, fontSize: "10px", color: "var(--text-muted)" }}>(net, after taxes)</span></span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", color: "var(--green)", fontWeight: 500 }}>{fmt(monthlyIncome)} / mo</span>
            </div>
            {cashFlowItems.filter((i) => i.type === "income").map((item) => (
              <LineItemRow key={item.id} item={item} type="cashflow" onDelete={deleteCashFlowItem} />
            ))}
            <div style={{ marginTop: "10px" }}>
              <AddItemRow type="cashflow" placeholder="e.g. Salary" onAdd={(fd) => { fd.set("type", "income"); return addCashFlowItem(fd); }} />
            </div>
          </div>

          {/* Expenses — grouped by category */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <span style={sectionHeadStyle}>Expenses</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", color: "var(--red)", fontWeight: 500 }}>{fmt(monthlyExpenses)} / mo</span>
            </div>

            {cashFlowItems.filter((i) => i.type === "expense").length === 0 ? (
              <p style={{ fontSize: "12px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", margin: "0 0 10px" }}>
                No expenses added yet. Add one below — FINN auto-groups them by category.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "10px" }}>
                {EXPENSE_CATEGORIES.map((cat) => {
                  const items = cashFlowItems.filter(
                    (i) => i.type === "expense" && getCategoryForExpense(i.label) === cat.label
                  );
                  if (items.length === 0) return null;
                  const catTotal = items.reduce((s, i) => s + toMonthly(i.amount, i.frequency), 0);
                  const isExpanded = expandedCategories.has(cat.label);
                  return (
                    <div key={cat.label} style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
                      <button
                        type="button"
                        onClick={() => setExpandedCategories((prev) => {
                          const next = new Set(prev);
                          if (next.has(cat.label)) next.delete(cat.label); else next.add(cat.label);
                          return next;
                        })}
                        style={{
                          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "9px 12px", background: "var(--bg-surface)", border: "none",
                          cursor: "pointer", textAlign: "left",
                        }}
                      >
                        <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontSize: "14px", lineHeight: 1 }}>{cat.emoji}</span>
                          <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>{cat.label}</span>
                          <span style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>({items.length})</span>
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--red)" }}>{fmt(catTotal)}/mo</span>
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 0.2s", color: "var(--text-tertiary)", flexShrink: 0 }}>
                            <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </span>
                      </button>
                      {isExpanded && (
                        <div style={{ padding: "0 12px 10px", background: "var(--card-bg)" }}>
                          {items.map((item) => (
                            <LineItemRow key={item.id} item={item} type="cashflow" onDelete={deleteCashFlowItem} />
                          ))}
                          <div style={{ marginTop: "8px" }}>
                            <AddItemRow
                              type="cashflow"
                              placeholder={`Add ${cat.label.toLowerCase()} expense`}
                              onAdd={(fd) => { fd.set("type", "expense"); return addCashFlowItem(fd); }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <AddItemRow type="cashflow" placeholder="Add expense (auto-categorized by label)" onAdd={(fd) => { fd.set("type", "expense"); return addCashFlowItem(fd); }} />
          </div>

          {/* AI Import */}
          <AiImportPanel onAdd={async (items) => {
            for (const item of items) {
              const fd = new FormData();
              fd.set("label", item.label);
              fd.set("amount", String(item.amount));
              fd.set("frequency", item.frequency);
              fd.set("type", item.type);
              await addCashFlowItem(fd);
            }
          }} />

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

          {/* Scenario + chart mode controls */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" }}>
            {profile?.current_age != null && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "12px", color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>Retire at</span>
                <input
                  type="number"
                  min={profile.current_age + 1}
                  max={85}
                  value={scenarioRetirementAge ?? ""}
                  onChange={(e) => setScenarioRetirementAge(e.target.value ? Number(e.target.value) : null)}
                  style={{ ...inputStyle, minWidth: "unset", width: "68px", padding: "5px 8px", fontSize: "13px" }}
                />
                {scenarioRetirementAge !== (profile?.target_retirement_age ?? null) && (
                  <button
                    type="button"
                    onClick={() => setScenarioRetirementAge(profile?.target_retirement_age ?? null)}
                    style={{ ...btnSecondaryStyle, fontSize: "11px", padding: "4px 8px" }}
                  >Reset</button>
                )}
              </div>
            )}
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "4px", background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-md)", padding: "3px" }}>
              {[
                { id: false, label: "3-Band", tooltip: "Shows three fixed scenarios based on your return rate: optimistic (+3%), baseline, and pessimistic (−3%). Simple and fast — good for a quick directional view." },
                { id: true, label: "Monte Carlo", tooltip: "Runs 1,000 simulations with random annual returns (σ=15% volatility). Shows a cone of realistic outcomes from worst-case to best-case, and a statistically accurate retirement probability." },
              ].map(({ id, label, tooltip }) => (
                <button
                  key={String(id)}
                  type="button"
                  onClick={() => setShowMonteCarlo(id)}
                  style={{
                    padding: "5px 10px", borderRadius: "var(--radius-sm)", border: "none", cursor: "pointer",
                    fontSize: "11px", fontFamily: "var(--font-body)", fontWeight: showMonteCarlo === id ? 600 : 400,
                    background: showMonteCarlo === id ? "var(--brand-blue)" : "transparent",
                    color: showMonteCarlo === id ? "#fff" : "var(--text-secondary)",
                    transition: "background 0.15s, color 0.15s",
                    display: "flex", alignItems: "center", gap: "3px",
                  }}
                >
                  {label}
                  <InfoTooltip text={tooltip} />
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={exportForecastXLSX}
              style={{
                display: "flex", alignItems: "center", gap: "5px",
                padding: "6px 12px", borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-subtle)", background: "var(--card-bg)",
                color: "var(--text-secondary)", fontFamily: "var(--font-body)",
                fontSize: "11px", cursor: "pointer", whiteSpace: "nowrap",
                transition: "border-color 0.15s, color 0.15s",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-primary)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--text-tertiary)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-secondary)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border-subtle)"; }}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 1v9M4 7l4 4 4-4M2 12v1a1 1 0 001 1h10a1 1 0 001-1v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Export .xlsx
            </button>
          </div>

          {/* Assumptions + Retirement Probability row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "12px", alignItems: "start", flexWrap: "wrap" }}>

            {/* Assumptions card — sliders with preset chips */}
            <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", padding: "16px 20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                <span style={sectionHeadStyle}>Forecast Assumptions</span>
                <div style={{ display: "flex", gap: "6px" }}>
                  {(Object.keys(ASSUMPTION_PRESETS) as PresetName[]).map((name) => {
                    const isActive = getActivePreset(localAssumptions) === name;
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => setLocalAssumptions({ ...ASSUMPTION_PRESETS[name] })}
                        style={{
                          padding: "4px 10px", borderRadius: "20px", fontSize: "10px",
                          fontFamily: "var(--font-body)", fontWeight: isActive ? 700 : 400,
                          cursor: "pointer",
                          background: isActive ? "var(--brand-blue)" : "transparent",
                          border: `1px solid ${isActive ? "var(--brand-blue)" : "var(--border)"}`,
                          color: isActive ? "#fff" : "var(--text-secondary)",
                          transition: "all 0.15s",
                        }}
                      >{name}</button>
                    );
                  })}
                </div>
              </div>

              {([
                { key: "return_rate" as const,       label: "Annual Return",  min: 1,   max: 20, step: 0.5, describe: (v: number) => v <= 5 ? "Conservative" : v <= 8 ? "Historical avg." : "Aggressive" },
                { key: "inflation_rate" as const,    label: "Inflation",      min: 0.5, max: 8,  step: 0.5, describe: (v: number) => v <= 2 ? "Low" : v <= 4 ? "Moderate" : "High" },
                { key: "salary_growth_rate" as const, label: "Income Growth", min: 0,   max: 8,  step: 0.5, describe: (v: number) => v <= 1 ? "Flat" : v <= 3 ? "Steady" : "High growth" },
              ] as const).map(({ key, label, min, max, step, describe }) => (
                <div key={key} style={{ marginBottom: "14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "7px" }}>
                    <span style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>{label}</span>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <span style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>{describe(localAssumptions[key])}</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", minWidth: "38px", textAlign: "right" }}>{localAssumptions[key].toFixed(1)}%</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={localAssumptions[key]}
                    onChange={(e) => setLocalAssumptions((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
                    style={{ width: "100%", accentColor: "var(--brand-blue)", cursor: "pointer", margin: 0 }}
                  />
                </div>
              ))}

              <button
                type="button"
                disabled={assumptionsPending}
                onClick={saveAssumptions}
                style={{ ...btnPrimaryStyle, fontSize: "11px", padding: "6px 14px", marginTop: "2px" }}
              >{assumptionsPending ? "Saving…" : "Save Assumptions"}</button>
            </div>

            {/* Retirement probability badge */}
            {(() => {
              const prob = mcResult?.mcRetirementProbability ?? retirementProb;
              if (prob == null) return null;
              return (
                <div style={{
                  background: "var(--card-bg)", border: "1px solid var(--card-border)",
                  borderRadius: "var(--radius-lg)", padding: "16px 20px",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: "4px",
                  minWidth: "110px",
                }}>
                  <span style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>On Track</span>
                  <span style={{
                    fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "26px",
                    color: prob >= 75 ? "var(--green)" : prob >= 50 ? "var(--amber)" : "var(--red)",
                  }}>{prob}%</span>
                  <span style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", textAlign: "center", display: "flex", alignItems: "center", gap: "2px" }}>
                    {mcResult ? "MC · 1k runs" : "4% rule"}
                    <InfoTooltip text={mcResult
                      ? "Monte Carlo: 1,000 simulations with random annual returns (σ=15%). This probability is the share of simulations where your portfolio hits 25× annual expenses by retirement."
                      : "The 4% rule: you need 25× your annual expenses saved to retire. At that amount, withdrawing 4% per year should last 30+ years. This probability estimates how close you are to that target."
                    } />
                  </span>
                  {retirementTarget != null && retirementPoint != null && (
                    <div style={{ fontSize: "9px", fontFamily: "var(--font-mono)", color: "var(--text-tertiary)", textAlign: "center", lineHeight: 1.5 }}>
                      <span style={{ display: "block" }}>need {fmt(retirementTarget)}</span>
                      <span style={{ display: "block", color: retirementPoint.baseline >= retirementTarget ? "var(--green)" : "var(--amber)" }}>
                        proj. {fmt(retirementPoint.baseline)}
                      </span>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Chart */}
          <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", padding: "20px" }}>
            <div style={{ ...sectionHeadStyle, marginBottom: "16px" }}>Net Worth Trajectory</div>
            <ResponsiveContainer width="100%" height={260}>
              {showMonteCarlo && mcChartData ? (
                <AreaChart data={mcChartData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="histGrad2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00d395" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#00d395" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="mcMedGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.12} />
                      <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontFamily: "var(--font-mono)", fontSize: 10, fill: "var(--text-tertiary)" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tickFormatter={(v) => "$" + (v >= 1000000 ? (v / 1000000).toFixed(1) + "M" : v >= 1000 ? (v / 1000).toFixed(0) + "k" : v)} tick={{ fontFamily: "var(--font-mono)", fontSize: 10, fill: "var(--text-tertiary)" }} axisLine={false} tickLine={false} width={55} />
                  <Tooltip
                    contentStyle={{ background: "var(--bg-overlay)", border: "1px solid var(--border)", borderRadius: "8px", fontFamily: "var(--font-mono)", fontSize: "12px" }}
                    labelStyle={{ color: "var(--text-secondary)" }}
                    formatter={(value, name) => {
                      const v = typeof value === "number" ? value : 0;
                      const labels: Record<string, string> = { historical: "Historical", p10: "10th %ile", p25: "25th %ile", p50: "Median", p75: "75th %ile", p90: "90th %ile" };
                      return [fmt(v), labels[String(name)] ?? String(name)];
                    }}
                  />
                  <Area type="monotone" dataKey="historical" stroke="#00d395" strokeWidth={2} fill="url(#histGrad2)" dot={false} connectNulls={false} />
                  <Area type="monotone" dataKey="p90" stroke="#a78bfa" strokeWidth={1} strokeOpacity={0.3} fill="none" strokeDasharray="3 2" dot={false} connectNulls={false} />
                  <Area type="monotone" dataKey="p75" stroke="#a78bfa" strokeWidth={1} strokeOpacity={0.55} fill="none" strokeDasharray="3 2" dot={false} connectNulls={false} />
                  <Area type="monotone" dataKey="p50" stroke="#a78bfa" strokeWidth={2} fill="url(#mcMedGrad)" dot={false} connectNulls={false} />
                  <Area type="monotone" dataKey="p25" stroke="#a78bfa" strokeWidth={1} strokeOpacity={0.55} fill="none" strokeDasharray="3 2" dot={false} connectNulls={false} />
                  <Area type="monotone" dataKey="p10" stroke="#f59e0b" strokeWidth={1} strokeOpacity={0.5} fill="none" strokeDasharray="3 2" dot={false} connectNulls={false} />
                  {activeYearsToRetire != null && (
                    <ReferenceLine x={`+${activeYearsToRetire}yr`} stroke="rgba(245,158,11,0.5)" strokeDasharray="4 3" label={{ value: "Retirement", fill: "var(--amber)", fontSize: 10, fontFamily: "var(--font-mono)" }} />
                  )}
                </AreaChart>
              ) : (
                <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="histGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00d395" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#00d395" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="optGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00d395" stopOpacity={0.08} />
                      <stop offset="95%" stopColor="#00d395" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="baseGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="pessGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.08} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontFamily: "var(--font-mono)", fontSize: 10, fill: "var(--text-tertiary)" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tickFormatter={(v) => "$" + (v >= 1000000 ? (v / 1000000).toFixed(1) + "M" : v >= 1000 ? (v / 1000).toFixed(0) + "k" : v)} tick={{ fontFamily: "var(--font-mono)", fontSize: 10, fill: "var(--text-tertiary)" }} axisLine={false} tickLine={false} width={55} />
                  <Tooltip
                    contentStyle={{ background: "var(--bg-overlay)", border: "1px solid var(--border)", borderRadius: "8px", fontFamily: "var(--font-mono)", fontSize: "12px" }}
                    labelStyle={{ color: "var(--text-secondary)" }}
                    formatter={(value, name) => {
                      const v = typeof value === "number" ? value : 0;
                      const labels: Record<string, string> = { historical: "Historical", optimistic: "Optimistic", baseline: "Baseline", pessimistic: "Pessimistic" };
                      return [fmt(v), labels[String(name)] ?? String(name)];
                    }}
                  />
                  <Area type="monotone" dataKey="historical" stroke="#00d395" strokeWidth={2} fill="url(#histGrad)" dot={false} connectNulls={false} />
                  <Area type="monotone" dataKey="optimistic" stroke="#00d395" strokeWidth={1} strokeDasharray="4 3" fill="url(#optGrad)" dot={false} connectNulls={false} />
                  <Area type="monotone" dataKey="baseline" stroke="#a78bfa" strokeWidth={2} strokeDasharray="4 3" fill="url(#baseGrad)" dot={false} connectNulls={false} />
                  <Area type="monotone" dataKey="pessimistic" stroke="#f59e0b" strokeWidth={1} strokeDasharray="4 3" fill="url(#pessGrad)" dot={false} connectNulls={false} />
                  {activeYearsToRetire != null && (
                    <ReferenceLine x={`+${activeYearsToRetire}yr`} stroke="rgba(245,158,11,0.5)" strokeDasharray="4 3" label={{ value: "Retirement", fill: "var(--amber)", fontSize: 10, fontFamily: "var(--font-mono)" }} />
                  )}
                </AreaChart>
              )}
            </ResponsiveContainer>
            <div style={{ display: "flex", gap: "16px", marginTop: "8px", flexWrap: "wrap" }}>
              {showMonteCarlo ? (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>
                    <div style={{ width: "16px", height: "2px", background: "#00d395" }} /> Historical
                  </div>
                  {["90th", "75th", "Median", "25th", "10th"].map((l, i) => (
                    <div key={l} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>
                      <div style={{ width: "16px", height: "2px", borderTop: `2px dashed ${i === 4 ? "#f59e0b" : "#a78bfa"}`, opacity: i === 2 ? 1 : 0.6 }} /> {l}
                    </div>
                  ))}
                </>
              ) : (
                [
                  { color: "#00d395", label: "Historical", dashed: false },
                  { color: "#00d395", label: "Optimistic", dashed: true },
                  { color: "#a78bfa", label: "Baseline", dashed: true },
                  { color: "#f59e0b", label: "Pessimistic", dashed: true },
                ].map(({ color, label, dashed }) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>
                    <div style={{ width: "16px", height: "2px", background: dashed ? "transparent" : color, borderTop: dashed ? `2px dashed ${color}` : "none" }} />
                    {label}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Summary at retirement */}
          {retirementPoint && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "12px" }}>
              <MetricCard label={`Baseline at ${activeRetirementAge ?? "Retirement"}`} value={fmt(retirementPoint.baseline)} color="var(--violet)" />
              <MetricCard label="Optimistic scenario" value={fmt(retirementPoint.optimistic)} color="var(--green)" />
              <MetricCard label="Pessimistic scenario" value={fmt(retirementPoint.pessimistic)} color="var(--amber)" />
            </div>
          )}

          {/* Year-by-year cash flows table */}
          {tableRows.length > 1 && (
            <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", padding: "20px", overflowX: "auto" }}>
              <div style={{ ...sectionHeadStyle, marginBottom: "12px" }}>Year-by-Year Projection</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-mono)", fontSize: "12px" }}>
                <thead>
                  <tr>
                    {["Year", profile?.current_age ? "Age" : null, "Annual Income", "Annual Expenses", "Net Savings", "Net Worth (baseline)"].filter(Boolean).map((h) => (
                      <th key={h} style={{ textAlign: "right", padding: "6px 10px", color: "var(--text-tertiary)", fontWeight: 600, fontSize: "10px", letterSpacing: "0.06em", textTransform: "uppercase", borderBottom: "1px solid var(--border-subtle)", whiteSpace: "nowrap" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((p) => {
                    const isRetirement = p.year === activeYearsToRetire;
                    const age = profile?.current_age ? profile.current_age + p.year : null;
                    return (
                      <tr key={p.year} style={{ borderBottom: "1px solid var(--border-subtle)", background: isRetirement ? "rgba(167,139,250,0.06)" : "transparent" }}>
                        <td style={{ padding: "8px 10px", color: "var(--text-secondary)", textAlign: "right" }}>
                          {p.year === 0 ? "Now" : `+${p.year}yr`}
                          {isRetirement && <span style={{ marginLeft: "6px", fontSize: "9px", color: "var(--violet)", fontFamily: "var(--font-body)" }}>RETIRE</span>}
                        </td>
                        {age !== null && <td style={{ padding: "8px 10px", color: "var(--text-secondary)", textAlign: "right" }}>{age}</td>}
                        <td style={{ padding: "8px 10px", color: "var(--green)", textAlign: "right" }}>{fmt(p.annualIncome)}</td>
                        <td style={{ padding: "8px 10px", color: "var(--red)", textAlign: "right" }}>{fmt(p.annualExpenses)}</td>
                        <td style={{ padding: "8px 10px", color: p.annualSavings >= 0 ? "var(--green)" : "var(--red)", textAlign: "right" }}>{p.annualSavings >= 0 ? "+" : ""}{fmt(p.annualSavings)}</td>
                        <td style={{ padding: "8px 10px", color: "var(--violet)", fontWeight: 600, textAlign: "right" }}>{fmt(p.baseline)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Sensitivity analysis grid */}
          {sensitivityGrid && (
            <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", padding: "20px", overflowX: "auto" }}>
              <div style={{ ...sectionHeadStyle, marginBottom: "4px" }}>Sensitivity Analysis</div>
              <p style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", margin: "0 0 12px" }}>
                Projected net worth at each retirement age × return rate. Green = on track for 25× expenses (4% rule).
              </p>
              <table style={{ borderCollapse: "collapse", fontFamily: "var(--font-mono)", fontSize: "11px", width: "100%" }}>
                <thead>
                  <tr>
                    <th style={{ padding: "5px 10px", color: "var(--text-tertiary)", fontWeight: 600, fontSize: "10px", textAlign: "left", borderBottom: "1px solid var(--border-subtle)" }}>Retire at</th>
                    {sensitivityGrid.returnRates.map((r) => (
                      <th key={r} style={{ padding: "5px 8px", color: "var(--text-tertiary)", fontWeight: 600, fontSize: "10px", textAlign: "right", borderBottom: "1px solid var(--border-subtle)", whiteSpace: "nowrap" }}>
                        {r}%
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sensitivityGrid.retirementAges.map((retAge, ri) => (
                    <tr key={retAge} style={{ borderBottom: "1px solid var(--border-subtle)", background: retAge === activeRetirementAge ? "rgba(167,139,250,0.05)" : "transparent" }}>
                      <td style={{ padding: "7px 10px", color: retAge === activeRetirementAge ? "var(--violet)" : "var(--text-secondary)", fontWeight: retAge === activeRetirementAge ? 600 : 400, whiteSpace: "nowrap" }}>
                        {retAge}{retAge === activeRetirementAge ? " ★" : ""}
                      </td>
                      {sensitivityGrid.cells[ri].map((cell, ci) => {
                        const bg = cell.ratio >= 1 ? "rgba(0,211,149,0.12)" : cell.ratio >= 0.75 ? "rgba(245,158,11,0.10)" : "rgba(239,68,68,0.08)";
                        const color = cell.ratio >= 1 ? "var(--green)" : cell.ratio >= 0.75 ? "var(--amber)" : "var(--red)";
                        return (
                          <td key={ci} style={{ padding: "7px 8px", textAlign: "right", background: bg, color }}>
                            {cell.value >= 1000000 ? (cell.value / 1000000).toFixed(1) + "M" : cell.value >= 1000 ? (cell.value / 1000).toFixed(0) + "k" : fmt(cell.value)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", margin: 0 }}>
            {showMonteCarlo ? "Monte Carlo uses 1,000 simulations with 15% annual return volatility (σ). " : "Optimistic/pessimistic bands are ±3% on the return rate. "}
            Income and expenses grow by your assumed rates. For informational purposes only.
          </p>
        </div>
      )}

      {/* ── Tab: Compare ── */}
      {tab === "compare" && (
        <CompareTab
          currentAge={profile?.current_age ?? null}
          netWorth={netWorth}
          effectiveIncome={effectiveIncome}
          effectiveExpenses={effectiveExpenses}
          defaultRetirementAge={activeRetirementAge ?? 65}
          defaultMonthlySavings={Math.max(0, monthlySavings)}
          defaultReturnRate={localAssumptions.return_rate}
          defaultInflation={localAssumptions.inflation_rate}
          defaultSalaryGrowth={localAssumptions.salary_growth_rate}
          futureEvents={futureEvents}
          currentYear={currentYear}
        />
      )}

      {/* ── Tab: Future Events ── */}
      {tab === "events" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <p style={{ fontSize: "13px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", margin: 0 }}>
            Add one-time financial events that affect your forecast: home purchase, inheritance, major expenses, and more.
          </p>

          {/* Event list */}
          {futureEvents.length === 0 && !addingEvent ? (
            <p style={{ fontSize: "12px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>No future events added yet. Events appear as spikes or dips in your forecast chart.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {futureEvents.map((ev) => (
                <div key={ev.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                  <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: ev.amount_impact >= 0 ? "var(--green)" : "var(--red)", flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: "13px", color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>{ev.label}</span>
                  <span style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>{ev.event_year}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 500, color: ev.amount_impact >= 0 ? "var(--green)" : "var(--red)" }}>
                    {ev.amount_impact >= 0 ? "+" : ""}{fmt(ev.amount_impact)}
                  </span>
                  <button
                    type="button"
                    disabled={eventPending}
                    onClick={() => startEventTransition(async () => { await deleteFutureEvent(ev.id); })}
                    style={{ ...iconBtnStyle, color: "var(--red)" }}
                    title="Remove"
                  >
                    <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add event form */}
          {addingEvent ? (
            <form ref={eventFormRef} onSubmit={handleAddEvent} style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "flex-end" }}>
              <input name="label" required placeholder="e.g. Home purchase" autoFocus style={inputStyle} />
              <input name="event_year" type="number" required min={currentYear} max={currentYear + 80} defaultValue={currentYear + 5} placeholder="Year" style={{ ...inputStyle, minWidth: "unset", width: "90px" }} />
              <input name="amount_impact" type="number" required placeholder="Amount (+ gain / − expense)" style={{ ...inputStyle, minWidth: "unset", width: "200px" }} />
              <select name="category" style={selectStyle} defaultValue="other">
                <option value="home_purchase">Home Purchase</option>
                <option value="home_sale">Home Sale</option>
                <option value="education">Education</option>
                <option value="inheritance">Inheritance</option>
                <option value="other">Other</option>
              </select>
              <button type="submit" disabled={eventPending} style={btnPrimaryStyle}>{eventPending ? "Adding…" : "Add"}</button>
              <button type="button" onClick={() => setAddingEvent(false)} style={btnSecondaryStyle}>Cancel</button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setAddingEvent(true)}
              style={{
                display: "flex", alignItems: "center", gap: "6px",
                padding: "7px 12px", borderRadius: "var(--radius-md)",
                border: "1px dashed var(--border)", background: "transparent",
                color: "var(--text-tertiary)", fontSize: "12px",
                fontFamily: "var(--font-body)", cursor: "pointer",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              Add event
            </button>
          )}

          <p style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", margin: 0 }}>
            Use negative amounts for expenses (e.g. −$50,000 home down payment) and positive for gains (e.g. +$200,000 inheritance). Events are incorporated into all three forecast bands.
          </p>
        </div>
      )}

      {/* ── Tab: Ask FINN ── */}
      {tab === "finn" && (
        <div style={{ display: "flex", flexDirection: "column", height: "560px" }}>

          {/* FINN header */}
          <div style={{
            display: "flex", alignItems: "center", gap: "12px",
            paddingBottom: "14px", borderBottom: "1px solid var(--border-subtle)",
          }}>
            <div style={{
              width: "38px", height: "38px", borderRadius: "50%", flexShrink: 0,
              background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "16px", color: "#fff" }}>F</span>
            </div>
            <div>
              <div style={{ fontFamily: "var(--font-body)", fontWeight: 600, fontSize: "14px", color: "var(--text-primary)" }}>FINN</div>
              <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--green)" }} />
                <span style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>Financial Planning AI</span>
              </div>
            </div>
          </div>

          {/* Messages area */}
          <div
            ref={finnChatScrollRef}
            style={{
              flex: 1, overflowY: "auto", padding: "16px 0",
              display: "flex", flexDirection: "column", gap: "14px",
              minHeight: 0,
            }}
          >
            {/* Initial loading dots */}
            {finnChatLoading && finnChatMessages.length === 0 && (
              <div style={{ display: "flex", alignItems: "flex-end", gap: "10px" }}>
                <div style={{
                  width: "32px", height: "32px", borderRadius: "50%", flexShrink: 0,
                  background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "13px", color: "#fff" }}>F</span>
                </div>
                <div style={{
                  padding: "12px 16px", borderRadius: "14px 14px 14px 2px",
                  background: "var(--violet-bg)", border: "1px solid var(--violet-border)",
                  display: "flex", gap: "5px", alignItems: "center",
                }}>
                  {[0, 1, 2].map((i) => (
                    <div key={i} style={{
                      width: "7px", height: "7px", borderRadius: "50%",
                      background: "var(--violet)", opacity: 0.8,
                      animation: `finnBounce 1.2s ${i * 0.2}s ease-in-out infinite`,
                    }} />
                  ))}
                </div>
              </div>
            )}

            {/* Rendered messages */}
            {finnChatMessages.map((msg, idx) => {
              const isFinn = msg.role === "finn";
              const isAnimating = finnChatAnimatingIdx === idx;
              const displayText = isAnimating ? finnChatAnimatedText : msg.text;

              return (
                <div key={idx} style={{
                  display: "flex",
                  flexDirection: isFinn ? "row" : "row-reverse",
                  gap: "10px", alignItems: "flex-end",
                }}>
                  {isFinn && (
                    <div style={{
                      width: "32px", height: "32px", borderRadius: "50%", flexShrink: 0,
                      background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "13px", color: "#fff" }}>F</span>
                    </div>
                  )}
                  <div style={{
                    maxWidth: "78%", padding: "11px 15px",
                    borderRadius: isFinn ? "14px 14px 14px 2px" : "14px 14px 2px 14px",
                    background: isFinn ? "var(--violet-bg)" : "var(--card-bg)",
                    border: `1px solid ${isFinn ? "var(--violet-border)" : "var(--card-border)"}`,
                    fontSize: "13px", lineHeight: 1.65,
                    color: "var(--text-primary)", fontFamily: "var(--font-body)",
                    whiteSpace: "pre-wrap",
                  }}>
                    {displayText}
                    {isAnimating && (
                      <span style={{
                        display: "inline-block", width: "2px", height: "13px",
                        background: "var(--violet)", marginLeft: "2px",
                        verticalAlign: "text-bottom",
                        animation: "finnBlink 0.75s step-end infinite",
                      }} />
                    )}
                  </div>
                </div>
              );
            })}

            {/* Loading dots while awaiting a follow-up response */}
            {finnChatLoading && finnChatMessages.length > 0 && (
              <div style={{ display: "flex", alignItems: "flex-end", gap: "10px" }}>
                <div style={{
                  width: "32px", height: "32px", borderRadius: "50%", flexShrink: 0,
                  background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "13px", color: "#fff" }}>F</span>
                </div>
                <div style={{
                  padding: "12px 16px", borderRadius: "14px 14px 14px 2px",
                  background: "var(--violet-bg)", border: "1px solid var(--violet-border)",
                  display: "flex", gap: "5px", alignItems: "center",
                }}>
                  {[0, 1, 2].map((i) => (
                    <div key={i} style={{
                      width: "7px", height: "7px", borderRadius: "50%",
                      background: "var(--violet)", opacity: 0.8,
                      animation: `finnBounce 1.2s ${i * 0.2}s ease-in-out infinite`,
                    }} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Suggested prompts — visible after FINN's intro before user has sent anything */}
          {finnChatMessages.length === 1 && !finnChatLoading && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", paddingBottom: "12px" }}>
              {[
                "How much more should I save each month?",
                "What if I retire 5 years earlier?",
                "Stress test: what if markets drop 30%?",
                "Where am I most at risk?",
                "What’s my emergency fund gap?",
                "What should I optimize first?",
              ].map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => { void sendFinnChatMessage(prompt); }}
                  disabled={finnChatLoading}
                  style={{
                    padding: "6px 12px", borderRadius: "20px",
                    border: "1px solid var(--violet-border)", background: "var(--violet-bg)",
                    color: "var(--violet)", fontSize: "11px",
                    fontFamily: "var(--font-body)", cursor: "pointer",
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}

          {/* Input row */}
          <div style={{
            display: "flex", gap: "8px", alignItems: "center",
            borderTop: "1px solid var(--border-subtle)", paddingTop: "12px",
          }}>
            <input
              type="text"
              value={finnChatInput}
              onChange={(e) => setFinnChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !finnChatLoading && finnChatInput.trim()) {
                  e.preventDefault();
                  void sendFinnChatMessage(finnChatInput);
                }
              }}
              placeholder="Ask FINN anything about your finances…"
              disabled={finnChatLoading}
              style={{
                flex: 1, padding: "10px 14px", borderRadius: "var(--radius-md)",
                border: "1px solid var(--border)", background: "var(--bg-surface)",
                color: "var(--text-primary)", fontSize: "13px",
                fontFamily: "var(--font-body)", outline: "none",
              }}
            />
            <button
              type="button"
              onClick={() => { void sendFinnChatMessage(finnChatInput); }}
              disabled={finnChatLoading || !finnChatInput.trim()}
              style={{
                padding: "10px 18px", borderRadius: "var(--radius-md)",
                background: "var(--brand-gradient)", color: "#fff",
                border: "none", fontSize: "13px", fontWeight: 600,
                fontFamily: "var(--font-body)", cursor: "pointer",
                opacity: finnChatLoading || !finnChatInput.trim() ? 0.45 : 1,
                transition: "opacity 0.15s",
              }}
            >
              Send
            </button>
          </div>

          <style>{`
            @keyframes finnBounce {
              0%, 60%, 100% { transform: translateY(0); }
              30% { transform: translateY(-5px); }
            }
            @keyframes finnBlink {
              0%, 100% { opacity: 1; }
              50% { opacity: 0; }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}
